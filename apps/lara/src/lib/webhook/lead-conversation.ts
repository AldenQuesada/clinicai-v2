/**
 * Lookup/create/revive de lead + conversation com phone variants.
 *
 * Phone variants: leads e conversations legacy podem ter sido salvos com 9 inicial
 * após DDD (Evolution) ou sem 9 (Cloud). phoneVariants() retorna ambas as formas
 * pra casar com qualquer um dos formatos.
 *
 * Auto-revive: se conversation está archived (mergeada por dedup ou arquivada
 * manualmente), reativa quando paciente volta a falar · não cria duplicata.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants } from '@clinicai/utils'
import { createLogger, hashPhone } from '@clinicai/logger'
import { v4 as uuidv4 } from 'uuid'

const log = createLogger({ app: 'lara' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Lead = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Conversation = any

interface ResolveLeadOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  clinic_id: string
  phone: string
  pushName: string
}

/**
 * Acha lead existente em qualquer variante de telefone · cria se não existe.
 * Retorna null se falhou (caller deve abortar processamento).
 */
export async function resolveLead(opts: ResolveLeadOpts): Promise<Lead | null> {
  const { supabase, clinic_id, phone, pushName } = opts
  const variants = phoneVariants(phone)

  const { data: existing } = await supabase
    .from('leads')
    .select('*')
    .in('phone', variants)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from('leads')
    .insert({
      id: uuidv4(),
      clinic_id,
      phone,
      name: pushName || null,
      phase: 'lead',
      temperature: 'warm',
      ai_persona: 'onboarder',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    log.error({ clinic_id, phone_hash: hashPhone(phone), err: error.message }, 'lead.create.failed')
    return null
  }
  return created
}

interface ResolveConversationOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  clinic_id: string
  phone: string
  lead: Lead
  pushName: string
}

/**
 * Acha conversation ativa/pausada/archived (auto-revive) em qualquer variante.
 * Cria nova se nada encontrado. Retorna null se falhou.
 */
export async function resolveConversation(opts: ResolveConversationOpts): Promise<Conversation | null> {
  const { supabase, clinic_id, phone, lead, pushName } = opts
  const variants = phoneVariants(phone)

  // Busca em status amplo · 'archived' incluso pra recuperar histórico mergeado
  const { data: existing } = await supabase
    .from('wa_conversations')
    .select('*')
    .in('phone', variants)
    .in('status', ['active', 'paused', 'archived'])
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Auto-revive · paciente arquivada voltou a falar
    if (existing.status === 'archived') {
      await supabase
        .from('wa_conversations')
        .update({ status: 'active', ai_enabled: true })
        .eq('id', existing.id)
      existing.status = 'active'
      existing.ai_enabled = true
      log.info({ clinic_id, phone_hash: hashPhone(phone), conv_id: existing.id }, 'conversation.revived')
    }
    return existing
  }

  const { data: created, error } = await supabase
    .from('wa_conversations')
    .insert({
      id: uuidv4(),
      clinic_id,
      phone,
      lead_id: lead.id,
      display_name: pushName || lead.name || phone,
      status: 'active',
      ai_enabled: true,
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    log.error({ clinic_id, phone_hash: hashPhone(phone), err: error.message }, 'conversation.create.failed')
    return null
  }
  return created
}

/**
 * Extrai content type + texto + mediaId do payload Meta.
 * Texto vira placeholder pra mídia · será substituído por transcrição/caption.
 */
export interface ExtractedContent {
  contentType: string
  textContent: string
  mediaId: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractContent(message: any): ExtractedContent {
  const contentType = message.type || 'text'

  switch (contentType) {
    case 'text':
      return { contentType, textContent: message.text?.body || '', mediaId: null }
    case 'image':
      return {
        contentType,
        textContent: message.image?.caption || '[imagem recebida]',
        mediaId: message.image?.id || null,
      }
    case 'audio':
      return {
        contentType,
        textContent: '[audio recebido]', // placeholder · substituído por transcrição
        mediaId: message.audio?.id || null,
      }
    case 'video':
      return {
        contentType,
        textContent: '[video recebido]',
        mediaId: message.video?.id || null,
      }
    case 'sticker':
      return {
        contentType,
        textContent: '[sticker recebido]',
        mediaId: message.sticker?.id || null,
      }
    default:
      return { contentType, textContent: `[${contentType} recebido]`, mediaId: null }
  }
}
