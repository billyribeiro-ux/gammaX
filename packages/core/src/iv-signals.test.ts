import type { GammaSurface, IvSample, IvState } from '@gammax/contracts';
import { describe, expect, it } from 'vitest';
import { atmIvCm30, ivVelocity, type ExpiryIv } from './iv';
import {
	buildEvalContext,
	DEFAULT_SIGNAL_RULES,
	detectIvVelocitySignal,
	detectRegimeFlip,
	detectWallTest,
	evaluateRules,
	evaluateSpec
} from './signal-eval';

describe('constant-maturity 30D ATM IV (total-variance interpolation)', () => {
	it('interpolates between bracketing expiries', () => {
		const xs: ExpiryIv[] = [
			{ dte: 23, days: 23, iv: 0.2 },
			{ dte: 37, days: 37, iv: 0.18 }
		];
		// tv30 = 0.5·(0.2²·23/365) + 0.5·(0.18²·37/365); σ30 = √(tv30/(30/365))
		expect(atmIvCm30(xs)).toBeCloseTo(0.18792, 4);
	});
	it('clamps to nearest expiry outside the range; null when empty', () => {
		expect(atmIvCm30([{ dte: 1, days: 1, iv: 0.5 }])).toBe(0.5);
		expect(atmIvCm30([])).toBeNull();
	});
});

describe('IV velocity', () => {
	it('z-score and ROC of a sharp spike', () => {
		const base = 1_700_000_000_000;
		const series: IvSample[] = [0.2, 0.2, 0.2, 0.2, 0.3].map((v, i) => ({
			ts: base + i * 60_000,
			atmIv0dte: v,
			atmIvCm30: 0.2
		}));
		const { zScore, rocPctPerMin } = ivVelocity(series, 5);
		expect(zScore).toBeCloseTo(2.0, 10);
		expect(rocPctPerMin).toBeCloseTo(50, 10);
	});
	it('returns nulls with insufficient data', () => {
		expect(ivVelocity([], 5)).toEqual({ zScore: null, rocPctPerMin: null });
	});
});

const NEG_SURFACE: GammaSurface = {
	asOf: 1_700_000_000_000,
	scope: 'combined',
	expiryScope: 'all',
	spot: 5000,
	byStrike: [],
	netGex: -1e9,
	regime: 'negative',
	gammaFlip: 5100,
	callWall: 5200,
	putWall: 5005,
	volTrigger: null
};

function ivState(over: Partial<IvState>): IvState {
	return {
		underlying: 'SPX',
		asOf: 1_700_000_000_000,
		atmIv0dte: 0.25,
		atmIvCm30: 0.2,
		zScore: 3,
		rocPctPerMin: 10,
		series: [],
		...over
	};
}

describe('signal evaluator', () => {
	it('fires the Phase-1 composite but not the flow-gated one', () => {
		const ctx = buildEvalContext({
			underlying: 'SPX',
			ts: NEG_SURFACE.asOf,
			surface: NEG_SURFACE,
			iv: ivState({})
		});
		const sigs = evaluateRules(DEFAULT_SIGNAL_RULES, ctx);
		const names = sigs.map((s) => (s.kind === 'composite' ? s.payload.name : s.kind));
		expect(names).toContain('downside_pressure');
		expect(names).not.toContain('downside_amplify'); // flowDelta null → dormant
	});

	it('evaluates leaf predicates: cmp / near / not / available', () => {
		const ctx = buildEvalContext({
			underlying: 'SPX',
			ts: NEG_SURFACE.asOf,
			surface: NEG_SURFACE,
			iv: ivState({})
		});
		expect(evaluateSpec({ type: 'cmp', metric: 'netGex', op: '<', value: 0 }, ctx)).toBe(true);
		expect(
			evaluateSpec({ type: 'near', metric: 'spot', target: 'putWall', withinPct: 0.5 }, ctx)
		).toBe(true);
		expect(evaluateSpec({ type: 'available', metric: 'flowDelta' }, ctx)).toBe(false);
		expect(
			evaluateSpec({ type: 'not', child: { type: 'available', metric: 'flowDelta' } }, ctx)
		).toBe(true);
	});
});

describe('primitive detectors', () => {
	it('iv explosion and implosion', () => {
		expect(detectIvVelocitySignal(ivState({ zScore: 3 }), { zThreshold: 2 })?.kind).toBe(
			'iv_explosion'
		);
		expect(detectIvVelocitySignal(ivState({ zScore: -3 }), { zThreshold: 2 })?.kind).toBe(
			'iv_implosion'
		);
		expect(detectIvVelocitySignal(ivState({ zScore: 1 }), { zThreshold: 2 })).toBeNull();
	});
	it('regime flip only when regime changes', () => {
		const pos: GammaSurface = { ...NEG_SURFACE, regime: 'positive', netGex: 1e9 };
		expect(detectRegimeFlip(pos, NEG_SURFACE, 'SPX')?.kind).toBe('gamma_regime_flip');
		expect(detectRegimeFlip(NEG_SURFACE, NEG_SURFACE, 'SPX')).toBeNull();
	});
	it('wall test when spot is within threshold of a wall', () => {
		const near: GammaSurface = { ...NEG_SURFACE, callWall: 5010, putWall: 4500 };
		const sig = detectWallTest(near, 'SPX', { withinPct: 0.5 });
		expect(sig?.kind).toBe('wall_test');
		expect(sig?.kind === 'wall_test' && sig.payload.wall).toBe('call');
	});
});
