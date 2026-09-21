import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AtlasChart } from './components/AtlasChart'
import { DetailPanel, type NutrientHistory } from './components/DetailPanel'
import { HistoryPage } from './components/history/HistoryPage'
import { CalendarIcon, GearIcon } from './components/icons'
import { Legend } from './components/Legend'
import { Logo } from './components/Logo'
import { PeriodicTable } from './components/PeriodicTable'
import { CategoryPanel, GapsPanel } from './components/SidePanels'
import { StatCards } from './components/StatCards'
import { LogSheet, type LogTab } from './components/log/LogSheet'
import { BottomNav } from './components/BottomNav'
import { SettingsPage } from './components/settings/SettingsPage'
import { MOCK_INTAKE } from './data/mockIntake'
import { SCORE_HISTORY } from './data/mockHistory'
import { CORE_CATEGORIES } from './data/nutrients'
import { db, localDate } from './db/db'
import { hasFood, intakeFromLogs } from './db/logging'
import { addDays, averageIntake, contributors, dateRange, dayHref, formatDay, groupByDate, isValidDate, nutrientSeries, scoreForLogs, streakEndingAt } from './lib/history'
import { describeProfile } from './lib/profile'
import { loadSampleData } from './lib/sampleData'
import { applyDailySupplements } from './lib/supplements'
import { dayScore, nutrientState } from './lib/status'
import { useProfile } from './state/profile'
import type { Category } from './types'

const OUTER: Category[] = ['bvitamin', 'trace', 'fatty', 'amino']

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
  )
}

function useHashRoute() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    () => location.hash.replace(/^#\/?/, ''),
  )
}

/** Routes: #/  ·  #/day/YYYY-MM-DD  ·  #/history  ·  #/settings */
export default function App() {
  const route = useHashRoute()
  const [log, setLog] = useState<{ open: boolean; tab: LogTab }>({ open: false, tab: 'search' })
  const openLog = useCallback((tab: LogTab = 'search') => setLog({ open: true, tab }), [])
  const closeLog = useCallback(() => setLog((l) => ({ ...l, open: false })), [])
  useSupplementSync()

  const m = route.match(/^day\/(\d{4}-\d{2}-\d{2})$/)
  const date = m && isValidDate(m[1]) && m[1] <= localDate() ? m[1] : localDate()
  const dayCount = useLiveQuery(() => db.logs.where('date').equals(date).count(), [date]) ?? 0

  let page
  if (route === 'settings') page = <SettingsPage />
  else if (route === 'history') page = <HistoryPage />
  else if (import.meta.env.DEV && route === 'dev/sample') page = <DevLoadSample />
  else page = <Dashboard date={date} openLog={openLog} />

  return (
    <>
      {page}
      <BottomNav route={route} openLog={openLog} />
      <LogSheet open={log.open} initialTab={log.tab} onClose={closeLog} todayCount={dayCount} date={date} />
    </>
  )
}

/** Log today's daily supplements on launch and whenever the app returns to the foreground (e.g. the next morning). */
function useSupplementSync() {
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && applyDailySupplements()
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [])
}

