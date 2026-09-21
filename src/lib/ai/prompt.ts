import { NUTRIENTS } from '../../data/nutrients'

export const PROMPT_VERSION = 1

/** Builds the meal-estimation prompt. Same text will be sent by the future API provider. */
export function buildMealPrompt(description: string) {
  const table = NUTRIENTS.map((n) => `${n.id} | ${n.name} | ${n.unit}`).join('\n')

  return `You are a nutrition analyst. Estimate the nutrients in the meal below using USDA FoodData Central values as your reference.

MEAL (described by the user):
"""
${description.trim()}
"""

INSTRUCTIONS
1. Split the meal into individual foods. Estimate a realistic portion for each if not stated, and give its weight in grams.
2. For each food, give the TOTAL amount of each nutrient in the portion eaten (not per 100 g).
3. Use exactly the nutrient ids and units in the table below. Convert units where needed (e.g. vitamin A in mcg RAE, folate in mcg DFE, vitamin E in mg alpha-tocopherol). "met" is methionine + cysteine combined; "phe" is phenylalanine + tyrosine combined.
4. Include every nutrient in the table that the food meaningfully contains. If a value is genuinely unknown, OMIT that key; do not guess 0. Use 0 only when the food truly contains none (e.g. vitamin B12 in plants).
5. "confidence" is high / medium / low, reflecting how sure you are of the portion and composition.
6. Reply with ONLY a JSON object, no commentary before or after, in this shape:

{
  "items": [
    {
      "name": "Scrambled eggs",
      "quantity": "2 large eggs",
      "grams": 100,
      "confidence": "high",
      "nutrients": { "protein": 12.6, "fat": 9.5, "vitD": 2.2, "b12": 1.1, "choline": 294 }
    }
  ],
  "notes": "Any assumptions you made, in one or two sentences."
}

NUTRIENT TABLE (id | name | unit)
${table}
`
}
