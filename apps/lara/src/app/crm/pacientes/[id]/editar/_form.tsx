'use client'

/**
 * EditPatientForm · campos editaveis do paciente.
 *
 * Pre-preenche com PatientDTO atual · chama updatePatientAction (Camada 5)
 * no submit. Erros de Zod aparecem inline. Sucesso → toast + redirect detalhe.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
  Textarea,
  useToast,
} from '@clinicai/ui'
import { Save, X } from 'lucide-react'
import {
  maskCpf,
  maskRg,
  maskPhoneDisplay,
  maskCep,
  unmaskCpf,
  unmaskCep,
  SEX_OPTIONS,
  type PatientSex,
} from '@clinicai/utils'
import { updatePatientAction } from '@/app/crm/_actions/patient.actions'
import type { PatientDTO } from '@clinicai/repositories'

interface FormState {
  name: string
  phone: string
  email: string
  cpf: string
  rg: string
  birthDate: string
  sex: PatientSex | ''
  status: 'active' | 'inactive' | 'blocked' | 'deceased'
  notes: string
  // Address
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

function patientToForm(p: PatientDTO): FormState {
  const addr = (p.addressJson ?? {}) as Record<string, string>
  return {
    name: p.name ?? '',
    phone: maskPhoneDisplay(p.phone ?? ''),
    email: p.email ?? '',
    cpf: p.cpf ? maskCpf(p.cpf) : '',
    rg: p.rg ?? '',
    birthDate: p.birthDate ?? '',
    sex: (p.sex ?? '') as PatientSex | '',
    status: p.status,
    notes: p.notes ?? '',
    cep: addr.cep ? maskCep(addr.cep) : '',
    rua: addr.rua ?? '',
    numero: addr.numero ?? '',
    complemento: addr.complemento ?? '',
    bairro: addr.bairro ?? '',
    cidade: addr.cidade ?? '',
    uf: addr.uf ?? '',
  }
}

export function EditPatientForm({ patient }: { patient: PatientDTO }) {
  const router = useRouter()
  const { fromResult, success, error: toastError } = useToast()
  const [data, setData] = React.useState<FormState>(() => patientToForm(patient))
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof FormState, string>>
  >({})
  const [busy, setBusy] = React.useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!data.name.trim()) errs.name = 'Nome é obrigatório'
    if (!data.phone.replace(/\D/g, '')) errs.phone = 'Telefone é obrigatório'
    else if (data.phone.replace(/\D/g, '').length < 10)
      errs.phone = 'Telefone curto'
    if (data.cpf && !unmaskCpf(data.cpf)) errs.cpf = 'CPF deve ter 11 dígitos'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submit() {
    if (!validate()) return

    setBusy(true)
    try {
      // Monta address só se há algum campo
      const addr: Record<string, string> = {}
      if (data.cep) addr.cep = unmaskCep(data.cep)
      if (data.rua) addr.rua = data.rua
      if (data.numero) addr.numero = data.numero
      if (data.complemento) addr.complemento = data.complemento
      if (data.bairro) addr.bairro = data.bairro
      if (data.cidade) addr.cidade = data.cidade
      if (data.uf) addr.uf = data.uf

      const r = await updatePatientAction({
        patientId: patient.id,
        name: data.name.trim(),
        phone: data.phone.replace(/\D/g, ''),
        email: data.email.trim() || null,
        cpf: data.cpf ? unmaskCpf(data.cpf) : null,
        rg: data.rg || null,
        birthDate: data.birthDate || null,
        sex: data.sex || null,
        status: data.status,
        notes: data.notes || null,
        addressJson: Object.keys(addr).length ? addr : null,
      })

      if (!r.ok) {
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
          toastError('Revise os campos com erro')
          return
        }
        fromResult(r)
        return
      }

      success('Paciente atualizado')
      router.push(`/crm/pacientes/${patient.id}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Nome completo" htmlFor="name" required error={errors.name}>
          <Input
            id="name"
            value={data.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={120}
            invalid={!!errors.name}
          />
        </FormField>

        <FormField label="Status" htmlFor="status" required error={errors.status}>
          <Select
            id="status"
            value={data.status}
            onChange={(e) => set('status', e.target.value as FormState['status'])}
          >
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
            <option value="blocked">Bloqueado</option>
            <option value="deceased">Falecido</option>
          </Select>
        </FormField>

        <FormField label="Telefone" htmlFor="phone" required error={errors.phone}>
          <Input
            id="phone"
            value={data.phone}
            onChange={(e) => set('phone', maskPhoneDisplay(e.target.value))}
            placeholder="(11) 99999-9999"
            maxLength={15}
            inputMode="tel"
            invalid={!!errors.phone}
          />
        </FormField>

        <FormField label="Email" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            value={data.email}
            onChange={(e) => set('email', e.target.value)}
            maxLength={160}
          />
        </FormField>

        <FormField label="CPF" htmlFor="cpf" error={errors.cpf}>
          <Input
            id="cpf"
            value={data.cpf}
            onChange={(e) => set('cpf', maskCpf(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            inputMode="numeric"
            invalid={!!errors.cpf}
          />
        </FormField>

        <FormField label="RG" htmlFor="rg" error={errors.rg}>
          <Input
            id="rg"
            value={data.rg}
            onChange={(e) => set('rg', maskRg(e.target.value))}
            placeholder="00.000.000-0"
            maxLength={12}
          />
        </FormField>

        <FormField label="Sexo" htmlFor="sex" error={errors.sex}>
          <Select
            id="sex"
            value={data.sex}
            onChange={(e) => set('sex', e.target.value as PatientSex | '')}
          >
            <option value="">—</option>
            {SEX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Nascimento"
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
      </div>

      <h3 className="mt-6 mb-3 font-display-uppercase text-xs tracking-widest text-[var(--muted-foreground)]">
        Endereço
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormField label="CEP" htmlFor="cep" error={errors.cep}>
          <Input
            id="cep"
            value={data.cep}
            onChange={(e) => set('cep', maskCep(e.target.value))}
            placeholder="00000-000"
            maxLength={9}
          />
        </FormField>
        <FormField label="Rua" htmlFor="rua" className="md:col-span-2">
          <Input
            id="rua"
            value={data.rua}
            onChange={(e) => set('rua', e.target.value)}
            maxLength={200}
          />
        </FormField>
        <FormField label="Número" htmlFor="numero">
          <Input
            id="numero"
            value={data.numero}
            onChange={(e) => set('numero', e.target.value)}
            maxLength={10}
          />
        </FormField>
        <FormField label="Complemento" htmlFor="complemento">
          <Input
            id="complemento"
            value={data.complemento}
            onChange={(e) => set('complemento', e.target.value)}
            maxLength={60}
          />
        </FormField>
        <FormField label="Bairro" htmlFor="bairro">
          <Input
            id="bairro"
            value={data.bairro}
            onChange={(e) => set('bairro', e.target.value)}
            maxLength={60}
          />
        </FormField>
        <FormField label="Cidade" htmlFor="cidade" className="md:col-span-2">
          <Input
            id="cidade"
            value={data.cidade}
            onChange={(e) => set('cidade', e.target.value)}
            maxLength={80}
          />
        </FormField>
        <FormField label="UF" htmlFor="uf">
          <Input
            id="uf"
            value={data.uf}
            onChange={(e) => set('uf', e.target.value.toUpperCase())}
            maxLength={2}
          />
        </FormField>
      </div>

      <FormField
        label="Notas internas"
        htmlFor="notes"
        className="mt-4"
        error={errors.notes}
      >
        <Textarea
          id="notes"
          value={data.notes}
          onChange={(e) => set('notes', e.target.value)}
          maxLength={4000}
          rows={4}
        />
      </FormField>

      <div className="mt-6 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
        <Button
          variant="ghost"
          onClick={() => router.push(`/crm/pacientes/${patient.id}`)}
          disabled={busy}
        >
          <X className="h-4 w-4" />
          Cancelar
        </Button>
        <Button onClick={submit} disabled={busy}>
          <Save className="h-4 w-4" />
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </Card>
  )
}
