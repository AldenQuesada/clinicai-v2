/**
 * ClinicRepository · acesso a `public.clinics`.
 *
 * Source unica pra dados operacionais da clinica (endereco, contato, redes,
 * horario). Lara injeta no system prompt pra responder "onde fica?", "que
 * horario abre?", "qual o whatsapp?" sem alucinar.
 *
 * Schema (referencia: memory/reference_clinic_data_source.md):
 *   id uuid · name · phone · whatsapp · email · website · description
 *   address jsonb { cep, rua, num, comp, bairro, cidade, estado, maps }
 *   social jsonb { instagram, facebook, tiktok, youtube, linkedin, google }
 *   fiscal jsonb { cnpj, ie, im, nfe, cnae, cnaes_secundarios, regime_tributario,
 *                  iss_pct, bancos: [{ banco, tipo, conta, agencia, titular, pix }] }
 *   operating_hours jsonb { dom, seg, ter, ... }
 *   settings jsonb
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClinicAddress {
  cep?: string
  rua?: string
  num?: string
  comp?: string
  bairro?: string
  cidade?: string
  estado?: string
  maps?: string
}

export interface ClinicSocial {
  instagram?: string
  facebook?: string
  tiktok?: string
  youtube?: string
  linkedin?: string
  google?: string
}

export interface ClinicHoursDay {
  aberto?: boolean
  manha?: { inicio?: string; fim?: string; ativo?: boolean }
  tarde?: { inicio?: string; fim?: string; ativo?: boolean }
}

export type ClinicHours = Partial<Record<'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab', ClinicHoursDay>>

/**
 * Copilot Context B (2026-05-07) · 1 banco da clinica · subset de
 * fiscal.bancos[]. Usado pra resolver Pix oficial sem inventar.
 */
export interface ClinicBank {
  banco?: string
  tipo?: string
  agencia?: string
  conta?: string
  titular?: string
  pix?: string
}

/**
 * Copilot Context B (2026-05-07) · subset tipado de fiscal jsonb.
 * Foco em campos consumiveis pelo Copilot · CNPJ + bancos pra Pix.
 * Outros campos (ie, im, nfe, cnae, regime_tributario, iss_pct,
 * cnaes_secundarios) ficam no jsonb mas nao tipados aqui.
 */
export interface ClinicFiscal {
  cnpj?: string
  bancos?: ClinicBank[]
}

export interface ClinicDTO {
  id: string
  name: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  description: string | null
  address: ClinicAddress | null
  social: ClinicSocial | null
  operatingHours: ClinicHours | null
  /**
   * P-08 (2026-04-29): nome do responsavel para exibicao em UIs
   * (ex: "Transferir para Dra. Mirian"). Fonte: `settings.responsible_name`
   * jsonb path. Null quando nao configurado · UI faz fallback generico.
   */
  responsibleName: string | null
  /**
   * Copilot Context B (2026-05-07) · path dedicado pra Pix · prioridade
   * `settings.pix_key` (futuro · admin UI vai popular ai) > primeiro
   * `fiscal.bancos[].pix` nao vazio (estado atual em prod). Null quando
   * nada cadastrado · IA responde "vou confirmar com a equipe".
   * NUNCA logar valor completo · so primeiros 3 + ultimos 3 chars.
   */
  pixKey: string | null
  /**
   * Copilot Context B (2026-05-07) · raw fiscal jsonb tipado parcialmente.
   * Bancos completos disponiveis aqui pra UIs admin · Copilot usa SO
   * `pixKey` resolvido acima · nao deve ler `fiscal.bancos` direto.
   */
  fiscal: ClinicFiscal | null
}

/**
 * Copilot Context B (2026-05-07) · resolve Pix oficial da clinica em
 * cascata · NUNCA inventa.
 *
 * Ordem:
 *   1. `settings.pix_key` · path admin canonico (futuro · UI vai popular)
 *   2. `fiscal.bancos[]` · primeiro banco com `pix` string nao vazia
 *      (estado atual em prod 2026-05-07 · auditoria confirmou Mirian
 *      tem 1 banco Sicredi com pix CNPJ).
 *
 * Retorna null se nada cadastrado · IA fica obrigada a responder "vou
 * confirmar a chave correta com a equipe" via fallback do prompt.
 */
