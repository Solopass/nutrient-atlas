import { describe, expect, test } from 'bun:test'
import type { LogEntry } from '../db/db'
import { cell, dailyTotalsCsv, entriesCsv } from './csv'
import { dateRange } from './history'
import { weeklyReport } from './insights'
import { LAB_BY_ID, LAB_FOR_NUTRIENT, labBand, labHistory, monthsSince, readLab, removeLabResult, toCanonical, upsertLabResult, validLabValue } from './labs'
import { DEFAULT_PROFILE, type Profile } from './profile'
import { nutrientState } from './status'
import { personalize } from './targets'

const nutrients = personalize(DEFAULT_PROFILE)
const byId = new Map(nutrients.map((n) => [n.id, n]))
const vitD = LAB_BY_ID.get('vitD')!
const ferritin = LAB_BY_ID.get('ferritin')!
const b12 = LAB_BY_ID.get('b12')!
const TODAY = '2026-09-20'
const state = (id: string, pctOfTarget: number | null) => nutrientState(byId.get(id)!, pctOfTarget == null ? undefined : { amount: (byId.get(id)!.target! * pctOfTarget) / 100, coverage: 1 })

describe('lab values', () => {
  test('unit conversion to canonical', () => {
    expect(toCanonical(vitD, { value: 50, unit: 'nmol/L' })).toBeCloseTo(20.03, 1)
    expect(toCanonical(b12, { value: 148, unit: 'pmol/L' })).toBeCloseTo(200.5, 0)
    expect(toCanonical(ferritin, { value: 40, unit: 'µg/L' })).toBe(40)
  })

  test('bands, including sex-specific ferritin upper edge', () => {
    expect(labBand(vitD, 10, DEFAULT_PROFILE)).toBe('deficient')
    expect(labBand(vitD, 15, DEFAULT_PROFILE)).toBe('low')
    expect(labBand(vitD, 30, DEFAULT_PROFILE)).toBe('ok')
    expect(labBand(vitD, 70, DEFAULT_PROFILE)).toBe('high')
    expect(labBand(ferritin, 180, { sex: 'female' })).toBe('high')
    expect(labBand(ferritin, 180, { sex: 'male' })).toBe('ok')
    expect(labBand(b12, 5000, DEFAULT_PROFILE)).toBe('ok') // no "high" band for B12
  })

  test('low blood level with good intake points at absorption, not diet', () => {
    const r = readLab(b12, { value: 180, unit: 'pg/mL', date: TODAY }, state('b12', 150), DEFAULT_PROFILE, TODAY)
    expect(r.band).toBe('deficient')
    expect(r.headline).toContain('even though intake is on target')
    expect(r.advice).toMatch(/absorption/)
  })

  test('low blood level and low intake agree', () => {
    const r = readLab(ferritin, { value: 20, unit: 'ng/mL', date: TODAY }, state('iron', 50), { sex: 'female' }, TODAY)
    expect(r.band).toBe('low')
    expect(r.headline).toContain('50% of target')
  })

  test('staleness and sanity checks', () => {
    expect(monthsSince('2025-09-21', TODAY)).toBe(11)
    expect(monthsSince('2025-09-20', TODAY)).toBe(12)
    expect(readLab(vitD, { value: 30, unit: 'ng/mL', date: '2024-01-01' }, null, DEFAULT_PROFILE, TODAY).stale).toBe(true)
    expect(validLabValue(vitD, 0, 'ng/mL')).toBe(false)
    expect(validLabValue(vitD, 30, 'ng/mL')).toBe(true)
    expect(validLabValue(vitD, 5000, 'ng/mL')).toBe(false)
  })

  test('weekly report: a low lab replaces the plain intake gap', () => {
    let id = 0
    const base = Object.fromEntries(nutrients.filter((n) => n.target != null).map((n) => [n.id, n.category === 'limit' ? n.target! * 0.5 : n.target!]))
    const logs = dateRange(TODAY, 7).map((date): LogEntry => ({ id: ++id, date, loggedAt: 0, meal: 'lunch', name: 'meal', serving: '1', multiplier: 1, nutrients: { ...base, iron: 3, epa: 200, dha: 300 } }))
    const run = (p: Partial<Profile>) => {
      const profile = { ...DEFAULT_PROFILE, ...p }
      return weeklyReport({ nutrients: personalize(profile), logs, end: TODAY, profile, supplements: [], usda: null }).insights.map((i) => i.id)
    }
    expect(run({})).toContain('gap-iron')
    const withLab = run({ labs: { ferritin: { value: 10, unit: 'ng/mL', date: TODAY } } })
    expect(withLab).toContain('lab-ferritin')
    expect(withLab).not.toContain('gap-iron')
    expect(run({ labs: { vitD: { value: 35, unit: 'ng/mL', date: TODAY } } }).some((i) => i.startsWith('lab-'))).toBe(false)
  })
})

