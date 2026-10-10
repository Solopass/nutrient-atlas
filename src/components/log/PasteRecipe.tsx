import { useState } from 'react'
import type { MealItem } from '../../db/db'
import { nameParts, type UsdaFood } from '../../data/usda'
import { searchFoods } from '../../data/usdaClient'
import { usdaIngredient } from '../../lib/recipe'
import { gramsFor, parseRecipeText, pickIngredient, searchQueries, type IngredientLine } from '../../lib/recipeText'
import { NutrientChips } from './NutrientChips'

interface Row {
  line: IngredientLine
  options: UsdaFood[]
  choice: number
  grams: number
  how: string
  estimated: boolean
  include: boolean
}

const EXAMPLE = `Lentil soup (serves 4)
1 cup dried red lentils
1 onion, diced
2 carrots, chopped
3 garlic cloves, minced
1 (14 oz) can diced tomatoes
2 tbsp olive oil
1 tsp ground cumin
4 cups vegetable broth
Salt and pepper to taste`

/**
 * Paste a recipe's ingredient list: each line is matched to a USDA food and
 * turned into grams (USDA portion weights), then reviewed here: change the
 * food, fix the grams, leave lines out. Opens in the recipe builder to save.
 */
export function PasteRecipe({ onDone, onCancel }: { onDone: (draft: { name: string; servings: number; items: MealItem[] }) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [servings, setServings] = useState(4)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [skipped, setSkipped] = useState<IngredientLine[]>([])
  const [busy, setBusy] = useState(false)
  const field = 'rounded border border-(--line) bg-(--bg) px-2 py-1.5 text-sm text-(--fg)'

  const read = async () => {
    setBusy(true)
    try {
      const parsed = parseRecipeText(text)
      if (parsed.servings) setServings(parsed.servings)
      // A first line without an amount is usually the recipe's name.
      const [first, ...others] = parsed.lines
      const hasTitle = !!first && first.qty == null && !first.skip
      if (hasTitle) setName((n) => n || first.raw.replace(/\(.*?\)/g, '').trim())
      const lines = hasTitle ? others : parsed.lines
      setSkipped(lines.filter((l) => l.skip))
      const wanted = lines.filter((l) => !l.skip)
      setRows(
        await Promise.all(
          wanted.map(async (line): Promise<Row> => {
            let results: UsdaFood[] = []
            for (const q of searchQueries(line.food)) {
              results = await searchFoods(q, 15)
              if (results.length) break
            }
            const options = pickIngredient(line, results).slice(0, 6)
            const g = options[0] ? gramsFor(options[0], line.qty, line.unit) : { grams: 0, how: 'no match', estimated: true }
            return { line, options, choice: 0, ...g, include: options.length > 0 }
          }),
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const chosen = (rows ?? []).filter((r) => r.include && r.options[r.choice] && r.grams > 0)

  const open = () =>
    onDone({
      name: name.trim() || 'Pasted recipe',
      servings,
      items: chosen.map((r) => usdaIngredient(r.options[r.choice], { label: r.line.amountText || `${Math.round(r.grams)} g`, grams: r.grams }, 1)),
    })

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onCancel} className="rounded px-1.5 text-lg leading-none text-(--muted) hover:text-(--fg)" aria-label="Back">
          ←
        </button>
        <h3 className="text-sm font-semibold">Paste a recipe</h3>
      </div>

      {!rows ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            aria-label="Ingredient list"
            placeholder={EXAMPLE}
            className="w-full resize-y rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 font-mono text-xs placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
          />
          <p className="mt-1 text-xs text-(--muted)">One ingredient per line, from a website or your notes. Amounts like ½ cup, 2 tbsp, 200 g, 1 (14 oz) can or 3 cloves all work.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={read} disabled={busy || !text.trim()} className="rounded-lg bg-(--c-above) px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? 'Reading…' : 'Read ingredients'}
            </button>
            {!text && (
              <button onClick={() => setText(EXAMPLE)} className="rounded-lg px-3 py-2 text-sm text-(--muted) hover:text-(--fg)">
                Try an example
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 basis-48 text-xs text-(--muted)">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lentil soup" className={`mt-1 block w-full ${field}`} />
            </label>
            <label className="text-xs text-(--muted)">
              Makes
              <span className="mt-1 flex items-center gap-1.5">
                <input type="number" min={1} value={servings} onChange={(e) => setServings(Math.max(1, Math.round(Number(e.target.value) || 1)))} className={`w-16 font-mono ${field}`} />
                <span className="text-sm text-(--dim)">portions</span>
              </span>
            </label>
          </div>

          <ul className="mt-4 space-y-2" aria-label="Matched ingredients">
            {rows.map((r, i) => {
              const food = r.options[r.choice]
              return (
                <li key={i} className={`rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)] ${r.include ? '' : 'opacity-50'}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={r.include} onChange={() => update(i, { include: !r.include })} className="mt-1 accent-(--c-above)" aria-label={`Include ${r.line.raw}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[11px] text-(--muted)">{r.line.raw}</div>
                      {food ? (
                        <select
                          value={r.choice}
                          onChange={(e) => {
                            const choice = Number(e.target.value)
                            update(i, { choice, ...gramsFor(r.options[choice], r.line.qty, r.line.unit) })
                          }}
                          aria-label={`USDA food for ${r.line.raw}`}
                          className={`mt-1 block w-full ${field}`}
                        >
                          {r.options.map((o, j) => (
                            <option key={o.fdcId} value={j}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-xs text-(--c-attention)">No USDA match for “{r.line.food}”. Leave it out, or add it in the recipe builder.</p>
                      )}
                      {food && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={r.grams}
                            onChange={(e) => update(i, { grams: Math.max(0, Number(e.target.value) || 0), estimated: false, how: 'your amount' })}
                            aria-label={`Grams of ${nameParts(food.name)[1]}`}
                            className={`w-20 font-mono ${field} ${r.estimated ? 'border-(--c-attention)' : ''}`}
                          />
                          <span className="text-xs text-(--muted)">g</span>
                          <span className={`text-[11px] ${r.estimated ? 'text-(--c-attention)' : 'text-(--muted)'}`}>{r.estimated ? `⚠ ${r.how}` : r.how}</span>
                        </div>
                      )}
                      {food && r.include && (
                        <div className="mt-2">
                          <NutrientChips nutrients={Object.fromEntries(Object.entries(food.per100g).map(([k, v]) => [k, (v * r.grams) / 100]))} max={5} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {skipped.length > 0 && (
            <p className="mt-3 text-[11px] text-(--muted)">
              Left out: {skipped.map((l) => `“${l.raw}” (${l.skip === 'to taste' ? 'to taste' : l.skip === 'water' ? 'water' : 'heading'})`).join(', ')}.
            </p>
          )}

          <div className="sticky bottom-0 -mx-5 mt-5 flex gap-2 border-t border-(--line) bg-(--panel) px-5 py-3">
            <button onClick={open} disabled={chosen.length === 0} className="flex-1 rounded-lg bg-(--c-good) px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
              Open in recipe builder ({chosen.length})
            </button>
            <button onClick={() => setRows(null)} className="rounded-lg border border-(--line) px-3 py-2 text-sm hover:border-(--c-above)">
              Edit text
            </button>
          </div>
        </>
      )}
    </div>
  )
}
