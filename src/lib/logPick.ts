import { db, type Meal } from '../db/db'
import { logNewFood, logSavedFood } from '../db/logging'
import { logSavedMeal } from './quickLog'
import type { FoodSuggestion } from './suggestUsda'

/** What's needed to log a suggested food later (also what a saved plan stores). */
export type PickToLog = Pick<FoodSuggestion, 'kind' | 'key' | 'name' | 'portion' | 'grams' | 'nutrients' | 'kcal' | 'foodId' | 'mealId' | 'productId'>

/** Log one portion of a Best next food or plan pick. USDA picks carry nutrients already scaled to the portion. */
export async function logPick(p: PickToLog, date: string, meal: Meal) {
  if (p.kind === 'usda') {
    await logNewFood({ name: p.name, serving: p.portion, grams: p.grams, nutrients: p.nutrients, source: 'usda' }, meal, 1, date)
  } else if (p.kind === 'mine' && p.foodId != null) {
    const food = await db.foods.get(p.foodId)
    if (food) await logSavedFood(food, meal, 1, date)
    else await logNewFood({ name: p.name, serving: p.portion, nutrients: p.nutrients, source: 'custom' }, meal, 1, date)
  } else if (p.kind === 'meal' && p.mealId != null && (await db.meals.get(p.mealId))) {
    await logSavedMeal(p.mealId, date, meal)
  } else {
    await logNewFood({ name: p.name, serving: p.portion, grams: p.grams, nutrients: p.nutrients, source: 'custom' }, meal, 1, date)
  }
}

export const toPickToLog = ({ kind, key, name, portion, grams, nutrients, kcal, foodId, mealId, productId }: FoodSuggestion): PickToLog => ({
  kind, key, name, portion, grams, nutrients, kcal, foodId, mealId, productId,
})
