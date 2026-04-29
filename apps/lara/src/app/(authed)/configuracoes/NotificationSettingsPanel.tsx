'use client'

/**
 * NotificationSettingsPanel · 3 switches de preferência de notificação.
 *
 * Settings ficam em localStorage (per-device) · não vão pro DB. Toggles
 * mexem nas mesmas chaves usadas por NotificationToggle (header) e useConversations.
 */

import { Bell, Volume2, Eye, BellOff } from 'lucide-react'
import { useNotificationSettings } from '@/hooks/useNotificationSettings'

export function NotificationSettingsPanel() {
  const { settings, update, permission, requestPermission } = useNotificationSettings()

  if (permission === 'unsupported') {
    return (
      <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
        <h2 className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2 font-display-uppercase">
          Notificações
        </h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Seu navegador não suporta push notifications. Use Chrome, Firefox ou Edge recente.
        </p>
      </div>
    )
  }

  const handleEnableToggle = async () => {
    if (permission === 'default') {
      const result = await requestPermission()
      if (result === 'granted') update({ enabled: true })
      return
    }
    if (permission === 'denied') {
      alert('Notificações bloqueadas no navegador. Habilite manualmente em "Permissões do site".')
      return
    }
    update({ enabled: !settings.enabled })
  }

  const masterOn = settings.enabled && permission === 'granted'

  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] font-display-uppercase">
            Notificações
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Preferências per-device · ficam neste navegador
          </p>
        </div>
        {permission === 'denied' && (
          <span className="text-[10px] uppercase tracking-widest text-[hsl(var(--danger))]">
            Bloqueado no navegador
          </span>
        )}
      </div>

      <ToggleRow
        icon={masterOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        label="Avisos de novas mensagens"
        description={
          permission === 'default'
            ? 'Click no botão pra autorizar o navegador a exibir notificações'
            : 'Mostra um pop-up do sistema quando uma paciente manda mensagem'
        }
        checked={masterOn}
        onChange={handleEnableToggle}
      />

      <ToggleRow
        icon={<Volume2 className="w-4 h-4" />}
        label="Som de mensagem nova"
        description="Toca um sino curto a cada mensagem recebida (estilo WhatsApp)"
        checked={settings.sound}
        onChange={() => update({ sound: !settings.sound })}
        disabled={!masterOn}
      />

      <ToggleRow
        icon={<Eye className="w-4 h-4" />}
        label="Notificar apenas em segundo plano"
        description="Não mostra pop-up se a aba já estiver visível · evita ruído. Mensagens urgentes ignoram este filtro."
        checked={settings.onlyWhenHidden}
        onChange={() => update({ onlyWhenHidden: !settings.onlyWhenHidden })}
        disabled={!masterOn}
      />
    </div>
  )
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div className={`flex items-start gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="p-2 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[hsl(var(--foreground))]">{label}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 mt-1 ${
          checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
