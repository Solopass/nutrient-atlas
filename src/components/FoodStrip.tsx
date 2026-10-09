import { foodLabel } from './log/QuickAdd'

export interface FoodSummary {
  name: string
  /** Per day: the day's total, or the daily average over the week's logged days. */
  nutrients: Record<string, number>
  kcal: number
  supplement: boolean
  /** Day view: total servings logged (sum of multipliers). */
  servings?: number
}

/** The foods behind the current Atlas; tap one to see its footprint on the chart. */
export function FoodStrip({
  foods,
  active,
  onToggle,
  week,
  onServings,
  undo,
}: {
  foods: FoodSummary[]
  active: string | null
  onToggle: (name: string) => void
  week: boolean
  /** Day view: set a food's total servings (− / + here, or drag its footprint on the Atlas). */
  onServings?: (name: string, total: number) => void
  undo: { name: string; run: () => void } | null
}) {
  if (foods.length === 0) return null
  const shown = foods.slice(0, 16)
  const sel = foods.find((f) => f.name === active)
  const step = (s: number) => (s >= 2 ? 0.5 : 0.25)
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-center text-[10.5px] tracking-[0.14em] text-(--muted) uppercase">
        {week ? 'Foods this week' : 'Foods this day'} · tap for footprint
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {shown.map((f) => {
          const on = active === f.name
          return (
            <button
              key={f.name}
              onClick={() => onToggle(f.name)}
              aria-pressed={on}
              title={f.name}
              className={`max-w-[14rem] truncate rounded-full px-2.5 py-1 text-xs transition ${on ? 'bg-(--fg) text-(--bg)' : 'bg-(--panel-2) text-(--dim) shadow-[inset_0_0_0_1px_var(--line)] hover:text-(--fg)'}`}
            >
              {f.supplement && <span aria-hidden>💊 </span>}
              {foodLabel(f.name)}
              {!f.supplement && f.kcal > 0 && <span className={`ml-1 font-mono text-[10px] ${on ? 'opacity-70' : 'text-(--muted)'}`}>{Math.round(f.kcal)}</span>}
            </button>
          )
        })}
        {foods.length > shown.length && <span className="self-center text-[11px] text-(--muted)">+{foods.length - shown.length} more</span>}
      </div>
      {sel && onServings && sel.servings != null && !sel.supplement && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-(--dim)" role="group" aria-label={`Servings of ${foodLabel(sel.name)}`}>
          <button onClick={() => onServings(sel.name, sel.servings! - step(sel.servings! - 0.01))} disabled={sel.servings! <= 0.25} className="grid size-7 place-items-center rounded-full bg-(--panel-2) text-base shadow-[inset_0_0_0_1px_var(--line)] hover:text-(--fg) disabled:opacity-40" aria-label="Less">
            −
          </button>
          <span className="font-mono text-(--fg)">
            {+sel.servings!.toFixed(2)} serving{sel.servings === 1 ? '' : 's'}
          </span>
          <button onClick={() => onServings(sel.name, sel.servings! + step(sel.servings!))} className="grid size-7 place-items-center rounded-full bg-(--panel-2) text-base shadow-[inset_0_0_0_1px_var(--line)] hover:text-(--fg)" aria-label="More">
            +
          </button>
          <span className="text-(--muted)">or drag its outline on the Atlas</span>
        </div>
      )}
      {undo && (
        <p className="mt-1.5 text-center text-xs text-(--dim)" role="status">
          Changed {foodLabel(undo.name)}.{' '}
          <button onClick={undo.run} className="font-medium text-(--c-above) hover:underline">
            Undo
          </button>
        </p>
      )}
      {week && active && <p className="mt-1.5 text-center text-[11px] text-(--muted)">Switch to Day to change portions.</p>}
    </div>
  )
}
