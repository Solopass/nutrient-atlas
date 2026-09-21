import { BAND_COLOR, type LabBand, type LabDef } from '../lib/labs'
import type { Profile } from '../lib/profile'
import { fmt } from '../lib/status'

/**
 * Reference bands for a blood test with the reading marked. Square-root scale,
 * so narrow low bands (ferritin under 15) stay visible next to wide normal ones.
 */
export function LabGauge({ def, canonical, profile }: { def: LabDef; canonical: number | null; profile: Pick<Profile, 'sex'> }) {
  const [d, l, ok] = def.bands(profile)
  const max = def.scaleMax
  const pos = (v: number) => Math.sqrt(Math.min(Math.max(v, 0), max) / max) * 100
  const bands: { band: LabBand; from: number; to: number }[] = [
    { band: 'deficient', from: 0, to: d },
    { band: 'low', from: d, to: l },
    { band: 'ok', from: l, to: Math.min(ok, max) },
    ...(ok < max ? [{ band: 'high' as const, from: ok, to: max }] : []),
  ]
  const unit = def.units[0].unit
  const edges = [d, l, ...(ok < max ? [ok] : [])]

  return (
    <div className="pt-4">
      <div className="relative">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {bands.map((b) => (
            <div
              key={b.band}
              title={`${def.bandLabel[b.band]}: ${fmt(b.from)}–${Number.isFinite(b.to) && b.to < max ? fmt(b.to) : '…'} ${unit}`}
              style={{ width: `${pos(b.to) - pos(b.from)}%`, background: BAND_COLOR[b.band], opacity: 0.4 }}
            />
          ))}
        </div>
        {canonical != null && (
          <>
            <div className="absolute -top-1.5 h-5.5 w-1 -translate-x-1/2 rounded-full bg-(--fg) shadow-[0_0_0_2px_var(--panel)]" style={{ left: `${pos(canonical)}%` }} />
            <div
              className="absolute -top-5 -translate-x-1/2 font-mono text-[10.5px] font-semibold whitespace-nowrap"
              style={{ left: `clamp(1.5rem, ${pos(canonical)}%, calc(100% - 1.5rem))` }}
            >
              {fmt(canonical)}
              {canonical > max && '→'}
            </div>
          </>
        )}
      </div>
      <div className="relative mt-1 h-3.5 font-mono text-[9.5px] text-(--muted)">
        <span className="absolute left-0">0</span>
        {edges.map((e) => (
          <span key={e} className="absolute -translate-x-1/2" style={{ left: `${pos(e)}%` }}>
            {fmt(e)}
          </span>
        ))}
        <span className="absolute right-0">{unit}</span>
      </div>
    </div>
  )
}
