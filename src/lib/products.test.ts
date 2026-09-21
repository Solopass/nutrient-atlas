import { describe, expect, test } from 'bun:test'
import type { Product } from '../db/db'
import { parseLabel } from './labelParse'
import { DEFAULT_PROFILE } from './profile'
import { formsFromMatched, rateForm } from './products/forms'
import { csvTemplate, parseProducts, parseProductsCsv, parseProductsJson, productsToJson, resolveNutrientKey } from './products/io'
import { gradeOf, scoreAll, scoreProduct, type ScoreContext } from './products/score'
import { cleanBarcode, fromOpenFoodFacts } from './products/openFoodFacts'
import { detectCertifications, normaliseCertifications } from './products/certifications'
import { nutrientState } from './status'
import { personalize } from './targets'

const nutrients = personalize(DEFAULT_PROFILE)
let id = 0
const product = (p: Partial<Product>): Product => ({
  id: ++id, kind: 'supplement', brand: 'B', name: `P${id}`, serving: '1 capsule', nutrients: {}, source: 'manual', createdAt: 0, updatedAt: 0, servingsPerDay: 1, ...p,
})
/** Food-only week at `pct`% of every target, with overrides (% of target). */
function ctx(pct = 100, overrides: Record<string, number> = {}): ScoreContext {
  const states = nutrients.map((n) => nutrientState(n, n.target ? { amount: (n.target * (overrides[n.id] ?? pct)) / 100, coverage: 1 } : undefined))
  return { nutrients, foodStates: states, allStates: states, currency: 'USD' }
}
const part = (s: ReturnType<typeof scoreProduct>, k: string) => s.parts.find((p) => p.key === k)!

describe('forms', () => {
  test('read from label lines and rated', () => {
    const label = parseLabel(`Magnesium (as magnesium oxide) 200 mg\nVitamin D3 (as cholecalciferol) 50 mcg (2,000 IU)\nZinc (as zinc picolinate) 15 mg`)
    const forms = formsFromMatched(label.matched)
    expect(forms).toEqual({ magnesium: 'magnesium oxide', vitD: 'cholecalciferol', zinc: 'zinc picolinate' })
    expect(rateForm('magnesium', forms.magnesium)?.quality).toBe('poor')
    expect(rateForm('vitD', forms.vitD)?.quality).toBe('good')
    expect(rateForm('b12', 'cyanocobalamin')?.quality).toBe('good') // equivalent forms aren't ranked against each other
    expect(rateForm('magnesium', 'magic blend')).toBeNull()
  })
})

