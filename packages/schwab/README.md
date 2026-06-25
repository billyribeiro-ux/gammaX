# @gammax/schwab — read-only Schwab market-data adapter

Implements the `MarketFeed` interface against the Charles Schwab Trader API.
**Market data only — this package never calls a trading/account-mutating endpoint
and never requests a trading OAuth scope.**

## OAuth setup (one-time, manual)

Schwab uses three-legged OAuth 2.0. There is **no way to automate around the
browser login wall** — a human authorizes once, then the refresh token lasts 7
days.

1. Create an app at <https://developer.schwab.com>. Request **Market Data**
   (not Trading). Note the **App Key** and **App Secret**, and set a redirect URI
   (e.g. `https://127.0.0.1:8182/callback`).
2. Put credentials in `.env` (never commit):
   ```sh
   SCHWAB_APP_KEY=…
   SCHWAB_APP_SECRET=…
   SCHWAB_REDIRECT_URI=https://127.0.0.1:8182/callback
   SCHWAB_TOKEN_FILE=./.schwab-tokens.json
   ```
3. Authorize in a browser. Build the URL with `SchwabAuth.buildAuthorizeUrl()`,
   approve, copy the `code` from the redirect, and exchange it once via
   `SchwabAuth.exchangeCode(code)`. This writes the gitignored token file
   (`0600` perms; tokens are never logged).

Token lifecycle (handled automatically once authorized):

- **Access token: 30 min** — auto-refreshed before expiry.
- **Refresh token: 7 days** — when it dies, the adapter throws
  `ReauthorizationRequired` with the authorize URL. Re-run step 3 (a weekly
  human-in-the-loop step).

## Smoke test

```sh
pnpm --filter @gammax/schwab smoke
```

Prints a live (or delayed) SPX + SPY chain snapshot summary. With no credentials
it degrades gracefully and explains what to set. It confirms **read-only, no
trading scopes**.

## Entitlements / delayed data

Real-time options data is gated by your account's market-data agreement. Without
it, quotes are **15-minute delayed**; the snapshot's `delayed` flag surfaces this.
For live SPX/SPXW research you need the real-time options entitlement approved.

## Known Schwab limitations (Phase 1 design accounts for these)

- **No options time-&-sales stream.** `TIMESALE_OPTIONS` is a dead legacy TD
  Ameritrade service. There is no true options tape, so `subscribeTrades` is a
  documented no-op; the `TradePrint` contract + `trade_prints` table remain as the
  **Phase-2 OPRA seam**. Flow-classified dealer sign and `flow_divergence` signals
  are therefore Phase 2.
- **`/pricehistory` does not reliably serve the SPX index** (`$SPX`) — only
  equities/ETFs. Use SPY OHLC ×10 as the index price-history proxy. (The forward
  grader is unaffected — it grades against our own recorded snapshots' spot.)
- **Rate limit** (~120 req/min) is community-observed, not a clean SLA — the
  client uses an adaptive token bucket with 429 backoff.
- **One streaming connection per account.** The `LEVELONE_OPTIONS` streamer
  (`SchwabStreamer`) is the optional low-latency layer; Phase-1 `SchwabFeed` builds
  full point-in-time snapshots by polling REST `chains` (which include greeks/IV/OI).

## What this package exposes

`createSchwabFeed()` wires config → token store → OAuth → rate-limited REST →
`SchwabFeed`. Also exported: `SchwabAuth`, `SchwabRestClient`, `SchwabStreamer`,
`mapChainsResponse`, OSI helpers (`buildOsi`/`parseOsi`), and the `TokenBucket`.
