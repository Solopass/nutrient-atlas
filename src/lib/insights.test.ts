import { describe, expect, test } from 'bun:test'
import type { LogEntry, Supplement } from '../db/db'
import { weeklyReport } from './insights'
import { DEFAULT_PROFILE, type Profile } from './profile'
import { personalize } from './targets'
import { dateRange } from './history'

const END = '2026-09-20'
let id = 0
const food = (date: string, meal: LogEntry['meal'], name: string, nutrients: Record<string, number>): LogEntry => ({
  id: ++id, date, loggedAt: 0, meal, name, serving: '1', multiplier: 1, nutrients,
})

/** A full "normal" day at ~100% of every target, with overrides. */
function days(n: number, overrides: Record<string, number> = {}, name = 'mixed meal') {
  const t = personalize(DEFAULT_PROFILE)
  const base = Object.fromEntries(t.filter((x) => x.target != null).map((x) => [x.id, x.category === 'limit' ? x.target! * 0.5 : x.target!]))
  return dateRange(END, n).map((d) => food(d, 'lunch', name, { ...base, epa: 200, dha: 300, ...overrides }))
}

const report = (logs: LogEntry[], profile: Partial<Profile> = {}, supplements: Supplement[] = []) => {
  const p = { ...DEFAULT_PROFILE, ...profile }
  return weeklyReport({ nutrients: personalize(p), logs, end: END, profile: p, supplements, usda: null })
}
const ids = (r: ReturnType<typeof report>) => r.insights.map((i) => i.id)

describe('weekly insights', () => {
  test('nothing logged → no insights', () => {
    expect(report([]).insights).toEqual([])
  })

  test('a balanced week produces no gaps, limits or risks', () => {
    expect(ids(report(days(7))).filter((i) => /^(gap|limit|risk)/.test(i))).toEqual([])
  })

  test('few logged days → consistency tip', () => {
    expect(ids(report(days(2)))).toContain('consistency')
  })

  test('persistent gap is reported with its average', () => {
    const r = report(days(7, { vitE: 3 })) // 20% of 15 mg
    const gap = r.insights.find((i) => i.id === 'gap-vitE')
    expect(gap?.title).toBe('Vitamin E: 20% average')
    expect(gap?.body).toContain('7 of 7')
  })

  test('limit over on average names the biggest source', () => {
    const r = report(days(7, { sodium: 4000 }, 'Pizza, cheese'))
    const lim = r.insights.find((i) => i.id === 'limit-sodium')
    expect(lim?.title).toMatch(/Sodium averaged \d+% of your limit/)
    expect(lim?.body).toContain('Pizza')
  })

  test('vegan B12 risk, unless a supplement covers it', () => {
    const logs = days(7, { b12: 0.2 })
    expect(report(logs, { diet: 'vegan' }).insights.find((i) => i.id === 'risk')?.nutrientIds).toContain('b12')
    const b12Pill = { id: 1, name: 'B12', dose: '1', nutrients: { b12: 1000 }, dosesPerDay: 1, schedule: 'daily', active: 1, startDate: END, createdAt: 0 } as Supplement
    expect(report(logs, { diet: 'vegan' }, [b12Pill]).insights.find((i) => i.id === 'risk')?.nutrientIds ?? []).not.toContain('b12')
  })

  test('omnivores get no diet-risk insight', () => {
    expect(ids(report(days(7, { b12: 0.2 })))).not.toContain('risk')
  })

  test('plant iron without vitamin C → pairing tip with a real meal', () => {
    const logs = days(7, { iron: 4 }).map((l) => ({ ...l, name: 'Lentils, cooked', nutrients: { ...l.nutrients, vitC: 5 } }))
    const tip = report(logs).insights.find((i) => i.id === 'iron-c')
    expect(tip?.body).toContain('lentils')
  })

  test('score change vs last week', () => {
    const lastWeek = dateRange('2026-09-13', 7).map((d) => days(1)[0] && food(d, 'lunch', 'x', days(1)[0].nutrients))
    const thisWeek = days(7, { vitA: 0, vitC: 0, vitD: 0, vitE: 0, vitK: 0 })
    const r = report([...lastWeek, ...thisWeek])
    expect(r.insights.find((i) => i.id === 'score')?.title).toMatch(/down/)
  })
})
