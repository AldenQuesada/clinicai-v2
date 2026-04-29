'use client'

/**
 * LeadEditDrawer · modal pra editar campos do lead.
 *
 * Padrao b2b-overlay + b2b-modal (igual usuarios/InviteModal).
 * Validacoes client-side espelham as do server action:
 *   - phone 10-13 digitos
 *   - email RFC simplificado
 *   - idade 0-120
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Funnel, LeadDTO, LeadTemperature } from '@clinicai/repositories'
import { updateLeadAction } from '../actions'

const FUNNELS: Funnel[] = ['olheiras', 'fullface', 'procedimentos']
const TEMPS: LeadTemperature[] = ['cold', 'warm', 'hot']

function maskPhoneBr(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  // Apenas mascarar visualmente quando tem 10-11 digitos (BR puro)
  const local = d.length === 13 || d.length === 12 ? d.substring(2) : d
  if (local.length === 11) return `(${local.substring(0, 2)}) ${local.substring(2, 7)}-${local.substring(7)}`
  if (local.length === 10) return `(${local.substring(0, 2)}) ${local.substring(2, 6)}-${local.substring(6)}`
  return raw
}

export function LeadEditDrawer({
  lead,
  onClose,
  onSaved,
  onError,
}: {
  lead: LeadDTO
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(lead.name || '')
  const [phone, setPhone] = useState(maskPhoneBr(lead.phone || ''))
  const [email, setEmail] = useState(lead.email || '')
  const [idade, setIdade] = useState(lead.idade != null ? String(lead.idade) : '')
  const [funnel, setFunnel] = useState<Funnel | ''>(lead.funnel || '')
  const [temperature, setTemperature] = useState<LeadTemperature | ''>(lead.temperature || '')
  const [queixas, setQueixas] = useState((lead.queixasFaciais || []).join(', '))

  // Client-side validations
  const phoneDigits = phone.replace(/\D/g, '')
  const phoneInvalid = phone.trim() !== '' && (phoneDigits.length < 10 || phoneDigits.length > 13)
  const emailInvalid =
    email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const idadeInvalid =
    idade.trim() !== '' && (Number.isNaN(Number(idade)) || Number(idade) < 0 || Number(idade) > 120)

  const canSave = !phoneInvalid && !emailInvalid && !idadeInvalid && !busy

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('name', name.trim())
      fd.set('phone', phoneDigits)
      fd.set('email', email.trim())
      fd.set('idade', idade.trim())
      if (funnel) fd.set('funnel', funnel)
      if (temperature) fd.set('temperature', temperature)
      fd.set('queixas_faciais', queixas.trim())

      const result = await updateLeadAction(lead.id, fd)
      if (!result.ok) {
        onError(result.error || 'Falha ao salvar')
        return
      }
      onSaved()
    } catch (err) {
      onError((err as Error).message || 'Erro inesperado')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <form
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{ maxWidth: 540 }}
      >
        <div className="b2b-modal-hdr">
          <h2>Editar lead</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="b2b-modal-body">
          <div className="b2b-form-sec">Identificação</div>
          <div className="b2b-field">
            <label className="b2b-field-lbl">Nome</label>
            <input
              type="text"
              className="b2b-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="b2b-grid-2">
            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Telefone <em>*</em>
              </label>
              <input
                type="text"
                className="b2b-input"
                value={phone}
                onChange={(e) => setPhone(maskPhoneBr(e.target.value))}
                placeholder="(44) 99999-9999"
                inputMode="tel"
                required
              />
              {phoneInvalid && (
                <div className="b2b-form-err">Telefone inválido (10-13 dígitos)</div>
              )}
            </div>
            <div className="b2b-field">
              <label className="b2b-field-lbl">Email</label>
              <input
                type="email"
                className="b2b-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailInvalid && <div className="b2b-form-err">Email inválido</div>}
            </div>
          </div>
          <div className="b2b-grid-2">
            <div className="b2b-field">
              <label className="b2b-field-lbl">Idade</label>
              <input
                type="number"
                className="b2b-input"
                value={idade}
                min={0}
                max={120}
                onChange={(e) => setIdade(e.target.value)}
              />
              {idadeInvalid && <div className="b2b-form-err">Idade inválida (0-120)</div>}
            </div>
          </div>

          <div className="b2b-form-sec">Pipeline</div>
          <div className="b2b-grid-2">
            <div className="b2b-field">
              <label className="b2b-field-lbl">Funnel</label>
              <select
                className="b2b-input"
                value={funnel}
                onChange={(e) => setFunnel((e.target.value || '') as Funnel | '')}
              >
                <option value="">— manter atual —</option>
                {FUNNELS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="b2b-field">
              <label className="b2b-field-lbl">Temperatura</label>
              <select
                className="b2b-input"
                value={temperature}
                onChange={(e) => setTemperature((e.target.value || '') as LeadTemperature | '')}
              >
                <option value="">— manter atual —</option>
                {TEMPS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="b2b-form-sec">Queixas faciais</div>
          <div className="b2b-field">
            <label className="b2b-field-lbl">Lista (separar por vírgula)</label>
            <textarea
              className="b2b-input"
              rows={3}
              value={queixas}
              onChange={(e) => setQueixas(e.target.value)}
              placeholder="ex: rugas perioculares, flacidez, manchas"
            />
          </div>

          <div className="b2b-form-actions">
            <button type="button" className="b2b-btn" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              type="submit"
              className="b2b-btn b2b-btn-primary"
              disabled={!canSave}
            >
              {busy ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
