import { describe, expect, test } from 'bun:test'
import { DEFAULT_PROFILE, energyTarget, proteinPerKg, type Profile } from './profile'
import { personalize, sunCoversVitaminD } from './targets'
import { dayScore, nutrientState } from './status'

const targets = (patch: Partial<Profile> = {}) => {
  const p = { ...DEFAULT_PROFILE, ...patch }
  return Object.fromEntries(personalize(p).map((n) => [n.id, n]))
}

describe('DRI targets', () => {
  test('adult male defaults', () => {
    const t = targets()
    expect(t.protein.target).toBe(60) // 0.8 g/kg × 75 kg
    expect(t.fiber.target).toBe(38)
    expect(t.iron.target).toBe(8)
    expect(t.magnesium.target).toBe(400) // 19–30
    expect(t.calcium.upperLimit).toBe(2500)
    expect(t.leu.target).toBe(42 * 75)
  })

  test('women 19–50 need more iron; 51+ drop to 8 mg and need more calcium', () => {
    expect(targets({ sex: 'female', age: 25 }).iron.target).toBe(18)
    const older = targets({ sex: 'female', age: 60 })
    expect(older.iron.target).toBe(8)
    expect(older.calcium.target).toBe(1200)
    expect(older.calcium.upperLimit).toBe(2000)
    expect(older.fiber.target).toBe(21)
  })

  test('pregnancy raises folate, iron, iodine, choline and protein', () => {
    const p: Partial<Profile> = { sex: 'female', age: 30, weightKg: 68, lifeStage: 'pregnant' }
    const t = targets(p)
    expect(t.b9.target).toBe(600)
    expect(t.iron.target).toBe(27)
    expect(t.iodine.target).toBe(220)
    expect(t.choline.target).toBe(450)
    expect(proteinPerKg({ ...DEFAULT_PROFILE, ...p })).toBe(1.1)
  })

  test('life stage is ignored for men', () => {
    expect(targets({ lifeStage: 'pregnant' }).iron.target).toBe(8)
  })

  test('teens and over-70s use their own groups', () => {
    const teen = targets({ age: 16 })
    expect(teen.calcium.target).toBe(1300)
    expect(teen.iron.target).toBe(11)
    expect(targets({ age: 75 }).vitD.target).toBe(20)
  })

  test('ages under 14 are clamped to the 14–18 group', () => {
    expect(targets({ age: 10 }).calcium.target).toBe(1300)
  })
})

describe('goals and energy', () => {
  test('goal protein replaces the RDA', () => {
    const t = targets({ goal: 'muscle' })
    expect(t.protein.target).toBe(120)
    expect(t.protein.targetKind).toBe('Goal')
  })

  test('overrides win', () => {
    const p = { ...DEFAULT_PROFILE, energyOverride: 2000, proteinPerKgOverride: 2 }
    expect(energyTarget(p).target).toBe(2000)
    expect(proteinPerKg(p)).toBe(2)
  })

  test('Mifflin–St Jeor for the default profile', () => {
    // 10×75 + 6.25×178 − 5×30 + 5 = 1717.5
    const e = energyTarget(DEFAULT_PROFILE)
    expect(e.bmr).toBe(1718)
    expect(e.calculated).toBe(Math.round((1717.5 * 1.55) / 10) * 10)
  })

  test('fat target is 30% of calories', () => {
    const e = energyTarget(DEFAULT_PROFILE).target
    expect(targets().fat.target).toBe(Math.round((e * 0.3) / 9))
  })
})

describe('limits', () => {
  test('sat fat and added sugar scale with calories', () => {
    const e = energyTarget(DEFAULT_PROFILE).target
    const t = targets()
    expect(t.satfat.target).toBe(Math.round((e * 0.1) / 9))
    expect(t.addedSugar.target).toBe(Math.round((e * 0.1) / 4))
    expect(t.sodium.target).toBe(2300)
  })

  test('alcohol: 28 g men, 14 g women, 0 pregnant or under 21', () => {
    expect(targets().alcohol.target).toBe(28)
    expect(targets({ sex: 'female' }).alcohol.target).toBe(14)
    expect(targets({ sex: 'female', lifeStage: 'pregnant' }).alcohol.target).toBe(0)
    expect(targets({ age: 20 }).alcohol.target).toBe(0)
  })

  test('caffeine: 400 adults, 200 pregnant, 100 under 18', () => {
    expect(targets().caffeine.target).toBe(400)
    expect(targets({ sex: 'female', lifeStage: 'pregnant' }).caffeine.target).toBe(200)
    expect(targets({ age: 16 }).caffeine.target).toBe(100)
  })
})

describe('vitamin D sun setting', () => {
  const vitD = (p: Partial<typeof DEFAULT_PROFILE>) => personalize({ ...DEFAULT_PROFILE, ...p }).find((n) => n.id === 'vitD')!
  test('off by default; on marks vitamin D sun-covered without changing the target', () => {
    expect(vitD({}).sunCovered).toBeUndefined()
    expect(vitD({ sunExposure: true })).toMatchObject({ sunCovered: true, target: vitD({}).target })
  })
  test('a low vitamin D blood test overrides it; a normal one keeps it', () => {
    expect(sunCoversVitaminD({ ...DEFAULT_PROFILE, sunExposure: true, labs: { vitD: { value: 15, unit: 'ng/mL', date: '2026-09-01' } } })).toBe(false)
    expect(sunCoversVitaminD({ ...DEFAULT_PROFILE, sunExposure: true, labs: { vitD: { value: 90, unit: 'nmol/L', date: '2026-09-01' } } })).toBe(true)
  })
  test('sun-covered vitamin D neither lowers the score nor counts in coverage', () => {
    const on = personalize({ ...DEFAULT_PROFILE, sunExposure: true })
    const off = personalize(DEFAULT_PROFILE)
    const full = (ns: typeof on) => ns.map((n) => nutrientState(n, n.target ? { amount: n.id === 'vitD' ? 0.1 : n.target, coverage: 1 } : undefined))
    expect(dayScore(full(on)).score).toBeGreaterThan(dayScore(full(off)).score)
    expect(dayScore(full(on)).tracked.total).toBe(dayScore(full(off)).tracked.total - 1)
  })
})
