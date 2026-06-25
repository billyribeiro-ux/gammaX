import { z } from 'zod';

// Phase 1 universe: S&P only. SPX (cash index) + SPY (ETF).
export const UnderlyingSymbol = z.enum(['SPX', 'SPY']);
export type UnderlyingSymbol = z.infer<typeof UnderlyingSymbol>;

export const OptionRight = z.enum(['C', 'P']);
export type OptionRight = z.infer<typeof OptionRight>;

// Where a snapshot came from. 'synthetic' = deterministic generated chains (CI).
export const FeedSource = z.enum(['schwab', 'replay', 'synthetic']);
export type FeedSource = z.infer<typeof FeedSource>;

// A gamma surface is computed per book and combined. Combined strikes are on the
// SPX index scale (SPY strikes mapped x10 — see core normalization).
export const SurfaceScope = z.enum(['SPX', 'SPY', 'combined']);
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
