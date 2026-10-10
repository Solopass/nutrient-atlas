import { db, MEALVISION_SETTING } from '../db/db'

/**
 * MealVision (D:\Workspace\meal-vision) is a companion app that runs on this
 * PC: photo → foods → nutrients from the same USDA table. When switched on in
 * Settings, Log food → AI estimate gets a Photo step that sends the photo to
 * it and reviews the answer like any AI estimate. It runs on 127.0.0.1, so it
 * only works on the computer where MealVision is running (never on a phone).
 * Off by default: the browser may ask to allow access to devices on this PC.
 */
export { MEALVISION_SETTING }
export const MEALVISION_DEFAULT_URL = 'http://127.0.0.1:8085'

export async function mealVisionUrl(): Promise<string | null> {
  const v = (await db.settings.get(MEALVISION_SETTING))?.value
  return typeof v === 'string' && v ? v.replace(/\/+$/, '') : null
}

/** Is MealVision answering? */
export async function mealVisionHealth(base: string, timeoutMs = 2500): Promise<{ ok: boolean; foods?: number }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(`${base}/health`, { signal: ctrl.signal })
    if (!r.ok) return { ok: false }
    const j = (await r.json()) as { foods_indexed?: number }
    return { ok: true, foods: j.foods_indexed }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(t)
  }
}

/** Send a meal photo; returns MealVision's { items, notes } reply as text for the AI estimate review. */
export async function mealVisionEstimate(base: string, photo: File, signal?: AbortSignal): Promise<string> {
  const form = new FormData()
  form.append('file', photo)
  let r: Response
  try {
    r = await fetch(`${base}/v1/estimate`, { method: 'POST', body: form, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('MealVision isn’t answering. Start it with MealVision.cmd on this PC, then try again.')
  }
  if (!r.ok) {
    const detail = await r.json().then((j: { detail?: unknown }) => (typeof j.detail === 'string' ? j.detail : ''), () => '')
    throw new Error(`MealVision couldn’t analyse the photo (${r.status}${detail ? `: ${detail}` : ''}).`)
  }
  return JSON.stringify(await r.json(), null, 1)
}
