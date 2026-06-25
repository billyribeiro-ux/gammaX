// Self-contained CREATE TABLE IF NOT EXISTS DDL so the store is usable with zero
// migration-file friction (single-operator tool). drizzle-kit migrations are
// also provided (see drizzle.config.ts) for teams that prefer versioned migrations.

export const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS chain_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  underlying TEXT NOT NULL, capture_ts INTEGER NOT NULL, source TEXT NOT NULL,
  spot REAL NOT NULL, raw TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS cs_underlying_ts ON chain_snapshots(underlying, capture_ts);

CREATE TABLE IF NOT EXISTS surfaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL, expiry_scope TEXT NOT NULL, as_of INTEGER NOT NULL,
  spot REAL NOT NULL, net_gex REAL NOT NULL, regime TEXT NOT NULL, raw TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS surf_scope_ts ON surfaces(scope, expiry_scope, as_of);

CREATE TABLE IF NOT EXISTS iv_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  underlying TEXT NOT NULL, ts INTEGER NOT NULL,
  atm_iv_0dte REAL, atm_iv_cm30 REAL, z_score REAL, roc_pct_per_min REAL);
CREATE INDEX IF NOT EXISTS iv_underlying_ts ON iv_samples(underlying, ts);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, kind TEXT NOT NULL,
  underlying TEXT NOT NULL, confidence REAL NOT NULL, raw TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sig_ts ON signals(ts);

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL, graded_at INTEGER NOT NULL, horizon_mins INTEGER NOT NULL,
  result TEXT NOT NULL, raw TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS out_signal ON signal_outcomes(signal_id);

CREATE TABLE IF NOT EXISTS trade_prints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL, underlying TEXT NOT NULL, ts INTEGER NOT NULL,
  price REAL NOT NULL, size INTEGER NOT NULL, raw TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tp_underlying_ts ON trade_prints(underlying, ts);
`;

export const PG_DDL = `
CREATE TABLE IF NOT EXISTS chain_snapshots (
  id SERIAL PRIMARY KEY,
  underlying TEXT NOT NULL, capture_ts BIGINT NOT NULL, source TEXT NOT NULL,
  spot DOUBLE PRECISION NOT NULL, raw JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS cs_underlying_ts ON chain_snapshots(underlying, capture_ts);

CREATE TABLE IF NOT EXISTS surfaces (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL, expiry_scope TEXT NOT NULL, as_of BIGINT NOT NULL,
  spot DOUBLE PRECISION NOT NULL, net_gex DOUBLE PRECISION NOT NULL, regime TEXT NOT NULL, raw JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS surf_scope_ts ON surfaces(scope, expiry_scope, as_of);

CREATE TABLE IF NOT EXISTS iv_samples (
  id SERIAL PRIMARY KEY,
  underlying TEXT NOT NULL, ts BIGINT NOT NULL,
  atm_iv_0dte DOUBLE PRECISION, atm_iv_cm30 DOUBLE PRECISION, z_score DOUBLE PRECISION, roc_pct_per_min DOUBLE PRECISION);
CREATE INDEX IF NOT EXISTS iv_underlying_ts ON iv_samples(underlying, ts);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY, ts BIGINT NOT NULL, kind TEXT NOT NULL,
  underlying TEXT NOT NULL, confidence REAL NOT NULL, raw JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS sig_ts ON signals(ts);

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id SERIAL PRIMARY KEY,
  signal_id TEXT NOT NULL, graded_at BIGINT NOT NULL, horizon_mins INTEGER NOT NULL,
  result TEXT NOT NULL, raw JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS out_signal ON signal_outcomes(signal_id);

CREATE TABLE IF NOT EXISTS trade_prints (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL, underlying TEXT NOT NULL, ts BIGINT NOT NULL,
  price DOUBLE PRECISION NOT NULL, size INTEGER NOT NULL, raw JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS tp_underlying_ts ON trade_prints(underlying, ts);
`;
