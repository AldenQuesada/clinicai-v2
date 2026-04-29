/**
 * mapTemplateRow · row snake_case da tabela wa_templates → TemplateDTO.
 */

import type { TemplateDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTemplateRow(row: any): TemplateDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id ?? ''),
    name: String(row.name ?? ''),
    message: row.message ?? null,
    content: row.content ?? null,
    category: row.category ?? null,
    triggerPhase: row.trigger_phase ?? null,
    type: row.type ?? null,
    day: row.day != null ? Number(row.day) : null,
    active: row.active !== false,
    isActive: row.is_active !== false,
    sortOrder: row.sort_order != null ? Number(row.sort_order) : null,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}
