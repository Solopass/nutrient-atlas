import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AtlasChart, type AtlasOverlay } from './components/AtlasChart'
import { AtlasToolbar, ReplayBar } from './components/AtlasToolbar'
import { FoodStrip, type FoodSummary } from './components/FoodStrip'
import { foodLabel } from './components/log/QuickAdd'
import { DetailPanel, type NutrientHistory } from './components/DetailPanel'
import { HistoryPage } from './components/history/HistoryPage'
import { CalendarIcon, GearIcon } from './components/icons'
import { Legend } from './components/Legend'
import { Logo } from './components/Logo'
import { LimitsPanel } from './components/LimitsPanel'
import { PeriodicTable } from './components/PeriodicTable'
import { CategoryPanel, GapsPanel } from './components/SidePanels'
import { StatCards, type FoodPreview } from './components/StatCards'
import { LogSheet, type LogTab } from './components/log/LogSheet'
import { BottomNav } from './components/BottomNav'
import { SettingsPage } from './components/settings/SettingsPage'
import { Onboarding, type OnboardingExit } from './components/onboarding/Onboarding'
import { InsightsCard, useWeeklyReport } from './components/insights/Insights'
import { MOCK_INTAKE } from './data/mockIntake'
import { SCORE_HISTORY } from './data/mockHistory'
import { CORE_CATEGORIES } from './data/nutrients'
import { db, localDate, type LogEntry } from './db/db'
import { hasFood, intakeFromLogs } from './db/logging'
import { addDays, averageIntake, contributors, dailyRange, dateRange, dayHref, formatDay, groupByDate, isValidDate, mealBreakdown, nutrientSeries, scoreForLogs, streakEndingAt } from './lib/history'
import { describeProfile } from './lib/profile'
import { loadSampleData } from './lib/sampleData'
import { ensurePersistentStorage } from './lib/storage'
import { applyDailySupplements } from './lib/supplements'
import { foodStreak } from './lib/streak'
import { dayScore, nutrientState, scoreColor } from './lib/status'
import { atlasPng, shareOrDownload } from './lib/atlasImage'
import { itemsKcal } from './lib/quickLog'
import { useProfile } from './state/profile'
import type { Category, Intake } from './types'

const OUTER: Category[] = ['bvitamin', 'trace', 'fatty', 'amino']
const NO_LOGS: LogEntry[] = []

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

/** Routes: #/  ·  #/day/YYYY-MM-DD  ·  #/history  ·  #/settings  ·  #/welcome (setup) */
export default function App() {
  const route = useHashRoute()
  const [log, setLog] = useState<{ open: boolean; tab: LogTab }>({ open: false, tab: 'search' })
  const openLog = useCallback((tab: LogTab = 'search') => setLog({ open: true, tab }), [])
  const closeLog = useCallback(() => setLog((l) => ({ ...l, open: false })), [])
  const today = useToday()
  useSupplementSync(today)

  const m = route.match(/^day\/(\d{4}-\d{2}-\d{2})$/)
  const date = m && isValidDate(m[1]) && m[1] <= today ? m[1] : today
  const dayCount = useLiveQuery(() => db.logs.where('date').equals(date).count(), [date]) ?? 0

  // First run: show setup until it's finished or skipped, unless a profile was already saved some other way.
  const { isDefault, loaded } = useProfile()
  const onboarded = useLiveQuery(() => db.settings.get('onboarded').then((r) => !!r), [], null)
  const firstRun = loaded && onboarded === false && isDefault && (route === '' || route.startsWith('day/'))
  // Latch: answering the first question saves a profile (isDefault → false), which must not end setup.
  const [inSetup, setInSetup] = useState(false)
  useEffect(() => {
    if (firstRun) setInSetup(true)
  }, [firstRun])
  const needsSetup = inSetup || firstRun
  // Once there's something worth keeping, ask the browser not to clear it under storage pressure.
  useEffect(() => {
    if (onboarded) ensurePersistentStorage()
  }, [onboarded])

  const finishSetup = (exit: OnboardingExit) => {
    setInSetup(false)
    if (location.hash !== '#/') location.hash = '#/'
    if (exit === 'log') openLog('search')
    if (exit === 'sample') loadSampleData()
  }

  let page
  if (route === 'welcome' || needsSetup) page = <Onboarding onFinish={finishSetup} />
  else if (route === 'settings') page = <SettingsPage />
  else if (route === 'history') page = <HistoryPage />
  else if (import.meta.env.DEV && route === 'dev/sample') page = <DevLoadSample />
  else if (import.meta.env.DEV && route === 'dev/crash') page = <DevCrash />
  else page = <Dashboard date={date} openLog={openLog} />

  const title = route === 'welcome' || needsSetup ? 'Setup' : route === 'settings' ? 'Settings' : route === 'history' ? 'History' : date === today ? '' : formatDay(date)
  useEffect(() => {
    document.title = title ? `${title} · Nutrient Atlas` : 'Nutrient Atlas'
  }, [title])

  if (onboarded === null) return null // settings still loading; avoid flashing the dashboard before setup

  return (
    <>
      {page}
      {route !== 'welcome' && !needsSetup && <BottomNav route={route} openLog={openLog} />}
      <LogSheet open={log.open} initialTab={log.tab} onClose={closeLog} todayCount={dayCount} date={date} />
    </>
  )
}

