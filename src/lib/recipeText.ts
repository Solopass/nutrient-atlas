import type { UsdaFood } from '../data/usda'

/**
 * Paste a recipe: read an ingredient list ("2 cups cooked brown rice",
 * "1 (14 oz) can chickpeas, drained", "½ onion, diced", "salt to taste")
 * into amounts and food names, pick the USDA food that fits a recipe line
 * best, and turn the amount into grams with USDA's own portion weights.
 * Everything is reviewed before it becomes a recipe.
 */

export type Unit = 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'floz' | 'clove' | 'slice' | 'stick' | 'can' | 'pinch' | 'dash' | 'handful' | 'large' | 'medium' | 'small' | 'piece'

export interface IngredientLine {
  raw: string
  qty: number | null
  unit: Unit | null
  /** The food, cleaned for searching ("onion"). */
  food: string
  /** The amount as written, for the recipe ("½ cup", "1 (14 oz) can"). */
  amountText: string
  /** Lines that aren't ingredients to add (headings, "to taste", water). */
  skip?: 'heading' | 'to taste' | 'water' | 'empty'
  /** "1 can …", "(14 oz) tin", "canned …": prefer canned USDA entries. */
  canned?: boolean
}

export interface ParsedRecipe {
  servings: number | null
  lines: IngredientLine[]
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅙': 1 / 6 }

const UNITS: [RegExp, Unit][] = [
  [/^(cups?|c)$/, 'cup'],
  [/^(tablespoons?|tbsps?|tbs|tbl|T)$/, 'tbsp'],
  [/^(teaspoons?|tsps?|t)$/, 'tsp'],
  [/^(fl\.?\s?oz|fluid ounces?)$/, 'floz'],
  [/^(ounces?|oz)$/, 'oz'],
  [/^(pounds?|lbs?)$/, 'lb'],
  [/^(grams?|g|gr)$/, 'g'],
  [/^(kilograms?|kgs?)$/, 'kg'],
  [/^(millilit(er|re)s?|ml)$/, 'ml'],
  [/^(lit(er|re)s?|l)$/, 'l'],
  [/^cloves?$/, 'clove'],
  [/^slices?$/, 'slice'],
  [/^sticks?$/, 'stick'],
  [/^(cans?|tins?)$/, 'can'],
  [/^pinch(es)?$/, 'pinch'],
  [/^dash(es)?$/, 'dash'],
  [/^handfuls?$/, 'handful'],
  [/^large$/, 'large'],
  [/^medium$/, 'medium'],
  [/^small$/, 'small'],
  [/^(pieces?|pcs?|whole|each)$/, 'piece'],
]

/** Words that describe preparation, not the food; dropped so the search matches ("diced onion" → "onion"). */
const PREP = new Set([
  'fresh', 'freshly', 'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'finely', 'roughly', 'coarsely', 'thinly', 'thickly', 'peeled', 'seeded', 'trimmed',
  'crushed', 'packed', 'lightly', 'heaping', 'level', 'softened', 'melted', 'cold', 'warm', 'hot', 'room', 'temperature', 'divided', 'optional', 'organic', 'ripe',
  'about', 'approximately', 'roughly', 'plus', 'more', 'for', 'serving', 'garnish', 'extra', 'virgin', 'good', 'quality', 'large', 'medium', 'small', 'whole', 'of', 'a', 'an',
  'cubed', 'halved', 'quartered', 'rinsed', 'drained', 'torn', 'beaten', 'sifted', 'juiced', 'zested', 'to', 'taste', 'and', 'or', 'such', 'as',
])

/** Common recipe words → the USDA entry a recipe means. Applied when the whole food name matches. */
const ALIASES: Record<string, string> = {
  flour: 'all-purpose flour',
  'plain flour': 'all-purpose flour',
  'all purpose flour': 'all-purpose flour',
  'white flour': 'all-purpose flour',
  sugar: 'granulated sugar',
  'white sugar': 'granulated sugar',
  'caster sugar': 'granulated sugar',
  milk: 'milk whole',
  'whole milk': 'milk whole',
  egg: 'egg whole raw',
  eggs: 'egg whole raw',
  salt: 'salt table',
  'kosher salt': 'salt table',
  'sea salt': 'salt table',
  pepper: 'black pepper',
  'ground black pepper': 'black pepper',
  'black pepper': 'black pepper',
  butter: 'butter salted',
  'unsalted butter': 'butter without salt',
  garlic: 'garlic raw',
  onion: 'onions raw',
  onions: 'onions raw',
  'yellow onion': 'onions raw',
  'red onion': 'onions raw',
  tomato: 'tomatoes red ripe raw',
  tomatoes: 'tomatoes red ripe raw',
  'canned tomatoes': 'tomatoes canned',
  'diced tomatoes': 'tomatoes canned diced',
  'chopped tomatoes': 'tomatoes canned diced',
  'chicken stock': 'chicken broth',
  'vegetable stock': 'vegetable broth',
  rice: 'rice white long-grain raw',
  'brown rice': 'rice brown long-grain raw',
  oats: 'oats',
  'rolled oats': 'oats',
}

const WATERISH = /^(water|ice|ice cubes|boiling water|cold water|warm water|hot water)$/

function toNumber(s: string): number | null {
  s = s.trim()
  if (!s) return null
  let total = 0
  for (const part of s.split(/\s+/)) {
    if (FRACTIONS[part] != null) total += FRACTIONS[part]
    else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split('/').map(Number)
      if (!b) return null
      total += a / b
    } else if (/^\d*\.?\d+$/.test(part)) total += Number(part)
    else if (/^\d+[½⅓⅔¼¾⅕⅛⅜⅝⅞⅙]$/.test(part)) total += Number(part.slice(0, -1)) + FRACTIONS[part.slice(-1)]
    else return null
  }
  return total
}

