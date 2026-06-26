import { z } from 'zod';
import { EpochMillis, SurfaceScope, UnderlyingSymbol } from './primitives';
import { GammaSurface, GammaSurfaceGrid } from './surface';
import { IvState } from './iv';
import { Signal, SignalOutcome } from './signals';
import { FeedStatus } from './feed';
import { GammaScalpScannerState, IvScannerState } from './scanner';

// The wire protocol between engine and dashboard. Discriminated on `type` so the
// web client can exhaustively switch. Validated with Zod on both ends.
export const EngineMessage = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('hello'),
		serverTs: EpochMillis,
		underlyings: z.array(UnderlyingSymbol),
		scopes: z.array(SurfaceScope)
	}),
	z.object({ type: z.literal('surface'), surface: GammaSurface }),
	z.object({ type: z.literal('grid'), grid: GammaSurfaceGrid }),
	z.object({ type: z.literal('iv'), iv: IvState }),
	z.object({ type: z.literal('signal'), signal: Signal }),
	z.object({ type: z.literal('outcome'), outcome: SignalOutcome }),
	z.object({ type: z.literal('status'), status: FeedStatus }),
	z.object({ type: z.literal('iv_scan'), ivScan: IvScannerState }),
	z.object({ type: z.literal('gamma_scalp'), gammaScalp: GammaScalpScannerState })
]);
export type EngineMessage = z.infer<typeof EngineMessage>;
