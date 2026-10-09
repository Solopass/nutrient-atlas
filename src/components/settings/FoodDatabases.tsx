import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, FDC_KEY_SETTING } from '../../db/db'
import { FDC_SIGNUP_URL } from '../../lib/barcode'
import { Section } from './Controls'

/**
 * Barcode lookups use two free databases. USDA's needs an API key: a shared
 * demo key works for a few lookups an hour; a personal key (free, by email)
 * allows about 1,000. The key stays on this device and out of backups.
 */
export function FoodDatabases() {
  const saved = useLiveQuery(async () => ((await db.settings.get(FDC_KEY_SETTING))?.value as string | undefined) ?? '', [])
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? saved ?? ''
  const save = async () => {
    const v = value.trim()
    if (v) await db.settings.put({ key: FDC_KEY_SETTING, value: v })
    else await db.settings.delete(FDC_KEY_SETTING)
    setDraft(null)
  }

  return (
    <Section title="Food databases" hint="Used when you type a barcode in Log food. Both are free; only the barcode number is sent.">
      <ul className="space-y-1.5 text-xs leading-relaxed text-(--dim)">
        <li>
          <b className="text-(--fg)">USDA Branded Foods:</b> US packaged foods with data from manufacturers. Checked first.
        </li>
        <li>
          <b className="text-(--fg)">Open Food Facts:</b> worldwide, entered by volunteers. Fills the gaps.
        </li>
      </ul>
      <div>
        <label className="text-xs text-(--dim)" htmlFor="fdc-key">
          Your USDA API key <span className="text-(--muted)">(optional, free)</span>
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="fdc-key"
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Paste the key from your email"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 font-mono text-sm focus:border-(--c-above) focus:outline-none"
          />
          <button onClick={save} disabled={draft == null || draft.trim() === (saved ?? '')} className="rounded-lg border border-(--line) px-3 py-2 text-sm hover:border-(--c-above) disabled:opacity-40">
            Save
          </button>
        </div>
        <p className="mt-1.5 text-xs text-(--muted)">
          {saved ? (
            <>Using your key (about 1,000 lookups an hour). </>
          ) : (
            <>Without one, a shared demo key allows only a few USDA lookups an hour; Open Food Facts still works. </>
          )}
          <a href={FDC_SIGNUP_URL} target="_blank" rel="noreferrer" className="text-(--c-above) hover:underline">
            Get a free key
          </a>{' '}
          (name and email, arrives in a minute). It stays on this device and isn't put in backups.
        </p>
      </div>
    </Section>
  )
}
