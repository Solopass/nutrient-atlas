/**
 * End-to-end smoke test: builds the app, serves it on a spare port, and drives
 * a fresh headless Edge (or Chrome) profile through the main path a new user
 * takes. Fails on any broken step or any console error.
 *
 *   bun run e2e            (add --keep to leave the browser profile for inspection)
 *   bun run e2e --url https://nutrient-atlas.pages.dev/   (test a deployed site; no build, no local server)
 *
 * Uses the Chrome DevTools Protocol directly, so there is nothing to install.
 * It never touches your real data: its own build folder, port and browser profile.
 */
import { spawn, type Subprocess } from 'bun'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const PORT = 4199
const urlArg = process.argv.indexOf('--url')
const REMOTE = urlArg > 0 ? process.argv[urlArg + 1] : null
const BASE = REMOTE ? (REMOTE.endsWith('/') ? REMOTE : REMOTE + '/') : `http://localhost:${PORT}/`
const BROWSERS = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean) as string[]
const keep = process.argv.includes('--keep')

const LOG = `document.querySelector('[role=dialog][aria-label="Log food"]')`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let server: Subprocess | null = null
let browser: Subprocess | null = null
let profile = ''

// ── CDP plumbing ──────────────────────────────────────────────────────────────
let ws: WebSocket
let nextId = 0
const pending = new Map<number, (v: { result?: any; error?: any }) => void>()
const consoleErrors: string[] = []
/** Answers intercepted requests (CDP Fetch domain) so steps never depend on outside services. */
let onRequestPaused: ((p: { requestId: string; request: { url: string } }) => void) | null = null

function send(method: string, params: object = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })
}

