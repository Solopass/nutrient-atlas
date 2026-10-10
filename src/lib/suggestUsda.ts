import { nameParts, nutrientsForGrams, type UsdaDb, type UsdaFood } from '../data/usda'
import type { Diet } from './profile'
import type { NutrientState } from '../types'
import { amountAgainstUL, dayScore, nutrientState, ulPart } from './status'

export interface FoodSuggestion {
  /** Where the pick comes from: the USDA table, your saved foods or meals, or a food you rated in Products. */
  kind: 'usda' | 'mine' | 'meal' | 'product'
  key: string
  name: string
  /** USDA picks only. */
  food?: UsdaFood
  grams?: number
  foodId?: number
  mealId?: number
  productId?: number
  portion: string
  nutrients: Record<string, number>
  kcal: number | null
  /** Gaps this portion lifts to 80%+. */
  closes: NutrientState[]
  /** Gaps it raises by 10+ points without closing. */
  helps: NutrientState[]
  score: number
}

// Groups that make poor "eat this next" suggestions: niche, mixed dishes, or tiny/fortified outliers.
const SKIP_GROUPS = new Set([
  'Baby Foods', 'Fast Foods', 'Restaurant Foods', 'American Indian/Alaska Native Foods', 'Meals, Entrees, and Side Dishes',
  'Spices and Herbs', 'Beverages', 'Sweets', 'Snacks', 'Breakfast Cereals', 'Soups, Sauces, and Gravies', 'Fats and Oils',
  'Sausages and Luncheon Meats', 'Baked Products',
])
const MEAT = new Set(['Beef Products', 'Pork Products', 'Poultry Products', 'Lamb, Veal, and Game Products'])
const ANIMAL = /\b(beef|pork|chicken|turkey|lamb|veal|fish|salmon|tuna|cod|shrimp|egg|duck|goose)\b/i
const SKIP_NAME =
  /fortified|dried|dehydrated|powder|\bdry\b|frozen|canned|with salt added|imitation|formula|infant|by-products|variety meats|liver|kidney|brain|\bheart\b|spleen|lung|tongue|pancreas|thymus|flour|\bmeal\b|\bbran\b|\bgerm\b|isolate|concentrate|meatless|vegetarian|analog|sauteed|fried|in oil|\boil\b|leaves, raw|mature seeds, raw|sprouted|butter(?!nut)|\blard\b|shortening|cottonseed|smoothie|juice|beverage|drink|supplement|nutritional|shake|meal replacement/i

function allowedForDiet(f: UsdaFood, diet: Diet) {
  const meat = MEAT.has(f.category)
  const fish = f.category === 'Finfish and Shellfish Products'
  const dairyEgg = f.category === 'Dairy and Egg Products'
  if (diet === 'omnivore') return true
  if (diet === 'pescatarian') return !meat
  if (diet === 'vegetarian') return !meat && !fish
  return !meat && !fish && !dairyEgg // vegan
}

/**
 * The richest everyday sources of one nutrient for this diet: one normal
 * portion each, as % of the target. Used by weekly insights ("Try: …").
 */
export function topFoodsFor(nutrientId: string, target: number, usda: UsdaDb, diet: Diet, count = 3) {
  const out: { name: string; portion: string; pct: number }[] = []
  const heads = new Set<string>()
  const ranked = usda.foods
    .filter((f) => f.per100g[nutrientId] && !SKIP_GROUPS.has(f.category) && !SKIP_NAME.test(f.name) && !isOdd(f) && allowedForDiet(f, diet))
    .filter((f) => !((MEAT.has(f.category) || f.category === 'Finfish and Shellfish Products') && /\braw\b/i.test(f.name)))
    .map((f) => {
      const { grams, label } = portionOf(f)
      const pct = ((f.per100g[nutrientId] * grams) / 100 / target) * 100
      return { f, label, pct, score: pct * (1 - 0.07 * Math.max(0, f.segments - 3)) }
    })
    .sort((a, b) => b.score - a.score)
  for (const r of ranked) {
    const head = nameParts(r.f.name)[1].toLowerCase()
    if (heads.has(head)) continue
    heads.add(head)
    out.push({ name: nameParts(r.f.name)[1].replace(/^./, (c) => c.toUpperCase()), portion: r.label, pct: r.pct })
    if (out.length === count) break
  }
  return out
}

const PACKAGING = /package|container|\bpkg\b|\bhead\b|\bcan\b|bottle|\bjar\b|\bloaf\b|\bbox\b|\bbag\b|recipe|batch|yield/i

/**
 * A realistic single portion: the smallest USDA portion from 25 g to 350 g that
 * isn't a package ("1 oz" of almonds, "1 cup" of spinach, "1 large" egg); else 100 g.
 * Avoids "1 cup of almonds", "1 almond" and "1 package of spinach".
 */
