import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ReactNode } from 'react'
import { SUPPLEMENT_PRESETS } from '../../data/supplementPresets'
import { db } from '../../db/db'
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
} from '../../lib/profile'
import { fmt } from '../../lib/status'
import { createSupplement } from '../../lib/supplements'
import { describeBackup, readBackup, restoreBackup } from '../../lib/backup'
import { useProfile } from '../../state/profile'
import { Logo } from '../Logo'
import { ChoiceCards, Field, NumberField, Segmented } from '../settings/Controls'

export type OnboardingExit = 'log' | 'sample' | 'atlas'

const STEPS = ['Welcome', 'About you', 'Goals', 'Supplements', 'Ready'] as const
const QUICK_SUPPS = ['d3', 'multi', 'fishoil', 'algae', 'mg', 'b12', 'iron', 'cald', 'zinc', 'creatine', 'prenatal']

/** First-run setup: profile → goals → supplements → personal targets. Everything is editable later in Settings. */
export function Onboarding({ onFinish }: { onFinish: (exit: OnboardingExit) => void }) {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const existing = useLiveQuery(() => db.supplements.toArray(), [])

  const finish = async (exit: OnboardingExit) => {
    await db.settings.put({ key: 'onboarded', value: new Date().toISOString() })
    onFinish(exit)
  }

  const saveSupplements = async () => {
    const have = new Set((existing ?? []).map((s) => s.name))
    for (const key of picked) {
      const p = SUPPLEMENT_PRESETS.find((x) => x.key === key)!
      if (have.has(p.name)) continue
      const { key: _key, note: _note, ...data } = p
      await createSupplement(data)
    }
  }

  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false) // ref: two taps before a re-render would both see stale state
  const next = async () => {
    if (busyRef.current) return // a double tap must not create each supplement twice
    busyRef.current = true
    setBusy(true)
    try {
      if (STEPS[step] === 'Supplements') await saveSupplements()
      setStep((s) => Math.min(s + 1, STEPS.length - 1))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#12203a_0%,var(--bg)_70%)] px-4 py-8">
      <div className="card w-full max-w-xl p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-(--c-above)' : i < step ? 'w-3 bg-(--c-above)/50' : 'w-3 bg-(--line)'}`} />
            ))}
          </div>
          {step < STEPS.length - 1 && (
            <button onClick={() => finish('atlas')} className="text-xs text-(--muted) hover:text-(--fg)">
              Skip setup
            </button>
          )}
        </div>

        {step === 0 && <Welcome />}
        {step === 1 && <AboutYou />}
        {step === 2 && <GoalsStep />}
        {step === 3 && (
          <SupplementsStep
            picked={picked}
            toggle={(k) =>
              setPicked((p) => {
                const n = new Set(p)
                if (n.has(k)) n.delete(k)
                else n.add(k)
                return n
              })
            }
            existing={(existing ?? []).map((s) => s.name)}
          />
        )}
        {step === 4 && <Ready onFinish={finish} />}

        {step < STEPS.length - 1 && (
          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <button onClick={() => setStep((s) => s - 1)} className="px-2 py-2 text-sm text-(--muted) hover:text-(--fg)">
                ← Back
              </button>
            ) : (
              <span className="flex flex-wrap gap-x-1">
                <button onClick={() => finish('sample')} className="px-2 py-2 text-sm text-(--muted) hover:text-(--fg)">
                  Explore with sample data
                </button>
                <RestoreButton onDone={() => onFinish('atlas')} />
              </span>
            )}
            <button onClick={next} disabled={busy} className="rounded-full disabled:opacity-60 bg-(--c-above) px-5 py-2 text-sm font-semibold text-white shadow-[0_0_24px_-6px_var(--c-above)] hover:brightness-110">
              {step === 0 ? 'Get started' : STEPS[step] === 'Supplements' ? (picked.size ? `Add ${picked.size} & continue` : 'None, continue') : 'Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Restore a backup file from Settings → Export (moving to a new browser or the installed app). */
function RestoreButton({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button onClick={() => ref.current?.click()} className="px-2 py-2 text-sm text-(--muted) hover:text-(--fg)">
        Restore a backup…
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const data = await readBackup(f)
            if (!confirm(`Restore this ${describeBackup(data)}?`)) return
            await restoreBackup(data)
            // Older backups may predate the "onboarded" flag; a restored profile means setup is done.
            if (!data.settings?.some((s) => s.key === 'onboarded')) await db.settings.put({ key: 'onboarded', value: new Date().toISOString() })
            onDone()
          } catch (err) {
            setError((err as Error).message)
          }
        }}
      />
      {error && <span className="w-full px-2 text-xs text-(--c-deficient)">{error}</span>}
    </>
  )
}

