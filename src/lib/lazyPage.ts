import { lazy, type ComponentType } from 'react'

/**
 * Pages and log tabs load as separate files whose names change with every
 * deploy. A copy of the app left open across a deploy still asks for the old
 * names, which no longer exist, so the import fails. The fix is to reload
 * once: that loads the new version, whose page files exist. A short guard
 * (one reload per 30 s) means a genuinely broken file or being offline shows
 * the crash screen instead of reloading forever.
 */

const KEY = 'atlas-stale-reload'
const GUARD_MS = 30_000

export interface ReloadEnv {
  reload: () => void
  now: () => number
  get: () => string | null
  set: (v: string) => void
}

const browserEnv = (): ReloadEnv => ({
  reload: () => location.reload(),
  now: () => Date.now(),
  get: () => {
    try {
      return sessionStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set: (v) => {
    try {
      sessionStorage.setItem(KEY, v)
    } catch {
      /* storage blocked: the guard falls back to "never reload twice in this page" */
    }
  },
})

let reloadedThisPage = false

/** Reload once to pick up the new version; false if we just did (then the error is real). */
export function reloadForNewVersion(env: ReloadEnv = browserEnv()): boolean {
  const last = Number(env.get() ?? 0)
  if (reloadedThisPage || env.now() - last < GUARD_MS) return false
  reloadedThisPage = true
  env.set(String(env.now()))
  env.reload()
  return true
}

/** Test hook: forget that this page already reloaded. */
export const _resetReloadGuard = () => {
  reloadedThisPage = false
}

/** React.lazy for a named export, recovering from files removed by a newer deploy. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>

export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K, env?: ReloadEnv) {
  type C = M[K] extends AnyComponent ? M[K] : never
  return lazy<C>(async () => {
    try {
      const m = await load()
      return { default: m[name] as C }
    } catch (e) {
      // While the reload happens, stay suspended (the page shows its loading state) instead of crashing.
      if (reloadForNewVersion(env)) return new Promise<never>(() => {})
      throw e
    }
  })
}
