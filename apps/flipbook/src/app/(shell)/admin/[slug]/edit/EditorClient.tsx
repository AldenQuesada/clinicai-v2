'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Save, Loader2, ExternalLink,
  Type, Image as ImageIcon, Layers, Sliders, ListTree, Music, Volume2,
  Lock, FormInput, RefreshCw, Copy, Eye, EyeOff,
} from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { cn } from '@/lib/utils/cn'

interface Props {
  book: Flipbook
}

type Section = 'meta' | 'background' | 'logo' | 'controls' | 'effect' | 'toc' | 'audio'
              | 'password' | 'lead' | 'replace' | 'copy'

const STYLE_NAV: Array<{ id: Section; label: string; Icon: typeof Type; soon?: boolean }> = [
  { id: 'meta',       label: 'Título & info',  Icon: Type },
  { id: 'background', label: 'Background',     Icon: Layers,    soon: true },
  { id: 'logo',       label: 'Logo',           Icon: ImageIcon, soon: true },
  { id: 'effect',     label: 'Page effect',    Icon: Sliders,   soon: true },
  { id: 'controls',   label: 'Controles',      Icon: Eye,       soon: true },
  { id: 'toc',        label: 'Sumário',        Icon: ListTree,  soon: true },
  { id: 'audio',      label: 'Áudio ambient',  Icon: Music,     soon: true },
]

const SETTINGS_NAV: Array<{ id: Section; label: string; Icon: typeof Type; soon?: boolean }> = [
  { id: 'password', label: 'Senha de acesso',  Icon: Lock,      soon: true },
  { id: 'lead',     label: 'Capturar lead',    Icon: FormInput, soon: true },
  { id: 'replace',  label: 'Trocar arquivo',   Icon: RefreshCw, soon: true },
  { id: 'copy',     label: 'Duplicar',         Icon: Copy },
]

