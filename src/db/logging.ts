import { UL_BASIS, ulPart } from '../lib/status'
import type { Intake } from '../types'
import { db, localDate, type Food, type FoodSource, type LogEntry, type Meal } from './db'

export interface NewFood {
  name: string
  serving: string
  grams?: number
  nutrients: Record<string, number>
  source: FoodSource
  barcode?: string
  brand?: string
}

/** Save a food (or reuse an identical-name one) and log it. */
export async function logNewFood(food: NewFood, meal: Meal, multiplier = 1, date = localDate()) {
  return db.transaction('rw', db.foods, db.logs, async () => {
    const now = Date.now()
    const existing = await db.foods.where('name').equalsIgnoreCase(food.name).first()
    let foodId: number
    if (existing && existing.serving === food.serving) {
      foodId = existing.id
      await db.foods.update(foodId, { nutrients: food.nutrients, grams: food.grams, ...(food.barcode && { barcode: food.barcode, brand: food.brand }), lastUsedAt: now, useCount: existing.useCount + 1 })
    } else {
      foodId = await db.foods.add({ ...food, favorite: 0, useCount: 1, createdAt: now, lastUsedAt: now } as Food)
    }
    await db.logs.add({
      date,
      loggedAt: now,
      meal,
      foodId,
      name: food.name,
      serving: food.serving,
      multiplier,
      nutrients: food.nutrients,
    } as LogEntry)
  })
}

export async function logSavedFood(food: Food, meal: Meal, multiplier = 1, date = localDate()) {
  const now = Date.now()
  await db.transaction('rw', db.foods, db.logs, async () => {
    await db.foods.update(food.id, { lastUsedAt: now, useCount: food.useCount + 1 })
    await db.logs.add({
      date,
      loggedAt: now,
      meal,
      foodId: food.id,
      name: food.name,
      serving: food.serving,
      multiplier,
      nutrients: food.nutrients,
    } as LogEntry)
  })
}

/** A day counts as logged only if it has food; auto-logged supplements alone don't make a logged day. */
export const hasFood = (entries: LogEntry[] | undefined) => !!entries?.some((e) => e.supplementId == null)

/**
 * Sum a day's entries into per-nutrient intake.
 *
 * Coverage is the share of *food* entries that report the nutrient, which
 * drives the "no data" and "partial data" states. Supplements add to the
 * amount but never lower coverage (a vitamin D pill says nothing about
 * protein). A nutrient that only a supplement reports counts as partial:
 * the supplement amount is known, the food amount isn't.
 *
 * Results are cached per array: the dashboard asks for the same day once per
 * nutrient (7-day whiskers, trends), and log arrays are never mutated after
 * they're built (Dexie queries and groupByDate return fresh arrays).
 * Treat the result as read-only.
 */
export function intakeFromLogs(entries: LogEntry[]): Record<string, Intake> {
  const cached = intakeCache.get(entries)
  if (cached) return cached
  const out = sumIntake(entries)
  intakeCache.set(entries, out)
  return out
}

const intakeCache = new WeakMap<LogEntry[], Record<string, Intake>>()

function sumIntake(entries: LogEntry[]): Record<string, Intake> {
  const out: Record<string, Intake> = {}
  if (entries.length === 0) return out
  const foods = entries.filter((e) => e.supplementId == null)
  const ids = new Set(entries.flatMap((e) => Object.keys(e.nutrients)))
  for (const id of ids) {
    let amount = 0
    let supplement = 0
    let reported = 0
    for (const e of entries) {
      const v = e.nutrients[id]
      if (v == null) continue
      amount += v * e.multiplier
      if (e.supplementId != null) supplement += v * e.multiplier
      else reported++
    }
    let coverage = foods.length ? reported / foods.length : supplement > 0 ? 1 : 0
    if (supplement > 0 && foods.length) coverage = Math.max(coverage, 0.5)
    out[id] = { amount, coverage, supplement }
    if (UL_BASIS[id]) out[id].ulAmount = entries.reduce((a, e) => a + ulPart(id, e.nutrients, e.supplementId != null) * e.multiplier, 0)
  }
  return out
}
