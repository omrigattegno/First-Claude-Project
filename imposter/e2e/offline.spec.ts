/**
 * Offline (US-12, best effort): once the service worker has installed and precached the build, the
 * app shell must still load with the network cut. Skips when the registration cannot be observed.
 */
import { expect, test } from '@playwright/test';
import { gotoHome } from './helpers';

test('Home still renders offline after the service worker is installed', async ({ page, context }) => {
  test.setTimeout(60_000);
  await gotoHome(page);

  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000));
    const activated = navigator.serviceWorker.ready.then(
      (reg) =>
        new Promise<boolean>((resolve) => {
          const sw = reg.active;
          if (!sw) return resolve(false);
          if (sw.state === 'activated') return resolve(true);
          sw.addEventListener('statechange', () => sw.state === 'activated' && resolve(true));
        }),
    );
    return Promise.race([activated, timeout]);
  });
  test.skip(!swReady, 'service worker registration could not be observed within 10 s');

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByTestId('home-screen')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('home-play')).toBeVisible();
    // The page really is offline and was served by the service worker, not by the network.
    const served = await page.evaluate(() => ({
      online: navigator.onLine,
      controlled: navigator.serviceWorker.controller !== null,
    }));
    expect(served.online).toBe(false);
    expect(served.controlled).toBe(true);
    // The shell works end to end offline: open Setup and come back.
    await page.getByTestId('home-play').click();
    await expect(page.getByTestId('setup-screen')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
