import type { UsdaDb } from '../data/usda'
import type { LogEntry, Supplement } from '../db/db'
import { hasFood } from '../db/logging'
import type { NutrientState, Nutrient } from '../types'
import { addDays, averageIntake, contributors, dateRange, groupByDate, nutrientSeries, parseDate } from './history'
import type { Profile } from './profile'
import { dayScore, nutrientState } from './status'
import { topFoodsFor } from './suggestUsda'

/**
 * Weekly insights, computed on-device from the last 7 complete days vs the 7
 * before. Wording is deliberately hedged: this is food guidance, not medical advice.
 */

export type InsightKind = 'win' | 'gap' | 'limit' | 'risk' | 'tip'

export interface Insight {
  id: string
  kind: InsightKind
  title: string
  body: string
  nutrientIds: string[]
  /** Food ideas, e.g. "Sunflower seeds · 1 oz (28 g) · 50%". */
  foods?: string[]
  priority: number
}

export interface WeeklyReport {
  end: string
  loggedDays: number
  prevLoggedDays: number
  score: number | null
  prevScore: number | null
  states: NutrientState[]
  prevStates: NutrientState[]
  insights: Insight[]
}

const ANIMAL = /\b(beef|pork|chicken|turkey|lamb|veal|fish|salmon|tuna|cod|shrimp|egg|duck|oyster|clam|mussel|sardine|liver|meat|ham|bacon|sausage|venison|mackerel|trout|halibut|crab|lobster)\b/i

const scorable = (s: NutrientState) => s.nutrient.target != null && s.nutrient.category !== 'limit' && s.nutrient.category !== 'advanced'

/** Nutrients that each diet or life stage commonly falls short on. */
function riskList(p: Profile): { label: string; ids: string[]; why: string } | null {
  if (p.sex === 'female' && p.lifeStage === 'pregnant')
    return { label: 'pregnancy', ids: ['b9', 'iodine', 'choline', 'iron', 'dha'], why: 'Needs for these rise in pregnancy and they are commonly short.' }
  if (p.sex === 'female' && p.lifeStage === 'lactating')
    return { label: 'breastfeeding', ids: ['iodine', 'choline', 'dha', 'b12', 'vitA'], why: 'Needs for these rise while breastfeeding.' }
  if (p.diet === 'vegan')
    return { label: 'vegan diets', ids: ['b12', 'iodine', 'dha', 'zinc', 'iron', 'calcium', 'vitD', 'ala'], why: 'These are scarce or less absorbable in plant foods.' }
  if (p.diet === 'vegetarian') return { label: 'vegetarian diets', ids: ['b12', 'iron', 'zinc', 'dha', 'iodine'], why: 'These are scarcer or less absorbable without meat and fish.' }
  return null
}

const weekday = (date: string) => parseDate(date).toLocaleDateString(undefined, { weekday: 'long' })

