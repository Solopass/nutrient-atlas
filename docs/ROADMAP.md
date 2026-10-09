# Roadmap: the best nutrition app

## The bet

Every major tracker (MyFitnessPal, Cronometer, MacroFactor) is built around a **food diary + calorie budget**. Cronometer tracks micronutrients well but shows them as long lists of progress bars. Nobody makes micronutrients *understandable at a glance* or *actionable*.

Nutrient Atlas wins by being:

1. **Nutrients-first:** one visual answers "did I nourish myself?" in 5 seconds.
2. **Honest:** it separates "you're low" from "we don't know" (data coverage, confidence, sources).
3. **Actionable:** it always tells you the *next* food that closes the most gaps.
4. **Frictionless:** logging a meal takes seconds (search, re-log, AI, barcode, photo).
5. **Private:** local-first. Your data stays on your device unless you choose to sync.

## Product principles

- A **week** is the unit of truth for micronutrients. DRIs describe average intake over time, so one low day is not a deficiency. Default views should reward consistency, not punish single days.
- **Missing ≠ zero.** Never show a false deficiency. Show coverage and let the user fill gaps.
- **Every number is explainable:** tap anything to see target source (RDA/AI/UL), foods contributing, and data quality.
- **Suggestions beat scores.** A score says how you did; a suggestion says what to do.
- **Not medical advice.** Use DRIs for healthy people, and point to clinicians for conditions, medications and megadoses.

## Status

| # | Milestone | Status |
|---|---|---|
| 0 | Nutrient Atlas UI (radial chart, periodic table, detail panel) | ✅ Done |
| 1 | Foundation: Vite/React/TS/Tailwind, Dexie local DB, USDA import pipeline | ✅ Done |
| 2 | Logging: USDA search with portions, AI copy/paste estimate, My foods, Today | ✅ Done |
| 2.5 | Settings: profile, DRI personal targets (14+, pregnancy/lactation), goals, energy, diet, backup | ✅ Done |
| 3 | Real history and weekly view | ✅ Done |
| 4 | Supplements and "limit" nutrients | ✅ Done |
| 5 | Daily driver: PWA, quick add, copy meals, saved meals/recipes, USDA suggestions, label foods, first-run setup, typed-barcode lookup ✅ · phone camera scanning (needs hosting) | Mostly done |
| 6 | AI automation: API proxy, photo logging, USDA grounding (now Phase C) | Planned |
| 7 | Sync across devices, native wrappers, health-app export (now Phase D) · CSV export ✅ | Started |
| 8 | Insights and coaching: weekly report, diet risks, interaction tips, lab values and trends ✅ · AI coach (Phase C) | Mostly done |
| 9 | Atlas+: by-meal colouring, 7-day whiskers, replay, what-if preview, food footprint, image export ✅ | Done |
| 10 | Products: rate brands (labels, CSV, AI, barcode), testing badges, compare ✅ · community ratings | Mostly done |

## The plan from here (updated October 2026)

Four phases, ordered by what each one unlocks. **Phase A needs nothing from you.** Each later phase starts with a decision only you can make (hosting, an AI budget, accounts), so they wait until you say go.

Every session, whatever the phase, ends the same way: a bug sweep (code review plus a click-through on a separate test port, so your data is never touched), a test for each fix, updated SPEC/ROADMAP, and a local commit.

### Phase A: polish and trust ✅ (all but A1 done, October 2026)

The goal: make it good enough that you want to open it every day, and fix what daily use shows up.

