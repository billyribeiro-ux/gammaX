# Providing Schwab read-only credentials to gammaX

This is the definitive guide to which Schwab APIs gammaX uses, what credentials you
must provide, how to get them, and how to troubleshoot the OAuth login — so the
engine can capture real SPX + SPY option-chain snapshots.

gammaX is **read-only market data only**. It never calls a trading or
account-mutating endpoint and never requests a trading OAuth scope (a hard
constraint in `CLAUDE.md`; confirmed in code — `SchwabAuth.buildAuthorizeUrl()`
sends no `scope` param).

> **Provenance.** OAuth endpoints, token lifetimes, and the Market Data API
> surface are confirmed from Schwab's own API spec and the developer portal. The
> developer portal's _step-by-step_ pages (button labels, statuses) are login-gated
> and un-archived, so those specifics are corroborated from widely-used community
> sources (schwab-py, the "Unofficial Guide") and are marked **(community)**.

---

## 1. Which Schwab APIs we use

Base host: `https://api.schwabapi.com`

| API                             | Endpoints gammaX calls                                                          | Purpose                                                         | Required?                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| **OAuth 2.0**                   | `/v1/oauth/authorize`, `/v1/oauth/token`                                        | Authenticate; auto-refresh the access token                     | **Yes**                                                       |
| **Market Data Production**      | `/marketdata/v1/chains`, `/marketdata/v1/quotes`, `/marketdata/v1/pricehistory` | SPX+SPY chains (greeks/IV/OI), the `$SPX` index quote, SPY OHLC | **Yes — core**                                                |
| **Trader API – userPreference** | `/trader/v1/userPreference`                                                     | Read-only connection info for the optional WebSocket streamer   | **Optional** (REST polling needs only Market Data Production) |

Verified against Schwab's published Market Data spec — our `packages/schwab/src/rest.ts`
targets exactly these paths (`GET /marketdata/v1/chains`, `/quotes`, `/pricehistory`).
**Official support contact: `TraderAPI@Schwab.com`.**

---

## 2. What you give me (the minimal set)

1. **App Key** — your app's OAuth `client_id`
2. **App Secret** — your app's `client_secret`
3. A **valid 7-day refresh token** (or a fresh authorization `code` I exchange here)

You never give me your Schwab brokerage password — that's entered only on Schwab's
own login page. Secrets I receive go **only** into env / a gitignored `0600` token
file (`.schwab-tokens.json`); never logged, printed, or committed.

---

## 3. Register the app

1. **developer.schwab.com** → sign in / create a developer account. **(community)** This
   account is separate from your brokerage account.
2. Create an app and add the **"Market Data Production"** product. Do **not** add
   "Accounts and Trading Production". **(community)**
3. Set the **Callback URL** — both **`https://127.0.0.1`** (what you registered) and
   `https://127.0.0.1:8182/callback` are valid; whatever you register must match
   gammaX's `SCHWAB_REDIRECT_URI` **byte-for-byte**. Rules **(community)**: must be
   `https` (never `http`), host `127.0.0.1` (not `localhost`), optional port > 1024.
   Changing the callback later reprocesses after market hours.
4. Wait for status **"Ready For Use"** (not "Approved - Pending"). **(community)**
5. Copy the **App Key** and **App Secret**.

---

## 4. Get the refresh token (OAuth dance, on YOUR machine)

1. Open the authorize URL (substitute your App Key + your registered callback):
   `https://api.schwabapi.com/v1/oauth/authorize?client_id=YOUR_APP_KEY&redirect_uri=YOUR_CALLBACK&response_type=code`
2. **Log in with your Charles Schwab _brokerage_ credentials** — the schwab.com
   Login ID + password, **not** the developer-portal login. Complete 2FA, approve
   the account(s).
3. The browser redirects to `YOUR_CALLBACK?code=...&session=...` and the page fails
   to load (expected). Copy the entire address-bar URL.
