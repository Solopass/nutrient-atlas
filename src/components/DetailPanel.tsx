import { useEffect, useRef, type ReactNode } from 'react'
import { CATEGORY_LABEL } from '../data/nutrients'
import { localDate } from '../db/db'
import { addDays, formatDay } from '../lib/history'
import { PARTIAL_COVERAGE, STATUS_META, amountAgainstUL, fmt } from '../lib/status'
import { BAND_COLOR, LAB_FOR_NUTRIENT, labHistory, readLab } from '../lib/labs'
import { useProfile } from '../state/profile'
import type { NutrientState } from '../types'
import { LabGauge } from './LabGauge'
import { LabTrend } from './LabTrend'

export interface NutrientHistory {
  dates: string[]
  series: (number | null)[]
  contributors: { name: string; amount: number; share: number }[]
  rangeLabel: string
}

interface Props {
  state: NutrientState | null
  onClose: () => void
  /** Real history for the selected nutrient; null in demo mode. */
  history: NutrientHistory | null
}

export function DetailPanel({ state, onClose, history }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const open = state != null
  const asideRef = useRef<HTMLElement>(null)
  // Move keyboard focus into the panel when it opens, and back to where it was when it closes.
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    asideRef.current?.focus({ preventScroll: true })
    return () => before?.focus?.({ preventScroll: true })
  }, [open])

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      {/* z-40: above the phone tab bar (z-30), below the log sheet (z-50). Safe-area padding for notched phones. */}
      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal={open}
        aria-label={state ? `${state.nutrient.name} details` : undefined}
        aria-hidden={!open}
        inert={!open}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        className={`fixed inset-y-0 right-0 z-40 w-full overflow-y-auto border-l outline-none border-(--line) bg-(--panel) shadow-2xl transition-transform duration-300 sm:w-[420px] ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {state && <PanelBody state={state} onClose={onClose} history={history} />}
      </aside>
    </>
  )
}

function PanelBody({ state, onClose, history }: { state: NutrientState; onClose: () => void; history: NutrientHistory | null }) {
  const { nutrient: n, intake, status, pct, partial } = state
  const meta = STATUS_META[status]
  const isLimit = n.category === 'limit'

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-(--muted) uppercase">{CATEGORY_LABEL[n.category]}</div>
          <h2 className="mt-1 text-2xl font-semibold">{n.name}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 py-1 text-xl leading-none text-(--muted) hover:bg-(--panel-2) hover:text-(--fg)"
        >
          ×
        </button>
      </div>

      <div className="mt-6 flex items-end gap-4">
        <div className="text-5xl font-bold tabular-nums" style={{ color: meta.color }}>
          {pct != null ? `${Math.round(pct)}%` : status === 'noData' ? '—' : `${fmt(intake!.amount)}`}
          {pct == null && status !== 'noData' && <span className="ml-1 text-xl text-(--muted)">{n.unit}</span>}
        </div>
        <span
          className="mb-2 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ background: `color-mix(in oklab, ${meta.color} 20%, transparent)`, color: meta.color }}
        >
          <span className="status-glyph">{meta.glyph} </span>
          {meta.label}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {status !== 'noData' && (
          <>
            <dt className="text-(--muted)">Consumed</dt>
            <dd className="tabular-nums">
              {fmt(intake!.amount)} {n.unit}
            </dd>
          </>
        )}
        <dt className="text-(--muted)">{isLimit ? 'Daily limit' : 'Target'}</dt>
        <dd className="tabular-nums">
          {n.target != null ? (isLimit ? `${fmt(n.target)} ${n.unit}${n.target === 0 ? ' (avoid)' : ''}` : `${fmt(n.target)} ${n.unit} (${n.customTarget ? 'custom' : n.targetKind})`) : 'No official target'}
          {n.customTarget && <span className="text-(--muted)"> · yours; standard {n.customTarget.standard != null ? `${fmt(n.customTarget.standard)} ${n.unit}` : 'none'}</span>}
        </dd>
        {(n.upperLimit != null || n.ulNote) && (
          <>
            <dt className="text-(--muted)">Upper limit</dt>
            <dd>
              {n.upperLimit != null && (
                <span className="tabular-nums">
                  {fmt(n.upperLimit)} {n.unit}
                </span>
              )}
              {n.ulNote && <div className="text-xs text-(--muted)">{n.ulNote}</div>}
              {intake?.ulAmount != null && n.upperLimit != null && (
                <div className="text-xs" style={{ color: intake.ulAmount > n.upperLimit ? 'var(--c-over)' : 'var(--dim)' }}>
                  {fmt(intake.ulAmount)} of {fmt(n.upperLimit)} {n.unit} counts toward it (retinol from foods, plus supplements)
                </div>
              )}
            </dd>
          </>
        )}
        {intake?.supplement ? (
          <>
            <dt className="text-(--muted)">Supplements</dt>
            <dd className="tabular-nums">
              {fmt(intake.supplement)} {n.unit}
              <span className="text-(--muted)"> · {Math.round((intake.supplement / intake.amount) * 100)}% of intake</span>
              {n.ulAppliesTo === 'supplements' && n.upperLimit != null && (
                <div className="text-xs" style={{ color: amountAgainstUL(n, intake) > n.upperLimit ? 'var(--c-over)' : 'var(--muted)' }}>
                  {fmt(amountAgainstUL(n, intake))} of {fmt(n.upperLimit)} {n.unit} supplement limit
                </div>
              )}
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-(--panel-2)">
                <div className="h-full bg-(--c-good)/70" style={{ width: `${100 - (intake.supplement / intake.amount) * 100}%` }} title="Food" />
                <div className="h-full bg-(--k-vitamin)" style={{ width: `${(intake.supplement / intake.amount) * 100}%` }} title="Supplements" />
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] text-(--muted)">
                <span>food</span>
                <span>supplements</span>
              </div>
            </dd>
          </>
        ) : null}
      </dl>

      {pct != null && <Scale limit={isLimit} pct={pct} ulPct={n.upperLimit && n.target && n.ulAppliesTo !== 'supplements' ? (n.upperLimit / n.target) * 100 : null} />}

      {(status === 'noData' || partial) && (
        <p className="mt-4 rounded-md border border-dashed border-(--c-nodata) p-3 text-sm text-(--dim)">
          {status === 'noData'
            ? 'None of the logged foods report this nutrient, so your real intake is unknown, not zero.'
            : intake?.supplement
              ? 'Your supplement amount is known, but few logged foods report this nutrient, so your true total is likely higher.'
              : `Only ${Math.round(intake!.coverage * 100)}% of the logged foods report this nutrient (under ${PARTIAL_COVERAGE * 100}%), so the true amount is likely higher.`}
        </p>
      )}

      {n.sunCovered && (
        <p className="mt-4 rounded-md border border-(--c-attention)/40 bg-(--c-attention)/5 p-3 text-sm text-(--dim)">
          <span className="text-(--c-attention)">☀ Sun setting on.</span> You said you get regular sun, so vitamin D from food isn't counted in your score or gaps. Skin makes most people's vitamin D in spring and summer, less in winter or at high latitudes. A blood test (25(OH)D) is the real answer; a low result switches this off.
        </p>
      )}

      <LabCard state={state} />

      {history ? (
        <>
          <Trend series={history.series} dates={history.dates} title="Last 30 days" limit={isLimit} />
          <Contributors rows={history.contributors} unit={n.unit} title={`Top sources · ${history.rangeLabel}`} />
        </>
      ) : (
        pct != null && <DemoTrend id={n.id} pct={pct} />
      )}

      <Section title="Why it matters">{n.why}</Section>
      <Section title={isLimit ? 'Effects of too much' : 'Signs of low intake'}>{n.lowSigns}</Section>
      <Section title={isLimit ? 'Biggest usual sources' : 'Best food sources'}>
        <div className="flex flex-wrap gap-1.5">
          {n.sources.map((s) => (
            <span key={s} className="rounded-full border border-(--line) bg-(--panel-2) px-2.5 py-1 text-xs">
              {s}
            </span>
          ))}
        </div>
      </Section>
    </div>
  )
}

/** Blood-test context for vitamin D, iron (ferritin) and B12, or a prompt to add one. */
function LabCard({ state }: { state: NutrientState }) {
  const { profile } = useProfile()
  const def = LAB_FOR_NUTRIENT.get(state.nutrient.id)
  if (!def) return null
  const result = profile.labs[def.id]
  if (!result) {
    return (
      <a href="#/settings" className="mt-5 block rounded-md border border-dashed border-(--line) p-3 text-xs text-(--muted) hover:border-(--c-above) hover:text-(--dim)">
        Had a {def.name.toLowerCase()} blood test ({def.test})? <span className="text-(--c-above)">Add the result in Settings</span> to see your level next to your intake.
      </a>
    )
  }
  const r = readLab(def, result, state.status === 'noData' ? null : state, profile, localDate())
  const color = BAND_COLOR[r.band]
  return (
    <section className="mt-6 rounded-lg p-3.5" style={{ background: `color-mix(in oklab, ${color} 7%, var(--panel-2))`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 35%, transparent)` }}>
      <h3 className="flex items-baseline justify-between text-[11px] tracking-[0.18em] text-(--muted) uppercase">
        <span>
          Your blood test · {def.test}
        </span>
        <span className="font-mono tracking-normal normal-case">
          {fmt(result.value)} {result.unit} · {formatDay(result.date, 'short')}
        </span>
      </h3>
      <p className="mt-2 text-sm font-medium" style={{ color }}>
        {r.headline}
      </p>
      <LabGauge def={def} canonical={r.canonical} profile={profile} />
      <LabTrend def={def} history={labHistory(profile, def.id)} profile={profile} />
      <p className="mt-2 text-xs leading-relaxed text-(--dim)">{r.advice}</p>
      {r.stale && <p className="mt-1.5 text-[11px] text-(--c-attention)">Tested {r.months} months ago. Levels change, so a newer test will be more useful.</p>}
      <p className="mt-1.5 text-[10px] text-(--muted)">Bands: {def.source}. Not a diagnosis.</p>
    </section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-1.5 text-[11px] tracking-[0.18em] text-(--muted) uppercase">{title}</h3>
      <div className="text-sm leading-relaxed text-(--dim)">{children}</div>
    </section>
  )
}

