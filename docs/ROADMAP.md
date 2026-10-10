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
| 5 | Daily driver: PWA, quick add, copy meals, saved meals, recipe builder, USDA suggestions, label foods, first-run setup, typed-barcode lookup, backup reminder ✅ · phone camera scanning (needs hosting) | Mostly done |
| 6 | AI automation: API proxy, photo logging, USDA grounding (now Phase C) | Planned |
| 7 | Sync across devices, native wrappers, health-app export (now Phase D) · CSV export ✅ | Started |
| 8 | Insights and coaching: weekly report, diet risks, interaction tips, lab values and trends, clinician report, custom targets ✅ · AI coach (Phase C) | Mostly done |
| 9 | Atlas+: by-meal colouring, 7-day whiskers, replay, what-if preview, food footprint, image export ✅ | Done |
| 10 | Products: rate brands (labels, CSV, AI, barcode), testing badges, compare ✅ · community ratings | Mostly done |

## The plan from here (updated October 2026)

Phases ordered by what each one unlocks. **Phases A, E and F need nothing from you.** B, C and D each start with a decision only you can make (hosting, an AI budget, accounts), so they wait until you say go.

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

### Phase E: depth and speed ✅ (October 2026)

| # | Item | Result |
|---|---|---|
| E1 ✅ | **Load pages on demand** | History, Products, Settings, setup, the report and the log-sheet tabs are separate chunks. Main chunk 627 → 478 KB; the rest is mostly React DOM and Dexie, which the dashboard needs |
| E2 ✅ | **Lighter dashboard draw** | A CPU profile showed the 7-day whiskers recomputing each day's intake once per nutrient; now cached per day. Limits, periodic table and legend draw right after the Atlas. Slow phone (6× CPU, production build): the Atlas appears after ~1.2–1.6 s instead of ~2.2–3.0 s |
| E3 ✅ | **Recipe builder** | My foods → Build a recipe: ingredients from your foods or USDA, portions, live per-portion nutrients; edit any saved meal |
| E4 ✅ | **Report for your clinician** | History → Report: 30/60/90 days, key findings, every nutrient vs target with data quality, limits, supplements against upper limits, blood tests; prints cleanly or saves as PDF |
| E5 ✅ | **Your own targets** | Tap any target in Settings; applied everywhere, shown as "custom", standard kept for reference, warning above the upper limit |
| E6 ✅ | **Backup reminder** | Dashboard banner after 14 days without a backup (or a week of logs and none yet); one-tap export or snooze a week |
| E7 ✅ | **Pre-commit check** | Typecheck + unit tests on every commit (`.githooks`, enabled by `bun install`) |

### Phase F: make the data work harder. No hosting, no cost. Next 2–3 sessions

| # | Item | Why | Size |
|---|---|---|---|
| F1 ✅ | **Plan tomorrow:** 2–4 foods that close the gaps of a typical day together (greedy: each pick targets what the others leave), preview on the Atlas, swap one at a time, save; next day a checklist with one-tap logging | Best next food finds one food; a plan fixes the week | M |
| F2 ✅ | **Paste a recipe:** paste an ingredient list (from a website or notes), match each line to USDA foods and grams, review in the recipe builder | Building recipes by hand is still slow | M |
| F3 ✅ | **Barcode in the log sheet:** typed or pasted (or USB-scanned) barcode → your foods → USDA Branded Foods → Open Food Facts, merged, then log it; saved for next time | Packaged foods are the other hard-to-log group | S |
| F4 ✅ | **Long-term view per nutrient:** 90-day trend in the detail panel with blood-test results on the same timeline | Shows whether diet changes moved the lab numbers | S–M |
| F5 | **Report extras:** compare two periods (e.g. before and after a change); include custom-target notes and a short "what I changed" field | Makes the clinician visit a before/after conversation | S |
| F6 | **Accessibility pass:** NVDA screen-reader run through setup, logging, recipes and the report; fix what it finds | New screens since the last audit | S |

### Phase B: live on your phone. **Decision: hosting** (free: private GitHub repo + Cloudflare Pages, see [HOSTING.md](HOSTING.md))

| # | Item | Size |
|---|---|---|
| B1 ✅ | **Live at https://nutrient-atlas.pages.dev** (2026-10-09): Cloudflare Pages, deployed from this PC with `bun run deploy` (Wrangler); no GitHub needed. See [HOSTING.md](HOSTING.md) | S |
| B2 | Install on your phone; one-week field test (offline, notch, keyboard, storage protection when installed) | – |
| B3 ✅ (needs a real-phone check) | Camera scanning: built in on Android Chrome; on iPhone an opt-in add-on the browser downloads itself (nothing bundled). Done early, in phone prep | M |
| B4 ✅ | Backups and CSV exports open the share sheet on phones (Files, Google Drive, iCloud Drive, email); the in-app reminder is E6 | S |
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

