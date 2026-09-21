import { NUTRIENTS } from '../../data/nutrients'
import type { Confidence, EstimatedItem, ParseResult } from './types'

const BY_ID = new Map(NUTRIENTS.map((n) => [n.id, n]))
const BY_LOWER = new Map(NUTRIENTS.map((n) => [n.id.toLowerCase(), n.id]))
const CONFIDENCE: Confidence[] = ['high', 'medium', 'low']

/** Pull the JSON object out of a chatbot reply: tolerates code fences and surrounding prose. */
function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : null
}

export function parseMealResponse(text: string): ParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!text.trim()) return { estimate: null, errors, warnings }

  const json = extractJson(text)
  if (!json) return { estimate: null, errors: ['No JSON object found in the response.'], warnings }

  let raw: unknown
  try {
    // Chatbots sometimes emit trailing commas; strip them before parsing.
    raw = JSON.parse(json.replace(/,\s*([}\]])/g, '$1'))
  } catch (e) {
    return { estimate: null, errors: [`The JSON couldn't be read: ${(e as Error).message}`], warnings }
  }

  const obj = raw as { items?: unknown; notes?: unknown }
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    return { estimate: null, errors: ['Expected an "items" array with at least one food.'], warnings }
  }

  const unknownIds = new Set<string>()
  const items: EstimatedItem[] = []

  obj.items.forEach((it: any, i: number) => {
    const label = typeof it?.name === 'string' && it.name.trim() ? it.name.trim() : `Item ${i + 1}`
    if (typeof it?.nutrients !== 'object' || it.nutrients == null) {
      errors.push(`${label}: missing "nutrients" object.`)
      return
    }
    const nutrients: Record<string, number> = {}
    for (const [key, value] of Object.entries(it.nutrients as Record<string, unknown>)) {
      const id = BY_ID.has(key) ? key : BY_LOWER.get(key.toLowerCase())
      if (!id) {
        unknownIds.add(key)
        continue
      }
      const num = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN
      if (!Number.isFinite(num) || num < 0) {
        warnings.push(`${label}: ignored invalid value for ${id}.`)
        continue
      }
      nutrients[id] = num

      // Catch likely unit mix-ups (e.g. mg reported as mcg).
      const n = BY_ID.get(id)!
      const ref = n.upperLimit ?? n.target
      if (ref && num > ref * 20) {
        warnings.push(`${label}: ${n.name} = ${num} ${n.unit} looks too high. Check the units.`)
      }
    }
    const confidence = CONFIDENCE.includes(it.confidence) ? (it.confidence as Confidence) : 'medium'
    const grams = typeof it.grams === 'number' && it.grams > 0 ? it.grams : undefined
    items.push({
      name: label,
      quantity: typeof it.quantity === 'string' && it.quantity.trim() ? it.quantity.trim() : '1 serving',
      grams,
      confidence,
      nutrients,
    })
    if (Object.keys(nutrients).length < 5) warnings.push(`${label}: only ${Object.keys(nutrients).length} nutrients reported.`)
  })

  if (unknownIds.size) warnings.push(`Ignored unknown nutrient ids: ${[...unknownIds].join(', ')}.`)
  if (items.length === 0) return { estimate: null, errors, warnings }

  return {
    estimate: { items, notes: typeof obj.notes === 'string' ? obj.notes : undefined },
    errors,
    warnings,
  }
}
