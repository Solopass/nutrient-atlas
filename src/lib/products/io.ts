import { NUTRIENTS } from '../../data/nutrients'
import { labelUnits } from '../../data/supplementPresets'
import type { Product } from '../../db/db'
import { normaliseCertifications } from './certifications'

/**
 * Getting products in and out: a JSON "product pack" (what Export writes and
 * AI chats are asked to produce), a spreadsheet-friendly CSV with a template,
 * and a prompt that turns label photos or text into that JSON.
 */

export const PACK_APP = 'nutrient-atlas-products'
export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'source'>

export interface ImportResult {
  products: ProductInput[]
  errors: string[]
  warnings: string[]
}

// ── Nutrient keys: ids, names, symbols, with an optional "(unit)" ──────────────
const KEY = new Map<string, string>()
for (const n of NUTRIENTS) for (const k of [n.id, n.name, n.shortName, n.symbol]) if (k) KEY.set(norm(k), n.id)
// Common label spellings
for (const [k, id] of Object.entries({ 'vitamin d3': 'vitD', 'vitamin k2': 'vitK', folate: 'b9', 'folic acid': 'b9', thiamin: 'b1', riboflavin: 'b2', niacin: 'b3', 'pantothenic acid': 'b5', biotin: 'b7', 'vitamin b12': 'b12', 'vitamin b6': 'b6', 'omega-3 ala': 'ala', 'saturated fat': 'satfat', 'added sugars': 'addedSugar', 'trans fat': 'transfat', 'total fat': 'fat', 'total carbohydrate': 'carbs', 'dietary fiber': 'fiber' }))
  KEY.set(norm(k), id)
const BY_ID = new Map(NUTRIENTS.map((n) => [n.id, n]))

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** "Vitamin D (IU)" → { id: 'vitD', factor: 0.025 }. Null if it isn't a nutrient. */
export function resolveNutrientKey(key: string): { id: string; factor: number } | null {
  const m = key.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  const base = m ? m[1] : key
  const id = KEY.get(norm(base))
  if (!id) return null
  const n = BY_ID.get(id)!
  const unit = m?.[2]?.trim()
  if (!unit || unit.toLowerCase() === n.unit) return { id, factor: 1 }
  const u = labelUnits(id, n.unit).find((x) => x.label.toLowerCase() === unit.toLowerCase())
  return u ? { id, factor: u.toAppUnit } : { id, factor: 1 }
}

// ── JSON ─────────────────────────────────────────────────────────────────────
function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced ? fenced[1] : text).trim()
  const starts = [body.indexOf('{'), body.indexOf('[')].filter((i) => i >= 0)
  if (!starts.length) return null
  const start = Math.min(...starts)
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
  return end > start ? body.slice(start, end + 1) : null
}

