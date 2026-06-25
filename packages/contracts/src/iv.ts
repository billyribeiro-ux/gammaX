import { z } from 'zod';
import { EpochMillis, UnderlyingSymbol } from './primitives';

// One ATM-IV observation: the 0DTE ATM vol and the constant-maturity 30D vol
// (interpolated in total variance from bracketing expiries — Cboe VIX method).
export const IvSample = z.object({
	ts: EpochMillis,
	atmIv0dte: z.number().nullable(),
	atmIvCm30: z.number().nullable()
});
export type IvSample = z.infer<typeof IvSample>;

// IV-velocity state per underlying. zScore + rocPctPerMin are computed over the
// rolling buffer (`series`). This is velocity, not IV-rank (no 252d history).
export const IvState = z.object({
	underlying: UnderlyingSymbol,
	asOf: EpochMillis,
	atmIv0dte: z.number().nullable(),
	atmIvCm30: z.number().nullable(),
	zScore: z.number().nullable(),
	rocPctPerMin: z.number().nullable(),
	series: z.array(IvSample)
});
export type IvState = z.infer<typeof IvState>;
