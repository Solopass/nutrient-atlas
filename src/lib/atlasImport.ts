import type { MealItem } from '../db/db'
import { cleanNutrients, extractJson } from './ai/parse'

/**
 * Things other apps (MealVision, any chatbot) can hand to Nutrient Atlas, by
 * link (#/log?import=…) or by pasting into Log food → AI estimate:
 *   meal   { items: [{ name, quantity, grams, confidence, nutrients }], notes }  → AI estimate review
 *   recipe { name, servings, items: [{ name, serving, multiplier, nutrients }] } → recipe builder
 *   food   { name, serving, grams?, nutrients }                                  → food editor
 * Nothing is saved or logged until you confirm on that screen.
 */
export type AtlasImport =
  | { kind: 'meal'; text: string }
  | { kind: 'recipe'; name: string; servings: number; items: MealItem[]; warnings: string[] }
  | { kind: 'food'; name: string; serving: string; grams?: number; nutrients: Record<string, number>; warnings: string[] }

/** Links longer than this are refused rather than parsed (a real meal is a few KB). */
export const MAX_IMPORT_CHARS = 200_000

const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)

/** Recognise a pasted or linked payload. Unrecognised text is treated as a meal, so the review screen explains what's wrong. */
export function readImport(text: string): AtlasImport {
  const json = extractJson(text)
  let raw: unknown = null
  try {
    raw = json ? JSON.parse(json.replace(/,\s*([}\]])/g, '$1')) : null
  } catch {
    /* fall through: the meal parser reports the JSON error */
  }
  const obj = (raw ?? {}) as Record<string, unknown>
  const unknownIds = new Set<string>()
  const warnings: string[] = []
  const unknownNote = () => (unknownIds.size ? [`Ignored unknown nutrient ids: ${[...unknownIds].join(', ')}.`] : [])

  if (Array.isArray(obj.items) && typeof obj.servings === 'number') {
    const items: MealItem[] = obj.items
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object' && typeof (it as Record<string, unknown>).nutrients === 'object')
      .map((it, i) => {
        const name = str(it.name, `Ingredient ${i + 1}`)
        return {
          name,
          serving: str(it.serving ?? it.quantity, '1 serving'),
          multiplier: num(it.multiplier) ?? 1,
          nutrients: cleanNutrients(it.nutrients as Record<string, unknown>, name, unknownIds, warnings),
        }
      })
    return { kind: 'recipe', name: str(obj.name, 'Imported recipe'), servings: Math.max(1, Math.round(obj.servings)), items, warnings: [...warnings, ...unknownNote()] }
  }
  if (!Array.isArray(obj.items) && obj.nutrients && typeof obj.nutrients === 'object') {
    const name = str(obj.name, 'Imported food')
    const nutrients = cleanNutrients(obj.nutrients as Record<string, unknown>, name, unknownIds, warnings)
    return { kind: 'food', name, serving: str(obj.serving, '1 serving'), grams: num(obj.grams), nutrients, warnings: [...warnings, ...unknownNote()] }
  }
  return { kind: 'meal', text: json ?? text }
}

/** The payload of a "#/log?import=…" link, or null for other routes. */
export function importFromRoute(route: string): string | null {
  const m = route.match(/^log\?(.*)$/)
  if (!m) return null
  const value = new URLSearchParams(m[1]).get('import')
  return value && value.length <= MAX_IMPORT_CHARS ? value : null
}
