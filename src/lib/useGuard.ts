import { useCallback, useRef } from 'react'

/**
 * Run an async action at most once at a time. A ref, not state: two taps
 * before the next render would both see `saving === false` and log twice.
 */
export function useGuard() {
  const busy = useRef(false)
  return useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined
    busy.current = true
    try {
      return await fn()
    } finally {
      busy.current = false
    }
  }, [])
}
