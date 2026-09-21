import type { MockFood } from '../data/mockFoods'
import type { NutrientState } from '../types'

export interface Suggestion {
  food: MockFood
  /** Nutrients this food would lift from under 80% to 80%+. */
  closes: NutrientState[]
  /** Nutrients under 80% it meaningfully improves (≥10 points). */
  helps: NutrientState[]
  gain: number
}

/**
 * Pick the food that closes the most remaining gap, weighting each nutrient's
 * contribution by how far below 80% it currently is.
 */
export function bestNextFood(states: NutrientState[], foods: MockFood[]): Suggestion | null {
  const gaps = states.filter((s) => s.pct != null && s.pct < 80 && s.nutrient.target != null)

  let best: Suggestion | null = null
  for (const food of foods) {
    let gain = 0
    const closes: NutrientState[] = []
    const helps: NutrientState[] = []
    for (const s of gaps) {
      const add = food.nutrients[s.nutrient.id]
      if (!add) continue
      const addPct = (add / s.nutrient.target!) * 100
      const filled = Math.min(addPct, 80 - s.pct!)
      gain += filled * (1 + (80 - s.pct!) / 80)
      if (s.pct! + addPct >= 80) closes.push(s)
      else if (addPct >= 10) helps.push(s)
    }
    if (!best || gain > best.gain) best = { food, closes, helps, gain }
  }
  return best && best.gain > 0 ? best : null
}
