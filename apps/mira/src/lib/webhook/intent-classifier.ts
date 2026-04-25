/**
 * Intent classifier · 2-tier.
 *
 * Tier 1 (regex sincrono):
 *   ~15 patterns documentados na auditoria do clinic-dashboard. Cobre 80%
 *   das msgs em prod (verbos diretos · "emite voucher", "aprova X").
 *
 * Tier 2 (Anthropic Haiku · async):
 *   Fallback quando regex nao bate. Classifier 1-shot · retorna intent +
 *   confidence. Custo baixo (Haiku · ~$0.001/msg).
 *
 * Intents (sao os mesmos do b2b-mira-router):
 *   partner.emit_voucher       · "emite voucher pra fulana"
 *   partner.refer_lead         · "indico fulana", "tenho amiga interessada"
 *   partner.feedback_received  · "ela ja foi", "atendimento foi otimo"
 *   partner.other              · fallback parceira
 *   admin.approve              · "aprova X"
 *   admin.reject               · "rejeita X" (multi-turn pra reason)
 *   admin.create_partnership   · "cria parceria", "cadastra parceira"
 *   admin.query                · agenda/financeiro/pacientes (vai pro wa_pro)
 *   admin.help                 · "menu", "ajuda", "comandos"
 *   admin.other                · fallback admin
 *   unknown                    · nao classificado (silent ignore)
 */

import type { Role } from './role-resolver'

export type Intent =
  | 'partner.emit_voucher'
  | 'partner.refer_lead'
  | 'partner.feedback_received'
  | 'partner.other'
  | 'admin.approve'
  | 'admin.reject'
  | 'admin.create_partnership'
  | 'admin.query'
  | 'admin.help'
  | 'admin.other'
  | 'unknown'

export interface ClassificationResult {
  intent: Intent
  confidence: number
  /** Tier que decidiu (1=regex, 2=haiku) */
  tier: 1 | 2
  /** Match dump pra debug · regex match groups ou haiku raw */
  match?: Record<string, unknown>
}

// ── Tier 1 patterns ─────────────────────────────────────────────────────
const PARTNER_PATTERNS: Array<{ intent: Intent; rx: RegExp }> = [
  { intent: 'partner.emit_voucher',
    rx: /\b(emit(e|ir)|gera|fazer?|manda|mandar|envia|enviar|presentei?a|presentear|cria|criar)\s+(o\s+|um\s+)?(voucher|cupom|presente|cortesia)/i },
  { intent: 'partner.emit_voucher',
    rx: /\b(voucher|cupom|presente|cortesia)\s+(pra|para)\s+\S+/i },
  { intent: 'partner.refer_lead',
    rx: /\b(indico|indicar|indica[cç][aã]o|conhe[cç]o\s+algu[eé]m|tenho\s+uma\s+amiga|tenho\s+uma\s+cliente)/i },
  { intent: 'partner.feedback_received',
    rx: /\b(ela\s+(j[aá]\s+)?(foi|veio)|atendimento\s+(foi|esteve)|adorou|amou)/i },
]

const ADMIN_PATTERNS: Array<{ intent: Intent; rx: RegExp }> = [
  // approve/reject de candidaturas
  { intent: 'admin.approve',
    rx: /^(aprova|aprovar|aprova[cç][aã]o)\b/i },
  { intent: 'admin.reject',
    rx: /^(rejeita|rejeitar|nega|negar|recusa|recusar)\b/i },
  // create partnership · multi-turno cp_*
  { intent: 'admin.create_partnership',
    rx: /\b(cria(r)?|cadastr(a|ar)|adiciona(r)?|nova?)\s+(uma\s+)?parceir/i },
  // query (admin com agenda/financeiro · roteia pra wa_pro)
  { intent: 'admin.query',
    rx: /\b(agenda|hor[áa]rio|faturamento|fatur(ei|ou)|comiss[ãa]o|receita|(quem|quais).*(pagou|paga|pag\w+))/i },
  { intent: 'admin.query',
    rx: /^(marca(r)?|agenda(r)?|cancela(r)?|reagenda(r)?|desmarca(r)?|remarca(r)?)\s+\S/i },
  { intent: 'admin.query',
    rx: /^quem\s+(e|é|eh)\s+\S/i },
  { intent: 'admin.query',
    rx: /\b(saldo|deve|deve\s+pra)\b/i },
  // help/menu
  { intent: 'admin.help',
    rx: /^(ajuda|help|menu|comandos|\/ajuda|\/help)\b/i },
  { intent: 'admin.help',
    rx: /^o(la|i)\s*$/i },
]

