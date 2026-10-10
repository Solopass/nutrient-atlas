/** Save text as a file through the browser's download flow. */
export function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  // Revoking right away can cancel the download in Firefox and Safari.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * On phones and tablets, open the share sheet so the file can go to Files,
 * Google Drive, iCloud Drive, email… (downloads are awkward there). Elsewhere,
 * or if sharing isn't possible, download it. "cancelled" when the person
 * closed the share sheet.
 */
export async function shareOrDownload(blob: Blob, filename: string, title = 'Nutrient Atlas'): Promise<SaveResult> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // e.g. NotAllowedError when the tap is too long ago: fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'downloaded'
}

/** Will saving a file open the share sheet here (phones and tablets that support it)? */
export const sharesFiles = () =>
  typeof navigator !== 'undefined' &&
  matchMedia('(pointer: coarse)').matches &&
  !!navigator.canShare?.({ files: [new File([''], 'x.json', { type: 'application/json' })] })
