# Hosting plan

Not deployed yet. This is the plan for when we do.

## Recommendation: GitHub + Cloudflare Pages

| Option | Static app | Serverless for AI proxy (M6) | Data/sync later (M7) | Cost | Verdict |
|---|---|---|---|---|---|
| **Cloudflare Pages** | ✅ free, fast global CDN, HTTPS | ✅ Pages Functions / Workers, same project | ✅ D1 / KV / R2 on the same account | $0 for our scale | **Pick this** |
| Netlify | ✅ | ✅ Netlify Functions | ⚠ needs a separate DB service | $0, tighter free limits | Good runner-up |
| GitHub Pages | ✅ | ❌ static only | ❌ | $0 | Fine now, dead end at M6 |
| Vercel | ✅ | ✅ | ⚠ separate DB | $0 hobby (non-commercial) | OK, license limits if it becomes a product |

**Why Cloudflare:** the next two milestones need server code: the AI proxy that holds an API key (M6) and optional encrypted sync (M7). Cloudflare runs both next to the static site under one domain, free at our scale, so we never migrate.

## Setup (about 15 minutes, once)

1. **Git:** first commit of `D:\Nutrition App` (the repo is initialised but has no commits). `.gitignore` already excludes `node_modules`, `dist` and `data/usda-raw`. `public/usda/foods.json` (2.6 MB) *is* committed, so builds don't need the raw USDA download.
2. **GitHub:** create a **private** repo, `nutrient-atlas`, and push `main`.
3. **Cloudflare Pages:** Dashboard → Workers & Pages → Create → Pages → *Connect to Git* → pick the repo.
   - Build command: `bun install && bun run build` (npm also works: `npm install && npm run build`)
   - Output directory: `dist`
   - Env var if the build image needs it: `BUN_VERSION=1.4.2`
4. It deploys to `https://nutrient-atlas.pages.dev`. Open it on the phone and install (Android: Chrome menu → *Install app*; iPhone: Safari Share → *Add to Home Screen*).
5. **Optional custom domain** (e.g. `atlas.yourdomain.com`) in Pages → Custom domains. HTTPS is automatic.

After that, **every push to `main` deploys**, and every other branch gets its own preview URL, so we can try changes on the phone before they go live.

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

- `sw.js` must never be cached long, or phones won't pick up updates. Hashed `/assets/*` can be cached forever.
- `camera=(self)` is for barcode scanning (M5).
- Hash routing (`#/history`) means no SPA redirect rules are needed.

## Updates and data safety

- The service worker is `autoUpdate`: a phone gets the new version on the next launch after a deploy (at most one launch stale).
- User data lives in each device's IndexedDB and is **never uploaded**. The site only serves code and public USDA data.
- Dexie schema changes must always be additive `db.version(n)` upgrades. Never edit an old version, or installed phones break.
- Before risky changes: Settings → Export backup.

## Privacy and cost

- No analytics, no cookies, no accounts. The site stores nothing about visitors.
- A public URL means anyone with it can use the app, each with their own local data. Fine now; add Cloudflare Access (free for small teams) if you want it private.
- Cost: $0. Cloudflare's free tier covers unlimited static requests and 100k Function calls/day, far beyond one person's AI estimates.

## Later milestones on the same stack

- **M6 AI proxy:** `functions/api/estimate.ts` (Pages Function), API key in Cloudflare encrypted env vars, rate-limited per device.
- **M7 sync:** end-to-end encrypted blobs in R2 or D1, keyed by a passphrase-derived ID, so the server can't read your logs.
