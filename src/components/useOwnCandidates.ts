import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { itemsKcal } from '../lib/quickLog'
import type { OwnCandidate } from '../lib/suggestUsda'

/**
 * Your saved foods and meals, and packaged foods you rated in Products (not the
 * 1–2 star ones), as candidates for Best next food and Plan tomorrow. They
 * compete with USDA foods, with a small nudge since you already eat them.
 */
export function useOwnCandidates(): OwnCandidate[] {
  const myFoods = useLiveQuery(() => db.foods.toArray(), [])
  const myMeals = useLiveQuery(() => db.meals.toArray(), [])
  const myProducts = useLiveQuery(() => db.products.where('kind').equals('food').toArray(), [])
  return useMemo<OwnCandidate[]>(
    () => [
      ...(myFoods ?? [])
        .filter((f) => f.source !== 'usda') // USDA foods are already candidates
        .map((f) => ({ kind: 'mine' as const, key: `food-${f.id}`, name: f.name, portion: f.serving, nutrients: f.nutrients, kcal: itemsKcal([{ multiplier: 1, nutrients: f.nutrients }]), foodId: f.id })),
      ...(myMeals ?? []).map((m) => {
        const nutrients: Record<string, number> = {}
        for (const i of m.items) for (const [k, v] of Object.entries(i.nutrients)) nutrients[k] = (nutrients[k] ?? 0) + (v * i.multiplier) / m.servings
        return { kind: 'meal' as const, key: `meal-${m.id}`, name: m.name, portion: m.servings > 1 ? `1 of ${m.servings} portions` : 'saved meal', nutrients, kcal: itemsKcal(m.items) / m.servings, mealId: m.id }
      }),
      ...(myProducts ?? [])
        .filter((p) => (p.rating ?? 3) >= 3)
        .map((p) => ({ kind: 'product' as const, key: `product-${p.id}`, name: p.brand ? `${p.brand} ${p.name}` : p.name, portion: p.serving, nutrients: p.nutrients, kcal: p.kcal ?? itemsKcal([{ multiplier: 1, nutrients: p.nutrients }]), productId: p.id, grams: p.grams })),
    ],
    [myFoods, myMeals, myProducts],
  )
}
