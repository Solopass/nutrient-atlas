import { useEffect, useState } from 'react'
import { localDate } from '../../db/db'
import { formatDay } from '../../lib/history'
import { BAND_COLOR, LABS, LAB_STALE_MONTHS, labBand, monthsSince, toCanonical, validLabValue, type LabDef, type LabResult } from '../../lib/labs'
import { saveLab, useProfile } from '../../state/profile'
import { LabGauge } from '../LabGauge'
import { Section, Segmented } from './Controls'

export function LabsSection() {
  const { profile } = useProfile()
  return (
    <Section
      title="Blood tests (optional)"
      hint="Adding a recent result explains your intake in context. For example: ferritin is low even though iron intake is on target, so absorption may be the issue. Stays in this browser."
    >
      <div className="grid gap-3 xl:grid-cols-3">
        {LABS.map((def) => (
          <LabRow key={def.id} def={def} result={profile.labs[def.id]} sex={profile.sex} />
        ))}
      </div>
      <p className="text-[11px] text-(--muted)">Reference bands are common cut-offs for healthy adults, not a diagnosis. Your lab report's own range and your clinician come first.</p>
    </Section>
  )
}

function LabRow({ def, result, sex }: { def: LabDef; result: LabResult | undefined; sex: 'male' | 'female' }) {
  const today = localDate()
  const [text, setText] = useState(result ? String(result.value) : '')
  const [unit, setUnit] = useState(result?.unit ?? def.units[0].unit)
  const [date, setDate] = useState(result?.date ?? today)
  // Follow outside changes (import, delete all, another tab).
  useEffect(() => {
    // Keep in-progress text like "12." that already parses to the saved value.
    setText((t) => (result ? (t.trim() !== '' && Number(t) === result.value ? t : String(result.value)) : ''))
    setUnit(result?.unit ?? def.units[0].unit)
    setDate(result?.date ?? localDate())
  }, [result, def])

  const value = Number(text)
  const valid = text.trim() !== '' && validLabValue(def, value, unit)
  const save = (patch: Partial<LabResult>) => {
    const next = { value, unit, date, ...patch }
    if (validLabValue(def, next.value, next.unit) && /^\d{4}-\d{2}-\d{2}$/.test(next.date)) saveLab(def.id, next)
  }

  const canonical = valid ? toCanonical(def, { value, unit }) : null
  const band = canonical != null ? labBand(def, canonical, { sex }) : null
  const months = result ? monthsSince(result.date, today) : 0

  return (
    <div className="rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-medium">{def.name}</span>
          <span className="ml-1.5 font-mono text-[10.5px] text-(--muted)">{def.test}</span>
        </div>
        {band && (
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ color: BAND_COLOR[band], background: `color-mix(in oklab, ${BAND_COLOR[band]} 18%, transparent)` }}>
            {def.bandLabel[band]}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          aria-label={`${def.name} result`}
          placeholder="Result"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value)
            if (e.target.value.trim() !== '') save({ value: v })
          }}
          onBlur={() => result && !valid && setText(String(result.value))}
          aria-invalid={text.trim() !== '' && !valid}
          className={`w-24 rounded-lg border bg-(--panel) px-2.5 py-1.5 font-mono text-sm focus:outline-none ${text.trim() !== '' && !valid ? 'border-(--c-deficient)' : 'border-(--line) focus:border-(--c-above)'}`}
        />
        <Segmented
          value={unit}
          options={def.units.map((u) => ({ value: u.unit, label: u.unit }))}
          onChange={(u) => {
            setUnit(u)
            if (valid) save({ unit: u })
          }}
        />
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-(--muted)">
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
        {result && (
          <button onClick={() => saveLab(def.id, null)} className="ml-auto rounded px-1.5 py-0.5 hover:bg-(--panel) hover:text-(--c-deficient)">
            Remove
          </button>
        )}
      </div>

      <LabGauge def={def} canonical={canonical} profile={{ sex }} />

      {result && months >= LAB_STALE_MONTHS && (
        <p className="mt-1 text-[11px] text-(--c-attention)">
          From {formatDay(result.date, 'short')}, {months} months ago. Levels change, so an up-to-date test will be more useful.
        </p>
      )}
    </div>
  )
}
