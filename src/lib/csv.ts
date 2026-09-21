import type { LogEntry } from '../db/db'
import { hasFood, intakeFromLogs } from '../db/logging'
import type { Nutrient } from '../types'
import { groupByDate, scoreForLogs } from './history'
import { kcalOf } from './quickLog'

/**
 * Spreadsheet exports. Missing stays missing: a nutrient no logged item
 * reports is an empty cell, never 0, so averages in Excel/Sheets aren't dragged down.
 */

/** Quote when needed; defuse text starting with = + - @ so spreadsheets don't run it as a formula. */
export function cell(v: string | number | null | undefined) {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return ''
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000)
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (rows: (string | number | null | undefined)[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

const header = (n: Nutrient) => `${n.name} (${n.unit})`

/** One row per day that has any entries, oldest first, with daily totals. */
export function dailyTotalsCsv(logs: LogEntry[], nutrients: Nutrient[]) {
  const byDate = groupByDate(logs)
  const dates = [...byDate.keys()].sort()
  const rows: (string | number | null)[][] = [
    ['Date', 'Food entries', 'Supplement doses', 'Energy (kcal)', 'Score (%)', ...nutrients.map(header)],
    ['Daily target', null, null, null, null, ...nutrients.map((n) => n.target)],
  ]
  for (const d of dates) {
    const day = byDate.get(d)!
    const intake = intakeFromLogs(day)
    const foods = day.filter((l) => l.supplementId == null)
    const kcal = foods.some((l) => ['protein', 'carbs', 'fat'].some((k) => l.nutrients[k] != null))
      ? day.reduce((a, l) => a + kcalOf(l.nutrients) * l.multiplier, 0)
      : null
    rows.push([
      d,
      foods.length,
      day.length - foods.length,
      kcal == null ? null : Math.round(kcal),
      hasFood(day) ? Math.round(scoreForLogs(nutrients, day)!) : null,
      ...nutrients.map((n) => (intake[n.id] ? intake[n.id].amount : null)),
    ])
  }
  return toCsv(rows)
}

/** Every log entry with its nutrients for the amount eaten (serving × multiplier). */
export function entriesCsv(logs: LogEntry[], nutrients: Nutrient[]) {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.loggedAt - b.loggedAt)
  const rows: (string | number | null)[][] = [['Date', 'Time', 'Meal', 'Food', 'Serving', 'Servings eaten', 'Type', 'Energy (kcal)', ...nutrients.map(header)]]
  for (const l of sorted) {
    const t = new Date(l.loggedAt)
    const hasMacros = ['protein', 'carbs', 'fat', 'alcohol'].some((k) => l.nutrients[k] != null)
    rows.push([
      l.date,
      l.loggedAt ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : null,
      l.meal,
      l.name,
      l.serving,
      l.multiplier,
      l.supplementId != null ? 'supplement' : l.sample ? 'sample' : 'food',
      hasMacros ? Math.round(kcalOf(l.nutrients) * l.multiplier) : null,
      ...nutrients.map((n) => (l.nutrients[n.id] != null ? l.nutrients[n.id] * l.multiplier : null)),
    ])
  }
  return toCsv(rows)
}