function portionOf(f: UsdaFood) {
  // Energy-dense foods (seeds, nuts, oils) are eaten by the tablespoon, so allow smaller portions for them.
  const min = (f.kcal ?? 0) > 350 ? 10 : 25
  const p = f.portions.filter((x) => x.grams >= min && x.grams <= 350 && !PACKAGING.test(x.label)).sort((a, b) => a.grams - b.grams)[0]
  if (p) return { grams: p.grams, label: `${p.label} (${Math.round(p.grams)} g)` }
  // No usable USDA portion: an ounce of energy-dense foods (raw almonds, walnut halves, ground flax), not 100 g (500+ kcal).
  return (f.kcal ?? 0) > 350 ? { grams: 28, label: '1 oz (28 g)' } : { grams: 100, label: '100 g' }
}

/** Brand-name entries (USDA writes brands in capitals, e.g. "SILK") and unusual eggs make poor suggestions. */
const isOdd = (f: UsdaFood) =>
  /\b[A-Z]{3,}\b/.test(f.name) ||
  /egg, (duck|goose|quail|turkey)/i.test(f.name) ||
  /\b(ostrich|emu|caribou|moose|elk|beaver|bear|squirrel|muskrat|raccoon|opossum|seal|whale|walrus|beefalo|buffalo|boar|antelope|horse|frog|turtle|snail|octopus|squid)\b/i.test(f.name)

/** Your own foods and saved meals get a small nudge: you already have and like them. */
const OWN_BONUS = 1.15

/** A saved food or saved meal, pre-scaled to one serving / portion. */
export interface OwnCandidate {
  kind: 'mine' | 'meal' | 'product'
  key: string
  name: string
  portion: string
  nutrients: Record<string, number>
  kcal: number | null
  foodId?: number
  mealId?: number
  productId?: number
  grams?: number
}

/**
 * Rank every USDA whole food (plus your own saved foods and meals) by how much
 * of the remaining gap one portion closes. Weighted toward the biggest gaps,
 * lightly penalised for calories, and rejected if it would push a limit
 * (sodium, sat fat...) or an upper limit over. Returns the top `count`, one
 * per food family.
 */
export function suggestFoods(
  states: NutrientState[],
  usda: UsdaDb,
  diet: Diet,
  eatenNames: string[],
  count = 3,
  own: OwnCandidate[] = [],
): FoodSuggestion[] {
  const gaps = states.filter((s) => s.pct != null && s.pct < 80 && s.nutrient.target && s.nutrient.category !== 'limit' && s.nutrient.category !== 'advanced' && !s.nutrient.sunCovered)
  if (gaps.length === 0) return []
  const limits = states.filter((s) => s.nutrient.category === 'limit' && s.nutrient.target)
  const capped = states.filter((s) => s.nutrient.upperLimit != null && s.nutrient.ulAppliesTo !== 'supplements' && s.intake)
  const eaten = new Set(eatenNames.map((n) => nameParts(n)[1].toLowerCase()))

  /** Gap closed, limit cost and rejection for one portion's nutrients. */
  const evaluate = (add: Record<string, number>) => {
    let gain = 0
    const closes: NutrientState[] = []
    const helps: NutrientState[] = []
    for (const s of gaps) {
      const v = add[s.nutrient.id]
      if (!v) continue
      const addPct = (v / s.nutrient.target!) * 100
      gain += Math.min(addPct, 80 - s.pct!) * (1 + (80 - s.pct!) / 80)
      if (s.pct! + addPct >= 80) closes.push(s)
      else if (addPct >= 10) helps.push(s)
    }
    if (gain < 20) return null

    // Reject foods that would push a limit or upper limit over. If it's already over,
    // don't reject everything; charge each food for how much more it adds.
    let limitCost = 0
    for (const s of limits) {
      const v = add[s.nutrient.id] ?? 0
      const before = s.intake?.amount ?? 0
      const limit = s.nutrient.target!
      if (before <= limit && before + v > limit) return null
      limitCost += (v / limit) * 100 * (before > limit ? 3 : 1)
    }
    for (const s of capped) {
      const v = ulPart(s.nutrient.id, add, false)
      const before = amountAgainstUL(s.nutrient, s.intake!)
      const ul = s.nutrient.upperLimit!
      if (before <= ul && before + v > ul) return null
      if (before > ul) limitCost += (v / ul) * 300
    }
    return { gain, closes, helps, limitCost }
  }
  const kcalFactor = (kcal: number | null) => 1 - Math.min(kcal ?? 200, 700) / 1400

  const scored: FoodSuggestion[] = []
  for (const f of usda.foods) {
    if (SKIP_GROUPS.has(f.category) || SKIP_NAME.test(f.name) || isOdd(f) || !allowedForDiet(f, diet)) continue
    // Grains and pasta: suggest them cooked, not by the 100 g of dry grain.
    if (f.category === 'Cereal Grains and Pasta' && !/cooked|boiled|steamed/i.test(f.name)) continue
    // Suggest cooked meat and fish, not raw.
    if ((MEAT.has(f.category) || f.category === 'Finfish and Shellfish Products' || ANIMAL.test(f.name)) && /\braw\b/i.test(f.name) && !/egg/i.test(f.name)) continue
    if (eaten.has(nameParts(f.name)[1].toLowerCase())) continue

    const { grams, label } = portionOf(f)
    const add = nutrientsForGrams(f, grams)
    const e = evaluate(add)
    if (!e) continue
    const kcal = f.kcal != null ? (f.kcal * grams) / 100 : null
    // Long USDA names are usually obscure variants ("..., boiled, drained, with salt"); prefer everyday entries.
    const obscurity = 1 - 0.07 * Math.max(0, f.segments - 3)
    scored.push({
      kind: 'usda', key: `usda-${f.fdcId}`, name: f.name, food: f, grams, portion: label, nutrients: add, kcal,
      closes: e.closes, helps: e.helps, score: e.gain * kcalFactor(kcal) * obscurity - e.limitCost * 0.5,
    })
  }

  for (const c of own) {
    if (eaten.has(nameParts(c.name)[1].toLowerCase())) continue
    const e = evaluate(c.nutrients)
    if (!e) continue
    scored.push({ ...c, closes: e.closes, helps: e.helps, score: e.gain * kcalFactor(c.kcal) * OWN_BONUS - e.limitCost * 0.5 })
  }

  scored.sort((a, b) => b.score - a.score)
  const out: FoodSuggestion[] = []
  const heads = new Set<string>()
  for (const s of scored) {
    const head = nameParts(s.name)[1].toLowerCase()
    if (heads.has(head)) continue
    heads.add(head)
    out.push(s)
    if (out.length === count) break
  }
  return out
}

