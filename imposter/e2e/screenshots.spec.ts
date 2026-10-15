/**
 * Screenshot capture for human review. Not a test of behaviour (the default run ignores this file);
 * run with `npm run test:e2e:screenshots` after `npm run build`. PNGs go to ./screenshots (gitignored).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPlayers,
  expectCardHidden,
  gotoHome,
  HEBREW,
  holdDown,
  holdUp,
  openSetup,
  otherThan,
  passReveal,
  PLAYERS,
  playClues,
  readCard,
  setRevealMethod,
  startRound,
  STATE_KEY,
  waitForArmed,
} from './helpers';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(DIR, { recursive: true });

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300); // let the entrance transitions settle
  await page.screenshot({ path: join(DIR, `${name}.png`), fullPage });
}

test.describe.configure({ mode: 'serial' });

test('pregame screens, English and Hebrew', async ({ page }) => {
  await gotoHome(page);
  await shot(page, 'home-en');

  await page.getByTestId('home-howto').click();
  await expect(page.getByTestId('howto-screen')).toBeVisible();
  await shot(page, 'howto-en');
  await page.getByTestId('howto-done').click();

  await openSetup(page);
  await addPlayers(page, PLAYERS);
  await shot(page, 'setup-en');

  await page.getByTestId('setup-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await shot(page, 'settings-en');

  await page.getByTestId('settings-lang-he').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await shot(page, 'settings-he');

  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await shot(page, 'setup-he');

  await page.getByTestId('setup-back').click();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await shot(page, 'home-he');

  await page.getByTestId('home-howto').click();
  await expect(page.getByTestId('howto-screen')).toBeVisible();
  await shot(page, 'howto-he');
});

test('in-round screens, English, hold mode', async ({ page }) => {
  await gotoHome(page);
  await openSetup(page);
  await setRevealMethod(page, 'hold');
  await addPlayers(page, PLAYERS);
  await startRound(page);

  await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS[0]);
  await shot(page, 'pass-en');

  let imposter = '';
  let shotWord = false;
  let shotImposter = false;
  for (const name of PLAYERS) {
    await expect(page.getByTestId('pass-name')).toHaveText(name);
    await waitForArmed(page);
    await holdDown(page);
    const card = await readCard(page);
    if (card.kind === 'imposter') {
      imposter = name;
      if (!shotImposter) {
        await shot(page, 'reveal-imposter-en');
        shotImposter = true;
      }
    } else if (!shotWord) {
      await shot(page, 'reveal-word-en');
      shotWord = true;
    }
    await holdUp(page);
    await expectCardHidden(page);
    await passReveal(page);
  }
  expect(shotWord && shotImposter).toBe(true);

  await expect(page.getByTestId('clues-screen')).toBeVisible();
  await shot(page, 'clues-en');
  await playClues(page, PLAYERS.length, 2);

  await expect(page.getByTestId('discussion-screen')).toBeVisible();
  await shot(page, 'discussion-en');
  await page.getByTestId('discussion-vote').click();

  await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS[0]);
  await shot(page, 'vote-pass-en');

  let shotBallot = false;
  for (const name of PLAYERS) {
    await expect(page.getByTestId('pass-name')).toHaveText(name);
    await waitForArmed(page);
    await holdDown(page);
    await expect(page.getByTestId('vote-ballot')).toBeVisible();
    const target = name === imposter ? otherThan(PLAYERS, imposter) : imposter;
    await page.getByTestId('ballot-opt').filter({ hasText: target }).click();
    if (!shotBallot) {
      await shot(page, 'vote-ballot-en');
      shotBallot = true;
    }
    await holdUp(page);
    await page.getByTestId('vote-lock').click();
  }

  await expect(page.getByTestId('guess-screen')).toBeVisible();
  await page.getByTestId('guess-input').fill('banana');
  await shot(page, 'guess-en');
  await page.getByTestId('guess-submit').click();

  await expect(page.getByTestId('results-screen')).toBeVisible();
  await shot(page, 'results-en');
  await shot(page, 'results-en-full', true);
});

/** A persisted round in Hebrew with a 14-letter word (BRIEF: cards tested up to 14 characters) and a dare penalty. */
const HE_PLAYERS = [
  { id: 'p1', name: 'דנה' },
  { id: 'p2', name: 'יוסי' },
  { id: 'p3', name: 'נועה' },
  { id: 'p4', name: 'עומר' },
];
const HE_IMPOSTER = 'נועה';
const HE_WORD = 'אנדוקרינולוגית';
const HE_SNAPSHOT = {
  version: 1,
  phase: 'reveal',
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
    difficulty: 'hard',
    penalty: 'dare',
  },
  scores: { p1: 1, p2: 1, p3: 3, p4: 1 },
  round: {
    number: 2,
    word: { word: HE_WORD, category: 'professions', difficulty: 3, aliases: ['אנדוקרינולוג'] },
    categoryId: 'professions',
    categoryName: 'מקצועות',
    order: ['p1', 'p2', 'p3', 'p4'],
    imposterIds: ['p3'],
    starterId: 'p2',
    config: { clueRounds: 2, discussionSeconds: 60, imposterSeesCategory: true, imposterGuess: true, penalty: 'dare' },
    revealIndex: 0,
    clueRound: 1,
    clueTurn: 0,
    voteIndex: 0,
    votes: {},
    guess: null,
    outcome: null,
  },
  history: [{ number: 1, word: 'רופא שיניים', categoryId: 'professions', imposterIds: ['p3'], winner: 'imposter' }],
  usedWords: ['he:professions:רופא שיניים', `he:professions:${HE_WORD}`],
};

test('in-round screens, Hebrew: long word card and results', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STATE_KEY, JSON.stringify(HE_SNAPSHOT)]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('reveal-screen')).toBeVisible();

  const names = HE_PLAYERS.map((p) => p.name);
  let shotWord = false;
  for (const name of names) {
    await expect(page.getByTestId('pass-name')).toHaveText(name);
    await waitForArmed(page);
    await holdDown(page);
    const card = await readCard(page);
    expect(card.text).toMatch(HEBREW);
    if (card.kind === 'word') {
      expect(card.text).toBe(HE_WORD);
      if (!shotWord) {
        await shot(page, 'reveal-word-he');
        shotWord = true;
      }
    } else {
      expect(name).toBe(HE_IMPOSTER);
    }
    await holdUp(page);
    await expectCardHidden(page);
    await passReveal(page);
  }

  await playClues(page, names.length, 2);
  await page.getByTestId('discussion-vote').click();
  for (const name of names) {
    await expect(page.getByTestId('pass-name')).toHaveText(name);
    await waitForArmed(page);
    await holdDown(page);
    await expect(page.getByTestId('vote-ballot')).toBeVisible();
    const target = name === HE_IMPOSTER ? otherThan(names, HE_IMPOSTER) : HE_IMPOSTER;
    await page.getByTestId('ballot-opt').filter({ hasText: target }).click();
    await holdUp(page);
    await page.getByTestId('vote-lock').click();
  }

  await expect(page.getByTestId('guess-screen')).toBeVisible();
  await page.getByTestId('guess-giveup').click();
  await expect(page.getByTestId('results-screen')).toBeVisible();
  await expect(page.getByTestId('results-word')).toHaveText(HE_WORD);
  await shot(page, 'results-he');
  await shot(page, 'results-he-full', true);
});
