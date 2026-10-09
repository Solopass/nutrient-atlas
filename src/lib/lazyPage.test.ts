import { beforeEach, describe, expect, test } from 'bun:test'
import { _resetReloadGuard, reloadForNewVersion, type ReloadEnv } from './lazyPage'

function fakeEnv(start = 1_000_000) {
  let stored: string | null = null
  const env = { reloads: 0, t: start } as ReloadEnv & { reloads: number; t: number }
  env.reload = () => {
    env.reloads++
  }
  env.now = () => env.t
  env.get = () => stored
  env.set = (v) => {
    stored = v
  }
  return env
}

describe('reload after a deploy replaced page files', () => {
  beforeEach(() => _resetReloadGuard())

  test('reloads once to pick up the new version', () => {
    const env = fakeEnv()
    expect(reloadForNewVersion(env)).toBe(true)
    expect(env.reloads).toBe(1)
  })

  test('never twice in the same page, so a real error shows instead of a loop', () => {
    const env = fakeEnv()
    reloadForNewVersion(env)
    env.t += 60_000
    expect(reloadForNewVersion(env)).toBe(false)
    expect(env.reloads).toBe(1)
  })

  test('after the reload, a second failure within 30 s is a real error (e.g. offline)', () => {
    const env = fakeEnv()
    reloadForNewVersion(env)
    _resetReloadGuard() // the reloaded page starts fresh; only session storage remembers
    env.t += 5_000
    expect(reloadForNewVersion(env)).toBe(false)
    env.t += 60_000
    expect(reloadForNewVersion(env)).toBe(true) // a later deploy can recover again
    expect(env.reloads).toBe(2)
  })
})
