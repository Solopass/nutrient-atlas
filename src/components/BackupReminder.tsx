import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, localDate } from '../db/db'
import { exportBackup } from '../lib/backup'
import { addDays, formatDay } from '../lib/history'
import { SNOOZE_DAYS, backupDue, daysBetween } from '../lib/backupReminder'

/**
 * A gentle banner when there's no recent backup: everything lives in this
 * browser only. One tap exports; "Remind me in a week" snoozes it.
 */
export function BackupReminder() {
  const today = localDate()
  const state = useLiveQuery(async () => {
    const [last, snooze] = await Promise.all([db.settings.get('lastBackup'), db.settings.get('backupSnoozedUntil')])
    const lastBackup = last?.value as string | undefined
    const snoozedUntil = snooze?.value as string | undefined
    // Counting logged days scans the logs, so only do it when the answer matters (never backed up, not snoozed).
    let loggedDays = 0
    if (!lastBackup && !(snoozedUntil && today < snoozedUntil)) {
      const dates = new Set<string>()
      await db.logs.each((l) => {
        if (l.supplementId == null && !l.sample) dates.add(l.date)
      })
      loggedDays = dates.size
    }
    return { lastBackup, due: backupDue({ today, lastBackup, snoozedUntil, loggedDays }) }
  }, [today])
  const [busy, setBusy] = useState(false)
  if (!state?.due) return null

  const age = state.lastBackup ? daysBetween(state.lastBackup, today) : null
  const snooze = () => db.settings.put({ key: 'backupSnoozedUntil', value: addDays(today, SNOOZE_DAYS) })
  const backUp = async () => {
    setBusy(true)
    try {
      await exportBackup()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section role="status" aria-label="Backup reminder" className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--c-attention)/15 text-(--c-attention)" aria-hidden>
        ⤓
      </span>
      <p className="min-w-0 flex-1 basis-64 text-sm leading-relaxed text-(--dim)">
        <span className="font-medium text-(--fg)">
          {age == null ? 'Time for your first backup.' : `Last backup ${age} days ago (${formatDay(state.lastBackup!, 'short')}).`}
        </span>{' '}
        Your log lives only in this browser; a backup file restores it here or on another device.
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <button onClick={snooze} className="text-xs text-(--muted) hover:text-(--fg)">
          Remind me in a week
        </button>
        <button onClick={backUp} disabled={busy} className="rounded-full bg-(--c-above) px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">
          {busy ? 'Exporting…' : 'Export backup'}
        </button>
      </div>
    </section>
  )
}
