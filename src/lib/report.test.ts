import { describe, expect, test } from 'bun:test'
import type { LogEntry, Supplement } from '../db/db'
import { groupByDate } from './history'
import { DEFAULT_PROFILE } from './profile'
import { clinicianReport } from './report'
import { personalize } from './targets'

const nutrients = personalize(DEFAULT_PROFILE) // male, 30: iron 8 mg, vitamin C 90 mg, sodium limit 2300 mg
let id = 0
const food = (date: string, n: Record<string, number>, extra: Partial<LogEntry> = {}): LogEntry =>
  ({ id: ++id, date, loggedAt: 0, meal: 'lunch', name: `food ${id}`, serving: '1', multiplier: 1, nutrients: n, ...extra }) as LogEntry
const pill = (date: string, n: Record<string, number>) => food(date, n, { meal: 'supplement', supplementId: 1, name: 'pill' })

describe('clinician report', () => {
  const logs = [
    food('2026-10-01', { iron: 4, vitC: 100, sodium: 3000 }),
    food('2026-10-02', { iron: 4, vitC: 100, sodium: 2000 }),
    pill('2026-10-02', { vitC: 1000 }),
    food('2026-10-03', { iron: 4, vitC: 100, sodium: 1000 }),
  ]
  const r = clinicianReport({ nutrients, byDate: groupByDate(logs), end: '2026-10-03', days: 30, supplements: [] })
  const get = (nid: string) => [...r.rows.values(), r.limits].flat().find((x) => x.state.nutrient.id === nid)!

  test('averages over logged days only, and counts low days with data', () => {
    expect(r.loggedDays).toBe(3)
    expect(r.dates).toHaveLength(30)
    expect(get('iron').amount).toBeCloseTo(4)
    expect(get('iron').flaggedDays).toBe(3)
    expect(get('iron').dataDays).toBe(3)
  })

  test('gaps are scored nutrients under 80% with enough data, lowest first', () => {
    expect(r.gaps.map((g) => g.state.nutrient.id)).toContain('iron')
    expect(r.gaps.some((g) => g.state.nutrient.id === 'vitC')).toBe(false)
    const pcts = r.gaps.map((g) => g.state.pct!)
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts)
  })

  test('supplement share and the upper limit', () => {
    expect(get('vitC').fromSupplements).toBeCloseTo(1000 / 1300)
    expect(get('vitC').amount).toBeCloseTo(1300 / 3)
    expect(get('vitC').overUL).toBe(false) // UL is 2000 mg
  })

  test('limits count days over, and averages over the limit are flagged', () => {
    expect(get('sodium').flaggedDays).toBe(1)
    expect(r.overLimits).toHaveLength(0) // 2000 mg average < 2300
  })

  test('supplements list per-day amounts against target and upper limit', () => {
    const s = { id: 1, name: 'Mag', dose: '1 capsule', nutrients: { magnesium: 200 }, dosesPerDay: 2, schedule: 'daily', active: 1, startDate: '2026-01-01', createdAt: 0 } as Supplement
    const off = { ...s, id: 2, active: 0 } as Supplement
    const rep = clinicianReport({ nutrients, byDate: new Map(), end: '2026-10-03', days: 30, supplements: [s, off] })
    expect(rep.supplements).toHaveLength(1)
    const mg = rep.supplements[0].perDay[0]
    expect(mg.amount).toBe(400)
    expect(mg.pctUL).toBeCloseTo((400 / 350) * 100) // supplemental magnesium UL 350 mg
    expect(rep.supplementsOverUL).toMatchObject([{ s: { name: 'Mag' }, n: { id: 'magnesium' } }])
    expect(rep.loggedDays).toBe(0)
  })
})
