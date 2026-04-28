'use client'

/**
 * PromptSidebarItem · linha clicavel da sidebar de prompts · padrao Mira.
 * Active: bg champagne 8%, border-left champagne, color ivory.
 */

export function PromptSidebarItem({
  label,
  hasOverride,
  overrideLength,
  defaultLength,
  active,
  onClick,
}: {
  label: string
  hasOverride: boolean
  overrideLength: number
  defaultLength: number
  active: boolean
  onClick: () => void
}) {
  const deltaPct =
    hasOverride && defaultLength > 0
      ? Math.round((Math.abs(overrideLength - defaultLength) / defaultLength) * 100)
      : 0

  return (
    <button
      type="button"
      onClick={onClick}
      title={hasOverride ? `Override · ${deltaPct}% diff vs default` : 'Padrão (filesystem)'}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        marginBottom: 1,
        borderRadius: 4,
        background: active ? 'rgba(201, 169, 110, 0.08)' : 'transparent',
        border: 'none',
        borderLeft: active ? '2px solid var(--b2b-champagne)' : '2px solid transparent',
        color: active ? 'var(--b2b-ivory)' : 'var(--b2b-text-dim)',
        fontSize: 12,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--b2b-bg-2)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          flexShrink: 0,
          background: hasOverride ? 'var(--b2b-champagne)' : 'transparent',
          border: hasOverride ? 'none' : '1px solid var(--b2b-border-strong)',
        }}
      />
      <span style={{ flex: 1, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  )
}
