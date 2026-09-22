# Nutrient Atlas

A nutrition tracker built around micronutrient coverage: a radial "Nutrient Atlas" of core nutrients, surrounded by a periodic table of secondary ones, with personal DRI targets, USDA food search and AI meal estimation. See [SPEC.md](SPEC.md) and the [roadmap](docs/ROADMAP.md).

## Use it on this PC (daily)

Double-click **`Nutrient Atlas.cmd`**. It builds the latest version, serves it in the background on http://localhost:4173 and opens it in its own window.

- **Install it once:** in that window's Edge menu, choose *Apps → Install Nutrient Atlas* (or the install icon in the address bar). You get a Start menu / taskbar app that opens in its own window and **works even when the server isn't running** (the app is cached for offline use). Installed apps also get protected storage.
- **After updates:** run `Nutrient Atlas.cmd` again. The installed app picks up the new version automatically.
- **Your data lives with `localhost:4173` in that browser.** Development runs on other ports (5173 dev, 5174 test), so work in progress never touches it. Back up now and then (Settings → Export backup).
- **Moving from another browser or port:** Export backup there, then in the new place use **Restore a backup…** on the setup screen (or Settings → Import backup).

## Develop

```bash
bun install
bun run dev        # http://localhost:5173, hot reload
bun run app        # production build served on http://localhost:4173 (what the launcher runs)
```

## Tests

```bash
bun test          # ~100 tests, < 1 s
bun run typecheck # app + tests
```

Tests live next to the code (`src/lib/*.test.ts`). They cover targets and limits, statuses and scoring, intake and history math, the AI-reply and label-text readers, USDA search and suggestions (against the real food table), weekly insights, and the database flows for daily supplements and quick logging (in-memory IndexedDB via `fake-indexeddb`).

## Food data

Food search uses **USDA FoodData Central** (public domain), preprocessed into `public/usda/foods.json` (~8,000 whole foods, 2.6 MB).

To rebuild it (e.g. after a new Foundation Foods release):

1. Download the **Foundation Foods** and **SR Legacy** CSV zips from https://fdc.nal.usda.gov/download-datasets/ into `data/usda-raw/` and unzip them there (the folder is git-ignored).
2. `bun run build:usda`

The script ([scripts/build-usda.ts](scripts/build-usda.ts)):
- maps USDA nutrient ids to the app's ids and converts units (e.g. copper mg → mcg, EPA/DHA and amino acids g → mg, vitamin D IU → mcg as a fallback)
- reports methionine as Met + Cys and phenylalanine as Phe + Tyr, to match how their targets are defined
- merges records that share a name: newest Foundation values win, gaps are filled from SR Legacy, portions are combined
- keeps missing values as `null`, never 0, so the Atlas can show "no data" honestly

USDA rarely reports biotin, chromium, molybdenum, iodine, boron or sulfur, so those show as no or partial data for USDA-logged foods.

## Logging

- **Search:** USDA foods with real portion sizes
- **AI estimate:** copy a prompt into any chatbot and paste the JSON reply back. See [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).
- **My foods / Today:** re-log saved foods; edit or remove entries. Logging goes to the day being viewed, so past days can be back-filled.

## History

The dashboard can show any past day (‹ › or the date picker) or a 7-day average. `#/history` has a score calendar, persistent gaps and a 28-day nutrient heatmap. No data yet? Settings → Your data → **Load sample history** adds 3 removable weeks of meals.

Everything is stored locally in the browser (IndexedDB via Dexie). Settings → Your data can export, import or delete it.

## Personal targets

Settings (`#/settings`) holds your profile: sex, age, weight, height, life stage, activity, goal and diet. Targets come from the DRI tables (RDA/AI + upper limits) by age group and sex, including pregnancy and lactation. Protein follows your goal (g/kg) and calories use Mifflin–St Jeor × activity. See [src/lib/targets.ts](src/lib/targets.ts).

To sanity-check targets for sample profiles:

```bash
bun scripts/check-targets.ts
```

## Docs

- [SPEC.md](SPEC.md): what the app does today
- [docs/ROADMAP.md](docs/ROADMAP.md): product direction and milestones
- [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md): AI meal estimation, manual now and automated later
- [docs/HOSTING.md](docs/HOSTING.md): deployment plan (GitHub + Cloudflare Pages)

## Use it on your phone

The app is a PWA: installable, and fully usable offline once loaded (the USDA food table is cached too). Data lives on each device separately. Use Settings → Your data → Export / Import to move it until sync exists.

**Quick try on the same Wi-Fi (no install):**

```bash
bun run build && bunx vite preview --host
```

Then open `http://<your-PC-IP>:4173` on the phone. Phones only allow installing and offline mode over **HTTPS**, so this is for a quick look.

**Install properly:** host the `dist/` folder on any static HTTPS host (Netlify, Cloudflare Pages, GitHub Pages, …). The build uses relative paths, so a subfolder works too. Then:
- **Android (Chrome):** menu → *Install app*.
- **iPhone (Safari):** Share → *Add to Home Screen*.

The hosted site contains only the app and the public USDA data. Your logs stay in each phone's own storage.

Icons are generated from `public/icons/icon.svg` with `pwsh scripts/render-icons.ps1`.

## Supplements

Log food → **Supplements** (or the pill in the phone tab bar). Add one from its Supplement Facts label (presets for common ones; IU converts automatically for vitamins D, A and E). Daily supplements are logged automatically each day. Untick a day you skipped, or pause a supplement. Upper limits that apply to supplements only (magnesium, niacin, folic acid, vitamin E) are checked against supplement intake alone.

## Limits and faster logging

- **Limits ("stay under"):** sodium, saturated fat, trans fat, added sugar, cholesterol, caffeine and alcohol, with personalised daily limits. They're shown as gauges below the Atlas and are never part of the nourishment score.
- **Quick add** (above the search box): repeat a previous meal, log a saved meal, or re-log a recent food in one tap.
- **Save as meal** (Log → Today, on any meal): turn it into a one-tap saved meal or a recipe that makes N portions.
- **Best next food:** searches all USDA foods for the single portion that closes the most gaps, respecting diet style and limits. One tap to log it.

## Labels, setup and insights

- **Create a food from its label** (Log → My foods): paste the Nutrition Facts text (from a product page, or from a photo via Live Text / Google Lens) and it's read automatically, or type it line by line. The supplement editor has the same paste box.
- **First-run setup** (`#/welcome`) walks through profile, goals and supplements, then shows your targets. Re-run it from Settings.
- **Weekly insights:** "This week" on the dashboard and a full weekly report in History, with gaps plus food ideas, limits, diet risks and food-pairing tips.

## Products: rate brands

Products (phone tab bar, or the bottle icon on desktop) ranks branded supplements and packaged foods for you: paste a label, import a CSV (template included) or a shared product file, or have any AI chat read label photos with the built-in prompt. Each gets an A–E score from how well it fills your gaps, dose and upper limits, ingredient forms or nutrient density, and cost; compare up to four side by side.

## Blood tests and spreadsheets

- **Blood tests** (Settings → Blood tests): add a vitamin D, ferritin or B12 result and the Vitamin D, Iron and B12 detail panels show your level next to your intake, with what a mismatch usually means. Out-of-range results show up in the weekly report.
- **CSV export** (Settings → Your data): daily totals or every entry, for Excel, Sheets or a dietitian.

Sanity scripts: `bun scripts/check-targets.ts`, `bun scripts/check-suggestions.ts`, `bun scripts/check-sample-foods.ts`, `bun scripts/check-label-parse.ts`.
