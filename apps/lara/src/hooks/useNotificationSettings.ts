/**
 * useNotificationSettings · preferências de notificações persistidas em localStorage.
 *
 * Permite ao usuário:
 *   · Ligar/desligar push notifications do browser
 *   · Ligar/desligar som de novas mensagens
 *   · Receber só quando aba está hidden (default) ou sempre
 *
 * Server Components não chamam isso · só Client Components.
 */

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'lara_notification_settings_v1'

export interface NotificationSettings {
  enabled: boolean         // master switch
  sound: boolean           // toca tom WhatsApp-like ao receber msg
  onlyWhenHidden: boolean  // notifica apenas se aba não estiver focada
}

const DEFAULTS: NotificationSettings = {
  enabled: true,
  sound: true,
  onlyWhenHidden: true,
}

function read(): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function write(settings: NotificationSettings) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    // Broadcast pra outros componentes/abas reagirem
    window.dispatchEvent(new CustomEvent('lara:notification-settings-changed', { detail: settings }))
  } catch {
    // localStorage cheio · ignora silenciosamente
  }
}

/**
 * Leitura sincrona pra ser usada dentro de useConversations sem causar re-render.
 * Quando settings mudam, useConversations le novamente na proxima checagem.
 */
export function readNotificationSettings(): NotificationSettings {
  return read()
}

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')

  useEffect(() => {
    setSettings(read())
    if ('Notification' in window) {
      setPermission(Notification.permission)
    } else {
      setPermission('unsupported')
    }

    // Escuta updates de outros componentes (ex: toggle no header)
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NotificationSettings>).detail
      if (detail) setSettings(detail)
    }
    window.addEventListener('lara:notification-settings-changed', handler)
    return () => window.removeEventListener('lara:notification-settings-changed', handler)
  }, [])

  const update = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      write(next)
      return next
    })
  }, [])

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported' as const
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  return { settings, update, permission, requestPermission }
}
