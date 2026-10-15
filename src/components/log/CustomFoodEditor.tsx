import { useState } from 'react'
import { db, localDate, type Food, type LogEntry, type Meal } from '../../db/db'
import { parseDate } from '../../lib/history'
import { itemsKcal } from '../../lib/quickLog'
import type { Category } from '../../types'
import { useGuard } from '../../lib/useGuard'
import { LabelPaste } from './LabelPaste'
import { NutrientChips } from './NutrientChips'
import { NutrientRowsEditor, rowsFrom, rowsToNutrients, type Row } from './NutrientRows'

const CATS: Category[] = ['macro', 'limit', 'vitamin', 'mineral', 'bvitamin', 'trace', 'fatty', 'amino', 'advanced']

/**
 * Create or edit a food from its Nutrition Facts label: paste the label text
 * (read automatically) or type the lines. Saved to My foods; optionally
 * logged straight away.
 */
export function CustomFoodEditor({
  initial,
  barcode,
  draft,
  meal,
  date,
  onDone,
}: {
  initial: Food | null
  /** A new food for a barcode no database knows: saved with it, so the next scan finds it. */
  barcode?: string
  /** A new food pre-filled from an import (e.g. MealVision's single-food card). */
  draft?: { name: string; serving: string; grams?: number; nutrients: Record<string, number>; note?: string }
  meal: Meal
  date: string
  onDone: (msg?: string) => void
}) {
  const start = initial ?? draft
  const [name, setName] = useState(start?.name ?? '')
  const [serving, setServing] = useState(start?.serving ?? '1 serving')
  const [grams, setGrams] = useState(start?.grams ? String(start.grams) : '')
  // The editor lists label nutrients only; hidden companions like retinol aren't editable rows.
  const [rows, setRows] = useState<Row[]>(start ? rowsFrom(Object.fromEntries(Object.entries(start.nutrients).filter(([id]) => id !== 'retinol'))) : [])
  const [calories, setCalories] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const guard = useGuard()

  const nutrients = rowsToNutrients(rows)
  const macroKcal = itemsKcal([{ multiplier: 1, nutrients }])
  const valid = name.trim() && serving.trim() && Object.keys(nutrients).length > 0

  const save = (logToo: boolean) => guard(() => doSave(logToo))
  const doSave = async (logToo: boolean) => {
    setSaving(true)
    const now = Date.now()
    const allNutrients = { ...nutrients, ...(start?.nutrients?.retinol != null ? { retinol: start.nutrients.retinol } : {}) }
    const data = { name: name.trim(), serving: serving.trim(), grams: Number(grams) > 0 ? Number(grams) : undefined, nutrients: allNutrients }
    let foodId = initial?.id
    if (initial) await db.foods.update(initial.id, data)
    else foodId = await db.foods.add({ ...data, source: 'custom', ...(barcode && { barcode }), favorite: 0, useCount: 0, createdAt: now, lastUsedAt: now } as Food)
    if (logToo && foodId != null) {
      await db.logs.add({ date, loggedAt: date === localDate() ? now : parseDate(date).getTime() + 12 * 3600_000, meal, foodId, name: data.name, serving: data.serving, multiplier: 1, nutrients: allNutrients } as LogEntry)
      await db.foods.update(foodId, { lastUsedAt: now, useCount: (initial?.useCount ?? 0) + 1 })
      onDone(`Saved and logged ${data.name} to ${meal}`)
    } else {
      onDone(initial ? `Updated ${data.name}` : `Saved ${data.name} to My foods`)
    }
  }

  const input = 'rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 text-sm focus:border-(--c-above) focus:outline-none'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          {initial ? `Edit ${initial.name}` : 'Create a food from its label'}
          {barcode && <span className="ml-2 font-mono text-xs font-normal text-(--muted)">barcode {barcode}</span>}
        </h3>
        <button onClick={() => onDone()} className="text-sm text-(--muted) hover:text-(--fg)">
          Cancel
        </button>
      </div>

      <LabelPaste
        defaultOpen={!start}
        onUse={(label) => {
          setRows(() => rowsFrom(label.nutrients))
          if (label.servingLabel) setServing(label.servingLabel)
          if (label.grams) setGrams(String(label.grams))
          setCalories(label.calories ?? null)
        }}
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs text-(--dim)">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nature Valley granola" className={`mt-1 block w-full ${input}`} />
        </label>
        <label className="text-xs text-(--dim)">
          Serving
          <input value={serving} onChange={(e) => setServing(e.target.value)} placeholder="2/3 cup (55g)" className={`mt-1 block w-full ${input}`} />
        </label>
        <label className="text-xs text-(--dim)">
          Grams
          <input type="number" min={0} value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="optional" className={`mt-1 block w-24 font-mono ${input}`} />
        </label>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-(--dim)">
          <span>Per serving</span>
          {Object.keys(nutrients).length > 0 && (
            <span className="font-mono text-(--muted)">
              ≈ {Math.round(macroKcal)} kcal from macros
              {calories != null && Math.abs(calories - macroKcal) > Math.max(25, calories * 0.2) && (
                <span className="text-(--c-attention)"> · label says {calories}, check the macros</span>
              )}
            </span>
          )}
        </div>
        <NutrientRowsEditor rows={rows} setRows={setRows} categories={CATS} />
      </div>

      {Object.keys(nutrients).length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-(--dim)">One serving, as % of your targets</div>
          <NutrientChips nutrients={nutrients} max={10} />
          <p className="mt-1.5 text-[11px] text-(--muted)">
            Labels usually list only a few vitamins and minerals. Others will show as “no data” for this food, not zero.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-(--line) pt-4">
        <button onClick={() => save(true)} disabled={!valid || saving} className="rounded-lg bg-(--c-good) px-4 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
          {initial ? 'Save and log' : `Save and log to ${meal}`}
        </button>
        <button onClick={() => save(false)} disabled={!valid || saving} className="rounded-lg border border-(--line) px-4 py-2 text-sm hover:border-(--c-above) disabled:opacity-40">
          {initial ? 'Save changes' : 'Save to My foods'}
        </button>
      </div>
    </div>
  )
}
