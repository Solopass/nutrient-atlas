# Nutrient Atlas: Product Specification v1.8

What the app is and how it behaves today. For what's next, see [docs/ROADMAP.md](docs/ROADMAP.md).

## Vision

Make micronutrients as understandable as fitness metrics. Most apps focus on calories and macros; this app focuses on **nutrient coverage**. Open it and immediately see which vitamins, minerals, amino acids and fatty acids you're getting enough of, which are missing, and what to eat next.

Main question: **"Did I nourish myself today?"**, not "Did I hit my calorie goal?"

## Stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Runtime / package manager | Bun |
| Local database | Dexie (IndexedDB), local-first |
| Routing | Hash routes (`#/`, `#/day/…`, `#/history`, `#/settings`) |
| Charts | Hand-built SVG (Atlas, sparklines, trends) |
| Fonts | Inter + JetBrains Mono, bundled locally (offline-safe) |
| Food data | USDA FoodData Central, preprocessed to `public/usda/foods.json` |
| PWA | vite-plugin-pwa: installable, offline (app shell + USDA table precached), auto-update |
| Later | Capacitor (stores), serverless AI proxy |

## Screens

### First-run setup (`#/welcome`)
Shown automatically the first time the app opens (no profile saved and setup not yet finished or skipped); re-run from Settings or the dashboard banner.
1. **Welcome:** what the app does; *Get started* or *Just explore with sample data*.
2. **About you:** sex, age, units, weight, height, pregnant / breastfeeding.
3. **Activity, goal and diet.**
4. **Supplements:** tap presets you take daily (with diet-aware "common" hints); they're created and auto-logged.
5. **Ready:** calorie target, protein g/kg, supplement count and key personal targets; then *Log my first meal*, *Explore with sample data* or *Go to the Atlas*.

Answers save as you go. Setup stays open until finished or skipped.

### Dashboard (`#/`, `#/day/YYYY-MM-DD`)
- **Header:** data source (demo / items logged / 7-day average with days logged), profile summary (links to Settings), **date navigation** (‹ ›, date picker, Today), **Day / 7 days** switch, **+ Log food**, Advanced toggle, History and Settings icons. A setup banner shows until a profile is saved.
- **Day vs 7 days:** the 7-day view averages the *logged* days (unlogged days are skipped, not zeros). When viewing today, it uses the 7 complete days before today, because today is still in progress. Default is automatic: 7 days once 3+ of the last 7 days are logged; choosing Day or 7 days is remembered.
- **Empty and demo states:** with no logs at all the dashboard shows demo data and offers **Load sample history** (3 weeks of meals from real USDA foods, flagged and removable). A day with nothing logged shows every nutrient as "no data" plus a log prompt.
- **Stat cards:** nourishment score with real 14-day sparkline and change vs last day / prior week, streak with 14-day squares, energy vs personal calorie target (daily average in 7-day view), nutrient coverage distribution, **best next food** (see below).
- **This week · insights:** the top 3 insights for the last 7 complete days (see Weekly insights), linking to the full report.
- **Nutrient Atlas** (hero), a radial chart:
  - 14 core wedges: macros, vitamins A/C/D/E/K, minerals Ca/Mg/K/Fe/Zn. Radius = % of target; solid to 100%, striped overflow to 150%; dashed UL marker; pulse on deficient wedges.
  - Outer ring: every secondary nutrient as a mini radial gauge, grouped by category.
  - Hub shows the score, or the hovered nutrient's numbers. Hover dims the other nutrients; click opens detail.
- **Coverage by category** (heatmap cells) and **Biggest gaps** (remaining amount + best foods) side panels, plus **Flags** (over UL, incomplete data).
- **Limits** strip ("stay under"): sodium, saturated fat, trans fat, added sugar, cholesterol, caffeine, alcohol as gauges with green → yellow (≥ 80%) → orange (over) zones and amount left / over. Over-limit ones also appear in Flags.
- **Periodic table** of secondary nutrients: rows per category, liquid-fill tiles.
- **Detail panel:** amount / target / UL, status scale, data-coverage note, **30-day bar trend** of % of target (unlogged days shown as gaps), **top contributing foods** for the day or week, why it matters, signs of low intake, best sources.

**Best next food** searches every USDA whole food (~8,000) for one realistic portion (smallest non-package USDA portion from 25 g, or 10 g for energy-dense foods like nuts and seeds, up to 350 g; else 100 g) and ranks by how much of the current gaps it closes, weighted toward the biggest gaps. It:
- respects diet style (meat, fish, dairy/egg groups)
- skips niche, fortified, dried, raw-meat, organ-meat, flour, oil-fried and mixed-dish entries
- rejects foods that would push a limit or upper limit over (or charges them if already over)
- lightly penalises calories and obscure long-named variants, and skips foods already eaten that day

Your own saved foods (label and AI) and saved meals compete too, with a 15% nudge because you already eat them; they still respect limits and "already eaten today". They carry a *your food* / *your meal* badge.

It shows the best pick plus two alternatives (one per food family), each with **+ Log**. Runs in < 20 ms.

### History (`#/history`)
- 30-day stats: days logged, average score, days ≥ 80%, current streak, best streak (90 days). Today is counted as logged but kept out of averages while it's in progress.
- **Month calendar** coloured by daily score, with item counts; click a day to open it on the dashboard.
- **Persistent gaps:** nutrients averaging under 80% over the last 28 complete days, with how many days they were low and foods to try.
- **Nutrient heatmap:** every nutrient × the last 28 days, coloured by % of target; outlined cells = logged day with no data; click a cell to open that day. **Limits** rows at the bottom use reversed colours (green under, yellow near, orange over; a 0 limit shows any amount as over).

