import { z } from 'zod';
import { EpochMillis, GammaRegime, UnderlyingSymbol } from './primitives';

export const SignalKind = z.enum([
	'iv_explosion',
	'iv_implosion',
	'gamma_regime_flip',
	'wall_test',
	'pin',
	'pop',
	'flow_divergence',
	'composite'
]);
export type SignalKind = z.infer<typeof SignalKind>;

const base = {
	id: z.string(),
	ts: EpochMillis,
	underlying: UnderlyingSymbol,
	confidence: z.number().min(0).max(1)
};

const ivPayload = z.object({
	zScore: z.number(),
	rocPctPerMin: z.number(),
	atmIv: z.number()
});

// Discriminated on `kind` — each signal carries a kind-specific payload.
export const Signal = z.discriminatedUnion('kind', [
	z.object({ ...base, kind: z.literal('iv_explosion'), payload: ivPayload }),
	z.object({ ...base, kind: z.literal('iv_implosion'), payload: ivPayload }),
	z.object({
		...base,
		kind: z.literal('gamma_regime_flip'),
		payload: z.object({
			from: GammaRegime,
			to: GammaRegime,
			gammaFlip: z.number().nullable(),
			spot: z.number()
		})
	}),
	z.object({
		...base,
		kind: z.literal('wall_test'),
		payload: z.object({
			wall: z.enum(['call', 'put']),
			level: z.number(),
			spot: z.number(),
			distancePct: z.number()
		})
	}),
	z.object({
		...base,
		kind: z.literal('pin'),
		payload: z.object({ strike: z.number(), netGexAtStrike: z.number(), spot: z.number() })
	}),
	z.object({
		...base,
		kind: z.literal('pop'),
		payload: z.object({ strike: z.number(), netGexAtStrike: z.number(), spot: z.number() })
	}),
	// Phase 2 — needs the signed OPRA tape; no live evaluator fires this in Phase 1.
	z.object({
		...base,
		kind: z.literal('flow_divergence'),
		payload: z.object({ flowDelta: z.number(), note: z.string() })
	}),
	z.object({
		...base,
		kind: z.literal('composite'),
		payload: z.object({
			name: z.string(),
			components: z.array(SignalKind),
			note: z.string().optional()
		})
	})
]);
export type Signal = z.infer<typeof Signal>;

export const SignalResult = z.enum(['confirmed', 'rejected', 'partial', 'inconclusive']);
export type SignalResult = z.infer<typeof SignalResult>;

// Forward-graded label, written after a signal's evaluation horizon elapses.
export const SignalOutcome = z.object({
	signalId: z.string(),
	gradedAt: EpochMillis,
	horizonMins: z.number().int().positive(),
	result: SignalResult,
	detail: z.object({
		note: z.string(),
		referenceSpot: z.number().optional(),
		realizedSpot: z.number().optional(),
		priceMovePct: z.number().optional(),
		ivMovePct: z.number().optional()
	})
});
export type SignalOutcome = z.infer<typeof SignalOutcome>;
