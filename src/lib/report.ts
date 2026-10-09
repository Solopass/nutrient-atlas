import type { LogEntry, Supplement } from '../db/db'
import type { Category, Nutrient, NutrientState } from '../types'
import { averageIntake, dateRange, nutrientSeries } from './history'
import { amountAgainstUL, nutrientState } from './status'

/** Nutrient groups in report order; limits get their own table. */
export const REPORT_CATEGORIES: Category[] = ['macro', 'vitamin', 'bvitamin', 'mineral', 'trace', 'fatty', 'amino']

/** Average under this % of target counts as a gap, as in History. */
export const GAP_PCT = 80

export interface ReportRow {
  state: NutrientState
  /** Average daily amount over logged days (app units), null without data. */
  amount: number | null
  /** Share of that amount from supplements, 0–1. */
  fromSupplements: number
  /** Logged days below GAP_PCT (or above 100% for limits), and days with data. */
  flaggedDays: number
  dataDays: number
  /** Average reaches the Tolerable Upper Intake Level. */
  overUL: boolean
}

export interface ClinicianReport {
  dates: string[]
  loggedDays: number
  rows: Map<Category, ReportRow[]>
  limits: ReportRow[]
  /** Scored nutrients averaging under GAP_PCT with enough data to say so, lowest first. */
  gaps: ReportRow[]
  overUL: ReportRow[]
  overLimits: ReportRow[]
  supplements: { s: Supplement; perDay: { n: Nutrient; amount: number; pctTarget: number | null; pctUL: number | null }[] }[]
  /** A daily supplement dose that alone reaches a nutrient's upper limit. */
  supplementsOverUL: { s: Supplement; n: Nutrient; pctUL: number }[]
}

/**
 * Everything the printable report needs, from complete days ending at `end`.
 * Averages skip unlogged days (as everywhere in the app); "low days" count
 * only days where the nutrient has data.
 */
export function clinicianReport(opts: { nutrients: Nutrient[]; byDate: Map<string, LogEntry[]>; end: string; days: number; supplements: Supplement[] }): ClinicianReport {
  const { nutrients, byDate, end, days } = opts
  const dates = dateRange(end, days)
  const { intake, loggedDays } = averageIntake(byDate, dates)

  const row = (n: Nutrient): ReportRow => {
    const state = nutrientState(n, intake[n.id])
    const i = intake[n.id]
    const series = nutrientSeries(n, byDate, dates).filter((v): v is number => v != null)
    const isLimit = n.category === 'limit'
    return {
      state,
      amount: i && i.coverage > 0 ? i.amount : null,
      fromSupplements: i && i.amount > 0 ? (i.supplement ?? 0) / i.amount : 0,
      flaggedDays: series.filter((v) => (isLimit ? v > 100 : v < GAP_PCT)).length,
      dataDays: series.length,
      overUL: !!(i && n.upperLimit && amountAgainstUL(n, i) >= n.upperLimit),
    }
  }

  const rows = new Map<Category, ReportRow[]>()
  for (const c of REPORT_CATEGORIES) {
    const r = nutrients.filter((n) => n.category === c).map(row)
    if (r.length) rows.set(c, r)
  }
  const all = [...rows.values()].flat()
  const limits = nutrients.filter((n) => n.category === 'limit').map(row)

  const gaps = all
    .filter((r) => r.state.pct != null && r.state.pct < GAP_PCT && !r.state.partial && !r.state.nutrient.sunCovered && r.state.nutrient.targetKind !== 'Limit')
    .sort((a, b) => a.state.pct! - b.state.pct!)

  const active = opts.supplements.filter((s) => s.active)
  const supplements = active.map((s) => ({
    s,
    perDay: Object.entries(s.nutrients)
      .map(([id, v]) => {
        const n = nutrients.find((x) => x.id === id)
        if (!n) return null
        const amount = v * (s.schedule === 'daily' ? s.dosesPerDay : 1)
        const ulAmount = amount * (n.ulSupplementScale ?? 1)
        return { n, amount, pctTarget: n.target ? (amount / n.target) * 100 : null, pctUL: n.upperLimit ? (ulAmount / n.upperLimit) * 100 : null }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => (b.pctTarget ?? 0) - (a.pctTarget ?? 0)),
  }))

  return {
    dates,
    loggedDays,
    rows,
    limits,
    gaps,
    overUL: all.filter((r) => r.overUL),
    overLimits: limits.filter((r) => r.state.pct != null && r.state.pct > 100),
    supplements,
    supplementsOverUL: supplements.flatMap(({ s, perDay }) => perDay.filter((x) => x.pctUL != null && x.pctUL >= 100).map((x) => ({ s, n: x.n, pctUL: x.pctUL! }))),
  }
}
