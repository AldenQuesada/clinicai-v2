/**
 * Lookup/create/revive de lead + conversation usando Repositories (ADR-012).
 *
 * Phone variants: leads/conversations legacy podem ter sido salvos com 9 inicial
 * após DDD (Evolution) ou sem 9 (Cloud). phoneVariants() bate em ambas.
 *
 * Auto-revive: ConversationRepository.findActiveByPhoneVariants ja flipa
 * status='archived' -> 'active' antes de retornar (sem duplicata).
 *
 * Update path de nome (2026-05-05): quando lead/conversa já existem mas o
 * nome cadastrado é fraco (vazio · só dígitos · genérico), o webhook usa
 * `shouldUpdateName(current, pushName)` pra promover pushName válido a
 * `lead.name` / `wa_conversations.display_name`. Nome humano bom NUNCA é
 * sobrescrito por pushName posterior (que pode ser apelido/emoji).
 */

import {
  phoneVariants,
  canonicalPhoneBR,
  isGoodHumanName,
  shouldUpdateName,
} from '@clinicai/utils'
import { createLogger, hashPhone } from '@clinicai/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ConversationDTO,
  ConversationRepository,
  LeadDTO,
  LeadRepository,
} from '@clinicai/repositories'
import { isInternalWaNumber } from './internal-phone'

const log = createLogger({ app: 'lara' })

interface ResolveLeadOpts {
  leads: LeadRepository
  clinic_id: string
  phone: string
  pushName: string
  /**
   * Defesa em camadas (audit 2026-05-05): se fornecido, valida que phone
   * NÃO é um wa_number interno antes de criar lead. Webhooks já fazem
   * guard upstream (skip_internal_wa_number) · este é cinto + suspensório
   * pra callers diretos que possam pular o webhook (ex: testes, futuros
   * fluxos de import). Quando omitido, comportamento legacy (cria lead).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: SupabaseClient<any, any, any, any, any>
}

/**
 * Acha lead em qualquer variante · cria com phone CANONICAL (13c com 9).
 *
 * Estrategia robusta (espelha legacy Ivan):
 *   - LOOKUP usa phoneVariants() pra cobrir convs antigas em 12c
 *   - WRITE usa canonicalPhoneBR() · sempre 13c · zero ambiguidade
 *
 * Combinada com UNIQUE INDEX(clinic_id, last8digits) na DB, elimina
 * duplicates na origem · atomic guard.
 *
 * Update path (2026-05-05): se lead existente tem nome fraco e pushName é
 * bom, promove via `leads.updateName()` · proteção contra sobrescrever
 * cadastro humano via `shouldUpdateName`.
 */
export async function resolveLead(opts: ResolveLeadOpts): Promise<LeadDTO | null> {
  const { leads, clinic_id, phone, pushName, supabase } = opts
  const variants = phoneVariants(phone)

  const existing = await leads.findByPhoneVariants(clinic_id, variants)
  if (existing) {
    // Update path: pushName válido + nome atual fraco (vazio/numérico/genérico)
    if (shouldUpdateName(existing.name, pushName)) {
      const ok = await leads.updateName(existing.id, pushName.trim())
      if (ok) {
        const oldEmptyOrNumeric =
          existing.name == null ||
          existing.name.trim().length === 0 ||
          /^[\d\s+\-().]+$/.test(existing.name.trim())
        log.info(
          {
            lead_id: existing.id,
            reason: 'pushName_promoted',
            old_was_empty_or_numeric: oldEmptyOrNumeric,
            new_name_length: pushName.trim().length,
          },
          'lead.name.updated_from_pushName',
        )
        return { ...existing, name: pushName.trim() }
      }
      log.warn(
        { lead_id: existing.id },
        'lead.name.update_from_pushName.failed',
      )
    }
    return existing
  }

  // Defesa em camadas (audit 2026-05-05): bloqueia create se phone é interno.
  // Webhook já tem guard upstream · este protege callers que possam pular o
  // webhook (testes, imports, fluxos futuros). Sem supabase → skip check.
  if (supabase) {
    const internalCheck = await isInternalWaNumber(supabase, clinic_id, phone)
    if (internalCheck.internal) {
      log.warn(
        {
          clinic_id,
          phone_hash: hashPhone(phone),
          own_label: internalCheck.label,
          own_role: internalCheck.inboxRole,
          own_type: internalCheck.numberType,
          own_active: internalCheck.isActive,
        },
        'lead.create.blocked_internal_wa_number',
      )
      return null
    }
  }

  // Canonical no INSERT · garante 1 lead por nº fisico
  // Só usa pushName como name se for nome humano bom · senão deixa null
  // (DB tem default '' · evita salvar phone/lixo como name).
  const canonical = canonicalPhoneBR(phone) || phone
  const safeName = isGoodHumanName(pushName) ? pushName.trim() : null
  const created = await leads.create(clinic_id, {
    phone: canonical,
    name: safeName,
  })
  if (!created) {
    log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'lead.create.failed')
  }
  return created
}