| # | Item | Why | Size |
|---|---|---|---|
| A1 | **You use it for a week**, and we keep a friction list (anything slow, confusing or missing) | Real use finds problems no review does | – |
| A2 ✅ | **Colour-blind-safe status** (shapes and patterns alongside red/yellow/green) and a **light theme** | About 1 in 12 men can't tell the status colours apart | M |
| A3 ✅ | **"Day complete" button**, so today counts in the weekly view before midnight | Removes the last "today is still in progress" distortions | S |
| A4 ✅ | **Vitamin D sun setting** ("I get regular sun"), so vitamin D isn't always red for people who get sun | Removes a false alarm, in line with the "honest" principle | S |
| A5 ✅ | **Lab results over time** (a trend per test) plus more tests: folate, magnesium, omega-3 index | Shows whether changes are working | M |
| A6 ✅ | **What's new** tips for Products, Replay, By meal and Preview | These features are hard to find right now | S |
| A7 ✅ | **Speed:** USDA table, search, Best next food and weekly food ideas moved to a Web Worker. Simulated slow phone (6× CPU): main-thread blocking on dashboard load 2.07 s → 1.08 s, longest freeze 0.54 s → 0.35 s | First load on phones | S–M |
| A8 ✅ | **End-to-end smoke test** (setup → log → dashboard → products) using the headless Edge script we already have | Catches regressions across the whole app | M |
| A9 ✅ | *Stretch:* drag a wedge on the Atlas to adjust a portion | Makes the chart itself the logging tool | M |

### Phase E: depth and speed. No hosting, no cost. Next 2–3 sessions

What Phase A taught us:
- **Rendering:** with the food table moved to a worker, most of what's left on a slow phone is drawing the dashboard.
- **Bundle size:** the main JavaScript bundle is 640 KB, because every page loads up front.
- **Features:** useful ones remain that need no server.

