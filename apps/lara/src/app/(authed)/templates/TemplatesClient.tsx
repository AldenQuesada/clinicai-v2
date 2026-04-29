'use client'

/**
 * TemplatesClient · timeline agrupada por tipo + side panel preview · port
 * 1:1 do legado com adaptacao: edit em modal · preview/acoes em painel lateral.
 *
 * UX (decidido com user 2026-04-29):
 *  1. Lista agrupada por type (8 grupos · cor/icone) · timeline dots+linha
 *     dentro de cada grupo (sem cruzar grupos)
 *  2. Click numa linha → drawer lateral direito (~440px) com preview iPhone
 *  3. Botoes "Editar" no drawer abrem TemplateFormModal full-screen
 *  4. "Novo template" abre modal vazio direto
 *
 * Mantido do legado: 8 tipos com cor · variables chip buttons · iPhone
 * mockup · markdown WhatsApp · day scheduling · toggle active.
 */

import { useState, useMemo, useTransition, useRef } from 'react'
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
  ChevronRight,
  ChevronDown,
  Power,
  PowerOff,
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

// Ordem de exibicao dos grupos
const TYPE_ORDER = [
  'confirmacao',
  'lembrete',
  'engajamento',
  'boas_vindas',
  'consent_img',
  'consent_info',
  'manual',
]
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

function dayLabel(day: number | null | undefined): string {
  if (day === null || day === undefined) return 'Sob demanda'
  const opt = DAY_OPTIONS.find((o) => o.value === day)
  return opt?.label || `${day > 0 ? '+' : ''}${day} dias`
}

// ─────────────────────────────────────────────────────────────────
// Component principal
// ─────────────────────────────────────────────────────────────────

interface Props {
  templates: TemplateDTO[]
  canManage: boolean
}

