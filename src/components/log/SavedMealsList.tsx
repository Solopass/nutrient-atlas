import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Meal } from '../../db/db'
import { itemsKcal, logSavedMeal } from '../../lib/quickLog'
import { useGuard } from '../../lib/useGuard'
import { foodLabel } from './QuickAdd'

/** Saved meals and recipes: log one portion, or delete. */
export function SavedMealsList({ meal, date, onLogged }: { meal: Meal; date: string; onLogged: (msg: string) => void }) {
  const meals = useLiveQuery(() => db.meals.orderBy('lastUsedAt').reverse().toArray(), [])
  const guard = useGuard()
  if (!meals || meals.length === 0) return null

  return (
    <section className="mb-5">
      <h3 className="mb-1 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">Saved meals</h3>
      <ul className="divide-y divide-(--line)">
        {meals.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">{m.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-(--muted)">
                  {Math.round(itemsKcal(m.items) / m.servings)} kcal{m.servings > 1 ? ` · 1 of ${m.servings} portions` : ''}
                </span>
              </div>
              <div className="truncate text-xs text-(--muted)">{m.items.map((i) => foodLabel(i.name)).join(', ')}</div>
            </div>
            <button
              onClick={() =>
                guard(async () => {
                  await logSavedMeal(m.id, date, meal)
                  onLogged(`Logged ${m.name} to ${meal}`)
                })
              }
              className="shrink-0 rounded-lg border border-(--line) px-3 py-1.5 text-sm hover:border-(--c-above) hover:text-(--c-above)"
            >
              + Log
            </button>
            <button
              onClick={() => confirm(`Delete saved meal “${m.name}”? Days already logged keep their entries.`) && db.meals.delete(m.id)}
              className="shrink-0 rounded px-2 py-1 text-(--muted) hover:text-(--c-deficient)"
              aria-label={`Delete ${m.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
