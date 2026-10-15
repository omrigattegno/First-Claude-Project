# Imposter — Pass-the-Phone Game Brief
(Oct 16, 2026 · Omri, DataMap)

## Overview
Imposter is a single-phone party game for 4–10 people sitting around a table. One phone is passed from hand to hand; each player lifts the phone toward their face to privately see the secret word, then passes it on. One player sees "IMPOSTER" instead of the word and has to bluff through a round of clues without getting caught.
- Players: friends at dinner, ages 14+, no account, no sign-up.
- Platform: mobile web app (PWA) first, installable on iPhone and Android; native wrappers later if needed.
- Session length: 3–5 minutes per round; setup under 30 seconds.
- Core promise: no cards, no second phone, no reading rules — the phone runs the whole round.
- Languages: Hebrew and English at launch; word packs are per language.

## Game rules (as the app runs them)
1. The host enters player names and picks a category (or Random).
2. The app draws one secret word from the category and secretly picks one player as the Imposter (two in 8+ player games, if enabled).
3. The phone is passed in seating order. Each player reveals their role privately, then passes.
4. The app announces a random starting player. Going clockwise, each player says one word or short clue about the secret word. The Imposter bluffs.
5. After the set number of clue rounds (default 2), the app opens discussion with a timer (default 60 seconds).
6. Everyone votes on the phone, one at a time, in private, for who they think the Imposter is.
7. Result: Imposter caught → the Imposter gets one typed guess at the word. Correct guess = Imposter wins; wrong = the table wins. Wrong player caught → Imposter wins.
8. Scores are kept across rounds; the app rotates roles and offers the next round with one tap.

Scoring (default): table wins → 1 point each to non-Imposters. Imposter survives vote → 3 points. Imposter caught but guesses the word → 2 points.

## Game flow
The phone is passed twice per round: once to reveal roles, once to vote. Every other screen is read by the whole table at once.

| # | Screen | What the player sees | Primary action |
|---|---|---|---|
| 1 | Home | Logo, Play, How to play, last game's players | Tap Play |
| 2 | Setup | Player name chips (add/remove/reorder), category picker, settings gear | Tap Start |
| 3 | Pass to | Big name of the next player, "Hold the phone flat" hint | Hand over the phone |
| 4 | Reveal | Blurred card; lifting the phone shows the word or IMPOSTER; lowering hides it | Lift, read, lower, tap Pass |
| 5 | Clue rounds | Starting player highlighted, turn order, round counter, optional clue log | Tap Next after each clue |
| 6 | Discussion | Countdown timer, Skip button | Wait or tap Vote now |
| 7 | Vote | Pass-to screen, then private ballot of all other names | Tap a name, tap Pass |
| 8 | Results | Who was voted, who the Imposter was, Imposter's guess field if caught, scoreboard | Tap Next round or End game |

## Pass-the-phone and lift-to-reveal
The reveal is driven by the phone's orientation, not by a tap, so a player can read their role without anyone across the table seeing the screen.

Pass state (phone flat on the table or in hand, screen up)
- Screen shows: "Pass to Dana" in large type, plus the hint "Lift the phone toward you to see your word".
- The word is never rendered while the phone is flat; the card is blurred and the text node is empty.