export function TemplatesClient({ templates, canManage }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<TemplateDTO | null>(null)
  const [editing, setEditing] = useState<TemplateDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<TemplateDTO | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  function refresh() {
    startTransition(() => router.refresh())
  }

  // Agrupar templates por type
  const grouped = useMemo(() => {
    const map: Record<string, TemplateDTO[]> = {}
    for (const t of templates) {
      const key = t.type ?? 'manual'
      const validKey = TYPE_CONFIG[key] ? key : 'manual'
      if (!map[validKey]) map[validKey] = []
      map[validKey].push(t)
    }
    // Sort dentro de cada grupo: day asc, sort_order, name
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        if (a.day === null && b.day !== null) return 1
        if (b.day === null && a.day !== null) return -1
        if (a.day !== b.day) return (a.day ?? 0) - (b.day ?? 0)
        if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0))
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        return a.name.localeCompare(b.name)
      })
    }
    return map
  }, [templates])

  const visibleGroups = TYPE_ORDER.filter((key) => grouped[key]?.length)

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
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
            {visibleGroups.length > 0 && (
              <>
                {' · '}
                {visibleGroups.length} {visibleGroups.length === 1 ? 'tipo' : 'tipos'}
              </>
            )}
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

      {templates.length === 0 ? (
        <div className="b2b-empty">
          {canManage
            ? 'Nenhum template criado · clique em Novo template pra começar.'
            : 'Nenhum template disponível.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {visibleGroups.map((typeKey) => {
            const items = grouped[typeKey] || []
            const cfg = TYPE_CONFIG[typeKey]
            const isCollapsed = collapsed[typeKey]
            const Icon = cfg.Icon

            return (
              <section key={typeKey}>
                {/* Group header (clickable · collapse) */}
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [typeKey]: !c[typeKey] }))
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: '8px 0',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    marginBottom: 12,
                    borderBottom: '1px solid var(--b2b-border)',
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight size={14} style={{ color: 'var(--b2b-text-muted)' }} />
                  ) : (
                    <ChevronDown size={14} style={{ color: 'var(--b2b-text-muted)' }} />
                  )}
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: cfg.bg,
                      color: cfg.color,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={12} strokeWidth={2.2} />
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: cfg.color,
                    }}
                  >
                    {cfg.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--b2b-text-muted)',
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    · {items.length} {items.length === 1 ? 'template' : 'templates'}
                  </span>
                </button>

                {!isCollapsed && (
                  <div style={{ paddingLeft: 14 }}>
                    {items.map((t, i) => (
                      <TimelineItem
                        key={t.id}
                        template={t}
                        typeConfig={cfg}
                        isLast={i === items.length - 1}
                        isSelected={selected?.id === t.id}
                        onSelect={() => setSelected(t)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* SidePanel · slide-in da direita */}
      {selected && (
        <SidePanel
          template={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected)
            setSelected(null)
          }}
          onToggleActive={async () => {
            await setTemplateActiveAction(selected.id, !selected.active)
            setSelected({ ...selected, active: !selected.active })
            refresh()
          }}
          onDelete={() => {
            setConfirmDelete(selected)
          }}
        />
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
            setSelected(null)
            refresh()
          }}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Timeline item · linha simples · click abre side panel
// ─────────────────────────────────────────────────────────────────

function TimelineItem({
  template,
  typeConfig,
  isLast,
  isSelected,
  onSelect,
}: {
  template: TemplateDTO
  typeConfig: TypeConfig
  isLast: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const preview = (template.content ?? template.message ?? '').slice(0, 100)
  const showInactive = !template.active

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr',
        gap: 12,
        opacity: showInactive ? 0.55 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 14,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: typeConfig.color,
            flexShrink: 0,
            zIndex: 1,
          }}
        />
        {!isLast && (
          <div
            style={{
              width: 1.5,
              flex: 1,
              minHeight: 12,
              background: `linear-gradient(to bottom, ${typeConfig.color}40, var(--b2b-border))`,
              marginTop: 2,
            }}
          />
        )}
      </div>

      <button
        type="button"
        onClick={onSelect}
        style={{
          marginBottom: 8,
          padding: '12px 14px',
          background: isSelected ? 'rgba(201,169,110,0.06)' : 'var(--b2b-bg-1)',
          border: `1px solid ${isSelected ? 'var(--b2b-champagne)' : 'var(--b2b-border)'}`,
          borderRadius: 10,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          width: '100%',
          transition: 'all var(--lara-transition)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 4,
          }}
        >
          <span
            className="font-display"
            style={{
              fontSize: 15,
              color: 'var(--b2b-ivory)',
              lineHeight: 1.2,
            }}
          >
            {template.name}
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'var(--b2b-text-muted)',
              letterSpacing: 0.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Calendar size={10} />
            {dayLabel(template.day)}
            {showInactive && (
              <span
                style={{
                  marginLeft: 6,
                  padding: '1px 6px',
                  background: 'rgba(122,113,101,0.18)',
                  color: 'var(--b2b-text-muted)',
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Inativo
              </span>
            )}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--b2b-text-dim)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {preview}
          {(template.content?.length ?? 0) > 100 && '...'}
        </div>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SidePanel · slide-in da direita · preview WhatsApp + ações
// ─────────────────────────────────────────────────────────────────

function SidePanel({
  template,
  canManage,
  onClose,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  template: TemplateDTO
  canManage: boolean
  onClose: () => void
  onEdit: () => void
  onToggleActive: () => void | Promise<void>
  onDelete: () => void
}) {
  const cfg = TYPE_CONFIG[template.type ?? 'manual'] ?? TYPE_CONFIG.manual
  const Icon = cfg.Icon
  const content = template.content ?? template.message ?? ''
  const previewBody = applyVars(content || '(mensagem vazia)')
  const previewHtml = formatBubbleHtml(previewBody)

  return (
    <>
      {/* Overlay · click fora fecha */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 900,
          animation: 'lara-fade-in 0.2s ease',
        }}
      />

      <aside
        role="dialog"
        aria-label={`Detalhes do template ${template.name}`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(440px, 95vw)',
          background: 'var(--b2b-bg-1)',
          borderLeft: '1px solid var(--b2b-border-strong)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.40)',
          zIndex: 950,
          display: 'flex',
          flexDirection: 'column',
          animation: 'lara-slide-in 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <style>{`
          @keyframes lara-slide-in {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          @keyframes lara-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--b2b-border)',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: cfg.bg,
                color: cfg.color,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={14} strokeWidth={2.2} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: cfg.color,
                  fontWeight: 700,
                }}
              >
                {cfg.label}
              </div>
              <div
                className="font-display"
                style={{
                  fontSize: 18,
                  color: 'var(--b2b-ivory)',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {template.name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="b2b-btn"
            style={{ padding: 6, lineHeight: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body · scroll */}
        <div
          className="custom-scrollbar"
          style={{ flex: 1, overflowY: 'auto', padding: 20 }}
        >
          {/* Meta info */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 11,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                background: template.active ? 'rgba(138,158,136,0.18)' : 'rgba(122,113,101,0.18)',
                color: template.active ? 'var(--b2b-sage)' : 'var(--b2b-text-muted)',
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                fontSize: 9,
              }}
            >
              {template.active ? 'Ativo' : 'Inativo'}
            </span>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                background: 'var(--b2b-bg-2)',
                color: 'var(--b2b-text-dim)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
              }}
            >
              <Calendar size={10} />
              {dayLabel(template.day)}
            </span>
            {template.category && template.category !== 'quick_reply' && (
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(201,169,110,0.10)',
                  color: 'var(--b2b-champagne)',
                  fontWeight: 600,
                  fontSize: 10,
                }}
              >
                {template.category}
              </span>
            )}
          </div>

          {/* iPhone preview */}
          <div className="b2b-form-sec" style={{ marginTop: 0 }}>
            Pré-visualização
          </div>
          <PhonePreview bubbleHtml={previewHtml} />

          {/* Texto bruto */}
          <div className="b2b-form-sec">
            Mensagem (texto bruto)
          </div>
          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              background: 'var(--b2b-bg-2)',
              border: '1px solid var(--b2b-border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--b2b-text-dim)',
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}
          >
            {content || '(vazio)'}
          </pre>
          <div
            style={{
              fontSize: 10,
              color: 'var(--b2b-text-muted)',
              marginTop: 6,
              fontStyle: 'italic',
            }}
          >
            {content.length} caracteres · {(content.match(/\{\{[^}]+\}\}/g) || []).length} variáveis
          </div>
        </div>

        {/* Footer · ações */}
        {canManage && (
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--b2b-border)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              type="button"
              onClick={onDelete}
              className="b2b-btn"
              style={{
                color: 'var(--b2b-red)',
                borderColor: 'rgba(217,122,122,0.35)',
                padding: '8px 12px',
              }}
            >
              <Trash2 size={12} /> Excluir
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onToggleActive}
                className="b2b-btn"
                style={{ padding: '8px 12px' }}
              >
                {template.active ? (
                  <>
                    <PowerOff size={12} /> Desativar
                  </>
                ) : (
                  <>
                    <Power size={12} /> Ativar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="b2b-btn b2b-btn-primary"
                style={{ padding: '8px 14px' }}
              >
                <Edit3 size={12} /> Editar
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Phone preview (compacto · usado no SidePanel)
// ─────────────────────────────────────────────────────────────────

function PhonePreview({
  bubbleHtml,
  large = false,
}: {
  bubbleHtml: string
  large?: boolean
}) {
  const w = large ? 264 : 240
  return (
    <div
      style={{
        width: w,
        margin: '0 auto',
        background: '#1C1C1E',
        borderRadius: 32,
        padding: 8,
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          background: '#0E1B14',
          borderRadius: 26,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 320,
        }}
      >
        <div
          style={{
            background: '#1C1C1E',
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{ width: 44, height: 4, background: '#000', borderRadius: 4 }}
          />
        </div>
        <div
          style={{
            background: '#1F2C34',
            color: '#E9EDEF',
            padding: '10px 14px',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--b2b-champagne)',
              color: 'var(--b2b-bg-0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>Maria · paciente</div>
            <div style={{ fontSize: 9, opacity: 0.7 }}>online agora</div>
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: '14px 12px',
            background: '#0B141A',
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
              fontSize: 11.5,
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}
            dangerouslySetInnerHTML={{ __html: bubbleHtml }}
          />
        </div>
        <div
          style={{
            background: '#1F2C34',
            padding: '8px 12px',
            fontSize: 10,
            color: '#8696A0',
          }}
        >
          Digite uma mensagem...
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
            {isEdit ? 'Editar' : 'Novo'}{' '}
            <em style={{ color: 'var(--b2b-champagne)' }}>template</em>
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

            <div>
              <div className="b2b-form-sec" style={{ marginTop: 0 }}>
                Pré-visualização
              </div>
              <PhonePreview bubbleHtml={previewHtml} large />
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
            Excluir <strong style={{ color: 'var(--b2b-ivory)' }}>"{template.name}"</strong>?
            Soft delete · pode ser restaurado por admin via DB.
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
