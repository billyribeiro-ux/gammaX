import { MARKETDATA_BASE, USER_PREFERENCE } from './config';
import type { TokenBucket } from './rate-limiter';

export interface RestDeps {
	getAccessToken: () => Promise<string>;
	rateLimiter: TokenBucket;
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
}

export interface ChainParams {
	contractType?: 'CALL' | 'PUT' | 'ALL';
	strikeCount?: number;
	fromDate?: string; // YYYY-MM-DD
	toDate?: string; // YYYY-MM-DD
	range?: string; // e.g. 'ALL' | 'NTM'
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Low-level READ-ONLY market-data client. Every request passes through the
// shared rate limiter and a fresh access token; honors 429 backoff.
export class SchwabRestClient {
	private readonly fetchImpl: typeof fetch;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(private readonly deps: RestDeps) {
		this.fetchImpl = deps.fetchImpl ?? fetch;
		this.sleep = deps.sleep ?? defaultSleep;
	}

	private async request(url: URL, attempt = 0): Promise<Response> {
		await this.deps.rateLimiter.acquire(this.sleep);
		const token = await this.deps.getAccessToken();
		const res = await this.fetchImpl(url, {
			method: 'GET',
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
		});
		if (res.status === 429 && attempt < 3) {
			const retryAfter = Number(res.headers.get('Retry-After')) || 1;
			await this.sleep(retryAfter * 1000 * (attempt + 1));
			return this.request(url, attempt + 1);
		}
		if (!res.ok) {
			throw new Error(`Schwab GET ${url.pathname} failed: ${res.status} ${res.statusText}`);
		}
		return res;
	}

	async getChainsRaw(symbol: string, params: ChainParams = {}): Promise<unknown> {
		const u = new URL(`${MARKETDATA_BASE}/chains`);
		u.searchParams.set('symbol', symbol);
		u.searchParams.set('contractType', params.contractType ?? 'ALL');
		if (params.strikeCount != null) u.searchParams.set('strikeCount', String(params.strikeCount));
		if (params.range) u.searchParams.set('range', params.range);
		if (params.fromDate) u.searchParams.set('fromDate', params.fromDate);
		if (params.toDate) u.searchParams.set('toDate', params.toDate);
		const res = await this.request(u);
		return res.json();
	}

	async getQuotesRaw(symbols: readonly string[]): Promise<unknown> {
		const u = new URL(`${MARKETDATA_BASE}/quotes`);
		u.searchParams.set('symbols', symbols.join(','));
		const res = await this.request(u);
		return res.json();
	}

	async getPriceHistoryRaw(
		symbol: string,
		params: Record<string, string | number> = {}
	): Promise<unknown> {
		const u = new URL(`${MARKETDATA_BASE}/pricehistory`);
		u.searchParams.set('symbol', symbol);
		for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
		const res = await this.request(u);
		return res.json();
	}

	// Read-only connection metadata for the streamer (no trading scope).
	async getUserPreferenceRaw(): Promise<unknown> {
		await this.deps.rateLimiter.acquire(this.sleep);
		const token = await this.deps.getAccessToken();
		const res = await this.fetchImpl(new URL(USER_PREFERENCE), {
			method: 'GET',
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
		});
		if (!res.ok) throw new Error(`Schwab userPreference failed: ${res.status} ${res.statusText}`);
		return res.json();
	}
}

// Maps our underlying symbol to Schwab's request symbol. The S&P cash index is
// quoted as `$SPX`; every other ticker (SPY ETF, equities) is requested as-is.
export function schwabRequestSymbol(underlying: string): string {
	return underlying === 'SPX' ? '$SPX' : underlying;
}