1. **Now:** use it for a few days and tell me what bugs you (A1). Run `Nutrient Atlas.cmd` once to get the Phase E features into your daily app.
2. **Now:** install it on your phone (B2) and move your data over; a week of real use is the field test.
3. **Later:** AI budget (Phase C) and accounts (Phase D).

**Recommended next session:** F5 (report before/after) and F6 (accessibility pass), or a decision on sync (D1). Anything from your week of use (A1) goes first.

**Hosting is done (B1).** Next unlocks: the phone field test (B2), then sync (D1) and AI photo logging (C3), which build on the same Cloudflare account.

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

**Paste a recipe (F2), long-term trends (F4), phone backups (B4):**
- Shipped: ingredient-list parsing (fractions, ranges, units, cans, counts) with recipe-aware USDA matching and portion-based grams, reviewed before the recipe builder; 90-day / 1-year trends per nutrient with blood tests on the same timeline; share-sheet backups and CSVs on phones.
- *Learned:* the food search ignored the leading group word in USDA names, so "olive oil" never found "Oil, olive"; fixed for every search. Recipe lines need their own ranking ("olive oil" is the oil, not mayonnaise made with it).

**Plan tomorrow (F1):**
- Shipped: a greedy day planner on top of Best next food (2–4 foods, typical day from the last 7 complete days, kcal budget, variety rules), preview, per-food swap that keeps the rest, plans saved per day, Today's plan with one-tap logging and progress.
- *Learned:* the shared food scorer still suggested oddities once several foods were combined (a diabetes supplement drink, 100 g of dry buckwheat, 100 g of ground flax); fixing them improved Best next food too. Watch heredoc escapes: a lost backslash turned `\s` into `s` in a regex.

**MealVision hand-over:**
- Shipped: Atlas accepts MealVision's meal, recipe and single-food exports by link (`#/log?import=…`) or paste, always to a review screen first; an opt-in Photo step that calls MealVision on this PC; retinol accepted from imports; MealVision now keeps real zeros in its exports (its repo, `bd38208`).
- *Learned:* a link that silently lands on the dashboard is worse than no link; every hand-over now has an e2e test, and a real MealVision export was run through Atlas's reader.

**Phone prep (before hosting):**
- Shipped: a phone pass over every screen at 375 px (no overflow anywhere); Back-to-Atlas buttons hidden where the tab bar does that job; iPhone tap-to-zoom prevented on form fields; the report table readable on phones; plural and wording fixes; a Scan button in the log sheet with an opt-in, never-bundled scanner add-on for iPhone; the e2e test scans with a fake camera.
- *Learned:* the built-in browser pane's emulated screenshots can be misleading; real phone-size captures come from headless Edge with device metrics. A supplement-only upper limit (magnesium) shouldn't warn about a food target above it.

**Barcode logging (F3):**
- Shipped: barcodes in the log sheet from two free databases, USDA Branded Foods (manufacturer data, free key or demo key) and Open Food Facts, merged with USDA first; found foods are saved with the barcode for offline re-logging; an optional key in Settings → Food databases.
- *Learned:* USDA stores barcodes as 12 or 14 digits, so one OR search covers every length. Both APIs allow browser calls (CORS), so this needs no server. The e2e test fakes both through the DevTools protocol, so it never spends the demo key's few lookups.

**Phase E (depth and speed):**
- Shipped: pages and log tabs loaded on demand, a lighter dashboard draw, the recipe builder, the clinician report, your own targets, the backup reminder and a pre-commit check.
- *Learned:* profile before optimising. The biggest slow-phone cost was repeated math, not drawing. Browser extensions installed for every profile inject scripts into test runs, so the e2e browser runs without them. A printed report needs absolute dates and a light theme, and fixed overlays repeat on every printed page.

**Bug sweeps:** after every round; each fix has a test where it can.

## Engineering backlog

- **Tests ✅:** `bun test` (~170 unit tests), `bun run e2e` (whole app, headless, including recipes and the report) and a pre-commit hook. Next: e2e steps for the log sheet's AI and label flows, Products compare and custom targets.
- **Bundle ✅:** main chunk 478 KB after splitting (E1). Further cuts would mean replacing React DOM or Dexie; not worth it.
- **Rendering ✅:** intake cached per day, below-the-fold sections deferred (E2). Remaining cost is React building the dashboard's DOM (~0.5 s at 6× CPU); memoising the Atlas against unrelated re-renders is the next step if phones feel slow.
- **Accessibility ✅:** keyboard Atlas, screen-reader summary, colour-blind palette and shapes, inert hidden panels, focus moves into dialogs. Next: an audit with a real screen reader.
- **Error boundary ✅:** crash screen with Reload, Back to Atlas and Download backup. Test with `#/dev/crash` in dev.
- **Data refresh:** rebuild the USDA table when a new Foundation Foods release lands (`bun run build:usda`); review DRI and limit sources yearly.
