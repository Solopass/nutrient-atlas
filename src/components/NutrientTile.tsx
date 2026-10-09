import { STATUS_META, fmt } from '../lib/status'
import type { NutrientState } from '../types'

interface Props {
  state: NutrientState
  index: number
  selected: boolean
  onSelect: (id: string) => void
}

export function NutrientTile({ state, index, selected, onSelect }: Props) {
  const { nutrient: n, intake, status, pct, partial } = state
  const color = STATUS_META[status].color
  const noData = status === 'noData'
  const level = pct != null ? Math.min(pct, 100) : status === 'noTarget' ? 100 : 0

  const pctLabel = pct != null ? `${Math.round(pct)}%` : status === 'overLimit' ? 'UL' : noData ? '—' : ''
  // Large mg values (amino acids) read better in grams
  const big = n.unit === 'mg' && (n.target ?? 0) >= 1000
  const unit = big ? 'g' : n.unit
  const v = (x: number) => fmt(big ? x / 1000 : x)
  const amountLabel = noData
    ? 'no data'
    : n.target == null
      ? v(intake!.amount)
      : `${v(intake!.amount)}/${v(n.target)}`

  return (
    <button
      type="button"
      onClick={() => onSelect(n.id)}
      title={`${n.name}: ${STATUS_META[status].label}${partial ? ' (partial data)' : ''}`}
      className="group relative flex h-[5.9rem] min-w-0 flex-col overflow-hidden rounded-lg p-2 text-left transition duration-200 hover:-translate-y-0.5"
      style={{
        background: 'var(--panel-2)',
        boxShadow: selected
          ? `inset 0 0 0 1.5px ${color}, 0 0 18px -4px ${color}`
          : `inset 0 0 0 1px color-mix(in oklab, ${color} ${noData ? 45 : 30}%, transparent)`,
      }}
    >
      {/* liquid fill: height = % of target */}
      {level > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-700"
          style={{
            height: `${level}%`,
            background: `linear-gradient(180deg, color-mix(in oklab, ${color} ${status === 'noTarget' ? 8 : 24}%, transparent), color-mix(in oklab, ${color} 4%, transparent))`,
          }}
        />
      )}
      {noData && (
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: 'repeating-linear-gradient(45deg, transparent 0 5px, var(--c-nodata) 5px 6px)' }}
        />
      )}

      <div className="relative flex items-center justify-between font-mono text-[10px] leading-none">
        <span className="text-(--muted)">
          {index}
          {partial && (
            <span className="ml-1 text-(--c-attention)" aria-label="partial data">
              ◐
            </span>
          )}
        </span>
        <span className="font-semibold" style={{ color }}>
          {status === 'overLimit' ? '⚠ ' : <span className="status-glyph">{STATUS_META[status].glyph} </span>}
          {pctLabel}
        </span>
      </div>
      <div className="relative mt-1.5 text-[19px] leading-none font-bold tracking-tight">{n.symbol}</div>
      <div className="relative mt-1 truncate text-[10px] text-(--dim)">{n.name}</div>
      <div className="relative mt-auto truncate font-mono text-[9.5px] text-(--muted)">
        {amountLabel}
        {!noData && <span className="opacity-70"> {unit}</span>}
      </div>
    </button>
  )
}
