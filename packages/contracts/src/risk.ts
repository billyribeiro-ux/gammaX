import { z } from 'zod';

// Black–Scholes model inputs (per underlying).
export const RiskParams = z.object({
	r: z.number(), // risk-free rate (SOFR-based), annualized decimal
	q: z.number(), // continuous dividend yield for the underlying (SPX≈0, SPY>0)
	multiplier: z.number().positive().default(100) // contract multiplier
});
export type RiskParams = z.infer<typeof RiskParams>;

// All greeks from the project's own BS model — the single source of truth.
// delta/gamma per $1 of spot; vega/vanna per 1.00 (100%) vol; charm/theta per
// year. The core documents and unit-tests these conventions.
export const Greeks = z.object({
	delta: z.number(),
	gamma: z.number(),
	vanna: z.number(),
	charm: z.number(),
	theta: z.number(),
	vega: z.number()
});
export type Greeks = z.infer<typeof Greeks>;