/**
 * Normaliza prefixos comuns ("Mira,", "eu quero", "por favor") pra Tier 1
 * pegar o verbo certo. Logic 1:1 do clinic-dashboard b2b-mira-inbound#normalizeForAdmin.
 */
function normalize(text: string): string {
  let t = String(text || '').trim()
  t = t.replace(/^(oi\s+|olha\s+|escuta\s+)?mira[\s,.:]+/i, '')
  t = t.replace(/^(olha[\s,]+|olhe[\s,]+|escuta[\s,]+)/i, '')
  t = t.replace(/^(por\s+favor[\s,]+|por\s+gentileza[\s,]+)/i, '')
  t = t.replace(/^(eu\s+)?(quero|queria|preciso|posso|vou|gostaria\s+de|saber)\s+/i, '')
  return t.trim()
}

export function classifyTier1(text: string, role: Role): ClassificationResult | null {
  const normalized = normalize(text)
  if (!normalized) return null

  const patterns = role === 'admin' ? [...ADMIN_PATTERNS, ...PARTNER_PATTERNS] : PARTNER_PATTERNS

  for (const p of patterns) {
    const m = normalized.match(p.rx)
    if (m) {
      return {
        intent: p.intent,
        confidence: 0.9,
        tier: 1,
        match: { rx: p.rx.toString(), groups: m.slice(1).filter(Boolean) },
      }
    }
  }

  return null
}

// ── Tier 2 (Anthropic Haiku) ─────────────────────────────────────────────
const HAIKU_SYSTEM = `Você é a Mira, classificadora de intents pra WhatsApp B2B da Clínica Mirian de Paula.

Receba uma mensagem e retorne SOMENTE um JSON com:
  { "intent": "<INTENT>", "confidence": <0-1> }

Intents validas (escolhe a melhor):
- partner.emit_voucher (parceira pedindo voucher pra alguem)
- partner.refer_lead (parceira indicando lead/amiga interessada)
- partner.feedback_received (parceira contando que foi bom)
- partner.other (parceira mas intent unclear)
- admin.approve (admin aprovando candidatura)
- admin.reject (admin rejeitando candidatura)
- admin.create_partnership (admin querendo cadastrar parceria nova)
- admin.query (admin querendo agenda/financeiro/pacientes)
- admin.help (admin pedindo menu/ajuda)
- admin.other (admin mas intent unclear)
- unknown (nao classificavel)

Confianca alta (>0.8) so se voce tem certeza. Caso contrario, abaixe.`

export async function classifyTier2(
  text: string,
  role: Role,
  apiKey?: string,
): Promise<ClassificationResult> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY || ''
  if (!key) {
    return { intent: 'unknown', confidence: 0, tier: 2, match: { error: 'no_api_key' } }
  }
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        system: HAIKU_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Role: ${role || 'unknown'}\nMensagem: "${text.slice(0, 500)}"`,
          },
        ],
      }),
    })
    if (!res.ok) {
      return { intent: 'unknown', confidence: 0, tier: 2, match: { http_status: res.status } }
    }
    const json = await res.json()
    const raw = json?.content?.[0]?.text ?? ''
    const match = String(raw).match(/\{[\s\S]*\}/)
    if (!match) return { intent: 'unknown', confidence: 0, tier: 2, match: { raw } }
    const parsed = JSON.parse(match[0])
    const intent = String(parsed?.intent || 'unknown') as Intent
    const confidence = Number(parsed?.confidence ?? 0.5)
    return { intent, confidence, tier: 2, match: { raw } }
  } catch (err) {
    return {
      intent: 'unknown',
      confidence: 0,
      tier: 2,
      match: { error: String(err) },
    }
  }
}

/**
 * Top-level classifier · tenta Tier 1, fallback Tier 2.
 * Threshold: Tier 1 sempre confia (0.9). Tier 2 < 0.5 = unknown.
 */
export async function classifyIntent(text: string, role: Role): Promise<ClassificationResult> {
  const t1 = classifyTier1(text, role)
  if (t1) return t1

  const t2 = await classifyTier2(text, role)
  if (t2.confidence < 0.5) {
    return { ...t2, intent: 'unknown' }
  }
  return t2
}
