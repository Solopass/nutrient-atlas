import type { LogGroup } from '../db/db'
import { formatDay } from '../lib/history'
import { kcalOf } from '../lib/quickLog'
import { scoreColor } from '../lib/status'
import { MEAL_ORDER } from './AtlasChart'

const LABEL: Record<LogGroup, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', supplement: 'Supplements' }

const pill = 'rounded-full px-3 py-1 transition'
const ghostBtn = 'flex items-center gap-1.5 rounded-full border border-(--line) bg-(--panel) px-3 py-1 text-(--dim) transition hover:border-(--c-above) hover:text-(--fg) disabled:opacity-40'

/** Controls above the Atlas: colouring, replay, image export, and what's currently overlaid. */
export function AtlasToolbar({
  colorBy,
  onChange,
  meals,
  week,
  onReplay,
  onSnapshot,
  snapshotBusy,
  overlayLabel,
  onClearOverlay,
}: {
  colorBy: 'status' | 'meal'
  onChange: (v: 'status' | 'meal') => void
  meals: Partial<Record<LogGroup, Record<string, number>>> | null
  week: boolean
  onReplay: () => void
  onSnapshot: () => void
  snapshotBusy: boolean
  overlayLabel: string | null
  onClearOverlay: () => void
}) {
  const kcal = MEAL_ORDER.map((m) => ({ meal: m, kcal: meals?.[m] ? kcalOf(meals[m]!) : 0, present: !!meals?.[m] })).filter((x) => x.present)
  const total = kcal.reduce((a, x) => a + x.kcal, 0)

  return (
    <div className="mb-1 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="inline-flex rounded-full bg-(--panel) p-0.5 shadow-[inset_0_0_0_1px_var(--line)]" role="group" aria-label="Colour the Atlas by">
          {(['status', 'meal'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onChange(v)}
              aria-pressed={colorBy === v}
              className={`${pill} ${colorBy === v ? 'bg-(--panel-2) text-(--fg) shadow-[inset_0_0_0_1px_var(--line)]' : 'text-(--muted) hover:text-(--dim)'}`}
            >
              {v === 'status' ? 'By status' : 'By meal'}
            </button>
          ))}
        </div>
        <button onClick={onReplay} className={ghostBtn} title="Play back the last 30 days">
          <span aria-hidden>▶</span> Replay 30 days
        </button>
        <button onClick={onSnapshot} disabled={snapshotBusy} className={ghostBtn} title="Save the Atlas as an image">
          <span aria-hidden>⤓</span> {snapshotBusy ? 'Saving…' : 'Save image'}
        </button>
      </div>

      {overlayLabel && (
        <div className="flex items-center justify-center gap-2 text-(--dim)">
          <span className="truncate">{overlayLabel}</span>
          <button onClick={onClearOverlay} className="rounded-full px-2 py-0.5 text-(--muted) hover:bg-(--panel-2) hover:text-(--fg)" aria-label="Clear overlay">
            ✕
          </button>
        </div>
      )}

      {colorBy === 'meal' &&
        (kcal.length ? (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" aria-label={week ? 'Average energy per meal' : 'Energy per meal'}>
            {kcal.map((x) => (
              <span key={x.meal} className="flex items-center gap-1.5 text-(--dim)">
                <span className="size-2.5 rounded-sm" style={{ background: `var(--m-${x.meal})`, opacity: 0.85 }} />
                {LABEL[x.meal]}
                {x.meal !== 'supplement' && total > 0 && (
                  <span className="font-mono text-[10.5px] text-(--muted)">
                    {Math.round(x.kcal)} kcal · {Math.round((x.kcal / total) * 100)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-center text-(--muted)">Nothing logged in this range yet</p>
        ))}
    </div>
  )
}

/** Time-lapse scrubber shown while replaying. */
export function ReplayBar({
  dates,
  index,
  playing,
  score,
  logged,
  week,
  onIndex,
  onToggle,
  onClose,
}: {
  dates: string[]
  index: number
  playing: boolean
  score: number | null
  logged: boolean
  week: boolean
  onIndex: (i: number) => void
  onToggle: () => void
  onClose: () => void
}) {
  const d = dates[index]
  return (
    <div className="card mx-auto mb-2 flex max-w-xl items-center gap-3 px-3 py-2 text-xs" role="group" aria-label="Replay">
      <button
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-(--c-above) text-sm text-white hover:brightness-110"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-(--fg)">
            {week ? '7 days to ' : ''}
            {formatDay(d, 'short')}
          </span>
          <span className="font-mono" style={{ color: score != null ? scoreColor(score) : 'var(--muted)' }}>
            {logged && score != null ? `${Math.round(score)}%` : 'not logged'}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={dates.length - 1}
          value={index}
          onChange={(e) => onIndex(Number(e.target.value))}
          aria-label="Day"
          aria-valuetext={formatDay(d)}
          className="mt-1 w-full accent-(--c-above)"
        />
        <div className="flex justify-between font-mono text-[10px] text-(--muted)">
          <span>{formatDay(dates[0], 'short')}</span>
          <span>{formatDay(dates[dates.length - 1], 'short')}</span>
        </div>
      </div>
      <button onClick={onClose} className="shrink-0 rounded-full px-2 py-1 text-(--muted) hover:bg-(--panel-2) hover:text-(--fg)" aria-label="Stop replay">
        ✕
      </button>
    </div>
  )
}
