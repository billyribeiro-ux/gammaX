import { UnderlyingSymbol } from '@gammax/contracts';
import { z } from 'zod';

export const EngineConfig = z.object({
	feedSource: z.enum(['schwab', 'replay', 'synthetic']).default('synthetic'),
	wsPort: z.number().int().default(8787),
	recomputeMs: z.number().int().positive().default(1500),
	underlyings: z.array(UnderlyingSymbol).default(['SPX', 'SPY']),
	gradeHorizons: z.array(z.number().int().positive()).default([15, 30, 60]),
	// Max age of the realized spot relative to a signal's horizon before grading is
	// abandoned as inconclusive. Guards against grading across a live data gap where
	// the nearest recorded spot is far older than the horizon. Default 5 min.
	graderMaxStalenessMs: z.number().int().positive().default(300_000),
	rthOpen: z.string().default('09:30'),
	rthClose: z.string().default('16:00'),
	// When false, session/late-session gates are disabled (CI / off-hours demo).
	sessionAware: z.boolean().default(true),
	riskFreeRate: z.number().default(0.043),
	dividendYield: z.record(UnderlyingSymbol, z.number()).default({ SPX: 0, SPY: 0.012 }),
	ivZThreshold: z.number().default(2),
	ivWindow: z.number().int().positive().default(90),
	wallWithinPct: z.number().positive().default(0.2)
});
export type EngineConfig = z.infer<typeof EngineConfig>;

function csvNums(v: string | undefined): number[] | undefined {
	if (!v) return undefined;
	return v
		.split(',')
		.map((x) => Number(x.trim()))
		.filter((n) => Number.isFinite(n));
}

function csv(v: string | undefined): string[] | undefined {
	return v ? v.split(',').map((x) => x.trim()) : undefined;
}

export function loadEngineConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
	return EngineConfig.parse({
		feedSource: env.FEED_SOURCE,
		wsPort: env.ENGINE_WS_PORT ? Number(env.ENGINE_WS_PORT) : undefined,
		recomputeMs: env.ENGINE_RECOMPUTE_MS ? Number(env.ENGINE_RECOMPUTE_MS) : undefined,
		underlyings: csv(env.ENGINE_UNDERLYINGS),
		gradeHorizons: csvNums(env.ENGINE_GRADE_HORIZONS),
		graderMaxStalenessMs: env.ENGINE_GRADE_MAX_STALENESS_MS
			? Number(env.ENGINE_GRADE_MAX_STALENESS_MS)
			: undefined,
		rthOpen: env.ENGINE_RTH_OPEN,
		rthClose: env.ENGINE_RTH_CLOSE,
		sessionAware: env.ENGINE_SESSION_AWARE ? env.ENGINE_SESSION_AWARE !== 'false' : undefined,
		riskFreeRate: env.RISK_FREE_RATE ? Number(env.RISK_FREE_RATE) : undefined,
		dividendYield:
			env.SPX_DIVIDEND_YIELD || env.SPY_DIVIDEND_YIELD
				? { SPX: Number(env.SPX_DIVIDEND_YIELD ?? '0'), SPY: Number(env.SPY_DIVIDEND_YIELD ?? '0') }
				: undefined,
		ivZThreshold: env.IV_ZSCORE_THRESHOLD ? Number(env.IV_ZSCORE_THRESHOLD) : undefined,
		ivWindow: env.IV_ROLLING_WINDOW ? Number(env.IV_ROLLING_WINDOW) : undefined
	});
}
