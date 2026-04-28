/**
 * RomanNumeral · atomo · numero romano em Cormorant italic gold.
 * Marca de capitulo editorial (estilo manual/livraria).
 *
 * brandbook §22 evita: numeros arabicos, sans em titulos · use isto.
 */

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

export function RomanNumeral({
  n,
  size = 'md',
}: {
  n: number
  size?: 'sm' | 'md' | 'lg'
}) {
  const numeral = NUMERALS[n - 1] ?? String(n)
  const sizeClass = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-6xl',
  }[size]

  return (
    <span
      className={`font-[family-name:var(--font-cursive)] italic font-light text-[hsl(var(--primary))] leading-none tabular-nums ${sizeClass}`}
      aria-hidden
    >
      {numeral}
    </span>
  )
}
