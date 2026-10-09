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
          <span className="font-mono text-[10px]" style={{ color: STATUS_META[s].color }} aria-hidden>
            {STATUS_META[s].glyph}
          </span>
          {STATUS_META[s].label}
          <span className="text-(--muted)">{STATUS_META[s].range}</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="text-(--c-attention)">◐</span>
        Partial data
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" aria-hidden className="rounded-sm bg-(--c-good)/70">
          {[3, 9].flatMap((x) => [3, 9].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="var(--supp-dot)" fillOpacity="0.75" />))}
        </svg>
        From supplements
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-(--fg)/80" />
        Previous day / week
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" aria-hidden className="text-(--fg)/80">
          <path d="M2 1.5h8M6 1.5v9M2 10.5h8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeDasharray="0" />
        </svg>
        7-day low–high
      </span>
    </div>
  )
}
