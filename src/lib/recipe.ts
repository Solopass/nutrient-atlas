import type { Food, MealItem } from '../db/db'
import { nutrientsForGrams, type UsdaFood } from '../data/usda'
import { kcalOf } from './quickLog'

/**
 * Recipes are saved meals with `servings` > 1: a list of ingredients (each a
 * unit amount × multiplier) that together make N portions. Logging one
 * portion copies every ingredient scaled by 1/servings.
 */

/** An ingredient from the USDA table: `qty` × one portion of `grams`. Nutrients are stored per unit. */
export function usdaIngredient(food: UsdaFood, portion: { label: string; grams: number }, qty: number): MealItem {
  const serving = portion.label === `${portion.grams} g` ? portion.label : `${portion.label} (${Math.round(portion.grams)} g)`
  return { name: food.name, serving, multiplier: qty, nutrients: nutrientsForGrams(food, portion.grams) }
}

/** An ingredient from your own foods (label foods, AI estimates, earlier logs). */
export function foodIngredient(food: Food, qty: number): MealItem {
  return { name: food.name, serving: food.serving, multiplier: qty, nutrients: food.nutrients, foodId: food.id }
}

/** Nutrients in one portion: the sum of every ingredient, divided by the number of portions. */
export function perPortion(items: MealItem[], servings: number): Record<string, number> {
  const out: Record<string, number> = {}
  const n = Math.max(1, servings)
  for (const i of items) for (const [id, v] of Object.entries(i.nutrients)) out[id] = (out[id] ?? 0) + (v * i.multiplier) / n
  return out
}

export const portionKcal = (items: MealItem[], servings: number) => Math.round(kcalOf(perPortion(items, servings)))

/** Total weight in grams when every ingredient's serving names its grams, e.g. "1 cup (240 g)" or "100 g". */
export function totalGrams(items: MealItem[]): number | null {
  let sum = 0
  for (const i of items) {
    const m = i.serving.match(/(\d+(?:\.\d+)?)\s*g\b\)?\s*$/)
    if (!m) return null
    sum += Number(m[1]) * i.multiplier
  }
  return items.length ? Math.round(sum) : null
}

/** Clean up before saving: drop zero-amount ingredients, trim the name, keep at least one portion. */
export function normalizeRecipe(name: string, items: MealItem[], servings: number) {
  return {
    name: name.trim() || 'Untitled recipe',
    items: items.filter((i) => i.multiplier > 0),
    servings: Math.max(1, Math.round(servings)),
  }
}
