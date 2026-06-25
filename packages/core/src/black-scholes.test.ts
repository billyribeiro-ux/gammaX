import { describe, expect, it } from 'vitest';
import { bsCharm, bsDelta, bsGamma, bsPrice, bsTheta, bsVanna, bsVega } from './black-scholes';
import { impliedVol } from './implied-vol';
import { normCdf, normPdf } from './normal';

// Reference fixture (validated vs Wikipedia Greeks table):
// S=100, K=100, r=0.05, q=0.02, σ=0.20, T=1.0  →  d1=0.25, d2=0.05
const IN = { s: 100, k: 100, t: 1, r: 0.05, q: 0.02, sigma: 0.2 };

describe('standard normal', () => {
	it('pdf and cdf at the fixture points', () => {
		expect(normPdf(0.25)).toBeCloseTo(0.3866681168, 9);
		expect(normCdf(0.25)).toBeCloseTo(0.5987063257, 9);
		expect(normCdf(0.05)).toBeCloseTo(0.5199388058, 9);
		expect(normCdf(0)).toBeCloseTo(0.5, 12);
		expect(normCdf(-3) + normCdf(3)).toBeCloseTo(1, 12);
	});
});

describe('Black–Scholes greeks vs reference', () => {
	it('delta', () => {
		expect(bsDelta('C', IN)).toBeCloseTo(0.5868511461, 9);
		expect(bsDelta('P', IN)).toBeCloseTo(-0.3933475272, 9);
	});
	it('gamma (call == put)', () => {
		expect(bsGamma(IN)).toBeCloseTo(0.0189505788, 9);
	});
	it('vega', () => {
		expect(bsVega(IN)).toBeCloseTo(37.90115751, 6);
	});
	it('theta', () => {
		expect(bsTheta('C', IN)).toBeCloseTo(-5.089318914, 6);
		expect(bsTheta('P', IN)).toBeCloseTo(-2.2935691381, 6);
	});
	it('vanna', () => {
		expect(bsVanna(IN)).toBeCloseTo(-0.0947528938, 9);
	});
	it('charm and the charm_call − charm_put = q·e^{−qT} identity', () => {
		expect(bsCharm('C', IN)).toBeCloseTo(-0.035639424, 9);
		expect(bsCharm('P', IN)).toBeCloseTo(-0.0552433974, 9);
		const identity = 0.02 * Math.exp(-0.02 * 1);
		expect(bsCharm('C', IN) - bsCharm('P', IN)).toBeCloseTo(identity, 12);
	});
	it('prices and put–call parity', () => {
		expect(bsPrice('C', IN)).toBeCloseTo(9.2270055082, 8);
		expect(bsPrice('P', IN)).toBeCloseTo(6.3300806275, 8);
		// C − P = S·e^{−qT} − K·e^{−rT}
		const parity = 100 * Math.exp(-0.02) - 100 * Math.exp(-0.05);
		expect(bsPrice('C', IN) - bsPrice('P', IN)).toBeCloseTo(parity, 10);
	});
});

describe('implied volatility solver', () => {
	const base = { s: 100, k: 100, t: 1, r: 0.05, q: 0.02 };
	it('recovers σ from call and put prices', () => {
		expect(impliedVol('C', base, 9.2270055082)).toBeCloseTo(0.2, 8);
		expect(impliedVol('P', base, 6.3300806275)).toBeCloseTo(0.2, 8);
	});
	it('recovers σ for OTM strikes', () => {
		const otm = { s: 100, k: 110, t: 0.5, r: 0.05, q: 0.02 };
		const price = bsPrice('C', { ...otm, sigma: 0.35 });
		expect(impliedVol('C', otm, price)).toBeCloseTo(0.35, 7);
	});
	it('rejects prices outside no-arbitrage bounds', () => {
		expect(impliedVol('C', base, 0)).toBeNull();
		expect(impliedVol('C', base, 200)).toBeNull();
	});
});
