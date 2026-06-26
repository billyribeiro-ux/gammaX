import type {
	GammaScalpMode,
	GammaScalpRow,
	GammaScalpScannerState,
	GammaSurface,
	IvScannerState,
	IvScanRow,
	IvScanState,
	IvState
} from '@gammax/contracts';

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}

function median(xs: readonly number[]): number {
	if (xs.length === 0) return 0;
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	if (s.length % 2 === 1) return s[mid] as number;
	return ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

// Annualized close-to-close realized volatility from an intraday spot path. Uses
// log returns and annualizes by the observed sampling cadence (median Δt), assuming
// ~zero drift over the window (standard for high-frequency RV). Worked example:
// 60s-spaced samples each +0.1% (r=0.001) → meanR²=1e-6, samplesPerYear=525600,
// σ=√(1e-6·525600)=0.7250. Returns null with too few samples / degenerate cadence.
export function realizedVol(samples: readonly { ts: number; spot: number }[]): number | null {
	const pts = samples.filter((s) => s.spot > 0).sort((a, b) => a.ts - b.ts);
	if (pts.length < 3) return null;
	const rets: number[] = [];
	const dts: number[] = [];
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1];
		const b = pts[i];
		if (!a || !b) continue;
		const dt = b.ts - a.ts;
		if (dt <= 0) continue;
		rets.push(Math.log(b.spot / a.spot));
		dts.push(dt);
	}
	if (rets.length < 2) return null;
	const meanR2 = rets.reduce((acc, r) => acc + r * r, 0) / rets.length;
	const medianDt = median(dts);
	if (medianDt <= 0) return null;
	const samplesPerYear = MS_PER_YEAR / medianDt;
	return Math.sqrt(meanR2 * samplesPerYear);
}

// 1-sigma expected move over horizon tYears, as a percent of spot: σ·√t·100.
export function expectedMovePct(iv: number, tYears: number): number {
	return iv * Math.sqrt(Math.max(tYears, 0)) * 100;
}

// ─── IV explosion / implosion scanner ───────────────────────────────────────

export interface IvScanInput {
	symbol: string;
	iv: IvState | null;
}

function ivState(z: number | null, zThreshold: number): IvScanState {
	if (z == null) return 'calm';
	if (z > zThreshold) return 'explosion';
	if (z < -zThreshold) return 'implosion';
	return 'calm';
}

// Ranks a watchlist by IV velocity (|z-score| descending) and tags each symbol
// explosion / implosion / calm against the configured z threshold.
export function scanIvVelocity(
	inputs: readonly IvScanInput[],
	asOf: number,
	zThreshold: number
): IvScannerState {
	const rows: IvScanRow[] = inputs.map(({ symbol, iv }) => {
		const z = iv?.zScore ?? null;
		return {
			symbol,
			asOf,
			atmIv0dte: iv?.atmIv0dte ?? null,
			atmIvCm30: iv?.atmIvCm30 ?? null,
			zScore: z,
			rocPctPerMin: iv?.rocPctPerMin ?? null,
			state: ivState(z, zThreshold),
			score: z == null ? 0 : Math.abs(z)
		};
	});
	rows.sort((a, b) => b.score - a.score);
	return { asOf, zThreshold, rows };
}

// ─── Gamma-scalping scanner ──────────────────────────────────────────────────

export interface GammaScalpInput {
	symbol: string;
	surface: GammaSurface;
	atmIv: number | null;
	realizedVol: number | null;
	// Horizon for the expected-move estimate (years), e.g. 1/252 daily.
	horizonYears: number;
	hotStrikeCount?: number;
}

