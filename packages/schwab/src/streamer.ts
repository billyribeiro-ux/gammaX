import { WebSocket } from 'ws';
import { z } from 'zod';

const StreamerInfoSchema = z.object({
	streamerSocketUrl: z.string(),
	schwabClientCustomerId: z.string(),
	schwabClientCorrelId: z.string(),
	schwabClientChannel: z.string(),
	schwabClientFunctionId: z.string()
});
export type StreamerInfo = z.infer<typeof StreamerInfoSchema>;

export function parseStreamerInfo(userPreferenceRaw: unknown): StreamerInfo {
	const root = z
		.object({ streamerInfo: z.array(StreamerInfoSchema).min(1) })
		.parse(userPreferenceRaw);
	const first = root.streamerInfo[0];
	if (!first) throw new Error('Schwab userPreference has empty streamerInfo');
	return first;
}

// LEVELONE_OPTIONS field numbers (Schwab streamer) — documented subset we consume.
export const L1_OPTION_FIELDS = {
	symbol: 0,
	bid: 2,
	ask: 3,
	last: 4,
	totalVolume: 8,
	openInterest: 9,
	volatility: 10,
	delta: 28,
	gamma: 29,
	theta: 30,
	vega: 31
} as const;

const MessageEnvelope = z.object({
	response: z
		.array(
			z.object({
				service: z.string(),
				command: z.string(),
				content: z.object({ code: z.number().optional(), msg: z.string().optional() }).optional()
			})
		)
		.optional(),
	data: z
		.array(
			z.object({
				service: z.string(),
				content: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional()
			})
		)
		.optional(),
	notify: z.array(z.unknown()).optional()
});

export interface StreamQuote {
	symbol: string;
	fields: Record<string, string | number>;
}
export type StreamDataListener = (service: string, quotes: StreamQuote[]) => void;
export type StreamStatusListener = (status: { connected: boolean; detail?: string }) => void;

export interface StreamerDeps {
	getUserPreference: () => Promise<unknown>;
	getAccessToken: () => Promise<string>;
	qos?: number;
	wsFactory?: (url: string) => WebSocket;
}

const HEARTBEAT_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

// One stream per account. Robust reconnect (exp backoff), heartbeat watchdog,
// and resubscription on reconnect. The engine uses REST chains for full point-in-
// time snapshots; this is the optional low-latency quote layer.
export class SchwabStreamer {
	private ws: WebSocket | null = null;
	private info: StreamerInfo | null = null;
	private requestId = 0;
	private loggedIn = false;
	private stopped = false;
	private backoffMs = 1000;
	private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly optionKeys = new Set<string>();
	private readonly dataListeners: StreamDataListener[] = [];
	private readonly statusListeners: StreamStatusListener[] = [];

	constructor(private readonly deps: StreamerDeps) {}

	onData(listener: StreamDataListener): void {
		this.dataListeners.push(listener);
	}
	onStatus(listener: StreamStatusListener): void {
		this.statusListeners.push(listener);
	}

	subscribeOptions(symbols: readonly string[]): void {
		for (const s of symbols) this.optionKeys.add(s);
		if (this.loggedIn) this.sendOptionSubs();
	}

	async start(): Promise<void> {
		this.stopped = false;
		await this.connect();
	}

	async stop(): Promise<void> {
		this.stopped = true;
		this.clearHeartbeat();
		this.ws?.close();
		this.ws = null;
		this.loggedIn = false;
	}

	private nextId(): string {
		this.requestId += 1;
		return String(this.requestId);
	}

	private async connect(): Promise<void> {
		this.info = parseStreamerInfo(await this.deps.getUserPreference());
		const factory = this.deps.wsFactory ?? ((url: string) => new WebSocket(url));
		const ws = factory(this.info.streamerSocketUrl);
		this.ws = ws;
		ws.on('open', () => void this.login());
		ws.on('message', (raw: unknown) => this.onMessage(String(raw)));
		ws.on('close', () => this.onClose());
		ws.on('error', (err: Error) => this.emitStatus({ connected: false, detail: err.message }));
	}

	private async login(): Promise<void> {
		const info = this.info;
		if (!info) return;
		const token = await this.deps.getAccessToken();
		this.send({
			requests: [
				{
					service: 'ADMIN',
					command: 'LOGIN',
					requestid: this.nextId(),
					SchwabClientCustomerId: info.schwabClientCustomerId,
					SchwabClientCorrelId: info.schwabClientCorrelId,
					parameters: {
						Authorization: token,
						SchwabClientChannel: info.schwabClientChannel,
						SchwabClientFunctionId: info.schwabClientFunctionId
					}
				}
			]
		});
	}

	private sendAdminQos(): void {
		const info = this.info;
		if (!info) return;
		this.send({
			requests: [
				{
					service: 'ADMIN',
					command: 'QOS',
					requestid: this.nextId(),
					SchwabClientCustomerId: info.schwabClientCustomerId,
					SchwabClientCorrelId: info.schwabClientCorrelId,
					parameters: { qoslevel: this.deps.qos ?? 0 }
				}
			]
		});
	}

	private sendOptionSubs(): void {
		const info = this.info;
		if (!info || this.optionKeys.size === 0) return;
		this.send({
			requests: [
				{
					service: 'LEVELONE_OPTIONS',
					command: 'SUBS',
					requestid: this.nextId(),
					SchwabClientCustomerId: info.schwabClientCustomerId,
					SchwabClientCorrelId: info.schwabClientCorrelId,
					parameters: {
						keys: [...this.optionKeys].join(','),
						fields: Object.values(L1_OPTION_FIELDS).join(',')
					}
				}
			]
		});
	}

	private send(payload: unknown): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(payload));
		}
	}

	private onMessage(text: string): void {
		this.resetHeartbeat();
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return;
		}
		const msg = MessageEnvelope.safeParse(parsed);
		if (!msg.success) return;
		for (const r of msg.data.response ?? []) {
			if (r.service === 'ADMIN' && r.command === 'LOGIN') {
				if (r.content?.code === 0) {
					this.loggedIn = true;
					this.backoffMs = 1000;
					this.sendAdminQos();
					this.sendOptionSubs();
					this.emitStatus({ connected: true });
				} else {
					this.emitStatus({ connected: false, detail: `login failed (${r.content?.code})` });
				}
			}
		}
		for (const d of msg.data.data ?? []) {
			const quotes: StreamQuote[] = (d.content ?? []).map((c) => ({
				symbol: String(c['key'] ?? c['0'] ?? ''),
				fields: c
			}));
			if (quotes.length) this.emitData(d.service, quotes);
		}
	}

	private onClose(): void {
		this.loggedIn = false;
		this.clearHeartbeat();
		this.emitStatus({ connected: false, detail: 'socket closed' });
		if (this.stopped) return;
		const delay = this.backoffMs;
		this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
		setTimeout(() => {
			if (!this.stopped)
				void this.connect().catch((e: unknown) =>
					this.emitStatus({ connected: false, detail: String(e) })
				);
		}, delay);
	}

	private resetHeartbeat(): void {
		this.clearHeartbeat();
		this.heartbeatTimer = setTimeout(() => {
			this.emitStatus({ connected: false, detail: 'heartbeat timeout' });
			this.ws?.close();
		}, HEARTBEAT_TIMEOUT_MS);
	}

	private clearHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearTimeout(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private emitData(service: string, quotes: StreamQuote[]): void {
		for (const l of this.dataListeners) l(service, quotes);
	}

	private emitStatus(status: { connected: boolean; detail?: string }): void {
		for (const l of this.statusListeners) l(status);
	}
}
