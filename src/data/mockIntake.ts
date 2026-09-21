import type { Intake } from '../types'
import { NUTRIENTS } from './nutrients'

/**
 * A plausible "decent but imperfect" day, written as % of target so it's
 * easy to tweak. Replaced by real food-log totals in Milestone 3.
 */
const PCT: Record<string, number> = {
  protein: 104, carbs: 192, fat: 92, fiber: 58,
  vitA: 74, vitC: 132, vitD: 28, vitE: 46, vitK: 145,
  calcium: 67, magnesium: 61, potassium: 55, iron: 138,
  b1: 112, b2: 126, b3: 164, b5: 84, b6: 96, b9: 71, b12: 210,
  copper: 94, manganese: 150, selenium: 118, iodine: 38, phosphorus: 182,
  ala: 62, la: 108,
  sodium: 118, satfat: 92, transfat: 20, addedSugar: 64, cholesterol: 71, caffeine: 45, alcohol: 0,
  leu: 132, ile: 121, val: 118, lys: 97, met: 88, trp: 142, thr: 125, phe: 160, his: 131,
  choline: 64,
}

/** Absolute amounts: nutrients with no target, or deliberately over a limit. */
const ABSOLUTE: Record<string, number> = {
  zinc: 45, // 50 mg zinc supplement → over the 40 mg UL
  epa: 40,
  dha: 90,
  boron: 1.1,
  lutein: 1800,
  zeaxanthin: 250,
  coq10: 4,
  creatine: 0.9,
}

/** Share of logged foods that report the nutrient (default 1). 0 = no data. */
const COVERAGE: Record<string, number> = {
  b7: 0,
  chromium: 0,
  molybdenum: 0,
  sulfur: 0,
  selenium: 0.5,
  iodine: 0.4,
  lutein: 0.55,
}

export const MOCK_INTAKE: Record<string, Intake> = Object.fromEntries(
  NUTRIENTS.map((n) => {
    const coverage = COVERAGE[n.id] ?? 1
    const amount =
      ABSOLUTE[n.id] ?? (n.target != null && PCT[n.id] != null ? (n.target * PCT[n.id]) / 100 : 0)
    return [n.id, { amount: coverage === 0 ? 0 : amount, coverage }]
  }),
)
