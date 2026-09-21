/**
 * Ingredient forms on supplement labels ("magnesium (as magnesium oxide)").
 * Only well-established differences are rated; where forms are roughly
 * equivalent (B12, folate) they are all "good". Hedged on purpose: these are
 * general tendencies, not a verdict on any brand.
 */

export type FormQuality = 'good' | 'ok' | 'poor'

interface FormRule {
  match: RegExp
  quality: FormQuality
  label: string
  why: string
}

const RULES: Record<string, FormRule[]> = {
  vitD: [
    { match: /\bd3\b|cholecalciferol/, quality: 'good', label: 'D3', why: 'D3 raises blood levels more reliably than D2.' },
    { match: /\bd2\b|ergocalciferol/, quality: 'ok', label: 'D2', why: 'D2 works but is less effective at raising blood levels than D3.' },
  ],
  vitK: [
    { match: /mk-?7|menaquinone-?7/, quality: 'good', label: 'K2 (MK-7)', why: 'MK-7 stays in the body longest, so one daily dose is steady.' },
    { match: /mk-?4|menaquinone-?4|menatetrenone/, quality: 'ok', label: 'K2 (MK-4)', why: 'MK-4 is short-lived and needs larger or split doses.' },
    { match: /phylloquinone|phytonadione|\bk1\b/, quality: 'ok', label: 'K1', why: 'K1 is the food form; fine, shorter-acting than MK-7.' },
  ],
  vitA: [
    { match: /beta[- ]?carotene/, quality: 'good', label: 'beta-carotene', why: 'The body converts only what it needs, so no upper-limit risk.' },
    { match: /retinyl|retinol|palmitate|acetate/, quality: 'ok', label: 'preformed (retinyl)', why: 'Preformed vitamin A counts toward the upper limit; watch totals, especially in pregnancy.' },
  ],
  vitE: [
    { match: /\bd-alpha|rrr-alpha/, quality: 'good', label: 'natural (d-alpha)', why: 'Natural vitamin E is retained better than synthetic.' },
    { match: /dl-alpha|all-rac/, quality: 'ok', label: 'synthetic (dl-alpha)', why: 'Synthetic vitamin E is about half as active per mg as natural.' },
  ],
  magnesium: [
    { match: /glycinate|bisglycinate|citrate|malate|taurate|threonate|lactate|chloride|aspartate|orotate/, quality: 'good', label: '', why: 'An organic or chloride form, generally well absorbed.' },
    { match: /oxide|carbonate|hydroxide/, quality: 'poor', label: '', why: 'Oxide and carbonate are poorly absorbed and more likely to upset the gut.' },
    { match: /sulfate/, quality: 'ok', label: '', why: 'Absorbed moderately; laxative at higher doses.' },
  ],
  zinc: [
    { match: /picolinate|citrate|gluconate|bisglycinate|glycinate|acetate|orotate|monomethionine/, quality: 'good', label: '', why: 'A well-absorbed form.' },
    { match: /oxide/, quality: 'poor', label: '', why: 'Zinc oxide is less well absorbed than other forms.' },
    { match: /sulfate/, quality: 'ok', label: '', why: 'Absorbed reasonably; can upset the stomach.' },
  ],
  iron: [
    { match: /bisglycinate|glycinate|chelate/, quality: 'good', label: '', why: 'Chelated iron tends to be gentler on the stomach.' },
    { match: /ferrous (sulfate|fumarate|gluconate)|carbonyl/, quality: 'ok', label: '', why: 'Effective and well studied; more likely to cause constipation or nausea.' },
    { match: /ferric|iron oxide/, quality: 'poor', label: '', why: 'Ferric forms are absorbed less well than ferrous or chelated iron.' },
  ],
  calcium: [
    { match: /citrate|malate/, quality: 'good', label: '', why: 'Absorbed with or without food.' },
    { match: /carbonate/, quality: 'ok', label: '', why: 'Fine if taken with food; can cause bloating.' },
    { match: /phosphate|oxide|coral|oyster|dolomite|bone meal/, quality: 'ok', label: '', why: 'Absorbed less predictably; some natural sources can carry contaminants.' },
  ],
  b12: [
    { match: /cyanocobalamin|methylcobalamin|adenosylcobalamin|hydroxocobalamin|cobalamin/, quality: 'good', label: '', why: 'All common B12 forms are effective; cyanocobalamin is the most studied.' },
  ],
  b9: [
    { match: /methylfolate|5-mthf|l-mthf|methyltetrahydrofolate|folic acid|folate/, quality: 'good', label: '', why: 'Folic acid and methylfolate both raise folate status.' },
  ],
  selenium: [
    { match: /selenomethionine|selenium yeast|se-methyl/, quality: 'good', label: '', why: 'Organic selenium is well absorbed.' },
    { match: /selenite|selenate/, quality: 'ok', label: '', why: 'Inorganic forms are absorbed somewhat less well.' },
  ],
  epa: [
    { match: /triglyceride|\brtg\b|\btg\b|phospholipid|krill/, quality: 'good', label: '', why: 'Triglyceride and phospholipid forms are absorbed well.' },
    { match: /ethyl ester|\bee\b/, quality: 'ok', label: '', why: 'Ethyl esters absorb less well unless taken with a fatty meal.' },
  ],
}
RULES.dha = RULES.epa

export interface FormVerdict {
  nutrientId: string
  form: string
  quality: FormQuality
  why: string
}

/** Rate one nutrient's form text. Unknown forms return null (they are not penalised). */
export function rateForm(nutrientId: string, form: string): FormVerdict | null {
  const t = form.toLowerCase()
  for (const r of RULES[nutrientId] ?? []) {
    if (r.match.test(t)) return { nutrientId, form: r.label || cleanForm(form), quality: r.quality, why: r.why }
  }
  return null
}

const cleanForm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Pull the form out of a label line: "magnesium (as magnesium glycinate) 200 mg" → "magnesium glycinate"; "vitamin d3 …" → "d3". */
export function formFromLine(_nutrientId: string, line: string): string | null {
  const as = line.match(/\(\s*as\s+([^)]+)\)/i) ?? line.match(/\bfrom\s+([a-z0-9 -]+?)(?=\s+\d|\)|$)/i)
  if (as) return cleanForm(as[1])
  // Forms written into the nutrient name itself ("Vitamin D3", "Vitamin K2 MK-7", "Methylcobalamin").
  const inName = line.match(/\b(d3|d2|k1|k2|mk-?7|mk-?4|methylcobalamin|cyanocobalamin|methylfolate|folic acid|d-alpha|dl-alpha|beta[- ]?carotene)\b/i)
  return inName ? inName[1].toLowerCase() : null
}

/** Forms for every nutrient a label line was matched for (from parseLabel's `matched`). */
export function formsFromMatched(matched: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [id, line] of Object.entries(matched)) {
    const f = formFromLine(id, line)
    if (f) out[id] = f
  }
  return out
}

export const QUALITY_SCORE: Record<FormQuality, number> = { good: 1, ok: 0.65, poor: 0.25 }
