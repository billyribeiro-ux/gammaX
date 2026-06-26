import { Buffer } from 'node:buffer';
import { OAUTH_AUTHORIZE, OAUTH_TOKEN, type SchwabConfig } from './config';
import { type SchwabTokens, type TokenStore } from './tokens';

const ACCESS_TTL_BUFFER_MS = 60_000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface RawTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
}

export class SchwabAuthError extends Error {}
// Thrown when the 7-day refresh token is dead — operator must re-authorize in a
// browser. We never automate around the login wall.
export class ReauthorizationRequired extends SchwabAuthError {}

export class SchwabAuth {
	private cached: SchwabTokens | null = null;

	constructor(
		private readonly config: SchwabConfig,
		private readonly store: TokenStore,
		private readonly fetchImpl: typeof fetch = fetch,
		private readonly now: () => number = () => Date.now()
	) {}

	buildAuthorizeUrl(state?: string): string {
		const u = new URL(OAUTH_AUTHORIZE);
		u.searchParams.set('client_id', this.config.appKey);
		u.searchParams.set('redirect_uri', this.config.redirectUri);
		u.searchParams.set('response_type', 'code');
		if (state) u.searchParams.set('state', state);
		return u.toString();
	}

	private basicAuth(): string {
		return Buffer.from(`${this.config.appKey}:${this.config.appSecret}`).toString('base64');
	}

	async exchangeCode(code: string): Promise<SchwabTokens> {
		const body = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: this.config.redirectUri
		});
		const tokens = await this.tokenRequest(body, REFRESH_TTL_MS);
		await this.store.write(tokens);
		this.cached = tokens;
		return tokens;
	}

	async getAccessToken(): Promise<string> {
		const now = this.now();
		const tokens = this.cached ?? (await this.store.read());
		if (!tokens) {
			throw new ReauthorizationRequired(
				`no Schwab tokens found; authorize in a browser: ${this.buildAuthorizeUrl()}`
			);
		}
		this.cached = tokens;
		if (now < tokens.accessExpiresAt - ACCESS_TTL_BUFFER_MS) return tokens.accessToken;
		if (now >= tokens.refreshExpiresAt) {
			throw new ReauthorizationRequired(
				`Schwab refresh token expired (7-day wall); re-authorize: ${this.buildAuthorizeUrl()}`
			);
		}
		const refreshed = await this.refresh(tokens);
		return refreshed.accessToken;
	}

	private async refresh(prev: SchwabTokens): Promise<SchwabTokens> {
		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: prev.refreshToken
		});
		const tokens = await this.tokenRequest(body);
		await this.store.write(tokens);
		this.cached = tokens;
		return tokens;
	}

	private async tokenRequest(body: URLSearchParams, refreshTtlMs?: number): Promise<SchwabTokens> {
		const res = await this.fetchImpl(OAUTH_TOKEN, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${this.basicAuth()}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body
		});
		if (!res.ok) {
			// Never echo the body — it may carry sensitive material.
			throw new SchwabAuthError(`Schwab token request failed: ${res.status} ${res.statusText}`);
		}
		const json = (await res.json()) as RawTokenResponse;
		const now = this.now();
		const prev = this.cached;
		const refreshToken = json.refresh_token ?? prev?.refreshToken ?? '';
		// Schwab's refresh token has a FIXED 7-day life from initial creation — it is
		// NOT extended by refreshing the access token. So a fresh 7-day window starts
		// only on an explicit new authorization (exchangeCode passes refreshTtlMs); a
		// refresh grant preserves the original wall even if the token value rotates.
		// This never overestimates expiry, so we fail cleanly into ReauthorizationRequired
		// at the true deadline rather than late with an invalid_client error.
		return {
			accessToken: json.access_token,
			refreshToken,
			accessExpiresAt: now + (json.expires_in ?? 1800) * 1000,
			refreshExpiresAt:
				refreshTtlMs != null
					? now + refreshTtlMs
					: (prev?.refreshExpiresAt ?? now + REFRESH_TTL_MS),
			tokenType: json.token_type ?? 'Bearer'
		};
	}
}
