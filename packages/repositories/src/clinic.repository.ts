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
 *   fiscal jsonb { cnpj, ie, im, ... }
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
  }
}

export class ClinicRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async getById(clinicId: string): Promise<ClinicDTO | null> {
    const { data } = await this.supabase
      .from('clinics')
      .select('id, name, phone, whatsapp, email, website, description, address, social, operating_hours, settings')
      .eq('id', clinicId)
      .maybeSingle()

    return data ? mapRow(data) : null
  }
}
