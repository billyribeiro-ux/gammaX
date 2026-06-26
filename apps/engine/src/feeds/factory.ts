import type { MarketFeed } from '@gammax/contracts';
import type { Recorder } from '@gammax/recorder';
import { ReplayFeed } from '@gammax/replay';
import { createSchwabFeed } from '@gammax/schwab';
import type { EngineConfig } from '../config';
import { SyntheticFeed } from './synthetic';

export function createFeed(config: EngineConfig, recorder: Recorder): MarketFeed {
	switch (config.feedSource) {
		case 'synthetic':
			return new SyntheticFeed({ symbols: config.watchlist, intervalMs: config.recomputeMs });
		case 'replay':
			return new ReplayFeed({ recorder, symbols: config.watchlist, realtime: true });
		case 'schwab':
			return createSchwabFeed({
				feed: { pollMs: config.recomputeMs },
				enableStream: process.env.SCHWAB_STREAM === 'true'
			}).feed;
		default: {
			const _exhaustive: never = config.feedSource;
			return _exhaustive;
		}
	}
}
