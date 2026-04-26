'use client'

/**
 * WizardClient · 3-step state machine pra cadastrar/editar parceria.
 *
 * Mirror estrutural do `b2b-form` antigo:
 *   Step 1 · Identidade + Contato (12 fields)
 *   Step 2 · Operacao · DNA + Voucher (10 fields)
 *   Step 3 · Detalhes · Geo + Contrapartida + Contrato + Narrativa + Profs (18 fields)
 *
 * Auto-enrich (somente em modo `new`):
 *   - Slug preview + dedup check (debounced 400ms)
 *   - Pillar inference por keyword (chip "✨ sugerido")
 *   - Type derivado de pillar
 *   - Combo default por pillar
 *   - Phone dedup warning (debounced 300ms)
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Check, Loader2, Sparkles, AlertTriangle, X, Plus,
} from 'lucide-react'
import {
  PILLARS, PILLAR_LABELS, TYPE_OPTIONS, STATUSES,
  categoriesForPillar, inferPillar, inferType, pickComboForPillar, slugify,
} from '@/lib/b2b-pillar-inference'
import {
  createPartnershipAction,
  updatePartnershipAction,
  checkSlugAction,
  checkPhoneAction,
} from './actions'

type Mode = 'new' | 'edit'
type ComboLite = { label: string; isActive: boolean; isDefault: boolean }

interface WizardClientProps {
  mode: Mode
  combos: ComboLite[]
  partnership?: Record<string, unknown> | null
}

const BASE_PROFESSIONALS = ['mirian', 'quesada', 'marci']

function asString(v: unknown): string {
  if (v == null) return ''
  return String(v)
}
function asNum(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return isNaN(n) ? fallback : n
}
function asArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  return asString(v).split(',').map((s) => s.trim()).filter(Boolean)
}

export function WizardClient({ mode, combos, partnership }: WizardClientProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const editId = mode === 'edit' && partnership?.id ? String(partnership.id) : undefined

  const p = partnership || {}

  // ─── Step 1 · Identidade + Contato ───────────────────────────
  const [name, setName] = useState(asString(p.name))
  const [slugManual, setSlugManual] = useState(asString(p.slug))
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [pillar, setPillar] = useState(asString(p.pillar))
  const [pillarTouched, setPillarTouched] = useState(mode === 'edit')
  const [category, setCategory] = useState(asString(p.category))
  const [tier, setTier] = useState<number | ''>(p.tier == null ? '' : Number(p.tier))
  const [type, setType] = useState(asString(p.type) || 'institutional')
  const [typeTouched, setTypeTouched] = useState(mode === 'edit')
  const [status, setStatus] = useState(asString(p.status) || 'prospect')

  const [contactNames, setContactNames] = useState<string[]>(
    asArr(p.contact_name).length ? asArr(p.contact_name) : asString(p.contact_name).split(',').map((s) => s.trim()).filter(Boolean),
  )
  const [contactPhone, setContactPhone] = useState(asString(p.contact_phone))
  const [contactEmail, setContactEmail] = useState(asString(p.contact_email))
  const [contactInstagram, setContactInstagram] = useState(asString(p.contact_instagram))
  const [contactWebsite, setContactWebsite] = useState(asString(p.contact_website))

  // ─── Step 2 · Operacao · DNA + Voucher ───────────────────────
  const [dnaExc, setDnaExc] = useState(asNum(p.dna_excelencia, mode === 'new' ? 5 : 5))
  const [dnaEst, setDnaEst] = useState(asNum(p.dna_estetica, mode === 'new' ? 5 : 5))
  const [dnaPro, setDnaPro] = useState(asNum(p.dna_proposito, mode === 'new' ? 5 : 5))
  const [voucherCombo, setVoucherCombo] = useState(asString(p.voucher_combo))
  const [voucherComboTouched, setVoucherComboTouched] = useState(mode === 'edit')
  const [voucherValidityDays, setVoucherValidityDays] = useState(asNum(p.voucher_validity_days, 30))
  const [voucherMinNoticeDays, setVoucherMinNoticeDays] = useState(asNum(p.voucher_min_notice_days, 15))
  const [voucherMonthlyCap, setVoucherMonthlyCap] = useState(asNum(p.voucher_monthly_cap, 5))
  const [voucherUnitCostBrl, setVoucherUnitCostBrl] = useState(asNum(p.voucher_unit_cost_brl, 0))
  const [voucherDelivery, setVoucherDelivery] = useState<string[]>(
    asArr(p.voucher_delivery).length ? asArr(p.voucher_delivery) : ['digital'],
  )

  // ─── Step 3 · Detalhes ───────────────────────────────────────
  const [lat, setLat] = useState<string>(asString(p.lat))
  const [lng, setLng] = useState<string>(asString(p.lng))
  const [contrapartida, setContrapartida] = useState<string[]>(asArr(p.contrapartida))
  const [contrapartidaCadence, setContrapartidaCadence] = useState(asString(p.contrapartida_cadence) || 'monthly')

  const [contractSignedDate, setContractSignedDate] = useState(asString(p.contract_signed_date).slice(0, 10))
  const [contractExpiryDate, setContractExpiryDate] = useState(asString(p.contract_expiry_date).slice(0, 10))
  const [renewalNoticeDays, setRenewalNoticeDays] = useState(asNum(p.renewal_notice_days, 60))
  const [monthlyValueCapBrl, setMonthlyValueCapBrl] = useState<string>(asString(p.monthly_value_cap_brl))
  const [contractDurationMonths, setContractDurationMonths] = useState<string>(asString(p.contract_duration_months))
  const [reviewCadenceMonths, setReviewCadenceMonths] = useState(asNum(p.review_cadence_months, 3))
  const [sazonais, setSazonais] = useState<string[]>(asArr(p.sazonais))

  const [autoPlaybook, setAutoPlaybook] = useState(p.auto_playbook_enabled !== false)

  const [slogans, setSlogans] = useState<string[]>(asArr(p.slogans))
  const [narrativeQuote, setNarrativeQuote] = useState(asString(p.narrative_quote))
  const [narrativeAuthor, setNarrativeAuthor] = useState(asString(p.narrative_author))
  const [emotionalTrigger, setEmotionalTrigger] = useState(asString(p.emotional_trigger))

  const [involvedProfs, setInvolvedProfs] = useState<string[]>(
    asArr(p.involved_professionals).length ? asArr(p.involved_professionals) : ['mirian'],
  )
  const [accountManager, setAccountManager] = useState(asString(p.account_manager) || 'mirian')

  const [isCollective, setIsCollective] = useState(Boolean(p.is_collective))
  const [memberCount, setMemberCount] = useState<string>(asString(p.member_count))
  const [estimatedReach, setEstimatedReach] = useState<string>(asString(p.estimated_monthly_reach))

  const [notes, setNotes] = useState(asString(p.notes))

  // ─── Auto-enrich state ───────────────────────────────────────
  const [pillarHint, setPillarHint] = useState<string | null>(null)
  const [slugConflict, setSlugConflict] = useState<{ name?: string; suggested?: string } | null>(null)
  const [phoneWarning, setPhoneWarning] = useState<Array<{ id: string; name: string; status: string }>>([])

  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slugPreview = useMemo(() => {
    if (slugManual && slugTouched) return slugify(slugManual)
    return slugify(name)
  }, [slugManual, slugTouched, name])

  // Pillar inference + slug dedup quando o nome muda (apenas mode='new')
  useEffect(() => {
    if (mode !== 'new') return
    if (!pillarTouched) {
      setPillarHint(inferPillar(name))
    }
    if (slugTimer.current) clearTimeout(slugTimer.current)
    const slug = slugify(slugManual || name)
    if (!slug || slug.length < 3) {
      setSlugConflict(null)
      return
    }
    slugTimer.current = setTimeout(() => {
      checkSlugAction(slug, editId).then((r) => {
        if (r.exists) {
          setSlugConflict({ name: r.partnershipName, suggested: r.suggested })
        } else {
          setSlugConflict(null)
        }
      }).catch(() => {})
    }, 400)
    return () => {
      if (slugTimer.current) clearTimeout(slugTimer.current)
    }
  }, [name, slugManual, mode, pillarTouched, editId])

  // Phone dedup on blur
  function onPhoneBlur() {
    if (phoneTimer.current) clearTimeout(phoneTimer.current)
    phoneTimer.current = setTimeout(() => {
      checkPhoneAction(contactPhone, editId).then((r) => {
        setPhoneWarning(r.exists ? r.matches : [])
      }).catch(() => {})
    }, 300)
  }

  function applySuggestedSlug(s: string) {
    setSlugManual(s)
    setSlugTouched(true)
    setSlugConflict(null)
  }

  function applyPillarHint(p2: string) {
    setPillar(p2)
    setPillarTouched(true)
    setPillarHint(null)
    if (!typeTouched) setType(inferType(p2))
    if (!voucherComboTouched) {
      const c = pickComboForPillar(p2, combos)
      if (c) setVoucherCombo(c)
    }
  }

  function onPillarChange(p2: string) {
    setPillar(p2)
    setPillarTouched(true)
    setPillarHint(null)
    if (!typeTouched) setType(inferType(p2))
    if (!voucherComboTouched) {
      const c = pickComboForPillar(p2, combos)
      if (c) setVoucherCombo(c)
    }
  }

  // ─── Validation por step ─────────────────────────────────────
  function canAdvanceFrom(s: number): { ok: boolean; reason?: string } {
    if (s === 1) {
      if (name.trim().length < 3) return { ok: false, reason: 'Nome precisa ter ao menos 3 caracteres' }
      if (!pillar) return { ok: false, reason: 'Escolha um pilar' }
      if (!type) return { ok: false, reason: 'Escolha um tipo' }
      if (!contactNames.length) return { ok: false, reason: 'Pelo menos 1 responsavel obrigatorio' }
      const phoneDigits = contactPhone.replace(/\D/g, '')
      if (phoneDigits.length < 10) return { ok: false, reason: 'WhatsApp obrigatorio (min 10 digitos)' }
      if (slugConflict) return { ok: false, reason: `Slug "${slugPreview}" ja existe (${slugConflict.name}). Use sugestao ou edite.` }
    }
    if (s === 2) {
      if (dnaExc < 0 || dnaExc > 10) return { ok: false, reason: 'DNA Excelencia: 0-10' }
      if (dnaEst < 0 || dnaEst > 10) return { ok: false, reason: 'DNA Estetica: 0-10' }
      if (dnaPro < 0 || dnaPro > 10) return { ok: false, reason: 'DNA Proposito: 0-10' }
    }
    return { ok: true }
  }

  function next() {
    setError(null)
    const v = canAdvanceFrom(step)
    if (!v.ok) { setError(v.reason || 'Validacao falhou'); return }
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))
  }

  function back() {
    setError(null)
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))
  }

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('name', name)
    fd.set('slug', slugPreview)
    fd.set('pillar', pillar)
    fd.set('category', category)
    if (tier !== '') fd.set('tier', String(tier))
    fd.set('type', type)
    fd.set('status', status)

    fd.set('contact_name', contactNames.join(', '))
    fd.set('contact_phone', contactPhone)
    fd.set('contact_email', contactEmail)
    fd.set('contact_instagram', contactInstagram)
    fd.set('contact_website', contactWebsite)

    fd.set('dna_excelencia', String(dnaExc))
    fd.set('dna_estetica', String(dnaEst))
    fd.set('dna_proposito', String(dnaPro))

    fd.set('voucher_combo', voucherCombo)
    fd.set('voucher_validity_days', String(voucherValidityDays))
    fd.set('voucher_min_notice_days', String(voucherMinNoticeDays))
    fd.set('voucher_monthly_cap', String(voucherMonthlyCap))
    fd.set('voucher_unit_cost_brl', String(voucherUnitCostBrl))
    fd.set('voucher_delivery', voucherDelivery.join(', '))

    if (lat) fd.set('lat', lat)
    if (lng) fd.set('lng', lng)

    fd.set('contrapartida', contrapartida.join(', '))
    fd.set('contrapartida_cadence', contrapartidaCadence)

    if (contractSignedDate) fd.set('contract_signed_date', contractSignedDate)
    if (contractExpiryDate) fd.set('contract_expiry_date', contractExpiryDate)
    fd.set('renewal_notice_days', String(renewalNoticeDays))

    if (monthlyValueCapBrl) fd.set('monthly_value_cap_brl', monthlyValueCapBrl)
    if (contractDurationMonths) fd.set('contract_duration_months', contractDurationMonths)
    fd.set('review_cadence_months', String(reviewCadenceMonths))
    fd.set('sazonais', sazonais.join(', '))

    fd.set('auto_playbook_enabled', String(autoPlaybook))

    fd.set('slogans', slogans.join(', '))
    fd.set('narrative_quote', narrativeQuote)
    fd.set('narrative_author', narrativeAuthor)
    fd.set('emotional_trigger', emotionalTrigger)

    fd.set('involved_professionals', involvedProfs.join(', '))
    fd.set('account_manager', accountManager)

    fd.set('is_collective', String(isCollective))
    if (memberCount) fd.set('member_count', memberCount)
    if (estimatedReach) fd.set('estimated_monthly_reach', estimatedReach)

    fd.set('notes', notes)
    return fd
  }

  function submit() {
    setError(null)
    const v1 = canAdvanceFrom(1)
    if (!v1.ok) { setStep(1); setError(v1.reason || ''); return }
    const v2 = canAdvanceFrom(2)
    if (!v2.ok) { setStep(2); setError(v2.reason || ''); return }
    const fd = buildFormData()
    startTransition(async () => {
      try {
        if (mode === 'edit' && editId) {
          await updatePartnershipAction(editId, fd)
        } else {
          await createPartnershipAction(fd)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const allCategories = categoriesForPillar(pillar)
  const allProfs = Array.from(
    new Set([...BASE_PROFESSIONALS, ...involvedProfs, accountManager].filter(Boolean)),
  )

  return (
    <div className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-5 flex flex-col gap-5">
      <StepIndicator step={step} />

      {step === 1 && (
        <Step1
          name={name} setName={setName}
          slugManual={slugManual} setSlugManual={(v) => { setSlugManual(v); setSlugTouched(true) }}
          slugPreview={slugPreview} slugConflict={slugConflict} onApplySuggestedSlug={applySuggestedSlug}
          pillar={pillar} onPillarChange={onPillarChange} pillarHint={pillarHint} onApplyPillarHint={applyPillarHint}
          category={category} setCategory={setCategory} categoriesList={allCategories}
          tier={tier} setTier={setTier}
          type={type} setType={(v) => { setType(v); setTypeTouched(true) }}
          status={status} setStatus={setStatus}
          contactNames={contactNames} setContactNames={setContactNames}
          contactPhone={contactPhone} setContactPhone={setContactPhone} onPhoneBlur={onPhoneBlur} phoneWarning={phoneWarning}
          contactEmail={contactEmail} setContactEmail={setContactEmail}
          contactInstagram={contactInstagram} setContactInstagram={setContactInstagram}
          contactWebsite={contactWebsite} setContactWebsite={setContactWebsite}
          mode={mode}
        />
      )}

      {step === 2 && (
        <Step2
          dnaExc={dnaExc} setDnaExc={setDnaExc}
          dnaEst={dnaEst} setDnaEst={setDnaEst}
          dnaPro={dnaPro} setDnaPro={setDnaPro}
          voucherCombo={voucherCombo} setVoucherCombo={(v) => { setVoucherCombo(v); setVoucherComboTouched(true) }}
          combos={combos}
          voucherValidityDays={voucherValidityDays} setVoucherValidityDays={setVoucherValidityDays}
          voucherMinNoticeDays={voucherMinNoticeDays} setVoucherMinNoticeDays={setVoucherMinNoticeDays}
          voucherMonthlyCap={voucherMonthlyCap} setVoucherMonthlyCap={setVoucherMonthlyCap}
          voucherUnitCostBrl={voucherUnitCostBrl} setVoucherUnitCostBrl={setVoucherUnitCostBrl}
          voucherDelivery={voucherDelivery} setVoucherDelivery={setVoucherDelivery}
        />
      )}

      {step === 3 && (
        <Step3
          lat={lat} setLat={setLat} lng={lng} setLng={setLng}
          contrapartida={contrapartida} setContrapartida={setContrapartida}
          contrapartidaCadence={contrapartidaCadence} setContrapartidaCadence={setContrapartidaCadence}
          contractSignedDate={contractSignedDate} setContractSignedDate={setContractSignedDate}
          contractExpiryDate={contractExpiryDate} setContractExpiryDate={setContractExpiryDate}
          renewalNoticeDays={renewalNoticeDays} setRenewalNoticeDays={setRenewalNoticeDays}
          monthlyValueCapBrl={monthlyValueCapBrl} setMonthlyValueCapBrl={setMonthlyValueCapBrl}
          contractDurationMonths={contractDurationMonths} setContractDurationMonths={setContractDurationMonths}
          reviewCadenceMonths={reviewCadenceMonths} setReviewCadenceMonths={setReviewCadenceMonths}
          sazonais={sazonais} setSazonais={setSazonais}
          autoPlaybook={autoPlaybook} setAutoPlaybook={setAutoPlaybook}
          slogans={slogans} setSlogans={setSlogans}
          narrativeQuote={narrativeQuote} setNarrativeQuote={setNarrativeQuote}
          narrativeAuthor={narrativeAuthor} setNarrativeAuthor={setNarrativeAuthor}
          emotionalTrigger={emotionalTrigger} setEmotionalTrigger={setEmotionalTrigger}
          involvedProfs={involvedProfs} setInvolvedProfs={setInvolvedProfs}
          accountManager={accountManager} setAccountManager={setAccountManager}
          allProfs={allProfs}
          isCollective={isCollective} setIsCollective={setIsCollective}
          memberCount={memberCount} setMemberCount={setMemberCount}
          estimatedReach={estimatedReach} setEstimatedReach={setEstimatedReach}
          notes={notes} setNotes={setNotes}
          summary={{
            name, slugPreview, pillarLabel: PILLAR_LABELS[pillar as keyof typeof PILLAR_LABELS] || pillar,
            contactSummary: contactNames.length ? `${contactNames[0]} · ${contactPhone}` : '—',
            dna: `Exc ${dnaExc} · Est ${dnaEst} · Pro ${dnaPro}`,
            combo: voucherCombo || '—',
          }}
        />
      )}

      {error && (
        <div className="rounded-md border border-[#FCA5A5]/30 bg-[#FCA5A5]/10 px-3 py-2 text-[11px] text-[#FCA5A5]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-white/10">
        {step > 1 && (
          <button type="button" onClick={back} disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 text-[10px] uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors disabled:opacity-40">
            <ArrowLeft className="w-3 h-3" /> Voltar
          </button>
        )}
        <button type="button" onClick={() => router.back()} disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] uppercase tracking-[1px] text-[#6B7280] hover:text-[#9CA3AF] transition-colors disabled:opacity-40">
          Cancelar
        </button>
        {step < 3 ? (
          <button type="button" onClick={next} disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors ml-auto disabled:opacity-40">
            Avançar <ArrowRight className="w-3 h-3" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors ml-auto disabled:opacity-40">
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {pending ? 'Salvando…' : mode === 'edit' ? 'Salvar alterações' : 'Criar parceria'}
          </button>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Step 1
// ────────────────────────────────────────────────────────────────

interface Step1Props {
  name: string; setName: (v: string) => void
  slugManual: string; setSlugManual: (v: string) => void
  slugPreview: string; slugConflict: { name?: string; suggested?: string } | null
  onApplySuggestedSlug: (s: string) => void
  pillar: string; onPillarChange: (v: string) => void
  pillarHint: string | null; onApplyPillarHint: (v: string) => void
  category: string; setCategory: (v: string) => void
  categoriesList: string[]
  tier: number | ''; setTier: (v: number | '') => void
  type: string; setType: (v: string) => void
  status: string; setStatus: (v: string) => void
  contactNames: string[]; setContactNames: (v: string[]) => void
  contactPhone: string; setContactPhone: (v: string) => void
  onPhoneBlur: () => void
  phoneWarning: Array<{ id: string; name: string; status: string }>
  contactEmail: string; setContactEmail: (v: string) => void
  contactInstagram: string; setContactInstagram: (v: string) => void
  contactWebsite: string; setContactWebsite: (v: string) => void
  mode: Mode
}

function Step1(props: Step1Props) {
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>Parceria</SectionTitle>
      <Field label="Nome do negócio / parceria" required>
        <input value={props.name} onChange={(e) => props.setName(e.target.value)}
          placeholder="Ex.: Moinho Buffet"
          className="b2b-input" />
      </Field>

      {/* Slug preview / conflict */}
      <div className="text-[11px] text-[#9CA3AF] flex flex-wrap items-center gap-1.5">
        <span>URL: /partner.html?slug=</span>
        <span className="font-mono text-[#C9A96E]">{props.slugPreview || '—'}</span>
        {props.slugConflict && (
          <span className="ml-2 inline-flex items-center gap-1.5 text-[#FCA5A5] bg-[#EF4444]/10 px-2 py-0.5 rounded">
            <AlertTriangle className="w-3 h-3" />
            já existe ({props.slugConflict.name})
            {props.slugConflict.suggested && (
              <button type="button" onClick={() => props.onApplySuggestedSlug(props.slugConflict!.suggested!)}
                className="ml-1 underline hover:no-underline">
                usar &ldquo;{props.slugConflict.suggested}&rdquo;
              </button>
            )}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Pilar" required>
          <select value={props.pillar} onChange={(e) => props.onPillarChange(e.target.value)}
            className="b2b-input">
            <option value="">Escolha um pilar…</option>
            {PILLARS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {props.pillarHint && props.pillarHint !== props.pillar && props.mode === 'new' && (
            <button type="button" onClick={() => props.onApplyPillarHint(props.pillarHint!)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#C9A96E] border border-dashed border-[#C9A96E]/50 rounded px-2 py-0.5 hover:bg-[#C9A96E]/10">
              <Sparkles className="w-3 h-3" /> Sugerido: <b>{props.pillarHint}</b> · clique pra aplicar
            </button>
          )}
        </Field>
        <Field label="Categoria">
          <input value={props.category} onChange={(e) => props.setCategory(e.target.value)}
            list="b2b-cat-list" autoComplete="off"
            placeholder="Escolha do catálogo ou digite (snake_case)"
            className="b2b-input" />
          <datalist id="b2b-cat-list">
            {props.categoriesList.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="Tier (1-3)">
          <select value={props.tier} onChange={(e) => props.setTier(e.target.value === '' ? '' : Number(e.target.value))}
            className="b2b-input">
            <option value="">—</option>
            <option value="1">1 · Premium</option>
            <option value="2">2 · Padrão</option>
            <option value="3">3 · Apoio</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Tipo" required>
          <select value={props.type} onChange={(e) => props.setType(e.target.value)}
            className="b2b-input">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Status inicial">
          <select value={props.status} onChange={(e) => props.setStatus(e.target.value)}
            className="b2b-input">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Slug (opcional)">
          <input value={props.slugManual} onChange={(e) => props.setSlugManual(e.target.value)}
            placeholder="auto · gerado do nome"
            className="b2b-input font-mono" />
        </Field>
      </div>

      <SectionTitle hint="A Mira vai enviar mensagens pra esse WhatsApp. Pode cadastrar mais de um responsável.">
        Contato principal
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Responsáveis da parceria" required>
          <ChipsInput
            values={props.contactNames}
            onChange={props.setContactNames}
            placeholder="Digite o nome e pressione Enter ou vírgula"
          />
          <div className="text-[10px] text-[#6B7280] mt-1">
            Ex.: Marci Reich, Carla Duarte · adicionar vários se a parceria tiver mais de 1 contato
          </div>
        </Field>
        <Field label="WhatsApp principal" required>
          <input value={props.contactPhone} onChange={(e) => props.setContactPhone(e.target.value)}
            onBlur={props.onPhoneBlur}
            placeholder="(44) 99818-9300"
            inputMode="tel"
            className="b2b-input font-mono" />
          {props.phoneWarning.length > 0 && (
            <div className="mt-1 rounded border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-2 py-1.5 text-[10.5px] text-[#FCD34D]">
              <div className="font-bold mb-0.5 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Telefone já em outras parcerias:
              </div>
              <ul className="list-disc list-inside">
                {props.phoneWarning.map((m) => (
                  <li key={m.id}>{m.name} <span className="text-[#9CA3AF]">({m.status})</span></li>
                ))}
              </ul>
            </div>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="E-mail">
          <input type="email" value={props.contactEmail} onChange={(e) => props.setContactEmail(e.target.value)}
            placeholder="contato@..." className="b2b-input" />
        </Field>
        <Field label="Instagram">
          <input value={props.contactInstagram} onChange={(e) => props.setContactInstagram(e.target.value)}
            placeholder="@handle" className="b2b-input" />
        </Field>
      </div>
      <Field label="Site">
        <input value={props.contactWebsite} onChange={(e) => props.setContactWebsite(e.target.value)}
          placeholder="https://..." className="b2b-input" />
      </Field>

      <FormStyles />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Step 2
// ────────────────────────────────────────────────────────────────

interface Step2Props {
  dnaExc: number; setDnaExc: (v: number) => void
  dnaEst: number; setDnaEst: (v: number) => void
  dnaPro: number; setDnaPro: (v: number) => void
  voucherCombo: string; setVoucherCombo: (v: string) => void
  combos: ComboLite[]
  voucherValidityDays: number; setVoucherValidityDays: (v: number) => void
  voucherMinNoticeDays: number; setVoucherMinNoticeDays: (v: number) => void
  voucherMonthlyCap: number; setVoucherMonthlyCap: (v: number) => void
  voucherUnitCostBrl: number; setVoucherUnitCostBrl: (v: number) => void
  voucherDelivery: string[]; setVoucherDelivery: (v: string[]) => void
}

function Step2(props: Step2Props) {
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle hint="Notas que determinam se a parceria pode virar contrato. Mínimo 7 em cada pra aprovar. Se não sabe na hora do cadastro, deixa no meio — dá pra editar depois.">
        DNA · gate de entrada (0-10)
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DnaSlider label="Excelência" value={props.dnaExc} onChange={props.setDnaExc} />
        <DnaSlider label="Estética" value={props.dnaEst} onChange={props.setDnaEst} />
        <DnaSlider label="Propósito" value={props.dnaPro} onChange={props.setDnaPro} />
      </div>

      <SectionTitle hint="Como a parceria vai presentear convidadas pela clínica.">
        Voucher presente
      </SectionTitle>
      <Field label="Combo do voucher">
        <input value={props.voucherCombo} onChange={(e) => props.setVoucherCombo(e.target.value)}
          list="b2b-combo-list" autoComplete="off"
          placeholder="Escolha do catálogo ou digite um novo combo"
          className="b2b-input" />
        <datalist id="b2b-combo-list">
          {props.combos.filter((c) => c.isActive !== false).map((c) => (
            <option key={c.label} value={c.label}>
              {c.isDefault ? `${c.label} (padrão)` : c.label}
            </option>
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Validade (dias)">
          <input type="number" min={1} value={props.voucherValidityDays}
            onChange={(e) => props.setVoucherValidityDays(Number(e.target.value || 0))}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Antecedência (dias)">
          <input type="number" min={0} value={props.voucherMinNoticeDays}
            onChange={(e) => props.setVoucherMinNoticeDays(Number(e.target.value || 0))}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Cap mensal (un.)">
          <input type="number" min={0} value={props.voucherMonthlyCap}
            onChange={(e) => props.setVoucherMonthlyCap(Number(e.target.value || 0))}
            className="b2b-input font-mono" />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Custo por voucher (R$)">
          <input type="number" min={0} step="0.01" value={props.voucherUnitCostBrl}
            onChange={(e) => props.setVoucherUnitCostBrl(Number(e.target.value || 0))}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Entrega">
          <ArrayInput values={props.voucherDelivery} onChange={props.setVoucherDelivery}
            placeholder="digital, print, gamified" />
        </Field>
      </div>

      <FormStyles />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Step 3
// ────────────────────────────────────────────────────────────────

interface Step3Props {
  lat: string; setLat: (v: string) => void
  lng: string; setLng: (v: string) => void
  contrapartida: string[]; setContrapartida: (v: string[]) => void
  contrapartidaCadence: string; setContrapartidaCadence: (v: string) => void
  contractSignedDate: string; setContractSignedDate: (v: string) => void
  contractExpiryDate: string; setContractExpiryDate: (v: string) => void
  renewalNoticeDays: number; setRenewalNoticeDays: (v: number) => void
  monthlyValueCapBrl: string; setMonthlyValueCapBrl: (v: string) => void
  contractDurationMonths: string; setContractDurationMonths: (v: string) => void
  reviewCadenceMonths: number; setReviewCadenceMonths: (v: number) => void
  sazonais: string[]; setSazonais: (v: string[]) => void
  autoPlaybook: boolean; setAutoPlaybook: (v: boolean) => void
  slogans: string[]; setSlogans: (v: string[]) => void
  narrativeQuote: string; setNarrativeQuote: (v: string) => void
  narrativeAuthor: string; setNarrativeAuthor: (v: string) => void
  emotionalTrigger: string; setEmotionalTrigger: (v: string) => void
  involvedProfs: string[]; setInvolvedProfs: (v: string[]) => void
  accountManager: string; setAccountManager: (v: string) => void
  allProfs: string[]
  isCollective: boolean; setIsCollective: (v: boolean) => void
  memberCount: string; setMemberCount: (v: string) => void
  estimatedReach: string; setEstimatedReach: (v: string) => void
  notes: string; setNotes: (v: string) => void
  summary: { name: string; slugPreview: string; pillarLabel: string; contactSummary: string; dna: string; combo: string }
}

function Step3(props: Step3Props) {
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle hint="Aparece no mapa vivo da rede.">Localização</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Latitude (decimal)">
          <input type="number" step="any" value={props.lat} onChange={(e) => props.setLat(e.target.value)}
            placeholder="-23.55052" className="b2b-input font-mono" />
        </Field>
        <Field label="Longitude (decimal)">
          <input type="number" step="any" value={props.lng} onChange={(e) => props.setLng(e.target.value)}
            placeholder="-46.633308" className="b2b-input font-mono" />
        </Field>
      </div>

      <SectionTitle hint="O que a parceira entrega em troca — texto livre, separar por vírgula.">
        Contrapartida do parceiro
      </SectionTitle>
      <Field label="Contrapartidas">
        <ArrayInput values={props.contrapartida} onChange={props.setContrapartida}
          placeholder="foto_video_mensal, mentoria_mirian" />
      </Field>
      <Field label="Cadência">
        <select value={props.contrapartidaCadence} onChange={(e) => props.setContrapartidaCadence(e.target.value)}
          className="b2b-input">
          <option value="monthly">Mensal</option>
          <option value="quarterly">Trimestral</option>
          <option value="ad_hoc">Eventual</option>
        </select>
      </Field>

      <SectionTitle hint="Datas do contrato (opcionais — boca-a-boca pode deixar em branco). Trigger renewal_sweep cria task automática quando vencimento chega.">
        Contrato
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Assinado em">
          <input type="date" value={props.contractSignedDate}
            onChange={(e) => props.setContractSignedDate(e.target.value)}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Vence em">
          <input type="date" value={props.contractExpiryDate}
            onChange={(e) => props.setContractExpiryDate(e.target.value)}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Aviso (dias)">
          <input type="number" min={0} max={365} value={props.renewalNoticeDays}
            onChange={(e) => props.setRenewalNoticeDays(Number(e.target.value || 0))}
            className="b2b-input font-mono" />
        </Field>
      </div>

      <SectionTitle>Vigência & valuation</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Teto mensal (R$)">
          <input type="number" min={0} value={props.monthlyValueCapBrl}
            onChange={(e) => props.setMonthlyValueCapBrl(e.target.value)}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Duração (meses)">
          <input type="number" min={0} value={props.contractDurationMonths}
            onChange={(e) => props.setContractDurationMonths(e.target.value)}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Revisão (meses)">
          <input type="number" min={1} value={props.reviewCadenceMonths}
            onChange={(e) => props.setReviewCadenceMonths(Number(e.target.value || 0))}
            className="b2b-input font-mono" />
        </Field>
      </div>
      <Field label="Sazonais">
        <ArrayInput values={props.sazonais} onChange={props.setSazonais}
          placeholder="dia_das_maes, natal, bf" />
      </Field>

      <SectionTitle hint="Quando saúde virar vermelha, sistema aplica playbook automaticamente (cooldown 7d).">
        Auto-playbook
      </SectionTitle>
      <label className="inline-flex items-center gap-2 text-[12px] text-[#F5F0E8] cursor-pointer">
        <input type="checkbox" checked={props.autoPlaybook}
          onChange={(e) => props.setAutoPlaybook(e.target.checked)}
          className="accent-[#C9A96E]" />
        Sim — aplicar playbook automaticamente quando health=red
      </label>

      <SectionTitle hint="Usado em materiais internos e storytelling.">
        Narrativa (opcional)
      </SectionTitle>
      <Field label="Slogans">
        <ArrayInput values={props.slogans} onChange={props.setSlogans}
          placeholder="Frase 1, Frase 2, ..." />
      </Field>
      <Field label="Citação do parceiro">
        <textarea value={props.narrativeQuote} onChange={(e) => props.setNarrativeQuote(e.target.value)}
          rows={3} className="b2b-input resize-y" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Autor da citação">
          <input value={props.narrativeAuthor} onChange={(e) => props.setNarrativeAuthor(e.target.value)}
            className="b2b-input" />
        </Field>
        <Field label="Gatilho emocional">
          <input value={props.emotionalTrigger} onChange={(e) => props.setEmotionalTrigger(e.target.value)}
            placeholder="Ex.: quando o Osvaldo diz pode beijar a noiva"
            className="b2b-input" />
        </Field>
      </div>

      <SectionTitle hint="Quem do lado clínica vai atuar com essa parceria. Pode marcar mais de um — todos recebem notificação quando houver movimentação.">
        Profissionais envolvidos
      </SectionTitle>
      <ProfessionalsCheckboxes
        all={props.allProfs}
        selected={props.involvedProfs}
        onChange={props.setInvolvedProfs}
      />
      <Field label="Account manager (responsável principal)">
        <select value={props.accountManager} onChange={(e) => props.setAccountManager(e.target.value)}
          className="b2b-input">
          {props.allProfs.map((n) => (
            <option key={n} value={n}>{capitalize(n)}</option>
          ))}
        </select>
      </Field>

      <SectionTitle hint="Se a parceria é com um grupo coletivo (ex.: ACIM, Confraria).">
        Grupo / Confraria
      </SectionTitle>
      <label className="inline-flex items-center gap-2 text-[12px] text-[#F5F0E8] cursor-pointer">
        <input type="checkbox" checked={props.isCollective}
          onChange={(e) => props.setIsCollective(e.target.checked)}
          className="accent-[#C9A96E]" />
        Sim — é com um grupo coletivo
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Membras cadastradas">
          <input type="number" min={0} value={props.memberCount}
            onChange={(e) => props.setMemberCount(e.target.value)}
            className="b2b-input font-mono" />
        </Field>
        <Field label="Alcance mensal estimado">
          <input type="number" min={0} value={props.estimatedReach}
            onChange={(e) => props.setEstimatedReach(e.target.value)}
            className="b2b-input font-mono" />
        </Field>
      </div>

      <SectionTitle>Notas internas</SectionTitle>
      <Field label="Observações livres">
        <textarea value={props.notes} onChange={(e) => props.setNotes(e.target.value)}
          rows={4} placeholder="Como conheceu, observações, próximos passos…"
          className="b2b-input resize-y" />
      </Field>

      <div className="rounded-md border border-[#C9A96E]/30 bg-[#C9A96E]/[0.04] p-3 flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#C9A96E]">Resumo</span>
        <KV k="Nome" v={props.summary.name || '—'} />
        <KV k="Slug" v={props.summary.slugPreview || '—'} mono />
        <KV k="Pilar" v={props.summary.pillarLabel || '—'} />
        <KV k="Contato" v={props.summary.contactSummary} />
        <KV k="DNA" v={props.summary.dna} mono />
        <KV k="Combo" v={props.summary.combo} />
      </div>

      <FormStyles />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Reusable inputs
// ────────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Identidade', 'Operação', 'Detalhes']
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {labels.map((label, i) => {
        const idx = (i + 1) as 1 | 2 | 3
        const done = step > idx
        const current = step === idx
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-semibold transition-colors ${
              current ? 'border-[#C9A96E] bg-[#C9A96E]/15 text-[#C9A96E]'
                : done ? 'border-[#C9A96E]/50 bg-[#C9A96E]/8 text-[#C9A96E]'
                : 'border-white/15 text-[#6B7280]'}`}>
              {done ? <Check className="w-3.5 h-3.5" /> : idx}
            </div>
            <span className={`text-[11px] uppercase tracking-[1px] ${
              current ? 'text-[#F5F0E8]' : done ? 'text-[#C9A96E]' : 'text-[#6B7280]'}`}>
              {label}
            </span>
            {idx < 3 && <div className="w-6 h-px bg-white/10 mx-1" />}
          </div>
        )
      })}
    </div>
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 pt-2 mt-1 border-t border-white/5 first:border-t-0 first:pt-0 first:mt-0">
      <div className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#C9A96E]">{children}</div>
      {hint && <div className="text-[11px] text-[#9CA3AF]">{hint}</div>}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">
        {label} {required && <span className="text-[#FCA5A5]">*</span>}
      </label>
      {children}
    </div>
  )
}

function DnaSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">{label}</span>
        <span className="text-[12px] font-mono text-[#C9A96E] font-bold bg-[#7a1f2b] text-white px-2 py-0.5 rounded">
          {value}
        </span>
      </div>
      <input type="range" min={0} max={10} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#C9A96E]" />
      <div className="flex justify-between text-[10px] text-[#6B7280]">
        <span>0</span><span>5</span><span>10</span>
      </div>
    </div>
  )
}

function ChipsInput({
  values, onChange, placeholder,
}: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('')

  function commit(raw: string) {
    const parts = raw.split(',').map((s) => s.trim()).filter((s) => s.length >= 2)
    if (!parts.length) { setText(''); return }
    const next = [...values]
    parts.forEach((p) => { if (next.indexOf(p) === -1) next.push(p) })
    onChange(next)
    setText('')
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      commit(text)
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="b2b-chips-wrap flex flex-wrap items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5">
      {values.map((v, i) => (
        <span key={`${v}-${i}`} className="inline-flex items-center gap-1 text-[11px] bg-[#C9A96E]/15 text-[#D4B785] border border-[#C9A96E]/35 rounded-full px-2 py-0.5">
          {v}
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="opacity-60 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={() => commit(text)}
        placeholder={values.length ? '' : placeholder}
        className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-[12px] text-[#F5F0E8] placeholder:text-white/30 px-1 py-0.5" />
    </div>
  )
}

function ArrayInput({
  values, onChange, placeholder,
}: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <ChipsInput values={values} onChange={onChange} placeholder={placeholder} />
  )
}

function ProfessionalsCheckboxes({
  all, selected, onChange,
}: { all: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [newName, setNewName] = useState('')
  const lower = (s: string) => s.toLowerCase()

  function toggle(n: string) {
    const k = lower(n)
    if (selected.map(lower).indexOf(k) !== -1) {
      onChange(selected.filter((s) => lower(s) !== k))
    } else {
      onChange([...selected, k])
    }
  }

  function addNew() {
    const v = newName.trim().toLowerCase()
    if (v.length < 2) return
    if (selected.map(lower).indexOf(v) !== -1) { setNewName(''); return }
    onChange([...selected, v])
    setNewName('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {all.map((n) => {
          const checked = selected.map(lower).indexOf(lower(n)) !== -1
          return (
            <label key={n}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-[12px] cursor-pointer transition-colors ${
                checked ? 'border-[#C9A96E] bg-[#C9A96E]/10 text-[#C9A96E] font-bold'
                  : 'border-white/10 bg-white/[0.02] text-[#F5F0E8] hover:border-[#C9A96E]/40'
              }`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(n)}
                className="accent-[#C9A96E]" />
              <span>{capitalize(n)}</span>
            </label>
          )
        })}
      </div>
      <div className="flex items-center gap-2 pt-1.5 border-t border-dashed border-white/10">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }}
          placeholder="+ adicionar outro nome (ex.: rafael)"
          className="b2b-input flex-1" />
        <button type="button" onClick={addNew}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-white/10 bg-white/[0.02] text-[11px] text-[#F5F0E8] hover:border-[#C9A96E] hover:text-[#C9A96E] transition-colors">
          <Plus className="w-3 h-3" /> Adicionar
        </button>
      </div>
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

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function FormStyles() {
  return (
    <style jsx global>{`
      .b2b-input {
        width: 100%;
        padding: 6px 10px;
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        color: #F5F0E8;
        font-size: 12px;
        outline: none;
        transition: border-color 200ms ease;
      }
      .b2b-input:focus {
        border-color: rgba(201,169,110,0.5);
      }
      .b2b-input::placeholder {
        color: rgba(245,240,232,0.3);
      }
    `}</style>
  )
}
