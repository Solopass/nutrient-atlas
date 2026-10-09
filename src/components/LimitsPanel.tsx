import { LIMIT_NEAR, STATUS_META, fmt } from '../lib/status'
import type { NutrientState } from '../types'

const SCALE = 150 // % of limit shown on the gauge

/** "Stay under" nutrients as horizontal gauges: green well under, yellow near, orange over. */
export function LimitsPanel({ states, selectedId, onSelect }: { states: NutrientState[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const limits = states.filter((s) => s.nutrient.category === 'limit')
  const over = limits.filter((s) => s.status === 'overLimit').length
  const near = limits.filter((s) => s.status === 'attention').length

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
        <span>
          <span style={{ color: 'var(--k-limit)' }}>Limits</span> · stay under
        </span>
        <span className="font-mono tracking-normal normal-case">
          {over > 0 && <span className="text-(--c-over)">{over} over</span>}
          {over > 0 && near > 0 && ' · '}
          {near > 0 && <span className="text-(--c-attention)">{near} near</span>}
          {over === 0 && near === 0 && <span className="text-(--c-good)">all under</span>}
        </span>
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {limits.map((s) => (
          <Gauge key={s.nutrient.id} state={s} selected={selectedId === s.nutrient.id} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

function Gauge({ state, selected, onSelect }: { state: NutrientState; selected: boolean; onSelect: (id: string) => void }) {
  const { nutrient: n, intake, status, pct } = state
  const color = STATUS_META[status].color
  const noData = status === 'noData'
  const limit = n.target ?? 0
  const pos = (v: number) => `${(Math.min(v, SCALE) / SCALE) * 100}%`
  const amount = intake?.amount ?? 0
  const left = limit - amount

  return (
    <button
      onClick={() => onSelect(n.id)}
      className="rounded-lg bg-(--panel-2) p-2.5 text-left transition hover:brightness-125"
      style={{ boxShadow: selected ? `inset 0 0 0 1.5px ${color}` : `inset 0 0 0 1px ${noData ? 'var(--line)' : `color-mix(in oklab, ${color} 30%, transparent)`}` }}
      title={`${n.name}: ${noData ? 'no data' : `${fmt(amount)} of ${fmt(limit)} ${n.unit} limit`}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-xs text-(--dim)">{n.shortName ?? n.name}</span>
        <span className="font-mono text-sm font-semibold" style={{ color: noData ? 'var(--muted)' : color }}>
          {!noData && status !== 'overLimit' && <span className="status-glyph">{STATUS_META[status].glyph} </span>}
          {noData ? '—' : pct != null ? `${Math.round(pct)}%` : status === 'overLimit' ? '⚠' : '0%'}
        </span>
      </div>

      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-(--bg)">
        {/* zones */}
        <div className="absolute inset-y-0 left-0 bg-(--c-good)/15" style={{ width: pos(LIMIT_NEAR) }} />
        <div className="absolute inset-y-0 bg-(--c-attention)/15" style={{ left: pos(LIMIT_NEAR), width: `calc(${pos(100)} - ${pos(LIMIT_NEAR)})` }} />
        <div className="absolute inset-y-0 right-0 bg-(--c-over)/15" style={{ left: pos(100) }} />
        {!noData && pct != null && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pos(pct), background: color }} />}
        {!noData && pct == null && status === 'overLimit' && <div className="absolute inset-0 bg-(--c-over)" />}
        {noData && <div className="absolute inset-0 opacity-50" style={{ background: 'repeating-linear-gradient(45deg, transparent 0 4px, var(--c-nodata) 4px 5px)' }} />}
      </div>
      <div className="relative h-0">
        <div className="absolute -top-2.5 h-3 w-px bg-(--fg)/60" style={{ left: pos(100) }} />
      </div>

      <div className="mt-1.5 flex justify-between gap-1 font-mono text-[10px] text-(--muted)">
        <span className="truncate">{noData ? 'no data' : `${fmt(amount)}/${fmt(limit)} ${n.unit}`}</span>
        {!noData && (
          <span className="shrink-0" style={{ color: left < 0 ? 'var(--c-over)' : undefined }}>
            {limit === 0 ? (amount > 0 ? 'avoid' : 'none') : left >= 0 ? `${fmt(left)} left` : `+${fmt(-left)}`}
          </span>
        )}
      </div>
    </button>
  )
}
