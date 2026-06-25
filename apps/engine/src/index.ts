import type { SurfaceScope } from '@gammax/contracts';
import { createRecorder } from '@gammax/recorder';
import { loadEngineConfig } from './config';
import { Engine } from './engine';
import { createFeed } from './feeds/factory';
import { Grader } from './grader';
import { EngineWsServer } from './ws-server';

const SCOPES: SurfaceScope[] = ['combined', 'SPX', 'SPY'];

async function main(): Promise<void> {
	const config = loadEngineConfig();
	const recorder = await createRecorder(process.env);
	const sink = new EngineWsServer(config.wsPort, config.underlyings, SCOPES);
	const grader = new Grader(recorder, sink, config.gradeHorizons, config.graderMaxStalenessMs);
	const feed = createFeed(config, recorder);
	const engine = new Engine({ config, feed, recorder, sink, grader });
	await engine.start();
	console.log(
		`[engine] started — feed=${config.feedSource} ws=:${config.wsPort} underlyings=${config.underlyings.join(',')} sessionAware=${config.sessionAware}`
	);

	let shuttingDown = false;
	const shutdown = async (reason: string): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`[engine] shutting down (${reason})`);
		await engine.stop();
		await sink.close();
		await recorder.close();
		process.exit(0);
	};
	process.on('SIGINT', () => void shutdown('SIGINT'));
	process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((err: unknown) => {
	console.error(err);
	process.exitCode = 1;
});
