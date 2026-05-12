'use client'

/**
 * ReceptionPanelClient · client component do painel-TV.
 *
 * Responsabilidades:
 *  - Re-render do "tempo decorrido" a cada 30s sem refetch (useTicker)
 *  - Relógio do header (1s tick)
 *  - Refresh automático server-side via revalidate=15 (Next.js)
 *  - Botão manual "Atualizar agora" (router.refresh) opcional
 *  - Hero premium de boas-vindas (2ALEXA.2.1) · foto consentida + animação
 *  - Avatar consentido em ArrivalRow/InServiceRow · fallback iniciais
 *  - Modo kiosk · sem mutação · sem provider
 *
 * Privacidade: dados clínicos sensíveis NÃO chegam aqui (filtrados na page).
 * Foto só renderiza quando `row.photoSignedUrl` existe (server já validou
 * consent+welcome+photo no `getReceptionDisplayProfile`).
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, UserCheck, Activity, AlertTriangle, CalendarClock, RefreshCw, Heart } from 'lucide-react'
import type { PanelRow, AnimationStyle } from './page'

interface Props {
  arrived: PanelRow[]
  inService: PanelRow[]
  upcoming: PanelRow[]
  overdue: PanelRow[]
  today: string
}

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  aguardando_confirmacao: 'Aguard. confirmação',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  na_clinica: 'Na clínica',
  em_atendimento: 'Em atendimento',
}

function fmtTime(hhmm: string): string {
  return hhmm.slice(0, 5)
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
  } catch {
    return iso
  }
}

function elapsedLabel(fromIso: string | null, now: number): string | null {
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
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10) || 0)
  return h * 60 + m
}

function useTicker(intervalMs: number = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function initialsFrom(name: string | null | undefined): string {
  if (!name) return '·'
  const clean = name.trim()
  if (!clean) return '·'
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function firstName(name: string | null | undefined): string {
  if (!name) return ''
  const clean = name.trim()
  if (!clean) return ''
  return clean.split(/\s+/)[0]!
}

function useClock(): string {
  const [time, setTime] = useState<string>(() => {
    const d = new Date()
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  })
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setTime(
        d.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      )
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

export function ReceptionPanelClient({
  arrived,
  inService,
  upcoming,
  overdue,
  today,
}: Props) {
  const router = useRouter()
  const now = useTicker(30_000)
  const clock = useClock()
  const [refreshing, setRefreshing] = useState(false)
  const lastRefreshRef = useRef<number>(Date.now())

  // Marca tempo desde último refresh
  useEffect(() => {
    lastRefreshRef.current = Date.now()
  }, [arrived, inService, upcoming, overdue])

  function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 600)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#e5e5e5',
        fontFamily:
          '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '20px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            Recepção · {fmtDate(today)}
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 600,
              margin: '4px 0 0 0',
              color: '#e5e5e5',
            }}
          >
            Painel da clínica
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1,
              color: '#10b981',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {clock}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.45)',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Atualização automática · 15s
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Atualizar agora"
              aria-label="Atualizar agora"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4,
                padding: '4px 8px',
                color: 'rgba(255,255,255,0.7)',
                cursor: refreshing ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
              }}
            >
              <RefreshCw
                className="w-3 h-3"
                style={{
                  animation: refreshing ? 'spin 1s linear infinite' : 'none',
                }}
              />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      {/* 2ALEXA.2.1 · Hero premium · primeira paciente reception-ready */}
      {(() => {
        const featured = arrived.find(
          (r) => r.photoSignedUrl && r.animationStyle,
        )
        if (!featured) return null
        return (
          <WelcomeHero key={featured.id} row={featured} now={now} />
        )
      })()}

      {/* Body */}
      <main
        style={{
          padding: '24px 28px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 24,
        }}
      >
        {/* Coluna esquerda · ARRIVED + IN SERVICE + OVERDUE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SectionBlock
            icon={<UserCheck size={20} />}
            title="Chegaram agora"
            count={arrived.length}
            tone="ok"
            empty="Nenhum paciente aguardando agora."
          >
            {arrived.map((r) => (
              <ArrivalRow key={r.id} row={r} now={now} />
            ))}
          </SectionBlock>

          <SectionBlock
            icon={<Activity size={20} />}
            title="Em atendimento"
            count={inService.length}
            tone="info"
            empty="Nenhum atendimento em curso."
          >
            {inService.map((r) => (
              <InServiceRow key={r.id} row={r} now={now} />
            ))}
          </SectionBlock>

          {overdue.length > 0 && (
            <SectionBlock
              icon={<AlertTriangle size={20} />}
              title="Atrasados"
              count={overdue.length}
              tone="alert"
              empty=""
            >
              {overdue.map((r) => (
                <OverdueRow key={r.id} row={r} now={now} />
              ))}
            </SectionBlock>
          )}
        </div>

        {/* Coluna direita · UPCOMING */}
        <div>
          <SectionBlock
            icon={<CalendarClock size={20} />}
            title="Próximos horários"
            count={upcoming.length}
            empty="Sem mais agendamentos hoje."
          >
            {upcoming.slice(0, 10).map((r) => (
              <UpcomingRow key={r.id} row={r} />
            ))}
          </SectionBlock>
        </div>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* 2ALEXA.2.1 · animações premium browser-only · sem asset externo */
        @keyframes ra-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ra-photo-zoom {
          from { transform: scale(1.02); }
          to { transform: scale(1); }
        }
        @keyframes ra-glow-pulse {
          0%, 100% { box-shadow: 0 0 28px 4px rgba(16,185,129,0.22), 0 0 0 1px rgba(16,185,129,0.45); }
          50%      { box-shadow: 0 0 40px 8px rgba(16,185,129,0.34), 0 0 0 1px rgba(16,185,129,0.65); }
        }
        @keyframes ra-shimmer {
          0%   { transform: translateX(-110%) skewX(-12deg); }
          100% { transform: translateX(220%)  skewX(-12deg); }
        }
        .ra-soft { animation: ra-fade-in 700ms ease-out both; }
        .ra-soft .ra-hero-photo img { animation: ra-photo-zoom 4500ms ease-out both; }
        .ra-glow { animation: ra-fade-in 700ms ease-out both; }
        .ra-glow .ra-hero-photo { animation: ra-glow-pulse 3200ms ease-in-out infinite; }
        .ra-glow .ra-shimmer {
          position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%);
          animation: ra-shimmer 4200ms ease-in-out infinite;
        }
        .ra-clean { animation: ra-fade-in 500ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .ra-soft, .ra-glow, .ra-clean,
          .ra-soft .ra-hero-photo img,
          .ra-glow .ra-hero-photo,
          .ra-glow .ra-shimmer { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Section block ─────────────────────────────────────────────────────────

function SectionBlock({
  icon,
  title,
  count,
  tone,
  empty,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  tone?: 'ok' | 'alert' | 'info'
  empty: string
  children: React.ReactNode
}) {
  const accent =
    tone === 'ok'
      ? '#10b981'
      : tone === 'alert'
        ? '#dc2626'
        : tone === 'info'
          ? '#3b82f6'
          : 'rgba(255,255,255,0.7)'
  const items = Array.isArray(children) ? children : [children]
  const isEmpty = count === 0
  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: accent,
        }}
      >
        {icon}
        <h2
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: accent,
          }}
        >
          {title}
        </h2>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 14,
            fontWeight: 700,
            background: 'rgba(255,255,255,0.05)',
            padding: '2px 10px',
            borderRadius: 12,
            color: 'rgba(255,255,255,0.8)',
            minWidth: 28,
            textAlign: 'center',
          }}
        >
          {count}
        </span>
      </header>
      <div style={{ padding: isEmpty ? '20px 16px' : '6px 0' }}>
        {isEmpty ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'rgba(255,255,255,0.4)',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            {empty}
          </p>
        ) : (
          items
        )}
      </div>
    </section>
  )
}

