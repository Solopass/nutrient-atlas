import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, localDate, type Supplement } from '../../db/db'
import { SUPPLEMENT_PRESETS, labelUnits } from '../../data/supplementPresets'
import { CATEGORY_LABEL, NUTRIENTS } from '../../data/nutrients'
import { formatDay } from '../../lib/history'
import { fmt } from '../../lib/status'
import { createSupplement, deleteSupplement, pauseSupplement, resumeSupplement, setTaken, updateSupplement, type NewSupplement } from '../../lib/supplements'
import type { Category } from '../../types'
import { NutrientChips } from './NutrientChips'

/** Supplements: tick off today's doses, and add/edit supplements from their label. */
export function SupplementsTab({ date }: { date: string }) {
  const [editing, setEditing] = useState<Supplement | 'new' | null>(null)
  const supplements = useLiveQuery(() => db.supplements.toArray(), [])
  const takenIds = useLiveQuery(
    async () => new Set((await db.logs.where('date').equals(date).filter((l) => l.supplementId != null).toArray()).map((l) => l.supplementId!)),
    [date],
  )

  if (!supplements || !takenIds) return null
  if (editing) return <SupplementEditor initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />

  const active = supplements.filter((s) => s.active)
  const paused = supplements.filter((s) => !s.active)
  const daily = active.filter((s) => s.schedule === 'daily')
  const isToday = date === localDate()

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--dim)">
          {daily.length > 0 ? (
            <>
              <span className="font-mono text-(--fg)">
                {daily.filter((s) => takenIds.has(s.id)).length}/{daily.length}
              </span>{' '}
              daily supplements taken {isToday ? 'today' : formatDay(date, 'short')}
            </>
          ) : (
            'Add the supplements you take. Daily ones are logged automatically every day.'
          )}
        </p>
        <button onClick={() => setEditing('new')} className="rounded-lg bg-(--c-above) px-3.5 py-2 text-sm font-medium text-white hover:brightness-110">
          + Add supplement
        </button>
      </div>

      {supplements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-(--line) p-6 text-center text-sm text-(--muted)">
          Vitamin D, B12, iodine and omega-3 are often low from food alone. Supplements you take count toward your Atlas, and supplement-only upper limits (magnesium,
          niacin, folic acid, vitamin E) are checked against them.
        </div>
      ) : (
        <ul className="space-y-2">
          {[...active, ...paused].map((s) => {
            const taken = takenIds.has(s.id)
            return (
              <li key={s.id} className={`rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)] ${s.active ? '' : 'opacity-50'}`}>
                <div className="flex items-start gap-3">
                  {s.active ? (
                    <button
                      onClick={() => setTaken(s, date, !taken)}
                      aria-pressed={taken}
                      aria-label={taken ? `Mark ${s.name} not taken` : `Mark ${s.name} taken`}
                      className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm transition ${taken ? 'bg-(--c-good) text-black' : 'text-(--muted) shadow-[inset_0_0_0_1.5px_var(--line)] hover:text-(--fg)'}`}
                    >
                      {taken ? '✓' : s.schedule === 'asNeeded' ? '+' : ''}
                    </button>
                  ) : (
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center text-xs text-(--muted)">❙❙</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-(--muted)">
                        {s.dosesPerDay !== 1 && `${s.dosesPerDay} × `}
                        {s.dose}
                      </span>
                      <span className="rounded bg-(--bg) px-1.5 font-mono text-[10px] text-(--muted) uppercase">
                        {!s.active ? 'paused' : s.schedule === 'daily' ? 'daily' : 'as needed'}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <NutrientChips nutrients={s.nutrients} multiplier={s.dosesPerDay} max={6} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <button onClick={() => setEditing(s)} className="text-(--muted) hover:text-(--fg)">
                      Edit
                    </button>
                    <button onClick={() => (s.active ? pauseSupplement(s.id) : resumeSupplement(s.id))} className="text-(--muted) hover:text-(--fg)">
                      {s.active ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-4 text-xs leading-relaxed text-(--muted)">
        Daily supplements are added to your log each day (back-filled up to 14 days if you haven't opened the app). Untick a day you skipped. Past days keep what was logged,
        even after you edit or delete a supplement.
      </p>
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────

interface Row {
  id: string
  amount: string
  unit: string
}

const CATS: Category[] = ['vitamin', 'mineral', 'bvitamin', 'trace', 'fatty', 'amino', 'macro', 'advanced']
const BY_ID = new Map(NUTRIENTS.map((n) => [n.id, n]))

function rowsFrom(nutrients: Record<string, number>): Row[] {
  return Object.entries(nutrients).map(([id, v]) => ({ id, amount: String(+v.toFixed(3)), unit: BY_ID.get(id)?.unit ?? 'mg' }))
}

function SupplementEditor({ initial, onDone }: { initial: Supplement | null; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [dose, setDose] = useState(initial?.dose ?? '1 capsule')
  const [dosesPerDay, setDosesPerDay] = useState(initial?.dosesPerDay ?? 1)
  const [schedule, setSchedule] = useState<Supplement['schedule']>(initial?.schedule ?? 'daily')
  const [rows, setRows] = useState<Row[]>(initial ? rowsFrom(initial.nutrients) : [])
  const [note, setNote] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  const applyPreset = (key: string) => {
    const p = SUPPLEMENT_PRESETS.find((x) => x.key === key)!
    setName(p.name)
    setDose(p.dose)
    setDosesPerDay(p.dosesPerDay)
    setSchedule(p.schedule)
    setRows(rowsFrom(p.nutrients))
    setNote(p.note)
  }

  const used = new Set(rows.map((r) => r.id))
  const nutrients: Record<string, number> = {}
  for (const r of rows) {
    const n = BY_ID.get(r.id)
    const amt = Number(r.amount)
    if (!n || !(amt > 0)) continue
    const factor = labelUnits(r.id, n.unit).find((u) => u.label === r.unit)?.toAppUnit ?? 1
    nutrients[r.id] = (nutrients[r.id] ?? 0) + amt * factor
  }
  const valid = name.trim() && dose.trim() && Object.keys(nutrients).length > 0 && dosesPerDay > 0

  const save = async () => {
    setSaving(true)
    const data: NewSupplement = { name: name.trim(), dose: dose.trim(), dosesPerDay, schedule, nutrients }
    if (initial) await updateSupplement(initial.id, data)
    else await createSupplement(data)
    onDone()
  }

  const input = 'rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 text-sm focus:border-(--c-above) focus:outline-none'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{initial ? `Edit ${initial.name}` : 'Add a supplement'}</h3>
        <button onClick={onDone} className="text-sm text-(--muted) hover:text-(--fg)">
          Cancel
        </button>
      </div>

      {!initial && (
        <div>
          <div className="mb-1.5 text-xs text-(--dim)">Start from a common one, then match your label</div>
          <div className="flex flex-wrap gap-1.5">
            {SUPPLEMENT_PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyPreset(p.key)} className="rounded-full border border-(--line) px-3 py-1 text-xs text-(--dim) hover:border-(--c-above) hover:text-(--fg)">
                {p.name}
              </button>
            ))}
          </div>
          {note && <p className="mt-2 text-xs text-(--c-attention)">{note}</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs text-(--dim)">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vitamin D3" className={`mt-1 block w-full ${input}`} />
        </label>
        <label className="text-xs text-(--dim)">
          One dose is
          <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="1 softgel" className={`mt-1 block w-full ${input}`} />
        </label>
        <label className="text-xs text-(--dim)">
          Doses a day
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={dosesPerDay}
            onChange={(e) => setDosesPerDay(Math.max(0, Number(e.target.value) || 0))}
            className={`mt-1 block w-24 font-mono ${input}`}
          />
        </label>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-(--dim)">When</div>
        <div className="inline-flex rounded-lg bg-(--panel-2) p-0.5 shadow-[inset_0_0_0_1px_var(--line)]">
          {(
            [
              ['daily', 'Every day (auto-logged)'],
              ['asNeeded', 'As needed (tap to log)'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setSchedule(v)}
              className={`rounded-md px-3 py-1.5 text-sm ${schedule === v ? 'bg-(--c-above) text-white' : 'text-(--dim) hover:text-(--fg)'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-(--dim)">
          <span>Per dose, from the Supplement Facts label</span>
          <span className="text-(--muted)">IU converts automatically for D, A and E</span>
        </div>
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const n = BY_ID.get(r.id)!
            const units = labelUnits(r.id, n.unit)
            const set = (patch: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            const converted = nutrients[r.id]
            return (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={r.id}
                  onChange={(e) => set({ id: e.target.value, unit: BY_ID.get(e.target.value)!.unit })}
                  className={`min-w-0 flex-1 ${input} py-1.5`}
                >
                  {CATS.map((c) => (
                    <optgroup key={c} label={CATEGORY_LABEL[c]}>
                      {NUTRIENTS.filter((x) => x.category === c && (x.id === r.id || !used.has(x.id))).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={r.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                  className={`w-24 font-mono ${input} py-1.5`}
                  aria-label={`${n.name} amount`}
                />
                <select value={r.unit} onChange={(e) => set({ unit: e.target.value })} className={`w-20 ${input} py-1.5`} aria-label="Unit">
                  {units.map((u) => (
                    <option key={u.label}>{u.label}</option>
                  ))}
                </select>
                {r.unit !== n.unit && converted != null && (
                  <span className="font-mono text-[11px] text-(--muted)">
                    = {fmt(converted)} {n.unit}
                  </span>
                )}
                <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="px-1.5 text-(--muted) hover:text-(--c-deficient)" aria-label={`Remove ${n.name}`}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        <button
          onClick={() => {
            const next = NUTRIENTS.find((n) => !used.has(n.id) && n.category !== 'macro')
            if (next) setRows((rs) => [...rs, { id: next.id, amount: '', unit: next.unit }])
          }}
          className="mt-2 text-sm text-(--c-above) hover:underline"
        >
          + Add nutrient
        </button>
      </div>

      {Object.keys(nutrients).length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-(--dim)">Per day, as % of your targets</div>
          <NutrientChips nutrients={nutrients} multiplier={dosesPerDay} max={12} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-(--line) pt-4">
        <button onClick={save} disabled={!valid || saving} className="rounded-lg bg-(--c-good) px-4 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
          {initial ? 'Save changes' : schedule === 'daily' ? 'Save and log today' : 'Save'}
        </button>
        {initial && (
          <button
            onClick={async () => {
              if (confirm(`Delete ${initial.name}? Days already logged keep their entries.`)) {
                await deleteSupplement(initial.id)
                onDone()
              }
            }}
            className="ml-auto rounded-lg border border-(--c-deficient)/40 px-3.5 py-2 text-sm text-(--c-deficient) hover:bg-(--c-deficient)/10"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
