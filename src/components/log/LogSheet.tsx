import { Suspense, useEffect, useState } from 'react'
import { localDate, mealForTime, type Meal, MEALS } from '../../db/db'
import { formatDay } from '../../lib/history'
import { lazyPage } from '../../lib/lazyPage'
import type { AtlasImport } from '../../lib/atlasImport'

// Tabs load the first time the sheet opens, keeping them out of the dashboard's startup code.
const SearchTab = lazyPage(() => import('./SearchTab'), 'SearchTab')
const AiTab = lazyPage(() => import('./AiTab'), 'AiTab')
const FoodsTab = lazyPage(() => import('./FoodsTab'), 'FoodsTab')
const SupplementsTab = lazyPage(() => import('./SupplementsTab'), 'SupplementsTab')
const TodayTab = lazyPage(() => import('./TodayTab'), 'TodayTab')

export type LogTab = 'search' | 'ai' | 'foods' | 'supplements' | 'today'
/** Something handed over by link or paste (see lib/atlasImport); `nonce` makes the same payload re-open. */
export type Incoming = AtlasImport & { nonce: number }
type Tab = LogTab

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'ai', label: 'AI estimate' },
  { id: 'foods', label: 'My foods' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'today', label: 'Today' },
]

interface Props {
  open: boolean
  onClose: () => void
  todayCount: number
  initialTab: LogTab
  /** Day being logged to (YYYY-MM-DD). */
  date: string
  incoming?: Incoming
}

export function LogSheet({ open, onClose, todayCount, date, initialTab, incoming: incomingProp }: Props) {
  const isToday = date === localDate()
  const [tab, setTab] = useState<Tab>('search')
  const [meal, setMeal] = useState<Meal>(mealForTime())
  const [flash, setFlash] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<Incoming | undefined>(incomingProp)
  useEffect(() => setIncoming(incomingProp), [incomingProp])
  // A recipe or food card pasted into AI estimate opens in My foods instead.
  const openImport = (imp: AtlasImport) => {
    setIncoming({ ...imp, nonce: Date.now() })
    setTab(imp.kind === 'meal' ? 'ai' : 'foods')
  }

  useEffect(() => {
    if (!open) return
    setMeal(isToday ? mealForTime() : 'dinner')
    setTab(initialTab)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, isToday, initialTab])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  const onLogged = (msg: string) => {
    setFlash(msg)
    setTab('today')
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`no-print fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log food"
        aria-hidden={!open}
        inert={!open}
        className={`no-print card fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[92vh] max-w-3xl flex-col overflow-hidden rounded-b-none transition-transform duration-300 sm:inset-y-6 sm:bottom-auto sm:h-auto sm:rounded-b-[14px] ${open ? 'translate-y-0' : 'pointer-events-none translate-y-[110%] sm:translate-y-[120vh]'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-(--line) px-5 py-3.5">
          <h2 className="text-lg font-semibold">
            Log food{!isToday && <span className="ml-2 rounded-full bg-(--c-attention)/15 px-2 py-0.5 align-middle text-xs font-medium text-(--c-attention)">{formatDay(date)}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-(--muted)" htmlFor="meal">
              Meal
            </label>
            <select
              id="meal"
              value={meal}
              onChange={(e) => setMeal(e.target.value as Meal)}
              className="rounded-md border border-(--line) bg-(--panel-2) px-2 py-1 text-sm capitalize"
            >
              {MEALS.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </select>
            <button onClick={onClose} aria-label="Close" className="ml-1 rounded-md px-2 py-1 text-xl leading-none text-(--muted) hover:bg-(--panel-2) hover:text-(--fg)">
              ×
            </button>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-b border-(--line) px-4 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 px-3 py-2.5 text-sm whitespace-nowrap transition ${tab === t.id ? 'text-(--fg)' : 'text-(--muted) hover:text-(--dim)'}`}
            >
              {t.id === 'today' && !isToday ? formatDay(date, 'short') : t.label}
              {t.id === 'today' && todayCount > 0 && (
                <span className="ml-1.5 rounded-full bg-(--panel-2) px-1.5 font-mono text-[10px] text-(--dim)">{todayCount}</span>
              )}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-(--c-above)" />}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {open && (
          <Suspense fallback={<p role="status" className="text-sm text-(--muted)">Loading…</p>}>
          {tab === 'search' && <SearchTab meal={meal} date={date} onLogged={onLogged} />}
          {tab === 'ai' && <AiTab meal={meal} date={date} onLogged={onLogged} incoming={incoming?.kind === 'meal' ? incoming : undefined} onOpenImport={openImport} />}
          {tab === 'foods' && <FoodsTab meal={meal} date={date} onLogged={onLogged} incoming={incoming && incoming.kind !== 'meal' ? incoming : undefined} />}
          {tab === 'supplements' && <SupplementsTab date={date} />}
          {tab === 'today' && <TodayTab date={date} />}
          </Suspense>
          )}
        </div>

        {flash && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <div className="rounded-full bg-(--c-good) px-4 py-1.5 text-sm font-medium text-black shadow-lg">{flash}</div>
          </div>
        )}
      </div>
    </>
  )
}
