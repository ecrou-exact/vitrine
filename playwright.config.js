import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e/**/*.spec.js', 'security/**/*.spec.js', 'site/**/*.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: [
    {
      command: 'node scripts/serve.js . 4173',
      url: 'http://localhost:4173/tests/e2e/fixtures/strict.html',
      reuseExistingServer: !process.env.CI,
    },
    {
      // The website (built by `npm run site`).
      command: 'node scripts/serve.js _site 4174',
      url: 'http://localhost:4174/index.html',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
