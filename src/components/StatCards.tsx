import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { loadUsda, nameParts, nutrientsForGrams, type UsdaDb } from '../data/usda'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, localDate, mealForTime } from '../db/db'
import { logNewFood, logSavedFood } from '../db/logging'
import { useProfile } from '../state/profile'
import { STATUS_META, fmt, scoreColor, type DayScore } from '../lib/status'
import { suggestFoods, type FoodSuggestion, type OwnCandidate } from '../lib/suggestUsda'
import { itemsKcal, logSavedMeal } from '../lib/quickLog'
import type { NutrientState, Status } from '../types'

interface Props {
  states: NutrientState[]
  score: DayScore
  onSelect: (id: string) => void
  /** Daily scores for the 14 days ending at the viewed date, oldest first; null = not logged. */
  history: (number | null)[]
  streak: number
  week: boolean
  /** Day being viewed; "+ Log" on a suggestion logs to it. */
  date: string
  /** Foods already eaten in the viewed range, so suggestions add variety. */
  eatenNames: string[]
  /** Score for the previous period (yesterday, or the 7 days before the week); null if it wasn't logged. */
  prev: { score: number; label: string } | null
  /** The last day in `history` is today and still being logged. */
  inProgress: boolean
  /** Show a suggestion on the Atlas: on hover (transient) or pinned with the Preview button. */
  onPreview: (p: FoodPreview | null, pin?: boolean) => void
  pinnedPreview: string | null
}

export interface FoodPreview {
  key: string
  name: string
  nutrients: Record<string, number>
}

