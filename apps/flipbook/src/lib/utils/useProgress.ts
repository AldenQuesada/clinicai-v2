'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface RemoteProgress {
  last_page: number
  total_pages: number | null
  updated_at: string
}

const SAVE_DEBOUNCE_MS = 5000

/**
 * Hook · sincroniza progresso de leitura cross-device.
 * - GET inicial · retorna último progress
 * - POST debounced (5s) · cada mudança de página
 * - sendBeacon no unload pra garantir último estado
 *
 * Falha silenciosa: anonymous user retorna null progress, ignora saves.
 */
export function useProgress(flipbookId: string) {
  const [remote, setRemote] = useState<RemoteProgress | null>(null)
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSent = useRef<{ page: number; t: number } | null>(null)

  // Fetch inicial
  useEffect(() => {
    let cancelled = false
    fetch(`/api/progress?flipbook_id=${encodeURIComponent(flipbookId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.progress) setRemote(data.progress)
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [flipbookId])

  const save = useCallback((lastPage: number, totalPages?: number | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (lastSent.current?.page === lastPage) return
      lastSent.current = { page: lastPage, t: Date.now() }
      const body = JSON.stringify({ flipbook_id: flipbookId, last_page: lastPage, total_pages: totalPages ?? null })
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body, keepalive: true,
      }).catch(() => {})
    }, SAVE_DEBOUNCE_MS)
  }, [flipbookId])

  const flushOnUnload = useCallback((lastPage: number, totalPages?: number | null) => {
    if (lastSent.current?.page === lastPage) return
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return
    const body = JSON.stringify({ flipbook_id: flipbookId, last_page: lastPage, total_pages: totalPages ?? null })
    const blob = new Blob([body], { type: 'application/json' })
    navigator.sendBeacon('/api/progress', blob)
  }, [flipbookId])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  return { remote, loaded, save, flushOnUnload }
}
