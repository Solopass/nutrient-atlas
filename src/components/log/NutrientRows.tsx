import { CATEGORY_LABEL, NUTRIENTS } from '../../data/nutrients'
import { labelUnits } from '../../data/supplementPresets'
import { fmt } from '../../lib/status'
import type { Category } from '../../types'

/** One editable label line: nutrient, amount as typed, unit as on the label. */
export interface Row {
  id: string
  amount: string
  unit: string
}

const BY_ID = new Map(NUTRIENTS.map((n) => [n.id, n]))

export function rowsFrom(nutrients: Record<string, number>): Row[] {
  return Object.entries(nutrients).map(([id, v]) => ({ id, amount: String(+v.toFixed(3)), unit: BY_ID.get(id)?.unit ?? 'mg' }))
}

/** Rows → app-unit nutrients (label units converted, blanks skipped, duplicates summed). */
export function rowsToNutrients(rows: Row[]) {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const n = BY_ID.get(r.id)
    const amt = Number(r.amount)
    if (!n || !(amt >= 0) || r.amount.trim() === '') continue
    const factor = labelUnits(r.id, n.unit).find((u) => u.label === r.unit)?.toAppUnit ?? 1
    out[r.id] = (out[r.id] ?? 0) + amt * factor
  }
  return out
}

const input = 'rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 text-sm focus:border-(--c-above) focus:outline-none'

/** Editable list of label lines, with IU/mg/mcg conversion. */
export function NutrientRowsEditor({ rows, setRows, categories }: { rows: Row[]; setRows: (fn: (rows: Row[]) => Row[]) => void; categories: Category[] }) {
  const used = new Set(rows.map((r) => r.id))
  const converted = rowsToNutrients(rows)

  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const n = BY_ID.get(r.id)!
          const set = (patch: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
          return (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <select value={r.id} onChange={(e) => set({ id: e.target.value, unit: BY_ID.get(e.target.value)!.unit })} className={`min-w-0 flex-1 ${input} py-1.5`}>
                {categories.map((c) => (
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
                {labelUnits(r.id, n.unit).map((u) => (
                  <option key={u.label}>{u.label}</option>
                ))}
              </select>
              {r.unit !== n.unit && converted[r.id] != null && (
                <span className="font-mono text-[11px] text-(--muted)">
                  = {fmt(converted[r.id])} {n.unit}
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
          const next = NUTRIENTS.find((n) => !used.has(n.id) && categories.includes(n.category))
          if (next) setRows((rs) => [...rs, { id: next.id, amount: '', unit: next.unit }])
        }}
        className="mt-2 text-sm text-(--c-above) hover:underline"
      >
        + Add nutrient
      </button>
    </div>
  )
}
