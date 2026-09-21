import { localDate, type LogEntry } from '../db/db'
import { hasFood, intakeFromLogs } from '../db/logging'
import type { Intake, Nutrient } from '../types'
import { dayScore, nutrientState } from './status'

// ── Dates (local, YYYY-MM-DD) ─────────────────────────────────────
export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: string, n: number) {
  const d = parseDate(date)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

/** `days` dates ending at `end`, oldest first. */
export function dateRange(end: string, days: number) {
  return Array.from({ length: days }, (_, i) => addDays(end, i - days + 1))
}

export const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime())

export function formatDay(date: string, style: 'long' | 'short' = 'long') {
  const today = localDate()
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return parseDate(date).toLocaleDateString(undefined, style === 'long' ? { weekday: 'long', month: 'long', day: 'numeric' } : { month: 'short', day: 'numeric' })
}

// ── Aggregation ───────────────────────────────────────────────────
export function groupByDate(logs: LogEntry[]) {
  const map = new Map<string, LogEntry[]>()
  for (const l of logs) map.set(l.date, [...(map.get(l.date) ?? []), l])
  return map
}

/**
 * Average daily intake over the days in `dates` that have any logs.
 * Unlogged days are skipped, not counted as zero: a forgotten day isn't a day of fasting.
 * Coverage is averaged per logged day, so a nutrient missing on some days reads as partial.
 */
export function averageIntake(byDate: Map<string, LogEntry[]>, dates: string[]) {
  const logged = dates.filter((d) => hasFood(byDate.get(d)))
  const sums: Record<string, Intake> = {}
  for (const d of logged) {
    for (const [id, v] of Object.entries(intakeFromLogs(byDate.get(d)!))) {
      const s = (sums[id] ??= { amount: 0, coverage: 0, supplement: 0 })
      s.amount += v.amount
      s.coverage += v.coverage
      s.supplement! += v.supplement ?? 0
    }
  }
  const intake: Record<string, Intake> = {}
  for (const [id, s] of Object.entries(sums)) intake[id] = { amount: s.amount / logged.length, coverage: s.coverage / logged.length, supplement: s.supplement! / logged.length }
  return { intake, loggedDays: logged.length }
}

export function scoreForLogs(nutrients: Nutrient[], logs: LogEntry[] | undefined): number | null {
  if (!hasFood(logs)) return null
  const intake = intakeFromLogs(logs!)
  return dayScore(nutrients.map((n) => nutrientState(n, intake[n.id]))).score
}

/** % of target for one nutrient per date; null for unlogged days or missing data. */
export function nutrientSeries(n: Nutrient, byDate: Map<string, LogEntry[]>, dates: string[]) {
  return dates.map((d) => {
    const logs = byDate.get(d)
    if (!hasFood(logs) || n.target == null) return null
    const v = intakeFromLogs(logs!)[n.id]
    return v && v.coverage > 0 ? (v.amount / n.target) * 100 : null
  })
}

/** Which foods supplied a nutrient across these logs, largest first. */
export function contributors(logs: LogEntry[], nutrientId: string) {
  const byName = new Map<string, number>()
  for (const l of logs) {
    const v = l.nutrients[nutrientId]
    if (v) byName.set(l.name, (byName.get(l.name) ?? 0) + v * l.multiplier)
  }
  const total = [...byName.values()].reduce((a, b) => a + b, 0)
  return [...byName.entries()]
    .map(([name, amount]) => ({ name, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/** Consecutive logged days ending at `end`. If `end` itself isn't logged yet, count from the day before (today in progress). */
export function streakEndingAt(byDate: Map<string, LogEntry[]>, end: string) {
  let d = hasFood(byDate.get(end)) ? end : addDays(end, -1)
  let n = 0
  while (hasFood(byDate.get(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/** Dashboard link for a date (today has the bare route). */
export const dayHref = (date: string) => (date === localDate() ? '#/' : `#/day/${date}`)
