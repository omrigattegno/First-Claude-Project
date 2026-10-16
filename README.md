# Imposter

A pass-the-phone party game for 4–10 people around a table. One phone, no cards, no second device,
no account. The app draws a secret word and secretly makes one player the Imposter; everyone lifts the
phone toward their face to see their role privately, gives one-word clues, discusses, votes in private,
and the Imposter gets a last guess if caught. Hebrew and English, with word packs per language, playable
fully offline as an installable PWA.

The product brief is in [`BRIEF.md`](BRIEF.md); the module contract and state machine are in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Run it

```sh
npm install
npm run dev          # vite --host: prints a http://<LAN-IP>:5173 URL you can open on a phone
```

The lift-to-reveal gesture and the screen wake lock only work in a **secure context** (HTTPS or
`localhost`). A phone on the LAN opening `http://192.168.x.x:5173` gets the hold-to-reveal fallback and
no wake lock. To test the real thing on a device:

- run `npx vite --host` and put a tunnel in front of it (`npx localtunnel --port 5173`, `cloudflared
  tunnel --url http://localhost:5173`, ngrok, …), then open the HTTPS URL on the phone; or
- push to `main`/`master` and open the GitHub Pages URL (see *Deploy*):
  `https://omrigattegno.github.io/imposter/`.

On a desktop browser there are no motion sensors, so the reveal uses the hold-to-reveal button.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on the LAN (`vite --host`) |
| `npm run build` | `tsc --noEmit` + `vite build` → `dist/` (service worker, manifest, icons included) |
| `npm run preview` | Serves `dist/` (`vite preview --host`) |
| `npm run typecheck` | TypeScript only |
| `npm test` / `npm run test:watch` | Unit tests (vitest, node environment) |
| `npm run test:e2e` | Playwright end-to-end tests against `dist/` (build first) |
| `npm run icons` | Regenerates every icon from `scripts/make-icons.mjs` |

## Test

**Unit** (`src/**/*.test.ts`, vitest, node environment): the state machine, guess matching, RNG,
storage, sensors and the PWA helpers.

```sh
npm test
npx vitest run src/game/engine.test.ts   # one file
```

**End-to-end** (`e2e/`, Playwright, `playwright.config.ts`): a 390×844 mobile Chromium project with
touch, run against the production build served by `vite preview` on port 4173.

```sh
npm run build
npm run test:e2e                     # starts vite preview itself
PWDEBUG=1 npm run test:e2e           # inspector
npm run test:e2e:screenshots         # review captures -> ./screenshots/*.png (gitignored)
```

The specs: `round-hold.spec.ts` (a whole round with the hold button, resume after a reload, next round),
`round-lift.spec.ts` (the same round driven by synthetic `deviceorientation` events), `hebrew.spec.ts`
(RTL, Hebrew UI and card) and `offline.spec.ts` (the shell loads with the network cut once the service
worker is installed). Selectors are `data-testid` attributes on the screens, so the same helpers
(`e2e/helpers.ts`) drive both languages. Holding is simulated with synthetic touch pointer events, which
leaves the mouse free to tap a ballot name while the card is held, like a second finger would.

The config uses the Chromium preinstalled under `PLAYWRIGHT_BROWSERS_PATH` (default
`/opt/pw-browsers`) when present, so `playwright install` is not needed there; on a machine without
it, Playwright resolves its own browser as usual. Build and preview must use the same `VITE_BASE`.

## Build and deploy

```sh
npm run build                            # base "/"
VITE_BASE=/imposter/ npm run build       # under a sub-path (GitHub Pages project site)
```

`VITE_BASE` sets Vite's base, the manifest `start_url`/`scope` and the service worker's navigation
fallback, so one build works from exactly one path.

Deployment is automatic: `.github/workflows/deploy-pages.yml` builds the app on every push to
`main`/`master` (or on *Run workflow*) with Node 22 and publishes `dist` with `actions/deploy-pages`.
The workflow enables Pages itself on the first run; if that is refused, set **Settings → Pages →
Build and deployment → Source: GitHub Actions** once. The site then lives at
`https://<owner>.github.io/<repo>/` (or at the root for a repo named `<owner>.github.io`).

