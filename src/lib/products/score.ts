import type { Product } from '../../db/db'
import type { Nutrient, NutrientState } from '../../types'
import { kcalOf } from '../quickLog'
import { UL_BASIS, amountAgainstUL } from '../status'
import { QUALITY_SCORE, rateForm, type FormVerdict } from './forms'

/**
 * Scores a branded food or supplement 0–100 from parts that each answer one
 * question, so the ranking can always be explained:
 *
 *  - gaps     does it fill what *you* are short on? (last 7 days; supplements are
 *             judged against food alone, so two pills for the same gap don't both look useful)
 *  - dose     supplements: meaningful amounts, within upper limits
 *  - density  foods: Nutrient Rich Foods index (NRF9.3) per 100 kcal
 *  - form     supplements: ingredient forms read from the label
 *  - value    cost per useful dose, relative to the other products shown
 *
 * Parts with no data (no price, no history, no forms on the label) are left
 * out and the rest re-weighted, rather than counted as zero.
 */

export type PartKey = 'gaps' | 'dose' | 'density' | 'form' | 'tested' | 'value'

export interface ScorePart {
  key: PartKey
  label: string
  score: number | null
  detail: string
}

export interface Flag {
  level: 'bad' | 'warn' | 'info'
  text: string
}

export interface ProductScore {
  overall: number | null
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | '–'
  parts: ScorePart[]
  /** Per day for supplements (× servings a day), per serving for foods. */
  amounts: Record<string, number>
  /** Same, as % of your daily target, for nutrients with one. */
  pct: Record<string, number>
  flags: Flag[]
  forms: FormVerdict[]
  /** Nutrients it pushes from under 80% to 80%+ of target. */
  closes: string[]
  kcal: number | null
  costPerDay: number | null
  costPerServing: number | null
  /** Cost per "dose point" (sum of % targets up to 100 each); lower is better. Used for value vs peers. */
  unitCost: number | null
}

export interface ScoreContext {
  nutrients: Nutrient[]
  /** 7-day average from food only (for supplements) and from everything (for foods); null without history. */
  foodStates: NutrientState[] | null
  allStates: NutrientState[] | null
  /** ISO currency code for prices, e.g. "USD". */
  currency?: string
}

const WEIGHTS: Record<Product['kind'], Partial<Record<PartKey, number>>> = {
  supplement: { gaps: 0.35, dose: 0.25, form: 0.15, tested: 0.1, value: 0.25 },
  food: { gaps: 0.3, density: 0.45, value: 0.25 },
}

const NRF_GOOD = ['protein', 'fiber', 'vitA', 'vitC', 'vitE', 'calcium', 'iron', 'potassium', 'magnesium']
const NRF_LIMIT = ['satfat', 'addedSugar', 'sodium']

const scorable = (n: Nutrient) => n.target != null && n.target > 0 && n.category !== 'limit'
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export function gradeOf(score: number | null): ProductScore['grade'] {
  if (score == null) return '–'
  return score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E'
}

