'use client'

/**
 * EncerramentosClient · espelho 1:1 do `b2b-closure.ui.js`.
 *
 * Botão "Detectar agora" · lista de cards com 3 ações (Abrir/Manter ativa/
 * Encerrar) · modal com escolha de template + motivo antes de encerrar ·
 * carta gerada exibida abaixo da lista.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  detectInactiveAction,
  approveClosureAction,
  dismissClosureAction,
} from './actions'
import type { ClosureCandidate } from '@clinicai/repositories'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

const HEALTH_COLOR: Record<string, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
  unknown: '#9CA3AF',
}

export function EncerramentosClient({ pending }: { pending: ClosureCandidate[] }) {
  const router = useRouter()
  const [pendingTransition, startTransition] = useTransition()
  const [detecting, setDetecting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [askId, setAskId] = useState<string | null>(null)
  const [askName, setAskName] = useState<string>('')
  const [lastLetter, setLastLetter] = useState<string | null>(null)

  function onDetect() {
    setDetecting(true)
    startTransition(async () => {
      try {
        const r = await detectInactiveAction()
        if (!r.ok) {
          alert(`Erro: ${r.error || 'desconhecido'}`)
          return
        }
        if (r.flagged === 0) alert('Tudo no prazo — nenhuma nova flagada')
        else alert(`${r.flagged} parceria(s) flagada(s) para revisão`)
        router.refresh()
      } finally {
        setDetecting(false)
      }
    })
  }

  function onDismiss(id: string, name: string) {
    const note = window.prompt(`Mantendo "${name}" ativa. Nota (opcional):`, '')
    if (note === null) return
    setBusyId(id)
    startTransition(async () => {
      try {
        const r = await dismissClosureAction(id, note || null)
        if (!r.ok) alert(`Erro: ${r.error || 'falha'}`)
        else {
          alert(`"${name}" mantida ativa`)
          router.refresh()
        }
      } finally {
        setBusyId(null)
      }
    })
  }

  function onApproveClick(id: string, name: string) {
    setAskId(id)
    setAskName(name)
  }

  function onAskCancel() {
    setAskId(null)
    setAskName('')
  }

  function onAskConfirm(reason: string, templateKey: string) {
    if (!askId) return
    const id = askId
    const name = askName
    setAskId(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        const r = await approveClosureAction(id, reason || null, templateKey)
        if (!r.ok) {
          alert(`Erro: ${r.error || 'falha'}`)
          return
        }
        if (r.letter) setLastLetter(r.letter)
        alert(`"${name}" encerrada · carta gerada abaixo`)
        router.refresh()
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <>
      {/* Header com botão Detectar */}
      <div className="b2b-health-head">
        <div>
          <div className="b2b-list-count">Parcerias sugeridas pra encerramento</div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--b2b-text-muted)',
              marginTop: '2px',
            }}
          >
            Detecção mensal automática · critérios: 90d sem atividade · saúde vermelha · DNA quebrado
          </div>
        </div>
        <button
          type="button"
          className="b2b-btn"
          onClick={onDetect}
          disabled={detecting || pendingTransition}
        >
          {detecting ? 'Detectando…' : 'Detectar agora'}
        </button>
      </div>

      {/* Lista */}
      {pending.length === 0 ? (
        <div
          className="b2b-empty"
          style={{ borderColor: 'rgba(138,158,136,0.3)', color: 'var(--b2b-sage)' }}
        >
          Nenhuma parceria em risco de encerramento. Tudo saudável.
        </div>
      ) : (
        pending.map((p) => (
          <ClosureRow
            key={p.id}
            p={p}
            busy={busyId === p.id || pendingTransition}
            onDismiss={() => onDismiss(p.id, p.name)}
            onApprove={() => onApproveClick(p.id, p.name)}
          />
        ))
      )}

      {/* Carta gerada */}
      {lastLetter && (
        <div className="b2b-clos-letter">
          <div className="b2b-sec-title">Carta gerada — copie pra enviar</div>
          <textarea readOnly rows={10} className="b2b-input" value={lastLetter} />
        </div>
      )}

      {/* Modal escolha template + motivo */}
      {askId && (
        <ApproveModal
          partnershipName={askName}
          onCancel={onAskCancel}
          onConfirm={onAskConfirm}
        />
      )}
    </>
  )
}

function ClosureRow({
  p,
  busy,
  onDismiss,
  onApprove,
}: {
  p: ClosureCandidate
  busy: boolean
  onDismiss: () => void
  onApprove: () => void
}) {
  const days = p.days_idle != null ? `${p.days_idle}d` : '—'
  const dna = p.dna_score != null ? Number(p.dna_score).toFixed(1) : '—'
  const health = p.health_color || 'unknown'

  return (
    <div className="b2b-clos-row">
      <span
        className="b2b-sug-dot"
        style={{ background: HEALTH_COLOR[health] || HEALTH_COLOR.unknown }}
      />
      <div className="b2b-clos-body">
        <div className="b2b-clos-top">
          <strong>{p.name}</strong>
          {p.tier && <span className="b2b-pill b2b-pill-tier">T{p.tier}</span>}
          <span className="b2b-pill">{p.pillar || 'outros'}</span>
          <span className="b2b-pill">{p.status}</span>
        </div>
        <div className="b2b-clos-meta">
          Motivo: <strong>{p.closure_reason || '—'}</strong>
          {' · '}DNA {dna}
          {' · '}
          {days} sem atividade
          {' · '}flagada em {fmtDate(p.closure_suggested_at)}
        </div>
      </div>
      <div className="b2b-clos-acts">
        <Link href={`/partnerships/${p.id}`} className="b2b-btn">
          Abrir
        </Link>
        <button type="button" className="b2b-btn" disabled={busy} onClick={onDismiss}>
          Manter ativa
        </button>
        <button
          type="button"
          className="b2b-btn b2b-btn-primary"
          disabled={busy}
          onClick={onApprove}
        >
          {busy ? 'Encerrando…' : 'Encerrar'}
        </button>
      </div>
    </div>
  )
}

function ApproveModal({
  partnershipName,
  onCancel,
  onConfirm,
}: {
  partnershipName: string
  onCancel: () => void
  onConfirm: (reason: string, templateKey: string) => void
}) {
  const [reason, setReason] = useState('')
  const [templateKey, setTemplateKey] = useState('default')

  return (
    <div
      className="b2b-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="b2b-modal">
        <header className="b2b-modal-hdr">
          <h2>Encerrar &quot;{partnershipName}&quot;</h2>
          <button type="button" className="b2b-close" onClick={onCancel} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="b2b-modal-body">
          <p
            style={{
              fontSize: '12px',
              color: 'var(--b2b-text-muted)',
              marginTop: 0,
            }}
          >
            Status vira &quot;closed&quot; · vouchers cancelados · tasks auto-resolvidas · carta formal gerada.
          </p>
          <label className="b2b-field">
            <span className="b2b-field-lbl">Template da carta</span>
            <select
              className="b2b-input"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
            >
              <option value="default">default</option>
              <option value="amicavel">amicavel — encerramento amigável</option>
              <option value="performance">performance — queda de engajamento</option>
            </select>
          </label>
          <label className="b2b-field">
            <span className="b2b-field-lbl">Motivo final (aparece na carta)</span>
            <textarea
              className="b2b-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Queda de engajamento nos últimos 90 dias"
            />
          </label>
          <div className="b2b-form-actions">
            <button type="button" className="b2b-btn" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn b2b-btn-primary"
              onClick={() => onConfirm(reason, templateKey)}
            >
              Encerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
