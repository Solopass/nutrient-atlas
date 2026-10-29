# Nutrient Atlas

A nutrition tracker built around **micronutrient coverage**. One radial chart (the Atlas) shows every vitamin, mineral, fatty acid and amino acid as a % of your personal target, says honestly when data is missing, and suggests the food that closes the most gaps. Local-first: your data stays in your browser.

- What it does, in detail: [SPEC.md](SPEC.md)
- Where it's going: [docs/ROADMAP.md](docs/ROADMAP.md)

## Use it on this PC

Double-click **`Nutrient Atlas.cmd`**. It builds the latest version, serves it in the background on http://localhost:4173, and opens it in its own window.

- **Install it once:** in that window, Edge menu → *Apps → Install Nutrient Atlas*. You get a Start menu / taskbar app that **works even when the server isn't running** (it's cached for offline use), and installed apps get protected storage.
- **After updates:** run `Nutrient Atlas.cmd` again; the installed app picks up the new version on its next launch.
- **Your data lives with `localhost:4173` in that browser.** Development uses other ports (5173 dev, 5174 test, 4199 automated test), so work in progress never touches it.
- **Back up now and then:** Settings → Your data → Export backup; on a phone it's *Save backup to…*, which opens the share sheet (Files, Google Drive, iCloud Drive, email). The dashboard reminds you every two weeks. To move to another browser or device, use **Restore a backup…** on the setup screen (or Settings → Import backup).

## What's in it

**The Atlas** (dashboard)
- 14 core nutrients as wedges, ~30 secondary ones in an outer ring and a periodic table; status colours, missing-data hatching, upper-limit markers.
- **Day or 7-day** view; **Done for today** counts today before midnight.
- **By status / By meal** colouring; dots for the share from supplements; a tick at yesterday's (or last week's) level; 7-day low–high whiskers.
- **Replay 30 days**, **Save image**, keyboard navigation and a screen-reader summary.
- **Best next food** across 8,000 USDA foods plus your own; hover or ◎ Preview to see what it would add.
- **Plan tomorrow:** 2–4 foods that close your gaps together, built on a typical day from your last week. Preview it on the Atlas, swap any food, save it; the next day it's a checklist with one-tap logging.
- Tap a food under the chart for its **footprint**, then **drag it (or − / +) to change the portion**.

**Logging** (the + button)
- **Search** USDA foods with real portions; **Quick add** repeats a meal, a saved meal or a recent food.
- **Barcode:** type or paste the number in the search box, use a USB scanner, or tap **▥ Scan** (built in on Android Chrome; on iPhone, switch on the optional free scanner add-on in Settings → Food databases). It checks your foods, then the free **USDA Branded Foods** and **Open Food Facts** databases; found foods are saved so the next time is instant. A free USDA key in Settings → Food databases raises the lookup limit.
- **AI estimate:** copy a prompt into any chatbot and paste its JSON reply ([docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md)).
- **Recipes:** build a dish from ingredients (your foods or USDA), or **paste an ingredient list** from a website (each line matched to USDA foods and grams for you to check); say how many portions it makes, see one portion's nutrients, log a portion at a time; edit it later.
- **My foods:** paste a Nutrition Facts label to create a food; saved meals and recipes.
- **Supplements** from their label, logged automatically each day.
- **Today:** edit servings, remove (with Undo), save a meal.

**MealVision** (companion app, `D:\Workspace\meal-vision`): photograph a meal and it identifies the foods and portions using the same USDA table.
- **Open on Cloudflare Atlas** opens Nutrient Atlas with the meal ready to review (works with the live site; nothing is logged until you confirm).
- **Copy Meal Log / Recipe Card / Single Food**: paste into Log food → AI estimate; recipes and foods open in the right editor.
- **Photo step in Atlas:** Settings → Companion apps → *MealVision on this PC*, then Log food → AI estimate → *Choose photo* (PC only, with MealVision running).

**Products** (rate brands)
- Add supplements and packaged foods from a pasted label, a **barcode** (Open Food Facts), a CSV, a shared list, or label photos read by any AI chat.
- A personal **A–E score**: fills your gaps, dose and upper limits, ingredient forms, nutrient density, value, third-party testing.
- Star ratings, compare up to 4, **Take daily** / **Log a serving**, share a list.

**Insights and history**
- **Weekly report:** score change, wins, persistent gaps with food ideas, limits, diet and life-stage risks, food-pairing tips, blood tests.
- **History:** score calendar, persistent gaps, a 28-day nutrient heatmap.
- **Long-term trends:** each nutrient's detail panel shows 90 days (weekly) or a year (monthly), with your blood tests on the same timeline.
- **Report for your clinician:** 30/60/90-day averages vs targets, key findings, limits, supplements and blood tests on one printable page (or PDF).

