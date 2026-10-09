import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, localDate } from '../../db/db'
import { CATEGORY_LABEL } from '../../data/nutrients'
import { addDays, groupByDate, parseDate } from '../../lib/history'
import { LABS, labBand, labHistory, readLab, toCanonical } from '../../lib/labs'
import { DIETS, describeProfile } from '../../lib/profile'
import { GAP_PCT, clinicianReport, type ReportRow } from '../../lib/report'
import { STATUS_META, fmt } from '../../lib/status'
import { useDayComplete } from '../../state/dayComplete'
import { useProfile } from '../../state/profile'
import { Logo } from '../Logo'

const PERIODS = [30, 60, 90] as const

/** Absolute dates ("9 Sep 2026"): a printed report outlives "yesterday". */
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const formatDate = (d: string) => DATE.format(parseDate(d))

/**
 * A one-page summary to share with a doctor or dietitian: averages against
 * targets, persistent gaps, limits, supplements and blood tests. Prints in
 * the light theme (or "Save as PDF" from the print dialog).
 */
export function ReportPage() {
  const { profile, nutrients } = useProfile()
  const { lastComplete } = useDayComplete()
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const from = addDays(lastComplete, -(days - 1))
  const logs = useLiveQuery(() => db.logs.where('date').between(from, lastComplete, true, true).toArray(), [from, lastComplete])
  const supplements = useLiveQuery(() => db.supplements.toArray(), [])
  const byDate = useMemo(() => groupByDate(logs ?? []), [logs])
  const report = useMemo(
    () => (logs && supplements ? clinicianReport({ nutrients, byDate, end: lastComplete, days, supplements }) : null),
    [logs, supplements, nutrients, byDate, lastComplete, days],
  )
  usePrintInLightTheme()

  const today = localDate()
  const labs = LABS.map((def) => ({ def, history: labHistory(profile, def.id).reverse() })).filter((l) => l.history.length > 0) // newest first
  const stateOf = (id: string) => report && [...report.rows.values()].flat().find((r) => r.state.nutrient.id === id)?.state

  return (
    <div className="min-h-screen bg-(--bg) print:bg-white">
      <div className="no-print mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 px-4 pt-6 pb-4 sm:px-6">
        <a href="#/history" className="text-sm text-(--muted) hover:text-(--fg)">
          ← History
        </a>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-(--panel-2) p-0.5 text-xs" role="group" aria-label="Period">
            {PERIODS.map((d) => (
              <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={`rounded-full px-3 py-1 ${days === d ? 'bg-(--panel) text-(--fg) shadow' : 'text-(--muted)'}`}>
                {d} days
              </button>
            ))}
          </div>
          <button onClick={() => window.print()} className="rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white hover:brightness-110">
            Print or save as PDF
          </button>
        </div>
      </div>

      <main className="report mx-auto max-w-[900px] px-4 pb-28 sm:px-6 sm:pb-16 print:max-w-none print:p-0">
        <article className="card space-y-6 p-5 sm:p-8 print:rounded-none print:p-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-(--line) pb-4">
            <div className="flex items-center gap-3">
              <Logo />
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Nutrition summary</h1>
                <p className="text-xs text-(--muted)">Prepared with Nutrient Atlas from a self-logged food diary</p>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-(--muted)">Period</dt>
              <dd>
                {formatDate(from)} – {formatDate(lastComplete)} ({days} days)
              </dd>
              <dt className="text-(--muted)">Days logged</dt>
              <dd>{report ? `${report.loggedDays} of ${days}` : '…'}</dd>
              <dt className="text-(--muted)">Person</dt>
              <dd>
                {sentence(describeProfile(profile))} · {DIETS[profile.diet].label.toLowerCase()}
              </dd>
              <dt className="text-(--muted)">Generated</dt>
              <dd>{formatDate(today)}</dd>
            </dl>
          </header>

          {!report ? (
            <p className="text-sm text-(--muted)">Loading…</p>
          ) : report.loggedDays === 0 ? (
            <p className="text-sm text-(--muted)">No complete logged days in this period yet. Log a few days of meals and the report fills in.</p>
          ) : (
            <>
              <Section title="Key findings" keep>
                <ul className="space-y-1.5 text-sm">
                  <Finding tone={report.gaps.length ? 'attention' : 'good'}>
                    {report.gaps.length ? (
                      <>
                        <b>Below {GAP_PCT}% of target on average:</b> {report.gaps.map((g) => `${g.state.nutrient.name} ${Math.round(g.state.pct!)}%`).join(', ')}.
                      </>
                    ) : (
                      <>No nutrient with good data averages under {GAP_PCT}% of target.</>
                    )}
                  </Finding>
                  {report.overUL.length > 0 && (
                    <Finding tone="overLimit">
                      <b>At or above the upper limit:</b> {report.overUL.map((r) => `${r.state.nutrient.name} (${Math.round(r.fromSupplements * 100)}% from supplements)`).join(', ')}.
                    </Finding>
                  )}
                  {report.supplementsOverUL.length > 0 && (
                    <Finding tone="overLimit">
                      <b>Supplement doses at or above the upper limit on their own:</b>{' '}
                      {report.supplementsOverUL.map(({ s, n, pctUL }) => `${s.name} (${n.name.toLowerCase()} ${Math.round(pctUL)}% of UL)`).join(', ')}.
                    </Finding>
                  )}
                  {report.overLimits.length > 0 && (
                    <Finding tone="overLimit">
                      <b>Over a "stay under" limit on average:</b> {report.overLimits.map((r) => `${r.state.nutrient.name} ${Math.round(r.state.pct!)}%`).join(', ')}.
                    </Finding>
                  )}
                  {labs
                    .map(({ def, history }) => readLab(def, history[0], stateOf(def.nutrientId) ?? null, profile, today))
                    .filter((r) => r.band !== 'ok')
                    .map((r) => (
                      <Finding key={r.def.id} tone={r.band === 'high' ? 'overLimit' : 'attention'}>
                        <b>{r.def.test}:</b> {r.headline} ({formatDate(r.result.date)}).
                      </Finding>
                    ))}
                </ul>
              </Section>

              <Section title={`Average daily intake vs target · ${report.loggedDays} logged days`}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] tracking-wider text-(--muted) uppercase">
                      <th className="py-1 font-medium">Nutrient</th>
                      <th className="py-1 text-right font-medium">Average</th>
                      <th className="py-1 text-right font-medium">Target</th>
                      <th className="py-1 text-right font-medium">% of target</th>
                      <th className="hidden py-1 text-right font-medium sm:table-cell print:table-cell">From suppl.</th>
                      <th className="py-1 text-right font-medium">Days &lt;{GAP_PCT}%</th>
                    </tr>
                  </thead>
                  {[...report.rows].map(([cat, rows]) => (
                    <tbody key={cat} className="break-inside-avoid">
                      <tr>
                        <th colSpan={6} className="pt-3 pb-1 text-left text-[10.5px] font-semibold tracking-[0.12em] text-(--dim) uppercase">
                          {CATEGORY_LABEL[cat]}
                        </th>
                      </tr>
                      {rows.map((r) => (
                        <Row key={r.state.nutrient.id} r={r} />
                      ))}
                    </tbody>
                  ))}
                </table>
                <p className="mt-2 text-[11px] leading-relaxed text-(--muted)">
                  Targets are Dietary Reference Intakes for this age, sex and life stage (RDA, AI) or app goals; "–" means the foods logged don't report this nutrient.
                  {' '}* partial data: fewer than 60% of logged foods report it, so the true intake is likely higher.
                  {nutrients.some((n) => n.sunCovered) && ' Vitamin D: the person reports regular sun exposure, so food intake is shown but not counted as a gap.'}
                </p>
              </Section>

              <Section title="Limits · stay under" keep>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] tracking-wider text-(--muted) uppercase">
                      <th className="py-1 font-medium">Nutrient</th>
                      <th className="py-1 text-right font-medium">Average</th>
                      <th className="py-1 text-right font-medium">Limit</th>
                      <th className="py-1 text-right font-medium">% of limit</th>
                      <th className="py-1 text-right font-medium">Days over</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.limits.map((r) => (
                      <tr key={r.state.nutrient.id} className="border-t border-(--line)">
                        <td className="py-1">{r.state.nutrient.name}</td>
                        <td className="py-1 text-right font-mono">{r.amount != null ? `${fmt(r.amount)} ${r.state.nutrient.unit}` : '–'}</td>
                        <td className="py-1 text-right font-mono text-(--muted)">{r.state.nutrient.target != null ? `${fmt(r.state.nutrient.target)} ${r.state.nutrient.unit}` : '–'}</td>
                        <td className="py-1 text-right font-mono" style={{ color: STATUS_META[r.state.status].color }}>
                          {r.state.pct != null && Number.isFinite(r.state.pct) ? `${Math.round(r.state.pct)}%` : '–'}
                        </td>
                        <td className="py-1 text-right font-mono">{r.dataDays ? `${r.flaggedDays}/${r.dataDays}` : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </>
          )}

          <Section title="Supplements taken" keep>
            {!report || report.supplements.length === 0 ? (
              <p className="text-sm text-(--muted)">None recorded.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {report.supplements.map(({ s, perDay }) => (
                  <li key={s.id} className="break-inside-avoid">
                    <div className="text-sm">
                      <b>{s.name}</b>{' '}
                      <span className="text-(--muted)">
                        · {s.dose}
                        {s.schedule === 'daily' ? `, ${s.dosesPerDay}× daily` : ', as needed'} · since {formatDate(s.startDate)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-(--dim)">
                      {perDay.length === 0
                        ? 'No nutrient amounts entered.'
                        : perDay.map(({ n, amount, pctTarget, pctUL }) => `${n.name} ${fmt(amount)} ${n.unit}${pctTarget != null ? ` (${Math.round(pctTarget)}% of target${pctUL != null && pctUL >= 50 ? `, ${Math.round(pctUL)}% of UL` : ''})` : ''}`).join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Blood tests" keep>
            {labs.length === 0 ? (
              <p className="text-sm text-(--muted)">None recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] tracking-wider text-(--muted) uppercase">
                    <th className="py-1 font-medium">Test</th>
                    <th className="py-1 font-medium">Results, newest first</th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map(({ def, history }) => (
                    <tr key={def.id} className="border-t border-(--line) align-top">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{def.test}</td>
                      <td className="py-1.5">
                        {history.map((r) => {
                          const band = labBand(def, toCanonical(def, r), profile)
                          return (
                            <span key={r.date} className="mr-3 inline-block font-mono">
                              {formatDate(r.date)}: {r.value} {r.unit} <span className="font-sans text-(--muted)">({def.bandLabel[band].toLowerCase()})</span>
                            </span>
                          )
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <footer className="border-t border-(--line) pt-3 text-[11px] leading-relaxed text-(--muted)">
            Self-reported data. Nutrient values come from USDA FoodData Central and product labels; foods without a value for a nutrient are shown as missing, never as zero.
            Averages cover logged days only. This summary is for discussion with a health professional and is not a diagnosis.
          </footer>
        </article>
      </main>
    </div>
  )
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Row({ r }: { r: ReportRow }) {
  const n = r.state.nutrient
  const color = STATUS_META[r.state.status].color
  return (
    <tr className="border-t border-(--line)">
      <td className="py-1">
        {n.name}
        {r.state.partial && <span className="text-(--muted)"> *</span>}
      </td>
      <td className="py-1 text-right font-mono">{r.amount != null ? `${fmt(r.amount)} ${n.unit}` : '–'}</td>
      <td className="py-1 text-right font-mono text-(--muted)">
        {n.target != null ? `${fmt(n.target)} ${n.unit}` : '–'}
        {n.targetKind && <span className="ml-1 font-sans text-[10px]">{n.targetKind}</span>}
      </td>
      <td className="py-1 text-right font-mono font-semibold" style={{ color }}>
        <span className="status-glyph" aria-hidden>
          {STATUS_META[r.state.status].glyph}{' '}
        </span>
        {r.state.pct != null ? `${Math.round(r.state.pct)}%` : '–'}
        {r.overUL && <span title="At or above the upper limit"> ⚠ UL</span>}
      </td>
      <td className="hidden py-1 text-right font-mono text-(--muted) sm:table-cell print:table-cell">{r.fromSupplements >= 0.05 ? `${Math.round(r.fromSupplements * 100)}%` : ''}</td>
      <td className="py-1 text-right font-mono">{r.dataDays ? `${r.flaggedDays}/${r.dataDays}` : '–'}</td>
    </tr>
  )
}

/** `keep`: short sections that shouldn't split across printed pages. */
function Section({ title, keep, children }: { title: string; keep?: boolean; children: ReactNode }) {
  return (
    <section className={keep ? 'break-inside-avoid-page' : undefined}>
      <h2 className="mb-2 text-[10.5px] font-semibold tracking-[0.16em] text-(--muted) uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Finding({ tone, children }: { tone: 'good' | 'attention' | 'overLimit'; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: STATUS_META[tone].color }} aria-hidden />
      <span>{children}</span>
    </li>
  )
}

/** Paper is white: switch to the light theme for printing, then restore. */
function usePrintInLightTheme() {
  useEffect(() => {
    const root = document.documentElement
    let previous: string | null = null
    const before = () => {
      previous = root.getAttribute('data-theme')
      root.setAttribute('data-theme', 'light')
    }
    const after = () => {
      if (previous == null) root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', previous)
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
}