/** Score one product. Value needs peers, so it is filled in by `scoreAll`. */
export function scoreProduct(p: Product, ctx: ScoreContext): ProductScore {
  const byId = new Map(ctx.nutrients.map((n) => [n.id, n]))
  const perDay = p.kind === 'supplement' ? (p.servingsPerDay ?? 1) : 1
  const amounts: Record<string, number> = {}
  for (const [id, v] of Object.entries(p.nutrients)) amounts[id] = v * perDay
  const pct: Record<string, number> = {}
  for (const [id, v] of Object.entries(amounts)) {
    const n = byId.get(id)
    if (n && scorable(n)) pct[id] = (v / n.target!) * 100
  }
  const name = (id: string) => byId.get(id)?.shortName ?? byId.get(id)?.name ?? id
  const flags: Flag[] = []
  const parts: ScorePart[] = []

  // ── Gaps: how much of what you're short on this fills ──
  const baseline = p.kind === 'supplement' ? ctx.foodStates : ctx.allStates
  const closes: string[] = []
  if (baseline) {
    let closed = 0
    let offered = 0
    for (const s of baseline) {
      const add = pct[s.nutrient.id]
      if (!add || !scorable(s.nutrient) || s.nutrient.category === 'advanced' || s.nutrient.sunCovered) continue
      const now = s.pct ?? 0
      offered += Math.min(add, 100)
      closed += Math.min(add, Math.max(0, 100 - now))
      if (now < 80 && now + add >= 80) closes.push(s.nutrient.id)
    }
    if (offered > 0) {
      const relevance = closed / offered
      const size = clamp01(closed / 150)
      parts.push({
        key: 'gaps',
        label: 'Your gaps',
        score: Math.round((0.5 * relevance + 0.5 * size) * 100),
        detail: closes.length
          ? `Closes ${closes.map(name).join(', ')}${p.kind === 'supplement' ? ' (vs your food)' : ''}`
          : closed > 5
            ? `Adds to gaps without closing one`
            : `Mostly things you already get enough of`,
      })
    } else parts.push({ key: 'gaps', label: 'Your gaps', score: null, detail: 'Nothing with a daily target' })

    // Supplements: point out what your current supplements already cover.
    if (p.kind === 'supplement' && ctx.allStates) {
      const covered = ctx.allStates.filter((s) => pct[s.nutrient.id] >= 25 && s.nutrient.target && (s.intake?.supplement ?? 0) >= s.nutrient.target)
      if (covered.length) flags.push({ level: 'info', text: `Your current supplements already give 100%+ of ${covered.map((s) => name(s.nutrient.id)).join(', ')}` })
    }
  } else {
    parts.push({ key: 'gaps', label: 'Your gaps', score: null, detail: 'Log a few days to rank by your own gaps' })
  }

  // ── Upper limits (supplements count in full toward every UL, including vitamin A) ──
  for (const [id, amount] of Object.entries(amounts)) {
    const n = byId.get(id)
    if (!n?.upperLimit || amount <= 0) continue
    const own = n.ulAppliesTo === 'supplements' ? amount * (n.ulSupplementScale ?? 1) : p.kind === 'food' && UL_BASIS[id] ? (p.nutrients[UL_BASIS[id]] ?? 0) * perDay : amount
    if (own > n.upperLimit) {
      flags.push({ level: 'bad', text: `${name(id)}: ${fmtN(own)} ${n.unit}${p.kind === 'supplement' ? ' a day' : ''} is over the upper limit (${fmtN(n.upperLimit)} ${n.unit})` })
      continue
    }
    const current = ctx.allStates?.find((s) => s.nutrient.id === id)?.intake
    const already = current ? amountAgainstUL(n, current) : 0
    if (already + own > n.upperLimit) flags.push({ level: 'warn', text: `${name(id)}: with what you already get, you'd pass the upper limit (${fmtN(n.upperLimit)} ${n.unit})` })
    else if (own > n.upperLimit * 0.8) flags.push({ level: 'warn', text: `${name(id)}: close to the upper limit on its own` })
  }
  const overUL = flags.some((f) => f.level === 'bad')

  // ── Dose (supplements) ──
  if (p.kind === 'supplement') {
    const ids = Object.keys(pct)
    if (ids.length) {
      const f = (x: number) => (x < 10 ? 0.2 : x < 25 ? 0.5 : x < 50 ? 0.8 : 1)
      const avg = ids.reduce((a, id) => a + f(pct[id]), 0) / ids.length
      const tiny = ids.filter((id) => pct[id] < 10)
      parts.push({
        key: 'dose',
        label: 'Dose',
        score: Math.round(avg * 100 * (overUL ? 0.4 : 1)),
        detail: tiny.length > ids.length / 2 ? `Mostly token amounts (${tiny.length} of ${ids.length} under 10%)` : overUL ? 'Over an upper limit' : `${ids.filter((id) => pct[id] >= 50).length} of ${ids.length} at 50%+ of target`,
      })
      if (tiny.length >= 3) flags.push({ level: 'info', text: `${tiny.length} nutrients at under 10% of target: mostly there for the label` })
    } else {
      parts.push({ key: 'dose', label: 'Dose', score: null, detail: 'No official targets for its ingredients' })
    }
  }

  // ── Density (foods): NRF9.3 per 100 kcal, with your targets and limits ──
  const kcal = p.kcal ?? (kcalOf(p.nutrients) || null)
  if (p.kind === 'food') {
    if (kcal != null && kcal >= 5) {
      let good = 0
      for (const id of NRF_GOOD) {
        const n = byId.get(id)
        if (n?.target) good += Math.min(((p.nutrients[id] ?? 0) / n.target) * 100, 100)
      }
      let bad = 0
      for (const id of NRF_LIMIT) {
        const n = byId.get(id)
        if (n?.target) bad += ((p.nutrients[id] ?? 0) / n.target) * 100
      }
      const nrf = ((good - bad) * 100) / kcal
      parts.push({ key: 'density', label: 'Density', score: Math.round(100 * (1 - Math.exp(-Math.max(nrf, 0) / 50))), detail: `NRF ${Math.round(nrf)} per 100 kcal` })
    } else parts.push({ key: 'density', label: 'Density', score: null, detail: 'Needs calories or macros to rate' })

    for (const id of NRF_LIMIT) {
      const n = byId.get(id)
      const v = p.nutrients[id]
      if (n?.target && v != null && (v / n.target) * 100 >= 20) flags.push({ level: 'warn', text: `High in ${name(id).toLowerCase()}: ${Math.round((v / n.target) * 100)}% of your daily limit per serving` })
    }
  }

  // ── Forms (supplements) ──
  const forms = Object.entries(p.forms ?? {})
    .map(([id, f]) => rateForm(id, f))
    .filter((f): f is FormVerdict => f != null)
  if (p.kind === 'supplement') {
    parts.push({
      key: 'form',
      label: 'Forms',
      score: forms.length ? Math.round((forms.reduce((a, f) => a + QUALITY_SCORE[f.quality], 0) / forms.length) * 100) : null,
      detail: forms.length ? forms.map((f) => `${name(f.nutrientId)}: ${f.form}`).join(' · ') : 'No forms on the label to rate',
    })
    for (const f of forms.filter((x) => x.quality === 'poor')) flags.push({ level: 'warn', text: `${name(f.nutrientId)} as ${f.form}: ${f.why}` })

    // Third-party testing: a seal scores; no seal is unknown rather than bad.
    const certs = p.certifications ?? []
    parts.push({ key: 'tested', label: 'Tested', score: certs.length ? 100 : null, detail: certs.length ? certs.join(' · ') : 'No third-party testing seal listed' })
  }

  // ── Cost ──
  const perContainer = p.servingsPerContainer && p.servingsPerContainer > 0 ? p.servingsPerContainer : null
  const costPerServing = p.price != null && p.price > 0 && perContainer ? p.price / perContainer : null
  const costPerDay = costPerServing != null && p.kind === 'supplement' ? costPerServing * perDay : null
  const points = Object.values(pct).reduce((a, x) => a + Math.min(x, 100), 0)
  const unitCost = costPerServing != null ? (costPerDay ?? costPerServing) / Math.max(points, 1) : null
  parts.push({
    key: 'value',
    label: 'Value',
    score: null,
    detail:
      costPerServing == null
        ? 'Add price and servings per container'
        : `${costPerDay != null ? `${money(costPerDay, ctx.currency)}/day` : `${money(costPerServing, ctx.currency)}/serving`} · rated against similar products in your list`,
  })

  const s: ProductScore = { overall: null, grade: '–', parts, amounts, pct, flags, forms, closes, kcal, costPerDay, costPerServing, unitCost }
  return finish(p, s)
}

