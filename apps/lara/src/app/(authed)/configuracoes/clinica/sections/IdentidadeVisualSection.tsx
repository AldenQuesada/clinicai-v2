'use client'

/**
 * Section · Identidade Visual.
 * Port da subsecao Cores + Logos
 * (clinic-dashboard/index.html linhas 1105-1128).
 */

import type { ClinicSettingsData } from '../types'
import { CoresRepeater } from '../repeaters/CoresRepeater'
import { LogosRepeater } from '../repeaters/LogosRepeater'

export function IdentidadeVisualSection({
  data,
  onChange,
  canEdit,
  onError,
}: {
  data: ClinicSettingsData
  onChange: (patch: Partial<ClinicSettingsData>) => void
  canEdit: boolean
  onError?: (msg: string) => void
}) {
  const ro = !canEdit

  return (
    <section className="luxury-card" style={{ padding: '20px 24px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <CoresRepeater
          value={data.cores}
          onChange={(cores) => onChange({ cores })}
          disabled={ro}
        />
      </div>
      <LogosRepeater
        value={data.logos}
        onChange={(logos) => onChange({ logos })}
        disabled={ro}
        onError={onError}
      />
    </section>
  )
}
