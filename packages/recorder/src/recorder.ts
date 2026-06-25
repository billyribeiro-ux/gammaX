import type {
	ChainSnapshot,
	GammaSurface,
	SnapshotSink,
	UnderlyingSymbol
} from '@gammax/contracts';

export interface ChainQuery {
	fromTs?: number;
	toTs?: number;
	limit?: number;
}

export interface SurfaceQuery {
	scope?: string;
	expiryScope?: string;
	toTs?: number;
	limit?: number;
}

// Append-only point-in-time store. Reads for the grader/replay are strictly
// bounded by capture timestamp — never look-ahead.
export interface Recorder extends SnapshotSink {
	ensureSchema(): Promise<void>;
	getChainSnapshots(underlying: UnderlyingSymbol, query?: ChainQuery): Promise<ChainSnapshot[]>;
	getSpotAtOrBefore(underlying: UnderlyingSymbol, ts: number): Promise<number | null>;
	// Like getSpotAtOrBefore but also returns the capture timestamp of the sample,
	// so the grader can detect data gaps (a realized spot far older than the horizon).
	getSpotSampleAtOrBefore(
		underlying: UnderlyingSymbol,
		ts: number
	): Promise<{ ts: number; spot: number } | null>;
	getSurfaces(query?: SurfaceQuery): Promise<GammaSurface[]>;
	close(): Promise<void>;
}
