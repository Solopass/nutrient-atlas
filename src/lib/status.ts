import type { Category, Intake, Nutrient, NutrientState, Status } from '../types'

export const PARTIAL_COVERAGE = 0.6

/** `glyph`: a shape for each status, so status never depends on colour alone (shown in colour-blind mode and in the legend). */
export const STATUS_META: Record<Status, { label: string; range: string; color: string; glyph: string }> = {
  deficient: { label: 'Deficient', range: '0–49%', color: 'var(--c-deficient)', glyph: '▼' },
  attention: { label: 'Needs attention', range: '50–79%', color: 'var(--c-attention)', glyph: '▽' },
  good: { label: 'Good', range: '80–120%', color: 'var(--c-good)', glyph: '●' },
  above: { label: 'Above target', range: '>120%', color: 'var(--c-above)', glyph: '▲' },
  overLimit: { label: 'Over upper limit', range: '> UL', color: 'var(--c-over)', glyph: '⚠' },
  noData: { label: 'No data', range: 'foods lack values', color: 'var(--c-nodata)', glyph: '○' },
  noTarget: { label: 'No official target', range: 'amount only', color: 'var(--c-notarget)', glyph: '·' },
}

/**
 * Nutrients whose UL covers one form only. Vitamin A's UL is for preformed
 * vitamin A (retinol: liver, fish oils, supplements), not beta-carotene from
 * plants, so a big day of carrots and sweet potato is not "over the limit".
 */
export const UL_BASIS: Record<string, string> = { vitA: 'retinol' }

/**
 * How much of an item's nutrient counts toward the UL. Foods count their
 * retinol (USDA reports it; other foods are assumed plant-form); supplements
 * count their whole vitamin A, since labels rarely say which form.
 */
export function ulPart(id: string, nutrients: Record<string, number>, supplement: boolean) {
  const basis = UL_BASIS[id]
  if (!basis || supplement) return nutrients[id] ?? 0
  return nutrients[basis] ?? 0
}

/** The amount the UL is compared with: supplement intake only for supplement-only ULs; retinol only for vitamin A. */
export function amountAgainstUL(n: Nutrient, intake: Intake) {
  if (n.ulAppliesTo === 'supplements') return (intake.supplement ?? 0) * (n.ulSupplementScale ?? 1)
  return intake.ulAmount ?? intake.amount
}

/** "Stay under" nutrients: green well below the limit, yellow near it, orange over. A limit of 0 means any amount is over. */
export const LIMIT_NEAR = 80

function limitState(base: Omit<NutrientState, 'status' | 'pct'>, n: Nutrient, intake: Intake): NutrientState {
  const limit = n.target ?? 0
  if (limit === 0) return { ...base, status: intake.amount > 0 ? 'overLimit' : 'good', pct: intake.amount > 0 ? null : 0 }
  const pct = (intake.amount / limit) * 100
  return { ...base, status: pct <= LIMIT_NEAR ? 'good' : pct <= 100 ? 'attention' : 'overLimit', pct }
}

export function nutrientState(nutrient: Nutrient, intake: Intake | undefined): NutrientState {
  const partial = !!intake && intake.coverage > 0 && intake.coverage < PARTIAL_COVERAGE
  const base = { nutrient, intake, partial }

  if (!intake || intake.coverage === 0) return { ...base, status: 'noData', pct: null }
  if (nutrient.category === 'limit') return limitState(base, nutrient, intake)
  if (nutrient.upperLimit != null && amountAgainstUL(nutrient, intake) > nutrient.upperLimit) {
    const pct = nutrient.target != null ? (intake.amount / nutrient.target) * 100 : null
    return { ...base, status: 'overLimit', pct }
  }
  if (nutrient.target == null) return { ...base, status: 'noTarget', pct: null }

  const pct = (intake.amount / nutrient.target) * 100
  const status: Status = pct < 50 ? 'deficient' : pct < 80 ? 'attention' : pct <= 120 ? 'good' : 'above'
  return { ...base, status, pct }
}

const MET: Status[] = ['good', 'above', 'overLimit']
const SCORED: Category[] = ['macro', 'vitamin', 'mineral', 'bvitamin', 'trace', 'fatty', 'amino']

// Sun-covered vitamin D is shown but doesn't count either way.
export const isScorable = (s: NutrientState) => s.status !== 'noData' && s.status !== 'noTarget' && !s.nutrient.sunCovered
export const isMet = (s: NutrientState) => MET.includes(s.status)

export interface DayScore {
  /** Average of per-category coverage, 0–100. */
  score: number
  core: { met: number; total: number }
  tracked: { met: number; total: number }
  counts: Record<Status, number>
}

export function dayScore(states: NutrientState[]): DayScore {
  const scored = states.filter((s) => SCORED.includes(s.nutrient.category))
  const scorable = scored.filter(isScorable)

  const categoryScores = SCORED.map((c) => scorable.filter((s) => s.nutrient.category === c))
    .filter((group) => group.length > 0)
    .map((group) => group.filter(isMet).length / group.length)
  const score = categoryScores.length
    ? (categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length) * 100
    : 0

  const core = scorable.filter((s) => ['macro', 'vitamin', 'mineral'].includes(s.nutrient.category))
  const counts = Object.fromEntries(
    Object.keys(STATUS_META).map((k) => [k, scored.filter((s) => s.status === k).length]),
  ) as Record<Status, number>

  return {
    score,
    core: { met: core.filter(isMet).length, total: core.length },
    tracked: { met: scorable.filter(isMet).length, total: scorable.length },
    counts,
  }
}

export function scoreColor(score: number) {
  return STATUS_META[score < 50 ? 'deficient' : score < 80 ? 'attention' : 'good'].color
}

export function fmt(n: number) {
  if (n >= 100) return Math.round(n).toLocaleString()
  if (n >= 10) return (Math.round(n * 10) / 10).toString()
  return (Math.round(n * 100) / 100).toString()
}
