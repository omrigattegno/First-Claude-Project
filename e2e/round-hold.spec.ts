/**
 * A complete round in Hold-to-reveal mode on a phone-sized Chromium, plus resume after a refresh
 * (mid-clues and mid-discussion), the "Imposter sees the category: Off" rule on the Guess screen, and
 * the two-finger ballot gesture (hold with one finger, tap a name with another) driven through CDP.
 */
import { expect, test, type Locator } from '@playwright/test';
import {
  addPlayers,
  expectCardHidden,
  finishWithGuess,
  gotoHome,
  holdDown,
  holdUp,
  openSetup,
  otherThan,
  parseClock,
  pickSetting,
  PLAYERS,
  playClues,
  readCard,
  readRound,
  readSnapshot,
  revealAllHold,
  seedSnapshot,
  setRevealMethod,
  skipDiscussion,
  startRound,
  voteAllHold,
  waitForArmed,
} from './helpers';

test.describe('round in hold mode', () => {
  test('setup, reveal, clues, discussion, vote, guess, results, next round; resume after reload', async ({ page }) => {
    test.setTimeout(180_000);

    await gotoHome(page);
    await openSetup(page);
    await setRevealMethod(page, 'hold');
    await addPlayers(page, PLAYERS);
    await startRound(page);

    // Reveal: every player gets the pass screen, holds to see the card, releases, looks again, passes.
    const { word, imposter } = await revealAllHold(page, PLAYERS);
    await expect(page.getByTestId('clues-screen')).toBeVisible();

    // The snapshot is in localStorage and a refresh mid-round lands back on the same phase.
    const snapshot = await readSnapshot(page);
    expect(snapshot?.phase).toBe('clues');
    expect((snapshot?.round as { number: number }).number).toBe(1);
    await page.reload();
    await expect(page.getByTestId('clues-screen')).toBeVisible();
    await expect(page.getByTestId('clues-round')).toContainText('1');
    await expect(page.getByTestId('clues-speaker')).not.toBeEmpty();

    // Two clue rounds x four players, then the discussion.
    await playClues(page, PLAYERS.length, 2);

    // The discussion deadline is persisted with the round: a refresh keeps counting down from where it
    // was instead of restarting the full minute.
    const discussion = page.getByTestId('discussion-screen');
    const clock = page.getByTestId('discussion-clock');
    await expect(discussion).toBeVisible();
    await page.waitForTimeout(2500);
    const endsAt = (await readRound(page))?.discussionEndsAt;
    expect(typeof endsAt).toBe('number');
    const before = parseClock(await clock.textContent());
    expect(before).toBeLessThan(60);
    await page.reload();
    await expect(discussion).toBeVisible();
    const after = parseClock(await clock.textContent());
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(0);
    expect((await readRound(page))?.discussionEndsAt).toBe(endsAt);
    await skipDiscussion(page);

    // Everyone (but the Imposter) votes for the Imposter -> caught -> the Imposter guesses correctly.
    await voteAllHold(page, PLAYERS, (voter) => (voter === imposter ? otherThan(PLAYERS, imposter) : imposter));
    await expect(page.getByTestId('guess-screen')).toBeVisible();
    await expect(page.getByTestId('guess-screen')).toContainText(imposter);
    await expect(page.getByTestId('guess-category')).toBeVisible(); // the default rule: category shown
    await finishWithGuess(page, word.toLowerCase());

    // Results: winner, the word, the scoreboard.
    await expect(page.getByTestId('results-winner')).toContainText(/Imposter wins/);
    await expect(page.getByTestId('results-banner')).toHaveAttribute('data-winner', 'imposter');
    await expect(page.getByTestId('results-word')).toHaveText(word);
    await expect(page.getByTestId('results-screen')).toContainText(`The Imposter was ${imposter}`);
    const scoreboard = page.getByTestId('results-scoreboard');
    for (const name of PLAYERS) await expect(scoreboard).toContainText(name);
    await expect(scoreboard).toContainText('+2'); // caught but guessed the word
    expect((await readSnapshot(page))?.phase).toBe('results');

    // Next round starts round 2 on the pass screen for the first seat.
    await page.getByTestId('results-next').click();
    await expect(page.getByTestId('reveal-screen')).toBeVisible();
    await expect(page.getByTestId('pass-screen')).toBeVisible();
    await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS[0]);
    const round2 = await readSnapshot(page);
    expect(round2?.phase).toBe('reveal');
    expect((round2?.round as { number: number }).number).toBe(2);

    // Round 2 draws a different word (never repeated within the evening).
    await waitForArmed(page);
    await holdDown(page);
    const card = await readCard(page);
    if (card.kind === 'word') expect(card.text).not.toBe(word);
    await holdUp(page);
    await expectCardHidden(page);
  });

  test('"Imposter sees the category" Off hides it on the Imposter card and on the Guess screen', async ({ page }) => {
    test.setTimeout(120_000);

    await gotoHome(page);
    await openSetup(page);
    await page.getByTestId('setup-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await page.getByTestId('settings-reveal-hold').click();
    await pickSetting(page, 'Imposter sees the category', 'Off');
    // Shorter round: one clue round and no discussion timer (clues go straight to the vote).
    await page.getByTestId('settings-clue-rounds-1').click();
    await page.getByTestId('settings-discussion-0').click();
    await page.getByTestId('settings-back').click();
    await expect(page.getByTestId('setup-screen')).toBeVisible();
    await addPlayers(page, PLAYERS);
    await startRound(page);

    const { imposter } = await revealAllHold(page, PLAYERS, {
      lookTwice: false,
      onCard: async (card) => {
        const secret = page.getByTestId('secret-card');
        if (card.kind === 'imposter') {
          await expect(secret).toContainText('Category hidden');
          await expect(secret).not.toContainText('Category:');
        } else {
          await expect(secret).toContainText('Category:'); // the table still sees it
        }
      },
    });

    await playClues(page, PLAYERS.length, 1);
    await expect(page.getByTestId('vote-screen')).toBeVisible(); // discussion Off
    await voteAllHold(page, PLAYERS, (voter) => (voter === imposter ? otherThan(PLAYERS, imposter) : imposter));

    // The rule frozen into the round governs the Guess screen too: no category line at all.
    const guess = page.getByTestId('guess-screen');
    await expect(guess).toBeVisible();
    await expect(page.getByTestId('guess-category-hidden')).toBeVisible();
    await expect(page.getByTestId('guess-category')).toHaveCount(0);
    await expect(guess).not.toContainText('Category:');

    await finishWithGuess(page, 'definitely not the word');
    await expect(page.getByTestId('results-banner')).toHaveAttribute('data-winner', 'table');
  });

  test('hold mode ballot: a second finger taps a name while the first holds the button', async ({ page }) => {
    // Straight into the vote (hold mode) via a persisted round.
    await seedSnapshot(page, VOTE_SNAPSHOT);
    await expect(page.getByTestId('vote-screen')).toBeVisible();
    await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS[0]);
    await waitForArmed(page);
    await expectCardHidden(page);
    await expect(page.getByTestId('vote-lock')).toHaveCount(0);

    // Real multi-touch through CDP: touch 1 presses and keeps holding the button, touch 2 taps a name.
    // A secondary touch gets pointer events but no click, which is why the ballot selects on pointerup.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

    const hold = { ...(await center(page.getByTestId('hold-button'))), id: 1 };
    await touch('touchStart', [hold]);
    await expect(page.getByTestId('vote-ballot')).toBeVisible();

    const option = page.getByTestId('ballot-opt').filter({ hasText: 'Carol' });
    // Record what the option receives: the selection must come from a non-primary pointer's pointerup.
    await option.evaluate((el) => {
      const seen = { pointerup: 0, click: 0, primary: null as boolean | null, type: '' };
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      el.addEventListener('pointerup', (e) => {
        seen.pointerup++;
        seen.primary = (e as PointerEvent).isPrimary;
        seen.type = (e as PointerEvent).pointerType;
      });
      el.addEventListener('click', () => seen.click++);
    });
    const tap = { ...(await center(option)), id: 2 };
    await touch('touchStart', [tap]);
    await touch('touchEnd', [tap]);
    await expect(option).toHaveAttribute('aria-checked', 'true');
    const seen = await page.evaluate(
      () => (window as unknown as { __seen: { pointerup: number; click: number; primary: boolean | null; type: string } }).__seen,
    );
    expect(seen, `events on the tapped name: ${JSON.stringify(seen)}`).toMatchObject({ primary: false, type: 'touch' });
    expect(seen.pointerup, 'the secondary touch must reach the name as pointerup').toBeGreaterThan(0);
    await expect(page.getByTestId('vote-lock')).toBeVisible();
    await expect(page.getByTestId('vote-ballot')).toBeVisible(); // still held by the first finger

    // Releasing the first finger hides the ballot; the choice survives and can be locked while flat.
    await touch('touchEnd', [hold]);
    await expectCardHidden(page);
    await expect(page.getByTestId('vote-lock')).toBeVisible();
    await page.getByTestId('vote-lock').click();
    await expect(page.getByTestId('pass-name')).toHaveText(PLAYERS[1]);
    await expect(page.getByTestId('vote-progress')).toContainText('2');
  });
});

