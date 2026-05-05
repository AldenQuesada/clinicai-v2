/**
 * Extração robusta de pushName (display name do contato WhatsApp).
 *
 * Motivo (audit 2026-05-05): Evolution webhook lia somente `data.pushName`
 * · em contatos LID (privacy mode) esse campo costuma vir vazio · pushName
 * real pode estar em campos alternativos (notifyName/verifiedBizName/etc)
 * dependendo da versão do Evolution e do estado do contato.
 *
 * Sintoma em prod: 42/62 conversas Secretaria B&H com display_name numérico
 * + lead.name vazio · zero logs `lead.name.updated_from_pushName` mesmo
 * após inbound novo · isGoodHumanName('') === false → shouldUpdateName
 * retorna false silencioso → nenhum UPDATE.
 *
 * Helper retorna `{ value, source }` · caller decide se passa adiante e
 * loga `source` pra catalogar onde o campo realmente vive em prod.
 */

export interface ExtractedPushName {
  /** Valor cru (não trimmed) · '' se nada bater */
  value: string
  /** Path do campo encontrado (debug · ex: 'data.pushName') · null se ausente */
  source: string | null
}

/**
 * Tenta extrair pushName de payload Evolution Baileys.
 *
 * Ordem de prioridade (do mais comum/específico ao mais legacy):
 *   1. data.pushName            · padrão atual Evolution
 *   2. pushName                  · alguns webhooks colocam top-level
 *   3. data.notifyName           · Baileys legacy + alguns Evolution v1
 *   4. data.verifiedBizName      · contas business verificadas (raro)
 *   5. data.message.pushName     · variantes nested em algumas versões
 *   6. data.contact.pushName     · payload "messages.upsert" enriched
 *   7. data.contact.notify       · fallback legacy
 *
 * Não trimma · caller faz isso. Não valida qualidade · `isGoodHumanName`
 * faz isso. Apenas localiza o campo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractPushNameFromEvolution(payload: any): ExtractedPushName {
  if (!payload || typeof payload !== 'object') {
    return { value: '', source: null }
  }

  const candidates: Array<{ path: string; getter: () => unknown }> = [
    { path: 'data.pushName', getter: () => payload?.data?.pushName },
    { path: 'pushName', getter: () => payload?.pushName },
    { path: 'data.notifyName', getter: () => payload?.data?.notifyName },
    { path: 'data.verifiedBizName', getter: () => payload?.data?.verifiedBizName },
    { path: 'data.message.pushName', getter: () => payload?.data?.message?.pushName },
    { path: 'data.contact.pushName', getter: () => payload?.data?.contact?.pushName },
    { path: 'data.contact.notify', getter: () => payload?.data?.contact?.notify },
  ]

  for (const { path, getter } of candidates) {
    const raw = getter()
    if (typeof raw === 'string' && raw.length > 0) {
      return { value: raw, source: path }
    }
  }

  return { value: '', source: null }
}

/**
 * Tenta extrair pushName de payload Cloud Meta (whatsapp_business_account).
 *
 * Hoje só uma fonte é confirmada (`contacts[0].profile.name`) · Cloud é
 * relativamente estável. Helper existe pra simetria + futureproof: se
 * Meta adicionar variantes, adiciona aqui.
 *
 * @param contacts array `value.contacts` do payload Meta
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractPushNameFromCloud(contacts: any): ExtractedPushName {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return { value: '', source: null }
  }
  const candidates: Array<{ path: string; getter: () => unknown }> = [
    { path: 'contacts[0].profile.name', getter: () => contacts?.[0]?.profile?.name },
    // Variantes hipotéticas · rare/futureproof
    { path: 'contacts[0].name', getter: () => contacts?.[0]?.name },
    { path: 'contacts[0].profile.display_name', getter: () => contacts?.[0]?.profile?.display_name },
  ]
  for (const { path, getter } of candidates) {
    const raw = getter()
    if (typeof raw === 'string' && raw.length > 0) {
      return { value: raw, source: path }
    }
  }
  return { value: '', source: null }
}