describe('scoring', () => {
  test('a supplement that fills your food gap beats one for something you already get', () => {
    const c = ctx(100, { vitD: 20 })
    const d = scoreProduct(product({ nutrients: { vitD: 50 } }), c)
    const c2 = scoreProduct(product({ nutrients: { vitC: 500 } }), c)
    expect(d.closes).toEqual(['vitD'])
    expect(part(d, 'gaps').score!).toBeGreaterThan(part(c2, 'gaps').score!)
  })

  test('over an upper limit on its own caps the score and flags it', () => {
    const s = scoreProduct(product({ nutrients: { vitD: 250 } }), ctx(50))
    expect(s.flags.some((f) => f.level === 'bad' && /upper limit/.test(f.text))).toBe(true)
    expect(s.overall!).toBeLessThanOrEqual(40)
  })

  test('servings per day scale the dose', () => {
    const s = scoreProduct(product({ nutrients: { magnesium: 100 }, servingsPerDay: 2 }), ctx())
    expect(s.amounts.magnesium).toBe(200)
  })

  test('poor forms lower the form score and add a warning', () => {
    const good = scoreProduct(product({ nutrients: { magnesium: 200 }, forms: { magnesium: 'magnesium glycinate' } }), ctx())
    const poor = scoreProduct(product({ nutrients: { magnesium: 200 }, forms: { magnesium: 'magnesium oxide' } }), ctx())
    expect(part(good, 'form').score).toBe(100)
    expect(part(poor, 'form').score!).toBeLessThan(50)
    expect(poor.flags.some((f) => f.level === 'warn')).toBe(true)
  })

  test('missing parts are left out, not scored as zero', () => {
    const s = scoreProduct(product({ nutrients: { vitD: 25 } }), { nutrients, foodStates: null, allStates: null })
    expect(part(s, 'gaps').score).toBeNull()
    expect(s.overall).toBe(part(s, 'dose').score) // only dose is known
  })

  test('food density: spinach-like beats candy-like; limits are flagged', () => {
    const veg = scoreProduct(product({ kind: 'food', kcal: 25, nutrients: { protein: 3, fiber: 2.5, vitA: 470, vitC: 28, iron: 2.7, magnesium: 79, potassium: 558, calcium: 99 } }), ctx())
    const candy = scoreProduct(product({ kind: 'food', kcal: 250, nutrients: { protein: 2, satfat: 8, addedSugar: 30, sodium: 100 } }), ctx())
    expect(part(veg, 'density').score!).toBeGreaterThan(90)
    expect(part(candy, 'density').score).toBe(0)
    expect(candy.flags.some((f) => /added sugar/i.test(f.text))).toBe(true)
  })

  test('value is relative to the cheapest per useful dose', () => {
    const cheap = product({ nutrients: { vitD: 25 }, price: 6, servingsPerContainer: 120 })
    const pricey = product({ nutrients: { vitD: 25 }, price: 24, servingsPerContainer: 60 })
    const s = scoreAll([cheap, pricey], ctx(50))
    expect(part(s.get(cheap.id)!, 'value').score).toBe(100)
    expect(part(s.get(pricey.id)!, 'value').score).toBe(35) // sqrt(0.05 / 0.40)
    expect(s.get(cheap.id)!.costPerDay).toBeCloseTo(0.05)
  })

  test('value compares products that provide the same nutrients, not a multi against a single', () => {
    const multi = product({ nutrients: { vitA: 900, vitC: 90, zinc: 11, b12: 6, selenium: 55 }, price: 9, servingsPerContainer: 90 })
    const mg1 = product({ nutrients: { magnesium: 200 }, price: 18, servingsPerContainer: 60 })
    const mg2 = product({ nutrients: { magnesium: 200 }, price: 9, servingsPerContainer: 60 })
    const s = scoreAll([multi, mg1, mg2], ctx(50))
    expect(part(s.get(multi.id)!, 'value').score).toBeNull() // nothing else provides its nutrients
    expect(part(s.get(mg2.id)!, 'value').score).toBe(100)
    expect(part(s.get(mg1.id)!, 'value').score).toBe(71) // sqrt(1/2), vs the other magnesium only
  })
})

describe('import / export', () => {
  test('nutrient keys: ids, names and label units', () => {
    expect(resolveNutrientKey('vitD')).toEqual({ id: 'vitD', factor: 1 })
    expect(resolveNutrientKey('Vitamin D (IU)')!.id).toBe('vitD')
    expect(resolveNutrientKey('Vitamin D (IU)')!.factor).toBeCloseTo(0.025)
    expect(resolveNutrientKey('Magnesium (mg)')).toEqual({ id: 'magnesium', factor: 1 })
    expect(resolveNutrientKey('Price')).toBeNull()
  })

  test('AI reply with prose, code fence and trailing commas', () => {
    const r = parseProductsJson('Here you go:\n```json\n{"products":[{"brand":"X","name":"D3 2000","serving":"1 softgel","nutrients":{"vitD":50,"unobtainium":3,},"forms":{"vitD":"cholecalciferol"},"price":"$9.99","servingsPerContainer":120}]}\n```')
    expect(r.errors).toEqual([])
    expect(r.products[0]).toMatchObject({ kind: 'supplement', brand: 'X', price: 9.99, servingsPerDay: 1, forms: { vitD: 'cholecalciferol' } })
    expect(r.warnings[0]).toMatch(/unobtainium/)
  })

  test('the CSV template round-trips', () => {
    const r = parseProductsCsv(csvTemplate())
    expect(r.errors).toEqual([])
    expect(r.products.map((p) => p.kind)).toEqual(['supplement', 'food'])
    expect(r.products[0]).toMatchObject({ nutrients: { magnesium: 200 }, forms: { magnesium: 'magnesium glycinate' }, tags: ['magnesium', 'sleep'], price: 19.99 })
    expect(r.products[1]).toMatchObject({ kcal: 190, nutrients: { protein: 6, fiber: 9, sodium: 140, addedSugar: 8, iron: 2 } })
  })

  test('export → import keeps everything but ids', () => {
    const p = product({ brand: 'A, Inc.', name: 'Omega "3"', nutrients: { epa: 500, dha: 250 }, rating: 4, tags: ['fish oil'] })
    const back = parseProducts(productsToJson([p])).products[0]
    const { id: _i, createdAt: _c, updatedAt: _u, source: _s, ...rest } = p
    expect(back).toMatchObject(rest)
  })

  test('rows without a name or nutrients are reported, the rest imported', () => {
    const r = parseProductsCsv('name,Vitamin C (mg)\nGood C,500\n,100\nEmpty,\n')
    expect(r.products.map((p) => p.name)).toEqual(['Good C'])
    expect(r.errors.length).toBe(2)
  })
})

