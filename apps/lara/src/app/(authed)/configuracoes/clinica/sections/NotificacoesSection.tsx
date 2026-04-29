'use client'

/**
 * Section · Notificacoes Automaticas.
 * Port da subsecao Notificacoes (clinic-dashboard/index.html linhas 1181-1220).
 */

import type { ClinicSettingsData } from '../types'

interface ToggleRowProps {
  title: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}

function ToggleRow({ title, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'var(--b2b-bg-1)',
        borderRadius: 6,
        border: '1px solid var(--b2b-border)',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--b2b-ivory)' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 2 }}>{description}</div>
      </div>
      <label
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 40,
          height: 22,
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: checked ? 'var(--b2b-champagne)' : 'var(--b2b-bg-3)',
            borderRadius: 22,
            transition: 'background 0.2s',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 16,
            height: 16,
            background: '#fff',
            borderRadius: '50%',
            transition: 'left 0.2s',
          }}
        />
      </label>
    </div>
  )
}

export function NotificacoesSection({
  data,
  onChange,
  canEdit,
}: {
  data: ClinicSettingsData
  onChange: (patch: Partial<ClinicSettingsData>) => void
  canEdit: boolean
}) {
  const ro = !canEdit

  return (
    <section className="luxury-card" style={{ padding: '20px 24px 24px' }}>
      <div className="b2b-form-sec">Notificações Automáticas</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ToggleRow
          title="Confirmação automática por WhatsApp"
          description="Envia confirmação ao paciente logo após o agendamento"
          checked={!!data.notif_confirmacao}
          disabled={ro}
          onChange={(notif_confirmacao) => onChange({ notif_confirmacao })}
        />
        <ToggleRow
          title="Lembrete 24h antes"
          description="Lembrete automático 24 horas antes do agendamento"
          checked={!!data.notif_lembrete24}
          disabled={ro}
          onChange={(notif_lembrete24) => onChange({ notif_lembrete24 })}
        />
        <ToggleRow
          title="Lembrete 1h antes"
          description="Lembrete automático 1 hora antes do agendamento"
          checked={!!data.notif_lembrete1h}
          disabled={ro}
          onChange={(notif_lembrete1h) => onChange({ notif_lembrete1h })}
        />
        <div className="b2b-field" style={{ marginTop: 4 }}>
          <label className="b2b-field-lbl">Mensagem de Boas-Vindas (WhatsApp)</label>
          <textarea
            rows={3}
            className="b2b-input"
            placeholder="Olá {nome}! Seu agendamento na {clinica} foi confirmado para {data} às {hora}."
            value={data.msg_boas_vindas}
            onChange={(e) => onChange({ msg_boas_vindas: e.target.value })}
            disabled={ro}
          />
          <div style={{ fontSize: 10, color: 'var(--b2b-text-muted)', marginTop: 4 }}>
            Variáveis: {'{nome}'}, {'{clinica}'}, {'{data}'}, {'{hora}'}, {'{profissional}'}
          </div>
        </div>
      </div>
    </section>
  )
}
