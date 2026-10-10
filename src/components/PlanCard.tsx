import { useEffect, useMemo, useRef, useState } from 'react'
import { planNextDay } from '../data/usdaClient'
import { mealForTime } from '../db/db'
import { addDays, formatDay } from '../lib/history'
import { clearPlan, isEaten, markLogged, savePlan, useSavedPlan, type SavedPlan } from '../lib/dayPlan'
import { logPick, toPickToLog, type PickToLog } from '../lib/logPick'
import { scoreColor } from '../lib/status'
import type { DayPlan } from '../lib/suggestUsda'
import { useProfile } from '../state/profile'
import type { NutrientState } from '../types'
import { OwnBadge, shortName, type FoodPreview } from './StatCards'
import { useOwnCandidates } from './useOwnCandidates'

const PREVIEW_KEY = 'plan'

const sum = (items: { nutrients: Record<string, number> }[]) => {
  const out: Record<string, number> = {}
  for (const i of items) for (const [k, v] of Object.entries(i.nutrients)) out[k] = (out[k] ?? 0) + v
  return out
}

/**
 * Plan tomorrow: 2–4 foods that close your gaps together, starting from a
 * typical day (your last 7 complete days averaged). Preview them on the Atlas,
 * swap any, save; tomorrow the card lists them for one-tap logging.
 */
export function PlanCard({
  typical,
  today,
  eatenToday,
  onSelect,
  onPreview,
  pinnedPreview,
}: {
  /** States for a typical day (7-day average of complete days), or null before any complete day. */
  typical: NutrientState[] | null
  today: string
  eatenToday: string[]
  onSelect: (id: string) => void
  onPreview: (p: FoodPreview | null, pin?: boolean) => void
  pinnedPreview: string | null
}) {
  const tomorrow = addDays(today, 1)
  const todays = useSavedPlan(today)
  const next = useSavedPlan(tomorrow)
  if (todays === undefined || next === undefined) return null
  // Today's plan (if any) first; planning tomorrow stays available underneath.
  return (
    <>
      {todays && <TodaysPlan plan={todays} today={today} eatenToday={eatenToday} />}
      <PlanMaker
        key={next ? next.createdAt : 'new'}
        typical={typical}
        tomorrow={tomorrow}
        saved={next}
        onSelect={onSelect}
        onPreview={onPreview}
        pinnedPreview={pinnedPreview}
      />
    </>
  )
}

