/**
 * mapOrcamentoRow · row snake_case da tabela orcamentos → OrcamentoDTO.
 * mapOrcamentoItem (interno) normaliza items[] que podem vir snake OU camel
 * (UI legada vs nova).
 */

import type { OrcamentoStatus } from '../types/enums'
import type {
  OrcamentoDTO,
  OrcamentoItem,
  OrcamentoPayment,
} from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrcamentoItem(raw: any): OrcamentoItem {
  return {
    name: String(raw?.name ?? ''),
    qty: Number(raw?.qty ?? 0),
    unitPrice: Number(raw?.unit_price ?? raw?.unitPrice ?? 0),
    subtotal: Number(raw?.subtotal ?? 0),
    procedureCode: raw?.procedure_code ?? raw?.procedureCode ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOrcamentoRow(row: any): OrcamentoDTO {
  const itemsRaw = Array.isArray(row.items) ? row.items : []
  const paymentsRaw = Array.isArray(row.payments) ? row.payments : []
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    leadId: row.lead_id ?? null,
    patientId: row.patient_id ?? null,
    number: row.number ?? null,
    title: row.title ?? null,
    notes: row.notes ?? null,
    items: itemsRaw.map(mapOrcamentoItem),
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    total: Number(row.total ?? 0),
    status: (row.status ?? 'draft') as OrcamentoStatus,
    sentAt: row.sent_at ?? null,
    viewedAt: row.viewed_at ?? null,
    approvedAt: row.approved_at ?? null,
    lostAt: row.lost_at ?? null,
    lostReason: row.lost_reason ?? null,
    validUntil: row.valid_until ?? null,
    payments: paymentsRaw as OrcamentoPayment[],
    shareToken: row.share_token ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}
