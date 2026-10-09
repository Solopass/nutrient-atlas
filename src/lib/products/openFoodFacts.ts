import { NUTRIENTS } from '../../data/nutrients'
import type { Product } from '../../db/db'
import { detectCertifications } from './certifications'
import type { ProductInput } from './io'

/**
 * Barcode lookup via Open Food Facts, a free, open, crowd-sourced product
 * database (openfoodfacts.org). Only the barcode number is sent. Values are
 * community-entered, so the editor asks you to check them against the label.
 */

const API = 'https://world.openfoodfacts.org/api/v2/product/'
const FIELDS = 'code,product_name,generic_name,brands,serving_size,serving_quantity,quantity,nutriments,categories_tags,labels,labels_tags,image_front_small_url'

/** Open Food Facts nutriment key → app nutrient id. OFF stores these in grams (energy in kcal). */
const OFF_MAP: Record<string, string> = {
  proteins: 'protein', carbohydrates: 'carbs', fat: 'fat', fiber: 'fiber',
  'saturated-fat': 'satfat', 'trans-fat': 'transfat', 'added-sugars': 'addedSugar', sodium: 'sodium', cholesterol: 'cholesterol', caffeine: 'caffeine',
  'vitamin-a': 'vitA', 'vitamin-c': 'vitC', 'vitamin-d': 'vitD', 'vitamin-e': 'vitE', 'vitamin-k': 'vitK',
  'vitamin-b1': 'b1', 'vitamin-b2': 'b2', 'vitamin-pp': 'b3', 'pantothenic-acid': 'b5', 'vitamin-b6': 'b6', biotin: 'b7', 'vitamin-b9': 'b9', folates: 'b9', 'vitamin-b12': 'b12',
  calcium: 'calcium', magnesium: 'magnesium', potassium: 'potassium', iron: 'iron', zinc: 'zinc', phosphorus: 'phosphorus',
  copper: 'copper', manganese: 'manganese', selenium: 'selenium', chromium: 'chromium', molybdenum: 'molybdenum', iodine: 'iodine',
  'alpha-linolenic-acid': 'ala', 'eicosapentaenoic-acid': 'epa', 'docosahexaenoic-acid': 'dha', 'linoleic-acid': 'la', choline: 'choline',
}
const PER_GRAM: Record<string, number> = { g: 1, mg: 1000, mcg: 1_000_000 }
const UNIT = new Map(NUTRIENTS.map((n) => [n.id, n.unit]))

export interface OffProduct extends ProductInput {
  imageUrl?: string
  /** true when values are per 100 g because the serving size is unknown */
  per100g: boolean
}

type OffJson = {
  status?: number
  code?: string
  product?: {
    code?: string
    product_name?: string
    generic_name?: string
    brands?: string
    serving_size?: string
    serving_quantity?: number | string
    nutriments?: Record<string, number | string>
    categories_tags?: string[]
    labels?: string
    labels_tags?: string[]
    image_front_small_url?: string
  }
}

/** Turn an Open Food Facts API response into a product draft; null if not found or no usable nutrients. */
export function fromOpenFoodFacts(json: OffJson, code: string): OffProduct | null {
  const p = json.product
  if (!p || json.status === 0) return null
  const nm = p.nutriments ?? {}
  const serveQty = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : null
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)

  // Prefer per-serving values; else scale per-100 g by the serving size; else report per 100 g.
  // Only nutrient fields count: OFF also has e.g. "nova-group_serving", which says nothing about serving values.
  const perServing = Object.keys(OFF_MAP).some((k) => Number.isFinite(num(nm[`${k}_serving`])))
  const per100g = !perServing && !serveQty
  const read = (key: string) => {
    const s = num(nm[`${key}_serving`])
    if (perServing) return Number.isFinite(s) ? s : undefined
    const h = num(nm[`${key}_100g`])
    if (!Number.isFinite(h)) return undefined
    return serveQty ? (h * serveQty) / 100 : h
  }

  const nutrients: Record<string, number> = {}
  for (const [offKey, id] of Object.entries(OFF_MAP)) {
    if (nutrients[id] != null) continue // e.g. vitamin-b9 before folates
    const g = read(offKey)
    if (g == null || g < 0) continue
    nutrients[id] = +(g * PER_GRAM[UNIT.get(id) ?? 'g']).toPrecision(4)
  }
  if (Object.keys(nutrients).length === 0) return null

  const kcal = read('energy-kcal')
  const cats = p.categories_tags ?? []
  const kind: Product['kind'] = cats.some((c) => /supplement/.test(c)) ? 'supplement' : 'food'
  const brand = (p.brands ?? '').split(',')[0].trim()
  const certs = detectCertifications([p.labels ?? '', ...(p.labels_tags ?? [])].join(' '))

  return {
    kind,
    brand,
    name: (p.product_name || p.generic_name || `Barcode ${code}`).trim(),
    serving: per100g ? '100 g' : (p.serving_size?.trim() || (serveQty ? `${serveQty} g` : '1 serving')),
    grams: per100g ? 100 : (serveQty ?? undefined),
    kcal: kcal != null && Number.isFinite(kcal) ? Math.round(kcal) : undefined,
    nutrients,
    servingsPerDay: kind === 'supplement' ? 1 : undefined,
    certifications: certs.length ? certs : undefined,
    barcode: code,
    imageUrl: p.image_front_small_url,
    per100g,
  }
}

/** Digits only; EAN-8, UPC-A (12), EAN-13 and GTIN-14 lengths. */
export function cleanBarcode(input: string) {
  const d = input.replace(/\D/g, '')
  return [8, 12, 13, 14].includes(d.length) ? d : null
}

/** The product endpoint for one barcode, asking only for the fields we read. */
export const offProductUrl = (code: string) => `${API}${encodeURIComponent(code)}.json?fields=${FIELDS}`

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<OffProduct | null> {
  const r = await fetch(offProductUrl(code), { signal, headers: { Accept: 'application/json' } })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Open Food Facts didn't answer (${r.status}). Try again in a moment.`)
  return fromOpenFoodFacts((await r.json()) as OffJson, code)
}
