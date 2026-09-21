import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { db } from '../db/db'
import { DEFAULT_PROFILE, energyTarget, type Profile } from '../lib/profile'
import { personalize } from '../lib/targets'
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

export function ProfileProvider({ children }: { children: ReactNode }) {
  const row = useLiveQuery(() => db.settings.get('profile'), [], 'loading' as const)
  const loaded = row !== 'loading'
  const stored = loaded && row ? (row.value as Partial<Profile>) : null
  // Merge over defaults so profiles saved by older versions pick up new fields.
  const profile = useMemo(() => ({ ...DEFAULT_PROFILE, ...stored }), [stored])

  const update = useCallback(
    async (patch: Partial<Profile>) => {
      await db.settings.put({ key: 'profile', value: { ...profile, ...patch } })
    },
    [profile],
  )

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
