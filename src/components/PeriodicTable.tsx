import { CATEGORY_LABEL } from '../data/nutrients'
import { isMet, isScorable, scoreColor } from '../lib/status'
import type { Category, NutrientState } from '../types'
import { NutrientTile } from './NutrientTile'

interface Props {
  states: NutrientState[]
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Secondary nutrients as periodic-table rows. Every row shares one column template, so tiles line up across rows. */
export function PeriodicTable({ states, categories, selectedId, onSelect }: Props) {
  let index = 0
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-4 flex items-baseline justify-between text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        <span>Periodic table · secondary nutrients</span>
        <span className="font-mono tracking-normal normal-case">{categories.reduce((a, c) => a + states.filter((s) => s.nutrient.category === c).length, 0)} tracked</span>
      </h2>
      <div className="space-y-3">
        {categories.map((c) => {
          const row = states.filter((s) => s.nutrient.category === c)
          const scorable = row.filter(isScorable)
          const met = scorable.filter(isMet).length
          const pct = scorable.length ? (met / scorable.length) * 100 : null
          const start = index + 1
          index += row.length
          return (
            <div key={c} className="grid items-center gap-2 lg:grid-cols-[9.5rem_minmax(0,1fr)] lg:gap-4">
              <div className="flex items-center gap-2 lg:block">
                <div className="flex items-center gap-2 text-xs font-medium" style={{ color: `var(--k-${c})` }}>
                  <span className="h-3 w-1 rounded-full" style={{ background: `var(--k-${c})` }} />
                  {CATEGORY_LABEL[c].replace('Essential ', '')}
                </div>
                <div className="font-mono text-[11px] text-(--muted) lg:mt-0.5 lg:pl-3">
                  {pct != null ? (
                    <>
                      <span style={{ color: scoreColor(pct) }}>{Math.round(pct)}%</span> · {met}/{scorable.length}
                    </>
                  ) : (
                    'amounts only'
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(5.4rem,1fr))] gap-1.5">
                {row.map((s, i) => (
                  <NutrientTile key={s.nutrient.id} state={s} index={start + i} selected={selectedId === s.nutrient.id} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
