'use client'

/**
 * useAppointmentInternalAlerts · hook que consome a tabela
 * `appointment_internal_alerts` (mig 161 · CRM_PHASE_2G).
 *
 * Estratégia:
 * - Polling a cada 30s (simples · sem realtime nesta versão · 2G.3 pode
 *   adicionar `supabase.channel().on('postgres_changes', ...)`)
 * - SELECT direto via createBrowserClient · RLS multi-tenant filtra
 *   automaticamente pela clinic_id do JWT (policy app_alerts_select_same_clinic).
 * - markAsRead chama RPC `appointment_internal_alert_mark_read` (também
 *   RLS-scoped · só permite marcar alertas da mesma clinic).
 * - Limita a 50 alertas mais recentes não lidos (UX bell · não é página
 *   de histórico completo).
 *
 * Sem dependência de WhatsApp · sem worker · sem provider externo. Apenas
 * leitura SELECT + 1 UPDATE via RPC. Ban gate 2L preservado.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@clinicai/supabase/browser'

export interface AppointmentInternalAlertItem {
  id: string
  appointment_id: string
  alert_kind:
    | 'not_confirmed_d_minus_1'
    | 'not_confirmed_d_zero'
    | 'arrival'
    | 'next_patient'
    | 'attention_required'
    | string
  target_role: 'secretaria' | 'professional' | 'doctor' | 'admin' | string
  target_user_id: string | null
  payload: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  created_at: string
}

const POLL_INTERVAL_MS = 30_000

export function useAppointmentInternalAlerts() {
  const [items, setItems] = useState<AppointmentInternalAlertItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  const fetchAlerts = useCallback(async () => {
    if (!supabaseRef.current) supabaseRef.current = createBrowserClient()
    const supabase = supabaseRef.current

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any)
        .from('appointment_internal_alerts')
        .select(
          'id, appointment_id, alert_kind, target_role, target_user_id, payload, is_read, read_at, created_at',
        )
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50)

      if (err) {
        setError(err.message)
        setItems([])
        setUnreadCount(0)
        return
      }
      const rows = (data ?? []) as AppointmentInternalAlertItem[]
      setItems(rows)
      setUnreadCount(rows.length)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
    const id = setInterval(fetchAlerts, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchAlerts])

  const markAsRead = useCallback(
    async (alertId: string): Promise<boolean> => {
      if (!supabaseRef.current) supabaseRef.current = createBrowserClient()
      const supabase = supabaseRef.current

      // Otimismo: remove já da lista local
      setItems((prev) => prev.filter((a) => a.id !== alertId))
      setUnreadCount((prev) => Math.max(0, prev - 1))

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: err } = await (supabase as any).rpc(
          'appointment_internal_alert_mark_read',
          { p_alert_id: alertId },
        )
        if (err) {
          // Reverte otimismo · refetch
          await fetchAlerts()
          return false
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ok = ((data as any)?.ok ?? false) === true
        if (!ok) await fetchAlerts()
        return ok
      } catch {
        await fetchAlerts()
        return false
      }
    },
    [fetchAlerts],
  )

  return {
    items,
    unreadCount,
    isLoading,
    error,
    refresh: fetchAlerts,
    markAsRead,
  }
}
