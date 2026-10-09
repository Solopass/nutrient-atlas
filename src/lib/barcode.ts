import { db, FDC_KEY_SETTING, type Food, type Product } from '../db/db'
import { USDA_ENERGY_IDS, usdaToApp } from '../data/usdaNutrientMap'
import { fromOpenFoodFacts, offProductUrl, type OffProduct } from './products/openFoodFacts'

/**
 * Barcode lookups for logging, from free sources only, in this order:
 * 1. your own foods and rated products (instant, offline);
 * 2. USDA FoodData Central Branded Foods (US packaged foods, manufacturer
 *    data; free key, or the shared DEMO_KEY with a small hourly limit);
 * 3. Open Food Facts (worldwide, community data; no key).
 * When USDA and Open Food Facts both know a product, USDA's values win and
 * Open Food Facts only fills nutrients USDA lacks. Only the number is sent.
 */

export { FDC_KEY_SETTING }
export const FDC_DEMO_KEY = 'DEMO_KEY'
export const FDC_SIGNUP_URL = 'https://api.data.gov/signup/'
const FDC_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search'

// ── Barcode numbers ────────────────────────────────────────────────

/** A search-box entry that is a barcode: 8, 12, 13 or 14 digits, spaces and dashes allowed. */
export function parseBarcodeQuery(q: string): string | null {
  const t = q.trim()
  if (!/^[\d\s-]+$/.test(t)) return null
  const d = t.replace(/\D/g, '')
  return [8, 12, 13, 14].includes(d.length) ? d : null
}

/** GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14 all use the same mod-10 rule). */
export function checkDigitOk(code: string) {
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

const toGtin14 = (code: string) => code.replace(/\D/g, '').padStart(14, '0')

/** Same product number in any of its printed lengths (UPC-A 12 = EAN-13 with a leading 0 = GTIN-14 with two). */
export const sameBarcode = (a: string, b: string) => toGtin14(a) === toGtin14(b)

/** Every length the number can be stored as: databases differ (USDA uses 12 or 14 digits). */
export function barcodeVariants(code: string): string[] {
  const g = toGtin14(code)
  return [14, 13, 12, 8].filter((len) => /^0*$/.test(g.slice(0, 14 - len))).map((len) => g.slice(14 - len))
}

// ── A product from a lookup ────────────────────────────────────────

export interface BarcodeFood {
  barcode: string
  name: string
  brand: string
  /** One serving as on the label, e.g. "1 cup (28 g)"; "100 g" when the serving is unknown. */
  serving: string
  /** Grams (or ml) in one serving. */
  grams?: number
  /** Per serving, app units. */
  nutrients: Record<string, number>
  kcal?: number
  sources: ('usda' | 'off')[]
  /** Nutrient ids that came from Open Food Facts because USDA didn't have them. */
  filled: string[]
}

export interface FdcFood {
  fdcId: number
  description: string
  gtinUpc?: string
  brandOwner?: string
  brandName?: string
  servingSize?: number
  servingSizeUnit?: string
  householdServingFullText?: string
  publishedDate?: string
  modifiedDate?: string
  foodNutrients: { nutrientId: number; value?: number; unitName?: string }[]
}

const scale = (n: Record<string, number>, k: number) => Object.fromEntries(Object.entries(n).map(([id, v]) => [id, +(v * k).toPrecision(4)]))

/** "GENERAL MILLS, CHEERIOS, OAT CEREAL" → "Cheerios, Oat Cereal" (brand kept separately). */
export function tidyName(description: string, brand: string) {
  let s = description.trim()
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
  const b = brand.trim().toLowerCase()
  if (b && s.toLowerCase().startsWith(b + ', ')) s = s.slice(b.length + 2)
  return s
}

const tidyBrand = (s?: string) => {
  const t = (s ?? '').replace(/,?\s*(inc|llc|co|corp|corporation|company|ltd)\.?$/i, '').trim()
  return t === t.toUpperCase() ? tidyName(t, '') : t
}

/** One USDA Branded Foods record → per-serving nutrients. USDA reports branded values per 100 g (or 100 ml). */
export function fromFdcBranded(f: FdcFood, code: string): BarcodeFood | null {
  const values = new Map<number, number>()
  for (const n of f.foodNutrients) if (typeof n.value === 'number' && n.value >= 0) values.set(n.nutrientId, n.value)
  // Vitamin A in IU (id 1104, old labels) is left out: converting needs its form (retinol vs beta-carotene), and unknown is shown as unknown.
  const per100 = usdaToApp(values)
  if (Object.keys(per100).length === 0) return null
  const unit = (f.servingSizeUnit ?? '').toLowerCase()
  const isMl = unit === 'ml' || unit === 'mlt'
  const grams = f.servingSize && f.servingSize > 0 && (isMl || unit === 'g' || unit === 'grm') ? f.servingSize : undefined
  const k = grams ? grams / 100 : 1
  const kcalId = USDA_ENERGY_IDS.find((id) => values.has(id))
  const amount = grams ? `${+grams.toFixed(1)} ${isMl ? 'ml' : 'g'}` : '100 g'
  const household = f.householdServingFullText?.trim()
  const brand = tidyBrand(f.brandName || f.brandOwner)
  return {
    barcode: code,
    name: tidyName(f.description, f.brandName || f.brandOwner || ''),
    brand,
    serving: grams && household ? `${household} (${amount})` : amount,
    grams: grams ?? 100,
    nutrients: scale(per100, k),
    kcal: kcalId ? Math.round(values.get(kcalId)! * k) : undefined,
    sources: ['usda'],
    filled: [],
  }
}

function fromOff(p: OffProduct): BarcodeFood {
  return { barcode: p.barcode!, name: p.name, brand: p.brand, serving: p.serving, grams: p.grams, nutrients: p.nutrients, kcal: p.kcal, sources: ['off'], filled: [] }
}

/** USDA first; Open Food Facts fills nutrients USDA lacks (scaled to USDA's serving by weight). */
export function mergeBarcodeFoods(usda: BarcodeFood | null, off: OffProduct | null): BarcodeFood | null {
  if (!usda) return off ? fromOff(off) : null
  if (!off || !usda.grams) return usda
  const offPer100 = off.per100g ? off.nutrients : off.grams ? scale(off.nutrients, 100 / off.grams) : null
  if (!offPer100) return usda
  const filled = Object.keys(offPer100).filter((id) => usda.nutrients[id] == null)
  if (filled.length === 0) return usda
  const extra = scale(Object.fromEntries(filled.map((id) => [id, offPer100[id]])), usda.grams / 100)
  return { ...usda, nutrients: { ...usda.nutrients, ...extra }, sources: ['usda', 'off'], filled }
}

// ── Looking it up ──────────────────────────────────────────────────

/** Your own copy: a food saved from an earlier barcode lookup or label, or a rated product. */
export async function findSavedBarcode(code: string): Promise<{ food: Food } | { product: Product } | null> {
  const food = await db.foods.filter((f) => !!f.barcode && sameBarcode(f.barcode, code)).first()
  if (food) return { food }
  const product = await db.products.filter((p) => !!p.barcode && sameBarcode(p.barcode, code)).first()
  return product ? { product } : null
}

export async function usdaApiKey() {
  const v = (await db.settings.get(FDC_KEY_SETTING))?.value
  return typeof v === 'string' && v.trim() ? v.trim() : FDC_DEMO_KEY
}

class LookupError extends Error {}

async function lookupUsda(code: string, key: string, signal?: AbortSignal): Promise<BarcodeFood | null> {
  const url = `${FDC_SEARCH}?api_key=${encodeURIComponent(key)}&dataType=Branded&pageSize=10&query=${encodeURIComponent(barcodeVariants(code).join(' OR '))}`
  let r: Response
  try {
    r = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new LookupError("Couldn't reach USDA (offline?).")
  }
  if (r.status === 429)
    throw new LookupError(key === FDC_DEMO_KEY ? "USDA's shared demo key is used up for this hour. Add your own free key in Settings → Food databases." : 'USDA says this key has hit its hourly limit; try again later.')
  if (r.status === 403 || r.status === 401) throw new LookupError('USDA rejected the API key. Check it in Settings → Food databases.')
  if (!r.ok) throw new LookupError(`USDA didn't answer (${r.status}).`)
  const json = (await r.json()) as { foods?: FdcFood[] }
  // Several records can share a barcode (different data feeds); the most recently updated wins.
  const hits = (json.foods ?? [])
    .filter((f) => f.gtinUpc && sameBarcode(f.gtinUpc, code))
    .sort((a, b) => (b.modifiedDate ?? b.publishedDate ?? '').localeCompare(a.modifiedDate ?? a.publishedDate ?? ''))
  for (const f of hits) {
    const food = fromFdcBranded(f, code)
    if (food) return food
  }
  return null
}

async function lookupOff(code: string, signal?: AbortSignal): Promise<OffProduct | null> {
  let r: Response
  try {
    r = await fetch(offProductUrl(code), { signal, headers: { Accept: 'application/json' } })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new LookupError("Couldn't reach Open Food Facts (offline?).")
  }
  if (r.status === 404) return null
  if (!r.ok) throw new LookupError(`Open Food Facts didn't answer (${r.status}).`)
  return fromOpenFoodFacts(await r.json(), code)
}

export interface RemoteLookup {
  food: BarcodeFood | null
  /** Problems with a source (rate limit, offline); the other source may still have answered. */
  notes: string[]
}

/** Ask USDA and Open Food Facts at the same time and combine the answers. */
export async function lookupBarcodeOnline(code: string, opts: { key?: string; signal?: AbortSignal } = {}): Promise<RemoteLookup> {
  const key = opts.key ?? (await usdaApiKey())
  const [usda, off] = await Promise.allSettled([lookupUsda(code, key, opts.signal), lookupOff(code, opts.signal)])
  for (const r of [usda, off]) if (r.status === 'rejected' && (r.reason as Error)?.name === 'AbortError') throw r.reason
  const notes = [usda, off].flatMap((r) => (r.status === 'rejected' ? [(r.reason as Error).message] : []))
  return {
    food: mergeBarcodeFoods(usda.status === 'fulfilled' ? usda.value : null, off.status === 'fulfilled' ? off.value : null),
    notes,
  }
}
