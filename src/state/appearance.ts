import { useEffect, useSyncExternalStore } from 'react'
import type { Profile } from '../lib/profile'

/**
 * Applies Settings → Appearance to the page: `data-theme` (light/dark) and
 * `data-palette` (standard / colour-blind safe) on <html>, which switch the CSS
 * tokens in index.css. The resolved values are also kept in localStorage so the
 * inline script in index.html can apply them before React loads (no flash).
 */
const dark = '(prefers-color-scheme: dark)'

function useSystemDark() {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(dark)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(dark).matches,
  )
}

/** `ready`: the saved profile has loaded. Until then the pre-paint script's values stand, so there's no flash of the default theme. */
export function useAppearance(p: Pick<Profile, 'theme' | 'palette'>, ready: boolean) {
  const systemDark = useSystemDark()
  const theme = p.theme === 'system' ? (systemDark ? 'dark' : 'light') : p.theme
  useEffect(() => {
    if (!ready) return
    const html = document.documentElement
    html.dataset.theme = theme
    html.dataset.palette = p.palette
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f6fa' : '#080b11')
    try {
      localStorage.setItem('atlas-appearance', JSON.stringify({ theme, palette: p.palette }))
    } catch {
      /* storage unavailable */
    }
  }, [theme, p.palette, ready])
}