function resolveClinicPixKey(args: {
  settingsPixKey?: unknown
  fiscalBancos?: unknown
}): string | null {
  // Path 1 · settings.pix_key · futuro
  if (typeof args.settingsPixKey === 'string') {
    const trimmed = args.settingsPixKey.trim()
    if (trimmed.length > 0) return trimmed
  }
  // Path 2 · fiscal.bancos[].pix · prod atual
  if (Array.isArray(args.fiscalBancos)) {
    for (const b of args.fiscalBancos) {
      if (b && typeof b === 'object') {
        const pix = (b as Record<string, unknown>).pix
        if (typeof pix === 'string' && pix.trim().length > 0) {
          return pix.trim()
        }
      }
    }
  }
  return null
}

/**
 * Copilot Context B (2026-05-07) · narrowing defensivo de fiscal jsonb.
 * Aceita o jsonb cru (unknown) e retorna ClinicFiscal so com campos
 * conhecidos preenchidos · nunca lança.
 */
function mapFiscal(raw: unknown): ClinicFiscal | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const cnpj = typeof r.cnpj === 'string' ? r.cnpj : undefined
  const bancos: ClinicBank[] | undefined = Array.isArray(r.bancos)
    ? r.bancos.map((b) => {
        const bb = (b ?? {}) as Record<string, unknown>
        return {
          banco: typeof bb.banco === 'string' ? bb.banco : undefined,
          tipo: typeof bb.tipo === 'string' ? bb.tipo : undefined,
          agencia: typeof bb.agencia === 'string' ? bb.agencia : undefined,
          conta: typeof bb.conta === 'string' ? bb.conta : undefined,
          titular: typeof bb.titular === 'string' ? bb.titular : undefined,
          pix: typeof bb.pix === 'string' ? bb.pix : undefined,
        }
      })
    : undefined
  if (!cnpj && !bancos) return null
  return { cnpj, bancos }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ClinicDTO {
  // settings jsonb · le responsible_name OU doctor_name OU profissional_responsavel
  // (3 chaves possiveis pra cobrir diferentes seeds historicos)
  const settings = (row.settings ?? {}) as Record<string, unknown>
  const responsibleName =
    (typeof settings.responsible_name === 'string' && settings.responsible_name) ||
    (typeof settings.doctor_name === 'string' && settings.doctor_name) ||
    (typeof settings.profissional_responsavel === 'string' && settings.profissional_responsavel) ||
    null

  // Copilot Context B (2026-05-07) · fiscal tipado + Pix em cascata
  const fiscal = mapFiscal(row.fiscal)
  const pixKey = resolveClinicPixKey({
    settingsPixKey: settings.pix_key,
    fiscalBancos: fiscal?.bancos,
  })

  return {
    id: String(row.id),
    name: String(row.name ?? 'Clínica'),
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    email: row.email ?? null,
    website: row.website ?? null,
    description: row.description ?? null,
    address: (row.address as ClinicAddress) ?? null,
    social: (row.social as ClinicSocial) ?? null,
    operatingHours: (row.operating_hours as ClinicHours) ?? null,
    responsibleName: responsibleName as string | null,
    pixKey,
    fiscal,
  }
}

export class ClinicRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async getById(clinicId: string): Promise<ClinicDTO | null> {
    const { data } = await this.supabase
      .from('clinics')
      .select(
        // Copilot Context B (2026-05-07) · adiciona `fiscal` ao SELECT pra
        // resolver Pix sem outra query · existing callers consomem ClinicDTO
        // com campo novo opcional · zero break.
        'id, name, phone, whatsapp, email, website, description, address, social, operating_hours, settings, fiscal',
      )
      .eq('id', clinicId)
      .maybeSingle()

    return data ? mapRow(data) : null
  }
}
