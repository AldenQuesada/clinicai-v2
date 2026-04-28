/**
 * SelectField · molecula · select com label + helper.
 * Compoe atoms: <label>, <select>, <HelperText>.
 */

import { ChevronDown } from 'lucide-react'
import { HelperText } from '@/components/atoms/HelperText'

export interface SelectOption {
  value: string
  label: string
  description?: string
}

export function SelectField({
  name,
  label,
  defaultValue,
  options,
  helper,
  required = false,
}: {
  name: string
  label: string
  defaultValue: string
  options: SelectOption[]
  helper?: React.ReactNode
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={`field-${name}`}
        className="block text-[10px] uppercase tracking-widest font-display-uppercase text-[hsl(var(--muted-foreground))]"
      >
        {label}
      </label>

      <div className="relative">
        <select
          id={`field-${name}`}
          name={name}
          defaultValue={defaultValue}
          required={required}
          className="w-full appearance-none rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] px-3 pr-9 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] transition-colors cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
              {opt.description ? ` · ${opt.description}` : ''}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]"
        />
      </div>

      {helper && <HelperText>{helper}</HelperText>}
    </div>
  )
}
