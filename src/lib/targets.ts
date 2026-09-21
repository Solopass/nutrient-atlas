import { NUTRIENTS } from '../data/nutrients'
import type { Nutrient, TargetKind } from '../types'
import { GOALS, energyTarget, proteinPerKg, type Profile } from './profile'

/**
 * Personal daily targets from the Dietary Reference Intakes (National
 * Academies), by age, sex and life stage. Supports ages 14+; younger ages are
 * clamped to 14. Amino acids use adult RDA mg/kg/day for everyone.
 */

interface Override {
  target?: number | null
  kind?: TargetKind
  ul?: number
}

// Adult RDA, mg per kg body weight per day
const AMINO_PER_KG: Record<string, number> = { leu: 42, ile: 19, val: 24, lys: 38, met: 19, trp: 5, thr: 20, phe: 33, his: 14 }

export function driOverrides(p: Profile): Record<string, Override> {
  const age = Math.max(14, p.age)
  const m = p.sex === 'male'
  const teen = age < 19
  const over50 = age >= 51
  const over70 = age >= 71
  const preg = !m && p.lifeStage === 'pregnant'
  const lact = !m && p.lifeStage === 'lactating'
  /** value by sex, with optional pregnancy / lactation values */
  const s = (male: number, female: number, pregnant?: number, lactating?: number) =>
    m ? male : preg && pregnant != null ? pregnant : lact && lactating != null ? lactating : female

  const energy = energyTarget(p).target
  const o: Record<string, Override> = {
    // Macros
    protein: { target: Math.round(proteinPerKg(p) * p.weightKg), kind: p.goal === 'health' ? 'RDA' : 'Goal' },
    carbs: { target: s(130, 130, 175, 210), kind: 'RDA' },
    fat: { target: Math.round((energy * 0.3) / 9), kind: 'AMDR' },
    fiber: { target: teen ? s(38, 26, 28, 29) : over50 ? s(30, 21) : s(38, 25, 28, 29), kind: 'AI' },

    // Vitamins
    vitA: { target: teen ? s(900, 700, 750, 1200) : s(900, 700, 770, 1300), ul: teen ? 2800 : 3000 },
    vitC: { target: teen ? s(75, 65, 80, 115) : s(90, 75, 85, 120), ul: teen ? 1800 : 2000 },
    vitD: { target: over70 ? 20 : 15, ul: 100 },
    vitE: { target: s(15, 15, 15, 19), ul: teen ? 800 : 1000 },
    vitK: { target: teen ? 75 : s(120, 90), kind: 'AI' },

    // Minerals
    calcium: { target: teen ? 1300 : over70 ? 1200 : over50 ? s(1000, 1200) : 1000, ul: teen ? 3000 : over50 ? 2000 : 2500 },
    magnesium: { target: teen ? s(410, 360, 400, 360) : age <= 30 ? s(400, 310, 350, 310) : s(420, 320, 360, 320) },
    potassium: { target: teen ? s(3000, 2300, 2600, 2500) : s(3400, 2600, 2900, 2800), kind: 'AI' },
    iron: { target: teen ? s(11, 15, 27, 10) : over50 ? 8 : s(8, 18, 27, 9), ul: 45 },
    zinc: { target: teen ? s(11, 9, 12, 13) : s(11, 8, 11, 12), ul: teen ? 34 : 40 },

    // B vitamins
    b1: { target: teen ? s(1.2, 1.0, 1.4, 1.4) : s(1.2, 1.1, 1.4, 1.4) },
    b2: { target: teen ? s(1.3, 1.0, 1.4, 1.6) : s(1.3, 1.1, 1.4, 1.6) },
    b3: { target: s(16, 14, 18, 17), ul: teen ? 30 : 35 },
    b5: { target: s(5, 5, 6, 7), kind: 'AI' },
    b6: { target: teen ? s(1.3, 1.2, 1.9, 2.0) : over50 ? s(1.7, 1.5) : s(1.3, 1.3, 1.9, 2.0), ul: teen ? 80 : 100 },
    b7: { target: teen ? s(25, 25, 30, 35) : s(30, 30, 30, 35), kind: 'AI' },
    b9: { target: s(400, 400, 600, 500), ul: teen ? 800 : 1000 },
    b12: { target: s(2.4, 2.4, 2.6, 2.8) },

    // Trace minerals
    copper: { target: teen ? s(890, 890, 1000, 1300) : s(900, 900, 1000, 1300), ul: teen ? 8000 : 10000 },
    manganese: { target: teen ? s(2.2, 1.6, 2.0, 2.6) : s(2.3, 1.8, 2.0, 2.6), kind: 'AI', ul: teen ? 9 : 11 },
    selenium: { target: s(55, 55, 60, 70), ul: 400 },
    chromium: { target: teen ? s(35, 24, 29, 44) : over50 ? s(30, 20) : s(35, 25, 30, 45), kind: 'AI' },
    molybdenum: { target: teen ? s(43, 43, 50, 50) : s(45, 45, 50, 50), ul: teen ? 1700 : 2000 },
    iodine: { target: s(150, 150, 220, 290), ul: teen ? 900 : 1100 },
    phosphorus: { target: teen ? 1250 : 700, ul: over70 ? 3000 : preg ? 3500 : 4000 },

    // Fatty acids
    ala: { target: teen ? s(1.6, 1.1, 1.4, 1.3) : s(1.6, 1.1, 1.4, 1.3), kind: 'AI' },
    la: { target: teen ? s(16, 11, 13, 13) : over50 ? s(14, 11) : s(17, 12, 13, 13), kind: 'AI' },

    // Advanced
    choline: { target: teen ? s(550, 400, 450, 550) : s(550, 425, 450, 550), kind: 'AI', ul: teen ? 3000 : 3500 },
  }
  for (const [id, perKg] of Object.entries(AMINO_PER_KG)) o[id] = { target: Math.round(perKg * p.weightKg), kind: 'RDA' }

  // Limits: Dietary Guidelines for Americans (sodium CDRR, <10% kcal sat fat / added sugar),
  // WHO (<1% kcal trans fat), FDA (caffeine), DGA (alcohol).
  const Limit = 'Limit' as const
  o.sodium = { target: 2300, kind: Limit }
  o.satfat = { target: Math.round((energy * 0.1) / 9), kind: Limit }
  o.transfat = { target: Math.round(((energy * 0.01) / 9) * 10) / 10, kind: Limit }
  o.addedSugar = { target: Math.round((energy * 0.1) / 4), kind: Limit }
  o.cholesterol = { target: 300, kind: Limit }
  o.caffeine = { target: preg || lact ? 200 : age < 18 ? 100 : 400, kind: Limit }
  o.alcohol = { target: preg || age < 21 ? 0 : m ? 28 : 14, kind: Limit }
  return o
}

/** Nutrient definitions with this profile's targets and upper limits applied. */
export function personalize(p: Profile): Nutrient[] {
  const o = driOverrides(p)
  return NUTRIENTS.map((n) => {
    const x = o[n.id]
    if (!x) return n
    return {
      ...n,
      target: x.target !== undefined ? x.target : n.target,
      targetKind: x.kind ?? n.targetKind,
      upperLimit: x.ul ?? n.upperLimit,
    }
  })
}

export function targetSummary(p: Profile) {
  const e = energyTarget(p)
  return { ...e, proteinPerKg: proteinPerKg(p), goal: GOALS[p.goal] }
}
