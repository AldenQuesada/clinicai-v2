'use client'

/**
 * Recovery Radar · hook da UI · Prompt 5 (read-only + IA dry-run-only).
 *
 * - Lista findings via GET /api/secretaria/recovery/findings (RPC list).
 * - Gera sugestões via POST /api/secretaria/recovery/enrich com dry_run:false/
 *   force:true DE PROPÓSITO → valida que a resposta volta dry_run:true e
 *   persisted:0 (prova que a rota ignora). Sugestões ficam SÓ em state local.
 *
 * NÃO grava nada. NÃO envia WhatsApp. NÃO muda status.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface RadarFinding {
  id: string
  conversation_id: string
  lead_id: string | null
  phone: string | null
  lead_name: string | null
  failure_type: string
  all_failure_types: string[] | null
  priority: string
  recovery_score: number
  candidate_reason: string | null
  evidence: Array<{ at?: string; who?: string; excerpt?: string }> | null
  status: string
}

export interface RadarSuggestion {
  finding_id: string
  should_contact: boolean
  role: string
  suggested_action: string
  suggested_message: string | null
  reason: string
  risk_flags: string[]
  recommended_owner: string
  action_deadline_hours: number | null
  confidence: number
}

interface EnrichResponse {
  dry_run: boolean
  eligible: number
  processed: number
  persisted: number
  items: Array<{ finding_id: string; suggestion?: RadarSuggestion; error?: string }>
}

export type PriorityFilter = 'all' | 'P0' | 'P1' | 'P2'

export function useRecoveryRadar() {
  const [findings, setFindings] = useState<RadarFinding[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')

  const [suggestionsByFindingId, setSuggestionsByFindingId] = useState<Record<string, RadarSuggestion>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generatedCount, setGeneratedCount] = useState(0)

  const stoppedRef = useRef(false)

  const fetchFindings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // sempre status=open na v1 · prioridade aplicada server-side quando != all
      const params = new URLSearchParams({ status: 'open', limit: '50' })
      const res = await fetch(`/api/secretaria/recovery/findings?${params.toString()}`)
      const ct = res.headers.get('content-type') || ''
      if (!res.ok || !ct.includes('application/json')) {
        if (!stoppedRef.current) setError('Não foi possível carregar o Radar agora.')
        return
      }
      const data = (await res.json()) as { items: RadarFinding[] }
      if (!stoppedRef.current) {
        setFindings(Array.isArray(data.items) ? data.items : [])
      }
    } catch {
      if (!stoppedRef.current) setError('Não foi possível carregar o Radar agora.')
    } finally {
      if (!stoppedRef.current) {
        setIsLoading(false)
        setHasFetched(true)
      }
    }
  }, [])

  useEffect(() => {
    stoppedRef.current = false
    fetchFindings()
    return () => {
      stoppedRef.current = true
    }
  }, [fetchFindings])

  /** Gera sugestões para os 3 P0 mais urgentes (dry-run-only · não grava). */
  const generateP0 = useCallback(async () => {
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/secretaria/recovery/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // dry_run:false / force:true DE PROPÓSITO · a rota deve ignorar e voltar dry_run:true
        body: JSON.stringify({ priority: ['P0'], limit: 3, dry_run: false, force: true }),
      })
      if (!res.ok) {
        if (res.status === 402) setGenerateError('Orçamento de IA do dia esgotado.')
        else setGenerateError('Falha ao gerar sugestões.')
        return
      }
      const data = (await res.json()) as EnrichResponse
      // TRAVA DE SEGURANÇA: só aceita se for comprovadamente dry-run e nada persistido
      if (data.dry_run !== true || data.persisted !== 0) {
        setGenerateError('Resposta insegura (não-dry-run) — sugestões descartadas.')
        return
      }
      const next: Record<string, RadarSuggestion> = {}
      let count = 0
      for (const item of data.items || []) {
        if (item.suggestion) {
          next[item.finding_id] = item.suggestion
          count++
        }
      }
      setSuggestionsByFindingId((prev) => ({ ...prev, ...next }))
      setGeneratedCount((c) => c + count)
    } catch {
      setGenerateError('Falha ao gerar sugestões.')
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const filtered = useMemo(() => {
    if (priorityFilter === 'all') return findings
    return findings.filter((f) => f.priority === priorityFilter)
  }, [findings, priorityFilter])

  const kpis = useMemo(() => {
    const open = findings.length
    const p0 = findings.filter((f) => f.priority === 'P0').length
    const p1 = findings.filter((f) => f.priority === 'P1').length
    return { open, p0, p1, generated: generatedCount }
  }, [findings, generatedCount])

  return {
    findings: filtered,
    allCount: findings.length,
    isLoading,
    error,
    hasFetched,
    refresh: fetchFindings,
    priorityFilter,
    setPriorityFilter,
    suggestionsByFindingId,
    generateP0,
    isGenerating,
    generateError,
    kpis,
  }
}
