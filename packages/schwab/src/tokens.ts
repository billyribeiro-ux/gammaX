import { chmod, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

export const SchwabTokens = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1),
	accessExpiresAt: z.number(), // epoch ms
	refreshExpiresAt: z.number(), // epoch ms
	tokenType: z.string().default('Bearer')
});
export type SchwabTokens = z.infer<typeof SchwabTokens>;

// Persists OAuth tokens to a gitignored file with owner-only permissions.
// NEVER logs or prints token values.
export class TokenStore {
	constructor(private readonly path: string) {}

	async read(): Promise<SchwabTokens | null> {
		try {
			const raw = await readFile(this.path, 'utf8');
			const parsed = SchwabTokens.safeParse(JSON.parse(raw));
			return parsed.success ? parsed.data : null;
		} catch {
			return null;
		}
	}

	async write(tokens: SchwabTokens): Promise<void> {
		await writeFile(this.path, JSON.stringify(tokens, null, 2), { encoding: 'utf8', mode: 0o600 });
		await chmod(this.path, 0o600).catch(() => undefined);
	}
}
