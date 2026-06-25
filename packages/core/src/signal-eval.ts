import type {
	ComparisonOp,
	GammaRegime,
	GammaSurface,
	IvState,
	Signal,
	SignalEvalContext,
	SignalMetric,
	SignalRule,
	SignalSpec,
	UnderlyingSymbol
} from '@gammax/contracts';
import type { KeyStrike } from './zero-dte';

function clamp01(x: number): number {
	return Math.max(0, Math.min(1, x));
}

function readMetric(ctx: SignalEvalContext, m: SignalMetric): number | null {
	return ctx.metrics[m] ?? null;
}

function compare(a: number, op: ComparisonOp, b: number): boolean {
	switch (op) {
		case '<':
			return a < b;
		case '<=':
			return a <= b;
		case '>':
			return a > b;
		case '>=':
			return a >= b;
		case '==':
			return a === b;
		case '!=':
			return a !== b;
		default: {
			const _exhaustive: never = op;
			return _exhaustive;
		}
	}
}

// Pure, deterministic. A null/unknown metric makes a leaf predicate fail.
export function evaluateSpec(
	spec: SignalSpec,
	ctx: SignalEvalContext,
	history: readonly SignalEvalContext[] = []
): boolean {
	switch (spec.type) {
		case 'cmp': {
			const v = readMetric(ctx, spec.metric);
			return v !== null && compare(v, spec.op, spec.value);
		}
		case 'near': {
			const v = readMetric(ctx, spec.metric);
			const target = typeof spec.target === 'number' ? spec.target : readMetric(ctx, spec.target);
			if (v === null || target === null || target === 0) return false;
			return Math.abs(v - target) / Math.abs(target) <= spec.withinPct / 100;
		}
		case 'available':
			return readMetric(ctx, spec.metric) !== null;
		case 'and':
			return spec.children.every((c) => evaluateSpec(c, ctx, history));
		case 'or':
			return spec.children.some((c) => evaluateSpec(c, ctx, history));
		case 'not':
			return !evaluateSpec(spec.child, ctx, history);
		case 'sequence':
			return evaluateSequence(spec.steps, spec.withinMs, ctx, history);
		default: {
			const _exhaustive: never = spec;
			return _exhaustive;
		}
	}
}

// Greedy in-order match of steps across the chronological timeline (history then
// ctx), with the first→last span bounded by withinMs.
function evaluateSequence(
	steps: readonly SignalSpec[],
	withinMs: number,
	ctx: SignalEvalContext,
	history: readonly SignalEvalContext[]
): boolean {
	const timeline = [...history, ctx];
	let idx = 0;
	let firstTs: number | null = null;
	for (const c of timeline) {
		const step = steps[idx];
		if (!step) break;
		if (evaluateSpec(step, c)) {
			if (idx === 0) firstTs = c.ts;
			idx++;
		}
	}
	return idx >= steps.length && firstTs !== null && ctx.ts - firstTs <= withinMs;
}

export interface BuildContextParams {
	underlying: UnderlyingSymbol;
	ts: number;
	surface: GammaSurface;
	iv: IvState | null;
	flowDelta?: number | null;
}

// Project a combined surface + IV state into the flat metric bag the AST reads.
export function buildEvalContext(params: BuildContextParams): SignalEvalContext {
	const s = params.surface;
	const distToFlipPct = s.gammaFlip !== null ? ((s.spot - s.gammaFlip) / s.spot) * 100 : null;
	const metrics: Record<SignalMetric, number | null> = {
		netGex: s.netGex,
		regimeSign: s.regime === 'positive' ? 1 : -1,
		spot: s.spot,
		callWall: s.callWall,
		putWall: s.putWall,
		gammaFlip: s.gammaFlip,
		volTrigger: s.volTrigger ?? null,
		distToFlipPct,
		ivZScore: params.iv?.zScore ?? null,
		ivRocPctPerMin: params.iv?.rocPctPerMin ?? null,
		atmIv0dte: params.iv?.atmIv0dte ?? null,
		atmIvCm30: params.iv?.atmIvCm30 ?? null,
		flowDelta: params.flowDelta ?? null
	};
	return { underlying: params.underlying, ts: params.ts, metrics };
}

// Confluence rules (the differentiator). `downside_amplify` is the spec's
// canonical default — it includes flowDelta, so it stays dormant in Phase 1
// (no tape) and lights up unchanged once the OPRA feed lands. The others are
// Phase-1-active.
export const DEFAULT_SIGNAL_RULES: SignalRule[] = [
	{
		id: 'downside_amplify',
		emits: 'downside_amplify',
		baseConfidence: 0.8,
		spec: {
			type: 'and',
			children: [
				{ type: 'cmp', metric: 'regimeSign', op: '<', value: 0 },
				{ type: 'cmp', metric: 'ivZScore', op: '>', value: 2 },
				{ type: 'near', metric: 'spot', target: 'putWall', withinPct: 0.5 },
				{ type: 'cmp', metric: 'flowDelta', op: '<', value: 0 }
			]
		}
	},
	{
		id: 'downside_pressure',
		emits: 'downside_pressure',
		baseConfidence: 0.6,
		spec: {
			type: 'and',
			children: [
				{ type: 'cmp', metric: 'regimeSign', op: '<', value: 0 },
				{ type: 'cmp', metric: 'ivZScore', op: '>', value: 2 },
				{ type: 'near', metric: 'spot', target: 'putWall', withinPct: 0.5 }
			]
		}
	},
	{
		id: 'upside_squeeze',
		emits: 'upside_squeeze',
		baseConfidence: 0.55,
		spec: {
			type: 'and',
			children: [
				{ type: 'cmp', metric: 'regimeSign', op: '<', value: 0 },
				{ type: 'near', metric: 'spot', target: 'callWall', withinPct: 0.5 }
			]
		}
	}
];

