/**
 * AI meal estimation contract.
 *
 * Today the "provider" is the user: the app builds a prompt, the user pastes
 * it into any chatbot and pastes the reply back into the app. Later an
 * API-backed estimator implements `estimate`, and the prompt, parser and
 * review UI stay the same.
 */

export type Confidence = 'high' | 'medium' | 'low'

export interface EstimatedItem {
  name: string
  quantity: string
  grams?: number
  confidence: Confidence
  /** Totals for the portion eaten, keyed by nutrient id, in each nutrient's unit. */
  nutrients: Record<string, number>
}

export interface MealEstimate {
  items: EstimatedItem[]
  notes?: string
}

export interface ParseResult {
  estimate: MealEstimate | null
  errors: string[]
  warnings: string[]
}

export interface MealEstimator {
  id: string
  label: string
  /** Absent for the manual copy/paste estimator. */
  estimate?: (description: string) => Promise<ParseResult>
}

export const MANUAL_ESTIMATOR: MealEstimator = { id: 'manual', label: 'Copy & paste (any AI chat)' }
