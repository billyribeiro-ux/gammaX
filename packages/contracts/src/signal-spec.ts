import { z } from 'zod';
import { EpochMillis, UnderlyingSymbol } from './primitives';

// The metrics a SignalSpec leaf can read from shared state at a decision instant.
// `regimeSign` = +1 (positive gamma) / −1 (negative). `flowDelta` has no source
// in Phase 1 (no tape) and resolves to null, so flow-dependent specs don't fire.
export const SignalMetric = z.enum([
	'netGex',
	'regimeSign',
	'spot',
	'callWall',
	'putWall',
	'gammaFlip',
	'volTrigger',
	'distToFlipPct',
	'ivZScore',
	'ivRocPctPerMin',
	'atmIv0dte',
	'atmIvCm30',
	'flowDelta'
]);
export type SignalMetric = z.infer<typeof SignalMetric>;

export const ComparisonOp = z.enum(['<', '<=', '>', '>=', '==', '!=']);
export type ComparisonOp = z.infer<typeof ComparisonOp>;

// Composable condition AST. Confluence signals (the differentiator) are
// expressed declaratively, not as bespoke code per signal.
export type SignalSpec =
	| { type: 'cmp'; metric: SignalMetric; op: ComparisonOp; value: number }
	| { type: 'near'; metric: SignalMetric; target: SignalMetric | number; withinPct: number }
	| { type: 'available'; metric: SignalMetric }
	| { type: 'and'; children: SignalSpec[] }
	| { type: 'or'; children: SignalSpec[] }
	| { type: 'not'; child: SignalSpec }
	| { type: 'sequence'; withinMs: number; steps: SignalSpec[] };

export const SignalSpec: z.ZodType<SignalSpec> = z.lazy(() =>
	z.union([
		z.object({ type: z.literal('cmp'), metric: SignalMetric, op: ComparisonOp, value: z.number() }),
		z.object({
			type: z.literal('near'),
			metric: SignalMetric,
			target: z.union([SignalMetric, z.number()]),
			withinPct: z.number().positive()
		}),
		z.object({ type: z.literal('available'), metric: SignalMetric }),
		z.object({ type: z.literal('and'), children: z.array(SignalSpec) }),
		z.object({ type: z.literal('or'), children: z.array(SignalSpec) }),
		z.object({ type: z.literal('not'), child: SignalSpec }),
		z.object({
			type: z.literal('sequence'),
			withinMs: z.number().int().positive(),
			steps: z.array(SignalSpec)
		})
	])
);

// A named rule: a SignalSpec plus the signal it emits when the spec is satisfied.
export const SignalRule = z.object({
	id: z.string(),
	emits: z.string(), // composite name / signal label
	spec: SignalSpec,
	baseConfidence: z.number().min(0).max(1).default(0.5)
});
export type SignalRule = z.infer<typeof SignalRule>;

// The shared state a rule set is evaluated against. Every metric is present;
// unknown/unavailable metrics are null (the evaluator treats null as "fails").
export const SignalEvalContext = z.object({
	underlying: UnderlyingSymbol,
	ts: EpochMillis,
	metrics: z.record(SignalMetric, z.number().nullable())
});
export type SignalEvalContext = z.infer<typeof SignalEvalContext>;
