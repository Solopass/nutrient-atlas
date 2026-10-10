import { useLiveQuery } from 'dexie-react-hooks'
import { db, localDate } from '../db/db'
import { addDays } from './history'
import type { PickToLog } from './logPick'

/**
 * Plan tomorrow: a few foods saved for a given day, one settings entry per day
 * (`dayPlan:YYYY-MM-DD`), so today's plan and tomorrow's can exist side by
 * side. On its day the dashboard lists the plan with one-tap logging. Plans
 * older than yesterday are removed when a new one is saved. Part of your data,
 * so they're in backups.
 */
const PREFIX = 'dayPlan:'
export const planKey = (date: string) => `${PREFIX}${date}`

export interface SavedPlan {
  /** The day the plan is for (YYYY-MM-DD). */
  date: string
  items: PickToLog[]
  /** Typical-day score before and with the plan, and the nutrients it lifts to 80%+ (symbols). */
  before: number
  after: number
  closes: string[]
  /** Keys of items logged from the plan card (a saved meal logs under its ingredients' names). */
  loggedKeys?: string[]
  createdAt: number
}

export async function savePlan(plan: Omit<SavedPlan, 'createdAt'>) {
  const keep = addDays(localDate(), -1)
  await db.transaction('rw', db.settings, async () => {
    const stale = await db.settings.filter((s) => s.key.startsWith(PREFIX) && s.key.slice(PREFIX.length) < keep).primaryKeys()
    await db.settings.bulkDelete(stale)
    await db.settings.put({ key: planKey(plan.date), value: { ...plan, createdAt: Date.now() } })
  })
}

export const clearPlan = (date: string) => db.settings.delete(planKey(date))

/** Remember that a plan item was logged. */
export async function markLogged(date: string, key: string) {
  await db.transaction('rw', db.settings, async () => {
    const plan = (await db.settings.get(planKey(date)))?.value as SavedPlan | undefined
    if (plan && !plan.loggedKeys?.includes(key)) await db.settings.put({ key: planKey(date), value: { ...plan, loggedKeys: [...(plan.loggedKeys ?? []), key] } })
  })
}

/** The plan saved for `date`, or null; undefined while loading. */
export function useSavedPlan(date: string): SavedPlan | null | undefined {
  return useLiveQuery(async () => ((await db.settings.get(planKey(date)))?.value as SavedPlan | undefined) ?? null, [date])
}

/** Has a plan item been eaten on its day? Logged from the plan, or logged some other way under the same name. */
export const isEaten = (plan: SavedPlan, item: PickToLog, eatenNames: string[]) =>
  !!plan.loggedKeys?.includes(item.key) || eatenNames.some((n) => n.toLowerCase() === item.name.toLowerCase())
