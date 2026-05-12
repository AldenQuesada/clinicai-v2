'use client'

/**
 * AlertBell · bell + badge + dropdown de alertas internos da agenda.
 *
 * Origem: tabela `appointment_internal_alerts` (mig 161 · CRM_PHASE_2G).
 *
 * Comportamento:
 * - Bell com badge vermelho se `unreadCount > 0` (badge mostra "9+" se >9).
 * - Click abre dropdown com até 50 alertas não-lidos mais recentes.
 * - Cada item mostra: ícone do tipo, nome do paciente, data/hora, tipo do alerta.
 * - "Marcar como lido" botão por item (RPC mark_read · otimismo + refetch on fail).
 * - Polling a cada 30s via `useAppointmentInternalAlerts`.
 * - Click fora do dropdown fecha.
 *
 * Zero WhatsApp · zero provider · zero side-effect operacional.
 */

import { useEffect, useRef, useState } from 'react'
import { Bell, Check, CalendarClock, UserCheck, AlertCircle } from 'lucide-react'
import {
  useAppointmentInternalAlerts,
  type AppointmentInternalAlertItem,
} from '@/hooks/useAppointmentInternalAlerts'

const ALERT_KIND_LABEL: Record<string, string> = {
  not_confirmed_d_minus_1: 'Não confirmou (amanhã)',
  not_confirmed_d_zero: 'Não confirmou (hoje)',
  arrival: 'Paciente chegou',
  next_patient: 'Próximo paciente',
  attention_required: 'Atenção necessária',
}

const TARGET_ROLE_LABEL: Record<string, string> = {
  secretaria: 'Secretaria',
  professional: 'Profissional',
  doctor: 'Doutora',
  admin: 'Admin',
}

function kindIcon(kind: string) {
  if (kind === 'arrival') return UserCheck
  if (kind === 'attention_required') return AlertCircle
  return CalendarClock
}

function fmtBRT(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

function pickPayloadString(
  payload: Record<string, unknown> | undefined | null,
  keys: string[],
): string | null {
  if (!payload) return null
  for (const k of keys) {
    const v = payload[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

export function AlertBell() {
  const { items, unreadCount, markAsRead } = useAppointmentInternalAlerts()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const title =
    unreadCount > 0
      ? `${unreadCount} alerta${unreadCount !== 1 ? 's' : ''} de agenda · click para abrir`
      : 'Nenhum alerta de agenda pendente'

  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="menu"
        className="p-2 rounded-md transition-colors text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Bell className="w-4 h-4" strokeWidth={1.6} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 9999,
              background: '#dc2626',
              color: 'white',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 380,
            maxHeight: 440,
            overflowY: 'auto',
            background: 'var(--b2b-bg-1, #18181b)',
            border: '1px solid var(--b2b-border, rgba(255,255,255,0.08))',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,.35)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--b2b-border, rgba(255,255,255,0.08))',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--b2b-ivory, #e5e5e5)',
              letterSpacing: 0.3,
            }}
          >
            Alertas de agenda · {unreadCount} pendente{unreadCount !== 1 ? 's' : ''}
          </div>

          {items.length === 0 ? (
            <div
              style={{
                padding: '20px 14px',
                fontSize: 12,
                color: 'var(--b2b-border, rgba(255,255,255,0.5))',
                textAlign: 'center',
              }}
            >
              Sem alertas no momento.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onMarkRead={() => markAsRead(alert.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function AlertRow({
  alert,
  onMarkRead,
}: {
  alert: AppointmentInternalAlertItem
  onMarkRead: () => void
}) {
  const Icon = kindIcon(alert.alert_kind)
  const subject = pickPayloadString(alert.payload, ['subject_name'])
  const scheduledDate = pickPayloadString(alert.payload, ['scheduled_date'])
  const startTime = pickPayloadString(alert.payload, ['start_time'])
  const professionalName = pickPayloadString(alert.payload, ['professional_name'])
  const procedureName = pickPayloadString(alert.payload, ['procedure_name'])
  const kindLabel = ALERT_KIND_LABEL[alert.alert_kind] ?? alert.alert_kind
  const targetLabel = TARGET_ROLE_LABEL[alert.target_role] ?? alert.target_role

  return (
    <li
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--b2b-border, rgba(255,255,255,0.05))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <div
        style={{
          marginTop: 2,
          width: 22,
          height: 22,
          borderRadius: 6,
          background: 'rgba(245,158,11,0.10)',
          color: '#f59e0b',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon className="w-3.5 h-3.5" strokeWidth={1.6} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--b2b-ivory, #e5e5e5)',
            marginBottom: 2,
          }}
        >
          {kindLabel} · {targetLabel}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--b2b-ivory, #e5e5e5)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subject ?? 'Paciente sem nome'}
          {procedureName ? ` · ${procedureName}` : ''}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--b2b-border, rgba(255,255,255,0.55))',
          }}
        >
          {scheduledDate ?? ''}{startTime ? ` · ${startTime.slice(0, 5)}` : ''}
          {professionalName ? ` · ${professionalName}` : ''}
          {' · '}criado {fmtBRT(alert.created_at)}
        </div>
      </div>

      <button
        type="button"
        onClick={onMarkRead}
        title="Marcar como lido"
        aria-label="Marcar como lido"
        className="p-1.5 rounded-md transition-colors text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
        style={{ flexShrink: 0 }}
      >
        <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
      </button>
    </li>
  )
}