| # | Item | Why | Size |
|---|---|---|---|
| E1 | **Load pages on demand** (Products, History, Settings and the log sheet tabs split from the main bundle) | The dashboard opens with about half the code | S |
| E2 | **Lighter dashboard draw** (periodic table and limits render after the Atlas; measured with the production build at 6× throttle) | The remaining ~1 s of blocking on slow phones | S–M |
| E3 | **Recipe builder** (search ingredients, set quantities and number of servings → a saved recipe with per-serving nutrients) | Home cooking is the hardest thing to log today | M |
| E4 | **Report for your clinician** (one page: 30-day averages, persistent gaps, supplements and doses, lab trends; print or save as PDF) | Turns the data into a conversation with a doctor or dietitian | M |
| E5 | **Your own targets** (override a nutrient's target, e.g. on clinician advice, shown as "custom") | DRIs are for healthy people; some people have different needs | S–M |
| E6 | **Backup reminder** in the app (no backup in 14 days → a gentle banner with one-tap export) | Local-first data needs backups; this doesn't need hosting | S |
| E7 | **Pre-commit check** (typecheck + tests on every commit; e2e before larger changes) | Keeps regressions out automatically | S |

### Phase B: live on your phone. **Decision: hosting** (free: private GitHub repo + Cloudflare Pages, see [HOSTING.md](HOSTING.md))

| # | Item | Size |
|---|---|---|
| B1 | Push to a private GitHub repo; Cloudflare Pages builds each push. Needs your OK and two free accounts | S |
| B2 | Install on your phone; one-week field test (offline, notch, keyboard, storage protection when installed) | – |
| B3 | Camera barcode scanning everywhere, including iPhone (a small scanning library as a fallback) | M |
| B4 | Weekly backup reminder, plus "export to Files/Drive" on phones | S |
| B5 | Optional reminders: "log dinner?", "took your supplements?" (web push works for installed apps, iOS 16.4+) | M |

### Phase C: AI that just works. **Decision: API key and a monthly budget cap** (typical use is cents a day)

| # | Item | Size |
|---|---|---|
| C1 | Small server (Cloudflare Worker) that holds the API key and enforces the budget cap; the app never sees the key | M |
| C2 | One-tap AI meal estimate using the existing review screen (copy/paste stays as the free option) | S |
| C3 | **Photo logging:** snap a plate → foods and grams → review → log | M |
| C4 | **USDA grounding:** the AI names foods and grams, nutrients come from USDA (more accurate and consistent) | M–L |
| C5 | Label or product-page photo → straight into Products | S |
| C6 | **AI coach:** "why am I always low on magnesium?", answered from your own logs | M |

### Phase D: accounts, sync and community. **Decision: accounts and a backend** (e.g. Supabase or Cloudflare D1)

| # | Item | Size |
|---|---|---|
| D1 | Optional account with end-to-end encrypted sync between phone and computer | L |
| D2 | **Community product ratings:** publish your ratings and see others' averages per brand (with basic moderation) | L |
| D3 | Native app wrapper (Capacitor) → Apple Health / Google Fit export, app stores | L |

### Decisions waiting on you

1. **Now:** use it for a few days and tell me what bugs you. That drives Phase A.
2. **When ready:** hosting go-ahead (Phase B). This unlocks phone install and camera scanning.
3. **Later:** AI budget (Phase C) and accounts (Phase D).

**Recommended next session:** E1 + E2 + E6 (faster and safer, all small), then E3 (recipe builder), with a bug sweep and the e2e test.

**Biggest unlock still waiting:** hosting (Phase B). It gets the app onto your phone and enables camera scanning everywhere. It's also the base for sync (D1) and AI photo logging (C3).

## What's shipped (and what each round taught us)

Details of how everything behaves are in [SPEC.md](../SPEC.md). This is the history, kept short.

**Foundation (M0–M2.5):**
- Shipped: the radial Atlas, periodic table and detail panel; the Vite/React/Dexie/USDA pipeline; USDA search with real portions; AI copy/paste estimates; My foods; Settings with DRI targets by age, sex and life stage.

**History and the 7-day view (M3):**
- Shipped: daily scores computed from logs, Day / 7-day switch, date navigation and back-filling, 30-day trends, a History page with calendar, persistent gaps and heatmap, removable sample history.
- *Learned:* partial days distort averages. "In progress" became first-class, and later got *Done for today*. USDA-only diets show gaps that are really missing data, so labels and supplements matter.

**Supplements and limits (M4):**
- Shipped: label-based supplements, auto-logged daily, supplement-only upper limits, and seven "stay under" limits outside the score.

**Daily driver (M5):**
- Shipped: PWA (offline), Quick add, saved meals and recipes, label foods, first-run setup, Best next food, one-click launcher and installable app on this PC, typed barcode lookup.

**Insights (M8):**
- Shipped: the weekly report (wins, gaps with food ideas, limits, diet and life-stage risks, food-pairing tips) and blood tests with history and trends (vitamin D, ferritin, B12, folate, magnesium, omega-3 index).
- *Learned:* the vitamin A upper limit needed a retinol column (beta-carotene isn't capped). A normal blood magnesium can hide a shortfall.

**Atlas+:**
- Shipped: colour by meal, supplement share, previous-period ticks, 7-day whiskers, replay, what-if preview, food footprint, drag-to-resize portions, image export, slim phone ring, keyboard navigation and a screen-reader summary.

**Products:**
- Shipped: rating brands from labels, CSV, shared lists, AI-read photos or barcodes; personal A–E scores (gaps, dose and upper limits, forms, density, value, third-party testing); compare; rated foods in Best next food.
- *Learned:* value has to compare like with like (magnesium with magnesium), or multivitamins always win. Supplements are judged against food alone.

**Phase A (polish and trust):**
- Shipped: light theme and colour-blind safe palette with shape markers, sun setting, What's new, the USDA Web Worker (main-thread blocking on a simulated slow phone halved), and the whole-app e2e test.
- *Learned:* the daily app needed its own build folder, and headless browser tests must kill the whole process tree.

**Bug sweeps:** after every round; each fix has a test where it can.

## Engineering backlog

- **Tests ✅:** `bun test` (~150 unit tests) and `bun run e2e` (whole app, headless). Next: e2e steps for the log sheet's AI and label flows, and Products compare; a pre-commit check (E7).
- **Bundle:** the main JavaScript chunk is 640 KB because every page loads up front. Split pages and log tabs (E1).
- **Rendering:** most remaining slow-phone time is drawing the dashboard. Defer below-the-fold sections (E2).
- **Accessibility ✅:** keyboard Atlas, screen-reader summary, colour-blind palette and shapes, inert hidden panels, focus moves into dialogs. Next: an audit with a real screen reader.
- **Error boundary ✅:** crash screen with Reload, Back to Atlas and Download backup. Test with `#/dev/crash` in dev.
- **Data refresh:** rebuild the USDA table when a new Foundation Foods release lands (`bun run build:usda`); review DRI and limit sources yearly.
