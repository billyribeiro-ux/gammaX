import type { GammaSurface, IvState } from '@gammax/contracts';
import { describe, expect, it } from 'vitest';
import {
	expectedMovePct,
	realizedVol,
	scanGammaScalp,
	scanIvVelocity,
	scoreGammaScalp
} from './scanners';

const ASOF = 1_700_000_000_000;

function ivStateOf(z: number | null): IvState {
	return {
		underlying: 'SPX',
		asOf: ASOF,
		atmIv0dte: 0.2,
		atmIvCm30: 0.18,
		zScore: z,
		rocPctPerMin: 1.0,
		series: []
	};
}

function surface(over: Partial<GammaSurface> = {}): GammaSurface {
	return {
		asOf: ASOF,
		scope: 'combined',
		expiryScope: 'all',
		spot: 5000,
		byStrike: [
			{ strike: 4900, callGex: 0, putGex: -3e8, netGex: -3e8 },
			{ strike: 5000, callGex: 0, putGex: -4e8, netGex: -4e8 },
			{ strike: 5100, callGex: 0, putGex: -3e8, netGex: -3e8 }
		],
		netGex: -1e9,
		regime: 'negative',
		gammaFlip: 5000,
		callWall: 5100,
		putWall: 4900,
		...over
	};
}

describe('realized volatility', () => {
	it('annualizes log returns by the observed cadence', () => {
		// 60s-spaced samples each +0.1% → σ = √(1e-6 · 525600) ≈ 0.7250
		const samples = [0, 1, 2, 3].map((i) => ({
			ts: ASOF + i * 60_000,
			spot: 100 * Math.exp(0.001 * i)
		}));
		expect(realizedVol(samples)).toBeCloseTo(0.72498, 4);
	});
	it('returns null with too few samples', () => {
		expect(
			realizedVol([
				{ ts: ASOF, spot: 100 },
				{ ts: ASOF + 1000, spot: 101 }
			])
		).toBeNull();
	});
});

describe('expected move', () => {
	it('is σ·√t as a percent of spot', () => {
		expect(expectedMovePct(0.2, 1 / 252)).toBeCloseTo(1.2599, 3);
	});
});

describe('IV velocity scanner', () => {
	it('ranks by |z-score| and tags explosion/implosion/calm', () => {
		const out = scanIvVelocity(
			[
				{ symbol: 'AAA', iv: ivStateOf(3) },
				{ symbol: 'BBB', iv: ivStateOf(-2.5) },
				{ symbol: 'CCC', iv: null }
			],
			ASOF,
			2
		);
		expect(out.rows.map((r) => r.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
		expect(out.rows.map((r) => r.state)).toEqual(['explosion', 'implosion', 'calm']);
		expect(out.rows[0]?.score).toBeCloseTo(3, 10);
	});
});

describe('gamma-scalping scanner', () => {
	it('flags LONG gamma when dealers are short gamma and realized > implied, peaking at the flip', () => {
		const row = scoreGammaScalp({
			symbol: 'SPX',
			surface: surface(), // negative regime, spot == flip
			atmIv: 0.2,
			realizedVol: 0.3, // rv/iv = 1.5 → volEdge 0.5
			horizonYears: 1 / 252
		});
		expect(row.mode).toBe('long_gamma');
		expect(row.rvIvRatio).toBeCloseTo(1.5, 10);
		// conviction 1 (one-sided), volEdge 0.5, positioning 1 → 0.5+0.15+0.2 = 0.85
		expect(row.score).toBe(85);
		expect(row.hotStrikes[0]?.strike).toBe(5000);
	});

	it('flags SHORT gamma when dealers are long gamma, price centered, implied > realized', () => {
		const row = scoreGammaScalp({
			symbol: 'QQQ',
			surface: surface({
				regime: 'positive',
				netGex: 1e9,
				byStrike: [
					{ strike: 4900, callGex: 3e8, putGex: 0, netGex: 3e8 },
					{ strike: 5000, callGex: 4e8, putGex: 0, netGex: 4e8 },
					{ strike: 5100, callGex: 3e8, putGex: 0, netGex: 3e8 }
				]
			}),
			atmIv: 0.2,
			realizedVol: 0.1, // rv/iv = 0.5 → volEdge 0.5
			horizonYears: 1 / 252
		});
		expect(row.mode).toBe('short_gamma');
		expect(row.score).toBe(85);
	});

	it('is neutral (score 0) when positive-regime price is outside the walls', () => {
		const row = scoreGammaScalp({
			symbol: 'IWM',
			surface: surface({ regime: 'positive', spot: 5200 }),
			atmIv: 0.2,
			realizedVol: 0.2,
			horizonYears: 1 / 252
		});
		expect(row.mode).toBe('neutral');
		expect(row.score).toBe(0);
	});

	it('ranks a watchlist by score', () => {
		const out = scanGammaScalp(
			[
				{
					symbol: 'FLAT',
					surface: surface({ regime: 'positive', spot: 5200 }),
					atmIv: 0.2,
					realizedVol: 0.2,
					horizonYears: 1 / 252
				},
				{ symbol: 'HOT', surface: surface(), atmIv: 0.2, realizedVol: 0.3, horizonYears: 1 / 252 }
			],
			ASOF
		);
		expect(out.rows[0]?.symbol).toBe('HOT');
		expect(out.rows[0]?.score).toBeGreaterThan(out.rows[1]?.score ?? 0);
	});
});
