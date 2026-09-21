import type { ReactNode } from 'react'
import { CATEGORY_LABEL } from '../data/nutrients'
import { STATUS_META, amountAgainstUL, fmt, isMet, isScorable, scoreColor } from '../lib/status'
import type { Category, NutrientState } from '../types'

interface Common {
  states: NutrientState[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-baseline justify-between text-[10.5px] font-medium tracking-[0.18em] text-(--muted) uppercase">
        <span>{title}</span>
        {aside && <span className="tracking-normal normal-case">{aside}</span>}
      </h2>
      {children}
    </section>
  )
}

/** Per-category coverage with a heatmap cell per nutrient. */
export function CategoryPanel({ states, categories, selectedId, onSelect }: Common & { categories: Category[] }) {
  return (
    <Card title="Coverage by category">
      <div className="space-y-3.5">
        {categories.map((c) => {
          const group = states.filter((s) => s.nutrient.category === c)
          const scorable = group.filter(isScorable)
          const met = scorable.filter(isMet).length
          const pct = scorable.length ? (met / scorable.length) * 100 : null
          return (
            <div key={c}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-(--dim)">{CATEGORY_LABEL[c].replace('Essential ', '')}</span>
                <span className="font-mono">
                  {pct != null ? (
                    <>
                      <span className="font-semibold" style={{ color: scoreColor(pct) }}>
                        {Math.round(pct)}%
                      </span>
                      <span className="ml-1.5 text-(--muted)">
                        {met}/{scorable.length}
                      </span>
                    </>
                  ) : (
                    <span className="text-(--muted)">amounts only</span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-[3px]">
                {group.map((s) => {
                  const color = STATUS_META[s.status].color
                  const noData = s.status === 'noData'
                  return (
                    <button
                      key={s.nutrient.id}
                      onClick={() => onSelect(s.nutrient.id)}
                      title={`${s.nutrient.name}: ${s.pct != null ? Math.round(s.pct) + '%' : STATUS_META[s.status].label}`}
                      className="h-4 min-w-4 flex-1 rounded-[3px] transition hover:scale-125"
                      style={{
                        background: noData ? 'transparent' : color,
                        opacity: noData ? 1 : s.status === 'noTarget' ? 0.3 : 0.85,
                        border: noData ? `1px dashed ${color}` : undefined,
                        outline: selectedId === s.nutrient.id ? '1.5px solid var(--fg)' : undefined,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** The lowest nutrients, ranked, with how much is left and what to eat. */
export function GapsPanel({ states, selectedId, onSelect }: Common) {
  const gaps = states
    .filter((s) => s.pct != null && s.pct < 80 && s.nutrient.category !== 'advanced')
    .sort((a, b) => a.pct! - b.pct!)
    .slice(0, 7)
  const flags = states.filter((s) => s.status === 'overLimit')
  const unknown = states.filter((s) => s.status === 'noData' || s.partial)

  return (
    <div className="space-y-4">
      <Card title="Biggest gaps" aside={<span className="text-(--muted)">{gaps.length} under 80%</span>}>
        <ul className="space-y-2.5">
          {gaps.map((s) => {
            const n = s.nutrient
            const color = STATUS_META[s.status].color
            const left = n.target! - s.intake!.amount
            return (
              <li key={n.id}>
                <button
                  onClick={() => onSelect(n.id)}
                  className={`w-full rounded-md text-left transition hover:bg-(--panel-2) ${selectedId === n.id ? 'bg-(--panel-2)' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-7 w-9 shrink-0 place-items-center rounded text-[11px] font-bold"
                      style={{ background: `color-mix(in oklab, ${color} 22%, transparent)`, color }}
                    >
                      {n.symbol}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate">{n.name}</span>
                        <span className="font-semibold font-mono" style={{ color }}>
                          {Math.round(s.pct!)}%
                        </span>
                      </div>
                      <div className="relative mt-1 h-1 rounded-full bg-(--panel-2)">
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.pct}%`, background: color }} />
                        <div className="absolute -top-0.5 h-2 w-px bg-(--muted)" style={{ left: '80%' }} />
                      </div>
                      <div className="mt-1 truncate text-[10.5px] text-(--muted)">
                        <span className="font-mono text-(--dim)">
                          +{fmt(left)} {n.unit}
                        </span>{' '}
                        · {n.sources.slice(0, 2).join(', ')}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      {(flags.length > 0 || unknown.length > 0) && (
        <Card title="Flags">
          <ul className="space-y-2 text-xs">
            {flags.map((s) => (
              <li key={s.nutrient.id}>
                <button onClick={() => onSelect(s.nutrient.id)} className="flex w-full items-start gap-2 text-left">
                  <span className="mt-0.5 text-(--c-over)">⚠</span>
                  <span>
                    <span className="font-medium">{s.nutrient.name}</span> over upper limit
                    <span className="block text-[10.5px] text-(--muted) font-mono">
                      {fmt(amountAgainstUL(s.nutrient, s.intake!))} {s.nutrient.unit}
                      {s.nutrient.ulAppliesTo === 'supplements' ? ' from supplements' : ''} vs {fmt(s.nutrient.upperLimit!)} {s.nutrient.unit} UL
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {unknown.length > 0 && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-(--c-nodata)">◌</span>
                <span>
                  <span className="font-medium">Incomplete data</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {unknown.map((s) => (
                      <button
                        key={s.nutrient.id}
                        onClick={() => onSelect(s.nutrient.id)}
                        className="rounded border border-dashed border-(--c-nodata) px-1.5 py-px text-[10.5px] text-(--dim) hover:text-(--fg)"
                      >
                        {s.nutrient.symbol}
                        {s.partial && <span className="ml-0.5 text-(--c-attention)">◐</span>}
                      </button>
                    ))}
                  </span>
                </span>
              </li>
            )}
          </ul>
        </Card>
      )}
    </div>
  )
}
