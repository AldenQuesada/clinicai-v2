/**
 * NumericField · molecula · input numerico com prefix/suffix + helper.
 *
 * Compoe atoms: <label>, <input>, <HelperText>.
 * Usado em /configuracoes pros 6 knobs.
 */

import { HelperText } from '@/components/atoms/HelperText'

export function NumericField({
  name,
  label,
  defaultValue,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  helper,
  required = false,
}: {
  name: string
  label: string
  defaultValue: number
  min?: number
  max?: number
  step?: number
  prefix?: string
  suffix?: string
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

      <div className="relative flex items-stretch rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] focus-within:border-[hsl(var(--primary))] transition-colors">
        {prefix && (
          <span className="flex items-center pl-3 pr-1 text-xs text-[hsl(var(--muted-foreground))] font-mono select-none">
            {prefix}
          </span>
        )}
        <input
          id={`field-${name}`}
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={min}
          max={max}
          step={step}
          required={required}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] tabular-nums focus:outline-none"
        />
        {suffix && (
          <span className="flex items-center pr-3 pl-1 text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider select-none">
            {suffix}
          </span>
        )}
      </div>

      {helper && <HelperText>{helper}</HelperText>}
    </div>
  )
}
