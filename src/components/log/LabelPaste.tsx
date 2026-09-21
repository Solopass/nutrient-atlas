import { useMemo, useState } from 'react'
import { NUTRIENTS } from '../../data/nutrients'
import { parseLabel, type ParsedLabel } from '../../lib/labelParse'
import { fmt } from '../../lib/status'

const BY_ID = new Map(NUTRIENTS.map((n) => [n.id, n]))

/**
 * Text box for a pasted Nutrition / Supplement Facts label. Parses as you type
 * and shows what it read; "Use these values" hands the result to the form.
 */
export function LabelPaste({ onUse, defaultOpen = false }: { onUse: (label: ParsedLabel) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseLabel(text), [text])
  const found = Object.keys(parsed.nutrients)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-(--line) px-3 py-2.5 text-left text-sm text-(--dim) hover:border-(--c-above) hover:text-(--fg)">
        <span className="text-lg leading-none">⎘</span>
        Paste the label text instead of typing it
      </button>
    )
  }

  return (
    <div className="rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-(--dim)">Paste the Nutrition Facts or Supplement Facts text</span>
        <button onClick={() => setOpen(false)} className="text-(--muted) hover:text-(--fg)">
          Hide
        </button>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'Serving size 2/3 cup (55g)\nCalories 230\nTotal Fat 8g 10%\nSodium 160mg 7%\n…'}
        className="w-full resize-y rounded-lg border border-(--line) bg-(--bg) px-3 py-2 font-mono text-xs placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-(--muted)">
        Tip: on a phone, photograph the label and use Live Text (iPhone) or Google Lens (Android) to copy its text. Copying from a product web page works too.
      </p>

      {text.trim() && (
        <div className="mt-2">
          {found.length === 0 ? (
            <p className="text-xs text-(--c-attention)">No nutrients recognised yet. Lines look like “Sodium 160mg” or “Vitamin D 2mcg 10%”.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {parsed.servingLabel && <Chip>serving: {parsed.servingLabel}</Chip>}
                {parsed.calories != null && <Chip>{parsed.calories} kcal</Chip>}
                {found.map((id) => (
                  <Chip key={id} title={parsed.matched[id]}>
                    {BY_ID.get(id)?.symbol ?? id} {fmt(parsed.nutrients[id])}
                    {BY_ID.get(id)?.unit}
                  </Chip>
                ))}
              </div>
              <button onClick={() => onUse(parsed)} className="mt-2 rounded-lg bg-(--c-above) px-3 py-1.5 text-sm font-medium text-white hover:brightness-110">
                Use these {found.length} values
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="rounded bg-(--bg) px-1.5 py-0.5 font-mono text-[10.5px] text-(--dim)">
      {children}
    </span>
  )
}
