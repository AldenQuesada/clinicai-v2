/**
 * SelectField · molecula · select padrao Mira (.b2b-field/.b2b-input).
 */

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
    <div className="b2b-field">
      <label htmlFor={`field-${name}`} className="b2b-field-lbl">
        {label}
        {required && <em> *</em>}
      </label>
      <select
        id={`field-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="b2b-input"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.description ? ` · ${opt.description}` : ''}
          </option>
        ))}
      </select>
      {helper && (
        <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          {helper}
        </div>
      )}
    </div>
  )
}
