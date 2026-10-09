import type { NutrientState } from '../types'
import type { Profile } from './profile'

/**
 * Optional blood-test results that give context to intake: a low blood level
 * with good intake points at absorption or losses, not diet. Interpretation is
 * deliberately hedged. Cut-offs are common reference points, not a diagnosis.
 */

export type LabId = 'vitD' | 'ferritin' | 'b12' | 'folate' | 'magnesium' | 'omega3'
export type LabBand = 'deficient' | 'low' | 'ok' | 'high'

export interface LabResult {
  /** As entered, in `unit`. */
  value: number
  unit: string
  /** YYYY-MM-DD the blood was drawn. */
  date: string
}

export interface LabDef {
  id: LabId
  name: string
  test: string
  /** The Atlas nutrient this lab gives context to. */
  nutrientId: string
  /** First unit is canonical; `factor` converts a value in that unit to canonical. */
  units: { unit: string; factor: number }[]
  /** Upper edges (canonical) of deficient, low and ok; above the last is high. */
  bands: (p: Pick<Profile, 'sex'>) => [number, number, number]
  /** Right end of the gauge (canonical). */
  scaleMax: number
  /** Left end of the gauge (default 0); for tests with a narrow normal range. */
  scaleMin?: number
  /** Gauge scale: square root (default; keeps narrow low bands visible) or linear. */
  scale?: 'sqrt' | 'linear'
  bandLabel: Record<LabBand, string>
  /** Why blood can be low while intake looks fine. */
  lowDespiteIntake: string
  /** Caveat for readings above range. */
  high: string
  /** Normal level but low intake (default: stores are fine for now). */
  normalButLowIntake?: string
  source: string
}

export const LABS: LabDef[] = [
  {
    id: 'vitD',
    name: 'Vitamin D',
    test: '25(OH)D',
    nutrientId: 'vitD',
    units: [
      { unit: 'ng/mL', factor: 1 },
      { unit: 'nmol/L', factor: 1 / 2.496 },
    ],
    bands: () => [12, 20, 50],
    scaleMax: 80,
    bandLabel: { deficient: 'Deficient', low: 'Inadequate', ok: 'Adequate', high: 'High' },
    lowDespiteIntake: 'Most vitamin D comes from sun on skin, not food, so little sun (winter, indoors, darker skin, sunscreen) can explain a low level even when food intake is on target.',
    normalButLowIntake: 'Your level is fine, so sun is probably covering what food does not. Levels drop over winter.',
    high: 'Above 50 ng/mL (125 nmol/L) has no known extra benefit and may carry risk. Check supplement doses with your clinician.',
    source: 'National Academies (IOM) 2011',
  },
  {
    id: 'ferritin',
    name: 'Ferritin',
    test: 'iron stores',
    nutrientId: 'iron',
    units: [
      { unit: 'ng/mL', factor: 1 },
      { unit: 'µg/L', factor: 1 },
    ],
    bands: (p) => [15, 30, p.sex === 'female' ? 150 : 200],
    scaleMax: 300,
    bandLabel: { deficient: 'Depleted', low: 'Low', ok: 'Normal', high: 'High' },
    lowDespiteIntake:
      'Low stores with good intake usually mean absorption or losses: plant iron absorbs poorly, tea, coffee and calcium at meals reduce it, and periods, blood donation or gut bleeding use it up.',
    high: 'High ferritin often comes from inflammation, infection, liver problems or iron overload, not diet. Worth discussing with a clinician; avoid iron supplements until then.',
    source: 'WHO 2020 ferritin guideline',
  },
  {
    id: 'b12',
    name: 'Vitamin B12',
    test: 'serum B12',
    nutrientId: 'b12',
    units: [
      { unit: 'pg/mL', factor: 1 },
      { unit: 'pmol/L', factor: 1.355 },
    ],
    bands: () => [200, 300, Infinity],
    scaleMax: 1000,
    bandLabel: { deficient: 'Low', low: 'Borderline', ok: 'Normal', high: 'High' },
    lowDespiteIntake:
      'Low B12 with good intake points at absorption: it falls with age, with metformin or acid-reducing medicines, and with pernicious anaemia. A clinician can check (and injections bypass the gut).',
    high: '',
    source: 'NIH Office of Dietary Supplements',
  },
]

