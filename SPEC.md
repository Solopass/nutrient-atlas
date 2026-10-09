# Nutrient Atlas: Product Specification v2.1

What the app is and how it behaves today (October 2026, after Phase E: recipes, the clinician report, custom targets, the backup reminder). For what's next, see [docs/ROADMAP.md](docs/ROADMAP.md); for running and developing it, the [README](README.md).

## Vision

Make micronutrients as understandable as fitness metrics. Most apps focus on calories and macros; this app focuses on **nutrient coverage**. Open it and immediately see which vitamins, minerals, amino acids and fatty acids you're getting enough of, which are missing, and what to eat next.

Main question: **"Did I nourish myself today?"**, not "Did I hit my calorie goal?"

## Stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Runtime / package manager | Bun |
| Local database | Dexie (IndexedDB), local-first |
| Routing | Hash routes (`#/`, `#/day/YYYY-MM-DD`, `#/history`, `#/products`, `#/settings`, `#/welcome`) |
| Charts | Hand-built SVG (Atlas, sparklines, trends) |
| Fonts | Inter + JetBrains Mono, bundled locally (offline-safe) |
| Food data | USDA FoodData Central, preprocessed to `public/usda/foods.json` |
| PWA | vite-plugin-pwa: installable, offline (app shell, USDA table and worker precached), auto-update |
| Background work | A Web Worker owns the USDA table: search, Best next food, weekly food ideas |
| Theming | CSS tokens; dark, light, colour-blind safe palette |
| Testing | `bun test` (unit, fake-indexeddb) and `scripts/e2e.ts` (whole app in headless Edge/Chrome over CDP) |
| Later | Serverless AI proxy (Phase C), sync (Phase D), Capacitor for app stores |

## Screens

### First-run setup (`#/welcome`)
Shown automatically the first time the app opens (no profile saved and setup not yet finished or skipped); re-run from Settings or the dashboard banner.
1. **Welcome:** what the app does; *Get started*, *Explore with sample data*, or *Restore a backup…* (for a new browser or device).
2. **About you:** sex, age, units, weight, height, pregnant / breastfeeding.
3. **Activity, goal and diet.**
4. **Supplements:** tap presets you take daily (with diet-aware "common" hints); they're created and auto-logged.
5. **Ready:** calorie target, protein g/kg, supplement count and key personal targets; then *Log my first meal*, *Explore with sample data* or *Go to the Atlas*.

Answers save as you go, and finishing saves the profile even if every default was kept. Setup stays open until finished or skipped, and only covers the dashboard: Settings, History and Products stay reachable (e.g. to import a backup).

