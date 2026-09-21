import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
}

function Card({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex min-w-0 flex-col p-4 ${className}`}>
      <h3 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">{label}</h3>
      {children}
    </section>
  )
}

export function StatCards({ states, score, onSelect, history, streak, week, date, eatenNames }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <ScoreCard history={history} current={score.score} week={week} />
      <StreakCard history={history} streak={streak} />
      <EnergyCard states={states} week={week} />
      <CoverageCard score={score} />
      <NextFoodCard states={states} onSelect={onSelect} date={date} eatenNames={eatenNames} />
    </div>
  )
}

function ScoreCard({ history, current, week }: { history: (number | null)[]; current: number; week: boolean }) {
  const today = current
  const prevDays = history.slice(0, -1).filter((v): v is number => v != null)
  const prev = week
    ? prevDays.length > 7
      ? prevDays.slice(-14, -7).reduce((a, b) => a + b, 0) / Math.min(7, prevDays.slice(-14, -7).length)
      : null
    : prevDays.length
      ? prevDays[prevDays.length - 1]
      : null
  const delta = prev != null ? today - prev : null
  const logged = history.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as [number, number][]
  const avg = logged.length ? logged.slice(-7).reduce((a, [, v]) => a + v, 0) / Math.min(7, logged.length) : 0

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
        {delta != null && (
          <span className={`font-mono text-xs ${delta >= 0 ? 'text-(--c-good)' : 'text-(--c-deficient)'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))} vs {week ? 'prior week' : 'last day'}
          </span>
        )}
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
        {logged.length > 1 && <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {logged.map(([i, v]) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === history.length - 1 ? 2.6 : 1.6} fill={scoreColor(v)} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-(--muted)">
        <span>14 days</span>
        <span>{logged.length ? `7-day avg ${Math.round(avg)}%` : 'no days logged yet'}</span>
      </div>
    </Card>
  )
}

function StreakCard({ history, streak }: { history: (number | null)[]; streak: number }) {
  const strong = history.filter((v) => v != null && v >= 80).length
  const logged = history.filter((v) => v != null).length

  return (
    <Card label="Consistency">
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight">{streak}</span>
        <span className="text-sm text-(--dim)">day streak</span>
      </div>
      <div className="mt-auto grid grid-cols-14 gap-1 pt-3">
        {history.map((v, i) => (
          <div
            key={i}
            title={v == null ? 'Not logged' : `${Math.round(v)}%`}
            className="aspect-square rounded-[3px]"
            style={{
              background: v == null ? 'transparent' : scoreColor(v),
              opacity: v == null ? 1 : 0.35 + (v / 100) * 0.65,
              boxShadow: v == null ? 'inset 0 0 0 1px var(--line)' : i === history.length - 1 ? '0 0 0 1.5px var(--fg)' : undefined,
            }}
          />
        ))}
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

function NextFoodCard({ states, onSelect, date, eatenNames }: { states: NutrientState[]; onSelect: (id: string) => void; date: string; eatenNames: string[] }) {
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
    ],
    [myFoods, myMeals],
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
    }
    setLogged(s.key)
    setTimeout(() => setLogged(null), 2000)
  }

  const [best, ...alts] = picks ?? []
  return (
    <Card label="Best next food" className="sm:col-span-2 lg:col-span-1">
      {!picks ? (
        <p className="mt-2 text-sm text-(--muted)">Searching 8,000 foods…</p>
      ) : !best ? (
        <p className="mt-2 text-sm text-(--dim)">No gaps a single food can close. Nice.</p>
      ) : (
        <>
          <div className="mt-2 flex items-start justify-between gap-2">
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
            <button
              onClick={() => log(best)}
              className="shrink-0 rounded-full bg-(--c-good) px-3 py-1 text-xs font-semibold text-black hover:brightness-110"
            >
              {logged === best.key ? 'Logged ✓' : '+ Log'}
            </button>
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
                <li key={a.key} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-(--dim)" title={a.name}>
                    {shortName(a.name)}
                    {a.kind !== 'usda' && <OwnBadge kind={a.kind} />}
                    <span className="text-(--muted)"> · closes {a.closes.map((c) => c.nutrient.symbol).join(' ') || '—'}</span>
                  </span>
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

function OwnBadge({ kind }: { kind: 'mine' | 'meal' }) {
  return (
    <span className="ml-1.5 rounded bg-(--c-above)/15 px-1 align-middle font-mono text-[9.5px] font-normal text-(--c-above) uppercase">
      {kind === 'meal' ? 'your meal' : 'your food'}
    </span>
  )
}

/** "Spinach, cooked, boiled, drained" → "Spinach, cooked". */
function shortName(name: string) {
  const [prefix, head, rest] = nameParts(name)
  const qualifier = rest.split(', ').filter(Boolean)[0]
  return `${head}${qualifier ? `, ${qualifier}` : ''}`.replace(/^./, (c) => c.toUpperCase()) + (prefix && !head ? prefix : '')
}
