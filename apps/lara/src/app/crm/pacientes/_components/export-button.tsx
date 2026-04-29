'use client'

/**
 * ExportButton · client wrapper que chama exportPatientsCsvAction · faz
 * download do CSV via Blob + URL.createObjectURL.
 *
 * Filter status passado como prop (do URL params no Server Component pai).
 */

import * as React from 'react'
import { Button, useToast } from '@clinicai/ui'
import { Download } from 'lucide-react'
import { exportPatientsCsvAction } from '../_actions'

interface ExportButtonProps {
  status?: 'active' | 'inactive' | 'blocked' | 'deceased' | null
}

export function ExportButton({ status }: ExportButtonProps) {
  const { fromResult, success, error } = useToast()
  const [busy, setBusy] = React.useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      const r = await exportPatientsCsvAction({ status: status ?? null })
      if (!r.ok) {
        if (r.error === 'empty_export') {
          error('Nenhum paciente pra exportar com filtros atuais')
        } else {
          fromResult(r)
        }
        return
      }
      // Trigger download · Blob + anchor click
      const blob = new Blob([r.data.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.data.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      success(`${r.data.count} pacientes exportados`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
      <Download className="h-4 w-4" />
      {busy ? 'Exportando…' : 'Exportar CSV'}
    </Button>
  )
}
