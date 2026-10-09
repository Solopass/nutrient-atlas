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
| 6 | AI automation: API proxy, photo logging, USDA grounding | Planned |
| 7 | Sync across devices, native wrappers, health-app export · CSV export ✅ | Started |
| 8 | Insights and coaching: weekly report, diet risks, interaction tips, lab values ✅ · AI coach | Mostly done |
| 9 | Atlas+: by-meal colouring, 7-day whiskers, replay, what-if preview, food footprint, image export ✅ | Done |
| 10 | Products: rate brands (labels, CSV, AI, barcode), testing badges, compare ✅ · community ratings | Mostly done |

## The plan from here (September 2026)

Four phases, ordered by what each one unlocks. **Phase A needs nothing from you.** Each later phase starts with a decision only you can make (hosting, an AI budget, accounts), so they wait until you say go.

Every session, whatever the phase, ends the same way: a bug sweep (code review plus a click-through on a separate test port, so your data is never touched), a test for each fix, updated SPEC/ROADMAP, and a local commit.

### Phase A: polish and trust. No hosting, no cost. Next 2–3 sessions

The goal: make it good enough that you want to open it every day, and fix what daily use shows up.

| # | Item | Why | Size |
|---|---|---|---|
| A1 | **You use it for a week**, and we keep a friction list (anything slow, confusing or missing) | Real use finds problems no review does | – |
| A2 ✅ | **Colour-blind-safe status** (shapes and patterns alongside red/yellow/green) and a **light theme** | About 1 in 12 men can't tell the status colours apart | M |
| A3 ✅ | **"Day complete" button**, so today counts in the weekly view before midnight | Removes the last "today is still in progress" distortions | S |
| A4 ✅ | **Vitamin D sun setting** ("I get regular sun"), so vitamin D isn't always red for people who get sun | Removes a false alarm, in line with the "honest" principle | S |
| A5 | **Lab results over time** (a trend per test) plus more tests: folate, magnesium, omega-3 index | Shows whether changes are working | M |
| A6 ✅ | **What's new** tips for Products, Replay, By meal and Preview | These features are hard to find right now | S |
| A7 | **Speed:** move USDA parsing to a Web Worker; check startup on a low-end phone | First load on phones | S–M |
| A8 ✅ | **End-to-end smoke test** (setup → log → dashboard → products) using the headless Edge script we already have | Catches regressions across the whole app | M |
| A9 | *Stretch:* drag a wedge on the Atlas to adjust a portion | Makes the chart itself the logging tool | M |

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

**Recommended next session:** A3 + A4 + A6 (small, visible wins), then A2 (colour-blind safe + light theme), with a bug sweep.

## Milestone 3: Real history and weekly view ✅

Shipped:
- Daily scores computed from logs (no stored summaries needed yet: ~44 days aggregate in a few ms).
- **Day / 7-day switch.** The week view averages logged days only and excludes today while it's in progress. It turns on automatically once 3 of the last 7 days are logged.
- Date navigation (‹ ›, picker, Today) with `#/day/YYYY-MM-DD` routes. Logging goes to the viewed day, so past days can be back-filled.
- Real score sparkline, streak squares, and prior-day / prior-week deltas.
- Detail panel: 30-day bar trend and top contributing foods.
- **History screen:** 30-day stats, score calendar, persistent gaps, 28-day nutrient heatmap.
- **Sample history** (3 weeks, real USDA foods, flagged and removable) for demos and testing.

Learned:
- Partial days distort averages, so "in progress" needs to be a first-class concept (done for today). A "day complete" toggle would let users close a day early.
- USDA-only diets show persistent gaps in biotin, iodine, chromium and molybdenum that are really missing data. Supplements (M4) and label data (M5 barcodes) are how those get filled honestly.

## Milestone 4: Supplements and limits ✅

**Supplements ✅ shipped:** label-based definitions with presets and IU conversion; daily doses auto-logged (14-day back-fill, pause/resume, untick to skip); supplement-only ULs checked against supplement intake; food-vs-supplement share in the detail panel. Supplements never lower data coverage and don't make a day "logged".

