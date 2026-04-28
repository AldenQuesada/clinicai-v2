'use client'

const SESSION_KEY = 'flipbook_session_id'

/**
 * UUID anônimo persistido em localStorage por device. Compartilhado entre
 * trackPageView, trackEvent e useProgress — mesma "identidade" pra todos
 * os sinais de telemetria.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let id = window.localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(SESSION_KEY, id)
  }
  return id
}
