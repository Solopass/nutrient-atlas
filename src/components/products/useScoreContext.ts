import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, localDate } from '../../db/db'
import { hasFood } from '../../db/logging'
import { addDays, averageIntake, dateRange, groupByDate } from '../../lib/history'
import type { ScoreContext } from '../../lib/products/score'
import { nutrientState } from '../../lib/status'
import { useProfile } from '../../state/profile'

/**
 * What products are scored against: the last 7 complete days, once from food
 * alone (supplements are judged on what your food is missing) and once in total.
 */
export function useScoreContext(): ScoreContext & { loggedDays: number } {
  const { nutrients, profile } = useProfile()
  const end = addDays(localDate(), -1)
  const logs = useLiveQuery(() => db.logs.where('date').between(addDays(end, -6), end, true, true).toArray(), [end])
  return useMemo(() => {
    const dates = dateRange(end, 7)
    const all = groupByDate(logs ?? [])
    const loggedDays = dates.filter((d) => hasFood(all.get(d))).length
    if (!loggedDays) return { nutrients, foodStates: null, allStates: null, currency: profile.currency, loggedDays }
    const foodOnly = groupByDate((logs ?? []).filter((l) => l.supplementId == null))
    const food = averageIntake(foodOnly, dates).intake
    const total = averageIntake(all, dates).intake
    return {
      nutrients,
      foodStates: nutrients.map((n) => nutrientState(n, food[n.id])),
      allStates: nutrients.map((n) => nutrientState(n, total[n.id])),
      currency: profile.currency,
      loggedDays,
    }
  }, [logs, nutrients, end, profile.currency])
}
