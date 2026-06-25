import {
	EngineMessage,
	type ExpiryScope,
	type FeedStatus,
	type GammaSurface,
	type IvState,
	type Signal,
	type SignalOutcome,
	type SurfaceScope,
	type UnderlyingSymbol
} from '@gammax/contracts';

// Shared reactive state container for the dashboard. A single WS client pushes
// validated EngineMessages into runes state; panels are $derived off this.
export class EngineStore {
	connected = $state(false);
	status = $state<FeedStatus | null>(null);
	surfaces = $state<Record<string, GammaSurface>>({});
	ivStates = $state<Record<string, IvState>>({});
	signals = $state<Signal[]>([]);
	outcomes = $state<Record<string, SignalOutcome>>({});
	lastMessageTs = $state<number | null>(null);
	underlyings = $state<UnderlyingSymbol[]>(['SPX', 'SPY']);
	scopes = $state<SurfaceScope[]>(['combined', 'SPX', 'SPY']);

	private ws: WebSocket | null = null;
	private closedByUser = false;
	private backoffMs = 1000;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly url: string) {}

	surface(scope: SurfaceScope, expiry: ExpiryScope): GammaSurface | undefined {
		return this.surfaces[`${scope}:${expiry}`];
	}

	iv(underlying: UnderlyingSymbol): IvState | undefined {
		return this.ivStates[underlying];
	}

	connect(): void {
		this.closedByUser = false;
		this.open();
	}

	disconnect(): void {
		this.closedByUser = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.ws?.close();
		this.ws = null;
	}

	private open(): void {
		const ws = new WebSocket(this.url);
		this.ws = ws;
		ws.addEventListener('open', () => {
			this.connected = true;
			this.backoffMs = 1000;
		});
		ws.addEventListener('message', (ev) => this.handle(String(ev.data)));
		ws.addEventListener('close', () => {
			this.connected = false;
			if (!this.closedByUser) this.scheduleReconnect();
		});
		ws.addEventListener('error', () => ws.close());
	}

	private scheduleReconnect(): void {
		const delay = this.backoffMs;
		this.backoffMs = Math.min(this.backoffMs * 2, 15_000);
		this.reconnectTimer = setTimeout(() => this.open(), delay);
	}

	private handle(raw: string): void {
		let json: unknown;
		try {
			json = JSON.parse(raw);
		} catch {
			return;
		}
		const parsed = EngineMessage.safeParse(json);
		if (!parsed.success) return;
		const msg = parsed.data;
		this.lastMessageTs = Date.now();
		switch (msg.type) {
			case 'hello':
				this.underlyings = msg.underlyings;
				this.scopes = msg.scopes;
				break;
			case 'surface':
				this.surfaces[`${msg.surface.scope}:${msg.surface.expiryScope}`] = msg.surface;
				break;
			case 'iv':
				this.ivStates[msg.iv.underlying] = msg.iv;
				break;
			case 'signal':
				this.signals = [msg.signal, ...this.signals].slice(0, 60);
				break;
			case 'outcome':
				this.outcomes[msg.outcome.signalId] = msg.outcome;
				break;
			case 'status':
				this.status = msg.status;
				break;
			default: {
				const _exhaustive: never = msg;
				return _exhaustive;
			}
		}
	}
}
