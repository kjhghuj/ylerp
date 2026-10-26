import { defineConfig, devices } from '@playwright/test';

const externalBase = process.env.UI_BASE_URL;
if (externalBase && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(externalBase).hostname)) {
  throw new Error('UI fixture tests only run against loopback URLs; never point them at production.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: process.env.UI_ARTIFACT_DIR || 'test-results',
  use: {
    baseURL: externalBase || 'http://127.0.0.1:4173',
    locale: 'zh-CN',
    timezoneId: 'Asia/Singapore',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1024 } } },
    { name: 'firefox', grep: /@cross-browser/, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1024 } } },
    { name: 'webkit', grep: /@cross-browser/, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1024 } } },
  ],
  webServer: externalBase ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
