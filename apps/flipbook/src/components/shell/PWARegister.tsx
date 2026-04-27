'use client'

import { useEffect } from 'react'

/**
 * Registra o Service Worker · faz o app ficar PWA instalável + offline-ready.
 * Roda 1x ao montar o root layout.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return // só em prod

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => { /* ignore */ })
    }
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
