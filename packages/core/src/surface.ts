import type {
	ChainSnapshot,
	ExpiryScope,
	GammaSurface,
	GammaSurfaceGrid,
	OptionQuote,
	OptionRight,
	RiskParams,
	StrikeGex,
	SurfaceScope
} from '@gammax/contracts';
import { bsGamma } from './black-scholes';
import { MIN_T_YEARS, YEAR_MS } from './constants';
import { type DealerSignModel, naiveDealerSign, optionGexDollars } from './gex';
import { impliedVol } from './implied-vol';

export type IvMode = 'own' | 'vendor';

// A repriceable option leg on the SPX index axis. `strikeScale` is 1 for a
// native-SPX leg and 10 for an SPY leg placed on the combined SPX axis; the
// native spot at an axis spot S* is S*/strikeScale.
export interface PricedOption {
	axisStrike: number;
	nativeStrike: number;
	right: OptionRight;
	oi: number;
	sigma: number;
	t: number;
	dte: number;
	sign: 1 | -1;
	strikeScale: number;
	r: number;
	q: number;
	multiplier: number;
}

export interface PriceBookOptions {
	riskParams: RiskParams;
	strikeScale?: number;
	ivMode?: IvMode;
	signModel?: DealerSignModel;
}

// Years to expiry from the precise settlement instant when available, else from
// the integer `dte`. Floored at MIN_T_YEARS to keep 0DTE gamma finite.
export function yearsToExpiry(captureTs: number, quote: OptionQuote): number {
	const raw =
		quote.expiryMillis != null ? (quote.expiryMillis - captureTs) / YEAR_MS : quote.dte / 365;
	return Math.max(raw, MIN_T_YEARS);
}

function resolveSigma(
	quote: OptionQuote,
	t: number,
	spot: number,
	riskParams: RiskParams,
	ivMode: IvMode
): number | null {
	const own = (): number | null =>
		quote.mid > 0
			? impliedVol(
					quote.right,
					{ s: spot, k: quote.strike, t, r: riskParams.r, q: riskParams.q },
					quote.mid
				)
			: null;
	const vendor = quote.iv != null && quote.iv > 0 ? quote.iv : null;
	// Default 'own' for internal consistency (never mix vendor IV with own greeks).
	return ivMode === 'vendor' ? (vendor ?? own()) : (own() ?? vendor);
}

// Build a repriceable book from a chain snapshot. Skips zero-OI quotes and any
// quote whose IV can't be resolved — never NaN-propagates.
export function priceBook(snapshot: ChainSnapshot, opts: PriceBookOptions): PricedOption[] {
	const spot = snapshot.underlying.last;
	const scale = opts.strikeScale ?? 1;
	const ivMode = opts.ivMode ?? 'own';
	const sign = opts.signModel ?? naiveDealerSign;
	const out: PricedOption[] = [];
	for (const quote of snapshot.quotes) {
		if (!(quote.openInterest > 0)) continue;
		const t = yearsToExpiry(snapshot.captureTs, quote);
		const sigma = resolveSigma(quote, t, spot, opts.riskParams, ivMode);
		if (sigma == null || !(sigma > 0)) continue;
		out.push({
			axisStrike: quote.strike * scale,
			nativeStrike: quote.strike,
			right: quote.right,
			oi: quote.openInterest,
			sigma,
			t,
			dte: quote.dte,
			sign: sign(quote.right),
			strikeScale: scale,
			r: opts.riskParams.r,
			q: opts.riskParams.q,
			multiplier: opts.riskParams.multiplier
		});
	}
	return out;
}

// Dealer-signed dollar gamma for one leg at a hypothetical axis spot S*.
export function gexAtAxisSpot(opt: PricedOption, axisSpot: number): number {
	const nativeSpot = axisSpot / opt.strikeScale;
	const gamma = bsGamma({
		s: nativeSpot,
		k: opt.nativeStrike,
		t: opt.t,
		r: opt.r,
		q: opt.q,
		sigma: opt.sigma
	});
	return opt.sign * optionGexDollars(gamma, opt.oi, nativeSpot, opt.multiplier);
}

export function netGexAtAxisSpot(book: readonly PricedOption[], axisSpot: number): number {
	let sum = 0;
	for (const opt of book) sum += gexAtAxisSpot(opt, axisSpot);
	return sum;
}

export function aggregateByStrike(book: readonly PricedOption[], axisSpot: number): StrikeGex[] {
	const map = new Map<number, { call: number; put: number }>();
	for (const opt of book) {
		const g = gexAtAxisSpot(opt, axisSpot);
		const entry = map.get(opt.axisStrike) ?? { call: 0, put: 0 };
		if (opt.right === 'C') entry.call += g;
		else entry.put += g;
		map.set(opt.axisStrike, entry);
	}
	return [...map.entries()]
		.map(([strike, v]) => ({ strike, callGex: v.call, putGex: v.put, netGex: v.call + v.put }))
		.sort((a, b) => a.strike - b.strike);
}

