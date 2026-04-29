'use server'

/**
 * Server Actions · /configuracoes/clinica.
 *
 * Wrappers em volta da RPC `update_clinic_settings` · port 1:1 do
 * clinic-dashboard/js/services/clinic-settings.service.js + repository.
 * Cada action faz `requireAction(role, 'settings:edit')` no comeco.
 *
 * Owner-only fields (name, fiscal) sao zerados no payload quando a usuaria
 * nao tem `settings:clinic-data` (mesma logica do legacy linhas 240-244).
 *
 * Merge JSONB · enviamos somente o que ja vinha do form · campos vazios
 * viram null e a RPC preserva o que ja existe via operador `||`.
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'
import { requireAction, can } from '@/lib/permissions'
import type {
  ClinicSettingsData,
  ClinicSettingsRow,
  HorariosMap,
} from './types'

const ROUTE = '/configuracoes/clinica'

// ── Helpers ──────────────────────────────────────────────────────────────

/** Remove chaves vazias · port de _compactObj (service.js linhas 39-48). */
function compactObj<T extends Record<string, unknown>>(obj: T): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v === '') continue
    out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/**
 * Converte estado do form (rico) pro payload Supabase · port _toSupabase
 * (service.js linhas 111-175). Os jsonb ricos vao em `settings`.
 */
function toSupabasePayload(data: ClinicSettingsData) {
  return {
    name: data.nome || null,
    phone: data.telefone || null,
    whatsapp: data.whatsapp || null,
    email: data.email || null,
    website: data.site || null,
    description: data.descricao || null,
    address: compactObj({
      cep: data.cep,
      rua: data.rua,
      num: data.num,
      comp: data.comp,
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado,
      maps: data.maps,
    }),
    social: compactObj({
      instagram: data.instagram,
      facebook: data.facebook,
      tiktok: data.tiktok,
      youtube: data.youtube,
      linkedin: data.linkedin,
      google: data.google,
    }),
    fiscal: compactObj({
      cnpj: data.cnpj,
      ie: data.ie,
      im: data.im,
      cnae: data.cnae,
      regime_tributario: data.regime_tributario,
      iss_pct: data.iss_pct,
      nfe: data.nfe,
      cnaes_secundarios: data.cnaes_secundarios,
      bancos: data.bancos,
    }),
    operating_hours: data.horarios || null,
    settings: compactObj({
      tipo: data.tipo,
      especialidade: data.especialidade,
      funcionarios: data.funcionarios,
      data_fundacao: data.data_fundacao,
      cardapio: data.cardapio,
      duracao_padrao: data.duracao_padrao,
      intervalo_consulta: data.intervalo_consulta,
      antecedencia_min: data.antecedencia_min,
      limite_agendamento: data.limite_agendamento,
      politica_cancelamento: data.politica_cancelamento,
      termos_consentimento: data.termos_consentimento,
      msg_boas_vindas: data.msg_boas_vindas,
      fuso_horario: data.fuso_horario || 'America/Sao_Paulo',
      moeda: data.moeda || 'BRL',
      formato_data: data.formato_data || 'dd/MM/yyyy',
      observacoes_internas: data.observacoes_internas,
      notif_confirmacao: !!data.notif_confirmacao,
      notif_lembrete24: !!data.notif_lembrete24,
      notif_lembrete1h: !!data.notif_lembrete1h,
      responsaveis: data.responsaveis || [],
      cores: data.cores || [],
      logos: data.logos || [],
    }),
  }
}

// ── load ─────────────────────────────────────────────────────────────────

/**
 * Le settings da clinica via RPC · port _fromSupabase + load() do service.
 * Retorna o objeto ja desserializado pro shape do form (camelCase legacy).
 */
export async function loadClinicSettingsAction(): Promise<{
  ok: boolean
  data: ClinicSettingsData | null
  error: string | null
}> {
  try {
    const { supabase } = await loadServerReposContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_clinic_settings')
    if (error) {
      return { ok: false, data: null, error: error.message || String(error) }
    }
    const row = (data as ClinicSettingsRow) || {}
    return { ok: true, data: fromSupabaseRow(row), error: null }
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message }
  }
}

