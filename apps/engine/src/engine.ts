import type {
	ChainSnapshot,
	GammaSurface,
	IvSample,
	IvState,
	MarketFeed,
	RiskParams,
	Signal,
	SignalSink,
	UnderlyingSymbol
} from '@gammax/contracts';
import {
	atmIv0dte,
	atmIvByExpiry,
	atmIvCm30,
	buildEvalContext,
	buildSurface,
	combineBooks,
	DEFAULT_SIGNAL_RULES,
	detectIvVelocitySignal,
	detectPinPop,
	detectRegimeFlip,
	detectWallTest,
	evaluateRules,
	filterZeroDte,
	findKeyStrike,
	ivVelocity,
	priceBook
} from '@gammax/core';
import type { Recorder } from '@gammax/recorder';
import type { EngineConfig } from './config';
import type { Grader } from './grader';
import { isLateSession, isRth } from './session';

export interface EngineDeps {
	config: EngineConfig;
	feed: MarketFeed;
	recorder: Recorder;
	sink: SignalSink;
	grader: Grader;
	now?: () => number;
}

function logError(scope: string, err: unknown): void {
	console.error(`[engine] ${scope}:`, err instanceof Error ? err.message : err);
}

export class Engine {
	private readonly config: EngineConfig;
	private readonly feed: MarketFeed;
	private readonly recorder: Recorder;
	private readonly sink: SignalSink;
	private readonly grader: Grader;
	private readonly latest = new Map<UnderlyingSymbol, ChainSnapshot>();
	private readonly ivBuffers = new Map<UnderlyingSymbol, IvSample[]>();
	private readonly ivStates = new Map<UnderlyingSymbol, IvState>();
	private readonly prevSurfaces = new Map<string, GammaSurface>();
	private activeKeys = new Set<string>();
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(deps: EngineDeps) {
		this.config = deps.config;
		this.feed = deps.feed;
		this.recorder = deps.recorder;
		this.sink = deps.sink;
		this.grader = deps.grader;
	}

	wireFeed(): void {
		this.feed.subscribeChains(this.config.underlyings, (snap) => this.onChain(snap));
		this.feed.onStatus((status) => this.sink.publishStatus(status));
		this.feed.onError((err) => logError(`feed (${err.fatal ? 'fatal' : 'warn'})`, err.message));
	}

	async start(): Promise<void> {
		this.wireFeed();
		await this.feed.start();
		this.timer = setInterval(
			() => void this.recompute().catch((e) => logError('recompute', e)),
			this.config.recomputeMs
		);
	}

	async stop(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		await this.feed.stop();
	}

	private onChain(snap: ChainSnapshot): void {
		this.latest.set(snap.underlying.symbol, snap);
		void this.recorder.writeChain(snap).catch((e) => logError('writeChain', e));
	}

	private riskParams(u: UnderlyingSymbol): RiskParams {
		return { r: this.config.riskFreeRate, q: this.config.dividendYield[u] ?? 0, multiplier: 100 };
	}

	private persistSurface(surface: GammaSurface): void {
		this.sink.publishSurface(surface);
		void this.recorder.writeSurface(surface).catch((e) => logError('writeSurface', e));
	}

