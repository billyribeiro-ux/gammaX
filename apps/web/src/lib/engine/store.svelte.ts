import {
	EngineMessage,
	type ExpiryScope,
	type FeedStatus,
	type GammaSurface,
	type GammaSurfaceGrid,
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
	grids = $state<Record<string, GammaSurfaceGrid>>({});
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

	// Bound once so they can be detached again — inline listeners would leak across
	// reconnects because they can't be removed.
	private readonly onOpen = (): void => {
		this.clearReconnect();
		this.connected = true;
		this.backoffMs = 1000;
	};
	private readonly onMessageEv = (ev: MessageEvent): void => this.handle(String(ev.data));
	private readonly onCloseEv = (): void => {
		this.connected = false;
		if (!this.closedByUser) this.scheduleReconnect();
	};
	private readonly onErrorEv = (): void => this.ws?.close();

	surface(scope: SurfaceScope, expiry: ExpiryScope): GammaSurface | undefined {
		return this.surfaces[`${scope}:${expiry}`];
	}

	grid(scope: SurfaceScope): GammaSurfaceGrid | undefined {
		return this.grids[scope];
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
		this.clearReconnect();
		this.teardown();
	}

	private clearReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	// Detach listeners and close the current socket. Removing the listeners lets the
	// abandoned socket be collected and guarantees it can never deliver a late event.
	private teardown(): void {
		const ws = this.ws;
		if (!ws) return;
		ws.removeEventListener('open', this.onOpen);
		ws.removeEventListener('message', this.onMessageEv);
		ws.removeEventListener('close', this.onCloseEv);
		ws.removeEventListener('error', this.onErrorEv);
		ws.close();
		this.ws = null;
	}

	private open(): void {
		// Cancel any pending reconnect and drop a prior socket so only one is ever live.
		this.clearReconnect();
		this.teardown();
		const ws = new WebSocket(this.url);
		this.ws = ws;
		ws.addEventListener('open', this.onOpen);
		ws.addEventListener('message', this.onMessageEv);
		ws.addEventListener('close', this.onCloseEv);
		ws.addEventListener('error', this.onErrorEv);
	}

	private scheduleReconnect(): void {
		this.clearReconnect();
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
			case 'grid':
				this.grids[msg.grid.scope] = msg.grid;
				break;
			case 'iv':
				this.ivStates[msg.iv.underlying] = msg.iv;
				break;
			case 'signal': {
				this.signals = [msg.signal, ...this.signals].slice(0, 60);
				// Outcomes are keyed by signalId; keep only those whose signal is still in
				// the retained window so the map can't grow without bound over a session.
				const kept: Record<string, SignalOutcome> = {};
				for (const s of this.signals) {
					const o = this.outcomes[s.id];
					if (o) kept[s.id] = o;
				}
				this.outcomes = kept;
				break;
			}
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
