import { z } from 'zod';
import { EpochMillis, ExpiryScope, GammaRegime, SurfaceScope } from './primitives';

// Dealer-signed dollar gamma exposure at one strike, per 1% move in spot.
// GEX$ = Γ · OI · 100 · S² · 0.01, with the dealer-sign convention applied
// (default: calls +, puts −). callGex/putGex are already signed; netGex is sum.
export const StrikeGex = z.object({
	strike: z.number().positive(),
	callGex: z.number(),
	putGex: z.number(),
	netGex: z.number()
});
export type StrikeGex = z.infer<typeof StrikeGex>;

// Per-strike dealer charm exposure (−∂Δ/∂T), signed. Surfaces the 0DTE into-
// the-close delta drift.
export const CharmStrike = z.object({
	strike: z.number().positive(),
	charm: z.number()
});
export type CharmStrike = z.infer<typeof CharmStrike>;

// A gamma-exposure surface for one scope (SPX / SPY / combined) and expiry
// horizon (all-expiry / 0DTE). For scope='combined', strikes are on the SPX
// index scale (SPY strikes mapped ×10, dollar-gamma summed in raw dollars).
export const GammaSurface = z.object({
	asOf: EpochMillis,
	scope: SurfaceScope,
	expiryScope: ExpiryScope,
	spot: z.number().positive(),
	byStrike: z.array(StrikeGex),
	netGex: z.number(),
	regime: GammaRegime,
	// Zero-gamma level found by repricing the whole book across spot; null when
	// no sign change exists in the searched range.
	gammaFlip: z.number().nullable(),
	callWall: z.number().nullable(),
	putWall: z.number().nullable(),
	// Documented heuristic estimate (≠ zero-gamma); optional.
	volTrigger: z.number().nullable().optional(),
	// Per-strike charm exposure — populated on 0DTE surfaces only.
	charmByStrike: z.array(CharmStrike).optional()
});
export type GammaSurface = z.infer<typeof GammaSurface>;

// One expiry's strike profile, for the 3D strike × DTE × netGEX surface.
export const ExpirySlice = z.object({
	dte: z.number().int().nonnegative(),
	byStrike: z.array(StrikeGex),
	netGex: z.number()
});
export type ExpirySlice = z.infer<typeof ExpirySlice>;

// The full strike × DTE × netGEX grid for one scope (combined strikes on the
// SPX axis). Drives the 3D surface.
export const GammaSurfaceGrid = z.object({
	asOf: EpochMillis,
	scope: SurfaceScope,
	spot: z.number().positive(),
	slices: z.array(ExpirySlice)
});
export type GammaSurfaceGrid = z.infer<typeof GammaSurfaceGrid>;
