import type {
	ChainListener,
	ChainSnapshot,
	ErrorListener,
	FeedSource,
	FeedStatus,
	MarketFeed,
	StatusListener,
	TradeListener,
	UnderlyingSymbol
} from '@gammax/contracts';
import type { Recorder } from '@gammax/recorder';

export interface ReplayOptions {
	recorder: Recorder;
	symbols: UnderlyingSymbol[];
	startTs?: number;
	endTs?: number;
	realtime?: boolean; // pace by recorded inter-arrival gaps
	speed?: number; // realtime divisor (2 = 2× faster); default 1
	step?: boolean; // manual stepping via step()
	sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-emits recorded chain snapshots in strict capture-timestamp order. Identical
// MarketFeed interface to schwab — the core is unchanged. This is the seam where
// the Phase-2 OPRA adapter will plug in.
export class ReplayFeed implements MarketFeed {
	readonly source: FeedSource = 'replay';
	private readonly chainListeners: ChainListener[] = [];
	private readonly statusListeners: StatusListener[] = [];
	private readonly errorListeners: ErrorListener[] = [];
	private snapshots: ChainSnapshot[] = [];
	private idx = 0;
	private running = false;
	private lastUpdateTs: number | null = null;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(private readonly opts: ReplayOptions) {
		this.sleep = opts.sleep ?? defaultSleep;
	}

	subscribeChains(_symbols: readonly UnderlyingSymbol[], listener: ChainListener): void {
		this.chainListeners.push(listener);
	}

	subscribeTrades(_symbols: readonly UnderlyingSymbol[], _listener: TradeListener): void {
		// Phase 1 records no trade prints; the Phase-2 OPRA replay will emit them.
	}

	onStatus(listener: StatusListener): void {
		this.statusListeners.push(listener);
	}

	onError(listener: ErrorListener): void {
		this.errorListeners.push(listener);
	}

	private async load(): Promise<ChainSnapshot[]> {
		const all: ChainSnapshot[] = [];
		for (const underlying of this.opts.symbols) {
			const rows = await this.opts.recorder.getChainSnapshots(underlying, {
				fromTs: this.opts.startTs,
				toTs: this.opts.endTs
			});
			all.push(...rows);
		}
		// Strict point-in-time ordering — never emit out of capture order. Ties
		// (same-ms captures across symbols) break deterministically by symbol then
		// source, so a recording always replays in exactly the same order.
		return all.sort(
			(a, b) =>
				a.captureTs - b.captureTs ||
				a.underlying.symbol.localeCompare(b.underlying.symbol) ||
				a.source.localeCompare(b.source)
		);
	}

	async start(): Promise<void> {
		try {
			this.snapshots = await this.load();
		} catch (err) {
			this.emitError(err);
			return;
		}
		this.idx = 0;
		if (this.opts.step) {
			this.emitStatus();
			return;
		}
		this.running = true;
		const speed = this.opts.speed ?? 1;
		while (this.running && this.idx < this.snapshots.length) {
			const cur = this.snapshots[this.idx];
			if (!cur) break;
			this.emit(cur);
			this.idx += 1;
			const next = this.snapshots[this.idx];
			if (this.opts.realtime && next) {
				await this.sleep(Math.max(0, (next.captureTs - cur.captureTs) / speed));
			}
		}
		this.emitStatus();
	}

	// Manual stepping (step mode). Returns false when the recording is exhausted.
	step(): boolean {
		const snap = this.snapshots[this.idx];
		if (!snap) return false;
		this.emit(snap);
		this.idx += 1;
		return true;
	}

	async stop(): Promise<void> {
		this.running = false;
	}

	private emit(snap: ChainSnapshot): void {
		this.lastUpdateTs = snap.captureTs;
		for (const l of this.chainListeners) l(snap);
	}

	private emitError(err: unknown): void {
		for (const l of this.errorListeners) {
			l({ message: err instanceof Error ? err.message : String(err), fatal: true, cause: err });
		}
	}

	private emitStatus(): void {
		const status: FeedStatus = {
			source: 'replay',
			connected: this.running || this.opts.step === true,
			delayed: false,
			lastUpdateTs: this.lastUpdateTs,
			symbolsSubscribed: this.opts.symbols.length
		};
		for (const l of this.statusListeners) l(status);
	}
}
