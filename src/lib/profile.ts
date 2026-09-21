import type { LabId, LabResult } from './labs'

export type Sex = 'male' | 'female'
export type LifeStage = 'none' | 'pregnant' | 'lactating'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete'
export type Goal = 'health' | 'muscle' | 'fatloss' | 'endurance'
export type Diet = 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan'
export type Units = 'metric' | 'imperial'

export interface Profile {
  sex: Sex
  age: number
  weightKg: number
  heightCm: number
  lifeStage: LifeStage
  activity: Activity
  goal: Goal
  diet: Diet
  units: Units
  showAdvanced: boolean
  /** Atlas range; null = automatic (week once 3+ of the last 7 days are logged) */
  atlasRange: 'day' | 'week' | null
  /** Atlas wedge colouring: by status (default) or stacked by meal. */
  atlasColor: 'status' | 'meal'
  /** ISO currency code for product prices. */
  currency: string
  /** Manual overrides; null = use the calculated value. */
  energyOverride: number | null
  proteinPerKgOverride: number | null
  /** Optional blood-test results (see lib/labs.ts). */
  labs: Partial<Record<LabId, LabResult>>
}

export const DEFAULT_PROFILE: Profile = {
  sex: 'male',
  age: 30,
  weightKg: 75,
  heightCm: 178,
  lifeStage: 'none',
  activity: 'moderate',
  goal: 'health',
  diet: 'omnivore',
  units: 'metric',
  showAdvanced: false,
  atlasRange: null,
  atlasColor: 'status',
  currency: 'USD',
  energyOverride: null,
  proteinPerKgOverride: null,
  labs: {},
}

export const ACTIVITY: Record<Activity, { label: string; hint: string; factor: number }> = {
  sedentary: { label: 'Sedentary', hint: 'Desk job, little exercise', factor: 1.2 },
  light: { label: 'Light', hint: 'Exercise 1–3 days/week', factor: 1.375 },
  moderate: { label: 'Moderate', hint: 'Exercise 3–5 days/week', factor: 1.55 },
  active: { label: 'Active', hint: 'Hard exercise 6–7 days/week', factor: 1.725 },
  athlete: { label: 'Athlete', hint: 'Training twice a day or physical job', factor: 1.9 },
}

export const GOALS: Record<Goal, { label: string; hint: string; proteinPerKg: number; energyAdjust: number }> = {
  health: { label: 'General health', hint: 'Meet every nutrient target', proteinPerKg: 0.8, energyAdjust: 0 },
  muscle: { label: 'Build muscle', hint: 'Higher protein, slight surplus', proteinPerKg: 1.6, energyAdjust: 0.1 },
  fatloss: { label: 'Lose fat', hint: 'Higher protein, ~15% deficit', proteinPerKg: 1.4, energyAdjust: -0.15 },
  endurance: { label: 'Endurance', hint: 'Fuel training, moderate protein', proteinPerKg: 1.3, energyAdjust: 0 },
}

export const DIETS: Record<Diet, { label: string; hint: string }> = {
  omnivore: { label: 'Omnivore', hint: 'Eats everything' },
  pescatarian: { label: 'Pescatarian', hint: 'Fish, no meat' },
  vegetarian: { label: 'Vegetarian', hint: 'Dairy and eggs, no meat or fish' },
  vegan: { label: 'Vegan', hint: 'Plants only' },
}

/** Mifflin–St Jeor BMR × activity factor, adjusted for goal and life stage. */
export function energyTarget(p: Profile) {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
  const tdee = bmr * ACTIVITY[p.activity].factor
  const lifeStageExtra = p.sex === 'female' ? (p.lifeStage === 'pregnant' ? 340 : p.lifeStage === 'lactating' ? 400 : 0) : 0
  const calculated = Math.round((tdee * (1 + GOALS[p.goal].energyAdjust) + lifeStageExtra) / 10) * 10
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), calculated, target: p.energyOverride ?? calculated }
}

export function proteinPerKg(p: Profile) {
  if (p.proteinPerKgOverride != null) return p.proteinPerKgOverride
  const base = GOALS[p.goal].proteinPerKg
  const minimum = p.sex === 'female' && p.lifeStage !== 'none' ? 1.1 : p.age < 19 ? 0.85 : 0.8
  return Math.max(base, minimum)
}

export const kgToLb = (kg: number) => kg * 2.20462
export const lbToKg = (lb: number) => lb / 2.20462
export const cmToFtIn = (cm: number) => {
  const inches = cm / 2.54
  return { ft: Math.floor(inches / 12), in: Math.round(inches % 12) }
}
export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * 2.54

export function describeProfile(p: Profile) {
  const w = p.units === 'imperial' ? `${Math.round(kgToLb(p.weightKg))} lb` : `${Math.round(p.weightKg)} kg`
  const stage = p.sex === 'female' && p.lifeStage !== 'none' ? `, ${p.lifeStage}` : ''
  return `${p.sex}, ${p.age}, ${w}${stage}`
}
