import { createRecorder } from './factory';

// Ensures the append-only schema exists for the configured driver.
async function main(): Promise<void> {
	const recorder = await createRecorder();
	console.log(`[recorder] schema ensured (driver=${process.env.DB_DRIVER ?? 'postgres'})`);
	await recorder.close();
}

void main().catch((err: unknown) => {
	console.error(err);
	process.exitCode = 1;
});
