import { useEffect, useRef, useState } from 'react'
import { parseBarcodeQuery } from '../lib/barcode'
import { createDetector, type ScanSupport } from '../lib/scanner'

/** Live rear-camera preview that reports the first valid barcode it sees. */
export function CameraScanner({ support, onCode, onClose }: { support: ScanSupport; onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<string | null>(support === 'addon' ? 'Loading the scanner…' : null)
  const [error, setError] = useState<string | null>(null)
  // Latest callback in a ref, so a parent re-render doesn't restart the camera.
  const report = useRef(onCode)
  report.current = onCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let timer = 0
    ;(async () => {
      try {
        const detector = await createDetector(support)
        if (stopped) return
        setStatus(null)
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        video.current!.srcObject = stream
        await video.current!.play()
        const tick = async () => {
          if (stopped) return
          try {
            const [hit] = await detector.detect(video.current!)
            const code = hit?.rawValue && parseBarcodeQuery(hit.rawValue)
            if (code) {
              navigator.vibrate?.(60)
              return report.current(code)
            }
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 200)
        }
        tick()
      } catch (e) {
        setStatus(null)
        const name = (e as Error).name
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was declined. Allow it in the browser’s site settings, or type the number.'
            : name === 'NotFoundError'
              ? 'No camera found. Type the number instead.'
              : (e as Error).message || 'Couldn’t open the camera. Type the number instead.',
        )
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [support])

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={video} muted playsInline aria-label="Camera preview" className="aspect-[4/3] w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
        {status && <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/80">{status}</p>}
      </div>
      {error && <p className="text-sm text-(--c-deficient)">{error}</p>}
      <div className="flex items-center justify-between text-xs text-(--muted)">
        <span>Hold the barcode inside the box.</span>
        <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:text-(--fg)">
          Stop camera
        </button>
      </div>
    </div>
  )
}