// Scores how favorable a symbol is for gamma scalping, and in which direction.
//
// Dealer-gamma regime sets the style:
//  • negative GEX → dealers are SHORT gamma → they hedge WITH the move (buy
//    strength / sell weakness) → moves get amplified → favor LONG gamma: buy
//    options and scalp the bigger swings. Best when realized > implied (rv/iv > 1).
//  • positive GEX → dealers are LONG gamma → they hedge AGAINST the move (sell
//    strength / buy weakness) → moves are suppressed, price pins → favor SHORT
//    gamma / range scalping between the walls. Best when implied > realized.
//
// score (0..100) = 0.5·conviction + 0.3·volEdge + 0.2·positioning, where:
//  • conviction = |netGex| / Σ|strike gex| — how one-sided dealer gamma is
//    (scale-free, so it ranks fairly across large- and small-cap tickers);
//  • volEdge    = the realized-vs-implied edge in the mode's favored direction;
//  • positioning = long_gamma: proximity to the gamma flip (gamma most unstable
//    there); short_gamma: how centered spot is within the wall range.
export function scoreGammaScalp(input: GammaScalpInput): GammaScalpRow {
	const { symbol, surface, atmIv, realizedVol, horizonYears } = input;
	const spot = surface.spot;
	const rvIvRatio = atmIv != null && atmIv > 0 && realizedVol != null ? realizedVol / atmIv : null;
	const rangeLow = surface.putWall;
	const rangeHigh = surface.callWall;
	const flip = surface.gammaFlip;
	const flipDistancePct = flip != null ? ((spot - flip) / spot) * 100 : null;

	const n = input.hotStrikeCount ?? 3;
	const hotStrikes = [...surface.byStrike]
		.sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
		.slice(0, n)
		.map((s) => ({
			strike: s.strike,
			netGex: s.netGex,
			distancePct: ((s.strike - spot) / spot) * 100
		}));

	const within = rangeLow != null && rangeHigh != null && spot >= rangeLow && spot <= rangeHigh;
	let mode: GammaScalpMode;
	if (surface.regime === 'negative') mode = 'long_gamma';
	else if (surface.regime === 'positive' && within) mode = 'short_gamma';
	else mode = 'neutral';

	const gross = surface.byStrike.reduce((acc, s) => acc + Math.abs(s.netGex), 0);
	const conviction = gross > 0 ? clamp01(Math.abs(surface.netGex) / gross) : 0;

	let volEdge = 0;
	if (rvIvRatio != null) {
		if (mode === 'long_gamma') volEdge = clamp01(rvIvRatio - 1);
		else if (mode === 'short_gamma') volEdge = clamp01(1 - rvIvRatio);
	}

	let positioning = 0;
	if (mode === 'long_gamma' && flipDistancePct != null) {
		positioning = clamp01(1 - Math.abs(flipDistancePct) / 1.0); // within ~1% of flip → strong
	} else if (
		mode === 'short_gamma' &&
		rangeLow != null &&
		rangeHigh != null &&
		rangeHigh > rangeLow
	) {
		const mid = (rangeLow + rangeHigh) / 2;
		const halfWidth = (rangeHigh - rangeLow) / 2;
		positioning = clamp01(1 - Math.abs(spot - mid) / halfWidth); // centered → strong
	}

	const score =
		mode === 'neutral'
			? 0
			: Math.round(100 * (0.5 * conviction + 0.3 * volEdge + 0.2 * positioning));

	return {
		symbol,
		asOf: surface.asOf,
		spot,
		regime: surface.regime,
		netGex: surface.netGex,
		atmIv,
		realizedVol,
		rvIvRatio,
		expectedMovePct: atmIv != null ? expectedMovePct(atmIv, horizonYears) : null,
		rangeLow,
		rangeHigh,
		gammaFlip: flip,
		flipDistancePct,
		hotStrikes,
		mode,
		score
	};
}

// Scores a watchlist and ranks by gamma-scalp favorability (score descending).
export function scanGammaScalp(
	inputs: readonly GammaScalpInput[],
	asOf: number
): GammaScalpScannerState {
	const rows = inputs.map(scoreGammaScalp).sort((a, b) => b.score - a.score);
	return { asOf, rows };
}
