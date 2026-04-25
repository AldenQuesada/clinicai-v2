'use client'

/**
 * NotificationToggle · sino on/off no AppHeader.
 *
 * Click toggla `enabled` em localStorage. Se permission ainda for 'default',
 * pede no primeiro click (user gesture válido).
 */

import { Bell, BellOff } from 'lucide-react'
import { useNotificationSettings } from '@/hooks/useNotificationSettings'

export function NotificationToggle() {
  const { settings, update, permission, requestPermission } = useNotificationSettings()

  if (permission === 'unsupported') return null

  const isOn = settings.enabled && permission === 'granted'

  const handleClick = async () => {
    if (permission === 'default') {
      const result = await requestPermission()
      if (result === 'granted') {
        update({ enabled: true })
      }
      return
    }
    if (permission === 'denied') {
      // Browser bloqueou · pouco que dá pra fazer. Mostra hint.
      alert('Notificações estão bloqueadas no navegador. Habilite manualmente nas configurações de site.')
      return
    }
    // permission === 'granted' · só toggla preferência local
    update({ enabled: !settings.enabled })
  }

  const title = permission === 'denied'
    ? 'Notificações bloqueadas no navegador'
    : isOn
    ? 'Notificações ativas · click para silenciar'
    : 'Notificações silenciadas · click para ativar'

  return (
    <button
      onClick={handleClick}
      title={title}
      className={`p-2 rounded-md transition-colors ${
        isOn
          ? 'text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10'
          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'
      }`}
    >
      {isOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
    </button>
  )
}
