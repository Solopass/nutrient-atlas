/**
 * USDA FoodData Central, preprocessed by scripts/build-usda.ts into
 * public/usda/foods.json. Loaded once on demand and searched in memory
 * (~8k foods, a few ms per query).
 */

export interface UsdaFood {
  fdcId: number
  name: string
  category: string
  source: 'foundation' | 'sr'
  kcal: number | null
  /** Per 100 g, app units, only nutrients USDA reports. */
  per100g: Record<string, number>
  portions: { label: string; grams: number }[]
  /** lowercase words for search */
  words: string[]
  /** comma-separated parts in the name, a better length measure than words */
  segments: number
  /** words of the head segment after any group prefix ("Fish, salmon, …" → [salmon]) */
  head: string[]
}

type RawRow = [number, string, number, 'f' | 's', number | null, (number | null)[], [string, number][]]
export interface RawFile {
  source: string
  nutrients: string[]
  categories: string[]
  foods: RawRow[]
}

export interface UsdaDb {
  foods: UsdaFood[]
  source: string
}

const split = (s: string) => s.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean)

/** Expand the compact foods.json table into searchable foods. */
export function buildUsdaDb(raw: RawFile): UsdaDb {
  return {
    source: raw.source,
    foods: raw.foods.map(([fdcId, name, cat, src, kcal, values, portions]) => {
      const per100g: Record<string, number> = {}
      values.forEach((v, i) => {
        if (v != null) per100g[raw.nutrients[i]] = v
      })
      return {
        fdcId,
        name,
        category: raw.categories[cat],
        source: src === 'f' ? 'foundation' : 'sr',
        kcal,
        per100g,
        portions: portions.map(([label, grams]) => ({ label, grams })),
        words: split(name),
        segments: name.split(',').length,
        head: split(nameParts(name)[1]),
      } satisfies UsdaFood
    }),
  }
}

let loading: Promise<UsdaDb> | null = null

export function loadUsda(): Promise<UsdaDb> {
  loading ??= fetch(`${import.meta.env.BASE_URL}usda/foods.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Food database failed to load (${r.status})`)
      return r.json() as Promise<RawFile>
    })
    .then(buildUsdaDb)
    .catch((e) => {
      loading = null // allow retry
      throw e
    })
  return loading
}

// Categories that crowd out generic foods unless asked for.
const NICHE = new Set(['Baby Foods', 'Fast Foods', 'Restaurant Foods', 'American Indian/Alaska Native Foods', 'Meals, Entrees, and Side Dishes'])
const COOKED = ['cooked', 'boiled', 'baked', 'roasted', 'fried', 'grilled', 'broiled', 'steamed', 'canned', 'dried']

// USDA prefixes many names with a food group ("Fish, salmon, …", "Nuts, almonds, …").
// The word after the group is the real head of the name.
const GROUP_PREFIX = new Set(['fish', 'nuts', 'seeds', 'spices', 'cereals', 'crustaceans', 'mollusks', 'game', 'oil', 'beverages'])
const PLAIN = new Set(['whole', 'fresh', 'plain', 'skinless', 'boneless', 'large'])
const PROCESSED = new Set(['dried', 'dehydrated', 'powder', 'imitation', 'breaded', 'nuggets', 'frozen', 'canned', 'mix', 'prepared', 'sweetened', 'reduced', 'low', 'substitute', 'sheep', 'goat'])

const matches = (word: string, token: string) =>
  word.startsWith(token) || (token.length > 3 && token.endsWith('s') && word.startsWith(token.slice(0, -1)))

/** All query words must prefix-match some word of the name. Generic, short, raw/whole foods rank first. */
export function searchUsda(db: UsdaDb, query: string, limit = 40): UsdaFood[] {
  const tokens = split(query)
  if (tokens.length === 0) return []
  const wantsCooked = tokens.some((t) => COOKED.some((c) => c.startsWith(t)))

  const scored: { food: UsdaFood; score: number }[] = []
  for (const food of db.foods) {
    const words = GROUP_PREFIX.has(food.words[0]) && food.words.length > 1 ? food.words.slice(1) : food.words
    let score = 0
    let ok = true
    for (const t of tokens) {
      const i = words.findIndex((w) => matches(w, t))
      if (i < 0) {
        ok = false
        break
      }
      score += words[i] === t ? 6 : 3
      score -= i * 0.4 // earlier words matter more ("Egg, whole" vs "Noodles, egg")
    }
    if (!ok) continue
    if (tokens.some((t) => matches(words[0], t))) score += 10
    if (food.head.every((h) => tokens.some((t) => matches(h, t)))) score += 8 // "Rice, …" for "rice", not "Rice crackers"
    if (food.source === 'foundation') score += 1
    score += Object.keys(food.per100g).length * 0.08 // completeness matters for a micronutrient app
    if (!wantsCooked && words.includes('raw')) score += 2
    for (const w of words) {
      if (PLAIN.has(w)) score += 1.5
      else if (PROCESSED.has(w) && !tokens.some((t) => matches(w, t))) score -= 2.5
    }
    if (NICHE.has(food.category) && !tokens.some((t) => food.category.toLowerCase().includes(t))) score -= 8
    score -= (food.segments - (words === food.words ? 0 : 1)) * 0.9 + words.length * 0.25
    scored.push({ food, score })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.food)
}

/** Nutrient totals for a given weight. */
export function nutrientsForGrams(food: UsdaFood, grams: number) {
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(food.per100g)) out[id] = (v * grams) / 100
  return out
}

/** Short display label: the head noun of a USDA-style name, capitalised. */
export function foodLabel(name: string) {
  const head = nameParts(name)[1]
  return head.charAt(0).toUpperCase() + head.slice(1)
}

/** Split a USDA name into [prefix, head, rest] so the UI can emphasise the real food ("Fish, **salmon**, sockeye, raw"). */
export function nameParts(name: string): [string, string, string] {
  const parts = name.split(', ')
  if (parts.length > 1 && GROUP_PREFIX.has(parts[0].toLowerCase())) return [parts[0] + ', ', parts[1], parts.length > 2 ? ', ' + parts.slice(2).join(', ') : '']
  return ['', parts[0], parts.length > 1 ? ', ' + parts.slice(1).join(', ') : '']
}