const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v.replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(x) ? x : undefined
  }
  return undefined
}
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Validate one raw object into a product; `kind` is the fallback when it doesn't say. */
function toProduct(raw: Record<string, unknown>, i: number, fallbackKind: Product['kind'], errors: string[], warnings: string[]): ProductInput | null {
  const label = `Product ${i + 1}${str(raw.name) ? ` (${str(raw.name)})` : ''}`
  const name = str(raw.name)
  if (!name) {
    errors.push(`${label}: missing a name.`)
    return null
  }
  const kindRaw = str(raw.kind)?.toLowerCase()
  const kind: Product['kind'] = kindRaw?.startsWith('sup') || kindRaw === 'vitamin' ? 'supplement' : kindRaw === 'food' ? 'food' : fallbackKind

  const nutrients: Record<string, number> = {}
  const unknown: string[] = []
  const src = (raw.nutrients && typeof raw.nutrients === 'object' ? raw.nutrients : {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(src)) {
    const key = resolveNutrientKey(k)
    const x = num(v)
    if (!key) {
      unknown.push(k)
      continue
    }
    if (x == null || x < 0) continue
    nutrients[key.id] = (nutrients[key.id] ?? 0) + x * key.factor
  }
  if (unknown.length) warnings.push(`${label}: ignored unknown nutrients ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''}.`)
  if (Object.keys(nutrients).length === 0) {
    errors.push(`${label}: no recognised nutrients.`)
    return null
  }

  const forms: Record<string, string> = {}
  if (raw.forms && typeof raw.forms === 'object') {
    for (const [k, v] of Object.entries(raw.forms as Record<string, unknown>)) {
      const key = resolveNutrientKey(k)
      if (key && str(v)) forms[key.id] = str(v)!
    }
  }
  const certs = normaliseCertifications(Array.isArray(raw.certifications) ? raw.certifications.map((c) => String(c)) : (str(raw.certifications)?.split(/[;,]/) ?? []))
  const tags = Array.isArray(raw.tags) ? raw.tags.map(str).filter((t): t is string => !!t) : str(raw.tags)?.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
  const rating = num(raw.rating)

  return {
    kind,
    brand: str(raw.brand) ?? '',
    name,
    serving: str(raw.serving) ?? (kind === 'supplement' ? '1 serving' : '1 serving'),
    grams: num(raw.grams),
    kcal: num(raw.kcal ?? raw.calories),
    nutrients,
    forms: Object.keys(forms).length ? forms : undefined,
    servingsPerContainer: num(raw.servingsPerContainer ?? raw.servings_per_container),
    servingsPerDay: kind === 'supplement' ? (num(raw.servingsPerDay ?? raw.servings_per_day) ?? 1) : undefined,
    price: num(raw.price),
    rating: rating != null ? Math.max(1, Math.min(5, Math.round(rating))) : undefined,
    notes: str(raw.notes),
    tags: tags?.length ? tags : undefined,
    certifications: certs.length ? certs : undefined,
    barcode: str(raw.barcode),
  }
}

export function parseProductsJson(text: string, fallbackKind: Product['kind'] = 'supplement'): ImportResult {
  const errors: string[] = []
  const warnings: string[] = []
  const json = extractJson(text)
  if (!json) return { products: [], errors: ['No JSON found.'], warnings }
  let raw: unknown
  try {
    raw = JSON.parse(json.replace(/,\s*([}\]])/g, '$1'))
  } catch (e) {
    return { products: [], errors: [`The JSON couldn't be read: ${(e as Error).message}`], warnings }
  }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { products?: unknown }).products) ? (raw as { products: unknown[] }).products : [raw]
  const products = list
    .map((r, i) => (r && typeof r === 'object' ? toProduct(r as Record<string, unknown>, i, fallbackKind, errors, warnings) : null))
    .filter((p): p is ProductInput => p != null)
  return { products, errors, warnings }
}

// ── CSV ──────────────────────────────────────────────────────────────────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const FIELDS: Record<string, string> = {
  kind: 'kind', type: 'kind', brand: 'brand', name: 'name', product: 'name', serving: 'serving', 'serving size': 'serving',
  grams: 'grams', calories: 'kcal', kcal: 'kcal', 'servings per day': 'servingsPerDay', 'servings per container': 'servingsPerContainer',
  price: 'price', rating: 'rating', tags: 'tags', notes: 'notes', certifications: 'certifications', certification: 'certifications', barcode: 'barcode',
}

export function parseProductsCsv(text: string, fallbackKind: Product['kind'] = 'supplement'): ImportResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { products: [], errors: ['The CSV needs a header row and at least one product.'], warnings: [] }
  const header = rows[0].map((h) => h.trim())
  const errors: string[] = []
  const warnings: string[] = []
  const ignored = new Set<string>()
  const products: ProductInput[] = []
  rows.slice(1).forEach((r, i) => {
    const raw: Record<string, unknown> = { nutrients: {} as Record<string, string>, forms: {} as Record<string, string> }
    header.forEach((h, j) => {
      const v = r[j]?.trim()
      if (!v) return
      const field = FIELDS[norm(h).replace(/_/g, ' ')]
      if (field) raw[field] = v
      else if (/ form$/i.test(h) && resolveNutrientKey(h.replace(/ form$/i, ''))) (raw.forms as Record<string, string>)[h.replace(/ form$/i, '')] = v
      else if (resolveNutrientKey(h)) (raw.nutrients as Record<string, string>)[h] = v
      else ignored.add(h)
    })
    const p = toProduct(raw, i, fallbackKind, errors, warnings)
    if (p) products.push(p)
  })
  if (ignored.size) warnings.unshift(`Ignored columns: ${[...ignored].join(', ')}.`)
  return { products, errors, warnings }
}

