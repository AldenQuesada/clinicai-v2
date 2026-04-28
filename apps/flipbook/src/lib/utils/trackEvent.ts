'use client'

import { getSessionId } from './session'

export type ConversionKind =
  | 'amazon_click'
  | 'lead_capture_shown'
  | 'lead_capture_dismissed'
  | 'lead_capture_submitted'
  | 'share_copy'
  | 'share_native'
  | 'fullscreen_enter'
  | 'cinematic_skip'
  | 'reading_engaged'
  | 'reading_complete'

/**
 * Registra evento de conversão. Fire-and-forget · falha silenciosa.
 *
 * Use em qualquer momento de intenção do leitor (clicou no Amazon, dispensou
 * lead capture, entrou em fullscreen, completou 75% do livro, etc).
 *
 * Stats dashboard agrega via RPC `flipbook_conversion_funnel(book_id, days_back)`.
 */
export function trackEvent(input: {
  flipbookId: string
  kind: ConversionKind
  pageNumber?: number | null
  metadata?: Record<string, unknown>
}): void {
  if (typeof window === 'undefined') return

  const body = JSON.stringify({
    flipbook_id: input.flipbookId,
    session_id: getSessionId(),
    kind: input.kind,
    page_number: input.pageNumber ?? null,
    metadata: input.metadata ?? {},
  })

  // sendBeacon: dispara durante unload (ex: fechar aba após Amazon click) sem bloquear navegação
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    navigator.sendBeacon('/api/track-event', blob)
    return
  }

  fetch('/api/track-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}