// ── Plan tomorrow ──────────────────────────────────────────────────

/** States after eating `add` on top of each state's intake (coverage kept; a new nutrient counts as reported). */
export function addToStates(states: NutrientState[], add: Record<string, number>): NutrientState[] {
  return states.map((s) => {
    const id = s.nutrient.id
    const v = add[id]
    if (!v) return s
    const i = s.intake
    const intake = i
      ? { ...i, amount: i.amount + v, ulAmount: i.ulAmount != null ? i.ulAmount + ulPart(id, add, false) : undefined }
      : { amount: v, coverage: 1 }
    return nutrientState(s.nutrient, intake)
  })
}

export interface DayPlan {
  picks: FoodSuggestion[]
  /** Score of the starting day (e.g. your 7-day average) and of that day plus the plan. */
  before: number
  after: number
  /** Nutrients the plan lifts from under 80% to 80%+. */
  closed: NutrientState[]
  kcal: number
}

/**
 * A few foods that close the gaps *together*: pick the best next food, add it
 * to the day, recompute the gaps, and pick again, so each food covers what the
 * others leave. Stops at `max` foods, when nothing helps enough, or when the
 * next food would take the plan over `kcalBudget` (the first two are always
 * allowed). Same rules as Best next food: realistic portions, the diet, no
 * pushing a limit or upper limit over. For variety, at most one USDA food per
 * food group, and no two foods with the same name head ("soy milk" = "soymilk").
 */
export function planDay(
  states: NutrientState[],
  usda: UsdaDb,
  diet: Diet,
  exclude: string[],
  own: OwnCandidate[] = [],
  opts: { max?: number; kcalBudget?: number; keep?: FoodSuggestion[] } = {},
): DayPlan {
  const max = opts.max ?? 4
  const budget = opts.kcalBudget ?? 900
  const picks: FoodSuggestion[] = []
  const used = [...exclude]
  let cur = states
  let kcal = 0
  const groups = new Set<string>()
  const heads = new Set<string>()
  // One family per first word, for variety: "soy milk" = "soymilk" = "soybeans", "peanuts" = "peanut spread".
  const headOf = (name: string) =>
    (nameParts(name)[1].toLowerCase().replace(/\(.*?\)/g, '').trim().split(/[\s,]+/)[0] ?? '')
      .replace(/-/g, '')
      .replace(/(milk|beans?)$/, '')
      .replace(/s$/, '')
  // Foods you swapped out rule out their whole family.
  for (const n of exclude) heads.add(headOf(n))
  const add = (p: FoodSuggestion) => {
    picks.push(p)
    used.push(p.name)
    heads.add(headOf(p.name))
    if (p.food) groups.add(p.food.category)
    kcal += p.kcal ?? 0
    cur = addToStates(cur, p.nutrients)
  }
  // Swapping one food keeps the others: they go in first, and only the gap is filled.
  for (const p of opts.keep ?? []) add(p)
  while (picks.length < max) {
    // A wide pool, so the variety rules below still leave good choices.
    const candidates = suggestFoods(cur, usda, diet, used, 40, own.filter((o) => !picks.some((p) => p.key === o.key)))
    const best = candidates.find((c) => !heads.has(headOf(c.name)) && !(c.food && groups.has(c.food.category)))
    if (!best) break
    if (picks.length >= 2 && kcal + (best.kcal ?? 0) > budget) break
    add(best)
  }
  const wasLow = new Set(states.filter((s) => s.pct != null && s.pct < 80).map((s) => s.nutrient.id))
  const closed = cur.filter((s) => wasLow.has(s.nutrient.id) && s.pct != null && s.pct >= 80 && !s.nutrient.sunCovered && s.nutrient.category !== 'limit')
  return { picks, before: Math.round(dayScore(states).score), after: Math.round(dayScore(cur).score), closed, kcal: Math.round(kcal) }
}
