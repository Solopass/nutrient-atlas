import { useEffect, useState, type ReactNode } from 'react'

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">{title}</h2>
      {hint && <p className="mt-1 text-xs text-(--muted)">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-(--dim)">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-(--muted)">{hint}</div>}
    </div>
  )
}

/** Pill-style single choice. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-(--panel-2) p-0.5 shadow-[inset_0_0_0_1px_var(--line)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-3 py-1.5 text-sm transition ${value === o.value ? 'bg-(--c-above) text-white shadow' : 'text-(--dim) hover:text-(--fg)'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Card-style single choice with a hint line, for options that need explaining. */
export function ChoiceCards<T extends string>({
  value,
  options,
  onChange,
  cols = 'sm:grid-cols-2',
}: {
  value: T
  options: { value: T; label: string; hint: string; aside?: string }[]
  onChange: (v: T) => void
  cols?: string
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 ${cols}`}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`rounded-lg p-3 text-left transition ${on ? 'bg-(--c-above)/12' : 'bg-(--panel-2) hover:brightness-125'}`}
            style={{ boxShadow: on ? 'inset 0 0 0 1.5px var(--c-above)' : 'inset 0 0 0 1px var(--line)' }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{o.label}</span>
              {o.aside && <span className="font-mono text-[10.5px] text-(--muted)">{o.aside}</span>}
            </div>
            <div className="mt-0.5 text-xs text-(--muted)">{o.hint}</div>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Number input that keeps its own text while typing and only commits values
 * inside [min, max]. Invalid text snaps back to the stored value on blur.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix,
  placeholder,
  width = 'w-24',
  allowEmpty = false,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  min: number
  max: number
  step?: number
  suffix?: string
  placeholder?: string
  width?: string
  allowEmpty?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(round(value)))
  useEffect(() => setText(value == null ? '' : String(round(value))), [value])

  const commit = (t: string) => {
    if (t.trim() === '' && allowEmpty) return onCommit(null)
    const n = Number(t)
    if (Number.isFinite(n) && n >= min && n <= max) onCommit(n)
  }

  const invalid = text.trim() !== '' && !(Number(text) >= min && Number(text) <= max)

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          commit(e.target.value)
        }}
        onBlur={() => setText(value == null ? '' : String(round(value)))}
        className={`${width} rounded-lg border bg-(--panel-2) px-2.5 py-1.5 font-mono text-sm focus:outline-none ${invalid ? 'border-(--c-deficient)' : 'border-(--line) focus:border-(--c-above)'}`}
        aria-invalid={invalid}
      />
      {suffix && <span className="text-sm text-(--muted)">{suffix}</span>}
    </span>
  )
}

const round = (v: number) => Math.round(v * 10) / 10