### Dashboard (`#/`, `#/day/YYYY-MM-DD`)
- **Header:** data source (demo / items logged / 7-day average with days logged), profile summary (links to Settings), **date navigation** (‹ ›, date picker, Today), **Day / 7 days** switch, **+ Log food**, Advanced toggle, History, Products and Settings icons. A setup banner shows until a profile is saved.
- **Day vs 7 days:** the 7-day view averages the *logged* days (unlogged days are skipped, not zeros). When viewing today, it uses the 7 complete days before today, because today is still in progress. Default is automatic: 7 days once 3+ of the last 7 days are logged; choosing Day or 7 days is remembered.
- **Empty and demo states:** with no logs at all the dashboard shows demo data and offers **Load sample history** (3 weeks of meals from real USDA foods, flagged and removable). A day with nothing logged shows every nutrient as "no data" plus a log prompt.
- **Done for today:** a header button when viewing today marks the day complete, so it counts in the 7-day view, History averages, the weekly report and Product scores before midnight. Stored as the date, so it resets itself the next day.
- **Backup reminder:** when the last Export backup is 14+ days old, or after 7 days of real (non-sample) food logs with no backup, a banner offers **Export backup** (one tap) or **Remind me in a week**. See [src/lib/backupReminder.ts](src/lib/backupReminder.ts).
- **What's new:** a dismissible strip of recent features, each with a button that shows it (recipes, the clinician report, your own targets, Products, Replay, By meal, Preview, footprint). It returns when `WHATS_NEW_VERSION` changes.
- **Stat cards:** nourishment score with real 14-day sparkline and change vs yesterday / prior week (hidden for today until the day is over; today is drawn hollow and dashed as "so far"; the footer averages complete days only), streak with 14-day squares, energy vs personal calorie target (daily average in 7-day view), nutrient coverage distribution, **best next food** (see below).
- **This week · insights:** the top 3 insights for the last 7 complete days (see Weekly insights), linking to the full report.
- **Nutrient Atlas** (hero), a radial chart:
  - 14 core wedges: macros, vitamins A/C/D/E/K, minerals Ca/Mg/K/Fe/Zn. Radius = % of target; solid to 100%, striped overflow to 150%; dashed UL marker; pulse on deficient wedges.
  - **Supplement share:** the part of a wedge (or outer-ring gauge) that came from supplements is dotted, above a divider at the food-only level.
  - **Previous period tick:** a light arc on each core wedge at yesterday's level (day view) or the prior 7 days' average (7-day view).
  - **Colour by status or by meal** (remembered): meal mode stacks each wedge and outer gauge by breakfast / lunch / dinner / snacks / supplements, keeps the status outline, and shows kcal and share per meal above the chart. The hub shows the top 3 meals for a hovered nutrient.
  - **7-day low–high whisker** (7-day view): dashed radial line from the lowest to the highest logged day, so a steady 100% reads differently from alternating 40% / 160%.
  - **Replay 30 days:** plays the Atlas through the last 30 days (rolling 7-day averages in the 7-day view), skipping unlogged days; a scrubber reaches any day. Wedges glide between days where the browser can animate SVG paths.
  - **What-if preview:** hovering a Best-next-food suggestion (or its Preview button, which pins it and scrolls the Atlas into view on phones) draws translucent dashed ghosts of what it would add, in the colour each nutrient would reach; the hub shows the new score. Logging it clears the preview.
  - **Food footprint:** a strip of the foods behind the view (day, or daily average for the week) sits under the Atlas; tapping one outlines its share of every wedge, fades nutrients it doesn't touch, and counts nutrients it supplies at 10%+ of target.
  - **Resize a portion on the chart (day view):** with a food's footprint showing, drag any of its segments in or out; the footprint follows live, the hub shows the new servings, and releasing sets that day's total servings of the food (entries keep their proportions, snapped to ¼ serving, never below ¼). − / + buttons under the food strip do the same; Undo for 8 seconds. Off in the 7-day view.
  - **Save image:** exports a PNG (chart plus title, date, profile and score); on phones it opens the share sheet.
  - **Phones:** the outer ring is drawn as a slim colour band (no symbols) so secondary nutrients stay visible and tappable.
  - **Keyboard and screen readers:** arrow keys move between nutrients (Home/End jump), Enter opens details; a text summary (score, below-target, over-limit, no-data) is attached to the chart.
  - Outer ring: every secondary nutrient as a mini radial gauge, grouped by category.
  - Hub shows the score, or the hovered nutrient's numbers, including food vs supplement % and the previous period's value. Hover dims the other nutrients; click opens detail.
- **Coverage by category** (heatmap cells) and **Biggest gaps** (remaining amount + best foods) side panels, plus **Flags** (over UL, incomplete data).
- **Limits** strip ("stay under"): sodium, saturated fat, trans fat, added sugar, cholesterol, caffeine, alcohol as gauges with green → yellow (≥ 80%) → orange (over) zones and amount left / over. Over-limit ones also appear in Flags.
- **Periodic table** of secondary nutrients: rows per category, liquid-fill tiles.
- **Detail panel:** amount / target / UL, status scale, data-coverage note, **30-day bar trend** of % of target (unlogged days shown as gaps), **top contributing foods** for the day or week, why it matters, signs of low intake, best sources.

**Best next food** searches every USDA whole food (~8,000) for one realistic portion (smallest non-package USDA portion from 25 g, or 10 g for energy-dense foods like nuts and seeds, up to 350 g; else 100 g) and ranks by how much of the current gaps it closes, weighted toward the biggest gaps. It:
- respects diet style (meat, fish, dairy/egg groups)
- skips niche, fortified, dried, raw-meat, organ-meat, flour, oil-fried and mixed-dish entries
- rejects foods that would push a limit or upper limit over (or charges them if already over)
- lightly penalises calories and obscure long-named variants, and skips foods already eaten that day

Your own saved foods (label and AI), saved meals and packaged foods rated in Products (except 1–2 stars) compete too, with a 15% nudge because you already eat them; they still respect limits and "already eaten today". They carry a *your food* / *your meal* / *rated* badge. Vitamin D isn't treated as a gap when the Sun setting covers it.

