import { loadSchwabConfig, type SchwabConfig } from './config';
import { SchwabFeed, type SchwabFeedOptions } from './feed';
import { SchwabAuth } from './oauth';
import { schwabRateLimiter } from './rate-limiter';
import { SchwabRestClient } from './rest';
import { TokenStore } from './tokens';

export interface CreateSchwabFeedOptions {
	config?: SchwabConfig;
	feed?: Omit<SchwabFeedOptions, 'rest'>;
}

export interface SchwabFeedBundle {
	feed: SchwabFeed;
	auth: SchwabAuth;
	rest: SchwabRestClient;
}

// One-call wiring: config → token store → OAuth → rate-limited REST → feed.
export function createSchwabFeed(opts: CreateSchwabFeedOptions = {}): SchwabFeedBundle {
	const config = opts.config ?? loadSchwabConfig();
	const store = new TokenStore(config.tokenFile);
	const auth = new SchwabAuth(config, store);
	const rest = new SchwabRestClient({
		getAccessToken: () => auth.getAccessToken(),
		rateLimiter: schwabRateLimiter()
	});
	const feed = new SchwabFeed({ rest, ...opts.feed });
	return { feed, auth, rest };
}
