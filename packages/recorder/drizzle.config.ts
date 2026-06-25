import { defineConfig } from 'drizzle-kit';

// Postgres migrations (pnpm db:generate:pg). Runtime also supports a programmatic
// ensureSchema() so the store works with zero migration-file friction.
export default defineConfig({
	dialect: 'postgresql',
	schema: './src/schema/pg.ts',
	out: './drizzle/pg',
	dbCredentials: { url: process.env.DATABASE_URL ?? '' }
});
