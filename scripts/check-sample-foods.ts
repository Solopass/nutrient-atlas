// Prints which USDA food each sample-meal query resolves to: bun scripts/check-sample-foods.ts
import { buildUsdaDb, searchUsda } from '../src/data/usda'
import { SAMPLE_QUERIES } from '../src/lib/sampleData'

const db = buildUsdaDb(await Bun.file(new URL('../public/usda/foods.json', import.meta.url)).json())
for (const q of SAMPLE_QUERIES) {
  const f = searchUsda(db, q, 1)[0]
  console.log(`${q.padEnd(24)} → ${f ? `${f.name} (${Object.keys(f.per100g).length} nutrients)` : 'NOT FOUND'}`)
}
