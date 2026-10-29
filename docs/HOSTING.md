# Hosting

**Live at https://nutrient-atlas.pages.dev** since 2026-10-09: Cloudflare Pages (classic), project `nutrient-atlas`, deployed straight from this PC with Wrangler. The source is public at https://github.com/Solopass/nutrient-atlas; only the built site is uploaded to Cloudflare.

## Deploying an update

```bash
bun run deploy
```

This runs the typecheck and unit tests, builds `dist/`, and uploads it to the production branch (`main`). Installed apps pick it up the next time they open. Before bigger releases also run `bun run e2e`, and afterwards `bun scripts/e2e.ts --url https://nutrient-atlas.pages.dev/`, which runs the whole-app test against the live site in a throwaway browser profile.

- **Sign-in:** Wrangler is signed in to your Cloudflare account on this PC (OAuth, stored in `%APPDATA%\xdg.config\.wrangler`). `bun x wrangler whoami` shows it; `bun x wrangler logout` or Cloudflare → My Profile → API Tokens revokes it.
- **Rollback:** Cloudflare dashboard → Workers & Pages → nutrient-atlas → Deployments → pick an earlier one → *Rollback*.
- **Classic Pages, on purpose:** Cloudflare is folding Pages into Workers, and Wrangler's `pages` commands try the new route first. This project was created with `--force` on classic Pages to get the short `pages.dev` address (the same setup as the `polymatica` site). Later Wrangler commands for it go to classic Pages directly; don't pass `--force` again.
- **Checked at launch:** right headers on every path (service worker and HTML not cached, hashed assets cached for a year, nosniff, camera limited to this site); the whole-app test passes against the live site; after one visit it reloads and searches USDA foods with the network off.

## Why it was worth doing

The rest of this page is the plan it was built from, kept for reference. Hosting was Phase B of the [roadmap](ROADMAP.md):

- **On your phone:** install it like an app, and it works offline.
- **Camera scanning:** phones only allow the camera on a secure (https) site. The Scan button is already built; it just needs this.
- **The base for later phases:** the AI proxy (Phase C) and sync (Phase D).

**Cost: $0.**

## Choice: Cloudflare Pages (a private GitHub repo turned out to be optional)

| Option | Static app | Server code for the AI proxy (Phase C) | Data / sync later (Phase D) | Cost | Verdict |
|---|---|---|---|---|---|
| **Cloudflare Pages** | ✅ free, fast global CDN, HTTPS | ✅ Pages Functions / Workers, same project | ✅ D1 / KV / R2 on the same account | $0 at our scale | **Pick this** |
| Netlify | ✅ | ✅ Netlify Functions | ⚠ needs a separate database service | $0, tighter free limits | Good runner-up |
| GitHub Pages | ✅ | ❌ static only | ❌ | $0 | Fine now, dead end at Phase C |
| Vercel | ✅ | ✅ | ⚠ separate database | $0 hobby (non-commercial) | OK; licence limits if it becomes a product |

**Why Cloudflare:** the next phases need server code (the proxy that holds an AI key, and optional encrypted sync). Cloudflare runs both next to the site under one address, free at our scale, so we never have to move.

