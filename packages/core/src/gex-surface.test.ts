import type { ChainSnapshot, RiskParams, StrikeGex } from '@gammax/contracts';
import { describe, expect, it } from 'vitest';
import { bsGamma } from './black-scholes';
import { optionGexDollars } from './gex';
import {
	aggregateByStrike,
	buildSurface,
	combineBooks,
	findGammaFlip,
	findWalls,
	netGexAtAxisSpot,
	type PricedOption,
	priceBook
} from './surface';
import { findKeyStrike } from './zero-dte';

const RISK: RiskParams = { r: 0.04, q: 0, multiplier: 100 };

function opt(
	over: Partial<PricedOption> & Pick<PricedOption, 'axisStrike' | 'nativeStrike' | 'right' | 'sign'>
): PricedOption {
	return {
		oi: 1000,
		sigma: 0.2,
		t: 0.02,
		strikeScale: 1,
		r: 0.04,
		q: 0,
		multiplier: 100,
		...over
	};
}

describe('SPX↔SPY normalization fixture', () => {
	it('per-share gamma scales 10× and GEX$ ratio is exactly 10', () => {
		const gSpx = bsGamma({ s: 5000, k: 5000, t: 30 / 365, r: 0.04, q: 0, sigma: 0.15 });
		const gSpy = bsGamma({ s: 500, k: 500, t: 30 / 365, r: 0.04, q: 0, sigma: 0.15 });
		expect(gSpy / gSpx).toBeCloseTo(10, 10);

		const gexSpx = optionGexDollars(gSpx, 1, 5000, 100);
		const gexSpy = optionGexDollars(gSpy, 1, 500, 100);
		expect(gexSpx).toBeCloseTo(46162.6937, 2);
		expect(gexSpy).toBeCloseTo(4616.2694, 2);
		expect(gexSpx / gexSpy).toBeCloseTo(10, 10);
	});

	it('combined book sums SPX + SPY dollars on the SPX strike axis', () => {
		const spx = opt({
			axisStrike: 5000,
			nativeStrike: 5000,
			right: 'C',
			sign: 1,
			oi: 1,
			sigma: 0.15,
			t: 30 / 365
		});
		const spy = opt({
			axisStrike: 5000,
			nativeStrike: 500,
			right: 'C',
			sign: 1,
			oi: 1,
			sigma: 0.15,
			t: 30 / 365,
			strikeScale: 10
		});
		const combined = combineBooks([spx], [spy]);
		const byStrike = aggregateByStrike(combined, 5000);
		expect(byStrike).toHaveLength(1);
		expect(byStrike[0]?.strike).toBe(5000);
		expect(byStrike[0]?.netGex).toBeCloseTo(46162.6937 + 4616.2694, 2);
	});
});

describe('walls', () => {
	it('finds call wall above spot and put wall below spot', () => {
		const byStrike: StrikeGex[] = [
			{ strike: 4900, callGex: 1, putGex: -5, netGex: -4 },
			{ strike: 4950, callGex: 1, putGex: -8, netGex: -7 },
			{ strike: 5000, callGex: 3, putGex: -3, netGex: 0 },
			{ strike: 5050, callGex: 9, putGex: -1, netGex: 8 },
			{ strike: 5100, callGex: 4, putGex: 0, netGex: 4 }
		];
		const { callWall, putWall } = findWalls(byStrike, 5000);
		expect(callWall).toBe(5050);
		expect(putWall).toBe(4950);
	});
});

describe('gamma flip via repricing', () => {
	it('locates the zero-gamma crossing where net dealer GEX changes sign', () => {
		// Negative put cluster below, positive call cluster above → flip near 5000.
		const book: PricedOption[] = [
			opt({ axisStrike: 4900, nativeStrike: 4900, right: 'P', sign: -1, oi: 1000 }),
			opt({ axisStrike: 5100, nativeStrike: 5100, right: 'C', sign: 1, oi: 1000 })
		];
		const flip = findGammaFlip(book, 5000, { rangePct: 0.1, steps: 401 });
		expect(flip).not.toBeNull();
		// The invariant: net dealer GEX is ~0 at the reported flip level.
		expect(Math.abs(netGexAtAxisSpot(book, flip as number))).toBeLessThan(1e6);
		expect(netGexAtAxisSpot(book, (flip as number) - 50)).toBeLessThan(0);
		expect(netGexAtAxisSpot(book, (flip as number) + 50)).toBeGreaterThan(0);
		expect(flip as number).toBeGreaterThan(4950);
		expect(flip as number).toBeLessThan(5050);
	});

	it('returns null when net GEX never changes sign in range', () => {
		const book: PricedOption[] = [
			opt({ axisStrike: 5000, nativeStrike: 5000, right: 'C', sign: 1, oi: 1000 }),
			opt({ axisStrike: 5050, nativeStrike: 5050, right: 'C', sign: 1, oi: 1000 })
		];
		expect(findGammaFlip(book, 5000, { rangePct: 0.05, steps: 101 })).toBeNull();
	});
});

describe('buildSurface + priceBook end-to-end', () => {
	it('prices a synthetic snapshot and reports regime/walls', () => {
		const captureTs = 1_700_000_000_000;
		const snapshot: ChainSnapshot = {
			captureTs,
			source: 'synthetic',
			delayed: false,
			underlying: { symbol: 'SPX', last: 5000, ts: captureTs },
			quotes: [4950, 5000, 5050].flatMap((strike) =>
				(['C', 'P'] as const).map((right) => ({
					symbol: `SPXW${strike}${right}`,
					underlying: 'SPX' as const,
					expiry: '2026-06-25',
					dte: 0,
					right,
					strike,
					bid: 9.9,
					ask: 10.1,
					mid: 10,
					volume: 10,
					openInterest: 1000,
					iv: 0.2
				}))
			)
		};
		const book = priceBook(snapshot, { riskParams: RISK, ivMode: 'vendor' });
		expect(book.length).toBe(6);
		const surface = buildSurface(
			{ scope: 'SPX', expiryScope: '0dte', asOf: captureTs, axisSpot: 5000, book },
			{ computeVolTrigger: true }
		);
		expect(surface.byStrike).toHaveLength(3);
		expect(['positive', 'negative']).toContain(surface.regime);
		const key = findKeyStrike(book, 5000);
		expect(key?.strike).toBe(4950); // first max-OI bucket (all equal OI)
	});
});