function Card({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex min-w-0 flex-col p-4 ${className}`}>
      <h3 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">{label}</h3>
      {children}
    </section>
  )
}

export function StatCards({ states, score, onSelect, history, streak, week, date, eatenNames, prev, inProgress, onPreview, pinnedPreview }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <ScoreCard history={history} current={score.score} week={week} prev={prev} inProgress={inProgress} />
      <StreakCard history={history} streak={streak} inProgress={inProgress} />
      <EnergyCard states={states} week={week} />
      <CoverageCard score={score} />
      <NextFoodCard states={states} onSelect={onSelect} date={date} eatenNames={eatenNames} onPreview={onPreview} pinnedPreview={pinnedPreview} />
    </div>
  )
}

function ScoreCard({ history, current, week, prev, inProgress }: { history: (number | null)[]; current: number; week: boolean; prev: Props['prev']; inProgress: boolean }) {
  const today = current
  // A half-logged today vs a whole yesterday would always look like a drop; compare once the day is done.
  const delta = prev != null && !(inProgress && !week) ? today - prev.score : null
  const logged = history.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as [number, number][]
  // Average of complete days only: a half-logged today would drag it down.
  const last = history.length - 1
  const complete = logged.filter(([i]) => !(inProgress && i === last)).slice(-7)
  const avg = complete.length ? complete.reduce((a, [, v]) => a + v, 0) / complete.length : null
  const partial = inProgress && history[last] != null

  const W = 220
  const H = 44
  const x = (i: number) => (i / (history.length - 1)) * W
  const y = (v: number) => H - 2 - (v / 100) * (H - 4)
  const line = logged.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')
  const color = scoreColor(today)

  return (
    <Card label={week ? 'Nourishment score · 7-day' : 'Nourishment score'}>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-4xl font-semibold tracking-tight" style={{ color }}>
          {Math.round(today)}
          <span className="text-lg text-(--muted)">%</span>
        </span>
        {delta != null &&
          (Math.round(delta) === 0 ? (
            <span className="font-mono text-xs text-(--muted)">= same as {prev!.label}</span>
          ) : (
            <span className={`font-mono text-xs ${delta > 0 ? 'text-(--c-good)' : 'text-(--c-deficient)'}`}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))} vs {prev!.label}
            </span>
          ))}
      </div>
      <svg viewBox={`0 -2 ${W} ${H + 4}`} className="mt-auto h-12 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.35 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(80)} y2={y(80)} stroke="var(--c-good)" strokeOpacity="0.45" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        {logged.length > 1 && (
          <polygon points={`${x(logged[0][0])},${H} ${line} ${x(logged[logged.length - 1][0])},${H}`} fill="url(#spark)" />
        )}
        {logged.length > 1 && <polyline points={partial ? logged.slice(0, -1).map(([i, v]) => `${x(i)},${y(v)}`).join(' ') : line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {/* Today so far: dashed and hollow, since the day isn't over */}
        {partial && logged.length > 1 && (
          <polyline points={logged.slice(-2).map(([i, v]) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        )}
        {logged.map(([i, v]) =>
          partial && i === last ? (
            <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill="var(--panel)" stroke={scoreColor(v)} strokeWidth="1.5">
              <title>Today so far: {Math.round(v)}%</title>
            </circle>
          ) : (
            <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 2.6 : 1.6} fill={scoreColor(v)} vectorEffect="non-scaling-stroke" />
          ),
        )}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-(--muted)">
        <span>14 days</span>
        <span>{partial ? 'today so far ◌ · ' : ''}{avg != null ? `daily avg ${Math.round(avg)}%` : 'no full days yet'}</span>
      </div>
    </Card>
  )
}

function StreakCard({ history, streak, inProgress }: { history: (number | null)[]; streak: number; inProgress: boolean }) {
  const strong = history.filter((v) => v != null && v >= 80).length
  const logged = history.filter((v) => v != null).length

  return (
    <Card label="Consistency">
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight">{streak}</span>
        <span className="text-sm text-(--dim)">day streak</span>
      </div>
      <div className="mt-auto grid grid-cols-14 gap-1 pt-3">
        {history.map((v, i) => {
          const today = inProgress && i === history.length - 1
          return (
            <div
              key={i}
              title={v == null ? (today ? 'Today: nothing logged yet' : 'Not logged') : today ? `Today so far: ${Math.round(v)}%` : `${Math.round(v)}%`}
              className="aspect-square rounded-[3px]"
              style={
                today
                  ? { boxShadow: `inset 0 0 0 1.5px ${v == null ? 'var(--dim)' : scoreColor(v)}`, background: v == null ? 'transparent' : `color-mix(in oklab, ${scoreColor(v)} 25%, transparent)` }
                  : {
                      background: v == null ? 'transparent' : scoreColor(v),
                      opacity: v == null ? 1 : 0.35 + (v / 100) * 0.65,
                      boxShadow: v == null ? 'inset 0 0 0 1px var(--line)' : i === history.length - 1 ? '0 0 0 1.5px var(--fg)' : undefined,
                    }
              }
            />
          )
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-(--muted)">
        <span>
          {logged}/{history.length} logged
        </span>
        <span>{strong} days ≥ 80%</span>
      </div>
    </Card>
  )
}

function EnergyCard({ states, week }: { states: NutrientState[]; week: boolean }) {
  const { energyKcal: ENERGY_TARGET_KCAL } = useProfile()
  const g = (id: string) => states.find((s) => s.nutrient.id === id)?.intake?.amount ?? 0
  const macros = [
    { key: 'Protein', grams: g('protein'), kcal: g('protein') * 4, color: 'var(--k-macro)' },
    { key: 'Carbs', grams: g('carbs'), kcal: g('carbs') * 4, color: 'var(--k-vitamin)' },
    { key: 'Fat', grams: g('fat'), kcal: g('fat') * 9, color: 'var(--k-fatty)' },
    // Alcohol is 7 kcal/g; only shown when there is some.
    ...(g('alcohol') > 0 ? [{ key: 'Alcohol', grams: g('alcohol'), kcal: g('alcohol') * 7, color: 'var(--k-limit)' }] : []),
  ]
  const total = macros.reduce((a, m) => a + m.kcal, 0)

  return (
    <Card label={week ? 'Energy · daily avg' : 'Energy'}>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight">{fmt(total)}</span>
        <span className="font-mono text-xs text-(--muted)">/ {ENERGY_TARGET_KCAL.toLocaleString()} kcal</span>
      </div>
      <div className="mt-auto flex h-2 overflow-hidden rounded-full bg-(--panel-2)">
        {macros.map((m) => (
          <div key={m.key} style={{ width: `${(m.kcal / Math.max(total, ENERGY_TARGET_KCAL)) * 100}%`, background: m.color }} />
        ))}
      </div>
      <div className={`mt-2 grid gap-1 font-mono text-[10px] ${macros.length > 3 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {macros.map((m) => (
          <div key={m.key}>
            <div className="flex items-center gap-1 text-(--muted)">
              <span className="size-1.5 rounded-full" style={{ background: m.color }} />
              {m.key}
            </div>
            <div className="text-(--dim)">
              {Math.round(m.grams)}g · {total ? Math.round((m.kcal / total) * 100) : 0}%
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

const DIST: Status[] = ['good', 'above', 'overLimit', 'attention', 'deficient', 'noData']

function CoverageCard({ score }: { score: DayScore }) {
  const total = DIST.reduce((a, s) => a + score.counts[s], 0)
  return (
    <Card label="Nutrient coverage">
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight">{score.tracked.met}</span>
        <span className="font-mono text-xs text-(--muted)">/ {score.tracked.total} met</span>
        <span className="ml-auto font-mono text-xs text-(--dim)">
          core {score.core.met}/{score.core.total}
        </span>
      </div>
      <div className="mt-auto flex h-2 gap-0.5 overflow-hidden rounded-full">
        {DIST.filter((s) => score.counts[s] > 0).map((s) => (
          <div key={s} style={{ flexGrow: score.counts[s], background: STATUS_META[s].color }} title={`${STATUS_META[s].label}: ${score.counts[s]}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-(--muted)">
        {DIST.filter((s) => score.counts[s] > 0).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="size-1.5 rounded-full" style={{ background: STATUS_META[s].color }} />
            {score.counts[s]} {STATUS_META[s].label.split(' ')[0].toLowerCase()}
          </span>
        ))}
        <span className="sr-only">of {total}</span>
      </div>
    </Card>
  )
}

function NextFoodCard({
  states,
  onSelect,
  date,
  eatenNames,
  onPreview,
  pinnedPreview,
}: {
  states: NutrientState[]
  onSelect: (id: string) => void
  date: string
  eatenNames: string[]
  onPreview: Props['onPreview']
  pinnedPreview: string | null
}) {
  const { profile } = useProfile()
  const [usda, setUsda] = useState<UsdaDb | null>(null)
  const [logged, setLogged] = useState<string | null>(null)
  const logging = useRef(new Set<string>())
  useEffect(() => {
    loadUsda().then(setUsda, () => {})
  }, [])
  // Your saved foods and meals compete with USDA foods (with a small nudge, since you already eat them).
  const myFoods = useLiveQuery(() => db.foods.toArray(), [])
  const myMeals = useLiveQuery(() => db.meals.toArray(), [])
  // Packaged foods you rated in Products compete too (not the ones you rated 1–2 stars).
  const myProducts = useLiveQuery(() => db.products.where('kind').equals('food').toArray(), [])
  const own = useMemo<OwnCandidate[]>(
    () => [
      ...(myFoods ?? [])
        .filter((f) => f.source !== 'usda') // USDA foods are already candidates
        .map((f) => ({ kind: 'mine' as const, key: `food-${f.id}`, name: f.name, portion: f.serving, nutrients: f.nutrients, kcal: itemsKcal([{ multiplier: 1, nutrients: f.nutrients }]), foodId: f.id })),
      ...(myMeals ?? []).map((m) => {
        const nutrients: Record<string, number> = {}
        for (const i of m.items) for (const [k, v] of Object.entries(i.nutrients)) nutrients[k] = (nutrients[k] ?? 0) + (v * i.multiplier) / m.servings
        return { kind: 'meal' as const, key: `meal-${m.id}`, name: m.name, portion: m.servings > 1 ? `1 of ${m.servings} portions` : 'saved meal', nutrients, kcal: itemsKcal(m.items) / m.servings, mealId: m.id }
      }),
      ...(myProducts ?? [])
        .filter((p) => (p.rating ?? 3) >= 3)
        .map((p) => ({ kind: 'product' as const, key: `product-${p.id}`, name: p.brand ? `${p.brand} ${p.name}` : p.name, portion: p.serving, nutrients: p.nutrients, kcal: p.kcal ?? itemsKcal([{ multiplier: 1, nutrients: p.nutrients }]), productId: p.id, grams: p.grams })),
    ],
    [myFoods, myMeals, myProducts],
  )
  const picks = useMemo(() => (usda ? suggestFoods(states, usda, profile.diet, eatenNames, 3, own) : null), [usda, states, profile.diet, eatenNames, own])

  const log = async (s: FoodSuggestion) => {
    // Ref, not state: two taps before the next render would both see stale state.
    if (logging.current.has(s.key)) return
    logging.current.add(s.key)
    setTimeout(() => logging.current.delete(s.key), 2000)
    const meal = date === localDate() ? mealForTime() : 'snack'
    if (s.kind === 'usda' && s.food && s.grams) {
      await logNewFood({ name: s.food.name, serving: s.portion, grams: s.grams, nutrients: nutrientsForGrams(s.food, s.grams), source: 'usda' }, meal, 1, date)
    } else if (s.kind === 'mine' && s.foodId != null) {
      const food = await db.foods.get(s.foodId)
      if (food) await logSavedFood(food, meal, 1, date)
    } else if (s.kind === 'meal' && s.mealId != null) {
      await logSavedMeal(s.mealId, date, meal)
    } else if (s.kind === 'product') {
      await logNewFood({ name: s.name, serving: s.portion, grams: s.grams, nutrients: s.nutrients, source: 'custom' }, meal, 1, date)
    }
    setLogged(s.key)
    setTimeout(() => setLogged(null), 2000)
    // It's in the log now; a ghost on top would count it twice.
    onPreview(null, true)
    onPreview(null)
  }

  const asPreview = (s: FoodSuggestion): FoodPreview => ({ key: s.key, name: shortName(s.name), nutrients: s.nutrients })
  // Hover previews on the Atlas (mouse only; a tap is for logging).
  const hover = (s: FoodSuggestion) => ({
    onPointerEnter: (e: ReactPointerEvent) => e.pointerType === 'mouse' && onPreview(asPreview(s)),
    onPointerLeave: () => onPreview(null),
  })
  const previewBtn = (s: FoodSuggestion) => (
    <button
      onClick={() => onPreview(pinnedPreview === s.key ? null : asPreview(s), true)}
      aria-pressed={pinnedPreview === s.key}
      title="Show on the Atlas what this would add"
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] transition ${pinnedPreview === s.key ? 'bg-(--fg) text-(--bg)' : 'text-(--muted) shadow-[inset_0_0_0_1px_var(--line)] hover:text-(--fg)'}`}
    >
      ◎ Preview
    </button>
  )

  const [best, ...alts] = picks ?? []
  return (
    <Card label="Best next food" className="sm:col-span-2 2xl:col-span-1">
      {!picks ? (
        <p className="mt-2 text-sm text-(--muted)">Searching 8,000 foods…</p>
      ) : !best ? (
        <p className="mt-2 text-sm text-(--dim)">No gaps a single food can close. Nice.</p>
      ) : (
        <>
          <div className="mt-2 flex items-start justify-between gap-2" {...hover(best)}>
            <div className="min-w-0">
              <div className="truncate text-lg leading-tight font-semibold" title={best.name}>
                {shortName(best.name)}
                {best.kind !== 'usda' && <OwnBadge kind={best.kind} />}
              </div>
              <div className="truncate font-mono text-[11px] text-(--muted)">
                {best.portion}
                {best.kcal != null && ` · ${Math.round(best.kcal)} kcal`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {previewBtn(best)}
              <button onClick={() => log(best)} className="shrink-0 rounded-full bg-(--c-good) px-3 py-1 text-xs font-semibold text-black hover:brightness-110">
                {logged === best.key ? 'Logged ✓' : '+ Log'}
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[...best.closes, ...best.helps].slice(0, 7).map((st) => {
              const closes = best.closes.includes(st)
              return (
                <button
                  key={st.nutrient.id}
                  onClick={() => onSelect(st.nutrient.id)}
                  className="rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
                  style={{
                    color: closes ? 'var(--c-good)' : 'var(--c-attention)',
                    background: `color-mix(in oklab, ${closes ? 'var(--c-good)' : 'var(--c-attention)'} 16%, transparent)`,
                  }}
                  title={`${st.nutrient.name}: ${Math.round(st.pct!)}% now`}
                >
                  {closes ? '✓' : '↑'} {st.nutrient.symbol}
                </button>
              )
            })}
          </div>
          {alts.length > 0 && (
            <ul className="mt-auto space-y-1 border-t border-(--line) pt-2">
              {alts.map((a) => (
                <li key={a.key} className="flex items-center gap-2 text-xs" {...hover(a)}>
                  <span className="min-w-0 flex-1 truncate text-(--dim)" title={a.name}>
                    {shortName(a.name)}
                    {a.kind !== 'usda' && <OwnBadge kind={a.kind} />}
                    <span className="text-(--muted)"> · closes {a.closes.map((c) => c.nutrient.symbol).join(' ') || '—'}</span>
                  </span>
                  {previewBtn(a)}
                  <button onClick={() => log(a)} className="shrink-0 text-(--c-above) hover:underline">
                    {logged === a.key ? '✓' : '+ Log'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function OwnBadge({ kind }: { kind: 'mine' | 'meal' | 'product' }) {
  return (
    <span className="ml-1.5 rounded bg-(--c-above)/15 px-1 align-middle font-mono text-[9.5px] font-normal text-(--c-above) uppercase">
      {kind === 'meal' ? 'your meal' : kind === 'product' ? 'rated' : 'your food'}
    </span>
  )
}

/** "Spinach, cooked, boiled, drained" → "Spinach, cooked". */
function shortName(name: string) {
  const [prefix, head, rest] = nameParts(name)
  const qualifier = rest.split(', ').filter(Boolean)[0]
  return `${head}${qualifier ? `, ${qualifier}` : ''}`.replace(/^./, (c) => c.toUpperCase()) + (prefix && !head ? prefix : '')
}
