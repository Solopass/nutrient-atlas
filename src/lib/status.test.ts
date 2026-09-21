import { describe, expect, test } from 'bun:test'
import { NUTRIENTS } from '../data/nutrients'
import type { Intake, Nutrient } from '../types'
import { dayScore, nutrientState } from './status'
import type { LogEntry } from '../db/db'
import { intakeFromLogs } from '../db/logging'
import { averageIntake, groupByDate } from './history'

const n = (id: string, patch: Partial<Nutrient> = {}) => ({ ...NUTRIENTS.find((x) => x.id === id)!, ...patch })
const has = (amount: number, coverage = 1, supplement?: number): Intake => ({ amount, coverage, supplement })

describe('nutrientState', () => {
  const vitC = n('vitC', { target: 100, upperLimit: 2000 })

  test.each([
    [0, 'deficient'],
    [49, 'deficient'],
    [50, 'attention'],
    [79, 'attention'],
    [80, 'good'],
    [120, 'good'],
    [121, 'above'],
  ])('%p%% → %p', (pct, status) => {
    expect(nutrientState(vitC, has(pct)).status).toBe(status as never)
  })

  test('missing intake or zero coverage is "no data", never deficient', () => {
    expect(nutrientState(vitC, undefined).status).toBe('noData')
    expect(nutrientState(vitC, has(0, 0)).status).toBe('noData')
  })

  test('coverage under 60% is flagged partial', () => {
    expect(nutrientState(vitC, has(90, 0.5)).partial).toBe(true)
    expect(nutrientState(vitC, has(90, 0.8)).partial).toBe(false)
  })

  test('over the upper limit beats "above target"', () => {
    expect(nutrientState(vitC, has(2500)).status).toBe('overLimit')
  })

  test('no official target shows the amount only', () => {
    const s = nutrientState(n('epa'), has(300))
    expect(s.status).toBe('noTarget')
    expect(s.pct).toBeNull()
  })

  test('supplement-only UL ignores food intake', () => {
    const mg = n('magnesium', { target: 400 })
    expect(nutrientState(mg, has(600, 1, 0)).status).toBe('above') // all from food: fine
    expect(nutrientState(mg, has(600, 1, 400)).status).toBe('overLimit') // 400 mg from supplements > 350
  })

  test('folic acid UL compares supplement DFE ÷ 1.7', () => {
    const b9 = n('b9', { target: 400 })
    expect(nutrientState(b9, has(2000, 1, 1600)).status).not.toBe('overLimit') // 1600 DFE ≈ 941 mcg folic acid
    expect(nutrientState(b9, has(2000, 1, 1800)).status).toBe('overLimit') // ≈ 1059
  })
})

describe('limits ("stay under")', () => {
  const sodium = n('sodium', { target: 2000 })
  test.each([
    [1000, 'good'],
    [1600, 'good'],
    [1700, 'attention'],
    [2000, 'attention'],
    [2100, 'overLimit'],
  ])('%p mg of 2000 → %p', (amount, status) => {
    expect(nutrientState(sodium, has(amount)).status).toBe(status as never)
  })

  test('a limit of 0 means any amount is over', () => {
    const alcohol = n('alcohol', { target: 0 })
    expect(nutrientState(alcohol, has(0)).status).toBe('good')
    expect(nutrientState(alcohol, has(5)).status).toBe('overLimit')
  })
})

describe('dayScore', () => {
  test('averages categories, so many amino acids cannot outweigh vitamins', () => {
    const states = NUTRIENTS.filter((x) => ['vitamin', 'amino'].includes(x.category)).map((x) =>
      nutrientState(x, has(x.category === 'amino' ? (x.target ?? 1) * 1.0 : 0)),
    )
    // amino acids all met (100%), vitamins all deficient (0%) → 50, not 9/14
    expect(Math.round(dayScore(states).score)).toBe(50)
  })

  test('limits and no-data nutrients are not scored', () => {
    const states = [nutrientState(n('vitC', { target: 90 }), has(90)), nutrientState(n('sodium'), has(9000)), nutrientState(n('vitD'), undefined)]
    const s = dayScore(states)
    expect(s.score).toBe(100)
    expect(s.tracked.total).toBe(1)
  })
})

describe('vitamin A upper limit counts preformed vitamin A only', () => {
  const vitA = n('vitA')
  let id = 0
  const item = (nutrients: Record<string, number>, extra: Partial<LogEntry> = {}): LogEntry => ({
    id: ++id, date: '2026-09-20', loggedAt: 0, meal: 'lunch', name: `f${id}`, serving: '1', multiplier: 1, nutrients, ...extra,
  })
  const state = (logs: LogEntry[]) => nutrientState(vitA, intakeFromLogs(logs).vitA)

  test('a big day of carrots and sweet potato is above target, not over the limit', () => {
    expect(state([item({ vitA: 2500, retinol: 0 }), item({ vitA: 1500, retinol: 0 })]).status).toBe('above')
  })
  test('liver is over the limit', () => {
    expect(state([item({ vitA: 5000, retinol: 4950 })]).status).toBe('overLimit')
  })
  test('supplement vitamin A counts in full; food without retinol data counts as plant form', () => {
    const s = state([item({ vitA: 1000 }), item({ vitA: 2500 }, { meal: 'supplement', supplementId: 1 }), item({ vitA: 600, retinol: 600 }, { multiplier: 2 })])
    expect(s.intake!.ulAmount).toBe(2500 + 1200)
    expect(s.status).toBe('overLimit')
  })
  test('weekly averages keep the UL amount', () => {
    const logs = [item({ vitA: 4000, retinol: 3200 }, { date: '2026-09-19' }), item({ vitA: 4000, retinol: 0 }, { date: '2026-09-20' })]
    const { intake } = averageIntake(groupByDate(logs), ['2026-09-19', '2026-09-20'])
    expect(intake.vitA.ulAmount).toBe(1600)
    expect(nutrientState(vitA, intake.vitA).status).toBe('above')
  })
})