const SCALE_MAX = 160
const ZONES = [
  { from: 0, to: 50, color: 'var(--c-deficient)' },
  { from: 50, to: 80, color: 'var(--c-attention)' },
  { from: 80, to: 120, color: 'var(--c-good)' },
  { from: 120, to: SCALE_MAX, color: 'var(--c-above)' },
]

const LIMIT_ZONES = [
  { from: 0, to: 80, color: 'var(--c-good)' },
  { from: 80, to: 100, color: 'var(--c-attention)' },
  { from: 100, to: SCALE_MAX, color: 'var(--c-over)' },
]

function Scale({ pct, ulPct, limit = false }: { pct: number; ulPct: number | null; limit?: boolean }) {
  const zones = limit ? LIMIT_ZONES : ZONES
  const ticks = limit ? [0, 80, 100] : [0, 50, 80, 120]
  const pos = (v: number) => `${(Math.min(v, SCALE_MAX) / SCALE_MAX) * 100}%`
  return (
    <div className="mt-6">
      <div className="relative h-2.5 overflow-hidden rounded-full">
        {zones.map((z) => (
          <div
            key={z.from}
            className="absolute inset-y-0"
            style={{ left: pos(z.from), width: `${((z.to - z.from) / SCALE_MAX) * 100}%`, background: z.color, opacity: 0.35 }}
          />
        ))}
      </div>
      <div className="relative h-5">
        <div className="absolute -top-4 h-6 w-0.5 -translate-x-1/2 rounded bg-(--fg)" style={{ left: pos(pct) }} />
        {ulPct != null && ulPct <= SCALE_MAX && (
          <div className="absolute -top-3.5 -translate-x-1/2 text-[10px] text-(--c-over)" style={{ left: pos(ulPct) }}>
            UL
          </div>
        )}
        {ticks.map((t) => (
          <span key={t} className="absolute top-1 -translate-x-1/2 text-[10px] text-(--muted) tabular-nums" style={{ left: pos(t) }}>
            {t}%
          </span>
        ))}
        {pct > SCALE_MAX && <span className="absolute top-1 right-0 text-[10px] text-(--muted)">{Math.round(pct)}% →</span>}
      </div>
    </div>
  )
}