**Limits ✅ shipped:** sodium, saturated fat, trans fat, added sugar, cholesterol, caffeine and alcohol with personalised limits, a "stay under" gauge strip, flags, reversed detail-panel scale, and USDA coverage (safe zeros for whole foods). Not in the score.

Still open:
- Vitamin D from sunlight: optional "sun exposure" note so vitamin D isn't always red for people who get sun.

## Milestone 5: Daily driver

- **PWA ✅ shipped:** installable, offline (app shell + USDA table precached), auto-update; phone tab bar with a big log button. Needs HTTPS hosting to install on a phone. See [HOSTING.md](HOSTING.md).
- **Recipes / meals ✅:** save any logged meal (optionally "makes N portions"); one tap to log a portion.
- **Copy ✅:** "same breakfast as yesterday" and recent foods in Quick add.
- **Custom foods from labels ✅:** paste or type Nutrition Facts; the text reader handles %DV-only and one-line labels. Covers packaged foods until barcode scanning.
- **First-run setup ✅:** profile → goals → supplements → personal targets.
- **Barcode ✅ (typed digits; camera where supported):** Open Food Facts lookup into Products. Phone camera scanning everywhere comes with hosting (B3).
- **Best next food ✅** from the full USDA database plus your own saved foods and meals, diet-filtered, limit-aware, one tap to log.
- Quick edit of portion by dragging on the Atlas wedge (stretch goal).

## Milestone 6: AI automation

See [AI_INTEGRATION.md](AI_INTEGRATION.md).
- Serverless proxy (`POST /api/estimate`) holding the API key; structured JSON output; the same parser/review UI.
- Photo logging: image → foods + grams.
- **Grounding:** the model identifies foods and grams, and nutrients are looked up in USDA. This is more accurate, cheaper and consistent. Model-estimated nutrients remain the fallback.
- Settings toggle between manual (free, private) and automatic.

## Milestone 7: Platform

- Optional sync: account + end-to-end encrypted sync of the Dexie tables.
- **CSV export ✅:** daily totals or every entry. Next: Apple Health / Google Fit export of nutrients.
- Capacitor wrapper for app stores once the PWA is solid.

## Milestone 8: Insights and coaching

**Shipped ✅:** weekly report (score and category change vs last week, wins, persistent gaps with diet-aware food ideas, limits with sources), diet/life-stage risk flags, and meal-level interaction tips (plant iron + vitamin C, calcium vs iron, caffeine vs iron, fat for vitamins A/K). Dashboard card plus full report in History.

Still to do:

- **Lab values ✅:** vitamin D, ferritin and B12 with reference bands, read against intake in the detail panel and weekly report. Next: more tests (folate, magnesium, omega-3 index, HbA1c for context) and a history of results over time.
- AI coach: ask "why am I always low on magnesium?" against your own logs.

## Products and brands

**Shipped ✅:** Products page: add branded supplements and foods from labels, CSV, shared JSON packs or AI-read photos; personal A–E scores (gaps, dose/UL, forms, density, value); star ratings and notes; compare up to 4.

**Also shipped ✅:** barcode lookup via Open Food Facts (typed digits everywhere; camera where supported), rated foods in Best next food, third-party testing badges with a Tested score, share sheet for product lists.

Next:
- Camera scanning on iPhone (needs a barcode library, since Safari lacks BarcodeDetector) and on phones generally once hosted over HTTPS.
- Shared community lists and ratings (needs hosting + sync).

## Engineering backlog

- **Tests ✅:** `bun test` (~140 tests). Next: component tests for the Atlas and log sheet, and a Playwright smoke test of the first-run → log → dashboard flow.
- Mock data now only powers the demo dashboard (`mockIntake`, `mockHistory`).
- Accessibility pass: keyboard navigation of the Atlas ✅, screen-reader summary ✅. Still to do: colour-blind safe status palette (add shape/pattern cues).
- Light theme.
- Performance: move USDA parsing to a Web Worker if load time on low-end phones is noticeable.
- **Error boundary ✅:** crash screen with Reload, Back to Atlas and Download backup (reads the database directly). Test with `#/dev/crash` in dev.
