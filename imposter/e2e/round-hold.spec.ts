/**
 * A complete round in Hold-to-reveal mode on a phone-sized Chromium, plus resume after a refresh.
 */
import { expect, test } from '@playwright/test';
import {
  addPlayers,
  expectCardHidden,
  finishWithGuess,
  gotoHome,
  holdDown,
  holdUp,
  openSetup,
  otherThan,
  PLAYERS,
  playClues,
  readCard,
  readSnapshot,
  revealAllHold,
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

    // Two clue rounds x four players, then the discussion is skipped with "Vote now".
    await playClues(page, PLAYERS.length, 2);
    await skipDiscussion(page);

    // Everyone (but the Imposter) votes for the Imposter -> caught -> the Imposter guesses correctly.
    await voteAllHold(page, PLAYERS, (voter) => (voter === imposter ? otherThan(PLAYERS, imposter) : imposter));
    await expect(page.getByTestId('guess-screen')).toBeVisible();
    await expect(page.getByTestId('guess-screen')).toContainText(imposter);
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
});
