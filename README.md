# gammaX — S&P 0DTE gamma + IV-velocity research engine (Phase 1)

A forward-only research engine that, during US market hours, computes a live
**combined S&P (SPX + SPY) dealer gamma-exposure surface** and an **IV-velocity
layer**, derives **0DTE-specific signals**, records every input point-in-time,
emits timestamped signals, and **grades them against subsequent price action** —
rendered in a real-time SvelteKit dashboard. A SpotGamma-alike scoped to S&P
0DTE, fused with an IV explosion/implosion detector.

> **Phase 1 is forward evaluation only.** Schwab exposes no historical option
> chains/greeks/OI/IV, so this engine records live snapshots from today onward and
> grades signals as outcomes arrive. A retrospective backtest is Phase 2, gated on
> a paid historical OPRA feed — and is a **feed swap, not a rewrite** (see the
> `MarketFeed` seam).

## Hard constraints

1. **No trading.** The Schwab client is READ-ONLY market data. No orders, no
   account-mutating calls, no trading OAuth scopes — ever.
2. **No backtest in Phase 1.** Forward grading only.
3. **Feed-agnostic core.** `core` never knows if data came from Schwab, a replay
   file, or the synthetic generator.
4. **Point-in-time discipline.** Snapshots are immutable + append-only; the grader
   and replay read strictly `capture_ts <= decisionTs`. No look-ahead.
5. **Single Schwab stream**, ~120 REST req/min — owned solely by `packages/schwab`.
6. **Secrets via env only** — never committed, logged, or printed.

## Architecture

```
packages/
  contracts/  Zod schemas + inferred types + MarketFeed/SnapshotSink/SignalSink + SignalSpec AST
  core/       pure, deterministic math: BS greeks, GEX surface, gamma-flip, IV velocity, signals
  schwab/     read-only Schwab MarketFeed (OAuth, rate-limited REST, LEVELONE_OPTIONS streamer)
  recorder/   point-in-time Drizzle store (Postgres-first + SQLite profile)
  replay/     ReplayFeed — re-emits recorded snapshots (the Phase-2 OPRA seam)
apps/
  engine/     feed → core → recorder → WebSocket broadcast + forward grader (+ SyntheticFeed)
  web/        SvelteKit (Svelte 5 runes) dashboard, subscribes to the engine WS
```

Dependency direction (no cycles): `contracts` ← everything; `core` → only
`contracts`; `schwab`/`replay`/`recorder` → `contracts`; `engine` → all backend;
`web` → `contracts` + engine over WS. `core` is pure/portable (no I/O, no clock
reads) — a Rust port stays viable.

## Quickstart

Requires **Node 24 LTS** (`.nvmrc` pins 24.18.0; `engines.node >= 24.17.0`) and **pnpm**.

```sh
pnpm install
pnpm check          # typecheck + lint + svelte-check + prettier + tests (all green)
```

### Run on synthetic data (zero setup — no DB server, no creds)

```sh
# terminal 1 — engine on a deterministic synthetic feed, SQLite store
FEED_SOURCE=synthetic DB_DRIVER=sqlite SQLITE_PATH=./data/gammax.sqlite \
  ENGINE_SESSION_AWARE=false pnpm --filter @gammax/engine start

# terminal 2 — dashboard (connects to ws://localhost:8787 by default)
pnpm --filter @gammax/web dev
```

Open the dashboard; all six panels render live off the engine WS.

### Run on live Schwab data (read-only)

See [`packages/schwab/README.md`](packages/schwab/README.md) for OAuth setup. Once
a token file exists:

```sh
pnpm --filter @gammax/schwab smoke   # read-only chain snapshot smoke test

FEED_SOURCE=schwab DB_DRIVER=postgres DATABASE_URL=postgres://… \
  pnpm --filter @gammax/engine start
```

### Run on replay (re-grade a recorded session)

```sh
FEED_SOURCE=replay DB_DRIVER=sqlite SQLITE_PATH=./data/gammax.sqlite \
  pnpm --filter @gammax/engine start
```

## Database

Postgres is the default (`DB_DRIVER=postgres`, `DATABASE_URL=…`); a zero-setup
SQLite profile (`DB_DRIVER=sqlite`, `SQLITE_PATH=…`) is built-in. Schema is created
programmatically on start (`ensureSchema`); versioned `drizzle-kit` migrations are
also available (`pnpm --filter @gammax/recorder db:generate:pg|db:generate:sqlite`).

Intraday 0DTE snapshots are large — plan retention/partitioning (e.g. daily
partitions or Timescale) before running long sessions.

## The math (auditable)

All greeks come from the project's own Black–Scholes model (continuous dividend
yield `q`) and are unit-tested against reference values: gamma `e^{−qT}φ(d1)/(Sσ√T)`,
vanna, charm (with the `charm_call − charm_put = q·e^{−qT}` identity check), GEX$ =
`Γ·OI·100·S²·0.01`, SPX↔SPY normalization (SPY strikes ×10; the exact 10× GEX$
relationship), gamma-flip by repricing the whole book across spot, and CM30 IV by
total-variance interpolation (Cboe VIX method). See `packages/core/src/*.test.ts`.

## Configuration

Copy `.env.example` → `.env`. Key vars: `FEED_SOURCE`, `DB_DRIVER`/`DATABASE_URL`/
`SQLITE_PATH`, `ENGINE_WS_PORT`, `ENGINE_RECOMPUTE_MS`, `ENGINE_GRADE_HORIZONS`,
`ENGINE_SESSION_AWARE`, `RISK_FREE_RATE`, `SPX/SPY_DIVIDEND_YIELD`,
`IV_ZSCORE_THRESHOLD`, `PUBLIC_ENGINE_WS_URL`, and the `SCHWAB_*` credentials.

## Phase 1 non-goals

No order placement; no OPRA/Databento historical adapter (the `MarketFeed` seam is
ready); no IV-rank/percentile; no multi-name scan (S&P only); no auth/billing.
