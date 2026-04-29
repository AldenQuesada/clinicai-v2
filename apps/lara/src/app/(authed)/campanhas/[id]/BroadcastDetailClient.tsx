'use client'

/**
 * BroadcastDetailClient · stats em tempo real + lista de leads por segmento.
 *
 * Espelho do _renderBroadcastDetail (broadcast.ui.js linhas 621–727).
 *
 * Auto-refresh a cada 5s se broadcast.status='sending' (espelha
 * _scheduleBroadcastRefresh do source).
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  MessageCircle,
  Play,
  UserCheck,
  AlertCircle,
} from 'lucide-react'
import type { BroadcastDTO, BroadcastStatsDTO } from '@clinicai/repositories'
import {
  describeFilter,
  statusColor,
  statusLabel,
  whatsappFormatToHtml,
  escapeHtml,
} from '../lib/filters'
import { loadBroadcastLeadsAction } from '../actions'
import { BroadcastActions } from './BroadcastActions'

type Segment =
  | 'all'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'read'
  | 'responded'
  | 'no_response'

interface SegLead {
  id: string
  name: string | null
  phone: string | null
}

export function BroadcastDetailClient({
  broadcast: b,
  stats,
}: {
  broadcast: BroadcastDTO
  stats: BroadcastStatsDTO | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [segment, setSegment] = useState<Segment>('all')
  const [segLeads, setSegLeads] = useState<SegLead[]>([])
  const [segLoading, setSegLoading] = useState(false)

  // Auto-refresh enquanto sending
  useEffect(() => {
    if (b.status !== 'sending') return
    const t = setInterval(() => {
      startTransition(() => router.refresh())
    }, 5000)
    return () => clearInterval(t)
  }, [b.status, router])

  // Carrega leads ao mudar segmento
  useEffect(() => {
    let cancelled = false
    setSegLoading(true)
    setSegLeads([])
    loadBroadcastLeadsAction(b.id, segment)
      .then((res) => {
        if (cancelled) return
        if (res.ok && res.data) {
          setSegLeads(res.data)
        }
      })
      .finally(() => {
        if (!cancelled) setSegLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [b.id, segment])

  const filterTags = describeFilter(b.target_filter)
  const created = b.created_at ? new Date(b.created_at) : null
  const started = b.started_at ? new Date(b.started_at) : null
  const completed = b.completed_at ? new Date(b.completed_at) : null
  const scheduled = b.scheduled_at ? new Date(b.scheduled_at) : null
  const progress =
    b.total_targets > 0 ? Math.round((b.sent_count / b.total_targets) * 100) : 0

  const noResponse = stats ? Math.max(0, (stats.sent || 0) - (stats.responded || 0)) : 0

  const messageHtml = useMemo(() => {
    return whatsappFormatToHtml(escapeHtml(b.content)).replace(/\n/g, '<br/>')
  }, [b.content])

  const segCounts: Array<{
    key: Segment
    label: string
    color: string
    count: number
    icon: React.ReactNode
  }> = [
    {
      key: 'all',
      label: 'Todos',
      color: '#6B7280',
      count: b.total_targets || 0,
      icon: <UserCheck className="w-3.5 h-3.5" />,
    },
    {
      key: 'sent',
      label: 'Enviados',
      color: '#10B981',
      count: b.sent_count || 0,
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    ...(stats
      ? ([
          {
            key: 'delivered' as Segment,
            label: 'Entregues',
            color: '#0EA5E9',
            count: stats.delivered || 0,
            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          },
          {
            key: 'read' as Segment,
            label: 'Lidos',
            color: '#8B5CF6',
            count: stats.read || 0,
            icon: <Eye className="w-3.5 h-3.5" />,
          },
          {
            key: 'responded' as Segment,
            label: 'Responderam',
            color: '#2563EB',
            count: stats.responded || 0,
            icon: <MessageCircle className="w-3.5 h-3.5" />,
          },
          {
            key: 'no_response' as Segment,
            label: 'Sem resposta',
            color: '#F59E0B',
            count: noResponse,
            icon: <Clock className="w-3.5 h-3.5" />,
          },
        ] as const)
      : []),
    {
      key: 'failed',
      label: 'Falhas',
      color: '#EF4444',
      count: b.failed_count || 0,
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
  ]

  return (
    <div>
      <div className="luxury-card" style={{ padding: 18, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1
              className="font-display"
              style={{
                fontSize: 28,
                lineHeight: 1.1,
                color: 'var(--b2b-ivory)',
                marginBottom: 8,
              }}
            >
              {b.name || '(sem nome)'}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span
                className="b2b-pill"
                style={{
                  background: `${statusColor(b.status)}20`,
                  color: statusColor(b.status),
                  fontSize: 10,
                  letterSpacing: 1,
                  padding: '3px 10px',
                }}
              >
                {statusLabel(b.status)}
              </span>
              {filterTags.map((t) => (
                <span
                  key={t}
                  className="b2b-pill"
                  style={{
                    fontSize: 10,
                    color: 'var(--b2b-text-dim)',
                    background: 'rgba(255,255,255,0.04)',
                    padding: '3px 10px',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <BroadcastActions broadcast={b} />
        </div>

        {b.status === 'sending' && (
          <div
            style={{
              marginTop: 16,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4,
              height: 8,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${progress}%`,
                background: '#F59E0B',
                transition: 'width 1s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: -18,
                right: 0,
                fontSize: 10,
                color: 'var(--b2b-text-muted)',
              }}
            >
              {progress}%
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 6,
            borderLeft: '3px solid var(--b2b-champagne)',
            fontSize: 13,
            color: 'var(--b2b-ivory)',
            whiteSpace: 'pre-wrap',
          }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: messageHtml }}
        />

        {b.media_url && (
          <div style={{ marginTop: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.media_url}
              alt="media"
              style={{ maxWidth: 280, borderRadius: 6, display: 'block' }}
            />
            {b.media_caption && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: 'var(--b2b-text-muted)',
                  fontStyle: 'italic',
                }}
              >
                {b.media_caption}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            fontSize: 11,
            color: 'var(--b2b-text-muted)',
          }}
        >
          {scheduled && (
            <span style={{ color: 'var(--b2b-champagne)', fontWeight: 600 }}>
              <Clock className="w-3 h-3 inline" /> Agendado:{' '}
              {scheduled.toLocaleString('pt-BR')}
            </span>
          )}
          {created && (
            <span>
              <Calendar className="w-3 h-3 inline" /> Criado:{' '}
              {created.toLocaleString('pt-BR')}
            </span>
          )}
          {started && (
            <span>
              <Play className="w-3 h-3 inline" /> Iniciado:{' '}
              {started.toLocaleString('pt-BR')}
            </span>
          )}
          {completed && (
            <span>
              <CheckCircle2 className="w-3 h-3 inline" /> Finalizado:{' '}
              {completed.toLocaleString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      {stats && (
        <div className="luxury-card" style={{ padding: 18, marginBottom: 16 }}>
          <div
            className="b2b-form-sec"
            style={{ marginBottom: 12 }}
          >
            Métricas
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 12,
            }}
          >
            <MetricBar label="Envio" value={stats.send_rate} color="#10B981" />
            <MetricBar label="Entrega" value={stats.delivery_rate} color="#0EA5E9" />
            <MetricBar label="Leitura" value={stats.read_rate} color="#8B5CF6" />
            <MetricBar label="Resposta" value={stats.response_rate} color="#2563EB" />
          </div>
        </div>
      )}

      <div className="luxury-card" style={{ padding: 18 }}>
        <div className="b2b-form-sec" style={{ marginBottom: 12 }}>
          Destinatários
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {segCounts.map((s) => {
            const isActive = segment === s.key
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSegment(s.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: `1px solid ${isActive ? s.color : 'var(--b2b-border)'}`,
                  color: isActive ? s.color : 'var(--b2b-text-dim)',
                  background: isActive ? `${s.color}15` : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ color: s.color }}>{s.icon}</span>
                <span>{s.count}</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>

        {segLoading ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--b2b-text-muted)',
            }}
          >
            Carregando leads do segmento...
          </div>
        ) : segLeads.length === 0 ? (
          <div className="b2b-empty">Nenhum lead neste segmento</div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 480,
              overflowY: 'auto',
            }}
          >
            {segLeads.map((l) => (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  fontSize: 12,
                  borderBottom: '1px solid var(--b2b-border)',
                }}
              >
                <UserCheck className="w-3.5 h-3.5" style={{ color: 'var(--b2b-text-muted)' }} />
                <span style={{ flex: 1, color: 'var(--b2b-ivory)' }}>
                  {l.name || '(sem nome)'}
                </span>
                <small style={{ color: 'var(--b2b-text-muted)' }}>{l.phone || ''}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricBar({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        style={{
          width: 60,
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: 'var(--b2b-text-muted)',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${v}%`, height: '100%', background: color }} />
      </div>
      <span
        style={{
          width: 40,
          fontSize: 11,
          fontWeight: 600,
          textAlign: 'right',
          color,
        }}
      >
        {v}%
      </span>
    </div>
  )
}