4. The `code` is short-lived (~30s). Either run the `curl` exchange below yourself
   and give me the `refresh_token`, or paste me the redirect URL immediately and I
   exchange it via `SchwabAuth.exchangeCode()`.

```bash
curl -X POST https://api.schwabapi.com/v1/oauth/token \
  -H "Authorization: Basic $(printf '%s' 'YOUR_APP_KEY:YOUR_APP_SECRET' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'grant_type=authorization_code' -d 'code=DECODED_CODE' -d 'redirect_uri=YOUR_CALLBACK'
```

**Token lifetimes:** access token ~30 min (auto-refreshed by gammaX); refresh token
**fixed 7 days from creation** — not extended by refreshing — after which you repeat
this step. Our `oauth.ts` preserves that fixed wall and fails loudly with a re-auth
instruction at expiry.

---

## 5. Troubleshooting the OAuth login

The authorize URL forwards to Schwab's real login page at `sws-gateway.schwab.com`
(verifiable: the authorize endpoint returns a `302` to it). If login fails there:

- **"Invalid login ID or password" — but schwab.com works.** The login form is the
  blocker, not the URL/app/callback (a bad callback gives a _different_ error,
  "We are unable to complete your request", _after_ login). Causes, in order:
  1. **Login ID is not your email** — it's your schwab.com username.
  2. **Use the brokerage login, not the developer-portal login** — they're separate.
  3. **Browser session/autofill conflict** — use a fresh **incognito** window and
     type credentials manually.
  4. **Password characters/length** — the gateway form is pickier than schwab.com;
     reset to a **short, all-alphanumeric** password (no symbols) and retry.
  5. **Account not entitled / ineligible** — if a clean alphanumeric login still
     fails, the account isn't enabled for the API, or its type is ineligible
     (advisor-managed "Schwab Alliance", robo/Intelligent Portfolios, workplace).
     Email **`TraderAPI@Schwab.com`** to enable/verify Trader API access.
- **The Swagger "Try It / Authorize" button on the docs site is a dead end.** Its
  `client_id` is Schwab's _own demo client_, not your app, and it redirects to
  `developer.schwab.com/oauth2-redirect.html` — it cannot mint a token for gammaX.
  Use the authorize URL from §4 with **your** App Key and callback instead.

---

## 6. How to hand me the secrets

```
SCHWAB_APP_KEY=...
SCHWAB_APP_SECRET=...
SCHWAB_REDIRECT_URI=https://127.0.0.1   # must equal your registered callback
SCHWAB_TOKEN_FILE=./.schwab-tokens.json
```

…plus the refresh token. I write the gitignored token file (`TokenStore`,
`packages/schwab/src/tokens.ts`):

```json
{
	"accessToken": "…",
	"refreshToken": "…",
	"accessExpiresAt": 0,
	"refreshExpiresAt": 0,
	"tokenType": "Bearer"
}
```

(Given only a refresh token, I run one refresh to populate a fresh access token and
correct the expiries.)

---

## 7. Then what happens

1. I run the read-only smoke test
   (`pnpm --filter @gammax/schwab exec tsx src/smoke.ts`) — prints a live SPX+SPY
   chain summary and confirms no trading scopes.
2. I start the engine with `FEED_SOURCE=schwab` — real `ChainSnapshot`s, live gamma
   surface + IV layer, dashboard rendering genuine data. (Off-hours, chains return
   the prior session's closing values; the snapshot's `delayed` flag is surfaced.)

---

## Sources

- Schwab Developer Portal — OAuth guide: <https://developer.schwab.com/user-guides/get-started/authenticate-with-oauth>
- Schwab Market Data API spec (support: `TraderAPI@Schwab.com`)
- schwab-py authentication docs: <https://schwab-py.readthedocs.io/en/latest/auth.html>
- The (Unofficial) Guide to Schwab's Trader APIs: <https://medium.com/@carstensavage/the-unofficial-guide-to-charles-schwabs-trader-apis-14c1f5bc1d57>
