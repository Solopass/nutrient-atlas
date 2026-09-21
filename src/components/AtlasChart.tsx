import { useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type SVGProps } from 'react'
import { CATEGORY_LABEL } from '../data/nutrients'
import { STATUS_META, fmt, scoreColor, type DayScore } from '../lib/status'
import type { LogGroup } from '../db/db'
import type { Category, Nutrient, NutrientState, Status } from '../types'

// ── Geometry ──────────────────────────────────────────────────────
const SIZE = 900
const C = SIZE / 2
const HUB = 90
const R0 = 98 // rose starts
const R100 = 234 // 100% of target
const CAP = 150 // rose is clipped at 150%
const RCAP = R0 + ((R100 - R0) * CAP) / 100
const LABEL_IN = 318
const LABEL_OUT = 337
const OUT0 = 360 // outer ring
const OUT1 = 398
const BAND = 404
const OUT_LABEL = 419

const rad = (deg: number) => (deg * Math.PI) / 180
const polar = (r: number, deg: number) => ({ x: C + r * Math.cos(rad(deg)), y: C + r * Math.sin(rad(deg)) })
const rOf = (pct: number) => R0 + ((R100 - R0) * Math.min(Math.max(pct, 0), CAP)) / 100
const isBottom = (deg: number) => Math.sin(rad(deg)) > 1e-4

function sector(r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0
  const p0 = polar(r1, a0)
  const p1 = polar(r1, a1)
  const p2 = polar(r0, a1)
  const p3 = polar(r0, a0)
  return `M${p0.x} ${p0.y}A${r1} ${r1} 0 ${large} 1 ${p1.x} ${p1.y}L${p2.x} ${p2.y}A${r0} ${r0} 0 ${large} 0 ${p3.x} ${p3.y}Z`
}

function arc(r: number, a0: number, a1: number) {
  const p0 = polar(r, a0)
  const p1 = polar(r, a1)
  return `M${p0.x} ${p0.y}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x} ${p1.y}`
}

/** Arc for a textPath that reads upright on both halves of the circle. */
function readableArc(r: number, mid: number, spread: number) {
  if (!isBottom(mid)) return arc(r, mid - spread, mid + spread)
  const p0 = polar(r, mid + spread)
  const p1 = polar(r, mid - spread)
  return `M${p0.x} ${p0.y}A${r} ${r} 0 0 0 ${p1.x} ${p1.y}`
}

interface Seg {
  state: NutrientState
  a0: number
  a1: number
  mid: number
}

/** Spread items around the circle, with extra gaps between categories. First category is centered at 12 o'clock. */
function layout(states: NutrientState[], groupGap: number, itemGap: number): Seg[] {
  const groups = new Set(states.map((s) => s.nutrient.category)).size
  const span = (360 - groups * groupGap) / states.length
  const firstCount = states.filter((s) => s.nutrient.category === states[0].nutrient.category).length
  let a = -90 - (firstCount * span) / 2
  let prev: Category | null = null
  return states.map((state) => {
    if (prev !== null && state.nutrient.category !== prev) a += groupGap
    prev = state.nutrient.category
    const seg = { state, a0: a + itemGap / 2, a1: a + span - itemGap / 2, mid: a + span / 2 }
    a += span
    return seg
  })
}

function groupsOf(segs: Seg[]) {
  const out: { cat: Category; a0: number; a1: number }[] = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last?.cat === s.state.nutrient.category) last.a1 = s.a1
    else out.push({ cat: s.state.nutrient.category, a0: s.a0, a1: s.a1 })
  }
  return out
}

function TangentText({ r, angle, children, ...rest }: { r: number; angle: number; children: ReactNode } & SVGProps<SVGTextElement>) {
  const p = polar(r, angle)
  const rot = isBottom(angle) ? angle - 90 : angle + 90
  return (
    <text
      x={p.x}
      y={p.y}
      transform={`rotate(${rot} ${p.x} ${p.y})`}
      textAnchor="middle"
      dominantBaseline="central"
      {...rest}
    >
      {children}
    </text>
  )
}

const HALO = { paintOrder: 'stroke', stroke: 'rgba(8,11,16,0.85)', strokeWidth: 3, strokeLinejoin: 'round' } as const
const STATUSES = Object.keys(STATUS_META) as Status[]

