import { useLiveQuery } from 'dexie-react-hooks'
import { db, localDate } from '../db/db'
import { addDays } from '../lib/history'

/**
 * "I'm done eating today." Normally today is treated as in progress: left out
 * of weekly averages and shown as "so far". Marking it complete lets it count
 * before midnight. Stored as the date it applies to, so it resets itself when
 * the day rolls over.
 */
const KEY = 'dayComplete'

export async function setTodayComplete(done: boolean) {
  if (done) await db.settings.put({ key: KEY, value: localDate() })
  else await db.settings.delete(KEY)
}

export function useDayComplete() {
  const today = localDate()
  const row = useLiveQuery(() => db.settings.get(KEY), [today])
  const todayDone = row?.value === today
  return {
    todayDone,
    /** The most recent day that counts as finished: today once marked, else yesterday. */
    lastComplete: todayDone ? today : addDays(today, -1),
    /** Is this date still being logged? */
    inProgress: (date: string) => date === today && !todayDone,
  }
}