/**
 * Log today's daily supplements on launch, whenever the app returns to the
 * foreground, and when the date rolls over while the app stays open.
 */
function useSupplementSync(today: string) {
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && applyDailySupplements()
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [today])
}

/** The local date, re-rendering when it changes (the app may be left open past midnight). */
function useToday() {
  const [today, setToday] = useState(localDate())
  useEffect(() => {
    const tick = () => setToday(localDate())
    const t = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
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
  // With no complete logged day in the window yet (e.g. your first day), a 7-day view would be empty; show the day instead.
  const week = loggedIn7 > 0 && (profile.atlasRange ? profile.atlasRange === 'week' : loggedIn7 >= 3)
  const dayLogs = useMemo(() => byDate.get(date) ?? [], [byDate, date])
  const foodCount = dayLogs.filter((l) => l.supplementId == null).length
  const suppCount = dayLogs.length - foodCount
  const report = useWeeklyReport(demo ? NO_LOGS : logs, weekEnd)
  const eatenNames = useMemo(() => dayLogs.filter((l) => l.supplementId == null).map((l) => l.name), [dayLogs])

  const { intake, loggedDays } = useMemo(() => {
    if (demo) return { intake: MOCK_INTAKE, loggedDays: 1 }
    // Day view uses the raw day (supplements alone still show); the week view averages food-logged days.
    return week ? averageIntake(byDate, week7) : { intake: intakeFromLogs(dayLogs), loggedDays: hasFood(dayLogs) ? 1 : 0 }
  }, [demo, week, byDate, week7, dayLogs])

  const states = useMemo(() => nutrients.map((n) => nutrientState(n, intake[n.id])), [nutrients, intake])

  // Per-meal split for the "By meal" colouring, and the daily low–high range for the 7-day whiskers.
  const meals = useMemo(
    () => (demo ? null : week ? mealBreakdown(byDate, week7) : mealBreakdown(new Map([[date, dayLogs]]), [date], false)),
    [demo, week, byDate, week7, date, dayLogs],
  )
  const range = useMemo(() => (demo || !week ? null : new Map(nutrients.map((n) => [n.id, dailyRange(n, byDate, week7)]))), [demo, week, nutrients, byDate, week7])

  // Previous period for the Atlas tick marks: the 7 days before the week, or the day before.
  const compare = useMemo(() => {
    if (demo) return null
    let prev: Record<string, Intake>
    let label: string
    if (week) {
      const p = averageIntake(byDate, dateRange(addDays(weekEnd, -7), 7))
      if (!p.loggedDays) return null
      prev = p.intake
      label = 'prior week'
    } else {
      const prevLogs = byDate.get(addDays(date, -1))
      if (!hasFood(prevLogs)) return null
      prev = intakeFromLogs(prevLogs!)
      label = date === today ? 'yesterday' : 'day before'
    }
    const prevStates = nutrients.map((n) => nutrientState(n, prev[n.id]))
    return { label, score: dayScore(prevStates).score, pct: new Map(prevStates.map((s) => [s.nutrient.id, s.pct])) }
  }, [demo, week, byDate, weekEnd, date, today, nutrients])
  const score = useMemo(() => dayScore(states), [states])
  const outerCats = showAdvanced ? [...OUTER, 'advanced' as const] : OUTER
  const core = states.filter((s) => CORE_CATEGORIES.includes(s.nutrient.category))
  const outer = outerCats.flatMap((c) => states.filter((s) => s.nutrient.category === c))

  // ── Replay: step the Atlas through the last 30 days (rolling 7-day averages in the 7-day view) ──
  // In the 7-day view the last frame is the same week the Atlas shows (ending yesterday when viewing today).
  const lapseDates = useMemo(() => dateRange(week ? weekEnd : date, 30), [week, weekEnd, date])
  const [lapse, setLapse] = useState<{ i: number; playing: boolean } | null>(null)
  useEffect(() => setLapse(null), [date, week])
  // Playback steps through logged days only (the slider still reaches every day).
  const lapseLogged = useMemo(
    () => lapseDates.flatMap((d, i) => ((week ? dateRange(d, 7) : [d]).some((x) => hasFood(byDate.get(x))) ? [i] : [])),
    [lapseDates, week, byDate],
  )
  const nextLogged = useCallback((i: number) => lapseLogged.find((x) => x > i) ?? null, [lapseLogged])
  useEffect(() => {
    if (!lapse?.playing) return
    const t = setTimeout(() => setLapse((l) => {
      if (!l) return l
      const n = nextLogged(l.i)
      return n == null ? { ...l, playing: false } : { ...l, i: n }
    }), 650)
    return () => clearTimeout(t)
  }, [lapse, nextLogged])
  const startLapse = () => setLapse({ i: lapseLogged[0] ?? 0, playing: true })
  const lapseDate = lapse ? lapseDates[lapse.i] : null
  const lapseView = useMemo(() => {
    if (!lapseDate) return null
    const days = week ? dateRange(lapseDate, 7) : [lapseDate]
    const intake = week ? averageIntake(byDate, days).intake : intakeFromLogs(byDate.get(lapseDate) ?? [])
    const st = nutrients.map((n) => nutrientState(n, intake[n.id]))
    const logged = days.some((d) => hasFood(byDate.get(d)))
    return { states: st, score: dayScore(st), logged, meals: week ? mealBreakdown(byDate, days) : mealBreakdown(byDate, days, false) }
  }, [lapseDate, week, byDate, nutrients])
  const atlasStates = lapseView?.states ?? states
  const atlasCore = lapseView ? atlasStates.filter((s) => CORE_CATEGORIES.includes(s.nutrient.category)) : core
  const atlasOuter = lapseView ? outerCats.flatMap((c) => atlasStates.filter((s) => s.nutrient.category === c)) : outer

  // ── Food overlays: preview a suggestion (what it would add) or a logged food's footprint ──
  const [hoverPreview, setHoverPreview] = useState<FoodPreview | null>(null)
  const [pinnedPreview, setPinnedPreview] = useState<FoodPreview | null>(null)
  const [footprint, setFootprint] = useState<string | null>(null)
  useEffect(() => {
    setFootprint(null)
    setPinnedPreview(null)
  }, [date, week])
  const onPreview = useCallback((p: FoodPreview | null, pin = false) => {
    if (!pin) return setHoverPreview(p)
    setPinnedPreview(p)
    if (p) {
      setFootprint(null)
      // On small screens the Atlas is below the cards: bring it into view.
      const svg = document.getElementById('atlas-svg')
      const r = svg?.getBoundingClientRect()
      if (svg && r && (r.top > innerHeight * 0.6 || r.bottom < 0)) svg.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])
  const foods = useMemo<FoodSummary[]>(() => {
    if (demo) return []
    const days = week ? week7.filter((d) => hasFood(byDate.get(d))) : [date]
    const map = new Map<string, FoodSummary>()
    for (const l of days.flatMap((d) => byDate.get(d) ?? [])) {
      const f = map.get(l.name) ?? { name: l.name, nutrients: {}, kcal: 0, supplement: l.supplementId != null }
      for (const [id, v] of Object.entries(l.nutrients)) f.nutrients[id] = (f.nutrients[id] ?? 0) + (v * l.multiplier) / days.length
      f.kcal += itemsKcal([l]) / days.length
      map.set(l.name, f)
    }
    return [...map.values()].sort((a, b) => Number(a.supplement) - Number(b.supplement) || b.kcal - a.kcal)
  }, [demo, week, week7, byDate, date])
  const preview = hoverPreview ?? pinnedPreview
  const overlay = useMemo<AtlasOverlay | null>(() => {
    if (lapse) return null
    const toPct = (amounts: Record<string, number>) => new Map(nutrients.filter((n) => n.target).map((n) => [n.id, ((amounts[n.id] ?? 0) / n.target!) * 100]))
    if (preview) {
      const withFood = nutrients.map((n) => {
        const add = preview.nutrients[n.id]
        const cur = intake[n.id]
        return nutrientState(n, add ? { ...(cur ?? { coverage: 1 }), amount: (cur?.amount ?? 0) + add } : cur)
      })
      return { kind: 'preview', name: preview.name, pct: toPct(preview.nutrients), score: { from: score.score, to: dayScore(withFood).score } }
    }
    const f = footprint ? foods.find((x) => x.name === footprint) : null
    return f ? { kind: 'footprint', name: foodLabel(f.name), pct: toPct(f.nutrients) } : null
  }, [lapse, preview, footprint, foods, nutrients, intake, score.score])

  // ── Save the Atlas as an image ──
  const [snapping, setSnapping] = useState(false)
  const snapshot = async () => {
    const svg = document.getElementById('atlas-svg') as SVGSVGElement | null
    if (!svg || snapping) return
    setSnapping(true)
    try {
      const shownDate = lapseDate ?? (week ? weekEnd : date)
      const blob = await atlasPng(svg, {
        title: 'Nutrient Atlas',
        subtitle: `${week ? '7-day average to ' : ''}${formatDay(shownDate)} · ${describeProfile(profile)}`,
        score: (lapseView?.score ?? score).score,
        scoreColor: scoreColor((lapseView?.score ?? score).score),
      })
      await shareOrDownload(blob, `nutrient-atlas-${shownDate}.png`)
    } catch (e) {
      alert(`Couldn't save the image: ${(e as Error).message}`)
    } finally {
      setSnapping(false)
    }
  }

  const history14 = useMemo(
    () => (demo ? [...SCORE_HISTORY.slice(0, -1), score.score] : dateRange(date, 14).map((d) => scoreForLogs(nutrients, byDate.get(d)))),
    [demo, date, nutrients, byDate, score.score],
  )
  // Own query: the 44 days loaded above would cap long streaks.
  const realStreak = useLiveQuery(() => foodStreak(date), [date]) ?? streakEndingAt(byDate, date)
  const streak = demo ? 10 : realStreak

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
            href="#/welcome"
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

        <StatCards states={states} score={score} onSelect={setSelectedId} history={history14} streak={streak} week={week} date={date} eatenNames={eatenNames} prev={compare} inProgress={date === today} onPreview={onPreview} pinnedPreview={pinnedPreview?.key ?? null} />

        {!demo && <InsightsCard report={report} onSelect={setSelectedId} />}

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px] xl:items-center">
          <div className="order-2 xl:order-none">
            <CategoryPanel states={states} categories={[...CORE_CATEGORIES, ...outerCats]} {...sel} />
          </div>
          <div className="order-1 xl:order-none">
            {!demo && (
              <AtlasToolbar
                colorBy={profile.atlasColor}
                onChange={(atlasColor) => update({ atlasColor })}
                meals={lapseView?.meals ?? meals}
                week={week}
                onReplay={startLapse}
                onSnapshot={snapshot}
                snapshotBusy={snapping}
                overlayLabel={
                  lapse ? null : pinnedPreview ? `Previewing ${pinnedPreview.name}` : footprint && overlay ? `Footprint of ${overlay.name}` : null
                }
                onClearOverlay={() => {
                  setPinnedPreview(null)
                  setFootprint(null)
                }}
              />
            )}
            {lapse && lapseView && (
              <ReplayBar
                dates={lapseDates}
                index={lapse.i}
                playing={lapse.playing}
                score={lapseView.score.score}
                logged={lapseView.logged}
                week={week}
                onIndex={(i) => setLapse({ i, playing: false })}
                onToggle={() => setLapse((l) => l && (l.playing ? { ...l, playing: false } : { i: nextLogged(l.i) == null ? (lapseLogged[0] ?? 0) : l.i, playing: true }))}
                onClose={() => setLapse(null)}
              />
            )}
            <AtlasChart
              core={atlasCore}
              outer={atlasOuter}
              score={lapseView?.score ?? score}
              compact={compact}
              compare={lapse ? null : compare}
              colorBy={profile.atlasColor}
              meals={lapseView?.meals ?? meals}
              range={lapse ? null : range}
              overlay={overlay}
              {...sel}
            />
            {!lapse && <FoodStrip foods={foods} active={footprint} week={week} onToggle={(name) => {
              setPinnedPreview(null)
              setFootprint((f) => (f === name ? null : name))
            }} />}
          </div>
          <div className="order-3 xl:order-none">
            <GapsPanel states={states} {...sel} />
          </div>
        </div>

        <LimitsPanel states={states} {...sel} />

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
      // Also skip first-run setup, so headless screenshots land on the dashboard.
      .then(async () => (await db.settings.get('onboarded')) || db.settings.put({ key: 'onboarded', value: new Date().toISOString() }))
      .then(() => (location.hash = '#/'))
  }, [])
  return null
}

/** Dev only: #/dev/crash throws during render, to check the ErrorBoundary recovery screen. */
function DevCrash(): never {
  throw new Error('Test crash from #/dev/crash')
}
