import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, FDC_KEY_SETTING } from '../../db/db'
import { FDC_SIGNUP_URL } from '../../lib/barcode'
import { SCANNER_ADDON, SCANNER_ADDON_SETTING, useScanSupport } from '../../lib/scanner'
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
            placeholder="Paste your key"
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
      <ScannerAddon />
    </Section>
  )
}

/** Opt-in camera scanning for browsers without a built-in barcode reader. Nothing is bundled; the browser fetches it on first scan. */
function ScannerAddon() {
  const on = useLiveQuery(async () => (await db.settings.get(SCANNER_ADDON_SETTING))?.value === true, [])
  const support = useScanSupport()
  const toggle = () => (on ? db.settings.delete(SCANNER_ADDON_SETTING) : db.settings.put({ key: SCANNER_ADDON_SETTING, value: true }))

  return (
    <div className="border-t border-(--line) pt-4">
      <div className="text-xs text-(--dim)">Camera scanning</div>
      {support === 'native' ? (
        <p className="mt-1 text-xs text-(--muted)">This browser has a built-in barcode reader, so the Scan button just works. Nothing to add.</p>
      ) : (
        <>
          <label className="mt-2 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={!!on} onChange={toggle} className="mt-0.5 size-4 accent-(--c-above)" />
            <span className="text-sm">
              Use the free scanner add-on
              <span className="mt-0.5 block text-xs leading-relaxed text-(--muted)">
                For iPhone, Firefox and other browsers without a built-in reader. When on, your browser downloads{' '}
                <a href={SCANNER_ADDON.homepage} target="_blank" rel="noreferrer" className="text-(--c-above) hover:underline">
                  {SCANNER_ADDON.name} {SCANNER_ADDON.version}
                </a>{' '}
                (open source, {SCANNER_ADDON.license}, uses the {SCANNER_ADDON.engine} decoder) from the jsDelivr CDN the first time you tap Scan (about half a
                megabyte), then keeps it cached. It isn't part of the app, and jsDelivr sees only that your browser fetched it. Barcodes are read on your device.
              </span>
            </span>
          </label>
          {support === 'insecure' && <p className="mt-2 text-xs text-(--c-attention)">Cameras need a secure (https) address, so scanning starts working once the app is hosted.</p>}
        </>
      )}
    </div>
  )
}
