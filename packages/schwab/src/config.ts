import { z } from 'zod';

export const SchwabConfig = z.object({
	appKey: z.string().min(1),
	appSecret: z.string().min(1),
	redirectUri: z.string().url(),
	tokenFile: z.string().min(1),
	// Streamer QoS: 0=Express(500ms) 1=RealTime(750) 2=Fast(1000) … 5=Delayed(5000)
	streamQos: z.number().int().min(0).max(5).default(0)
});
export type SchwabConfig = z.infer<typeof SchwabConfig>;

export const SCHWAB_BASE = 'https://api.schwabapi.com';
export const MARKETDATA_BASE = `${SCHWAB_BASE}/marketdata/v1`;
export const OAUTH_AUTHORIZE = `${SCHWAB_BASE}/v1/oauth/authorize`;
export const OAUTH_TOKEN = `${SCHWAB_BASE}/v1/oauth/token`;
export const USER_PREFERENCE = `${SCHWAB_BASE}/trader/v1/userPreference`; // read-only conn info

function read(env: NodeJS.ProcessEnv): unknown {
	return {
		appKey: env.SCHWAB_APP_KEY,
		appSecret: env.SCHWAB_APP_SECRET,
		redirectUri: env.SCHWAB_REDIRECT_URI ?? 'https://127.0.0.1:8182/callback',
		tokenFile: env.SCHWAB_TOKEN_FILE ?? './.schwab-tokens.json',
		streamQos: env.SCHWAB_STREAM_QOS != null ? Number(env.SCHWAB_STREAM_QOS) : 0
	};
}

export function loadSchwabConfig(env: NodeJS.ProcessEnv = process.env): SchwabConfig {
	return SchwabConfig.parse(read(env));
}

export type ConfigResult = { ok: true; config: SchwabConfig } | { ok: false; error: string };

// Non-throwing loader so the smoke test / engine can degrade gracefully when
// credentials are absent (never prints secret values).
export function tryLoadSchwabConfig(env: NodeJS.ProcessEnv = process.env): ConfigResult {
	const parsed = SchwabConfig.safeParse(read(env));
	if (parsed.success) return { ok: true, config: parsed.data };
	const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
	return { ok: false, error: `missing/invalid Schwab config: ${missing}` };
}
