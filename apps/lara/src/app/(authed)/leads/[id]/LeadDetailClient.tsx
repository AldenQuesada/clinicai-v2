'use client'

/**
 * LeadDetailClient · orquestra tabs + drawer de edicao + acoes.
 *
 * Mesmas tabs do clinic-dashboard adaptadas pra Next.js + b2b-* tema:
 *   1. Info       · campos editaveis (drawer abre via botao)
 *   2. Conversa   · link pra /conversas?lead=<id>
 *   3. Histórico  · timeline phase_history
 *   4. Tags       · adicionar/remover · gerenciar funnel/phase/temperature
 *   5. Ações      · soft-delete, transbordar, restaurar
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  MessageSquare,
  Clock,
  Tag,
  Settings as SettingsIcon,
  Phone,
  Mail,
  Calendar,
  Sparkles,
} from 'lucide-react'
import type {
  AppointmentDTO,
  LeadDTO,
  OrcamentoDTO,
  PhaseHistoryDTO,
} from '@clinicai/repositories'
import { LeadEditDrawer } from './LeadEditDrawer'
import { LeadActions } from './LeadActions'
import { LeadTagsPanel } from './LeadTagsPanel'

type TabId = 'info' | 'conversa' | 'historico' | 'tags' | 'acoes'

const TABS: readonly { id: TabId; label: string; icon: typeof User }[] = [
  { id: 'info', label: 'Info', icon: User },
  { id: 'conversa', label: 'Conversa', icon: MessageSquare },
  { id: 'historico', label: 'Histórico', icon: Clock },
  { id: 'tags', label: 'Tags & Pipeline', icon: Tag },
  { id: 'acoes', label: 'Ações', icon: SettingsIcon },
]

export function LeadDetailClient({
  lead,
  history,
  orcamentos,
  appointments,
  canEdit,
  canDelete,
}: {
  lead: LeadDTO
  history: PhaseHistoryDTO[]
  orcamentos: OrcamentoDTO[]
  appointments: AppointmentDTO[]
  canEdit: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('info')
  const [editOpen, setEditOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3000)
  }

  const initial = (lead.name || lead.phone || '?').trim().charAt(0).toUpperCase()
  const phoneDigits = (lead.phone || '').replace(/\D/g, '')
  const waHref = phoneDigits
    ? `https://wa.me/${phoneDigits.length <= 11 ? '55' + phoneDigits : phoneDigits}`
    : null

  return (
    <div>
      {/* Header card */}
      <div
        className="luxury-card"
        style={{
          padding: 22,
          marginBottom: 18,
          display: 'flex',
          gap: 18,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            flexShrink: 0,
            background: 'linear-gradient(135deg,#7C3AED,#C9A96E)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            color: '#fff',
            fontSize: 22,
          }}
        >
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1
            className="font-display"
            style={{ fontSize: 24, color: 'var(--b2b-ivory)', margin: 0 }}
          >
            {lead.name || '— sem nome'}
          </h1>
          <div
            style={{
              fontSize: 12,
              color: 'var(--b2b-text-dim)',
              marginTop: 4,
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Phone size={11} />
              {formatPhoneBr(lead.phone)}
            </span>
            {lead.email && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Mail size={11} />
                {lead.email}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={11} />
              Criado em {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={11} />
              Score {lead.leadScore || 0}
            </span>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Pill label={lead.funnel} kind="funnel" />
            <Pill label={lead.phase} kind="phase" />
            <Pill label={lead.temperature} kind="temp" />
            {lead.aiPersona && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--b2b-text-muted)',
                  border: '1px solid var(--b2b-border)',
                }}
              >
                Persona: {lead.aiPersona}
              </span>
            )}
            {lead.deletedAt && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(239,68,68,0.18)',
                  color: '#ef4444',
                }}
              >
                DELETADO {new Date(lead.deletedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="b2b-btn b2b-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <MessageSquare size={13} />
              WhatsApp
            </a>
          )}
          {canEdit && (
            <button
              type="button"
              className="b2b-btn"
              onClick={() => setEditOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Editar
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--b2b-border)',
          marginBottom: 18,
          overflowX: 'auto',
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: active
                  ? '2px solid var(--b2b-champagne)'
                  : '2px solid transparent',
                cursor: 'pointer',
                color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-dim)',
                fontSize: 12,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab body */}
      {tab === 'info' && (
        <InfoTab
          lead={lead}
          orcamentos={orcamentos}
          appointments={appointments}
          canEdit={canEdit}
          onEdit={() => setEditOpen(true)}
        />
      )}
      {tab === 'conversa' && <ConversaTab lead={lead} />}
      {tab === 'historico' && <HistoricoTab history={history} />}
      {tab === 'tags' && (
        <LeadTagsPanel lead={lead} canEdit={canEdit} onToast={showToast} />
      )}
      {tab === 'acoes' && (
        <LeadActions
          lead={lead}
          canEdit={canEdit}
          canDelete={canDelete}
          onToast={showToast}
          onAfterDelete={() => router.push('/leads')}
        />
      )}

      {/* Edit drawer */}
      {editOpen && canEdit && (
        <LeadEditDrawer
          lead={lead}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            showToast('Lead atualizado')
            router.refresh()
          }}
          onError={(msg) => showToast(msg, 'err')}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '10px 18px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            zIndex: 1000,
            background:
              toast.tone === 'err' ? 'rgba(239,68,68,0.95)' : 'rgba(138,158,136,0.95)',
            color: '#fff',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Info tab ────────────────────────────────────────────────────────────────