It shows the best pick plus two alternatives (one per food family), each with **+ Log** and **◎ Preview**. The ranking runs in the USDA Web Worker, so even on a slow phone (about a second of work) it never blocks the screen.

### History (`#/history`)
- 30-day stats: days logged, average score, days ≥ 80%, current streak, best streak (90 days). Today is counted as logged but kept out of averages while it's in progress (until marked *Done for today*).
- **Month calendar** coloured by daily score, with item counts; click a day to open it on the dashboard.
- **Persistent gaps:** nutrients averaging under 80% over the last 28 complete days, with how many days they were low and foods to try.
- **Report for your clinician** button (see below).
- **Nutrient heatmap:** every nutrient × the last 28 days, coloured by % of target; outlined cells = logged day with no data; click a cell to open that day. **Limits** rows at the bottom use reversed colours (green under, yellow near, orange over; a 0 limit shows any amount as over).

### Clinician report (`#/report`)
A printable summary to take to a doctor or dietitian, for the last 30, 60 or 90 days ending at the last complete day ([src/lib/report.ts](src/lib/report.ts)):
- **Header:** period with absolute dates, days logged, sex / age / weight / life stage / diet, date generated.
- **Key findings:** nutrients averaging under 80% (good data only), anything at or above an upper limit from food plus supplements, any supplement dose that reaches an upper limit on its own, "stay under" limits exceeded, blood tests outside the usual range.
- **Average daily intake vs target:** every nutrient by group: average, target and its kind (RDA / AI / AMDR / custom), % with status colour (and shape in colour-blind mode), share from supplements, days under 80% out of days with data; "–" for no data and * for partial data. Notes list sun-covered vitamin D and custom targets with the standard alongside.
- **Limits:** average vs limit and days over.
- **Supplements taken** (active): dose, schedule, start date, and per-day amount of each nutrient as % of target and of the upper limit.
- **Blood tests:** every result, newest first, with its band.
- **Print or save as PDF** prints in the light theme with the app's navigation and log sheet hidden, and keeps short sections on one page.