// Order matters: mixed numbers, fractions and decimals before plain integers ("1.5" isn't "1").
const QTY = String.raw`(?:\d+\s+\d+/\d+|\d+/\d+|\d*\.\d+|\d+[½⅓⅔¼¾⅕⅛⅜⅝⅞⅙]?|[½⅓⅔¼¾⅕⅛⅜⅝⅞⅙])`

export function parseIngredientLine(raw: string): IngredientLine {
  let s = raw
    .replace(/^\s*(?:[-*•·▢□◦‣–—]|\d+[.)](?=\s+\D|\s+\d))\s*/, '') // bullets and "1." list numbers
    .replace(/\s+/g, ' ')
    .trim()
  const line: IngredientLine = { raw: raw.trim(), qty: null, unit: null, food: '', amountText: '' }
  if (!s) return { ...line, skip: 'empty' }
  if (/:$/.test(s) || /^(ingredients|for the |method|directions|instructions)\b/i.test(s)) return { ...line, skip: 'heading' }

  // "1 (14 oz) can chickpeas": the weight in brackets is the real amount.
  const packed = s.match(new RegExp(String.raw`^(${QTY})?\s*\((${QTY})\s*-?\s*(oz|ounces?|g|grams?|ml|lb|pounds?)\.?\)\s*(cans?|tins?|packages?|pkgs?|jars?|bags?|boxes?|cartons?)?\s+(.*)$`, 'i'))
  let rest = s
  if (packed) {
    const n = toNumber(packed[1] ?? '1') ?? 1
    const inner = toNumber(packed[2]) ?? 0
    const unit = unitOf(packed[3])
    line.qty = n * inner
    line.unit = unit
    line.amountText = `${packed[1] ? `${packed[1]} ` : ''}(${packed[2]} ${packed[3]})${packed[4] ? ` ${packed[4]}` : ''}`
    line.canned = /^(cans?|tins?)$/i.test(packed[4] ?? '')
    rest = packed[5]
  } else {
    // Amount (ranges "1-2" and "1 to 2" use the middle), then an optional unit.
    const m = s.match(new RegExp(String.raw`^(${QTY})(?:\s*(?:-|–|to)\s*(${QTY}))?\s*(.*)$`, 'i'))
    if (m) {
      const a = toNumber(m[1])
      const b = m[2] ? toNumber(m[2]) : null
      line.qty = a != null && b != null ? (a + b) / 2 : a
      rest = m[3]
      const u = rest.match(/^(fl\.?\s?oz|fluid ounces?|[a-zA-Z]+)\.?(?=\s|$)(.*)$/)
      const unit = u && unitOf(u[1])
      if (unit && u) {
        line.unit = unit
        rest = u[2]
        line.amountText = `${m[0].slice(0, m[0].length - m[3].length).trim()} ${u[1]}`.trim()
      } else line.amountText = m[0].slice(0, m[0].length - m[3].length).trim()
    }
  }

  const lower = rest.toLowerCase()
  if (/\bto taste\b|\bas needed\b|\bfor (serving|garnish)\b|\boptional\b/.test(lower) && line.qty == null) return { ...line, food: cleanFood(rest), skip: 'to taste' }
  let food = cleanFood(rest)
  // "3 garlic cloves", "2 bread slices": the count word comes after the food.
  const trailing = !line.unit && food.match(/\b(cloves?|slices?|sticks?)\b/)
  if (trailing) {
    line.unit = unitOf(trailing[1])
    food = food.replace(trailing[0], '').replace(/\s+/g, ' ').trim()
  }
  if (!food) return { ...line, skip: 'empty' }
  if (WATERISH.test(food)) return { ...line, food, skip: 'water' }
  if (line.unit === 'can' || /\bcanned\b/i.test(rest)) line.canned = true
  // Aliases pick the fresh entry ("tomatoes" → raw); a canned line keeps its own words plus "canned".
  if (line.canned) return { ...line, food: food.includes('canned') ? food : `${food} canned` }
  return { ...line, food: ALIASES[food] ?? food }
}

