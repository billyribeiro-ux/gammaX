import {
	ChainSnapshot,
	type FeedStatus,
	type GammaSurface,
	type GammaSurfaceGrid,
	type IvState,
	type Signal,
	type SignalOutcome,
	type SignalSink
} from '@gammax/contracts';
import { SqliteRecorder } from '@gammax/recorder';
import { ReplayFeed } from '@gammax/replay';
import { describe, expect, it } from 'vitest';
import { EngineConfig } from './config';
import { Engine } from './engine';
import sampleSession from './fixtures/sample-session.json';
import { Grader } from './grader';

class CapturingSink implements SignalSink {
	surfaces: GammaSurface[] = [];
	grids: GammaSurfaceGrid[] = [];
	signals: Signal[] = [];
	outcomes: SignalOutcome[] = [];
	publishSurface(s: GammaSurface): void {
		this.surfaces.push(s);
	}
	publishGrid(g: GammaSurfaceGrid): void {
		this.grids.push(g);
	}
	publishIvState(_s: IvState): void {}
	publishSignal(s: Signal): void {
		this.signals.push(s);
	}
	publishOutcome(o: SignalOutcome): void {
		this.outcomes.push(o);
	}
	publishStatus(_s: FeedStatus): void {}
}

// Replays a committed recorded session through the full ReplayFeed → core →
// recorder → grader pipeline — point-in-time, no live data.
describe('recorded-session replay integration', () => {
	it('reconstructs surfaces, emits signals, and forward-grades them', async () => {
		const snapshots = (sampleSession as unknown[]).map((s) => ChainSnapshot.parse(s));
		expect(snapshots.length).toBe(8);

		const source = new SqliteRecorder(':memory:');
		await source.ensureSchema();
		for (const snap of snapshots) await source.writeChain(snap);

		const engineStore = new SqliteRecorder(':memory:');
		await engineStore.ensureSchema();
		const sink = new CapturingSink();
		const config = EngineConfig.parse({ sessionAware: false, ivWindow: 4 });
		const grader = new Grader(engineStore, sink, [1]);
		const feed = new ReplayFeed({ recorder: source, symbols: ['SPX', 'SPY'], step: true });
		const engine = new Engine({ config, feed, recorder: engineStore, sink, grader });

		engine.wireFeed();
		await feed.start();
		while (feed.step()) await engine.recompute();
		await engine.recompute();

		expect(sink.surfaces.some((s) => s.scope === 'combined')).toBe(true);
		expect(sink.grids.at(-1)?.slices.length).toBeGreaterThan(1);
		expect(sink.signals.length).toBeGreaterThan(0);
		expect(sink.outcomes.length).toBeGreaterThan(0);

		await source.close();
		await engineStore.close();
	});
});
