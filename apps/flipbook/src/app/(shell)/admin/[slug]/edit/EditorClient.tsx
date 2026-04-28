'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { setupPdfWorker } from '@/lib/pdf/worker'

// Inicializa o pdfjs worker uma vez no client antes de qualquer FlipbookCanvas
// montar — evita race condition onde useEffect do pai rodaria depois do filho.
setupPdfWorker()
import {
  Save, Loader2, Share2, Download, ChevronDown, ChevronRight,
  ChevronLeft, ChevronsLeft, ChevronsRight,
  Type, Image as ImageIcon, Layers, Sliders, ListTree, Music,
  Lock, FormInput, RefreshCw, Copy, Eye,
  Link2, Image as ImgIcon, Video, Headphones, Code,
  Maximize2, ZoomIn, Search, Hash, Pencil,
  ExternalLink, BookOpen,
} from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { FlipbookCanvas } from '@/components/reader/FlipbookCanvas'
import { cn } from '@/lib/utils/cn'
import {
  EditorSettingsProvider,
  useEditorSettings,
  useEditorSettingsContext,
} from '@/lib/editor/useEditorSettings'
import {
  EditorDirtyProvider,
  useEditorDirty,
  usePanelDirty,
} from '@/lib/editor/dirty-context'

interface Props {
  book: Flipbook
  pdfUrl: string | null
}

interface FlipApi {
  pageFlip: () => {
    flipNext: () => void
    flipPrev: () => void
    turnToPage: (n: number) => void
  }
}

type Section =
  // STYLE
  | 'title' | 'page-effect' | 'background' | 'logo' | 'controls' | 'pagination' | 'toc' | 'bg-audio'
  // SETTINGS
  | 'password' | 'lead' | 'replace-pdf' | 'copy' | 'links'
  // INTERACTIONS
  | 'image' | 'video' | 'link' | 'audio' | 'web-url'

const STYLE_NAV: Array<{ id: Section; label: string; Icon: typeof Type }> = [
  { id: 'title',       label: 'Title',             Icon: Type },
  { id: 'page-effect', label: 'Page Effect',       Icon: Sliders },
  { id: 'background',  label: 'Background',        Icon: Layers },
  { id: 'logo',        label: 'Logo',              Icon: ImageIcon },
  { id: 'controls',    label: 'Controls',          Icon: Eye },
  { id: 'pagination',  label: 'Pagination bar',    Icon: Hash },
  { id: 'toc',         label: 'Table of contents', Icon: ListTree },
  { id: 'bg-audio',    label: 'Background Audio',  Icon: Music },
]

const SETTINGS_NAV: Array<{ id: Section; label: string; Icon: typeof Type }> = [
  { id: 'password',    label: 'Password protect',  Icon: Lock },
  { id: 'lead',        label: 'Capture lead form', Icon: FormInput },
  { id: 'replace-pdf', label: 'Replace PDF',       Icon: RefreshCw },
  { id: 'copy',        label: 'Copy flipbook',     Icon: Copy },
  { id: 'links',       label: 'Links',             Icon: Link2 },
]

const INTERACTIONS_NAV: Array<{ id: Section; label: string; Icon: typeof Type }> = [
  { id: 'image',   label: 'Image',   Icon: ImgIcon },
  { id: 'video',   label: 'Video',   Icon: Video },
  { id: 'link',    label: 'Link',    Icon: Link2 },
  { id: 'audio',   label: 'Audio',   Icon: Headphones },
  { id: 'web-url', label: 'Web URL / Embed', Icon: Code },
]

export function EditorClient({ book, pdfUrl }: Props) {
  const settingsCtx = useEditorSettings(book.id, (book.settings as Record<string, unknown>) ?? {})
  return (
    <EditorSettingsProvider value={settingsCtx}>
      <EditorDirtyProvider>
        <EditorClientInner book={book} pdfUrl={pdfUrl} />
      </EditorDirtyProvider>
    </EditorSettingsProvider>
  )
}

