import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Meal } from '../../db/db'
import { logNewFood } from '../../db/logging'
import { parseMealResponse } from '../../lib/ai/parse'
import { buildMealPrompt } from '../../lib/ai/prompt'
import type { Confidence } from '../../lib/ai/types'
import { NutrientChips } from './NutrientChips'

const DRAFT_KEY = 'ai-log-draft'

const CONF_COLOR: Record<Confidence, string> = {
  high: 'var(--c-good)',
  medium: 'var(--c-attention)',
  low: 'var(--c-deficient)',
}

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className="relative pl-9">
      <span
        className={`absolute top-0 left-0 grid size-6 place-items-center rounded-full font-mono text-xs font-semibold ${done ? 'bg-(--c-good) text-black' : 'bg-(--panel-2) text-(--dim) shadow-[inset_0_0_0_1px_var(--line)]'}`}
      >
        {done ? '✓' : n}
      </span>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as { description?: string; response?: string }
  } catch {
    return {}
  }
}

export function AiTab({ meal, date, onLogged }: { meal: Meal; date: string; onLogged: (msg: string) => void }) {
  const [description, setDescription] = useState(() => loadDraft().description ?? '')
  const [response, setResponse] = useState(() => loadDraft().response ?? '')
  const [copied, setCopied] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [multipliers, setMultipliers] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)

  // Keep an unsent draft so switching tabs or closing the sheet loses nothing.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ description, response }))
    } catch {
      /* storage unavailable */
    }
  }, [description, response])

  const prompt = useMemo(() => buildMealPrompt(description || '(describe your meal here)'), [description])
  const parsed = useMemo(() => parseMealResponse(response), [response])
  const items = parsed.estimate?.items ?? []

  useEffect(() => {
    setExcluded(new Set())
    setMultipliers({})
  }, [response])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      setShowPrompt(true) // fall back to manual selection
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const chosen = items.map((it, i) => ({ it, i })).filter(({ i }) => !excluded.has(i))

  const save = async () => {
    setSaving(true)
    try {
      for (const { it, i } of chosen) {
        await logNewFood(
          { name: it.name, serving: it.quantity, grams: it.grams, nutrients: it.nutrients, source: 'ai' },
          meal,
          multipliers[i] ?? 1,
          date,
        )
      }
      // Clear the stored draft directly: onLogged switches tabs and unmounts this component before effects run.
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* storage unavailable */
      }
      setDescription('')
      setResponse('')
      onLogged(`Logged ${chosen.length} item${chosen.length === 1 ? '' : 's'} to ${meal}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Step n={1} title="Describe what you ate" done={description.trim().length > 0}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="e.g. 2 scrambled eggs with cheddar, a slice of sourdough toast with butter, and a black coffee"
          className="w-full resize-y rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 text-sm placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
        />
        <p className="mt-1 text-xs text-(--muted)">Portions, brands and cooking methods all improve the estimate.</p>
      </Step>

      <Step n={2} title="Copy the prompt into any AI chat (Claude, ChatGPT, Gemini…)" done={copied || response.length > 0}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copy}
            disabled={!description.trim()}
            className="rounded-lg bg-(--c-above) px-3.5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? 'Copied ✓' : 'Copy prompt'}
          </button>
          <button onClick={() => setShowPrompt((s) => !s)} className="px-2 py-2 text-sm text-(--muted) hover:text-(--fg)">
            {showPrompt ? 'Hide prompt' : 'Show prompt'}
          </button>
        </div>
        {showPrompt && (
          <textarea
            readOnly
            value={prompt}
            rows={10}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-(--line) bg-(--bg) p-3 font-mono text-[11px] leading-relaxed text-(--dim)"
          />
        )}
      </Step>

      <Step n={3} title="Paste the AI's reply" done={items.length > 0}>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={4}
          placeholder='Paste the whole reply here. Code fences and extra text are fine; the JSON is found automatically.'
          className="w-full resize-y rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 font-mono text-xs placeholder:font-sans placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
        />
        {parsed.errors.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-lg border border-(--c-deficient)/40 bg-(--c-deficient)/10 p-3 text-xs text-(--c-deficient)">
            {parsed.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Step>

      {items.length > 0 && (
        <Step n={4} title="Review and log">
          <ul className="space-y-2">
            {items.map((it, i) => {
              const off = excluded.has(i)
              const mult = multipliers[i] ?? 1
              return (
                <li
                  key={i}
                  className={`rounded-lg border border-(--line) bg-(--panel-2)/60 p-3 transition ${off ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!off}
                      onChange={() =>
                        setExcluded((s) => {
                          const next = new Set(s)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          return next
                        })
                      }
                      className="mt-1 accent-(--c-above)"
                      aria-label={`Include ${it.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{it.name}</span>
                        <span className="text-xs text-(--muted)">
                          {it.quantity}
                          {it.grams ? ` · ${Math.round(it.grams)} g` : ''}
                        </span>
                        <span
                          className="rounded px-1.5 font-mono text-[10px] uppercase"
                          style={{ color: CONF_COLOR[it.confidence], background: `color-mix(in oklab, ${CONF_COLOR[it.confidence]} 15%, transparent)` }}
                        >
                          {it.confidence}
                        </span>
                        <span className="font-mono text-[10.5px] text-(--muted)">{Object.keys(it.nutrients).length} nutrients</span>
                      </div>
                      <div className="mt-1.5">
                        <NutrientChips nutrients={it.nutrients} multiplier={mult} />
                      </div>
                    </div>
                    <label className="flex shrink-0 items-center gap-1 text-xs text-(--muted)">
                      ×
                      <input
                        type="number"
                        min={0.25}
                        step={0.25}
                        value={mult}
                        onChange={(e) => setMultipliers((m) => ({ ...m, [i]: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-14 rounded border border-(--line) bg-(--bg) px-1.5 py-0.5 font-mono text-(--fg)"
                        aria-label={`Servings of ${it.name}`}
                      />
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>

          {parsed.estimate?.notes && <p className="mt-3 text-xs text-(--dim)">AI notes: {parsed.estimate.notes}</p>}
          {parsed.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-(--c-attention)">
              {parsed.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}

          <button
            onClick={save}
            disabled={saving || chosen.length === 0}
            className="mt-4 w-full rounded-lg bg-(--c-good) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Saving…' : `Log ${chosen.length} item${chosen.length === 1 ? '' : 's'} to ${meal}`}
          </button>
        </Step>
      )}
    </div>
  )
}
