'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Save, ExternalLink, Loader2, Check } from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { updateLandingMetadataAction, type LandingMeta } from './actions'

interface Props {
  book: Flipbook
}

const EMPTY: LandingMeta = {
  hero_copy: { tagline: '', headline_override: '', subheadline: '' },
  benefits: [],
  faq: [],
  guarantee: '',
}

function readLanding(book: Flipbook): LandingMeta {
  const raw = (book.metadata as Record<string, unknown>)?.landing
  if (!raw || typeof raw !== 'object') return EMPTY
  return {
    hero_copy: {
      tagline: ((raw as Record<string, unknown>).hero_copy as Record<string, string>)?.tagline ?? '',
      headline_override:
        ((raw as Record<string, unknown>).hero_copy as Record<string, string>)?.headline_override ?? '',
      subheadline:
        ((raw as Record<string, unknown>).hero_copy as Record<string, string>)?.subheadline ?? '',
    },
    benefits: ((raw as Record<string, unknown>).benefits as LandingMeta['benefits']) ?? [],
    faq: ((raw as Record<string, unknown>).faq as LandingMeta['faq']) ?? [],
    guarantee: (raw as Record<string, string>).guarantee ?? '',
  }
}

export function LandingEditor({ book }: Props) {
  const [draft, setDraft] = useState<LandingMeta>(() => readLanding(book))
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateLandingMetadataAction(book.id, draft)
      if (res.ok) {
        setSavedAt(new Date())
      } else {
        setError(res.error)
      }
    })
  }

  function setHero(field: 'tagline' | 'headline_override' | 'subheadline', value: string) {
    setDraft((d) => ({ ...d, hero_copy: { ...d.hero_copy, [field]: value } }))
  }

  function addBenefit() {
    setDraft((d) => ({ ...d, benefits: [...(d.benefits ?? []), { title: '', body: '' }] }))
  }
  function updateBenefit(i: number, field: 'title' | 'body', value: string) {
    setDraft((d) => {
      const next = [...(d.benefits ?? [])]
      next[i] = { ...next[i], [field]: value }
      return { ...d, benefits: next }
    })
  }
  function removeBenefit(i: number) {
    setDraft((d) => ({ ...d, benefits: (d.benefits ?? []).filter((_, idx) => idx !== i) }))
  }

  function addFaq() {
    setDraft((d) => ({ ...d, faq: [...(d.faq ?? []), { q: '', a: '' }] }))
  }
  function updateFaq(i: number, field: 'q' | 'a', value: string) {
    setDraft((d) => {
      const next = [...(d.faq ?? [])]
      next[i] = { ...next[i], [field]: value }
      return { ...d, faq: next }
    })
  }
  function removeFaq(i: number) {
    setDraft((d) => ({ ...d, faq: (d.faq ?? []).filter((_, idx) => idx !== i) }))
  }

  return (
    <div className="px-6 md:px-12 py-10 lg:py-14 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 font-meta text-text-muted hover:text-gold transition mb-4 text-xs"
        >
          <ArrowLeft className="w-3 h-3" />
          Voltar para admin
        </Link>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-meta text-gold mb-2">Landing pública</div>
            <h1 className="font-display font-light text-3xl md:text-4xl text-text leading-tight">
              {book.title}
            </h1>
            <p className="font-display italic text-text-muted text-sm mt-2 max-w-xl">
              Conteúdo da página comercial pública (/livros/{book.slug}). Campos vazios são omitidos no render.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/livros/${book.slug}`}
              target="_blank"
              className="font-meta border border-border text-text-muted px-4 py-2.5 rounded hover:border-gold/40 hover:text-gold transition flex items-center gap-2 text-xs"
            >
              <ExternalLink className="w-3 h-3" />
              Ver landing
            </Link>
            <button
              onClick={save}
              disabled={isPending}
              className="font-meta bg-gold text-bg px-5 py-2.5 rounded hover:bg-gold-light transition flex items-center gap-2 disabled:opacity-60"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {savedAt && !isPending && (
        <div className="mb-6 px-4 py-3 rounded bg-gold/10 border border-gold/30 text-gold-light font-meta text-xs flex items-center gap-2">
          <Check className="w-3 h-3" />
          Salvo às {savedAt.toLocaleTimeString('pt-BR')}
        </div>
      )}
      {error && (
        <div className="mb-6 px-4 py-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 font-meta text-sm">
          {error}
        </div>
      )}

      {/* HERO COPY */}
      <Section title="Hero" hint="Topo da landing · primeira coisa que o leitor lê">
        <Field label="Tagline" hint="Linha pequena dourada acima do título · ex: «Pra quem quer parar»">
          <input
            value={draft.hero_copy?.tagline ?? ''}
            onChange={(e) => setHero('tagline', e.target.value)}
            placeholder="ex: Pra quem quer reverter"
            maxLength={120}
            className="input"
          />
        </Field>
        <Field label="Headline override" hint={`Default: "${book.title}". Use só se quiser título comercial diferente`}>
          <input
            value={draft.hero_copy?.headline_override ?? ''}
            onChange={(e) => setHero('headline_override', e.target.value)}
            placeholder={book.title}
            maxLength={180}
            className="input"
          />
        </Field>
        <Field label="Subheadline" hint="2-3 linhas vendendo o livro · evite ser técnico, prefere prometer transformação">
          <textarea
            value={draft.hero_copy?.subheadline ?? ''}
            onChange={(e) => setHero('subheadline', e.target.value)}
            placeholder="O método que tirou meus pacientes da insulina em 90 dias — agora num livro que cabe no seu bolso."
            rows={3}
            maxLength={400}
            className="input"
          />
        </Field>
      </Section>

      {/* BENEFITS */}
      <Section
        title="Benefícios"
        hint="3-5 cards · «Por que esse livro?» · ordem importa, primeiro é o mais forte"
      >
        {(draft.benefits ?? []).length === 0 ? (
          <div className="text-text-dim font-meta text-xs italic mb-4">Nenhum benefício adicionado ainda.</div>
        ) : (
          <div className="space-y-3 mb-3">
            {(draft.benefits ?? []).map((b, i) => (
              <div key={i} className="bg-bg-panel border border-border rounded p-3 grid grid-cols-1 md:grid-cols-[2fr_3fr_auto] gap-3 items-start">
                <input
                  value={b.title}
                  onChange={(e) => updateBenefit(i, 'title', e.target.value)}
                  placeholder="Título curto"
                  maxLength={80}
                  className="input"
                />
                <textarea
                  value={b.body}
                  onChange={(e) => updateBenefit(i, 'body', e.target.value)}
                  placeholder="Descrição (1-2 frases)"
                  maxLength={280}
                  rows={2}
                  className="input"
                />
                <button
                  onClick={() => removeBenefit(i)}
                  className="text-text-muted hover:text-red-400 transition p-2 rounded shrink-0"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addBenefit}
          disabled={(draft.benefits ?? []).length >= 8}
          className="font-meta text-gold hover:text-gold-light transition flex items-center gap-1.5 text-xs disabled:opacity-40"
        >
          <Plus className="w-3 h-3" />
          Adicionar benefício {(draft.benefits ?? []).length >= 8 && '(máx 8)'}
        </button>
      </Section>

      {/* FAQ */}
      <Section title="FAQ" hint="Antecipa objeções · 5-10 perguntas dá um padrão profissional">
        {(draft.faq ?? []).length === 0 ? (
          <div className="text-text-dim font-meta text-xs italic mb-4">Nenhuma pergunta adicionada ainda.</div>
        ) : (
          <div className="space-y-3 mb-3">
            {(draft.faq ?? []).map((f, i) => (
              <div key={i} className="bg-bg-panel border border-border rounded p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    value={f.q}
                    onChange={(e) => updateFaq(i, 'q', e.target.value)}
                    placeholder="Pergunta"
                    maxLength={180}
                    className="input flex-1"
                  />
                  <button
                    onClick={() => removeFaq(i)}
                    className="text-text-muted hover:text-red-400 transition p-2 rounded shrink-0"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={f.a}
                  onChange={(e) => updateFaq(i, 'a', e.target.value)}
                  placeholder="Resposta"
                  maxLength={800}
                  rows={3}
                  className="input"
                />
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addFaq}
          disabled={(draft.faq ?? []).length >= 15}
          className="font-meta text-gold hover:text-gold-light transition flex items-center gap-1.5 text-xs disabled:opacity-40"
        >
          <Plus className="w-3 h-3" />
          Adicionar pergunta {(draft.faq ?? []).length >= 15 && '(máx 15)'}
        </button>
      </Section>

      {/* GUARANTEE */}
      <Section title="Garantia" hint="Reduz risco de compra · 7/15/30 dias incondicional ajuda muito">
        <Field label="">
          <textarea
            value={draft.guarantee ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, guarantee: e.target.value }))}
            placeholder="ex: 7 dias incondicional. Se não fizer sentido pra você, te devolvo cada centavo. Sem perguntas."
            maxLength={400}
            rows={3}
            className="input"
          />
        </Field>
      </Section>

      {/* Sticky save no bottom mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-bg-elevated/95 backdrop-blur border-t border-border p-3 z-30">
        <button
          onClick={save}
          disabled={isPending}
          className="w-full font-meta bg-gold text-bg px-5 py-3 rounded hover:bg-gold-light transition flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 pb-10 border-b border-border last:border-0">
      <header className="mb-5">
        <h2 className="font-display italic text-text text-2xl mb-1">{title}</h2>
        {hint && <p className="font-meta text-text-dim text-[10px]">{hint}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      {label && (
        <span className="font-meta text-text-dim text-[10px] uppercase tracking-wider mb-1.5 block">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="text-text-dim text-[11px] italic mt-1 block font-display">{hint}</span>}
    </label>
  )
}
