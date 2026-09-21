import { beforeAll, describe, expect, test } from 'bun:test'
import { searchUsda, type UsdaDb } from '../data/usda'
import { usdaDb } from '../test/usdaFixture'
import { DEFAULT_PROFILE } from './profile'
import { nutrientState } from './status'
import { suggestFoods, topFoodsFor } from './suggestUsda'
import { personalize } from './targets'
import type { Intake } from '../types'

let db: UsdaDb
beforeAll(async () => {
  db = await usdaDb()
})

describe('USDA search ranking', () => {
  test.each([
    ['egg', /^Egg, whole, raw, fresh$/],
    ['salmon', /^Fish, salmon/],
    ['chicken breast', /^Chicken, breast/],
    ['broccoli', /^Broccoli, raw$/],
    ['almonds', /^Nuts, almonds/],
    ['rice', /^Rice, /],
    ['apple', /^Apples, raw/],
    ['banana', /^Bananas, raw$/],
  ])('"%s" puts the plain food first', (q, expected) => {
    expect(searchUsda(db, q, 1)[0]?.name).toMatch(expected)
  })

  test('every query word must match', () => {
    expect(searchUsda(db, 'salmon zzzz')).toEqual([])
  })

  test('cooking words bring cooked foods up', () => {
    expect(searchUsda(db, 'cooked rice', 3).every((f) => /cooked/i.test(f.name))).toBe(true)
  })
})

/** Nutrient states for a day where only `amounts` were eaten (everything else reported as 0). */
function day(amounts: Record<string, number>, diet = DEFAULT_PROFILE.diet) {
  const nutrients = personalize({ ...DEFAULT_PROFILE, diet })
  return nutrients.map((n) => nutrientState(n, { amount: amounts[n.id] ?? (n.target ?? 0) * 0.3, coverage: 1 } as Intake))
}

describe('best next food', () => {
  test('returns up to 3 distinct foods that close gaps', () => {
    const picks = suggestFoods(day({}), db, 'omnivore', [])
    expect(picks.length).toBe(3)
    expect(new Set(picks.map((p) => p.food.name.split(',')[0])).size).toBe(3)
    expect(picks.every((p) => p.closes.length + p.helps.length > 0)).toBe(true)
  })

  test('vegan suggestions contain no meat, fish, dairy or egg', () => {
    const picks = suggestFoods(day({}, 'vegan'), db, 'vegan', [])
    for (const p of picks) expect(['Beef Products', 'Pork Products', 'Poultry Products', 'Finfish and Shellfish Products', 'Dairy and Egg Products']).not.toContain(p.food.category)
  })

  test('never pushes a limit from under to over', () => {
    const states = day({ sodium: 2250 }) // 50 mg left
    for (const p of suggestFoods(states, db, 'omnivore', [])) expect(p.nutrients.sodium ?? 0).toBeLessThanOrEqual(50)
  })

  test('skips foods already eaten', () => {
    const first = suggestFoods(day({}), db, 'omnivore', [])[0]
    const again = suggestFoods(day({}), db, 'omnivore', [first.food.name])
    expect(again.map((p) => p.food.fdcId)).not.toContain(first.food.fdcId)
  })

  test('nothing to suggest when every gap is closed', () => {
    const full = personalize(DEFAULT_PROFILE).map((n) => nutrientState(n, { amount: n.category === 'limit' ? 0 : (n.target ?? 1) * 1.1, coverage: 1 }))
    expect(suggestFoods(full, db, 'omnivore', [])).toEqual([])
  })
})

describe('food ideas per nutrient', () => {
  test('realistic portions for nuts (by the ounce, not the cup)', () => {
    const ideas = topFoodsFor('vitE', 15, db, 'omnivore')
    const almonds = ideas.find((f) => f.name === 'Almonds')
    expect(almonds?.portion).toMatch(/1 oz/)
  })

  test('respects diet', () => {
    const ideas = topFoodsFor('b12', 2.4, db, 'vegan', 5)
    for (const f of ideas) expect(f.name).not.toMatch(/^(beef|clams?|fish|salmon|eggs?|cheese|milk|yogurt)\b/i) // names are the food itself, e.g. "Soy milk" is fine
  })
})
