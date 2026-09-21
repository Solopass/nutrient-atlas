import type { Product } from '../../db/db'
import type { Flag, ProductScore, ScorePart } from '../../lib/products/score'
import { scoreColor } from '../../lib/status'

export const displayName = (p: Pick<Product, 'brand' | 'name'>) => (p.brand ? `${p.brand} ${p.name}` : p.name)

const gradeColor = (score: number | null) => (score == null ? 'var(--muted)' : scoreColor(score))

/** Big score ring with the letter grade. */
export function ScoreBadge({ score, size = 56 }: { score: ProductScore; size?: number }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const color = gradeColor(score.overall)
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} title={score.overall != null ? `Score ${score.overall}/100` : 'Not enough data to score'}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        {score.overall != null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score.overall / 100)} />
        )}
      </svg>
      <div className="text-center leading-none">
        <div className="font-mono font-bold" style={{ color, fontSize: size * 0.34 }}>
          {score.grade}
        </div>
        <div className="mt-0.5 font-mono text-(--muted)" style={{ fontSize: size * 0.18 }}>
          {score.overall ?? '–'}
        </div>
      </div>
    </div>
  )
}

/** One row per score part: label, bar, number, with the reason as a tooltip and caption. */
export function PartBars({ parts, detail = true }: { parts: ScorePart[]; detail?: boolean }) {
  return (
    <div className="grid gap-1">
      {parts.map((p) => (
        <div key={p.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-[11px]" title={p.detail}>
          <span className="text-(--muted)">{p.label}</span>
          <div className="min-w-0">
            <div className="h-1.5 rounded-full bg-(--panel-2)">
              {p.score != null && <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: gradeColor(p.score) }} />}
            </div>
            {detail && p.detail && <div className="mt-0.5 truncate text-[10px] text-(--muted)">{p.detail}</div>}
          </div>
          <span className="text-right font-mono" style={{ color: gradeColor(p.score) }}>
            {p.score ?? '–'}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null
  const icon = { bad: '⛔', warn: '⚠', info: 'ℹ' }
  const color = { bad: 'var(--c-deficient)', warn: 'var(--c-attention)', info: 'var(--muted)' }
  return (
    <ul className="space-y-0.5 text-[11px]">
      {flags.map((f) => (
        <li key={f.text} className="flex gap-1.5" style={{ color: color[f.level] }}>
          <span aria-hidden>{icon[f.level]}</span>
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Your own 1–5 rating; tap the same star again to clear. */
export function Stars({ value, onChange, size = 'text-base' }: { value?: number; onChange?: (v: number | undefined) => void; size?: string }) {
  return (
    <span className={`inline-flex ${size} leading-none`} role={onChange ? 'radiogroup' : undefined} aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((i) =>
        onChange ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i > 1 ? 's' : ''}`}
            onClick={() => onChange(value === i ? undefined : i)}
            className={`px-px transition hover:scale-125 ${value != null && i <= value ? 'text-(--c-attention)' : 'text-(--line) hover:text-(--muted)'}`}
          >
            ★
          </button>
        ) : (
          <span key={i} className={value != null && i <= value ? 'text-(--c-attention)' : 'text-(--line)'}>
            ★
          </span>
        ),
      )}
    </span>
  )
}