**Your targets and health context** (Settings)
- DRI targets by age, sex, pregnancy and lactation; goals (protein g/kg, calories); diet style; limits (sodium, sugar, saturated fat…).
- **Your own targets:** tap any target to replace the DRI (e.g. on a clinician's advice); shown as "custom".
- **Sun** setting for vitamin D.
- **Blood tests** over time: vitamin D, ferritin, B12, folate, magnesium, omega-3 index, each with a trend.
- **Appearance:** System / Dark / Light, and colour-blind safe status colours with shape markers.
- **Your data:** backup, import, CSV export (daily totals or every entry), sample history, storage protection. The dashboard reminds you when the last backup is two weeks old.

## Develop

Needs [Bun](https://bun.sh) (no Node required).

```bash
bun install
bun run dev        # http://localhost:5173 with hot reload
bun run app        # production build served on http://localhost:4173 (what the launcher runs)
bun run build      # production build into dist/
bun run deploy     # checks + build + upload to https://nutrient-atlas.pages.dev
```

**Checks before committing**

```bash
bun run typecheck  # app + tests
bun test           # ~170 unit tests, about 1 s
bun run e2e        # whole-app test in headless Edge/Chrome, ~20 s including its build
```

`bun install` turns on a **pre-commit hook** (`.githooks/pre-commit`) that runs the typecheck and unit tests on every commit. Run `bun run e2e` before larger changes.

- **Unit tests** live next to the code (`src/lib/*.test.ts`): targets (including custom ones) and limits, scoring, intake and history math, the AI-reply, label-text, Open Food Facts and USDA Branded readers, barcode lookups, product scoring and import, labs, recipes, the clinician report, backups and the reminder, and the database flows (in-memory IndexedDB via `fake-indexeddb`).
- **`bun run e2e`** ([scripts/e2e.ts](scripts/e2e.ts)) builds into `dist-e2e/`, serves it on :4199, and drives a fresh browser profile through:
  - setup, then logging a USDA food, building a recipe and the detail panel
  - Products (import and ranking), then History, the clinician report and Settings
  - switching theme, then a reload
  - logging and scanning by barcode, with both food databases and the camera faked locally (no network)
  It fails on any console error and saves `e2e-failure.png`.
- **Sanity scripts** print human-readable checks: `bun scripts/check-targets.ts`, `check-suggestions.ts`, `check-sample-foods.ts`, `check-label-parse.ts`.
- Dev-only routes: `#/dev/sample` (load sample history and skip setup), `#/dev/crash` (test the crash screen).
- Icons are generated from `public/icons/icon.svg` with `pwsh scripts/render-icons.ps1`.

## Food data

Search uses **USDA FoodData Central** (public domain), preprocessed into `public/usda/foods.json` (~8,000 whole foods, 2.8 MB). In the app it's loaded and searched in a Web Worker, so it never freezes the screen.

To rebuild it (e.g. after a new Foundation Foods release):

1. Download the **Foundation Foods** and **SR Legacy** CSV zips from https://fdc.nal.usda.gov/download-datasets/ into `data/usda-raw/` and unzip them there (git-ignored).
2. `bun run build:usda`

The script ([scripts/build-usda.ts](scripts/build-usda.ts)):
- maps USDA nutrient ids to the app's and converts units (copper mg → mcg, EPA/DHA and amino acids g → mg, vitamin D IU → mcg as a fallback)
- reports methionine as Met + Cys and phenylalanine as Phe + Tyr, to match their targets
- keeps a hidden **retinol** value per food, because the vitamin A upper limit applies to preformed vitamin A only
- merges records that share a name: newest Foundation values win, SR Legacy fills gaps, portions are combined
- keeps missing values as `null`, never 0, so the Atlas can show "no data" honestly

USDA rarely reports biotin, chromium, molybdenum, iodine, boron or sulfur, so those show as no or partial data for USDA foods; supplement and food labels fill them in.

## On a phone

It's a PWA: installable and fully usable offline once loaded. **It's live at https://nutrient-atlas.pages.dev** (free Cloudflare Pages; updates go out with `bun run deploy`, see [docs/HOSTING.md](docs/HOSTING.md)).

- **Android (Chrome):** open it → menu ⋮ → *Install app*. Scan works out of the box.
- **iPhone (Safari):** open it → Share → *Add to Home Screen*, and always start it from that icon (Safari can clear data from websites you rarely visit, but not from home-screen apps). For Scan, switch on the free scanner add-on in Settings → Food databases.
- **Move your data:** Export backup on the PC, send the file to the phone, then *Restore a backup…* on the setup screen. The phone and PC then keep separate logs until sync exists.

For a quick look on the same Wi-Fi (no install, no camera):

```bash
bun run build && bunx vite preview --host
```

then open `http://<this-PC's-IP>:4173` on the phone. Each device keeps its own data; move it with Export / Restore a backup until sync exists.

## Docs

- [SPEC.md](SPEC.md): what the app does today, screen by screen, and the data model
- [docs/ROADMAP.md](docs/ROADMAP.md): plan, phases and what's shipped
- [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md): AI meal and label reading, manual now and automated later
- [docs/HOSTING.md](docs/HOSTING.md): deployment plan

Not medical advice: targets are the Dietary Reference Intakes for healthy people. Talk to a clinician about supplements, medical conditions, medications and blood test results.

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md): free for personal and other noncommercial use. For commercial use see [COMMERCIAL.md](COMMERCIAL.md). The bundled USDA food data is public domain.