// ── Component ─────────────────────────────────────────────────────
interface Props {
  core: NutrientState[]
  outer: NutrientState[]
  score: DayScore
  selectedId: string | null
  onSelect: (id: string) => void
  compact: boolean
  /** Previous period (yesterday, or the 7 days before) as % of target per nutrient, drawn as a tick on each wedge. */
  compare?: { label: string; pct: Map<string, number | null> } | null
  /** Colour wedges by status, or stack them by the meal each amount came from. */
  colorBy?: 'status' | 'meal'
  /** Average amount per meal group per nutrient, for colorBy="meal". */
  meals?: Partial<Record<LogGroup, Record<string, number>>> | null
  /** 7-day view: lowest and highest daily % per nutrient, drawn as a whisker. */
  range?: Map<string, { min: number; max: number; days: number } | null> | null
  /** A food drawn on top: what it would add (preview) or what it supplied (footprint). */
  overlay?: AtlasOverlay | null
}

export interface AtlasOverlay {
  kind: 'preview' | 'footprint'
  name: string
  /** % of target per nutrient that the food adds (preview) or supplied (footprint). */
  pct: Map<string, number>
  /** Preview only: nourishment score now and with the food. */
  score?: { from: number; to: number }
}

const statusFor = (p: number): Status => (p < 50 ? 'deficient' : p < 80 ? 'attention' : p <= 120 ? 'good' : 'above')
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

export const MEAL_ORDER: LogGroup[] = ['breakfast', 'lunch', 'dinner', 'snack', 'supplement']
export const MEAL_SHORT: Record<LogGroup, string> = { breakfast: 'B', lunch: 'L', dinner: 'D', snack: 'S', supplement: 'Supp' }

/** % of target contributed by each meal group, in eating order. */
function mealStack(n: Nutrient, meals: Props['meals']) {
  if (!meals || !n.target) return []
  return MEAL_ORDER.map((meal) => ({ meal, pct: ((meals[meal]?.[n.id] ?? 0) / n.target!) * 100 })).filter((x) => x.pct > 0)
}

/** Stacked segments from r(0) outward, one per meal. */
function MealSegments({ stack, r, a0, a1 }: { stack: ReturnType<typeof mealStack>; r: (pct: number) => number; a0: number; a1: number }) {
  let acc = 0
  return (
    <g pointerEvents="none">
      {stack.map(({ meal, pct }) => {
        const r0 = r(acc)
        acc += pct
        const r1 = r(acc)
        if (r1 - r0 < 0.4) return null
        return (
          <g key={meal}>
            <path d={sector(r0, r1, a0, a1)} style={{ fill: `var(--m-${meal})`, fillOpacity: 0.78 }} />
            {meal === 'supplement' && <path d={sector(r0, r1, a0, a1)} fill="url(#supp)" />}
            {acc - pct > 0 && <path d={arc(r0, a0, a1)} fill="none" stroke="var(--bg)" strokeWidth="1.2" />}
          </g>
        )
      })}
    </g>
  )
}

/** What a previewed food would add: a translucent, dashed segment in the colour the nutrient would reach. */
function Ghost({ r0, r1, a0, a1, color }: { r0: number; r1: number; a0: number; a1: number; color: string }) {
  if (r1 - r0 < 0.5) return null
  return (
    <g pointerEvents="none" className="atlas-ghost">
      <path d={sector(r0, r1, a0, a1)} style={{ fill: color, fillOpacity: 0.32 }} />
      <path d={sector(r0, r1, a0 + 0.3, a1 - 0.3)} fill="none" style={{ stroke: color }} strokeWidth="1.3" strokeDasharray="3 2.5" />
    </g>
  )
}

