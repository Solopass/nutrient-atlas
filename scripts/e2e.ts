/**
 * End-to-end smoke test: builds the app, serves it on a spare port, and drives
 * a fresh headless Edge (or Chrome) profile through the main path a new user
 * takes. Fails on any broken step or any console error.
 *
 *   bun run e2e            (add --keep to leave the browser profile for inspection)
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
const BASE = `http://localhost:${PORT}/`
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
      await click('Report for your clinician')
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
]

// ── Run ───────────────────────────────────────────────────────────────────────
async function main() {
  const exe = BROWSERS.find((p) => existsSync(p))
  if (!exe) throw new Error('Edge or Chrome not found; set BROWSER_PATH')

  console.log('Building…')
  const build = Bun.spawnSync(['bun', 'x', 'vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
  if (build.exitCode !== 0) throw new Error('Build failed')

  server = spawn(['bun', 'x', 'vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdout: 'ignore', stderr: 'pipe' })
  for (let i = 0; i < 100 && !(await fetch(BASE).then((r) => r.ok).catch(() => false)); i++) await sleep(100)

  profile = mkdtempSync(join(tmpdir(), 'atlas-e2e-'))
  const cdpPort = 9400 + Math.floor(Math.random() * 400)
  browser = spawn([exe, '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`, '--window-size=1280,900', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
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
