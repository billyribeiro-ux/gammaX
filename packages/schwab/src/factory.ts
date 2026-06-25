import { loadSchwabConfig, type SchwabConfig } from './config';
import { SchwabFeed, type SchwabFeedOptions } from './feed';
import { SchwabAuth } from './oauth';
import { schwabRateLimiter } from './rate-limiter';
import { SchwabRestClient } from './rest';
import { SchwabStreamer } from './streamer';
import { TokenStore } from './tokens';

export interface CreateSchwabFeedOptions {
	config?: SchwabConfig;
	feed?: Omit<SchwabFeedOptions, 'rest' | 'streamer'>;
	// Start the LEVELONE_OPTIONS streamer and overlay its quotes onto snapshots.
	enableStream?: boolean;
}

export interface SchwabFeedBundle {
	feed: SchwabFeed;
	auth: SchwabAuth;
	rest: SchwabRestClient;
	streamer?: SchwabStreamer;
}

// One-call wiring: config → token store → OAuth → rate-limited REST (+ optional
// LEVELONE_OPTIONS streamer) → feed.
export function createSchwabFeed(opts: CreateSchwabFeedOptions = {}): SchwabFeedBundle {
	const config = opts.config ?? loadSchwabConfig();
	const store = new TokenStore(config.tokenFile);
	const auth = new SchwabAuth(config, store);
	const rest = new SchwabRestClient({
		getAccessToken: () => auth.getAccessToken(),
		rateLimiter: schwabRateLimiter()
	});
	const streamer = opts.enableStream
		? new SchwabStreamer({
				getUserPreference: () => rest.getUserPreferenceRaw(),
				getAccessToken: () => auth.getAccessToken(),
				qos: config.streamQos
			})
		: undefined;
	const feed = new SchwabFeed({ rest, ...opts.feed, ...(streamer ? { streamer } : {}) });
	return { feed, auth, rest, ...(streamer ? { streamer } : {}) };
}
