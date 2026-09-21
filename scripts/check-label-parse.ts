// Checks the Nutrition Facts text reader on sample labels: bun scripts/check-label-parse.ts
import { parseLabel } from '../src/lib/labelParse'

const samples: Record<string, string> = {
  'modern (granola)': `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
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
Potassium 240mg 6%`,
  'old style, one line': 'Serving Size 1 bar (40g) Calories 190 Total Fat 7g Sat. Fat 3g Cholesterol 5mg Sodium 115mg Total Carb. 28g Dietary Fiber 2g Sugars 13g Protein 4g Vitamin A 0% Vitamin C 10% Calcium 2% Iron 6%',
  'supplement (IU)': `Supplement Facts
Serving Size 1 Softgel
Vitamin D3 (as cholecalciferol) 5,000 IU 625%
Vitamin K2 (as MK-7) 100 mcg 83%
Magnesium (as glycinate) 120 mg 29%`,
}
for (const [name, text] of Object.entries(samples)) {
  const r = parseLabel(text)
  const round = (v: number) => Math.round(v * 100) / 100
  console.log(`\n${name}: serving "${r.servingLabel}" ${r.grams ?? '?'} g, ${r.calories ?? '?'} kcal, ${r.servingsPerContainer ?? '?'} per container`)
  console.log('  ' + Object.entries(r.nutrients).map(([k, v]) => `${k}=${round(v)}`).join(', '))
}
