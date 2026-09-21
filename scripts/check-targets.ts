// Quick sanity check of personalised targets: bun scripts/check-targets.ts
import { DEFAULT_PROFILE, energyTarget, type Profile } from '../src/lib/profile'
import { personalize } from '../src/lib/targets'

const cases: [string, Partial<Profile>][] = [
  ['male 30 75kg', {}],
  ['female 25 60kg', { sex: 'female', age: 25, weightKg: 60, heightCm: 165 }],
  ['female 60 65kg', { sex: 'female', age: 60, weightKg: 65, heightCm: 162, activity: 'light' }],
  ['pregnant 30', { sex: 'female', age: 30, weightKg: 68, heightCm: 168, lifeStage: 'pregnant' }],
  ['male 16 60kg', { age: 16, weightKg: 60, heightCm: 172 }],
  ['male 75 muscle', { age: 75, goal: 'muscle' }],
]
const show = ['protein', 'fiber', 'vitA', 'vitD', 'calcium', 'magnesium', 'iron', 'zinc', 'b9', 'iodine', 'choline', 'leu']
for (const [label, patch] of cases) {
  const p = { ...DEFAULT_PROFILE, ...patch }
  const n = Object.fromEntries(personalize(p).map((x) => [x.id, x]))
  console.log(`${label.padEnd(16)} ${String(energyTarget(p).target).padStart(4)} kcal | ` + show.map((k) => `${k} ${n[k].target}`).join(', ') + ` | Ca UL ${n.calcium.upperLimit}`)
}
