import { describe, expect, test } from 'bun:test'
import type { Food, MealItem } from '../db/db'
import type { UsdaFood } from '../data/usda'
import { foodIngredient, normalizeRecipe, perPortion, portionKcal, totalGrams, usdaIngredient } from './recipe'

const lentils = { fdcId: 1, name: 'Lentils, mature seeds, cooked, boiled', per100g: { protein: 9, iron: 3.3, folate: 181 }, portions: [{ label: '1 cup', grams: 198 }] } as unknown as UsdaFood
const stock: Food = { id: 7, name: 'Veg stock', serving: '1 cup (240 g)', nutrients: { sodium: 800 }, source: 'custom', favorite: 0, useCount: 0, createdAt: 0, lastUsedAt: 0 }

describe('recipe builder', () => {
  test('a USDA ingredient stores nutrients per portion and the amount as the multiplier', () => {
    const i = usdaIngredient(lentils, lentils.portions[0], 2)
    expect(i.serving).toBe('1 cup (198 g)')
    expect(i.multiplier).toBe(2)
    expect(i.nutrients.iron).toBeCloseTo(3.3 * 1.98)
    expect(usdaIngredient(lentils, { label: '100 g', grams: 100 }, 1).serving).toBe('100 g')
  })

  test('own foods keep their id so the recipe links back to them', () => {
    expect(foodIngredient(stock, 1.5)).toMatchObject({ foodId: 7, serving: '1 cup (240 g)', multiplier: 1.5 })
  })

  test('per portion = sum of ingredients ÷ portions', () => {
    const items = [usdaIngredient(lentils, lentils.portions[0], 2), foodIngredient(stock, 1)]
    const p = perPortion(items, 4)
    expect(p.sodium).toBe(200)
    expect(p.protein).toBeCloseTo((9 * 1.98 * 2) / 4)
    expect(portionKcal(items, 4)).toBe(Math.round(p.protein * 4))
  })

  test('total weight when every serving names its grams, otherwise unknown', () => {
    const items = [usdaIngredient(lentils, lentils.portions[0], 2), foodIngredient(stock, 1)]
    expect(totalGrams(items)).toBe(198 * 2 + 240)
    expect(totalGrams([...items, { name: 'Salt', serving: 'pinch', multiplier: 1, nutrients: {} } as MealItem])).toBeNull()
  })

  test('saving drops zero amounts and keeps at least one whole portion', () => {
    const r = normalizeRecipe('  Dal  ', [foodIngredient(stock, 0), foodIngredient(stock, 1)], 0)
    expect(r).toMatchObject({ name: 'Dal', servings: 1 })
    expect(r.items).toHaveLength(1)
    expect(normalizeRecipe('', [], 3.6)).toMatchObject({ name: 'Untitled recipe', servings: 4 })
  })
})