function unitOf(word: string): Unit | null {
  const w = word.replace(/\.$/, '')
  for (const [re, unit] of UNITS) if (re.test(w) || (re.test(w.toLowerCase()) && w !== 'T' && w !== 't')) return unit
  return null
}

/** "onion, diced (about 1 cup)" → "onion"; "extra-virgin olive oil" → "olive oil". */
function cleanFood(s: string) {
  const head = s
    .replace(/\(.*?\)/g, ' ')
    .split(/[,;]| - /)[0]
    .toLowerCase()
    .replace(/extra[- ]virgin/g, '')
    .replace(/[^a-z\s'-]/g, ' ')
  return head
    .split(/\s+/)
    .filter((w) => w && !PREP.has(w))
    .join(' ')
    .trim()
}

/** "Serves 4", "Makes 6 servings", "Yield: 8" anywhere in the text. */
export function detectServings(text: string): number | null {
  const m = text.match(/\b(?:serves|servings?|makes|yield)\s*:?\s*(\d+)/i) ?? text.match(/\b(\d+)\s*(?:servings|portions)\b/i)
  const n = m ? Number(m[1]) : NaN
  return n > 0 && n < 100 ? n : null
}

export function parseRecipeText(text: string): ParsedRecipe {
  const servings = detectServings(text)
  const lines = text
    .split(/\r?\n/)
    .filter((l) => !/^\s*(?:serves|servings?|makes|yield)\b/i.test(l)) // a "Serves 4" line isn't an ingredient
    .map(parseIngredientLine)
    .filter((l) => l.skip !== 'empty')
  return { servings, lines }
}

// ── Choosing the USDA food for a line ─────────────────────────────

/** Name words that make a poor match for a plain recipe ingredient unless the line asks for them. */
const AVOID = new Set([
  'mayonnaise', 'dressing', 'soup', 'spread', 'candies', 'cookies', 'cereals', 'beverage', 'beverages', 'buttermilk', 'dry', 'powder', 'dried', 'dehydrated', 'human',
  'buffalo', 'producer', 'filled', 'imitation', 'babyfood', 'infant', 'formula', 'restaurant', 'sweetened', 'reduced', 'nonfat', 'lowfat', 'fat-free', 'flavored', 'anchovies',
  'self-rising', 'calcium-fortified', 'sauce', 'sun-dried', 'pickled', 'frozen', 'breaded', 'fried', 'roll', 'deli', 'prepackaged', 'mix',
])

/**
 * Re-rank USDA search results for a recipe line: the line's words should be the
 * food's name (its first two parts), not an ingredient of something else
 * ("olive oil" is the oil, not "mayonnaise with olive oil"); canned when the
 * line says can; plain forms over processed ones.
 */
export function pickIngredient(line: Pick<IngredientLine, 'food' | 'unit' | 'canned'>, results: UsdaFood[]): UsdaFood[] {
  const q = line.food.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = results.map((f, idx) => {
    const name = f.name.toLowerCase()
    const first2 = name.split(', ').slice(0, 2).join(' ')
    let score = -idx * 0.6
    if (q.every((w) => first2.includes(w.replace(/s$/, '')))) score += 5
    const firstSeg = name.split(', ')[0]
    if (!q.some((w) => firstSeg.includes(w.replace(/s$/, '')))) score -= 5
    for (const w of name.split(/[\s,()]+/)) if (AVOID.has(w) && !q.includes(w)) score -= 3
    const canned = line.unit === 'can' || line.canned
    if (canned && /canned/.test(name)) score += 3
    if (!canned && /canned/.test(name) && !q.includes('canned')) score -= 1
    if (f.category === 'Legumes and Legume Products' && !q.some((w) => /dry|dried|raw/.test(w)) && /cooked|canned/.test(name)) score += 2
    if (/with salt|sodium added/.test(name)) score -= 1
    return { f, score }
  })
  return scored.sort((a, b) => b.score - a.score).map((s) => s.f)
}

/**
 * Searches to try in order: the whole name, then with leading words dropped
 * ("dried red lentils" → "red lentils" → "lentils"; "ground cumin" → "cumin"),
 * since USDA names often lack a recipe's adjectives.
 */
export function searchQueries(food: string): string[] {
  const words = food.split(/\s+/).filter(Boolean)
  const out = words.map((_, i) => words.slice(i).join(' '))
  // Keep "canned" when shortening a canned line.
  return words.includes('canned') ? out.map((q) => (q.includes('canned') ? q : `${q} canned`)) : out
}

// ── Amount → grams ────────────────────────────────────────────────

const WEIGHT: Partial<Record<Unit, number>> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 }
const VOLUME_ML: Partial<Record<Unit, number>> = { ml: 1, l: 1000, cup: 236.6, tbsp: 14.79, tsp: 4.93, floz: 29.57 }
const COUNT_WORD: Partial<Record<Unit, RegExp>> = { clove: /clove/, slice: /slice/, stick: /stick/, large: /\blarge\b/, medium: /\bmedium\b/, small: /\bsmall\b/ }

/** The number at the start of a portion label ("1 cup" → 1, "0.5 cup" → 0.5, "1/2 cup" → 0.5, "3 cloves" → 3). */
const leading = (label: string) => {
  const m = label.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+|[½⅓⅔¼¾⅕⅛⅜⅝⅞⅙])/)
  return m ? toNumber(m[1]) ?? 1 : 1
}

