'use client'

const SESSION_KEY = 'flipbook_session_id'

/**
 * Persiste session_id (uuid) no localStorage. Mesmo session pra todas as
 * leituras do mesmo browser, sem auth.
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let id = window.localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

/**
 * Registra view de página. Chamar com debounce (não a cada virada — a cada
 * ~3-5s ou ao trocar de página estabilizada).
 *
 * Falha silenciosa: analytics nunca quebra leitura.
 */
export function trackPageView(input: {
  flipbookId: string
  pageNumber: number
  durationMs?: number
}): void {
  if (typeof window === 'undefined') return

  const body = JSON.stringify({
    flipbook_id: input.flipbookId,
    session_id: getSessionId(),
    page_number: input.pageNumber,
    duration_ms: input.durationMs ?? null,
  })

  // sendBeacon: dispara durante unload sem bloquear nav
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    navigator.sendBeacon('/api/views', blob)
    return
  }

  // fallback: fetch keepalive
  fetch('/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}
