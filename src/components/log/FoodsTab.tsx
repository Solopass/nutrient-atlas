import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Meal } from '../../db/db'
import { logSavedFood } from '../../db/logging'
import { NutrientChips } from './NutrientChips'

export function FoodsTab({ meal, date, onLogged }: { meal: Meal; date: string; onLogged: (msg: string) => void }) {
  const [query, setQuery] = useState('')
  const foods = useLiveQuery(() => db.foods.orderBy('lastUsedAt').reverse().toArray(), [])

  if (!foods) return null
  const q = query.trim().toLowerCase()
  const shown = foods
    .filter((f) => !q || f.name.toLowerCase().includes(q))
    .sort((a, b) => b.favorite - a.favorite)

  if (foods.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-(--muted)">
        No saved foods yet. Foods you log with the AI estimate are saved here for one-tap re-logging.
      </div>
    )
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your foods"
        className="mb-3 w-full rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 text-sm placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
      />
      <ul className="divide-y divide-(--line)">
        {shown.map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-2.5">
            <button
              onClick={() => db.foods.update(f.id, { favorite: f.favorite ? 0 : 1 })}
              className={`text-lg leading-none ${f.favorite ? 'text-(--c-attention)' : 'text-(--line) hover:text-(--muted)'}`}
              aria-label={f.favorite ? 'Unfavorite' : 'Favorite'}
            >
              ★
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">{f.name}</span>
                <span className="shrink-0 text-xs text-(--muted)">{f.serving}</span>
              </div>
              <div className="mt-1">
                <NutrientChips nutrients={f.nutrients} max={5} />
              </div>
            </div>
            <button
              onClick={async () => {
                await logSavedFood(f, meal, 1, date)
                onLogged(`Logged ${f.name} to ${meal}`)
              }}
              className="shrink-0 rounded-lg border border-(--line) px-3 py-1.5 text-sm hover:border-(--c-above) hover:text-(--c-above)"
            >
              + Log
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
