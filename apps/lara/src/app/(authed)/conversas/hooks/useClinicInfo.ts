/**
 * useClinicInfo · nome da clinica + responsavel.
 *
 * P-08: Substitui hardcoded "Dra. Mirian" no transfer · multi-tenant safe.
 * Cache local · dados nao mudam dentro da sessao (1 fetch no mount).
 */

import { useState, useEffect } from 'react'

export interface ClinicInfo {
  id: string | null
  name: string
  responsibleName: string | null
}

const DEFAULTS: ClinicInfo = { id: null, name: 'Clínica', responsibleName: null }

export function useClinicInfo() {
  const [clinic, setClinic] = useState<ClinicInfo>(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    fetch('/api/clinic/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setClinic(data as ClinicInfo)
      })
      .catch(() => {
        // silencioso · fallback DEFAULTS · UI usa "a doutora" generico
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Helper · texto pra UI: "Dra. Mirian", "a doutora", "Dr. Carlos" etc.
   * Se responsibleName tem prefixo "Dra"/"Dr"/"Dr." mantem · senao acrescenta "Dra.".
   */
  function displayResponsible(): string {
    const raw = clinic.responsibleName?.trim()
    if (!raw) return 'a doutora'
    if (/^dr\.?a?\.?\s/i.test(raw)) return raw
    return `Dra. ${raw}`
  }

  return { clinic, displayResponsible }
}