export function weeklyReport(opts: {
  nutrients: Nutrient[]
  logs: LogEntry[]
  /** Last complete day of the week to report on. */
  end: string
  profile: Profile
  supplements: Supplement[]
  usda: UsdaDb | null
}): WeeklyReport {
  const { nutrients, logs, end, profile, supplements, usda } = opts
  const byDate = groupByDate(logs)
  const week = dateRange(end, 7)
  const prev = dateRange(addDays(end, -7), 7)
  const cur = averageIntake(byDate, week)
  const prv = averageIntake(byDate, prev)
  const states = nutrients.map((n) => nutrientState(n, cur.intake[n.id]))
  const prevStates = nutrients.map((n) => nutrientState(n, prv.intake[n.id]))
  const score = cur.loggedDays ? dayScore(states).score : null
  const prevScore = prv.loggedDays ? dayScore(prevStates).score : null
  const weekLogs = week.flatMap((d) => (hasFood(byDate.get(d)) ? byDate.get(d)! : []))
  const foodLogs = weekLogs.filter((l) => l.supplementId == null)
  const out: Insight[] = []
  const report: WeeklyReport = { end, loggedDays: cur.loggedDays, prevLoggedDays: prv.loggedDays, score, prevScore, states, prevStates, insights: out }
  if (cur.loggedDays === 0) return report

  const byId = new Map(states.map((s) => [s.nutrient.id, s]))
  const prevById = new Map(prevStates.map((s) => [s.nutrient.id, s]))
  const suppCovers = (id: string) => supplements.some((s) => s.active && s.nutrients[id])
  const foodIdeas = (n: Nutrient) =>
    usda && n.target ? topFoodsFor(n.id, n.target, usda, profile.diet).map((f) => `${f.name} · ${f.portion} · ${Math.round(f.pct)}%`) : undefined

  // Consistency
  if (cur.loggedDays < 4) {
    out.push({
      id: 'consistency',
      kind: 'tip',
      title: `${cur.loggedDays} of 7 days logged`,
      body: 'Weekly averages get reliable at 4+ logged days. Quick add (↻ same as yesterday) makes repeat meals one tap.',
      nutrientIds: [],
      priority: 30,
    })
  }

  // Score change and wins vs last week
  if (score != null && prevScore != null && prv.loggedDays >= 2) {
    const d = score - prevScore
    if (Math.abs(d) >= 5) {
      out.push({
        id: 'score',
        kind: d > 0 ? 'win' : 'gap',
        title: `Nourishment score ${d > 0 ? 'up' : 'down'} ${Math.abs(Math.round(d))} points`,
        body: `${Math.round(prevScore)}% last week → ${Math.round(score)}% this week (average of logged days).`,
        nutrientIds: [],
        priority: d > 0 ? 65 : 70,
      })
    }
    const wins = states.filter((s) => scorable(s) && s.pct != null && s.pct >= 80 && (prevById.get(s.nutrient.id)?.pct ?? 100) < 80)
    if (wins.length) {
      out.push({
        id: 'wins',
        kind: 'win',
        title: `Now on target: ${wins.slice(0, 4).map((s) => s.nutrient.shortName ?? s.nutrient.name).join(', ')}${wins.length > 4 ? ` +${wins.length - 4}` : ''}`,
        body: wins
          .slice(0, 4)
          .map((s) => `${s.nutrient.name} ${Math.round(prevById.get(s.nutrient.id)!.pct!)}% → ${Math.round(s.pct!)}%`)
          .join(' · '),
        nutrientIds: wins.map((s) => s.nutrient.id),
        priority: 60,
      })
    }
  }

  // Persistent gaps (with decent data), each with food ideas
  const gaps = states
    .filter((s) => scorable(s) && s.pct != null && s.pct < 70 && !s.partial)
    .map((s) => {
      const series = nutrientSeries(s.nutrient, byDate, week).filter((v): v is number => v != null)
      return { s, low: series.filter((v) => v < 80).length, days: series.length }
    })
    .filter((g) => g.days > 0 && g.low / g.days >= 0.6)
    .sort((a, b) => a.s.pct! - b.s.pct!)
    .slice(0, 3)
  for (const { s, low, days } of gaps) {
    out.push({
      id: `gap-${s.nutrient.id}`,
      kind: 'gap',
      title: `${s.nutrient.name}: ${Math.round(s.pct!)}% average`,
      body: `Under 80% on ${low} of ${days} logged days.${suppCovers(s.nutrient.id) ? ' Your supplement helps, but food is still short.' : ''}`,
      nutrientIds: [s.nutrient.id],
      foods: foodIdeas(s.nutrient),
      priority: 80 - s.pct! / 4,
    })
  }

  // Unknowns: important nutrients that look low only because foods don't report them
  const unknown = states.filter((s) => scorable(s) && (s.status === 'noData' || (s.partial && (s.pct ?? 0) < 80)))
  if (unknown.length >= 3) {
    out.push({
      id: 'unknown',
      kind: 'tip',
      title: `${unknown.length} nutrients have incomplete data`,
      body: `${unknown
        .slice(0, 6)
        .map((s) => s.nutrient.shortName ?? s.nutrient.name)
        .join(', ')}${unknown.length > 6 ? '…' : ''}. USDA rarely measures some of these, so "low" may just mean unknown. Supplement labels and food labels fill them in.`,
      nutrientIds: unknown.map((s) => s.nutrient.id),
      priority: 20,
    })
  }

  // Limits over on average
  for (const s of states.filter((x) => x.nutrient.category === 'limit' && x.status === 'overLimit')) {
    const top = contributors(foodLogs, s.nutrient.id).slice(0, 2)
    out.push({
      id: `limit-${s.nutrient.id}`,
      kind: 'limit',
      title: `${s.nutrient.name} averaged ${s.pct == null ? 'above your limit' : Math.round(s.pct) <= 100 ? 'just over your limit' : `${Math.round(s.pct)}% of your limit`}`,
      body: top.length ? `Biggest sources this week: ${top.map((t) => `${t.name.split(',')[0]} (${Math.round(t.share * 100)}%)`).join(', ')}.` : s.nutrient.why,
      nutrientIds: [s.nutrient.id],
      priority: 75,
    })
  }

  // Diet / life-stage risks
  const risk = riskList(profile)
  if (risk) {
    const short = risk.ids
      .map((id) => byId.get(id)!)
      .filter(Boolean)
      .filter((s) => {
        if (s.nutrient.id === 'dha') {
          const epaDha = (cur.intake.dha?.amount ?? 0) + (cur.intake.epa?.amount ?? 0)
          return epaDha < 250 && !suppCovers('dha')
        }
        return (s.status === 'noData' || (s.pct ?? 0) < 80) && !suppCovers(s.nutrient.id)
      })
    if (short.length) {
      const detail = short.map((s) =>
        s.nutrient.id === 'dha'
          ? `EPA+DHA ~${Math.round((cur.intake.dha?.amount ?? 0) + (cur.intake.epa?.amount ?? 0))} mg/day (250+ often suggested)`
          : `${s.nutrient.name} ${s.pct != null ? `${Math.round(s.pct)}%` : 'no data'}`,
      )
      out.push({
        id: 'risk',
        kind: 'risk',
        title: `Common gaps for ${risk.label}: ${short.map((s) => s.nutrient.shortName ?? s.nutrient.symbol).join(', ')}`,
        body: `${risk.why} This week: ${detail.join(' · ')}. Fortified foods or a supplement may help; check with a clinician.`,
        nutrientIds: short.map((s) => s.nutrient.id),
        priority: 85,
      })
    }
  }

  // Meal-level interaction tips
  const meals = new Map<string, LogEntry[]>()
  for (const l of foodLogs) meals.set(`${l.date}|${l.meal}`, [...(meals.get(`${l.date}|${l.meal}`) ?? []), l])
  const sum = (ls: LogEntry[], id: string) => ls.reduce((a, l) => a + (l.nutrients[id] ?? 0) * l.multiplier, 0)
  const iron = byId.get('iron')
  const ironLow = iron?.pct != null && iron.pct < 100

  if (ironLow) {
    const ironTotal = sum(foodLogs, 'iron')
    const plantIron = foodLogs.filter((l) => !ANIMAL.test(l.name)).reduce((a, l) => a + (l.nutrients.iron ?? 0) * l.multiplier, 0)
    const example = [...meals.entries()].find(([, ls]) => sum(ls, 'iron') >= 3 && sum(ls, 'vitC') < 15)
    if (ironTotal > 0 && plantIron / ironTotal >= 0.6 && example) {
      const [key, ls] = example
      const [d, meal] = key.split('|')
      const star = ls.reduce((a, l) => ((l.nutrients.iron ?? 0) * l.multiplier > (a.nutrients.iron ?? 0) * a.multiplier ? l : a))
      out.push({
        id: 'iron-c',
        kind: 'tip',
        title: 'Pair plant iron with vitamin C',
        body: `Most of your iron is from plant foods, which absorb better with vitamin C in the same meal. E.g. ${weekday(d)} ${meal}: ${star.name.split(',')[0].toLowerCase()} had iron but little vitamin C. Add peppers, citrus, tomatoes or berries.`,
        nutrientIds: ['iron', 'vitC'],
        priority: 55,
      })
    }
    const calciumIron = [...meals.values()].filter((ls) => sum(ls, 'calcium') >= 300 && sum(ls, 'iron') >= 3).length
    if (calciumIron >= 2) {
      out.push({
        id: 'ca-fe',
        kind: 'tip',
        title: 'Calcium and iron are sharing meals',
        body: `${calciumIron} meals this week had lots of both. Calcium can reduce iron absorption when eaten together; with iron below target, try having big calcium sources (dairy, calcium supplements) at a different meal.`,
        nutrientIds: ['calcium', 'iron'],
        priority: 45,
      })
    }
    const caffeineIron = [...meals.values()].filter((ls) => sum(ls, 'caffeine') >= 60 && sum(ls, 'iron') >= 3).length
    if (caffeineIron >= 2) {
      out.push({
        id: 'caf-fe',
        kind: 'tip',
        title: 'Coffee or tea with iron-rich meals',
        body: `${caffeineIron} meals paired caffeine with iron. Coffee and tea can reduce iron absorption; having them an hour apart from iron-rich meals may help.`,
        nutrientIds: ['caffeine', 'iron'],
        priority: 40,
      })
    }
  }

  const vitA = byId.get('vitA')?.nutrient
  const vitK = byId.get('vitK')?.nutrient
  const lowFatVeg = [...meals.values()].filter(
    (ls) => sum(ls, 'fat') < 3 && ((vitA?.target && sum(ls, 'vitA') >= vitA.target * 0.5) || (vitK?.target && sum(ls, 'vitK') >= vitK.target * 0.5)),
  ).length
  if (lowFatVeg >= 2) {
    out.push({
      id: 'fat-soluble',
      kind: 'tip',
      title: 'Add a little fat to your veg',
      body: `${lowFatVeg} meals were rich in vitamins A or K but nearly fat-free. These vitamins absorb better with some fat: olive oil, nuts, seeds or avocado.`,
      nutrientIds: ['vitA', 'vitK'],
      priority: 35,
    })
  }

  out.sort((a, b) => b.priority - a.priority)
  return report
}