function EditorClientInner({ book, pdfUrl }: Props) {
  const [expanded, setExpanded] = useState<Set<Section>>(new Set(['title']))
  const [groupOpen, setGroupOpen] = useState<Record<'style' | 'settings' | 'interactions', boolean>>({
    style: true, settings: true, interactions: true,
  })
  const [editMode, setEditMode] = useState(false)
  const [globalSaving, setGlobalSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState(book.page_count ?? 0)
  const flipRef = useRef<FlipApi | null>(null)

  function goToPage(n: number) {
    const api = flipRef.current
    if (!api) return
    try { api.pageFlip().turnToPage(Math.max(0, Math.min(numPages - 1, n - 1))) } catch {}
  }

  function toggleSection(id: Section) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  function toggleGroup(g: 'style' | 'settings' | 'interactions') {
    setGroupOpen({ ...groupOpen, [g]: !groupOpen[g] })
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ───── SIDEBAR EDITOR (accordion inline) ───── */}
      <aside className="w-[240px] shrink-0 border-r border-border bg-bg-elevated overflow-y-auto">
        <SidebarHeader book={book} />

        <NavGroup
          title="Style"
          open={groupOpen.style}
          onToggle={() => toggleGroup('style')}
          items={STYLE_NAV}
          expanded={expanded}
          onToggleSection={toggleSection}
          renderPanel={(id) => renderStylePanel(id, book, setSavedAt)}
        />

        <NavGroup
          title="Settings"
          open={groupOpen.settings}
          onToggle={() => toggleGroup('settings')}
          items={SETTINGS_NAV}
          expanded={expanded}
          onToggleSection={toggleSection}
          renderPanel={(id) => renderSettingsPanel(id, book)}
        />

        <NavGroup
          title="Interactions"
          open={groupOpen.interactions}
          onToggle={() => toggleGroup('interactions')}
          items={INTERACTIONS_NAV}
          expanded={expanded}
          onToggleSection={toggleSection}
          headerExtra={
            <EditModeToggle active={editMode} onToggle={() => setEditMode(v => !v)} />
          }
          renderPanel={(id) => renderInteractionsPanel(id, editMode)}
        />

        <div className="px-3 py-4 mt-2 border-t border-border">
          <BackButton
            fallbackHref="/admin"
            label="Voltar"
            variant="chevron"
            className="font-meta text-text-dim text-[10px] hover:text-gold transition flex items-center gap-1"
          />
        </div>
      </aside>

      {/* ───── MAIN · sub-toolbar + preview ───── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <EditorToolbar
          book={book}
          saving={globalSaving}
          setSaving={setGlobalSaving}
          savedAt={savedAt}
          onSaved={() => setSavedAt(new Date())}
        />
        <EditorPreview
          book={book}
          pdfUrl={pdfUrl}
          editMode={editMode}
          currentPage={currentPage}
          numPages={numPages}
          flipRef={flipRef}
          onPageChange={setCurrentPage}
          onTotalPages={setNumPages}
          onGoToPage={goToPage}
        />
      </main>
    </div>
  )
}

// ───────────────────────────────────────────
// Sidebar header (livro atual)
// ───────────────────────────────────────────

function SidebarHeader({ book }: { book: Flipbook }) {
  return (
    <div className="px-4 py-4 border-b border-border">
      <div className="font-display italic text-text text-base truncate" title={book.title}>{book.title}</div>
      <div className="font-meta text-text-dim text-[9px] mt-1 uppercase tracking-wider">
        {book.format} · {book.language} · {book.status}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────
// NavGroup · grupo colapsável (STYLE / SETTINGS / INTERACTIONS)
// ───────────────────────────────────────────

function NavGroup({
  title, open, onToggle, items, expanded, onToggleSection, renderPanel, headerExtra,
}: {
  title: string
  open: boolean
  onToggle: () => void
  items: Array<{ id: Section; label: string; Icon: typeof Type }>
  expanded: Set<Section>
  onToggleSection: (id: Section) => void
  renderPanel: (id: Section) => React.ReactNode
  headerExtra?: React.ReactNode
}) {
  return (
    <div className="border-b border-border/50">
      <div className="flex items-center px-3 pt-3 pb-1.5">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 text-left text-text-dim hover:text-text-muted transition"
        >
          <ChevronDown className={cn('w-3 h-3 transition', !open && '-rotate-90')} />
          <span className="font-meta text-[9px] uppercase tracking-wider">{title}</span>
        </button>
        {headerExtra}
      </div>

      {open && (
        <ul className="pb-2">
          {items.map(({ id, label, Icon }) => {
            const isExpanded = expanded.has(id)
            return (
              <li key={id}>
                <button
                  onClick={() => onToggleSection(id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm transition border-l-2',
                    isExpanded
                      ? 'bg-gold/5 text-gold border-gold'
                      : 'text-text-muted hover:text-text hover:bg-bg-panel border-transparent',
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 text-left truncate">{label}</span>
                  <ChevronRight className={cn('w-3 h-3 transition opacity-50', isExpanded && 'rotate-90')} />
                </button>

                {/* Painel inline · accordion */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 bg-bg-panel/30 border-l-2 border-gold">
                    {renderPanel(id)}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ───────────────────────────────────────────
// Edit Mode toggle (header do grupo INTERACTIONS · estilo Heyzine)
// ───────────────────────────────────────────

function EditModeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title="Edit Mode · ativa edição de hotspots"
      className={cn(
        'shrink-0 flex items-center gap-1 px-2 py-1 rounded font-meta text-[9px] transition',
        active
          ? 'bg-gold/20 text-gold border border-gold'
          : 'border border-border text-text-dim hover:text-gold hover:border-gold/40',
      )}
    >
      <Pencil className="w-2.5 h-2.5" strokeWidth={2} />
      {active ? 'EDITANDO' : 'EDIT MODE'}
    </button>
  )
}

// ───────────────────────────────────────────
// Sub-toolbar · Share + Save + Export
// ───────────────────────────────────────────

function EditorToolbar({
  book, saving, setSaving, savedAt, onSaved,
}: {
  book: Flipbook
  saving: boolean
  setSaving: (v: boolean) => void
  savedAt: Date | null
  onSaved: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [shareOpen, setShareOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const settingsCtx = useEditorSettingsContext()
  const { dirtyPanels } = useEditorDirty()

  // Save real: flush imediato do useEditorSettings (settings.* persisted) +
  // refresh server data. Painéis com save próprio (Title/Copy/ReplacePdf)
  // continuam responsáveis pelos seus saves — o badge "● N painéis" sinaliza.
  async function saveAll() {
    setSaving(true)
    try {
      await settingsCtx.flushNow()
      onSaved()
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  const dirtyCount = dirtyPanels.size
  const settingsDirty = settingsCtx.saving || (settingsCtx.error !== null)

  return (
    <div className="h-12 shrink-0 border-b border-border bg-bg-elevated/80 backdrop-blur-md flex items-center px-4 gap-2">
      {/* Esquerda · Share + Save */}
      <button
        onClick={() => setShareOpen(true)}
        className="font-meta text-xs bg-gold text-bg px-3 py-1.5 rounded hover:bg-gold-light transition flex items-center gap-1.5"
      >
        <Share2 className="w-3 h-3" /> Share
      </button>

      <button
        onClick={saveAll}
        disabled={saving || settingsCtx.saving}
        className="font-meta text-xs bg-gold text-bg px-3 py-1.5 rounded hover:bg-gold-light transition flex items-center gap-1.5 disabled:opacity-50"
      >
        {(saving || settingsCtx.saving) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        Save
      </button>

      {dirtyCount > 0 && (
        <span
          className="font-meta text-[10px] text-orange-300 bg-orange-500/10 border border-orange-500/30 px-2 py-1 rounded"
          title={`Painéis com mudanças não salvas: ${Array.from(dirtyPanels).join(', ')}`}
        >
          ● {dirtyCount} {dirtyCount === 1 ? 'painel' : 'painéis'} sem salvar
        </span>
      )}

      {settingsDirty && settingsCtx.error && (
        <span className="font-meta text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded" title={settingsCtx.error}>
          ⚠ erro ao salvar settings
        </span>
      )}

      {savedAt && dirtyCount === 0 && !settingsCtx.error && (
        <span className="font-meta text-[10px] text-gold-dark">
          salvo {savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}

      <div className="flex-1" />

      {/* Direita · Export + Preview */}
      <Link
        href={`/${book.slug}`}
        target="_blank"
        className="font-meta text-xs text-text-muted hover:text-gold transition flex items-center gap-1.5 px-2 py-1.5"
      >
        <ExternalLink className="w-3 h-3" /> Preview
      </Link>

      <div className="relative">
        <button
          onClick={() => setExportOpen(v => !v)}
          className="font-meta text-xs text-text-muted hover:text-gold transition flex items-center gap-1.5 px-3 py-1.5 border border-border rounded hover:border-gold/40"
        >
          <Download className="w-3 h-3" /> Export
          <ChevronDown className="w-3 h-3" />
        </button>
        {exportOpen && (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setExportOpen(false)} />
            <div className="absolute top-full mt-1 right-0 bg-bg-elevated border border-border-strong rounded shadow-xl z-[9999] py-1 min-w-[180px]">
              <ExportItem label="HTML (.zip)" hint="Pacote estático auto-hospedável" disabled />
              <ExportItem label="FLIP (offline)" hint="Reader proprietário" disabled />
            </div>
          </>
        )}
      </div>

      {/* Share modal */}
      {shareOpen && <ShareModal book={book} onClose={() => setShareOpen(false)} />}
    </div>
  )
}

function ExportItem({ label, hint, disabled }: { label: string; hint?: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className="w-full text-left px-3.5 py-2 text-sm text-text-muted hover:text-text hover:bg-bg-panel transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div>{label}</div>
      {hint && <div className="font-meta text-[9px] text-text-dim mt-0.5">{hint}</div>}
    </button>
  )
}

// ───────────────────────────────────────────
// Share modal · 6 sub-tabs (Heyzine)
// ───────────────────────────────────────────

function ShareModal({ book, onClose }: { book: Flipbook; onClose: () => void }) {
  const [tab, setTab] = useState<'link' | 'qr' | 'embed' | 'social'>('link')
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/${book.slug}` : `/${book.slug}`

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-bg-elevated border border-border-strong rounded-lg w-full max-w-2xl pointer-events-auto overflow-hidden">
          <header className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-display italic text-text text-xl">Compartilhar livro</h3>
            <button onClick={onClose} className="text-text-muted hover:text-gold p-1">×</button>
          </header>
          <div className="border-b border-border flex">
            {(['link', 'qr', 'embed', 'social'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-3 font-meta text-xs uppercase tracking-wider transition border-b-2',
                  tab === t ? 'text-gold border-gold' : 'text-text-muted border-transparent hover:text-text',
                )}
              >
                {t === 'qr' ? 'QR Code' : t === 'embed' ? 'Embed' : t === 'social' ? 'Redes' : 'Link'}
              </button>
            ))}
          </div>
          <div className="p-6">
            {tab === 'link' && (
              <div className="space-y-3">
                <label className="font-meta text-text-muted text-xs block">URL pública</label>
                <div className="flex gap-2">
                  <input readOnly value={url} className="flex-1 bg-bg-panel border border-border rounded px-3 py-2 text-sm text-text" />
                  <button onClick={copyUrl} className="font-meta text-xs bg-gold text-bg px-4 rounded hover:bg-gold-light transition">
                    {copied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
            {tab === 'qr' && <PlaceholderTab title="QR Code" hint="Gerar PNG/SVG com URL embutida" />}
            {tab === 'embed' && <PlaceholderTab title="Embed iframe" hint="Code snippet com width/height + página inicial" />}
            {tab === 'social' && <PlaceholderTab title="Redes sociais" hint="Botões de compartilhamento direto (WhatsApp, X, FB, LinkedIn)" />}
          </div>
        </div>
      </div>
    </>
  )
}

function PlaceholderTab({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10">
      <div className="font-display italic text-text-muted text-xl mb-2">{title}</div>
      <div className="font-meta text-text-dim text-xs">{hint}</div>
    </div>
  )
}

// ───────────────────────────────────────────
// Preview central · capa estática + 3 ícones top-right + branding
// ───────────────────────────────────────────

function EditorPreview({
  book, pdfUrl, editMode, currentPage, numPages, flipRef, onPageChange, onTotalPages, onGoToPage,
}: {
  book: Flipbook
  pdfUrl: string | null
  editMode: boolean
  currentPage: number
  numPages: number
  flipRef: React.MutableRefObject<FlipApi | null>
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  onGoToPage: (n: number) => void
}) {
  return (
    <div className="flex-1 relative bg-bg overflow-hidden flex flex-col">
      {/* Área do flipbook */}
      <div className="flex-1 relative flex items-center justify-center p-6 overflow-hidden">
        {/* 3 ícones top-right */}
        <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
          <PreviewCtrl Icon={Maximize2} title="Tela cheia" />
          <PreviewCtrl Icon={ZoomIn} title="Zoom" />
          <PreviewCtrl Icon={Search} title="Buscar texto" />
        </div>

        {/* Branding bottom-left */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 z-10 opacity-50">
          <BookOpen className="w-4 h-4 text-gold" strokeWidth={1.5} />
          <span className="font-display italic text-text-dim text-xs">Flipbook</span>
        </div>

        {/* Edit Mode banner */}
        {editMode && (
          <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-gold/15 border border-gold rounded font-meta text-[10px] text-gold">
            ✏ EDIT MODE · Hotspots editáveis · navegação por setas
          </div>
        )}

        {/* Flipbook navegável (PDF) ou capa fallback (não-PDF) */}
        {pdfUrl ? (
          <FlipbookCanvas
            ref={flipRef}
            pdfUrl={pdfUrl}
            flipbookId={book.id}
            coverUrl={book.cover_url}
            onPageChange={onPageChange}
            onTotalPages={onTotalPages}
            noTrack
          />
        ) : (
          <CoverFallback book={book} />
        )}
      </div>

      {/* Barra de progresso · navegação por página */}
      {pdfUrl && numPages > 0 && (
        <ProgressBar
          currentPage={currentPage}
          numPages={numPages}
          onGoToPage={onGoToPage}
          onPrev={() => onGoToPage(Math.max(1, currentPage - 1))}
          onNext={() => onGoToPage(Math.min(numPages, currentPage + 1))}
          onFirst={() => onGoToPage(1)}
          onLast={() => onGoToPage(numPages)}
        />
      )}
    </div>
  )
}

function CoverFallback({ book }: { book: Flipbook }) {
  return (
    <div className="relative aspect-[2/3] max-h-full max-w-[400px] rounded-lg overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.7),0_10px_30px_rgba(0,0,0,0.5)]">
      {book.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-bg-elevated">
          <div className="text-center px-6">
            <div className="font-display italic text-gold text-4xl mb-2">
              {book.language === 'es' ? 'El Fin' : book.language === 'en' ? 'The End' : 'O Fim'}
            </div>
            <div className="font-meta text-text-muted text-[10px]">{book.author}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressBar({
  currentPage, numPages, onGoToPage, onPrev, onNext, onFirst, onLast,
}: {
  currentPage: number
  numPages: number
  onGoToPage: (n: number) => void
  onPrev: () => void
  onNext: () => void
  onFirst: () => void
  onLast: () => void
}) {
  const pct = numPages > 1 ? ((currentPage - 1) / (numPages - 1)) * 100 : 0

  return (
    <div className="shrink-0 px-4 py-2.5 bg-bg-elevated/95 backdrop-blur border-t border-border flex items-center gap-2">
      {/* Atalhos navegação */}
      <button onClick={onFirst} disabled={currentPage <= 1} title="Primeira página"
        className="p-1 text-text-muted hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition">
        <ChevronsLeft className="w-3.5 h-3.5" />
      </button>
      <button onClick={onPrev} disabled={currentPage <= 1} title="Anterior"
        className="p-1 text-text-muted hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Page jump input */}
      <div className="flex items-center gap-1 font-meta text-[10px] text-text-dim">
        <input
          type="number"
          min={1}
          max={numPages}
          value={currentPage}
          onChange={(e) => {
            const n = parseInt(e.target.value)
            if (!isNaN(n) && n >= 1 && n <= numPages) onGoToPage(n)
          }}
          className="w-12 bg-bg-panel border border-border rounded px-1.5 py-0.5 text-center text-text outline-none focus:border-gold/60 text-[10px]"
        />
        <span>/ {numPages}</span>
      </div>

      {/* Range slider · barra de progresso clicável */}
      <div className="relative flex-1 h-2 group">
        <div className="absolute inset-0 my-auto h-1 bg-border rounded-full" />
        <div
          className="absolute left-0 my-auto h-1 bg-gold rounded-full top-0 bottom-0"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-gold rounded-full shadow-md transition-transform group-hover:scale-125"
          style={{ left: `${pct}%` }}
        />
        <input
          type="range"
          min={1}
          max={numPages}
          value={currentPage}
          onChange={(e) => onGoToPage(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      <button onClick={onNext} disabled={currentPage >= numPages} title="Próxima"
        className="p-1 text-text-muted hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      <button onClick={onLast} disabled={currentPage >= numPages} title="Última página"
        className="p-1 text-text-muted hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition">
        <ChevronsRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function PreviewCtrl({ Icon, title }: { Icon: typeof Maximize2; title: string }) {
  return (
    <button
      title={title}
      aria-label={title}
      className="w-8 h-8 rounded bg-bg-elevated/80 backdrop-blur border border-border text-text-muted hover:text-gold hover:border-gold/40 transition flex items-center justify-center"
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
    </button>
  )
}

// ───────────────────────────────────────────
// PANELS · STYLE
// ───────────────────────────────────────────

function renderStylePanel(id: Section, book: Flipbook, setSavedAt: (d: Date) => void): React.ReactNode {
  switch (id) {
    case 'title':       return <TitlePanel book={book} onSaved={setSavedAt} />
    case 'page-effect': return <PageEffectPanel />
    case 'background':  return <BackgroundPanel />
    case 'logo':        return <LogoPanel />
    case 'controls':    return <ControlsPanel />
    case 'pagination':  return <PaginationPanel />
    case 'toc':         return <TocPanel />
    case 'bg-audio':    return <BgAudioPanel />
    default: return null
  }
}

function TitlePanel({ book, onSaved }: { book: Flipbook; onSaved: (d: Date) => void }) {
  const router = useRouter()
  const [title, setTitle] = useState(book.title)
  const [subtitle, setSubtitle] = useState(book.subtitle ?? '')
  const [edition, setEdition] = useState(book.edition ?? '')
  const [language, setLanguage] = useState(book.language)
  const [amazonAsin, setAmazonAsin] = useState(book.amazon_asin ?? '')
  const [status, setStatus] = useState(book.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  // Snapshot do último salvo · serve de baseline pra comparação dirty.
  // Não usa book direto pq router.refresh não re-monta o painel.
  const [savedSnapshot, setSavedSnapshot] = useState({
    title: book.title,
    subtitle: book.subtitle ?? '',
    edition: book.edition ?? '',
    language: book.language,
    amazonAsin: book.amazon_asin ?? '',
    status: book.status,
  })

  const isDirty =
    title !== savedSnapshot.title ||
    subtitle !== savedSnapshot.subtitle ||
    edition !== savedSnapshot.edition ||
    language !== savedSnapshot.language ||
    amazonAsin !== savedSnapshot.amazonAsin ||
    status !== savedSnapshot.status

  usePanelDirty('title', isDirty)

  async function save() {
    setSaving(true); setError(null)
    const res = await fetch(`/api/flipbooks/${book.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, subtitle: subtitle || null, edition: edition || null,
        language, amazon_asin: amazonAsin || null, status,
      }),
    })
    setSaving(false)
    if (!res.ok) { setError('Falha ao salvar'); return }
    setSavedSnapshot({ title, subtitle, edition, language, amazonAsin, status })
    onSaved(new Date())
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-2.5 mt-2">
      <Field label="Título">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} />
      </Field>
      <Field label="Subtítulo">
        <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={INPUT_CLS} />
      </Field>
      <Field label="Edição">
        <input type="text" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="ex: 2025 Amazon" className={INPUT_CLS} />
      </Field>
      <Field label="Idioma">
        <select value={language} onChange={(e) => setLanguage(e.target.value as Flipbook['language'])} className={INPUT_CLS}>
          <option value="pt">Português</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </Field>
      <Field label="ASIN Amazon">
        <input type="text" value={amazonAsin} onChange={(e) => setAmazonAsin(e.target.value)} placeholder="B0XXXXXXXX" className={INPUT_CLS} />
      </Field>
      <Field label="Status">
        <div className="flex gap-1">
          {(['draft', 'published', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'flex-1 py-1.5 rounded font-meta text-[10px] transition border',
                status === s
                  ? 'bg-gold text-bg border-gold'
                  : 'border-border text-text-muted hover:border-gold/40 hover:text-gold',
              )}
            >
              {s === 'draft' ? 'Rascunho' : s === 'published' ? 'Publicado' : 'Arquivado'}
            </button>
          ))}
        </div>
      </Field>

      {error && <div className="text-red-400 text-xs">{error}</div>}

      <button onClick={save} disabled={saving} className="w-full font-meta bg-gold text-bg py-2 rounded hover:bg-gold-light transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        Salvar
      </button>
    </div>
  )
}

