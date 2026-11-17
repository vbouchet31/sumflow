import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
/** Specs that need a touch screen: run on the touch projects only. */
const TOUCH_SPECS = /(touch|layout)\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: TOUCH_SPECS },
    // Touch layouts (PLAN-tactile §7.2). Chromium only: multi-touch gestures go through CDP.
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' },
      testMatch: TOUCH_SPECS,
    },
    {
      name: 'tablet-portrait',
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
      testMatch: TOUCH_SPECS,
    },
    // A phone held upright is supported, not polished: layout checks only.
    {
      name: 'phone-portrait',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
      testMatch: /layout\.spec\.ts$/,
    },
    {
      name: 'phone-landscape',
      use: { ...devices['iPhone 13 landscape'], browserName: 'chromium' },
      testMatch: TOUCH_SPECS,
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
