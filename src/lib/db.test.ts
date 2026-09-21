import { beforeEach, describe, expect, test } from 'bun:test'
import { db, localDate, type LogEntry } from '../db/db'
import { addDays } from './history'
import { copyEntries, logSavedMeal, previousMeal, saveMeal } from './quickLog'
import { applyDailySupplements, createSupplement, pauseSupplement, resumeSupplement, setTaken } from './supplements'

const today = localDate()
const D3 = { name: 'Vitamin D3', dose: '1 softgel', nutrients: { vitD: 50 }, dosesPerDay: 1, schedule: 'daily' as const }

beforeEach(async () => {
  await Promise.all([db.logs.clear(), db.supplements.clear(), db.meals.clear(), db.foods.clear()])
})

const suppLogs = () => db.logs.filter((l) => l.supplementId != null).toArray()

describe('daily supplements', () => {
  test('creating a daily supplement logs today once', async () => {
    await createSupplement(D3)
    await applyDailySupplements()
    await applyDailySupplements() // idempotent
    const logs = await suppLogs()
    expect(logs.map((l) => l.date)).toEqual([today])
    expect(logs[0].meal).toBe('supplement')
  })

  test('concurrent syncs (e.g. React StrictMode) do not double-log', async () => {
    const id = await createSupplement(D3)
    await db.supplements.update(id, { lastApplied: addDays(today, -3) })
    await Promise.all([applyDailySupplements(), applyDailySupplements(), applyDailySupplements()])
    expect((await suppLogs()).length).toBe(1 + 3)
  })

  test('back-fills missed days, capped at 14', async () => {
    const id = await createSupplement(D3)
    await db.logs.clear()
    await db.supplements.update(id, { lastApplied: addDays(today, -30) })
    await applyDailySupplements()
    const dates = (await suppLogs()).map((l) => l.date).sort()
    expect(dates.length).toBe(14)
    expect(dates.at(-1)).toBe(today)
  })

  test('an unticked day is not re-added', async () => {
    const id = await createSupplement(D3)
    const s = (await db.supplements.get(id))!
    await setTaken(s, today, false)
    await applyDailySupplements()
    expect(await suppLogs()).toEqual([])
  })

  test('paused supplements stop; resuming does not back-fill the pause', async () => {
    const id = await createSupplement(D3)
    await pauseSupplement(id)
    await db.logs.clear()
    await db.supplements.update(id, { lastApplied: addDays(today, -5) })
    await applyDailySupplements()
    expect(await suppLogs()).toEqual([])
    await resumeSupplement(id)
    expect((await suppLogs()).map((l) => l.date)).toEqual([today])
  })

  test('as-needed supplements are never auto-logged', async () => {
    await createSupplement({ ...D3, schedule: 'asNeeded' })
    await applyDailySupplements()
    expect(await suppLogs()).toEqual([])
  })
})

describe('quick log', () => {
  const eat = (date: string, name: string, meal: LogEntry['meal'] = 'breakfast') =>
    db.logs.add({ date, loggedAt: Date.now(), meal, name, serving: '1', multiplier: 1, nutrients: { protein: 10 } } as Omit<LogEntry, 'id'> as LogEntry)

  test('previousMeal finds the most recent earlier day with that meal', async () => {
    await eat(addDays(today, -3), 'old oats')
    await eat(addDays(today, -1), 'eggs')
    await eat(addDays(today, -1), 'toast')
    await eat(addDays(today, -1), 'salad', 'lunch')
    const prev = await previousMeal(today, 'breakfast')
    expect(prev?.date).toBe(addDays(today, -1))
    expect(prev?.entries.map((e) => e.name).sort()).toEqual(['eggs', 'toast'])
  })

  test('copyEntries duplicates into the target day and meal', async () => {
    await eat(addDays(today, -1), 'eggs')
    const prev = (await previousMeal(today, 'breakfast'))!
    await copyEntries(prev.entries, today, 'breakfast')
    expect(await db.logs.where('date').equals(today).count()).toBe(1)
  })

  test('a recipe logs one portion', async () => {
    await eat(today, 'chili pot')
    const entries = await db.logs.where('date').equals(today).toArray()
    const id = await saveMeal('Chili', entries, 4)
    await db.logs.clear()
    await logSavedMeal(id as number, today, 'dinner')
    const [logged] = await db.logs.toArray()
    expect(logged.multiplier).toBe(0.25)
    expect(logged.meal).toBe('dinner')
    expect((await db.meals.get(id as number))?.useCount).toBe(1)
  })
})
