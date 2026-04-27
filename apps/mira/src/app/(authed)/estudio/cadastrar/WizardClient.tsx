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
export type ComboLite = { label: string; isActive: boolean; isDefault: boolean }
export type TierConfigLite = {
  tier: 1 | 2 | 3
  label: string
  description: string | null
  colorHex: string
  defaultMonthlyCapBrl: number | null
  defaultVoucherCombo: string | null
  defaultVoucherValidityDays: number
  defaultVoucherMonthlyCap: number | null
}

interface WizardClientProps {
  mode: Mode
  combos: ComboLite[]
  tierConfigs?: TierConfigLite[]
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

export function WizardClient({ mode, combos, tierConfigs = [], partnership }: WizardClientProps) {
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
  const [tierInheritedFlash, setTierInheritedFlash] = useState<{ tier: number; label: string; fields: string[] } | null>(null)
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
  const [voucherValidityTouched, setVoucherValidityTouched] = useState(mode === 'edit')
  const [voucherMinNoticeDays, setVoucherMinNoticeDays] = useState(asNum(p.voucher_min_notice_days, 15))
  const [voucherMonthlyCap, setVoucherMonthlyCap] = useState(asNum(p.voucher_monthly_cap, 5))
  const [voucherMonthlyCapTouched, setVoucherMonthlyCapTouched] = useState(mode === 'edit')
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
  const [monthlyValueCapTouched, setMonthlyValueCapTouched] = useState(mode === 'edit')
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

  /**
   * onTierChange · pre-fill voucher defaults a partir de b2b_tier_configs
   * (mig 800-25). Aplica somente nos campos que o usuario AINDA NAO TOCOU
   * pra nao sobrescrever digitacao em andamento. Mostra flash com lista de
   * campos herdados.
   */
  function onTierChange(v: number | '') {
    setTier(v)
    if (v === '' || mode !== 'new') {
      setTierInheritedFlash(null)
      return
    }
    const cfg = tierConfigs.find((c) => c.tier === v)
    if (!cfg) {
      setTierInheritedFlash(null)
      return
    }
    const inheritedFields: string[] = []

    if (cfg.defaultVoucherCombo && !voucherComboTouched) {
      setVoucherCombo(cfg.defaultVoucherCombo)
      inheritedFields.push('combo do voucher')
    }
    if (cfg.defaultVoucherValidityDays && !voucherValidityTouched) {
      setVoucherValidityDays(cfg.defaultVoucherValidityDays)
      inheritedFields.push('validade')
    }
    if (cfg.defaultVoucherMonthlyCap != null && !voucherMonthlyCapTouched) {
      setVoucherMonthlyCap(cfg.defaultVoucherMonthlyCap)
      inheritedFields.push('cap mensal de vouchers')
    }
    if (cfg.defaultMonthlyCapBrl != null && !monthlyValueCapTouched) {
      setMonthlyValueCapBrl(String(cfg.defaultMonthlyCapBrl))
      inheritedFields.push('teto mensal R$')
    }

    if (inheritedFields.length > 0) {
      setTierInheritedFlash({ tier: Number(v), label: cfg.label, fields: inheritedFields })
    } else {
      setTierInheritedFlash(null)
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
    <div className="luxury-card-gold p-7 md:p-9 flex flex-col gap-7 shadow-[0_2px_24px_-12px_rgba(201,169,110,0.18)]">
      <StepIndicator step={step} />

      {step === 1 && (
        <Step1
          name={name} setName={setName}
          slugManual={slugManual} setSlugManual={(v) => { setSlugManual(v); setSlugTouched(true) }}
          slugPreview={slugPreview} slugConflict={slugConflict} onApplySuggestedSlug={applySuggestedSlug}
          pillar={pillar} onPillarChange={onPillarChange} pillarHint={pillarHint} onApplyPillarHint={applyPillarHint}
          category={category} setCategory={setCategory} categoriesList={allCategories}
          tier={tier} setTier={onTierChange}
          tierConfigs={tierConfigs} tierInheritedFlash={tierInheritedFlash}
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
          voucherValidityDays={voucherValidityDays} setVoucherValidityDays={(v) => { setVoucherValidityDays(v); setVoucherValidityTouched(true) }}
          voucherMinNoticeDays={voucherMinNoticeDays} setVoucherMinNoticeDays={setVoucherMinNoticeDays}
          voucherMonthlyCap={voucherMonthlyCap} setVoucherMonthlyCap={(v) => { setVoucherMonthlyCap(v); setVoucherMonthlyCapTouched(true) }}
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
          monthlyValueCapBrl={monthlyValueCapBrl} setMonthlyValueCapBrl={(v) => { setMonthlyValueCapBrl(v); setMonthlyValueCapTouched(true) }}
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
        <div className="rounded-md border border-[#D97A7A]/35 bg-[#D97A7A]/10 px-3.5 py-2.5 text-[12px] text-[#D97A7A] flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-5 border-t border-[var(--b2b-border)]">
        {step > 1 && (
          <button type="button" onClick={back} disabled={pending} className="b2b-btn inline-flex items-center gap-1.5 disabled:opacity-40">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </button>
        )}
        <button type="button" onClick={() => router.back()} disabled={pending}
          className="text-[11px] uppercase tracking-[1.5px] text-[var(--b2b-text-muted)] hover:text-[var(--b2b-text-dim)] transition-colors disabled:opacity-40 px-2 py-1">
          Cancelar
        </button>
        {step < 3 ? (
          <button type="button" onClick={next} disabled={pending} className="b2b-btn b2b-btn-primary inline-flex items-center gap-1.5 ml-auto disabled:opacity-40">
            Avançar <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={pending} className="b2b-btn b2b-btn-primary inline-flex items-center gap-1.5 ml-auto disabled:opacity-40">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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
  tierConfigs: TierConfigLite[]
  tierInheritedFlash: { tier: number; label: string; fields: string[] } | null
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
    <div className="flex flex-col gap-6">
      <SectionTitle
        accent={<>Identidade da <em>parceria</em></>}
        hint="Dados básicos pra identificar a parceira no sistema. Slug é gerado do nome — pode editar abaixo se precisar.">
        Parceria
      </SectionTitle>

      <Field label="Nome do negócio / parceria" required>
        <input value={props.name} onChange={(e) => props.setName(e.target.value)}
          placeholder="Ex.: Moinho Buffet"
          className="b2b-input" />
        <div className="wiz-slug-line mt-1.5 flex flex-wrap items-center gap-1.5">
          <span>URL: /partner.html?slug=</span>
          <code>{props.slugPreview || '—'}</code>
          {props.slugConflict && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-[var(--b2b-red)] bg-[rgba(217,122,122,0.10)] border border-[rgba(217,122,122,0.30)] px-2.5 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" />
              já existe ({props.slugConflict.name})
              {props.slugConflict.suggested && (
                <button type="button" onClick={() => props.onApplySuggestedSlug(props.slugConflict!.suggested!)}
                  className="ml-1 underline hover:no-underline font-semibold">
                  usar &ldquo;{props.slugConflict.suggested}&rdquo;
                </button>
              )}
            </span>
          )}
        </div>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
              className="wiz-hint-chip mt-2">
              <Sparkles className="w-3 h-3" /> sugerido: <b>{props.pillarHint}</b> · clique pra aplicar
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
            {[1, 2, 3].map((n) => {
              const cfg = props.tierConfigs.find((c) => c.tier === n)
              const fallback = n === 1 ? 'Premium' : n === 2 ? 'Padrão' : 'Apoio'
              const label = cfg?.label || fallback
              return (
                <option key={n} value={n}>
                  {n} · {label}
                </option>
              )
            })}
          </select>
          {props.tierInheritedFlash && props.tierInheritedFlash.tier === Number(props.tier) && (
            <div className="wiz-hint-chip mt-2 items-start" style={{ cursor: 'default' }}>
              <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="leading-relaxed">
                valores herdados de Tier {props.tierInheritedFlash.tier} · {props.tierInheritedFlash.label}
                {props.tierInheritedFlash.fields.length > 0 && (
                  <span className="text-[var(--b2b-text-muted)]"> ({props.tierInheritedFlash.fields.join(', ')})</span>
                )}
                <span className="text-[var(--b2b-text-muted)]"> · pode editar</span>
              </span>
            </div>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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

      <SectionTitle
        accent={<>Contato <em>principal</em></>}
        hint="A Mira vai enviar mensagens pra esse WhatsApp. Pode cadastrar mais de um responsável se a parceria tiver vários decisores.">
        Contato
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Responsáveis da parceria" required>
          <ChipsInput
            values={props.contactNames}
            onChange={props.setContactNames}
            placeholder="Digite o nome e pressione Enter ou vírgula"
          />
          <div className="text-[11px] text-[var(--b2b-text-muted)] mt-1.5 italic">
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
            <div className="mt-2 rounded-md border border-[var(--b2b-amber)]/35 bg-[rgba(245,158,11,0.06)] px-3 py-2 text-[11.5px] text-[var(--b2b-amber)]">
              <div className="font-semibold mb-1 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Telefone já em outras parcerias:
              </div>
              <ul className="list-disc list-inside text-[var(--b2b-text-dim)]">
                {props.phoneWarning.map((m) => (
                  <li key={m.id}><span className="text-[var(--b2b-ivory)]">{m.name}</span> <span className="text-[var(--b2b-text-muted)]">({m.status})</span></li>
                ))}
              </ul>
            </div>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
    <div className="flex flex-col gap-6">
      <SectionTitle
        accent={<>DNA · gate de <em>entrada</em></>}
        hint="Notas que determinam se a parceria pode virar contrato. Mínimo 7 em cada pra aprovar. Se não sabe na hora do cadastro, deixa no meio — dá pra editar depois.">
        DNA (0-10)
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
        <DnaSlider label="Excelência" value={props.dnaExc} onChange={props.setDnaExc} />
        <DnaSlider label="Estética" value={props.dnaEst} onChange={props.setDnaEst} />
        <DnaSlider label="Propósito" value={props.dnaPro} onChange={props.setDnaPro} />
      </div>

      <SectionTitle
        accent={<>Voucher <em>presente</em></>}
        hint="Como a parceria vai presentear convidadas pela clínica. Combo é o que vai no voucher; cap mensal limita disparos por mês.">
        Voucher
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
    <div className="flex flex-col gap-6">
      <SectionTitle
        accent={<>Localização <em>geográfica</em></>}
        hint="Aparece no mapa vivo da rede da clínica. Se não souber lat/lng, pode deixar em branco — atualizar depois.">
        Geo
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Latitude (decimal)">
          <input type="number" step="any" value={props.lat} onChange={(e) => props.setLat(e.target.value)}
            placeholder="-23.55052" className="b2b-input font-mono" />
        </Field>
        <Field label="Longitude (decimal)">
          <input type="number" step="any" value={props.lng} onChange={(e) => props.setLng(e.target.value)}
            placeholder="-46.633308" className="b2b-input font-mono" />
        </Field>
      </div>

      <SectionTitle
        accent={<>Contrapartida do <em>parceiro</em></>}
        hint="O que a parceira entrega em troca — texto livre. Cadence define a frequência da entrega.">
        Permuta
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

      <SectionTitle
        accent={<>Contrato &amp; <em>renovação</em></>}
        hint="Datas do contrato (opcionais — boca-a-boca pode deixar em branco). Trigger renewal_sweep cria task automática quando vencimento chega.">
        Contrato
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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

      <SectionTitle
        accent={<>Vigência &amp; <em>valuation</em></>}
        hint="Teto financeiro da permuta (sanity check) + duração total e cadência de revisão. Sazonais marcam datas que merecem ativação especial.">
        Valuation
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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

      <SectionTitle
        accent={<>Auto-<em>playbook</em></>}
        hint="Quando saúde virar vermelha, sistema aplica playbook automaticamente (cooldown 7d). Desliga se quiser que rode só manual.">
        Playbook
      </SectionTitle>
      <label className="inline-flex items-center gap-2.5 text-[13px] text-[var(--b2b-ivory)] cursor-pointer">
        <input type="checkbox" checked={props.autoPlaybook}
          onChange={(e) => props.setAutoPlaybook(e.target.checked)}
          className="accent-[var(--b2b-champagne)] w-4 h-4" />
        <span>Sim — aplicar playbook automaticamente quando health=red</span>
      </label>

      <SectionTitle
        accent={<>Narrativa &amp; <em>storytelling</em></>}
        hint="Usado em materiais internos, brief para a parceria e copy. Tudo opcional.">
        Narrativa
      </SectionTitle>
      <Field label="Slogans">
        <ArrayInput values={props.slogans} onChange={props.setSlogans}
          placeholder="Frase 1, Frase 2, ..." />
      </Field>
      <Field label="Citação do parceiro">
        <textarea value={props.narrativeQuote} onChange={(e) => props.setNarrativeQuote(e.target.value)}
          rows={3} className="b2b-input resize-y" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

      <SectionTitle
        accent={<>Profissionais <em>envolvidos</em></>}
        hint="Quem do lado clínica vai atuar com essa parceria. Pode marcar mais de um — todos recebem notificação quando houver movimentação.">
        Time
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

      <SectionTitle
        accent={<>Grupo / <em>Confraria</em></>}
        hint="Se a parceria é com um grupo coletivo (ex.: ACIM, Confraria), marca aqui pra ativar fluxos de membras.">
        Grupo
      </SectionTitle>
      <label className="inline-flex items-center gap-2.5 text-[13px] text-[var(--b2b-ivory)] cursor-pointer">
        <input type="checkbox" checked={props.isCollective}
          onChange={(e) => props.setIsCollective(e.target.checked)}
          className="accent-[var(--b2b-champagne)] w-4 h-4" />
        <span>Sim — é com um grupo coletivo</span>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

      <SectionTitle
        accent={<>Notas <em>internas</em></>}
        hint="Como conheceu, observações, próximos passos. Texto livre · só pra equipe.">
        Notas
      </SectionTitle>
      <Field label="Observações livres">
        <textarea value={props.notes} onChange={(e) => props.setNotes(e.target.value)}
          rows={4} placeholder="Como conheceu, observações, próximos passos…"
          className="b2b-input resize-y" />
      </Field>

      <div className="rounded-md border border-[var(--b2b-border-strong)] bg-[rgba(201,169,110,0.05)] p-5 flex flex-col gap-2.5 mt-2">
        <div className="flex items-baseline gap-3 pb-2 border-b border-[var(--b2b-border)]">
          <span className="eyebrow">Resumo</span>
          <span className="text-[11px] text-[var(--b2b-text-muted)] italic">confirme antes de salvar</span>
        </div>
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
  const steps: Array<{ label: string; sub: string }> = [
    { label: 'Identidade', sub: 'Parceria + contato' },
    { label: 'Operação',   sub: 'DNA + voucher'      },
    { label: 'Detalhes',   sub: 'Finalização'        },
  ]
  return (
    <div className="rounded-[10px] border border-[var(--b2b-border)] bg-[rgba(255,255,255,0.02)] px-5 py-4 flex items-center gap-2">
      {steps.map((s, i) => {
        const idx = (i + 1) as 1 | 2 | 3
        const done = step > idx
        const current = step === idx
        return (
          <div key={s.label} className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold border-[1.5px] transition-all duration-200 ${
                current ? 'bg-[var(--b2b-champagne)] border-[var(--b2b-champagne)] text-[var(--b2b-bg-0)] shadow-[0_0_0_4px_rgba(201,169,110,0.15)]'
                  : done ? 'bg-[rgba(201,169,110,0.18)] border-[var(--b2b-champagne)] text-[var(--b2b-champagne)]'
                  : 'bg-[rgba(255,255,255,0.04)] border-[var(--b2b-border)] text-[var(--b2b-text-muted)]'}`}>
                {done ? <Check className="w-3.5 h-3.5" /> : idx}
              </div>
              <div className="hidden md:flex flex-col min-w-0 leading-tight">
                <span className={`text-[12.5px] font-bold whitespace-nowrap ${
                  current ? 'text-[var(--b2b-ivory)]'
                    : done ? 'text-[var(--b2b-champagne)]'
                    : 'text-[var(--b2b-text-muted)]'}`}>
                  {s.label}
                </span>
                <span className="text-[10.5px] text-[var(--b2b-text-muted)] whitespace-nowrap">{s.sub}</span>
              </div>
            </div>
            {idx < 3 && <div className="flex-1 h-px bg-[var(--b2b-border)] mx-2" />}
          </div>
        )
      })}
    </div>
  )
}

function SectionTitle({ children, hint, accent }: { children: React.ReactNode; hint?: string; accent?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pt-5 mt-1 border-t border-[var(--b2b-border)] first:border-t-0 first:pt-1 first:mt-0">
      <span className="eyebrow">{children}</span>
      {accent && (
        <h3 className="font-display text-[22px] md:text-[24px] text-[var(--b2b-ivory)] leading-[1.2]">
          {accent}
        </h3>
      )}
      {hint && <div className="text-[12px] text-[var(--b2b-text-dim)] mt-0.5 italic leading-relaxed">{hint}</div>}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] uppercase tracking-[1.6px] font-semibold text-[var(--b2b-text-dim)]">
        {label} {required && <span className="text-[var(--b2b-red)] not-italic">*</span>}
      </label>
      {children}
    </div>
  )
}

function DnaSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[10px] uppercase tracking-[1.6px] font-semibold text-[var(--b2b-text-dim)]">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <input type="range" min={0} max={10} step={1} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="wiz-dna-track" />
        <span className="wiz-dna-badge">{value}</span>
      </div>
      <div className="flex justify-between text-[10px] text-[var(--b2b-text-muted)] px-1">
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
    <div className="wiz-chips-wrap">
      {values.map((v, i) => (
        <span key={`${v}-${i}`} className="wiz-chip">
          {v}
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="wiz-chip-rm" aria-label="Remover">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={() => commit(text)}
        placeholder={values.length ? '' : placeholder}
        className="wiz-chips-input" />
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {all.map((n) => {
          const checked = selected.map(lower).indexOf(lower(n)) !== -1
          return (
            <label key={n} className={`wiz-prof-chk ${checked ? 'wiz-prof-chk-checked' : ''}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(n)}
                className="accent-[var(--b2b-champagne)]" />
              <span>{capitalize(n)}</span>
            </label>
          )
        })}
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-dashed border-[var(--b2b-border)]">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }}
          placeholder="+ adicionar outro nome (ex.: rafael)"
          className="b2b-input flex-1" />
        <button type="button" onClick={addNew} className="b2b-btn inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>
    </div>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 text-[12px]">
      <span className="text-[var(--b2b-text-muted)] w-20 shrink-0 uppercase tracking-[1.4px] text-[10px] font-semibold">{k}</span>
      <span className={`text-[var(--b2b-ivory)] ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * FormStyles · estilos suplementares somente do wizard (chips, sliders DNA,
 * hint chips). O `.b2b-input` base vem de globals.css (b2b-* replica).
 */
function FormStyles() {
  return (
    <style jsx global>{`
      /* --- Chips de input (responsaveis, contrapartida, sazonais, etc) --- */
      .wiz-chips-wrap {
        display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
        min-height: 40px;
        padding: 6px 8px;
        background: var(--b2b-bg-2);
        border: 1px solid var(--b2b-border);
        border-radius: 5px;
        transition: border-color 200ms ease;
      }
      .wiz-chips-wrap:focus-within {
        border-color: var(--b2b-champagne);
      }
      .wiz-chip {
        display: inline-flex; align-items: center; gap: 4px;
        background: rgba(201,169,110,0.15);
        color: var(--b2b-champagne-light);
        border: 1px solid rgba(201,169,110,0.35);
        font-size: 12px; font-weight: 500;
        padding: 3px 4px 3px 11px;
        border-radius: 12px;
        line-height: 1.2;
      }
      .wiz-chip-rm {
        border: 0; background: transparent; color: var(--b2b-champagne-light);
        cursor: pointer; padding: 0 4px; opacity: 0.6;
        display: inline-flex; align-items: center;
      }
      .wiz-chip-rm:hover { opacity: 1; color: var(--b2b-ivory); }
      .wiz-chips-input {
        flex: 1; min-width: 140px;
        background: transparent; border: 0; outline: none;
        color: var(--b2b-ivory);
        font-size: 13px;
        padding: 4px 4px;
      }
      .wiz-chips-input::placeholder { color: rgba(245,240,232,0.30); }

      /* --- DNA slider (gold gradient + champagne thumb) --- */
      .wiz-dna-track {
        flex: 1; height: 6px; -webkit-appearance: none; appearance: none;
        background: linear-gradient(to right, rgba(201,169,110,0.20) 0%, var(--b2b-champagne) 50%, var(--b2b-red) 100%);
        border-radius: 3px; outline: none; cursor: pointer;
      }
      .wiz-dna-track::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 18px; height: 18px; border-radius: 50%;
        background: var(--b2b-champagne); border: 2px solid var(--b2b-bg-0);
        box-shadow: 0 2px 8px rgba(0,0,0,0.45);
        cursor: pointer;
      }
      .wiz-dna-track::-moz-range-thumb {
        width: 18px; height: 18px; border-radius: 50%;
        background: var(--b2b-champagne); border: 2px solid var(--b2b-bg-0);
        box-shadow: 0 2px 8px rgba(0,0,0,0.45);
        cursor: pointer;
      }
      .wiz-dna-badge {
        min-width: 38px; text-align: center;
        padding: 5px 10px;
        background: var(--b2b-champagne); color: var(--b2b-bg-0);
        border-radius: 4px;
        font: 700 13px ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      /* --- Hint chip "✨ sugerido" --- */
      .wiz-hint-chip {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 11.5px; color: var(--b2b-champagne);
        padding: 4px 10px;
        background: rgba(201,169,110,0.10);
        border: 1px dashed rgba(201,169,110,0.45);
        border-radius: 4px;
        cursor: pointer;
        transition: all 150ms ease;
      }
      .wiz-hint-chip:hover {
        background: rgba(201,169,110,0.18);
        border-style: solid;
        border-color: var(--b2b-champagne);
      }

      /* --- Slug preview line (gold mono accent) --- */
      .wiz-slug-line { font-size: 11.5px; color: var(--b2b-text-muted); }
      .wiz-slug-line code { font-family: ui-monospace, monospace; color: var(--b2b-champagne); }

      /* --- Profissionais checkboxes --- */
      .wiz-prof-chk {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 7px 14px;
        border: 1px solid var(--b2b-border);
        background: var(--b2b-bg-2);
        border-radius: 5px;
        color: var(--b2b-ivory);
        font-size: 13px;
        cursor: pointer;
        user-select: none;
        transition: all 150ms ease;
      }
      .wiz-prof-chk:hover { border-color: var(--b2b-champagne); }
      .wiz-prof-chk-checked {
        border-color: var(--b2b-champagne);
        background: rgba(201,169,110,0.10);
      }
      .wiz-prof-chk-checked span { color: var(--b2b-champagne); font-weight: 600; }
    `}</style>
  )
}
