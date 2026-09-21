import { useProfile } from '../../state/profile'


/** The nutrients this food contributes most to, as % of daily target. */
export function NutrientChips({ nutrients, multiplier = 1, max = 6 }: { nutrients: Record<string, number>; multiplier?: number; max?: number }) {
  const { byId: BY_ID } = useProfile()
  const top = Object.entries(nutrients)
    .map(([id, v]) => {
      const n = BY_ID.get(id)
      return n?.target ? { n, pct: ((v * multiplier) / n.target) * 100 } : null
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.pct >= 5)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, max)

  if (top.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {top.map(({ n, pct }) => (
        <span key={n.id} className="rounded bg-(--panel-2) px-1.5 py-0.5 font-mono text-[10.5px] text-(--dim)" title={n.name}>
          {n.symbol} <span className="text-(--muted)">{Math.round(pct)}%</span>
        </span>
      ))}
    </div>
  )
}