### Phone
- Installable PWA (standalone, maskable icons; the browser theme colour follows Appearance). Works offline after first load.
- Below 640 px: bottom tab bar (Atlas, History, **+** log, Products, Settings), with safe-area padding. The header drops the buttons the tab bar replaces. Supplements are one tap away in the log sheet.
- The Atlas draws its outer ring as a slim colour band, and dragging a footprint uses touch (the page doesn't scroll while you drag).

### Weekly insights ([src/lib/insights.ts](src/lib/insights.ts))
Computed on-device for the 7 complete days up to the viewed day (today counts once marked *Done for today*), vs the 7 before that. Everything except the food ideas renders at once; the food ideas come from the USDA worker a moment later.
- **Score change** (±5 points or more) and **wins** (nutrients that crossed into 80%+).
- **Persistent gaps:** up to 3 nutrients averaging under 70% and under 80% on at least 60% of logged days (excluding partial-data ones), each with 3 food ideas for your diet at realistic portions.
- **Limits over** on average, naming the biggest sources.
- **Diet / life-stage risks:** vegan, vegetarian, pregnancy and breastfeeding lists (e.g. B12, iodine, EPA+DHA, iron, zinc, choline, folate), skipped when a supplement already covers them.
- **Interaction tips:** plant iron without vitamin C (with a concrete meal example), calcium and iron in the same meals, coffee/tea with iron-rich meals, vitamin A/K-rich meals with almost no fat.
- **Blood tests:** any result outside the usual range (vitamin D, ferritin, B12, folate, magnesium, omega-3 index), read against this week's intake and mentioning the previous result when there is one. It replaces the plain gap insight for that nutrient; food ideas only when intake is also low.
- **Data tips:** fewer than 4 logged days; several nutrients with incomplete data.

Worded as food guidance, not medical advice. The History page shows the full **weekly report**: score vs last week, category coverage this week vs last, and every insight.

### Log food (sheet)
1. **Search:** above the search box, **Quick add**: *Same [meal] as [last time]* copies that meal's items (looks back 14 days); **Saved meals** chips log one portion; **Recent** foods log one serving. Below, USDA foods ranked for everyday use (head-word match, whole/raw preference, nutrient completeness). Pick amount × USDA portion or custom grams, with a live nutrient preview.
   **Barcodes:** typing or pasting 8, 12, 13 or 14 digits (spaces and dashes allowed; a USB scanner works too) switches the tab to a barcode lookup ([src/lib/barcode.ts](src/lib/barcode.ts), [BarcodeLog.tsx](src/components/log/BarcodeLog.tsx)), after a short pause so a half-typed number isn't looked up. In order:
   1. **Your foods and rated products**, matching any length of the same number (UPC-A 12 = EAN-13 with a leading 0 = GTIN-14). Instant and offline.
   2. **USDA FoodData Central, Branded Foods** (US packaged foods, manufacturer data): one search request covers every length of the number; values per 100 g are scaled to the label serving, with the same nutrient mapping as the USDA table (vitamin A in IU is left as unknown, since converting needs its form). Uses your free API key from Settings, or USDA's shared `DEMO_KEY` (a few lookups an hour).
   3. **Open Food Facts** (worldwide, community data), asked at the same time. When both know the product, USDA's values win and Open Food Facts only adds nutrients USDA lacks, scaled to USDA's serving by weight.
   The result card shows the source, serving and kcal, and logs servings or grams. A found food is saved to My foods with its barcode and brand (source "Barcode"), so the next scan is local. Not found → **Create it from the label**, saved with the barcode. A wrong check digit gets a "typo?" hint; a rate limit or network problem with one source is shown while the other's answer is still used. Only the number is sent, and online answers are cached for the session.
2. **AI estimate:** describe a meal → copy prompt → paste any chatbot's JSON reply → review (untick items, servings) → log.
3. **My foods:** **Build a recipe** (below), **Create a food from its label**, saved meals and recipes (log one portion / edit / delete), and every logged food for one-tap re-logging (source badge USDA / AI / Label; label and AI foods are editable); favorites.
4. **Supplements:** see below.
5. **Today** (or the viewed day): entries by meal with kcal; edit servings; delete; **Save as meal** per meal (name + "makes N portions" for recipes; logging adds one portion).

**Recipe builder** ([src/components/log/RecipeBuilder.tsx](src/components/log/RecipeBuilder.tsx), [src/lib/recipe.ts](src/lib/recipe.ts)): a name, how many portions it makes, and ingredients searched from your own label / AI foods and the USDA table (amount × USDA portion, or custom grams). A live panel shows one portion's calories, weight (when every ingredient's grams are known) and % of targets. **Save**, or **Save and log 1 portion**. Saved as a saved meal (`servings` = portions), so logging adds every ingredient scaled by 1/portions. Editing a saved meal or recipe opens the same builder.

The tabs load on first open. The sheet logs to the day being viewed, so past days can be back-filled. A badge shows when that is not today.

The meal defaults from time of day.

### Custom foods and label text
- **Paste the label text** (typed, copied from a product page, or copied from a photo with Live Text / Google Lens). [src/lib/labelParse.ts](src/lib/labelParse.ts) reads it as you type and shows what it found:
  - US Nutrition Facts and Supplement Facts, including text that lost its line breaks
  - "Includes 10g Added Sugars", "Sat. Fat", "Total Carb.", vitamin/mineral synonyms
  - mcg/µg/mg/g/IU (IU converted for D, A, E), thousands separators, "less than" values
  - %DV-only lines (older labels, e.g. "Iron 6%"), converted with the FDA Daily Values
  - serving size (with grams), servings per container, calories
- *Use these values* fills the form, which can also be typed line by line (shared nutrient-row editor with unit conversion).
- Shows kcal from macros, and warns if it disagrees with the label's calories by more than 20%.
- *Save and log* or *Save to My foods*. Nutrients the label doesn't list stay "no data" for that food.
- The same paste box is in the supplement editor.

### Supplements
- Defined once from the Supplement Facts label: name, what one dose is, doses per day, schedule (**daily** or **as needed**), nutrients per dose.
- 13 presets (D3, multivitamin, fish oil, algae omega-3, magnesium, zinc, B12, iron, calcium + D, C, iodine, creatine, prenatal) as starting points.
- Label units: mcg / mg / g, plus IU for vitamins D (×0.025), A (×0.3 mcg RAE) and E (×0.67 mg).
- **Daily** supplements are written into the log automatically (on launch and when the app returns to the foreground), back-filled up to 14 days. Untick a day to remove that dose. Pause stops them, and resume doesn't back-fill the paused days. Editing updates today's dose; earlier days keep their snapshot.
- Supplement entries count toward intake but **not** toward data coverage, and a supplements-only day is not a "logged day" for streaks, averages or history.
- **Supplement-only ULs** (magnesium 350 mg, niacin 35 mg, vitamin E 1,000 mg, folic acid 1,000 mcg ≈ 1,700 mcg DFE) are checked against supplement intake alone; no UL marker is drawn on the wedge for these.
- Detail panel shows supplement amount, share of intake and a food-vs-supplement bar.

