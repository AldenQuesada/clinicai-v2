/**
 * Button · atomo · botao da marca Mirian de Paula.
 *
 * Spec do brandbook (docs/brandbook-mirian-de-paula.md secao 17 + brandbook.html):
 *   - border-radius: 2px (nao pill 999px · anti-padrao)
 *   - padding: 12-16px / 24-32px
 *   - font: Montserrat 600, letter-spacing 1.8px, UPPERCASE, 11-13px
 *   - transition: .35s cubic-bezier(.2,.8,.2,1)
 *   - hover gold: translateY(-2px) + box-shadow champagne
 *
 * Variantes:
 *   - gold   · CTA primario · bg champagne, text dark
 *   - ghost  · secundario · transparent + border
 *   - text   · terciario · sem border, hover muda cor
 *   - danger · destrutivo · sem bg, hover red
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'gold' | 'ghost' | 'text' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  children: ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  gold:
    'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))] hover:bg-[#DFC5A0] hover:border-[#DFC5A0] hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(201,169,110,0.3)]',
  ghost:
    'bg-transparent text-[hsl(var(--foreground))] border-[hsl(var(--foreground))]/30 hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]',
  text:
    'bg-transparent border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
  danger:
    'bg-transparent border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/5',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-4 py-2 text-[10px] gap-2',
  md: 'px-6 py-3 text-[11px] gap-2.5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'gold', size = 'md', icon, children, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      {...props}
      className={`inline-flex items-center justify-center font-display-uppercase tracking-[0.15em] border rounded-[2px] transition-all duration-[350ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {icon}
      {children}
    </button>
  )
})