/** One-paragraph text version of the chart for screen readers. */
function describe(states: NutrientState[], score: DayScore) {
  const name = (s: NutrientState) => `${s.nutrient.name} ${s.pct != null ? Math.round(s.pct) + '%' : ''}`.trim()
  const low = states.filter((s) => s.status === 'deficient' || s.status === 'attention').sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
  const over = states.filter((s) => s.status === 'overLimit')
  const unknown = states.filter((s) => s.status === 'noData').length
  return [
    `Nourishment score ${Math.round(score.score)}%, ${score.tracked.met} of ${score.tracked.total} targets met.`,
    low.length ? `Below target: ${low.map(name).join(', ')}.` : 'Nothing below target.',
    over.length ? `Over the upper limit: ${over.map(name).join(', ')}.` : '',
    unknown ? `${unknown} with no data.` : '',
    'Use the arrow keys to move between nutrients and Enter for details.',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Share of the % that came from supplements, and the food-only remainder. */
function split(state: NutrientState) {
  const { pct, intake, nutrient: n } = state
  if (pct == null || !n.target || !intake?.supplement) return { suppPct: 0, foodPct: pct ?? 0 }
  const suppPct = (intake.supplement / n.target) * 100
  return { suppPct, foodPct: Math.max(0, pct - suppPct) }
}

export function AtlasChart({ core, outer, score, selectedId, onSelect, compact, compare = null, colorBy = 'status', meals = null, range = null, overlay = null }: Props) {
  const byMeal = colorBy === 'meal' && meals != null
  const [hoverId, setHoverId] = useState<string | null>(null)
  const coreSegs = layout(core, 4, 1.2)
  const outerSegs = layout(outer, 3.5, 0.8)
  const coreGroups = groupsOf(coreSegs)
  const outerGroups = groupsOf(outerSegs)
  const hovered = [...core, ...outer].find((s) => s.nutrient.id === hoverId) ?? null
  const k = compact ? 1.45 : 1 // font scale when the chart is drawn small
  const view = compact ? `${C - 380} ${C - 380} 760 760` : `0 0 ${SIZE} ${SIZE}`
  const o0 = compact ? 356 : OUT0
  const o1 = compact ? 371 : OUT1
  const ringR = (p: number) => o0 + ((o1 - o0) * Math.min(Math.max(p, 0), 100)) / 100
  const footprintCount = overlay?.kind === 'footprint' ? [...core, ...outer].filter((st) => (overlay.pct.get(st.nutrient.id) ?? 0) >= 10).length : 0
  const scaleAngle = coreSegs[0].a0 - 2 // the gap before the first wedge holds the % scale labels

  const interact = (id: string) => ({
    // Hover highlight is for real mice and keyboard focus only. On touch screens a tap fires a
    // synthetic mouseenter and focus with no matching leave, which would leave the chart dimmed.
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setHoverId(id),
    onPointerLeave: () => setHoverId((h) => (h === id ? null : h)),
    onFocus: (e: FocusEvent<SVGGElement>) => e.currentTarget.matches(':focus-visible') && setHoverId(id),
    onBlur: () => setHoverId((h) => (h === id ? null : h)),
    onClick: () => onSelect(id),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect(id)
        return
      }
      // Arrow keys walk around the chart (core wedges, then the outer ring); Home/End jump to the ends.
      const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key]
      if (step == null && e.key !== 'Home' && e.key !== 'End') return
      e.preventDefault()
      const all = [...(e.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>('g[role=button]') ?? [])]
      const i = all.indexOf(e.currentTarget)
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + step + all.length) % all.length
      all[next]?.focus()
    },
    role: 'button',
    tabIndex: 0,
    className: 'cursor-pointer outline-none',
  })

  return (
    <svg id="atlas-svg" viewBox={view} className="atlas mx-auto block h-auto w-full max-w-[880px] select-none" role="group" aria-label="Nutrient Atlas" aria-describedby="atlas-desc">
      <desc id="atlas-desc">{describe([...core, ...outer], score)}</desc>
      <defs>
        {STATUSES.map((s) => (
          <radialGradient key={s} id={`g-${s}`} gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R100}>
            <stop offset={R0 / R100} style={{ stopColor: STATUS_META[s].color, stopOpacity: 0.1 }} />
            <stop offset={0.75} style={{ stopColor: STATUS_META[s].color, stopOpacity: 0.5 }} />
            <stop offset={1} style={{ stopColor: STATUS_META[s].color, stopOpacity: 0.95 }} />
          </radialGradient>
        ))}
        {STATUSES.map((s) => (
          <pattern key={s} id={`ovf-${s}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="5" height="5" style={{ fill: STATUS_META[s].color, fillOpacity: 0.1 }} />
            <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: STATUS_META[s].color, strokeWidth: 1.8, strokeOpacity: 0.5 }} />
          </pattern>
        ))}
        {/* Dots = the part that came from supplements (pills) */}
        <pattern id="supp" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.15" style={{ fill: "#fff", fillOpacity: 0.6 }} />
        </pattern>
        <radialGradient id="bg-glow" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={OUT1 + 40}>
          <stop offset="0" style={{ stopColor: scoreColor(score.score), stopOpacity: 0.1 }} />
          <stop offset="0.6" style={{ stopColor: '#4c8dff', stopOpacity: 0.05 }} />
          <stop offset="1" style={{ stopColor: '#4c8dff', stopOpacity: 0 }} />
        </radialGradient>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'var(--c-nodata)', strokeWidth: 1.4, strokeOpacity: 0.6 }} />
        </pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {coreGroups.map((g) => (
          <path key={g.cat} id={`hub-${g.cat}`} d={readableArc(HUB - 12, (g.a0 + g.a1) / 2, 60)} />
        ))}
        {!compact &&
          outerGroups.map((g) => (
            <path key={g.cat} id={`out-${g.cat}`} d={readableArc(OUT_LABEL, (g.a0 + g.a1) / 2, 80)} />
          ))}
      </defs>

      <circle cx={C} cy={C} r={OUT1 + 40} fill="url(#bg-glow)" />

      {/* Fine radial ticks for the instrument feel */}
      {Array.from({ length: 120 }, (_, i) => {
        const a = i * 3
        const major = i % 10 === 0
        const p0 = polar(RCAP + 4, a)
        const p1 = polar(RCAP + (major ? 11 : 7), a)
        return (
          <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="var(--line)" strokeWidth={major ? 1.4 : 0.8} />
        )
      })}

      {/* Radar sweep: a slow rotating beam behind the rose */}
      <g className="atlas-sweep" pointerEvents="none">
        <circle cx={C} cy={C} r={OUT1} fill="none" />
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} d={sector(R0, compact ? RCAP : OUT1, -90 - (i + 1) * 4, -90 - i * 4)} fill="var(--c-above)" opacity={0.07 * (1 - i / 10)} />
        ))}
        <path d={`M${polar(R0, -90).x} ${polar(R0, -90).y}L${polar(compact ? RCAP : OUT1, -90).x} ${polar(compact ? RCAP : OUT1, -90).y}`} stroke="var(--c-above)" strokeOpacity="0.35" strokeWidth="1" />
      </g>

      {/* ── Core rose ── */}
      <g className="atlas-grow">
        {coreSegs.map(({ state, a0, a1, mid }) => {
          const { nutrient: n, status, pct } = state
          const color = STATUS_META[status].color
          const noData = status === 'noData'
          const rMain = pct != null ? rOf(Math.min(pct, 100)) : R0
          const selected = selectedId === n.id
          const hot = hoverId === n.id
          const dimmed = hoverId != null && !hot
          // A supplement-only UL is not comparable with total intake, so it gets no marker on the wedge.
          const ulPct = n.upperLimit && n.target && n.ulAppliesTo !== 'supplements' ? (n.upperLimit / n.target) * 100 : null
          const { suppPct, foodPct } = split(state)
          const prev = compare?.pct.get(n.id) ?? null
          const rg = range?.get(n.id) ?? null
          const ov = overlay?.pct.get(n.id) ?? 0
          const faded = overlay?.kind === 'footprint' && ov < 1
          return (
            <g
              key={n.id}
              {...interact(n.id)}
              opacity={dimmed ? 0.32 : faded ? 0.3 : 1}
              style={{ transition: 'opacity 200ms' }}
              aria-label={`${n.name} ${pct != null ? Math.round(pct) + '%' : STATUS_META[status].label}`}
            >
              <path d={sector(R0, R100, a0, a1)} fill="var(--panel-2)" opacity={hot ? 1 : 0.75} />
              <path d={sector(R100, RCAP, a0, a1)} fill="var(--panel-2)" opacity={hot ? 0.5 : 0.22} />
              {noData && <path d={sector(R0, R100, a0, a1)} fill="url(#hatch)" />}
              {byMeal && pct != null && pct > 0 && (
                <>
                  <MealSegments stack={mealStack(n, meals)} r={rOf} a0={a0} a1={a1} />
                  <path d={arc(rOf(pct), a0 + 0.4, a1 - 0.4)} fill="none" stroke={color} strokeWidth={hot ? 4 : 3} filter="url(#glow)" />
                </>
              )}
              {!byMeal && pct != null && pct > 0 && (
                <>
                  <path d={sector(R0, rMain, a0, a1)} fill={`url(#g-${status})`} />
                  {pct > 100 && (
                    <>
                      <path d={sector(R100, rOf(pct), a0, a1)} fill={`url(#ovf-${status})`} />
                      <path d={arc(rOf(pct), a0 + 0.4, a1 - 0.4)} fill="none" stroke={color} strokeOpacity="0.75" strokeWidth="1.5" />
                    </>
                  )}
                  <path
                    d={arc(rMain, a0 + 0.4, a1 - 0.4)}
                    fill="none"
                    stroke={color}
                    strokeWidth={hot ? 4 : 3}
                    filter="url(#glow)"
                    className={status === 'deficient' ? 'pulse' : undefined}
                  />
                </>
              )}
              {!byMeal && pct != null && suppPct > 0 && rOf(pct) - rOf(foodPct) > 1 && (
                <g pointerEvents="none">
                  <path d={sector(rOf(foodPct), rOf(pct), a0, a1)} fill="url(#supp)" />
                  <path d={arc(rOf(foodPct), a0 + 0.4, a1 - 0.4)} fill="none" stroke="var(--bg)" strokeOpacity="0.8" strokeWidth="1.2" />
                </g>
              )}
              {overlay?.kind === 'footprint' && ov >= 1 && (
                <g pointerEvents="none">
                  <path d={sector(R0, rOf(ov), a0, a1)} fill="#fff" fillOpacity="0.24" />
                  <path d={arc(rOf(ov), a0 + 0.4, a1 - 0.4)} fill="none" stroke="#fff" strokeWidth="2.2" />
                </g>
              )}
              {overlay?.kind === 'preview' && ov >= 0.5 && (
                <Ghost r0={rOf(pct ?? 0)} r1={rOf((pct ?? 0) + ov)} a0={a0} a1={a1} color={STATUS_META[statusFor((pct ?? 0) + ov)].color} />
              )}
              {rg && (
                <g pointerEvents="none" opacity={hot ? 0.95 : 0.6}>
                  <line x1={polar(rOf(rg.min), mid).x} y1={polar(rOf(rg.min), mid).y} x2={polar(rOf(rg.max), mid).x} y2={polar(rOf(rg.max), mid).y} stroke="var(--fg)" strokeWidth="1.2" strokeDasharray="1.5 2" />
                  <path d={arc(rOf(rg.min), mid - 1.6, mid + 1.6)} fill="none" stroke="var(--fg)" strokeWidth="1.6" />
                  <path d={arc(rOf(rg.max), mid - 1.6, mid + 1.6)} fill="none" stroke="var(--fg)" strokeWidth="1.6" />
                </g>
              )}
              {prev != null && (
                <g pointerEvents="none">
                  <path d={arc(rOf(prev), a0 + 1.5, a1 - 1.5)} fill="none" stroke="var(--bg)" strokeOpacity="0.7" strokeWidth="4" strokeLinecap="round" />
                  <path d={arc(rOf(prev), a0 + 1.5, a1 - 1.5)} fill="none" stroke="var(--fg)" strokeOpacity={hot ? 1 : 0.75} strokeWidth="1.6" strokeLinecap="round" />
                </g>
              )}
              {pct != null && pct > CAP && (
                <path
                  d={`M${polar(RCAP + 2, mid - 2).x} ${polar(RCAP + 2, mid - 2).y}L${polar(RCAP + 12, mid).x} ${polar(RCAP + 12, mid).y}L${polar(RCAP + 2, mid + 2).x} ${polar(RCAP + 2, mid + 2).y}Z`}
                  fill={color}
                />
              )}
              {ulPct != null && ulPct <= CAP && (
                <path d={arc(rOf(ulPct), a0, a1)} fill="none" stroke="var(--c-over)" strokeWidth="1.5" strokeDasharray="3 3" />
              )}
              {(selected || hot) && (
                <path d={sector(R0 - 2, RCAP + 2, a0 - 0.3, a1 + 0.3)} fill="none" stroke="var(--fg)" strokeOpacity={selected ? 0.9 : 0.4} strokeWidth="1.5" />
              )}

              {/* inner labels */}
              <text x={polar(R0 + 34 * k, mid).x} y={polar(R0 + 34 * k, mid).y - 7 * k} textAnchor="middle" dominantBaseline="central" fill="var(--fg)" fontSize={(n.symbol.length > 2 ? 13 : 16) * k} fontWeight="700" style={HALO}>
                {n.symbol}
              </text>
              <text x={polar(R0 + 34 * k, mid).x} y={polar(R0 + 34 * k, mid).y + 9 * k} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={11 * k} fontWeight="600" fontFamily="var(--font-mono)" style={HALO}>
                {pct != null ? `${Math.round(pct)}%` : '—'}
              </text>
              {status === 'overLimit' && (
                <g transform={`translate(${polar(RCAP - 16, mid).x} ${polar(RCAP - 16, mid).y})`}>
                  <circle r={9 * k} fill="var(--c-over)" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={12 * k} fontWeight="800" fill="var(--bg)">!</text>
                </g>
              )}

              {/* outer name + amount, tangential */}
              <TangentText r={isBottom(mid) ? LABEL_IN : LABEL_OUT} angle={mid} fontSize={11.5 * k} fill={hot || selected ? 'var(--fg)' : 'var(--dim)'} fontWeight="500">
                {n.shortName ?? n.name}
              </TangentText>
              {!compact && (
                <TangentText r={isBottom(mid) ? LABEL_OUT : LABEL_IN} angle={mid} fontSize="9.5" fill="var(--muted)" fontFamily="var(--font-mono)">
                  {noData ? 'no data' : `${fmt(state.intake!.amount)}/${fmt(n.target!)} ${n.unit}`}
                </TangentText>
              )}
            </g>
          )
        })}
      </g>

      {/* Threshold rings, drawn over the rose */}
      {[50, 80, 100, 120].map((p) => (
        <circle
          key={p}
          cx={C}
          cy={C}
          r={rOf(p)}
          fill="none"
          stroke={p === 100 ? 'var(--dim)' : 'var(--muted)'}
          strokeOpacity={p === 100 ? 0.5 : 0.28}
          strokeWidth={p === 100 ? 1.2 : 0.8}
          strokeDasharray={p === 100 ? undefined : '2 4'}
          pointerEvents="none"
        />
      ))}
      {[50, 80, 100, 120, 150].map((p) => (
        <text key={p} {...polar(rOf(p), scaleAngle)} textAnchor="middle" dominantBaseline="central" fontSize={8.5 * k} fill="var(--muted)" fontFamily="var(--font-mono)" style={HALO} pointerEvents="none">
          {p}
        </text>
      ))}

      {/* ── Outer ring: every secondary nutrient as a mini radial gauge ── */}
      <g>
          {outerSegs.map(({ state, a0, a1, mid }) => {
            const { nutrient: n, status, pct } = state
            const color = STATUS_META[status].color
            const hot = hoverId === n.id
            const selected = selectedId === n.id
            const fillR = status === 'noTarget' ? o1 : pct != null ? ringR(pct) : o0
            const { suppPct, foodPct } = split(state)
            const foodR = ringR(foodPct)
            const ov = overlay?.pct.get(n.id) ?? 0
            const faded = overlay?.kind === 'footprint' && ov < 1
            return (
              <g key={n.id} {...interact(n.id)} opacity={hoverId != null && !hot ? 0.4 : faded ? 0.3 : 1} style={{ transition: 'opacity 200ms' }} aria-label={`${n.name} ${pct != null ? Math.round(pct) + '%' : STATUS_META[status].label}`}>
                <path d={sector(o0, o1, a0, a1)} fill="var(--panel-2)" opacity={hot ? 1 : 0.8} />
                {status === 'noData' && <path d={sector(o0, o1, a0, a1)} fill="url(#hatch)" />}
                {byMeal && status !== 'noTarget' && pct != null ? (
                  <MealSegments stack={mealStack(n, meals)} r={ringR} a0={a0} a1={a1} />
                ) : (
                  fillR > o0 && <path d={sector(o0, fillR, a0, a1)} fill={color} opacity={status === 'noTarget' ? 0.22 : hot ? 0.95 : 0.75} />
                )}
                {overlay?.kind === 'footprint' && ov >= 1 && <path d={sector(o0, ringR(ov), a0, a1)} fill="#fff" fillOpacity="0.45" pointerEvents="none" />}
                {overlay?.kind === 'preview' && ov >= 0.5 && n.target != null && (pct ?? 0) < 100 && (
                  <Ghost r0={ringR(pct ?? 0)} r1={ringR((pct ?? 0) + ov)} a0={a0} a1={a1} color={STATUS_META[statusFor((pct ?? 0) + ov)].color} />
                )}
                {!byMeal && suppPct > 0 && fillR - foodR > 0.5 && <path d={sector(foodR, fillR, a0, a1)} fill="url(#supp)" pointerEvents="none" />}
                {(hot || selected) && (
                  <path d={sector(o0 - 1.5, o1 + 1.5, a0 - 0.2, a1 + 0.2)} fill="none" stroke="var(--fg)" strokeOpacity={selected ? 0.9 : 0.5} strokeWidth="1.3" />
                )}
                {!compact && (
                  <TangentText r={(o0 + o1) / 2} angle={mid} fontSize={n.symbol.length > 2 ? 9.5 : 11} fontWeight="700" fill="var(--fg)" style={HALO}>
                    {n.symbol}
                  </TangentText>
                )}
                {state.partial && !compact && <circle {...polar(o1 - 5, a1 - 1.6)} r="2" fill="var(--c-attention)" />}
              </g>
            )
          })}
          {outerGroups.map((g) => (
            <g key={g.cat} pointerEvents="none">
              <path d={arc(compact ? o1 + 5 : BAND, g.a0, g.a1)} fill="none" stroke={`var(--k-${g.cat})`} strokeOpacity="0.8" strokeWidth="2.5" strokeLinecap="round" />
              {!compact && (
                <text fontSize="10" fontWeight="600" letterSpacing="2.4" fill={`var(--k-${g.cat})`} fillOpacity="0.85">
                  <textPath href={`#out-${g.cat}`} startOffset="50%" textAnchor="middle">
                    {CATEGORY_LABEL[g.cat].replace('Essential ', '').toUpperCase()}
                  </textPath>
                </text>
              )}
            </g>
          ))}
        </g>

      {/* ── Hub ── */}
      <circle cx={C} cy={C} r={HUB} fill="var(--bg)" stroke="var(--line)" strokeWidth="1.5" />
      {coreGroups.map((g) => (
        <path key={g.cat} d={arc(HUB + 4, g.a0, g.a1)} fill="none" stroke={`var(--k-${g.cat})`} strokeOpacity="0.8" strokeWidth="2.5" strokeLinecap="round" pointerEvents="none" />
      ))}
      {coreGroups.map((g) => (
        <text key={g.cat} fontSize={8 * k} fontWeight="600" letterSpacing="2" fill={`var(--k-${g.cat})`} fillOpacity="0.85" pointerEvents="none">
          <textPath href={`#hub-${g.cat}`} startOffset="50%" textAnchor="middle">
            {CATEGORY_LABEL[g.cat].toUpperCase()}
          </textPath>
        </text>
      ))}
      <Hub
        state={hovered}
        score={score}
        k={k}
        compare={compare}
        meals={byMeal ? meals : null}
        range={hovered ? (range?.get(hovered.nutrient.id) ?? null) : null}
        overlay={overlay}
        footprintCount={footprintCount}
      />
    </svg>
  )
}

