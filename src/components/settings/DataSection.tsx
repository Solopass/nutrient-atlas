import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, localDate } from '../../db/db'
import { describeBackup, exportBackup, readBackup, restoreBackup } from '../../lib/backup'
import { dailyTotalsCsv, entriesCsv } from '../../lib/csv'
import { shareOrDownload, sharesFiles } from '../../lib/download'
import { formatDay } from '../../lib/history'
import { loadSampleData, removeSampleData } from '../../lib/sampleData'
import { ensurePersistentStorage, storageStatus } from '../../lib/storage'
import { useProfile } from '../../state/profile'
import { Section } from './Controls'

export function DataSection() {
  const { nutrients } = useProfile()
  const stats = useLiveQuery(async () => {
    const [foods, logs, foodDays] = await Promise.all([
      db.foods.count(),
      db.logs.count(),
      // A day counts as logged only if it has food (auto-logged supplements alone don't count), as in History.
      db.logs.filter((l) => l.supplementId == null).toArray().then((ls) => new Set(ls.map((l) => l.date))),
    ])
    const days = [...foodDays]
    const samples = await db.logs.filter((l) => l.sample === true).count()
    const lastBackup = (await db.settings.get('lastBackup'))?.value as string | undefined
    return { foods, logs, days: days.length, samples, lastBackup }
  }, [])
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageStatus>> | null>(null)
  useEffect(() => {
    storageStatus().then(setStorage)
  }, [])
  const [message, setMessage] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Phones: the share sheet lets the file go to Files, Google Drive, iCloud Drive or email.
  const share = sharesFiles()

  const exportData = async () => {
    const { data, result } = await exportBackup()
    if (result === 'cancelled') return
    setMessage({ text: `${result === 'shared' ? 'Saved' : 'Exported'} ${data.logs.length} log entries and ${data.foods.length} foods.`, tone: 'good' })
  }

  const exportCsv = async (kind: 'daily' | 'entries') => {
    const logs = await db.logs.toArray()
    if (!logs.length) return setMessage({ text: 'Nothing logged yet, so there is nothing to export.', tone: 'bad' })
    const csv = kind === 'daily' ? dailyTotalsCsv(logs, nutrients) : entriesCsv(logs, nutrients)
    const saved = await shareOrDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `nutrient-atlas-${kind === 'daily' ? 'daily-totals' : 'entries'}-${localDate()}.csv`)
    if (saved === 'cancelled') return
    setMessage({
      text: kind === 'daily' ? `Exported daily totals for ${new Set(logs.map((l) => l.date)).size} days. Empty cells mean no data, not zero.` : `Exported ${logs.length} entries. Empty cells mean no data, not zero.`,
      tone: 'good',
    })
  }

  const importData = async (file: File) => {
    try {
      const data = await readBackup(file)
      if (!confirm(`Replace all current data with this ${describeBackup(data)}?`)) return
      await restoreBackup(data)
      setMessage({ text: 'Backup restored.', tone: 'good' })
    } catch (e) {
      setMessage({ text: `Import failed: ${(e as Error).message}`, tone: 'bad' })
    }
  }

  const deleteAll = async () => {
    if (!confirm('Delete your profile, saved foods and meals, supplements, rated products and every log entry from this browser? This cannot be undone. Export a backup first if you might want it.')) return
    await Promise.all([db.settings.clear(), db.foods.clear(), db.logs.clear(), db.supplements.clear(), db.meals.clear(), db.products.clear()])
    try {
      localStorage.removeItem('ai-log-draft') // unsent meal description / AI reply
    } catch {
      /* storage unavailable */
    }
    setMessage({ text: 'All data deleted.', tone: 'good' })
  }

  return (
    <Section title="Your data" hint="Everything lives only in this browser. Export a backup to move it to another device.">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'log entries', value: stats?.logs },
          { label: 'days logged', value: stats?.days },
          { label: 'saved foods', value: stats?.foods },
        ].map((x) => (
          <div key={x.label} className="rounded-lg bg-(--panel-2) py-2">
            <div className="font-mono text-lg font-semibold">{x.value ?? '–'}</div>
            <div className="text-[10px] tracking-wider text-(--muted) uppercase">{x.label}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-(--panel-2) px-3 py-2 text-xs">
        {storage?.persisted ? (
          <span className="text-(--c-good)">✓ Protected: the browser won't clear it to free space</span>
        ) : (
          <span className="flex items-center gap-2 text-(--c-attention)">
            Not protected: the browser may clear it if the disk runs low
            {storage?.persisted === false && (
              <button
                onClick={async () => {
                  const ok = await ensurePersistentStorage()
                  setStorage(await storageStatus())
                  if (!ok) setMessage({ text: 'The browser declined. Installing the app (Add to Home Screen / Install) usually allows it. Keep backups meanwhile.', tone: 'bad' })
                }}
                className="rounded-md border border-(--c-attention)/40 px-2 py-0.5 hover:bg-(--c-attention)/10"
              >
                Protect
              </button>
            )}
          </span>
        )}
        <span className={stats?.logs && !stats.lastBackup ? 'text-(--c-attention)' : 'text-(--muted)'}>
          Last backup: {stats?.lastBackup ? formatDay(stats.lastBackup, 'short') : 'never'}
        </span>
        {storage?.usedMb != null && <span className="text-(--muted)">{storage.usedMb.toFixed(1)} MB used</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportData} className="rounded-lg border border-(--line) bg-(--panel-2) px-3.5 py-2 text-sm hover:border-(--c-above)">
          {share ? 'Save backup to…' : 'Export backup'}
        </button>
        <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-(--line) bg-(--panel-2) px-3.5 py-2 text-sm hover:border-(--c-above)">
          Import backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importData(f)
            e.target.value = ''
          }}
        />
        {stats && stats.samples > 0 ? (
          <button
            onClick={async () => setMessage({ text: `Removed ${await removeSampleData()} sample entries.`, tone: 'good' })}
            className="rounded-lg border border-(--c-attention)/40 px-3.5 py-2 text-sm text-(--c-attention) hover:bg-(--c-attention)/10"
          >
            Remove sample data ({stats.samples})
          </button>
        ) : (
          <button
            onClick={async () => setMessage({ text: `Added ${await loadSampleData()} sample entries over 3 weeks. Remove them any time here.`, tone: 'good' })}
            className="rounded-lg border border-(--line) bg-(--panel-2) px-3.5 py-2 text-sm hover:border-(--c-above)"
          >
            Load sample history
          </button>
        )}
        <button onClick={deleteAll} className="ml-auto rounded-lg border border-(--c-deficient)/40 px-3.5 py-2 text-sm text-(--c-deficient) hover:bg-(--c-deficient)/10">
          Delete all data
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-(--line) pt-4">
        <span className="mr-1 text-xs text-(--dim)">Spreadsheet (CSV)</span>
        <button onClick={() => exportCsv('daily')} className="rounded-lg border border-(--line) bg-(--panel-2) px-3.5 py-2 text-sm hover:border-(--c-above)">
          Daily totals
        </button>
        <button onClick={() => exportCsv('entries')} className="rounded-lg border border-(--line) bg-(--panel-2) px-3.5 py-2 text-sm hover:border-(--c-above)">
          Every entry
        </button>
        <span className="text-[11px] text-(--muted)">For Excel, Sheets or a dietitian. One column per nutrient.</span>
      </div>
      {message && <p className={`text-sm ${message.tone === 'good' ? 'text-(--c-good)' : 'text-(--c-deficient)'}`}>{message.text}</p>}
    </Section>
  )
}
