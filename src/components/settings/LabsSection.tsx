import { useEffect, useRef, useState } from 'react'
import { localDate } from '../../db/db'
import { formatDay } from '../../lib/history'
import { BAND_COLOR, LABS, LAB_STALE_MONTHS, labBand, labHistory, monthsSince, toCanonical, validLabValue, type LabDef, type LabResult } from '../../lib/labs'
import type { Profile } from '../../lib/profile'
import { fmt } from '../../lib/status'
import { saveLab, useProfile } from '../../state/profile'
import { LabGauge } from '../LabGauge'
import { LabTrend } from '../LabTrend'
import { Section, Segmented } from './Controls'

export function LabsSection() {
  const { profile } = useProfile()
  return (
    <Section
      title="Blood tests (optional)"
      hint="Adding results explains your intake in context. For example: ferritin is low even though iron intake is on target, so absorption may be the issue. Add each new test to see the trend. Stays in this browser."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {LABS.map((def) => (
          <LabRow key={def.id} def={def} profile={profile} />
        ))}
      </div>
      <p className="text-[11px] text-(--muted)">Reference bands are common cut-offs for healthy adults, not a diagnosis. Your lab report's own range and your clinician come first.</p>
    </Section>
  )
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One test: edit the latest result in place, or add a newer one (the latest
 * then moves into the history). Earlier results show as a trend and a list.
 */
function LabRow({ def, profile }: { def: LabDef; profile: Profile }) {
  const today = localDate()
  const history = labHistory(profile, def.id)
  const latest = history[history.length - 1]
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState(latest ? String(latest.value) : '')
  const [unit, setUnit] = useState(latest?.unit ?? def.units[0].unit)
  const [date, setDate] = useState(latest?.date ?? today)
  // Date of the stored entry these fields edit; null while adding a new one.
  const editing = useRef<string | null>(latest?.date ?? null)

  // Follow outside changes (import, delete, another tab), unless a new result is being typed.
  useEffect(() => {
    if (adding) return
    editing.current = latest?.date ?? null
    // Keep in-progress text like "12." that already parses to the saved value.
    setText((t) => (latest ? (t.trim() !== '' && Number(t) === latest.value ? t : String(latest.value)) : ''))
    setUnit(latest?.unit ?? def.units[0].unit)
    setDate(latest?.date ?? localDate())
  }, [latest?.date, latest?.value, latest?.unit, adding, def])

  const value = Number(text)
  const valid = text.trim() !== '' && validLabValue(def, value, unit)
  const save = async (patch: Partial<LabResult>) => {
    const next = { value, unit, date, ...patch }
    if (!validLabValue(def, next.value, next.unit) || !DATE.test(next.date)) return
    await saveLab(def.id, { result: next, replaceDate: editing.current })
    editing.current = next.date
    if (adding) setAdding(false)
  }
  const startAdding = () => {
    setAdding(true)
    editing.current = null
    setText('')
    setDate(today)
  }

  const canonical = valid ? toCanonical(def, { value, unit }) : null
  const band = canonical != null ? labBand(def, canonical, profile) : null
  const months = latest && !adding ? monthsSince(latest.date, today) : 0
  const earlier = history.filter((r) => r.date !== latest?.date || adding).reverse()

  return (
    <div className="rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{def.name}</span>
          <span className="ml-1.5 font-mono text-[10.5px] text-(--muted)">{def.test}</span>
        </div>
        {band && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ color: BAND_COLOR[band], background: `color-mix(in oklab, ${BAND_COLOR[band]} 18%, transparent)` }}>
            {def.bandLabel[band]}
          </span>
        )}
      </div>
      {adding && <div className="mt-1 text-[11px] text-(--c-above)">New result. The previous one moves to the history.</div>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          aria-label={`${def.name} result`}
          placeholder="Result"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value.trim() !== '') save({ value: Number(e.target.value) })
          }}
          onBlur={() => !adding && latest && !valid && setText(String(latest.value))}
          aria-invalid={text.trim() !== '' && !valid}
          className={`w-24 rounded-lg border bg-(--panel) px-2.5 py-1.5 font-mono text-sm focus:outline-none ${text.trim() !== '' && !valid ? 'border-(--c-deficient)' : 'border-(--line) focus:border-(--c-above)'}`}
        />
        {def.units.length > 1 ? (
          <Segmented
            value={unit}
            options={def.units.map((u) => ({ value: u.unit, label: u.unit }))}
            onChange={(u) => {
              setUnit(u)
              if (valid) save({ unit: u })
            }}
          />
        ) : (
          <span className="text-sm text-(--muted)">{unit}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-(--muted)">
        <label className="flex items-center gap-1.5">
          Tested
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              setDate(e.target.value)
              if (valid) save({ date: e.target.value })
            }}
            className="rounded-md border border-(--line) bg-(--panel) px-1.5 py-1 font-mono text-xs text-(--fg)"
          />
        </label>
        <span className="ml-auto flex gap-1">
          {latest && !adding && (
            <button onClick={startAdding} className="rounded px-1.5 py-0.5 text-(--c-above) hover:bg-(--panel)">
              + Newer result
            </button>
          )}
          {adding && (
            <button onClick={() => setAdding(false)} className="rounded px-1.5 py-0.5 hover:bg-(--panel) hover:text-(--fg)">
              Cancel
            </button>
          )}
          {latest && !adding && (
            <button onClick={() => saveLab(def.id, { removeDate: latest.date })} className="rounded px-1.5 py-0.5 hover:bg-(--panel) hover:text-(--c-deficient)" title="Remove this result">
              Remove
            </button>
          )}
        </span>
      </div>

      <LabGauge def={def} canonical={canonical} profile={profile} />

      {months >= LAB_STALE_MONTHS && latest && (
        <p className="mt-1 text-[11px] text-(--c-attention)">
          From {formatDay(latest.date, 'short')}, {months} months ago. Levels change, so an up-to-date test will be more useful.
        </p>
      )}

      <LabTrend def={def} history={history} profile={profile} />

      {earlier.length > 0 && (
        <details className="mt-1 text-[11px] text-(--muted)">
          <summary className="cursor-pointer select-none hover:text-(--fg)">
            {earlier.length} earlier result{earlier.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {earlier.map((r) => {
              const b = labBand(def, toCanonical(def, r), profile)
              return (
                <li key={r.date} className="flex items-center gap-2 font-mono">
                  <span className="size-1.5 rounded-full" style={{ background: BAND_COLOR[b] }} />
                  <span className="w-16">{formatDay(r.date, 'short')}</span>
                  <span className="text-(--dim)">
                    {fmt(r.value)} {r.unit}
                  </span>
                  <button onClick={() => saveLab(def.id, { removeDate: r.date })} className="ml-auto px-1 hover:text-(--c-deficient)" aria-label={`Remove the ${r.date} result`}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}
