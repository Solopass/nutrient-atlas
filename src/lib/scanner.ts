import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'

/**
 * Camera barcode scanning. Uses the browser's built-in BarcodeDetector where
 * it exists (Chrome on Android, some desktops). Elsewhere (iPhone Safari,
 * Firefox, Windows) scanning needs a decoder the app doesn't ship: you can
 * switch on an optional free one in Settings, which your browser then
 * downloads from a public CDN the first time you scan. Nothing is bundled.
 */

export const SCANNER_ADDON_SETTING = 'scannerAddon'
export const SCANNER_ADDON = {
  name: 'barcode-detector',
  version: '3.2.2',
  license: 'MIT',
  engine: 'ZXing',
  homepage: 'https://github.com/Sec-ant/barcode-detector',
  // The "pure" build exports the class without patching window.
  url: 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/pure/+esm',
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
type DetectorClass = { new (opts?: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> }

/** native: built in · addon: optional scanner switched on · addonOff: could use it · insecure: needs https · noCamera */
export type ScanSupport = 'native' | 'addon' | 'addonOff' | 'insecure' | 'noCamera'

const nativeClass = () => (typeof window !== 'undefined' && 'BarcodeDetector' in window ? ((window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector) : null)

/** Some desktop browsers expose BarcodeDetector but support no formats; treat those as not built in. */
async function nativeReady() {
  const C = nativeClass()
  if (!C) return false
  try {
    return C.getSupportedFormats ? (await C.getSupportedFormats()).some((f) => FORMATS.includes(f)) : true
  } catch {
    return false
  }
}

export async function scanSupport(addonOn: boolean): Promise<ScanSupport> {
  if (!window.isSecureContext) return 'insecure'
  if (!navigator.mediaDevices?.getUserMedia) return 'noCamera'
  if (await nativeReady()) return 'native'
  return addonOn ? 'addon' : 'addonOff'
}

export const scannerAddonOn = async () => (await db.settings.get(SCANNER_ADDON_SETTING))?.value === true

/** Current support; null while checking. Follows the Settings switch live. */
export function useScanSupport(): ScanSupport | null {
  const addonOn = useLiveQuery(scannerAddonOn, [])
  const [support, setSupport] = useState<ScanSupport | null>(null)
  useEffect(() => {
    if (addonOn === undefined) return
    let live = true
    scanSupport(addonOn).then((s) => live && setSupport(s))
    return () => {
      live = false
    }
  }, [addonOn])
  return support
}

let addonClass: Promise<DetectorClass> | null = null

/** A detector for barcodes on food packaging; loads the optional scanner on first use when needed. */
export async function createDetector(support: ScanSupport): Promise<Detector> {
  if (support === 'native') return new (nativeClass()!)({ formats: FORMATS })
  if (support !== 'addon') throw new Error('Camera scanning isn’t available in this browser.')
  addonClass ??= import(/* @vite-ignore */ SCANNER_ADDON.url)
    .then((m: { BarcodeDetector: DetectorClass }) => m.BarcodeDetector)
    .catch((e) => {
      addonClass = null // let a later try download it again
      throw new Error(navigator.onLine ? `Couldn’t load the scanner add-on (${(e as Error).message}).` : 'The scanner add-on downloads the first time you scan; that needs the internet.')
    })
  return new (await addonClass)({ formats: FORMATS })
}

/** What to tell people who can't scan, or null when they can. */
export function scanHint(support: ScanSupport | null): string | null {
  if (support === 'insecure') return 'Camera scanning needs a secure (https) address, which comes with hosting. Typing the number works now.'
  if (support === 'noCamera') return 'No camera found. Type the number under the bars instead.'
  if (support === 'addonOff') return 'This browser has no built-in barcode reader (iPhone Safari, Firefox, Windows). Type the number, or switch on the free scanner add-on in Settings → Food databases.'
  return null
}