// ── Row variants ──────────────────────────────────────────────────────────

function RowContainer({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: 'ok' | 'alert' | 'info'
}) {
  const bg =
    tone === 'ok'
      ? 'rgba(16,185,129,0.04)'
      : tone === 'alert'
        ? 'rgba(220,38,38,0.04)'
        : tone === 'info'
          ? 'rgba(59,130,246,0.04)'
          : 'transparent'
  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

function ArrivalRow({ row, now }: { row: PanelRow; now: number }) {
  const elapsed = elapsedLabel(row.chegadaEm, now)
  return (
    <RowContainer tone="ok">
      <Avatar
        name={row.receptionDisplayName ?? row.subjectName}
        photoUrl={row.photoSignedUrl}
        size={44}
        tone="ok"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#e5e5e5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.subjectName}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.6)',
            marginTop: 2,
          }}
        >
          {row.procedureName ? `${row.procedureName} · ` : ''}
          {row.professionalName || 'Sem profissional'}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#10b981',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {elapsed ?? 'chegou'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 2,
          }}
        >
          {fmtTime(row.startTime)} – {fmtTime(row.endTime)}
        </div>
      </div>
    </RowContainer>
  )
}

function InServiceRow({ row, now }: { row: PanelRow; now: number }) {
  // Para in_service, tempo desde chegada se houver · senão desde start_time
  const elapsed = row.chegadaEm
    ? elapsedLabel(row.chegadaEm, now)
    : (() => {
        const start = timeToMin(row.startTime)
        const cur = (() => {
          const d = new Date(now)
          return d.getHours() * 60 + d.getMinutes()
        })()
        const diff = cur - start
        if (diff < 0) return null
        if (diff < 60) return `há ${diff} min`
        return `há ${Math.floor(diff / 60)}h`
      })()
  return (
    <RowContainer tone="info">
      <Avatar
        name={row.receptionDisplayName ?? row.subjectName}
        photoUrl={row.photoSignedUrl}
        size={36}
        tone="info"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#e5e5e5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.subjectName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.55)',
            marginTop: 2,
          }}
        >
          {row.procedureName ? `${row.procedureName} · ` : ''}
          {row.professionalName || ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#3b82f6',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {elapsed ?? 'em curso'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 2,
          }}
        >
          {fmtTime(row.startTime)} – {fmtTime(row.endTime)}
        </div>
      </div>
    </RowContainer>
  )
}

