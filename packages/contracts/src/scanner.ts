import { z } from 'zod';
import { EpochMillis, GammaRegime } from './primitives';

// A scanner symbol is a generic ticker — the scanner watchlist is not fixed to the
// SPX/SPY core universe.
export const ScanSymbol = z.string().min(1);
export type ScanSymbol = z.infer<typeof ScanSymbol>;

// ─── IV explosion / implosion scanner ───────────────────────────────────────

export const IvScanState = z.enum(['explosion', 'implosion', 'calm']);
export type IvScanState = z.infer<typeof IvScanState>;

export const IvScanRow = z.object({
	symbol: ScanSymbol,
	asOf: EpochMillis,
	atmIv0dte: z.number().nullable(),
	atmIvCm30: z.number().nullable(),
	zScore: z.number().nullable(),
	rocPctPerMin: z.number().nullable(),
	state: IvScanState,
	// Ranking magnitude — |zScore| (0 when no reading yet).
	score: z.number().nonnegative()
});
export type IvScanRow = z.infer<typeof IvScanRow>;

export const IvScannerState = z.object({
	asOf: EpochMillis,
	zThreshold: z.number(),
	rows: z.array(IvScanRow)
});
export type IvScannerState = z.infer<typeof IvScannerState>;

// ─── Gamma-scalping scanner ──────────────────────────────────────────────────

// Which scalp style the dealer-gamma regime favors. long_gamma = buy options and
// scalp amplified swings (dealers short gamma); short_gamma = sell premium / scalp
// the range (dealers long gamma, price pinned between walls); neutral = no edge.
export const GammaScalpMode = z.enum(['long_gamma', 'short_gamma', 'neutral']);
export type GammaScalpMode = z.infer<typeof GammaScalpMode>;

export const GammaHotStrike = z.object({
	strike: z.number().positive(),
	netGex: z.number(),
	distancePct: z.number() // signed % from spot
});
export type GammaHotStrike = z.infer<typeof GammaHotStrike>;

export const GammaScalpRow = z.object({
	symbol: ScanSymbol,
	asOf: EpochMillis,
	spot: z.number().positive(),
	regime: GammaRegime,
	netGex: z.number(),
	atmIv: z.number().nullable(),
	realizedVol: z.number().nullable(),
	// realizedVol / atmIv — the scalping edge (>1 favors long gamma, <1 favors short).
	rvIvRatio: z.number().nullable(),
	// 1-sigma expected move over the scoring horizon, % of spot.
	expectedMovePct: z.number().nullable(),
	rangeLow: z.number().nullable(),
	rangeHigh: z.number().nullable(),
	gammaFlip: z.number().nullable(),
	flipDistancePct: z.number().nullable(),
	hotStrikes: z.array(GammaHotStrike),
	mode: GammaScalpMode,
	// 0..100 favorability for the chosen mode.
	score: z.number().min(0).max(100)
});
export type GammaScalpRow = z.infer<typeof GammaScalpRow>;

export const GammaScalpScannerState = z.object({
	asOf: EpochMillis,
	rows: z.array(GammaScalpRow)
});
export type GammaScalpScannerState = z.infer<typeof GammaScalpScannerState>;
