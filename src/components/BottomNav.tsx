import type { ReactNode } from 'react'
import { CalendarIcon, GearIcon, ShelfIcon } from './icons'
import type { LogTab } from './log/LogSheet'

/** Phone-only tab bar: thumb-reachable navigation and a big log button. */
export function BottomNav({ route, openLog }: { route: string; openLog: (tab?: LogTab) => void }) {
  const atlas = route === '' || route.startsWith('day/')
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-(--line) bg-(--bg)/90 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5 pb-1.5">
        <Tab href="#/" label="Atlas" active={atlas}>
          <AtlasGlyph />
        </Tab>
        <Tab href="#/history" label="History" active={route === 'history'}>
          <CalendarIcon />
        </Tab>
        <div className="flex justify-center">
          <button
            onClick={() => openLog('search')}
            aria-label="Log food"
            className="-mt-6 grid size-14 place-items-center rounded-full bg-(--c-above) text-3xl leading-none font-light text-white shadow-[0_6px_24px_-4px_var(--c-above)] active:scale-95"
          >
            +
          </button>
        </div>
        <Tab href="#/products" label="Products" active={route === 'products'}>
          <ShelfIcon />
        </Tab>
        <Tab href="#/settings" label="Settings" active={route === 'settings'}>
          <GearIcon />
        </Tab>
      </div>
    </nav>
  )
}

function Tab({ href, onClick, label, active, children }: { href?: string; onClick?: () => void; label: string; active?: boolean; children: ReactNode }) {
  const cls = `flex flex-col items-center gap-0.5 py-1 text-[10px] ${active ? 'text-(--fg)' : 'text-(--muted)'}`
  const inner = (
    <>
      <span className={`grid h-6 place-items-center [&_svg]:size-5 ${active ? 'text-(--c-above)' : ''}`}>{children}</span>
      {label}
    </>
  )
  return href ? (
    <a href={href} className={cls} aria-current={active ? 'page' : undefined}>
      {inner}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

function AtlasGlyph() {
  return (
    <svg viewBox="-12 -12 24 24" fill="currentColor" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a0 = ((i * 60 - 90 + 6) * Math.PI) / 180
        const a1 = (((i + 1) * 60 - 90 - 6) * Math.PI) / 180
        const r = [10, 7.5, 9, 10.5, 6, 8.5][i]
        return (
          <path
            key={i}
            d={`M${3 * Math.cos(a0)} ${3 * Math.sin(a0)}L${r * Math.cos(a0)} ${r * Math.sin(a0)}A${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}L${3 * Math.cos(a1)} ${3 * Math.sin(a1)}Z`}
          />
        )
      })}
    </svg>
  )
}
