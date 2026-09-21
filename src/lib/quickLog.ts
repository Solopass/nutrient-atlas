import { db, localDate, type LogEntry, type Meal, type MealItem } from '../db/db'
import { addDays, parseDate } from './history'

/** How far back "same as before" looks for a previous meal. */
const LOOKBACK_DAYS = 14

/** Timestamp for a new entry: now for today, midday for a back-filled day. */
const now = (date: string) => (date === localDate() ? Date.now() : parseDate(date).getTime() + 12 * 3600_000)

/** The most recent earlier day that has entries for `meal`, with those entries. */
export async function previousMeal(date: string, meal: Meal) {
  const from = addDays(date, -LOOKBACK_DAYS)
  const before = addDays(date, -1)
  const entries = await db.logs
    .where('date')
    .between(from, before, true, true)
    .filter((l) => l.meal === meal && l.supplementId == null)
    .toArray()
  if (entries.length === 0) return null
  const last = entries.reduce((a, l) => (l.date > a ? l.date : a), '')
  return { date: last, entries: entries.filter((l) => l.date === last).sort((a, b) => a.loggedAt - b.loggedAt) }
}

/** Copy entries into another day/meal as new entries. */
export async function copyEntries(entries: Pick<LogEntry, 'name' | 'serving' | 'multiplier' | 'nutrients' | 'foodId'>[], date: string, meal: Meal, scale = 1) {
  const t = now(date)
  await db.logs.bulkAdd(
    entries.map(
      (e, i) =>
        ({
          date,
          loggedAt: t + i,
          meal,
          foodId: e.foodId,
          name: e.name,
          serving: e.serving,
          multiplier: e.multiplier * scale,
          nutrients: e.nutrients,
        }) as LogEntry,
    ),
  )
}

export async function saveMeal(name: string, entries: LogEntry[], servings: number) {
  const items: MealItem[] = entries.map((e) => ({ name: e.name, serving: e.serving, multiplier: e.multiplier, nutrients: e.nutrients, foodId: e.foodId }))
  const t = Date.now()
  return db.meals.add({ name, items, servings: Math.max(1, servings), useCount: 0, createdAt: t, lastUsedAt: t } as never)
}

/** Log `portions` portions of a saved meal. */
export async function logSavedMeal(id: number, date: string, meal: Meal, portions = 1) {
  const m = await db.meals.get(id)
  if (!m) return
  await copyEntries(m.items, date, meal, portions / m.servings)
  await db.meals.update(id, { useCount: m.useCount + 1, lastUsedAt: Date.now() })
}

/** Energy of a set of items from macros and alcohol (Atwater: 4 / 4 / 9 / 7 kcal per g). */
export function itemsKcal(items: { multiplier: number; nutrients: Record<string, number> }[]) {
  return items.reduce((a, i) => a + kcalOf(i.nutrients) * i.multiplier, 0)
}

export const kcalOf = (n: Record<string, number>) => (n.protein ?? 0) * 4 + (n.carbs ?? 0) * 4 + (n.fat ?? 0) * 9 + (n.alcohol ?? 0) * 7
