
import { defineConfig, devices } from '@playwright/test';
import { APP_ORIGIN, E2E_DB_PATH } from './automation/support/testConfig.js';

export default defineConfig({
  testDir: './automation/tests',
  outputDir: './automation/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: {
    timeout: 5_000,
  },

  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,

  reporter: [
  ['list'],
  ['html', {
    outputFolder: './automation/playwright-report',
    open: 'never',
  }],
  ],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    timezoneId: 'Europe/Warsaw',
  },

webServer: {
  command: 'npm run db:reset && npm run dev',
  url: 'http://127.0.0.1:5173/api/spaces',
  reuseExistingServer: false,
  timeout: 60_000,
  gracefulShutdown: {
    signal: 'SIGTERM',
    timeout: 5_000,
  },
  env: {
    APP_ENV: 'test',
    DB_PATH: E2E_DB_PATH,
    APP_ORIGIN,
    PORT: '3001',
  },
},

  projects: [
    {
      name: 'chromium',
      testMatch: [
        '**/ui/**/*.spec.ts',
        '**/mocked/**/*.spec.ts',
        '**/e2e/**/*.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: APP_ORIGIN,
      },
    },
    {
      name: 'api',
      testMatch: '**/api/**/*.spec.ts',
      use: {
        baseURL: 'http://127.0.0.1:3001',
      },
    },
  ],
});
