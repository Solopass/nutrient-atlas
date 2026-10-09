import { formatDay } from '../lib/history'
import { BAND_COLOR, labBand, labPosition, toCanonical, type LabBand, type LabDef, type LabResult } from '../lib/labs'
import type { Profile } from '../lib/profile'
import { fmt } from '../lib/status'

/**
 * A blood test's results over time: reference bands as horizontal stripes, each
 * result a dot in its band's colour, spaced by date. Same square-root scale as
 * the gauge, so narrow low bands stay visible.
 */
export function LabTrend({ def, history, profile, height = 56 }: { def: LabDef; history: LabResult[]; profile: Pick<Profile, 'sex'>; height?: number }) {
  if (history.length < 2) return null
  const W = 300
  const H = height
  const PAD = { l: 6, r: 6, t: 8, b: 14 }
  const pts = history.map((r) => ({ r, v: toCanonical(def, r), t: Date.parse(r.date) }))
  const max = def.scaleMax
  const y = (v: number) => PAD.t + (1 - labPosition(def, v)) * (H - PAD.t - PAD.b)
  const t0 = pts[0].t
  const t1 = pts[pts.length - 1].t
  const x = (t: number) => PAD.l + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
  const [d, l, ok] = def.bands(profile)
  const bands: [LabBand, number, number][] = [
    ['deficient', def.scaleMin ?? 0, d],
    ['low', d, l],
    ['ok', l, Math.min(ok, max)],
    ...(ok < max ? ([['high', ok, max]] as [LabBand, number, number][]) : []),
  ]
  const first = pts[0]
  const last = pts[pts.length - 1]
  const change = last.v - first.v
  // Report the change in the unit you entered when all results share one; else in the test's standard unit.
  const sameUnit = pts.every((p) => p.r.unit === last.r.unit)
  const shown = sameUnit ? { delta: last.r.value - first.r.value, unit: last.r.unit } : { delta: change, unit: def.units[0].unit }

  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${def.name} over time: ${pts.map((p) => `${fmt(p.r.value)} ${p.r.unit} on ${p.r.date}`).join(', ')}`}>
        {bands.map(([b, from, to]) => (
          <rect key={b} x={PAD.l} width={W - PAD.l - PAD.r} y={y(to)} height={Math.max(0, y(from) - y(to))} style={{ fill: BAND_COLOR[b], fillOpacity: 0.2 }} />
        ))}
        <polyline points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke="var(--dim)" strokeWidth="1.4" strokeLinejoin="round" />
        {pts.map((p) => (
          <circle key={p.r.date} cx={x(p.t)} cy={y(p.v)} r="3.2" style={{ fill: BAND_COLOR[labBand(def, p.v, profile)] }} stroke="var(--panel)" strokeWidth="1.2">
            <title>{`${formatDay(p.r.date, 'short')}: ${fmt(p.r.value)} ${p.r.unit}`}</title>
          </circle>
        ))}
        <text x={PAD.l} y={H - 2} fontSize="8.5" fill="var(--muted)" fontFamily="var(--font-mono)">
          {formatDay(first.r.date, 'short')}
        </text>
        <text x={W - PAD.r} y={H - 2} fontSize="8.5" fill="var(--muted)" fontFamily="var(--font-mono)" textAnchor="end">
          {formatDay(last.r.date, 'short')}
        </text>
      </svg>
      <figcaption className="font-mono text-[10.5px] text-(--muted)">
        {pts.map((p) => fmt(p.r.value)).join(' → ')} {last.r.unit}
        {Math.abs(change) > 1e-9 && (
          <span style={{ color: (change > 0) === (labBand(def, last.v, profile) !== 'high') ? 'var(--c-good)' : 'var(--c-attention)' }}>
            {' '}
            ({change > 0 ? '▲' : '▼'} {fmt(Math.abs(shown.delta))} {shown.unit} since {formatDay(first.r.date, 'short')})
          </span>
        )}
      </figcaption>
    </figure>
  )
}
