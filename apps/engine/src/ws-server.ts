import type {
	EngineMessage,
	FeedStatus,
	GammaSurface,
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
export class EngineWsServer implements SignalSink {
	private readonly wss: WebSocketServer;
	private readonly latest = new Map<string, EngineMessage>();

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
		});
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

	publishIvState(iv: IvState): void {
		this.broadcast({ type: 'iv', iv }, `iv:${iv.underlying}`);
	}

	publishSignal(signal: Signal): void {
		this.broadcast({ type: 'signal', signal });
	}

	publishOutcome(outcome: SignalOutcome): void {
		this.broadcast({ type: 'outcome', outcome });
	}

	publishStatus(status: FeedStatus): void {
		this.broadcast({ type: 'status', status }, 'status');
	}

	async close(): Promise<void> {
		await new Promise<void>((resolve) => this.wss.close(() => resolve()));
	}
}
