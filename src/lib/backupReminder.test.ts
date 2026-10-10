import { afterEach, describe, expect, test } from 'bun:test'
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

describe('saving a backup on a phone (share sheet)', () => {
  const g = globalThis as unknown as { matchMedia?: unknown }
  const nav = globalThis.navigator as unknown as Record<string, unknown>
  const fakePhone = (share: () => Promise<void>) => {
    g.matchMedia = () => ({ matches: true })
    nav.canShare = () => true
    nav.share = share
  }
  afterEach(() => {
    delete g.matchMedia
    delete nav.canShare
    delete nav.share
  })

  test('a cancelled share is not a backup; a completed one is', async () => {
    const { db } = await import('../db/db')
    const { exportBackup } = await import('./backup')
    await db.settings.delete('lastBackup')
    fakePhone(() => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })))
    expect((await exportBackup()).result).toBe('cancelled')
    expect(await db.settings.get('lastBackup')).toBeUndefined()

    let shared: File | undefined
    fakePhone(async (data?: unknown) => {
      shared = (data as { files: File[] }).files[0]
    })
    expect((await exportBackup()).result).toBe('shared')
    expect((await db.settings.get('lastBackup'))?.value).toBeTruthy()
    expect(shared?.name).toMatch(/^nutrient-atlas-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
