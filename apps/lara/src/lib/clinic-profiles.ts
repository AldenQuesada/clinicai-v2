/**
 * Clinic profiles · IDs canônicos de profissionais da clínica Mirian de Paula.
 *
 * Hardcoded NESTA etapa (Alden 2026-05-05): a V2 é single-tenant em produção
 * (clínica Mirian). Quando virar multi-tenant, transformar em lookup por
 * `profiles.role + clinic_id` ou em preferência por usuário.
 *
 * Uso:
 *   - SLA Dra · contagem de fila Dra (KPI no /conversas + /secretaria)
 *   - "Transferir para Dra" · alvo do POST /api/conversations/[id]/assign
 *   - Default de tab no inbox por usuário (Mirian → 'Dra', demais → 'Todas')
 *
 * Não usar pra autorização/RBAC · isso vive em packages/repositories/profiles
 * + helpers de @/lib/permissions. Aqui é só "qual user_id é a doutora deste
 * clinic" · é uma escolha operacional, não de segurança.
 */

/** Dra. Mirian de Paula · owner do clinic 00000000-0000-0000-0000-000000000001 */
export const DOCTOR_USER_ID = '20289f86-0895-403d-a19e-c24ac87e85a0'

/** Luciana Ruiz · secretária/recepcionista (referência futura · não usada em
    runtime hoje · mantido aqui pra histórico operacional) */
export const SECRETARY_USER_ID = '9f1a1468-4315-4f5b-9588-0113d56982d2'

/** True se o user_id é o profissional médico (a Dra). Usado por:
 *   - default tab no inbox
 *   - decisão de mostrar botão "Devolver para Secretária"
 */
export function isDoctor(userId: string | null | undefined): boolean {
  return !!userId && userId === DOCTOR_USER_ID
}

/** True se a conversa está atribuída à Dra (entrou na fila Dra). */
export function isAssignedToDoctor(assignedTo: string | null | undefined): boolean {
  return !!assignedTo && assignedTo === DOCTOR_USER_ID
}
