import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, localDate, type Food, type LogEntry, type SavedMeal, type Setting, type Supplement } from '../../db/db'
import { dailyTotalsCsv, entriesCsv } from '../../lib/csv'
import { loadSampleData, removeSampleData } from '../../lib/sampleData'
import { useProfile } from '../../state/profile'
import { Section } from './Controls'

const EXPORT_VERSION = 3

interface ExportFile {
  app: 'nutrient-atlas'
  version: number
  exportedAt: string
  settings: Setting[]
  foods: Food[]
  logs: LogEntry[]
  supplements?: Supplement[]
  meals?: SavedMeal[]
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

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
    return { foods, logs, days: days.length, samples }
  }, [])
  const [message, setMessage] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportData = async () => {
    const data: ExportFile = {
      app: 'nutrient-atlas',
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: await db.settings.toArray(),
      foods: await db.foods.toArray(),
      logs: await db.logs.toArray(),
      supplements: await db.supplements.toArray(),
      meals: await db.meals.toArray(),
    }
    download(`nutrient-atlas-${localDate()}.json`, JSON.stringify(data, null, 1), 'application/json')
    setMessage({ text: `Exported ${data.logs.length} log entries and ${data.foods.length} foods.`, tone: 'good' })
  }

  const exportCsv = async (kind: 'daily' | 'entries') => {
    const logs = await db.logs.toArray()
    if (!logs.length) return setMessage({ text: 'Nothing logged yet, so there is nothing to export.', tone: 'bad' })
    const csv = kind === 'daily' ? dailyTotalsCsv(logs, nutrients) : entriesCsv(logs, nutrients)
    download(`nutrient-atlas-${kind === 'daily' ? 'daily-totals' : 'entries'}-${localDate()}.csv`, csv, 'text/csv;charset=utf-8')
    setMessage({
      text: kind === 'daily' ? `Exported daily totals for ${new Set(logs.map((l) => l.date)).size} days. Empty cells mean no data, not zero.` : `Exported ${logs.length} entries. Empty cells mean no data, not zero.`,
      tone: 'good',
    })
  }

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ExportFile
      if (data.app !== 'nutrient-atlas' || !Array.isArray(data.logs) || !Array.isArray(data.foods)) throw new Error('Not a Nutrient Atlas export file.')
      if (!confirm(`Replace all current data with this backup from ${data.exportedAt.slice(0, 10)}? (${data.logs.length} log entries, ${data.foods.length} foods)`)) return
      await db.transaction('rw', [db.settings, db.foods, db.logs, db.supplements, db.meals], async () => {
        await Promise.all([db.settings.clear(), db.foods.clear(), db.logs.clear(), db.supplements.clear(), db.meals.clear()])
        await db.settings.bulkPut(data.settings ?? [])
        await db.foods.bulkPut(data.foods)
        await db.logs.bulkPut(data.logs)
        await db.supplements.bulkPut(data.supplements ?? [])
        await db.meals.bulkPut(data.meals ?? [])
      })
      setMessage({ text: 'Backup restored.', tone: 'good' })
    } catch (e) {
      setMessage({ text: `Import failed: ${(e as Error).message}`, tone: 'bad' })
    }
  }

  const deleteAll = async () => {
    if (!confirm('Delete your profile, saved foods and meals, supplements and every log entry from this browser? This cannot be undone. Export a backup first if you might want it.')) return
    await Promise.all([db.settings.clear(), db.foods.clear(), db.logs.clear(), db.supplements.clear(), db.meals.clear()])
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
      <div className="flex flex-wrap gap-2">
        <button onClick={exportData} className="rounded-lg border border-(--line) bg-(--panel-2) px-3.5 py-2 text-sm hover:border-(--c-above)">
          Export backup
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
