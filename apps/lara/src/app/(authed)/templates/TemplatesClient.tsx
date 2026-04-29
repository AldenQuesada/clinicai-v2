'use client'

/**
 * TemplatesClient · timeline visual + modal create/edit · port 1:1 do legado.
 *
 * Espelho de clinic-dashboard agenda-mensagens.js:
 * - Timeline vertical com dots coloridos por tipo + linha conectora
 * - 8 tipos pré-definidos com cor/ícone/bg
 * - Modal create/edit (ao invés de view inline · UX moderno)
 * - Variables chip buttons ({{nome}}, {{data}}, ...) inserem no textarea
 * - Live preview iPhone (CSS only · bubble WhatsApp · markdown *bold*)
 * - Char counter
 * - Day select (-7 a +30)
 * - Toggle active/inactive
 */

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Edit3,
  Trash2,
  X,
  AlertTriangle,
  Check,
  Calendar,
  CheckCircle2,
  Clock,
  Zap,
  Hand,
  Camera,
  FileText,
  MessageSquare,
} from 'lucide-react'
import type { TemplateDTO } from '@clinicai/repositories'
import {
  createTemplateAction,
  updateTemplateAction,
  setTemplateActiveAction,
  deleteTemplateAction,
} from './actions'

// ─────────────────────────────────────────────────────────────────
// Constantes · port 1:1 do legado (MSG_TYPES + VARIABLES + DAY_OPTIONS)
// ─────────────────────────────────────────────────────────────────

interface TypeConfig {
  key: string
  label: string
  color: string
  bg: string
  Icon: typeof CheckCircle2
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  confirmacao: {
    key: 'confirmacao',
    label: 'Confirmação',
    color: '#8A9E88',
    bg: 'rgba(138,158,136,0.12)',
    Icon: CheckCircle2,
  },
  lembrete: {
    key: 'lembrete',
    label: 'Lembrete',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
    Icon: Clock,
  },
  engajamento: {
    key: 'engajamento',
    label: 'Engajamento',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.12)',
    Icon: Zap,
  },
  boas_vindas: {
    key: 'boas_vindas',
    label: 'Boas-vindas',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.12)',
    Icon: Hand,
  },
  consent_img: {
    key: 'consent_img',
    label: 'Consentimento de imagem',
    color: '#D97A7A',
    bg: 'rgba(217,122,122,0.12)',
    Icon: Camera,
  },
  consent_info: {
    key: 'consent_info',
    label: 'Consentimento informado',
    color: '#C9A96E',
    bg: 'rgba(201,169,110,0.15)',
    Icon: FileText,
  },
  manual: {
    key: 'manual',
    label: 'Mensagem manual',
    color: '#7A7165',
    bg: 'rgba(122,113,101,0.12)',
    Icon: MessageSquare,
  },
}

const TYPE_KEYS = Object.keys(TYPE_CONFIG)

const VARIABLES: Array<{ key: string; label: string }> = [
  { key: '{{nome}}', label: 'Nome do paciente' },
  { key: '{{data}}', label: 'Data da consulta' },
  { key: '{{hora}}', label: 'Hora da consulta' },
  { key: '{{profissional}}', label: 'Profissional' },
  { key: '{{procedimento}}', label: 'Procedimento' },
  { key: '{{clinica}}', label: 'Nome da clínica' },
  { key: '{{endereco}}', label: 'Endereço' },
  { key: '{{link_maps}}', label: 'Link Maps' },
]

const DAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: -7, label: '7 dias antes' },
  { value: -5, label: '5 dias antes' },
  { value: -3, label: '3 dias antes' },
  { value: -2, label: '2 dias antes' },
  { value: -1, label: '1 dia antes' },
  { value: 0, label: 'Dia da consulta' },
  { value: 1, label: '1 dia depois' },
  { value: 3, label: '3 dias depois' },
  { value: 7, label: '7 dias depois' },
  { value: 14, label: '14 dias depois' },
  { value: 30, label: '30 dias depois' },
]

const PREVIEW_VARS: Record<string, string> = {
  '{{nome}}': 'Maria',
  '{{data}}': '15/05/2026',
  '{{hora}}': '14:30',
  '{{profissional}}': 'Dra. Mirian',
  '{{procedimento}}': 'Smooth Eyes',
  '{{clinica}}': 'Clínica Mirian de Paula',
  '{{endereco}}': 'Av. Brasil 123 · Maringá',
  '{{link_maps}}': 'maps.app/abc',
}

function applyVars(text: string): string {
  let out = text
  for (const { key } of VARIABLES) {
    out = out.split(key).join(PREVIEW_VARS[key] ?? key)
  }
  return out
}

