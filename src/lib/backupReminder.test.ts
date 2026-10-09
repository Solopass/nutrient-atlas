import { describe, expect, test } from 'bun:test'
import { backupDue, daysBetween } from './backupReminder'

describe('backup reminder', () => {
  const today = '2026-10-09'

  test('daysBetween counts calendar days, across months', () => {
    expect(daysBetween('2026-09-25', today)).toBe(14)
    expect(daysBetween(today, today)).toBe(0)
  })

  test('due 14 days after the last backup, not before', () => {
    expect(backupDue({ today, lastBackup: '2026-09-26' })).toBe(false)
    expect(backupDue({ today, lastBackup: '2026-09-25' })).toBe(true)
  })

  test('never backed up: quiet for new users, due after a week of real logs', () => {
    expect(backupDue({ today })).toBe(false)
    expect(backupDue({ today, loggedDays: 6 })).toBe(false)
    expect(backupDue({ today, loggedDays: 7 })).toBe(true)
  })

  test('snooze hides it until the given date', () => {
    expect(backupDue({ today, lastBackup: '2026-08-01', snoozedUntil: '2026-10-10' })).toBe(false)
    expect(backupDue({ today, lastBackup: '2026-08-01', snoozedUntil: today })).toBe(true)
  })
})