function finish(p: Product, s: ProductScore): ProductScore {
  const w = WEIGHTS[p.kind]
  let sum = 0
  let weight = 0
  for (const part of s.parts) {
    const k = w[part.key]
    if (k == null || part.score == null) continue
    sum += part.score * k
    weight += k
  }
  let overall = weight > 0 ? sum / weight : null
  if (overall != null && s.flags.some((f) => f.level === 'bad')) overall = Math.min(overall, 40)
  // Grade from the rounded number, so the letter always matches the score shown.
  const shown = overall == null ? null : Math.round(overall)
  return { ...s, overall: shown, grade: gradeOf(shown) }
}

/** A product "provides" a nutrient when one day's dose (supplements) or one serving (foods) gives at least this % of target. */
const PROVIDES: Record<Product['kind'], number> = { supplement: 25, food: 10 }

/**
 * Score a list. Value compares like with like: for each nutrient a product
 * provides, its cost per useful dose is set against the cheapest product in
 * the list that also provides it, weighted by how much it provides. So a
 * magnesium pill competes with other magnesium, and a multivitamin gets credit
 * for bundling without making every single-nutrient product look expensive.
 */
export function scoreAll(products: Product[], ctx: ScoreContext) {
  const scored = new Map(products.map((p) => [p.id, scoreProduct(p, ctx)]))
  for (const kind of ['supplement', 'food'] as const) {
    const peers = products.filter((p) => p.kind === kind && scored.get(p.id)!.unitCost != null)
    if (peers.length === 0) continue
    const provides = (p: Product) => Object.entries(scored.get(p.id)!.pct).filter(([, x]) => x >= PROVIDES[kind])
    const bestFor = new Map<string, { cost: number; count: number }>()
    for (const p of peers) {
      for (const [id] of provides(p)) {
        const b = bestFor.get(id)
        const c = scored.get(p.id)!.unitCost!
        bestFor.set(id, { cost: Math.min(b?.cost ?? Infinity, c), count: (b?.count ?? 0) + 1 })
      }
    }
    for (const p of peers) {
      const s = scored.get(p.id)!
      const shared = provides(p).filter(([id]) => bestFor.get(id)!.count > 1)
      const weight = shared.reduce((a, [, x]) => a + Math.min(x, 100), 0)
      const value = weight > 0 ? Math.round((100 * shared.reduce((a, [id, x]) => a + Math.min(x, 100) * Math.sqrt(bestFor.get(id)!.cost / s.unitCost!), 0)) / weight) : null
      const cur = ctx.currency ?? 'USD'
      const cost = s.costPerDay != null ? `${money(s.costPerDay, cur)}/day` : `${money(s.costPerServing!, cur)}/serving`
      const protein = p.kind === 'food' && s.costPerServing ? p.nutrients.protein : null
      const proteinPer = protein ? ` · ${fmtN(protein / s.costPerServing!)} g protein per ${currencySymbol(cur)}` : ''
      s.parts = s.parts.map((part) =>
        part.key === 'value'
          ? { ...part, score: value, detail: `${cost}${proteinPer}${value == null ? ' · no other priced product with the same nutrients yet' : ''}` }
          : part,
      )
      scored.set(p.id, finish(p, s))
    }
  }
  return scored
}

export function money(x: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(x)
  } catch {
    return x.toFixed(2)
  }
}

export function currencySymbol(currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

function fmtN(n: number) {
  return n >= 100 ? Math.round(n).toLocaleString() : n >= 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n * 100) / 100)
}
