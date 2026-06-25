import type {
	ChainSnapshot,
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
import { Grader } from './grader';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

class CapturingSink implements SignalSink {
	outcomes: SignalOutcome[] = [];
	publishSurface(_s: GammaSurface): void {}
	publishGrid(_g: GammaSurfaceGrid): void {}
	publishIvState(_s: IvState): void {}
	publishSignal(_s: Signal): void {}
	publishOutcome(o: SignalOutcome): void {
		this.outcomes.push(o);
	}
	publishStatus(_s: FeedStatus): void {}
}

function chainAt(ts: number, last: number): ChainSnapshot {
	return {
		captureTs: ts,
		source: 'replay',
		delayed: false,
		underlying: { symbol: 'SPX', last, ts },
		quotes: []
	};
}

function regimeFlip(ts: number): Signal {
	return {
		id: `flip-${ts}`,
		ts,
		underlying: 'SPX',
		confidence: 0.7,
		kind: 'gamma_regime_flip',
		payload: { from: 'positive', to: 'negative', gammaFlip: 5050, spot: 5000 }
	};
}

describe('Grader staleness-aware forward grading', () => {
	it('grades against the realized spot when data exists near the horizon', async () => {
		const recorder = new SqliteRecorder(':memory:');
		await recorder.ensureSchema();
		await recorder.writeChain(chainAt(T0, 5000)); // reference @ signal time
		await recorder.writeChain(chainAt(T0 + 15 * MIN, 5020)); // realized @ horizon (+0.4%)
		const sink = new CapturingSink();
		const grader = new Grader(recorder, sink, [15], 60_000);

		grader.track(regimeFlip(T0));
		const graded = await grader.tick(T0 + 15 * MIN);

		expect(graded).toHaveLength(1);
		expect(graded[0]?.result).toBe('confirmed');
		expect(graded[0]?.detail.priceMovePct).toBeCloseTo(0.4, 6);
		await recorder.close();
	});

	it('abstains (inconclusive) when the nearest spot is far older than the horizon', async () => {
		const recorder = new SqliteRecorder(':memory:');
		await recorder.ensureSchema();
		await recorder.writeChain(chainAt(T0, 5000)); // only sample — then a data gap
		const sink = new CapturingSink();
		const grader = new Grader(recorder, sink, [15], 60_000); // 1-min staleness tolerance

		grader.track(regimeFlip(T0));
		const graded = await grader.tick(T0 + 15 * MIN);

		expect(graded).toHaveLength(1);
		expect(graded[0]?.result).toBe('inconclusive');
		expect(graded[0]?.detail.note).toContain('data gap');
		expect(graded[0]?.detail.priceMovePct).toBe(0);
		await recorder.close();
	});

	it('does not grade before a signal horizon is reached', async () => {
		const recorder = new SqliteRecorder(':memory:');
		await recorder.ensureSchema();
		await recorder.writeChain(chainAt(T0, 5000));
		const sink = new CapturingSink();
		const grader = new Grader(recorder, sink, [15], 60_000);

		grader.track(regimeFlip(T0));
		expect(await grader.tick(T0 + 5 * MIN)).toHaveLength(0); // horizon not yet due
		expect(grader.pendingCount).toBe(1);
		await recorder.close();
	});
});

describe('Recorder.getSpotSampleAtOrBefore', () => {
	it('returns the latest sample at or before a timestamp with its capture ts', async () => {
		const recorder = new SqliteRecorder(':memory:');
		await recorder.ensureSchema();
		await recorder.writeChain(chainAt(T0, 5000));
		await recorder.writeChain(chainAt(T0 + MIN, 5010));

		expect(await recorder.getSpotSampleAtOrBefore('SPX', T0 + MIN + 30_000)).toEqual({
			ts: T0 + MIN,
			spot: 5010
		});
		expect(await recorder.getSpotSampleAtOrBefore('SPX', T0 - 1)).toBeNull();
		expect(await recorder.getSpotAtOrBefore('SPX', T0)).toBe(5000);
		await recorder.close();
	});
});
