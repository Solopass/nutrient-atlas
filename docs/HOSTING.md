# Hosting plan

**Not deployed yet.** Today the app runs on this PC (`Nutrient Atlas.cmd`, see the [README](../README.md)). Hosting is Phase B of the [roadmap](ROADMAP.md) and the biggest unlock left:

- **On your phone:** installable as an app.
- **Camera barcode scanning:** browsers only allow the camera over HTTPS.
- **The base for later phases:** the AI proxy (Phase C) and sync (Phase D).

It waits for your go-ahead. Nothing is pushed or published without it.

## Recommendation: GitHub + Cloudflare Pages

| Option | Static app | Server code for the AI proxy (Phase C) | Data / sync later (Phase D) | Cost | Verdict |
|---|---|---|---|---|---|
| **Cloudflare Pages** | ✅ free, fast global CDN, HTTPS | ✅ Pages Functions / Workers, same project | ✅ D1 / KV / R2 on the same account | $0 at our scale | **Pick this** |
| Netlify | ✅ | ✅ Netlify Functions | ⚠ needs a separate database service | $0, tighter free limits | Good runner-up |
| GitHub Pages | ✅ | ❌ static only | ❌ | $0 | Fine now, dead end at Phase C |
| Vercel | ✅ | ✅ | ⚠ separate database | $0 hobby (non-commercial) | OK; licence limits if it becomes a product |

**Why Cloudflare:** the next phases need server code: the proxy that holds an AI API key (Phase C) and optional encrypted sync (Phase D). Cloudflare runs both next to the static site under one domain, free at our scale, so we never migrate.

## Setup (about 15 minutes, once)

1. **GitHub:** create a **private** repo (e.g. `nutrient-atlas`) and push the existing local history on `main`. `.gitignore` already excludes `node_modules`, the build folders (`dist`, `dist-app`, `dist-e2e`), `data/usda-raw` and `backups/` (personal data). `public/usda/foods.json` (2.8 MB) *is* committed, so builds don't need the raw USDA download.
2. **Cloudflare Pages:** Dashboard → Workers & Pages → Create → Pages → *Connect to Git* → pick the repo.
   - Build command: `bun install && bun run build`
   - Output directory: `dist`
   - Env var if the build image needs it: `BUN_VERSION=1.4.2`
3. It deploys to `https://<project>.pages.dev`. Open it on the phone and install (Android: Chrome menu → *Install app*; iPhone: Safari Share → *Add to Home Screen*).
4. **Optional custom domain** (e.g. `atlas.yourdomain.com`) in Pages → Custom domains. HTTPS is automatic.
5. **Move your data to the phone:** on the PC, Settings → Export backup; on the phone, *Restore a backup…* on the setup screen. Each device then keeps its own data until sync (Phase D).

After that, **every push to `main` deploys**, and every other branch gets its own preview URL, so changes can be tried on the phone before they go live. Before deploying, run the checks: `bun run typecheck` and `bun test` (both also run on every commit), and `bun run e2e`.

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
- `camera=(self)` allows barcode scanning in Products.
- Hash routing (`#/history`, `#/report`) means no single-page redirect rules are needed. Pages load as separate hashed chunks, all precached by the service worker, so they work offline.
- The app calls two outside services, both free, both only for barcode lookups, and only the barcode number is sent: **USDA FoodData Central** (`api.nal.usda.gov`, with your own free key or the shared demo key) and **Open Food Facts**. Both allow calls straight from the browser (CORS), so no proxy is needed.

## Updates and data safety

- The service worker is `autoUpdate`: a device gets the new version on the next launch after a deploy.
- User data lives in each device's IndexedDB and is **never uploaded**. The site only serves code and public USDA data.
- Dexie schema changes must always be additive `db.version(n)` upgrades (currently 5). Never edit an old version, or installed copies break.
- Before risky changes: Settings → Export backup. The app shows the last backup date, reminds you on the dashboard after 14 days, and requests protected storage; installed apps usually get it.

## Privacy and cost

- No analytics, no cookies, no accounts. The site stores nothing about visitors.
- A public URL means anyone with it can use the app, each with their own local data. Fine for now; add Cloudflare Access (free for small teams) to make it private.
- Cost: $0. Cloudflare's free tier covers unlimited static requests and 100k Function calls/day, far beyond one person's AI estimates.

## Later phases on the same stack

- **Phase C, AI proxy:** `functions/api/estimate.ts` (a Pages Function), the API key in Cloudflare's encrypted environment variables, a monthly budget cap and a per-device rate limit. See [AI_INTEGRATION.md](AI_INTEGRATION.md).
- **Phase D, sync:** end-to-end encrypted blobs in R2 or D1, keyed by a passphrase-derived ID, so the server can't read your logs. Community product ratings would be a separate, opt-in, public table.