LABS.push(
  {
    id: 'folate',
    name: 'Folate',
    test: 'serum folate',
    nutrientId: 'b9',
    units: [
      { unit: 'ng/mL', factor: 1 },
      { unit: 'nmol/L', factor: 1 / 2.266 },
    ],
    bands: () => [3, 6, Infinity],
    scaleMax: 25,
    bandLabel: { deficient: 'Deficient', low: 'Borderline', ok: 'Normal', high: 'High' },
    lowDespiteIntake: 'Low folate with good intake can come from regular heavy drinking, some medicines (methotrexate, some anti-seizure drugs) or absorption problems. A clinician can check.',
    high: '',
    normalButLowIntake: 'Serum folate reflects recent intake, so it can stay normal for a while; aim for the target, especially if pregnancy is possible.',
    source: 'NIH Office of Dietary Supplements',
  },
  {
    id: 'magnesium',
    name: 'Magnesium',
    test: 'serum magnesium',
    nutrientId: 'magnesium',
    units: [
      { unit: 'mg/dL', factor: 1 },
      { unit: 'mmol/L', factor: 2.43 },
      { unit: 'mEq/L', factor: 1.215 },
    ],
    bands: () => [1.6, 1.8, 2.6],
    scaleMin: 1,
    scaleMax: 3,
    scale: 'linear',
    bandLabel: { deficient: 'Low', low: 'Borderline', ok: 'Normal', high: 'High' },
    lowDespiteIntake: 'The body holds blood magnesium in a narrow range, so a low result usually means losses (diuretics, acid-reducing medicines, alcohol, diarrhoea) more than diet. Worth raising with a clinician.',
    high: 'High blood magnesium is unusual; it usually comes from kidney problems or large supplement or laxative doses. Check with a clinician.',
    normalButLowIntake: 'Blood magnesium stays normal even when intake is short (the body draws on bone), so this test can miss a shortfall. Intake still matters.',
    source: 'Typical laboratory reference range',
  },
  {
    id: 'omega3',
    name: 'Omega-3 index',
    test: 'EPA + DHA in red cells',
    nutrientId: 'dha',
    units: [{ unit: '%', factor: 1 }],
    bands: () => [4, 8, Infinity],
    scaleMax: 12,
    bandLabel: { deficient: 'Low', low: 'Intermediate', ok: 'Desirable', high: 'High' },
    lowDespiteIntake: 'The index reflects EPA and DHA over the past 3–4 months, so recent changes take time to show. Retest after a few months.',
    high: '',
    normalButLowIntake: 'Your index is in the desirable range; it moves slowly, so a few low weeks will not change it yet.',
    source: 'Omega-3 index (Harris & von Schacky)',
  },
)

/** Where a value sits on this test's gauge, 0–1 (clamped). */
export function labPosition(def: LabDef, v: number) {
  const min = def.scaleMin ?? 0
  const t = Math.min(Math.max((v - min) / (def.scaleMax - min), 0), 1)
  return def.scale === 'linear' ? t : Math.sqrt(t)
}

export const LAB_BY_ID = new Map(LABS.map((l) => [l.id, l]))
export const LAB_FOR_NUTRIENT = new Map(LABS.map((l) => [l.nutrientId, l]))
LAB_FOR_NUTRIENT.set('epa', LAB_BY_ID.get('omega3')!) // the omega-3 index is EPA + DHA

/**
 * All results for one test, oldest first. Older profiles only stored the latest
 * result in `labs`, so that counts as a one-entry history.
 */
export function labHistory(p: Pick<Profile, 'labs' | 'labHistory'>, id: LabId): LabResult[] {
  const h = p.labHistory?.[id]
  if (h?.length) return [...h].sort((a, b) => a.date.localeCompare(b.date))
  return p.labs?.[id] ? [p.labs[id]!] : []
}

