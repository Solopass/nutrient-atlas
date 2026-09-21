import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOG_GROUPS } from '../../db/db'
import { NutrientChips } from './NutrientChips'

export function TodayTab({ date }: { date: string }) {
  const entries = useLiveQuery(() => db.logs.where('date').equals(date).sortBy('loggedAt'), [date])
  if (!entries) return null

  if (entries.length === 0) {
    return <div className="py-12 text-center text-sm text-(--muted)">Nothing logged on this day yet.</div>
  }

  return (
    <div className="space-y-5">
      {LOG_GROUPS.map((meal) => {
        const rows = entries.filter((e) => e.meal === meal)
        if (rows.length === 0) return null
        return (
          <section key={meal}>
            <h3 className="mb-1 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">{meal === 'supplement' ? 'Supplements' : meal}</h3>
            <ul className="divide-y divide-(--line)">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{e.name}</span>
                      <span className="shrink-0 text-xs text-(--muted)">
                        {e.multiplier !== 1 && `${e.multiplier} × `}
                        {e.serving}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10.5px] text-(--muted)">
                        {new Date(e.loggedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="mt-1">
                      <NutrientChips nutrients={e.nutrients} multiplier={e.multiplier} max={5} />
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={e.multiplier}
                    onChange={(ev) => db.logs.update(e.id, { multiplier: Math.max(0, Number(ev.target.value) || 0) })}
                    className="w-14 shrink-0 rounded border border-(--line) bg-(--bg) px-1.5 py-0.5 font-mono text-xs"
                    aria-label={`Servings of ${e.name}`}
                  />
                  <button
                    onClick={() => db.logs.delete(e.id)}
                    className="shrink-0 rounded px-2 py-1 text-(--muted) hover:bg-(--panel-2) hover:text-(--c-deficient)"
                    aria-label={`Remove ${e.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
