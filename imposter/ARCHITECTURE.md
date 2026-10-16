# Imposter — architecture and module contract

Single-page PWA, React 19 + Vite 7 + TypeScript, no backend. Everything runs on one phone.
Read `BRIEF.md` for the product brief (rules, screens, user stories, settings).

## Layout

```
src/
  game/        pure, framework-free game logic (unit-tested with vitest, node env)
    types.ts       all shared types (GameState, RoundState, Settings, Action, WordPack...)
    constants.ts   tunables: player limits, sensor thresholds, points, storage keys
    rng.ts         crypto rng, seededRng (tests), pickOne/pickWeighted/shuffle, newId
    guess.ts       normalizeText + guessMatches (case/whitespace/punctuation-insensitive, Hebrew ה-prefix tolerant)
    engine.ts      reduce(state, action), createInitialState, prepareRound (randomness), selectors, validation
    storage.ts     localStorage snapshot (resume after refresh; upgradeState fills fields older snapshots lack),
                   last players, saved settings, detectLanguage
    store.tsx      <GameProvider>, useGame() -> { state, dispatch, startRound, addPlayer, packs }, useGameState();
                   bootState() pre-fills last game's players once per boot when there is no snapshot; follows
                   the 'storage' event so a second window (tab + installed app) adopts the newer snapshot
  words/       word packs: en/*.json, he/*.json (static imports -> bundled, offline); index.ts; custom.ts (host packs,
               ids prefixed CUSTOM_PACK_PREFIX; cache invalidated on a cross-window 'storage' event)
  i18n/        messages.common.ts (shared), messages.pregame.ts, messages.game.ts; index.ts -> useT(), translate()
  hooks/       useReveal (lift/hold controller), useWakeLock
  lib/         sensors.ts (DeviceOrientation + permission), audio.ts (beep via WebAudio), pwa.ts
  components/  shared: Button, TopBar, Segmented, Modal, InstallPrompt, GameMenu
  screens/     one file per screen; GameScreen.tsx switches on state.phase
  styles/      tokens.css (design tokens), base.css
  nav.tsx      useNav(): screen stack for home/howto/setup/settings/game
  App.tsx      sets <html lang dir>, wake lock, renders the current screen
```

## State machine (src/game/engine.ts)

Phases: `setup -> reveal -> clues -> discussion -> vote -> [guess] -> results`.

| Phase | Who holds the phone | Action to advance |
|---|---|---|
| setup | host | `START_ROUND` (built by `prepareRound(state, packs, rng)`; use `useGame().startRound()`) |
| reveal | `currentRevealer(state)` = `round.order[round.revealIndex]` | `REVEAL_NEXT` (after the last player -> clues) |
| clues | table; `currentSpeaker(state)`; `clueOrder(round)` starts at `starterId`; `round.clueRound` / `round.config.clueRounds` | `CLUE_NEXT` (after last turn of last round -> discussion, or -> vote when `config.discussionSeconds === 0`) |
| discussion | table | `DISCUSSION_START {endsAt}` once on mount (DiscussionScreen dispatches `Date.now() + config.discussionSeconds * 1000` when `round.discussionEndsAt` is null; the reducer ignores it otherwise, so StrictMode/remounts keep the first deadline and a reload resumes the countdown), then `DISCUSSION_DONE` |
| vote | `currentVoter(state)`; ballot = `ballotFor(state, voterId)` (excludes self) | `CAST_VOTE {voterId, votedId}` (after last voter -> guess if Imposter caught && config.imposterGuess, else results) |
| guess | `guessingImposter(state)` types a guess | `SUBMIT_GUESS {guess}` -> results |
| results | table; `round.outcome`, `scoreboard(state)` | `START_ROUND` (next round), `EDIT_PLAYERS` (-> setup, keeps scores), `END_GAME` (-> setup, clears scores/history/usedWords) |