function Dashboard({ date, openLog }: { date: string; openLog: (tab?: LogTab) => void }) {
  const { profile, isDefault, nutrients, update } = useProfile()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const showAdvanced = profile.showAdvanced
  const compact = !useMedia('(min-width: 768px)')
  const today = localDate()

  // 44 days back covers the 30-day trend plus the prior-week comparison.
  const from = addDays(date, -43)
  const logs = useLiveQuery(() => db.logs.where('date').between(from, date, true, true).toArray(), [from, date])
  const totalLogs = useLiveQuery(() => db.logs.count(), [])
  const demo = totalLogs === 0
  const byDate = useMemo(() => groupByDate(logs ?? []), [logs])

  // Today is still in progress, so the 7-day view of today uses the 7 complete days before it.
  const weekEnd = date === today ? addDays(date, -1) : date
  const week7 = useMemo(() => dateRange(weekEnd, 7), [weekEnd])
  const loggedIn7 = week7.filter((d) => hasFood(byDate.get(d))).length
  const week = profile.atlasRange ? profile.atlasRange === 'week' : loggedIn7 >= 3
  const dayLogs = useMemo(() => byDate.get(date) ?? [], [byDate, date])
  const foodCount = dayLogs.filter((l) => l.supplementId == null).length
  const suppCount = dayLogs.length - foodCount

  const { intake, loggedDays } = useMemo(() => {
    if (demo) return { intake: MOCK_INTAKE, loggedDays: 1 }
    // Day view uses the raw day (supplements alone still show); the week view averages food-logged days.
    return week ? averageIntake(byDate, week7) : { intake: intakeFromLogs(dayLogs), loggedDays: hasFood(dayLogs) ? 1 : 0 }
  }, [demo, week, byDate, week7, dayLogs])

  const states = useMemo(() => nutrients.map((n) => nutrientState(n, intake[n.id])), [nutrients, intake])
  const score = useMemo(() => dayScore(states), [states])
  const outerCats = showAdvanced ? [...OUTER, 'advanced' as const] : OUTER
  const core = states.filter((s) => CORE_CATEGORIES.includes(s.nutrient.category))
  const outer = outerCats.flatMap((c) => states.filter((s) => s.nutrient.category === c))

  const history14 = useMemo(
    () => (demo ? [...SCORE_HISTORY.slice(0, -1), score.score] : dateRange(date, 14).map((d) => scoreForLogs(nutrients, byDate.get(d)))),
    [demo, date, nutrients, byDate, score.score],
  )
  const streak = demo ? 10 : streakEndingAt(byDate, date)

  const selected = states.find((s) => s.nutrient.id === selectedId) ?? null
  const nutrientHistory = useMemo<NutrientHistory | null>(() => {
    if (demo || !selected) return null
    const dates = dateRange(date, 30)
    const rangeLogs = (week ? week7 : [date]).flatMap((d) => byDate.get(d) ?? [])
    return {
      dates,
      series: nutrientSeries(selected.nutrient, byDate, dates),
      contributors: contributors(rangeLogs, selected.nutrient.id),
      rangeLabel: week ? (date === today ? '7 days before today' : 'last 7 days') : formatDay(date, 'short').toLowerCase(),
    }
  }, [demo, selected, date, week, week7, byDate])

  const close = useCallback(() => setSelectedId(null), [])
  const sel = { selectedId, onSelect: setSelectedId }
  const empty = !demo && logs != null && (week ? loggedDays === 0 : dayLogs.length === 0)

  // Avoid flashing an all-"no data" Atlas while IndexedDB answers.
  if (logs === undefined || totalLogs === undefined) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-(--muted)">
          <span className="animate-pulse">
            <Logo />
          </span>
          Loading your log…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,#101a2b_0%,var(--bg)_70%)]">
      <header className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Nutrient Atlas</h1>
            <p className="text-[13px] text-(--muted)">
              {demo ? (
                <span className="text-(--c-attention)">Demo data. Log a meal to see yours</span>
              ) : week ? (
                `7-day average · ${loggedDays} of 7 days logged${date === today ? ' · today not included' : ''}`
              ) : (
                `${foodCount} item${foodCount === 1 ? '' : 's'} logged${suppCount ? ` · ${suppCount} supplement${suppCount === 1 ? '' : 's'}` : ''}`
              )}
              <span className="mx-1 opacity-50">·</span>
              <a href="#/settings" className="hover:text-(--fg)">
                {describeProfile(profile)}
              </a>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateNav date={date} today={today} />
          <div className="inline-flex rounded-full bg-(--panel) p-0.5 shadow-[inset_0_0_0_1px_var(--line)]" role="group" aria-label="Atlas range">
            {(['day', 'week'] as const).map((r) => (
              <button
                key={r}
                onClick={() => update({ atlasRange: r })}
                aria-pressed={(r === 'week') === week}
                title={r === 'week' ? 'Average of logged days in the last 7 days' : 'Just this day'}
                className={`rounded-full px-3 py-1 text-[13px] transition ${(r === 'week') === week ? 'bg-(--panel-2) text-(--fg) shadow-[inset_0_0_0_1px_var(--line)]' : 'text-(--muted) hover:text-(--dim)'}`}
              >
                {r === 'day' ? 'Day' : '7 days'}
              </button>
            ))}
          </div>
          <button
            onClick={() => openLog()}
            className="hidden items-center gap-1.5 rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white shadow-[0_0_24px_-6px_var(--c-above)] transition hover:brightness-110 sm:flex"
          >
            <span className="text-base leading-none">+</span> Log food
          </button>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-full border border-(--line) bg-(--panel) px-3 py-1.5 text-[13px] text-(--dim) select-none">
            <span className={`relative h-4 w-7 rounded-full transition ${showAdvanced ? 'bg-(--c-above)' : 'bg-(--panel-2) shadow-[inset_0_0_0_1px_var(--line)]'}`}>
              <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${showAdvanced ? 'left-3.5' : 'left-0.5'}`} />
            </span>
            <input type="checkbox" className="sr-only" checked={showAdvanced} onChange={(e) => update({ showAdvanced: e.target.checked })} />
            Advanced
          </label>
          <a href="#/history" aria-label="History" title="History" className="hidden size-8 place-items-center rounded-full border border-(--line) bg-(--panel) text-(--dim) transition hover:text-(--fg) sm:grid">
            <CalendarIcon />
          </a>
          <a href="#/settings" aria-label="Settings" title="Settings" className="hidden size-8 place-items-center rounded-full border border-(--line) bg-(--panel) text-(--dim) transition hover:text-(--fg) sm:grid">
            <GearIcon />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 pb-28 sm:px-6 sm:pb-12">
        {isDefault && (
          <a
            href="#/settings"
            className="card flex items-center gap-3 p-3.5 text-sm transition hover:brightness-110"
            style={{ boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--c-above) 45%, transparent)' }}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-(--c-above)/20 text-(--c-above)">
              <GearIcon />
            </span>
            <span className="flex-1">
              <span className="font-medium">Set up your profile.</span>{' '}
              <span className="text-(--dim)">Targets currently use a default adult male profile. Your age, sex, weight and goal change most of them.</span>
            </span>
            <span className="text-(--c-above)">→</span>
          </a>
        )}

        {demo && (
          <div className="card flex flex-wrap items-center gap-3 p-3.5 text-sm">
            <span className="flex-1 text-(--dim)">
              <span className="font-medium text-(--c-attention)">You're looking at demo data.</span> Log your first meal, or load three weeks of sample meals
              (real USDA foods) to explore history and the 7-day view. You can remove them in Settings.
            </span>
            <button
              onClick={() => loadSampleData()}
              className="rounded-full border border-(--line) bg-(--panel-2) px-3.5 py-1.5 text-[13px] text-(--dim) hover:border-(--c-above) hover:text-(--fg)"
            >
              Load sample history
            </button>
            <button onClick={() => openLog()} className="rounded-full bg-(--c-above) px-3.5 py-1.5 text-[13px] font-semibold text-white">
              + Log food
            </button>
          </div>
        )}

        {empty && (
          <div className="card flex flex-wrap items-center gap-3 p-3.5 text-sm">
            <span className="flex-1 text-(--dim)">
              {week ? 'Nothing logged in the 7 days up to ' : 'Nothing logged for '}
              <span className="font-medium text-(--fg)">{formatDay(date)}</span>. Every nutrient shows as “no data” until you log something.
            </span>
            <button onClick={() => openLog()} className="rounded-full bg-(--c-above) px-3.5 py-1.5 text-[13px] font-semibold text-white">
              + Log food
            </button>
          </div>
        )}

        <StatCards states={states} score={score} onSelect={setSelectedId} history={history14} streak={streak} week={week} />

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px] xl:items-center">
          <div className="order-2 xl:order-none">
            <CategoryPanel states={states} categories={[...CORE_CATEGORIES, ...outerCats]} {...sel} />
          </div>
          <div className="order-1 xl:order-none">
            <AtlasChart core={core} outer={outer} score={score} compact={compact} {...sel} />
          </div>
          <div className="order-3 xl:order-none">
            <GapsPanel states={states} {...sel} />
          </div>
        </div>

        <PeriodicTable states={states} categories={outerCats} {...sel} />

        <div className="pt-2">
          <Legend />
        </div>
      </main>

      <DetailPanel state={selected} onClose={close} history={nutrientHistory} />
    </div>
  )
}

function DateNav({ date, today }: { date: string; today: string }) {
  const btn = 'grid size-8 place-items-center rounded-full text-(--dim) transition hover:bg-(--panel-2) hover:text-(--fg) disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div className="flex items-center rounded-full bg-(--panel) p-0.5 shadow-[inset_0_0_0_1px_var(--line)]">
      <a href={dayHref(addDays(date, -1))} className={btn} aria-label="Previous day">
        ‹
      </a>
      <label className="relative cursor-pointer px-2 text-[13px] font-medium whitespace-nowrap">
        {formatDay(date)}
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && (location.hash = dayHref(e.target.value))}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick a date"
        />
      </label>
      {date < today ? (
        <a href={dayHref(addDays(date, 1))} className={btn} aria-label="Next day">
          ›
        </a>
      ) : (
        <button className={btn} disabled aria-label="Next day">
          ›
        </button>
      )}
      {date !== today && (
        <a href="#/" className="ml-0.5 rounded-full bg-(--panel-2) px-2.5 py-1 text-[12px] text-(--dim) hover:text-(--fg)">
          Today
        </a>
      )}
    </div>
  )
}

/** Dev only: #/dev/sample loads sample history (if none) and returns to the dashboard. Used for headless screenshots. */
function DevLoadSample() {
  useEffect(() => {
    db.logs
      .filter((l) => l.sample === true)
      .count()
      .then((n) => (n ? 0 : loadSampleData()))
      .then(() => (location.hash = '#/'))
  }, [])
  return null
}
