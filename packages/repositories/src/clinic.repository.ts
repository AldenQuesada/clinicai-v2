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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ClinicDTO {
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
  }
}

export class ClinicRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async getById(clinicId: string): Promise<ClinicDTO | null> {
    const { data } = await this.supabase
      .from('clinics')
      .select('id, name, phone, whatsapp, email, website, description, address, social, operating_hours')
      .eq('id', clinicId)
      .maybeSingle()

    return data ? mapRow(data) : null
  }
}
