'use client'

/**
 * AlertBell · CRM_PHASE_2G + 2ALEXA.1 polish.
 *
 * Origem: tabela `appointment_internal_alerts` (mig 161 · CRM_PHASE_2G).
 *
 * Comportamento (2G base):
 * - Bell com badge se `unreadCount > 0` (badge mostra "9+" se >9).
 * - Click abre dropdown com até 50 alertas não-lidos mais recentes.
 * - "Marcar como lido" botão por item (RPC mark_read · otimismo + refetch on fail).
 * - Polling a cada 30s via `useAppointmentInternalAlerts`.
 * - Click fora do dropdown fecha.
 *
 * Polish 2ALEXA.1:
 * - Destaque visual emerald para `arrival` (cor + badge verde + linha destacada)
 * - Tempo decorrido inline ("há 2 min" / "há 15 min" / "há 1h")
 *   atualizado a cada 30s via state local · não requer polling extra
 * - Botão/link "Abrir" → /crm/agenda/[appointment_id] (sem mutação)
 * - Toggle "Som local" no header do dropdown · persistência só de PREFERÊNCIA UI
 *   via localStorage · Web Audio API · zero provider externo · zero fonte
 *   operacional. Som dispara apenas quando NOVO alerta `arrival` aparece (diff
 *   vs lista anterior). Falha silenciosa se Web Audio não disponível.
 * - Agrupamento: "Chegadas agora" (arrival) primeiro · depois "Outros alertas"
 *
 * Zero WhatsApp · zero provider · zero side-effect operacional.
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Check,
  CalendarClock,
  UserCheck,
  AlertCircle,
  Volume2,
  VolumeX,
  ArrowRight,
} from 'lucide-react'
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

const SOUND_PREF_KEY = 'crm_alertbell_sound_v1'

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

/**
 * Formata diferença entre agora e ISO em PT-BR.
 * Sem precisão de segundos · "agora mesmo", "há Xmin", "há Xh", "há Xd".
 */
function elapsedLabel(fromIso: string | null | undefined, now: number): string | null {
  if (!fromIso) return null
  let ts: number
  try {
    ts = new Date(fromIso).getTime()
  } catch {
    return null
  }
  if (!Number.isFinite(ts)) return null
  const diffMs = now - ts
  if (diffMs < 0) return null
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'agora mesmo'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
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

/**
 * Hook simples: re-renderiza a cada 30s para atualizar `elapsedLabel`.
 * Zero polling adicional · só força recompute do label.
 */
function useTicker(intervalMs: number = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Beep curto via Web Audio API · zero arquivo externo · zero provider.
 * Falha silenciosa se API não disponível ou sem gesture de user.
 */
function playLocalBeep() {
  if (typeof window === 'undefined') return
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const AudioCtx = W.AudioContext ?? W.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880 // A5
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
    osc.onended = () => {
      try {
        ctx.close()
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore · som é nice-to-have
  }
}

function readSoundPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) === '1'
  } catch {
    return false
  }
}

function writeSoundPref(on: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? '1' : '0')
  } catch {
    // ignore
  }
}

