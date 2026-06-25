import type { Signal, SignalOutcome, SignalResult, SignalSink } from '@gammax/contracts';
import type { Recorder } from '@gammax/recorder';

interface Pending {
	signal: Signal;
	horizonMins: number;
	dueTs: number;
}

// Forward outcome labeler. For each emitted signal, waits its horizon(s) in DATA
// time, then grades against the recorded subsequent spot. Never peeks past the
// horizon (reads are bounded by dueTs); works identically for live and replay.
export class Grader {
	private pending: Pending[] = [];

	constructor(
		private readonly recorder: Recorder,
		private readonly sink: SignalSink,
		private readonly horizons: number[]
	) {}

	track(signal: Signal): void {
		for (const h of this.horizons) {
			this.pending.push({ signal, horizonMins: h, dueTs: signal.ts + h * 60_000 });
		}
	}

	get pendingCount(): number {
		return this.pending.length;
	}

	async tick(currentDataTs: number): Promise<SignalOutcome[]> {
		const due = this.pending.filter((p) => p.dueTs <= currentDataTs);
		if (due.length === 0) return [];
		this.pending = this.pending.filter((p) => p.dueTs > currentDataTs);
		const graded: SignalOutcome[] = [];
		for (const p of due) {
			const ref = await this.recorder.getSpotAtOrBefore(p.signal.underlying, p.signal.ts);
			const realized = await this.recorder.getSpotAtOrBefore(p.signal.underlying, p.dueTs);
			const outcome = gradeOutcome(p.signal, p.horizonMins, p.dueTs, ref, realized);
			await this.recorder.writeOutcome(outcome);
			this.sink.publishOutcome(outcome);
			graded.push(outcome);
		}
		return graded;
	}
}

function gradeOutcome(
	signal: Signal,
	horizonMins: number,
	gradedAt: number,
	ref: number | null,
	realized: number | null
): SignalOutcome {
	const movePct = ref != null && realized != null && ref !== 0 ? ((realized - ref) / ref) * 100 : 0;
	let result: SignalResult;
	let note: string;
	switch (signal.kind) {
		case 'wall_test': {
			const p = signal.payload;
			const hold =
				realized == null
					? false
					: p.wall === 'call'
						? realized <= p.level * 1.001
						: realized >= p.level * 0.999;
			result = hold ? 'confirmed' : 'rejected';
			note = `${p.wall} wall ${hold ? 'held' : 'broke'}`;
			break;
		}
		case 'pin': {
			const p = signal.payload;
			const within = realized != null && (Math.abs(realized - p.strike) / p.strike) * 100 <= 0.25;
			result = within ? 'confirmed' : 'rejected';
			note = `pin ${within ? 'held' : 'missed'} @${p.strike}`;
			break;
		}
		case 'pop': {
			const p = signal.payload;
			const away = realized != null && (Math.abs(realized - p.strike) / p.strike) * 100 >= 0.25;
			result = away ? 'confirmed' : 'rejected';
			note = `pop ${away ? 'confirmed' : 'failed'} @${p.strike}`;
			break;
		}
		case 'iv_explosion':
		case 'iv_implosion':
		case 'gamma_regime_flip': {
			result = Math.abs(movePct) >= 0.3 ? 'confirmed' : 'inconclusive';
			note = `subsequent move ${movePct.toFixed(2)}%`;
			break;
		}
		case 'composite': {
			const name = signal.payload.name;
			if (name.startsWith('downside')) result = movePct <= -0.3 ? 'confirmed' : 'rejected';
			else if (name.startsWith('upside')) result = movePct >= 0.3 ? 'confirmed' : 'rejected';
			else result = 'inconclusive';
			note = `${name} move ${movePct.toFixed(2)}%`;
			break;
		}
		case 'flow_divergence': {
			result = 'inconclusive';
			note = 'flow unavailable (Phase 2)';
			break;
		}
		default: {
			const _exhaustive: never = signal;
			return _exhaustive;
		}
	}
	return {
		signalId: signal.id,
		gradedAt,
		horizonMins,
		result,
		detail: {
			note,
			referenceSpot: ref ?? undefined,
			realizedSpot: realized ?? undefined,
			priceMovePct: movePct
		}
	};
}
