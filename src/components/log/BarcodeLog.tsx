import { useEffect, useState } from 'react'
import type { Food, Meal, Product } from '../../db/db'
import { logNewFood, logSavedFood } from '../../db/logging'
import { checkDigitOk, findSavedBarcode, lookupBarcodeOnline, type BarcodeFood, type RemoteLookup } from '../../lib/barcode'
import { useGuard } from '../../lib/useGuard'
import { CustomFoodEditor } from './CustomFoodEditor'
import { NutrientChips } from './NutrientChips'

type State =
  | { phase: 'looking' }
  | { phase: 'saved'; food: Food }
  | { phase: 'product'; product: Product }
  | { phase: 'found'; food: BarcodeFood; notes: string[] }
  | { phase: 'none'; notes: string[] }
  | { phase: 'error'; message: string }

/** Online answers for this session, so retyping or reopening doesn't spend lookups (USDA's demo key allows few). */
const remoteCache = new Map<string, RemoteLookup>()

/** What to show and log, whichever source it came from. */
interface Candidate {
  name: string
  brand?: string
  serving: string
  grams?: number
  nutrients: Record<string, number>
  kcal?: number
  badge: string
  note?: string
  log: (multiplier: number) => Promise<void>
}

const SOURCE_BADGE = { usda: 'USDA Branded Foods', off: 'Open Food Facts', both: 'USDA + Open Food Facts' }

/**
 * Typed (or USB-scanned) barcode in the log sheet: your foods first, then USDA
 * Branded Foods and Open Food Facts. Found foods are saved with their barcode,
 * so the next time is instant and works offline.
 */
export function BarcodeLog({ code, meal, date, onLogged }: { code: string; meal: Meal; date: string; onLogged: (msg: string) => void }) {
  const [state, setState] = useState<State>({ phase: 'looking' })
  const [creating, setCreating] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ phase: 'looking' })
    setCreating(false)
    // Wait for typing to stop: a 13-digit number passes through 8 and 12 digits on the way.
    const t = setTimeout(async () => {
      try {
        const saved = await findSavedBarcode(code)
        if (ctrl.signal.aborted) return
        if (saved) return setState('food' in saved ? { phase: 'saved', food: saved.food } : { phase: 'product', product: saved.product })
        const remote = remoteCache.get(code) ?? (await lookupBarcodeOnline(code, { signal: ctrl.signal }))
        if (ctrl.signal.aborted) return
        // Cache only clean answers; a rate limit or network error should be retried later.
        if (remote.notes.length === 0) remoteCache.set(code, remote)
        setState(remote.food ? { phase: 'found', food: remote.food, notes: remote.notes } : { phase: 'none', notes: remote.notes })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ phase: 'error', message: (e as Error).message })
      }
    }, 450)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [code, nonce])

  const typo = !checkDigitOk(code)

  if (creating) {
    return (
      <div className="mt-4">
        <CustomFoodEditor
          initial={null}
          barcode={code}
          meal={meal}
          date={date}
          onDone={(msg) => {
            setCreating(false)
            if (msg?.startsWith('Saved and logged')) onLogged(msg)
            else setNonce((n) => n + 1) // saved: look it up again, now from your foods
          }}
        />
      </div>
    )
  }

  const candidate = toCandidate(state, code, meal, date)

  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      {typo && <p className="text-xs text-(--c-attention)">The last digit doesn't check out for a barcode. Is there a typo?</p>}

      {state.phase === 'looking' && (
        <p className="flex items-center gap-2 text-sm text-(--muted)">
          <span className="pulse inline-block size-2 rounded-full bg-(--c-above)" aria-hidden />
          Looking up {code} in your foods, USDA and Open Food Facts…
        </p>
      )}

      {state.phase === 'error' && <p className="text-sm text-(--c-deficient)">{state.message}</p>}

      {candidate && <CandidateCard key={`${code}-${candidate.badge}`} c={candidate} meal={meal} onLogged={onLogged} />}

      {state.phase === 'none' && (
        <div className="rounded-lg bg-(--panel-2) p-3 text-sm">
          <p>
            <span className="font-medium">Not found</span>
            <span className="text-(--dim)"> in USDA Branded Foods or Open Food Facts.</span>
          </p>
          <p className="mt-1 text-xs text-(--muted)">Add it once from the Nutrition Facts label; it's saved with this barcode, so next time it's one tap.</p>
          <button onClick={() => setCreating(true)} className="mt-3 rounded-lg bg-(--c-above) px-3 py-2 text-sm font-semibold text-white">
            Create it from the label
          </button>
        </div>
      )}

      {(state.phase === 'found' || state.phase === 'none') && state.notes.map((n) => (
        <p key={n} className="text-xs text-(--c-attention)">
          {n}
        </p>
      ))}

      <p className="text-[11px] leading-relaxed text-(--muted)">
        Checked your foods first, then the free USDA Branded Foods and Open Food Facts databases. Only the barcode number is sent.
      </p>
    </div>
  )
}

