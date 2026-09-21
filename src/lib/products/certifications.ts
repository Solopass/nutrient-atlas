/**
 * Independent testing programs that check a supplement contains what the label
 * says (and, for sport programs, no banned substances). A product carrying one
 * gets a "Tested" score; products without one aren't penalised, because many
 * good products simply aren't enrolled.
 */
export const CERTIFICATIONS: { label: string; match: RegExp; what: string }[] = [
  { label: 'USP Verified', match: /\busp\b/i, what: 'Checked for identity, strength, purity and good manufacturing.' },
  { label: 'NSF Certified for Sport', match: /nsf certified for sport|nsf sport/i, what: 'Contents checked plus screened for substances banned in sport.' },
  { label: 'NSF Contents Certified', match: /\bnsf\b/i, what: 'Checked that contents match the label, and for contaminants.' },
  { label: 'Informed Sport', match: /informed[- ]sport/i, what: 'Every batch screened for banned substances.' },
  { label: 'Informed Choice', match: /informed[- ]choice/i, what: 'Regular screening for banned substances.' },
  { label: 'BSCG Certified', match: /\bbscg\b/i, what: 'Screened for drugs and banned substances.' },
  { label: 'IFOS', match: /\bifos\b/i, what: 'Fish oil tested for potency, purity and freshness.' },
  { label: 'ConsumerLab Approved', match: /consumerlab/i, what: 'Passed ConsumerLab testing for quality and label accuracy.' },
]

const BY_LABEL = new Map(CERTIFICATIONS.map((c) => [c.label.toLowerCase(), c]))

/** Seals mentioned in label or page text. "NSF Certified for Sport" wins over plain NSF. */
export function detectCertifications(text: string): string[] {
  const found: string[] = []
  for (const c of CERTIFICATIONS) {
    if (!c.match.test(text)) continue
    if (c.label === 'NSF Contents Certified' && found.includes('NSF Certified for Sport')) continue
    found.push(c.label)
  }
  return found
}

/** Normalise free text ("usp", "NSF sport") to the known labels; unknown ones are kept as typed. */
export function normaliseCertifications(list: string[]): string[] {
  const out = new Set<string>()
  for (const raw of list) {
    const t = raw.trim()
    if (!t) continue
    const known = BY_LABEL.get(t.toLowerCase()) ?? CERTIFICATIONS.find((c) => c.match.test(t))
    out.add(known ? known.label : t)
  }
  return [...out]
}

export const certificationInfo = (label: string) => BY_LABEL.get(label.toLowerCase())
