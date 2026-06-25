import { z } from 'zod';
import { EpochMillis, FeedSource, type UnderlyingSymbol } from './primitives';
import type { ChainSnapshot, TradePrint } from './quotes';
import type { GammaSurface } from './surface';
import type { IvState } from './iv';
import type { Signal, SignalOutcome } from './signals';

// Health/lifecycle snapshot a feed emits; also broadcast to the dashboard.
export const FeedStatus = z.object({
	source: FeedSource,
	connected: z.boolean(),
	delayed: z.boolean(),
	lastUpdateTs: EpochMillis.nullable(),
	symbolsSubscribed: z.number().int().nonnegative(),
	rateRemaining: z.number().int().nonnegative().nullable().optional(),
	detail: z.string().optional()
});
export type FeedStatus = z.infer<typeof FeedStatus>;

export interface FeedError {
	message: string;
	fatal: boolean;
	cause?: unknown;
}

export type ChainListener = (snapshot: ChainSnapshot) => void;
export type TradeListener = (print: TradePrint) => void;
export type StatusListener = (status: FeedStatus) => void;
export type ErrorListener = (error: FeedError) => void;

// One interface, two+ implementations (schwab / replay / synthetic). The core
// never knows which. Phase 2 OPRA plugs in here unchanged.
export interface MarketFeed {
	readonly source: FeedSource;
	start(): Promise<void>;
	stop(): Promise<void>;
	subscribeChains(symbols: readonly UnderlyingSymbol[], listener: ChainListener): void;
	// Phase 1: schwab's implementation is a documented no-op (no options tape).
	subscribeTrades(symbols: readonly UnderlyingSymbol[], listener: TradeListener): void;
	onStatus(listener: StatusListener): void;
	onError(listener: ErrorListener): void;
}

// Append-only, point-in-time persistence. Implementations never UPDATE rows.
export interface SnapshotSink {
	writeChain(snapshot: ChainSnapshot): Promise<void>;
	writeSurface(surface: GammaSurface): Promise<void>;
	writeIvState(state: IvState): Promise<void>;
	writeSignal(signal: Signal): Promise<void>;
	writeOutcome(outcome: SignalOutcome): Promise<void>;
}

// Push channel the dashboard subscribes to (engine WS).
export interface SignalSink {
	publishSurface(surface: GammaSurface): void;
	publishIvState(state: IvState): void;
	publishSignal(signal: Signal): void;
	publishOutcome(outcome: SignalOutcome): void;
	publishStatus(status: FeedStatus): void;
}
