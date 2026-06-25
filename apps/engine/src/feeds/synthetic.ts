import type {
	ChainListener,
	ChainSnapshot,
	ErrorListener,
	FeedSource,
	FeedStatus,
	MarketFeed,
	OptionQuote,
	OptionRight,
	StatusListener,
	TradeListener,
	UnderlyingSymbol
} from '@gammax/contracts';
import { bsPrice, YEAR_MS } from '@gammax/core';
import { buildOsi } from '@gammax/schwab';

export interface SyntheticOptions {
	symbols?: UnderlyingSymbol[];
	intervalMs?: number;
	maxTicks?: number;
	startTs?: number;
	stepMs?: number;
	now?: () => number;
}

const STEP: Record<UnderlyingSymbol, number> = { SPX: 25, SPY: 2.5 };
const BASE_SPOT: Record<UnderlyingSymbol, number> = { SPX: 5000, SPY: 500 };
const Q: Record<UnderlyingSymbol, number> = { SPX: 0, SPY: 0.012 };
const R = 0.04;
const STRIKE_RANGE = 18;
const EXPIRY_DTES = [0, 7, 35] as const;

function roundTo(value: number, step: number): number {
	return Math.round(value / step) * step;
}

// Deterministic (no RNG): spot oscillates + drifts; IV has a smile plus a
// periodic spike to exercise the IV-velocity layer; OI is peaked at ATM with
// explicit call/put walls so surfaces have clear structure.
function spotForTick(underlying: UnderlyingSymbol, tick: number): number {
	return BASE_SPOT[underlying] * (1 + 0.0015 * Math.sin(tick / 4) + 0.0004 * Math.sin(tick / 11));
}

function atmIvForTick(tick: number): number {
	const spike = tick % 50 === 0 && tick > 0 ? 0.06 : 0;
	return 0.14 + 0.02 * Math.sin(tick / 8) + spike;
}

function buildQuote(
	underlying: UnderlyingSymbol,
	spot: number,
	strike: number,
	right: OptionRight,
	dte: number,
	expiryMillis: number,
	captureTs: number,
	atmIv: number,
	callWall: number,
	putWall: number
): OptionQuote {
	const t = Math.max((expiryMillis - captureTs) / YEAR_MS, 1e-5);
	const moneyness = strike / spot - 1;
	const iv = Math.max(0.05, atmIv - 0.35 * moneyness + 2.5 * moneyness * moneyness);
	const mid = Math.max(
		0.05,
		bsPrice(right, { s: spot, k: strike, t, r: R, q: Q[underlying], sigma: iv })
	);
	const spread = Math.max(0.05, mid * 0.01);
	let oi = Math.round(8000 * Math.exp(-(((strike - spot) / (spot * 0.025)) ** 2)));
	if (strike === callWall && right === 'C') oi += 25000;
	if (strike === putWall && right === 'P') oi += 25000;
	const expiry = new Date(expiryMillis).toISOString().slice(0, 10);
	return {
		symbol: buildOsi(underlying === 'SPX' ? 'SPXW' : 'SPY', expiry, right, strike),
		underlying,
		root: underlying === 'SPX' ? 'SPXW' : 'SPY',
		expiry,
		dte,
		expiryMillis,
		right,
		strike,
		bid: Math.max(0, mid - spread),
		ask: mid + spread,
		mid,
		volume: Math.round(oi / 20),
		openInterest: oi
	};
}

export function buildSyntheticSnapshot(
	underlying: UnderlyingSymbol,
	tick: number,
	captureTs: number
): ChainSnapshot {
	const spot = spotForTick(underlying, tick);
	const step = STEP[underlying];
	const center = roundTo(spot, step);
	const atmIv = atmIvForTick(tick);
	const callWall = center + 4 * step;
	const putWall = center - 4 * step;
	const quotes: OptionQuote[] = [];
	for (const dte of EXPIRY_DTES) {
		const expiryMillis = captureTs + dte * 86_400_000 + 6 * 3_600_000;
		for (let k = -STRIKE_RANGE; k <= STRIKE_RANGE; k++) {
			const strike = center + k * step;
			if (strike <= 0) continue;
			for (const right of ['C', 'P'] as const) {
				quotes.push(
					buildQuote(
						underlying,
						spot,
						strike,
						right,
						dte,
						expiryMillis,
						captureTs,
						atmIv,
						callWall,
						putWall
					)
				);
			}
		}
	}
	return {
		captureTs,
		source: 'synthetic',
		delayed: false,
		underlying: { symbol: underlying, last: spot, ts: captureTs },
		quotes
	};
}

export class SyntheticFeed implements MarketFeed {
	readonly source: FeedSource = 'synthetic';
	private readonly chainListeners: ChainListener[] = [];
	private readonly statusListeners: StatusListener[] = [];
	private readonly symbols: UnderlyingSymbol[];
	private readonly intervalMs: number;
	private readonly stepMs: number;
	private readonly maxTicks: number;
	private readonly now: () => number;
	private readonly startTs: number | null;
	private tick = 0;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(opts: SyntheticOptions = {}) {
		this.symbols = opts.symbols ?? ['SPX', 'SPY'];
		this.intervalMs = opts.intervalMs ?? 1500;
		this.stepMs = opts.stepMs ?? this.intervalMs;
		this.maxTicks = opts.maxTicks ?? Number.POSITIVE_INFINITY;
		this.now = opts.now ?? Date.now;
		this.startTs = opts.startTs ?? null;
	}

	subscribeChains(_symbols: readonly UnderlyingSymbol[], listener: ChainListener): void {
		this.chainListeners.push(listener);
	}

	subscribeTrades(_symbols: readonly UnderlyingSymbol[], _listener: TradeListener): void {
		// No synthetic tape in Phase 1.
	}

	onStatus(listener: StatusListener): void {
		this.statusListeners.push(listener);
	}

	onError(_listener: ErrorListener): void {
		// Synthetic feed does not error.
	}

	private captureTs(): number {
		return this.startTs !== null ? this.startTs + this.tick * this.stepMs : this.now();
	}

	emitTick(): void {
		if (this.tick >= this.maxTicks) {
			void this.stop();
			return;
		}
		const ts = this.captureTs();
		for (const underlying of this.symbols) {
			const snap = buildSyntheticSnapshot(underlying, this.tick, ts);
			for (const l of this.chainListeners) l(snap);
		}
		this.tick += 1;
		this.emitStatus(ts);
	}

	async start(): Promise<void> {
		this.emitTick();
		if (this.tick < this.maxTicks) {
			this.timer = setInterval(() => this.emitTick(), this.intervalMs);
		}
	}

	async stop(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private emitStatus(ts: number): void {
		const status: FeedStatus = {
			source: 'synthetic',
			connected: true,
			delayed: false,
			lastUpdateTs: ts,
			symbolsSubscribed: this.symbols.length
		};
		for (const l of this.statusListeners) l(status);
	}
}
