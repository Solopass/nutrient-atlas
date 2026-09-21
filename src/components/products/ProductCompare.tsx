import { useEffect, type ReactNode } from 'react'
import { NUTRIENTS } from '../../data/nutrients'
import type { Product } from '../../db/db'
import { rateForm } from '../../lib/products/forms'
import { money, type ProductScore } from '../../lib/products/score'
import { STATUS_META, UL_BASIS, fmt, scoreColor } from '../../lib/status'
import { useProfile } from '../../state/profile'
import { ScoreBadge, Stars, displayName } from './ProductBits'

/** What counts toward the upper limit, by the same rules as scoring. */
function ulAmount(p: Product, id: string, amount: number) {
  const n = NUTRIENT_BY_ID.get(id)
  if (!n) return 0
  if (n.ulAppliesTo === 'supplements') return p.kind === 'supplement' ? amount * (n.ulSupplementScale ?? 1) : 0
  if (p.kind === 'food' && UL_BASIS[id]) return (p.nutrients[UL_BASIS[id]] ?? 0)
  return amount
}

const NUTRIENT_BY_ID = new Map(NUTRIENTS.map((n) => [n.id, n]))
const pctColor = (p: number) => STATUS_META[p < 50 ? 'deficient' : p < 80 ? 'attention' : p <= 120 ? 'good' : 'above'].color

