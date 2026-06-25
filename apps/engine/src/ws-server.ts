import type {
	EngineMessage,
	FeedStatus,
	GammaSurface,
	GammaSurfaceGrid,
	IvState,
	Signal,
	SignalOutcome,
	SignalSink,
	SurfaceScope,
	UnderlyingSymbol
} from '@gammax/contracts';
import { WebSocket, WebSocketServer } from 'ws';

// Broadcasts EngineMessages to dashboard clients. Latest surfaces/iv/status are
// cached and replayed to each new client so the UI is immediately populated.
const RECENT_CAP = 40;

export class EngineWsServer implements SignalSink {
	private readonly wss: WebSocketServer;
	private readonly latest = new Map<string, EngineMessage>();
	private readonly recent: EngineMessage[] = []; // recent signals + outcomes for replay

	constructor(
		port: number,
		private readonly underlyings: UnderlyingSymbol[],
		private readonly scopes: SurfaceScope[],
		private readonly now: () => number = () => Date.now()
	) {
		this.wss = new WebSocketServer({ port });
		this.wss.on('connection', (ws) => {
			ws.send(
				JSON.stringify({
					type: 'hello',
					serverTs: this.now(),
					underlyings: this.underlyings,
					scopes: this.scopes
				} satisfies EngineMessage)
			);
			for (const msg of this.latest.values()) ws.send(JSON.stringify(msg));
			for (const msg of this.recent) ws.send(JSON.stringify(msg));
		});
	}

	private remember(msg: EngineMessage): void {
		this.recent.push(msg);
		if (this.recent.length > RECENT_CAP) this.recent.shift();
	}

	private broadcast(msg: EngineMessage, cacheKey?: string): void {
		if (cacheKey) this.latest.set(cacheKey, msg);
		const payload = JSON.stringify(msg);
		for (const client of this.wss.clients) {
			if (client.readyState === WebSocket.OPEN) client.send(payload);
		}
	}

	publishSurface(surface: GammaSurface): void {
		this.broadcast({ type: 'surface', surface }, `surface:${surface.scope}:${surface.expiryScope}`);
	}

	publishGrid(grid: GammaSurfaceGrid): void {
		this.broadcast({ type: 'grid', grid }, `grid:${grid.scope}`);
	}

	publishIvState(iv: IvState): void {
		this.broadcast({ type: 'iv', iv }, `iv:${iv.underlying}`);
	}

	publishSignal(signal: Signal): void {
		const msg: EngineMessage = { type: 'signal', signal };
		this.remember(msg);
		this.broadcast(msg);
	}

	publishOutcome(outcome: SignalOutcome): void {
		const msg: EngineMessage = { type: 'outcome', outcome };
		this.remember(msg);
		this.broadcast(msg);
	}

	publishStatus(status: FeedStatus): void {
		this.broadcast({ type: 'status', status }, 'status');
	}

	async close(): Promise<void> {
		await new Promise<void>((resolve) => this.wss.close(() => resolve()));
	}
}
