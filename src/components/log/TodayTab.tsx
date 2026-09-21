import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, LOG_GROUPS, type LogEntry } from '../../db/db'
import { itemsKcal, saveMeal } from '../../lib/quickLog'
import { NutrientChips } from './NutrientChips'

export function TodayTab({ date }: { date: string }) {
  const entries = useLiveQuery(() => db.logs.where('date').equals(date).sortBy('loggedAt'), [date])
  const [saving, setSaving] = useState<string | null>(null) // meal group being saved
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  if (!entries) return null

  if (entries.length === 0) {
    return <div className="py-12 text-center text-sm text-(--muted)">Nothing logged on this day yet.</div>
  }

  return (
    <div className="space-y-5">
      {savedMsg && <p className="rounded-lg bg-(--c-good)/10 px-3 py-2 text-sm text-(--c-good)">{savedMsg}</p>}
      {LOG_GROUPS.map((meal) => {
        const rows = entries.filter((e) => e.meal === meal)
        if (rows.length === 0) return null
        const canSave = meal !== 'supplement'
        return (
          <section key={meal}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
                {meal === 'supplement' ? 'Supplements' : meal}
                <span className="ml-2 font-mono tracking-normal normal-case">{Math.round(itemsKcal(rows))} kcal</span>
              </h3>
              {canSave && saving !== meal && (
                <button onClick={() => setSaving(meal)} className="text-xs text-(--c-above) hover:underline">
                  Save as meal
                </button>
              )}
            </div>
            {saving === meal && (
              <SaveMealForm
                entries={rows}
                defaultName={`My ${meal}`}
                onCancel={() => setSaving(null)}
                onSaved={(name) => {
                  setSaving(null)
                  setSavedMsg(`Saved “${name}”. It's now one tap away in Search → Saved meals.`)
                }}
              />
            )}
            <ul className="divide-y divide-(--line)">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{e.name}</span>
                      <span className="shrink-0 text-xs text-(--muted)">
                        {e.multiplier !== 1 && `${+e.multiplier.toFixed(2)} × `}
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
                    value={+e.multiplier.toFixed(2)}
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

function SaveMealForm({ entries, defaultName, onCancel, onSaved }: { entries: LogEntry[]; defaultName: string; onCancel: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(defaultName)
  const [servings, setServings] = useState(1)
  const input = 'rounded-lg border border-(--line) bg-(--bg) px-2.5 py-1.5 text-sm focus:border-(--c-above) focus:outline-none'

  return (
    <form
      className="mb-2 flex flex-wrap items-end gap-2 rounded-lg bg-(--panel-2) p-3"
      onSubmit={async (ev) => {
        ev.preventDefault()
        if (!name.trim()) return
        await saveMeal(name.trim(), entries, servings)
        onSaved(name.trim())
      }}
    >
      <label className="min-w-40 flex-1 text-xs text-(--dim)">
        Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 block w-full ${input}`} />
      </label>
      <label className="text-xs text-(--dim)">
        Makes
        <span className="mt-1 flex items-center gap-1.5">
          <input type="number" min={1} step={1} value={servings} onChange={(e) => setServings(Math.max(1, Math.round(Number(e.target.value) || 1)))} className={`w-16 font-mono ${input}`} />
          <span className="text-(--muted)">portion{servings === 1 ? '' : 's'}</span>
        </span>
      </label>
      <button type="submit" className="rounded-lg bg-(--c-good) px-3 py-1.5 text-sm font-semibold text-black">
        Save
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-1.5 text-sm text-(--muted) hover:text-(--fg)">
        Cancel
      </button>
      <p className="w-full text-[11px] text-(--muted)">
        {entries.length} items. For a recipe (e.g. a pot of chili), set how many portions it makes; logging it later adds one portion.
      </p>
    </form>
  )
}
