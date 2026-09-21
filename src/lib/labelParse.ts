import { NUTRIENTS } from '../data/nutrients'
import { labelUnits } from '../data/supplementPresets'

/**
 * Reads pasted Nutrition Facts / Supplement Facts text (typed, copied from a
 * website, or copied from a photo with Live Text / Google Lens) into
 * app nutrients per serving. Handles "Sodium 470mg 20%", "Vitamin D 2mcg",
 * %DV-only lines like "Vitamin A 10%", "Includes 5g Added Sugars", and text
 * that lost its line breaks.
 */

/** FDA Daily Values (2016 label rule), in the app's units, used when a label only gives %DV. */
const DAILY_VALUE: Record<string, number> = {
  fat: 78, satfat: 20, cholesterol: 300, sodium: 2300, carbs: 275, fiber: 28, addedSugar: 50, protein: 50,
  vitA: 900, vitC: 90, vitD: 20, vitE: 15, vitK: 120, b1: 1.2, b2: 1.3, b3: 16, b5: 5, b6: 1.7, b7: 30, b9: 400, b12: 2.4,
  calcium: 1300, iron: 18, phosphorus: 1250, iodine: 150, magnesium: 420, zinc: 11, selenium: 55, copper: 900, manganese: 2.3,
  chromium: 35, molybdenum: 45, potassium: 4700, choline: 550,
}

/** Label wording for each nutrient. Order matters: specific names before general ones. */
const ALIASES: [string, RegExp][] = [
  ['satfat', /saturated\s+fat|sat\.?\s*fat/],
  ['transfat', /trans\s+fat/],
  ['fat', /(?<!saturated\s|trans\s|polyunsaturated\s|monounsaturated\s)(?:total\s+)?fat(?!ty)/],
  ['cholesterol', /cholesterol/],
  ['sodium', /sodium/],
  ['fiber', /dietary\s+fib(?:er|re)|(?<!\w)fib(?:er|re)/],
  ['addedSugar', /added\s+sugars?/],
  ['carbs', /(?:total\s+)?carbohydrates?|total\s+carb\.?|(?<!\w)carbs?(?!\w)/],
  ['protein', /protein/],
  ['vitD', /vitamin\s+d\d?(?![a-z])|vit\.?\s*d(?![a-z])/],
  ['vitA', /vitamin\s+a(?![a-z])|vit\.?\s*a(?![a-z])/],
  ['vitC', /vitamin\s+c(?![a-z])|vit\.?\s*c(?![a-z])|ascorbic\s+acid/],
  ['vitE', /vitamin\s+e(?![a-z])|vit\.?\s*e(?![a-z])/],
  ['vitK', /vitamin\s+k\d?(?![a-z])|vit\.?\s*k(?![a-z])/],
  ['b1', /thiamine?|vitamin\s+b-?1(?!\d)/],
  ['b2', /riboflavin|vitamin\s+b-?2/],
  ['b3', /niacin(?:amide)?|vitamin\s+b-?3/],
  ['b5', /pantothenic\s+acid|vitamin\s+b-?5/],
  ['b6', /vitamin\s+b-?6|pyridoxine/],
  ['b7', /biotin|vitamin\s+b-?7/],
  ['b9', /folate|folic\s+acid|vitamin\s+b-?9/],
  ['b12', /vitamin\s+b-?12|cobalamin/],
  ['calcium', /calcium/],
  ['iron', /(?<!\w)iron/],
  ['potassium', /potassium/],
  ['magnesium', /magnesium/],
  ['zinc', /zinc/],
  ['phosphorus', /phosphorus/],
  ['iodine', /iodine/],
  ['selenium', /selenium/],
  ['copper', /copper/],
  ['manganese', /manganese/],
  ['chromium', /chromium/],
  ['molybdenum', /molybdenum/],
  ['choline', /choline/],
  ['caffeine', /caffeine/],
  ['epa', /(?<!\w)epa(?!\w)|eicosapentaenoic/],
  ['dha', /(?<!\w)dha(?!\w)|docosahexaenoic/],
  ['ala', /(?<!\w)ala(?!\w)|alpha-?linolenic/],
  ['creatine', /creatine/],
]

