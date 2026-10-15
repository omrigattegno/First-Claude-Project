/**
 * Hebrew: RTL document, Hebrew UI on Home / How to play / Setup, and a Hebrew word on the reveal card.
 */
import { expect, test } from '@playwright/test';
import {
  addPlayers,
  expectCardHidden,
  gotoHome,
  HEBREW,
  holdDown,
  holdUp,
  openSetup,
  PLAYERS_HE,
  readCard,
  setLanguage,
  setRevealMethod,
  startRound,
  waitForArmed,
} from './helpers';

test.describe('Hebrew', () => {
  test('switches the document to RTL Hebrew and renders a Hebrew card', async ({ page }) => {
    test.setTimeout(90_000);

    await gotoHome(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await setLanguage(page, 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByTestId('home-play')).toHaveText(HEBREW);
    await expect(page.getByTestId('home-howto')).toHaveText(HEBREW);

    // How to play in Hebrew.
    await page.getByTestId('home-howto').click();
    await expect(page.getByTestId('howto-screen')).toBeVisible();
    await expect(page.getByTestId('howto-screen')).toContainText(HEBREW);
    await expect(page.getByTestId('howto-screen').locator('.howto__step')).toHaveCount(6);
    await expect(page.getByTestId('howto-done')).toHaveText(HEBREW);
    await page.getByTestId('howto-done').click();
    await expect(page.getByTestId('home-screen')).toBeVisible();

    // Setup in Hebrew, then a hold-mode round.
    await openSetup(page);
    await expect(page.getByTestId('setup-screen')).toContainText(HEBREW);
    await expect(page.getByTestId('setup-start')).toHaveText(HEBREW);
    await expect(page.getByTestId('setup-name-input')).toHaveAttribute('placeholder', HEBREW);
    await setRevealMethod(page, 'hold');
    await addPlayers(page, PLAYERS_HE);
    await startRound(page);

    await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS_HE[0]);
    await expect(page.getByTestId('pass-screen')).toContainText(HEBREW);
    await waitForArmed(page);
    await expectCardHidden(page);
    await holdDown(page);
    const card = await readCard(page);
    expect(card.text).toMatch(HEBREW);
    await holdUp(page);
    await expectCardHidden(page);

    // The settings persist: a reload keeps Hebrew and RTL.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  });

  test('How to play renders in English too', async ({ page }) => {
    await gotoHome(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByTestId('home-howto').click();
    const howto = page.getByTestId('howto-screen');
    await expect(howto).toBeVisible();
    await expect(howto).toContainText('How to play');
    await expect(howto).toContainText('Lift to reveal');
    await expect(howto.locator('.howto__step')).toHaveCount(6);
    await expect(howto).not.toContainText(HEBREW);
    await expect(page.getByTestId('howto-done')).toHaveText('Got it');
    await page.getByTestId('howto-done').click();
    await expect(page.getByTestId('home-screen')).toBeVisible();
  });
});