function InfoTab({
  lead,
  orcamentos,
  appointments,
  canEdit,
  onEdit,
}: {
  lead: LeadDTO
  orcamentos: OrcamentoDTO[]
  appointments: AppointmentDTO[]
  canEdit: boolean
  onEdit: () => void
}) {
  const orcAbertos = orcamentos.filter(
    (o) => !['approved', 'lost'].includes(o.status),
  )
  const totalAberto = orcAbertos.reduce((s, o) => s + (o.total || 0), 0)

  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <div className="luxury-card" style={{ padding: 18 }}>
        <SectionHeader title="Identificação" actionLabel={canEdit ? 'Editar' : null} onAction={onEdit} />
        <Field label="Nome" value={lead.name} />
        <Field label="Telefone" value={formatPhoneBr(lead.phone)} />
        <Field label="Email" value={lead.email} />
        <Field label="CPF" value={lead.cpf} />
        <Field label="Idade" value={lead.idade != null ? `${lead.idade} anos` : null} />
        <Field
          label="Nascimento"
          value={lead.birthDate ? new Date(lead.birthDate).toLocaleDateString('pt-BR') : null}
        />
      </div>

      <div className="luxury-card" style={{ padding: 18 }}>
        <SectionHeader title="Pipeline" actionLabel={null} />
        <Field label="Funnel" value={lead.funnel} />
        <Field label="Fase" value={lead.phase} />
        <Field label="Temperatura" value={lead.temperature} />
        <Field label="Persona IA" value={lead.aiPersona} />
        <Field label="Origem" value={`${lead.source} · ${lead.sourceType}`} />
        <Field label="Score" value={String(lead.leadScore || 0)} />
        <Field
          label="Última resposta"
          value={
            lead.lastResponseAt
              ? new Date(lead.lastResponseAt).toLocaleString('pt-BR')
              : 'nunca'
          }
        />
      </div>

      <div className="luxury-card" style={{ padding: 18 }}>
        <SectionHeader title="Queixas faciais" actionLabel={null} />
        {lead.queixasFaciais && lead.queixasFaciais.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {lead.queixasFaciais.map((q) => (
              <span
                key={q}
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(201,169,110,0.10)',
                  color: 'var(--b2b-champagne)',
                  border: '1px solid rgba(201,169,110,0.30)',
                }}
              >
                {q}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--b2b-text-muted)', fontSize: 12, marginTop: 6 }}>
            — sem queixas registradas
          </div>
        )}
      </div>

      <div className="luxury-card" style={{ padding: 18 }}>
        <SectionHeader title="Orçamentos em aberto" actionLabel={null} />
        {orcAbertos.length === 0 ? (
          <div style={{ color: 'var(--b2b-text-muted)', fontSize: 12, marginTop: 6 }}>
            — nenhum orçamento aberto
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--b2b-champagne)',
                marginTop: 6,
              }}
            >
              {fmtMoney(totalAberto)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--b2b-text-dim)',
                marginBottom: 8,
              }}
            >
              {orcAbertos.length} {orcAbertos.length === 1 ? 'orçamento' : 'orçamentos'}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {orcAbertos.slice(0, 5).map((o) => (
                <li
                  key={o.id}
                  style={{
                    fontSize: 11,
                    padding: '4px 0',
                    borderTop: '1px solid var(--b2b-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    {o.title || o.number || '(sem título)'} · {o.status}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMoney(o.total)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="luxury-card" style={{ padding: 18 }}>
        <SectionHeader title="Agendamentos" actionLabel={null} />
        {appointments.length === 0 ? (
          <div style={{ color: 'var(--b2b-text-muted)', fontSize: 12, marginTop: 6 }}>
            — sem agendamentos
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {appointments.slice(0, 6).map((a) => (
              <li
                key={a.id}
                style={{
                  fontSize: 11,
                  padding: '6px 0',
                  borderTop: '1px solid var(--b2b-border)',
                }}
              >
                <div style={{ color: 'var(--b2b-ivory)' }}>
                  {new Date(a.scheduledDate).toLocaleDateString('pt-BR')} · {a.startTime}
                </div>
                <div style={{ color: 'var(--b2b-text-muted)' }}>
                  {a.procedureName || a.consultType || '(consulta)'} · {a.status}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Conversa tab ────────────────────────────────────────────────────────────

function ConversaTab({ lead }: { lead: LeadDTO }) {
  const phoneDigits = (lead.phone || '').replace(/\D/g, '')
  const waHref = phoneDigits
    ? `https://wa.me/${phoneDigits.length <= 11 ? '55' + phoneDigits : phoneDigits}`
    : null
  return (
    <div className="luxury-card" style={{ padding: 28, textAlign: 'center' }}>
      <MessageSquare size={32} style={{ color: 'var(--b2b-text-muted)' }} />
      <h3
        className="font-display"
        style={{ fontSize: 18, color: 'var(--b2b-ivory)', marginTop: 10 }}
      >
        Conversa <em>WhatsApp</em>
      </h3>
      <p
        style={{
          color: 'var(--b2b-text-dim)',
          fontSize: 12,
          marginTop: 6,
          maxWidth: 420,
          margin: '6px auto 18px',
        }}
      >
        O painel de conversa fica em <code>/conversas</code> · clique abaixo pra
        abrir o histórico desta lead.
      </p>
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <a
          href={`/conversas?lead=${lead.id}`}
          className="b2b-btn b2b-btn-primary"
        >
          Abrir no painel Lara
        </a>
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="b2b-btn"
          >
            Abrir WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

// ── Historico tab ───────────────────────────────────────────────────────────

function HistoricoTab({ history }: { history: PhaseHistoryDTO[] }) {
  if (!history.length) {
    return (
      <div className="b2b-empty" style={{ padding: 32, textAlign: 'center' }}>
        Nenhum evento de transição registrado ainda.
      </div>
    )
  }
  return (
    <div className="luxury-card" style={{ padding: 18 }}>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {history.map((h) => (
          <li
            key={h.id}
            style={{
              padding: '10px 0',
              borderTop: '1px solid var(--b2b-border)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ color: 'var(--b2b-ivory)', fontWeight: 600 }}>
                {h.fromPhase ? `${h.fromPhase} → ${h.toPhase}` : `→ ${h.toPhase}`}
              </div>
              <div style={{ color: 'var(--b2b-text-muted)', fontSize: 11, marginTop: 2 }}>
                {h.origin}
                {h.reason ? ` · ${h.reason}` : ''}
                {h.actorId ? ` · por ${h.actorId.slice(0, 8)}` : ''}
              </div>
            </div>
            <div style={{ color: 'var(--b2b-text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>
              {new Date(h.createdAt).toLocaleString('pt-BR')}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Visual helpers ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel: string | null
  onAction?: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}
    >
      <h3
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: 'var(--b2b-champagne)',
          margin: 0,
        }}
      >
        {title}
      </h3>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--b2b-text-dim)',
            fontSize: 11,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--b2b-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: value ? 'var(--b2b-ivory)' : 'var(--b2b-text-muted)' }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function Pill({ label, kind }: { label: string; kind: 'funnel' | 'phase' | 'temp' }) {
  const map: Record<string, { color: string; bg: string }> = {
    olheiras: { color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
    fullface: { color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
    procedimentos: { color: '#C9A96E', bg: 'rgba(201,169,110,0.15)' },
    lead: { color: '#818cf8', bg: 'rgba(129,140,248,0.15)' },
    agendado: { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
    reagendado: { color: '#c084fc', bg: 'rgba(192,132,252,0.15)' },
    compareceu: { color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
    paciente: { color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    orcamento: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    perdido: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    hot: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    warm: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    cold: { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  }
  const c = map[label] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' }
  const display = label || '—'
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.color}50`,
      }}
    >
      {kind === 'temp' ? `🌡 ${display}` : display}
    </span>
  )
}

function formatPhoneBr(phone: string): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  const local = digits.length === 13 || digits.length === 12 ? digits.substring(2) : digits
  if (local.length === 11) {
    return `(${local.substring(0, 2)}) ${local.substring(2, 7)}-${local.substring(7)}`
  }
  if (local.length === 10) {
    return `(${local.substring(0, 2)}) ${local.substring(2, 6)}-${local.substring(6)}`
  }
  return phone
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
