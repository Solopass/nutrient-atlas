import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { Meal } from '../../db/db'
import { logNewFood } from '../../db/logging'
import { loadUsda, nameParts, nutrientsForGrams, searchUsda, type UsdaDb, type UsdaFood } from '../../data/usda'
import { useGuard } from '../../lib/useGuard'
import { NutrientChips } from './NutrientChips'
import { QuickAdd } from './QuickAdd'

const SUGGESTIONS = ['egg', 'banana', 'oats', 'salmon', 'spinach', 'greek yogurt', 'almonds', 'lentils']

export function SearchTab({ meal, date, onLogged }: { meal: Meal; date: string; onLogged: (msg: string) => void }) {
  const [db, setDb] = useState<UsdaDb | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const deferred = useDeferredValue(query)

  useEffect(() => {
    loadUsda().then(setDb, (e: Error) => setError(e.message))
  }, [])

  const results = useMemo(() => (db ? searchUsda(db, deferred) : []), [db, deferred])

  return (
    <div>
      <div className="relative">
        <input
          // Desktop only: on phones the keyboard would cover Quick add every time the sheet opens.
          autoFocus={matchMedia('(pointer: fine)').matches}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpenId(null)
          }}
          placeholder={db ? `Search ${db.foods.length.toLocaleString()} USDA foods` : 'Loading food database…'}
          className="w-full rounded-lg border border-(--line) bg-(--panel-2) py-2.5 pr-3 pl-9 text-sm placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
        />
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--muted)">⌕</span>
      </div>

      {error && <p className="mt-3 text-sm text-(--c-deficient)">{error}</p>}

      {!query.trim() && (
        <div className="mt-4">
          <div className="mb-5">
            <QuickAdd meal={meal} date={date} onLogged={onLogged} />
          </div>
          <p className="mb-2 text-xs text-(--muted)">Try</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setQuery(s)} className="rounded-full border border-(--line) px-3 py-1 text-xs text-(--dim) hover:border-(--c-above) hover:text-(--fg)">
                {s}
              </button>
            ))}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-(--muted)">
            Whole foods from USDA FoodData Central (Foundation Foods and SR Legacy). For packaged or restaurant meals, use the AI estimate tab.
          </p>
        </div>
      )}

      {query.trim() && db && results.length === 0 && (
        <p className="mt-6 text-center text-sm text-(--muted)">No matches. Try fewer or simpler words. For packaged foods, use My foods → Create a food from its label, or the AI estimate tab.</p>
      )}

      <ul className="mt-3 divide-y divide-(--line)">
        {results.map((f) => (
          <li key={f.fdcId}>
            {openId === f.fdcId ? (
              <FoodPicker food={f} meal={meal} date={date} onLogged={onLogged} onCancel={() => setOpenId(null)} />
            ) : (
              <button onClick={() => setOpenId(f.fdcId)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-(--panel-2)/50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <FoodName name={f.name} />
                  </div>
                  <div className="mt-0.5 flex gap-2 text-[11px] text-(--muted)">
                    <span>{f.category}</span>
                    <span>·</span>
                    <span>{Object.keys(f.per100g).filter((k) => k !== 'retinol').length} nutrients</span>
                  </div>
                </div>
                {f.kcal != null && (
                  <span className="shrink-0 font-mono text-[11px] text-(--muted)">
                    {f.kcal} kcal<span className="opacity-60">/100g</span>
                  </span>
                )}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Emphasise the real food in USDA names ("Fish, salmon, sockeye, raw" → salmon). */
function FoodName({ name }: { name: string }) {
  const [prefix, head, rest] = nameParts(name)
  return (
    <>
      {prefix && <span className="text-(--muted)">{prefix}</span>}
      <span className="font-medium">{head}</span>
      <span className="text-(--dim)">{rest}</span>
    </>
  )
}

function FoodPicker({ food, meal, date, onLogged, onCancel }: { food: UsdaFood; meal: Meal; date: string; onLogged: (msg: string) => void; onCancel: () => void }) {
  const options = useMemo(() => [...food.portions, { label: '100 g', grams: 100 }], [food])
  const [choice, setChoice] = useState(0) // index into options, or -1 for custom grams
  const [qty, setQty] = useState(1)
  const [customGrams, setCustomGrams] = useState(100)
  const [saving, setSaving] = useState(false)
  const guard = useGuard()

  const unitGrams = choice === -1 ? customGrams : options[choice].grams
  const totalGrams = unitGrams * qty
  const preview = useMemo(() => nutrientsForGrams(food, totalGrams), [food, totalGrams])
  const kcal = food.kcal != null ? Math.round((food.kcal * totalGrams) / 100) : null

  const log = () =>
    guard(async () => {
      setSaving(true)
      try {
        const label = choice === -1 ? `${customGrams} g` : `${options[choice].label} (${Math.round(unitGrams)} g)`
        await logNewFood({ name: food.name, serving: label, grams: unitGrams, nutrients: nutrientsForGrams(food, unitGrams), source: 'usda' }, meal, qty, date)
        onLogged(`Logged ${food.name.split(',')[0]} to ${meal}`)
      } finally {
        setSaving(false)
      }
    })

  return (
    <div className="-mx-2 my-1 rounded-lg bg-(--panel-2) p-3">
      <div className="text-sm">
        <FoodName name={food.name} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-(--muted)">
          Amount
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 block w-20 rounded border border-(--line) bg-(--bg) px-2 py-1.5 font-mono text-sm text-(--fg)"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs text-(--muted)">
          Portion
          <select
            value={choice}
            onChange={(e) => setChoice(Number(e.target.value))}
            className="mt-1 block w-full rounded border border-(--line) bg-(--bg) px-2 py-1.5 text-sm text-(--fg)"
          >
            {options.map((p, i) => (
              <option key={i} value={i}>
                {p.label} ({Math.round(p.grams)} g)
              </option>
            ))}
            <option value={-1}>Custom grams…</option>
          </select>
        </label>
        {choice === -1 && (
          <label className="text-xs text-(--muted)">
            Grams
            <input
              type="number"
              min={1}
              value={customGrams}
              onChange={(e) => setCustomGrams(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 block w-20 rounded border border-(--line) bg-(--bg) px-2 py-1.5 font-mono text-sm text-(--fg)"
            />
          </label>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between font-mono text-[11px] text-(--muted)">
        <span>
          {Math.round(totalGrams)} g{kcal != null && ` · ${kcal} kcal`}
        </span>
        <span>% of daily target</span>
      </div>
      <div className="mt-1.5">
        <NutrientChips nutrients={preview} max={8} />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={log}
          disabled={saving || totalGrams <= 0}
          className="flex-1 rounded-lg bg-(--c-good) px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40"
        >
          Log to {meal}
        </button>
        <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-(--muted) hover:text-(--fg)">
          Cancel
        </button>
      </div>
    </div>
  )
}
