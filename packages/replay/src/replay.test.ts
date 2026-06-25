import type { ChainSnapshot, UnderlyingSymbol } from '@gammax/contracts';
import { SqliteRecorder } from '@gammax/recorder';
import { describe, expect, it } from 'vitest';
import { ReplayFeed } from './feed';

function chain(underlying: UnderlyingSymbol, ts: number, spot: number): ChainSnapshot {
	return {
		captureTs: ts,
		source: 'synthetic',
		delayed: false,
		underlying: { symbol: underlying, last: spot, ts },
		quotes: []
	};
}

describe('ReplayFeed', () => {
	it('re-emits recorded snapshots in strict capture-timestamp order', async () => {
		const rec = new SqliteRecorder(':memory:');
		await rec.ensureSchema();
		// Write out of order and across symbols; replay must merge-sort by capture_ts.
		await rec.writeChain(chain('SPX', 3000, 5002));
		await rec.writeChain(chain('SPX', 1000, 5000));
		await rec.writeChain(chain('SPY', 2000, 500));
		await rec.writeChain(chain('SPX', 2000, 5001));

		const seen: number[] = [];
		const feed = new ReplayFeed({ recorder: rec, symbols: ['SPX', 'SPY'], step: true });
		feed.subscribeChains(['SPX', 'SPY'], (s) => seen.push(s.captureTs));
		await feed.start();
		while (feed.step()) {
			/* drain */
		}
		expect(seen).toEqual([1000, 2000, 2000, 3000]);
		await rec.close();
	});
});
