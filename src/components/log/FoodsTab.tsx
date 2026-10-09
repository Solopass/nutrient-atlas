import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Food, type Meal, type SavedMeal } from '../../db/db'
import { logSavedFood } from '../../db/logging'
import { CustomFoodEditor } from './CustomFoodEditor'
import { useGuard } from '../../lib/useGuard'
import { NutrientChips } from './NutrientChips'
import { RecipeBuilder } from './RecipeBuilder'
import { SavedMealsList } from './SavedMealsList'

const SOURCE_LABEL: Record<Food['source'], string> = { usda: 'USDA', ai: 'AI', custom: 'Label' }

export function FoodsTab({ meal, date, onLogged }: { meal: Meal; date: string; onLogged: (msg: string) => void }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Food | 'new' | null>(null)
  const [recipe, setRecipe] = useState<SavedMeal | 'new' | null>(null)
  const guard = useGuard()
  const foods = useLiveQuery(() => db.foods.orderBy('lastUsedAt').reverse().toArray(), [])

  if (!foods) return null
  if (recipe) {
    return (
      <RecipeBuilder
        initial={recipe === 'new' ? null : recipe}
        meal={meal}
        date={date}
        onDone={(logged) => {
          setRecipe(null)
          if (logged) onLogged(logged)
        }}
      />
    )
  }
  if (editing) {
    return (
      <CustomFoodEditor
        initial={editing === 'new' ? null : editing}
        meal={meal}
        date={date}
        onDone={(msg) => {
          setEditing(null)
          if (msg?.startsWith('Saved and logged')) onLogged(msg)
        }}
      />
    )
  }

  const q = query.trim().toLowerCase()
  const shown = foods.filter((f) => !q || f.name.toLowerCase().includes(q)).sort((a, b) => b.favorite - a.favorite)

  return (
    <div>
      <button
        onClick={() => setRecipe('new')}
        className="mb-2 flex w-full items-center gap-3 rounded-lg bg-(--panel-2) p-3 text-left shadow-[inset_0_0_0_1px_var(--line)] transition hover:shadow-[inset_0_0_0_1px_var(--c-above)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--c-above)/15 text-base text-(--c-above)">⚗</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Build a recipe</span>
          <span className="block text-xs text-(--muted)">Home cooking: add ingredients and how many portions it makes; log one portion at a time.</span>
        </span>
      </button>
      <button
        onClick={() => setEditing('new')}
        className="mb-5 flex w-full items-center gap-3 rounded-lg bg-(--panel-2) p-3 text-left shadow-[inset_0_0_0_1px_var(--line)] transition hover:shadow-[inset_0_0_0_1px_var(--c-above)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--c-above)/15 text-lg text-(--c-above)">+</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Create a food from its label</span>
          <span className="block text-xs text-(--muted)">Packaged foods: paste or type the Nutrition Facts once, re-log in one tap.</span>
        </span>
      </button>

      <SavedMealsList meal={meal} date={date} onLogged={onLogged} onEdit={setRecipe} />

      {foods.length === 0 ? (
        <div className="py-10 text-center text-sm text-(--muted)">No saved foods yet. Every food you log is saved here for one-tap re-logging.</div>
      ) : (
        <>
          <h3 className="mb-1.5 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">Foods</h3>
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
                    <span className="shrink-0 rounded bg-(--bg) px-1 font-mono text-[9.5px] text-(--muted) uppercase">{SOURCE_LABEL[f.source]}</span>
                  </div>
                  <div className="mt-1">
                    <NutrientChips nutrients={f.nutrients} max={5} />
                  </div>
                </div>
                {f.source !== 'usda' && (
                  <button onClick={() => setEditing(f)} className="shrink-0 text-xs text-(--muted) hover:text-(--fg)">
                    Edit
                  </button>
                )}
                <button
                  onClick={() =>
                    guard(async () => {
                      await logSavedFood(f, meal, 1, date)
                      onLogged(`Logged ${f.name} to ${meal}`)
                    })
                  }
                  className="shrink-0 rounded-lg border border-(--line) px-3 py-1.5 text-sm hover:border-(--c-above) hover:text-(--c-above)"
                >
                  + Log
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
