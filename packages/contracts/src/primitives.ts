import { z } from 'zod';

// An underlying ticker. The S&P core (SPX cash index + SPY ETF) drives the combined
// gamma surface; the scanner watchlist may add arbitrary tickers, so this is a
// generic symbol rather than a fixed enum.
export const UnderlyingSymbol = z
	.string()
	.regex(/^[A-Z][A-Z0-9.]{0,9}$/, 'expected an uppercase ticker');
export type UnderlyingSymbol = z.infer<typeof UnderlyingSymbol>;

export const OptionRight = z.enum(['C', 'P']);
export type OptionRight = z.infer<typeof OptionRight>;

// Where a snapshot came from. 'synthetic' = deterministic generated chains (CI).
export const FeedSource = z.enum(['schwab', 'replay', 'synthetic']);
export type FeedSource = z.infer<typeof FeedSource>;

// The scope of a gamma surface: a single underlying ticker, or the special
// 'combined' S&P book (SPX + SPY mapped to the SPX index scale — see core
// normalization). A string (not a fixed enum) so watchlist tickers can each have
// their own surface.
export const SurfaceScope = z.string().regex(/^[A-Za-z][A-Za-z0-9.]{0,11}$/, 'expected a scope');
export type SurfaceScope = z.infer<typeof SurfaceScope>;

// The structural (all-expiry) map vs the 0DTE-only sub-surface. Their
// disagreement is itself a signal.
export const ExpiryScope = z.enum(['all', '0dte']);
export type ExpiryScope = z.infer<typeof ExpiryScope>;

// Net dealer gamma regime: positive = vol-dampening, negative = vol-amplifying.
export const GammaRegime = z.enum(['positive', 'negative']);
export type GammaRegime = z.infer<typeof GammaRegime>;

// Epoch milliseconds (UTC). A plain number for cheap arithmetic in the pure core.
export const EpochMillis = z.number().int().nonnegative();
export type EpochMillis = number;

// ISO calendar date 'YYYY-MM-DD' — an option expiration date.
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export type IsoDate = string;
