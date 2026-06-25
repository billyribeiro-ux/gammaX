import {
	bigint,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	real,
	serial,
	text
} from 'drizzle-orm/pg-core';

// Postgres profile — same logical schema as SQLite. Raw domain objects as jsonb;
// epoch-ms timestamps as bigint. Append-only; rows are never UPDATEd.

export const chainSnapshots = pgTable(
	'chain_snapshots',
	{
		id: serial('id').primaryKey(),
		underlying: text('underlying').notNull(),
		captureTs: bigint('capture_ts', { mode: 'number' }).notNull(),
		source: text('source').notNull(),
		spot: doublePrecision('spot').notNull(),
		raw: jsonb('raw').notNull()
	},
	(t) => [index('cs_underlying_ts').on(t.underlying, t.captureTs)]
);

export const surfaces = pgTable(
	'surfaces',
	{
		id: serial('id').primaryKey(),
		scope: text('scope').notNull(),
		expiryScope: text('expiry_scope').notNull(),
		asOf: bigint('as_of', { mode: 'number' }).notNull(),
		spot: doublePrecision('spot').notNull(),
		netGex: doublePrecision('net_gex').notNull(),
		regime: text('regime').notNull(),
		raw: jsonb('raw').notNull()
	},
	(t) => [index('surf_scope_ts').on(t.scope, t.expiryScope, t.asOf)]
);

export const ivSamples = pgTable(
	'iv_samples',
	{
		id: serial('id').primaryKey(),
		underlying: text('underlying').notNull(),
		ts: bigint('ts', { mode: 'number' }).notNull(),
		atmIv0dte: doublePrecision('atm_iv_0dte'),
		atmIvCm30: doublePrecision('atm_iv_cm30'),
		zScore: doublePrecision('z_score'),
		rocPctPerMin: doublePrecision('roc_pct_per_min')
	},
	(t) => [index('iv_underlying_ts').on(t.underlying, t.ts)]
);

export const signals = pgTable(
	'signals',
	{
		id: text('id').primaryKey(),
		ts: bigint('ts', { mode: 'number' }).notNull(),
		kind: text('kind').notNull(),
		underlying: text('underlying').notNull(),
		confidence: real('confidence').notNull(),
		raw: jsonb('raw').notNull()
	},
	(t) => [index('sig_ts').on(t.ts)]
);

export const signalOutcomes = pgTable(
	'signal_outcomes',
	{
		id: serial('id').primaryKey(),
		signalId: text('signal_id').notNull(),
		gradedAt: bigint('graded_at', { mode: 'number' }).notNull(),
		horizonMins: integer('horizon_mins').notNull(),
		result: text('result').notNull(),
		raw: jsonb('raw').notNull()
	},
	(t) => [index('out_signal').on(t.signalId)]
);

export const tradePrints = pgTable(
	'trade_prints',
	{
		id: serial('id').primaryKey(),
		symbol: text('symbol').notNull(),
		underlying: text('underlying').notNull(),
		ts: bigint('ts', { mode: 'number' }).notNull(),
		price: doublePrecision('price').notNull(),
		size: integer('size').notNull(),
		raw: jsonb('raw').notNull()
	},
	(t) => [index('tp_underlying_ts').on(t.underlying, t.ts)]
);

export const pgSchema = {
	chainSnapshots,
	surfaces,
	ivSamples,
	signals,
	signalOutcomes,
	tradePrints
};
