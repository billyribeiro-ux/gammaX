import { defineConfig } from 'drizzle-kit';

// SQLite migrations (pnpm db:generate:sqlite).
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/schema/sqlite.ts',
	out: './drizzle/sqlite',
	dbCredentials: { url: process.env.SQLITE_PATH ?? './data/gammax.sqlite' }
});