function PlanMaker({
  typical,
  tomorrow,
  saved,
  onSelect,
  onPreview,
  pinnedPreview,
}: {
  typical: NutrientState[] | null
  tomorrow: string
  saved: SavedPlan | null
  onSelect: (id: string) => void
  onPreview: (p: FoodPreview | null, pin?: boolean) => void
  pinnedPreview: string | null
}) {
  const { profile } = useProfile()
  const own = useOwnCandidates()
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [excluded, setExcluded] = useState<string[]>([])
  const run = useRef(0)

  const make = async (exclude: string[], keep?: DayPlan['picks']) => {
    if (!typical) return
    const id = ++run.current
    setBusy(true)
    try {
      const p = await planNextDay(typical, profile.diet, exclude, own, { keep })
      if (id === run.current) setPlan(p)
    } finally {
      if (id === run.current) setBusy(false)
    }
  }
  // A preview of an old plan would be misleading once the plan changes.
  useEffect(() => () => onPreview(null, true), [onPreview])
  const pinnedRef = useRef(pinnedPreview)
  pinnedRef.current = pinnedPreview
  useEffect(() => {
    if (pinnedRef.current === PREVIEW_KEY) onPreview(null, true)
  }, [plan, onPreview])

  const items: PickToLog[] | null = plan ? plan.picks.map(toPickToLog) : saved?.items ?? null
  const preview = (list: PickToLog[]) =>
    onPreview(pinnedPreview === PREVIEW_KEY ? null : { key: PREVIEW_KEY, name: 'the plan', nutrients: sum(list) }, true)

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        <span className="text-(--c-above)">Plan tomorrow</span> · {formatDay(tomorrow, 'short')}
      </h2>
      {saved && !plan && <span className="text-xs text-(--c-good)">Saved ✓</span>}
    </div>
  )

  if (!typical) {
    return (
      <section className="card p-4" aria-label="Plan tomorrow">
        {header}
        <p className="mt-2 text-sm text-(--muted)">Log at least one full day (or tap Done for today) and a plan can build on your usual meals.</p>
      </section>
    )
  }

  if (!items) {
    return (
      <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4" aria-label="Plan tomorrow">
        <div className="min-w-0 flex-1 basis-64">
          {header}
          <p className="mt-1 text-sm text-(--dim)">A few foods that close your gaps together, added to a typical day from your last 7 days.</p>
        </div>
        <button onClick={() => make(excluded)} disabled={busy} className="rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">
          {busy ? 'Planning…' : 'Make a plan'}
        </button>
      </section>
    )
  }

  const before = plan?.before ?? saved?.before ?? 0
  const after = plan?.after ?? saved?.after ?? 0
  const closes = plan ? plan.closed : null
  const kcal = Math.round(items.reduce((a, i) => a + (i.kcal ?? 0), 0))

  return (
    <section className="card p-4" aria-label="Plan tomorrow">
      {header}
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-(--dim)">Your typical day already reaches 80% on everything a food can fix. Nothing to add.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-sm">
              Typical day <span style={{ color: scoreColor(before) }}>{before}%</span> → <span className="font-semibold" style={{ color: scoreColor(after) }}>{after}%</span>
            </span>
            <span className="font-mono text-[11px] text-(--muted)">
              +{kcal} kcal · {items.length} foods
            </span>
          </div>
          {(closes ?? saved?.closes) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {closes
                ? closes.map((st) => (
                    <button
                      key={st.nutrient.id}
                      onClick={() => onSelect(st.nutrient.id)}
                      className="rounded bg-(--c-good)/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-(--c-good)"
                      title={`${st.nutrient.name} reaches 80%+`}
                    >
                      ✓ {st.nutrient.symbol}
                    </button>
                  ))
                : saved!.closes.map((sym) => (
                    <span key={sym} className="rounded bg-(--c-good)/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-(--c-good)">
                      ✓ {sym}
                    </span>
                  ))}
            </div>
          )}
          <ol className="mt-3 divide-y divide-(--line)">
            {items.map((it, i) => (
              <li key={it.key} className="flex items-center gap-3 py-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--panel-2) font-mono text-[11px] text-(--dim)">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={it.name}>
                    {shortName(it.name)}
                    {it.kind !== 'usda' && <OwnBadge kind={it.kind} />}
                  </div>
                  <div className="truncate font-mono text-[11px] text-(--muted)">
                    {it.portion}
                    {it.kcal != null && ` · ${Math.round(it.kcal)} kcal`}
                  </div>
                </div>
                {plan && (
                  <button
                    onClick={() => {
                      // Replace just this food: keep the others, rule this one out.
                      const next = [...excluded, it.name]
                      setExcluded(next)
                      make(next, plan.picks.filter((p) => p.key !== it.key))
                    }}
                    disabled={busy}
                    className="shrink-0 rounded px-2 py-1 text-xs text-(--muted) hover:text-(--fg) disabled:opacity-50"
                    title="Swap for something else"
                    aria-label={`Swap ${shortName(it.name)}`}
                  >
                    ↻ Swap
                  </button>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => preview(items)}
              aria-pressed={pinnedPreview === PREVIEW_KEY}
              className={`rounded-full px-3 py-1.5 text-xs transition ${pinnedPreview === PREVIEW_KEY ? 'bg-(--fg) text-(--bg)' : 'text-(--dim) shadow-[inset_0_0_0_1px_var(--line)] hover:text-(--fg)'}`}
              title="Show on the Atlas what the plan adds"
            >
              ◎ Preview on the Atlas
            </button>
            {plan ? (
              <button
                onClick={async () => {
                  await savePlan({ date: tomorrow, items, before, after, closes: plan.closed.map((s) => s.nutrient.symbol) })
                  setPlan(null)
                }}
                className="rounded-full bg-(--c-good) px-4 py-1.5 text-[13px] font-semibold text-black hover:brightness-110"
              >
                Save for tomorrow
              </button>
            ) : (
              <>
                <button onClick={() => make(excluded)} disabled={busy} className="rounded-full px-3 py-1.5 text-xs text-(--c-above) hover:underline disabled:opacity-50">
                  {busy ? 'Planning…' : 'Make a new plan'}
                </button>
                <button onClick={() => clearPlan(tomorrow)} className="rounded-full px-3 py-1.5 text-xs text-(--muted) hover:text-(--fg)">
                  Clear
                </button>
              </>
            )}
            {plan && (
              <button onClick={() => setPlan(null)} className="rounded-full px-3 py-1.5 text-xs text-(--muted) hover:text-(--fg)">
                {saved ? 'Keep saved plan' : 'Not now'}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-(--muted)">
            Same rules as Best next food: your diet, everyday portions, nothing pushed over a limit. Preview adds the plan to what the Atlas shows now.
          </p>
        </>
      )}
    </section>
  )
}

function TodaysPlan({ plan, today, eatenToday }: { plan: SavedPlan; today: string; eatenToday: string[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const done = useMemo(() => plan.items.filter((i) => isEaten(plan, i, eatenToday)).length, [plan, eatenToday])
  const log = async (it: PickToLog) => {
    if (busy) return
    setBusy(it.key)
    try {
      await logPick(it, today, mealForTime())
      await markLogged(plan.date, it.key)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card p-4" aria-label="Today's plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
          <span className="text-(--c-above)">Today's plan</span> · {done} of {plan.items.length} eaten
        </h2>
        <span className="font-mono text-[11px] text-(--muted)">
          typical day {plan.before}% → {plan.after}%
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-(--panel-2)" aria-hidden>
        <div className="h-full rounded-full bg-(--c-good) transition-all" style={{ width: `${(done / Math.max(1, plan.items.length)) * 100}%` }} />
      </div>
      <ul className="mt-2 divide-y divide-(--line)">
        {plan.items.map((it) => {
          const eaten = isEaten(plan, it, eatenToday)
          return (
            <li key={it.key} className="flex items-center gap-3 py-2">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${eaten ? 'bg-(--c-good) text-black' : 'bg-(--panel-2) text-(--muted)'}`} aria-hidden>
                {eaten ? '✓' : '·'}
              </span>
              <div className={`min-w-0 flex-1 ${eaten ? 'opacity-60' : ''}`}>
                <div className="truncate text-sm font-medium" title={it.name}>
                  {shortName(it.name)}
                  {it.kind !== 'usda' && <OwnBadge kind={it.kind} />}
                </div>
                <div className="truncate font-mono text-[11px] text-(--muted)">{it.portion}</div>
              </div>
              {eaten ? (
                <span className="text-xs text-(--c-good)">Eaten</span>
              ) : (
                <button onClick={() => log(it)} disabled={busy != null} className="shrink-0 rounded-full bg-(--c-good) px-3 py-1 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-50">
                  {busy === it.key ? 'Logging…' : '+ Log'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex justify-between gap-2 text-[11px] text-(--muted)">
        <span>Closes {plan.closes.join(' ') || '—'} on a typical day.</span>
        <button onClick={() => clearPlan(plan.date)} className="hover:text-(--fg)">
          Clear plan
        </button>
      </div>
    </section>
  )
}
