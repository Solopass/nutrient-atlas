import { useState } from 'react'
import { CATEGORY_LABEL } from '../../data/nutrients'
import {
  ACTIVITY,
  DIETS,
  GOALS,
  cmToFtIn,
  energyTarget,
  ftInToCm,
  kgToLb,
  lbToKg,
  proteinPerKg,
  type Activity,
  type Diet,
  type Goal,
  type LifeStage,
  type Sex,
  type Units,
  type Profile,
} from '../../lib/profile'
import { fmt } from '../../lib/status'
import { sunCoversVitaminD, validCustomTarget } from '../../lib/targets'
import { useProfile } from '../../state/profile'
import type { Category, Nutrient } from '../../types'
import { Logo } from '../Logo'
import { ChoiceCards, Field, NumberField, Section, Segmented } from './Controls'
import { DataSection } from './DataSection'
import { LabsSection } from './LabsSection'

export function SettingsPage() {
  const { profile: p, update, isDefault } = useProfile()
  const e = energyTarget(p)
  const imperial = p.units === 'imperial'
  const ftIn = cmToFtIn(p.heightCm)

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,var(--glow)_0%,var(--bg)_70%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-6">
        <div className="flex items-center gap-3">
          <a href="#/" aria-label="Back to Atlas">
            <Logo />
          </a>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            <p className="text-[13px] text-(--muted)">
              {isDefault ? 'Using the default profile. Changes save automatically.' : 'Changes save automatically.'}{' '}
              <a href="#/welcome" className="text-(--c-above) hover:underline">
                Run setup again
              </a>
            </p>
          </div>
        </div>
        <a href="#/" className="rounded-full bg-(--c-above) px-4 py-1.5 text-[13px] font-semibold text-white hover:brightness-110">
          ← Back to Atlas
        </a>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 pb-28 sm:px-6 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-5">
          <Section title="Body" hint="Used for DRI life-stage groups, amino acid targets (per kg) and your calorie estimate.">
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <Field label="Sex">
                <Segmented<Sex>
                  value={p.sex}
                  options={[
                    { value: 'female', label: 'Female' },
                    { value: 'male', label: 'Male' },
                  ]}
                  onChange={(sex) => update({ sex, lifeStage: sex === 'male' ? 'none' : p.lifeStage })}
                />
              </Field>
              <Field label="Age" hint={p.age < 19 ? 'Teen targets (14–18)' : undefined}>
                <NumberField value={p.age} min={14} max={110} onCommit={(v) => v != null && update({ age: v })} suffix="years" width="w-20" />
              </Field>
              <Field label="Units">
                <Segmented<Units>
                  value={p.units}
                  options={[
                    { value: 'metric', label: 'Metric' },
                    { value: 'imperial', label: 'Imperial' },
                  ]}
                  onChange={(units) => update({ units })}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <Field label="Weight">
                {imperial ? (
                  <NumberField value={kgToLb(p.weightKg)} min={66} max={660} onCommit={(v) => v != null && update({ weightKg: lbToKg(v) })} suffix="lb" />
                ) : (
                  <NumberField value={p.weightKg} min={30} max={300} step={0.5} onCommit={(v) => v != null && update({ weightKg: v })} suffix="kg" />
                )}
              </Field>
              <Field label="Height">
                {imperial ? (
                  <span className="inline-flex gap-2">
                    <NumberField value={ftIn.ft} min={4} max={7} onCommit={(v) => v != null && update({ heightCm: ftInToCm(v, ftIn.in) })} suffix="ft" width="w-16" />
                    <NumberField value={ftIn.in} min={0} max={11} onCommit={(v) => v != null && update({ heightCm: ftInToCm(ftIn.ft, v) })} suffix="in" width="w-16" />
                  </span>
                ) : (
                  <NumberField value={p.heightCm} min={120} max={230} onCommit={(v) => v != null && update({ heightCm: v })} suffix="cm" />
                )}
              </Field>
            </div>
            <Field
              label="Sun"
              hint={
                sunCoversVitaminD(p) || !p.sunExposure
                  ? 'Skin makes vitamin D from midday sun (roughly 10–30 minutes on arms and face, most days, spring to autumn). With regular sun, vitamin D from food is shown but not counted as a gap.'
                  : 'Your vitamin D blood test is low, so vitamin D counts as a gap even with this on.'
              }
            >
              <Segmented<'little' | 'regular'>
                value={p.sunExposure ? 'regular' : 'little'}
                options={[
                  { value: 'little', label: 'Little sun' },
                  { value: 'regular', label: 'Regular sun' },
                ]}
                onChange={(v) => update({ sunExposure: v === 'regular' })}
              />
            </Field>
            {p.sex === 'female' && (
              <Field label="Life stage" hint="Pregnancy and lactation raise targets for folate, iron, iodine, choline, protein and more.">
                <Segmented<LifeStage>
                  value={p.lifeStage}
                  options={[
                    { value: 'none', label: 'Neither' },
                    { value: 'pregnant', label: 'Pregnant' },
                    { value: 'lactating', label: 'Breastfeeding' },
                  ]}
                  onChange={(lifeStage) => update({ lifeStage })}
                />
              </Field>
            )}
          </Section>

          <Section title="Activity" hint="Multiplies your resting energy (BMR) to estimate daily calories burned.">
            <ChoiceCards<Activity>
              value={p.activity}
              onChange={(activity) => update({ activity })}
              cols="sm:grid-cols-2 xl:grid-cols-3"
              options={(Object.keys(ACTIVITY) as Activity[]).map((k) => ({ value: k, label: ACTIVITY[k].label, hint: ACTIVITY[k].hint, aside: `×${ACTIVITY[k].factor}` }))}
            />
          </Section>

          <Section title="Goal" hint="Sets protein per kg and adjusts calories. Micronutrient targets stay at DRI levels.">
            <ChoiceCards<Goal>
              value={p.goal}
              onChange={(goal) => update({ goal })}
              options={(Object.keys(GOALS) as Goal[]).map((k) => ({
                value: k,
                label: GOALS[k].label,
                hint: GOALS[k].hint,
                aside: `${GOALS[k].proteinPerKg} g/kg${GOALS[k].energyAdjust ? ` · ${GOALS[k].energyAdjust > 0 ? '+' : ''}${GOALS[k].energyAdjust * 100}%` : ''}`,
              }))}
            />
            <div className="flex flex-wrap gap-x-6 gap-y-4 border-t border-(--line) pt-4">
              <Field label="Custom calorie target" hint={`Calculated: ${e.calculated.toLocaleString()} kcal. Leave empty to use it.`}>
                <NumberField value={p.energyOverride} allowEmpty min={800} max={6000} step={50} placeholder={String(e.calculated)} onCommit={(v) => update({ energyOverride: v })} suffix="kcal" width="w-28" />
              </Field>
              <Field label="Custom protein" hint={`Goal default: ${GOALS[p.goal].proteinPerKg} g/kg. Leave empty to use it.`}>
                <NumberField value={p.proteinPerKgOverride} allowEmpty min={0.6} max={3} step={0.1} placeholder={String(GOALS[p.goal].proteinPerKg)} onCommit={(v) => update({ proteinPerKgOverride: v })} suffix="g/kg" width="w-24" />
              </Field>
            </div>
          </Section>

          <Section title="Appearance" hint="Colour-blind safe uses blue/orange status colours and adds a shape to every status (▼ deficient, ▽ needs attention, ● good, ▲ above, ⚠ over the limit).">
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <Field label="Theme">
                <Segmented<Profile['theme']>
                  value={p.theme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                  ]}
                  onChange={(theme) => update({ theme })}
                />
              </Field>
              <Field label="Status colours">
                <Segmented<Profile['palette']>
                  value={p.palette}
                  options={[
                    { value: 'standard', label: 'Standard' },
                    { value: 'cb', label: 'Colour-blind safe' },
                  ]}
                  onChange={(palette) => update({ palette })}
                />
              </Field>
            </div>
          </Section>

          <Section title="Diet style" hint="Filters food suggestions. Vegan and vegetarian diets get extra attention for B12, iron, zinc, iodine and omega-3.">
            <ChoiceCards<Diet>
              value={p.diet}
              onChange={(diet) => update({ diet })}
              cols="sm:grid-cols-2 xl:grid-cols-4"
              options={(Object.keys(DIETS) as Diet[]).map((k) => ({ value: k, label: DIETS[k].label, hint: DIETS[k].hint }))}
            />
          </Section>

          <Section title="AI estimation" hint="How meals described in words (or later, photos) get turned into nutrients.">
            <ChoiceCards<'manual' | 'auto'>
              value="manual"
              onChange={() => {}}
              options={[
                { value: 'manual', label: 'Copy & paste', hint: 'Free and private. Paste a prompt into any AI chat, paste the reply back.' },
                { value: 'auto', label: 'Automatic (coming soon)', hint: 'One tap, via a small server that holds an API key. See the roadmap.' },
              ]}
            />
          </Section>

          <LabsSection />

          <DataSection />

          <p className="px-1 text-xs leading-relaxed text-(--muted)">
            Targets are the Dietary Reference Intakes (RDA/AI and Tolerable Upper Intake Levels) from the US National Academies, for healthy people. Calorie estimate uses the Mifflin–St Jeor equation. This app is not medical advice. Talk to a clinician about supplements, medical conditions or medications.
          </p>
        </div>

        <TargetsPreview />
      </main>
    </div>
  )
}

