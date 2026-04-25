'use client'

/**
 * CandidateFormModal · espelho 1:1 do `b2b-candidate-form.ui.js`.
 * Overlay com form pra adicionar candidato manual (por indicação).
 *
 * Inclui fuzzy similarity check no blur do nome/telefone.
 */

import { useEffect, useRef, useState } from 'react'
import { SCOUT_CATEGORIES } from '@/lib/b2b-ui-helpers'
import {
  addCandidateManualAction,
  findSimilarCandidatesAction,
} from './actions'
import type { SimilarCandidateDTO } from '@clinicai/repositories'

export function CandidateFormModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<SimilarCandidateDTO[]>([])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function checkSimilar() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const name = String(fd.get('name') || '').trim()
    const phone = String(fd.get('phone') || '').trim() || null
    if (name.length < 3) {
      setSimilar([])
      return
    }
    try {
      const r = await findSimilarCandidatesAction(name, phone)
      setSimilar(Array.isArray(r) ? r : [])
    } catch {
      // ignore · best-effort
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const fd = new FormData(e.currentTarget)
    const payload: Record<string, unknown> = {}
    fd.forEach((v, k) => {
      const s = String(v).trim()
      if (s) payload[k] = s
    })

    if (!payload.name) {
      setError('Nome obrigatório')
      return
    }
    if (!payload.category) {
      setError('Categoria obrigatória')
      return
    }

    // Tier target auto da categoria (se não preenchido)
    if (!payload.tier_target && payload.category) {
      const cat = SCOUT_CATEGORIES.find((c) => c.value === payload.category)
      if (cat) payload.tier_target = String(cat.tier)
    }

    setSaving(true)
    try {
      const r = await addCandidateManualAction(payload)
      if (!r.ok) throw new Error(r.error || 'Falha desconhecida')
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div
      className="b2b-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="b2b-modal">
        <header className="b2b-modal-hdr">
          <h2>Novo candidato (indicação)</h2>
          <button type="button" className="b2b-close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="b2b-modal-body">
          <form ref={formRef} className="b2b-form" onSubmit={onSubmit}>
            <div className="b2b-form-sec">Quem é</div>
            <div className="b2b-grid-2">
              <label className="b2b-field">
                <span className="b2b-field-lbl">
                  Nome do negócio <em>*</em>
                </span>
                <input
                  name="name"
                  className="b2b-input"
                  required
                  autoFocus
                  onBlur={checkSimilar}
                />
              </label>
              <label className="b2b-field">
                <span className="b2b-field-lbl">
                  Categoria <em>*</em>
                </span>
                <select name="category" className="b2b-input" required defaultValue="">
                  <option value="">Escolher…</option>
                  {SCOUT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value} data-tier={c.tier}>
                      T{c.tier} · {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {similar.length > 0 && (
              <div className="b2b-similar-warn">
                <div className="b2b-similar-hdr">
                  Já existe candidato parecido — revise antes de salvar:
                </div>
                {similar.slice(0, 5).map((s) => {
                  const simPct =
                    s.similarity != null ? Math.round(Number(s.similarity) * 100) + '%' : '—'
                  const reason = s.match_reason === 'phone' ? 'telefone bate' : `nome ${simPct}`
                  return (
                    <div key={s.id} className="b2b-similar-item">
                      <div className="b2b-similar-main">
                        <strong>{s.name}</strong>
                        {s.phone && <> · <span>{s.phone}</span></>}
                        {s.category && <> · <span>{s.category}</span></>}{' '}
                        · <span style={{ color: '#F59E0B' }}>{reason}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="b2b-form-sec">Contato</div>
            <div className="b2b-grid-2">
              <label className="b2b-field">
                <span className="b2b-field-lbl">Telefone / WhatsApp</span>
                <input
                  name="phone"
                  className="b2b-input"
                  placeholder="+55 44 9..."
                  onBlur={checkSimilar}
                />
              </label>
              <label className="b2b-field">
                <span className="b2b-field-lbl">Instagram</span>
                <input name="instagram_handle" className="b2b-input" placeholder="@handle" />
              </label>
            </div>
            <div className="b2b-grid-2">
              <label className="b2b-field">
                <span className="b2b-field-lbl">E-mail</span>
                <input name="email" type="email" className="b2b-input" />
              </label>
              <label className="b2b-field">
                <span className="b2b-field-lbl">Site</span>
                <input name="website" className="b2b-input" placeholder="https://..." />
              </label>
            </div>
            <label className="b2b-field">
              <span className="b2b-field-lbl">Endereço</span>
              <input name="address" className="b2b-input" />
            </label>

            <div className="b2b-form-sec">Indicação</div>
            <div className="b2b-grid-2">
              <label className="b2b-field">
                <span className="b2b-field-lbl">Quem indicou</span>
                <input
                  name="referred_by"
                  className="b2b-input"
                  placeholder="Nome de quem passou o contato"
                />
              </label>
              <label className="b2b-field">
                <span className="b2b-field-lbl">Contato de quem indicou</span>
                <input
                  name="referred_by_contact"
                  className="b2b-input"
                  placeholder="Telefone / @"
                />
              </label>
            </div>
            <label className="b2b-field">
              <span className="b2b-field-lbl">Motivo / contexto da indicação</span>
              <textarea
                name="referred_by_reason"
                rows={2}
                className="b2b-input"
                placeholder="Por que faz sentido? O que te fez pensar nesse parceiro?"
              />
            </label>

            <div className="b2b-form-sec">
              Avaliação inicial (opcional — pode avaliar depois com IA)
            </div>
            <div className="b2b-grid-2">
              <label className="b2b-field">
                <span className="b2b-field-lbl">DNA score (1-10)</span>
                <input
                  name="dna_score"
                  type="number"
                  min={1}
                  max={10}
                  step={0.1}
                  className="b2b-input"
                  placeholder="ex: 8.5"
                />
              </label>
              <label className="b2b-field">
                <span className="b2b-field-lbl">Tier target</span>
                <select name="tier_target" className="b2b-input" defaultValue="">
                  <option value="">—</option>
                  <option value="1">Tier 1</option>
                  <option value="2">Tier 2</option>
                  <option value="3">Tier 3</option>
                </select>
              </label>
            </div>
            <label className="b2b-field">
              <span className="b2b-field-lbl">Justificativa do score</span>
              <textarea
                name="dna_justification"
                rows={2}
                className="b2b-input"
                placeholder="Por que esse score? (opcional)"
              />
            </label>

            <div className="b2b-form-actions">
              <button type="button" className="b2b-btn" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="b2b-btn b2b-btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Adicionar candidato'}
              </button>
            </div>
            {error && <div className="b2b-form-err">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  )
}
