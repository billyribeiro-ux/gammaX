import {
	ChainSnapshot,
	GammaSurface,
	type IvState,
	Signal,
	SignalOutcome
} from '@gammax/contracts';

// Scalar columns extracted for indexed queries; the full domain object is kept
// in the `raw` column (text for SQLite, jsonb for Postgres).

export function chainScalars(s: ChainSnapshot) {
	return {
		underlying: s.underlying.symbol,
		captureTs: s.captureTs,
		source: s.source,
		spot: s.underlying.last
	};
}

export function surfaceScalars(s: GammaSurface) {
	return {
		scope: s.scope,
		expiryScope: s.expiryScope,
		asOf: s.asOf,
		spot: s.spot,
		netGex: s.netGex,
		regime: s.regime
	};
}

export function ivRow(s: IvState) {
	return {
		underlying: s.underlying,
		ts: s.asOf,
		atmIv0dte: s.atmIv0dte,
		atmIvCm30: s.atmIvCm30,
		zScore: s.zScore,
		rocPctPerMin: s.rocPctPerMin
	};
}

export function signalScalars(s: Signal) {
	return { id: s.id, ts: s.ts, kind: s.kind, underlying: s.underlying, confidence: s.confidence };
}

export function outcomeScalars(o: SignalOutcome) {
	return {
		signalId: o.signalId,
		gradedAt: o.gradedAt,
		horizonMins: o.horizonMins,
		result: o.result
	};
}

function asObject(raw: unknown): unknown {
	return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export const parseChain = (raw: unknown): ChainSnapshot => ChainSnapshot.parse(asObject(raw));
export const parseSurface = (raw: unknown): GammaSurface => GammaSurface.parse(asObject(raw));
export const parseSignal = (raw: unknown): Signal => Signal.parse(asObject(raw));
export const parseOutcome = (raw: unknown): SignalOutcome => SignalOutcome.parse(asObject(raw));
