import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { db, FDC_KEY_SETTING, type Food } from '../db/db'
import fdc from '../test/fixtures/fdc-cheerios.json'
import {
  barcodeVariants,
  checkDigitOk,
  findSavedBarcode,
  fromFdcBranded,
  lookupBarcodeOnline,
  mergeBarcodeFoods,
  parseBarcodeQuery,
  sameBarcode,
  tidyName,
  type FdcFood,
} from './barcode'
import type { OffProduct } from './products/openFoodFacts'

const CHEERIOS = '016000348516'
const cheerios = fdc.foods[0] as FdcFood

describe('barcode numbers', () => {
  test('the search box recognises barcodes, with spaces or dashes', () => {
    expect(parseBarcodeQuery('0 16000 34851 6')).toBe(CHEERIOS)
    expect(parseBarcodeQuery('5000159407236')).toBe('5000159407236')
    expect(parseBarcodeQuery('banana')).toBeNull()
    expect(parseBarcodeQuery('12345')).toBeNull() // too short
    expect(parseBarcodeQuery('100 g oats')).toBeNull()
  })

  test('check digit', () => {
    expect(checkDigitOk(CHEERIOS)).toBe(true)
    expect(checkDigitOk('016000348517')).toBe(false)
    expect(checkDigitOk('5000159407236')).toBe(true) // EAN-13
    expect(checkDigitOk('96385074')).toBe(true) // EAN-8
  })

  test('the same product in 12, 13 and 14 digits', () => {
    expect(sameBarcode(CHEERIOS, '0016000348516')).toBe(true)
    expect(sameBarcode(CHEERIOS, '00016000348516')).toBe(true)
    expect(sameBarcode(CHEERIOS, '016000348517')).toBe(false)
    expect(barcodeVariants(CHEERIOS)).toEqual(['00016000348516', '0016000348516', CHEERIOS])
    expect(barcodeVariants('5000159407236')).toEqual(['05000159407236', '5000159407236'])
  })
})

describe('USDA Branded Foods', () => {
  test('per-100 g values become per serving, in app units', () => {
    const f = fromFdcBranded(cheerios, CHEERIOS)!
    expect(f.name).toBe('Cheerios, Oat Cereal')
    expect(f.brand).toBe('General Mills')
    expect(f.serving).toBe('1 cup (28 g)')
    expect(f.grams).toBe(28)
    expect(f.nutrients.iron).toBeCloseTo(28.9 * 0.28, 2)
    expect(f.nutrients.fiber).toBeCloseTo(3, 1)
    expect(f.nutrients.vitD).toBeCloseTo((143 / 40) * 0.28, 2) // IU → mcg
    expect(f.kcal).toBe(100)
  })

  test('vitamin A in IU is unknown, not guessed', () => {
    expect(fromFdcBranded(cheerios, CHEERIOS)!.nutrients.vitA).toBeUndefined()
  })

  test('no serving size → values per 100 g', () => {
    const f = fromFdcBranded({ ...cheerios, servingSize: undefined }, CHEERIOS)!
    expect(f.serving).toBe('100 g')
    expect(f.nutrients.iron).toBeCloseTo(28.9)
  })

  test('names: all caps tidied, brand prefix dropped, mixed case kept', () => {
    expect(tidyName('KIRKLAND SIGNATURE, ORGANIC PEANUT BUTTER', 'KIRKLAND SIGNATURE')).toBe('Organic Peanut Butter')
    expect(tidyName('Greek Yogurt, Plain', 'Fage')).toBe('Greek Yogurt, Plain')
  })
})

describe('combining sources', () => {
  const off = (over: Partial<OffProduct> = {}): OffProduct => ({ kind: 'food', brand: 'General Mills', name: 'Cheerios', serving: '28 g', grams: 28, nutrients: { iron: 1, b9: 56, vitA: 140 }, barcode: CHEERIOS, per100g: false, ...over })

  test('USDA wins; Open Food Facts fills what USDA lacks, scaled to USDA’s serving', () => {
    const m = mergeBarcodeFoods(fromFdcBranded(cheerios, CHEERIOS), off({ serving: '39 g', grams: 39, nutrients: { iron: 99, b9: 78, vitA: 195 } }))!
    expect(m.sources).toEqual(['usda', 'off'])
    expect(m.filled.sort()).toEqual(['b9', 'vitA'])
    expect(m.nutrients.iron).toBeCloseTo(8.09, 1) // USDA's, not 99
    expect(m.nutrients.b9).toBeCloseTo(56, 0) // 78 per 39 g → per 28 g
  })

  test('either source alone', () => {
    expect(mergeBarcodeFoods(null, off())!.sources).toEqual(['off'])
    expect(mergeBarcodeFoods(fromFdcBranded(cheerios, CHEERIOS), null)!.sources).toEqual(['usda'])
    expect(mergeBarcodeFoods(null, null)).toBeNull()
  })
})

