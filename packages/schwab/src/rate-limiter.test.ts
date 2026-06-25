import { describe, expect, it } from 'vitest';
import { TokenBucket } from './rate-limiter';

describe('TokenBucket', () => {
	it('depletes capacity then refills over time', () => {
		let t = 0;
		const tb = new TokenBucket(2, 1, () => t); // cap 2, 1 token/sec
		expect(tb.tryAcquire()).toBe(true);
		expect(tb.tryAcquire()).toBe(true);
		expect(tb.tryAcquire()).toBe(false);
		expect(tb.msUntilNext()).toBe(1000);
		t = 1000;
		expect(tb.tryAcquire()).toBe(true);
		expect(tb.tryAcquire()).toBe(false);
	});

	it('acquire() waits via injected sleep until a token frees up', async () => {
		let t = 0;
		const tb = new TokenBucket(1, 1, () => t);
		expect(tb.tryAcquire()).toBe(true);
		const sleeps: number[] = [];
		await tb.acquire(async (ms) => {
			sleeps.push(ms);
			t += ms;
		});
		expect(sleeps.length).toBeGreaterThan(0);
	});
});
