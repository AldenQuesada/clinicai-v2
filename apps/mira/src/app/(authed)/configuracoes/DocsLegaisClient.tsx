'use client'

/**
 * DocsLegaisClient · CRUD de templates legais.
 *
 * Visual: lista compacta luxury · cada row mostra nome + tipo + status +
 * versao + acoes (Editar | Arquivar). Modal de edicao tem 3 secoes:
 * metadados (nome/tipo/variaveis) · conteudo (textarea) · preview render.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  upsertLegalTemplateAction,
  archiveLegalTemplateAction,
} from './legal-doc-actions'

interface TemplateRow {
  id: string
  name: string
  slug: string
  docType: string
  content: string
  variables: string[]
  version: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const DOC_TYPE_LABELS: Record<string, string> = {
  uso_imagem: 'Uso de imagem',
  procedimento: 'Procedimento',
  anestesia: 'Anestesia',
  lgpd: 'LGPD',
  contrato: 'Contrato',
  custom: 'Custom',
}

const DOC_TYPES = ['uso_imagem', 'procedimento', 'anestesia', 'lgpd', 'contrato', 'custom']

const SAMPLE_VARS: Record<string, string> = {
  nome: 'Maria Silva',
  cpf: '123.456.789-00',
  data: new Date().toLocaleDateString('pt-BR'),
  profissional: 'Dra. Mirian de Paula',
  registro_profissional: 'CRM-PR 12345',
  especialidade: 'Dermatologia',
  procedimento: 'Limpeza de pele profunda',
  clinica: 'Clínica Mirian de Paula',
  parceria: 'Parceira Exemplo',
  endereco_clinica: 'Av. Brasil, 4000 · Maringá',
}

const DEFAULT_VARS = [
  'nome',
  'cpf',
  'data',
  'profissional',
  'registro_profissional',
  'especialidade',
  'procedimento',
  'clinica',
]

export function DocsLegaisClient({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [editing, setEditing] = useState<TemplateRow | null>(null)
  const [creating, setCreating] = useState(false)

  const active = templates.filter((t) => t.isActive)
  const inactive = templates.filter((t) => !t.isActive)

  function openNew() {
    setEditing({
      id: '',
      name: '',
      slug: '',
      docType: 'custom',
      content: '',
      variables: DEFAULT_VARS,
      version: 0,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    })
    setCreating(true)
  }

  function openEdit(t: TemplateRow) {
    setEditing(t)
    setCreating(false)
  }

  function close() {
    setEditing(null)
    setCreating(false)
  }

  function onArchive(id: string, name: string) {
    if (!window.confirm(`Arquivar template "${name}"? Ele deixa de aparecer na lista de emissão.`)) {
      return
    }
    startTransition(async () => {
      const r = await archiveLegalTemplateAction(id)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback('Template arquivado.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[14px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
            Documentos legais · templates
          </h2>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Modelos reutilizaveis · suportam variaveis {`{{nome}}, {{cpf}}, {{data}}`} etc · Lei 14.063/2020
          </p>
        </div>
        <button type="button" className="b2b-btn b2b-btn-primary" onClick={openNew}>
          + Novo template
        </button>
      </header>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}

      {/* Ativos */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 10.5,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: '#C9A96E',
            fontWeight: 500,
          }}
        >
          Ativos · {active.length}
        </div>
        {active.length === 0 ? (
          <div className="b2b-empty">Nenhum template ativo. Crie o primeiro acima.</div>
        ) : (
          active.map((t) => (
            <TemplateRowCard
              key={t.id}
              t={t}
              busy={pending}
              onEdit={() => openEdit(t)}
              onArchive={() => onArchive(t.id, t.name)}
            />
          ))
        )}
      </section>

      {/* Arquivados */}
      {inactive.length > 0 ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: 10.5,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: '#9CA3AF',
              fontWeight: 500,
            }}
          >
            Arquivados · {inactive.length}
          </div>
          {inactive.map((t) => (
            <TemplateRowCard
              key={t.id}
              t={t}
              busy={pending}
              archived
              onEdit={() => openEdit(t)}
              onArchive={() => null}
            />
          ))}
        </section>
      ) : null}

      {/* Modal · editor */}
      {editing ? (
        <TemplateEditorModal
          template={editing}
          isCreating={creating}
          busy={pending}
          onClose={close}
          onSubmit={(data) => {
            startTransition(async () => {
              const r = await upsertLegalTemplateAction(data)
              if (!r.ok) {
                setFeedback(`Erro: ${r.error || 'falha'}`)
                return
              }
              setFeedback(creating ? 'Template criado.' : 'Template atualizado.')
              close()
              router.refresh()
            })
          }}
        />
      ) : null}
    </div>
  )
}

