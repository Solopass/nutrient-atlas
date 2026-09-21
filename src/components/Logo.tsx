export function Logo() {
  const colors = ['var(--c-good)', 'var(--c-above)', 'var(--c-attention)', 'var(--c-good)', 'var(--c-deficient)', 'var(--c-above)']
  return (
    <svg viewBox="-20 -20 40 40" className="size-9" aria-hidden>
      {colors.map((c, i) => {
        const a0 = (i * 60 - 90 + 4) * (Math.PI / 180)
        const a1 = ((i + 1) * 60 - 90 - 4) * (Math.PI / 180)
        const r = [17, 13, 15, 18, 10, 14][i]
        return (
          <path
            key={i}
            d={`M${5 * Math.cos(a0)} ${5 * Math.sin(a0)}L${r * Math.cos(a0)} ${r * Math.sin(a0)}A${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}L${5 * Math.cos(a1)} ${5 * Math.sin(a1)}Z`}
            fill={c}
            opacity="0.9"
          />
        )
      })}
    </svg>
  )
}
