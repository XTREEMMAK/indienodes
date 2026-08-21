import { defineConfig } from '@playwright/test';

export default defineConfig({
	snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}',
	projects: [
		{
			name: 'production',
			use: { baseURL: 'http://localhost:4173' }
		},
		{
			name: 'skin-lab-dev',
			use: { baseURL: 'http://localhost:4176' },
			testMatch: '**/skin-lab.e2e.js'
		}
	],
	webServer: [
		{ command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true },
		{
			command: 'npm run dev -- --host 127.0.0.1 --port 4176',
			port: 4176,
			reuseExistingServer: true
		},
		{
			command: 'npm run generator:preview -- --long',
			port: 4175,
			reuseExistingServer: true
		}
	],
	testMatch: '**/*.e2e.{ts,js}'
});