export interface GramsResult {
  grams: number
  /** How we got it, for the review screen. */
  how: string
  /** A guess (no USDA portion fits): highlighted for checking. */
  estimated: boolean
}

export function gramsFor(food: UsdaFood, qty: number | null, unit: Unit | null): GramsResult {
  const n = qty ?? 1
  const portions = food.portions
  const r = (g: number) => Math.round(g * 10) / 10
  if (unit && WEIGHT[unit]) return { grams: r(n * WEIGHT[unit]!), how: 'by weight', estimated: false }

  if (unit && VOLUME_ML[unit]) {
    const ml = n * VOLUME_ML[unit]!
    const byLabel = (re: RegExp, perCup: number) => {
      const p = portions.find((x) => re.test(x.label.toLowerCase()) && !/package|container/i.test(x.label))
      return p ? (p.grams / leading(p.label)) * perCup : null
    }
    const gPerCup = byLabel(/^\d*\.?\d*\s*cups?\b/, 1) ?? byLabel(/\btbsp|tablespoon/, 16) ?? byLabel(/\btsp|teaspoon/, 48) ?? byLabel(/fl oz/, 8)
    if (gPerCup) return { grams: r((ml / 236.6) * gPerCup), how: `USDA: 1 cup ≈ ${Math.round(gPerCup)} g`, estimated: false }
    return { grams: r(ml), how: 'guessed at 1 g per ml', estimated: true }
  }

  if (unit === 'pinch') return { grams: r(n * 0.36), how: 'a pinch ≈ 0.4 g', estimated: true }
  if (unit === 'dash') return { grams: r(n * 0.6), how: 'a dash ≈ 0.6 g', estimated: true }
  if (unit === 'handful') return { grams: r(n * 30), how: 'a handful ≈ 30 g', estimated: true }
  if (unit === 'can') {
    const p = portions.find((x) => /\bcan\b/i.test(x.label))
    return p ? { grams: r((n * p.grams) / leading(p.label)), how: `USDA: ${p.label} = ${Math.round(p.grams)} g`, estimated: false } : { grams: r(n * 425), how: 'a standard 15 oz can ≈ 425 g', estimated: true }
  }

  // Counts: "2 cloves", "1 large", "3 eggs", "1 onion".
  const word = unit && COUNT_WORD[unit]
  const notVolumeOrWeight = (l: string) => !/\b(cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|fl oz|g|grams?|ml|package|container|nlea)\b/i.test(l)
  const p =
    (word && portions.find((x) => word.test(x.label.toLowerCase()))) ||
    portions.find((x) => /\bmedium\b/i.test(x.label) && notVolumeOrWeight(x.label)) ||
    portions.find((x) => /\blarge\b/i.test(x.label) && notVolumeOrWeight(x.label)) ||
    portions.find((x) => notVolumeOrWeight(x.label))
  if (p) return { grams: r((n * p.grams) / leading(p.label)), how: `USDA: ${p.label} = ${Math.round(p.grams)} g`, estimated: false }
  return { grams: r(n * 100), how: 'no USDA portion: check the grams', estimated: true }
}
