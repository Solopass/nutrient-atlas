import { STATUS_META } from '../lib/status'
import type { Status } from '../types'

const ORDER: Status[] = ['deficient', 'attention', 'good', 'above', 'overLimit', 'noData', 'noTarget']

export function Legend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-(--dim)">
      {ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{
              background: s === 'noData' ? 'transparent' : STATUS_META[s].color,
              border: s === 'noData' ? `1.5px dashed ${STATUS_META[s].color}` : undefined,
            }}
          />
          {STATUS_META[s].label}
          <span className="text-(--muted)">{STATUS_META[s].range}</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="text-(--c-attention)">◐</span>
        Partial data
      </span>
    </div>
  )
}
