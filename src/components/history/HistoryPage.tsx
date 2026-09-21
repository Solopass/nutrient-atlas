import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { CATEGORY_LABEL } from '../../data/nutrients'
import { db, localDate, type LogEntry } from '../../db/db'
import { hasFood } from '../../db/logging'
import { addDays, averageIntake, dateRange, dayHref, formatDay, groupByDate, nutrientSeries, parseDate, scoreForLogs, streakEndingAt } from '../../lib/history'
import { STATUS_META, scoreColor } from '../../lib/status'
import { useProfile } from '../../state/profile'
import type { Category, Nutrient } from '../../types'
import { Logo } from '../Logo'
import { WeeklyReportCard, useWeeklyReport } from '../insights/Insights'

const HEAT_DAYS = 28
const ROW_CATS: Category[] = ['macro', 'vitamin', 'mineral', 'bvitamin', 'trace', 'fatty', 'amino']

export function HistoryPage() {
  const { nutrients } = useProfile()
  const today = localDate()
  const [month, setMonth] = useState(today.slice(0, 7)) // YYYY-MM

  const monthStart = `${month}-01`
  const from = monthStart < addDays(today, -89) ? monthStart : addDays(today, -89)
  const logs = useLiveQuery(() => db.logs.where('date').between(from, today, true, true).toArray(), [from, today])
  const byDate = useMemo(() => groupByDate(logs ?? []), [logs])

  const scores = useMemo(() => {
    const m = new Map<string, number>()
    for (const [d, l] of byDate) {
      const s = scoreForLogs(nutrients, l)
      if (s != null) m.set(d, s)
    }
    return m
  }, [byDate, nutrients])

  const report = useWeeklyReport(logs, addDays(today, -1))

  const last30 = dateRange(today, 30)
  const logged30 = last30.filter((d) => scores.has(d))
  // Today is still in progress: count it as logged, but keep it out of averages.
  const complete30 = logged30.filter((d) => d !== today)
  const avg30 = complete30.length ? complete30.reduce((a, d) => a + scores.get(d)!, 0) / complete30.length : null
  const strong30 = complete30.filter((d) => scores.get(d)! >= 80).length
  const bestStreak = useMemo(() => {
    let best = 0
    let run = 0
    for (const d of dateRange(today, 90)) {
      run = hasFood(byDate.get(d)) ? run + 1 : 0
      best = Math.max(best, run)
    }
    return best
  }, [byDate, today])

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,#101a2b_0%,var(--bg)_70%)]">
      <header className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-6">
        <a href="#/" className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">History</h1>
            <p className="text-[13px] text-(--muted)">Scores and nutrients from your logged days</p>
          </div>
        </a>
        <a href="#/" className="rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white hover:brightness-110">
          ← Back to Atlas
        </a>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 pb-28 sm:px-6 sm:pb-16">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Days logged · 30d" value={`${logged30.length}`} sub="/ 30" />
          <Stat label="Average score · 30d" value={avg30 != null ? `${Math.round(avg30)}%` : '–'} color={avg30 != null ? scoreColor(avg30) : undefined} />
          <Stat label="Days ≥ 80% · 30d" value={`${strong30}`} />
          <Stat label="Current streak" value={`${streakEndingAt(byDate, today)}`} sub="days" />
          <Stat label="Best streak · 90d" value={`${bestStreak}`} sub="days" />
        </div>

        <WeeklyReportCard report={report} />

        <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-5">
            <MonthCalendar month={month} setMonth={setMonth} today={today} scores={scores} byDate={byDate} />
            <PersistentGaps nutrients={nutrients} byDate={byDate} today={today} />
          </div>
          <NutrientHeatmap nutrients={nutrients} byDate={byDate} today={today} />
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10.5px] tracking-[0.16em] text-(--muted) uppercase">{label}</div>
      <div className="mt-1.5 font-mono text-3xl font-semibold" style={{ color }}>
        {value}
        {sub && <span className="ml-1 text-sm text-(--muted)">{sub}</span>}
      </div>
    </div>
  )
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function MonthCalendar({
  month,
  setMonth,
  today,
  scores,
  byDate,
}: {
  month: string
  setMonth: (m: string) => void
  today: string
  scores: Map<string, number>
  byDate: Map<string, LogEntry[]>
}) {
  const first = parseDate(`${month}-01`)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Monday-first
  const shift = (n: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const isCurrent = month === today.slice(0, 7)

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="grid size-8 place-items-center rounded-full text-(--dim) hover:bg-(--panel-2)" aria-label="Previous month">
          ‹
        </button>
        <h2 className="text-sm font-medium">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button
          onClick={() => shift(1)}
          disabled={isCurrent}
          className="grid size-8 place-items-center rounded-full text-(--dim) hover:bg-(--panel-2) disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="pb-1 text-[10px] text-(--muted)">
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`
          const s = scores.get(d)
          const future = d > today
          const items = byDate.get(d)?.filter((l) => l.supplementId == null).length ?? 0
          const inner = (
            <>
              <span className={`text-[11px] ${d === today ? 'font-bold text-(--fg)' : 'text-(--dim)'}`}>{i + 1}</span>
              {s != null && <span className="font-mono text-[10px] font-semibold">{Math.round(s)}</span>}
              {items > 0 && <span className="text-[8px] text-(--muted)">{items} item{items === 1 ? '' : 's'}</span>}
            </>
          )
          const cls = `flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg transition ${future ? 'opacity-25' : 'hover:brightness-125'}`
          const style = {
            background: s != null ? `color-mix(in oklab, ${scoreColor(s)} ${18 + (s / 100) * 30}%, var(--panel-2))` : 'var(--panel-2)',
            boxShadow: d === today ? 'inset 0 0 0 1.5px var(--fg)' : s != null ? `inset 0 0 0 1px color-mix(in oklab, ${scoreColor(s)} 50%, transparent)` : 'inset 0 0 0 1px var(--line)',
          }
          return future ? (
            <div key={d} className={cls} style={style}>
              {inner}
            </div>
          ) : (
            <a key={d} href={dayHref(d)} className={cls} style={style} title={s != null ? `${formatDay(d)}: ${Math.round(s)}%` : `${formatDay(d)}: not logged`}>
              {inner}
            </a>
          )
        })}
      </div>
    </section>
  )
}

/** Nutrients most often under 80% on logged days over the last 28 days. */
function PersistentGaps({ nutrients, byDate, today }: { nutrients: Nutrient[]; byDate: Map<string, LogEntry[]>; today: string }) {
  const dates = dateRange(addDays(today, -1), HEAT_DAYS) // complete days only
  const { intake, loggedDays } = averageIntake(byDate, dates)
  const rows = nutrients
    .filter((n) => n.target != null && ROW_CATS.includes(n.category))
    .map((n) => {
      const series = nutrientSeries(n, byDate, dates).filter((v): v is number => v != null)
      const avg = intake[n.id] ? (intake[n.id].amount / n.target!) * 100 : null
      return { n, avg, lowDays: series.filter((v) => v < 80).length, dataDays: series.length }
    })
    .filter((r) => r.avg != null && r.avg < 80)
    .sort((a, b) => a.avg! - b.avg!)
    .slice(0, 8)

  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-baseline justify-between text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        <span>Persistent gaps · 28 days</span>
        <span className="font-mono tracking-normal normal-case">{loggedDays} days logged</span>
      </h2>
      {loggedDays === 0 ? (
        <p className="text-sm text-(--muted)">Log a few days to see which nutrients are consistently low.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-(--c-good)">No nutrient averages under 80%. Nicely balanced.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map(({ n, avg, lowDays, dataDays }) => {
            const color = STATUS_META[avg! < 50 ? 'deficient' : 'attention'].color
            return (
              <li key={n.id} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="font-mono font-semibold" style={{ color }}>
                      {n.symbol}
                    </span>{' '}
                    <span className="text-(--dim)">{n.name}</span>
                  </span>
                  <span className="font-mono">
                    <span style={{ color }}>{Math.round(avg!)}%</span>
                    <span className="text-(--muted)">
                      {' '}
                      · low {lowDays}/{dataDays}d
                    </span>
                  </span>
                </div>
                <div className="relative mt-1 h-1 rounded-full bg-(--panel-2)">
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(avg!, 100)}%`, background: color }} />
                  <div className="absolute -top-0.5 h-2 w-px bg-(--muted)" style={{ left: '80%' }} />
                </div>
                <div className="mt-0.5 text-[10.5px] text-(--muted)">Try {n.sources.slice(0, 3).join(', ')}</div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const cellColor = (v: number) => STATUS_META[v < 50 ? 'deficient' : v < 80 ? 'attention' : v <= 120 ? 'good' : 'above'].color