### Products (`#/products`)
Rate the branded supplements and packaged foods you use or are considering. Stored in the `products` table (Dexie v5), separate from supplements you take and foods you log; included in backups.
- **Adding:** paste a Supplement/Nutrition Facts label (nutrients, serving, servings per container, calories and ingredient forms such as “(as magnesium glycinate)” are read automatically), type it, import a JSON product pack or CSV (downloadable template; columns are nutrient names/ids with an optional unit, e.g. “Vitamin D (IU)”, plus “<Nutrient> form”), or copy an AI prompt, attach label photos in any AI chat and paste the JSON reply. Imports match existing products on kind + brand + name and update them, keeping your rating and notes. “Add to compare” pulls in supplements you already take.
- **Barcode:** type the digits (works everywhere) or scan with the camera where the browser has BarcodeDetector (Chrome/Edge on Android; needs HTTPS or localhost). Looks up Open Food Facts (only the barcode is sent), maps its per-serving values (or per-100 g scaled by serving size) from grams into app units, detects supplements by category and testing seals in its labels, and opens the editor pre-filled with a check-against-your-label note.
- **Third-party testing:** USP Verified, NSF (Contents / Certified for Sport), Informed Sport/Choice, BSCG, IFOS, ConsumerLab. Ticked in the editor, detected in pasted label text, imported from CSV/JSON/AI. Shown as badges; supplements get a *Tested* score part (weight 0.10) when sealed, and no penalty when not.
- **Score (0–100, grade A–E)** from explainable parts, re-weighted when a part has no data:
  - *Your gaps:* how much it fills of what you are short on over the last 7 complete days. Supplements are judged against food alone. Relevance (share of what it offers that lands in a gap) and size (gap points closed).
  - *Dose (supplements):* meaningful amounts per day (≥ 50% of target counts fully; under 10% is a token amount).
  - *Density (foods):* NRF9.3 per 100 kcal (protein, fiber, A, C, E, calcium, iron, potassium, magnesium minus saturated fat, added sugar, sodium) with your own targets and limits.
  - *Forms (supplements):* well-established differences only (magnesium/zinc oxide poor; glycinate, citrate etc. good; D3 over D2; MK-7; chelated iron; B12 and folate forms treated as equivalent). Unknown forms are not penalised.
  - *Value:* cost per useful dose, compared with the cheapest product in the list that provides the same nutrients (≥ 25% of target a day for supplements, ≥ 10% per serving for foods).
  - Over an upper limit on its own caps the score at 40 and is flagged; close to it, or over it together with what you already get, is a warning. Poor forms, high sodium/sugar/saturated fat, token doses and nutrients your current supplements already cover are flagged.
- **No duplicates:** adding a product that matches an existing one (same barcode, or same kind + brand + name) updates it, keeping your rating and notes. “Take daily” on a product whose supplement is paused resumes it.
- **List:** supplements / foods, search, tags, sort (overall, fills my gaps, value, my rating, newest), currency, your 1–5 star rating and notes, “Take daily” (creates a daily supplement) or “Log a serving”.
- **Compare** up to 4 side by side: score parts, cost per day, serving, and every nutrient as % of your target with form markers; best in each row highlighted (past 100% counts as a tie; over the upper limit never wins).
- **Share list** writes a JSON product pack others can import (the share sheet on phones, a download elsewhere).
- **Best next food** includes packaged foods from Products (except ones you rated 1–2 stars), badged “rated”; + Log logs one serving.

