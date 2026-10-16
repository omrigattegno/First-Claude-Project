/**
 * Lift-to-reveal mode with a fake DeviceOrientation sensor (synthetic `deviceorientation` events on
 * window). Lift above 45 degrees for > 300 ms shows the card, lowering below 30 degrees for > 150 ms
 * hides it, lifting again re-shows it; only the Pass button advances. The other tests cover the guards
 * around that: the phone must be seen lowered once after the countdown before a lift counts (priming),
 * face-down (beta ~180) never counts as lifted, and a sensor that goes quiet (Chrome Android stops
 * reporting once the angles are steady) still completes the debounce on the app's own timer.
 */
import { expect, test, type Page } from '@playwright/test';
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
  pulseAndMeasure,
  pulseBeta,
  readCard,
  setBeta,
  skipDiscussion,
  startRound,
  stopFakeSensor,
  waitForArmed,
} from './helpers';

/** Home -> Setup -> four players -> Start, with the fake sensor at `beta` from before the Start tap. */
async function startLiftRound(page: Page, beta: number): Promise<void> {
  await gotoHome(page);
  await openSetup(page);
  await addPlayers(page, PLAYERS);
  await setBeta(page, beta);
  await startRound(page);
  await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS[0]);
}

/** The hint under the card: data-hint="lower" until the phone has been seen lowered, then "lift". */
const hint = (page: Page) => page.getByTestId('reveal-hint');

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
      await expect(hint(page)).toHaveAttribute('data-hint', 'lift'); // flat through the countdown: primed
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

  test('a phone still raised through the countdown must be lowered before the first lift counts', async ({ page }) => {
    // The previous holder hands the phone over tilted toward the next player: beta stays at 70 from
    // before Start, through the Pass-to countdown and after the sensor arms.
    await startLiftRound(page, 70);
    await waitForArmed(page);
    await expect(page.getByTestId('reveal-controls')).toHaveAttribute('data-method', 'lift');
    await expect(hint(page)).toHaveAttribute('data-hint', 'lower');
    await expectCardHidden(page);
    await page.waitForTimeout(700); // well past LIFT_UP_DEBOUNCE_MS: a raised phone alone never reveals
    await expectCardHidden(page);
    await expect(hint(page)).toHaveAttribute('data-hint', 'lower');

    // One reading below LIFT_DOWN_DEGREES primes the detector; the card stays hidden until a real lift.
    await setBeta(page, 10);
    await expect(hint(page)).toHaveAttribute('data-hint', 'lift');
    await expectCardHidden(page);

    await setBeta(page, 70);
    const card = await readCard(page);
    expect(card.text).not.toBe('');
  });

  test('face-down (beta 180) never reveals and hides a shown card', async ({ page }) => {
    // Face-down on the table through the countdown counts as lowered (so it primes) but never as lifted.
    await startLiftRound(page, 180);
    await waitForArmed(page);
    await expect(hint(page)).toHaveAttribute('data-hint', 'lift');
    await page.waitForTimeout(700);
    await expectCardHidden(page);

    await setBeta(page, 70);
    const card = await readCard(page);

    await setBeta(page, 180); // turned face-down while shown: hides like lowering
    await expectCardHidden(page);
    await page.waitForTimeout(700);
    await expectCardHidden(page);

    await setBeta(page, 178); // jitter around face-down is still "turned away"
    await page.waitForTimeout(500);
    await expectCardHidden(page);

    await setBeta(page, 70);
    expect(await readCard(page)).toEqual(card);
  });

  test('a single reading followed by silence still completes the debounce on the clock', async ({ page }) => {
    await startLiftRound(page, 5);
    await waitForArmed(page);
    await expect(hint(page)).toHaveAttribute('data-hint', 'lift'); // primed by the flat readings
    await stopFakeSensor(page); // from here on only explicit pulses reach the app
    await expectCardHidden(page);

    // One beta=70 reading, then nothing: the card must still show after LIFT_UP_DEBOUNCE_MS (300 ms).
    const show = await pulseAndMeasure(page, 70, true);
    expect(show, `card shown ${show} ms after a single lifted reading (-1: never)`).toBeGreaterThanOrEqual(250);
    expect(show, `card shown ${show} ms after a single lifted reading`).toBeLessThanOrEqual(1500);
    const card = await readCard(page);
    expect(card.text).not.toBe('');

    // One beta=10 reading, then nothing: hidden after LIFT_DOWN_DEBOUNCE_MS (150 ms).
    const hide = await pulseAndMeasure(page, 10, false);
    expect(hide, `card hidden ${hide} ms after a single lowered reading (-1: never)`).toBeGreaterThanOrEqual(100);
    expect(hide, `card hidden ${hide} ms after a single lowered reading`).toBeLessThanOrEqual(1500);
    await expectCardHidden(page);

    // A bounce back inside the band before the debounce elapses cancels the pending reveal.
    await pulseBeta(page, 70);
    await page.waitForTimeout(100);
    await pulseBeta(page, 20);
    await page.waitForTimeout(700);
    await expectCardHidden(page);

    // And a clean lift still works afterwards.
    await pulseBeta(page, 70);
    expect(await readCard(page)).toEqual(card);
  });
});
