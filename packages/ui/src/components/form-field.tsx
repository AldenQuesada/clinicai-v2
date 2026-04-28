/**
 * FormField · wrapper Label + Input/Select/Textarea + erro inline.
 *
 * Pattern de erro: caller passa `error?: string | string[]` que vem de
 * Zod fieldErrors (Result.details.issues.fieldErrors[name]) OU de outra
 * fonte.
 *
 * Uso:
 *   <FormField label="Telefone" htmlFor="phone" error={errors?.phone} required>
 *     <Input id="phone" name="phone" defaultValue={lead.phone} />
 *   </FormField>
 *
 *   <FormField label="Status" htmlFor="status">
 *     <Select id="status" name="status" defaultValue="active">
 *       <option value="active">Ativo</option>
 *       <option value="inactive">Inativo</option>
 *     </Select>
 *   </FormField>
 *
 *   <FormField label="Observacoes" htmlFor="notes">
 *     <Textarea id="notes" name="notes" rows={4} />
 *   </FormField>
 */

import * as React from 'react'
import { cn } from '../lib/cn'

interface FormFieldProps {
  label: string
  htmlFor: string
  /** Erros de Zod (`fieldErrors[name]` retorna string[]) ou string solta */
  error?: string | string[] | undefined
  required?: boolean
  /** Hint helper text · sumiu se error setado (erro tem prioridade) */
  hint?: string
  className?: string
  children: React.ReactNode
}

export function FormField({
  label,
  htmlFor,
  error,
  required,
  hint,
  className,
  children,
}: FormFieldProps) {
  const errorMsg = Array.isArray(error) ? error[0] : error
  const hasError = !!errorMsg

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]"
      >
        {label}
        {required && (
          <span className="ml-1 text-[var(--destructive)]" aria-label="obrigatorio">
            *
          </span>
        )}
      </label>
      {children}
      {hasError ? (
        <p className="text-xs text-[var(--destructive)]" role="alert">
          {errorMsg}
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      ) : null}
    </div>
  )
}

// ── Input · estilo Mirian luxury ────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)] transition-colors',
          'placeholder:text-[var(--muted-foreground)]/50',
          'focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/30',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid
            ? 'border-[var(--destructive)] focus-visible:border-[var(--destructive)] focus-visible:ring-[var(--destructive)]/30'
            : 'border-[var(--border)]',
          className,
        )}
        {...props}
      />
    )
  },
)

// ── Select · estilo Mirian luxury ───────────────────────────────────────────

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)] transition-colors',
          'focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/30',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid
            ? 'border-[var(--destructive)] focus-visible:border-[var(--destructive)] focus-visible:ring-[var(--destructive)]/30'
            : 'border-[var(--border)]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    )
  },
)

// ── Textarea · estilo Mirian luxury ─────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-[80px] rounded-md border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors',
          'placeholder:text-[var(--muted-foreground)]/50',
          'focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/30',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'resize-y',
          invalid
            ? 'border-[var(--destructive)] focus-visible:border-[var(--destructive)] focus-visible:ring-[var(--destructive)]/30'
            : 'border-[var(--border)]',
          className,
        )}
        {...props}
      />
    )
  },
)
