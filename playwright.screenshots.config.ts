/**
 * Screenshot capture for human review (not part of the default test run, which ignores
 * e2e/screenshots.spec.ts). Build first, then: `npm run test:e2e:screenshots`.
 * PNGs land in ./screenshots (gitignored), 390x844 at device scale factor 2.
 */
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /screenshots\.spec\.ts$/,
  // Everything runs in one worker so the captures come out in order and the preview server is not hammered.
  workers: 1,
  retries: 0,
  timeout: 240_000,
});
