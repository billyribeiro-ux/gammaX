# Providing Schwab read-only credentials to gammaX

This guide tells you **exactly which Schwab APIs gammaX uses, what credentials you
must provide, and the step-by-step flow to obtain them** so the engine can capture
real SPX + SPY option-chain snapshots.

gammaX is **read-only market data only**. It never calls a trading or
account-mutating endpoint and never requests a trading OAuth scope. (See the hard
constraints in `CLAUDE.md`.)

> A citation-backed revision (with the official `developer.schwab.com` URLs for
> each step) is being finalized; a few items flagged "⚠️ verifying" below are being
> confirmed against the official docs. The substance here matches gammaX's actual
> implementation in `packages/schwab/`.

---

## 1. Which Schwab APIs we use

Base host for everything: `https://api.schwabapi.com`

| API surface | Endpoints gammaX calls | Purpose | Required? |
| --- | --- | --- | --- |
| **OAuth 2.0** | `/v1/oauth/authorize`, `/v1/oauth/token` | Authenticate; mint & auto-refresh the access token | **Yes** |
| **Market Data Production** | `/marketdata/v1/chains`, `/marketdata/v1/quotes`, `/marketdata/v1/pricehistory` | The data: SPX+SPY option chains with greeks/IV/open-interest, the `$SPX` index quote, SPY OHLC | **Yes — core** |
| **Trader API – userPreference** | `/trader/v1/userPreference` | Read-only connection info for the WebSocket streamer (socket URL + client IDs) | **Optional** — only for live streaming; REST polling works without it |

Exactly what the code requests (`packages/schwab/src/rest.ts`):

- Chains: `GET /marketdata/v1/chains?symbol=$SPX&contractType=ALL&strikeCount=…` and `symbol=SPY`
- Quotes: `GET /marketdata/v1/quotes?symbols=$SPX,SPY`
- The S&P 500 **index** symbol is `$SPX` (leading `$`); SPY is plain `SPY`.

> ⚠️ verifying: `/trader/v1/userPreference` sits under Schwab's "Accounts and
> Trading" product even though it is read-only. So the **WebSocket streamer**
> (500 ms updates) may require adding *both* the Market Data and Accounts &
> Trading products to your app. The **default REST-polling path needs only the
> Market Data Production product.** Recommended: start with Market Data only.

---

## 2. What you ultimately give me

Three secrets:

1. **App Key** — your OAuth `client_id`
2. **App Secret**
3. A **valid refresh token** (the 7-day OAuth refresh token)

With these, the engine runs entirely headless from the server — it refreshes the
30-minute access token itself. The only step that must happen on **your** machine
is the one-time browser login (Step D); this environment is headless and cannot
open Schwab's login page.

---

## 3. Register the app

**Step A — Developer account**

1. Go to **developer.schwab.com** and sign in (create a developer account if
   needed). This is separate from your brokerage login; you connect a brokerage
   account later during authorization.

**Step B — Create the app & add the Market Data product**

2. Create/register a new app (Dashboard → Apps).
3. Add the **"Market Data Production"** API/product. *Do not add a trading product
   unless you specifically want the streamer (see §1).*
4. Set the **Callback URL (redirect URI)** to exactly:

   ```
   https://127.0.0.1:8182/callback
   ```

   This must match gammaX (`SCHWAB_REDIRECT_URI` default). It must be `https`, and
   it must match byte-for-byte at token exchange. If Schwab rejects this value,
   register whatever it accepts and tell me — I'll set `SCHWAB_REDIRECT_URI` to
   match.
5. Submit; the app goes into review.

**Step C — Approval**