interface ResolveConversationOpts {
  conversations: ConversationRepository
  clinic_id: string
  phone: string
  lead: LeadDTO
  pushName: string
  /**
   * Mig 91 · webhook resolve via wa_numbers_resolve_by_phone_number_id ·
   * passar pra criar conversation linkada ao numero certo (trigger sincroniza
   * inbox_role automaticamente).
   */
  waNumberId?: string | null
  /**
   * Defesa em camadas (audit 2026-05-05): se fornecido, valida que phone
   * NÃO é um wa_number interno antes de criar conversation NOVA. Conversas
   * existentes (legítimas ou herdadas) continuam sendo retornadas/atualizadas
   * normalmente · só bloqueia create.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: SupabaseClient<any, any, any, any, any>
}

export async function resolveConversation(
  opts: ResolveConversationOpts,
): Promise<ConversationDTO | null> {
  const { conversations, clinic_id, phone, lead, pushName, waNumberId, supabase } = opts
  const variants = phoneVariants(phone)

  // Mig 100/101 · busca scopeada por canal (waNumberId)
  // Cada wa_number tem sua conv com o paciente · admin/clínica que tem 2
  // canais (Lara IA + Secretaria humana) mantém 2 convs separadas pro
  // mesmo nº fisico. Sem este scope, conv "rodava" entre canais.
  let existing = waNumberId
    ? await conversations.findActiveByPhoneVariants(clinic_id, variants, waNumberId)
    : await conversations.findActiveByPhoneVariants(clinic_id, variants)

  // Fallback compat · conv legacy SEM wa_number_id quando webhook fornece um
  // (wa-inbound antiga não preenchia) → adota canal atual UMA vez.
  if (!existing && waNumberId) {
    const orphan = await conversations.findActiveByPhoneVariants(clinic_id, variants)
    if (orphan && !orphan.waNumberId) {
      const patched = await conversations.setWaNumber(orphan.id, waNumberId)
      if (patched) {
        log.info(
          { clinic_id, phone_hash: hashPhone(phone), conv_id: orphan.id, new_wn: waNumberId },
          'conversation.wa_number_id.adopted_orphan',
        )
        existing = patched
      }
    }
  }

  if (existing) {
    // Update path: pushName válido + display_name atual fraco
    if (shouldUpdateName(existing.displayName, pushName)) {
      const ok = await conversations.updateDisplayName(existing.id, pushName.trim())
      if (ok) {
        const oldEmptyOrNumeric =
          existing.displayName == null ||
          existing.displayName.trim().length === 0 ||
          /^[\d\s+\-().]+$/.test(existing.displayName.trim())
        log.info(
          {
            conversation_id: existing.id,
            reason: 'pushName_promoted',
            old_was_empty_or_numeric: oldEmptyOrNumeric,
            new_name_length: pushName.trim().length,
          },
          'conversation.display_name.updated_from_pushName',
        )
        return { ...existing, displayName: pushName.trim() }
      }
      log.warn(
        { conversation_id: existing.id },
        'conversation.display_name.update_from_pushName.failed',
      )
    }
    return existing
  }

  // Defesa em camadas (audit 2026-05-05): bloqueia create se phone é interno.
  // Existing conversations passam pela early-return acima · só protegemos
  // criação NOVA. Sem supabase → skip check.
  if (supabase) {
    const internalCheck = await isInternalWaNumber(supabase, clinic_id, phone)
    if (internalCheck.internal) {
      log.warn(
        {
          clinic_id,
          phone_hash: hashPhone(phone),
          own_label: internalCheck.label,
          own_role: internalCheck.inboxRole,
          own_type: internalCheck.numberType,
          own_active: internalCheck.isActive,
        },
        'conversation.create.blocked_internal_wa_number',
      )
      return null
    }
  }

  // Canonical no INSERT · ver comentário em resolveLead
  // Display name preference: pushName bom > lead.name bom > phone (fallback).
  // Nunca grava pushName ruim/lixo · isGoodHumanName protege contra emoji
  // puro, número, "WhatsApp User", etc.
  const canonical = canonicalPhoneBR(phone) || phone
  let initialDisplayName: string
  if (isGoodHumanName(pushName)) {
    initialDisplayName = pushName.trim()
  } else if (isGoodHumanName(lead.name)) {
    initialDisplayName = (lead.name as string).trim()
  } else {
    initialDisplayName = phone
  }
  const created = await conversations.create(clinic_id, {
    phone: canonical,
    leadId: lead.id,
    displayName: initialDisplayName,
    waNumberId: waNumberId ?? null,
  })
  if (!created) {
    log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'conversation.create.failed')
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
        textContent: '[audio recebido]',
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
