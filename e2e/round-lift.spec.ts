/**
 * The same round in Lift-to-reveal mode, with a fake DeviceOrientation sensor (synthetic
 * `deviceorientation` events on window). Lift above 45 degrees for > 300 ms shows the card, lowering
 * below 30 degrees for > 150 ms hides it, lifting again re-shows it; only the Pass button advances.
 */
import { expect, test } from '@playwright/test';
import {
  addPlayers,
  expectCardHidden,
  expectSecretAbsent,
  finishWithGuess,
  gotoHome,
  installFakeSensor,
  openSetup,
  otherThan,
  passReveal,
  PLAYERS,
  playClues,
  readCard,
  setBeta,
  skipDiscussion,
  startRound,
  waitForArmed,
} from './helpers';

test.describe('round in lift mode', () => {
  test.beforeEach(async ({ context }) => {
    await installFakeSensor(context);
  });

  test('lift shows, lower hides, lift again re-shows; vote by lifting; results', async ({ page }) => {
    test.setTimeout(180_000);

    await gotoHome(page);
    await openSetup(page);
    // Lift is the default; confirm it is selected and that Chromium reports the sensors as ready.
    await page.getByTestId('setup-settings').click();
    await expect(page.getByTestId('settings-reveal-lift')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('settings-back').click();
    await addPlayers(page, PLAYERS);

    await setBeta(page, 5); // flat, right after Start, so the no-data probe never flips to Hold
    await startRound(page);

    let word = '';
    let imposter = '';
    for (const name of PLAYERS) {
      await expect(page.getByTestId('pass-name')).toHaveText(name);
      await expectSecretAbsent(page);
      await setBeta(page, 5);
      await waitForArmed(page);
      // Lift mode is in effect: lift hint + "Can't lift?" fallback, no hold button.
      await expect(page.getByTestId('reveal-controls')).toHaveAttribute('data-method', 'lift');
      await expect(page.getByTestId('hold-button')).toHaveCount(0);
      await expectCardHidden(page);

      await setBeta(page, 70); // > LIFT_UP_DEGREES, held > 300 ms by the fake sensor
      const card = await readCard(page);
      if (card.kind === 'imposter') imposter = name;
      else word = card.text;

      await setBeta(page, 10); // < LIFT_DOWN_DEGREES for > 150 ms
      await expectCardHidden(page);
      await expect(page.getByTestId('reveal-controls')).toHaveAttribute('data-method', 'lift');

      await setBeta(page, 70); // US-4: a second look on the same turn
      const again = await readCard(page);
      expect(again).toEqual(card);

      // Lowering never advances; the pass button does (it stays after the first reveal).
      await setBeta(page, 10);
      await expectCardHidden(page);
      await expect(page.getByTestId('pass-name')).toHaveCount(0);
      await passReveal(page);
    }
    expect(word).not.toBe('');
    expect(imposter).not.toBe('');
    await setBeta(page, 5);

    await playClues(page, PLAYERS.length, 2);
    await skipDiscussion(page);

    // Vote: pass -> lift -> tap a name -> lower -> lock and pass (BRIEF "Vote screen").
    for (const name of PLAYERS) {
      await expect(page.getByTestId('pass-name')).toHaveText(name);
      await setBeta(page, 5);
      await waitForArmed(page);
      await expectCardHidden(page);
      await setBeta(page, 70);
      await expect(page.getByTestId('vote-ballot')).toBeVisible();
      const options = page.getByTestId('ballot-opt');
      await expect(options).toHaveCount(PLAYERS.length - 1);
      await expect(options.filter({ hasText: name })).toHaveCount(0);
      const target = name === imposter ? otherThan(PLAYERS, imposter) : imposter;
      await options.filter({ hasText: target }).click();
      await setBeta(page, 10);
      await expectCardHidden(page);
      await page.getByTestId('vote-lock').click();
    }

    // Caught -> a wrong guess -> the table wins.
    await expect(page.getByTestId('guess-screen')).toBeVisible();
    await finishWithGuess(page, 'definitely not the word');
    await expect(page.getByTestId('results-banner')).toHaveAttribute('data-winner', 'table');
    await expect(page.getByTestId('results-winner')).toContainText(/table wins/);
    await expect(page.getByTestId('results-word')).toHaveText(word);
    await expect(page.getByTestId('results-scoreboard')).toContainText('+1');
  });
});
