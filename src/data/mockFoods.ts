import type { Diet } from '../lib/profile'

/**
 * A handful of foods with approximate per-serving nutrients, used only to
 * suggest the best next food until suggestions use the full USDA database (Milestone 5).
 */
export type FoodKind = 'plant' | 'dairy' | 'egg' | 'fish' | 'meat'

export const DIET_ALLOWS: Record<Diet, FoodKind[]> = {
  omnivore: ['plant', 'dairy', 'egg', 'fish', 'meat'],
  pescatarian: ['plant', 'dairy', 'egg', 'fish'],
  vegetarian: ['plant', 'dairy', 'egg'],
  vegan: ['plant'],
}

export interface MockFood {
  kind: FoodKind
  name: string
  serving: string
  nutrients: Record<string, number>
}

export const MOCK_FOODS: MockFood[] = [
  {
    name: 'Salmon',
    kind: 'fish',
    serving: '150 g',
    nutrients: { protein: 30, vitD: 14, b12: 4.2, selenium: 55, potassium: 540, epa: 800, dha: 1400, b6: 0.9, phosphorus: 380 },
  },
  {
    name: 'Spinach, cooked',
    kind: 'plant',
    serving: '1 cup',
    nutrients: { vitK: 888, vitA: 943, magnesium: 157, potassium: 839, iron: 6.4, calcium: 245, b9: 263, vitE: 3.7, fiber: 4.3 },
  },
  {
    name: 'Almonds',
    kind: 'plant',
    serving: '28 g',
    nutrients: { vitE: 7.3, magnesium: 76, fiber: 3.5, calcium: 76, b2: 0.3, protein: 6 },
  },
  {
    name: 'Pumpkin seeds',
    kind: 'plant',
    serving: '28 g',
    nutrients: { magnesium: 150, zinc: 2.2, iron: 2.5, phosphorus: 330, protein: 8.5, copper: 360 },
  },
  {
    name: 'Greek yogurt',
    kind: 'dairy',
    serving: '200 g',
    nutrients: { protein: 20, calcium: 220, iodine: 80, b12: 1.5, potassium: 280, b2: 0.5 },
  },
  {
    name: 'Sweet potato',
    kind: 'plant',
    serving: '1 medium',
    nutrients: { vitA: 1100, potassium: 540, fiber: 4, vitC: 22, manganese: 0.6 },
  },
  {
    name: 'Lentils',
    kind: 'plant',
    serving: '1 cup cooked',
    nutrients: { fiber: 15.6, b9: 358, iron: 6.6, potassium: 731, magnesium: 71, protein: 18 },
  },
  {
    name: 'Cod',
    kind: 'fish',
    serving: '150 g',
    nutrients: { iodine: 150, protein: 27, selenium: 50, b12: 1.4, phosphorus: 300 },
  },
  {
    name: 'Chia seeds',
    kind: 'plant',
    serving: '28 g',
    nutrients: { fiber: 9.8, ala: 5, calcium: 179, magnesium: 95 },
  },
]
