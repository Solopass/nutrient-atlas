import { useLiveQuery } from 'dexie-react-hooks'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { db, type Food, type Meal, type MealItem, type SavedMeal } from '../../db/db'
import { foodLabel, nameParts, type UsdaFood } from '../../data/usda'
import { initUsda, searchFoods } from '../../data/usdaClient'
import { logSavedMeal } from '../../lib/quickLog'
import { foodIngredient, normalizeRecipe, perPortion, portionKcal, totalGrams, usdaIngredient } from '../../lib/recipe'
import { useGuard } from '../../lib/useGuard'
import { NutrientChips } from './NutrientChips'

type Choice = { kind: 'usda'; food: UsdaFood } | { kind: 'own'; food: Food }

const field = 'rounded border border-(--line) bg-(--bg) px-2 py-1.5 text-sm text-(--fg)'

/**
 * Build or edit a recipe: ingredients from your foods or USDA with amounts,
 * how many portions it makes, and a live per-portion breakdown. Saved as a
 * saved meal; logging it later adds one portion. `onDone` gets a message only
 * when something was logged (the sheet then shows Today).
 */
export function RecipeBuilder({ initial, meal, date, onDone }: { initial: SavedMeal | null; meal: Meal; date: string; onDone: (logged?: string) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [servings, setServings] = useState(initial?.servings ?? 4)
  const [items, setItems] = useState<MealItem[]>(initial?.items ?? [])
  const guard = useGuard()

  const portion = useMemo(() => perPortion(items, servings), [items, servings])
  const grams = totalGrams(items)
  const ready = items.some((i) => i.multiplier > 0)

  const save = (andLog: boolean) =>
    guard(async () => {
      const r = normalizeRecipe(name, items, servings)
      let id = initial?.id
      if (id != null) await db.meals.update(id, r)
      else {
        const t = Date.now()
        id = (await db.meals.add({ ...r, useCount: 0, createdAt: t, lastUsedAt: t } as never)) as number
      }
      if (andLog) await logSavedMeal(id, date, meal)
      onDone(andLog ? `Saved ${r.name} and logged 1 portion to ${meal}` : undefined)
    })

  const setAmount = (i: number, multiplier: number) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, multiplier } : x)))

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => onDone()} className="rounded px-1.5 text-lg leading-none text-(--muted) hover:text-(--fg)" aria-label="Back">
          ←
        </button>
        <h3 className="text-sm font-semibold">{initial ? 'Edit recipe' : 'New recipe'}</h3>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-48 text-xs text-(--muted)">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lentil dal" className={`mt-1 block w-full ${field}`} />
        </label>
        <label className="text-xs text-(--muted)">
          Makes
          <span className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              step={1}
              value={servings}
              onChange={(e) => setServings(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className={`w-16 font-mono ${field}`}
            />
            <span className="text-sm text-(--dim)">portions</span>
          </span>
        </label>
      </div>

      <section className="mt-4 rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)]" aria-label="One portion">
        <div className="flex items-baseline justify-between font-mono text-[11px] text-(--muted)">
          <span>
            <span className="font-sans text-xs font-medium text-(--fg)">One portion</span>
            {ready && ` · ${portionKcal(items, servings)} kcal`}
            {ready && grams != null && ` · ${Math.round(grams / servings)} g`}
          </span>
          <span>% of daily target</span>
        </div>
        <div className="mt-2">{ready ? <NutrientChips nutrients={portion} max={10} /> : <p className="text-xs text-(--muted)">Add ingredients to see what one portion gives you.</p>}</div>
      </section>

      <h4 className="mt-5 mb-1 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        Ingredients{items.length > 0 && ` · ${items.length}`}
        {grams != null && <span className="font-mono tracking-normal normal-case"> · {grams} g total</span>}
      </h4>
      {items.length > 0 && (
        <ul className="divide-y divide-(--line)">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{foodLabel(it.name)}</div>
                <div className="truncate text-[11px] text-(--muted)">
                  {it.serving} · {it.name}
                </div>
              </div>
              <span className="text-xs text-(--muted)">×</span>
              <input
                type="number"
                min={0}
                step={0.25}
                value={it.multiplier}
                aria-label={`Amount of ${foodLabel(it.name)}`}
                onChange={(e) => setAmount(i, Math.max(0, Number(e.target.value) || 0))}
                className={`w-16 font-mono ${field}`}
              />
              <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="rounded px-1.5 py-1 text-xs text-(--muted) hover:text-(--c-deficient)" aria-label={`Remove ${foodLabel(it.name)}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <IngredientSearch onAdd={(item) => setItems((xs) => [...xs, item])} />

      <div className="sticky bottom-0 -mx-5 mt-5 flex gap-2 border-t border-(--line) bg-(--panel) px-5 py-3">
        <button
          onClick={() => save(true)}
          disabled={!ready}
          className="flex-1 rounded-lg bg-(--c-good) px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40"
        >
          Save and log 1 portion
        </button>
        <button onClick={() => save(false)} disabled={!ready} className="rounded-lg border border-(--line) px-3 py-2 text-sm hover:border-(--c-above) disabled:opacity-40">
          Save
        </button>
      </div>
    </div>
  )
}

/** Search your foods and USDA; pick one, set the amount, add it. */
function IngredientSearch({ onAdd }: { onAdd: (item: MealItem) => void }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [ready, setReady] = useState(false)
  const [usda, setUsda] = useState<UsdaFood[]>([])
  const [picked, setPicked] = useState<Choice | null>(null)
  const own = useLiveQuery(() => db.foods.toArray(), [])

  useEffect(() => {
    initUsda().then(() => setReady(true), () => setReady(false))
  }, [])
  useEffect(() => {
    if (!ready || !deferred.trim()) return setUsda([])
    let current = true
    searchFoods(deferred, 8).then((r) => current && setUsda(r))
    return () => {
      current = false
    }
  }, [deferred, ready])

  const q = deferred.trim().toLowerCase()
  const mine = q ? (own ?? []).filter((f) => f.source !== 'usda' && f.name.toLowerCase().includes(q)).slice(0, 4) : []

  if (picked) {
    return (
      <AmountPicker
        pick={picked}
        onCancel={() => setPicked(null)}
        onAdd={(item) => {
          onAdd(item)
          setPicked(null)
          setQuery('')
        }}
      />
    )
  }

  return (
    <div className="mt-3">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ready ? 'Add an ingredient: search foods' : 'Loading food database…'}
          aria-label="Add an ingredient"
          className="w-full rounded-lg border border-(--line) bg-(--panel-2) py-2 pr-3 pl-9 text-sm placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
        />
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--muted)">+</span>
      </div>
      {(mine.length > 0 || usda.length > 0) && (
        <ul className="mt-1 divide-y divide-(--line)" aria-label="Ingredient results">
          {mine.map((f) => (
            <li key={`own-${f.id}`}>
              <button onClick={() => setPicked({ kind: 'own', food: f })} className="flex w-full items-baseline gap-2 py-2 text-left text-sm hover:bg-(--panel-2)/50">
                <span className="truncate font-medium">{f.name}</span>
                <span className="shrink-0 text-xs text-(--muted)">{f.serving}</span>
                <span className="ml-auto shrink-0 rounded bg-(--bg) px-1 font-mono text-[9.5px] text-(--muted) uppercase">My food</span>
              </button>
            </li>
          ))}
          {usda.map((f) => {
            const [prefix, head, rest] = nameParts(f.name)
            return (
              <li key={f.fdcId}>
                <button onClick={() => setPicked({ kind: 'usda', food: f })} className="flex w-full items-baseline gap-2 py-2 text-left text-sm hover:bg-(--panel-2)/50">
                  <span className="min-w-0 truncate">
                    {prefix && <span className="text-(--muted)">{prefix}</span>}
                    <span className="font-medium">{head}</span>
                    <span className="text-(--dim)">{rest}</span>
                  </span>
                  {f.kcal != null && <span className="ml-auto shrink-0 font-mono text-[11px] text-(--muted)">{f.kcal} kcal/100g</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AmountPicker({ pick, onAdd, onCancel }: { pick: Choice; onAdd: (item: MealItem) => void; onCancel: () => void }) {
  const options = pick.kind === 'usda' ? [...pick.food.portions, { label: '100 g', grams: 100 }] : []
  const [choice, setChoice] = useState(0) // index into options, or -1 for custom grams
  const [qty, setQty] = useState(1)
  const [customGrams, setCustomGrams] = useState(100)

  const item =
    pick.kind === 'own'
      ? foodIngredient(pick.food, qty)
      : usdaIngredient(pick.food, choice === -1 ? { label: `${customGrams} g`, grams: customGrams } : options[choice], qty)

  return (
    <div className="mt-3 rounded-lg bg-(--panel-2) p-3">
      <div className="text-sm font-medium">{pick.food.name}</div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-(--muted)">
          Amount
          <input type="number" min={0.25} step={0.25} value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} className={`mt-1 block w-20 font-mono ${field}`} />
        </label>
        {pick.kind === 'usda' ? (
          <label className="min-w-0 flex-1 text-xs text-(--muted)">
            Portion
            <select value={choice} onChange={(e) => setChoice(Number(e.target.value))} className={`mt-1 block w-full ${field}`}>
              {options.map((p, i) => (
                <option key={i} value={i}>
                  {p.label} ({Math.round(p.grams)} g)
                </option>
              ))}
              <option value={-1}>Custom grams…</option>
            </select>
          </label>
        ) : (
          <span className="pb-2 text-sm text-(--dim)">× {pick.food.serving}</span>
        )}
        {choice === -1 && (
          <label className="text-xs text-(--muted)">
            Grams
            <input type="number" min={1} value={customGrams} onChange={(e) => setCustomGrams(Math.max(0, Number(e.target.value) || 0))} className={`mt-1 block w-20 font-mono ${field}`} />
          </label>
        )}
      </div>
      <div className="mt-2">
        <NutrientChips nutrients={item.nutrients} multiplier={item.multiplier} max={6} />
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onAdd(item)} disabled={qty <= 0 || (choice === -1 && customGrams <= 0)} className="flex-1 rounded-lg bg-(--c-above) px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Add to recipe
        </button>
        <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-(--muted) hover:text-(--fg)">
          Cancel
        </button>
      </div>
    </div>
  )
}