/** Deterministic fake 7-day history ending at the shown value, for demo mode only. */
function mockWeek(id: string, today: number) {
  let seed = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  return Array.from({ length: 6 }, () => today * (0.55 + rand() * 0.8)).concat(today)
}

const statusOf = (v: number) => STATUS_META[v < 50 ? 'deficient' : v < 80 ? 'attention' : v <= 120 ? 'good' : 'above'].color

/** Daily % of target as bars; unlogged days show as a faint tick. */
function Trend({ series, dates, title, limit = false }: { series: (number | null)[]; dates: string[]; title: string; limit?: boolean }) {
  const colorOf = (v: number) => (limit ? STATUS_META[v <= 80 ? 'good' : v <= 100 ? 'attention' : 'overLimit'].color : statusOf(v))
  const W = 360
  const H = 120
  const PAD = 14
  const logged = series.filter((v): v is number => v != null && Number.isFinite(v)) // Infinity = over a limit of 0
  const max = Math.max(130, ...logged) * 1.05
  const bw = (W - PAD * 2) / series.length
  const y = (v: number) => H - 18 - (v / max) * (H - 30)
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null
  const labels = [0, Math.floor(series.length / 2), series.length - 1]

  return (
    <section className="mt-6">
      <h3 className="mb-1.5 flex justify-between text-[11px] tracking-[0.18em] text-(--muted) uppercase">
        <span>{title}</span>
        {avg != null && <span className="font-mono tracking-normal normal-case">avg {Math.round(avg)}% · {logged.length} days</span>}
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <rect x={PAD} y={y(120)} width={W - PAD * 2} height={y(80) - y(120)} fill="var(--c-good)" opacity="0.08" />
        <line x1={PAD} x2={W - PAD} y1={y(100)} y2={y(100)} stroke="var(--dim)" strokeOpacity="0.35" />
        <line x1={PAD} x2={W - PAD} y1={y(80)} y2={y(80)} stroke="var(--c-good)" strokeOpacity="0.5" strokeDasharray="3 4" />
        {series.map((v, i) => {
          const x = PAD + i * bw
          const last = i === series.length - 1
          if (v == null) return <rect key={i} x={x + bw * 0.2} y={y(0) - 2} width={bw * 0.6} height="2" rx="1" fill="var(--line)" />
          return (
            <rect
              key={i}
              x={x + bw * 0.15}
              y={y(Math.min(v, max))}
              width={bw * 0.7}
              height={Math.max(2, y(0) - y(Math.min(v, max)))}
              rx={Math.min(3, bw * 0.3)}
              fill={colorOf(v)}
              opacity={last ? 1 : 0.7}
            >
              <title>{`${dates[i]}: ${Number.isFinite(v) ? `${Math.round(v)}%` : 'over'}`}</title>
            </rect>
          )
        })}
        {labels.map((i) => (
          <text key={i} x={PAD + i * bw + bw / 2} y={H - 3} textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--muted)">
            {formatDay(dates[i], 'short')}
          </text>
        ))}
      </svg>
    </section>
  )
}

function DemoTrend({ id, pct }: { id: string; pct: number }) {
  const values = mockWeek(id, pct)
  return <Trend series={values} dates={Array.from({ length: 7 }, (_, i) => addDays(localDate(), i - 6))} title="Last 7 days (demo)" />
}

function Contributors({ rows, unit, title }: { rows: { name: string; amount: number; share: number }[]; unit: string; title: string }) {
  if (rows.length === 0) return null
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-[11px] tracking-[0.18em] text-(--muted) uppercase">{title}</h3>
      <ul className="space-y-1.5">
        {rows.slice(0, 5).map((r) => (
          <li key={r.name} className="text-xs">
            <div className="flex justify-between gap-3">
              <span className="truncate text-(--dim)">{r.name}</span>
              <span className="shrink-0 font-mono text-(--muted)">
                {fmt(r.amount)} {unit} · {Math.round(r.share * 100)}%
              </span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-(--panel-2)">
              <div className="h-full rounded-full bg-(--c-above)/70" style={{ width: `${r.share * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
