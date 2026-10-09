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
