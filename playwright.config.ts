import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.e2e.ts', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4178', channel: 'chrome', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4178', url: 'http://127.0.0.1:4178', reuseExistingServer: false },
});
