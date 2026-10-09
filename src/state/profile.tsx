import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { db } from '../db/db'
import { DEFAULT_PROFILE, energyTarget, type Profile } from '../lib/profile'
import { labHistory, removeLabResult, upsertLabResult, type LabId, type LabResult } from '../lib/labs'
import { personalize } from '../lib/targets'
import { useAppearance } from './appearance'
import type { Nutrient } from '../types'

interface ProfileState {
  profile: Profile
  /** true until the user has saved a profile */
  isDefault: boolean
  loaded: boolean
  nutrients: Nutrient[]
  byId: Map<string, Nutrient>
  energyKcal: number
  update: (patch: Partial<Profile>) => Promise<void>
}

const Ctx = createContext<ProfileState | null>(null)

/**
 * Merge a change into the saved profile. Reads the current row inside the
 * transaction, so quick successive changes (tap goal, then diet) can't
 * overwrite each other with a stale copy.
 */
export function saveProfile(patch: Partial<Profile>) {
  return db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('profile'))?.value as Partial<Profile> | undefined
    await db.settings.put({ key: 'profile', value: { ...DEFAULT_PROFILE, ...current, ...patch } })
  })
}

/**
 * Add or edit one lab result (`replaceDate`: the date of the entry being edited),
 * or remove the one dated `removeDate`. Keeps the full history and the latest
 * result in step; read inside the transaction, like saveProfile.
 */
export function saveLab(id: LabId, change: { result: LabResult; replaceDate?: string | null } | { removeDate: string }) {
  return db.transaction('rw', db.settings, async () => {
    const current = { ...DEFAULT_PROFILE, ...(((await db.settings.get('profile'))?.value ?? {}) as Partial<Profile>) }
    const before = labHistory(current, id)
    const { history, latest } = 'removeDate' in change ? removeLabResult(before, change.removeDate) : upsertLabResult(before, change.result, change.replaceDate)
    const labs = { ...current.labs }
    const all = { ...current.labHistory }
    if (latest) labs[id] = latest
    else delete labs[id]
    if (history.length) all[id] = history
    else delete all[id]
    await db.settings.put({ key: 'profile', value: { ...current, labs, labHistory: all } })
  })
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const row = useLiveQuery(() => db.settings.get('profile'), [], 'loading' as const)
  const loaded = row !== 'loading'
  const stored = loaded && row ? (row.value as Partial<Profile>) : null
  // Merge over defaults so profiles saved by older versions pick up new fields.
  const profile = useMemo(() => ({ ...DEFAULT_PROFILE, ...stored }), [stored])

  const update = useCallback((patch: Partial<Profile>) => saveProfile(patch), [])
  useAppearance(profile, loaded)

  const value = useMemo<ProfileState>(() => {
    const nutrients = personalize(profile)
    return {
      profile,
      isDefault: loaded && !stored,
      loaded,
      nutrients,
      byId: new Map(nutrients.map((n) => [n.id, n])),
      energyKcal: energyTarget(profile).target,
      update,
    }
  }, [profile, loaded, stored, update])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProfile() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProfile must be used inside ProfileProvider')
  return v
}
