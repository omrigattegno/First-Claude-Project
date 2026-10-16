/**
 * Hebrew: RTL document, Hebrew UI on Home / How to play / Setup, a Hebrew word on the reveal card,
 * interpolated names wrapped in bidi isolates, the "Continue (round n)" flow between rounds of an
 * evening, and platform Back popping the in-app screen stack instead of leaving the app.
 */
import { expect, test, type Page } from '@playwright/test';
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
  seedSnapshot,
  setLanguage,
  setRevealMethod,
  startRound,
  waitForArmed,
} from './helpers';

/** First-strong isolate marks translate() puts around string params in Hebrew sentences. */
const FSI = '⁨';
const PDI = '⁩';

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

    // The pass screen names the player inside a Hebrew sentence (bidi-isolated, still matched by text).
    const pass = page.getByTestId('pass-screen');
    await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS_HE[0]);
    await expect(pass).toContainText(HEBREW);
    expect(await pass.getAttribute('aria-label')).toContain(`${FSI}${PLAYERS_HE[0]}${PDI}`);
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

  test('Results -> Players -> Home offers "Continue (round n)"; New game clears the evening', async ({ page }) => {
    await seedSnapshot(page, HE_RESULTS_SNAPSHOT);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const results = page.getByTestId('results-screen');
    await expect(results).toBeVisible();
    await expect(page.getByTestId('results-winner')).toHaveText(HEBREW);
    await expect(page.getByTestId('results-word')).toHaveText(HE_WORD);
    // Names interpolated into Hebrew sentences are wrapped in first-strong isolates and still readable.
    await expect(results).toContainText(HE_IMPOSTER);
    expect(await page.locator('.results__imposters').textContent()).toContain(`${FSI}${HE_IMPOSTER}${PDI}`);

    // Platform Back from Settings opened on Results returns to Results.
    await page.getByTestId('results-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await page.goBack();
    await expect(results).toBeVisible();

    // Players (EDIT_PLAYERS) keeps the scores: Setup is titled "Round 2" and Home offers to continue.
    await page.getByTestId('results-players').click();
    const setup = page.getByTestId('setup-screen');
    await expect(setup).toBeVisible();
    await expect(setup).toContainText('סיבוב 2');
    for (const name of PLAYERS_HE) await expect(page.locator('.prow__name', { hasText: name })).toBeVisible();

    await page.getByTestId('setup-back').click();
    await expect(page.getByTestId('home-screen')).toBeVisible();
    const cont = page.getByTestId('home-continue');
    await expect(cont).toBeVisible();
    await expect(cont).toHaveText(HEBREW);
    await expect(cont).toContainText('2');
    await expect(page.getByTestId('home-play')).toHaveCount(0);
    await expect(page.getByTestId('home-resume')).toHaveCount(0);
    await cont.click();
    await expect(setup).toBeVisible();
    await expect(setup).toContainText('סיבוב 2');

    // New game (confirmed) clears scores and history: Home is back to plain Play.
    await page.getByTestId('setup-back').click();
    await page.getByTestId('home-new-game').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(HEBREW);
    await dialog.getByRole('button', { name: 'משחק חדש', exact: true }).click();
    await expect(setup).toBeVisible();
    await expect(setup).not.toContainText('סיבוב 2');
    await page.getByTestId('setup-back').click();
    await expect(page.getByTestId('home-play')).toBeVisible();
    await expect(page.getByTestId('home-continue')).toHaveCount(0);
  });

  test('platform Back pops the in-app screen stack instead of leaving the app', async ({ page }) => {
    await gotoHome(page);
    await setLanguage(page, 'he');
    await openSetup(page);
    const url = page.url();
    await page.getByTestId('setup-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await expect.poll(() => guardArmed(page)).toBe(true);

    await page.goBack();
    await expect(page.getByTestId('setup-screen')).toBeVisible();
    expect(page.url()).toBe(url);
    await expect.poll(() => guardArmed(page)).toBe(true); // re-armed: Home is still below Setup

    await page.goBack();
    await expect(page.getByTestId('home-screen')).toBeVisible();
    expect(page.url()).toBe(url);
    // At the root nothing is pushed, so the next Back leaves the app as the platform intends.
    await expect.poll(() => guardArmed(page)).toBe(false);
  });
});

/** Whether the current history entry is the nav guard (nav.tsx pushes { imposterNav: true }). */
function guardArmed(page: Page): Promise<boolean> {
  return page.evaluate(() => (window.history.state as { imposterNav?: boolean } | null)?.imposterNav === true);
}

/** Round 1 just finished in Hebrew (hold mode): the table caught נועה, who guessed wrong. */
const HE_PLAYERS = PLAYERS_HE.map((name, i) => ({ id: `p${i + 1}`, name }));
const HE_IMPOSTER = PLAYERS_HE[2];
const HE_WORD = 'רופא שיניים';
const HE_RESULTS_SNAPSHOT = {
  version: 1,
  phase: 'results',
  players: HE_PLAYERS,
  settings: {
    language: 'he',
    categoryId: 'professions',
    imposterCount: 1,
    clueRounds: 2,
    discussionSeconds: 60,
    imposterSeesCategory: true,
    imposterGuess: true,
    revealMethod: 'hold',
    difficulty: 'normal',
    penalty: 'off',
  },
  scores: { p1: 1, p2: 1, p3: 0, p4: 1 },
  round: {
    number: 1,
    word: { word: HE_WORD, category: 'professions', difficulty: 1, aliases: [] },
    categoryId: 'professions',
    categoryName: 'מקצועות',
    order: ['p1', 'p2', 'p3', 'p4'],
    imposterIds: ['p3'],
    starterId: 'p2',
    config: { clueRounds: 2, discussionSeconds: 60, imposterSeesCategory: true, imposterGuess: true, penalty: 'off' },
    revealIndex: 3,
    clueRound: 2,
    clueTurn: 3,
    voteIndex: 3,
    votes: { p1: 'p3', p2: 'p3', p3: 'p1', p4: 'p3' },
    guess: 'וטרינר',
    outcome: {
      tally: { p3: 3, p1: 1 },
      votedOutId: 'p3',
      tie: false,
      imposterCaught: true,
      guessCorrect: false,
      winner: 'table',
      points: { p1: 1, p2: 1, p3: 0, p4: 1 },
    },
    discussionEndsAt: null,
  },
  history: [{ number: 1, word: HE_WORD, categoryId: 'professions', imposterIds: ['p3'], winner: 'table' }],
  usedWords: [`he:professions:${HE_WORD}`],
};
