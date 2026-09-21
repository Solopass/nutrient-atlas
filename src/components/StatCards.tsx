import type { ReactNode } from 'react'
import { DIET_ALLOWS, MOCK_FOODS } from '../data/mockFoods'
import { useProfile } from '../state/profile'
import { STATUS_META, fmt, scoreColor, type DayScore } from '../lib/status'
import { bestNextFood } from '../lib/suggest'
import type { NutrientState, Status } from '../types'

interface Props {
  states: NutrientState[]
  score: DayScore
  onSelect: (id: string) => void
  /** Daily scores for the 14 days ending at the viewed date, oldest first; null = not logged. */
  history: (number | null)[]
  streak: number
  week: boolean
}

function Card({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex min-w-0 flex-col p-4 ${className}`}>
      <h3 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">{label}</h3>
      {children}
    </section>
  )
}

export function StatCards({ states, score, onSelect, history, streak, week }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <ScoreCard history={history} current={score.score} week={week} />
      <StreakCard history={history} streak={streak} />
      <EnergyCard states={states} week={week} />
      <CoverageCard score={score} />
      <NextFoodCard states={states} onSelect={onSelect} />
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
      <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px]">
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

function NextFoodCard({ states, onSelect }: { states: NutrientState[]; onSelect: (id: string) => void }) {
  const { profile } = useProfile()
  const s = bestNextFood(states, MOCK_FOODS.filter((f) => DIET_ALLOWS[profile.diet].includes(f.kind)))
  return (
    <Card label="Best next food" className="sm:col-span-2 lg:col-span-1">
      {s ? (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="truncate text-xl font-semibold">{s.food.name}</span>
            <span className="shrink-0 font-mono text-xs text-(--muted)">{s.food.serving}</span>
          </div>
          <p className="mt-0.5 text-xs text-(--dim)">
            Closes {s.closes.length} gap{s.closes.length === 1 ? '' : 's'}
            {s.helps.length > 0 && `, lifts ${s.helps.length} more`}
          </p>
          <div className="mt-auto flex flex-wrap gap-1 pt-3">
            {[...s.closes, ...s.helps].map((st) => {
              const closes = s.closes.includes(st)
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
        </>
      ) : (
        <p className="mt-2 text-sm text-(--dim)">All gaps closed. Nice.</p>
      )}
    </Card>
  )
}
