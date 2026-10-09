import { parseDate } from './history'

/** Remind when the last backup is this old. */
export const BACKUP_EVERY_DAYS = 14
/** Never backed up: remind once this many days have real (non-sample) food logs. */
export const FIRST_BACKUP_AFTER_DAYS = 7
/** "Remind me later" hides the banner for this long. */
export const SNOOZE_DAYS = 7

export const daysBetween = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)

export interface BackupState {
  today: string
  /** Date of the last export (settings key `lastBackup`). */
  lastBackup?: string
  /** Banner hidden until this date (settings key `backupSnoozedUntil`). */
  snoozedUntil?: string
  /** Distinct days with real food logs; only needed when there has never been a backup. */
  loggedDays?: number
}

/**
 * Whether to show the backup reminder. Local-first data lives only in this
 * browser, so a cleared site or a lost device loses everything since the last
 * export. Stays quiet for new users and sample data.
 */
export function backupDue({ today, lastBackup, snoozedUntil, loggedDays = 0 }: BackupState) {
  if (snoozedUntil && today < snoozedUntil) return false
  if (lastBackup) return daysBetween(lastBackup, today) >= BACKUP_EVERY_DAYS
  return loggedDays >= FIRST_BACKUP_AFTER_DAYS
}
