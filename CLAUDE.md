# gammaX — engineering principles

**Mission:** a forward-only research engine that computes a live combined S&P
(SPX+SPY) dealer gamma surface + IV-velocity layer, derives 0DTE signals,
records every input point-in-time, and grades signals against later price action
— rendered in a real-time SvelteKit dashboard. SpotGamma-alike, scoped to S&P
0DTE, fused with an IV explosion/implosion detector.

## Hard constraints (do not engineer around)

1. **No trading.** Schwab client is READ-ONLY market data. Never call an
   order/account-mutating endpoint or request a trading OAuth scope.
2. **No backtest in Phase 1.** Forward evaluation only — grade as outcomes arrive.
   (Schwab exposes no historical option chains/greeks/OI/IV.)
3. **Feed-agnostic core.** `core` never knows if data came from Schwab live or a
   replay file. `schwab`/`replay` are two implementations of one `MarketFeed`.
   Phase 2 (OPRA/Databento) is a feed swap, not a rewrite.
4. **Point-in-time discipline.** Snapshots are immutable + append-only, tagged
   with capture timestamp. Replay/grading read strictly `capture_ts <= decisionTs`.
   No look-ahead leakage — it invalidates the whole study.
5. **Single Schwab stream.** One WebSocket per account, ~120 REST req/min. The
   `schwab` layer is the sole owner of the connection and the shared rate budget.
6. **Secrets via env only.** App Key/Secret + OAuth tokens live in `.env` / a
   gitignored token file. Never hardcode, log, print, or commit credentials.

## Architecture rules

- **Dependency direction (no cycles):** `contracts` ← everything; `core` → only
  `contracts`; `schwab`/`replay`/`recorder` → `contracts`; `engine` → all backend
  packages; `web` → `contracts` (types only) + engine over WS.
- **`core` is pure and portable.** No Node APIs, no I/O, no clock reads inside
  computation — pass timestamps in. Keeps a Rust port viable.
- Side effects only at the edges (`schwab`, `recorder`, `engine`, `web`).
- `contracts` is the single source of truth: Zod schemas, TS types inferred from
  them.

## Code standards

- TypeScript strict; no `any`; no non-null `!` without a justifying comment;
  exhaustive `switch` with `never` guards; discriminated unions for `Signal.kind`
  and feed events.
- Greeks are floats (documented); any money is integer cents.
- Minimal comments — names carry meaning. Exception: the math (greeks / GEX /
  SPX↔SPY normalization / gamma-flip) gets documenting comments + worked examples.
- No dead code, no placeholder stubs.
- Conventional commits; stage specific files (never `git add .`); new commits
  only (never `--amend` after a hook failure).

## Frontend

- **Svelte 5 runes only** (`$state`/`$derived`/`$effect`/`$props`). No legacy
  stores syntax. Shared reactive state via `.svelte.ts` runes modules.
- **Use the Svelte MCP**: confirm patterns via `get-documentation`; run
  `svelte-autofixer` on every component until clean.
- **Phosphor icons only — never Lucide.**

## Before declaring done

Run `pnpm check` (typecheck + lint + svelte-check + prettier + tests) — all green.

## Environment note

Node 24 LTS required (`.nvmrc` = 24.18.0; `engines.node >= 24.17.0`,
`engine-strict`). Node 24 does NOT ship Temporal — use `temporal-polyfill` for
tz/DST.

## pnpm only

No npm/yarn lockfiles. `pnpm` for everything.
