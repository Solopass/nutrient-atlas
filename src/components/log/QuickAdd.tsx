import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { nameParts } from '../../data/usda'
import { db, type Meal } from '../../db/db'
import { logSavedFood } from '../../db/logging'
import { formatDay } from '../../lib/history'
import { copyEntries, itemsKcal, logSavedMeal, previousMeal } from '../../lib/quickLog'
import { useGuard } from '../../lib/useGuard'

/** One-tap logging: repeat a previous meal, saved meals, recent foods. Shown above search. */
export function QuickAdd({ meal, date, onLogged }: { meal: Meal; date: string; onLogged: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const guard = useGuard()
  const prev = useLiveQuery(() => previousMeal(date, meal), [date, meal])
  const saved = useLiveQuery(() => db.meals.orderBy('lastUsedAt').reverse().limit(8).toArray(), [])
  const recent = useLiveQuery(() => db.foods.orderBy('lastUsedAt').reverse().limit(10).toArray(), [])

  const run = (fn: () => Promise<unknown>, msg: string) =>
    guard(async () => {
      setBusy(true)
      try {
        await fn()
        onLogged(msg)
      } finally {
        setBusy(false)
      }
    })

  if (!prev && !saved?.length && !recent?.length) return null

  return (
    <div className="space-y-4">
      {prev && (
        <Group title={`Same ${meal} as ${formatDay(prev.date).toLowerCase()}`}>
          <button
            disabled={busy}
            onClick={() => run(() => copyEntries(prev.entries, date, meal), `Copied ${prev.entries.length} items to ${meal}`)}
            className="flex w-full items-center gap-3 rounded-lg bg-(--panel-2) p-3 text-left shadow-[inset_0_0_0_1px_var(--line)] transition hover:shadow-[inset_0_0_0_1px_var(--c-above)]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--c-above)/15 text-(--c-above)">↻</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{prev.entries.map((e) => foodLabel(e.name)).join(', ')}</span>
              <span className="font-mono text-[11px] text-(--muted)">
                {prev.entries.length} items · {Math.round(itemsKcal(prev.entries))} kcal
              </span>
            </span>
            <span className="text-sm text-(--c-above)">Copy</span>
          </button>
        </Group>
      )}

      {saved && saved.length > 0 && (
        <Group title="Saved meals">
          <div className="flex flex-wrap gap-1.5">
            {saved.map((m) => (
              <button
                key={m.id}
                disabled={busy}
                onClick={() => run(() => logSavedMeal(m.id, date, meal), `Logged ${m.name} to ${meal}`)}
                className="rounded-full border border-(--line) bg-(--panel-2) px-3 py-1.5 text-xs hover:border-(--c-above)"
                title={m.items.map((i) => i.name).join('\n')}
              >
                <span className="text-(--fg)">{m.name}</span>
                <span className="ml-1.5 font-mono text-(--muted)">{Math.round(itemsKcal(m.items) / m.servings)} kcal</span>
              </button>
            ))}
          </div>
        </Group>
      )}

      {recent && recent.length > 0 && (
        <Group title="Recent">
          <div className="flex flex-wrap gap-1.5">
            {recent.map((f) => (
              <button
                key={f.id}
                disabled={busy}
                onClick={() => run(() => logSavedFood(f, meal, 1, date), `Logged ${foodLabel(f.name)} to ${meal}`)}
                className="max-w-full truncate rounded-full border border-(--line) px-3 py-1.5 text-xs text-(--dim) hover:border-(--c-above) hover:text-(--fg)"
                title={`${f.name} · ${f.serving}`}
              >
                + {foodLabel(f.name)} <span className="text-(--muted)">· {f.serving.replace(/\s*\(.*\)$/, '')}</span>
              </button>
            ))}
          </div>
        </Group>
      )}
    </div>
  )
}

/** Short display name: the real food, not USDA's group prefix ("Nuts, almonds, …" → "Almonds"). */
export function foodLabel(name: string) {
  const head = nameParts(name)[1]
  return head.charAt(0).toUpperCase() + head.slice(1)
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">{title}</h3>
      {children}
    </section>
  )
}
