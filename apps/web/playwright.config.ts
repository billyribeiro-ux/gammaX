import { defineConfig } from '@playwright/test';

// This image ships a full Chromium (not the headless-shell Playwright would
// auto-download), so point launch at it directly. Override via PW_CHROMIUM.
const executablePath =
	process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: true,
		timeout: 120_000
	},
	use: {
		baseURL: 'http://localhost:4173',
		headless: true,
		launchOptions: { executablePath, args: ['--no-sandbox'] }
	},
	testMatch: '**/*.e2e.{ts,js}'
});