export function evaluateRules(
	rules: readonly SignalRule[],
	ctx: SignalEvalContext,
	history: readonly SignalEvalContext[] = []
): Signal[] {
	const out: Signal[] = [];
	for (const rule of rules) {
		if (evaluateSpec(rule.spec, ctx, history)) {
			out.push({
				id: `composite:${rule.id}:${ctx.underlying}:${ctx.ts}`,
				ts: ctx.ts,
				underlying: ctx.underlying,
				confidence: rule.baseConfidence,
				kind: 'composite',
				payload: { name: rule.emits, components: [], note: rule.id }
			});
		}
	}
	return out;
}

// ── Primitive detectors (emit specific Signal kinds) ─────────────────────────

export interface IvSignalThresholds {
	zThreshold: number;
}

export function detectIvVelocitySignal(iv: IvState, opts: IvSignalThresholds): Signal | null {
	if (iv.zScore === null || iv.rocPctPerMin === null) return null;
	const atmIv = iv.atmIv0dte ?? iv.atmIvCm30;
	if (atmIv === null) return null;
	const payload = { zScore: iv.zScore, rocPctPerMin: iv.rocPctPerMin, atmIv };
	if (iv.zScore > opts.zThreshold) {
		return {
			id: `iv_explosion:${iv.underlying}:${iv.asOf}`,
			ts: iv.asOf,
			underlying: iv.underlying,
			confidence: clamp01(iv.zScore / (opts.zThreshold * 2)),
			kind: 'iv_explosion',
			payload
		};
	}
	if (iv.zScore < -opts.zThreshold) {
		return {
			id: `iv_implosion:${iv.underlying}:${iv.asOf}`,
			ts: iv.asOf,
			underlying: iv.underlying,
			confidence: clamp01(-iv.zScore / (opts.zThreshold * 2)),
			kind: 'iv_implosion',
			payload
		};
	}
	return null;
}

export function detectRegimeFlip(
	prev: GammaSurface | null,
	curr: GammaSurface,
	underlying: UnderlyingSymbol
): Signal | null {
	if (!prev || prev.regime === curr.regime) return null;
	const from: GammaRegime = prev.regime;
	const to: GammaRegime = curr.regime;
	return {
		id: `gamma_regime_flip:${underlying}:${curr.asOf}`,
		ts: curr.asOf,
		underlying,
		confidence: 0.7,
		kind: 'gamma_regime_flip',
		payload: { from, to, gammaFlip: curr.gammaFlip, spot: curr.spot }
	};
}

export interface WallTestThresholds {
	withinPct: number;
}

export function detectWallTest(
	surface: GammaSurface,
	underlying: UnderlyingSymbol,
	opts: WallTestThresholds
): Signal | null {
	const spot = surface.spot;
	const candidates: { wall: 'call' | 'put'; level: number; distPct: number }[] = [];
	if (surface.callWall !== null) {
		candidates.push({
			wall: 'call',
			level: surface.callWall,
			distPct: (Math.abs(spot - surface.callWall) / spot) * 100
		});
	}
	if (surface.putWall !== null) {
		candidates.push({
			wall: 'put',
			level: surface.putWall,
			distPct: (Math.abs(spot - surface.putWall) / spot) * 100
		});
	}
	const within = candidates
		.filter((c) => c.distPct <= opts.withinPct)
		.sort((a, b) => a.distPct - b.distPct);
	const hit = within[0];
	if (!hit) return null;
	return {
		id: `wall_test:${underlying}:${hit.wall}:${surface.asOf}`,
		ts: surface.asOf,
		underlying,
		confidence: clamp01(1 - hit.distPct / opts.withinPct),
		kind: 'wall_test',
		payload: { wall: hit.wall, level: hit.level, spot, distancePct: hit.distPct }
	};
}

export interface PinPopParams {
	underlying: UnderlyingSymbol;
	asOf: number;
	spot: number;
	key: KeyStrike;
}

// Pin (net dealer gamma ≥ 0 at the dominant 0DTE strike → price gravitates) vs
// pop (< 0 → price repelled). Call only inside the late-session window (the
// engine owns the tz/time check; the pure core just classifies).
export function detectPinPop(params: PinPopParams): Signal {
	const kind = params.key.netGex >= 0 ? 'pin' : 'pop';
	return {
		id: `${kind}:${params.underlying}:${params.asOf}`,
		ts: params.asOf,
		underlying: params.underlying,
		confidence: 0.5,
		kind,
		payload: { strike: params.key.strike, netGexAtStrike: params.key.netGex, spot: params.spot }
	};
}
