/**
 * Builds public/usda/foods.json from the USDA FoodData Central CSV downloads
 * (Foundation Foods + SR Legacy) in data/usda-raw/.
 *
 *   bun run build:usda
 *
 * Output is a compact, dense table: one row per food, nutrient values per
 * 100 g in the order of `nutrients`, null where USDA has no value (missing is
 * not zero). Units are converted to the app's units (see src/data/nutrients.ts).
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { USDA_ENERGY_IDS, USDA_NUTRIENT_MAP } from '../src/data/usdaNutrientMap'

const RAW = join(import.meta.dir, '..', 'data', 'usda-raw')
const OUT_DIR = join(import.meta.dir, '..', 'public', 'usda')

// Nutrient ids and unit factors are shared with barcode lookups (USDA Branded Foods).
const MAP = USDA_NUTRIENT_MAP

/**
 * USDA rarely reports added sugar (4 foods), and Foundation Foods never report
 * caffeine or alcohol. Where a food *can't* contain them, a missing value is
 * recorded as 0 rather than "no data". Anything processed, sweetened or
 * flavoured stays unknown.
 */
const WHOLE_FOOD_GROUPS = new Set([
  'Beef Products', 'Vegetables and Vegetable Products', 'Lamb, Veal, and Game Products', 'Fruits and Fruit Juices',
  'Poultry Products', 'Pork Products', 'Legumes and Legume Products', 'Dairy and Egg Products', 'Finfish and Shellfish Products',
  'Fats and Oils', 'Cereal Grains and Pasta', 'Nut and Seed Products', 'Spices and Herbs',
])
const MAYBE_SWEETENED = /(?<!un)sweeten|syrup|sugar|honey|candied|glaze|chocolate|cocoa|flavou?red|vanilla|ice cream|jam|jelly|preserves|\bpie\b|cake|cookie|dressing|sauce|baked beans|condensed|eggnog|pudding|frosting|marinated|barbecue|teriyaki|cured|breaded|batter|cocktail|dessert|candy|praline|smoothie|drink|nectar|punch|yogurt, fruit|with fruit|dried, sweetened/i
const MAYBE_CAFFEINE = /coffee|\btea\b|cocoa|chocolate|cola|energy|mocha|espresso|matcha|guarana|carob/i
const MAYBE_ALCOHOL = /wine|beer|liqueur|\brum\b|vodka|whiske?y|\bgin\b|alcohol|sake|brandy|cocktail|tequila|liquor/i

function assumeZero(key: string, f: RawFood) {
  if (key === 'addedSugar') return WHOLE_FOOD_GROUPS.has(f.category) && !MAYBE_SWEETENED.test(f.name)
  if (key === 'caffeine') return !['Beverages', 'Sweets'].includes(f.category) && !MAYBE_CAFFEINE.test(f.name)
  if (key === 'alcohol') return f.category !== 'Beverages' && !MAYBE_ALCOHOL.test(f.name)
  return false
}
const ENERGY_IDS = USDA_ENERGY_IDS
const NUTRIENT_ORDER = Object.keys(MAP)

// ── CSV ──────────────────────────────────────────────────────────
function* rows(path: string): Generator<string[]> {
  const text = readFileSync(path, 'utf8')
  let i = 0
  const n = text.length
  let header = true
  while (i < n) {
    const row: string[] = []
    for (;;) {
      let field = ''
      if (text[i] === '"') {
        i++
        for (;;) {
          const q = text.indexOf('"', i)
          if (q < 0) throw new Error(`Unterminated quote in ${path}`)
          field += text.slice(i, q)
          i = q + 1
          if (text[i] === '"') {
            field += '"'
            i++
          } else break
        }
      } else {
        let j = i
        while (j < n && text[j] !== ',' && text[j] !== '\n' && text[j] !== '\r') j++
        field = text.slice(i, j)
        i = j
      }
      row.push(field)
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === '\r') i++
      if (text[i] === '\n') i++
      break
    }
    if (header) header = false
    else if (row.length > 1) yield row
  }
}

function findDir(prefix: string) {
  const dir = readdirSync(RAW).find((d) => d.startsWith(prefix) && !d.endsWith('.zip'))
  if (!dir) throw new Error(`Missing ${prefix}* in ${RAW}. Download and unzip the FDC CSVs first.`)
  return join(RAW, dir)
}

// ── Build ────────────────────────────────────────────────────────
interface RawFood {
  id: number
  name: string
  category: string
  source: 'foundation' | 'sr'
  published: string
  values: Map<number, number>
  portions: [string, number][]
}

