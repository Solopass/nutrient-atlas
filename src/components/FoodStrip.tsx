import { foodLabel } from './log/QuickAdd'

export interface FoodSummary {
  name: string
  /** Per day: the day's total, or the daily average over the week's logged days. */
  nutrients: Record<string, number>
  kcal: number
  supplement: boolean
}

/** The foods behind the current Atlas; tap one to see its footprint on the chart. */
export function FoodStrip({ foods, active, onToggle, week }: { foods: FoodSummary[]; active: string | null; onToggle: (name: string) => void; week: boolean }) {
  if (foods.length === 0) return null
  const shown = foods.slice(0, 16)
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
    </div>
  )
}
