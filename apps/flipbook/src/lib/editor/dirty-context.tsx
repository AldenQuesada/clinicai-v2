/**
 * EditorDirtyContext · agregador de "trabalho não salvo" pros painéis
 * que NÃO usam useEditorSettings (TitlePanel salva via /api/flipbooks/[id]
 * direto, CopyPanel duplica, ReplacePdfPanel substitui).
 *
 * Painéis que escrevem em settings.* já têm dirty tracking interno em
 * useEditorSettings — esse context cobre o resto.
 *
 * Provider expõe Set<string> de painelIds com mudanças pendentes e
 * instala beforeunload listener quando há trabalho.
 */
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

interface DirtyValue {
  /** IDs dos painéis com mudanças não salvas. */
  dirtyPanels: ReadonlySet<string>
  /** Marca/desmarca um painel. Sem efeito se já estiver no estado pedido. */
  setDirty: (panelId: string, isDirty: boolean) => void
}

const EditorDirtyContext = createContext<DirtyValue | null>(null)

export function EditorDirtyProvider({ children }: { children: React.ReactNode }) {
  const [dirtyPanels, setDirtyPanels] = useState<Set<string>>(() => new Set())

  const setDirty = useCallback((panelId: string, isDirty: boolean) => {
    setDirtyPanels((prev) => {
      const has = prev.has(panelId)
      if (has === isDirty) return prev
      const next = new Set(prev)
      if (isDirty) next.add(panelId)
      else next.delete(panelId)
      return next
    })
  }, [])

  // beforeunload · só intercepta quando há trabalho não salvo
  useEffect(() => {
    if (dirtyPanels.size === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Mensagem custom é ignorada por browsers modernos · só boolean importa
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyPanels])

  const value = useMemo<DirtyValue>(
    () => ({ dirtyPanels, setDirty }),
    [dirtyPanels, setDirty],
  )

  return <EditorDirtyContext.Provider value={value}>{children}</EditorDirtyContext.Provider>
}

export function useEditorDirty(): DirtyValue {
  const ctx = useContext(EditorDirtyContext)
  if (!ctx) throw new Error('useEditorDirty fora de EditorDirtyProvider')
  return ctx
}

/**
 * Hook conveniente pra um painel registrar seu próprio estado dirty.
 * Sincroniza automaticamente — bastou passar o boolean derivado dos campos.
 */
export function usePanelDirty(panelId: string, isDirty: boolean) {
  const { setDirty } = useEditorDirty()
  // Mantém última referência pra evitar re-registro a cada render
  const lastRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (lastRef.current === isDirty) return
    lastRef.current = isDirty
    setDirty(panelId, isDirty)
  }, [panelId, isDirty, setDirty])
  // Cleanup no unmount · marca clean pra não vazar dirty zumbi
  useEffect(() => {
    return () => setDirty(panelId, false)
  }, [panelId, setDirty])
}