function TemplateRowCard({
  t,
  busy,
  archived,
  onEdit,
  onArchive,
}: {
  t: TemplateRow
  busy: boolean
  archived?: boolean
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: archived ? 'rgba(255,255,255,0.02)' : 'rgba(201,169,110,0.05)',
        border: '1px solid var(--b2b-border)',
        borderRadius: 10,
        opacity: archived ? 0.7 : 1,
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 17,
            color: 'var(--b2b-ivory)',
            fontWeight: 500,
          }}
        >
          {t.name}
        </span>
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 10.5,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: 'var(--b2b-text-muted)',
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>{DOC_TYPE_LABELS[t.docType] || t.docType}</span>
          <span>v{t.version}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{t.slug}</span>
          <span>
            {t.variables.length} var{t.variables.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <span
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          padding: '4px 10px',
          borderRadius: 6,
          background: archived ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.16)',
          color: archived ? 'var(--b2b-text-muted)' : '#10B981',
        }}
      >
        {archived ? 'Arquivado' : 'Ativo'}
      </span>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="b2b-btn"
          style={{ padding: '4px 10px', fontSize: 11 }}
          onClick={onEdit}
        >
          {archived ? 'Ver' : 'Editar'}
        </button>
        {!archived ? (
          <button
            type="button"
            className="b2b-btn"
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderColor: 'rgba(217,122,122,0.4)',
              color: 'var(--b2b-red, #D97A7A)',
            }}
            onClick={onArchive}
            disabled={busy}
          >
            Arquivar
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ─── Editor Modal ─────────────────────────────────────────────────────
function TemplateEditorModal({
  template,
  isCreating,
  busy,
  onClose,
  onSubmit,
}: {
  template: TemplateRow
  isCreating: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (data: {
    id?: string
    name: string
    slug?: string
    docType: string
    content: string
    variables: string[]
    isActive: boolean
  }) => void
}) {
  const [name, setName] = useState(template.name)
  const [slug, setSlug] = useState(template.slug)
  const [docType, setDocType] = useState(template.docType)
  const [content, setContent] = useState(template.content)
  const [variables, setVariables] = useState<string[]>(template.variables)
  const [isActive, setIsActive] = useState(template.isActive)
  const [newVar, setNewVar] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  function addVar() {
    const k = newVar.trim().replace(/[^a-z0-9_]/gi, '').toLowerCase()
    if (!k || variables.includes(k)) return
    setVariables([...variables, k])
    setNewVar('')
  }

  function removeVar(v: string) {
    setVariables(variables.filter((x) => x !== v))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      id: template.id || undefined,
      name,
      slug: slug || undefined,
      docType,
      content,
      variables,
      isActive,
    })
  }

  // Preview · merge {{vars}} com sample data
  const rendered = content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return SAMPLE_VARS[key] != null ? SAMPLE_VARS[key] : `[${key}]`
  })

  return (
    <div
      className="b2b-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="b2b-modal" style={{ maxWidth: 920 }}>
        <header
          className="b2b-modal-hdr"
          style={{ paddingBottom: 16, borderBottom: '1px solid var(--b2b-border)' }}
        >
          <div style={{ flex: 1 }}>
            <div className="b2b-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
              Template legal · {isCreating ? 'novo' : `v${template.version} ativo`}
            </div>
            <h2
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 28,
                fontWeight: 300,
                margin: 0,
                color: 'var(--b2b-ivory)',
                lineHeight: 1.1,
              }}
            >
              {isCreating ? 'Criar' : 'Editar'}{' '}
              <em style={{ color: 'var(--b2b-champagne)', fontWeight: 400 }}>template</em>
            </h2>
          </div>
          <button type="button" className="b2b-close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="b2b-modal-body" style={{ paddingTop: 20 }}>
          <form onSubmit={handleSubmit}>
            {/* Metadados */}
            <div className="b2b-sec-title" style={{ marginTop: 0, marginBottom: 12 }}>
              Metadados
            </div>
            <div className="b2b-grid-2" style={{ gap: 16 }}>
              <Field label="Nome *">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="b2b-input"
                  placeholder="TCLE - Limpeza de pele"
                />
              </Field>
              <Field label="Slug (opcional · gerado se vazio)">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="b2b-input"
                  placeholder="tcle-limpeza-pele"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className="b2b-input"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {DOC_TYPE_LABELS[dt] || dt}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 14px',
                    border: '1px solid var(--b2b-border)',
                    borderRadius: 10,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ accentColor: '#C9A96E' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--b2b-ivory)' }}>
                    Ativo (aparece na lista de emissão)
                  </span>
                </label>
              </Field>
            </div>

            {/* Variaveis */}
            <div className="b2b-sec-title" style={{ marginTop: 24, marginBottom: 12 }}>
              Variáveis · use {`{{nome}}`} no conteúdo
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {variables.map((v) => (
                <span
                  key={v}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: 'rgba(201,169,110,0.12)',
                    border: '1px solid rgba(201,169,110,0.3)',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 11,
                    color: 'var(--b2b-champagne)',
                  }}
                >
                  {`{{${v}}}`}
                  <button
                    type="button"
                    onClick={() => removeVar(v)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#D97A7A',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 14,
                    }}
                    aria-label={`Remover ${v}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newVar}
                onChange={(e) => setNewVar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addVar()
                  }
                }}
                placeholder="ex: clinica · proximaconsulta"
                className="b2b-input"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  flex: 1,
                }}
              />
              <button type="button" className="b2b-btn" onClick={addVar}>
                + Adicionar
              </button>
            </div>

            {/* Conteudo */}
            <div
              className="b2b-sec-title"
              style={{ marginTop: 24, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Conteúdo (Markdown / HTML simples)</span>
              <button
                type="button"
                className="b2b-btn"
                onClick={() => setShowPreview(!showPreview)}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                {showPreview ? 'Esconder preview' : 'Mostrar preview'}
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr',
                gap: 12,
              }}
            >
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={18}
                className="b2b-input"
                style={{
                  resize: 'vertical',
                  minHeight: 360,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
                placeholder="<h2>Termo de Consentimento</h2>&#10;<p>Eu, {{nome}}, CPF {{cpf}}, autorizo...</p>"
              />
              {showPreview ? (
                <div
                  style={{
                    background: '#FAFBFC',
                    color: '#1F2937',
                    border: '1px solid var(--b2b-border)',
                    borderRadius: 10,
                    padding: 18,
                    fontFamily: 'Georgia, serif',
                    fontSize: 13,
                    lineHeight: 1.75,
                    minHeight: 360,
                    maxHeight: 480,
                    overflow: 'auto',
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizeForPreview(rendered) }}
                />
              ) : null}
            </div>
            <p style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 8 }}>
              Preview usa dados de exemplo · valores reais sao injetados na emissão.
            </p>

            <div
              className="b2b-form-actions"
              style={{
                marginTop: 24,
                paddingTop: 16,
                borderTop: '1px solid var(--b2b-border)',
              }}
            >
              <button type="button" className="b2b-btn" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="b2b-btn b2b-btn-primary" disabled={busy}>
                {busy ? 'Salvando…' : isCreating ? 'Criar template' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="b2b-field" style={{ marginBottom: 0 }}>
      <label className="b2b-field-lbl">{label}</label>
      {children}
    </div>
  )
}

function sanitizeForPreview(html: string): string {
  if (!html) return ''
  // Sanitizer minimo · remove <script>, on*, javascript:
  let s = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\shref\s*=\s*"javascript:[^"]*"/gi, '')
  return s
}