describe('lookups', () => {
  const realFetch = globalThis.fetch
  let calls: string[] = []
  const respond = (handler: (url: string) => Response) => {
    calls = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      return handler(url)
    }) as typeof fetch
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  beforeEach(async () => {
    await Promise.all([db.foods.clear(), db.products.clear(), db.settings.delete(FDC_KEY_SETTING)])
  })

  test('one USDA request covers every length of the number; only the number is sent', async () => {
    respond((url) => (url.includes('nal.usda.gov') ? json(fdc) : json({ status: 0 }, 404)))
    const r = await lookupBarcodeOnline(CHEERIOS, { key: 'DEMO_KEY' })
    expect(r.food?.name).toBe('Cheerios, Oat Cereal')
    expect(r.notes).toEqual([])
    const usda = calls.find((u) => u.includes('nal.usda.gov'))!
    expect(decodeURIComponent(usda)).toContain('query=00016000348516 OR 0016000348516 OR 016000348516')
    expect(calls).toHaveLength(2)
  })

  test("USDA's demo limit doesn't stop Open Food Facts, and says how to fix it", async () => {
    respond((url) =>
      url.includes('nal.usda.gov')
        ? json({ error: { code: 'OVER_RATE_LIMIT' } }, 429)
        : json({ status: 1, product: { product_name: 'Cheerios', brands: 'General Mills', serving_quantity: 28, serving_size: '1 cup (28 g)', nutriments: { iron_serving: 0.0081, proteins_serving: 3 } } }),
    )
    const r = await lookupBarcodeOnline(CHEERIOS, { key: 'DEMO_KEY' })
    expect(r.food?.sources).toEqual(['off'])
    expect(r.food?.nutrients.iron).toBeCloseTo(8.1)
    expect(r.notes[0]).toMatch(/demo key.*Settings/)
  })

  test('USDA records for other barcodes are ignored', async () => {
    respond((url) => (url.includes('nal.usda.gov') ? json({ foods: [{ ...cheerios, gtinUpc: '016000999999' }] }) : json({}, 404)))
    expect((await lookupBarcodeOnline(CHEERIOS, { key: 'k' })).food).toBeNull()
  })

  test('your own key is used when set', async () => {
    await db.settings.put({ key: FDC_KEY_SETTING, value: ' my-key ' })
    respond(() => json({}, 404))
    await lookupBarcodeOnline(CHEERIOS)
    expect(calls.find((u) => u.includes('nal.usda.gov'))).toContain('api_key=my-key&')
  })

  test('saved foods and rated products are found in any barcode length', async () => {
    await db.foods.add({ name: 'Cheerios', serving: '1 cup', nutrients: {}, source: 'barcode', barcode: '0016000348516', favorite: 0, useCount: 1, createdAt: 0, lastUsedAt: 0 } as unknown as Food)
    const hit = await findSavedBarcode(CHEERIOS)
    expect(hit && 'food' in hit && hit.food.name).toBe('Cheerios')
    await db.foods.clear()
    await db.products.add({ kind: 'food', brand: 'GM', name: 'Cheerios', serving: '1 cup', nutrients: {}, barcode: CHEERIOS, source: 'manual', createdAt: 0, updatedAt: 0 } as never)
    expect(await findSavedBarcode('00016000348516')).toMatchObject({ product: { name: 'Cheerios' } })
    expect(await findSavedBarcode('5000159407236')).toBeNull()
  })

  test('the API key stays out of backup files and survives a restore', async () => {
    const { makeBackup, restoreBackup } = await import('./backup')
    await db.settings.put({ key: FDC_KEY_SETTING, value: 'my-key' })
    const snap = await makeBackup()
    expect(snap.settings.some((s) => s.key === FDC_KEY_SETTING)).toBe(false)
    await restoreBackup({ ...snap, settings: [...snap.settings, { key: FDC_KEY_SETTING, value: 'from-file' }] })
    expect((await db.settings.get(FDC_KEY_SETTING))?.value).toBe('my-key')
  })
})
