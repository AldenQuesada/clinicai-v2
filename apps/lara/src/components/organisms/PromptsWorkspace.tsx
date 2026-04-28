'use client'

/**
 * PromptsWorkspace · organismo · cliente que costura sidebar + editor.
 *
 * - Selection via URL searchParam ?layer=lara_prompt_base · deep linkable
 * - Default selection: primeiro layer do primeiro grupo
 * - Save dispara router.refresh() pra UI ler override novo do DB
 * - Switch de layer com edits nao salvos: confirm() browser-level
 *
 * Mobile: sidebar vira drawer abaixo de lg (1024px) · botao toggle no header.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { PromptSidebar, type SidebarGroup } from '@/components/organisms/PromptSidebar'
import { PromptEditor, type EditorPrompt } from '@/components/organisms/PromptEditor'

export interface WorkspacePrompt {
  key: string
  label: string
  description: string
  filesystem_default: string
  override: string | null
  hasOverride: boolean
}

export interface WorkspaceGroup {
  title: string
  emoji: string
  description: string
  prompts: WorkspacePrompt[]
}

export function PromptsWorkspace({ groups }: { groups: WorkspaceGroup[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlKey = searchParams.get('layer')

  const flatPrompts = useMemo(() => groups.flatMap((g) => g.prompts), [groups])
  const defaultKey = flatPrompts[0]?.key ?? null

  const [activeKey, setActiveKey] = useState<string | null>(urlKey ?? defaultKey)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Sync URL ↔ state
  useEffect(() => {
    if (urlKey && urlKey !== activeKey) {
      setActiveKey(urlKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey])

  // Build sidebar groups (com lengths)
  const sidebarGroups: SidebarGroup[] = useMemo(
    () =>
      groups.map((g) => ({
        title: g.title,
        emoji: g.emoji,
        prompts: g.prompts.map((p) => ({
          key: p.key,
          label: p.label,
          hasOverride: p.hasOverride,
          overrideLength: p.override?.length ?? 0,
          defaultLength: p.filesystem_default.length,
        })),
      })),
    [groups],
  )

  const activePrompt = useMemo<EditorPrompt | null>(() => {
    if (!activeKey) return null
    for (const g of groups) {
      const p = g.prompts.find((x) => x.key === activeKey)
      if (p) {
        return {
          ...p,
          groupEmoji: g.emoji,
          groupTitle: g.title,
        }
      }
    }
    return null
  }, [activeKey, groups])

  const handleSelect = (key: string) => {
    setActiveKey(key)
    setMobileOpen(false)
    // Update URL sem reload
    const params = new URLSearchParams(searchParams.toString())
    params.set('layer', key)
    router.replace(`/prompts?${params.toString()}`, { scroll: false })
  }

  const handleSaved = () => {
    router.refresh()
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir lista de layers"
        className="lg:hidden fixed bottom-6 right-6 z-30 p-3 rounded-[2px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-luxury-md border border-[hsl(var(--primary))]"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Sidebar · desktop sempre · mobile drawer */}
      <div
        className={`${
          mobileOpen ? 'fixed inset-0 z-40 flex lg:relative lg:inset-auto' : 'hidden lg:flex'
        }`}
      >
        {mobileOpen && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar"
            className="lg:hidden flex-1 bg-black/60 backdrop-blur-sm"
          />
        )}
        <div className="relative flex w-[320px] lg:w-auto">
          <PromptSidebar
            groups={sidebarGroups}
            activeKey={activeKey}
            onSelect={handleSelect}
          />
          {mobileOpen && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar"
              className="lg:hidden absolute top-4 right-4 p-2 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Editor pane */}
      {activePrompt ? (
        <PromptEditor
          key={activePrompt.key}
          prompt={activePrompt}
          onSaved={handleSaved}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[hsl(var(--muted-foreground))] text-sm">
          Selecione um layer pra editar
        </div>
      )}
    </div>
  )
}
