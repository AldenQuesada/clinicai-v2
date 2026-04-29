'use client'

/**
 * Section · Perfil & Contato.
 * Port das subsecoes "Informacoes Gerais" + "Contato" + "Redes Sociais"
 * (clinic-dashboard/index.html linhas 812-942).
 */

import type { ClinicSettingsData } from '../types'
import { ResponsaveisRepeater } from '../repeaters/ResponsaveisRepeater'
import { maskPhone } from '../lib/masks'

const TIPOS = [
  '',
  'Clínica de Estética',
  'Clínica Dermatológica',
  'Clínica de Harmonização Facial',
  'Clínica Médica Estética',
  'Spa Médico',
  'Studio de Estética',
  'Clínica de Nutrição Estética',
  'Clínica Multidisciplinar',
  'Consultório Médico',
  'Outro',
]

const ESPECIALIDADES = [
  '',
  'Estética Facial e Corporal',
  'Harmonização Orofacial',
  'Dermatologia Clínica',
  'Medicina Estética',
  'Laser e Tecnologias',
  'Capilar e Tricologia',
  'Rejuvenescimento Facial',
  'Cirurgia Plástica',
  'Nutrição Estética',
  'Podologia',
  'Múltiplas Especialidades',
]

const FUNCIONARIOS = [
  { value: '', label: 'Selecione...' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6-10', label: '6 a 10' },
  { value: '11-20', label: '11 a 20' },
  { value: '21-50', label: '21 a 50' },
  { value: '50+', label: 'Mais de 50' },
]

export function PerfilContatoSection({
  data,
  onChange,
  canEdit,
  canEditOwner,
}: {
  data: ClinicSettingsData
  onChange: (patch: Partial<ClinicSettingsData>) => void
  canEdit: boolean
  canEditOwner: boolean
}) {
  const ro = !canEdit

  return (
    <section className="luxury-card" style={{ padding: '20px 24px 24px' }}>
      {/* Informacoes Gerais */}
      <div className="b2b-form-sec">Informações Gerais</div>
      <div className="b2b-grid-2">
        <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
          <label className="b2b-field-lbl">
            Nome da Clínica<em> *</em>
          </label>
          <input
            type="text"
            className="b2b-input"
            placeholder="Ex: Clínica Mirian de Paula"
            value={data.nome}
            onChange={(e) => onChange({ nome: e.target.value })}
            readOnly={!canEditOwner}
            disabled={ro}
            title={canEditOwner ? undefined : 'Somente o proprietário pode alterar o nome da clínica'}
            style={!canEditOwner ? { opacity: 0.7 } : undefined}
          />
        </div>
        <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
          <label className="b2b-field-lbl">Slogan / Descrição</label>
          <textarea
            rows={2}
            className="b2b-input"
            placeholder="Breve descrição ou slogan da clínica..."
            value={data.descricao}
            onChange={(e) => onChange({ descricao: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Tipo de Estabelecimento</label>
          <select
            className="b2b-input"
            value={data.tipo}
            onChange={(e) => onChange({ tipo: e.target.value })}
            disabled={ro}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t || 'Selecione...'}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Especialidade Principal</label>
          <select
            className="b2b-input"
            value={data.especialidade}
            onChange={(e) => onChange({ especialidade: e.target.value })}
            disabled={ro}
          >
            {ESPECIALIDADES.map((e) => (
              <option key={e} value={e}>
                {e || 'Selecione...'}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Número de Funcionários</label>
          <select
            className="b2b-input"
            value={data.funcionarios}
            onChange={(e) => onChange({ funcionarios: e.target.value })}
            disabled={ro}
          >
            {FUNCIONARIOS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Data de Fundação</label>
          <input
            type="date"
            className="b2b-input"
            value={data.data_fundacao}
            onChange={(e) => onChange({ data_fundacao: e.target.value })}
            disabled={ro}
          />
        </div>
      </div>

      {/* Contato */}
      <div className="b2b-form-sec">Contato</div>
      <div className="b2b-grid-2">
        <div className="b2b-field">
          <label className="b2b-field-lbl">Telefone</label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--b2b-border)', borderRadius: 5, overflow: 'hidden', background: 'var(--b2b-bg-2)' }}>
            <span
              style={{
                padding: '9px 10px',
                background: 'var(--b2b-bg-3)',
                borderRight: '1px solid var(--b2b-border)',
                fontSize: 12,
                color: 'var(--b2b-text-dim)',
                fontWeight: 600,
              }}
            >
              +55
            </span>
            <input
              type="text"
              placeholder="(11) 3333-3333"
              maxLength={15}
              value={data.telefone}
              onChange={(e) => onChange({ telefone: maskPhone(e.target.value) })}
              disabled={ro}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: 'none',
                fontSize: 13,
                outline: 'none',
                background: 'transparent',
                color: 'var(--b2b-ivory)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">WhatsApp Comercial</label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--b2b-border)', borderRadius: 5, overflow: 'hidden', background: 'var(--b2b-bg-2)' }}>
            <span
              style={{
                padding: '9px 10px',
                background: 'var(--b2b-bg-3)',
                borderRight: '1px solid var(--b2b-border)',
                fontSize: 12,
                color: 'var(--b2b-text-dim)',
                fontWeight: 600,
              }}
            >
              +55
            </span>
            <input
              type="text"
              placeholder="(11) 99999-9999"
              maxLength={15}
              value={data.whatsapp}
              onChange={(e) => onChange({ whatsapp: maskPhone(e.target.value) })}
              disabled={ro}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: 'none',
                fontSize: 13,
                outline: 'none',
                background: 'transparent',
                color: 'var(--b2b-ivory)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">E-mail</label>
          <input
            type="email"
            className="b2b-input"
            placeholder="contato@clinica.com.br"
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Site</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="https://clinica.com.br"
            value={data.site}
            onChange={(e) => onChange({ site: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
          <label className="b2b-field-lbl">Cardápio Digital / Menu de Procedimentos</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="https://link-do-cardapio.com.br"
            value={data.cardapio}
            onChange={(e) => onChange({ cardapio: e.target.value })}
            disabled={ro}
          />
        </div>
      </div>

      {/* Redes Sociais */}
      <div className="b2b-form-sec">Redes Sociais</div>
      <div className="b2b-grid-2">
        <div className="b2b-field">
          <label className="b2b-field-lbl">Instagram</label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 13,
                color: 'var(--b2b-text-muted)',
              }}
            >
              @
            </span>
            <input
              type="text"
              className="b2b-input"
              placeholder="clinica"
              value={data.instagram}
              onChange={(e) => onChange({ instagram: e.target.value })}
              disabled={ro}
              style={{ paddingLeft: 24 }}
            />
          </div>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">TikTok</label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 13,
                color: 'var(--b2b-text-muted)',
              }}
            >
              @
            </span>
            <input
              type="text"
              className="b2b-input"
              placeholder="clinica"
              value={data.tiktok}
              onChange={(e) => onChange({ tiktok: e.target.value })}
              disabled={ro}
              style={{ paddingLeft: 24 }}
            />
          </div>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Facebook</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="facebook.com/clinica"
            value={data.facebook}
            onChange={(e) => onChange({ facebook: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">YouTube</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="youtube.com/@clinica"
            value={data.youtube}
            onChange={(e) => onChange({ youtube: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">LinkedIn</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="linkedin.com/company/clinica"
            value={data.linkedin}
            onChange={(e) => onChange({ linkedin: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Google Meu Negócio</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="Link do perfil Google"
            value={data.google}
            onChange={(e) => onChange({ google: e.target.value })}
            disabled={ro}
          />
        </div>
      </div>

      {/* Responsaveis */}
      <div style={{ marginTop: 24 }}>
        <ResponsaveisRepeater
          value={data.responsaveis}
          onChange={(responsaveis) => onChange({ responsaveis })}
          disabled={ro}
        />
      </div>
    </section>
  )
}
