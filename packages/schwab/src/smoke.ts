import { tryLoadSchwabConfig } from './config';
import { mapChainsResponse } from './mappers';
import { ReauthorizationRequired, SchwabAuth } from './oauth';
import { schwabRateLimiter } from './rate-limiter';
import { SchwabRestClient, schwabRequestSymbol } from './rest';
import { TokenStore } from './tokens';

// Read-only live smoke test (CHECKPOINT 3). Prints a live/delayed SPX+SPY chain
// snapshot summary. Never requests trading scopes; never prints tokens.
async function main(): Promise<void> {
	const cfg = tryLoadSchwabConfig();
	if (!cfg.ok) {
		console.log(`[schwab smoke] ${cfg.error}`);
		console.log('[schwab smoke] set SCHWAB_APP_KEY/SCHWAB_APP_SECRET + a token file to run live.');
		return;
	}
	const store = new TokenStore(cfg.config.tokenFile);
	const auth = new SchwabAuth(cfg.config, store);
	const rest = new SchwabRestClient({
		getAccessToken: () => auth.getAccessToken(),
		rateLimiter: schwabRateLimiter()
	});

	for (const underlying of ['SPX', 'SPY'] as const) {
		try {
			const raw = await rest.getChainsRaw(schwabRequestSymbol(underlying), { strikeCount: 20 });
			const snap = mapChainsResponse(raw, { underlying, captureTs: Date.now() });
			console.log(
				`[schwab smoke] ${underlying}: spot=${snap.underlying.last} quotes=${snap.quotes.length} delayed=${snap.delayed}`
			);
			const sample = snap.quotes
				.slice(0, 4)
				.map((q) => `${q.right}${q.strike}@${q.mid.toFixed(2)}`)
				.join('  ');
			console.log(`  sample: ${sample}`);
		} catch (err) {
			if (err instanceof ReauthorizationRequired) {
				console.log(`[schwab smoke] ${err.message}`);
				return;
			}
			console.log(
				`[schwab smoke] ${underlying} failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}
	console.log('[schwab smoke] READ-ONLY market data only — no trading scopes requested.');
}

void main().catch((err: unknown) => {
	console.error(err);
	process.exitCode = 1;
});