// Call wall = strike of max net positive dealer gamma at/above spot; put wall =
// strike of max net negative dealer gamma at/below spot.
export function findWalls(
	byStrike: readonly StrikeGex[],
	spot: number
): { callWall: number | null; putWall: number | null } {
	let callWall: number | null = null;
	let callMax = 0;
	let putWall: number | null = null;
	let putMin = 0;
	for (const s of byStrike) {
		if (s.strike >= spot && s.netGex > callMax) {
			callMax = s.netGex;
			callWall = s.strike;
		}
		if (s.strike <= spot && s.netGex < putMin) {
			putMin = s.netGex;
			putWall = s.strike;
		}
	}
	return { callWall, putWall };
}

export interface GridOptions {
	rangePct?: number;
	steps?: number;
}

// Gamma flip / zero-gamma: reprice the WHOLE book across hypothetical spot levels
// and interpolate the net-GEX zero crossing nearest current spot. This is the
// correct method — not a cumulative crossing at current strikes.
export function findGammaFlip(
	book: readonly PricedOption[],
	axisSpot: number,
	opts: GridOptions = {}
): number | null {
	const rangePct = opts.rangePct ?? 0.15;
	const steps = opts.steps ?? 121;
	const loS = axisSpot * (1 - rangePct);
	const hiS = axisSpot * (1 + rangePct);
	const dx = (hiS - loS) / (steps - 1);
	const crossings: number[] = [];
	let prevS = loS;
	let prevG = netGexAtAxisSpot(book, loS);
	for (let i = 1; i < steps; i++) {
		const s = loS + i * dx;
		const g = netGexAtAxisSpot(book, s);
		if (prevG === 0) {
			crossings.push(prevS);
		} else if (prevG * g < 0) {
			crossings.push(prevS + (prevG * (s - prevS)) / (prevG - g));
		}
		prevS = s;
		prevG = g;
	}
	if (prevG === 0) crossings.push(prevS);
	if (crossings.length === 0) return null;
	return crossings.reduce((best, c) =>
		Math.abs(c - axisSpot) < Math.abs(best - axisSpot) ? c : best
	);
}

// Volatility trigger — documented HEURISTIC ESTIMATE (≠ zero-gamma): the spot
// level at/below current spot with maximal positive dealer-gamma support, below
// which hedging rolls into vol-amplifying territory.
export function findVolTrigger(
	book: readonly PricedOption[],
	axisSpot: number,
	opts: GridOptions = {}
): number | null {
	const rangePct = opts.rangePct ?? 0.15;
	const steps = opts.steps ?? 121;
	const loS = axisSpot * (1 - rangePct);
	const hiS = axisSpot * (1 + rangePct);
	const dx = (hiS - loS) / (steps - 1);
	let bestS: number | null = null;
	let bestG = -Infinity;
	for (let i = 0; i < steps; i++) {
		const s = loS + i * dx;
		if (s > axisSpot) break;
		const g = netGexAtAxisSpot(book, s);
		if (g > bestG) {
			bestG = g;
			bestS = s;
		}
	}
	return bestG > 0 ? bestS : null;
}

export interface BuildSurfaceParams {
	scope: SurfaceScope;
	expiryScope: ExpiryScope;
	asOf: number;
	axisSpot: number;
	book: readonly PricedOption[];
}

export interface BuildSurfaceOptions extends GridOptions {
	computeVolTrigger?: boolean;
}

export function buildSurface(
	params: BuildSurfaceParams,
	opts: BuildSurfaceOptions = {}
): GammaSurface {
	const byStrike = aggregateByStrike(params.book, params.axisSpot);
	const netGex = byStrike.reduce((sum, x) => sum + x.netGex, 0);
	const { callWall, putWall } = findWalls(byStrike, params.axisSpot);
	const gammaFlip = findGammaFlip(params.book, params.axisSpot, opts);
	const surface: GammaSurface = {
		asOf: params.asOf,
		scope: params.scope,
		expiryScope: params.expiryScope,
		spot: params.axisSpot,
		byStrike,
		netGex,
		regime: netGex >= 0 ? 'positive' : 'negative',
		gammaFlip,
		callWall,
		putWall
	};
	if (opts.computeVolTrigger) {
		surface.volTrigger = findVolTrigger(params.book, params.axisSpot, opts);
	}
	return surface;
}

// Combine SPX (scale 1) and SPY (scale 10) priced books onto one SPX-axis book.
export function combineBooks(spxBook: PricedOption[], spyBook: PricedOption[]): PricedOption[] {
	return [...spxBook, ...spyBook];
}

export interface BuildGridParams {
	scope: SurfaceScope;
	asOf: number;
	axisSpot: number;
	book: readonly PricedOption[];
}

// The strike × DTE × netGEX grid: the book grouped by days-to-expiry, each
// expiry aggregated into a strike profile at current spot. Drives the 3D surface.
export function buildSurfaceGrid(params: BuildGridParams): GammaSurfaceGrid {
	const byDte = new Map<number, PricedOption[]>();
	for (const opt of params.book) {
		const arr = byDte.get(opt.dte);
		if (arr) arr.push(opt);
		else byDte.set(opt.dte, [opt]);
	}
	const slices = [...byDte.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([dte, opts]) => {
			const byStrike = aggregateByStrike(opts, params.axisSpot);
			return { dte, byStrike, netGex: byStrike.reduce((s, x) => s + x.netGex, 0) };
		});
	return { asOf: params.asOf, scope: params.scope, spot: params.axisSpot, slices };
}