Other actions: `ADD_PLAYER/REMOVE_PLAYER/RENAME_PLAYER/REORDER_PLAYERS/SET_PLAYERS` (setup only),
`UPDATE_SETTINGS {patch}` (any time; rule values are frozen into `round.config` at START_ROUND, so changes
apply from the next round; `language`/`revealMethod` apply immediately), `ABORT_ROUND` (-> setup, keeps scores),
`LOAD {state}` (replaces the state; runs `upgradeState`). Removing a player is not lossy: `REMOVE_PLAYER` moves
them to `state.benched` and keeps their score, and `ADD_PLAYER` with a benched name (case-insensitive) reuses
that id so the score and Imposter history return; `END_GAME` clears the bench. `scoreboard()` lists current
players only. The reducer never reads the clock: screens pass `Date.now()` in the action (`DISCUSSION_START`).

Outcome rules (`RoundOutcome`): plurality vote; a tie at the top means nobody is caught (`votedOutId = null`,
`tie = true`) and the Imposter wins. Caught + correct guess -> Imposter wins. Points: table win = 1 to each
non-Imposter; Imposter survives = 3; caught but guesses right = 2 (constants.ts). With two Imposters the
voted-out Imposter guesses; both Imposters score together.

Imposter selection: never the previous round's Imposter on tables of 5+ (weight 0), weight 0.5 for the
Imposter of two rounds ago. Starter: uniform. Two Imposters only when `settings.imposterCount === 2` and
players >= 7 (`effectiveImposterCount`). Words: category-first for Random, never repeated within the
evening (`usedWords`, most recent draw last), difficulty Easy={1} Normal={1,2} Hard={2,3}, relaxing if a
category runs dry; once a pack is exhausted its words are recycled but never the word that pack served
last. Custom (host-typed) packs match every difficulty.

Snapshot validation (`isGameState`): a non-null round must have `word.word`, `config`, indices inside
`order`, `imposterIds`/`starterId` in `order`, and an `outcome` in the guess/results phases; otherwise the
snapshot is dropped and the app boots fresh rather than rendering a blank phase screen.

## i18n

`useT()` returns `t(key, params)`; keys are flat strings (`'setup.title'`). Each messages module exports
`{ en, he }` where `he: Record<keyof typeof en, string>` so a missing Hebrew key fails typecheck.
Placeholders: `{name}` -> `t('pass.to', { name })`. `document.dir` is set from the language; use CSS
logical properties (`margin-inline-start`, `padding-inline`, `text-align: start`) so layouts mirror in RTL.
No external fonts (offline): the system font stack is in tokens.css.

## Reveal contract (hooks/useReveal.ts, lib/sensors.ts)

`useReveal({ method, armed })` -> `{ revealed, effectiveMethod, permission, holdProps }`.
- The secret text must only be in the DOM while `revealed` is true (empty text node otherwise), on a black
  card with light text, blurred/hidden when not revealed.
- `armed=false` during the 3-second anti-peek countdown on the Pass screen.
- Lift: pitch (DeviceOrientationEvent.beta) > LIFT_UP_DEGREES held LIFT_UP_DEBOUNCE_MS shows; < LIFT_DOWN_DEGREES
  for LIFT_DOWN_DEBOUNCE_MS hides. Lowering never advances; only the Pass button does.
- Hold fallback: spread `holdProps` on a big "Hold to reveal" button (press shows, release hides).
- `requestSensorPermission()` must run inside a tap handler (iOS 13+); call it from Setup's Start button when
  `settings.revealMethod === 'lift'`.
- Vote uses the same pattern: ballot visible only while revealed; the chosen name is never shown while flat.

## Conventions

- Mobile first (375px wide), dark theme, 48px minimum tap targets, safe-area insets (`.screen`).
- Pure logic goes in `src/game` with tests; screens stay thin.
- Run `npx tsc --noEmit` and `npx vitest run` before finishing. `npm run build` does typecheck + Vite build.
- End-to-end: `npm run build && npx playwright test` (e2e/, mobile Chromium against `vite preview`). Screens
  and controls carry `data-testid` attributes (`home-play`, `setup-start`, `secret-card`, `hold-button`,
  `ballot-opt`, ...); keep them when restyling. `npm run test:e2e:screenshots` captures review PNGs.
- Deps are installed; do not run `npm install` from parallel builders.
