import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { addDays, bucketAverages, dateRange, formatDay, groupByDate, nutrientSeries, parseDate } from '../lib/history'
import { BAND_COLOR, LAB_FOR_NUTRIENT, labBand, labHistory, toCanonical } from '../lib/labs'
import { STATUS_META, fmt } from '../lib/status'
import { useProfile } from '../state/profile'
import type { Nutrient } from '../types'

const RANGES = { '90d': { days: 91, bucket: 7, label: '90 days', unit: 'week' }, '1y': { days: 365, bucket: 30, label: '1 year', unit: 'month' } } as const
type Range = keyof typeof RANGES

/**
 * The long view for one nutrient: weekly (90 days) or monthly (1 year) averages
 * of % of target, with your blood tests for it on the same timeline, so you can
 * see whether a change in diet moved the lab number. Loads its own logs, only
 * while the panel is open.
 */
export function LongTrend({ nutrient: n, end }: { nutrient: Nutrient; end: string }) {
  const { profile } = useProfile()
  const [range, setRange] = useState<Range>('90d')
  const cfg = RANGES[range]
  const start = addDays(end, -(cfg.days - 1))
  const logs = useLiveQuery(() => db.logs.where('date').between(start, end, true, true).toArray(), [start, end])
  const buckets = useMemo(() => {
    if (!logs) return null
    const dates = dateRange(end, cfg.days)
    return bucketAverages(nutrientSeries(n, groupByDate(logs), dates), dates, cfg.bucket)
  }, [logs, n, end, cfg])

  const lab = LAB_FOR_NUTRIENT.get(n.id)
  const results = lab ? labHistory(profile, lab.id) : []
  const inRange = results.filter((r) => r.date >= start && r.date <= end)
  const before = results.filter((r) => r.date < start).at(-1)
  const isLimit = n.category === 'limit'

  if (n.target == null) return null
  const header = (
    <div className="mt-6 flex items-baseline justify-between gap-2">
      <h3 className="text-[11px] tracking-[0.18em] text-(--muted) uppercase">Long-term trend</h3>
      <div className="flex rounded-full bg-(--panel-2) p-0.5 text-[11px]" role="group" aria-label="Trend range">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={`rounded-full px-2.5 py-0.5 ${range === r ? 'bg-(--panel) text-(--fg) shadow' : 'text-(--muted)'}`}>
            {RANGES[r].label}
          </button>
        ))}
      </div>
    </div>
  )
  if (!buckets) return header
  const withData = buckets.filter((b) => b.avg != null)
  if (withData.length < 2) {
    return (
      <>
        {header}
        <p className="mt-2 text-xs text-(--muted)">Log in at least two different {cfg.unit}s to see a trend here.</p>
      </>
    )
  }

  // ── geometry ──
  const W = 300
  const PAD = { l: 6, r: 6, t: 10 }
  const chartH = 92
  const labH = lab && (inRange.length || before) ? 26 : 0
  const H = PAD.t + chartH + labH + 16
  const t0 = parseDate(start).getTime()
  const t1 = parseDate(end).getTime()
  const x = (date: string) => PAD.l + ((parseDate(date).getTime() - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r)
  const mid = (b: { start: string; end: string }) => x(addDays(b.start, Math.round((parseDate(b.end).getTime() - parseDate(b.start).getTime()) / 2 / 86_400_000)))
  const yMax = Math.min(200, Math.max(130, ...withData.map((b) => b.avg!)) * 1.08)
  const y = (v: number) => PAD.t + (1 - Math.min(v, yMax) / yMax) * chartH
  const color = (v: number) =>
    isLimit ? STATUS_META[v > 100 ? 'overLimit' : v >= 80 ? 'attention' : 'good'].color : STATUS_META[v < 50 ? 'deficient' : v < 80 ? 'attention' : 'good'].color

  // Line segments break where a bucket has no data.
  const segments: string[] = []
  let cur = ''
  for (const b of buckets) {
    if (b.avg == null) {
      if (cur) segments.push(cur)
      cur = ''
      continue
    }
    cur += `${cur ? 'L' : 'M'}${mid(b).toFixed(1)},${y(b.avg).toFixed(1)}`
  }
  if (cur) segments.push(cur)

  // Summary: the average, and the change from the first third of the range to the last.
  const avg = withData.reduce((a, b) => a + b.avg!, 0) / withData.length
  const third = Math.max(1, Math.floor(withData.length / 3))
  const mean = (bs: typeof withData) => bs.reduce((a, b) => a + b.avg!, 0) / bs.length
  const change = Math.round(mean(withData.slice(-third)) - mean(withData.slice(0, third)))
  const better = isLimit ? change < 0 : change > 0
  const labY = PAD.t + chartH + 14

  return (
    <>
      {header}
      <figure className="mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${n.name}, ${cfg.unit}ly averages over ${cfg.label}: ${withData.map((b) => `${Math.round(b.avg!)}% (${formatDay(b.end, 'short')})`).join(', ')}${inRange.length ? `. Blood tests: ${inRange.map((r) => `${fmt(r.value)} ${r.unit} on ${r.date}`).join(', ')}` : ''}`}
        >
          {/* on-target zone and reference lines */}
          {!isLimit && <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(yMax)} height={y(80) - y(yMax)} style={{ fill: 'var(--c-good)', fillOpacity: 0.07 }} />}
          {isLimit && <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(yMax)} height={y(100) - y(yMax)} style={{ fill: 'var(--c-over)', fillOpacity: 0.08 }} />}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(100)} y2={y(100)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth="0.8" />
          <text x={W - PAD.r} y={y(100) - 2} textAnchor="end" fontSize="8" fill="var(--muted)">
            {isLimit ? 'limit' : 'target'}
          </text>
          {!isLimit && <line x1={PAD.l} x2={W - PAD.r} y1={y(80)} y2={y(80)} stroke="var(--line)" strokeWidth="0.6" />}

          {/* blood tests: a guide line through the chart at each test date */}
          {lab &&
            inRange.map((r) => (
              <line key={`g-${r.date}`} x1={x(r.date)} x2={x(r.date)} y1={PAD.t} y2={labY} stroke={BAND_COLOR[labBand(lab, toCanonical(lab, r), profile)]} strokeOpacity="0.45" strokeDasharray="2 2" strokeWidth="0.8" />
            ))}

          {segments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="var(--dim)" strokeWidth="1.4" strokeLinejoin="round" />
          ))}
          {buckets.map((b) =>
            b.avg == null ? null : (
              <circle key={b.end} cx={mid(b)} cy={y(b.avg)} r={b.days >= 3 ? 3.2 : 2.2} style={{ fill: color(b.avg) }} opacity={b.days >= 3 ? 1 : 0.6}>
                <title>{`${formatDay(b.start, 'short')} – ${formatDay(b.end, 'short')}: ${Math.round(b.avg)}% (${b.days} logged day${b.days === 1 ? '' : 's'})`}</title>
              </circle>
            ),
          )}

          {/* lab strip */}
          {lab && labH > 0 && (
            <g>
              <line x1={PAD.l} x2={W - PAD.r} y1={labY} y2={labY} stroke="var(--line)" strokeWidth="0.8" />
              <text x={PAD.l} y={labY - 4} fontSize="8" fill="var(--muted)">
                {lab.test}
              </text>
              {inRange.map((r) => {
                const band = labBand(lab, toCanonical(lab, r), profile)
                const cx = x(r.date)
                return (
                  <g key={r.date}>
                    <circle cx={cx} cy={labY} r="3.6" style={{ fill: BAND_COLOR[band] }} />
                    <text x={Math.min(Math.max(cx, 24), W - 24)} y={labY + 11} textAnchor="middle" fontSize="8.5" fill="var(--dim)">
                      {fmt(r.value)} {r.unit}
                    </text>
                  </g>
                )
              })}
            </g>
          )}

          {/* time axis */}
          {[buckets[0].start, end].map((d, i) => (
            <text key={d} x={i === 0 ? PAD.l : W - PAD.r} y={H - 2} textAnchor={i === 0 ? 'start' : 'end'} fontSize="9" fill="var(--muted)">
              {formatDay(d, 'short')}
            </text>
          ))}
        </svg>
        <figcaption className="mt-1 flex flex-wrap justify-between gap-x-3 font-mono text-[11px] text-(--muted)">
          <span>
            {cfg.unit}ly avg <span style={{ color: color(avg) }}>{Math.round(avg)}%</span> of {isLimit ? 'limit' : 'target'}
          </span>
          <span style={{ color: change === 0 ? undefined : better ? 'var(--c-good)' : 'var(--c-attention)' }}>
            {change === 0 ? '→ steady' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)} points since the start`}
          </span>
        </figcaption>
        {lab && before && !inRange.length && (
          <p className="mt-1 text-[11px] text-(--muted)">
            Last {lab.test} before this range: {fmt(before.value)} {before.unit} on {formatDay(before.date, 'short')}. Try 1 year.
          </p>
        )}
      </figure>
    </>
  )
}