### Offline and install

- Everything is precached by the service worker (Workbox via `vite-plugin-pwa`): app shell, styles and
  the word packs, which are static JSON imports bundled into the JavaScript. After the first visit no
  round needs the network, and the app makes no runtime network calls at all (no fonts, no CDNs, no
  analytics).
- Updates: `registerType: 'autoUpdate'`. A new build's worker is installed silently in the background
  and takes control of the page; `src/lib/pwa.ts` passes a no-op `onNeedReload`, so the page is
  deliberately not reloaded when that happens and the new build is used from the next launch.
- Install card (Home screen, `src/components/InstallPrompt.tsx`): on Android/desktop Chromium it
  triggers the native *Add to Home Screen* dialog; on iOS it explains *Share ▸ Add to Home Screen*.
  It hides when the app already runs standalone, and "Not now" remembers the dismissal on the device
  (`localStorage` key `imposter.v1.installDismissed`).
- Icons (`public/icon.svg`, `public/favicon.svg`, `public/icons/*.png`, `public/apple-touch-icon.png`)
  are generated from one geometry definition in `scripts/make-icons.mjs` (no native deps). Edit the
  geometry there and run `npm run icons`; `vite.config.ts` holds the manifest that references them.

## Tuning the lift gesture

All thresholds are constants in [`src/game/constants.ts`](src/game/constants.ts):

| Constant | Default | Meaning |
|---|---|---|
| `LIFT_UP_DEGREES` | 45 | Pitch (DeviceOrientation `beta`) above which the card shows |
| `LIFT_DOWN_DEGREES` | 30 | Pitch below which it hides again |
| `LIFT_UP_DEBOUNCE_MS` | 300 | How long the phone must stay up before showing |
| `LIFT_DOWN_DEBOUNCE_MS` | 150 | How long it must stay down before hiding |
| `PASS_COUNTDOWN_SECONDS` | 3 | Anti-peek delay before the sensor arms on the *Pass to* screen |
| `PASS_BUTTON_DELAY_MS` | 1000 | Delay before the *Got it, pass* button appears |

Lowering the phone never advances the game; only the Pass button does.

## iOS notes

- **Sensor permission needs a tap.** iOS 13+ only grants `DeviceOrientationEvent.requestPermission()`
  inside a user gesture, so the app asks when the host taps *Start* (with *Lift to reveal* selected).
  If denied, or when the page is not served over HTTPS, the round uses *Hold to reveal* instead; the
  flow is otherwise identical. Safari may ask again on a later visit.
- **Wake lock needs iOS 16.4+** (Screen Wake Lock API in Safari) and HTTPS. On older iOS the screen may
  dim while the phone is passed around; raise the auto-lock time in Settings for the evening.
- **Install:** Safari has no install prompt; use *Share ▸ Add to Home Screen*. The installed app opens
  full screen (`display: standalone`), in portrait, with the dark status bar.
- Pull-to-refresh and text selection are disabled on the reveal card, and the game state is snapshotted
  to `localStorage`, so an accidental refresh resumes the round.

## Folder layout

```
imposter/
  public/            icons, favicon, apple-touch-icon (generated by scripts/make-icons.mjs)
  scripts/           make-icons.mjs
  e2e/               Playwright tests
  src/
    game/            pure game logic + tests (types, constants, rng, guess, engine, storage, store)
    words/           word packs: en/*.json, he/*.json, custom packs
    i18n/            messages.*.ts (en + he), useT()/useLang()
    hooks/           useReveal, useWakeLock
    lib/             sensors, liftDetector, audio, pwa
    components/      shared UI (Button, TopBar, Modal, InstallPrompt, …), game/ and pregame/ parts
    screens/         Home, HowTo, Setup, Settings, Game
    styles/          tokens.css, base.css, pregame.css
  vite.config.ts     base path, PWA manifest + Workbox, vitest
  playwright.config.ts
```

`ARCHITECTURE.md` documents each module's contract, the phase state machine and the reveal contract.

## Privacy

No accounts, no analytics, no network calls. Player names, settings and the in-progress round live
only in the phone's `localStorage`; sensor data is read only on the reveal and vote screens.
