// Prints which USDA food each sample-meal query resolves to: bun scripts/check-sample-foods.ts
import { nameParts, searchUsda } from '../src/data/usda'
import { SAMPLE_QUERIES } from '../src/lib/sampleData'
const raw = await Bun.file(new URL('../public/usda/foods.json', import.meta.url)).json()
const split = (s: string) => s.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean)
const db = {
  source: '',
  foods: raw.foods.map(([fdcId, name, cat, src, kcal, values, portions]: any) => ({
    fdcId, name, category: raw.categories[cat], source: src === 'f' ? 'foundation' : 'sr', kcal, portions, words: split(name),
    segments: name.split(',').length, head: split(nameParts(name)[1]),
    per100g: Object.fromEntries(values.map((v: any, i: number) => [raw.nutrients[i], v]).filter(([, v]: any) => v != null)),
  })),
}
for (const q of SAMPLE_QUERIES) {
  const f = searchUsda(db as any, q, 1)[0]
  console.log(`${q.padEnd(24)} → ${f ? `${f.name} (${Object.keys(f.per100g).length} nutrients)` : 'NOT FOUND'}`)
}
