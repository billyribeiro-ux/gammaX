import { z } from 'zod';
import { EpochMillis, FeedSource, IsoDate, OptionRight, UnderlyingSymbol } from './primitives';

// Prices and greeks are floats (documented choice — greeks math needs reals).
// Any monetary accounting elsewhere uses integer cents.
export const OptionQuote = z.object({
	symbol: z.string(), // OSI 21-char, e.g. "SPXW  260625C05000000"
	underlying: UnderlyingSymbol,
	root: z.string().optional(), // option root, e.g. "SPXW" / "SPY"
	expiry: IsoDate,
	dte: z.number().int().nonnegative(), // days to expiry at captureTs (0 = 0DTE)
	// Precise settlement instant (epoch ms). Adapters fill it (they know the
	// AM/PM-settle + ET-tz convention); the pure core uses it for sub-day 0DTE
	// time-to-expiry. Falls back to `dte` when absent.
	expiryMillis: EpochMillis.optional(),
	right: OptionRight,
	strike: z.number().positive(),
	bid: z.number().nonnegative(),
	ask: z.number().nonnegative(),
	mid: z.number().nonnegative(),
	last: z.number().nonnegative().optional(),
	volume: z.number().int().nonnegative(),
	openInterest: z.number().int().nonnegative(),
	// Optional vendor-provided analytics. The core may trust these (mode a) or
	// re-solve IV from mid and recompute greeks (mode b, the default) for
	// internal consistency — never mix vendor IV with own greeks.
	iv: z.number().positive().optional(),
	delta: z.number().optional(),
	gamma: z.number().optional(),
	theta: z.number().optional(),
	vega: z.number().optional(),
	rho: z.number().optional()
});
export type OptionQuote = z.infer<typeof OptionQuote>;

export const UnderlyingQuote = z.object({
	symbol: UnderlyingSymbol,
	last: z.number().positive(), // spot / index level (SPX) or ETF mark (SPY)
	mark: z.number().positive().optional(),
	bid: z.number().nonnegative().optional(),
	ask: z.number().nonnegative().optional(),
	ts: EpochMillis
});
export type UnderlyingQuote = z.infer<typeof UnderlyingQuote>;

// Immutable, point-in-time. `captureTs` is the instant the chain was observed.
export const ChainSnapshot = z.object({
	captureTs: EpochMillis,
	underlying: UnderlyingQuote,
	quotes: z.array(OptionQuote),
	source: FeedSource,
	delayed: z.boolean().default(false) // true when entitlement-gated 15-min feed
});
export type ChainSnapshot = z.infer<typeof ChainSnapshot>;

// Phase 2 (OPRA) seam — not captured in Phase 1 (Schwab has no options tape).
export const TradePrint = z.object({
	symbol: z.string(),
	underlying: UnderlyingSymbol,
	price: z.number().nonnegative(),
	size: z.number().int().nonnegative(),
	ts: EpochMillis,
	// Prevailing NBBO at print time, for Lee–Ready style buy/sell classification.
	nbboBid: z.number().nonnegative().optional(),
	nbboAsk: z.number().nonnegative().optional(),
	source: FeedSource
});
export type TradePrint = z.infer<typeof TradePrint>;