/** Viewport centre of an element, in CSS pixels (what CDP input events take). */
async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** A round at the start of the vote, hold mode, English, four players (Carol is the Imposter). */
const EN_PLAYERS = PLAYERS.map((name, i) => ({ id: `p${i + 1}`, name }));
const VOTE_SNAPSHOT = {
  version: 1,
  phase: 'vote',
  players: EN_PLAYERS,
  settings: {
    language: 'en',
    categoryId: 'food',
    imposterCount: 1,
    clueRounds: 2,
    discussionSeconds: 60,
    imposterSeesCategory: true,
    imposterGuess: true,
    revealMethod: 'hold',
    difficulty: 'normal',
    penalty: 'off',
  },
  scores: { p1: 0, p2: 0, p3: 0, p4: 0 },
  round: {
    number: 1,
    word: { word: 'Pizza', category: 'food', difficulty: 1, aliases: [] },
    categoryId: 'food',
    categoryName: 'Food',
    order: ['p1', 'p2', 'p3', 'p4'],
    imposterIds: ['p3'],
    starterId: 'p2',
    config: { clueRounds: 2, discussionSeconds: 60, imposterSeesCategory: true, imposterGuess: true, penalty: 'off' },
    revealIndex: 3,
    clueRound: 2,
    clueTurn: 3,
    voteIndex: 0,
    votes: {},
    guess: null,
    outcome: null,
    discussionEndsAt: Date.now() - 60_000,
  },
  history: [],
  usedWords: ['en:food:Pizza'],
};
