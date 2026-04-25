/**
 * Lookup/create/revive de lead + conversation usando Repositories (ADR-012).
 *
 * Phone variants: leads/conversations legacy podem ter sido salvos com 9 inicial
 * após DDD (Evolution) ou sem 9 (Cloud). phoneVariants() bate em ambas.
 *
 * Auto-revive: ConversationRepository.findActiveByPhoneVariants ja flipa
 * status='archived' -> 'active' antes de retornar (sem duplicata).
 */

import { phoneVariants } from '@clinicai/utils'
import { createLogger, hashPhone } from '@clinicai/logger'
import type {
  ConversationDTO,
  ConversationRepository,
  LeadDTO,
  LeadRepository,
} from '@clinicai/repositories'

const log = createLogger({ app: 'lara' })

interface ResolveLeadOpts {
  leads: LeadRepository
  clinic_id: string
  phone: string
  pushName: string
}

/**
 * Acha lead em qualquer variante · cria se nao existe.
 */
export async function resolveLead(opts: ResolveLeadOpts): Promise<LeadDTO | null> {
  const { leads, clinic_id, phone, pushName } = opts
  const variants = phoneVariants(phone)

  const existing = await leads.findByPhoneVariants(clinic_id, variants)
  if (existing) return existing

  const created = await leads.create(clinic_id, {
    phone,
    name: pushName || null,
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
}

export async function resolveConversation(
  opts: ResolveConversationOpts,
): Promise<ConversationDTO | null> {
  const { conversations, clinic_id, phone, lead, pushName } = opts
  const variants = phoneVariants(phone)

  const existing = await conversations.findActiveByPhoneVariants(clinic_id, variants)
  if (existing) return existing

  const created = await conversations.create(clinic_id, {
    phone,
    leadId: lead.id,
    displayName: pushName || lead.name || phone,
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