/**
 * Add or replace one result (same date, or the entry being edited) and return
 * the new history plus the latest result.
 */
export function upsertLabResult(history: LabResult[], result: LabResult, replaceDate?: string | null) {
  const next = history.filter((r) => r.date !== result.date && r.date !== replaceDate)
  next.push(result)
  next.sort((a, b) => a.date.localeCompare(b.date))
  return { history: next, latest: next[next.length - 1] }
}

export function removeLabResult(history: LabResult[], date: string) {
  const next = history.filter((r) => r.date !== date)
  return { history: next, latest: next[next.length - 1] ?? null }
}

export const BAND_COLOR: Record<LabBand, string> = {
  deficient: 'var(--c-deficient)',
  low: 'var(--c-attention)',
  ok: 'var(--c-good)',
  high: 'var(--c-over)',
}

/** Months after which a result is flagged as possibly out of date. */
export const LAB_STALE_MONTHS = 12

export function toCanonical(def: LabDef, r: Pick<LabResult, 'value' | 'unit'>) {
  const u = def.units.find((x) => x.unit === r.unit) ?? def.units[0]
  return r.value * u.factor
}

export function labBand(def: LabDef, canonical: number, profile: Pick<Profile, 'sex'>): LabBand {
  const [d, l, ok] = def.bands(profile)
  return canonical < d ? 'deficient' : canonical < l ? 'low' : canonical <= ok ? 'ok' : 'high'
}

export function monthsSince(date: string, today: string) {
  const [y1, m1, d1] = date.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

export interface LabReading {
  def: LabDef
  result: LabResult
  canonical: number
  band: LabBand
  months: number
  stale: boolean
  /** One-line read of blood level and intake together. */
  headline: string
  /** What might explain it / what to do. */
  advice: string
}

/**
 * Combine a lab with the matching intake state. `intake` may be null (no
 * logs); then only the lab itself is described.
 */
export function readLab(def: LabDef, result: LabResult, intake: NutrientState | null, profile: Pick<Profile, 'sex'>, today: string): LabReading {
  const canonical = toCanonical(def, result)
  const band = labBand(def, canonical, profile)
  const months = Math.max(0, monthsSince(result.date, today))
  const pct = intake?.pct ?? null
  const intakeOk = pct != null && pct >= 80 && !intake?.partial
  const intakeLow = pct != null && pct < 80 && !intake?.partial
  const level = `${def.name} blood level is ${def.bandLabel[band].toLowerCase()}`

  let headline: string
  let advice: string
  if (band === 'deficient' || band === 'low') {
    if (intakeLow) {
      headline = `${level} and intake is ${Math.round(pct!)}% of target`
      advice = `Both point the same way, so raising intake from food${def.id === 'vitD' ? ', sun' : ''} or a supplement is the obvious lever. Ask your clinician how much, since treating a deficiency can need more than the daily target.`
    } else if (intakeOk) {
      headline = `${level} even though intake is on target`
      advice = def.lowDespiteIntake
    } else {
      headline = `${level}`
      advice = `Your logged intake doesn't show this nutrient well enough to compare yet. ${def.lowDespiteIntake}`
    }
  } else if (band === 'high') {
    headline = `${level}`
    advice = def.high
  } else {
    headline = intakeLow ? `${level}, but intake is ${Math.round(pct!)}% of target` : `${level}`
    advice = intakeLow
      ? (def.normalButLowIntake ?? 'Your stores are fine for now; intake below target can run them down over months.')
      : intakeOk
        ? 'Blood level and intake both look good.'
        : 'Your blood level is in the usual range.'
  }
  return { def, result, canonical, band, months, stale: months >= LAB_STALE_MONTHS, headline, advice }
}

/** Parse and range-check a typed value; null if implausible. */
export function validLabValue(def: LabDef, value: number, unit: string) {
  if (!Number.isFinite(value) || value <= 0) return false
  return toCanonical(def, { value, unit }) <= def.scaleMax * 5
}