export function AlertBell() {
  const { items, unreadCount, markAsRead } = useAppointmentInternalAlerts()
  const [open, setOpen] = useState(false)
  const [soundOn, setSoundOn] = useState<boolean>(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const previousArrivalIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef<boolean>(false)
  const now = useTicker(30_000)

  // Hidrata preferência de som do localStorage no mount (client-only)
  useEffect(() => {
    setSoundOn(readSoundPref())
  }, [])

  // Detecta novos arrivals · toca beep se preferência ativa
  useEffect(() => {
    const currentArrivalIds = new Set(
      items.filter((a) => a.alert_kind === 'arrival').map((a) => a.id),
    )

    if (!initializedRef.current) {
      previousArrivalIdsRef.current = currentArrivalIds
      initializedRef.current = true
      return
    }

    const previous = previousArrivalIdsRef.current
    let hasNew = false
    for (const id of currentArrivalIds) {
      if (!previous.has(id)) {
        hasNew = true
        break
      }
    }

    if (hasNew && soundOn) {
      playLocalBeep()
    }

    previousArrivalIdsRef.current = currentArrivalIds
  }, [items, soundOn])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // Separa arrival vs outros · arrivals destacados primeiro
  const { arrivals, others } = useMemo(() => {
    const arr: AppointmentInternalAlertItem[] = []
    const oth: AppointmentInternalAlertItem[] = []
    for (const a of items) {
      if (a.alert_kind === 'arrival') arr.push(a)
      else oth.push(a)
    }
    return { arrivals: arr, others: oth }
  }, [items])

  const title =
    unreadCount > 0
      ? `${unreadCount} alerta${unreadCount !== 1 ? 's' : ''} de agenda · click para abrir`
      : 'Nenhum alerta de agenda pendente'

  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount)

  function toggleSound() {
    setSoundOn((prev) => {
      const next = !prev
      writeSoundPref(next)
      // Triggers ctx user-gesture · primeira ativação produz beep de feedback
      if (next) {
        playLocalBeep()
      }
      return next
    })
  }

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
              background: arrivals.length > 0 ? '#10b981' : '#dc2626',
              color: 'white',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            aria-label={
              arrivals.length > 0
                ? `${arrivals.length} chegada${arrivals.length !== 1 ? 's' : ''}`
                : `${unreadCount} alertas`
            }
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
            width: 420,
            maxHeight: 520,
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>
              Alertas de agenda · {unreadCount} pendente{unreadCount !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={toggleSound}
              title={soundOn ? 'Desligar som local' : 'Ligar som local de chegada'}
              aria-label={soundOn ? 'Desligar som local' : 'Ligar som local'}
              aria-pressed={soundOn}
              className="p-1.5 rounded-md transition-colors text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            >
              {soundOn ? (
                <Volume2 className="w-3.5 h-3.5" strokeWidth={1.6} />
              ) : (
                <VolumeX className="w-3.5 h-3.5" strokeWidth={1.6} />
              )}
              <span>{soundOn ? 'Som on' : 'Som off'}</span>
            </button>
          </div>

          {items.length === 0 ? (
            <div
              style={{
                padding: '24px 14px',
                fontSize: 12,
                color: 'var(--b2b-border, rgba(255,255,255,0.5))',
                textAlign: 'center',
              }}
            >
              Sem alertas no momento.
            </div>
          ) : (
            <>
              {arrivals.length > 0 && (
                <>
                  <GroupHeader label="Chegadas agora" tone="ok" count={arrivals.length} />
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {arrivals.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        now={now}
                        onMarkRead={() => markAsRead(alert.id)}
                      />
                    ))}
                  </ul>
                </>
              )}
              {others.length > 0 && (
                <>
                  {arrivals.length > 0 && (
                    <GroupHeader label="Outros alertas" count={others.length} />
                  )}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {others.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        now={now}
                        onMarkRead={() => markAsRead(alert.id)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GroupHeader({
  label,
  tone,
  count,
}: {
  label: string
  tone?: 'ok'
  count: number
}) {
  return (
    <div
      style={{
        padding: '6px 14px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: tone === 'ok' ? '#10b981' : 'var(--b2b-border, rgba(255,255,255,0.55))',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid var(--b2b-border, rgba(255,255,255,0.05))',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>{label}</span>
      <span>{count}</span>
    </div>
  )
}

function AlertRow({
  alert,
  now,
  onMarkRead,
}: {
  alert: AppointmentInternalAlertItem
  now: number
  onMarkRead: () => void
}) {
  const Icon = kindIcon(alert.alert_kind)
  const subject = pickPayloadString(alert.payload, ['subject_name'])
  const scheduledDate = pickPayloadString(alert.payload, ['scheduled_date'])
  const startTime = pickPayloadString(alert.payload, ['start_time'])
  const professionalName = pickPayloadString(alert.payload, ['professional_name'])
  const procedureName = pickPayloadString(alert.payload, ['procedure_name'])
  const chegadaEm = pickPayloadString(alert.payload, ['chegada_em'])
  const kindLabel = ALERT_KIND_LABEL[alert.alert_kind] ?? alert.alert_kind
  const targetLabel = TARGET_ROLE_LABEL[alert.target_role] ?? alert.target_role
  const isArrival = alert.alert_kind === 'arrival'

  // Tempo decorrido · chegada_em do payload se houver · senão created_at do alerta
  const elapsedFromIso = chegadaEm ?? alert.created_at
  const elapsed = elapsedLabel(elapsedFromIso, now)

  // Cor + background do ícone por tipo
  const iconBg = isArrival
    ? 'rgba(16,185,129,0.12)'
    : alert.alert_kind === 'attention_required'
      ? 'rgba(220,38,38,0.12)'
      : 'rgba(245,158,11,0.10)'
  const iconColor = isArrival
    ? '#10b981'
    : alert.alert_kind === 'attention_required'
      ? '#dc2626'
      : '#f59e0b'

  const rowBg = isArrival ? 'rgba(16,185,129,0.04)' : 'transparent'

  return (
    <li
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--b2b-border, rgba(255,255,255,0.05))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: rowBg,
      }}
    >
      <div
        style={{
          marginTop: 2,
          width: 26,
          height: 26,
          borderRadius: 6,
          background: iconBg,
          color: iconColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: isArrival ? '#10b981' : 'var(--b2b-ivory, #e5e5e5)',
            marginBottom: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{kindLabel}</span>
          <span style={{ color: 'var(--b2b-border, rgba(255,255,255,0.55))', fontWeight: 500 }}>
            · {targetLabel}
          </span>
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
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            alignItems: 'center',
          }}
        >
          {elapsed && (
            <span
              style={{
                fontWeight: isArrival ? 600 : 400,
                color: isArrival ? '#10b981' : 'var(--b2b-border, rgba(255,255,255,0.7))',
              }}
            >
              {elapsed}
            </span>
          )}
          {scheduledDate && (
            <>
              <span>·</span>
              <span>{scheduledDate}{startTime ? ` ${startTime.slice(0, 5)}` : ''}</span>
            </>
          )}
          {professionalName && (
            <>
              <span>·</span>
              <span>{professionalName}</span>
            </>
          )}
          <span>· criado {fmtBRT(alert.created_at)}</span>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: 'flex-end',
        }}
      >
        <Link
          href={`/crm/agenda/${alert.appointment_id}`}
          title={isArrival ? 'Abrir atendimento' : 'Abrir agendamento'}
          aria-label={isArrival ? 'Abrir atendimento' : 'Abrir agendamento'}
          className="p-1.5 rounded-md transition-colors text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 10,
            fontWeight: 600,
            color: isArrival ? '#10b981' : undefined,
          }}
        >
          <span>{isArrival ? 'Abrir' : 'Ver'}</span>
          <ArrowRight className="w-3 h-3" strokeWidth={2} />
        </Link>
        <button
          type="button"
          onClick={onMarkRead}
          title="Marcar como lido"
          aria-label="Marcar como lido"
          className="p-1 rounded-md transition-colors text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </li>
  )
}
