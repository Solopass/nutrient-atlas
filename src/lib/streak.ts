import { db } from '../db/db'
import { addDays } from './history'

const CHUNK_DAYS = 60

/**
 * Consecutive days with food logged, ending at `end` (or the day before, if
 * `end` has nothing yet: today in progress doesn't break a streak). Reads the
 * log in 60-day chunks going back, so long streaks aren't capped by whatever
 * window a screen happens to have loaded.
 */
export async function foodStreak(end: string) {
  let n = 0
  let cursor = end
  let first = true
  for (;;) {
    const from = addDays(cursor, -(CHUNK_DAYS - 1))
    const logs = await db.logs.where('date').between(from, cursor, true, true).filter((l) => l.supplementId == null).toArray()
    const days = new Set(logs.map((l) => l.date))
    let d = cursor
    if (first) {
      if (!days.has(d)) d = addDays(d, -1)
      first = false
    }
    while (d >= from && days.has(d)) {
      n++
      d = addDays(d, -1)
    }
    if (d >= from || days.size === 0) return n // hit a gap inside this chunk
    cursor = d // the streak runs past this chunk: keep going back
  }
}