## Decisions for you (with my recommendation)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **The address** | `https://<name>.pages.dev` (free) or your own domain (~$10/year, not free) | **Free `pages.dev`**, with a name you like (e.g. `nutrient-atlas`). **Pick it once:** each address keeps its own data on your phone, so changing it later means moving your data with a backup. |
| 2 | **Who can open it** | Anyone with the link (each person gets their own empty app; nothing of yours is on the server) or private behind Cloudflare Access (free; asks for an email code) | **Link-only to start.** Your logs never leave your phone either way. Access can be added later, but it can get in the way of offline launches and updates, so only if you want it. |
| 3 | **Your main logging device** | Phone or PC (they don't sync until Phase D) | **Phone for logging**, PC for big-screen looking and the clinician report via backup/restore. Or keep both and accept two separate logs. |
| 4 | **Commit email** | Commits show `realsolopass@gmail.com` as the author | Fine in a **private** repo. If you'd rather hide it, I can rewrite the author to your GitHub "noreply" address **before** the first push. |

## What I prepare before go day (local only, no publishing)

These change nothing outside this PC. I'll do them when you say go, or earlier if you ask:

1. **`public/_headers`** (below): never-cache the service worker, long-cache hashed files, camera allowed for this site only.
2. **Make the commit hook optional in builds:** `"prepare"` currently runs `git config …`. On a build server without git that would fail the install, so it becomes `git config core.hooksPath .githooks || true`.
3. **A clean-clone build check:** clone the repo into a temp folder, `bun install && bun run build`, and serve that `dist/`, which is exactly what Cloudflare will do. Catches anything that only works on this PC.
4. **All checks green:** typecheck, unit tests, e2e.
5. **History audit (done 2026-10-09):** 39 commits, no personal data (`backups/` was always ignored), no API keys or tokens, no remote yet. Largest file: the public USDA table (2.8 MB), which is meant to be there.

## Go day, step by step

| Step | Who | What |
|---|---|---|
| 1 | **You** | Create a free **GitHub** account (or use yours) and turn on two-factor sign-in. |
| 2 | **You** | Create an **empty private repo**, e.g. `nutrient-atlas` (no README, no licence), and send me its URL. |
| 3 | **You** | Sign this PC in to GitHub: run `gh auth login` in a terminal and follow its browser steps. Your password and codes go only into GitHub's own pages, never to me. |
| 4 | **Me** (after your OK) | Add the repo as `origin` and push `main`. Only code and the public USDA table go up: no data, no keys. |
| 5 | **You** | Create a free **Cloudflare** account. Dashboard → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → pick the repo. Build command `bun install && bun run build`, output folder `dist`. If the build can't find Bun, add the environment variable `BUN_VERSION=1.4.2`. Choose the project name (= your address, decision 1). |
| 6 | **Me** | Check the live site: it loads, works offline after one visit, sends the right headers, the service worker installs, and the app path works end to end (the e2e test pointed at the live address, with its own throwaway browser profile). |
| 7 | **You** | Install on your phone (below) and move your data (below). |

After that, **every push to `main` deploys by itself in about a minute**, and every other branch gets its own preview address, so changes can be tried on the phone before they go live.

## On your phone

**Install**
- **Android (Chrome):** open the address → menu ⋮ → *Install app*.
- **iPhone (Safari):** open the address → Share → *Add to Home Screen*. Always open it from the home-screen icon: Safari can clear data from websites you haven't visited for a while, but home-screen apps are kept.

**Move your data (once)**
1. On the PC: Settings → Your data → **Export backup**.
2. Get the file to the phone: AirDrop, email it to yourself, or Google Drive / iCloud Drive.
3. On the phone, on the setup screen: **Restore a backup…** and pick the file.

**Per-device settings** (they stay on each device and aren't in backups)
- **USDA key** for barcode lookups: paste it in Settings → Food databases (the same free key works on every device).
- **iPhone camera scanning:** Settings → Food databases → switch on the **free scanner add-on**. The first Scan downloads it (about half a megabyte). Android Chrome scans without it.

## One-week field test (B2): what to check

- Opens offline (airplane mode) from the home-screen icon.
- Nothing hidden by the notch or the home bar; the keyboard doesn't cover the field you're typing in.
- Scan works: on iPhone with the add-on, on Android without. Then the barcode lookup → log flow.
- Logging speed for your usual meals; the recipe builder on a small screen.
- Data is still there after a few days and a phone restart. Settings → Your data shows storage as protected.
- The backup reminder and export work, and the file can be restored.
- Anything slow, confusing or missing goes on the friction list (A1).

## Updates, rollback and safety

- **Updates:** I commit → the checks run → push → Cloudflare deploys → the app updates itself the next time you open it (`autoUpdate` service worker).
- **Rollback:** Cloudflare keeps every deploy. *Deployments* → pick the previous one → *Rollback*, in seconds. Your data isn't touched; it lives on the device.
- **Data safety rules:** database changes are always additive upgrades (`db.version(n)`, currently 5), never edits to old versions, or installed copies break. Before risky releases, export a backup.
- **Data stays separate per device and address:** the PC's daily app (`localhost:4173`), the hosted site on the PC, and the phone each have their own data until sync (Phase D).

## Files to add at deploy time

`public/_headers` (Cloudflare and Netlify both read it):

```
/sw.js
  Cache-Control: no-cache
/registerSW.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), geolocation=(), microphone=()
```

- `sw.js` must never be cached long, or phones won't pick up updates. Hashed `/assets/*` (including the USDA worker) can be cached forever.
- `camera=(self)` allows barcode scanning on this site only.
- Hash routing (`#/history`, `#/report`) means no single-page redirect rules are needed. Pages load as separate hashed chunks, all precached by the service worker, so they work offline.
- **Outside services, all free, all optional, and all called straight from the browser (CORS), so no proxy is needed:**
  - **USDA FoodData Central** (`api.nal.usda.gov`) and **Open Food Facts**, for barcode lookups; only the barcode number is sent.
  - **jsDelivr**, only if you switch on the scanner add-on; it serves the scanner code once.

## Privacy and cost

- No analytics, no cookies, no accounts. The site stores nothing about visitors; your logs stay in each device's own storage and are **never uploaded**.
- A link-only address means anyone who has it can open an empty copy of the app. Cloudflare Access (free) can make it private later.
- Cost: $0. Cloudflare's free tier covers unlimited static requests and 100k Function calls a day, far beyond one person's AI estimates later.

## Later phases on the same stack

- **Phase C, AI proxy:** `functions/api/estimate.ts` (a Pages Function), the API key in Cloudflare's encrypted environment variables, a monthly budget cap and a per-device rate limit. See [AI_INTEGRATION.md](AI_INTEGRATION.md).
- **Phase D, sync:** end-to-end encrypted blobs in R2 or D1, keyed by a passphrase-derived ID, so the server can't read your logs. Community product ratings would be a separate, opt-in, public table.
