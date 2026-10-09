import { describe, expect, test } from 'bun:test'
import type { LogEntry } from '../db/db'
import { hasFood, intakeFromLogs } from '../db/logging'
import type { Nutrient } from '../types'
import { addDays, averageIntake, contributors, dailyRange, dateRange, groupByDate, mealBreakdown, nutrientSeries, streakEndingAt } from './history'

let id = 0
const entry = (date: string, nutrients: Record<string, number>, extra: Partial<LogEntry> = {}): LogEntry => ({
  id: ++id,
  date,
  loggedAt: 0,
  meal: 'lunch',
  name: `food ${id}`,
  serving: '1',
  multiplier: 1,
  nutrients,
  ...extra,
})
const pill = (date: string, nutrients: Record<string, number>) => entry(date, nutrients, { meal: 'supplement', supplementId: 1, name: 'pill' })

describe('dates', () => {
  test('addDays crosses months and years', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  test('dateRange ends at the given day, oldest first', () => {
    expect(dateRange('2026-09-21', 3)).toEqual(['2026-09-19', '2026-09-20', '2026-09-21'])
  })
})

describe('intakeFromLogs', () => {
  test('sums amounts × servings; coverage is the share of foods reporting', () => {
    const i = intakeFromLogs([entry('d', { iron: 2, vitC: 10 }, { multiplier: 2 }), entry('d', { iron: 1 })])
    expect(i.iron).toEqual({ amount: 5, coverage: 1, supplement: 0 })
    expect(i.vitC.amount).toBe(20)
    expect(i.vitC.coverage).toBe(0.5)
  })

  test('supplements add to amounts but never lower coverage of other nutrients', () => {
    const i = intakeFromLogs([entry('d', { protein: 20 }), pill('d', { vitD: 50 })])
    expect(i.protein.coverage).toBe(1)
    expect(i.vitD.amount).toBe(50)
    expect(i.vitD.supplement).toBe(50)
    expect(i.vitD.coverage).toBe(0.5) // supplement known, food unknown → partial
  })

  test('a supplements-only day has full coverage for what the pill reports', () => {
    expect(intakeFromLogs([pill('d', { vitD: 50 })]).vitD.coverage).toBe(1)
  })

  test('is computed once per log array; a new array (e.g. after an edit) is recomputed', () => {
    const day = [entry('d', { iron: 2 })]
    expect(intakeFromLogs(day)).toBe(intakeFromLogs(day))
    const edited = day.map((e) => ({ ...e, multiplier: 3 }))
    expect(intakeFromLogs(edited).iron.amount).toBe(6)
    expect(intakeFromLogs(day).iron.amount).toBe(2)
  })

  test('groupByDate keeps entry order within a day', () => {
    const [a, b, c] = [entry('d1', {}), entry('d2', {}), entry('d1', {})]
    const map = groupByDate([a, b, c])
    expect(map.get('d1')).toEqual([a, c])
    expect(map.get('d2')).toEqual([b])
  })

  test('hasFood ignores supplement entries', () => {
    expect(hasFood([pill('d', {})])).toBe(false)
    expect(hasFood([pill('d', {}), entry('d', {})])).toBe(true)
    expect(hasFood(undefined)).toBe(false)
  })
})

describe('averageIntake', () => {
  test('skips unlogged and supplements-only days instead of counting them as zero', () => {
    const byDate = groupByDate([entry('2026-09-01', { iron: 10 }), entry('2026-09-03', { iron: 20 }), pill('2026-09-02', { iron: 100 })])
    const { intake, loggedDays } = averageIntake(byDate, dateRange('2026-09-03', 3))
    expect(loggedDays).toBe(2)
    expect(intake.iron.amount).toBe(15)
  })
})

describe('streakEndingAt', () => {
  const byDate = groupByDate([entry('2026-09-18', {}), entry('2026-09-19', {}), entry('2026-09-20', {})])
  test('counts back from a logged day', () => expect(streakEndingAt(byDate, '2026-09-20')).toBe(3))
  test('an unlogged "today" does not break the streak', () => expect(streakEndingAt(byDate, '2026-09-21')).toBe(3))
  test('a gap does', () => expect(streakEndingAt(byDate, '2026-09-22')).toBe(0))
})

describe('nutrientSeries', () => {
  const byDate = groupByDate([entry('2026-09-01', { vitC: 45 }), entry('2026-09-02', { alcohol: 14 }), entry('2026-09-03', {})])
  const vitC = { id: 'vitC', target: 90 } as Nutrient
  test('% of target per day; null when not logged or not reported', () => {
    expect(nutrientSeries(vitC, byDate, ['2026-08-31', '2026-09-01', '2026-09-03'])).toEqual([null, 50, null])
  })
  test('a limit of 0: none is 0%, any amount is over', () => {
    const alcohol = { id: 'alcohol', target: 0 } as Nutrient
    const s = nutrientSeries(alcohol, groupByDate([entry('a', { alcohol: 0 }), entry('b', { alcohol: 14 })]), ['a', 'b'])
    expect(s).toEqual([0, Infinity])
  })
})

describe('contributors', () => {
  test('ranks foods by amount with shares', () => {
    const c = contributors([entry('d', { iron: 3 }, { name: 'lentils' }), entry('d', { iron: 1 }, { name: 'bread' })], 'iron')
    expect(c.map((x) => x.name)).toEqual(['lentils', 'bread'])
    expect(c[0].share).toBe(0.75)
  })
})

describe('itemsKcal', () => {
  test('Atwater factors, including alcohol at 7 kcal/g', async () => {
    const { itemsKcal } = await import('./quickLog')
    expect(itemsKcal([{ multiplier: 2, nutrients: { protein: 10, carbs: 10, fat: 10, alcohol: 14 } }])).toBe(2 * (40 + 40 + 90 + 98))
  })
})

describe('Atlas meal split and daily range', () => {
  const vitC = { id: 'vitC', target: 100 } as Nutrient
  const days = ['2026-09-01', '2026-09-02', '2026-09-03']
  const logs = [
    entry(days[0], { vitC: 40 }, { meal: 'breakfast' }),
    entry(days[0], { vitC: 20 }, { meal: 'dinner', multiplier: 2 }),
    pill(days[0], { vitC: 50 }),
    entry(days[1], { vitC: 30 }, { meal: 'breakfast' }),
    pill(days[2], { vitC: 50 }), // supplement-only day: not a logged day in the week view
  ]
  const byDate = groupByDate(logs)

  test('meal groups average over logged days and add up to the Atlas amount', () => {
    const m = mealBreakdown(byDate, days)
    expect(m.breakfast!.vitC).toBe(35)
    expect(m.dinner!.vitC).toBe(20)
    expect(m.supplement!.vitC).toBe(25)
    const total = Object.values(m).reduce((a, g) => a + (g!.vitC ?? 0), 0)
    expect(total).toBeCloseTo(averageIntake(byDate, days).intake.vitC.amount)
  })

  test('the day view can split a supplements-only day', () => {
    expect(mealBreakdown(byDate, [days[2]])).toEqual({})
    expect(mealBreakdown(byDate, [days[2]], false).supplement!.vitC).toBe(50)
  })

  test('daily range spans the lowest and highest logged day', () => {
    expect(dailyRange(vitC, byDate, days)).toEqual({ min: 30, max: 130, days: 2 })
    expect(dailyRange(vitC, byDate, [days[1]])).toBeNull() // one day is not a range
  })
})
