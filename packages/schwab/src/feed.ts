import type {
	ChainListener,
	ErrorListener,
	FeedSource,
	FeedStatus,
	MarketFeed,
	StatusListener,
	TradeListener,
	UnderlyingSymbol
} from '@gammax/contracts';
import { mapChainsResponse } from './mappers';
import { ReauthorizationRequired } from './oauth';
import { type SchwabRestClient, schwabRequestSymbol } from './rest';

export interface SchwabFeedOptions {
	rest: SchwabRestClient;
	pollMs?: number;
	strikeCount?: number;
	daysAhead?: number;
	now?: () => number;
}

// READ-ONLY MarketFeed. Polls REST option chains (full point-in-time snapshots
// with OI/greeks/IV) on a cadence. subscribeTrades is a documented no-op —
// Schwab has no options tape (Phase-2 OPRA seam).
export class SchwabFeed implements MarketFeed {
	readonly source: FeedSource = 'schwab';
	private readonly chainListeners: ChainListener[] = [];
	private readonly statusListeners: StatusListener[] = [];
	private readonly errorListeners: ErrorListener[] = [];
	private symbols: UnderlyingSymbol[] = [];
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;
	private lastUpdateTs: number | null = null;
	private delayed = false;
	private readonly now: () => number;

	constructor(private readonly opts: SchwabFeedOptions) {
		this.now = opts.now ?? Date.now;
	}

	subscribeChains(symbols: readonly UnderlyingSymbol[], listener: ChainListener): void {
		this.symbols = [...new Set([...this.symbols, ...symbols])];
		this.chainListeners.push(listener);
	}

	subscribeTrades(_symbols: readonly UnderlyingSymbol[], _listener: TradeListener): void {
		// Phase 1: Schwab exposes no options time-&-sales stream. Intentional no-op;
		// the Phase-2 OPRA adapter implements this through the same interface.
	}

	onStatus(listener: StatusListener): void {
		this.statusListeners.push(listener);
	}

	onError(listener: ErrorListener): void {
		this.errorListeners.push(listener);
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;
		await this.poll();
		const pollMs = this.opts.pollMs ?? 2000;
		this.timer = setInterval(() => void this.poll(), pollMs);
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private dateStr(offsetDays: number): string {
		const d = new Date(this.now() + offsetDays * 86_400_000);
		return d.toISOString().slice(0, 10);
	}

	private async poll(): Promise<void> {
		for (const underlying of this.symbols) {
			const captureTs = this.now();
			try {
				const raw = await this.opts.rest.getChainsRaw(schwabRequestSymbol(underlying), {
					contractType: 'ALL',
					strikeCount: this.opts.strikeCount ?? 80,
					fromDate: this.dateStr(0),
					toDate: this.dateStr(this.opts.daysAhead ?? 45)
				});
				const snapshot = mapChainsResponse(raw, {
					underlying,
					captureTs,
					source: 'schwab',
					delayed: this.delayed
				});
				this.lastUpdateTs = captureTs;
				for (const l of this.chainListeners) l(snapshot);
			} catch (err) {
				for (const l of this.errorListeners) {
					l({
						message: err instanceof Error ? err.message : String(err),
						fatal: err instanceof ReauthorizationRequired,
						cause: err
					});
				}
			}
		}
		this.emitStatus();
	}

	private emitStatus(): void {
		const status: FeedStatus = {
			source: 'schwab',
			connected: this.running,
			delayed: this.delayed,
			lastUpdateTs: this.lastUpdateTs,
			symbolsSubscribed: this.symbols.length,
			rateRemaining: null
		};
		for (const l of this.statusListeners) l(status);
	}
}
