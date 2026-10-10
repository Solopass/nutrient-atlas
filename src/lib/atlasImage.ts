export { shareOrDownload } from './download'
/**
 * Render the Atlas SVG to a PNG. The chart's colours come from CSS variables,
 * which don't exist once the SVG is drawn as an image, so every element's
 * computed paint is copied inline onto a clone first.
 */

const PAINT = ['fill', 'stroke', 'fill-opacity', 'stroke-opacity', 'opacity', 'stop-color', 'stop-opacity', 'font-family', 'font-weight', 'letter-spacing'] as const

function inlineStyles(src: SVGSVGElement) {
  const clone = src.cloneNode(true) as SVGSVGElement
  const from = [src, ...src.querySelectorAll('*')]
  const to = [clone, ...clone.querySelectorAll('*')]
  from.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const target = to[i] as SVGElement
    for (const p of PAINT) target.style.setProperty(p, cs.getPropertyValue(p))
    target.style.removeProperty('transition')
    target.style.removeProperty('animation')
  })
  // Motion-only and interactive-only bits don't belong in a still image.
  clone.querySelectorAll('.atlas-sweep, desc').forEach((el) => el.remove())
  clone.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'))
  return clone
}

export interface SnapshotInfo {
  title: string
  subtitle: string
  score: number
  scoreColor: string
}

export async function atlasPng(svg: SVGSVGElement, info: SnapshotInfo, size = 1400): Promise<Blob> {
  const clone = inlineStyles(svg)
  const [, , vw, vh] = (svg.getAttribute('viewBox') ?? '0 0 900 900').split(/\s+/).map(Number)
  clone.setAttribute('width', String(size))
  clone.setAttribute('height', String(Math.round((size * vh) / vw)))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not draw the chart'))
      img.src = url
    })
    const css = getComputedStyle(document.documentElement)
    const header = 150
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = img.height + header + 60
    const ctx = canvas.getContext('2d')!
    const bg = ctx.createRadialGradient(size / 2, header + img.height / 2, 0, size / 2, header + img.height / 2, size * 0.75)
    bg.addColorStop(0, css.getPropertyValue('--glow').trim() || '#101a2b')
    bg.addColorStop(1, css.getPropertyValue('--bg').trim() || '#080b11')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const sans = `'Inter Variable', system-ui, sans-serif`
    const mono = `'JetBrains Mono Variable', ui-monospace, monospace`
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = css.getPropertyValue('--fg').trim()
    ctx.font = `600 52px ${sans}`
    ctx.fillText(info.title, 64, 92)
    ctx.fillStyle = css.getPropertyValue('--muted').trim()
    ctx.font = `400 28px ${sans}`
    ctx.fillText(info.subtitle, 64, 132)
    ctx.textAlign = 'right'
    ctx.fillStyle = info.scoreColor
    ctx.font = `700 76px ${mono}`
    ctx.fillText(`${Math.round(info.score)}%`, size - 64, 104)
    ctx.fillStyle = css.getPropertyValue('--muted').trim()
    ctx.font = `500 20px ${sans}`
    ctx.fillText('NOURISHMENT SCORE', size - 64, 134)

    ctx.drawImage(img, 0, header)
    ctx.textAlign = 'center'
    ctx.font = `400 20px ${sans}`
    ctx.fillText('Nutrient Atlas', size / 2, canvas.height - 26)

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

