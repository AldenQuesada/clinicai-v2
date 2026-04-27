'use client'

/**
 * DocumentosClient · CRUD de docs legais vinculados a uma parceria.
 *
 * Lista status (pending/viewed/signed/expired/revoked) · botao "Emitir
 * documento" abre overlay (b2b-overlay/b2b-modal) com select de template +
 * campos do signatario. Apos emitir, mostra link publico pra copiar.
 *
 * Para docs assinados · botao "Visualizar" abre modal com canvas + dados
 * do signer (carregado lazy via getSignatureAction).
 *
 * Estilo: espelha VouchersClient (b2b-overlay/b2b-modal/b2b-btn).
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  issueLegalDocAction,
  revokeLegalDocAction,
  getSignatureAction,
} from './legal-doc-actions'
import type { LegalDocSignatureDTO } from '@clinicai/repositories'

type LegalDocStatus = 'pending' | 'viewed' | 'signed' | 'expired' | 'revoked'

interface RequestRow {
  id: string
  templateId: string
  templateName: string | null
  publicSlug: string
  status: LegalDocStatus
  signerName: string
  createdAt: string
  signedAt: string | null
  expiresAt: string | null
  hasSignature: boolean
}

interface TemplateOption {
  id: string
  name: string
  slug: string
  docType: string
  variables: string[]
}

const STATUS_LABEL: Record<LegalDocStatus, string> = {
  pending: 'Pendente',
  viewed: 'Visualizado',
  signed: 'Assinado',
  expired: 'Expirado',
  revoked: 'Revogado',
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return iso
  }
}

function buildPublicLink(slug: string, token: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/assinatura/${slug}.${token}`
  }
  return `/assinatura/${slug}.${token}`
}

export function DocumentosClient({
  partnershipId,
  partnershipName,
  partnershipPhone,
  partnershipResponsavel,
  defaultTemplateId,
  prefillVars,
  canManage,
  templates,
  initialRequests,
}: {
  partnershipId: string
  partnershipName: string
  partnershipPhone: string
  /** Responsavel da parceria · default no campo signer (Alden 2026-04-26). */
  partnershipResponsavel?: string
  /** Template default selecionado · contrato-parceria-b2b ou primeiro de parceria. */
  defaultTemplateId?: string | null
  /** Variaveis pre-preenchidas (clinic + partnership) · usadas no merge do contrato. */
  prefillVars?: Record<string, string>
  canManage: boolean
  templates: TemplateOption[]
  initialRequests: RequestRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Default signer = responsavel da parceria (contact_name) · fallback nome da parceria.
  const defaultSignerName = partnershipResponsavel || partnershipName

  // Form state · emitir
  const [templateId, setTemplateId] = useState<string>(
    defaultTemplateId || templates[0]?.id || '',
  )
  const [signerName, setSignerName] = useState(defaultSignerName)
  const [signerCpf, setSignerCpf] = useState('')
  const [profissional, setProfissional] = useState(
    prefillVars?.['clinica_nome'] ? 'Dra. Mirian de Paula' : '',
  )
  const [procedimento, setProcedimento] = useState(prefillVars?.['voucher_combo'] ?? '')
  const [lastIssuedLink, setLastIssuedLink] = useState<string | null>(null)

  // Modal "Visualizar assinatura"
  const [viewSig, setViewSig] = useState<LegalDocSignatureDTO | null>(null)
  const [viewSigLoading, setViewSigLoading] = useState(false)

  function resetForm() {
    setTemplateId(defaultTemplateId || templates[0]?.id || '')
    setSignerName(defaultSignerName)
    setSignerCpf('')
    setProfissional('')
    setProcedimento('')
    setLastIssuedLink(null)
    setFeedback(null)
  }

  function onIssue(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setLastIssuedLink(null)
    if (!templateId) {
      setFeedback('Selecione um template.')
      return
    }
    if (!signerName.trim()) {
      setFeedback('Informe o nome do signatário.')
      return
    }
    startTransition(async () => {
      // Merge prefillVars (clinic + partnership) com edits do form.
      // Form fields tomam prioridade quando preenchidos.
      const mergedVars: Record<string, string> = {
        ...(prefillVars ?? {}),
        // Vars do form (signer)
        nome: signerName.trim(),
        cpf: signerCpf.trim(),
        profissional: profissional.trim(),
        procedimento: procedimento.trim(),
        parceria: partnershipName,
        // Override com signerName se editado
        parceira_responsavel: signerName.trim() || prefillVars?.['parceira_responsavel'] || '',
      }
      const r = await issueLegalDocAction({
        partnershipId,
        templateId,
        signerName: signerName.trim(),
        signerCpf: signerCpf.trim() || null,
        signerPhone: partnershipPhone || null,
        variables: mergedVars,
      })
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      const link =
        r.link && r.slug && r.token ? buildPublicLink(r.slug, r.token) : r.link || ''
      setLastIssuedLink(link)
      setFeedback('Documento emitido. Copie o link e envie ao signatário.')
      router.refresh()
    })
  }

  function copyLink(link: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setFeedback(`Copie manualmente: ${link}`)
      return
    }
    navigator.clipboard
      .writeText(link)
      .then(() => setFeedback('Link copiado para a área de transferência.'))
      .catch(() => setFeedback(`Copie manualmente: ${link}`))
  }

  function copyExistingLink(slug: string) {
    // Limitacao: nao temos o raw token apos emissao (so o hash fica no banco).
    // Workaround: copiamos so o slug (admin pode reenviar via WhatsApp se ainda
    // tiver o link original). Pra docs ativos, o admin precisa reemitir se
    // perdeu o token — seguranca vs conveniencia.
    setFeedback(
      `Token nao recuperavel apos emissao (seguranca). Slug: ${slug}. Reemita se necessario.`,
    )
  }

  function onRevoke(id: string) {
    if (!window.confirm('Revogar este documento? Quem ainda nao assinou nao podera mais acessar.')) {
      return
    }
    startTransition(async () => {
      const r = await revokeLegalDocAction(id, partnershipId)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback('Documento revogado.')
      router.refresh()
    })
  }

  function onViewSignature(requestId: string) {
    setViewSigLoading(true)
    setViewSig(null)
    startTransition(async () => {
      const r = await getSignatureAction(requestId)
      setViewSigLoading(false)
      if (!r.ok || !r.data) {
        setFeedback(`Erro: ${r.error || 'assinatura nao encontrada'}`)
        return
      }
      setViewSig(r.data)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Botao emitir */}
      {canManage ? (
        <button
          type="button"
          className="b2b-btn b2b-btn-primary self-start"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
          disabled={templates.length === 0}
          title={templates.length === 0 ? 'Crie templates em Configurações > Documentos legais' : 'Emitir documento'}
        >
          + Emitir documento
        </button>
      ) : null}

      {templates.length === 0 ? (
        <div className="text-[12px] text-[var(--b2b-text-muted)]">
          Nenhum template ativo · cadastre em <strong>Configurações &rsaquo; Documentos
          legais</strong> antes de emitir.
        </div>
      ) : null}

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}

      {lastIssuedLink ? (
        <div
          style={{
            background: 'var(--b2b-card-tint, rgba(201,169,110,0.06))',
            border: '1px solid var(--b2b-border)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--b2b-text-muted)' }}>Link publico:</span>
          <code style={{ fontSize: 11, wordBreak: 'break-all', flex: 1, color: 'var(--b2b-ivory)' }}>
            {lastIssuedLink}
          </code>
          <button type="button" className="b2b-btn" onClick={() => copyLink(lastIssuedLink)}>
            Copiar
          </button>
        </div>
      ) : null}

      {/* Lista de requests */}
      {initialRequests.length === 0 ? (
        <div className="b2b-empty">Nenhum documento emitido para esta parceria.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {initialRequests.map((r) => (
            <DocRow
              key={r.id}
              row={r}
              busy={pending}
              canManage={canManage}
              onCopy={() => copyExistingLink(r.publicSlug)}
              onRevoke={() => onRevoke(r.id)}
              onViewSig={() => onViewSignature(r.id)}
            />
          ))}
        </div>
      )}

      {/* Modal · Emitir */}
      {showForm && canManage ? (
        <div
          className="b2b-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowForm(false)
              resetForm()
            }
          }}
        >
          <div className="b2b-modal" style={{ maxWidth: 720 }}>
            <header
              className="b2b-modal-hdr"
              style={{ paddingBottom: 16, borderBottom: '1px solid var(--b2b-border)' }}
            >
              <div style={{ flex: 1 }}>
                <div className="b2b-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
                  Documento legal · novo
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
                  Emitir <em style={{ color: 'var(--b2b-champagne)', fontWeight: 400 }}>documento</em>
                </h2>
                <div style={{ fontSize: 12, color: 'var(--b2b-text-muted)', marginTop: 4 }}>
                  Gera link publico de assinatura digital · expira em 7 dias
                </div>
              </div>
              <button
                type="button"
                className="b2b-close"
                aria-label="Fechar"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
              >
                ×
              </button>
            </header>

            <div className="b2b-modal-body" style={{ paddingTop: 20 }}>
              <form onSubmit={onIssue}>
                <div className="b2b-sec-title" style={{ marginTop: 0, marginBottom: 12 }}>
                  Template
                </div>
                <div className="b2b-field" style={{ marginBottom: 16 }}>
                  <label className="b2b-field-lbl">Template</label>
                  <select
                    className="b2b-input"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="b2b-sec-title" style={{ marginTop: 8, marginBottom: 12 }}>
                  Signatário
                </div>
                <div className="b2b-grid-2" style={{ gap: 16 }}>
                  <Field label="Nome completo *" value={signerName} onChange={setSignerName} />
                  <Field label="CPF (opcional)" value={signerCpf} onChange={setSignerCpf} mono />
                </div>

                <div className="b2b-sec-title" style={{ marginTop: 24, marginBottom: 12 }}>
                  Variáveis adicionais
                </div>
                <div className="b2b-grid-2" style={{ gap: 16 }}>
                  <Field
                    label="Profissional (opcional)"
                    value={profissional}
                    onChange={setProfissional}
                    placeholder="Dra. Mirian de Paula"
                  />
                  <Field
                    label="Procedimento (opcional)"
                    value={procedimento}
                    onChange={setProcedimento}
                    placeholder="Limpeza de pele profunda"
                  />
                </div>

                <div
                  className="b2b-form-actions"
                  style={{
                    marginTop: 28,
                    paddingTop: 16,
                    borderTop: '1px solid var(--b2b-border)',
                  }}
                >
                  <button
                    type="button"
                    className="b2b-btn"
                    onClick={() => {
                      setShowForm(false)
                      resetForm()
                    }}
                    disabled={pending}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="b2b-btn b2b-btn-primary" disabled={pending}>
                    {pending ? 'Emitindo…' : 'Emitir documento'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal · Visualizar assinatura */}
      {viewSig || viewSigLoading ? (
        <div
          className="b2b-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewSig(null)
            }
          }}
        >
          <div className="b2b-modal" style={{ maxWidth: 600 }}>
            <header
              className="b2b-modal-hdr"
              style={{ paddingBottom: 16, borderBottom: '1px solid var(--b2b-border)' }}
            >
              <div style={{ flex: 1 }}>
                <div className="b2b-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
                  Assinatura registrada
                </div>
                <h2
                  style={{
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                    fontSize: 26,
                    fontWeight: 300,
                    margin: 0,
                    color: 'var(--b2b-ivory)',
                  }}
                >
                  Visualizar <em style={{ color: 'var(--b2b-champagne)', fontWeight: 400 }}>assinatura</em>
                </h2>
              </div>
              <button
                type="button"
                className="b2b-close"
                aria-label="Fechar"
                onClick={() => setViewSig(null)}
              >
                ×
              </button>
            </header>
            <div className="b2b-modal-body" style={{ paddingTop: 20 }}>
              {viewSigLoading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--b2b-text-muted)' }}>
                  Carregando…
                </div>
              ) : viewSig ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: '#FFFFFF', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={viewSig.signatureDataUrl}
                      alt="Assinatura"
                      style={{ maxWidth: '100%', maxHeight: 180 }}
                    />
                  </div>
                  <SigDataTable sig={viewSig} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div className="b2b-field" style={{ marginBottom: 0 }}>
      <label className="b2b-field-lbl">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="b2b-input"
        style={mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } : undefined}
      />
    </div>
  )
}