function UpcomingRow({ row }: { row: PanelRow }) {
  return (
    <RowContainer>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#e5e5e5',
          minWidth: 56,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtTime(row.startTime)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#e5e5e5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.subjectName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 1,
          }}
        >
          {row.professionalName || '—'}
          {row.procedureName ? ` · ${row.procedureName}` : ''}
        </div>
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          flexShrink: 0,
        }}
      >
        {STATUS_LABEL[row.status] ?? row.status}
      </div>
    </RowContainer>
  )
}

function OverdueRow({ row, now }: { row: PanelRow; now: number }) {
  // Atraso = quanto tempo passou desde start_time
  const start = timeToMin(row.startTime)
  const cur = (() => {
    const d = new Date(now)
    return d.getHours() * 60 + d.getMinutes()
  })()
  const lateMin = Math.max(0, cur - start)
  return (
    <RowContainer tone="alert">
      <Clock size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#e5e5e5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.subjectName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.55)',
            marginTop: 2,
          }}
        >
          {STATUS_LABEL[row.status] ?? row.status}
          {row.professionalName ? ` · ${row.professionalName}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#dc2626',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {lateMin} min atrasado
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 2,
          }}
        >
          {fmtTime(row.startTime)}
        </div>
      </div>
    </RowContainer>
  )
}

// ── 2ALEXA.2.1 · Avatar (foto consentida ou iniciais) ────────────────────

function Avatar({
  name,
  photoUrl,
  size,
  tone,
}: {
  name: string
  photoUrl: string | null
  size: number
  tone?: 'ok' | 'info' | 'alert'
}) {
  const ring =
    tone === 'ok'
      ? 'rgba(16,185,129,0.55)'
      : tone === 'alert'
        ? 'rgba(220,38,38,0.55)'
        : 'rgba(255,255,255,0.18)'
  const initials = initialsFrom(name)
  const fontSize = Math.round(size * 0.42)

  if (photoUrl) {
    return (
      <span
        aria-label={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          border: `2px solid ${ring}`,
          display: 'inline-block',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </span>
    )
  }

  return (
    <span
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
        border: `1px solid ${ring}`,
        color: 'rgba(255,255,255,0.78)',
        fontSize,
        fontWeight: 700,
        letterSpacing: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initials}
    </span>
  )
}

// ── 2ALEXA.2.1 · Welcome hero · só renderiza quando reception-ready ──────

function WelcomeHero({ row, now }: { row: PanelRow; now: number }) {
  const elapsed = elapsedLabel(row.chegadaEm, now)
  const style: AnimationStyle = row.animationStyle ?? 'premium_soft'
  const display =
    row.receptionDisplayName ?? firstName(row.subjectName) ?? row.subjectName

  // Tokens por estilo
  const styleClass =
    style === 'premium_glow'
      ? 'ra-glow'
      : style === 'premium_clean'
        ? 'ra-clean'
        : 'ra-soft'

  const cardBg =
    style === 'premium_glow'
      ? 'linear-gradient(140deg, rgba(16,185,129,0.10), rgba(16,185,129,0.02) 45%, rgba(255,255,255,0.02))'
      : style === 'premium_clean'
        ? 'rgba(255,255,255,0.03)'
        : 'linear-gradient(140deg, rgba(255,255,255,0.04), rgba(16,185,129,0.05))'

  const showShimmer = style === 'premium_glow'

  return (
    <section
      className={styleClass}
      aria-label="Boas-vindas à paciente"
      style={{
        margin: '20px 28px 0',
        padding: 24,
        background: cardBg,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '180px minmax(0, 1fr)',
        gap: 24,
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <div
        className="ra-hero-photo"
        style={{
          position: 'relative',
          width: 160,
          height: 160,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          border: '2px solid rgba(16,185,129,0.55)',
          background: 'rgba(255,255,255,0.04)',
          justifySelf: 'center',
        }}
      >
        {showShimmer && <div className="ra-shimmer" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.photoSignedUrl ?? ''}
          alt=""
          width={160}
          height={160}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'rgba(16,185,129,0.85)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Heart size={14} /> Bem-vinda
        </div>
        <h2
          style={{
            margin: '6px 0 8px',
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.05,
            color: '#f5f5f7',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {display}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 16,
            color: 'rgba(255,255,255,0.72)',
            maxWidth: 640,
            lineHeight: 1.45,
          }}
        >
          Estamos felizes em receber você na Clínica Mirian de Paula.
        </p>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 18,
            flexWrap: 'wrap',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 13,
          }}
        >
          {row.professionalName && (
            <span>
              <strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                Profissional ·{' '}
              </strong>
              {row.professionalName}
            </span>
          )}
          {row.startTime && (
            <span>
              <strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                Horário ·{' '}
              </strong>
              {fmtTime(row.startTime)}
            </span>
          )}
          {elapsed && (
            <span>
              <strong style={{ color: 'rgba(16,185,129,0.95)' }}>
                Chegou{' '}
              </strong>
              {elapsed}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
