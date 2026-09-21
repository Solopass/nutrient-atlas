import { db, localDate, type LogEntry, type Meal } from '../db/db'
import { loadUsda, nutrientsForGrams, searchUsda, type UsdaDb } from '../data/usda'
import { addDays } from './history'

/**
 * Three weeks of plausible meals built from real USDA foods, so History and the
 * 7-day view can be explored before the user has logged that much. Every entry
 * is flagged `sample: true` and can be removed in one go.
 */

type Item = [query: string, grams: number]
const MEALS: Record<Meal, Item[][]> = {
  breakfast: [
    [['oats regular quick not fortified dry', 60], ['milk whole', 240], ['banana', 120]],
    [['egg whole raw fresh', 100], ['bread whole wheat commercially', 64], ['orange', 150]],
    [['greek yogurt plain', 200], ['blueberries', 100], ['almonds', 28]],
  ],
  lunch: [
    [['chicken breast meat only roasted', 150], ['rice brown cooked', 185], ['broccoli', 150]],
    [['lentils cooked', 200], ['spinach raw', 60], ['bread whole wheat commercially', 64]],
    [['salmon atlantic', 150], ['sweet potato', 200], ['lettuce romaine', 80]],
  ],
  dinner: [
    [['beef ground', 150], ['pasta cooked', 200], ['tomatoes red raw', 120]],
    [['tofu raw firm', 150], ['rice white long grain enriched cooked', 185], ['peppers sweet red', 120]],
    [['pork loin chop broiled', 150], ['potato baked', 200], ['beans snap green', 120]],
  ],
  snack: [[['apple', 180]], [['peanut butter', 32]], [['cheese cheddar', 40]], [['carrots raw', 100]], [['chocolate dark', 30]]],
}

export const SAMPLE_QUERIES = [...new Set(Object.values(MEALS).flat(2).map(([q]) => q))]

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

function build(usda: UsdaDb, days = 21): Omit<LogEntry, 'id'>[] {
  const food = new Map(SAMPLE_QUERIES.map((q) => [q, searchUsda(usda, q, 1)[0]]))
  const rand = rng(42)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const today = localDate()
  const out: Omit<LogEntry, 'id'>[] = []

  for (let i = days; i >= 0; i--) {
    const date = addDays(today, -i)
    if (i > 0 && rand() < 0.12) continue // the odd forgotten day
    const meals: Meal[] = i === 0 ? ['breakfast'] : ['breakfast', 'lunch', 'dinner', ...(rand() < 0.7 ? (['snack'] as Meal[]) : [])]
    for (const meal of meals) {
      for (const [q, grams] of pick(MEALS[meal])) {
        const f = food.get(q)
        if (!f) continue
        const g = Math.round(grams * (0.8 + rand() * 0.4))
        out.push({
          date,
          loggedAt: new Date(`${date}T${{ breakfast: '08', lunch: '12', dinner: '19', snack: '15' }[meal]}:30:00`).getTime(),
          meal,
          name: f.name,
          serving: `${g} g`,
          multiplier: 1,
          nutrients: nutrientsForGrams(f, g),
          sample: true,
        })
      }
    }
  }
  return out
}

export async function loadSampleData() {
  const entries = build(await loadUsda())
  await db.logs.bulkAdd(entries as LogEntry[])
  return entries.length
}

export async function removeSampleData() {
  return db.logs.filter((l) => l.sample === true).delete()
}