test('the grade matches the rounded score shown', () => {
  // 34.6 displays as 35, which is a D, not an E
  const s = scoreProduct(product({ nutrients: { vitD: 3.7 } }), { nutrients, foodStates: null, allStates: null })
  expect(s.overall).toBe(Math.round(s.overall!))
  expect(gradeOf(Math.round(34.6))).toBe('D')
})

describe('barcode lookup (Open Food Facts)', () => {
  test('per-100 g product maps units (sodium g → mg) and ignores non-nutrient _serving fields', async () => {
    const raw = await Bun.file(new URL('../test/fixtures/off-nutella.json', import.meta.url)).json()
    const p = fromOpenFoodFacts(raw, '3017620422003')!
    expect(p).toMatchObject({ kind: 'food', brand: 'Nutella', serving: '100 g', per100g: true, kcal: 539, barcode: '3017620422003' })
    expect(p.nutrients).toMatchObject({ protein: 6.3, satfat: 10.6, addedSugar: 52.13, sodium: 42.8 })
  })
  test('per-serving values win; supplements, vitamins in g and seals are read', () => {
    const p = fromOpenFoodFacts(
      {
        product: {
          product_name: 'Vitamin D3', brands: 'Acme, Acme Labs', serving_size: '1 softgel', serving_quantity: 0.5,
          categories_tags: ['en:dietary-supplements'], labels: 'USP Verified',
          nutriments: { 'vitamin-d_serving': 0.00005, 'vitamin-d_100g': 0.01, 'nova-group_serving': 4 },
        },
      },
      '0123456789012',
    )!
    expect(p).toMatchObject({ kind: 'supplement', brand: 'Acme', serving: '1 softgel', per100g: false, certifications: ['USP Verified'] })
    expect(p.nutrients.vitD).toBeCloseTo(50)
  })
  test('not found / no nutrients → null; barcode cleaning', () => {
    expect(fromOpenFoodFacts({ status: 0 }, '1')).toBeNull()
    expect(fromOpenFoodFacts({ product: { product_name: 'x', nutriments: {} } }, '1')).toBeNull()
    expect(cleanBarcode(' 0 16000 27528 7 ')).toBe('016000275287')
    expect(cleanBarcode('12345')).toBeNull()
  })
})

describe('certifications', () => {
  test('detected from label text; sport beats plain NSF; free text normalised', () => {
    expect(detectCertifications('Look for the NSF Certified for Sport mark')).toEqual(['NSF Certified for Sport'])
    expect(detectCertifications('USP verified. IFOS 5-star.')).toEqual(['USP Verified', 'IFOS'])
    expect(normaliseCertifications(['usp', 'informed sport', 'My Lab'])).toEqual(['USP Verified', 'Informed Sport', 'My Lab'])
  })
  test('a seal adds a Tested part; none is not a penalty', () => {
    const base = { nutrients: { vitD: 25 }, servingsPerDay: 1 }
    const tested = scoreProduct(product({ ...base, certifications: ['USP Verified'] }), ctx(50))
    const plain = scoreProduct(product(base), ctx(50))
    expect(part(tested, 'tested').score).toBe(100)
    expect(part(plain, 'tested').score).toBeNull()
    expect(tested.overall!).toBeGreaterThanOrEqual(plain.overall!)
  })
})
