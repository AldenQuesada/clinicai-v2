'use server'

/**
 * Actions especificas da pagina de orcamentos (Camada 10).
 *
 * Reuso · single-state-machine actions (markSent/markApproved/markLost) vivem
 * em apps/lara/src/app/crm/_actions/orcamento.actions.ts (Camada 5). Aqui:
 *   - bulkMarkOrcamentosSentAction · loop seguro chamando markSent N vezes
 *   - bulkMarkOrcamentosApprovedAction · idem markApproved
 *   - bulkMarkOrcamentosLostAction · idem markLost com motivo unico (>=3 chars)
 *   - exportOrcamentosCsvAction · CSV com filtros aplicados, BOM UTF-8,
 *     resolucao de lead/patient/staff names, share_token expandido em URL.
 *
 * Pattern bulk: loop sequencial com try/catch por item. Retorno
 * `{updated, failed, total, failedIds}` · UI mostra toast consolidado.
 * Nenhum UPDATE direto novo · todas mutacoes via metodos canonicos do
 * OrcamentoRepository que ja existem.
 *
 * Cap de export: 5000 rows (mesmo limite de patients export).
 */

import { z } from 'zod'
import {
  CRM_TAGS,
  createLogger,
  fail,
  loadServerReposContext,
  ok,
  updateTag,
  zodFail,
  type Result,
} from '@/app/crm/_actions/shared'
import type { OrcamentoStatus } from '@clinicai/repositories'

const log = createLogger({ app: 'lara' })

// ── Constantes compartilhadas ───────────────────────────────────────────────

const VALID_STATUSES: ReadonlyArray<OrcamentoStatus> = [
  'draft',
  'sent',
  'viewed',
  'followup',
  'negotiation',
  'approved',
  'lost',
]

/** Cap defensivo de IDs por chamada bulk · alinhado com page-size 50 + headroom */
const BULK_MAX = 500

/** Cap de linhas no export CSV · acima disso, clinica deve filtrar por periodo */
const EXPORT_MAX = 5000

// ── Schemas ─────────────────────────────────────────────────────────────────

const BulkIdsSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, 'Selecione ao menos 1 orçamento')
    .max(BULK_MAX, `Selecione no máximo ${BULK_MAX} orçamentos por vez`),
})

const BulkLostSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, 'Selecione ao menos 1 orçamento')
    .max(BULK_MAX, `Selecione no máximo ${BULK_MAX} orçamentos por vez`),
  reason: z
    .string()
    .min(3, 'Motivo obrigatório (mín. 3 caracteres)')
    .max(500),
})

const ExportSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.string().max(40).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
})

// ── Tipos de retorno ────────────────────────────────────────────────────────

export interface BulkOrcamentoResult {
  updated: number
  failed: number
  total: number
  failedIds: string[]
}

// ── Helpers internos ────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

const STATUS_LABEL: Record<OrcamentoStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  viewed: 'Visualizado',
  followup: 'Follow-up',
  negotiation: 'Negociação',
  approved: 'Aprovado',
  lost: 'Perdido',
}

function formatPhoneForCsv(phone: string | null): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }
  return phone
}

function formatBrlForCsv(value: number): string {
  // pt-BR usa virgula decimal · sem milhar pra simplificar parse em Excel
  return value.toFixed(2).replace('.', ',')
}

