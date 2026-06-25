import type {
	FeedStatus,
	GammaSurface,
	GammaSurfaceGrid,
	IvState,
	Signal,
	SignalOutcome,
	SignalSink
} from '@gammax/contracts';
import { SqliteRecorder } from '@gammax/recorder';
import { describe, expect, it } from 'vitest';
import { EngineConfig } from './config';
import { Engine } from './engine';
import { SyntheticFeed } from './feeds/synthetic';
import { Grader } from './grader';

class CapturingSink implements SignalSink {
	surfaces: GammaSurface[] = [];
	grids: GammaSurfaceGrid[] = [];
	ivStates: IvState[] = [];
	signals: Signal[] = [];
	outcomes: SignalOutcome[] = [];
	statuses: FeedStatus[] = [];
	publishSurface(s: GammaSurface): void {
		this.surfaces.push(s);
	}
	publishGrid(g: GammaSurfaceGrid): void {
		this.grids.push(g);
	}
	publishIvState(s: IvState): void {
		this.ivStates.push(s);
	}
	publishSignal(s: Signal): void {
		this.signals.push(s);
	}
	publishOutcome(o: SignalOutcome): void {
		this.outcomes.push(o);
	}
	publishStatus(s: FeedStatus): void {
		this.statuses.push(s);
	}
}

describe('Engine end-to-end (synthetic → core → recorder → sink)', () => {
	it('persists snapshots, broadcasts surfaces, emits signals, and grades one', async () => {
		const recorder = new SqliteRecorder(':memory:');
		await recorder.ensureSchema();
		const sink = new CapturingSink();
		const config = EngineConfig.parse({
			feedSource: 'synthetic',
			sessionAware: false,
			ivWindow: 5
		});
		const grader = new Grader(recorder, sink, [1]); // 1-minute horizon
		const feed = new SyntheticFeed({
			symbols: ['SPX', 'SPY'],
			startTs: 1_700_000_000_000,
			stepMs: 60_000
		});
		const engine = new Engine({ config, feed, recorder, sink, grader });
		engine.wireFeed();

		for (let i = 0; i < 8; i++) {
			feed.emitTick();
			await engine.recompute();
		}

		const persisted = await recorder.getChainSnapshots('SPX');
		expect(persisted).toHaveLength(8);

		// All scopes + both expiry horizons broadcast.
		expect(sink.surfaces.some((s) => s.scope === 'combined' && s.expiryScope === 'all')).toBe(true);
		expect(sink.surfaces.some((s) => s.scope === 'combined' && s.expiryScope === '0dte')).toBe(
			true
		);
		expect(sink.surfaces.some((s) => s.scope === 'SPX')).toBe(true);
		expect(sink.surfaces.some((s) => s.scope === 'SPY')).toBe(true);
		expect(sink.ivStates.some((s) => s.underlying === 'SPX')).toBe(true);

		// 3D grid has multiple DTE slices; 0DTE surface carries charm.
		const grid = sink.grids.at(-1);
		expect(grid?.slices.length).toBeGreaterThan(1);
		const comb0 = sink.surfaces.findLast((s) => s.scope === 'combined' && s.expiryScope === '0dte');
		expect(comb0?.charmByStrike?.length).toBeGreaterThan(0);

		// At least one signal emitted (pin/pop fires deterministically) and graded.
		expect(sink.signals.length).toBeGreaterThan(0);
		expect(sink.outcomes.length).toBeGreaterThan(0);
		expect(['confirmed', 'rejected', 'partial', 'inconclusive']).toContain(
			sink.outcomes[0]?.result
		);

		await recorder.close();
	});
});