describe('CSV export', () => {
  const entry = (p: Partial<LogEntry>): LogEntry => ({ id: 1, date: '2026-09-19', loggedAt: new Date('2026-09-19T08:05:00').getTime(), meal: 'breakfast', name: 'Oats', serving: '40 g', multiplier: 1, nutrients: {}, ...p })

  test('escaping and formula defusing', () => {
    expect(cell('Oats, rolled')).toBe('"Oats, rolled"')
    expect(cell('12" pizza')).toBe('"12"" pizza"')
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(cell(-3)).toBe('-3')
    expect(cell(null)).toBe('')
    expect(cell(1 / 3)).toBe('0.333')
  })

  test('daily totals: sums per day, target row, missing is empty not zero', () => {
    const logs = [
      entry({ nutrients: { protein: 10, carbs: 20, vitC: 5 } }),
      entry({ id: 2, name: 'Egg', multiplier: 2, nutrients: { protein: 6, fat: 5 } }),
      entry({ id: 3, date: '2026-09-20', meal: 'supplement', supplementId: 1, name: 'D3', nutrients: { vitD: 25 } }),
    ]
    const lines = dailyTotalsCsv(logs, nutrients).replace('﻿', '').trim().split('\r\n')
    const head = lines[0].split(',')
    const col = (name: string) => head.indexOf(name)
    expect(lines[1].split(',')[0]).toBe('Daily target')
    const d1 = lines[2].split(',')
    expect(d1[0]).toBe('2026-09-19')
    expect(d1[col('Protein (g)')]).toBe('22')
    expect(d1[col('Energy (kcal)')]).toBe(String(22 * 4 + 20 * 4 + 10 * 9))
    expect(d1[col('Vitamin D (mcg)')]).toBe('') // nothing reported it
    const d2 = lines[3].split(',')
    expect([d2[1], d2[2]]).toEqual(['0', '1']) // supplement-only day
    expect(d2[col('Score (%)')]).toBe('')
    expect(d2[col('Vitamin D (mcg)')]).toBe('25')
  })

  test('entries: amounts scaled by servings eaten, sorted by time', () => {
    const logs = [entry({ id: 2, loggedAt: entry({}).loggedAt + 1000, name: 'Egg', multiplier: 2, nutrients: { protein: 6 } }), entry({ nutrients: { protein: 10 } })]
    const lines = entriesCsv(logs, nutrients).replace('﻿', '').trim().split('\r\n')
    const col = lines[0].split(',').indexOf('Protein (g)')
    expect(lines[1].split(',').slice(0, 7)).toEqual(['2026-09-19', '08:05', 'breakfast', 'Oats', '40 g', '1', 'food'])
    expect(lines[2].split(',')[col]).toBe('12')
  })
})

describe('lab history', () => {
  const r = (date: string, value: number, unit = 'ng/mL') => ({ date, value, unit })
  test('older profiles: the single latest result is the history', () => {
    expect(labHistory({ labs: { vitD: r('2026-01-01', 20) } }, 'vitD')).toEqual([r('2026-01-01', 20)])
    expect(labHistory({ labs: {} }, 'vitD')).toEqual([])
  })
  test('upsert adds by date, replaces the edited entry, keeps order, reports the latest', () => {
    let { history, latest } = upsertLabResult([], r('2026-03-01', 18))
    ;({ history, latest } = upsertLabResult(history, r('2026-01-01', 12)))
    expect(history.map((x) => x.date)).toEqual(['2026-01-01', '2026-03-01'])
    expect(latest.value).toBe(18)
    // Editing the March entry's date to April moves it rather than adding a third.
    ;({ history, latest } = upsertLabResult(history, r('2026-04-01', 31), '2026-03-01'))
    expect(history.map((x) => `${x.date}:${x.value}`)).toEqual(['2026-01-01:12', '2026-04-01:31'])
    expect(removeLabResult(history, '2026-04-01').latest!.value).toBe(12)
    expect(removeLabResult([r('2026-01-01', 1)], '2026-01-01').latest).toBeNull()
  })
  test('new tests: folate, magnesium (mmol/L), omega-3 index', () => {
    const p = DEFAULT_PROFILE
    expect(labBand(LAB_BY_ID.get('folate')!, toCanonical(LAB_BY_ID.get('folate')!, { value: 5.5, unit: 'nmol/L' }), p)).toBe('deficient') // 2.4 ng/mL
    expect(labBand(LAB_BY_ID.get('magnesium')!, toCanonical(LAB_BY_ID.get('magnesium')!, { value: 0.85, unit: 'mmol/L' }), p)).toBe('ok') // 2.07 mg/dL
    expect(labBand(LAB_BY_ID.get('magnesium')!, 1.7, p)).toBe('low')
    expect(labBand(LAB_BY_ID.get('omega3')!, 5.2, p)).toBe('low')
    expect(labBand(LAB_BY_ID.get('omega3')!, 9, p)).toBe('ok')
    expect(LAB_FOR_NUTRIENT.get('epa')?.id).toBe('omega3')
  })
  test('magnesium: a normal level with low intake explains that blood levels hide shortfalls', () => {
    const mg = LAB_BY_ID.get('magnesium')!
    const r2 = readLab(mg, { value: 2.1, unit: 'mg/dL', date: TODAY }, state('magnesium', 50), DEFAULT_PROFILE, TODAY)
    expect(r2.advice).toMatch(/can miss a shortfall/)
  })
})