function PageEffectPanel() {
  const [effect, setEffect] = useState('magazine')
  const [sound, setSound] = useState(true)
  const [disposition, setDisposition] = useState('adaptive')
  return (
    <div className="space-y-2.5 mt-2">
      <Field label="Efeito de virada">
        <select value={effect} onChange={(e) => setEffect(e.target.value)} className={INPUT_CLS}>
          <option value="magazine">Magazine</option>
          <option value="book">Book</option>
          <option value="album">Album</option>
          <option value="notebook">Notebook</option>
          <option value="slider">Slider</option>
          <option value="cards">Cards</option>
          <option value="coverflow">Coverflow</option>
          <option value="onepage">One page</option>
        </select>
      </Field>
      <Field label="Disposição">
        <select value={disposition} onChange={(e) => setDisposition(e.target.value)} className={INPUT_CLS}>
          <option value="adaptive">Adaptativo</option>
          <option value="single">Single page</option>
          <option value="double">Double page</option>
        </select>
      </Field>
      <Toggle label="Som ao virar página" value={sound} onChange={setSound} />
      <SoonNote />
    </div>
  )
}

function BackgroundPanel() {
  const [tab, setTab] = useState<'image' | 'color' | 'style'>('image')
  return (
    <div className="space-y-2.5 mt-2">
      <div className="flex gap-1 border border-border rounded p-0.5">
        {(['image', 'color', 'style'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-1 font-meta text-[10px] uppercase rounded transition',
              tab === t ? 'bg-gold/15 text-gold' : 'text-text-muted hover:text-text',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'image' && <FileDropArea label="Imagem de fundo (.jpg/.png)" />}
      {tab === 'color' && (
        <Field label="Cor">
          <input type="color" defaultValue="#0F0D0A" className="w-full h-8 rounded border border-border bg-bg-panel" />
        </Field>
      )}
      {tab === 'style' && (
        <>
          <Field label="Tamanho"><select className={INPUT_CLS}><option>Cover</option><option>Stretch</option><option>Contain</option></select></Field>
          <Field label="Posição"><select className={INPUT_CLS}><option>Center center</option><option>Top left</option><option>Bottom right</option></select></Field>
          <Field label="Transparência"><input type="range" className="w-full" /></Field>
          <Field label="Blur"><input type="range" className="w-full" /></Field>
        </>
      )}
      <SoonNote />
    </div>
  )
}

function LogoPanel() {
  return (
    <div className="space-y-2.5 mt-2">
      <FileDropArea label="Logo (.png/.svg)" />
      <Field label="Tamanho"><input type="range" className="w-full" /></Field>
      <Field label="Posição">
        <select className={INPUT_CLS}>
          <option>Top left</option><option>Top right</option>
          <option>Bottom left</option><option>Bottom right</option>
        </select>
      </Field>
      <Field label="Link (opcional)"><input type="url" placeholder="https://" className={INPUT_CLS} /></Field>
      <SoonNote />
    </div>
  )
}

function ControlsPanel() {
  const controls = ['Download', 'Share', 'Fullscreen', 'Zoom', 'First/Last page', 'Print', 'Thumbnails', 'Search', 'Sound']
  return (
    <div className="space-y-1 mt-2">
      <div className="font-meta text-text-dim text-[9px] uppercase mb-1.5">Botões visíveis</div>
      {controls.map((c) => (
        <Toggle key={c} label={c} value={true} onChange={() => {}} />
      ))}
      <SoonNote />
    </div>
  )
}

function PaginationPanel() {
  return (
    <div className="space-y-2.5 mt-2">
      <Field label="Estilo">
        <select className={INPUT_CLS}>
          <option>Thumbnails + números</option>
          <option>Apenas números</option>
          <option>Apenas thumbnails</option>
          <option>Oculto</option>
        </select>
      </Field>
      <SoonNote />
    </div>
  )
}

function TocPanel() {
  return (
    <div className="space-y-2 mt-2">
      <Toggle label="Habilitar sumário" value={false} onChange={() => {}} />
      <button className="w-full font-meta border border-border text-text-muted py-1.5 rounded text-xs hover:border-gold/40 hover:text-gold transition">
        + Adicionar entrada
      </button>
      <SoonNote />
    </div>
  )
}

function BgAudioPanel() {
  return (
    <div className="space-y-2.5 mt-2">
      <FileDropArea label="MP3 de fundo" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Pág inicial"><input type="number" defaultValue={1} className={INPUT_CLS} /></Field>
        <Field label="Pág final"><input type="number" defaultValue={99} className={INPUT_CLS} /></Field>
      </div>
      <Field label="Volume"><input type="range" className="w-full" /></Field>
      <Toggle label="Loop" value={true} onChange={() => {}} />
      <SoonNote />
    </div>
  )
}

// ───────────────────────────────────────────
// PANELS · SETTINGS
// ───────────────────────────────────────────

function renderSettingsPanel(id: Section, book: Flipbook): React.ReactNode {
  switch (id) {
    case 'password':    return <PasswordPanel />
    case 'lead':        return <LeadPanel />
    case 'replace-pdf': return <ReplacePdfPanel />
    case 'copy':        return <CopyPanel book={book} />
    case 'links':       return <LinksPanel book={book} />
    default: return null
  }
}

function PasswordPanel() {
  const [mode, setMode] = useState('none')
  return (
    <div className="space-y-2.5 mt-2">
      <Field label="Modo">
        <select value={mode} onChange={(e) => setMode(e.target.value)} className={INPUT_CLS}>
          <option value="none">Sem senha</option>
          <option value="single">Senha única</option>
          <option value="user">Usuário + senha</option>
          <option value="email-otp">Email + senha por usuário</option>
          <option value="magic">Magic link</option>
          <option value="otp">One-time password</option>
          <option value="google">Login Google</option>
        </select>
      </Field>
      {mode !== 'none' && (
        <>
          <Field label="Senha"><input type="password" className={INPUT_CLS} /></Field>
          <Field label="Mensagem login"><input type="text" placeholder="Acesso restrito" className={INPUT_CLS} /></Field>
        </>
      )}
      <SoonNote />
    </div>
  )
}

function LeadPanel() {
  const [tab, setTab] = useState<'options' | 'privacy' | 'fields' | 'style'>('options')
  return (
    <div className="space-y-2.5 mt-2">
      <div className="flex gap-1 border border-border rounded p-0.5">
        {(['options', 'privacy', 'fields', 'style'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('flex-1 py-1 font-meta text-[9px] uppercase rounded transition',
            tab === t ? 'bg-gold/15 text-gold' : 'text-text-muted hover:text-text')}>{t}</button>
        ))}
      </div>
      {tab === 'options' && (
        <>
          <Field label="Página de exibição"><input type="number" defaultValue={3} className={INPUT_CLS} /></Field>
          <Field label="Título"><input type="text" placeholder="Continue lendo" className={INPUT_CLS} /></Field>
          <Toggle label="Permitir pular" value={false} onChange={() => {}} />
        </>
      )}
      {tab === 'privacy' && (
        <>
          <Toggle label="Exigir consent" value={true} onChange={() => {}} />
          <Field label="Política URL"><input type="url" className={INPUT_CLS} /></Field>
        </>
      )}
      {tab === 'fields' && (
        <div className="text-text-dim text-xs">Lista repetível de campos (email/text/checkbox/...).</div>
      )}
      {tab === 'style' && (
        <Field label="Tema"><select className={INPUT_CLS}><option>Light</option><option>Dark</option></select></Field>
      )}
      <SoonNote />
    </div>
  )
}

function ReplacePdfPanel() {
  return (
    <div className="space-y-2.5 mt-2">
      <div className="bg-red-500/10 border border-red-500/30 rounded p-2.5 text-[10px] text-red-300">
        ⚠ Ação irreversível · todos os settings são preservados, mas o PDF original é substituído.
      </div>
      <FileDropArea label="Novo PDF" />
      <SoonNote />
    </div>
  )
}

function CopyPanel({ book }: { book: Flipbook }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function duplicate() {
    setPending(true); setError(null)
    const res = await fetch(`/api/flipbooks/${book.id}/duplicate`, { method: 'POST' })
    if (!res.ok) { setPending(false); setError('Falha ao duplicar'); return }
    const created = await res.json()
    router.push(`/admin/${created.slug}/edit`)
  }
  return (
    <div className="space-y-2.5 mt-2">
      <p className="text-text-muted text-xs leading-relaxed">
        Cria uma cópia idêntica como rascunho. PDF + capa + metadata copiados.
      </p>
      {error && <div className="text-red-400 text-xs">{error}</div>}
      <button onClick={duplicate} disabled={pending} className="w-full font-meta bg-gold text-bg py-2 rounded hover:bg-gold-light transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50">
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
        Duplicar livro
      </button>
    </div>
  )
}

function LinksPanel({ book }: { book: Flipbook }) {
  return (
    <div className="space-y-2.5 mt-2">
      <Field label="Subdomínio">
        <select className={INPUT_CLS} disabled>
          <option>flipbook.aldenquesada.site</option>
        </select>
      </Field>
      <Field label="Slug">
        <input type="text" defaultValue={book.slug} className={INPUT_CLS} />
      </Field>
      <Field label="Redirect (opcional)">
        <input type="url" placeholder="https://" className={INPUT_CLS} />
      </Field>
      <SoonNote />
    </div>
  )
}

// ───────────────────────────────────────────
// PANELS · INTERACTIONS
// ───────────────────────────────────────────

function renderInteractionsPanel(id: Section, editMode: boolean): React.ReactNode {
  if (!editMode) {
    return (
      <div className="text-text-dim text-[10px] leading-relaxed mt-2">
        Ative <strong className="text-gold">Edit Mode</strong> no header pra adicionar hotspots.
      </div>
    )
  }
  switch (id) {
    case 'image':   return <InteractionHint label="Imagem clicável" hint="Arraste na página pra criar." />
    case 'video':   return <InteractionHint label="Vídeo embed" hint="YouTube/Vimeo ou MP4." />
    case 'link':    return <InteractionHint label="Link invisível" hint="Web/email/telefone/page jump." />
    case 'audio':   return <InteractionHint label="Áudio inline" hint="Player com play/pause." />
    case 'web-url': return <InteractionHint label="Iframe / widget" hint="Mapa, calendário, form Google." />
    default: return null
  }
}

function InteractionHint({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="space-y-1 mt-2 text-[10px]">
      <div className="text-text-muted">{label}</div>
      <div className="text-text-dim">{hint}</div>
      <SoonNote />
    </div>
  )
}

// ───────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────

const INPUT_CLS = 'w-full bg-bg-panel border border-border rounded px-2 py-1.5 text-xs text-text outline-none focus:border-gold/60'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-meta text-text-muted block mb-1 text-[10px]">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-1.5 text-text-muted hover:text-text transition"
    >
      <span className="text-xs">{label}</span>
      <div className={cn('w-7 h-4 rounded-full transition flex items-center px-0.5', value ? 'bg-gold justify-end' : 'bg-border justify-start')}>
        <div className="w-3 h-3 rounded-full bg-bg" />
      </div>
    </button>
  )
}

function FileDropArea({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-border rounded p-3 text-center text-[10px] text-text-dim hover:border-gold/40 transition cursor-not-allowed">
      📁 {label} · arrastar ou clicar
    </div>
  )
}

function SoonNote() {
  return (
    <div className="font-meta text-[8px] text-gold-dark uppercase tracking-wider opacity-60 mt-2">
      Em breve · UI estruturada, lógica próxima fase
    </div>
  )
}
