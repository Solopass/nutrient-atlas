export type Category =
  | 'macro'
  | 'vitamin'
  | 'mineral'
  | 'bvitamin'
  | 'trace'
  | 'fatty'
  | 'amino'
  | 'advanced'
  | 'limit'

export type Unit = 'g' | 'mg' | 'mcg'

export type TargetKind = 'RDA' | 'AI' | 'DV' | 'AMDR' | 'Goal' | 'Limit'

export interface Nutrient {
  id: string
  name: string
  /** Used where space is tight (core ring labels). */
  shortName?: string
  symbol: string
  unit: Unit
  category: Category
  /** Daily target for the active profile; null when no official target exists. */
  target: number | null
  targetKind?: TargetKind
  /** Tolerable Upper Intake Level, same unit as target. */
  upperLimit?: number
  ulNote?: string
  /** The UL covers supplement intake only (magnesium, niacin, folic acid, vitamin E). */
  ulAppliesTo?: 'supplements'
  /** Converts supplement amounts into the UL's basis (folate: mcg DFE → mcg folic acid). */
  ulSupplementScale?: number
  why: string
  lowSigns: string
  sources: string[]
}

export interface Intake {
  amount: number
  /** Share (0–1) of logged foods that report a value for this nutrient. */
  coverage: number
  /** Portion of `amount` that came from supplements. */
  supplement?: number
  /** Amount that counts toward the upper limit, when the UL covers only one form (vitamin A: retinol). */
  ulAmount?: number
}

export type Status =
  | 'deficient'
  | 'attention'
  | 'good'
  | 'above'
  | 'overLimit'
  | 'noData'
  | 'noTarget'

export interface NutrientState {
  nutrient: Nutrient
  intake: Intake | undefined
  status: Status
  /** Percent of target; null when there is no target or no data. */
  pct: number | null
  partial: boolean
}
