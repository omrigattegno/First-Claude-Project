/**
 * Shared helpers for the Playwright suite. Every selector is a data-testid (see the screens), so the
 * same helpers drive the English and Hebrew UI.
 *
 * Holding is simulated with synthetic touch pointer events on the hold button (pointerId 7), which
 * leaves the real mouse free to tap a ballot name while the card is held, exactly as a second finger
 * would. Lifting is simulated by the fake orientation sensor installed with `installFakeSensor`.
 */
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const HEBREW = /[א-ת]/;
export const PLAYERS = ['Alice', 'Bob', 'Carol', 'Dan'];
export const PLAYERS_HE = ['דנה', 'יוסי', 'נועה', 'עומר'];
export const STATE_KEY = 'imposter.v1.state';

/** The 3 s anti-peek countdown plus rendering slack. */
export const ARM_TIMEOUT = 10_000;

export async function gotoHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('home-screen')).toBeVisible();
}

export async function setLanguage(page: Page, lang: 'en' | 'he'): Promise<void> {
  await page.getByTestId(`lang-${lang}`).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
}

export async function openSetup(page: Page): Promise<void> {
  await page.getByTestId('home-play').click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
}

/** From Setup: open Settings, pick the reveal method, come back to Setup. */
export async function setRevealMethod(page: Page, method: 'lift' | 'hold'): Promise<void> {
  await page.getByTestId('setup-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  const option = page.getByTestId(`settings-reveal-${method}`);
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
}

export async function addPlayers(page: Page, names: readonly string[]): Promise<void> {
  const input = page.getByTestId('setup-name-input');
  for (const name of names) {
    await input.fill(name);
    await page.getByTestId('setup-add').click();
    await expect(page.locator('.prow__name', { hasText: name })).toBeVisible();
  }
}

export async function startRound(page: Page): Promise<void> {
  await page.getByTestId('setup-start').click();
  await expect(page.getByTestId('pass-screen')).toBeVisible();
}

/** Wait until the anti-peek countdown ends and the (hidden) secret card is mounted. */
export async function waitForArmed(page: Page): Promise<void> {
  await expect(page.getByTestId('secret-card')).toBeVisible({ timeout: ARM_TIMEOUT });
}

const HOLD_POINTER = {
  pointerId: 7,
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
  buttons: 1,
  bubbles: true,
  cancelable: true,
  composed: true,
};

/** Press the hold-to-reveal button (synthetic touch pointer; stays pressed until holdUp). */
export async function holdDown(page: Page): Promise<void> {
  await page.getByTestId('hold-button').dispatchEvent('pointerdown', HOLD_POINTER);
}

export async function holdUp(page: Page): Promise<void> {
  await page.getByTestId('hold-button').dispatchEvent('pointerup', { ...HOLD_POINTER, buttons: 0 });
}

export interface Card {
  kind: 'word' | 'imposter';
  text: string;
}

/** Wait for the card to show and read it (the secret word or the IMPOSTER label). */
export async function readCard(page: Page): Promise<Card> {
  const word = page.getByTestId('secret-word');
  const imposter = page.getByTestId('secret-imposter');
  await expect(word.or(imposter)).toBeVisible();
  await expect(page.getByTestId('secret-card')).toHaveAttribute('data-revealed', 'true');
  if ((await imposter.count()) > 0) return { kind: 'imposter', text: ((await imposter.textContent()) ?? '').trim() };
  return { kind: 'word', text: ((await word.textContent()) ?? '').trim() };
}

/** The secret must not exist in the DOM at all while the card is lowered. */
export async function expectSecretAbsent(page: Page): Promise<void> {
  await expect(page.getByTestId('secret-word')).toHaveCount(0);
  await expect(page.getByTestId('secret-imposter')).toHaveCount(0);
  await expect(page.getByTestId('vote-ballot')).toHaveCount(0);
}

export async function expectCardHidden(page: Page): Promise<void> {
  await expectSecretAbsent(page);
  await expect(page.getByTestId('secret-card')).toHaveAttribute('data-revealed', 'false');
}

export async function passReveal(page: Page): Promise<void> {
  await page.getByTestId('reveal-pass').click();
}

export interface RoundSecrets {
  word: string;
  imposter: string;
}

export interface RevealAllOptions {
  /** Also look a second time on every turn (US-4). Default true. */
  lookTwice?: boolean;
  /** Called while each card is shown (e.g. to assert what the card says). */
  onCard?: (card: Card, name: string) => Promise<void>;
}

/**
 * Hold mode: reveal for every player in seating order, checking the pass screen, hidden/shown/hidden/
 * re-shown (US-3, US-4) and that only the Pass button advances. Returns the secret word and who the
 * Imposter is, so the vote can be steered.
 */
export async function revealAllHold(
  page: Page,
  names: readonly string[],
  { lookTwice = true, onCard }: RevealAllOptions = {},
): Promise<RoundSecrets> {
  let word = '';
  let imposter = '';
  for (const name of names) {
    await expect(page.getByTestId('pass-screen')).toBeVisible();
    await expect(page.getByTestId('pass-name')).toHaveText(name);
    await expectSecretAbsent(page);
    await waitForArmed(page);
    await expectCardHidden(page);
    await expect(page.getByTestId('reveal-pass')).toHaveCount(0);

    await holdDown(page);
    const card = await readCard(page);
    if (card.kind === 'imposter') imposter = name;
    else word = card.text;
    await onCard?.(card, name);
    await holdUp(page);
    await expectCardHidden(page);

    if (lookTwice) {
      // US-4: looking twice on the same turn.
      await holdDown(page);
      const again = await readCard(page);
      expect(again).toEqual(card);
      await holdUp(page);
      await expectCardHidden(page);
    }

    await passReveal(page);
  }
  expect(word).not.toBe('');
  expect(imposter).not.toBe('');
  return { word, imposter };
}

/** Click Next through every clue turn; asserts the round counter on the way. */
export async function playClues(page: Page, players: number, clueRounds = 2): Promise<void> {
  await expect(page.getByTestId('clues-screen')).toBeVisible();
  for (let r = 1; r <= clueRounds; r++) {
    for (let i = 0; i < players; i++) {
      await expect(page.getByTestId('clues-round')).toContainText(`${r}`);
      await page.getByTestId('clues-next').click();
    }
  }
}

export async function skipDiscussion(page: Page): Promise<void> {
  await expect(page.getByTestId('discussion-screen')).toBeVisible();
  await page.getByTestId('discussion-vote').click();
  await expect(page.getByTestId('vote-screen')).toBeVisible();
}

/** Hold mode: every player votes for `pick(voter)` (hold, tap a name, release, lock). */
export async function voteAllHold(
  page: Page,
  names: readonly string[],
  pick: (voter: string) => string,
): Promise<void> {
  for (const name of names) {
    await expect(page.getByTestId('pass-name')).toHaveText(name);
    await expectSecretAbsent(page);
    await waitForArmed(page);
    await expectCardHidden(page);
    await expect(page.getByTestId('vote-lock')).toHaveCount(0);

    await holdDown(page);
    await expect(page.getByTestId('vote-ballot')).toBeVisible();
    const options = page.getByTestId('ballot-opt');
    await expect(options).toHaveCount(names.length - 1);
    await expect(options.filter({ hasText: name })).toHaveCount(0); // own name excluded (US-8)
    await options.filter({ hasText: pick(name) }).click();
    await holdUp(page);
    await expectCardHidden(page); // the chosen name is never shown while flat

    await page.getByTestId('vote-lock').click();
  }
}

/** Guess screen if the Imposter was caught (type `guess`), then Results. */
export async function finishWithGuess(page: Page, guess: string): Promise<void> {
  const guessScreen = page.getByTestId('guess-screen');
  const results = page.getByTestId('results-screen');
  await expect(guessScreen.or(results)).toBeVisible();
  if ((await guessScreen.count()) > 0) {
    await page.getByTestId('guess-input').fill(guess);
    await page.getByTestId('guess-submit').click();
  }
  await expect(results).toBeVisible();
}

export function otherThan(names: readonly string[], excluded: string): string {
  const other = names.find((n) => n !== excluded);
  if (!other) throw new Error('need at least two names');
  return other;
}

export async function readSnapshot(page: Page): Promise<Record<string, unknown> | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STATE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

/** The persisted round, or null (typed loosely: the specs only read a few fields). */
export async function readRound(page: Page): Promise<Record<string, unknown> | null> {
  const snapshot = await readSnapshot(page);
  return (snapshot?.round as Record<string, unknown> | null | undefined) ?? null;
}

/** Load the app with `snapshot` already persisted, as a refresh mid-round would (resumes into the game). */
export async function seedSnapshot(page: Page, snapshot: unknown): Promise<void> {
  await page.goto('/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STATE_KEY, JSON.stringify(snapshot)]);
  await page.reload();
}

/**
 * Pick an option of a Settings control that has no test id (the On/Off switches) by the row's
 * aria-label and the option's label, e.g. pickSetting(page, 'Imposter sees the category', 'Off').
 */
export async function pickSetting(page: Page, groupLabel: string, optionLabel: string): Promise<void> {
  const option = page
    .getByRole('radiogroup', { name: groupLabel, exact: true })
    .getByRole('radio', { name: optionLabel, exact: true });
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
}

/** "m:ss" (the discussion clock) -> seconds. */
export function parseClock(text: string | null): number {
  const m = /(\d+):(\d{2})/.exec(text ?? '');
  if (!m) throw new Error(`not a m:ss clock: ${JSON.stringify(text)}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

// ---------------------------------------------------------------------------
// Fake orientation sensor (lift mode)
// ---------------------------------------------------------------------------

interface FakeSensorWindow {
  __beta: number;
  __sensorTimer?: number;
  __dispatchBeta: (beta: number) => void;
}

/**
 * Installs a fake sensor on every page of the context: a 50 ms interval dispatching
 * `deviceorientation` events on window with beta = window.__beta (gamma 0, portrait). It starts at a
 * flat 5 degrees so the app's 1.5 s "no readings => unsupported" probe is satisfied as soon as a
 * reveal screen subscribes. Change the angle with `setBeta`; silence the stream with `stopFakeSensor`
 * and dispatch single readings with `pulseBeta` (a phone at rest on Chrome Android stops reporting).
 */
export async function installFakeSensor(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as FakeSensorWindow;
    w.__beta = 5;
    w.__dispatchBeta = (beta: number) => {
      let ev: Event;
      try {
        ev = new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma: 0, absolute: false });
      } catch {
        ev = new CustomEvent('deviceorientation');
        Object.defineProperty(ev, 'beta', { value: beta });
        Object.defineProperty(ev, 'gamma', { value: 0 });
        Object.defineProperty(ev, 'alpha', { value: 0 });
      }
      window.dispatchEvent(ev);
    };
    w.__sensorTimer = window.setInterval(() => w.__dispatchBeta(w.__beta), 50);
  });
}

export async function setBeta(page: Page, beta: number): Promise<void> {
  await page.evaluate((b) => {
    (window as unknown as FakeSensorWindow).__beta = b;
  }, beta);
}

/** Stop the periodic readings on this page (the sensor "goes quiet"); `pulseBeta` still works. */
export async function stopFakeSensor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as FakeSensorWindow;
    if (w.__sensorTimer !== undefined) {
      window.clearInterval(w.__sensorTimer);
      w.__sensorTimer = undefined;
    }
  });
}

/** Dispatch exactly one reading with this beta. */
export async function pulseBeta(page: Page, beta: number): Promise<void> {
  await page.evaluate((b) => (window as unknown as FakeSensorWindow).__dispatchBeta(b), beta);
}

/**
 * Dispatch one reading and measure, inside the page, how long the secret card takes to reach
 * data-revealed={revealed}: the elapsed ms, or -1 when it does not happen within maxMs. With the fake
 * sensor stopped, only the app's own debounce timer can complete the transition.
 */
export async function pulseAndMeasure(page: Page, beta: number, revealed: boolean, maxMs = 3000): Promise<number> {
  return page.evaluate(
    ([b, want, max]) =>
      new Promise<number>((resolve) => {
        const card = document.querySelector('[data-testid="secret-card"]');
        if (!card) {
          resolve(-2);
          return;
        }
        (window as unknown as FakeSensorWindow).__dispatchBeta(b);
        const start = performance.now();
        const poll = () => {
          const elapsed = performance.now() - start;
          if (card.getAttribute('data-revealed') === String(want)) resolve(elapsed);
          else if (elapsed > max) resolve(-1);
          else setTimeout(poll, 5);
        };
        poll();
      }),
    [beta, revealed, maxMs] as const,
  );
}
