/**
 * Lookup/create/revive de lead + conversation usando Repositories (ADR-012).
 *
 * Phone variants: leads/conversations legacy podem ter sido salvos com 9 inicial
 * após DDD (Evolution) ou sem 9 (Cloud). phoneVariants() bate em ambas.
 *
 * Auto-revive: ConversationRepository.findActiveByPhoneVariants ja flipa
 * status='archived' -> 'active' antes de retornar (sem duplicata).
 */

import { phoneVariants, canonicalPhoneBR } from '@clinicai/utils'
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
 * Acha lead em qualquer variante · cria com phone CANONICAL (13c com 9).
 *
 * Estrategia robusta (espelha legacy Ivan):
 *   - LOOKUP usa phoneVariants() pra cobrir convs antigas em 12c
 *   - WRITE usa canonicalPhoneBR() · sempre 13c · zero ambiguidade
 *
 * Combinada com UNIQUE INDEX(clinic_id, last8digits) na DB, elimina
 * duplicates na origem · atomic guard.
 */
export async function resolveLead(opts: ResolveLeadOpts): Promise<LeadDTO | null> {
  const { leads, clinic_id, phone, pushName } = opts
  const variants = phoneVariants(phone)

  const existing = await leads.findByPhoneVariants(clinic_id, variants)
  if (existing) return existing

  // Canonical no INSERT · garante 1 lead por nº fisico
  const canonical = canonicalPhoneBR(phone) || phone
  const created = await leads.create(clinic_id, {
    phone: canonical,
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
  /**
   * Mig 91 · webhook resolve via wa_numbers_resolve_by_phone_number_id ·
   * passar pra criar conversation linkada ao numero certo (trigger sincroniza
   * inbox_role automaticamente).
   */
  waNumberId?: string | null
}

export async function resolveConversation(
  opts: ResolveConversationOpts,
): Promise<ConversationDTO | null> {
  const { conversations, clinic_id, phone, lead, pushName, waNumberId } = opts
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

  if (existing) return existing

  // Canonical no INSERT · ver comentário em resolveLead
  const canonical = canonicalPhoneBR(phone) || phone
  const created = await conversations.create(clinic_id, {
    phone: canonical,
    leadId: lead.id,
    displayName: pushName || lead.name || phone,
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