function Title({ kicker, title, sub }: { kicker: string; title: string; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-[10.5px] font-medium tracking-[0.16em] text-(--c-above) uppercase">{kicker}</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-(--dim)">{sub}</p>}
    </div>
  )
}

function Welcome() {
  return (
    <div>
      <div className="mb-5 [&_svg]:size-14">
        <Logo />
      </div>
      <Title kicker="Nutrient Atlas" title="See what you're actually getting." sub="Most apps count calories. This one shows whether you're getting enough of 40+ vitamins, minerals, amino acids and fatty acids, and what to eat next." />
      <ul className="space-y-3 text-sm">
        {[
          ['◉', 'The Atlas', 'One chart shows every nutrient as a % of your personal target.'],
          ['↻', 'Fast logging', 'USDA food search, labels, saved meals, AI estimates, supplements.'],
          ['✦', 'What next', 'It finds the food that closes the most of your gaps.'],
          ['🔒', 'Private', 'Everything stays on this device.'],
        ].map(([icon, title, body]) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-(--panel-2) text-sm text-(--c-above)">{icon}</span>
            <span>
              <span className="font-medium">{title}.</span> <span className="text-(--dim)">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-(--muted)">Setup takes about a minute. Every answer can be changed later in Settings.</p>
    </div>
  )
}

function AboutYou() {
  const { profile: p, update } = useProfile()
  const imperial = p.units === 'imperial'
  const ftIn = cmToFtIn(p.heightCm)
  return (
    <div>
      <Title kicker="Step 1 of 3" title="About you" sub="Nutrient targets change with age, sex and life stage. Weight sets protein and amino acid targets." />
      <div className="space-y-5">
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
          <Field label="Age">
            <NumberField value={p.age} min={14} max={110} onCommit={(v) => v != null && update({ age: v })} suffix="years" width="w-20" />
          </Field>
          <Field label="Units">
            <Segmented<Units>
              value={p.units}
              options={[
                { value: 'metric', label: 'kg · cm' },
                { value: 'imperial', label: 'lb · ft' },
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
        {p.sex === 'female' && (
          <Field label="Pregnant or breastfeeding?">
            <Segmented<LifeStage>
              value={p.lifeStage}
              options={[
                { value: 'none', label: 'No' },
                { value: 'pregnant', label: 'Pregnant' },
                { value: 'lactating', label: 'Breastfeeding' },
              ]}
              onChange={(lifeStage) => update({ lifeStage })}
            />
          </Field>
        )}
      </div>
    </div>
  )
}

function GoalsStep() {
  const { profile: p, update } = useProfile()
  return (
    <div>
      <Title kicker="Step 2 of 3" title="Activity, goal and diet" />
      <div className="space-y-5">
        <Field label="How active are you?">
          <ChoiceCards<Activity>
            value={p.activity}
            onChange={(activity) => update({ activity })}
            cols="grid-cols-2 sm:grid-cols-3"
            options={(Object.keys(ACTIVITY) as Activity[]).map((k) => ({ value: k, label: ACTIVITY[k].label, hint: ACTIVITY[k].hint }))}
          />
        </Field>
        <Field label="Main goal">
          <ChoiceCards<Goal>
            value={p.goal}
            onChange={(goal) => update({ goal })}
            cols="grid-cols-2"
            options={(Object.keys(GOALS) as Goal[]).map((k) => ({ value: k, label: GOALS[k].label, hint: GOALS[k].hint }))}
          />
        </Field>
        <Field label="How do you eat?">
          <ChoiceCards<Diet>
            value={p.diet}
            onChange={(diet) => update({ diet })}
            cols="grid-cols-2 sm:grid-cols-4"
            options={(Object.keys(DIETS) as Diet[]).map((k) => ({ value: k, label: DIETS[k].label, hint: DIETS[k].hint }))}
          />
        </Field>
      </div>
    </div>
  )
}

function SupplementsStep({ picked, toggle, existing }: { picked: Set<string>; toggle: (k: string) => void; existing: string[] }) {
  const { profile } = useProfile()
  const suggest = profile.diet === 'vegan' ? ['b12', 'algae', 'd3'] : profile.lifeStage === 'pregnant' ? ['prenatal'] : ['d3']
  return (
    <div>
      <Title
        kicker="Step 3 of 3"
        title="Supplements you take"
        sub="Tap any you take daily. They're logged automatically each day. You can match doses to your exact label later in Supplements."
      />
      <div className="flex flex-wrap gap-2">
        {QUICK_SUPPS.map((k) => {
          const p = SUPPLEMENT_PRESETS.find((x) => x.key === k)!
          const on = picked.has(k)
          const have = existing.includes(p.name)
          return (
            <button
              key={k}
              onClick={() => !have && toggle(k)}
              disabled={have}
              aria-pressed={on}
              className={`rounded-full px-3.5 py-2 text-sm transition ${on || have ? 'bg-(--c-above) text-white' : 'bg-(--panel-2) text-(--dim) shadow-[inset_0_0_0_1px_var(--line)] hover:text-(--fg)'}`}
            >
              {on || have ? '✓ ' : ''}
              {p.name}
              {!on && !have && suggest.includes(k) && <span className="ml-1.5 text-[10px] text-(--c-attention)">common</span>}
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-(--muted)">
        {profile.diet === 'vegan'
          ? 'Vegan diets usually need B12 from a supplement or fortified foods, and often vitamin D and algae omega-3.'
          : 'Vitamin D is hard to get from food alone, so it is the most common supplement.'}{' '}
        This is not medical advice.
      </p>
    </div>
  )
}

function Ready({ onFinish }: { onFinish: (exit: OnboardingExit) => void }) {
  const { profile: p, nutrients } = useProfile()
  const supps = useLiveQuery(() => db.supplements.toArray(), [])
  const e = energyTarget(p)
  const show = ['protein', 'fiber', 'vitD', 'calcium', 'iron', 'magnesium', 'b12', 'b9']
  return (
    <div>
      <Title kicker="All set" title="Your personal targets" sub="Based on the Dietary Reference Intakes for your age, sex and life stage." />
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'kcal / day', value: e.target.toLocaleString() },
          { label: 'protein g/kg', value: String(proteinPerKg(p)) },
          { label: 'supplements', value: String(supps?.filter((s) => s.active).length ?? 0) },
        ].map((x) => (
          <div key={x.label} className="rounded-lg bg-(--panel-2) py-2.5">
            <div className="font-mono text-xl font-semibold text-(--c-above)">{x.value}</div>
            <div className="text-[10px] tracking-wider text-(--muted) uppercase">{x.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {show.map((id) => {
          const n = nutrients.find((x) => x.id === id)!
          return (
            <div key={id} className="flex justify-between border-b border-(--line)/60 py-1">
              <span className="text-(--dim)">{n.name}</span>
              <span className="font-mono">
                {fmt(n.target!)} <span className="text-(--muted)">{n.unit}</span>
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-(--muted)">…plus {nutrients.length - show.length} more. See them all in Settings.</p>

      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <button onClick={() => onFinish('log')} className="flex-1 rounded-full bg-(--c-above) px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-6px_var(--c-above)] hover:brightness-110">
          + Log my first meal
        </button>
        <button onClick={() => onFinish('sample')} className="flex-1 rounded-full border border-(--line) px-5 py-2.5 text-sm text-(--dim) hover:border-(--c-above) hover:text-(--fg)">
          Explore with sample data
        </button>
      </div>
      <button onClick={() => onFinish('atlas')} className="mt-3 w-full text-center text-xs text-(--muted) hover:text-(--fg)">
        Go to the Atlas
      </button>
    </div>
  )
}