6. Wait until the app status is **"Ready For Use"** (minutes up to ~a couple of
   days — entirely on Schwab's side).
7. Open the app and copy the **App Key** and **App Secret**.

You now hold App Key + App Secret. Next get the refresh token.

---

## 4. Get the refresh token (the OAuth flow)

This is the only interactive part. Pick one option.

**Step D — Authorize in your browser (both options start here)**

1. Build the authorize URL (replace `YOUR_APP_KEY`):

   ```
   https://api.schwabapi.com/v1/oauth/authorize?client_id=YOUR_APP_KEY&redirect_uri=https://127.0.0.1:8182/callback&response_type=code
   ```

   (I can generate this exact URL via `SchwabAuth.buildAuthorizeUrl()` once you
   give me the App Key.)
2. Open it, log in with your **Schwab brokerage** credentials, approve the
   account(s).
3. The browser redirects to `https://127.0.0.1:8182/callback?code=...&session=...`.
   **The page will fail to load — expected** (nothing listens on that port). Copy
   the **entire URL** from the address bar.
4. The `code` is URL-encoded and (a Schwab quirk) usually ends in `%40` →
   decodes to `@`. Keep the whole code. **It expires in ~30 seconds**, so be quick.

**Option ① — You exchange it (most robust, recommended)**

5. Immediately run on your machine (fill in App Key, Secret, decoded code):

   ```bash
   curl -X POST https://api.schwabapi.com/v1/oauth/token \
     -H "Authorization: Basic $(printf '%s' 'YOUR_APP_KEY:YOUR_APP_SECRET' | base64)" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'grant_type=authorization_code' \
     -d 'code=PASTE_DECODED_CODE_HERE' \
     -d 'redirect_uri=https://127.0.0.1:8182/callback'
   ```

6. The JSON response contains `refresh_token` (7 days) and `access_token`
   (30 min). **Give me the `refresh_token`** plus App Key + Secret. I never need
   your brokerage password.

**Option ② — I exchange it**

5. Give me App Key + Secret first (I set them as env here), then paste me the full
   redirect URL the instant you get it. I run `SchwabAuth.exchangeCode(code)` here
   to mint and store the tokens. Caveat: the ~30-second code lifetime makes this
   timing-tight over a chat round-trip — Option ① is more reliable.

---

## 5. Token lifetimes (maintenance reality)

- **Access token: ~30 minutes** (`expires_in` ≈ 1800s). Auto-refreshed by gammaX —
  no action from you.
- **Refresh token: 7 days, fixed.** It is **not** extended by refreshing the access
  token. After 7 days the engine fails loudly with a re-authorization instruction
  and you repeat Step D. (`packages/schwab/src/oauth.ts` is built around this
  7-day wall.)

---

## 6. How to hand me the secrets (securely)

Secrets live **only** in env / a gitignored `0600` token file — never logged,
printed, or committed.

Env vars I'll export for the engine:

```
SCHWAB_APP_KEY=...
SCHWAB_APP_SECRET=...
SCHWAB_REDIRECT_URI=https://127.0.0.1:8182/callback   # only if you registered a different one
```

Plus the refresh token. I write the gitignored token file (`./.schwab-tokens.json`)
in the exact shape `TokenStore` expects (`packages/schwab/src/tokens.ts`):

```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "accessExpiresAt": 0,
  "refreshExpiresAt": 0,
  "tokenType": "Bearer"
}
```

If you give me only the refresh token, I do one refresh call here to populate a
fresh access token and correct the expiry timestamps.

---

## 7. What happens once you've provided them

1. I run the **read-only smoke test**:
   `pnpm --filter @gammax/schwab exec tsx src/smoke.ts` — it prints a live SPX+SPY
   chain summary (spot, quote count, delayed flag) and confirms no trading scopes
   were requested.
2. I start the engine against the **schwab** feed (`FEED_SOURCE=schwab`) — it
   captures real `ChainSnapshot`s, builds the live gamma surface + IV layer, and
   the dashboard renders genuine SPX/SPY data.
3. Snapshots are recorded point-in-time for forward signal grading.

Expectations: data may be **15-minute delayed** rather than real-time depending on
your account's market-data entitlement (we surface the delayed flag), and SPX
index option chains are large, so the first pull is the heaviest call.

---

## Summary — what to gather

1. **App Key**
2. **App Secret**
3. A **refresh token** (browser-authorize → code → token-exchange, §4)

That is the entire dependency. Environment connectivity to `api.schwabapi.com` is
already confirmed from the server.
