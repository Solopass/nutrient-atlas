// Prints "best next food" suggestions for the demo day, and food ideas per nutrient: bun scripts/check-suggestions.ts
import { buildUsdaDb } from '../src/data/usda'
import { MOCK_INTAKE } from '../src/data/mockIntake'
import { DEFAULT_PROFILE, type Diet } from '../src/lib/profile'
import { nutrientState } from '../src/lib/status'
import { suggestFoods, topFoodsFor } from '../src/lib/suggestUsda'
import { personalize } from '../src/lib/targets'

const usda = buildUsdaDb(await Bun.file(new URL('../public/usda/foods.json', import.meta.url)).json())

const states = personalize(DEFAULT_PROFILE).map((n) => nutrientState(n, MOCK_INTAKE[n.id]))
for (const diet of ['omnivore', 'vegan'] as Diet[]) {
  const t = performance.now()
  const s = suggestFoods(states, usda, diet, [])
  console.log(`${diet} (${(performance.now() - t).toFixed(0)} ms)`)
  for (const x of s) console.log(`  ${x.food.name} · ${x.portion} · ${Math.round(x.kcal ?? 0)} kcal · closes ${x.closes.map((c) => c.nutrient.symbol).join(' ')} · lifts ${x.helps.map((c) => c.nutrient.symbol).join(' ')}`)
}

// Food ideas per nutrient, as used by weekly insights
for (const [id, target] of [['vitE', 15], ['la', 12], ['fat', 78], ['iron', 18], ['iodine', 150], ['b12', 2.4]] as [string, number][]) {
  console.log(`${id}: ` + topFoodsFor(id, target, usda, 'vegetarian').map((f) => `${f.name} · ${f.portion} · ${Math.round(f.pct)}%`).join(' | '))
}