### Phone
- Installable PWA (standalone, dark theme colour, maskable icons). Works offline after first load.
- Below 640 px: bottom tab bar (Atlas, History, **+** log, Supplements, Settings), with safe-area padding. The header drops the buttons the tab bar replaces.

### Weekly insights ([src/lib/insights.ts](src/lib/insights.ts))
Computed on-device for the 7 complete days before the viewed day, vs the 7 before that:
- **Score change** (±5 points or more) and **wins** (nutrients that crossed into 80%+).
- **Persistent gaps:** up to 3 nutrients averaging under 70% and under 80% on at least 60% of logged days (excluding partial-data ones), each with 3 food ideas for your diet at realistic portions.
- **Limits over** on average, naming the biggest sources.
- **Diet / life-stage risks:** vegan, vegetarian, pregnancy and breastfeeding lists (e.g. B12, iodine, EPA+DHA, iron, zinc, choline, folate), skipped when a supplement already covers them.
- **Interaction tips:** plant iron without vitamin C (with a concrete meal example), calcium and iron in the same meals, coffee/tea with iron-rich meals, vitamin A/K-rich meals with almost no fat.
- **Data tips:** fewer than 4 logged days; several nutrients with incomplete data.

Worded as food guidance, not medical advice. The History page shows the full **weekly report**: score vs last week, category coverage this week vs last, and every insight.

### Log food (sheet)
1. **Search:** above the search box, **Quick add**: *Same [meal] as [last time]* copies that meal's items (looks back 14 days); **Saved meals** chips log one portion; **Recent** foods log one serving. Below, USDA foods ranked for everyday use (head-word match, whole/raw preference, nutrient completeness). Pick amount × USDA portion or custom grams, with a live nutrient preview.
2. **AI estimate:** describe a meal → copy prompt → paste any chatbot's JSON reply → review (untick items, servings) → log.
3. **My foods:** **Create a food from its label**, saved meals (log / delete), and every logged food for one-tap re-logging (source badge USDA / AI / Label; label and AI foods are editable); favorites.
4. **Supplements:** see below.
5. **Today** (or the viewed day): entries by meal with kcal; edit servings; delete; **Save as meal** per meal (name + "makes N portions" for recipes; logging adds one portion).

The sheet logs to the day being viewed, so past days can be back-filled. A badge shows when that is not today.

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

### Settings (`#/settings`)
- **Body:** sex, age (14+), weight, height, units (metric/imperial), life stage (pregnant / breastfeeding).
- **Activity:** 5 levels (factor ×1.2 to ×1.9).
- **Goal:** general health / build muscle / lose fat / endurance → protein g/kg and calorie adjustment. Custom calorie and protein overrides.
- **Diet style:** omnivore / pescatarian / vegetarian / vegan (filters suggestions).
- **AI estimation:** manual (active) / automatic (planned).
- **Run setup again** link.
- **Your data:** counts, export JSON backup, import (replace), load / remove sample history, delete all.
- **Live targets preview:** BMR, burn, target kcal, and every nutrient's target, kind and UL.

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

### Status colours
| Colour | Range | Meaning |
|---|---|---|
| Red | 0–49% | Deficient |
| Yellow | 50–79% | Needs attention |
| Green | 80–120% | Good |
| Blue | >120% | Above target (not bad by itself) |
| Orange ⚠ | > UL | Over upper limit |
| Grey hatched | n/a | No data: logged foods don't report it, so it's never shown as red |
| Neutral | n/a | No official target |
| ◐ | n/a | Partial data: <60% of logged foods report it |

### Scoring
- Per category: share of scorable nutrients (have target and data) at ≥ 80%.
- **Nourishment score** = mean of category scores (the 9 amino acids can't outweigh the vitamins).
- Also reported: core met (x/14) and all tracked met.

## Data

### Food sources
- **USDA FoodData Central:** Foundation Foods (2025-12) + SR Legacy (2018-04), ~8,000 whole foods. See [README](README.md#food-data) for the build pipeline, unit conversions and merge rules.
- **AI estimates:** see [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).
- Later: OpenFoodFacts (barcodes), user recipes, supplements.

### Local database (Dexie, `nutrition-app`)
```
settings  key → value                    ('profile' → Profile)
foods     ++id, name, lastUsedAt, favorite
          { name, serving, grams?, nutrients (per serving), source: usda|ai|custom, favorite, useCount, createdAt, lastUsedAt }
logs      ++id, date, loggedAt, meal, foodId, supplementId
meals     ++id, lastUsedAt   { name, items[{ name, serving, multiplier, nutrients, foodId? }], servings, useCount, createdAt, lastUsedAt }
          { date YYYY-MM-DD, loggedAt, meal, foodId?, name, serving, multiplier, nutrients (snapshot per serving), sample? }
```
Log entries snapshot nutrients so editing a food never rewrites history. Intake for a day = Σ nutrients × multiplier; coverage = share of entries that report each nutrient.

## Design principles
1. Nutrients first, calories second.
2. One-screen health overview, understandable in 5 seconds.
3. Scientific but approachable; every number explainable.
4. Missing data is shown as missing, never as zero.
5. Visually rich and information-dense (dark, instrument-panel feel).
6. The Atlas is the hero feature and what sets the app apart from MyFitnessPal, Cronometer and MacroFactor.
