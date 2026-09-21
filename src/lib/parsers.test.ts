import { describe, expect, test } from 'bun:test'
import { parseMealResponse } from './ai/parse'
import { parseLabel } from './labelParse'

describe('AI reply parser', () => {
  const reply = (body: string) => `Sure! Here's the estimate:\n\`\`\`json\n${body}\n\`\`\`\nLet me know if you need anything else.`

  test('finds JSON inside code fences and prose, tolerating trailing commas', () => {
    const r = parseMealResponse(reply('{"items":[{"name":"Eggs","quantity":"2 large","grams":100,"confidence":"high","nutrients":{"protein":12.6,"vitD":2.2,}}],}'))
    expect(r.errors).toEqual([])
    expect(r.estimate!.items[0]).toMatchObject({ name: 'Eggs', grams: 100, confidence: 'high', nutrients: { protein: 12.6, vitD: 2.2 } })
  })

  test('maps ids case-insensitively and warns about unknown ones', () => {
    const r = parseMealResponse('{"items":[{"name":"x","nutrients":{"VITC":10,"protein":1,"fat":1,"carbs":1,"fiber":1,"vitamin_q":3}}]}')
    expect(r.estimate!.items[0].nutrients.vitC).toBe(10)
    expect(r.warnings.join(' ')).toContain('vitamin_q')
  })

  test('drops negative and non-numeric values', () => {
    const r = parseMealResponse('{"items":[{"name":"x","nutrients":{"iron":-1,"zinc":"abc","protein":"5"}}]}')
    const n = r.estimate!.items[0].nutrients
    expect(n.iron).toBeUndefined()
    expect(n.zinc).toBeUndefined()
    expect(n.protein).toBe(5)
  })

  test('flags likely unit mix-ups', () => {
    const r = parseMealResponse('{"items":[{"name":"x","nutrients":{"vitD":5000}}]}') // IU sent as mcg
    expect(r.warnings.some((w) => w.includes('Vitamin D'))).toBe(true)
  })

  test('clear errors for unusable replies', () => {
    expect(parseMealResponse('no json here').errors[0]).toMatch(/No JSON/)
    expect(parseMealResponse('{"items": []}').errors[0]).toMatch(/items/)
    expect(parseMealResponse('{broken').errors.length).toBe(1)
    expect(parseMealResponse('   ').errors).toEqual([])
  })
})

describe('label text reader', () => {
  test('modern Nutrition Facts', () => {
    const r = parseLabel(`Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Calories 230
Total Fat 8g 10%
  Saturated Fat 1g 5%
  Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
  Dietary Fiber 4g 14%
  Total Sugars 12g
    Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%
Calcium 260mg 20%
Iron 8mg 45%
Potassium 240mg 6%`)
    expect(r.servingLabel).toBe('2/3 cup (55g)')
    expect(r.grams).toBe(55)
    expect(r.calories).toBe(230)
    expect(r.servingsPerContainer).toBe(8)
    expect(r.nutrients).toEqual({
      addedSugar: 10, satfat: 1, transfat: 0, fat: 8, cholesterol: 0, sodium: 160, fiber: 4, carbs: 37, protein: 3, vitD: 2, calcium: 260, iron: 8, potassium: 240,
    })
  })

  test('older label on one line with %DV-only vitamins', () => {
    const r = parseLabel('Serving Size 1 bar (40g) Calories 190 Total Fat 7g Sat. Fat 3g Sodium 115mg Total Carb. 28g Protein 4g Vitamin C 10% Calcium 2% Iron 6%')
    expect(r.nutrients.fat).toBe(7)
    expect(r.nutrients.satfat).toBe(3)
    expect(r.nutrients.carbs).toBe(28)
    expect(r.nutrients.vitC).toBeCloseTo(9) // 10% of 90 mg
    expect(r.nutrients.calcium).toBeCloseTo(26) // 2% of 1300 mg
    expect(r.nutrients.iron).toBeCloseTo(1.08) // 6% of 18 mg
  })

  test('Supplement Facts with IU and thousands separators', () => {
    const r = parseLabel('Vitamin D3 (as cholecalciferol) 5,000 IU 625%\nVitamin K2 (as MK-7) 100 mcg\nMagnesium (as glycinate) 120 mg')
    expect(r.nutrients.vitD).toBe(125)
    expect(r.nutrients.vitK).toBe(100)
    expect(r.nutrients.magnesium).toBe(120)
  })

  test('"Calories from Fat" is not read as fat grams', () => {
    const r = parseLabel('Calories 250 Calories from Fat 110 Total Fat 12g')
    expect(r.nutrients.fat).toBe(12)
  })

  test('B12 is not mistaken for B1', () => {
    const r = parseLabel('Vitamin B12 6mcg Thiamin 1.2mg')
    expect(r.nutrients.b12).toBe(6)
    expect(r.nutrients.b1).toBe(1.2)
  })

  test('µg and micrograms are mcg', () => {
    expect(parseLabel('Folate 400 µg DFE').nutrients.b9).toBe(400)
    expect(parseLabel('Vitamin B12 2.4 micrograms').nutrients.b12).toBe(2.4)
  })

  test('empty text reads nothing', () => {
    expect(parseLabel('').nutrients).toEqual({})
  })
})