/** Pick the parser from the content: JSON if it looks like JSON, else CSV. */
export function parseProducts(text: string, fallbackKind: Product['kind'] = 'supplement'): ImportResult {
  const t = text.trim()
  if (!t) return { products: [], errors: [], warnings: [] }
  return /^[[{]|```/.test(t) || (t.includes('{') && !t.split('\n')[0].includes(',')) ? parseProductsJson(t, fallbackKind) : parseProductsCsv(t, fallbackKind)
}

// ── Export ───────────────────────────────────────────────────────────────────
export function productsToJson(products: Product[]) {
  return JSON.stringify(
    {
      app: PACK_APP,
      version: 1,
      exportedAt: new Date().toISOString(),
      products: products.map(({ id: _id, createdAt: _c, updatedAt: _u, source: _s, ...p }) => p),
    },
    null,
    1,
  )
}

const TEMPLATE_NUTRIENTS = ['vitD', 'vitK', 'b12', 'b9', 'magnesium', 'zinc', 'iron', 'calcium', 'epa', 'dha', 'protein', 'fiber', 'sodium', 'addedSugar']

export function csvTemplate() {
  const nutrientCols = TEMPLATE_NUTRIENTS.map((id) => `${BY_ID.get(id)!.name} (${BY_ID.get(id)!.unit})`)
  const head = ['kind', 'brand', 'name', 'serving', 'servings per day', 'servings per container', 'price', 'rating', 'tags', 'calories', ...nutrientCols, 'Magnesium form']
  const ex1 = ['supplement', 'Example Brand', 'Magnesium Glycinate 200', '2 capsules', '1', '60', '19.99', '', 'magnesium; sleep', '', '', '', '', '', '200', '', '', '', '', '', '', '', '', '', 'magnesium glycinate']
  const ex2 = ['food', 'Example Foods', 'High Fiber Oat Bar', '1 bar (45 g)', '', '12', '6.49', '', 'bars', '190', '', '', '', '', '', '', '2', '', '', '', '6', '9', '140', '8', '']
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '﻿' + [head, ex1, ex2].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

// ── AI prompt ────────────────────────────────────────────────────────────────
export function buildProductPrompt(kind: Product['kind']) {
  const table = NUTRIENTS.map((n) => `${n.id} | ${n.name} | ${n.unit}`).join('\n')
  const what = kind === 'supplement' ? 'supplement' : 'packaged food'
  return `You are reading ${what} labels. I will paste label text, a product page, or attach photos of one or more ${what}s.

For EACH product, return its brand, name and label facts as JSON. Rules:
1. Amounts are PER SERVING as printed on the label, converted to the unit in the table below (e.g. vitamin D in mcg: 2,000 IU = 50 mcg; vitamin E in mg; folate in mcg DFE; vitamin A in mcg RAE).
2. Use exactly the nutrient ids in the table. Leave out anything not on the label; never guess, never put 0 for "not listed".
3. "forms": the ingredient form shown on the label for each nutrient, e.g. "magnesium glycinate", "cholecalciferol", "methylcobalamin", "zinc picolinate", "triglyceride".
4. Include servingsPerContainer, and price (number only) if it is visible. For supplements include servingsPerDay from the suggested use (default 1).
5. "certifications": independent testing seals shown on the package, e.g. "USP Verified", "NSF Certified for Sport", "Informed Sport", "IFOS". Only seals you can actually see; otherwise omit.
6. Reply with ONLY JSON in this shape:

{
  "products": [
    {
      "kind": "${kind}",
      "brand": "Brand name",
      "name": "Product name",
      "serving": "2 capsules",
      "servingsPerContainer": 60,
      "servingsPerDay": 1,
      "price": 24.99,
      "calories": 0,
      "nutrients": { "vitD": 50, "magnesium": 200 },
      "forms": { "vitD": "cholecalciferol", "magnesium": "magnesium glycinate" },
      "tags": ["magnesium"],
      "certifications": ["USP Verified"]
    }
  ]
}

NUTRIENT TABLE (id | name | unit)
${table}
`
}