function DocRow({
  row,
  busy,
  canManage,
  onCopy,
  onRevoke,
  onViewSig,
}: {
  row: RequestRow
  busy: boolean
  canManage: boolean
  onCopy: () => void
  onRevoke: () => void
  onViewSig: () => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--b2b-card-tint, rgba(201,169,110,0.05))',
        border: '1px solid var(--b2b-border)',
        borderRadius: 10,
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
          {row.templateName || '(template removido)'}
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
          <span>{row.signerName}</span>
          <span>emit {fmt(row.createdAt)}</span>
          {row.signedAt ? <span>assin {fmt(row.signedAt)}</span> : null}
          {row.expiresAt && row.status === 'pending' ? (
            <span>até {fmt(row.expiresAt)}</span>
          ) : null}
          <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{row.publicSlug}</span>
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
          background:
            row.status === 'signed'
              ? 'rgba(16,185,129,0.16)'
              : row.status === 'pending'
                ? 'rgba(201,169,110,0.18)'
                : row.status === 'viewed'
                  ? 'rgba(59,130,246,0.16)'
                  : row.status === 'expired'
                    ? 'rgba(217,122,122,0.16)'
                    : 'rgba(255,255,255,0.06)',
          color:
            row.status === 'signed'
              ? '#10B981'
              : row.status === 'pending'
                ? 'var(--b2b-champagne)'
                : row.status === 'viewed'
                  ? '#93C5FD'
                  : row.status === 'expired'
                    ? '#F4B6B6'
                    : 'var(--b2b-text-muted)',
        }}
      >
        {STATUS_LABEL[row.status]}
      </span>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {row.status === 'signed' ? (
          <button
            type="button"
            className="b2b-btn"
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={onViewSig}
            disabled={busy}
            title="Ver canvas + dados da assinatura"
          >
            Visualizar
          </button>
        ) : (
          <button
            type="button"
            className="b2b-btn"
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={onCopy}
            title="Copiar slug (token nao recuperavel apos emissao)"
          >
            Slug
          </button>
        )}

        {canManage && (row.status === 'pending' || row.status === 'viewed') ? (
          <button
            type="button"
            className="b2b-btn"
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderColor: 'rgba(217,122,122,0.4)',
              color: 'var(--b2b-red, #D97A7A)',
            }}
            onClick={onRevoke}
            disabled={busy}
          >
            Revogar
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SigDataTable({ sig }: { sig: LegalDocSignatureDTO }) {
  return (
    <div
      style={{
        background: 'var(--b2b-card-tint, rgba(255,255,255,0.04))',
        border: '1px solid var(--b2b-border)',
        borderRadius: 10,
        padding: '14px 18px',
        fontFamily: 'Montserrat, sans-serif',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <Row label="Signatario" value={sig.signerName} />
      {sig.signerCpf ? <Row label="CPF" value={sig.signerCpf} /> : null}
      <Row label="Assinado em" value={new Date(sig.signedAt).toLocaleString('pt-BR')} />
      {sig.ipAddress ? <Row label="IP" value={sig.ipAddress} mono /> : null}
      {sig.userAgent ? (
        <Row label="User Agent" value={sig.userAgent.substring(0, 80) + (sig.userAgent.length > 80 ? '…' : '')} />
      ) : null}
      {sig.geolocation ? (
        <Row
          label="Geolocalização"
          value={`lat ${(sig.geolocation as { lat?: number }).lat ?? '?'}, lng ${(sig.geolocation as { lng?: number }).lng ?? '?'}`}
          mono
        />
      ) : null}
      <Row label="Aceite" value={sig.acceptanceText} small />
      <Row label="Hash SHA-256" value={sig.documentHash} mono small />
    </div>
  )
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string
  value: string
  mono?: boolean
  small?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 4, borderBottom: '1px solid var(--b2b-border)' }}>
      <span style={{ color: 'var(--b2b-text-muted)', letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: 'var(--b2b-ivory)',
          fontWeight: 500,
          textAlign: 'right',
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
          fontSize: small ? 10 : 12,
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}
