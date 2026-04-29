'use server'

/**
 * Actions especificas da pagina de pacientes (Camada 7).
 *
 * Reuso · CRUD-básico ja vive em apps/lara/src/app/crm/_actions/patient.actions.ts
 * (Camada 5 · update, softDelete, addRevenue). Aqui ficam:
 *   - exportPatientsCsvAction · gera CSV em memoria · retorna string
 *   - createPatientAsLeadAction · espelha legacy "Novo Paciente" modal
 *     que cria LEAD (phase=lead) com dados clinicos pre-preenchidos.
 *     Modelo excludente: paciente real nasce de lead_to_paciente RPC quando
 *     compareceu. Esse helper permite cadastro avulso sem appointment.
 */

import { z } from 'zod'
import {
  CRM_TAGS,
  createLogger,
  fail,
  hashPhone,
  loadServerReposContext,
  ok,
  updateTag,
  zodFail,
  type Result,
} from '@/app/crm/_actions/shared'
import { normalizePhoneBR, isValidCpfFormat, unmaskCpf, unmaskRg } from '@clinicai/utils'

const log = createLogger({ app: 'lara' })

// ── Export CSV · 10 colunas espelhando legacy ───────────────────────────────

const ExportSchema = z.object({
  status: z
    .enum(['active', 'inactive', 'blocked', 'deceased'])
    .nullable()
    .optional(),
})

const SEX_LABEL: Record<string, string> = {
  F: 'Feminino',
  M: 'Masculino',
  O: 'Outro',
  N: 'Não informar',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  blocked: 'Bloqueado',
  deceased: 'Falecido',
}

function formatPhoneForCsv(phone: string | null): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  return phone
}

function formatDateForCsv(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  // Doublequote e escape de aspas internas
  return `"${s.replace(/"/g, '""')}"`
}

export async function exportPatientsCsvAction(
  input: unknown,
): Promise<Result<{ csv: string; filename: string; count: number }>> {
  const parsed = ExportSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const patients = await repos.patients.listAllForExport(ctx.clinic_id, {
    status: parsed.data.status ?? undefined,
  })

  if (patients.length === 0) {
    log.warn(
      { action: 'crm.patient.exportCsv', clinic_id: ctx.clinic_id },
      'patient.exportCsv.empty',
    )
    return fail('empty_export')
  }

  // 10 colunas espelham legacy js/patients.js → exportPatientsCsv
  const sep = ';'
  const header = [
    'Nome',
    'Telefone',
    'Email',
    'Status',
    'Sexo',
    'CPF',
    'RG',
    'Data Nascimento',
    'Total Procedimentos',
    'Receita Total',
    'Data Cadastro',
  ]
    .map(csvEscape)
    .join(sep)

  const lines = patients.map((p) =>
    [
      p.name,
      formatPhoneForCsv(p.phone),
      p.email ?? '',
      STATUS_LABEL[p.status] ?? p.status,
      SEX_LABEL[p.sex ?? ''] ?? '',
      p.cpf ?? '',
      p.rg ?? '',
      formatDateForCsv(p.birthDate),
      String(p.totalProcedures),
      p.totalRevenue.toFixed(2).replace('.', ','),
      formatDateForCsv(p.createdAt),
    ]
      .map(csvEscape)
      .join(sep),
  )

  // BOM UTF-8 pra Excel abrir certo o pt-BR
  const csv = '﻿' + header + '\n' + lines.join('\n')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `pacientes_${today}.csv`

  log.info(
    {
      action: 'crm.patient.exportCsv',
      clinic_id: ctx.clinic_id,
      count: patients.length,
      status_filter: parsed.data.status ?? null,
    },
    'patient.exportCsv.ok',
  )

  return ok({ csv, filename, count: patients.length })
}

// ── Cadastro avulso de paciente (cria LEAD com phase=lead) ──────────────────
//
// Espelha legacy "Novo Paciente" modal · cria LEAD via lead_create RPC com
// dados clinicos pre-preenchidos. Modelo excludente: promocao pra paciente
// real acontece via lead_to_paciente quando compareceu (workflow normal).
//
// Pattern: clinica precisa cadastrar paciente que ainda nao passou por
// appointment (ex: ja foi atendido em outro lugar, esta importando base).

