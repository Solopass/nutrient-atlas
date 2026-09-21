import { nameParts, nutrientsForGrams, type UsdaDb, type UsdaFood } from '../data/usda'
import type { Diet } from './profile'
import type { NutrientState } from '../types'
import { amountAgainstUL } from './status'

export interface FoodSuggestion {
  food: UsdaFood
  grams: number
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
  /fortified|dried|dehydrated|powder|\bdry\b|frozen|canned|with salt added|imitation|formula|infant|by-products|variety meats|liver|kidney|brain|\bheart\b|spleen|lung|tongue|pancreas|thymus|flour|\bmeal\b|\bbran\b|\bgerm\b|isolate|concentrate|meatless|vegetarian|analog|sauteed|fried|in oil|\boil\b|leaves, raw|mature seeds, raw|sprouted/i

function allowedForDiet(f: UsdaFood, diet: Diet) {
  const meat = MEAT.has(f.category)
  const fish = f.category === 'Finfish and Shellfish Products'
  const dairyEgg = f.category === 'Dairy and Egg Products'
  if (diet === 'omnivore') return true
  if (diet === 'pescatarian') return !meat
  if (diet === 'vegetarian') return !meat && !fish
  return !meat && !fish && !dairyEgg // vegan
}

/** A sensible single portion: the first USDA portion between 15 g and 350 g, else 100 g. */
function portionOf(f: UsdaFood) {
  const p = f.portions.find((x) => x.grams >= 15 && x.grams <= 350)
  return p ? { grams: p.grams, label: `${p.label} (${Math.round(p.grams)} g)` } : { grams: 100, label: '100 g' }
}

/**
 * Rank every USDA whole food by how much of today's remaining gap one normal
 * portion closes. Weighted toward the biggest gaps, lightly penalised for
 * calories, and rejected if it would push a limit (sodium, sat fat...) or an
 * upper limit over. Returns the top `count`, one per food family.
 */
export function suggestFoods(states: NutrientState[], usda: UsdaDb, diet: Diet, eatenNames: string[], count = 3): FoodSuggestion[] {
  const gaps = states.filter((s) => s.pct != null && s.pct < 80 && s.nutrient.target && s.nutrient.category !== 'limit' && s.nutrient.category !== 'advanced')
  if (gaps.length === 0) return []
  const limits = states.filter((s) => s.nutrient.category === 'limit' && s.nutrient.target)
  const capped = states.filter((s) => s.nutrient.upperLimit != null && s.nutrient.ulAppliesTo !== 'supplements' && s.intake)
  const eaten = new Set(eatenNames.map((n) => nameParts(n)[1].toLowerCase()))

  const scored: FoodSuggestion[] = []
  for (const f of usda.foods) {
    if (SKIP_GROUPS.has(f.category) || SKIP_NAME.test(f.name) || !allowedForDiet(f, diet)) continue
    // Suggest cooked meat and fish, not raw.
    if ((MEAT.has(f.category) || f.category === 'Finfish and Shellfish Products' || ANIMAL.test(f.name)) && /\braw\b/i.test(f.name) && !/egg/i.test(f.name)) continue
    const head = nameParts(f.name)[1].toLowerCase()
    if (eaten.has(head)) continue

    const { grams, label } = portionOf(f)
    const add = nutrientsForGrams(f, grams)

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
    if (gain < 20) continue

    // Reject foods that would push a limit or upper limit over. If it's already over,
    // don't reject everything; charge each food for how much more it adds.
    let reject = false
    let limitCost = 0
    for (const s of limits) {
      const v = add[s.nutrient.id] ?? 0
      const before = s.intake?.amount ?? 0
      const limit = s.nutrient.target!
      if (before <= limit && before + v > limit) reject = true
      limitCost += (v / limit) * 100 * (before > limit ? 3 : 1)
    }
    for (const s of capped) {
      const v = add[s.nutrient.id] ?? 0
      const before = amountAgainstUL(s.nutrient, s.intake!)
      const ul = s.nutrient.upperLimit!
      if (before <= ul && before + v > ul) reject = true
      if (before > ul) limitCost += (v / ul) * 300
    }
    if (reject) continue

    const kcal = f.kcal != null ? (f.kcal * grams) / 100 : null
    // Long USDA names are usually obscure variants ("..., boiled, drained, with salt"); prefer everyday entries.
    const obscurity = 1 - 0.07 * Math.max(0, f.segments - 3)
    const score = gain * (1 - Math.min(kcal ?? 200, 700) / 1400) * obscurity - limitCost * 0.5
    scored.push({ food: f, grams, portion: label, nutrients: add, kcal, closes, helps, score })
  }

  scored.sort((a, b) => b.score - a.score)
  const out: FoodSuggestion[] = []
  const heads = new Set<string>()
  for (const s of scored) {
    const head = nameParts(s.food.name)[1].toLowerCase()
    if (heads.has(head)) continue
    heads.add(head)
    out.push(s)
    if (out.length === count) break
  }
  return out
}