function formatBubbleHtml(text: string): string {
  // Markdown WhatsApp: *bold* · _italic_ · ~strike~
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/~([^~]+)~/g, '<s>$1</s>')
    .replace(/\n/g, '<br>')
}

function dayLabel(day: number | null): string {
  if (day === null || day === undefined) return 'Sob demanda'
  const opt = DAY_OPTIONS.find((o) => o.value === day)
  return opt?.label || `${day > 0 ? '+' : ''}${day} dias`
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

interface Props {
  templates: TemplateDTO[]
  canManage: boolean
}

export function TemplatesClient({ templates, canManage }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState<TemplateDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<TemplateDTO | null>(null)

  function refresh() {
    startTransition(() => router.refresh())
  }

  // Sort templates por day (asc · null no final) + sort_order + name
  const sorted = [...templates].sort((a, b) => {
    if (a.day === null && b.day !== null) return 1
    if (b.day === null && a.day !== null) return -1
    if (a.day !== b.day) return (a.day ?? 0) - (b.day ?? 0)
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0))
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      {/* Header com botão Novo */}
      {canManage && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: 'var(--b2b-text-muted)',
              fontWeight: 600,
            }}
          >
            {sorted.length} {sorted.length === 1 ? 'template' : 'templates'}
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="b2b-btn b2b-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={13} />
            Novo template
          </button>
        </div>
      )}

      {/* Timeline */}
      {sorted.length === 0 ? (
        <div className="b2b-empty">
          {canManage
            ? 'Nenhum template criado ainda · clique em Novo template pra começar.'
            : 'Nenhum template disponível.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {sorted.map((t, i) => (
            <TimelineItem
              key={t.id}
              template={t}
              isLast={i === sorted.length - 1}
              canManage={canManage}
              onEdit={() => setEditing(t)}
              onDelete={() => setConfirmDelete(t)}
              onToggleActive={async () => {
                await setTemplateActiveAction(t.id, !t.active)
                refresh()
              }}
            />
          ))}
        </div>
      )}

      {/* Modal Create */}
      {creating && (
        <TemplateFormModal
          template={null}
          onClose={() => setCreating(false)}
          onSubmitted={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}

      {/* Modal Edit */}
      {editing && (
        <TemplateFormModal
          template={editing}
          onClose={() => setEditing(null)}
          onSubmitted={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}

      {/* Confirmação Delete */}
      {confirmDelete && (
        <DeleteConfirmModal
          template={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            await deleteTemplateAction(confirmDelete.id)
            setConfirmDelete(null)
            refresh()
          }}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Timeline item
// ─────────────────────────────────────────────────────────────────

function TimelineItem({
  template,
  isLast,
  canManage,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  template: TemplateDTO
  isLast: boolean
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
}) {
  const t = TYPE_CONFIG[template.type ?? 'manual'] ?? TYPE_CONFIG.manual
  const Icon = t.Icon
  const preview = (template.content ?? template.message ?? '').slice(0, 140)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr',
        gap: 14,
        opacity: template.active ? 1 : 0.5,
      }}
    >
      {/* Dot + linha conectora */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: t.bg,
            border: `1.5px solid ${t.color}`,
            color: t.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            zIndex: 1,
          }}
        >
          <Icon size={16} strokeWidth={2} />
        </div>
        {!isLast && (
          <div
            style={{
              width: 1.5,
              flex: 1,
              minHeight: 24,
              background: `linear-gradient(to bottom, ${t.color}30, var(--b2b-border))`,
              marginTop: 4,
            }}
          />
        )}
      </div>

      {/* Card */}
      <div
        className="luxury-card"
        style={{
          marginBottom: 14,
          overflow: 'hidden',
        }}
      >
        {/* Header colorido por tipo */}
        <div
          style={{
            background: t.bg,
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: t.color,
              }}
            >
              {t.label}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--b2b-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Calendar size={10} />
              {dayLabel(template.day)}
            </span>
          </div>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              background: template.active ? 'rgba(138,158,136,0.18)' : 'rgba(122,113,101,0.18)',
              color: template.active ? 'var(--b2b-sage)' : 'var(--b2b-text-muted)',
            }}
          >
            {template.active ? 'Ativo' : 'Inativo'}
          </span>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '12px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="font-display"
              style={{
                fontSize: 16,
                color: 'var(--b2b-ivory)',
                lineHeight: 1.3,
                marginBottom: 4,
              }}
            >
              {template.name}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--b2b-text-dim)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {preview}
              {(template.content?.length ?? 0) > 140 && '...'}
            </div>
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={onToggleActive}
                title={template.active ? 'Desativar' : 'Ativar'}
                className="b2b-btn"
                style={{ padding: '6px 9px', fontSize: 11 }}
              >
                {template.active ? 'Desativar' : 'Ativar'}
              </button>
              <button
                type="button"
                onClick={onEdit}
                title="Editar"
                className="b2b-btn"
                style={{ padding: '6px 9px' }}
              >
                <Edit3 size={12} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Excluir"
                className="b2b-btn"
                style={{
                  padding: '6px 9px',
                  color: 'var(--b2b-red)',
                  borderColor: 'rgba(217,122,122,0.35)',
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modal create/edit · 2 colunas (form esquerda · preview iPhone direita)
// ─────────────────────────────────────────────────────────────────

function TemplateFormModal({
  template,
  onClose,
  onSubmitted,
}: {
  template: TemplateDTO | null
  onClose: () => void
  onSubmitted: () => void
}) {
  const isEdit = template !== null
  const [type, setType] = useState<string>(template?.type ?? 'manual')
  const [name, setName] = useState<string>(template?.name ?? '')
  const [day, setDay] = useState<number | null>(template?.day ?? null)
  const [active, setActive] = useState<boolean>(template?.active ?? true)
  const [content, setContent] = useState<string>(template?.content ?? template?.message ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const tConfig = TYPE_CONFIG[type] ?? TYPE_CONFIG.manual

  function insertVar(varKey: string) {
    const ta = textareaRef.current
    if (!ta) {
      setContent((c) => c + varKey)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = content.substring(0, start) + varKey + content.substring(end)
    setContent(next)
    setTimeout(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + varKey.length
    }, 0)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Informe o nome')
      return
    }
    if (!content.trim()) {
      setError('Mensagem não pode estar vazia')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('name', name.trim())
      fd.set('content', content)
      fd.set('type', type)
      if (day !== null) fd.set('day', String(day))
      if (active) fd.set('active', 'on')
      if (isEdit) {
        await updateTemplateAction(template!.id, fd)
      } else {
        await createTemplateAction(fd)
      }
      onSubmitted()
    } catch (err) {
      setError((err as Error).message || 'Erro ao salvar')
      setSubmitting(false)
    }
  }

  const previewBody = applyVars(content || 'Mensagem aparece aqui ao digitar...')
  const previewHtml = formatBubbleHtml(previewBody)

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 880 }}
      >
        <div className="b2b-modal-hdr">
          <h2>
            {isEdit ? 'Editar' : 'Novo'} <em style={{ color: 'var(--b2b-champagne)' }}>template</em>
          </h2>
          <button type="button" onClick={onClose} className="b2b-close" aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            className="b2b-modal-body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 280px',
              gap: 24,
              padding: 24,
            }}
          >
            {/* Coluna esquerda · form */}
            <div>
              <div className="b2b-grid-2">
                <div className="b2b-field">
                  <label className="b2b-field-lbl">
                    Tipo <em>*</em>
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="b2b-input"
                  >
                    {TYPE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {TYPE_CONFIG[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="b2b-field">
                  <label className="b2b-field-lbl">Quando enviar</label>
                  <select
                    value={day === null ? '' : String(day)}
                    onChange={(e) =>
                      setDay(e.target.value === '' ? null : Number(e.target.value))
                    }
                    className="b2b-input"
                  >
                    <option value="">Sob demanda (sem agendamento)</option>
                    {DAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="b2b-field">
                <label className="b2b-field-lbl">
                  Nome <em>*</em>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="Ex: Confirmação 24h antes"
                  autoFocus
                  className="b2b-input"
                />
              </div>

              {/* Variáveis · chip buttons */}
              <div className="b2b-field">
                <label className="b2b-field-lbl">Variáveis dinâmicas</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVar(v.key)}
                      title={v.label}
                      style={{
                        padding: '3px 9px',
                        fontSize: 11,
                        fontFamily: 'ui-monospace, monospace',
                        background: 'rgba(201,169,110,0.08)',
                        color: 'var(--b2b-champagne)',
                        border: '1px solid rgba(201,169,110,0.20)',
                        borderRadius: 14,
                        cursor: 'pointer',
                      }}
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>

              <div className="b2b-field">
                <label className="b2b-field-lbl">
                  Mensagem <em>*</em>
                  <span
                    style={{
                      float: 'right',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 10,
                      color: 'var(--b2b-text-muted)',
                    }}
                  >
                    {content.length} caracteres
                  </span>
                </label>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={9}
                  placeholder="Olá {{nome}}, sua consulta com {{profissional}} é dia {{data}} às {{hora}}..."
                  className="b2b-input"
                />
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--b2b-text-muted)',
                    marginTop: 4,
                    fontStyle: 'italic',
                  }}
                >
                  Suporta *negrito* · _itálico_ · ~tachado~ (markdown WhatsApp)
                </div>
              </div>

              <div className="b2b-field">
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--b2b-text-dim)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    style={{ accentColor: 'var(--b2b-champagne)' }}
                  />
                  Template ativo (visível para uso)
                </label>
              </div>

              {error && <div className="b2b-form-err">{error}</div>}
            </div>

            {/* Coluna direita · iPhone preview */}
            <div>
              <div className="b2b-form-sec" style={{ marginTop: 0 }}>
                Pré-visualização
              </div>
              <PhonePreview
                bubbleHtml={previewHtml}
                typeColor={tConfig.color}
                typeLabel={tConfig.label}
                day={day}
              />
            </div>
          </div>

          <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
            <button
              type="button"
              onClick={onClose}
              className="b2b-btn"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="b2b-btn b2b-btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Phone preview (CSS only · tema dark · bubble WhatsApp)
