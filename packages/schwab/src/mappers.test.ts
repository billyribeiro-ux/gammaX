import { describe, expect, it } from 'vitest';
import { mapChainsResponse } from './mappers';

const raw = {
	symbol: '$SPX',
	underlyingPrice: 5000,
	callExpDateMap: {
		'2026-06-25:0': {
			'5000.0': [
				{
					putCall: 'CALL',
					symbol: 'SPXW  260625C05000000',
					bid: 12,
					ask: 12.4,
					mark: 12.2,
					last: 12.1,
					totalVolume: 100,
					openInterest: 2000,
					volatility: 18.5,
					delta: 0.5,
					gamma: 0.01,
					strikePrice: 5000,
					expirationDate: 1781452800000,
					daysToExpiration: 0
				}
			]
		}
	},
	putExpDateMap: {
		'2026-06-25:0': {
			'5000.0': [
				{
					putCall: 'PUT',
					symbol: 'SPXW  260625P05000000',
					bid: 11,
					ask: 11.4,
					mark: 11.2,
					totalVolume: 80,
					openInterest: 1500,
					volatility: -999,
					strikePrice: 5000,
					expirationDate: 1781452800000,
					daysToExpiration: 0
				}
			]
		}
	}
};

describe('mapChainsResponse', () => {
	it('normalizes a Schwab chains payload to a ChainSnapshot', () => {
		const snap = mapChainsResponse(raw, { underlying: 'SPX', captureTs: 1781452000000 });
		expect(snap.source).toBe('schwab');
		expect(snap.underlying.last).toBe(5000);
		expect(snap.quotes).toHaveLength(2);

		const call = snap.quotes.find((q) => q.right === 'C');
		expect(call?.strike).toBe(5000);
		expect(call?.mid).toBe(12.2); // mark preferred over (bid+ask)/2
		expect(call?.openInterest).toBe(2000);
		expect(call?.iv).toBeCloseTo(0.185, 9); // 18.5% → 0.185
		expect(call?.expiryMillis).toBe(1781452800000);
		expect(call?.dte).toBe(0);
		expect(call?.root).toBe('SPXW');

		const put = snap.quotes.find((q) => q.right === 'P');
		expect(put?.iv).toBeUndefined(); // -999 → N/A
		expect(put?.mid).toBe(11.2);
	});

	it('throws when the underlying price is missing', () => {
		expect(() =>
			mapChainsResponse(
				{ callExpDateMap: {}, putExpDateMap: {} },
				{ underlying: 'SPY', captureTs: 1 }
			)
		).toThrow();
	});
});
