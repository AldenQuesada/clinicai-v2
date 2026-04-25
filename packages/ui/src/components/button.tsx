/**
 * Button · estilo shadcn-like com variants da marca Mirian.
 * Champagne (primary) · Marfim (secondary) · Outline · Ghost · Destructive.
 *
 * Pronto pra ser substituído por `pnpm dlx shadcn@latest add button` no
 * monorepo init · padrão é compatível.
 */

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-sm font-display-uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--color-champagne-soft)] shadow-luxury-sm hover:-translate-y-px hover:shadow-luxury-md',
        secondary:
          'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--color-marfim-warm)]',
        outline:
          'border border-[var(--border)] bg-transparent hover:bg-[var(--color-border-soft)] text-[var(--foreground)]',
        ghost: 'hover:bg-[var(--color-border-soft)] text-[var(--foreground)]',
        destructive:
          'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90',
        link: 'text-[var(--primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
