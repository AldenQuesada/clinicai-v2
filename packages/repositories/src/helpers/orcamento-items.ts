/**
 * Conversao OrcamentoItem (camelCase) → shape esperado pelas RPCs/INSERTs
 * (snake_case). Usado por LeadRepository.toOrcamento, AppointmentRepository
 * .finalize (orcamento outcome) e OrcamentoRepository.update.
 *
 * Reduz risco de divergir o shape em 3 lugares quando a coluna mudar.
 */

import type { OrcamentoItem } from '../types/dtos'

export function orcamentoItemsToDbShape(
  items: OrcamentoItem[],
): Array<Record<string, unknown>> {
  return items.map((it) => ({
    name: it.name,
    qty: it.qty,
    unit_price: it.unitPrice,
    subtotal: it.subtotal,
    ...(it.procedureCode ? { procedure_code: it.procedureCode } : {}),
  }))
}
