import { useEffect, useRef, useState } from 'react'
import { cleanBarcode, lookupBarcode, type OffProduct } from '../../lib/products/openFoodFacts'
import { useProfile } from '../../state/profile'

// Not in TypeScript's DOM lib yet.
interface DetectedBarcode {
  rawValue: string
}
declare class BarcodeDetector {
  constructor(opts?: { formats: string[] })
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext

/**
 * Type the numbers under a barcode, or scan it with the camera where the
 * browser can (Chrome/Edge on Android and some desktops; needs HTTPS or
 * localhost). Looks the product up on Open Food Facts.
 */
export function BarcodeLookup({ onFound, onCancel }: { onFound: (p: OffProduct) => void; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'notfound' | 'error'; msg?: string }>({ status: 'idle' })
  const [found, setFound] = useState<OffProduct | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const look = async (raw: string) => {
    const c = cleanBarcode(raw)
    if (!c) return setState({ status: 'error', msg: 'Barcodes are 8, 12, 13 or 14 digits.' })
    abort.current?.abort()
    abort.current = new AbortController()
    setState({ status: 'loading' })
    setFound(null)
    try {
      const p = await lookupBarcode(c, abort.current.signal)
      if (p) {
        setFound(p)
        setState({ status: 'idle' })
      } else setState({ status: 'notfound' })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setState({ status: 'error', msg: navigator.onLine ? (e as Error).message : "You're offline. Barcode lookup needs the internet." })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add by barcode</h2>
        <button onClick={onCancel} className="text-sm text-(--muted) hover:text-(--fg)">
          Cancel
        </button>
      </div>

      {scanning ? (
        <Scanner
          onCode={(c) => {
            setScanning(false)
            setCode(c)
            look(c)
          }}
          onClose={() => setScanning(false)}
        />
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            look(code)
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoFocus={matchMedia('(pointer: fine)').matches}
            placeholder="Numbers under the barcode, e.g. 016000275287"
            className="min-w-0 flex-1 rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2 font-mono text-sm placeholder:font-sans placeholder:text-(--muted) focus:border-(--c-above) focus:outline-none"
          />
          <button type="submit" disabled={state.status === 'loading'} className="rounded-lg bg-(--c-above) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {state.status === 'loading' ? 'Looking up…' : 'Look up'}
          </button>
          {canScan() && (
            <button type="button" onClick={() => setScanning(true)} className="rounded-lg border border-(--line) px-4 py-2 text-sm hover:border-(--c-above)">
              ▣ Scan with camera
            </button>
          )}
        </form>
      )}
      {!canScan() && !scanning && (
        <p className="text-xs text-(--muted)">
          {window.isSecureContext
            ? 'Camera scanning isn’t supported in this browser yet (it works in Chrome and Edge on Android). Typing the numbers works everywhere.'
            : 'Camera scanning needs a secure (https) address, which comes with hosting. Typing the numbers works now.'}
        </p>
      )}

      {state.status === 'notfound' && (
        <p className="rounded-lg bg-(--c-attention)/10 px-3 py-2 text-sm text-(--c-attention)">
          Not in Open Food Facts yet. Paste its label instead (Add → Paste a label), or photograph it for an AI chat (Import).
        </p>
      )}
      {state.status === 'error' && <p className="rounded-lg bg-(--c-deficient)/10 px-3 py-2 text-sm text-(--c-deficient)">{state.msg}</p>}

      {found && <FoundCard p={found} onUse={() => onFound(found)} />}

      <p className="text-[11px] text-(--muted)">
        Data from Open Food Facts, a free crowd-sourced database (only the barcode number is sent). Entries are made by volunteers, so check the values against your label.
      </p>
    </div>
  )
}

function FoundCard({ p, onUse }: { p: OffProduct; onUse: () => void }) {
  const { byId } = useProfile()
  return (
    <div className="flex gap-3 rounded-lg bg-(--panel-2) p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      {p.imageUrl && <img src={p.imageUrl} alt="" className="size-16 shrink-0 rounded-md bg-white object-contain" referrerPolicy="no-referrer" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-(--muted)">
          {p.brand || 'Unknown brand'} · {p.kind}
        </div>
        <div className="font-medium">{p.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-(--muted)">
          {p.per100g ? 'per 100 g (serving size not listed)' : `per ${p.serving}`}
          {p.kcal != null && ` · ${p.kcal} kcal`} · {Object.keys(p.nutrients).length} nutrients
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(p.nutrients)
            .slice(0, 8)
            .map(([id, v]) => (
              <span key={id} className="rounded bg-(--bg) px-1.5 py-0.5 font-mono text-[10.5px] text-(--dim)">
                {byId.get(id)?.symbol ?? id} {+v.toFixed(2)}
                {byId.get(id)?.unit}
              </span>
            ))}
        </div>
      </div>
      <button onClick={onUse} className="self-center rounded-lg bg-(--c-good) px-3 py-2 text-sm font-semibold text-black hover:brightness-110">
        Review & add
      </button>
    </div>
  )
}

/** Live camera preview that reports the first barcode it sees. */
function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Latest callback in a ref, so a parent re-render doesn't restart the camera.
  const report = useRef(onCode)
  report.current = onCode
  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let timer = 0
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        video.current!.srcObject = stream
        await video.current!.play()
        const tick = async () => {
          if (stopped) return
          try {
            const [hit] = await detector.detect(video.current!)
            if (hit?.rawValue && cleanBarcode(hit.rawValue)) {
              navigator.vibrate?.(60)
              return report.current(hit.rawValue)
            }
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 200)
        }
        tick()
      } catch (e) {
        setError((e as Error).name === 'NotAllowedError' ? 'Camera permission was declined. Type the numbers instead.' : 'Couldn’t open the camera. Type the numbers instead.')
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={video} muted playsInline className="aspect-video w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
      </div>
      {error && <p className="text-sm text-(--c-deficient)">{error}</p>}
      <button onClick={onClose} className="text-sm text-(--muted) hover:text-(--fg)">
        Stop camera
      </button>
    </div>
  )
}
