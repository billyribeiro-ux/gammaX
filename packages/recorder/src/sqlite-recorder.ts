import type {
	ChainSnapshot,
	GammaSurface,
	IvState,
	Signal,
	SignalOutcome,
	UnderlyingSymbol
} from '@gammax/contracts';
import Database from 'better-sqlite3';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { SQLITE_DDL } from './ddl';
import type { ChainQuery, Recorder, SurfaceQuery } from './recorder';
import {
	chainSnapshots,
	ivSamples,
	signalOutcomes,
	signals,
	sqliteSchema,
	surfaces
} from './schema/sqlite';
import {
	chainScalars,
	ivRow,
	outcomeScalars,
	parseChain,
	parseSurface,
	signalScalars,
	surfaceScalars
} from './serialize';

export class SqliteRecorder implements Recorder {
	private readonly sqlite: Database.Database;
	private readonly db: BetterSQLite3Database<typeof sqliteSchema>;

	constructor(path = ':memory:') {
		this.sqlite = new Database(path);
		this.db = drizzle(this.sqlite, { schema: sqliteSchema });
	}

	async ensureSchema(): Promise<void> {
		this.sqlite.exec(SQLITE_DDL);
	}

	async writeChain(s: ChainSnapshot): Promise<void> {
		this.db
			.insert(chainSnapshots)
			.values({ ...chainScalars(s), raw: JSON.stringify(s) })
			.run();
	}

	async writeSurface(s: GammaSurface): Promise<void> {
		this.db
			.insert(surfaces)
			.values({ ...surfaceScalars(s), raw: JSON.stringify(s) })
			.run();
	}

	async writeIvState(s: IvState): Promise<void> {
		this.db.insert(ivSamples).values(ivRow(s)).run();
	}

	async writeSignal(s: Signal): Promise<void> {
		this.db
			.insert(signals)
			.values({ ...signalScalars(s), raw: JSON.stringify(s) })
			.run();
	}

	async writeOutcome(o: SignalOutcome): Promise<void> {
		this.db
			.insert(signalOutcomes)
			.values({ ...outcomeScalars(o), raw: JSON.stringify(o) })
			.run();
	}

	async getChainSnapshots(
		underlying: UnderlyingSymbol,
		query: ChainQuery = {}
	): Promise<ChainSnapshot[]> {
		const conds = [eq(chainSnapshots.underlying, underlying)];
		if (query.fromTs != null) conds.push(gte(chainSnapshots.captureTs, query.fromTs));
		if (query.toTs != null) conds.push(lte(chainSnapshots.captureTs, query.toTs));
		const base = this.db
			.select({ raw: chainSnapshots.raw })
			.from(chainSnapshots)
			.where(and(...conds))
			.orderBy(asc(chainSnapshots.captureTs));
		const rows = query.limit != null ? base.limit(query.limit).all() : base.all();
		return rows.map((r) => parseChain(r.raw));
	}

	async getSpotAtOrBefore(underlying: UnderlyingSymbol, ts: number): Promise<number | null> {
		return (await this.getSpotSampleAtOrBefore(underlying, ts))?.spot ?? null;
	}

	async getSpotSampleAtOrBefore(
		underlying: UnderlyingSymbol,
		ts: number
	): Promise<{ ts: number; spot: number } | null> {
		const row = this.db
			.select({ ts: chainSnapshots.captureTs, spot: chainSnapshots.spot })
			.from(chainSnapshots)
			.where(and(eq(chainSnapshots.underlying, underlying), lte(chainSnapshots.captureTs, ts)))
			.orderBy(desc(chainSnapshots.captureTs))
			.limit(1)
			.all()[0];
		return row && row.spot != null ? { ts: row.ts, spot: row.spot } : null;
	}

	async getSurfaces(query: SurfaceQuery = {}): Promise<GammaSurface[]> {
		const conds = [];
		if (query.scope) conds.push(eq(surfaces.scope, query.scope));
		if (query.expiryScope) conds.push(eq(surfaces.expiryScope, query.expiryScope));
		if (query.toTs != null) conds.push(lte(surfaces.asOf, query.toTs));
		const base = this.db
			.select({ raw: surfaces.raw })
			.from(surfaces)
			.where(conds.length ? and(...conds) : undefined)
			.orderBy(asc(surfaces.asOf));
		const rows = query.limit != null ? base.limit(query.limit).all() : base.all();
		return rows.map((r) => parseSurface(r.raw));
	}

	async close(): Promise<void> {
		this.sqlite.close();
	}
}