function Hub({
  state,
  score,
  k,
  compare,
  meals,
  range,
  overlay,
  footprintCount,
}: {
  state: NutrientState | null
  score: DayScore
  k: number
  compare: Props['compare']
  meals: Props['meals']
  range: { min: number; max: number; days: number } | null
  overlay: AtlasOverlay | null
  footprintCount: number
}) {
  if (!state && overlay) {
    const preview = overlay.kind === 'preview'
    const to = overlay.score?.to ?? 0
    return (
      <g pointerEvents="none">
        <text x={C} y={C - 34} textAnchor="middle" fontSize="7.5" letterSpacing="1.6" fill="var(--muted)">
          {preview ? 'IF YOU ADD' : 'FOOTPRINT OF'}
        </text>
        <text x={C} y={C - 20} textAnchor="middle" fontSize="9.5" fill="var(--fg)" fontWeight="600">
          {clip(overlay.name, 24)}
        </text>
        <text x={C} y={C + 12} textAnchor="middle" fontSize="30" fontWeight="750" fill={preview ? scoreColor(to) : 'var(--fg)'} fontFamily="var(--font-mono)">
          {preview ? Math.round(to) : footprintCount}
          {preview && <tspan fontSize="13" fill="var(--muted)">%</tspan>}
        </text>
        <text x={C} y={C + 30} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="var(--font-mono)">
          {preview ? `score, now ${Math.round(overlay.score?.from ?? 0)}% (+${Math.round(to - (overlay.score?.from ?? 0))})` : 'nutrients ≥ 10% of target'}
        </text>
      </g>
    )
  }
  if (!state) {
    const color = scoreColor(score.score)
    const r = HUB - 26
    const circ = 2 * Math.PI * r
    return (
      <g pointerEvents="none">
        <circle cx={C} cy={C} r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx={C}
          cy={C}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score.score / 100)}
          transform={`rotate(-90 ${C} ${C})`}
        />
        <text x={C} y={C - 4} textAnchor="middle" fontSize={34 * Math.min(k, 1.2)} fontWeight="750" fill="var(--fg)" fontFamily="var(--font-mono)">
          {Math.round(score.score)}
          <tspan fontSize="14" fill="var(--muted)">%</tspan>
        </text>
        <text x={C} y={C + 18} textAnchor="middle" fontSize="8" letterSpacing="1.6" fill="var(--muted)">
          NOURISHED
        </text>
        <text x={C} y={C + 31} textAnchor="middle" fontSize="8.5" fill="var(--dim)" fontFamily="var(--font-mono)">
          {score.tracked.met}/{score.tracked.total} met
        </text>
      </g>
    )
  }
  const { nutrient: n, status, pct, intake } = state
  const meta = STATUS_META[status]
  const { suppPct, foodPct } = split(state)
  const prev = compare?.pct.get(n.id) ?? null
  const ov = overlay?.pct.get(n.id) ?? 0
  return (
    <g pointerEvents="none">
      {overlay && (
        <text x={C} y={C - 58} textAnchor="middle" fontSize="7.5" fill="var(--fg)" fontFamily="var(--font-mono)">
          {overlay.kind === 'preview' ? `+${Math.round(ov)}% → ${Math.round((pct ?? 0) + ov)}%` : `${clip(overlay.name, 14)}: ${Math.round(ov)}%`}
        </text>
      )}
      <text x={C} y={C - 30} textAnchor="middle" fontSize="10" fill="var(--dim)">
        {n.name.length > 16 ? n.symbol : n.name}
      </text>
      <text x={C} y={C + 2} textAnchor="middle" fontSize="28" fontWeight="750" fill={meta.color} fontFamily="var(--font-mono)">
        {pct != null ? `${Math.round(pct)}%` : status === 'noData' ? '—' : fmt(intake!.amount)}
        {pct == null && status !== 'noData' && <tspan fontSize="11" fill="var(--muted)"> {n.unit}</tspan>}
      </text>
      <text x={C} y={C + 20} textAnchor="middle" fontSize="8.5" fill="var(--muted)" fontFamily="var(--font-mono)">
        {status === 'noData' ? 'no data logged' : n.target != null ? `${fmt(intake!.amount)} / ${fmt(n.target)} ${n.unit}` : 'no official target'}
      </text>
      <text x={C} y={C + 34} textAnchor="middle" fontSize="8" letterSpacing="1.2" fill={meta.color}>
        {meta.label.toUpperCase()}
      </text>
      {meals && state.pct != null ? (
        <text x={C} y={C + 49} textAnchor="middle" fontSize="8" fill="var(--dim)" fontFamily="var(--font-mono)">
          {mealStack(n, meals)
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 3)
            .map((m, i) => (
              <tspan key={m.meal} style={{ fill: `var(--m-${m.meal})` }}>
                {i ? ' · ' : ''}
                {MEAL_SHORT[m.meal]} {Math.round((m.pct / state.pct!) * 100)}%
              </tspan>
            ))}
        </text>
      ) : suppPct > 0 && (
        <text x={C} y={C + 49} textAnchor="middle" fontSize="8" fill="var(--dim)" fontFamily="var(--font-mono)">
          food {Math.round(foodPct)}% · supp {Math.round(suppPct)}%
        </text>
      )}
      {range && (
        <text x={C} y={C + 61} textAnchor="middle" fontSize="7.5" fill="var(--muted)" fontFamily="var(--font-mono)">
          range {Math.round(range.min)}–{Math.round(range.max)}% · {range.days}d
        </text>
      )}
      {prev != null && (
        <text x={C} y={C - 46} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="var(--font-mono)">
          {compare!.label}: <tspan fill="var(--dim)">{Math.round(prev)}%</tspan>
        </text>
      )}
    </g>
  )
}