const BY_ID = new Map(NUTRIENTS.map((n) => [n.id, n]))
const UNIT = /(mcg|µg|ug|mg|g|iu)\b/

export interface ParsedLabel {
  /** Nutrients per serving, app units. */
  nutrients: Record<string, number>
  servingLabel?: string
  grams?: number
  servingsPerContainer?: number
  calories?: number
  /** What was read, for showing the user: nutrient id → original snippet. */
  matched: Record<string, string>
}

export function parseLabel(text: string): ParsedLabel {
  const out: ParsedLabel = { nutrients: {}, matched: {} }
  if (!text.trim()) return out

  // Normalise: lowercase, unify units and separators, and put each known nutrient name on its own line
  // so labels pasted without line breaks still read correctly.
  let t = text
    .toLowerCase()
    .replace(/µg/g, 'mcg')
    .replace(/\bmicrograms?\b/g, 'mcg')
    .replace(/\bmilligrams?\b/g, 'mg')
    .replace(/\bgrams?\b/g, 'g')
    .replace(/\b(\d+),(\d{3})\b/g, '$1$2') // 1,000 → 1000
    .replace(/(\d),(\d)/g, '$1.$2') // 2,5 g → 2.5 g
    .replace(/[\t|]+/g, ' ')

  const serving = t.match(/serving\s+size\s*:?\s*([^\n]+?)(?:\n|servings?\s+per|calories|amount\s+per|$)/)
  if (serving) {
    out.servingLabel = serving[1].trim().replace(/\s+/g, ' ')
    const g = serving[1].match(/\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*\)?/)
    if (g) out.grams = parseFloat(g[1])
  }
  const per = t.match(/servings?\s+per\s+container\s*:?\s*(?:about\s+)?(\d+(?:\.\d+)?)/) ?? t.match(/(\d+(?:\.\d+)?)\s+servings?\s+per\s+container/)
  if (per) out.servingsPerContainer = parseFloat(per[1])
  const kcal = t.match(/calories\s*:?\s*(\d+(?:\.\d+)?)/)
  if (kcal) out.calories = parseFloat(kcal[1])

  // "Includes 10g Added Sugars" puts the number before the name.
  const includes = t.match(/includes\s+(\d+(?:\.\d+)?)\s*g\s+added\s+sugars?/)
  if (includes) {
    out.nutrients.addedSugar = parseFloat(includes[1])
    out.matched.addedSugar = includes[0]
    t = t.replace(includes[0], ' ')
  }

  for (const [id, alias] of ALIASES) {
    if (out.nutrients[id] != null) continue
    const re = new RegExp(`(${alias.source})\\s*(?:\\([^)]*\\))?\\s*[:\\-]?\\s*(<|less than\\s*)?(\\d+(?:\\.\\d+)?)\\s*(mcg|ug|mg|g|iu|%)?(?:\\s*(?:dfe|rae|ne|mcg dfe|mcg rae))?(?:\\s*(\\d+(?:\\.\\d+)?)\\s*%)?`, 'g')
    for (const m of t.matchAll(re)) {
      const n = BY_ID.get(id)
      if (!n) break
      const value = parseFloat(m[3])
      const unit = m[4]
      let amount: number | null = null
      if (unit === '%') {
        // %DV only
        if (DAILY_VALUE[id] != null) amount = (value / 100) * DAILY_VALUE[id]
      } else if (unit && UNIT.test(unit)) {
        const label = unit === 'ug' ? 'mcg' : unit === 'iu' ? 'IU' : unit
        const factor = labelUnits(id, n.unit).find((u) => u.label === label)?.toAppUnit
        if (factor != null) amount = value * factor
      } else if (!unit && ['creatine'].includes(id)) {
        amount = value
      }
      if (amount == null) continue
      out.nutrients[id] = amount
      out.matched[id] = m[0].trim()
      // Consume the match so e.g. "Total Fat" can't also be read by a later, looser alias.
      t = t.replace(m[0], ' ')
      break
    }
  }
  return out
}
