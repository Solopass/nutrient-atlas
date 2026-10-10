import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { MEALVISION_DEFAULT_URL, MEALVISION_SETTING, mealVisionHealth, mealVisionUrl } from '../../lib/mealVision'
import { Section } from './Controls'

/**
 * MealVision (photo → foods → nutrients) runs on this PC. Switched on, Log
 * food → AI estimate gets a Photo step that uses it. Off by default: phones
 * can't reach it, and the browser may ask permission to contact this PC.
 */
export function CompanionApps() {
  const base = useLiveQuery(mealVisionUrl, [])
  const [status, setStatus] = useState<{ ok: boolean; foods?: number } | 'checking' | null>(null)

  const check = async (url: string) => {
    setStatus('checking')
    setStatus(await mealVisionHealth(url))
  }
  useEffect(() => {
    if (base) check(base)
    else setStatus(null)
  }, [base])

  const toggle = () => (base ? db.settings.delete(MEALVISION_SETTING) : db.settings.put({ key: MEALVISION_SETTING, value: MEALVISION_DEFAULT_URL }))

  return (
    <Section title="Companion apps" hint="Apps on this PC that can hand meals to Nutrient Atlas.">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={!!base} onChange={toggle} className="mt-0.5 size-4 accent-(--c-above)" />
        <span className="text-sm">
          MealVision on this PC
          <span className="mt-0.5 block text-xs leading-relaxed text-(--muted)">
            Adds a Photo step to Log food → AI estimate: the photo goes to MealVision at {MEALVISION_DEFAULT_URL} (this computer only, nothing leaves it unless
            MealVision is set to use Gemini), and its answer opens in the usual review. Start it with MealVision.cmd. Its “Open on Cloudflare Atlas” and copy
            buttons work without this switch.
          </span>
        </span>
      </label>
      {base && (
        <p className="text-xs" aria-live="polite">
          {status === 'checking' ? (
            <span className="text-(--muted)">Checking MealVision…</span>
          ) : status?.ok ? (
            <span className="text-(--c-good)">● Connected{status.foods ? ` (${status.foods.toLocaleString()} foods indexed)` : ''}</span>
          ) : (
            <span className="text-(--c-attention)">
              ○ Not answering. Start MealVision.cmd, then{' '}
              <button onClick={() => check(base)} className="font-medium underline">
                check again
              </button>
              . If the browser asked to allow access to devices on this computer, allow it.
            </span>
          )}
        </p>
      )}
    </Section>
  )
}
