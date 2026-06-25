import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Append-only, point-in-time. Each table keeps the raw domain object as JSON
// (sufficient to recompute) plus normalized columns for indexed queries.
// capture/as_of/ts are epoch-ms integers. Rows are never UPDATEd.

export const chainSnapshots = sqliteTable(
	'chain_snapshots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		underlying: text('underlying').notNull(),
		captureTs: integer('capture_ts').notNull(),
		source: text('source').notNull(),
		spot: real('spot').notNull(),
		raw: text('raw').notNull()
	},
	(t) => [index('cs_underlying_ts').on(t.underlying, t.captureTs)]
);

export const surfaces = sqliteTable(
	'surfaces',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		scope: text('scope').notNull(),
		expiryScope: text('expiry_scope').notNull(),
		asOf: integer('as_of').notNull(),
		spot: real('spot').notNull(),
		netGex: real('net_gex').notNull(),
		regime: text('regime').notNull(),
		raw: text('raw').notNull()
	},
	(t) => [index('surf_scope_ts').on(t.scope, t.expiryScope, t.asOf)]
);

export const ivSamples = sqliteTable(
	'iv_samples',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		underlying: text('underlying').notNull(),
		ts: integer('ts').notNull(),
		atmIv0dte: real('atm_iv_0dte'),
		atmIvCm30: real('atm_iv_cm30'),
		zScore: real('z_score'),
		rocPctPerMin: real('roc_pct_per_min')
	},
	(t) => [index('iv_underlying_ts').on(t.underlying, t.ts)]
);

export const signals = sqliteTable(
	'signals',
	{
		id: text('id').primaryKey(),
		ts: integer('ts').notNull(),
		kind: text('kind').notNull(),
		underlying: text('underlying').notNull(),
		confidence: real('confidence').notNull(),
		raw: text('raw').notNull()
	},
	(t) => [index('sig_ts').on(t.ts)]
);

export const signalOutcomes = sqliteTable(
	'signal_outcomes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		signalId: text('signal_id').notNull(),
		gradedAt: integer('graded_at').notNull(),
		horizonMins: integer('horizon_mins').notNull(),
		result: text('result').notNull(),
		raw: text('raw').notNull()
	},
	(t) => [index('out_signal').on(t.signalId)]
);

// Phase-2 (OPRA) seam — schema present, not written to in Phase 1.
export const tradePrints = sqliteTable(
	'trade_prints',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		symbol: text('symbol').notNull(),
		underlying: text('underlying').notNull(),
		ts: integer('ts').notNull(),
		price: real('price').notNull(),
		size: integer('size').notNull(),
		raw: text('raw').notNull()
	},
	(t) => [index('tp_underlying_ts').on(t.underlying, t.ts)]
);

export const sqliteSchema = {
	chainSnapshots,
	surfaces,
	ivSamples,
	signals,
	signalOutcomes,
	tradePrints
};
