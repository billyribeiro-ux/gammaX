import type { ChainSnapshot } from '@gammax/contracts';
import { bsCharm } from './black-scholes';
import { gexAtAxisSpot, type PricedOption } from './surface';

// Same-day expiry only. The 0DTE surface read alongside the all-expiry map (and
// their disagreement) is the signal.
export function filterZeroDte(snapshot: ChainSnapshot): ChainSnapshot {
	return { ...snapshot, quotes: snapshot.quotes.filter((q) => q.dte === 0) };
}

export interface KeyStrike {
	strike: number;
	totalOi: number;
	netGex: number;
}

// The 0DTE strike with the most open interest and the net dealer gamma there
// (repriced at current spot). netGex ≥ 0 → pin (price gravitates), < 0 → pop.
export function findKeyStrike(book: readonly PricedOption[], axisSpot: number): KeyStrike | null {
	const oiByStrike = new Map<number, number>();
	const gexByStrike = new Map<number, number>();
	for (const opt of book) {
		oiByStrike.set(opt.axisStrike, (oiByStrike.get(opt.axisStrike) ?? 0) + opt.oi);
		gexByStrike.set(
			opt.axisStrike,
			(gexByStrike.get(opt.axisStrike) ?? 0) + gexAtAxisSpot(opt, axisSpot)
		);
	}
	let bestStrike: number | null = null;
	let bestOi = -1;
	for (const [strike, oi] of oiByStrike) {
		if (oi > bestOi) {
			bestOi = oi;
			bestStrike = strike;
		}
	}
	if (bestStrike === null) return null;
	return { strike: bestStrike, totalOi: bestOi, netGex: gexByStrike.get(bestStrike) ?? 0 };
}

export interface StrikeCharm {
	strike: number;
	charm: number;
}

// Per-strike dealer charm exposure for the 0DTE book — surfaces the into-the-
// close delta drift (charm = −∂Δ/∂T). Signed by the dealer-sign convention.
export function charmOverlay(book: readonly PricedOption[], axisSpot: number): StrikeCharm[] {
	const map = new Map<number, number>();
	for (const opt of book) {
		const nativeSpot = axisSpot / opt.strikeScale;
		const charm =
			opt.sign *
			bsCharm(opt.right, {
				s: nativeSpot,
				k: opt.nativeStrike,
				t: opt.t,
				r: opt.r,
				q: opt.q,
				sigma: opt.sigma
			}) *
			opt.oi *
			opt.multiplier;
		map.set(opt.axisStrike, (map.get(opt.axisStrike) ?? 0) + charm);
	}
	return [...map.entries()]
		.map(([strike, charm]) => ({ strike, charm }))
		.sort((a, b) => a.strike - b.strike);
}
