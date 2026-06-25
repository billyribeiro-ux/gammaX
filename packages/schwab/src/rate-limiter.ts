// Token-bucket rate limiter — the single owner of the Schwab REST budget
// (~120 req/min). `now` is injectable for deterministic tests.
export class TokenBucket {
	private tokens: number;
	private last: number;

	constructor(
		private readonly capacity: number,
		private readonly refillPerSec: number,
		private readonly now: () => number = () => Date.now()
	) {
		this.tokens = capacity;
		this.last = now();
	}

	private refill(): void {
		const t = this.now();
		const elapsed = (t - this.last) / 1000;
		if (elapsed > 0) {
			this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
			this.last = t;
		}
	}

	tryAcquire(): boolean {
		this.refill();
		if (this.tokens >= 1) {
			this.tokens -= 1;
			return true;
		}
		return false;
	}

	get available(): number {
		this.refill();
		return Math.floor(this.tokens);
	}

	// Time (ms) until at least one token is available.
	msUntilNext(): number {
		this.refill();
		if (this.tokens >= 1) return 0;
		return Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
	}

	async acquire(sleep: (ms: number) => Promise<void> = defaultSleep): Promise<void> {
		while (!this.tryAcquire()) {
			await sleep(Math.max(this.msUntilNext(), 5));
		}
	}
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// 120 requests / minute → capacity 120, refill 2 tokens/sec.
export function schwabRateLimiter(now?: () => number): TokenBucket {
	return new TokenBucket(120, 2, now);
}
