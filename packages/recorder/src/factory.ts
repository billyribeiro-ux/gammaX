import { PgRecorder } from './pg-recorder';
import type { Recorder } from './recorder';
import { SqliteRecorder } from './sqlite-recorder';

// Postgres-first default (per project decision); SQLite profile selected via
// DB_DRIVER=sqlite for zero-setup local/CI runs. Ensures schema before returning.
export async function createRecorder(env: NodeJS.ProcessEnv = process.env): Promise<Recorder> {
	const driver = (env.DB_DRIVER ?? 'postgres').toLowerCase();
	let recorder: Recorder;
	if (driver === 'sqlite') {
		recorder = new SqliteRecorder(env.SQLITE_PATH ?? './data/gammax.sqlite');
	} else {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for the postgres driver');
		recorder = new PgRecorder(env.DATABASE_URL);
	}
	await recorder.ensureSchema();
	return recorder;
}