function formatIsoForCsv(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

// ── 1. bulkMarkOrcamentosSentAction · loop markSent ─────────────────────────

export async function bulkMarkOrcamentosSentAction(
  input: unknown,
): Promise<Result<BulkOrcamentoResult>> {
  const parsed = BulkIdsSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const { ids } = parsed.data

  const uniqueIds = Array.from(new Set(ids))
  const failedIds: string[] = []
  let updated = 0

  for (const orcamentoId of uniqueIds) {
    try {
      const dto = await repos.orcamentos.markSent(orcamentoId)
      if (dto) {
        updated++
      } else {
        failedIds.push(orcamentoId)
        log.warn(
          {
            action: 'crm.orc.bulkMarkSent',
            clinic_id: ctx.clinic_id,
            orcamento_id: orcamentoId,
          },
          'orc.bulkMarkSent.itemFailed',
        )
      }
    } catch (err) {
      failedIds.push(orcamentoId)
      log.error(
        {
          action: 'crm.orc.bulkMarkSent',
          clinic_id: ctx.clinic_id,
          orcamento_id: orcamentoId,
          err: err instanceof Error ? err.message : String(err),
        },
        'orc.bulkMarkSent.itemException',
      )
    }
  }

  log.info(
    {
      action: 'crm.orc.bulkMarkSent',
      clinic_id: ctx.clinic_id,
      total: uniqueIds.length,
      updated,
      failed: failedIds.length,
    },
    'orc.bulkMarkSent.ok',
  )

  updateTag(CRM_TAGS.orcamentos)
  return ok({
    updated,
    failed: failedIds.length,
    total: uniqueIds.length,
    failedIds,
  })
}

// ── 2. bulkMarkOrcamentosApprovedAction · loop markApproved ─────────────────

export async function bulkMarkOrcamentosApprovedAction(
  input: unknown,
): Promise<Result<BulkOrcamentoResult>> {
  const parsed = BulkIdsSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const { ids } = parsed.data

  const uniqueIds = Array.from(new Set(ids))
  const failedIds: string[] = []
  let updated = 0

  for (const orcamentoId of uniqueIds) {
    try {
      const dto = await repos.orcamentos.markApproved(orcamentoId)
      if (dto) {
        updated++
      } else {
        failedIds.push(orcamentoId)
        log.warn(
          {
            action: 'crm.orc.bulkMarkApproved',
            clinic_id: ctx.clinic_id,
            orcamento_id: orcamentoId,
          },
          'orc.bulkMarkApproved.itemFailed',
        )
      }
    } catch (err) {
      failedIds.push(orcamentoId)
      log.error(
        {
          action: 'crm.orc.bulkMarkApproved',
          clinic_id: ctx.clinic_id,
          orcamento_id: orcamentoId,
          err: err instanceof Error ? err.message : String(err),
        },
        'orc.bulkMarkApproved.itemException',
      )
    }
  }

  log.info(
    {
      action: 'crm.orc.bulkMarkApproved',
      clinic_id: ctx.clinic_id,
      total: uniqueIds.length,
      updated,
      failed: failedIds.length,
    },
    'orc.bulkMarkApproved.ok',
  )

  updateTag(CRM_TAGS.orcamentos)
  return ok({
    updated,
    failed: failedIds.length,
    total: uniqueIds.length,
    failedIds,
  })
}

// ── 3. bulkMarkOrcamentosLostAction · loop markLost (motivo unico) ──────────

export async function bulkMarkOrcamentosLostAction(
  input: unknown,
): Promise<Result<BulkOrcamentoResult>> {
  const parsed = BulkLostSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const { ids, reason } = parsed.data

  const uniqueIds = Array.from(new Set(ids))
  const failedIds: string[] = []
  let updated = 0
  const trimmedReason = reason.trim()

  for (const orcamentoId of uniqueIds) {
    try {
      const dto = await repos.orcamentos.markLost(orcamentoId, trimmedReason)
      if (dto) {
        updated++
      } else {
        failedIds.push(orcamentoId)
        log.warn(
          {
            action: 'crm.orc.bulkMarkLost',
            clinic_id: ctx.clinic_id,
            orcamento_id: orcamentoId,
          },
          'orc.bulkMarkLost.itemFailed',
        )
      }
    } catch (err) {
      failedIds.push(orcamentoId)
      log.error(
        {
          action: 'crm.orc.bulkMarkLost',
          clinic_id: ctx.clinic_id,
          orcamento_id: orcamentoId,
          err: err instanceof Error ? err.message : String(err),
        },
        'orc.bulkMarkLost.itemException',
      )
    }
  }

  log.info(
    {
      action: 'crm.orc.bulkMarkLost',
      clinic_id: ctx.clinic_id,
      total: uniqueIds.length,
      updated,
      failed: failedIds.length,
      reason_len: trimmedReason.length,
    },
    'orc.bulkMarkLost.ok',
  )

  updateTag(CRM_TAGS.orcamentos)
  return ok({
    updated,
    failed: failedIds.length,
    total: uniqueIds.length,
    failedIds,
  })
}

// ── 4. exportOrcamentosCsvAction · respeita filtros do URL ──────────────────
//
// Reutiliza `repos.orcamentos.list()` com os mesmos parametros que /crm/orcamentos
// page.tsx · cap fixo de EXPORT_MAX rows. Resolve nomes via findByIds em batch
// (lead + patient + staff). share_token vira URL completa.
//
// NAO inclui notes/payments (PII / dados financeiros sensiveis fora do escopo
// da listagem).

export async function exportOrcamentosCsvAction(
  input: unknown,
): Promise<
  Result<{ csv: string; filename: string; count: number; truncated: boolean }>
> {
  const parsed = ExportSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()

  const search = (parsed.data.q ?? '').trim()
  const statusParam = (parsed.data.status ?? '').trim()
  const createdFrom = (parsed.data.from ?? '').trim()
  const createdTo = (parsed.data.to ?? '').trim()

  const status =
    statusParam !== '' && statusParam !== 'open'
      ? VALID_STATUSES.includes(statusParam as OrcamentoStatus)
        ? (statusParam as OrcamentoStatus)
        : undefined
      : undefined
  const openOnly = statusParam === 'open'

  const rows = await repos.orcamentos
    .list(ctx.clinic_id, {
      limit: EXPORT_MAX,
      offset: 0,
      status,
      openOnly,
      search: search.length > 0 ? search : undefined,
      createdFrom: createdFrom.length > 0 ? createdFrom : undefined,
      createdTo: createdTo.length > 0 ? createdTo : undefined,
    })
    .catch(() => [])

  if (rows.length === 0) {
    log.warn(
      {
        action: 'crm.orc.exportCsv',
        clinic_id: ctx.clinic_id,
        status_filter: statusParam || null,
      },
      'orc.exportCsv.empty',
    )
    return fail('empty_export')
  }

  // Resolve nomes em batch · evita N+1 query
  const leadIds = Array.from(
    new Set(rows.map((r) => r.leadId).filter((v): v is string => !!v)),
  )
  const patientIds = Array.from(
    new Set(rows.map((r) => r.patientId).filter((v): v is string => !!v)),
  )

  const [leadsMap, patientsMap, staffResult] = await Promise.all([
    leadIds.length
      ? repos.leads.findByIds(ctx.clinic_id, leadIds).catch(() => new Map())
      : Promise.resolve(new Map()),
    patientIds.length
      ? repos.patients.findByIds(ctx.clinic_id, patientIds).catch(() => new Map())
      : Promise.resolve(new Map()),
    repos.users.listStaff().catch(() => ({ ok: false, data: null, error: 'staff_failed' })),
  ])

  const staffMap = new Map<string, string>()
  if (staffResult.ok && Array.isArray(staffResult.data)) {
    for (const s of staffResult.data) {
      const fullName = `${s.firstName} ${s.lastName}`.trim()
      staffMap.set(s.id, fullName || s.email || s.id.slice(0, 8))
    }
  }

  // Base URL · server-side (sem window). Same envs do cron orcamento-followup.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'https://lara.miriandpaula.com.br'

  // CSV header · pt-BR Excel-friendly (sep=';')
  const sep = ';'
  const header = [
    'ID',
    'Criado em',
    'Lead',
    'Paciente',
    'Telefone',
    'Status',
    'Valor total',
    'Valor aprovado',
    'Vendedor',
    'Link público',
  ]
    .map(csvEscape)
    .join(sep)

  const lines = rows.map((o) => {
    const lead = o.leadId ? leadsMap.get(o.leadId) : null
    const patient = o.patientId ? patientsMap.get(o.patientId) : null

    const leadName = lead?.name ?? (o.leadId ? `Lead ${o.leadId.slice(0, 8)}` : '')
    const patientName =
      patient?.name ?? (o.patientId ? `Paciente ${o.patientId.slice(0, 8)}` : '')
    const phone = formatPhoneForCsv(patient?.phone ?? lead?.phone ?? null)

    const vendedor = o.createdBy ? (staffMap.get(o.createdBy) ?? '') : ''

    const shareUrl = o.shareToken ? `${baseUrl}/orcamento/${o.shareToken}` : ''

    const valorAprovado = o.status === 'approved' ? formatBrlForCsv(o.total) : ''

    return [
      o.id.slice(0, 8),
      formatIsoForCsv(o.createdAt),
      leadName,
      patientName,
      phone,
      STATUS_LABEL[o.status] ?? o.status,
      formatBrlForCsv(o.total),
      valorAprovado,
      vendedor,
      shareUrl,
    ]
      .map(csvEscape)
      .join(sep)
  })

  // BOM UTF-8 · Excel BR abre acentos corretamente
  const csv = '﻿' + header + '\n' + lines.join('\n')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `orcamentos-${today}.csv`
  const truncated = rows.length >= EXPORT_MAX

  log.info(
    {
      action: 'crm.orc.exportCsv',
      clinic_id: ctx.clinic_id,
      count: rows.length,
      truncated,
      status_filter: statusParam || null,
      has_search: search.length > 0,
      has_date_range: createdFrom.length > 0 || createdTo.length > 0,
    },
    'orc.exportCsv.ok',
  )

  return ok({
    csv,
    filename,
    count: rows.length,
    truncated,
  })
}
