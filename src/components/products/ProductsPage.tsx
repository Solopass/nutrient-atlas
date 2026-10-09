import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db, localDate, mealForTime, type Product } from '../../db/db'
import { logNewFood } from '../../db/logging'
import { productsToJson } from '../../lib/products/io'
import { money, scoreAll, type ProductScore } from '../../lib/products/score'
import { createSupplement, resumeSupplement } from '../../lib/supplements'
import { useGuard } from '../../lib/useGuard'
import { useProfile } from '../../state/profile'
import { Logo } from '../Logo'
import { Segmented } from '../settings/Controls'
import { Flags, PartBars, ScoreBadge, Stars, displayName } from './ProductBits'
import { ProductCompare } from './ProductCompare'
import { ProductEditor } from './ProductEditor'
import { BarcodeLookup } from './BarcodeLookup'
import { ProductImport, productKey } from './ProductImport'
import { certificationInfo } from '../../lib/products/certifications'
import type { OffProduct } from '../../lib/products/openFoodFacts'
import { shareOrDownload } from '../../lib/atlasImage'
import { useScoreContext } from './useScoreContext'

type Sort = 'overall' | 'gaps' | 'value' | 'rating' | 'newest'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'overall', label: 'Best overall' },
  { value: 'gaps', label: 'Fills my gaps' },
  { value: 'value', label: 'Best value' },
  { value: 'rating', label: 'My rating' },
  { value: 'newest', label: 'Newest' },
]
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'INR', 'JPY', 'CHF', 'SEK', 'MXN', 'BRL']
const MAX_COMPARE = 4

const partScore = (s: ProductScore, k: string) => s.parts.find((p) => p.key === k)?.score ?? -1

/**
 * Products: branded supplements and foods you use or are considering, scored
 * against your own gaps and ranked. Add them from a label, a file, or an AI chat.
 */
