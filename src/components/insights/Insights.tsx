import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { CATEGORY_LABEL } from '../../data/nutrients'
import { loadUsda, type UsdaDb } from '../../data/usda'
import { db, type LogEntry } from '../../db/db'
import { formatDay } from '../../lib/history'
import { weeklyReport, type Insight, type InsightKind, type WeeklyReport } from '../../lib/insights'
import { isMet, isScorable, scoreColor } from '../../lib/status'
import { useProfile } from '../../state/profile'
import type { Category } from '../../types'

/** Build the weekly report for the 7 days ending `end` (needs logs from end-13 … end). */
export function useWeeklyReport(logs: LogEntry[] | undefined, end: string): WeeklyReport | null {
  const { nutrients, profile } = useProfile()
  const supplements = useLiveQuery(() => db.supplements.toArray(), [])
  const [usda, setUsda] = useState<UsdaDb | null>(null)
  useEffect(() => {
    loadUsda().then(setUsda, () => {})
  }, [])
  return useMemo(
    () => (logs && supplements ? weeklyReport({ nutrients, logs, end, profile, supplements, usda }) : null),
    [logs, supplements, nutrients, end, profile, usda],
  )
}

const KIND: Record<InsightKind, { icon: string; color: string; label: string }> = {
  win: { icon: '▲', color: 'var(--c-good)', label: 'Win' },
  gap: { icon: '◔', color: 'var(--c-attention)', label: 'Gap' },
  limit: { icon: '⚠', color: 'var(--c-over)', label: 'Limit' },
  risk: { icon: '◆', color: 'var(--k-vitamin)', label: 'Watch' },
  tip: { icon: '✦', color: 'var(--c-above)', label: 'Tip' },
}

function InsightItem({ insight, onSelect, compact = false }: { insight: Insight; onSelect?: (id: string) => void; compact?: boolean }) {
  const k = KIND[insight.kind]
  return (
    <div className="flex gap-3">
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs"
        style={{ color: k.color, background: `color-mix(in oklab, ${k.color} 15%, transparent)` }}
        aria-label={k.label}
      >
        {k.icon}
      </span>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => insight.nutrientIds[0] && onSelect?.(insight.nutrientIds[0])}
          className="text-left text-sm leading-snug font-medium hover:underline disabled:no-underline"
          disabled={!onSelect || !insight.nutrientIds.length}
        >
          {insight.title}
        </button>
        <p className={`mt-0.5 text-xs leading-relaxed text-(--dim) ${compact ? 'line-clamp-3' : ''}`}>{insight.body}</p>
        {insight.foods && insight.foods.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {insight.foods.slice(0, compact ? 2 : 3).map((f) => (
              <span key={f} className="rounded bg-(--panel-2) px-1.5 py-0.5 font-mono text-[10.5px] text-(--dim)">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Dashboard card: the top insights for the last complete week. */
export function InsightsCard({ report, onSelect }: { report: WeeklyReport | null; onSelect: (id: string) => void }) {
  if (!report || report.loggedDays === 0 || report.insights.length === 0) return null
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        <span>
          <span className="text-(--c-above)">This week</span> · insights
        </span>
        <a href="#/history" className="tracking-normal text-(--c-above) normal-case hover:underline">
          Full weekly report →
        </a>
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {report.insights.slice(0, 3).map((i) => (
          <InsightItem key={i.id} insight={i} onSelect={onSelect} compact />
        ))}
      </div>
    </section>
  )
}

const CATS: Category[] = ['macro', 'vitamin', 'mineral', 'bvitamin', 'trace', 'fatty', 'amino']

/** History page: the full weekly report card. */
export function WeeklyReportCard({ report }: { report: WeeklyReport | null }) {
  if (!report) return null
  const catPct = (states: WeeklyReport['states'], c: Category) => {
    const g = states.filter((s) => s.nutrient.category === c).filter(isScorable)
    return g.length ? (g.filter(isMet).length / g.length) * 100 : null
  }
  const hasPrev = report.prevLoggedDays > 0

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-4 flex flex-wrap items-baseline justify-between gap-2 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        <span>Weekly report · 7 days to {formatDay(report.end, 'short').toLowerCase()}</span>
        <span className="font-mono tracking-normal normal-case">
          {report.loggedDays} of 7 days logged{hasPrev ? ` · last week ${report.prevLoggedDays}` : ''}
        </span>
      </h2>

      {report.loggedDays === 0 ? (
        <p className="text-sm text-(--muted)">Nothing logged in the last 7 complete days yet. The report fills in as you log.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-4xl font-semibold" style={{ color: scoreColor(report.score ?? 0) }}>
                {Math.round(report.score ?? 0)}
                <span className="text-lg text-(--muted)">%</span>
              </span>
              {hasPrev && report.prevScore != null && (() => {
                const d = Math.round(report.score! - report.prevScore)
                return d === 0 ? (
                  <span className="font-mono text-xs text-(--muted)">= same as last week</span>
                ) : (
                  <span className={`font-mono text-xs ${d > 0 ? 'text-(--c-good)' : 'text-(--c-deficient)'}`}>
                    {d > 0 ? '▲' : '▼'} {Math.abs(d)} vs last week
                  </span>
                )
              })()}
            </div>
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-(--muted)">
                  <th className="pb-1 text-left font-normal">Category</th>
                  {hasPrev && <th className="pb-1 text-right font-normal">Last</th>}
                  <th className="pb-1 text-right font-normal">This</th>
                </tr>
              </thead>
              <tbody>
                {CATS.map((c) => {
                  const now = catPct(report.states, c)
                  const before = catPct(report.prevStates, c)
                  return (
                    <tr key={c} className="border-t border-(--line)/60">
                      <td className="py-1" style={{ color: `var(--k-${c})` }}>
                        {CATEGORY_LABEL[c].replace('Essential ', '')}
                      </td>
                      {hasPrev && <td className="py-1 text-right font-mono text-(--muted)">{before != null ? `${Math.round(before)}%` : '–'}</td>}
                      <td className="py-1 text-right font-mono" style={{ color: now != null ? scoreColor(now) : undefined }}>
                        {now != null ? `${Math.round(now)}%` : '–'}
                        {hasPrev && now != null && before != null && Math.round(now) !== Math.round(before) && (
                          <span className="ml-1 text-[10px]">{now > before ? '▲' : '▼'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-4">
            {report.insights.length === 0 ? (
              <p className="text-sm text-(--c-good)">No gaps, limits or warnings stood out this week. Nicely balanced.</p>
            ) : (
              report.insights.map((i) => <InsightItem key={i.id} insight={i} />)
            )}
            <p className="text-[11px] text-(--muted)">Food guidance based on DRIs for healthy people, not medical advice.</p>
          </div>
        </div>
      )}
    </section>
  )
}
