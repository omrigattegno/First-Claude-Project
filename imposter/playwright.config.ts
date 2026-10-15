/**
 * Playwright e2e config. Tests live in e2e/ and run against the production build served by
 * `vite preview` (build first: `npm run build`, then `npm run test:e2e`).
 *
 * The container ships Chromium under PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers) at a revision that may
 * differ from the one this Playwright version would download, so the executable is resolved explicitly.
 * Never run `playwright install` here; on a dev machine without the preinstalled browser, Playwright
 * falls back to its own download location.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= BROWSERS_PATH;

function preinstalledChromium(): string | undefined {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override && existsSync(override)) return override;
  const link = join(BROWSERS_PATH, 'chromium'); // symlink maintained by the image
  if (existsSync(link)) return link;
  try {
    const revisions = readdirSync(BROWSERS_PATH)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)));
    for (const dir of revisions) {
      const exe = join(BROWSERS_PATH, dir, 'chrome-linux', 'chrome');
      if (existsSync(exe)) return exe;
    }
  } catch {
    /* no preinstalled browsers: let Playwright resolve its own */
  }
  return undefined;
}

const executablePath = preinstalledChromium();
// Must match the base the build was made with (VITE_BASE, see vite.config.ts).
const base = process.env.VITE_BASE ?? '/';
const origin = 'http://localhost:4173';

export default defineConfig({
  testDir: 'e2e',
  // The screenshot capture (e2e/screenshots.spec.ts) is not a test; run it with
  // `npm run test:e2e:screenshots` (playwright.screenshots.config.ts).
  testIgnore: /screenshots\.spec\.ts$/,
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `${origin}${base}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    colorScheme: 'dark',
    locale: 'en-US',
  },
  projects: [
    {
      // A 390x844 phone (iPhone 14-class) driven by Chromium with touch and a mobile viewport.
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: `${origin}${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