export function ProductsPage() {
  const { profile, update, byId } = useProfile()
  const ctx = useScoreContext()
  const products = useLiveQuery(() => db.products.toArray(), [])
  const supplements = useLiveQuery(() => db.supplements.toArray(), [])
  const [kind, setKind] = useState<Product['kind']>('supplement')
  const [mode, setMode] = useState<{ edit: Product | 'new'; prefill?: OffProduct } | 'import' | 'barcode' | null>(null)
  const [sort, setSort] = useState<Sort>('overall')
  const [tag, setTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const [comparing, setComparing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const guard = useGuard()

  const ofKind = useMemo(() => (products ?? []).filter((p) => p.kind === kind), [products, kind])
  const tags = useMemo(() => [...new Set(ofKind.flatMap((p) => p.tags ?? []))].sort(), [ofKind])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ofKind.filter((p) => (!tag || p.tags?.includes(tag)) && (!q || `${p.brand} ${p.name} ${(p.tags ?? []).join(' ')}`.toLowerCase().includes(q)))
  }, [ofKind, tag, query])
  // Value is relative to what's on screen, so filtering to "magnesium" compares magnesium with magnesium.
  const scores = useMemo(() => scoreAll(shown, ctx), [shown, ctx])
  const ranked = useMemo(() => {
    const s = (p: Product) => scores.get(p.id)!
    const by: Record<Sort, (a: Product, b: Product) => number> = {
      overall: (a, b) => (s(b).overall ?? -1) - (s(a).overall ?? -1),
      gaps: (a, b) => partScore(s(b), 'gaps') - partScore(s(a), 'gaps'),
      value: (a, b) => (s(a).unitCost ?? Infinity) - (s(b).unitCost ?? Infinity),
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (s(b).overall ?? -1) - (s(a).overall ?? -1),
      newest: (a, b) => b.createdAt - a.createdAt,
    }
    return [...shown].sort(by[sort])
  }, [shown, scores, sort])

  const taking = useMemo(() => new Set((supplements ?? []).filter((s) => s.active).map((s) => s.name.trim().toLowerCase())), [supplements])
  const isTaking = (p: Product) => taking.has(displayName(p).toLowerCase()) || taking.has(p.name.toLowerCase())
  const untracked = (supplements ?? []).filter((s) => !(products ?? []).some((p) => p.kind === 'supplement' && [displayName(p).toLowerCase(), p.name.toLowerCase()].includes(s.name.trim().toLowerCase())))

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg((x) => (x === m ? null : x)), 4000)
  }

  const takeDaily = (p: Product) =>
    guard(async () => {
      // A paused supplement with this name is resumed, not duplicated.
      const names = [displayName(p).toLowerCase(), p.name.toLowerCase()]
      const paused = (supplements ?? []).find((s) => !s.active && names.includes(s.name.trim().toLowerCase()))
      if (paused) {
        await resumeSupplement(paused.id)
        return flash(`Resumed ${paused.name}; logged for today.`)
      }
      await createSupplement({ name: displayName(p), dose: p.serving, dosesPerDay: p.servingsPerDay ?? 1, schedule: 'daily', nutrients: p.nutrients })
      flash(`${displayName(p)} added to your daily supplements and logged for today.`)
    })
  const logFood = (p: Product) =>
    guard(async () => {
      const meal = mealForTime()
      await logNewFood({ name: displayName(p), serving: p.serving, grams: p.grams, nutrients: p.nutrients, source: 'custom' }, meal, 1, localDate())
      flash(`Logged ${displayName(p)} to ${meal}.`)
    })
  const addMySupplements = () =>
    guard(async () => {
      const now = Date.now()
      const existing = new Set((products ?? []).map(productKey))
      const add = untracked
        .map((s) => ({ kind: 'supplement' as const, brand: '', name: s.name, serving: s.dose, servingsPerDay: s.dosesPerDay, nutrients: s.nutrients, source: 'manual' as const, createdAt: now, updatedAt: now }))
        .filter((p) => !existing.has(productKey(p)))
      await db.products.bulkAdd(add as Product[])
      flash(`Added ${add.length} of your supplements. Add brand, price and forms (Edit) for a fuller score.`)
    })
  const togglePick = (id: number) => setPicked((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : ps.length >= MAX_COMPARE ? ps : [...ps, id]))

  if (!products || !supplements) return null

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,var(--glow)_0%,var(--bg)_70%)]">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-6">
        <div className="flex items-center gap-3">
          <a href="#/" aria-label="Back to Atlas">
            <Logo />
          </a>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Products</h1>
            <p className="text-[13px] text-(--muted)">
              {ctx.foodStates ? `Ranked for you, against your last 7 days (${ctx.loggedDays} logged)` : 'Log a few days of food and the ranking becomes personal'}
            </p>
          </div>
        </div>
        <a href="#/" className="rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white hover:brightness-110">
          ← Back to Atlas
        </a>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 pb-32 sm:px-6 sm:pb-20">
        {mode === 'barcode' ? (
          <section className="card p-5">
            <BarcodeLookup
              onCancel={() => setMode(null)}
              onFound={(p) => {
                setKind(p.kind)
                setMode({ edit: 'new', prefill: p })
              }}
            />
          </section>
        ) : mode === 'import' ? (
          <section className="card p-5">
            <ProductImport
              kind={kind}
              onDone={(m) => {
                setMode(null)
                if (m) flash(m)
              }}
            />
          </section>
        ) : mode ? (
          <section className="card p-5">
            <ProductEditor initial={mode.edit === 'new' ? null : mode.edit} prefill={mode.prefill} kind={kind} ctx={ctx} onDone={() => setMode(null)} />
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<Product['kind']>
                value={kind}
                options={[
                  { value: 'supplement', label: `Supplements · ${products.filter((p) => p.kind === 'supplement').length}` },
                  { value: 'food', label: `Foods · ${products.filter((p) => p.kind === 'food').length}` },
                ]}
                onChange={(k) => {
                  setKind(k)
                  setTag(null)
                  setPicked([])
                }}
              />
              <div className="ml-auto flex flex-wrap gap-2">
                <button onClick={() => setMode({ edit: 'new' })} className="rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white hover:brightness-110">
                  + Add
                </button>
                <button onClick={() => setMode('barcode')} className="rounded-full border border-(--line) bg-(--panel) px-4 py-1.5 text-[13px] text-(--dim) hover:border-(--c-above) hover:text-(--fg)">
                  ▣ Barcode
                </button>
                <button onClick={() => setMode('import')} className="rounded-full border border-(--line) bg-(--panel) px-4 py-1.5 text-[13px] text-(--dim) hover:border-(--c-above) hover:text-(--fg)">
                  Import · AI · CSV
                </button>
                {products.length > 0 && (
                  <button
                    onClick={() => shareOrDownload(new Blob([productsToJson(products)], { type: 'application/json' }), `nutrient-atlas-products-${localDate()}.json`)}
                    className="rounded-full border border-(--line) bg-(--panel) px-4 py-1.5 text-[13px] text-(--dim) hover:border-(--c-above) hover:text-(--fg)"
                    title="Share or save all products as a file others can import"
                  >
                    Share list
                  </button>
                )}
              </div>
            </div>

            {msg && <p className="rounded-lg bg-(--c-good)/10 px-3 py-2 text-sm text-(--c-good)">{msg}</p>}

            {kind === 'supplement' && untracked.length > 0 && (
              <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="flex-1 text-(--dim)">
                  You take {untracked.length} supplement{untracked.length === 1 ? '' : 's'} not rated here yet ({untracked.map((s) => s.name).join(', ')}).
                </span>
                <button onClick={addMySupplements} className="rounded-full border border-(--line) px-3 py-1 text-[13px] hover:border-(--c-above)">
                  Add to compare
                </button>
              </div>
            )}

            {ofKind.length === 0 ? (
              <EmptyState kind={kind} onAdd={() => setMode({ edit: 'new' })} onImport={() => setMode('import')} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search brand, name, tag"
                    className="w-48 rounded-full border border-(--line) bg-(--panel) px-3 py-1.5 placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
                  />
                  {tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTag(tag === t ? null : t)}
                      aria-pressed={tag === t}
                      className={`rounded-full px-2.5 py-1 ${tag === t ? 'bg-(--fg) text-(--bg)' : 'bg-(--panel-2) text-(--dim) hover:text-(--fg)'}`}
                    >
                      {t}
                    </button>
                  ))}
                  <label className="ml-auto flex items-center gap-1.5 text-(--muted)">
                    Sort
                    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md border border-(--line) bg-(--panel-2) px-2 py-1 text-(--fg)">
                      {SORTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <select
                    value={profile.currency}
                    onChange={(e) => update({ currency: e.target.value })}
                    aria-label="Currency"
                    className="rounded-md border border-(--line) bg-(--panel-2) px-2 py-1 text-(--fg)"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <ol className="space-y-3">
                  {ranked.map((p, i) => {
                    const s = scores.get(p.id)!
                    const chips = Object.entries(s.pct)
                      .filter(([id]) => byId.get(id)?.category !== 'limit')
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                    return (
                      <li key={p.id} className="card grid gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_290px]">
                        <div className="flex items-center gap-3 lg:flex-col lg:items-center">
                          <span className="font-mono text-xs text-(--muted)">#{i + 1}</span>
                          <ScoreBadge score={s} />
                        </div>

                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            {p.brand && <span className="text-xs text-(--muted)">{p.brand}</span>}
                            <h3 className="text-base leading-tight font-semibold">{p.name}</h3>
                            {p.kind === 'supplement' && isTaking(p) && <span className="rounded-full bg-(--c-good)/15 px-2 py-0.5 text-[10.5px] text-(--c-good)">taking</span>}
                            {(p.certifications ?? []).map((c) => (
                              <span key={c} title={certificationInfo(c)?.what ?? 'Third-party tested'} className="rounded-full px-2 py-0.5 text-[10.5px] text-(--c-above) shadow-[inset_0_0_0_1px_var(--c-above)]">
                                ✓ {c}
                              </span>
                            ))}
                            <span className="ml-auto">
                              <Stars value={p.rating} onChange={(rating) => db.products.update(p.id, { rating, updatedAt: Date.now() })} />
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-(--muted)">
                            <span>
                              {p.kind === 'supplement' && (p.servingsPerDay ?? 1) !== 1 ? `${p.servingsPerDay} × ` : ''}
                              {p.serving}
                              {p.kind === 'supplement' ? ' a day' : ''}
                            </span>
                            {s.kcal != null && p.kind === 'food' && <span>{Math.round(s.kcal)} kcal</span>}
                            {(s.costPerDay ?? s.costPerServing) != null && <span className="text-(--dim)">{money((s.costPerDay ?? s.costPerServing)!, profile.currency)}{s.costPerDay != null ? '/day' : '/serving'}</span>}
                            {(p.tags ?? []).map((t) => (
                              <span key={t}>#{t}</span>
                            ))}
                          </div>
                          {chips.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {chips.map(([id, pct]) => {
                                const closes = s.closes.includes(id)
                                return (
                                  <span
                                    key={id}
                                    className="rounded px-1.5 py-0.5 font-mono text-[10.5px]"
                                    title={`${byId.get(id)?.name}: ${Math.round(pct)}% of your daily target${closes ? ' — closes one of your gaps' : ''}${p.forms?.[id] ? ` · ${p.forms[id]}` : ''}`}
                                    style={closes ? { color: 'var(--c-good)', background: 'color-mix(in oklab, var(--c-good) 16%, transparent)' } : { color: 'var(--dim)', background: 'var(--panel-2)' }}
                                  >
                                    {closes ? '✓ ' : ''}
                                    {byId.get(id)?.symbol} {Math.round(pct)}%
                                  </span>
                                )
                              })}
                            </div>
                          )}
                          <Flags flags={s.flags} />
                          {p.notes && <p className="text-xs text-(--dim) italic">“{p.notes}”</p>}
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                            <label className="flex cursor-pointer items-center gap-1.5 text-(--muted)">
                              <input type="checkbox" checked={picked.includes(p.id)} onChange={() => togglePick(p.id)} disabled={!picked.includes(p.id) && picked.length >= MAX_COMPARE} className="accent-(--c-above)" />
                              Compare
                            </label>
                            {p.kind === 'supplement' ? (
                              !isTaking(p) && (
                                <button onClick={() => takeDaily(p)} className="rounded-full border border-(--line) px-3 py-1 hover:border-(--c-good) hover:text-(--c-good)">
                                  + Take daily
                                </button>
                              )
                            ) : (
                              <button onClick={() => logFood(p)} className="rounded-full border border-(--line) px-3 py-1 hover:border-(--c-good) hover:text-(--c-good)">
                                + Log a serving
                              </button>
                            )}
                            <button onClick={() => setMode({ edit: p })} className="px-2 py-1 text-(--muted) hover:text-(--fg)">
                              Edit
                            </button>
                            <button
                              onClick={() => confirm(`Delete ${displayName(p)} from Products?`) && db.products.delete(p.id)}
                              className="px-2 py-1 text-(--muted) hover:text-(--c-deficient)"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="lg:border-l lg:border-(--line) lg:pl-4">
                          <PartBars parts={s.parts} />
                        </div>
                      </li>
                    )
                  })}
                </ol>
                {shown.length === 0 && <p className="py-8 text-center text-sm text-(--muted)">Nothing matches that search.</p>}
                <p className="text-[11px] text-(--muted)">
                  Scores weigh how much a product fills your gaps, its doses against targets and upper limits, ingredient forms (supplements) or nutrient density per calorie (foods), and cost per useful dose.
                  They are a guide, not medical advice; talk to a clinician before starting supplements.
                </p>
              </>
            )}
          </>
        )}
      </main>

      {picked.length > 0 && !mode && (
        <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-6">
          <div className="card flex items-center gap-3 px-4 py-2 text-sm shadow-2xl">
            <span className="text-(--dim)">
              {picked.length} selected{picked.length >= MAX_COMPARE ? ' (max)' : ''}
            </span>
            <button onClick={() => setComparing(true)} disabled={picked.length < 2} className="rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">
              Compare
            </button>
            <button onClick={() => setPicked([])} className="text-(--muted) hover:text-(--fg)">
              Clear
            </button>
          </div>
        </div>
      )}
      {comparing && (
        <ProductCompare
          items={picked
            .map((id) => ranked.find((p) => p.id === id) ?? products.find((p) => p.id === id))
            .filter((p): p is Product => p != null)
            .map((p) => ({ product: p, score: scores.get(p.id) ?? scoreAll([p], ctx).get(p.id)! }))}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  )
}

function EmptyState({ kind, onAdd, onImport }: { kind: Product['kind']; onAdd: () => void; onImport: () => void }) {
  const supp = kind === 'supplement'
  return (
    <section className="card p-6 text-center">
      <h2 className="text-lg font-semibold">{supp ? 'Rate the supplements you use or are considering' : 'Rate the packaged foods you buy'}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-(--dim)">
        {supp
          ? 'Add brands from their Supplement Facts label. Each gets a score for how well it fills your gaps, sensible doses within upper limits, ingredient forms (glycinate vs oxide…), and cost per day. Then compare them side by side.'
          : 'Add products from their Nutrition Facts label. Each gets a score for nutrient density per calorie, how well it fills your gaps, sodium / sugar / saturated fat, and cost per serving.'}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button onClick={onAdd} className="rounded-full bg-(--c-above) px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
          Paste a label
        </button>
        <button onClick={onImport} className="rounded-full border border-(--line) px-4 py-2 text-sm hover:border-(--c-above)">
          Photos via AI, or a CSV / file
        </button>
      </div>
    </section>
  )
}
