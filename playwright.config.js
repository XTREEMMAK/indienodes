import { defineConfig } from '@playwright/test';

export default defineConfig({
	use: { baseURL: 'http://localhost:4173' },
	webServer: [
		{ command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true },
		{
			command: 'npm run generator:preview -- --long',
			port: 4175,
			reuseExistingServer: true
		}
	],
	testMatch: '**/*.e2e.{ts,js}'
});