Lift state (phone tilted toward the player's face)
- Trigger: device pitch above ~45° from horizontal, held for 300 ms (debounced), using DeviceOrientation / accelerometer.
- Screen shows: the player's name, their role card — the secret word in large type, or "IMPOSTER" in red with the category underneath.
- Brightness hint: the card uses a dark background with light text to narrow the viewing angle.
- A "Got it — pass" button appears after 1 second. Tapping it advances to the next Pass screen.

Lower state (phone returns below ~30° pitch)
- The card blurs again within 150 ms. Lifting again re-shows it — a player may look twice.
- Lowering alone does not advance; only the Pass button does, so an accidental dip doesn't skip a player.

Fallbacks
- No sensor permission (iOS Safari requires a user gesture to grant it): the app asks once on Start; if denied, the card uses "Hold to reveal" — press and hold a button to show, release to hide.
- Phone with no motion sensors (desktop): hold-to-reveal is the default.
- Anti-peek: the "Pass to" screen shows a 3-second countdown before the sensor arms, giving time to hand the phone over.

Vote screen uses the same pattern: pass → lift → tap a name → lower → pass. The chosen name is never shown while flat.

## User stories
| ID | As a… | I want to… | So that… | Acceptance criteria |
|---|---|---|---|---|
| US-1 | Host | Add 4–10 player names in under 30 seconds | We start fast | Names persist for the next game; duplicates rejected; drag to reorder seating |
| US-2 | Host | Pick a category or Random | The words fit the group | At least 8 categories per language at launch; Random never repeats a word within the same evening |
| US-3 | Player | See my role only when I lift the phone toward me | Nobody else at the table can read it | Word hidden below 30° pitch, shown above 45°, blur within 150 ms of lowering |
| US-4 | Player | Look at my word a second time | I didn't forget it | Lifting again on the same turn re-shows the card; no advance until Pass is tapped |
| US-5 | Imposter | See the category | I can bluff plausibly | IMPOSTER card always shows the category name |
| US-6 | Table | Know who speaks first and in what order | No arguing | App picks a random starter and shows the turn order; starter is never the Imposter more often than chance |
| US-7 | Table | Have a discussion timer | Rounds don't drag | Default 60 s, adjustable 30–180 s, audible beep at 10 s left, Skip button |
| US-8 | Player | Vote privately | Voting isn't swayed by others | Ballot shown only in lift state; my own name excluded; vote locked on Pass |
| US-9 | Imposter | Guess the word if caught | I still have a chance to win | Free-text field, case/whitespace-insensitive match, synonyms list per word optional |
| US-10 | Table | See scores across rounds | We can play a best-of | Scoreboard on Results; persists until End game; roles rotate fairly (Imposter weighted away from recent Imposters) |
| US-11 | Host | Change rules mid-evening | Different groups like different variants | Settings reachable from Setup and Results; changes apply from the next round |
| US-12 | Anyone | Play with no internet | Works at any restaurant | PWA caches app shell and word packs; no network call needed to run a round |
| US-13 | Anyone | Play without granting sensor access | Privacy-conscious friends can still play | Hold-to-reveal fallback is fully equivalent in flow |
| US-14 | Host | Read a 30-second how-to | First-time groups get it | One-screen rules with the lift gesture illustrated; linked from Home and Setup |

## Word packs
Words ship as static JSON per language and category, bundled with the app so no round needs the network.
- Launch categories (HE + EN): Food, Places, Animals, Movies & TV, Sports, Household, Professions, Famous people, Israeli-specific (HE only: street food, cities, slang).
- Pack size: at least 40 words per category; a word is marked used for the evening and not redrawn.
- Word record: { word, category, difficulty (1–3), aliases[] } — aliases feed the Imposter's guess matching.
- Difficulty filter: Easy / Normal / Hard in settings; Hard words are more specific ("espresso" rather than "coffee").
- Custom pack: host can type their own words (inside jokes, people at the table); stored on device only.
- Paired-word variant (later): each pack may carry an optional pair field ("beach" / "pool") for the Undercover-style mode where the Imposter gets a similar word instead of none.

## Settings and variants
| Setting | Default | Range / options |
|---|---|---|
| Number of Imposters | 1 | 1–2 (2 only with 7+ players) |
| Clue rounds before discussion | 2 | 1–3 |
| Discussion timer | 60 s | 30–180 s, or off |
| Imposter sees category | On | On / Off (harder for Imposter) |
| Imposter gets a guess when caught | On | On / Off |
| Reveal method | Lift to reveal | Lift / Hold button |
| Word difficulty | Normal | Easy / Normal / Hard |
| Language | Device language | Hebrew / English |
| Penalty prompt on Results | Off | Off / Dare / Drink (shows a fun prompt for the losing side) |

Variants worth planning for, not building first: Undercover mode (Imposter gets a similar word), Mr. White mode (Imposter can interrupt and guess at any time), team scoring, and a "blind host" mode where the host also plays.

## Technical notes
- Stack: single-page PWA (React or Svelte + Vite), no backend for MVP. State lives in memory with a snapshot in localStorage so a refresh mid-round can resume.
- Sensors: DeviceOrientationEvent (beta = pitch). iOS 13+ needs DeviceOrientationEvent.requestPermission() inside a tap handler — call it on the Start button. Android Chrome works without a prompt. Debounce 300 ms up, 150 ms down; thresholds configurable in a constants file for tuning.
- Screen behaviour: request screen.wakeLock so the phone doesn't sleep while passed around; disable pull-to-refresh and text selection on the reveal card.
- RTL: full Hebrew RTL layout with dir set from the language; Arial or system Hebrew font; word cards tested with long Hebrew words (up to 14 characters) at the largest size.
- Randomness: crypto.getRandomValues for Imposter and starter selection; Imposter selection weighted so no player is Imposter twice in a row unless the table is 4 players.
- Privacy: no accounts, no analytics in MVP, no data leaves the device. Sensor data is read only during reveal and vote screens.
- Testing: unit tests for the game state machine (setup → reveal × n → clues → discussion → vote × n → results); manual device matrix: iPhone Safari, Android Chrome, one tablet.
- Distribution: hosted at a short URL with an "Add to Home Screen" prompt; app-store wrappers (Capacitor) only if the PWA sensor flow proves unreliable on iOS.

## Scope
MVP (first playable evening): Setup with names and category; Lift-to-reveal with hold-to-reveal fallback; Clue rounds with turn order and round counter; Discussion timer; Private vote, Imposter guess, Results with scoreboard; Hebrew and English word packs, 8 categories each; Offline PWA, wake lock, RTL.
V1.1: Settings screen with all variants in the table above; Custom word packs; Two Imposters; Penalty prompts.
Later: Undercover and Mr. White modes; Multi-phone mode; Sound and haptics on reveal and timer; Stats across evenings.

## Open questions (decisions taken for this build)
- Clues typed or spoken? → spoken only (no clue log in MVP).
- Imposter sees category by default? → On by default, toggle in Settings.
- Name → "Imposter" (Hebrew: מתחזה).
- Lift threshold angles → constants in src/game/constants.ts for tuning on real tables.
