import { localDate, type LogEntry, type LogGroup } from '../db/db'
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
  for (const l of logs) {
    const day = map.get(l.date)
    if (day) day.push(l)
    else map.set(l.date, [l])
  }
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
      if (v.ulAmount != null) s.ulAmount = (s.ulAmount ?? 0) + v.ulAmount
    }
  }
  const intake: Record<string, Intake> = {}
  for (const [id, s] of Object.entries(sums)) {
    intake[id] = { amount: s.amount / logged.length, coverage: s.coverage / logged.length, supplement: s.supplement! / logged.length }
    if (s.ulAmount != null) intake[id].ulAmount = s.ulAmount / logged.length
  }
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
    if (!v || v.coverage === 0) return null
    // A limit of 0 (e.g. alcohol in pregnancy): none is 0%, any amount is over.
    if (n.target === 0) return v.amount > 0 ? Infinity : 0
    return (v.amount / n.target) * 100
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

/**
 * Average daily amount per meal group (breakfast … supplement) over the
 * food-logged days in `dates`, the same days `averageIntake` uses, so the
 * groups add up to the Atlas amount.
 */
export function mealBreakdown(byDate: Map<string, LogEntry[]>, dates: string[], requireFood = true) {
  // The day view shows a supplements-only day too, so it passes requireFood = false.
  const logged = dates.filter((d) => (requireFood ? hasFood(byDate.get(d)) : !!byDate.get(d)?.length))
  const out: Partial<Record<LogGroup, Record<string, number>>> = {}
  for (const d of logged) {
    for (const l of byDate.get(d)!) {
      const g = (out[l.meal] ??= {})
      for (const [id, v] of Object.entries(l.nutrients)) g[id] = (g[id] ?? 0) + (v * l.multiplier) / logged.length
    }
  }
  return out
}

/** Lowest and highest daily % of target across the logged days in `dates`; null with under 2 days of data. */
export function dailyRange(n: Nutrient, byDate: Map<string, LogEntry[]>, dates: string[]) {
  const v = nutrientSeries(n, byDate, dates).filter((x): x is number => x != null && Number.isFinite(x))
  return v.length >= 2 ? { min: Math.min(...v), max: Math.max(...v), days: v.length } : null
}

export interface Bucket {
  start: string
  end: string
  /** Average of the days with data; null when none had data. */
  avg: number | null
  days: number
}

/**
 * Group a daily series into buckets of `size` days (weeks, months), aligned so
 * the last bucket ends on the last date. Days without data (null) are skipped,
 * not counted as zero; an over-a-zero-limit day (Infinity) counts as 200%.
 */
export function bucketAverages(series: (number | null)[], dates: string[], size: number): Bucket[] {
  const out: Bucket[] = []
  for (let end = series.length; end > 0; end -= size) {
    const start = Math.max(0, end - size)
    const vals = series.slice(start, end).filter((v): v is number => v != null).map((v) => (Number.isFinite(v) ? v : 200))
    out.unshift({ start: dates[start], end: dates[end - 1], avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, days: vals.length })
  }
  return out
}