/** Rows = nutrients, columns = the last 28 days, colour = % of target. GitHub-heatmap style. */
function NutrientHeatmap({ nutrients, byDate, today }: { nutrients: Nutrient[]; byDate: Map<string, LogEntry[]>; today: string }) {
  const dates = dateRange(today, HEAT_DAYS)
  const { intake } = averageIntake(byDate, dates.filter((d) => d !== today)) // avg column excludes today (in progress)
  const rows = ROW_CATS.flatMap((c) => nutrients.filter((n) => n.category === c && n.target != null))

  return (
    <section className="card overflow-x-auto p-4">
      <h2 className="mb-3 flex items-baseline justify-between text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        <span>Nutrient heatmap · last 28 days</span>
        <span className="font-mono tracking-normal normal-case">% of daily target</span>
      </h2>
      <table className="w-full border-separate border-spacing-[2px] text-[10.5px]">
        <thead>
          <tr>
            <th />
            {dates.map((d, i) => (
              <th key={d} className={`font-mono font-normal text-(--muted) ${i % 7 === 0 ? 'pl-1' : ''}`}>
                {i % 7 === 0 || i === dates.length - 1 ? parseDate(d).getDate() : ''}
              </th>
            ))}
            <th className="pl-2 text-right font-normal text-(--muted)">avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n, ri) => {
            const series = nutrientSeries(n, byDate, dates)
            const avg = intake[n.id] && n.target ? (intake[n.id].amount / n.target) * 100 : null
            const newCat = ri === 0 || rows[ri - 1].category !== n.category
            return (
              <tr key={n.id}>
                <td className={`pr-2 whitespace-nowrap ${newCat ? 'pt-2' : ''}`}>
                  {newCat && (
                    <div className="mb-0.5 text-[9.5px] tracking-wider uppercase" style={{ color: `var(--k-${n.category})` }}>
                      {CATEGORY_LABEL[n.category].replace('Essential ', '')}
                    </div>
                  )}
                  <span className="text-(--dim)">{n.shortName ?? n.name}</span>
                </td>
                {series.map((v, i) => (
                  <td key={i} className={`p-0 ${newCat ? 'pt-2' : ''} ${i % 7 === 0 ? 'pl-1' : ''}`}>
                    <a
                      href={dayHref(dates[i])}
                      title={`${n.name}, ${formatDay(dates[i], 'short')}: ${v != null ? Math.round(v) + '%' : byDate.get(dates[i])?.length ? 'no data' : 'not logged'}`}
                      className="block h-3.5 min-w-3 rounded-[3px] transition hover:scale-125"
                      style={{
                        background: v != null ? cellColor(v) : 'var(--panel-2)',
                        opacity: v != null ? 0.35 + Math.min(v, 120) / 120 * 0.6 : 1,
                        boxShadow: v == null && byDate.get(dates[i])?.length ? 'inset 0 0 0 1px var(--c-nodata)' : undefined,
                      }}
                    />
                  </td>
                ))}
                <td className={`pl-2 text-right font-mono whitespace-nowrap ${newCat ? 'pt-2' : ''}`} style={{ color: avg != null ? cellColor(avg) : 'var(--muted)' }}>
                  {avg != null ? `${Math.round(avg)}%` : '–'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