### Settings (`#/settings`)
- **Body:** sex, age (14+), weight, height, units (metric/imperial), life stage (pregnant / breastfeeding).
- **Activity:** 5 levels (factor ×1.2 to ×1.9).
- **Goal:** general health / build muscle / lose fat / endurance → protein g/kg and calorie adjustment. Custom calorie and protein overrides.
- **Diet style:** omnivore / pescatarian / vegetarian / vegan (filters suggestions).
- **AI estimation:** manual (active) / automatic (planned).
- **Food databases:** which free databases barcode lookups use, and an optional **USDA API key** (free from api.data.gov; about 1,000 lookups an hour instead of the demo key's few). Stored in settings as `fdcApiKey`, left out of backup files and kept when restoring one.
- **Sun:** “Little sun” / “Regular sun”. With regular sun, vitamin D keeps its target and is shown (with ☀), but isn't counted in the score, category coverage, gaps, suggestions, insights or product gap scores. A low vitamin D blood test switches it off automatically.
- **Blood tests (optional):** vitamin D 25(OH)D (ng/mL or nmol/L), ferritin (ng/mL = µg/L), B12 (pg/mL or pmol/L), serum folate (ng/mL or nmol/L; <3 deficient, 3–6 borderline), serum magnesium (mg/dL, mmol/L or mEq/L; <1.6 low, 1.6–1.8 borderline, >2.6 high; noted as a poor marker of stores) and the omega-3 index (% EPA+DHA in red cells; <4 low, 4–8 intermediate, ≥8 desirable), each with test date. **History:** every result is kept (`labHistory`, oldest first; older profiles' single result counts as one); edit the latest in place or “+ Newer result”; a trend chart (band stripes, dots coloured by band, change since the first result in your units) shows in Settings and the detail panel, and the weekly report mentions the previous value. Banded deficient / low / normal / high (IOM 2011 for vitamin D: <12, 12–20, 20–50, >50 ng/mL; WHO 2020 for ferritin: <15, 15–30, up to 150 women / 200 men; NIH ODS for B12: <200, 200–300 pg/mL). Shown on a gauge (square-root scale so narrow low bands stay visible; linear from 1.0 for magnesium), with the unit on the marker. The detail panels for vitamin D, iron, B12, folate (B9), magnesium and EPA/DHA read the latest result against intake (e.g. "low even though intake is on target" → absorption, sun or losses; for magnesium, a normal blood level can hide a shortfall). Results over 12 months old are flagged. Stored in the profile, so they travel with backups. Never changes targets. See [src/lib/labs.ts](src/lib/labs.ts).
- **Run setup again** link.
- **Appearance:** theme System / Dark / Light, and status colours Standard / Colour-blind safe (Okabe–Ito blue/orange set plus a shape on every status: ▼ deficient, ▽ needs attention, ● good, ▲ above, ⚠ over the limit, on Atlas wedges, periodic tiles, gaps, limits and the detail panel; low category cells are hatched). Every colour is a CSS token; the chosen theme is applied before first paint from localStorage, so there is no flash.
- **Your data:** counts, storage protection status (the app requests persistent storage once set up, with a Protect button if not granted), last backup date (the dashboard reminds after 14 days), MB used, export JSON backup, import (replace), load / remove sample history, delete all.
- **Spreadsheet export (CSV):** daily totals (one row per day, a daily-target row, entry counts, kcal, score, one column per nutrient) or every entry (time, meal, food, servings, type, amounts eaten). Missing data is an empty cell, never 0; UTF-8 BOM for Excel; text that starts with = + - @ is defused. See [src/lib/csv.ts](src/lib/csv.ts).
- **Your daily targets:** BMR, burn, target kcal, and every nutrient's target, kind and UL. **Tap a target to set your own** (e.g. on a clinician's advice; Enter saves, Escape cancels, *Standard* goes back); a warning shows above the upper limit, and *Reset all* clears them. Custom targets show in blue as "custom".

## Nutrient model

### Core (Atlas wedges)
Protein, Carbohydrates, Fat, Fiber · Vitamins A, C, D, E, K · Calcium, Magnesium, Potassium, Iron, Zinc

### Secondary (outer ring + periodic table)
- **B vitamins:** B1, B2, B3, B5, B6, B7, B9, B12
- **Trace minerals:** Copper, Manganese, Selenium, Chromium, Molybdenum, Iodine, Phosphorus
- **Fatty acids:** Omega-3 ALA, EPA, DHA, Omega-6 LA
- **Essential amino acids:** Leu, Ile, Val, Lys, Met (+Cys), Trp, Thr, Phe (+Tyr), His
- **Advanced (toggle):** Choline, Boron, Sulfur, Lutein, Zeaxanthin, CoQ10, Creatine

### Targets ([src/lib/targets.ts](src/lib/targets.ts))
- DRI (National Academies) RDA or AI by sex and age group (14–18, 19–30, 31–50, 51–70, 71+), with pregnancy and lactation values. Tolerable Upper Intake Levels (UL) per group.
- Protein: goal g/kg × weight (minimum 0.8 adults, 0.85 teens, 1.1 pregnancy/lactation).
- Fat: 30% of calorie target. Carbs: RDA 130 g (175 pregnancy, 210 lactation).
- Amino acids: adult RDA mg/kg × weight.
- Energy: Mifflin–St Jeor BMR × activity × (1 + goal adjustment) + pregnancy 340 / lactation 400 kcal.
- No official target (EPA, DHA, boron, sulfur, lutein, zeaxanthin, CoQ10, creatine): amount only.
- ULs that apply to supplements only (magnesium, niacin, folic acid, vitamin E) carry a note.
- **Custom targets** (`profile.targetOverrides`, by nutrient id) are applied last, so they win over DRIs, goals and life stage everywhere: score, gaps, suggestions, insights, Products and the report. The nutrient keeps its kind (a lower sodium limit is still a limit) and remembers the standard value (`customTarget.standard`) for the detail panel and the report. Must be > 0, or ≥ 0 for limits.

**Vitamin A upper limit:** the UL (3,000 mcg adults) covers preformed vitamin A only. The USDA table carries a hidden `retinol` value per food; the UL is checked against retinol from foods plus all vitamin A from supplements (labels rarely give the form). Foods without retinol data (labels, AI estimates) are treated as plant form. Best-next-food uses the same rule, so carrots are never rejected for vitamin A.

### Limits ("stay under"; never part of the score)
| Nutrient | Daily limit | Source |
|---|---|---|
| Sodium | 2,300 mg | DRI chronic-disease risk reduction |
| Saturated fat | 10% of calories | Dietary Guidelines |
| Added sugar | 10% of calories | Dietary Guidelines |
| Trans fat | 1% of calories | WHO |
| Cholesterol | 300 mg | former guideline (now "as low as practical") |
| Caffeine | 400 mg (200 pregnant/breastfeeding, 100 under 18) | FDA / ACOG |
| Alcohol | 28 g men, 14 g women, 0 pregnant or under 21 | Dietary Guidelines |

Status: green ≤ 80% of the limit, yellow 80–100%, orange over; limit 0 means any amount is over.

USDA data: sodium, saturated fat and cholesterol are near-complete. Added sugar is almost never reported, so the build records 0 for unprocessed whole foods (fruit, vegetables, meat, fish, plain dairy, grains, nuts, legumes) and leaves processed or sweetened foods as "no data". Caffeine and alcohol are treated the same way outside beverages and sweets.

### Status colours and shapes
| Colour (standard) | Shape | Range | Meaning |
|---|---|---|---|
| Red | ▼ | 0–49% | Deficient |
| Yellow | ▽ | 50–79% | Needs attention |
| Green | ● | 80–120% | Good |
| Blue | ▲ | >120% | Above target (not bad by itself) |
| Orange | ⚠ | > UL | Over upper limit |
| Grey hatched | ○ | n/a | No data: logged foods don't report it, so it's never shown as red |
| Neutral | · | n/a | No official target |
| ◐ marker | | n/a | Partial data: <60% of logged foods report it |

Shapes always appear in the legend. With *Colour-blind safe* on (Settings → Appearance) the colours switch to the Okabe–Ito set (vermillion, yellow, bluish green, sky blue, reddish purple) and the shapes appear next to every status on the Atlas, periodic tiles, gaps, limits and the detail panel; low category cells are also hatched.

### Scoring
- Per category: share of scorable nutrients (have target and data) at ≥ 80%.
- **Nourishment score** = mean of category scores (the 9 amino acids can't outweigh the vitamins).
- Also reported: core met (x/14) and all tracked met.

## Data

### Performance
The USDA table (2.8 MB) is loaded, indexed and queried in a Web Worker (`src/workers/usda.worker.ts`, client `src/data/usdaClient.ts`): search, Best next food and the weekly report's food ideas. The weekly report renders at once without food ideas and fills them in when the worker answers. If workers are unavailable the same code runs on the main thread.

The dashboard ships in the main chunk (~480 KB, mostly React DOM and Dexie); History, Products, Settings, setup, the report and the five log-sheet tabs load on demand. A day's intake is computed once per log array and cached (the 7-day whiskers and trends ask for it once per nutrient), and the limits, periodic table and legend render just after the Atlas's first paint with `content-visibility: auto`. On a simulated slow phone (production build, 6× CPU) the Atlas appears after ~1.2–1.6 s instead of ~2.2–3.0 s.

### Food sources
- **USDA FoodData Central:** Foundation Foods (2025-12) + SR Legacy (2018-04), ~8,000 whole foods. See [README](README.md#food-data) for the build pipeline, unit conversions and merge rules.
- **Labels:** pasted Nutrition / Supplement Facts text (custom foods, supplements, Products).
- **AI estimates:** meals and label photos, via copy/paste; see [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).
- **USDA Branded Foods:** barcode lookups when logging (free API key or the shared demo key).
- **Open Food Facts:** barcode lookups when logging and in Products (crowd-sourced; Products asks you to check it against the label).
- **Recipes:** built from the above (ingredients → per-portion nutrients).

### Local database (Dexie, `nutrition-app`)
Schema changes are additive `db.version(n)` upgrades only (current: 5), so installed copies upgrade in place.
```
settings     key → value
             'profile'       → Profile (body, goals, diet, units, currency, sunExposure, theme, palette,
                                labs (latest per test), labHistory (all results per test), targetOverrides, energy/protein overrides…)
             'onboarded'     → ISO time setup was finished or skipped
             'lastBackup'    → date of the last Export backup
             'backupSnoozedUntil' → backup reminder hidden until this date
             'fdcApiKey'     → your USDA API key (this device only; not in backups)
             'dayComplete'   → date marked "Done for today"
             'whatsNewSeen'  → version of the What's new strip dismissed
foods        ++id, name, lastUsedAt, favorite                                        (v1)
             { name, serving, grams?, nutrients (per serving), source: usda|ai|custom|barcode, barcode?, brand?, favorite, useCount, createdAt, lastUsedAt }
logs         ++id, date, loggedAt, meal, foodId, supplementId                         (v1; supplementId v3)
             { date YYYY-MM-DD, loggedAt, meal (breakfast|lunch|dinner|snack|supplement), foodId?, supplementId?,
               name, serving, multiplier, nutrients (snapshot per serving), sample? }
supplements  ++id, active                                                             (v3)
             { name, dose, dosesPerDay, schedule: daily|asNeeded, nutrients (per dose), active, startDate, lastApplied?, createdAt }
meals        ++id, lastUsedAt                                                         (v4)
             { name, items[{ name, serving, multiplier, nutrients, foodId? }], servings, useCount, createdAt, lastUsedAt }
products     ++id, kind, updatedAt                                                    (v5)
             { kind: supplement|food, brand, name, serving, grams?, kcal?, nutrients (per serving), forms?, certifications?,
               barcode?, servingsPerContainer?, servingsPerDay?, price?, rating?, notes?, tags?, source, createdAt, updatedAt }
```
Log entries snapshot nutrients so editing a food never rewrites history. Intake for a day = Σ nutrients × multiplier; coverage = share of food entries that report each nutrient.

Also in localStorage: `atlas-appearance` (resolved theme and palette, applied before first paint) and `ai-log-draft` (an unsent AI estimate). Backups (Settings → Export) are JSON with every table; the crash screen can download the same file.

## Quality
- **Unit tests** (`bun test`, ~185): barcode numbers, USDA Branded and Open Food Facts lookups (network mocked) and merging, targets, custom targets and limits, statuses and scoring, intake and history math, the AI-reply, label-text and Open Food Facts readers, USDA search and suggestions against the real table, insights, labs, product scoring and import/export, recipes, the clinician report, the backup reminder, CSV, backups, and database flows.
- **Whole-app test** (`bun run e2e`): setup → dashboard (including the deferred sections) → USDA logging → building a recipe → detail panel → Products import and ranking → History, the clinician report and Settings → theme switching → reload → logging by barcode (both databases answered locally through the DevTools protocol, then the same barcode again from your foods with no lookup), in a fresh headless browser without extensions; fails on any console error.
- `bun run typecheck` covers the app and the tests.
- **Pre-commit hook** (`.githooks/pre-commit`, enabled by `bun install`): typecheck and unit tests on every commit.

## Design principles
1. Nutrients first, calories second.
2. One-screen health overview, understandable in 5 seconds.
3. Scientific but approachable; every number explainable.
4. Missing data is shown as missing, never as zero.
5. Visually rich and information-dense (dark, instrument-panel feel).
6. The Atlas is the hero feature and what sets the app apart from MyFitnessPal, Cronometer and MacroFactor.
