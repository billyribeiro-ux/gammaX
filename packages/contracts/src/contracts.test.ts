import { describe, expect, it } from 'vitest';
import {
	ChainSnapshot,
	EngineMessage,
	type SignalEvalContext,
	SignalEvalContext as SignalEvalContextSchema,
	type SignalMetric,
	Signal,
	SignalSpec
} from './index';

const ALL_METRICS: SignalMetric[] = [
	'netGex',
	'regimeSign',
	'spot',
	'callWall',
	'putWall',
	'gammaFlip',
	'volTrigger',
	'distToFlipPct',
	'ivZScore',
	'ivRocPctPerMin',
	'atmIv0dte',
	'atmIvCm30',
	'flowDelta'
];

function fullMetrics(): SignalEvalContext['metrics'] {
	return Object.fromEntries(ALL_METRICS.map((m) => [m, null])) as SignalEvalContext['metrics'];
}

describe('contracts schemas round-trip', () => {
	it('parses a ChainSnapshot and survives JSON round-trip', () => {
		const snap = ChainSnapshot.parse({
			captureTs: 1_700_000_000_000,
			underlying: { symbol: 'SPX', last: 5000, ts: 1_700_000_000_000 },
			source: 'synthetic',
			quotes: [
				{
					symbol: 'SPXW  260625C05000000',
					underlying: 'SPX',
					root: 'SPXW',
					expiry: '2026-06-25',
					dte: 0,
					right: 'C',
					strike: 5000,
					bid: 12,
					ask: 12.5,
					mid: 12.25,
					volume: 100,
					openInterest: 2000
				}
			]
		});
		expect(snap.delayed).toBe(false);
		expect(ChainSnapshot.parse(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
	});

	it('parses each Signal variant in the discriminated union', () => {
		const composite = Signal.parse({
			id: 'sig-1',
			ts: 1_700_000_000_000,
			underlying: 'SPX',
			confidence: 0.8,
			kind: 'composite',
			payload: { name: 'downside_amplify', components: ['gamma_regime_flip', 'iv_explosion'] }
		});
		expect(composite.kind).toBe('composite');

		const pin = Signal.parse({
			id: 'sig-2',
			ts: 1_700_000_000_000,
			underlying: 'SPY',
			confidence: 0.6,
			kind: 'pin',
			payload: { strike: 500, netGexAtStrike: 1e9, spot: 500.2 }
		});
		expect(pin.kind).toBe('pin');
	});

	it('wraps a Signal in an EngineMessage', () => {
		const msg = EngineMessage.parse({
			type: 'signal',
			signal: {
				id: 'sig-3',
				ts: 1_700_000_000_000,
				underlying: 'SPX',
				confidence: 1,
				kind: 'iv_explosion',
				payload: { zScore: 3.1, rocPctPerMin: 0.5, atmIv: 0.22 }
			}
		});
		expect(EngineMessage.parse(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
	});

	it('parses a recursive SignalSpec confluence tree', () => {
		const spec = SignalSpec.parse({
			type: 'and',
			children: [
				{ type: 'cmp', metric: 'netGex', op: '<', value: 0 },
				{ type: 'cmp', metric: 'ivZScore', op: '>', value: 2 },
				{ type: 'near', metric: 'spot', target: 'putWall', withinPct: 0.15 },
				{ type: 'not', child: { type: 'cmp', metric: 'flowDelta', op: '>=', value: 0 } }
			]
		});
		expect(spec.type).toBe('and');
		expect(SignalSpec.parse(JSON.parse(JSON.stringify(spec)))).toEqual(spec);
	});

	it('requires all metrics to be present in a SignalEvalContext', () => {
		const ctx = SignalEvalContextSchema.parse({
			underlying: 'SPX',
			ts: 1_700_000_000_000,
			metrics: fullMetrics()
		});
		expect(Object.keys(ctx.metrics).sort()).toEqual([...ALL_METRICS].sort());
	});
});