export function EditorClient({ book }: Props) {
  const router = useRouter()
  const [section, setSection] = useState<Section>('meta')
  const [pending, startTransition] = useTransition()

  const [title, setTitle] = useState(book.title)
  const [subtitle, setSubtitle] = useState(book.subtitle ?? '')
  const [edition, setEdition] = useState(book.edition ?? '')
  const [language, setLanguage] = useState(book.language)
  const [amazonAsin, setAmazonAsin] = useState(book.amazon_asin ?? '')
  const [status, setStatus] = useState(book.status)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    setSavedAt(new Date())
    startTransition(() => router.refresh())
  }

  async function duplicate() {
    setError(null)
    const res = await fetch(`/api/flipbooks/${book.id}/duplicate`, { method: 'POST' })
    if (!res.ok) { setError('Falha ao duplicar'); return }
    const created = await res.json()
    router.push(`/admin/${created.slug}/edit`)
  }

  const allItems = [...STYLE_NAV, ...SETTINGS_NAV]
  const current = allItems.find((i) => i.id === section)

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar editor */}
      <aside className="w-[280px] shrink-0 border-r border-border bg-bg-elevated overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Link href="/admin" className="p-1.5 -ml-1.5 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="font-display italic text-text text-base truncate">{book.title}</div>
            <div className="font-meta text-text-dim text-[9px]">{book.format.toUpperCase()} · {book.language.toUpperCase()}</div>
          </div>
        </div>

        <NavGroup title="Style" items={STYLE_NAV} active={section} onSelect={setSection} />
        <NavGroup title="Settings" items={SETTINGS_NAV} active={section} onSelect={setSection} />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 border-b border-border bg-bg-elevated/30 sticky top-0 backdrop-blur-md z-10 flex items-center justify-between">
          <div>
            <div className="font-meta text-gold mb-1">Editor · {current?.label}</div>
            <h2 className="font-display italic text-text text-2xl">{current?.label}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/${book.slug}`}
              target="_blank"
              className="font-meta text-text-muted border border-border px-4 py-2 rounded hover:border-gold/40 hover:text-gold transition flex items-center gap-2 text-xs"
            >
              <ExternalLink className="w-3 h-3" /> Preview
            </Link>
            {section === 'meta' && (
              <button
                onClick={save}
                disabled={saving}
                className="font-meta bg-gold text-bg px-4 py-2 rounded hover:bg-gold-light transition flex items-center gap-2 text-xs disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Salvar
              </button>
            )}
          </div>
        </div>

        <div className="p-8 max-w-3xl">
          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
          {savedAt && (
            <div className="text-gold text-xs mb-4 font-meta">
              Salvo às {savedAt.toLocaleTimeString('pt-BR')}
            </div>
          )}

          {section === 'meta' && (
            <div className="space-y-5">
              <Field label="Título">
                <input
                  type="text" value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-bg-panel border border-border rounded px-3 py-2.5 text-text outline-none focus:border-gold/60"
                />
              </Field>
              <Field label="Subtítulo">
                <input
                  type="text" value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full bg-bg-panel border border-border rounded px-3 py-2.5 text-text outline-none focus:border-gold/60"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Idioma">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Flipbook['language'])}
                    className="w-full bg-bg-panel border border-border rounded px-3 py-2.5 text-text outline-none"
                  >
                    <option value="pt">Português</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </Field>
                <Field label="Edição">
                  <input
                    type="text" value={edition}
                    onChange={(e) => setEdition(e.target.value)}
                    placeholder="ex: 2025 Amazon"
                    className="w-full bg-bg-panel border border-border rounded px-3 py-2.5 text-text outline-none focus:border-gold/60"
                  />
                </Field>
              </div>
              <Field label="Amazon ASIN">
                <input
                  type="text" value={amazonAsin}
                  onChange={(e) => setAmazonAsin(e.target.value)}
                  placeholder="B0XXXXXXXX"
                  className="w-full bg-bg-panel border border-border rounded px-3 py-2.5 text-text outline-none focus:border-gold/60"
                />
              </Field>
              <Field label="Status">
                <div className="flex gap-2">
                  {(['draft', 'published', 'archived'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={cn(
                        'px-4 py-2 rounded font-meta text-xs transition border',
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

              <hr className="border-border my-6" />

              <ReadOnlyMeta book={book} />
            </div>
          )}

          {section === 'copy' && (
            <div className="space-y-5">
              <p className="text-text-muted">
                Cria uma cópia idêntica deste livro como rascunho. PDF e capa são copiados no storage.
              </p>
              <button
                onClick={duplicate}
                disabled={pending}
                className="font-meta bg-gold text-bg px-5 py-3 rounded hover:bg-gold-light transition flex items-center gap-2 disabled:opacity-50"
              >
                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                Duplicar livro
              </button>
            </div>
          )}

          {current?.soon && <ComingSoon section={current.label} />}
        </div>
      </main>
    </div>
  )
}

function NavGroup({
  title, items, active, onSelect,
}: {
  title: string
  items: Array<{ id: Section; label: string; Icon: typeof Type; soon?: boolean }>
  active: Section
  onSelect: (s: Section) => void
}) {
  return (
    <div className="px-2 py-3">
      <div className="font-meta text-text-dim px-3 py-1.5 text-[9px]">{title}</div>
      <ul className="space-y-0.5">
        {items.map(({ id, label, Icon, soon }) => (
          <li key={id}>
            <button
              onClick={() => onSelect(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition border-l-2',
                active === id
                  ? 'bg-gold/10 text-gold border-gold pl-[10px]'
                  : 'text-text-muted hover:text-text hover:bg-bg-panel border-transparent',
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="flex-1 text-left">{label}</span>
              {soon && (
                <span className="font-meta text-[8px] text-gold-dark bg-gold/10 px-1.5 py-0.5 rounded">SOON</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-meta text-text-muted block mb-2">{label}</label>
      {children}
    </div>
  )
}

function ReadOnlyMeta({ book }: { book: Flipbook }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="font-meta text-text-dim mb-2">Sistema</div>
      <Row k="ID"           v={book.id} mono />
      <Row k="Slug"         v={book.slug} mono />
      <Row k="Páginas"      v={String(book.page_count ?? '—')} />
      <Row k="Formato"      v={book.format.toUpperCase()} />
      <Row k="Criado em"    v={new Date(book.created_at).toLocaleString('pt-BR')} />
      <Row k="Modificado"   v={new Date(book.updated_at).toLocaleString('pt-BR')} />
      {book.published_at && <Row k="Publicado em" v={new Date(book.published_at).toLocaleString('pt-BR')} />}
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-muted">{k}</span>
      <span className={cn('text-text', mono && 'font-mono text-text-dim text-[10px]')}>{v}</span>
    </div>
  )
}

function ComingSoon({ section }: { section?: string }) {
  return (
    <div className="border border-dashed border-border rounded-lg p-12 text-center">
      <EyeOff className="w-8 h-8 text-gold-dark mx-auto mb-4 opacity-60" />
      <h3 className="font-display italic text-text text-2xl mb-2">{section} · em breve</h3>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        Esta seção entra na próxima ronda de features. Por enquanto use o painel principal pra editar título, status e metadata.
      </p>
    </div>
  )
}
