/**
 * Dedup reply formatter · usado pelos handlers b2b-emit-voucher e
 * b2b-voucher-confirm pra construir mensagem alertando a parceira que o
 * recipient ja existe em algum sistema da clinica.
 *
 * Tom Mira: formal mas leve · varia emoji (💛 🌿 ✨ 🤝).
 *
 * Fonte: DECISAO ALDEN 2026-04-25 (case Dani Mendes 26 vouchers ·
 * dedup global pre-emit pra parar de mandar voucher pra cliente
 * que ja e nossa).
 */

import type { DedupHit } from '@clinicai/repositories'

const PT_MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

/**
 * Formata ISO date pra "Mes/AA" pt-BR (ex: "Set/24").
 * Se data invalida, retorna "antes" como fallback.
 */
function formatSinceMonth(iso: string): string {
  if (!iso) return 'antes'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'antes'
  const mes = PT_MONTHS[d.getMonth()] ?? 'Mes'
  const ano = String(d.getFullYear()).slice(-2)
  return `${mes}/${ano}`
}

/**
 * Pega primeiro nome do recipient · prioriza hit.name (nome canonico no
 * sistema), cai pro nome digitado pela parceira se hit.name vazio.
 */
function recipientFirstName(hit: DedupHit, fallback: string): string {
  const raw = (hit.name ?? fallback ?? '').trim()
  if (!raw) return 'ela'
  return raw.split(/\s+/)[0]
}

/**
 * Constroi mensagem de bloqueio dedup pra parceira.
 *
 * @param hit              Resultado de LeadRepository.findInAnySystem
 * @param partnerFirst     Primeiro nome da parceira (pra abrir msg friendly)
 * @param recipientName    Nome digitado pela parceira (fallback se hit.name = null)
 */
export function formatDedupReply(
  hit: DedupHit,
  partnerFirst: string,
  recipientName: string,
): string {
  const recipientFull = (hit.name ?? recipientName ?? '').trim() || recipientName || 'ela'
  const recipientFirst = recipientFirstName(hit, recipientName)
  const since = formatSinceMonth(hit.since)
  const partner = partnerFirst || 'parceira'

  switch (hit.kind) {
    case 'patient':
      return (
        `Olha, ${partner} · *${recipientFull}* já é nossa paciente desde ${since}. ` +
        `Não vou emitir voucher novo, mas posso te confirmar que ela está aqui ` +
        `sendo cuidada 💛 Quer me passar outra indicação?`
      )

    case 'lead':
      return (
        `${partner}, *${recipientFull}* já está aqui no nosso sistema (lead desde ${since}). ` +
        `Pra não duplicar, quer me passar outra indicação? 🌿`
      )

    case 'voucher_recipient': {
      const viaPart = hit.partnershipName
        ? ` (voucher via *${hit.partnershipName}* em ${since})`
        : ` (voucher ${since})`
      return (
        `Hmm, ${partner} · alguém já indicou *${recipientFull}* antes${viaPart}. ` +
        `Pra não duplicar, posso te ajudar com outra? ✨`
      )
    }

    case 'partner_referral': {
      const viaPart = hit.partnershipName
        ? ` via *${hit.partnershipName}*`
        : ''
      return (
        `${partner}, *${recipientFull}* já foi indicada${viaPart} (${since}). ` +
        `Pra manter o jogo limpo, segue com outra? 🤝`
      )
    }

    default:
      // Defensive · TypeScript exhaustiveness
      return (
        `${partner}, *${recipientFull}* já está em algum cadastro nosso ` +
        `(${since}). Quer me passar outra? 💛`
      )
  }
}
