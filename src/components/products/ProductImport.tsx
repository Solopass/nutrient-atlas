import { useMemo, useRef, useState } from 'react'
import { db, type Product } from '../../db/db'
import { buildProductPrompt, csvTemplate, parseProducts } from '../../lib/products/io'
import { useGuard } from '../../lib/useGuard'
import { displayName } from './ProductBits'

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Existing products match on kind + brand + name; imports update them instead of duplicating. */
export const productKey = (p: Pick<Product, 'kind' | 'brand' | 'name'>) => `${p.kind}|${p.brand.trim().toLowerCase()}|${p.name.trim().toLowerCase()}`

/**
 * Bring products in from anywhere: a file (JSON product pack or CSV), text
 * pasted from a spreadsheet, or an AI chat's reply to the label prompt.
 */
export function ProductImport({ kind, onDone }: { kind: Product['kind']; onDone: (msg: string) => void }) {
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const guard = useGuard()
  const result = useMemo(() => parseProducts(text, kind), [text, kind])

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildProductPrompt(kind))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setText(buildProductPrompt(kind)) // fallback: show it to copy by hand
    }
  }

  const save = () =>
    guard(async () => {
      const now = Date.now()
      let added = 0
      let updated = 0
      await db.transaction('rw', db.products, async () => {
        const existing = new Map((await db.products.toArray()).map((p) => [productKey(p), p]))
        for (const p of result.products) {
          const old = existing.get(productKey(p))
          if (old) {
            // Keep your own rating and notes unless the import brings new ones.
            await db.products.update(old.id, { ...p, rating: p.rating ?? old.rating, notes: p.notes ?? old.notes, updatedAt: now })
            updated++
          } else {
            await db.products.add({ ...p, source: 'import', createdAt: now, updatedAt: now } as Product)
            added++
          }
        }
      })
      onDone(`Imported ${added} new${updated ? `, updated ${updated}` : ''}.`)
    })

  const btn = 'rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 text-sm hover:border-(--c-above)'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import products</h2>
        <button onClick={() => onDone('')} className="text-sm text-(--muted) hover:text-(--fg)">
          Cancel
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-sm font-medium">1 · From a photo or web page</div>
          <p className="mt-1 text-xs text-(--muted)">
            Copy the prompt into any AI chat (Claude, ChatGPT, Gemini), attach photos of the labels or paste a product page, then paste its reply below. Several products at once is fine.
          </p>
          <button onClick={copyPrompt} className={`mt-3 ${btn}`}>
            {copied ? 'Copied ✓' : 'Copy AI prompt'}
          </button>
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium">2 · From a file</div>
          <p className="mt-1 text-xs text-(--muted)">A product list someone shared with you (JSON), or a spreadsheet saved as CSV.</p>
          <button onClick={() => fileRef.current?.click()} className={`mt-3 ${btn}`}>
            Choose file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.txt,application/json,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
              e.target.value = ''
            }}
          />
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium">3 · From a spreadsheet</div>
          <p className="mt-1 text-xs text-(--muted)">One row per product, one column per nutrient. Start from the template, or paste copied cells below.</p>
          <button onClick={() => download('nutrient-atlas-products-template.csv', csvTemplate(), 'text/csv;charset=utf-8')} className={`mt-3 ${btn}`}>
            Download CSV template
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Paste the AI reply, JSON or CSV here"
        className="w-full rounded-lg border border-(--line) bg-(--panel-2) p-3 font-mono text-xs placeholder:font-sans placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
      />

      {text.trim() && (
        <div className="space-y-2">
          {result.errors.length > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-(--c-deficient)/40 bg-(--c-deficient)/10 p-3 text-xs text-(--c-deficient)">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {result.warnings.length > 0 && (
            <ul className="space-y-0.5 text-xs text-(--c-attention)">
              {result.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
          {result.products.length > 0 && (
            <>
              <ul className="divide-y divide-(--line) rounded-lg bg-(--panel-2) px-3 text-sm">
                {result.products.map((p, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="truncate">
                      {displayName(p)} <span className="text-xs text-(--muted)">· {p.serving}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-(--muted)">
                      {p.kind} · {Object.keys(p.nutrients).length} nutrients
                      {p.forms ? ` · ${Object.keys(p.forms).length} forms` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <button onClick={save} className="rounded-lg bg-(--c-good) px-4 py-2 text-sm font-semibold text-black hover:brightness-110">
                Import {result.products.length} product{result.products.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