function toCandidate(state: State, code: string, meal: Meal, date: string): Candidate | null {
  if (state.phase === 'saved') {
    const f = state.food
    return { name: f.name, brand: f.brand, serving: f.serving, grams: f.grams, nutrients: f.nutrients, badge: 'In your foods', log: (m) => logSavedFood(f, meal, m, date) }
  }
  if (state.phase === 'product') {
    const p = state.product
    const name = p.brand ? `${p.name} (${p.brand})` : p.name
    return {
      name,
      brand: p.brand,
      serving: p.serving,
      grams: p.grams,
      nutrients: p.nutrients,
      kcal: p.kcal,
      badge: 'Your rated product',
      log: (m) => logNewFood({ name, serving: p.serving, grams: p.grams, nutrients: p.nutrients, source: 'barcode', barcode: code, brand: p.brand }, meal, m, date),
    }
  }
  if (state.phase === 'found') {
    const f = state.food
    const name = f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? `${f.name} (${f.brand})` : f.name
    const both = f.sources.length > 1
    const note = both
      ? `${f.filled.length} nutrient${f.filled.length === 1 ? '' : 's'} added from Open Food Facts.`
      : f.sources[0] === 'off'
        ? 'Community data: check it against the label.'
        : undefined
    return {
      name,
      brand: f.brand,
      serving: f.serving,
      grams: f.grams,
      nutrients: f.nutrients,
      kcal: f.kcal,
      badge: SOURCE_BADGE[both ? 'both' : f.sources[0]],
      note,
      log: (m) => logNewFood({ name, serving: f.serving, grams: f.grams, nutrients: f.nutrients, source: 'barcode', barcode: code, brand: f.brand }, meal, m, date),
    }
  }
  return null
}

function CandidateCard({ c, meal, onLogged }: { c: Candidate; meal: Meal; onLogged: (msg: string) => void }) {
  const [unit, setUnit] = useState<'serving' | 'g'>('serving')
  const [qty, setQty] = useState(1)
  const [grams, setGrams] = useState(c.grams ?? 100)
  const guard = useGuard()
  const multiplier = unit === 'g' && c.grams ? grams / c.grams : qty
  const field = 'mt-1 block rounded border border-(--line) bg-(--bg) px-2 py-1.5 font-mono text-sm text-(--fg)'

  return (
    <div className="rounded-lg bg-(--panel-2) p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{c.name}</div>
          <div className="mt-0.5 text-[11px] text-(--muted)">
            {c.serving}
            {c.kcal != null && ` · ${c.kcal} kcal`}
          </div>
        </div>
        <span className="shrink-0 rounded bg-(--bg) px-1.5 py-0.5 font-mono text-[9.5px] text-(--muted) uppercase">{c.badge}</span>
      </div>
      {c.note && <p className="mt-1.5 text-[11px] text-(--dim)">{c.note}</p>}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {unit === 'serving' ? (
          <label className="text-xs text-(--muted)">
            Servings
            <input type="number" min={0.25} step={0.25} value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} className={`w-20 ${field}`} />
          </label>
        ) : (
          <label className="text-xs text-(--muted)">
            Grams
            <input type="number" min={1} value={grams} onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))} className={`w-24 ${field}`} />
          </label>
        )}
        {c.grams != null && (
          <div className="flex rounded-md bg-(--bg) p-0.5 text-xs" role="group" aria-label="Amount in">
            {(['serving', 'g'] as const).map((u) => (
              <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u} className={`rounded px-2 py-1 ${unit === u ? 'bg-(--panel) text-(--fg)' : 'text-(--muted)'}`}>
                {u === 'serving' ? 'servings' : 'grams'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        <NutrientChips nutrients={c.nutrients} multiplier={multiplier} max={8} />
      </div>
      {Object.keys(c.nutrients).length < 12 && (
        <p className="mt-1.5 text-[11px] text-(--muted)">Packaged-food labels list only some vitamins and minerals; the rest show as “no data”, not zero.</p>
      )}

      <button
        onClick={() =>
          guard(async () => {
            await c.log(multiplier)
            onLogged(`Logged ${c.name} to ${meal}`)
          })
        }
        disabled={multiplier <= 0}
        className="mt-3 w-full rounded-lg bg-(--c-good) px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40"
      >
        Log to {meal}
      </button>
    </div>
  )
}
