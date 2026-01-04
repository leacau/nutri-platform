import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const workspaceDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	testDir: './e2e',
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure',
	},
	reporter: 'list',
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' },
		},
	],
	webServer: {
		command: 'npm run dev -- --host 0.0.0.0 --port ' + PORT,
		cwd: workspaceDir,
		env: {
			...process.env,
			VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'http://localhost:8081',
			VITE_E2E_MOCK_AUTH: 'true',
			VITE_E2E_API_STUB: 'true',
		},
		url: BASE_URL,
		timeout: 90_000,
		reuseExistingServer: !process.env.CI,
	},
});
