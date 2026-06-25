import type { ChainSnapshot } from '@gammax/contracts';
import { describe, expect, it } from 'vitest';
import { applyStreamQuotes, type StreamQuoteMap } from './stream-overlay';

function snap(): ChainSnapshot {
	return {
		captureTs: 1,
		source: 'schwab',
		delayed: false,
		underlying: { symbol: 'SPX', last: 5000, ts: 1 },
		quotes: [
			{
				symbol: 'SPXW  260625C05000000',
				underlying: 'SPX',
				expiry: '2026-06-25',
				dte: 0,
				right: 'C',
				strike: 5000,
				bid: 10,
				ask: 11,
				mid: 10.5,
				volume: 5,
				openInterest: 100
			}
		]
	};
}

describe('applyStreamQuotes', () => {
	it('overlays fresh bid/ask/last and recomputes mid by symbol', () => {
		const quotes: StreamQuoteMap = new Map([
			['SPXW  260625C05000000', { '2': 12, '3': 12.5, '4': 12.2 }]
		]);
		const out = applyStreamQuotes(snap(), quotes);
		const q = out.quotes[0];
		expect(q?.bid).toBe(12);
		expect(q?.ask).toBe(12.5);
		expect(q?.last).toBe(12.2);
		expect(q?.mid).toBeCloseTo(12.25, 10);
	});

	it('leaves quotes without a streamed match untouched, and is a no-op when empty', () => {
		const out = applyStreamQuotes(snap(), new Map([['OTHER', { '2': 1 }]]));
		expect(out.quotes[0]?.bid).toBe(10);
		expect(applyStreamQuotes(snap(), new Map())).toEqual(snap());
	});
});
