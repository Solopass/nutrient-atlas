import type { LogGroup } from '../db/db'
import { kcalOf } from '../lib/quickLog'
import { MEAL_ORDER } from './AtlasChart'

const LABEL: Record<LogGroup, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', supplement: 'Supplements' }

/** Colour switch above the Atlas, plus a per-meal energy legend in meal mode. */
export function AtlasToolbar({
  colorBy,
  onChange,
  meals,
  week,
}: {
  colorBy: 'status' | 'meal'
  onChange: (v: 'status' | 'meal') => void
  meals: Partial<Record<LogGroup, Record<string, number>>> | null
  week: boolean
}) {
  const kcal = MEAL_ORDER.map((m) => ({ meal: m, kcal: meals?.[m] ? kcalOf(meals[m]!) : 0, present: !!meals?.[m] })).filter((x) => x.present)
  const total = kcal.reduce((a, x) => a + x.kcal, 0)

  return (
    <div className="mb-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
      <div className="inline-flex rounded-full bg-(--panel) p-0.5 shadow-[inset_0_0_0_1px_var(--line)]" role="group" aria-label="Colour the Atlas by">
        {(['status', 'meal'] as const).map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={colorBy === v}
            className={`rounded-full px-3 py-1 transition ${colorBy === v ? 'bg-(--panel-2) text-(--fg) shadow-[inset_0_0_0_1px_var(--line)]' : 'text-(--muted) hover:text-(--dim)'}`}
          >
            {v === 'status' ? 'By status' : 'By meal'}
          </button>
        ))}
      </div>
      {colorBy === 'meal' &&
        (kcal.length ? (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" aria-label={week ? 'Average energy per meal' : 'Energy per meal'}>
            {kcal.map((x) => (
              <span key={x.meal} className="flex items-center gap-1.5 text-(--dim)">
                <span className="size-2.5 rounded-sm" style={{ background: `var(--m-${x.meal})`, opacity: 0.85 }} />
                {LABEL[x.meal]}
                {x.meal !== 'supplement' && total > 0 && (
                  <span className="font-mono text-[10.5px] text-(--muted)">
                    {Math.round(x.kcal)} kcal · {Math.round((x.kcal / total) * 100)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-(--muted)">Nothing logged in this range yet</span>
        ))}
    </div>
  )
}
