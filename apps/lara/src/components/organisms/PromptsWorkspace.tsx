'use client'

/**
 * PromptsWorkspace · client wrapper que costura sidebar + preview + editor.
 *
 * Layout 3-col (espelho /b2b/disparos da Mira):
 *   ┌─────────┬──────────────────┬──────────────────┐
 *   │ SIDEBAR │ PREVIEW (phone   │ EDITOR (textarea │
 *   │ 280px   │ ou documento)    │ + b2b-form-actions)│
 *   └─────────┴──────────────────┴──────────────────┘
 *
 * Layer key URL state: ?layer=lara_fixed_msg_0 (deep-linkable).
 * Live preview: enquanto digita, preview atualiza com o texto atual.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { PromptSidebar, type SidebarGroup } from '@/components/organisms/PromptSidebar'
import { PromptEditor, type EditorPrompt } from '@/components/organisms/PromptEditor'
import {
  LaraPhonePreview,
  getPreviewMode,
} from '@/components/molecules/LaraPhonePreview'

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
  // Live content · sincronizado pelo PromptEditor via callback · permite
  // preview ao vivo enquanto o usuario digita.
  const [liveContent, setLiveContent] = useState<string>('')

  useEffect(() => {
    if (urlKey && urlKey !== activeKey) {
      setActiveKey(urlKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey])

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
        return { ...p, groupEmoji: g.emoji, groupTitle: g.title }
      }
    }
    return null
  }, [activeKey, groups])

  // Reset live content quando troca de layer
  useEffect(() => {
    if (activePrompt) {
      setLiveContent(activePrompt.override ?? activePrompt.filesystem_default)
    }
  }, [activePrompt?.key, activePrompt?.override, activePrompt?.filesystem_default])

  const handleSelect = (key: string) => {
    setActiveKey(key)
    setMobileOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('layer', key)
    router.replace(`/prompts?${params.toString()}`, { scroll: false })
  }

  const handleSaved = () => {
    router.refresh()
  }

  return (
    <div className="flex-1 flex overflow-hidden" style={{ background: 'var(--b2b-bg-0)' }}>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir lista de layers"
        className="lg:hidden b2b-btn b2b-btn-primary"
        style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 30 }}
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Sidebar · 280px */}
      <div
        className={
          mobileOpen
            ? 'fixed inset-0 z-40 flex lg:relative lg:inset-auto'
            : 'hidden lg:flex'
        }
      >
        {mobileOpen && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar"
            className="lg:hidden flex-1"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />
        )}
        <div className="relative flex" style={{ width: 280 }}>
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
              className="lg:hidden"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'transparent',
                border: 'none',
                color: 'var(--b2b-text-muted)',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Preview pane (centro · ~440px) */}
      {activePrompt && (
        <section
          className="custom-scrollbar"
          style={{
            flex: '0 0 460px',
            borderRight: '1px solid var(--b2b-border)',
            padding: '24px 24px 32px',
            overflowY: 'auto',
            background: 'var(--b2b-bg-0)',
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <p className="eyebrow" style={{ marginBottom: 4 }}>
              Pré-visualização
            </p>
            <p
              style={{
                fontSize: 11,
                color: 'var(--b2b-text-muted)',
                fontStyle: 'italic',
              }}
            >
              atualiza ao vivo enquanto edita
            </p>
          </div>
          <LaraPhonePreview
            text={liveContent}
            mode={getPreviewMode(activePrompt.key)}
            meta={`layer · ${activePrompt.key}`}
          />
        </section>
      )}

      {/* Editor pane (resto) */}
      {activePrompt ? (
        <PromptEditor
          key={activePrompt.key}
          prompt={activePrompt}
          onSaved={handleSaved}
          onContentChange={setLiveContent}
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--b2b-text-muted)',
            fontSize: 13,
          }}
        >
          Selecione um layer pra editar
        </div>
      )}
    </div>
  )
}