/** Side by side: score parts, cost, and every nutrient as % of your daily target, best in each row highlighted. */
export function ProductCompare({ items, onClose }: { items: { product: Product; score: ProductScore }[]; onClose: () => void }) {
  const { byId, profile } = useProfile()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Nutrients any of them has, biggest contributions first.
  const ids = [...new Set(items.flatMap((i) => Object.keys(i.score.amounts)))]
    .filter((id) => byId.get(id) && id !== 'retinol')
    .sort((a, b) => Math.max(...items.map((i) => i.score.pct[b] ?? -1)) - Math.max(...items.map((i) => i.score.pct[a] ?? -1)))
  const best = (vals: (number | null)[], low = false) => {
    const xs = vals.filter((v): v is number => v != null)
    if (xs.length < 2) return null
    return low ? Math.min(...xs) : Math.max(...xs)
  }
  const partKeys = items[0]?.score.parts.map((p) => p.key) ?? []
  const col = `minmax(9rem,1fr)`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Compare products" className="card flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-b-none sm:rounded-b-[14px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-(--line) px-5 py-3">
          <h2 className="text-lg font-semibold">Compare</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-xl leading-none text-(--muted) hover:bg-(--panel-2) hover:text-(--fg)">
            ×
          </button>
        </div>
        <div className="overflow-auto p-4">
          <div className="grid gap-x-3 text-xs" style={{ gridTemplateColumns: `8.5rem repeat(${items.length}, ${col})` }}>
            {/* Header */}
            <div />
            {items.map(({ product: p, score: s }) => (
              <div key={p.id} className="flex items-start gap-2 pb-3">
                <ScoreBadge score={s} size={44} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] text-(--muted)">{p.brand || '—'}</div>
                  <div className="line-clamp-2 text-sm leading-tight font-medium" title={displayName(p)}>
                    {p.name}
                  </div>
                  <Stars value={p.rating} size="text-xs" />
                </div>
              </div>
            ))}

            <Section label="Score" n={items.length} />
            {partKeys.map((k) => {
              const vals = items.map((i) => i.score.parts.find((x) => x.key === k)?.score ?? null)
              const top = best(vals)
              return (
                <Row key={k} label={items[0].score.parts.find((x) => x.key === k)!.label}>
                  {items.map((i, j) => {
                    const part = i.score.parts.find((x) => x.key === k)!
                    const v = vals[j]
                    return (
                      <Cell key={i.product.id} title={part.detail} highlight={v != null && v === top}>
                        {v != null ? (
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 rounded-full bg-(--panel-2)">
                              <span className="block h-full rounded-full" style={{ width: `${v}%`, background: scoreColor(v) }} />
                            </span>
                            <span className="w-7 text-right font-mono">{v}</span>
                          </span>
                        ) : (
                          <span className="text-(--muted)">–</span>
                        )}
                      </Cell>
                    )
                  })}
                </Row>
              )
            })}

            <Section label="Cost" n={items.length} />
            {(() => {
              const perDay = items.map((i) => i.score.costPerDay ?? i.score.costPerServing)
              const low = best(perDay, true)
              return (
                <Row label={items.some((i) => i.product.kind === 'supplement') ? 'Per day' : 'Per serving'}>
                  {items.map((i, j) => (
                    <Cell key={i.product.id} highlight={perDay[j] != null && perDay[j] === low}>
                      <span className="font-mono">{perDay[j] != null ? money(perDay[j]!, profile.currency) : '–'}</span>
                    </Cell>
                  ))}
                </Row>
              )
            })()}
            <Row label="Serving">
              {items.map((i) => (
                <Cell key={i.product.id}>
                  <span className="text-(--dim)">
                    {i.product.kind === 'supplement' && (i.product.servingsPerDay ?? 1) !== 1 ? `${i.product.servingsPerDay} × ` : ''}
                    {i.product.serving}
                  </span>
                </Cell>
              ))}
            </Row>

            <Section label="Per day, % of your target" n={items.length} />
            {ids.map((id) => {
              const n = byId.get(id)!
              const vals = items.map((i) => i.score.pct[id] ?? null)
              // Best = most useful: past 100% of target is a tie, and anything over the upper limit can't win.
              const safe = items.map((i, j) => (vals[j] != null && !(n.upperLimit != null && ulAmount(i.product, id, i.score.amounts[id]) > n.upperLimit) ? Math.min(vals[j]!, 100) : null))
              const top = best(safe)
              return (
                <Row key={id} label={n.category === 'bvitamin' ? `${n.symbol} · ${n.name}` : (n.shortName ?? n.name)}>
                  {items.map((i, j) => {
                    const amount = i.score.amounts[id]
                    const p = vals[j]
                    const form = i.product.forms?.[id]
                    const verdict = form ? rateForm(id, form) : null
                    const overUL = n.upperLimit != null && amount != null && ulAmount(i.product, id, amount) > n.upperLimit
                    return (
                      <Cell key={i.product.id} highlight={safe[j] != null && safe[j] === top} title={form ? `${form}${verdict ? ` — ${verdict.why}` : ''}` : undefined}>
                        {amount == null ? (
                          <span className="text-(--line)">·</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            {p != null ? (
                              <span className="h-1.5 flex-1 rounded-full bg-(--panel-2)">
                                <span className="block h-full rounded-full" style={{ width: `${Math.min(p, 100)}%`, background: overUL ? 'var(--c-over)' : pctColor(p) }} />
                              </span>
                            ) : (
                              <span className="flex-1" />
                            )}
                            <span className="w-12 text-right font-mono" style={{ color: overUL ? 'var(--c-over)' : undefined }}>
                              {p != null ? `${Math.round(p)}%` : `${fmt(amount)}${n.unit}`}
                            </span>
                            {verdict && <span style={{ color: verdict.quality === 'good' ? 'var(--c-good)' : verdict.quality === 'poor' ? 'var(--c-deficient)' : 'var(--c-attention)' }}>{verdict.quality === 'good' ? '●' : verdict.quality === 'poor' ? '○' : '◐'}</span>}
                          </span>
                        )}
                      </Cell>
                    )
                  })}
                </Row>
              )
            })}
          </div>
          <p className="mt-4 text-[11px] text-(--muted)">
            Highlighted: best in the row. ● good form · ◐ fine · ○ poorly absorbed (hover for why). Red: over the upper limit on its own.
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ label, n }: { label: string; n: number }) {
  return <div className="pt-3 pb-1 text-[10px] tracking-[0.16em] text-(--muted) uppercase" style={{ gridColumn: `span ${n + 1}` }}>{label}</div>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="truncate border-t border-(--line)/60 py-1.5 text-(--dim)">{label}</div>
      {children}
    </>
  )
}

function Cell({ children, highlight, title }: { children: ReactNode; highlight?: boolean; title?: string }) {
  return (
    <div title={title} className={`border-t border-(--line)/60 px-1.5 py-1.5 ${highlight ? 'rounded bg-(--c-good)/10' : ''}`}>
      {children}
    </div>
  )
}
