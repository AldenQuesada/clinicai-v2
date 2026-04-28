/**
 * NumericField · molecula · input numerico padrao Mira (.b2b-field/.b2b-input).
 * Suffix opcional inline (ex: "msgs", "min", "USD") · prefix idem ($).
 */

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
    <div className="b2b-field">
      <label htmlFor={`field-${name}`} className="b2b-field-lbl">
        {label}
        {required && <em> *</em>}
      </label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
        {prefix && (
          <span
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 12,
              color: 'var(--b2b-text-muted)',
              fontFamily: 'ui-monospace, monospace',
              pointerEvents: 'none',
            }}
          >
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
          className="b2b-input"
          style={{
            paddingLeft: prefix ? 26 : undefined,
            paddingRight: suffix ? 56 : undefined,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        {suffix && (
          <span
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'var(--b2b-text-muted)',
              pointerEvents: 'none',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
      {helper && (
        <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          {helper}
        </div>
      )}
    </div>
  )
}
