/**
 * useEditorSettings · hook canônico pra ler/escrever flipbook.settings.
 *
 * - Estado local otimista (UI atualiza imediato)
 * - Debounce 500ms agrupa updates antes de PATCH
 * - `update(key, value)` substitui chave inteira (merge raso é no servidor)
 * - `isDirty(key)` indica se chave tem patch pendente
 *
 * Use via Context (EditorSettingsContext) instanciado uma vez no
 * EditorClient. Painéis chamam `useEditorSettingsContext()`.
 */
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type SettingsRecord = Record<string, unknown>

interface PatchFlush {
  patch: SettingsRecord
  resolve: () => void
  reject: (err: unknown) => void
}

const DEBOUNCE_MS = 500

export function useEditorSettings(flipbookId: string, initial: SettingsRecord) {
  const [settings, setSettings] = useState<SettingsRecord>(initial)
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Patch buffer · acumula chaves entre disparos do debounce
  const pendingRef = useRef<SettingsRecord>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflightRef = useRef<PatchFlush | null>(null)

  const flush = useCallback(async () => {
    const patch = pendingRef.current
    pendingRef.current = {}
    if (Object.keys(patch).length === 0) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/flipbooks/${flipbookId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = (await res.json()) as { settings: SettingsRecord }
      // Server retorna o estado autoritativo · sobrepõe otimismo
      setSettings(json.settings ?? {})
      setDirtyKeys((prev) => {
        const next = new Set(prev)
        Object.keys(patch).forEach((k) => next.delete(k))
        return next
      })
      setSavedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro ao salvar')
      // mantém dirtyKeys · permite retry manual
    } finally {
      setSaving(false)
    }
  }, [flipbookId])

  const update = useCallback(
    (key: string, value: unknown) => {
      // Otimismo: aplica local imediato
      setSettings((prev) => ({ ...prev, [key]: value }))
      setDirtyKeys((prev) => new Set(prev).add(key))
      pendingRef.current[key] = value

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        flush()
      }, DEBOUNCE_MS)
    },
    [flush],
  )

  // Flush imediato (botão "Salvar" explicito ou unmount)
  const flushNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await flush()
  }, [flush])

  useEffect(() => {
    return () => {
      // Best-effort flush no unmount · pode falhar silenciosamente
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        flush().catch(() => {})
      }
      // suprime warning do inflightRef nao-utilizado (reservado p/ futuro)
      void inflightRef.current
    }
  }, [flush])

  const isDirty = useCallback((key: string) => dirtyKeys.has(key), [dirtyKeys])
  const get = useCallback(<T = unknown>(key: string, fallback: T): T => {
    return (settings[key] as T) ?? fallback
  }, [settings])

  return useMemo(
    () => ({ settings, update, flushNow, isDirty, get, saving, error, savedAt }),
    [settings, update, flushNow, isDirty, get, saving, error, savedAt],
  )
}

// ───────────────────────────────────────────
// Context · pra painéis acessarem sem prop drill
// ───────────────────────────────────────────

export type EditorSettingsContextValue = ReturnType<typeof useEditorSettings>

const EditorSettingsContext = createContext<EditorSettingsContextValue | null>(null)

export function EditorSettingsProvider({
  value,
  children,
}: {
  value: EditorSettingsContextValue
  children: React.ReactNode
}) {
  return <EditorSettingsContext.Provider value={value}>{children}</EditorSettingsContext.Provider>
}

export function useEditorSettingsContext(): EditorSettingsContextValue {
  const ctx = useContext(EditorSettingsContext)
  if (!ctx) throw new Error('useEditorSettingsContext fora de EditorSettingsProvider')
  return ctx
}
