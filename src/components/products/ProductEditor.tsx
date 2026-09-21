import { useState, type ReactNode } from 'react'
import { NUTRIENTS } from '../../data/nutrients'
import { db, type Product } from '../../db/db'
import { formsFromMatched, rateForm } from '../../lib/products/forms'
import { scoreProduct, type ScoreContext } from '../../lib/products/score'
import { useGuard } from '../../lib/useGuard'
import type { Category } from '../../types'
import { LabelPaste } from '../log/LabelPaste'
import { NutrientRowsEditor, rowsFrom, rowsToNutrients, type Row } from '../log/NutrientRows'
import { Segmented } from '../settings/Controls'
import { Flags, PartBars, ScoreBadge, Stars } from './ProductBits'

const CATS: Category[] = ['vitamin', 'mineral', 'bvitamin', 'trace', 'fatty', 'amino', 'macro', 'limit', 'advanced']
const NAME = new Map(NUTRIENTS.map((n) => [n.id, n.name]))
const input = 'rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 text-sm focus:border-(--c-above) focus:outline-none'
const numOrUndef = (s: string) => (s.trim() && Number(s) > 0 ? Number(s) : undefined)

/** Add or edit a branded product: paste its label, fill the rest, see the score live. */
export function ProductEditor({ initial, kind: initialKind, ctx, onDone }: { initial: Product | null; kind: Product['kind']; ctx: ScoreContext; onDone: () => void }) {
  const [kind, setKind] = useState<Product['kind']>(initial?.kind ?? initialKind)
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [serving, setServing] = useState(initial?.serving ?? (initialKind === 'supplement' ? '1 capsule' : '1 serving'))
  const [perDay, setPerDay] = useState(String(initial?.servingsPerDay ?? 1))
  const [perContainer, setPerContainer] = useState(initial?.servingsPerContainer ? String(initial.servingsPerContainer) : '')
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : '')
  const [grams, setGrams] = useState(initial?.grams ? String(initial.grams) : '')
  const [kcal, setKcal] = useState(initial?.kcal != null ? String(initial.kcal) : '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [rating, setRating] = useState<number | undefined>(initial?.rating)
  const [rows, setRows] = useState<Row[]>(initial ? rowsFrom(initial.nutrients) : [])
  const [forms, setForms] = useState<Record<string, string>>(initial?.forms ?? {})
  const [source, setSource] = useState<Product['source']>(initial?.source ?? 'manual')
  const guard = useGuard()

  const nutrients = rowsToNutrients(rows)
  const draft: Product = {
    id: initial?.id ?? -1,
    kind,
    brand: brand.trim(),
    name: name.trim(),
    serving: serving.trim(),
    grams: numOrUndef(grams),
    kcal: kcal.trim() !== '' && Number(kcal) >= 0 ? Number(kcal) : undefined,
    nutrients,
    forms: Object.fromEntries(Object.entries(forms).filter(([id, f]) => f.trim() && nutrients[id] != null)),
    servingsPerContainer: numOrUndef(perContainer),
    servingsPerDay: kind === 'supplement' ? (numOrUndef(perDay) ?? 1) : undefined,
    price: numOrUndef(price),
    rating,
    notes: notes.trim() || undefined,
    tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    source,
    createdAt: initial?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
  const score = scoreProduct(draft, ctx) // cheap: one product
  const valid = draft.name && draft.serving && Object.keys(nutrients).length > 0

  const save = () =>
    guard(async () => {
      if (!valid) return
      const { id: _id, ...data } = draft
      if (initial) await db.products.update(initial.id, data)
      else await db.products.add(data as Product)
      onDone()
    })

  const field = (label: string, el: ReactNode, cls = '') => (
    <label className={`text-xs text-(--dim) ${cls}`}>
      {label}
      <div className="mt-1">{el}</div>
    </label>
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{initial ? `Edit ${initial.name}` : 'Add a product'}</h2>
          <Segmented<Product['kind']>
            value={kind}
            options={[
              { value: 'supplement', label: 'Supplement' },
              { value: 'food', label: 'Food' },
            ]}
            onChange={setKind}
          />
        </div>

        <LabelPaste
          defaultOpen={!initial}
          onUse={(label) => {
            setRows(() => rowsFrom(label.nutrients))
            setForms(formsFromMatched(label.matched))
            if (label.servingLabel) setServing(label.servingLabel)
            if (label.servingsPerContainer) setPerContainer(String(label.servingsPerContainer))
            if (label.grams) setGrams(String(label.grams))
            if (label.calories != null) setKcal(String(label.calories))
            setSource('label')
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {field('Brand', <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Thorne" className={`w-full ${input}`} />)}
          {field('Product name', <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'supplement' ? 'e.g. Magnesium Bisglycinate' : 'e.g. Protein Bar, Peanut Butter'} className={`w-full ${input}`} />)}
        </div>
        <div className="flex flex-wrap gap-3">
          {field('One serving', <input value={serving} onChange={(e) => setServing(e.target.value)} className={`w-40 ${input}`} />)}
          {kind === 'supplement' && field('Servings a day', <input type="number" min={0.5} step={0.5} value={perDay} onChange={(e) => setPerDay(e.target.value)} className={`w-24 font-mono ${input}`} />)}
          {field('Servings per container', <input type="number" min={1} value={perContainer} onChange={(e) => setPerContainer(e.target.value)} placeholder="e.g. 60" className={`w-28 font-mono ${input}`} />)}
          {field('Price per container', <input type="number" min={0} step={0.01} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="optional" className={`w-28 font-mono ${input}`} />)}
          {kind === 'food' && field('Calories', <input type="number" min={0} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="per serving" className={`w-24 font-mono ${input}`} />)}
          {kind === 'food' && field('Grams', <input type="number" min={0} value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="optional" className={`w-24 font-mono ${input}`} />)}
        </div>

        <div>
          <div className="mb-1.5 text-xs text-(--dim)">Per serving, from the label</div>
          <NutrientRowsEditor rows={rows} setRows={setRows} categories={CATS} />
        </div>

        {kind === 'supplement' && Object.keys(nutrients).length > 0 && (
          <div>
            <div className="mb-1.5 text-xs text-(--dim)">Forms, as written after “as” on the label (optional, used for the form score)</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {Object.keys(nutrients).map((id) => {
                const verdict = forms[id] ? rateForm(id, forms[id]) : null
                return (
                  <label key={id} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate text-(--muted)">{NAME.get(id)}</span>
                    <input
                      value={forms[id] ?? ''}
                      onChange={(e) => setForms((f) => ({ ...f, [id]: e.target.value }))}
                      placeholder="e.g. glycinate"
                      className={`min-w-0 flex-1 ${input} py-1`}
                    />
                    {verdict && (
                      <span title={verdict.why} className="shrink-0" style={{ color: verdict.quality === 'good' ? 'var(--c-good)' : verdict.quality === 'poor' ? 'var(--c-deficient)' : 'var(--c-attention)' }}>
                        {verdict.quality === 'good' ? '●' : verdict.quality === 'poor' ? '○' : '◐'}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {field('Tags', <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. magnesium, sleep" className={`w-full ${input}`} />)}
          {field('Notes', <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="taste, where to buy, how you felt…" className={`w-full ${input}`} />)}
        </div>
        <div className="flex items-center gap-3 text-xs text-(--dim)">
          Your rating <Stars value={rating} onChange={setRating} size="text-xl" />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-(--line) pt-4">
          <button onClick={save} disabled={!valid} className="rounded-lg bg-(--c-good) px-4 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
            {initial ? 'Save changes' : 'Add to products'}
          </button>
          <button onClick={onDone} className="rounded-lg px-3 py-2 text-sm text-(--muted) hover:text-(--fg)">
            Cancel
          </button>
          {!valid && <span className="self-center text-xs text-(--muted)">Needs a name, a serving and at least one nutrient.</span>}
        </div>
      </div>

      <aside className="card h-fit space-y-3 p-4 lg:sticky lg:top-6">
        <div className="flex items-center gap-3">
          <ScoreBadge score={score} />
          <div className="min-w-0 text-xs text-(--dim)">
            <div className="text-[10.5px] tracking-[0.16em] text-(--muted) uppercase">Live score</div>
            {ctx.foodStates ? 'Against your last 7 days' : 'Log a few days for a personal score'}
          </div>
        </div>
        <PartBars parts={score.parts} />
        <Flags flags={score.flags} />
      </aside>
    </div>
  )
}
