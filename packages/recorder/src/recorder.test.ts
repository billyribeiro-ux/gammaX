import type { ChainSnapshot, GammaSurface, Signal, SignalOutcome } from '@gammax/contracts';
import { describe, expect, it } from 'vitest';
import { SqliteRecorder } from './sqlite-recorder';

function chain(ts: number, spot: number): ChainSnapshot {
	return {
		captureTs: ts,
		source: 'synthetic',
		delayed: false,
		underlying: { symbol: 'SPX', last: spot, ts },
		quotes: [
			{
				symbol: 'SPXW  260625C05000000',
				underlying: 'SPX',
				expiry: '2026-06-25',
				dte: 0,
				right: 'C',
				strike: spot,
				bid: 1,
				ask: 1.2,
				mid: 1.1,
				volume: 1,
				openInterest: 10
			}
		]
	};
}

describe('SqliteRecorder point-in-time store', () => {
	it('appends and reads snapshots in capture order', async () => {
		const r = new SqliteRecorder(':memory:');
		await r.ensureSchema();
		await r.writeChain(chain(1000, 5000));
		await r.writeChain(chain(2000, 5010));
		await r.writeChain(chain(3000, 4990));
		const all = await r.getChainSnapshots('SPX');
		expect(all.map((s) => s.captureTs)).toEqual([1000, 2000, 3000]);
		expect(all.map((s) => s.underlying.last)).toEqual([5000, 5010, 4990]);
		await r.close();
	});

	it('enforces point-in-time reads (capture_ts <= decisionTs)', async () => {
		const r = new SqliteRecorder(':memory:');
		await r.ensureSchema();
		for (const [ts, spot] of [
			[1000, 5000],
			[2000, 5010],
			[3000, 4990]
		] as const) {
			await r.writeChain(chain(ts, spot));
		}
		const upTo = await r.getChainSnapshots('SPX', { toTs: 2000 });
		expect(upTo.map((s) => s.captureTs)).toEqual([1000, 2000]);
		expect(await r.getSpotAtOrBefore('SPX', 2500)).toBe(5010);
		expect(await r.getSpotAtOrBefore('SPX', 999)).toBeNull();
		await r.close();
	});

	it('stores surfaces, signals and outcomes', async () => {
		const r = new SqliteRecorder(':memory:');
		await r.ensureSchema();
		const surface: GammaSurface = {
			asOf: 1000,
			scope: 'combined',
			expiryScope: 'all',
			spot: 5000,
			byStrike: [],
			netGex: -1,
			regime: 'negative',
			gammaFlip: null,
			callWall: null,
			putWall: null
		};
		await r.writeSurface(surface);
		const got = await r.getSurfaces({ scope: 'combined' });
		expect(got).toHaveLength(1);
		expect(got[0]?.regime).toBe('negative');

		const signal: Signal = {
			id: 's1',
			ts: 1000,
			underlying: 'SPX',
			confidence: 0.5,
			kind: 'pin',
			payload: { strike: 5000, netGexAtStrike: 1, spot: 5000 }
		};
		await r.writeSignal(signal);
		const outcome: SignalOutcome = {
			signalId: 's1',
			gradedAt: 2000,
			horizonMins: 15,
			result: 'confirmed',
			detail: { note: 'wall held' }
		};
		await r.writeOutcome(outcome);
		await r.close();
	});
});
