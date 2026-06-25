import type {
	ChainSnapshot,
	GammaSurface,
	IvState,
	Signal,
	SignalOutcome,
	UnderlyingSymbol
} from '@gammax/contracts';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { PG_DDL } from './ddl';
import type { ChainQuery, Recorder, SurfaceQuery } from './recorder';
import {
	chainSnapshots,
	ivSamples,
	pgSchema,
	signalOutcomes,
	signals,
	surfaces
} from './schema/pg';
import {
	chainScalars,
	ivRow,
	outcomeScalars,
	parseChain,
	parseSurface,
	signalScalars,
	surfaceScalars
} from './serialize';

export class PgRecorder implements Recorder {
	private readonly client: postgres.Sql;
	private readonly db: PostgresJsDatabase<typeof pgSchema>;

	constructor(connectionString: string) {
		this.client = postgres(connectionString);
		this.db = drizzle(this.client, { schema: pgSchema });
	}

	async ensureSchema(): Promise<void> {
		await this.client.unsafe(PG_DDL);
	}

	async writeChain(s: ChainSnapshot): Promise<void> {
		await this.db.insert(chainSnapshots).values({ ...chainScalars(s), raw: s });
	}

	async writeSurface(s: GammaSurface): Promise<void> {
		await this.db.insert(surfaces).values({ ...surfaceScalars(s), raw: s });
	}

	async writeIvState(s: IvState): Promise<void> {
		await this.db.insert(ivSamples).values(ivRow(s));
	}

	async writeSignal(s: Signal): Promise<void> {
		await this.db.insert(signals).values({ ...signalScalars(s), raw: s });
	}

	async writeOutcome(o: SignalOutcome): Promise<void> {
		await this.db.insert(signalOutcomes).values({ ...outcomeScalars(o), raw: o });
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
		const rows = query.limit != null ? await base.limit(query.limit) : await base;
		return rows.map((r) => parseChain(r.raw));
	}

	async getSpotAtOrBefore(underlying: UnderlyingSymbol, ts: number): Promise<number | null> {
		return (await this.getSpotSampleAtOrBefore(underlying, ts))?.spot ?? null;
	}

	async getSpotSampleAtOrBefore(
		underlying: UnderlyingSymbol,
		ts: number
	): Promise<{ ts: number; spot: number } | null> {
		const rows = await this.db
			.select({ ts: chainSnapshots.captureTs, spot: chainSnapshots.spot })
			.from(chainSnapshots)
			.where(and(eq(chainSnapshots.underlying, underlying), lte(chainSnapshots.captureTs, ts)))
			.orderBy(desc(chainSnapshots.captureTs))
			.limit(1);
		const row = rows[0];
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
		const rows = query.limit != null ? await base.limit(query.limit) : await base;
		return rows.map((r) => parseSurface(r.raw));
	}

	async close(): Promise<void> {
		await this.client.end();
	}
}
