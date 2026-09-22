import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

/** Bump when there are new tips worth showing again. */
export const WHATS_NEW_VERSION = '2026-09-22'

interface Tip {
  icon: string
  title: string
  body: string
  action: string
  run: () => void
}

/**
 * A dismissible strip of recent features, each with a button that shows it.
 * Hidden once dismissed until WHATS_NEW_VERSION changes.
 */
export function WhatsNew({ onReplay, onByMeal, onShowAtlas }: { onReplay: () => void; onByMeal: () => void; onShowAtlas: () => void }) {
  const seen = useLiveQuery(async () => (await db.settings.get('whatsNewSeen'))?.value ?? null, [], 'loading')
  if (seen === 'loading' || seen === WHATS_NEW_VERSION) return null
  const dismiss = () => db.settings.put({ key: 'whatsNewSeen', value: WHATS_NEW_VERSION })

  const tips: Tip[] = [
    { icon: '★', title: 'Rate brands', body: 'Paste a label, scan a barcode or import a list; get an A–E score for you.', action: 'Open Products', run: () => (location.hash = '#/products') },
    { icon: '▶', title: 'Replay 30 days', body: 'Watch the Atlas change day by day.', action: 'Play', run: onReplay },
    { icon: '◑', title: 'Colour by meal', body: 'See which meal supplies each nutrient.', action: 'Try it', run: onByMeal },
    { icon: '◎', title: 'Preview a food', body: 'Hover a Best next food pick (or tap ◎ Preview) to see what it would add.', action: 'Show Atlas', run: onShowAtlas },
    { icon: '◉', title: 'Food footprint', body: 'Tap a food under the Atlas to see everything it gave you.', action: 'Show Atlas', run: onShowAtlas },
    { icon: '✓', title: 'Done for today', body: 'Mark the day complete to count it in weekly views before midnight.', action: 'Show me', run: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { icon: '☀', title: 'Sun setting', body: 'Get regular sun? Stop vitamin D from food counting as a gap.', action: 'Settings', run: () => (location.hash = '#/settings') },
  ]

  return (
    <section className="card p-4" aria-label="What's new">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">
          <span className="text-(--c-above)">What's new</span> · tap to try
        </h2>
        <button onClick={dismiss} className="text-xs text-(--muted) hover:text-(--fg)">
          Dismiss
        </button>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {tips.map((t) => (
          <div key={t.title} className="flex w-52 shrink-0 snap-start flex-col rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)]">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-(--c-above)/15 text-xs text-(--c-above)" aria-hidden>
                {t.icon}
              </span>
              <span className="text-sm font-medium">{t.title}</span>
            </div>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-(--dim)">{t.body}</p>
            <button onClick={t.run} className="mt-2 self-start text-xs font-medium text-(--c-above) hover:underline">
              {t.action} →
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