const CreatePatientLeadSchema = z.object({
  // Identidade · obrigatorios espelham legacy required
  firstname: z.string().min(1, 'Nome é obrigatório').max(60),
  lastname: z.string().min(1, 'Sobrenome é obrigatório').max(60),
  phone: z
    .string()
    .min(8, 'Telefone curto')
    .regex(/^[0-9+()\-\s]+$/, 'Apenas números, espaços e parênteses'),
  email: z.string().email('Email inválido').max(160).nullable().optional().or(z.literal('')),
  sex: z.enum(['F', 'M', 'O', 'N'], { message: 'Sexo é obrigatório' }),
  cpf: z.string().min(1, 'CPF é obrigatório'),
  rg: z.string().nullable().optional().or(z.literal('')),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')
    .nullable()
    .optional()
    .or(z.literal('')),
  // Endereco · todos opcionais · viram address_json
  cep: z.string().nullable().optional().or(z.literal('')),
  rua: z.string().nullable().optional().or(z.literal('')),
  numero: z.string().nullable().optional().or(z.literal('')),
  complemento: z.string().nullable().optional().or(z.literal('')),
  bairro: z.string().nullable().optional().or(z.literal('')),
  cidade: z.string().nullable().optional().or(z.literal('')),
  uf: z.string().max(2).nullable().optional().or(z.literal('')),
  // Clinico · opcional · vai pra metadata
  procedimento: z.string().nullable().optional().or(z.literal('')),
  queixa: z.string().nullable().optional().or(z.literal('')),
  expectativas: z.string().nullable().optional().or(z.literal('')),
  notes: z.string().max(2000).nullable().optional().or(z.literal('')),
  // Atribuicao
  source: z.string().nullable().optional().or(z.literal('')),
  indicadoPor: z.string().nullable().optional().or(z.literal('')),
  utmCampaign: z.string().nullable().optional().or(z.literal('')),
})

export async function createPatientAsLeadAction(
  input: unknown,
): Promise<Result<{ leadId: string; existed: boolean }>> {
  const parsed = CreatePatientLeadSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const data = parsed.data

  // Validacao server-side adicional · CPF format (CHECK constraint v2)
  const cpfClean = unmaskCpf(data.cpf)
  if (!cpfClean || !isValidCpfFormat(cpfClean)) {
    return fail('invalid_cpf', { hint: 'CPF deve ter 11 dígitos numéricos' })
  }
  const rgClean = data.rg ? unmaskRg(data.rg) : ''

  // Phone normalize · 10/11 → prepend 55 (E.164-ish brasileiro)
  const phoneNormalized = normalizePhoneBR(data.phone) || data.phone

  const fullName = `${data.firstname.trim()} ${data.lastname.trim()}`.trim()

  // Address jsonb · so monta se houver pelo menos 1 campo
  const address: Record<string, string> = {}
  if (data.cep) address.cep = data.cep
  if (data.rua) address.rua = data.rua
  if (data.numero) address.numero = data.numero
  if (data.complemento) address.complemento = data.complemento
  if (data.bairro) address.bairro = data.bairro
  if (data.cidade) address.cidade = data.cidade
  if (data.uf) address.uf = data.uf

  // Metadata · clinico + atribuicao + dados que viram source_lead_meta na promocao
  const metadata: Record<string, unknown> = {
    cpf: cpfClean,
    sex: data.sex,
    fullForm: true, // marca origem · UI pode renderizar diferente leads completos
  }
  if (rgClean) metadata.rg = rgClean
  if (data.birthDate) metadata.birth_date = data.birthDate
  if (Object.keys(address).length) metadata.address = address
  if (data.procedimento) metadata.procedimento = data.procedimento
  if (data.queixa) metadata.queixa = data.queixa
  if (data.expectativas) metadata.expectativas = data.expectativas
  if (data.indicadoPor) metadata.indicado_por = data.indicadoPor
  if (data.utmCampaign) metadata.utm_campaign = data.utmCampaign
  if (data.notes) metadata.notes = data.notes

  const result = await repos.leads.createViaRpc({
    phone: phoneNormalized,
    name: fullName,
    email: data.email || null,
    source: (data.source as 'manual') || 'manual',
    sourceType: 'manual',
    metadata,
  })

  if (!result.ok) {
    log.warn(
      {
        action: 'crm.patient.createAsLead',
        clinic_id: ctx.clinic_id,
        phone_hash: hashPhone(phoneNormalized),
        error: result.error,
      },
      'patient.createAsLead.failed',
    )
    return fail(result.error)
  }

  log.info(
    {
      action: 'crm.patient.createAsLead',
      clinic_id: ctx.clinic_id,
      lead_id: result.leadId,
      existed: result.existed,
    },
    'patient.createAsLead.ok',
  )
  updateTag(CRM_TAGS.leads)
  return ok({ leadId: result.leadId, existed: result.existed })
}
