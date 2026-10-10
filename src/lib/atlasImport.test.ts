import { describe, expect, test } from 'bun:test'
import { parseMealResponse } from './ai/parse'
import { importFromRoute, readImport } from './atlasImport'

// Shapes as MealVision sends them (see D:\Workspace\meal-vision static/app.js).
const meal = {
  items: [
    { name: 'Grilled Salmon Fillet', quantity: '180g', grams: 180, confidence: 'high', nutrients: { protein: 39.2, vitD: 19.8, retinol: 21, alcohol: 0 } },
    { name: 'Cooking oil', quantity: '10g', grams: 10, confidence: 'medium', nutrients: { fat: 10, satfat: 1.5 } },
  ],
  notes: 'Analyzed via MealVision engine.',
}

describe('imports from MealVision and other apps', () => {
  test('a meal goes to the AI estimate review; retinol and real zeros survive', () => {
    const r = readImport(JSON.stringify(meal))
    expect(r.kind).toBe('meal')
    const parsed = parseMealResponse(r.kind === 'meal' ? r.text : '')
    expect(parsed.errors).toEqual([])
    const salmon = parsed.estimate!.items[0]
    expect(salmon.nutrients.retinol).toBe(21) // vitamin A upper limit uses it
    expect(salmon.nutrients.alcohol).toBe(0) // 0 is data, not "missing"
    expect(parsed.warnings.join(' ')).not.toMatch(/unknown nutrient ids/i)
  })

  test('a recipe card goes to the recipe builder', () => {
    const r = readImport(JSON.stringify({ name: 'MealVision Dish', servings: 2, items: [{ name: 'Rice', serving: '150g', multiplier: 1, nutrients: { carbs: 42, bogus: 3 } }] }))
    expect(r).toMatchObject({ kind: 'recipe', name: 'MealVision Dish', servings: 2, items: [{ name: 'Rice', serving: '150g', multiplier: 1, nutrients: { carbs: 42 } }] })
    expect(r.kind === 'recipe' && r.warnings[0]).toMatch(/bogus/)
  })

  test('a single food card goes to the food editor', () => {
    const r = readImport(JSON.stringify({ name: 'Custom Meal Plate', serving: '1 plate (350g)', grams: 350, nutrients: { protein: 40, iron: 3 }, source: 'custom' }))
    expect(r).toMatchObject({ kind: 'food', name: 'Custom Meal Plate', serving: '1 plate (350g)', grams: 350, nutrients: { protein: 40, iron: 3 } })
  })

  test('anything else lands in the review, which explains the problem', () => {
    expect(readImport('not json').kind).toBe('meal')
  })

  test('the import link', () => {
    const payload = JSON.stringify(meal)
    expect(importFromRoute(`log?import=${encodeURIComponent(payload)}`)).toBe(payload)
    expect(importFromRoute('log')).toBeNull()
    expect(importFromRoute('settings')).toBeNull()
    expect(importFromRoute(`log?import=${'x'.repeat(200_001)}`)).toBeNull()
  })
})
