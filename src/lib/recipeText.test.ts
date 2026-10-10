import { beforeAll, describe, expect, test } from 'bun:test'
import { searchUsda, type UsdaDb } from '../data/usda'
import { usdaDb } from '../test/usdaFixture'
import { gramsFor, parseIngredientLine, parseRecipeText, pickIngredient, searchQueries } from './recipeText'

let db: UsdaDb
beforeAll(async () => {
  db = await usdaDb()
})

describe('reading ingredient lines', () => {
  test.each([
    ['2 cups cooked brown rice', 2, 'cup', 'cooked brown rice'],
    ['1 1/2 cups milk', 1.5, 'cup', 'milk whole'],
    ['1.5 cups milk', 1.5, 'cup', 'milk whole'],
    ['½ onion, diced', 0.5, null, 'onions raw'],
    ['1½ tbsp extra-virgin olive oil', 1.5, 'tbsp', 'olive oil'],
    ['2 Tbsp. honey', 2, 'tbsp', 'honey'],
    ['1 tsp ground cumin', 1, 'tsp', 'ground cumin'],
    ['200g chicken breast, cubed', 200, 'g', 'chicken breast'],
    ['1-2 tbsp lemon juice', 1.5, 'tbsp', 'lemon juice'],
    ['3 garlic cloves, minced', 3, 'clove', 'garlic raw'],
    ['2 large eggs', 2, 'large', 'egg whole raw'],
    ['1 (14 oz) can chickpeas, drained and rinsed', 14, 'oz', 'chickpeas canned'],
    ['- 1 cup all purpose flour', 1, 'cup', 'all-purpose flour'],
    ['1. 2 cups spinach', 2, 'cup', 'spinach'],
    ['8 oz mushrooms, sliced', 8, 'oz', 'mushrooms'],
  ])('%s', (raw, qty, unit, food) => {
    const l = parseIngredientLine(raw)
    expect(l.skip).toBeUndefined()
    expect(l.qty).toBeCloseTo(qty as number)
    expect(l.unit).toBe(unit as never)
    expect(l.food).toBe(food as string)
  })

  test('headings, "to taste" and water are skipped', () => {
    expect(parseIngredientLine('For the dressing:').skip).toBe('heading')
    expect(parseIngredientLine('Salt and pepper, to taste').skip).toBe('to taste')
    expect(parseIngredientLine('2 cups water').skip).toBe('water')
  })

  test('servings come from "Serves 4" and that line is not an ingredient', () => {
    const r = parseRecipeText('Lentil soup\nServes 4\n\n1 cup lentils\n2 carrots')
    expect(r.servings).toBe(4)
    expect(r.lines.map((l) => l.raw)).toEqual(['Lentil soup', '1 cup lentils', '2 carrots'])
  })
})

describe('choosing the USDA food', () => {
  const pick = (raw: string) => {
    const l = parseIngredientLine(raw)
    return pickIngredient(l, searchUsda(db, l.food, 15))[0]?.name ?? ''
  }
  test.each([
    ['2 tbsp olive oil', /^Oil, olive/],
    ['1 cup milk', /^Milk, whole/],
    ['1 cup flour', /^(Flour, wheat|Wheat flour, white), all-purpose/],
    ['1 can chickpeas', /^Chickpeas.*canned/],
    ['1 cup sugar', /^Sugars, granulated/],
    ['2 large eggs', /^Egg, whole, raw/],
    ['1 onion', /^Onions, raw/],
  ])('%s', (raw, re) => {
    expect(pick(raw)).toMatch(re)
  })
})

describe('amounts to grams with USDA portions', () => {
  const food = (name: RegExp) => db.foods.find((f) => name.test(f.name))!
  test('volume uses the food\'s own cup weight', () => {
    const rice = food(/^Rice, brown, long-grain, cooked$/)
    expect(gramsFor(rice, 2, 'cup').grams).toBeCloseTo(404, 0)
    expect(gramsFor(food(/^Oil, olive, salad or cooking$/), 1, 'tbsp').estimated).toBe(false)
  })
  test('counts use the matching portion (cloves, large, medium)', () => {
    expect(gramsFor(food(/^Garlic, raw$/), 3, 'clove').grams).toBe(9)
    expect(gramsFor(food(/^Egg, whole, raw, fresh$/), 2, 'large').grams).toBe(100)
    expect(gramsFor(food(/^Onions, raw$/), 1, null).grams).toBe(110) // medium
  })
  test('weights are exact; unknowns are flagged as estimates', () => {
    expect(gramsFor(food(/^Onions, raw$/), 8, 'oz').grams).toBeCloseTo(226.8)
    expect(gramsFor(food(/^Onions, raw$/), 1, 'pinch').estimated).toBe(true)
  })
})

describe('harder lines', () => {
  test('a title line with "(serves 4)" keeps its place; servings are still read', () => {
    const r = parseRecipeText('Lentil soup (serves 4)\n1 cup dried red lentils')
    expect(r.servings).toBe(4)
    expect(r.lines[0].raw).toBe('Lentil soup (serves 4)')
  })
  test('canned lines prefer canned USDA entries', () => {
    const l = parseIngredientLine('1 (14 oz) can diced tomatoes')
    expect(l.canned).toBe(true)
    expect(l.food).toBe('tomatoes canned')
    expect(pickIngredient(l, searchUsda(db, l.food, 15))[0].name).toMatch(/canned/i)
  })
  test('searches fall back by dropping leading words', () => {
    expect(searchQueries('dried red lentils')).toEqual(['dried red lentils', 'red lentils', 'lentils'])
    const found = searchQueries('dried red lentils').map((q) => searchUsda(db, q, 5)).find((r) => r.length)!
    expect(found[0].name).toMatch(/^Lentils/)
    expect(searchQueries('ground cumin').map((q) => searchUsda(db, q, 1)[0]?.name).find(Boolean)).toMatch(/cumin/i)
  })
})
