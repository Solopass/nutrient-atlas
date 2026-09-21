import { db, localDate, type LogEntry, type Supplement } from '../db/db'
import { addDays, parseDate } from './history'

/** How far back a daily supplement is back-filled when the app hasn't been opened for a while. */
const MAX_BACKFILL_DAYS = 14

export type NewSupplement = Omit<Supplement, 'id' | 'createdAt' | 'lastApplied' | 'active' | 'startDate'>

function entryFor(s: Supplement, date: string, now = Date.now()): Omit<LogEntry, 'id'> {
  const loggedAt = date === localDate() ? now : parseDate(date).getTime() + 8 * 3600_000
  return {
    date,
    loggedAt,
    meal: 'supplement',
    supplementId: s.id,
    name: s.name,
    serving: s.dose,
    multiplier: s.dosesPerDay,
    nutrients: s.nutrients,
  }
}

/**
 * Write today's dose (and any missed days, up to two weeks) for every active
 * daily supplement. Safe to call repeatedly: `lastApplied` moves forward
 * inside the same transaction, so concurrent calls don't double-log, and a
 * dose the user unticked is never re-added.
 */
export async function applyDailySupplements(today = localDate()) {
  await db.transaction('rw', db.supplements, db.logs, async () => {
    const active = await db.supplements.where('active').equals(1).toArray()
    for (const s of active) {
      if (s.schedule !== 'daily') continue
      let from = s.lastApplied ? addDays(s.lastApplied, 1) : s.startDate
      const floor = addDays(today, -(MAX_BACKFILL_DAYS - 1))
      if (from < floor) from = floor
      if (from > today) continue
      const entries: Omit<LogEntry, 'id'>[] = []
      for (let d = from; d <= today; d = addDays(d, 1)) entries.push(entryFor(s, d))
      await db.logs.bulkAdd(entries as LogEntry[])
      await db.supplements.update(s.id, { lastApplied: today })
    }
  })
}

export async function createSupplement(data: NewSupplement) {
  const today = localDate()
  const id = await db.supplements.add({ ...data, active: 1, startDate: today, createdAt: Date.now() } as Supplement)
  if (data.schedule === 'daily') await applyDailySupplements(today)
  return id
}

/** Update the definition. Today's auto-logged dose is refreshed too; earlier days keep their snapshot. */
export async function updateSupplement(id: number, data: NewSupplement) {
  const today = localDate()
  await db.transaction('rw', db.supplements, db.logs, async () => {
    const before = await db.supplements.get(id)
    // Becoming daily starts from today: never back-fill days from when it was "as needed".
    const becameDaily = data.schedule === 'daily' && before?.schedule !== 'daily'
    await db.supplements.update(id, becameDaily ? { ...data, lastApplied: addDays(today, -1) } : data)
    await db.logs
      .where('supplementId')
      .equals(id)
      .filter((l) => l.date === today)
      .modify({ name: data.name, serving: data.dose, multiplier: data.dosesPerDay, nutrients: data.nutrients })
  })
  if (data.schedule === 'daily') await applyDailySupplements(today)
}

export async function pauseSupplement(id: number) {
  await db.supplements.update(id, { active: 0 })
}

/** Resume without back-filling the paused days. */
export async function resumeSupplement(id: number) {
  const today = localDate()
  await db.supplements.update(id, { active: 1, lastApplied: addDays(today, -1) })
  await applyDailySupplements(today)
}

/** Remove the definition. Past log entries stay: they happened. */
export async function deleteSupplement(id: number) {
  await db.supplements.delete(id)
}

export async function isTaken(id: number, date: string) {
  return (await db.logs.where('supplementId').equals(id).filter((l) => l.date === date).count()) > 0
}

/** Tick or untick a dose for a date. */
export async function setTaken(s: Supplement, date: string, taken: boolean) {
  if (taken) {
    await db.logs.add(entryFor(s, date) as LogEntry)
  } else {
    await db.logs
      .where('supplementId')
      .equals(s.id)
      .filter((l) => l.date === date)
      .delete()
  }
}