/** Evaluate in the page (async allowed) and return the value. */
async function js<T = unknown>(expression: string): Promise<T> {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(`In page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
  return r.result.value as T
}

async function waitFor(what: string, expression: string, timeout = 10_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await js<boolean>(`return !!(${expression})`).catch(() => false)) return
    await sleep(150)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const text = () => js<string>('return document.body.innerText')
/** Click the first button/link whose text starts with `label`. */
async function click(label: string, scope = 'document') {
  // Retries briefly: pages and log tabs load on demand, so a button can appear a moment after navigation.
  let ok = false
  for (let i = 0; i < 30 && !ok; i++) {
    ok = await js<boolean>(`const b = [...${scope}.querySelectorAll('button, a')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}) && !b.disabled); if (b) b.click(); return !!b`)
    if (!ok) await sleep(100)
  }
  if (!ok) throw new Error(`No enabled button "${label}"`)
  await sleep(250)
}
/** Type into an input/textarea the way React sees it. */
async function fill(selector: string, value: string) {
  const ok = await js<boolean>(`const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true`)
  if (!ok) throw new Error(`No field ${selector}`)
  await sleep(250)
}

// ── Steps ─────────────────────────────────────────────────────────────────────
const steps: [string, () => Promise<void>][] = [
  [
    'first run shows setup',
    async () => {
      await send('Page.navigate', { url: BASE })
      await waitFor('the welcome screen', `document.body.innerText.includes("See what you're actually getting")`, 20_000)
    },
  ],
  [
    'setup: profile → goals → a supplement → ready',
    async () => {
      await click('Get started')
      await waitFor('About you', `document.body.innerText.includes('About you')`)
      await click('Continue')
      await click('Continue')
      await waitFor('the supplements step', `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Vitamin D3'))`)
      await click('Vitamin D3')
      await click('Add 1 & continue')
      await waitFor('the ready step', `document.body.innerText.includes('Go to the Atlas')`)
      await click('Go to the Atlas')
    },
  ],
  [
    'dashboard shows the Atlas and the auto-logged supplement',
    async () => {
      await waitFor('the Atlas', `document.getElementById('atlas-svg')`)
      await waitFor('the supplement in the header', `/1 supplement/.test(document.querySelector('header p')?.innerText ?? '')`)
      // Drawn just after the Atlas (deferred, below the fold).
      await waitFor('the limits and periodic table', `/Periodic table/.test(document.querySelector('main').textContent) && /stay under/.test(document.querySelector('main').textContent)`)
      if ((await text()).includes('Set up your profile')) throw new Error('Finished setup but the dashboard still asks to set up a profile')
    },
  ],
  [
    'log a food from USDA search',
    async () => {
      await click('+ Log food')
      await waitFor('the search box', `document.querySelector('[aria-label="Log food"] input[placeholder^="Search"]') && !document.querySelector('[aria-label="Log food"] input[placeholder^="Search"]').placeholder.includes('Loading')`, 20_000)
      await fill('[aria-label="Log food"] input[placeholder^="Search"]', 'banana raw')
      await waitFor('search results', `[...document.querySelectorAll('[aria-label="Log food"] li button')].some((b) => /Bananas/.test(b.textContent))`)
      await js(`[...document.querySelectorAll('[aria-label="Log food"] li button')].find((b) => /Bananas/.test(b.textContent)).click()`)
      await sleep(300)
      await click('Log to', LOG)
      await waitFor('the Today list', `[...document.querySelectorAll('[aria-label="Log food"] li')].some((li) => /Bananas/.test(li.textContent))`)
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      await waitFor('the header count', `/1 item logged/.test(document.querySelector('header p')?.innerText ?? '')`)
    },
  ],
  [
    'build and save a recipe',
    async () => {
      const sheet = '[role=dialog][aria-label="Log food"]'
      await click('+ Log food')
      await click('My foods', LOG)
      await waitFor('My foods', `[...document.querySelectorAll('${sheet} button')].some((b) => b.textContent.includes('Build a recipe'))`)
      await js(`[...document.querySelectorAll('${sheet} button')].find((b) => b.textContent.includes('Build a recipe')).click()`)
      await fill(`${sheet} input[placeholder="e.g. Lentil dal"]`, 'Test dal')
      await waitFor('the ingredient search', `!document.querySelector('${sheet} input[aria-label="Add an ingredient"]')?.placeholder.includes('Loading')`, 20_000)
      await fill(`${sheet} input[aria-label="Add an ingredient"]`, 'lentils boiled')
      await waitFor('ingredient results', `document.querySelectorAll('${sheet} [aria-label="Ingredient results"] button').length > 0`)
      await js(`document.querySelector('${sheet} [aria-label="Ingredient results"] button').click()`)
      await click('Add to recipe', LOG)
      await waitFor('the per-portion summary', `/One portion · \\d+ kcal/.test(document.querySelector('${sheet} [aria-label="One portion"]')?.innerText ?? '')`)
      await js(`[...document.querySelectorAll('${sheet} button')].find((b) => b.textContent.trim() === 'Save').click()`) // not "Save and log"
      await waitFor('the saved recipe', `[...document.querySelectorAll('${sheet} li')].some((li) => /Test dal/.test(li.textContent) && /1 of 4 portions/.test(li.textContent))`)
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
    },
  ],
  [
    'nutrient detail panel opens and closes',
    async () => {
      await js(`document.querySelector('[aria-label^="Potassium"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await waitFor('the detail panel', `document.querySelector('aside[role=dialog]')?.innerText.includes('Potassium')`)
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      await waitFor('the panel to close', `document.querySelector('aside[role=dialog]')?.getAttribute('aria-hidden') === 'true'`)
    },
  ],
  [
    'products: import two supplements and see them ranked',
    async () => {
      await js(`location.hash = '#/products'`)
      await click('Import')
      await fill('main textarea', JSON.stringify({
        products: [
          { brand: 'A', name: 'Magnesium Glycinate', serving: '2 capsules', servingsPerContainer: 60, price: 18, nutrients: { magnesium: 200 }, forms: { magnesium: 'glycinate' } },
          { brand: 'B', name: 'Magnesium 500', serving: '1 tablet', servingsPerContainer: 100, price: 6, nutrients: { magnesium: 500 }, forms: { magnesium: 'oxide' } },
        ],
      }))
      await click('Import 2 products')
      await waitFor('two ranked cards', `document.querySelectorAll('main ol > li').length === 2`)
      if (!/over the upper limit/.test(await text())) throw new Error('Expected the 500 mg product to be flagged over the upper limit')
    },
  ],
  [
    'history, clinician report and settings render',
    async () => {
      await js(`location.hash = '#/history'`)
      await waitFor('History', `/nutrient heatmap/i.test(document.body.innerText)`)
      await js(`document.querySelector('a[href="#/report"]').click()`)
      // Today is in progress, so the report has no complete days yet; the supplement from setup is still listed.
      await waitFor('the clinician report', `/Nutrition summary/.test(document.body.innerText) && /Supplements taken/i.test(document.body.innerText) && /Vitamin D3/.test(document.querySelector('main').innerText)`)
      await js(`location.hash = '#/settings'`)
      await waitFor('Settings', `/your data/i.test(document.body.innerText)`)
    },
  ],
  [
    'theme and colour-blind palette switch without errors',
    async () => {
      for (const t of ['Light', 'Dark', 'Colour-blind safe', 'Standard', 'System'])
        if (await js<boolean>(`return [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === ${JSON.stringify(t)})`)) await click(t)
    },
  ],
  [
    'data survives a reload',
    async () => {
      await send('Page.navigate', { url: BASE })
      await waitFor('the dashboard after reload', `/1 item logged/.test(document.querySelector('header p')?.innerText ?? '')`, 20_000)
    },
  ],
  [
    'log a packaged food by barcode, then scan it (databases and camera faked locally)',
    async () => {
      // Fake both databases: USDA returns a real Cheerios record (saved fixture), Open Food Facts doesn't know it.
      const usda = await Bun.file(join(ROOT, 'src/test/fixtures/fdc-cheerios.json')).text()
      const seen: string[] = []
      onRequestPaused = ({ requestId, request }) => {
        seen.push(request.url)
        const isUsda = request.url.includes('api.nal.usda.gov')
        send('Fetch.fulfillRequest', {
          requestId,
          responseCode: isUsda ? 200 : 404,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: '*' },
          ],
          body: Buffer.from(isUsda ? usda : '{"status":0}').toString('base64'),
        }).catch(() => {})
      }
      await send('Fetch.enable', { patterns: [{ urlPattern: '*api.nal.usda.gov*' }, { urlPattern: '*openfoodfacts.org*' }] })
      try {
        const box = '[aria-label="Log food"] input[placeholder*="barcode"]'
        await click('+ Log food')
        await waitFor('the search box', `document.querySelector('${box}') && !document.querySelector('${box}').placeholder.includes('Loading')`, 20_000)
        await fill(box, '0 16000 34851 6')
        await waitFor('the USDA result', `/Cheerios, Oat Cereal/.test(${LOG}.innerText) && /USDA Branded Foods/i.test(${LOG}.innerText)`)
        if (!seen.some((u) => u.includes('api.nal.usda.gov') && decodeURIComponent(u).includes('016000348516'))) throw new Error(`USDA wasn't asked for the barcode: ${seen.join(', ')}`)
        await click('Log to', LOG)
        await waitFor('the Today list', `[...document.querySelectorAll('[aria-label="Log food"] li')].some((li) => /Cheerios/.test(li.textContent))`)
        // Second time: from your foods, no lookup.
        const before = seen.length
        await click('Search', LOG)
        await fill(box, '0016000348516')
        await waitFor('the saved food', `/In your foods/i.test(${LOG}.innerText)`)
        if (seen.length !== before) throw new Error('A saved barcode food was looked up online again')
        // Scan: a stand-in BarcodeDetector "sees" the code on the fake camera's third frame.
        await fill(box, '')
        await js(`let n = 0; window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13', 'upc_a'] } async detect() { return ++n >= 3 ? [{ rawValue: '016000348516' }] : [] } }; return 1`)
        await click('Search', LOG)
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
        await click('+ Log food')
        await click('▥ Scan', LOG)
        await waitFor('the camera preview', `!!${LOG}.querySelector('video[aria-label="Camera preview"]')`)
        await waitFor('the scanned food', `${LOG}.querySelector('input[placeholder*="barcode"]').value === '016000348516' && /In your foods/i.test(${LOG}.innerText)`)
        if (await js<boolean>(`return !!${LOG}.querySelector('video')`)) throw new Error('The camera stayed open after a scan')
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      } finally {
        await send('Fetch.disable')
        onRequestPaused = null
      }
    },
  ],
  [
    'MealVision hand-over: import links and the Photo step (MealVision faked locally)',
    async () => {
      const meal = { items: [{ name: 'Grilled Salmon Fillet', quantity: '180g', grams: 180, confidence: 'high', nutrients: { protein: 39.2, vitD: 19.8, retinol: 21, alcohol: 0 } }, { name: 'Steamed Broccoli', quantity: '120g', grams: 120, confidence: 'medium', nutrients: { vitC: 78, fiber: 4, cholesterol: 0 } }, { name: 'Mystery Sauce', quantity: '40g', grams: 40, confidence: 'low', nutrients: {} }], notes: 'Analyzed via MealVision engine. No USDA match, so nutrients unknown (not zero): Mystery Sauce.' }
      // 1. "Open on Cloudflare Atlas": the link opens the review, and the payload leaves the address bar.
      await send('Page.navigate', { url: `${BASE}#/log?import=${encodeURIComponent(JSON.stringify(meal))}` })
      await waitFor('the imported meal in review', `/Grilled Salmon Fillet/.test(${LOG}?.innerText ?? '') && /Log 3 items/.test(${LOG}.innerText)`, 20_000)
      // A food MealVision couldn't match arrives without nutrients and says what logging it means.
      await waitFor('the no-data explanation', `/No nutrient data\\. Untick to skip it/.test(${LOG}.innerText)`)
      if (await js<boolean>(`return location.hash.includes('import')`)) throw new Error('The import payload stayed in the address bar')
      await click('Log 3 items', LOG)
      await waitFor('the Today list', `[...document.querySelectorAll('[aria-label="Log food"] li')].some((li) => /Steamed Broccoli/.test(li.textContent))`)
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      // 2. A recipe card link opens the recipe builder, pre-filled, without saving anything yet.
      const recipe = { name: 'MealVision Dish', servings: 2, items: [{ name: 'Brown rice', serving: '150g', multiplier: 1, nutrients: { carbs: 35, magnesium: 64 } }] }
      await send('Page.navigate', { url: `${BASE}#/log?import=${encodeURIComponent(JSON.stringify(recipe))}` })
      await waitFor('the pre-filled recipe builder', `${LOG}?.querySelector('input[placeholder="e.g. Lentil dal"]')?.value === 'MealVision Dish' && /Brown rice/.test(${LOG}.innerText) && /Imported: check the amounts/.test(${LOG}.innerText)`, 20_000)
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      // 3. Photo step: switch MealVision on, then a photo goes to it and the answer opens in review.
      const seen: string[] = []
      onRequestPaused = ({ requestId, request }) => {
        seen.push(request.url)
        const body = request.url.endsWith('/health') ? { status: 'healthy', foods_indexed: 8062 } : meal
        send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(() => {})
      }
      await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:8085/*' }] })
      try {
        await js(`location.hash = '#/settings'`)
        await waitFor('the companion apps switch', `[...document.querySelectorAll('label')].some((l) => /MealVision on this PC/.test(l.textContent))`)
        await js(`[...document.querySelectorAll('label')].find((l) => /MealVision on this PC/.test(l.textContent)).querySelector('input').click()`)
        await waitFor('MealVision connected', `/Connected \\(8,062 foods indexed\\)/.test(document.body.innerText)`)
        await js(`location.hash = '#/'`)
        await click('+ Log food')
        await click('AI estimate', LOG)
        await waitFor('the Photo step', `/Photo, analysed by MealVision/.test(${LOG}.innerText)`)
        const doc = await send('DOM.getDocument', { depth: -1 })
        const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[aria-label="Log food"] input[type=file][accept="image/*"]' })
        await send('DOM.setFileInputFiles', { nodeId, files: [join(ROOT, 'public/icons/icon-192.png')] })
        await waitFor('the photo estimate in review', `/Log 3 items/.test(${LOG}.innerText)`)
        if (!seen.some((u) => u.endsWith('/v1/estimate'))) throw new Error('The photo was not sent to MealVision')
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
      } finally {
        await send('Fetch.disable')
        onRequestPaused = null
      }
    },
  ],
]

// ── Run ───────────────────────────────────────────────────────────────────────
async function main() {
  const exe = BROWSERS.find((p) => existsSync(p))
  if (!exe) throw new Error('Edge or Chrome not found; set BROWSER_PATH')

  if (REMOTE) {
    console.log(`Testing ${BASE} (deployed; nothing built or served locally)`)
    if (!(await fetch(BASE).then((r) => r.ok).catch(() => false))) throw new Error(`${BASE} didn't answer`)
  } else {
    console.log('Building…')
    const build = Bun.spawnSync(['bun', 'x', 'vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
    if (build.exitCode !== 0) throw new Error('Build failed')

    server = spawn(['bun', 'x', 'vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdout: 'ignore', stderr: 'pipe' })
    for (let i = 0; i < 100 && !(await fetch(BASE).then((r) => r.ok).catch(() => false)); i++) await sleep(100)
  }

  profile = mkdtempSync(join(tmpdir(), 'atlas-e2e-'))
  const cdpPort = 9400 + Math.floor(Math.random() * 400)
  // --disable-extensions: extensions installed for every profile (e.g. a crypto wallet) inject scripts that log warnings.
  // Fake camera: lets the barcode step test scanning without hardware or a permission prompt.
  browser = spawn([exe, '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`, '--window-size=1280,900', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
  let target: { webSocketDebuggerUrl: string } | undefined
  for (let i = 0; i < 100 && !target; i++) {
    target = await fetch(`http://127.0.0.1:${cdpPort}/json`).then((r) => r.json()).then((ts: any[]) => ts.find((t) => t.type === 'page')).catch(() => undefined)
    if (!target) await sleep(100)
  }
  if (!target) throw new Error('Browser did not start')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data))
    if (m.id) pending.get(m.id)?.(m)
    else if (m.method === 'Fetch.requestPaused') onRequestPaused?.(m.params)
    else if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
      consoleErrors.push(`${m.params.type}: ${m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`)
  }
  await send('Runtime.enable')
  await send('Page.enable')

  let failed = false
  for (const [name, run] of steps) {
    const t = Date.now()
    try {
      await run()
      if (consoleErrors.length) throw new Error(`Console: ${consoleErrors.splice(0).join(' | ')}`)
      console.log(`  ✓ ${name} (${Date.now() - t} ms)`)
    } catch (e) {
      failed = true
      console.log(`  ✗ ${name}\n    ${(e as Error).message}`)
      const shot = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
      if (shot) {
        await Bun.write(join(ROOT, 'e2e-failure.png'), Buffer.from(shot.data, 'base64'))
        console.log('    screenshot: e2e-failure.png')
      }
      break
    }
  }
  return failed
}

let failed = true
try {
  failed = await main()
} catch (e) {
  console.error(`E2E setup failed: ${(e as Error).message}`)
} finally {
  // Close the whole browser (it spawns many child processes; killing only the parent leaves them running).
  await Promise.race([send('Browser.close').catch(() => {}), sleep(1500)])
  try {
    ws?.close()
  } catch {}
  for (const p of [browser, server]) {
    if (!p?.pid) continue
    if (process.platform === 'win32') Bun.spawnSync(['taskkill', '/PID', String(p.pid), '/T', '/F'], { stdout: 'ignore', stderr: 'ignore' })
    else p.kill()
  }
  await sleep(500)
  // Windows can hold the browser profile for a moment after exit.
  for (let i = 0; i < 10 && profile && !keep; i++) {
    try {
      rmSync(profile, { recursive: true, force: true })
      break
    } catch {
      await sleep(300)
    }
  }
}
console.log(failed ? '\nE2E FAILED' : '\nE2E passed')
process.exit(failed ? 1 : 0)
