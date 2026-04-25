'use client'

/**
 * WizardClient · 3-step state machine pra cadastrar parceria.
 *
 * Mirror estrutural do `b2b-form` antigo (step1 Identidade, step2 Operacao,
 * step3 Detalhes) mas em React com state local. Form unico submetido no
 * step3 · todos os fields preservam values entre steps via useState.
 *
 * Step indicator (3 dots) + Next/Back buttons. Validacao basica client-side
 * antes de avancar (campos required do step nao podem ser vazios).
 */

import { useMemo, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { createPartnershipAction } from './actions'

const PILLARS = [
  { value: 'saude', label: 'Saúde / Medicina' },
  { value: 'imagem', label: 'Imagem / Estética' },
  { value: 'fitness', label: 'Fitness / Esporte' },
  { value: 'alimentacao', label: 'Alimentação / Nutrição' },
  { value: 'rede', label: 'Rede / Comunidade' },
  { value: 'evento', label: 'Evento / Ocasião' },
  { value: 'institucional', label: 'Institucional' },
  { value: 'status', label: 'Status / Premium' },
  { value: 'outros', label: 'Outros' },
]

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function WizardClient() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [slugManual, setSlugManual] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [instagram, setInstagram] = useState('')

  const [pillar, setPillar] = useState('')
  const [dnaExc, setDnaExc] = useState(7)
  const [dnaEst, setDnaEst] = useState(7)
  const [dnaPro, setDnaPro] = useState(7)
  const [voucherCombo, setVoucherCombo] = useState('')

  const [notes, setNotes] = useState('')

  const slugPreview = useMemo(() => slugManual.trim() || slugify(name), [slugManual, name])

  function canAdvanceFrom(s: number): boolean {
    if (s === 1) return name.trim().length >= 2
    if (s === 2) return pillar !== ''
    return true
  }

  function next() {
    setError(null)
    if (!canAdvanceFrom(step)) {
      if (step === 1) setError('Nome obrigatorio (min 2 chars)')
      else if (step === 2) setError('Selecione um pilar')
      return
    }
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))
  }

  function back() {
    setError(null)
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))
  }

  function submit() {
    setError(null)
    const fd = new FormData()
    fd.set('name', name)
    fd.set('slug', slugPreview)
    fd.set('contact_name', contactName)
    fd.set('contact_phone', contactPhone)
    fd.set('contact_email', contactEmail)
    fd.set('instagram', instagram)
    fd.set('pillar', pillar)
    fd.set('dna_excelencia', String(dnaExc))
    fd.set('dna_estetica', String(dnaEst))
    fd.set('dna_proposito', String(dnaPro))
    fd.set('voucher_combo', voucherCombo)
    fd.set('notes', notes)
    startTransition(async () => {
      try {
        await createPartnershipAction(fd)
        // redirect acontece no server · client nao volta
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <div className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-5 flex flex-col gap-5">
      <StepIndicator step={step} />

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <Field label="Nome da parceria" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Estúdio Espaço Vital"
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            />
          </Field>
          <Field
            label={`Slug (URL) · auto-gerado: ${slugPreview || '—'}`}
          >
            <input
              value={slugManual}
              onChange={(e) => setSlugManual(e.target.value)}
              placeholder="deixe vazio pra auto"
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50"
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nome do contato">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ana Souza"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>
            <Field label="Telefone (BR)">
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(44) 99876-5432"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Email (opcional)">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="ana@estudio.com.br"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>
            <Field label="Instagram (opcional)">
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@estudio_espacovital"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <Field label="Pilar" required>
            <select
              value={pillar}
              onChange={(e) => setPillar(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            >
              <option value="">Selecionar pilar…</option>
              {PILLARS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DnaSlider label="Excelência" value={dnaExc} onChange={setDnaExc} />
            <DnaSlider label="Estética" value={dnaEst} onChange={setDnaEst} />
            <DnaSlider label="Propósito" value={dnaPro} onChange={setDnaPro} />
          </div>
          <Field label="Combo de voucher (opcional)">
            <input
              value={voucherCombo}
              onChange={(e) => setVoucherCombo(e.target.value)}
              placeholder="Limpeza de pele + Olheiras"
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <Field label="Notas internas (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Como conheceu, observações, próximos passos…"
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] resize-y focus:outline-none focus:border-[#C9A96E]/50"
            />
          </Field>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-1.5">
            <span className="eyebrow text-[#9CA3AF]">Resumo</span>
            <KV k="Nome" v={name || '—'} />
            <KV k="Slug" v={slugPreview || '—'} mono />
            <KV k="Pilar" v={PILLARS.find((p) => p.value === pillar)?.label || '—'} />
            <KV k="Contato" v={contactName ? `${contactName} · ${contactPhone}` : '—'} />
            <KV k="DNA" v={`Exc ${dnaExc} · Est ${dnaEst} · Pro ${dnaPro}`} mono />
            <KV k="Combo" v={voucherCombo || '—'} />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[#FCA5A5]/30 bg-[#FCA5A5]/10 px-3 py-2 text-[11px] text-[#FCA5A5]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={back}
          disabled={step === 1 || pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 text-[10px] uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-3 h-3" />
          Voltar
        </button>
        {step < 3 ? (
          <button
            type="button"
            onClick={next}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors ml-auto disabled:opacity-40"
          >
            Avançar
            <ArrowRight className="w-3 h-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors ml-auto disabled:opacity-40"
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {pending ? 'Criando…' : 'Criar parceria'}
          </button>
        )}
      </div>
    </div>
  )
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Identidade', 'Operação', 'Detalhes']
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const idx = (i + 1) as 1 | 2 | 3
        const done = step > idx
        const current = step === idx
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-semibold transition-colors ${
                current
                  ? 'border-[#C9A96E] bg-[#C9A96E]/15 text-[#C9A96E]'
                  : done
                    ? 'border-[#C9A96E]/50 bg-[#C9A96E]/8 text-[#C9A96E]'
                    : 'border-white/15 text-[#6B7280]'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : idx}
            </div>
            <span
              className={`text-[11px] uppercase tracking-[1px] ${
                current ? 'text-[#F5F0E8]' : done ? 'text-[#C9A96E]' : 'text-[#6B7280]'
              }`}
            >
              {label}
            </span>
            {idx < 3 && <div className="w-6 h-px bg-white/10 mx-1" />}
          </div>
        )
      })}
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="eyebrow text-[#9CA3AF]">
        {label}
        {required && <span className="text-[#FCA5A5] ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

function DnaSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[#9CA3AF]">{label}</span>
        <span className="text-[12px] font-mono text-[#C9A96E] font-bold">{value}/10</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#C9A96E]"
      />
    </div>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-[#6B7280] w-16 shrink-0">{k}</span>
      <span className={`text-[#F5F0E8] ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  )
}
