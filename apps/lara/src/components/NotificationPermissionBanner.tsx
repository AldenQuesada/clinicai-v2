'use client'

/**
 * NotificationPermissionBanner · pede permissão pro browser exibir push.
 *
 * Aparece apenas se Notification.permission === 'default' E o usuário não
 * dispensou. Browsers modernos exigem user gesture pra Notification.requestPermission()
 * funcionar · por isso usamos botão explícito em vez de prompt automático.
 */

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { useNotificationSettings } from '@/hooks/useNotificationSettings'

const DISMISS_KEY = 'lara_notif_banner_dismissed_v1'

export function NotificationPermissionBanner() {
  const { permission, requestPermission } = useNotificationSettings()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  if (dismissed || permission !== 'default') return null

  const handleEnable = async () => {
    const result = await requestPermission()
    if (result !== 'default') {
      localStorage.setItem(DISMISS_KEY, '1')
      setDismissed(true)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-[hsl(var(--primary))]/10 border-b border-[hsl(var(--primary))]/20 text-xs">
      <div className="flex items-center gap-2 text-[hsl(var(--foreground))]">
        <Bell className="w-4 h-4 text-[hsl(var(--primary))]" />
        <span>
          Receba avisos quando uma paciente mandar mensagem nova · funciona mesmo com a aba em segundo plano.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleEnable}
          className="px-3 py-1.5 rounded-md text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
        >
          Ativar notificações
        </button>
        <button
          onClick={handleDismiss}
          title="Dispensar"
          className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
