import { beforeEach, describe, expect, test } from 'bun:test'
import { db, localDate, type LogEntry } from '../db/db'
import { saveProfile } from '../state/profile'
import { addDays } from './history'
import type { Profile } from './profile'
import { copyEntries, logSavedMeal, previousMeal, saveMeal } from './quickLog'
import { foodStreak } from './streak'
import { loadSampleData, removeSampleData } from './sampleData'
import { usdaDb } from '../test/usdaFixture'
import { applyDailySupplements, createSupplement, pauseSupplement, resumeSupplement, setTaken, updateSupplement } from './supplements'

const today = localDate()
const D3 = { name: 'Vitamin D3', dose: '1 softgel', nutrients: { vitD: 50 }, dosesPerDay: 1, schedule: 'daily' as const }

beforeEach(async () => {
  await Promise.all([db.logs.clear(), db.supplements.clear(), db.meals.clear(), db.foods.clear()])
})

const suppLogs = () => db.logs.filter((l) => l.supplementId != null).toArray()

describe('profile saves', () => {
  test('quick successive changes are all kept', async () => {
    await db.settings.clear()
    await Promise.all([saveProfile({ goal: 'muscle' }), saveProfile({ diet: 'vegan' }), saveProfile({ age: 41 })])
    const p = (await db.settings.get('profile'))!.value as Profile
    expect([p.goal, p.diet, p.age]).toEqual(['muscle', 'vegan', 41])
  })
})

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

  test('switching an old as-needed supplement to daily starts today, without back-filling', async () => {
    const id = await createSupplement({ ...D3, schedule: 'asNeeded' })
    await db.supplements.update(id, { startDate: addDays(today, -30) }) // created a month ago
    await updateSupplement(id, { ...D3, schedule: 'daily' })
    expect((await suppLogs()).map((l) => l.date)).toEqual([today])
  })

  test('as-needed supplements are never auto-logged', async () => {
    await createSupplement({ ...D3, schedule: 'asNeeded' })
    await applyDailySupplements()
    expect(await suppLogs()).toEqual([])
  })
})

describe('sample data', () => {
  test('loading twice does not duplicate', async () => {
    const usda = await usdaDb()
    const first = await loadSampleData(usda)
    const second = await loadSampleData(usda)
    expect(first).toBeGreaterThan(100)
    expect(second).toBe(0)
    expect(await db.logs.count()).toBe(first)
    expect(await removeSampleData()).toBe(first)
  })

  test('two loads at the same moment (double tap, React StrictMode) load once', async () => {
    const usda = await usdaDb()
    const [a, b] = await Promise.all([loadSampleData(usda), loadSampleData(usda)])
    expect(Math.min(a, b)).toBe(0)
    expect(await db.logs.count()).toBe(Math.max(a, b))
  })
})

describe('foodStreak', () => {
  const eatOn = (date: string) => db.logs.add({ date, loggedAt: 0, meal: 'lunch', name: 'x', serving: '1', multiplier: 1, nutrients: {} } as Omit<LogEntry, 'id'> as LogEntry)
  test('long streaks are not capped by a loading window', async () => {
    for (let i = 1; i <= 130; i++) await eatOn(addDays(today, -i))
    expect(await foodStreak(today)).toBe(130) // today not logged yet: doesn't break it
  })
  test('stops at the first gap', async () => {
    for (const i of [0, 1, 2, 4, 5]) await eatOn(addDays(today, -i))
    expect(await foodStreak(today)).toBe(3)
  })
  test('supplement-only days do not count', async () => {
    await eatOn(addDays(today, -1))
    await db.logs.add({ date: addDays(today, -2), loggedAt: 0, meal: 'supplement', supplementId: 1, name: 'pill', serving: '1', multiplier: 1, nutrients: {} } as Omit<LogEntry, 'id'> as LogEntry)
    await eatOn(addDays(today, -3))
    expect(await foodStreak(today)).toBe(1)
  })
  test('no logs → 0', async () => {
    expect(await foodStreak(today)).toBe(0)
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

describe('backup', () => {
  test('export → restore round-trips every table and replaces what was there', async () => {
    const { makeBackup, readBackup, restoreBackup, describeBackup } = await import('./backup')
    await db.settings.put({ key: 'profile', value: { age: 27 } })
    await createSupplement(D3)
    await db.products.add({ kind: 'supplement', brand: 'B', name: 'Mag', serving: '1', nutrients: { magnesium: 200 }, source: 'manual', createdAt: 0, updatedAt: 0 } as never)
    const snap = await makeBackup()
    const file = new File([JSON.stringify(snap)], 'b.json')
    await db.logs.add({ date: today, loggedAt: 0, meal: 'lunch', name: 'extra', serving: '1', multiplier: 1, nutrients: {} } as Omit<LogEntry, 'id'> as LogEntry)
    const data = await readBackup(file)
    expect(describeBackup(data)).toContain('1 supplements')
    await restoreBackup(data)
    expect((await db.logs.toArray()).map((l) => l.name)).not.toContain('extra') // the extra entry is gone
    expect((await db.products.toArray()).map((p) => p.name)).toEqual(['Mag'])
    expect((await db.settings.get('profile'))?.value).toEqual({ age: 27 })
  })
  test('rejects files that are not backups', async () => {
    const { readBackup } = await import('./backup')
    await expect(readBackup(new File(['not json'], 'x.json'))).rejects.toThrow(/isn't/)
    await expect(readBackup(new File([JSON.stringify({ app: 'other' })], 'x.json'))).rejects.toThrow(/isn't/)
  })
})

describe('saveLab keeps history and the latest result in step', () => {
  test('add, add newer, edit, remove', async () => {
    const { saveLab } = await import('../state/profile')
    await db.settings.clear()
    await saveLab('vitD', { result: { value: 18, unit: 'ng/mL', date: '2026-03-01' } })
    await saveLab('vitD', { result: { value: 31, unit: 'ng/mL', date: '2026-09-01' } })
    await saveLab('vitD', { result: { value: 33, unit: 'ng/mL', date: '2026-09-02' }, replaceDate: '2026-09-01' })
    let p = (await db.settings.get('profile'))!.value as Profile
    expect(p.labHistory!.vitD!.map((r) => `${r.date}:${r.value}`)).toEqual(['2026-03-01:18', '2026-09-02:33'])
    expect(p.labs.vitD!.value).toBe(33)
    await saveLab('vitD', { removeDate: '2026-09-02' })
    p = (await db.settings.get('profile'))!.value as Profile
    expect(p.labs.vitD!.value).toBe(18)
    await saveLab('vitD', { removeDate: '2026-03-01' })
    p = (await db.settings.get('profile'))!.value as Profile
    expect(p.labs.vitD).toBeUndefined()
    expect(p.labHistory?.vitD).toBeUndefined()
  })
})