// ─────────────────────────────────────────────────────────────────

function PhonePreview({
  bubbleHtml,
  typeColor,
  typeLabel,
  day,
}: {
  bubbleHtml: string
  typeColor: string
  typeLabel: string
  day: number | null
}) {
  return (
    <div>
      <div
        style={{
          width: 264,
          margin: '0 auto',
          background: '#1C1C1E',
          borderRadius: 36,
          padding: 10,
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            background: '#0E1B14',
            borderRadius: 28,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 360,
          }}
        >
          {/* Notch */}
          <div
            style={{
              background: '#1C1C1E',
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 50,
                height: 4,
                background: '#000',
                borderRadius: 4,
              }}
            />
          </div>
          {/* WA header */}
          <div
            style={{
              background: '#1F2C34',
              color: '#E9EDEF',
              padding: '10px 14px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--b2b-champagne)',
                color: 'var(--b2b-bg-0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              M
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Maria · paciente</div>
              <div style={{ fontSize: 9, opacity: 0.7 }}>online agora</div>
            </div>
          </div>
          {/* Chat body */}
          <div
            style={{
              flex: 1,
              padding: '14px 12px',
              background:
                'linear-gradient(180deg, #0E1B14 0%, #0E1B14 100%) #0B141A',
            }}
          >
            <div
              style={{
                background: '#005C4B',
                color: '#E9EDEF',
                padding: '8px 10px',
                borderRadius: 8,
                borderTopRightRadius: 2,
                marginLeft: 'auto',
                maxWidth: '88%',
                fontSize: 12,
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}
              dangerouslySetInnerHTML={{ __html: bubbleHtml }}
            />
          </div>
          {/* WA footer */}
          <div
            style={{
              background: '#1F2C34',
              padding: '8px 12px',
              fontSize: 11,
              color: '#8696A0',
            }}
          >
            Digite uma mensagem...
          </div>
        </div>
      </div>

      {/* Badges abaixo */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginTop: 14,
          fontSize: 10,
          textAlign: 'center',
        }}
      >
        <div>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 999,
              background: `${typeColor}25`,
              color: typeColor,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {typeLabel}
          </span>
        </div>
        <div style={{ color: 'var(--b2b-text-muted)' }}>
          <Calendar size={10} style={{ display: 'inline', marginRight: 4 }} />
          {dayLabel(day)}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Delete confirmation modal
// ─────────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  template,
  onCancel,
  onConfirm,
}: {
  template: TemplateDTO
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  return (
    <div className="b2b-overlay" onClick={onCancel}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div className="b2b-modal-hdr">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--b2b-red)' }}>
            <AlertTriangle size={16} />
            Excluir template
          </h2>
          <button type="button" onClick={onCancel} className="b2b-close" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p style={{ fontSize: 13, color: 'var(--b2b-text-dim)', lineHeight: 1.6 }}>
            Excluir <strong style={{ color: 'var(--b2b-ivory)' }}>"{template.name}"</strong>? Soft delete · pode ser
            restaurado por admin via DB.
          </p>
        </div>
        <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
          <button type="button" onClick={onCancel} className="b2b-btn" disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
            className="b2b-btn"
            style={{
              background: 'rgba(217,122,122,0.18)',
              color: 'var(--b2b-red)',
              borderColor: 'rgba(217,122,122,0.5)',
              fontWeight: 600,
            }}
          >
            {busy ? (
              'Excluindo...'
            ) : (
              <>
                <Check size={12} /> Excluir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