/** Port _fromSupabase (service.js linhas 60-108) sem o ...settings spread (mantemos explicito). */
function fromSupabaseRow(row: ClinicSettingsRow): ClinicSettingsData {
  const addr = row.address || {}
  const social = row.social || {}
  const fiscal = row.fiscal || {}
  const settings = row.settings || {}
  const hours = (row.operating_hours || {}) as HorariosMap

  return {
    // colunas proprias
    nome: row.name || '',
    telefone: row.phone || '',
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    site: row.website || '',
    descricao: row.description || '',
    // endereco
    cep: addr.cep || '',
    rua: addr.rua || '',
    num: addr.num || '',
    comp: addr.comp || '',
    bairro: addr.bairro || '',
    cidade: addr.cidade || '',
    estado: addr.estado || '',
    maps: addr.maps || '',
    // redes
    instagram: social.instagram || '',
    facebook: social.facebook || '',
    tiktok: social.tiktok || '',
    youtube: social.youtube || '',
    linkedin: social.linkedin || '',
    google: social.google || '',
    // fiscal
    cnpj: fiscal.cnpj || '',
    ie: fiscal.ie || '',
    im: fiscal.im || '',
    cnae: fiscal.cnae || '',
    regime_tributario: fiscal.regime_tributario || '',
    iss_pct: fiscal.iss_pct || '',
    nfe: fiscal.nfe || '',
    cnaes_secundarios: fiscal.cnaes_secundarios || [],
    bancos: fiscal.bancos || [],
    // horarios
    horarios: hours,
    // jsonb settings · spread explicito por chave conhecida
    tipo: settings.tipo || '',
    especialidade: settings.especialidade || '',
    funcionarios: settings.funcionarios || '',
    data_fundacao: settings.data_fundacao || '',
    cardapio: settings.cardapio || '',
    duracao_padrao: settings.duracao_padrao || '',
    intervalo_consulta: settings.intervalo_consulta || '',
    antecedencia_min: settings.antecedencia_min ?? '',
    limite_agendamento: settings.limite_agendamento ?? '',
    politica_cancelamento: settings.politica_cancelamento || '',
    termos_consentimento: settings.termos_consentimento || '',
    msg_boas_vindas: settings.msg_boas_vindas || '',
    fuso_horario: settings.fuso_horario || 'America/Sao_Paulo',
    moeda: settings.moeda || 'BRL',
    formato_data: settings.formato_data || 'dd/MM/yyyy',
    observacoes_internas: settings.observacoes_internas || '',
    notif_confirmacao: !!settings.notif_confirmacao,
    notif_lembrete24: !!settings.notif_lembrete24,
    notif_lembrete1h: !!settings.notif_lembrete1h,
    responsaveis: settings.responsaveis || [],
    cores: settings.cores || [],
    logos: settings.logos || [],
  }
}

// ── save ─────────────────────────────────────────────────────────────────

export interface SaveClinicResult {
  ok: boolean
  error?: string
  updatedAt?: string
}

/**
 * Salva configuracoes via RPC update_clinic_settings.
 * Valida `settings:edit` antes · zera campos owner-only se faltar
 * `settings:clinic-data` (port linhas 238-243 do service.js).
 */
export async function saveClinicSettingsAction(
  data: ClinicSettingsData,
): Promise<SaveClinicResult> {
  const { ctx, supabase } = await loadServerReposContext()
  requireAction(ctx.role, 'settings:edit')

  const payload = toSupabasePayload(data)

  // Owner-only gate · nao-owners nao podem mexer em nome/fiscal
  if (!can(ctx.role, 'settings:clinic-data')) {
    payload.name = null
    payload.fiscal = null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (supabase as any).rpc('update_clinic_settings', {
    p_name: payload.name,
    p_phone: payload.phone,
    p_whatsapp: payload.whatsapp,
    p_email: payload.email,
    p_website: payload.website,
    p_description: payload.description,
    p_address: payload.address,
    p_social: payload.social,
    p_fiscal: payload.fiscal,
    p_operating_hours: payload.operating_hours,
    p_settings: payload.settings,
  })

  if (error) {
    return { ok: false, error: error.message || String(error) }
  }

  revalidatePath(ROUTE)
  revalidatePath('/configuracoes')
  revalidatePath('/configuracoes')

  const updatedAt =
    result && typeof result === 'object' && 'updated_at' in result
      ? String((result as { updated_at?: unknown }).updated_at || '')
      : undefined

  return { ok: true, updatedAt }
}
