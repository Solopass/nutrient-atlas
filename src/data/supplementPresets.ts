import type { NewSupplement } from '../lib/supplements'
import type { Unit } from '../types'

/**
 * Starting points for common supplements. Amounts are typical label values per
 * dose in app units; users should edit them to match their own label.
 */
export interface SupplementPreset extends NewSupplement {
  key: string
  note?: string
}

const daily = { schedule: 'daily' as const, dosesPerDay: 1 }

export const SUPPLEMENT_PRESETS: SupplementPreset[] = [
  { key: 'd3', name: 'Vitamin D3', dose: '1 softgel (2,000 IU)', nutrients: { vitD: 50 }, ...daily },
  { key: 'multi', name: 'Multivitamin', dose: '1 tablet', ...daily, note: 'Typical adult formula. Multivitamins vary a lot, so match your label.', nutrients: { vitA: 750, vitC: 90, vitD: 25, vitE: 15, vitK: 80, b1: 1.2, b2: 1.3, b3: 16, b5: 5, b6: 1.7, b7: 30, b9: 665, b12: 6, calcium: 200, magnesium: 50, zinc: 11, selenium: 55, copper: 900, manganese: 2.3, chromium: 35, molybdenum: 45, iodine: 150, iron: 8 } },
  { key: 'fishoil', name: 'Fish oil', dose: '1 softgel', nutrients: { epa: 180, dha: 120 }, ...daily },
  { key: 'algae', name: 'Algae omega-3', dose: '1 softgel', nutrients: { dha: 200, epa: 100 }, ...daily, note: 'Vegan source of EPA/DHA.' },
  { key: 'mg', name: 'Magnesium glycinate', dose: '2 capsules', nutrients: { magnesium: 200 }, ...daily },
  { key: 'zinc', name: 'Zinc', dose: '1 tablet', nutrients: { zinc: 15 }, ...daily },
  { key: 'b12', name: 'Vitamin B12', dose: '1 tablet', nutrients: { b12: 1000 }, ...daily },
  { key: 'iron', name: 'Iron', dose: '1 tablet', nutrients: { iron: 18 }, ...daily },
  { key: 'cald', name: 'Calcium + D', dose: '1 tablet', nutrients: { calcium: 600, vitD: 20 }, ...daily },
  { key: 'c', name: 'Vitamin C', dose: '1 tablet', nutrients: { vitC: 500 }, ...daily },
  { key: 'iodine', name: 'Iodine (kelp)', dose: '1 tablet', nutrients: { iodine: 150 }, ...daily },
  { key: 'creatine', name: 'Creatine monohydrate', dose: '1 scoop (5 g)', nutrients: { creatine: 5 }, ...daily },
  { key: 'prenatal', name: 'Prenatal vitamin', dose: '1 tablet', ...daily, note: 'Typical prenatal. Match your label.', nutrients: { b9: 1000, iron: 27, iodine: 150, vitD: 25, b12: 8, choline: 55, dha: 200, b6: 2, vitC: 85, zinc: 11 } },
]

/** Units a label might use for a nutrient, with the factor into the app's unit. */
export interface LabelUnit {
  label: string
  toAppUnit: number
}

const MASS: Record<Unit, number> = { g: 1, mg: 1e-3, mcg: 1e-6 }

// International Units: vitamin D 1 IU = 0.025 mcg; vitamin A (retinol) 1 IU = 0.3 mcg RAE;
// vitamin E (natural d-alpha-tocopherol) 1 IU = 0.67 mg.
const IU: Record<string, number> = { vitD: 0.025, vitA: 0.3, vitE: 0.67 }

export function labelUnits(nutrientId: string, appUnit: Unit): LabelUnit[] {
  const units: LabelUnit[] = (['mcg', 'mg', 'g'] as Unit[]).map((u) => ({ label: u, toAppUnit: MASS[u] / MASS[appUnit] }))
  // Show the app's own unit first.
  units.sort((a, b) => (a.label === appUnit ? -1 : b.label === appUnit ? 1 : 0))
  if (IU[nutrientId]) units.push({ label: 'IU', toAppUnit: IU[nutrientId] })
  return units
}