/** Inline editor for one target: Enter saves, Escape cancels, Standard removes the custom value. */
function TargetEditor({ n, onSave, onCancel }: { n: Nutrient; onSave: (v: number | null) => void; onCancel: () => void }) {
  const [text, setText] = useState(n.target != null ? String(n.target) : '')
  const value = text.trim() === '' ? null : Number(text)
  const valid = value != null && validCustomTarget(n, value)
  const save = () => valid && onSave(value)
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <input
        autoFocus
        type="number"
        min={0}
        value={text}
        aria-label={`Your ${n.name} target in ${n.unit}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') onCancel()
        }}
        className={`w-20 rounded border bg-(--bg) px-1.5 py-0.5 text-right text-xs ${valid || text === '' ? 'border-(--line)' : 'border-(--c-deficient)'}`}
      />
      <span className="text-(--muted)">{n.unit}</span>
      <button onClick={save} disabled={!valid} className="rounded px-1 text-(--c-good) disabled:opacity-40" aria-label="Save target">
        ✓
      </button>
      {n.customTarget && (
        <button onClick={() => onSave(null)} className="rounded px-1 text-[10px] text-(--muted) hover:text-(--fg)" title="Back to the standard target">
          Standard
        </button>
      )}
      <button onClick={onCancel} className="rounded px-1 text-(--muted) hover:text-(--fg)" aria-label="Cancel">
        ×
      </button>
      {valid && n.upperLimit != null && n.category !== 'limit' && value > n.upperLimit && (
        <span role="alert" className="block w-full text-right font-sans text-[10px] whitespace-normal text-(--c-over)">
          Above the upper limit ({fmt(n.upperLimit)} {n.unit}); only with a clinician's advice.
        </span>
      )}
    </span>
  )
}

const PREVIEW_ORDER: Category[] = ['macro', 'vitamin', 'mineral', 'bvitamin', 'trace', 'fatty', 'amino', 'advanced', 'limit']

function TargetsPreview() {
  const { profile: p, nutrients, update } = useProfile()
  const e = energyTarget(p)
  const [editing, setEditing] = useState<string | null>(null)
  const customCount = nutrients.filter((n) => n.customTarget).length
  const setCustom = (id: string, value: number | null) => {
    const next = { ...p.targetOverrides }
    if (value == null) delete next[id]
    else next[id] = value
    update({ targetOverrides: next })
    setEditing(null)
  }

  return (
    <aside className="card p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <h2 className="text-[10.5px] font-medium tracking-[0.16em] text-(--muted) uppercase">Your daily targets</h2>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'BMR', value: e.bmr },
          { label: 'Burn', value: e.tdee },
          { label: 'Target', value: e.target, hot: true },
        ].map((x) => (
          <div key={x.label} className="rounded-lg bg-(--panel-2) px-2 py-2">
            <div className={`font-mono text-lg font-semibold ${x.hot ? 'text-(--c-above)' : ''}`}>{x.value.toLocaleString()}</div>
            <div className="text-[10px] tracking-wider text-(--muted) uppercase">{x.label} kcal</div>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[11px] text-(--muted)">protein {proteinPerKg(p)} g/kg · fat 30% of kcal</p>
      <p className="mt-3 text-xs leading-relaxed text-(--muted)">
        Tap a target to set your own, e.g. on your clinician's advice. Custom targets show in <span className="text-(--c-above)">blue</span> and replace the DRI everywhere.
        {customCount > 0 && (
          <>
            {' '}
            <button onClick={() => confirm(`Reset all ${customCount} custom targets to the standard DRI?`) && update({ targetOverrides: {} })} className="text-(--c-above) hover:underline">
              Reset all {customCount}
            </button>
          </>
        )}
      </p>

      <div className="mt-4 space-y-4">
        {PREVIEW_ORDER.map((cat) => {
          const rows = nutrients.filter((n) => n.category === cat)
          return (
            <div key={cat}>
              <h3 className="mb-1 text-[11px] font-medium" style={{ color: `var(--k-${cat})` }}>
                {CATEGORY_LABEL[cat]}
              </h3>
              <table className="w-full text-xs">
                <tbody>
                  {rows.map((n) => (
                    <tr key={n.id} className="border-t border-(--line)/60">
                      <td className="py-1 pr-2 text-(--dim)">{n.name}</td>
                      <td className="py-1 text-right font-mono whitespace-nowrap">
                        {editing === n.id ? (
                          <TargetEditor n={n} onSave={(v) => setCustom(n.id, v)} onCancel={() => setEditing(null)} />
                        ) : (
                          <button
                            onClick={() => setEditing(n.id)}
                            title={n.customTarget ? `Your target. Standard: ${n.customTarget.standard != null ? `${fmt(n.customTarget.standard)} ${n.unit}` : 'none'}` : 'Set your own target'}
                            className={`rounded px-1 hover:bg-(--panel-2) ${n.customTarget ? 'text-(--c-above)' : ''}`}
                          >
                            {n.target != null ? (
                              <>
                                {fmt(n.target)} <span className="text-(--muted)">{n.unit}</span>
                              </>
                            ) : (
                              <span className="text-(--muted)">no target</span>
                            )}
                          </button>
                        )}
                      </td>
                      <td className="w-12 py-1 pl-2 text-right font-mono text-[10px] text-(--muted)">{n.customTarget ? <span className="text-(--c-above)">custom</span> : (n.targetKind ?? '')}</td>
                      <td className="w-20 py-1 pl-2 text-right font-mono text-[10px] whitespace-nowrap text-(--c-over)/80">
                        {n.upperLimit != null ? `≤ ${fmt(n.upperLimit)}${n.ulAppliesTo === 'supplements' ? ' supp' : ''}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
