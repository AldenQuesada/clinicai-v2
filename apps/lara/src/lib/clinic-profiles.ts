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

/** Dr. Alden Quesada · owner do clinic. Onda 3 (2026-05-08) · adicionado como
    dono operacional separado da Mirian na fila Secretaria. View
    wa_conversations_operational_view (mig 146) reconhece via UUID puro ·
    NUNCA via LIKE de nome (homonimo · risco). KPI/aba/transfer separados. */
export const ALDEN_USER_ID = '06757b9f-2a03-43ae-bd37-28021eb6afeb'

/** True se o user_id é o profissional médico (a Dra). Usado por:
 *   - default tab no inbox
 *   - decisão de mostrar botão "Devolver para Secretária"
 *
 * Onda 3 NÃO inclui Alden aqui · "Dra" continua significando Mirian (decisão
 * de produto · is_dra na view tambem fica Mirian-only). Pra checar se eh
 * qualquer dono operacional (Mirian OU Alden), usar isOperationalOwner.
 */
export function isDoctor(userId: string | null | undefined): boolean {
  return !!userId && userId === DOCTOR_USER_ID
}

/** True se a conversa está atribuída à Dra (entrou na fila Dra). */
export function isAssignedToDoctor(assignedTo: string | null | undefined): boolean {
  return !!assignedTo && assignedTo === DOCTOR_USER_ID
}

/** True se a conversa esta atribuida ao Dr Alden (entrou na fila Alden ·
    operational_owner='alden' na view). */
export function isAssignedToAlden(assignedTo: string | null | undefined): boolean {
  return !!assignedTo && assignedTo === ALDEN_USER_ID
}

/** True se assigned_to eh um dono operacional canonico (Mirian OU Alden) ·
    util pra UI que precisa diferenciar "tem dono medico" vs "fila Secretaria". */
export function isOperationalOwner(assignedTo: string | null | undefined): boolean {
  return !!assignedTo && (assignedTo === DOCTOR_USER_ID || assignedTo === ALDEN_USER_ID)
}