const sig = (x: number) => (x === 0 ? 0 : Number(x.toPrecision(4)))

function load(dir: string, dataType: string, source: RawFood['source']) {
  const categories = new Map<string, string>()
  for (const [id, , desc] of rows(join(dir, 'food_category.csv'))) categories.set(id, desc)
  const units = new Map<string, string>()
  for (const [id, name] of rows(join(dir, 'measure_unit.csv'))) units.set(id, name)

  const foods = new Map<number, RawFood>()
  for (const [id, type, desc, cat, published] of rows(join(dir, 'food.csv'))) {
    if (type !== dataType) continue
    const name = desc.replace(/\s*\(Includes foods for USDA's Food Distribution Program\)/i, '').trim()
    foods.set(+id, { id: +id, name, category: categories.get(cat) ?? 'Other', source, published, values: new Map(), portions: [] })
  }
  for (const r of rows(join(dir, 'food_nutrient.csv'))) {
    const f = foods.get(+r[1])
    if (f && r[3] !== '') f.values.set(+r[2], +r[3])
  }
  for (const r of rows(join(dir, 'food_portion.csv'))) {
    const f = foods.get(+r[1])
    const grams = +r[7]
    if (!f || !(grams > 0)) continue
    const amount = r[3] ? +r[3] : 1
    const unit = units.get(r[4])
    const unitLabel = unit && unit !== 'undetermined' ? unit : ''
    const label = [amount ? String(+amount.toFixed(2)) : '', unitLabel, r[5] || r[6]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    if (label && !f.portions.some(([l]) => l === label)) f.portions.push([label, sig(grams)])
  }
  return [...foods.values()]
}

const foundation = load(findDir('FoodData_Central_foundation_food_csv'), 'foundation_food', 'foundation')
const sr = load(findDir('FoodData_Central_sr_legacy_food_csv'), 'sr_legacy_food', 'sr')

// Merge records that share a name (Foundation re-releases, and Foundation vs SR Legacy):
// newest Foundation values win, gaps are filled from older records, portions are combined.
const groups = new Map<string, RawFood[]>()
for (const f of [...foundation, ...sr]) {
  const key = f.name.toLowerCase()
  groups.set(key, [...(groups.get(key) ?? []), f])
}
const rank = (f: RawFood) => (f.source === 'foundation' ? '1' : '0') + f.published
const all = [...groups.values()].map((group) => {
  const [best, ...rest] = group.sort((a, b) => rank(b).localeCompare(rank(a)))
  for (const other of rest) {
    for (const [id, v] of other.values) if (!best.values.has(id)) best.values.set(id, v)
    for (const p of other.portions) if (!best.portions.some(([l]) => l === p[0])) best.portions.push(p)
  }
  return best
})
const merged = foundation.length + sr.length - all.length

const categories = [...new Set(all.map((f) => f.category))].sort()
const out = {
  source: 'USDA FoodData Central (Foundation Foods 2025-12, SR Legacy 2018-04). Public domain.',
  builtAt: new Date().toISOString().slice(0, 10),
  nutrients: NUTRIENT_ORDER,
  categories,
  // [fdcId, name, categoryIndex, 'f'|'s', kcal|null, values[], portions[[label, grams]]]
  foods: all.map((f) => {
    const values = NUTRIENT_ORDER.map((key) => {
      const src = MAP[key]
      if (src.sum) {
        const parts = src.ids.filter(([id]) => f.values.has(id))
        // Only report a sum when the main component is present.
        if (!f.values.has(src.ids[0][0])) return null
        return sig(parts.reduce((a, [id, k]) => a + f.values.get(id)! * k, 0))
      }
      for (const [id, k] of src.ids) if (f.values.has(id)) return sig(f.values.get(id)! * k)
      return assumeZero(key, f) ? 0 : null
    })
    const kcalId = ENERGY_IDS.find((id) => f.values.has(id))
    return [f.id, f.name, categories.indexOf(f.category), f.source === 'foundation' ? 'f' : 's', kcalId ? Math.round(f.values.get(kcalId)!) : null, values, f.portions]
  }),
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
const json = JSON.stringify(out)
writeFileSync(join(OUT_DIR, 'foods.json'), json)

const coverage = NUTRIENT_ORDER.map((k, i) => `${k} ${Math.round((out.foods.filter((f) => (f[5] as (number | null)[])[i] != null).length / out.foods.length) * 100)}%`)
console.log(`foundation ${foundation.length}, sr ${sr.length}, merged ${merged}, total ${all.length} foods, ${(json.length / 1e6).toFixed(2)} MB`)
console.log(`coverage: ${coverage.join(', ')}`)
