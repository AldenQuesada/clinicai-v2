'use client'

/**
 * NewPatientForm · wizard 3-step com validacao inline + masks.
 *
 * Steps:
 *   1. Identidade (firstname/lastname/sex/cpf/phone) · 5 obrigatorios
 *   2. Endereço + clínico (cep/rua/num/proc/queixa/expectativas) · todos opcionais
 *   3. Atribuição (source/indicado_por/utm_campaign/notes) · todos opcionais
 *
 * Validacao inline:
 *   - npHighlight equivalente · borda red 2.5s + focus + msg no FormField error
 *   - Server-side via Zod · falhas mostram erro especifico por campo
 *
 * Masks:
 *   - CPF, RG, Telefone, CEP via @clinicai/utils
 *
 * Submit: createPatientAsLeadAction · sucesso → toast + redirect /crm/pacientes/<id>
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  FormField,
  Input,
  Select,
  Textarea,
  useToast,
  Card,
} from '@clinicai/ui'
import { ArrowLeft, ArrowRight, Save } from 'lucide-react'
import {
  maskCpf,
  maskRg,
  maskPhoneDisplay,
  maskCep,
  unmaskCpf,
  unmaskRg,
  SEX_OPTIONS,
} from '@clinicai/utils'
import { createPatientAsLeadAction } from '../_actions'

type Step = 1 | 2 | 3

interface FormState {
  firstname: string
  lastname: string
  sex: 'F' | 'M' | 'O' | 'N' | ''
  cpf: string
  phone: string
  rg: string
  email: string
  birthDate: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  procedimento: string
  queixa: string
  expectativas: string
  source: string
  indicadoPor: string
  utmCampaign: string
  notes: string
}

const INITIAL: FormState = {
  firstname: '',
  lastname: '',
  sex: '',
  cpf: '',
  phone: '',
  rg: '',
  email: '',
  birthDate: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  procedimento: '',
  queixa: '',
  expectativas: '',
  source: '',
  indicadoPor: '',
  utmCampaign: '',
  notes: '',
}

export function NewPatientForm() {
  const router = useRouter()
  const { fromResult, success, error: toastError } = useToast()
  const [step, setStep] = React.useState<Step>(1)
  const [data, setData] = React.useState<FormState>(INITIAL)
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({})
  const [busy, setBusy] = React.useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }))
    // Limpa erro do campo quando user digita
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // Validation step 1 (5 obrigatorios)
  function validateStep1(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!data.firstname.trim()) errs.firstname = 'Nome é obrigatório'
    if (!data.lastname.trim()) errs.lastname = 'Sobrenome é obrigatório'
    if (!data.sex) errs.sex = 'Selecione o sexo biológico'
    const cpfDigits = unmaskCpf(data.cpf)
    if (!data.cpf.trim()) errs.cpf = 'CPF é obrigatório'
    else if (!cpfDigits) errs.cpf = 'CPF deve ter 11 dígitos'
    if (!data.phone.trim()) errs.phone = 'Telefone é obrigatório'
    else if (data.phone.replace(/\D/g, '').length < 10)
      errs.phone = 'Telefone curto'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() {
    if (step === 1 && !validateStep1()) return
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s))
  }

  function back() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s))
  }

  async function submit() {
    if (!validateStep1()) {
      setStep(1)
      toastError('Revise os campos obrigatórios da etapa 1')
      return
    }

    setBusy(true)
    try {
      const r = await createPatientAsLeadAction({
        firstname: data.firstname.trim(),
        lastname: data.lastname.trim(),
        phone: data.phone,
        email: data.email.trim() || null,
        sex: data.sex || undefined,
        cpf: data.cpf,
        rg: data.rg || null,
        birthDate: data.birthDate || null,
        cep: data.cep || null,
        rua: data.rua || null,
        numero: data.numero || null,
        complemento: data.complemento || null,
        bairro: data.bairro || null,
        cidade: data.cidade || null,
        uf: data.uf || null,
        procedimento: data.procedimento || null,
        queixa: data.queixa || null,
        expectativas: data.expectativas || null,
        notes: data.notes || null,
        source: data.source || 'manual',
        indicadoPor: data.indicadoPor || null,
        utmCampaign: data.utmCampaign || null,
      })

      if (!r.ok) {
        // Falhas Zod podem vir com fieldErrors detalhados
        if (r.error === 'invalid_input' && r.details?.issues) {
          const issues = r.details.issues as {
            fieldErrors?: Record<string, string[]>
          }
          if (issues.fieldErrors) {
            const newErrs: Partial<Record<keyof FormState, string>> = {}
            for (const [field, msgs] of Object.entries(issues.fieldErrors)) {
              if (msgs?.[0]) newErrs[field as keyof FormState] = msgs[0]
            }
            setErrors(newErrs)
          }
          // Volta pra step 1 se erro em campo de step 1
          const step1Fields = ['firstname', 'lastname', 'sex', 'cpf', 'phone', 'email']
          if (
            issues.fieldErrors &&
            Object.keys(issues.fieldErrors).some((f) => step1Fields.includes(f))
          ) {
            setStep(1)
          }
          toastError('Revise os campos com erro')
          return
        }
        if (r.error === 'invalid_cpf') {
          setErrors({ cpf: 'CPF inválido (11 dígitos)' })
          setStep(1)
          toastError('CPF inválido')
          return
        }
        if (r.error === 'lead_softdeleted_exists') {
          toastError('Já existe paciente/orçamento com este telefone na base')
          return
        }
        fromResult(r)
        return
      }

      success(r.data.existed ? 'Paciente já existia · usando registro' : 'Paciente cadastrado!')
      router.push(`/crm/pacientes/${r.data.leadId}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <Stepper current={step} />

      {step === 1 && (
        <Step1
          data={data}
          errors={errors}
          set={set}
        />
      )}

      {step === 2 && (
        <Step2
          data={data}
          errors={errors}
          set={set}
        />
      )}

      {step === 3 && (
        <Step3
          data={data}
          errors={errors}
          set={set}
        />
      )}

      <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4">
        {step > 1 ? (
          <Button variant="ghost" onClick={back} disabled={busy}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <Button onClick={next} disabled={busy}>
            Próximo
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={busy}>
            <Save className="h-4 w-4" />
            {busy ? 'Salvando…' : 'Cadastrar paciente'}
          </Button>
        )}
      </div>
    </Card>
  )
}

function Stepper({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: 'Identidade' },
    { n: 2, label: 'Endereço + clínico' },
    { n: 3, label: 'Atribuição + notas' },
  ]
  return (
    <div className="mb-6 flex items-center gap-2">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div
            className={`flex items-center gap-2 ${
              s.n === current
                ? 'text-[var(--primary)]'
                : s.n < current
                  ? 'text-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)]'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-pill text-[10px] font-display-uppercase ${
                s.n === current
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : s.n < current
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-[var(--color-border-soft)] text-[var(--muted-foreground)]'
              }`}
            >
              {s.n}
            </span>
            <span className="text-xs font-display-uppercase tracking-widest">
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span className="flex-1 border-t border-[var(--border)]" />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

interface StepProps {
  data: FormState
  errors: Partial<Record<keyof FormState, string>>
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}

function Step1({ data, errors, set }: StepProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField label="Nome" htmlFor="firstname" required error={errors.firstname}>
        <Input
          id="firstname"
          value={data.firstname}
          onChange={(e) => set('firstname', e.target.value)}
          maxLength={60}
          autoFocus
          invalid={!!errors.firstname}
        />
      </FormField>
      <FormField
        label="Sobrenome"
        htmlFor="lastname"
        required
        error={errors.lastname}
      >
        <Input
          id="lastname"
          value={data.lastname}
          onChange={(e) => set('lastname', e.target.value)}
          maxLength={60}
          invalid={!!errors.lastname}
        />
      </FormField>

      <FormField label="Sexo biológico" htmlFor="sex" required error={errors.sex}>
        <Select
          id="sex"
          value={data.sex}
          onChange={(e) => set('sex', e.target.value as FormState['sex'])}
          invalid={!!errors.sex}
        >
          <option value="">Selecione…</option>
          {SEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Data nascimento"
        htmlFor="birthDate"
        error={errors.birthDate}
      >
        <Input
          id="birthDate"
          type="date"
          value={data.birthDate}
          onChange={(e) => set('birthDate', e.target.value)}
        />
      </FormField>

      <FormField
        label="CPF"
        htmlFor="cpf"
        required
        error={errors.cpf}
        hint="000.000.000-00"
      >
        <Input
          id="cpf"
          value={data.cpf}
          onChange={(e) => set('cpf', maskCpf(e.target.value))}
          placeholder="000.000.000-00"
          maxLength={14}
          inputMode="numeric"
          invalid={!!errors.cpf}
          autoComplete="off"
        />
      </FormField>

      <FormField label="RG" htmlFor="rg" error={errors.rg}>
        <Input
          id="rg"
          value={data.rg}
          onChange={(e) => set('rg', maskRg(e.target.value))}
          placeholder="00.000.000-0"
          maxLength={12}
          autoComplete="off"
        />
      </FormField>

      <FormField
        label="Telefone"
        htmlFor="phone"
        required
        error={errors.phone}
        hint="(11) 99999-9999"
      >
        <Input
          id="phone"
          value={data.phone}
          onChange={(e) => set('phone', maskPhoneDisplay(e.target.value))}
          placeholder="(11) 99999-9999"
          maxLength={15}
          inputMode="tel"
          invalid={!!errors.phone}
          autoComplete="off"
        />
      </FormField>

      <FormField label="Email" htmlFor="email" error={errors.email}>
        <Input
          id="email"
          type="email"
          value={data.email}
          onChange={(e) => set('email', e.target.value)}
          maxLength={160}
          invalid={!!errors.email}
        />
      </FormField>
    </div>
  )
}

function Step2({ data, errors, set }: StepProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <FormField label="CEP" htmlFor="cep" error={errors.cep}>
        <Input
          id="cep"
          value={data.cep}
          onChange={(e) => set('cep', maskCep(e.target.value))}
          placeholder="00000-000"
          maxLength={9}
          inputMode="numeric"
        />
      </FormField>

      <FormField label="Rua" htmlFor="rua" className="md:col-span-2" error={errors.rua}>
        <Input
          id="rua"
          value={data.rua}
          onChange={(e) => set('rua', e.target.value)}
          maxLength={200}
        />
      </FormField>

      <FormField label="Número" htmlFor="numero" error={errors.numero}>
        <Input
          id="numero"
          value={data.numero}
          onChange={(e) => set('numero', e.target.value)}
          maxLength={10}
        />
      </FormField>

      <FormField
        label="Complemento"
        htmlFor="complemento"
        error={errors.complemento}
      >
        <Input
          id="complemento"
          value={data.complemento}
          onChange={(e) => set('complemento', e.target.value)}
          maxLength={60}
        />
      </FormField>

      <FormField label="Bairro" htmlFor="bairro" error={errors.bairro}>
        <Input
          id="bairro"
          value={data.bairro}
          onChange={(e) => set('bairro', e.target.value)}
          maxLength={60}
        />
      </FormField>

      <FormField label="Cidade" htmlFor="cidade" className="md:col-span-2" error={errors.cidade}>
        <Input
          id="cidade"
          value={data.cidade}
          onChange={(e) => set('cidade', e.target.value)}
          maxLength={80}
        />
      </FormField>

      <FormField label="UF" htmlFor="uf" error={errors.uf}>
        <Input
          id="uf"
          value={data.uf}
          onChange={(e) => set('uf', e.target.value.toUpperCase())}
          maxLength={2}
          placeholder="SP"
        />
      </FormField>

      <FormField
        label="Procedimento de interesse"
        htmlFor="procedimento"
        className="md:col-span-3"
        error={errors.procedimento}
      >
        <Input
          id="procedimento"
          value={data.procedimento}
          onChange={(e) => set('procedimento', e.target.value)}
          maxLength={200}
          placeholder="Ex: Botox, harmonização facial, fullface…"
        />
      </FormField>

      <FormField
        label="Queixa principal"
        htmlFor="queixa"
        className="md:col-span-3"
        error={errors.queixa}
      >
        <Textarea
          id="queixa"
          value={data.queixa}
          onChange={(e) => set('queixa', e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </FormField>

      <FormField
        label="Expectativas"
        htmlFor="expectativas"
        className="md:col-span-3"
        error={errors.expectativas}
      >
        <Textarea
          id="expectativas"
          value={data.expectativas}
          onChange={(e) => set('expectativas', e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </FormField>
    </div>
  )
}

function Step3({ data, errors, set }: StepProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField label="Origem" htmlFor="source" error={errors.source}>
        <Select
          id="source"
          value={data.source}
          onChange={(e) => set('source', e.target.value)}
        >
          <option value="">Manual (default)</option>
          <option value="manual">Manual</option>
          <option value="quiz">Quiz</option>
          <option value="landing_page">Landing page</option>
          <option value="b2b_partnership_referral">Indicação parceria B2B</option>
          <option value="b2b_admin_registered">Admin B2B</option>
          <option value="lara_recipient">Recipient Lara</option>
          <option value="lara_vpi_partner">VPI Partner Lara</option>
          <option value="webhook">Webhook</option>
          <option value="import">Importação</option>
        </Select>
      </FormField>

      <FormField
        label="Indicado por"
        htmlFor="indicadoPor"
        error={errors.indicadoPor}
        hint="Nome do parceiro/paciente que indicou"
      >
        <Input
          id="indicadoPor"
          value={data.indicadoPor}
          onChange={(e) => set('indicadoPor', e.target.value)}
          maxLength={120}
        />
      </FormField>

      <FormField
        label="UTM Campaign"
        htmlFor="utmCampaign"
        className="md:col-span-2"
        error={errors.utmCampaign}
      >
        <Input
          id="utmCampaign"
          value={data.utmCampaign}
          onChange={(e) => set('utmCampaign', e.target.value)}
          maxLength={200}
        />
      </FormField>

      <FormField
        label="Observações"
        htmlFor="notes"
        className="md:col-span-2"
        error={errors.notes}
      >
        <Textarea
          id="notes"
          value={data.notes}
          onChange={(e) => set('notes', e.target.value)}
          maxLength={2000}
          rows={4}
        />
      </FormField>
    </div>
  )
}
