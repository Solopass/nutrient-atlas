import { beforeEach, describe, expect, test } from 'bun:test'
import { db, localDate } from '../db/db'
import { clearPlan, isEaten, markLogged, planKey, savePlan, type SavedPlan } from './dayPlan'
import { addDays } from './history'
import type { PickToLog } from './logPick'

const today = localDate()
const item = (key: string, name: string, kind: PickToLog['kind'] = 'usda'): PickToLog => ({ kind, key, name, portion: '1 cup', nutrients: { iron: 2 }, kcal: 50 })
const plan = (date: string): Omit<SavedPlan, 'createdAt'> => ({ date, items: [item('usda-1', 'Lentils, cooked'), item('meal-2', 'Lentil dal', 'meal')], before: 60, after: 80, closes: ['Fe'] })
const get = async (date: string) => (await db.settings.get(planKey(date)))?.value as SavedPlan | undefined

describe('saved plans', () => {
  beforeEach(async () => {
    await db.settings.clear()
  })

  test("today's and tomorrow's plans live side by side; old ones are removed on save", async () => {
    await savePlan(plan(addDays(today, -5)))
    await savePlan(plan(today))
    await savePlan(plan(addDays(today, 1)))
    expect(await get(today)).toBeDefined()
    expect(await get(addDays(today, 1))).toBeDefined()
    expect(await get(addDays(today, -5))).toBeUndefined()
  })

  test('logging from the plan is remembered (a saved meal logs under its ingredients, not its name)', async () => {
    await savePlan(plan(today))
    await markLogged(today, 'meal-2')
    await markLogged(today, 'meal-2')
    const p = (await get(today))!
    expect(p.loggedKeys).toEqual(['meal-2'])
    expect(isEaten(p, p.items[1], [])).toBe(true)
    // A food logged some other way still counts, by name.
    expect(isEaten(p, p.items[0], ['lentils, COOKED'])).toBe(true)
    expect(isEaten(p, p.items[0], ['Rice'])).toBe(false)
  })

  test('clear removes just that day', async () => {
    await savePlan(plan(today))
    await savePlan(plan(addDays(today, 1)))
    await clearPlan(today)
    expect(await get(today)).toBeUndefined()
    expect(await get(addDays(today, 1))).toBeDefined()
  })
})