	async recompute(): Promise<void> {
		const tsValues = [...this.latest.values()].map((s) => s.captureTs);
		if (tsValues.length === 0) return;
		const ts = Math.max(...tsValues);
		const rth = !this.config.sessionAware || isRth(ts, this.config.rthOpen, this.config.rthClose);
		const late = !this.config.sessionAware || isLateSession(ts);
		const candidates: { key: string; signal: Signal }[] = [];

		for (const u of this.config.underlyings) {
			const snap = this.latest.get(u);
			if (!snap) continue;
			const rp = this.riskParams(u);
			const surfAll = buildSurface(
				{
					scope: u,
					expiryScope: 'all',
					asOf: ts,
					axisSpot: snap.underlying.last,
					book: priceBook(snap, { riskParams: rp })
				},
				{ computeVolTrigger: true }
			);
			const surf0 = buildSurface(
				{
					scope: u,
					expiryScope: '0dte',
					asOf: ts,
					axisSpot: snap.underlying.last,
					book: priceBook(filterZeroDte(snap), { riskParams: rp })
				},
				{ computeVolTrigger: true }
			);
			this.persistSurface(surfAll);
			this.persistSurface(surf0);

			const expiryIvs = atmIvByExpiry(snap, rp);
			const buf = this.ivBuffers.get(u) ?? [];
			buf.push({ ts, atmIv0dte: atmIv0dte(expiryIvs), atmIvCm30: atmIvCm30(expiryIvs) });
			const trimmed = buf.slice(-Math.max(this.config.ivWindow * 2, 240));
			this.ivBuffers.set(u, trimmed);
			const vel = ivVelocity(trimmed, this.config.ivWindow);
			const ivState: IvState = {
				underlying: u,
				asOf: ts,
				atmIv0dte: trimmed[trimmed.length - 1]?.atmIv0dte ?? null,
				atmIvCm30: trimmed[trimmed.length - 1]?.atmIvCm30 ?? null,
				zScore: vel.zScore,
				rocPctPerMin: vel.rocPctPerMin,
				series: trimmed.slice(-120)
			};
			this.ivStates.set(u, ivState);
			this.sink.publishIvState(ivState);
			void this.recorder.writeIvState(ivState).catch((e) => logError('writeIvState', e));
			const ivSig = detectIvVelocitySignal(ivState, { zThreshold: this.config.ivZThreshold });
			if (ivSig && rth) candidates.push({ key: `${ivSig.kind}:${u}`, signal: ivSig });
		}

		const spx = this.latest.get('SPX');
		const spy = this.latest.get('SPY');
		if (spx && spy) {
			const axisSpot = spx.underlying.last;
			const combinedBook = combineBooks(
				priceBook(spx, { riskParams: this.riskParams('SPX'), strikeScale: 1 }),
				priceBook(spy, { riskParams: this.riskParams('SPY'), strikeScale: 10 })
			);
			const combined0 = combineBooks(
				priceBook(filterZeroDte(spx), { riskParams: this.riskParams('SPX'), strikeScale: 1 }),
				priceBook(filterZeroDte(spy), { riskParams: this.riskParams('SPY'), strikeScale: 10 })
			);
			const combAll = buildSurface(
				{ scope: 'combined', expiryScope: 'all', asOf: ts, axisSpot, book: combinedBook },
				{ computeVolTrigger: true }
			);
			const comb0 = buildSurface(
				{ scope: 'combined', expiryScope: '0dte', asOf: ts, axisSpot, book: combined0 },
				{ computeVolTrigger: true }
			);
			this.persistSurface(combAll);
			this.persistSurface(comb0);

			const flip = detectRegimeFlip(this.prevSurfaces.get('combined:all') ?? null, combAll, 'SPX');
			if (flip && rth) candidates.push({ key: `regime:SPX:${combAll.regime}`, signal: flip });
			const wall = detectWallTest(combAll, 'SPX', { withinPct: this.config.wallWithinPct });
			if (wall && wall.kind === 'wall_test' && rth)
				candidates.push({ key: `wall:SPX:${wall.payload.wall}`, signal: wall });
			if (late) {
				const key = findKeyStrike(combined0, axisSpot);
				if (key)
					candidates.push({
						key: 'pinpop:SPX',
						signal: detectPinPop({ underlying: 'SPX', asOf: ts, spot: axisSpot, key })
					});
			}
			const ctx = buildEvalContext({
				underlying: 'SPX',
				ts,
				surface: combAll,
				iv: this.ivStates.get('SPX') ?? null
			});
			if (rth) {
				for (const c of evaluateRules(DEFAULT_SIGNAL_RULES, ctx)) {
					candidates.push({
						key: `composite:SPX:${c.kind === 'composite' ? c.payload.name : ''}`,
						signal: c
					});
				}
			}
			this.prevSurfaces.set('combined:all', combAll);
		}

		const currentKeys = new Set(candidates.map((c) => c.key));
		for (const c of candidates) {
			if (!this.activeKeys.has(c.key)) this.emitSignal(c.signal);
		}
		this.activeKeys = currentKeys;

		await this.grader.tick(ts);
	}

	private emitSignal(signal: Signal): void {
		this.sink.publishSignal(signal);
		void this.recorder.writeSignal(signal).catch((e) => logError('writeSignal', e));
		this.grader.track(signal);
	}
}
