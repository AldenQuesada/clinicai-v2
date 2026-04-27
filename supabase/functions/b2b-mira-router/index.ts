/**
 * ClinicAI — B2B Mira Router (WhatsApp B2B intent handler)
 *
 * Recebe uma mensagem de WhatsApp e retorna a resposta da Mira
 * (texto + ações a executar).
 *
 * Input POST:
 *   {
 *     phone: "5544998787673",
 *     message: "aprova cazza flor",
 *     message_id?: "wa_xxx",
 *     state?: { ... }   // estado de onboarding multi-turno
 *   }
 *
 * Output:
 *   {
 *     ok: true,
 *     reply: "texto da Mira pra enviar de volta",
 *     reply_to: "5544998787673",
 *     actions: [                  // ações paralelas (notificar, emitir, etc)
 *       { kind: "send_wa", to: "...", content: "..." },
 *       { kind: "send_voucher", phone: "...", template: "..." },
 *     ],
 *     next_state?: { ... }        // estado pra próxima mensagem (onboarding)
 *   }
 *
 * n8n / webhook chama essa edge function e despacha as actions.
 */

const _ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const _MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001'
const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const _EVO_URL = Deno.env.get('EVOLUTION_BASE_URL') || 'https://evolution.aldenquesada.site'
const _EVO_KEY = Deno.env.get('EVOLUTION_API_KEY') || ''
const _EVO_MIRA_INST = Deno.env.get('EVOLUTION_MIRA_INSTANCE') || 'mira-mirian'
// Shared secret — edge b2b-mira-inbound (e futuras integracoes) envia no
// header x-mira-router-secret. Sem isso, router rejeita com 401. Protege
// contra bypass da edge pra invocar emit_voucher/admin_approve diretamente.
const _ROUTER_SECRET = Deno.env.get('B2B_MIRA_ROUTER_SECRET') || ''

function _timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// Admins autorizados a aprovar/rejeitar/consultar (últimos 8 dígitos)
// Evolution pode entregar com 12 ou 13 dígitos (nono dígito opcional BR),
// Admin gate agora vem da tabela b2b_admin_phones (via RPC b2b_is_admin_phone).
// Migração 721 moveu fora do hardcode. Função abaixo consulta a tabela.
// p_capability: 'any' | 'approve' | 'create'.
async function isAdminPhone(phone: string, capability: 'any' | 'approve' | 'create' = 'any'): Promise<boolean> {
  try {
    const r = await rpc('b2b_is_admin_phone', { p_phone: phone, p_capability: capability })
    return r === true
  } catch (e) {
    console.warn('[isAdminPhone] RPC falhou, fail-closed:', (e as Error).message)
    return false
  }
}

// Telefone que recebe notificações
const NOTIFY_PHONE = '554498782003' // Mirian (como chega da Evolution)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function ok(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }),
    { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`[${name}] ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function lastDigits(phone: string, n = 8): string {
  return (phone || '').replace(/\D/g, '').slice(-n)
}
function normalize55(phone: string): string {
  const d = (phone || '').replace(/\D/g, '')
  if (d.length === 11 || d.length === 10) return '55' + d
  if (d.length === 13 || d.length === 12) return d.startsWith('55') ? d : ('55' + d.slice(-11))
  return d
}
function firstName(full: string | null | undefined): string {
  if (!full) return ''
  return String(full).trim().split(/\s+/)[0] || ''
}

// ════════════════════════════════════════════════════════════
// Audit + log em wa_pro_messages / wa_pro_audit_log
// Fecha gap descoberto 2026-04-20: Mira processava voucher e nao
// deixava rastro nas tabelas de audit (so gravava notes no voucher).
// ════════════════════════════════════════════════════════════
// Multi-tenant aware (ADR-016): resolve via _default_clinic_id() RPC.
// Cache no boot — Mira router processa dezenas de msgs por dia.
let _CLINIC_ID_CACHE: string | null = null
async function clinicId(): Promise<string> {
  if (_CLINIC_ID_CACHE) return _CLINIC_ID_CACHE
  try {
    _CLINIC_ID_CACHE = await rpc('_default_clinic_id', {}) as string
  } catch (_e) {
    _CLINIC_ID_CACHE = '00000000-0000-0000-0000-000000000001'
  }
  return _CLINIC_ID_CACHE
}
const _MIRA_INSTANCE_PHONE = '5544998787673'

async function _logMiraMessage(opts: {
  phone: string; direction: 'inbound' | 'outbound';
  content: string; intent?: string | null; intent_data?: unknown;
  response_ms?: number | null;
}): Promise<string | null> {
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/wa_pro_messages`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        clinic_id:    await clinicId(),
        phone:        opts.phone,
        direction:    opts.direction,
        content:      opts.content,
        intent:       opts.intent || null,
        intent_data:  opts.intent_data || null,
        response_ms:  opts.response_ms ?? null,
        status:       'sent',
      }),
    })
    if (!r.ok) {
      const body = await r.text()
      const errMsg = `status=${r.status} body=${body.slice(0, 200)}`
      console.error('[mira] log_message HTTP error:', errMsg)
      return errMsg
    }
    return null
  } catch (e) {
    const errMsg = (e as Error).message
    console.error('[mira] log_message exception:', errMsg)
    return errMsg
  }
}

async function _logMiraAudit(opts: {
  phone: string; query: string; intent?: string | null;
  rpc_called?: string | null; success: boolean;
  result_summary?: string | null; error_message?: string | null;
  response_ms?: number | null;
}) {
  try {
    await fetch(`${_SB_URL}/rest/v1/wa_pro_audit_log`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        clinic_id:      await clinicId(),
        phone:          opts.phone,
        query:          opts.query,
        intent:         opts.intent || null,
        rpc_called:     opts.rpc_called || null,
        success:        opts.success,
        result_summary: opts.result_summary || null,
        error_message:  opts.error_message || null,
        response_ms:    opts.response_ms ?? null,
      }),
    })
  } catch (e) {
    console.error('[mira] log_audit falhou:', (e as Error).message)
  }
}

// Resolve ou emite token do partner panel e retorna URL HTML bonita
async function _getPartnerPanelUrl(partnershipId: string): Promise<string> {
  const base = 'https://painel.miriandpaula.com.br'
  try {
    // Check token existente (nao expirado) na tabela
    const r = await rpc('b2b_partner_panel_issue_token', { p_partnership_id: partnershipId })
    const tok = r?.token || r?.public_token
    if (tok) return `${base}/parceiro.html?t=${encodeURIComponent(tok)}`
  } catch (e) {
    console.error('[mira] panel_url falhou:', (e as Error).message)
  }
  return `${base}/parceiro.html`
}

function extractJson(raw: string): any {
  try { return JSON.parse(raw) } catch { /* continua */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { return JSON.parse(fence[1]) } catch { /* continua */ } }
  const i = raw.indexOf('{'); const j = raw.lastIndexOf('}')
  if (i >= 0 && j > i) {
    try { return JSON.parse(raw.slice(i, j + 1)) } catch { /* continua */ }
  }
  return null
}

// ════════════════════════════════════════════════════════════
// Intent Classifier via Haiku
// ════════════════════════════════════════════════════════════

async function classifyIntent(message: string, userRole: string): Promise<any> {
  if (!_ANTHROPIC_KEY) {
    // Fallback regex-based simples
    return ruleBasedFallback(message, userRole)
  }

  const system =
    'Você classifica mensagens de WhatsApp B2B da Clínica Mirian de Paula. ' +
    'Retorna SOMENTE JSON válido com a estrutura especificada. ' +
    'Tom das intents é extraído literalmente da mensagem — não invente nada.'

  const user = `Usuário tem role "${userRole}" (admin|partner|unknown).
Mensagem:
"""
${message}
"""

Classifique em uma das intents:
- b2b.emit_voucher       → role=partner pedindo voucher pra alguém (menciona "voucher" ou "presente")
- b2b.refer_lead         → role=partner INDICANDO uma pessoa (menciona "indico/indicar/indicação/conheço")
- b2b.admin_approve      → role=admin pedindo aprovar candidatura
- b2b.admin_reject       → role=admin pedindo rejeitar candidatura (geralmente com motivo)
- b2b.admin_query        → role=admin pedindo lista/stats/info
- b2b.create_partnership → role=admin pedindo CADASTRAR uma nova parceria (frases: "cadastra", "cadastrar", "novo parceiro", "nova parceria", "adiciona parceira")
- b2b.feedback_received  → role=partner dando feedback POSITIVO CURTO de confirmacao/agradecimento apos um evento recente (voucher, msg, indicacao). Exemplos: "deu certo", "recebeu", "chegou", "recebi", "obrigada/o", "valeu", "que otimo", "que bom", "maravilha", "perfeito", "show", "legal", "massa". APENAS quando a mensagem eh curta (ate ~5 palavras) e soh contem esse tipo de expressao positiva, sem pergunta, sem pedido novo.
- b2b.other              → qualquer outra coisa

DIFERENÇA CRÍTICA: voucher vs refer_lead
- voucher = parceiro quer EMITIR um voucher digital com combo específico
- refer_lead = parceiro está INDICANDO alguém pra conhecer a clínica (sem voucher, entrega brinde padrão de avaliação)

DIFERENÇA CRÍTICA: feedback_received vs other
- feedback_received = SOH confirmacao/agradecimento curta, sem conteudo novo ("obrigada!", "deu certo")
- other = qualquer mensagem que tenha pedido, pergunta, ou informacao substantiva (mesmo se comecar com "obrigada, mas eu preciso...")

Retorne JSON:
{
  "intent": "b2b.xxx",
  "confidence": 0.0-1.0,
  "entities": {
    "recipient_name": "... (pra emit_voucher)",
    "recipient_phone": "... (pra emit_voucher, só dígitos)",
    "combo": "... (opcional pra emit_voucher)",
    "target_name": "... (pra approve/reject, nome da candidatura)",
    "reason": "... (pra reject)",
    "query_type": "pending|stats|other (pra admin_query)",
    "partnership_name": "... (pra create_partnership, nome do negócio)",
    "contact_name":     "... (pra create_partnership, nome da responsável)",
    "contact_phone":    "... (pra create_partnership, WhatsApp — só dígitos)",
    "pillar":           "saude|imagem|fitness|rede|evento|alimentacao|institucional|status|outros (pra create_partnership)",
    "category":         "... (opcional pra create_partnership, snake_case)",
    "tier":             "1|2|3 (opcional pra create_partnership)"
  },
  "reasoning": "1-2 palavras sobre por que"
}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': _ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: _MODEL, max_tokens: 512, system,
        messages: [
          { role: 'user', content: user },
          { role: 'assistant', content: '{' },
        ],
      }),
    })
    const text = await r.text()
    if (!r.ok) return ruleBasedFallback(message, userRole)
    const data = JSON.parse(text)
    const raw = '{' + (data?.content?.[0]?.text || '')
    const parsed = extractJson(raw)
    return parsed || ruleBasedFallback(message, userRole)
  } catch {
    return ruleBasedFallback(message, userRole)
  }
}

function ruleBasedFallback(message: string, userRole: string): any {
  const msg = message.toLowerCase()
  const entities: any = {}

  if (userRole === 'admin') {
    // Cadastro de parceria por voz — detecta antes de approve pra evitar
    // collision com "cadastra" sendo confundido com aprovação.
    if (/\b(cadastr|novo parceir|nova parcer|adiciona parcer)/i.test(msg)) {
      return { intent: 'b2b.create_partnership', confidence: 0.75, entities: {} }
    }
    if (/aprova|aprovar|aceita|aceitar/.test(msg)) {
      const m = message.match(/(?:aprova|aprovar|aceita|aceitar)\s+(.+)/i)
      if (m) entities.target_name = m[1].trim()
      return { intent: 'b2b.admin_approve', confidence: 0.8, entities }
    }
    if (/rejeita|rejeitar|recusa|recusar|nega|negar/.test(msg)) {
      const m = message.match(/(?:rejeita|rejeitar|recusa|recusar|nega|negar)\s+([^,.]+)(?:[,.]\s*(?:motivo:?\s*)?(.+))?/i)
      if (m) { entities.target_name = m[1].trim(); if (m[2]) entities.reason = m[2].trim() }
      return { intent: 'b2b.admin_reject', confidence: 0.8, entities }
    }
    if (/lista|pendente|stats|status|quantos/.test(msg)) {
      entities.query_type = /stats|status|quantos/.test(msg) ? 'stats' : 'pending'
      return { intent: 'b2b.admin_query', confidence: 0.8, entities }
    }
  }
  if (userRole === 'partner') {
    // Feedback positivo curto (confirmacao/agradecimento apos voucher/refer).
    // Regex conservadora: soh casa se a mensagem inteira (trim) e expressao
    // positiva + pontuacao/emoji. Se tiver qualquer pergunta ou pedido novo,
    // nao pega — cai em outros classifiers ou b2b.other.
    // Regra Alden 2026-04-24: deve ser permissivo o bastante pra Mira
    // responder algo bonito quando parceira agradece, mas conservador o
    // bastante pra nao interferir com conversas reais.
    const trimmed = msg.trim().replace(/[\s!.?,;:)(👍💜🙌❤️✨💖👏🫶☺😊🤍💫🥰]+$/gu, '').trim()
    if (/^(deu\s+certo|recebeu|chegou|recebi|valeu|muito\s+obrigad[ao]|obrigad[ao]|que\s+[óo]timo|que\s+bom|maravilha|show|perfeito|[óo]timo|legal|massa|top|tudo\s+certo|beleza)$/i.test(trimmed)) {
      return { intent: 'b2b.feedback_received', confidence: 0.8, entities: {} }
    }
    // Refer: indicação sem voucher
    if (/indico|indicar|indicac|conheço alguém|tenho uma amiga|queria indicar/.test(msg)) {
      const phoneMatch = message.match(/\b\d{2}[\s-]?\d{4,5}[\s-]?\d{4}\b|\b\d{10,11}\b/)
      if (phoneMatch) entities.recipient_phone = phoneMatch[0].replace(/\D/g, '')
      const namePart = message.replace(/indico|indicar|indicac[aã]o|conheço alguém|tenho uma amiga|queria indicar|pra|para|do|da/gi, '')
                              .replace(/\d[\d\s-]*\d/g, '').trim()
      if (namePart) entities.recipient_name = namePart.replace(/,|\./g, '').trim().split(',')[0]
      return { intent: 'b2b.refer_lead', confidence: 0.75, entities }
    }
    if (/voucher|presente|cupom/.test(msg)) {
      // Tenta extrair nome + telefone
      const phoneMatch = message.match(/\b\d{2}[\s-]?\d{4,5}[\s-]?\d{4}\b|\b\d{10,11}\b/)
      if (phoneMatch) entities.recipient_phone = phoneMatch[0].replace(/\D/g, '')
      const namePart = message.replace(/voucher|presente|cupom|pra|para/gi, '')
                              .replace(/\d[\d\s-]*\d/g, '').trim()
      if (namePart) entities.recipient_name = namePart.replace(/,|\./g, '').trim().split(',')[0]
      return { intent: 'b2b.emit_voucher', confidence: 0.6, entities }
    }
  }
  // Regra Alden 2026-04-22: Mira NAO oferece parceria pra ninguem.
  // Cadastro de parceira é boca-a-boca — admin usa b2b.create_partnership
  // pra subir os dados depois. Unknown cai em b2b.other (edge ja bloqueia
  // unknowns antes de chegar aqui, mas fica defense-in-depth).
  return { intent: 'b2b.other', confidence: 0.3, entities: {} }
}

// ════════════════════════════════════════════════════════════
// Resolver role do telefone
// ════════════════════════════════════════════════════════════

async function resolveRole(phone: string): Promise<{ role: string; partnership?: any }> {
  if (await isAdminPhone(phone, 'approve')) return { role: 'admin' }

  try {
    const lookup = await rpc('b2b_wa_sender_lookup', { p_phone: phone })
    if (lookup?.ok) return { role: 'partner', partnership: lookup }
  } catch { /* ignora */ }

  return { role: 'unknown' }
}

// ════════════════════════════════════════════════════════════
// Handlers por intent
// ════════════════════════════════════════════════════════════

// handleApply removido 2026-04-22 (Alden): Mira nao oferece parceria pra
// ninguem. Cadastro de parceira é boca-a-boca e entra pelo admin via
// b2b.create_partnership (handleCreatePartnership mais abaixo).

function _formatPhonePretty(phone55: string): string {
  // 5544998189300 -> (44) 99818-9300
  const d = (phone55 || '').replace(/\D/g, '')
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0,2)}) ${local.slice(2,7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0,2)}) ${local.slice(2,6)}-${local.slice(6)}`
  return phone55
}

function _isAffirmative(msg: string): boolean {
  const m = msg.trim().toLowerCase().replace(/[!.?,]+/g, '')
  return /^(sim|confirmo|confirma|ok|pode|isso|claro|perfeito|manda|vai|positivo|beleza|uhum|aham|s)$/i.test(m)
}
function _isNegative(msg: string): boolean {
  const m = msg.trim().toLowerCase().replace(/[!.?,]+/g, '')
  return /^(nao|não|cancela|cancelar|negativo|espera|para|pare|stop|errado|errou|n)$/i.test(m)
}

async function handleEmitVoucher(
  phone: string, entities: any, partnership: any, opts?: { skipConfirm?: boolean },
): Promise<any> {
  const name = entities?.recipient_name
  const rawPhone = entities?.recipient_phone
  const combo = entities?.combo

  if (!name || String(name).length < 2) {
    return { reply: 'Pra quem é o voucher? Me manda o nome da pessoa.', next_state: { pending: 'recipient_name' } }
  }
  if (!rawPhone || rawPhone.length < 10) {
    return { reply: `Beleza, pra ${name}. Qual o WhatsApp dela? (44 9XXXX-XXXX)`, next_state: { pending: 'recipient_phone', data: { recipient_name: name } } }
  }

  const recipientPhone = normalize55(rawPhone)
  const comboFinal = combo || partnership.default_combo

  // Sprint 1.2 — Dedup pré-emissão (regra da Mira: recusa se destinatária
  // já está no sistema como lead/paciente/orçamento/appointment)
  if (!opts?.skipConfirm) {
    try {
      const dedup = await rpc('b2b_voucher_recipient_check', {
        p_recipient_phone: recipientPhone,
        p_recipient_name:  name,
      })
      if (dedup && dedup.ok === false && dedup.found_in && dedup.found_in !== 'none') {
        const where = dedup.found_in === 'lead' ? 'já é lead nosso'
                    : dedup.found_in === 'appointment' ? 'já tem agendamento aqui'
                    : dedup.found_in === 'budget' ? 'já tem orçamento com a gente'
                    : 'já consta no nosso sistema'
        return {
          reply:
            `Oi! Dei uma olhada e vi que *${name}* ${where}. ` +
            `Por isso não vou emitir o voucher — ela já está na nossa jornada de cuidado 🤍\n\n` +
            `Registrei seu carinho e indicação. Se quiser presentear outra pessoa, é só me mandar o nome e o WhatsApp dela.`,
          next_state: null,
        }
      }
    } catch (err) {
      // Fail-open: se dedup falhar por bug, continua fluxo normal
      console.warn('[mira-router] dedup falhou:', (err as Error).message)
    }
  }

  // Confirmation step: proteção contra transcrição ambígua de áudio
  // (Whisper pode errar nomes/números). Só emite depois do SIM.
  if (!opts?.skipConfirm) {
    // Formatacao limpa: combo vem "Veu de Noiva + Anovator A5" (com espacos
    // ao redor do +) ou "Veu_de_Noiva+Anovator_A5". Normalizar antes de
    // substituir pra nao produzir "  e  " (dupla espaco). Bug descoberto
    // 2026-04-24: Dani viu "Véu de Noiva  e  Anovator A5" em 4 msgs.
    const comboLabel = comboFinal
      ? String(comboFinal).replace(/_/g, ' ').replace(/\s*\+\s*/g, ' e ').trim()
      : 'combo padrão'
    return {
      reply:
        `Confere pra eu emitir:\n\n` +
        `• Pra *${name}*\n` +
        `• WhatsApp *${_formatPhonePretty(recipientPhone)}*\n` +
        `• Combo *${comboLabel}*\n\n` +
        `Manda *SIM* pra disparar ou *NÃO* pra cancelar.`,
      next_state: {
        pending: 'voucher_confirm',
        data: {
          recipient_name: name,
          recipient_phone: recipientPhone,
          combo: comboFinal,
          partnership_id: partnership?.partnership_id || null,
        },
      },
    }
  }

  try {
    const r = await rpc('b2b_voucher_issue', {
      p_payload: {
        partnership_id: partnership.partnership_id,
        combo: comboFinal,
        recipient_name: name,
        recipient_phone: recipientPhone,
        theme: 'auto', // sazonal automático
        notes: JSON.stringify({ source: 'wa_mira', requested_by: phone }),
      },
    })
    if (!r?.ok) throw new Error(r?.error || 'voucher_issue_failed')

    const compose = await rpc('b2b_voucher_compose_message', { p_voucher_id: r.id })
    const leadMessage = compose?.message || `Oi ${firstName(name)}! Você ganhou um Voucher Presente. ${compose?.link}`

    // Link correto pra parceira ACOMPANHAR e painel/parceiro.html, nao
    // o link do voucher (que e pro beneficiario e mostra preview OG simples).
    const panelUrl = await _getPartnerPanelUrl(partnership.partnership_id)

    // Tom formal alinhado com o restante do onboarding da Mira (mesmo registro
    // de b2b-mira-welcome e partnership_registered_light). Confirmacao eh
    // momento-chave da parceria — merece presenca. Alden 2026-04-24.
    const partnerFirst = firstName(partnership.contact_name || partnership.partnership_name || '')
    const partnerGreeting = partnerFirst ? `${partnerFirst}, ` : ''
    return {
      reply:
        `✨ *Voucher enviado para ${name}*\n\n` +
        `Acabei de entregar o presente direto no WhatsApp dela, com o link, as orientações e o prazo de validade. ` +
        `Já pode descansar — o fio agora corre com a gente.\n\n` +
        `Assim que ela abrir ou agendar, te aviso por aqui.\n\n` +
        `📊 *Acompanhe em tempo real no seu painel:*\n${panelUrl}\n\n` +
        `${partnerGreeting}obrigada pela confiança de sempre 💜\n` +
        `— *Mira*, da Clínica Mirian de Paula`,
      actions: [
        // via: 'lara' — beneficiária é lead externo, assessora Lara (instancia Mih)
        // é quem tem o contexto de atendimento dela, não a Mira (que cuida de parceiras).
        { kind: 'send_wa', to: recipientPhone, content: leadMessage, via: 'lara' },
      ],
      next_state: null,
    }
  } catch (e) {
    return { reply: `Deu erro ao emitir: ${(e as Error).message}. Pode tentar de novo?`, next_state: null }
  }
}

// INDICAÇÃO VPI (B2C): usa o sistema existente de embaixadoras.
// Verifica se o remetente está em vpi_partners. Se sim, cria vpi_indication.
async function handleReferLead(phone: string, entities: any): Promise<any> {
  const name = entities?.recipient_name
  const rawPhone = entities?.recipient_phone

  if (!name || String(name).length < 2) {
    return { reply: 'Qual o nome da pessoa que você quer indicar?',
             next_state: { pending: 'refer_name' } }
  }
  if (!rawPhone || rawPhone.length < 10) {
    return { reply: `Beleza, ${name}. Qual o WhatsApp dela? (44 9XXXX-XXXX)`,
             next_state: { pending: 'refer_phone', data: { recipient_name: name } } }
  }
  const recipientPhone = normalize55(rawPhone)

  try {
    // 1. Resolve partner VPI
    const partnerLookup = await rpc('vpi_partner_by_phone', { p_phone: phone })
    if (!partnerLookup?.ok) {
      return {
        reply:
          'Legal você querer indicar alguém! Mas antes preciso te cadastrar como ' +
          'embaixadora do nosso programa de indicação. Vou avisar a Mirian — ela ' +
          'entra em contato pra te explicar as vantagens.',
        actions: [
          { kind: 'notify_admin', content:
            `Indicação recebida de quem ainda não é embaixadora VPI. ` +
            `Phone: ${phone}. Quer indicar: ${name} (${recipientPhone}).` },
        ],
        next_state: null,
      }
    }

    // 2. Cria/acha lead indicado
    const leadRes = await rpc('vpi_lead_upsert_for_referral', {
      p_name: name,
      p_phone: recipientPhone,
      p_partner_name: partnerLookup.nome,
    })
    if (!leadRes?.ok) throw new Error(leadRes?.error || 'lead_upsert_failed')

    // 3. Lead já é nosso — sutileza, sem reabordagem
    if (leadRes.lead_status === 'existing') {
      return {
        reply:
          `${partnerLookup.nome || 'Oi'}, obrigada por pensar! ` +
          `Dei uma olhada e vi que a ${firstName(name)} já conhece a Clínica Mirian de Paula — ` +
          `ela já está com a gente. Registrei seu carinho. ` +
          `Se quiser indicar outra amiga que ainda não conhece, bora!`,
        next_state: null,
      }
    }

    // 4. Cria a vpi_indication (sistema VPI cuida de scoring, audit, tudo)
    const indRes = await rpc('vpi_indication_create', {
      p_partner_id: partnerLookup.partner_id,
      p_lead_id: leadRes.lead_id,
    }).catch((e: any) => ({ error: String(e.message) }))

    // 5. Enfileira Lara pro lead com brinde padrão
    const laraMessage =
      `Oi, ${firstName(name)}! Tudo bem?\n\n` +
      `A ${partnerLookup.nome} indicou você pra conhecer a Clínica Mirian de Paula. ` +
      `Queria te dar um presente: *Véu de Noiva* (nosso tratamento com Fotona Dynamis Nx) + ` +
      `uma *Avaliação Corporal com Anovator A5*.\n\n` +
      `Mas antes me tira uma dúvida rápida: você já faz cuidados estéticos de algum tipo?`

    return {
      reply:
        `Obrigada, ${firstName(partnerLookup.nome)}! Peguei a ${firstName(name)}. ` +
        `Já estamos em contato com ela oferecendo o Véu de Noiva + Avaliação Corporal. ` +
        `Te aviso quando ela agendar.`,
      actions: [
        // Lead indicado é atendido pela Lara (Mih).
        { kind: 'send_wa', to: recipientPhone, content: laraMessage, via: 'lara' },
        { kind: 'notify_admin', content:
          `Nova indicação VPI: ${partnerLookup.nome} indicou ${name} (${recipientPhone}).` },
      ],
      next_state: null,
    }
  } catch (e) {
    return { reply: `Deu erro ao registrar: ${(e as Error).message}. Tenta de novo?`,
             next_state: null }
  }
}

async function handleAdminApprove(entities: any): Promise<any> {
  const target = (entities?.target_name || '').trim().toLowerCase()
  if (!target) {
    const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 10 })
    const arr = Array.isArray(list) ? list : []
    if (!arr.length) return { reply: 'Não tem candidaturas pendentes.', next_state: null }
    const lines = arr.slice(0, 5).map((a: any, i: number) => `${i + 1}. ${a.name} (${a.category || '—'})`).join('\n')
    return { reply: `Qual aprova?\n${lines}\n\nResponde "aprova [nome]".`, next_state: null }
  }
  const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 50 })
  const match = (Array.isArray(list) ? list : []).find((a: any) =>
    String(a.name || '').toLowerCase().includes(target),
  )
  if (!match) return { reply: `Não achei candidatura com "${target}". Manda "lista pendentes" pra ver os nomes exatos.`, next_state: null }

  const r = await rpc('b2b_application_approve', { p_application_id: match.id })
  if (!r?.ok) return { reply: `Deu erro: ${r?.error}`, next_state: null }

  return {
    reply: `Aprovada! ${r.partnership_name} virou prospect. Avisei ela e a Mirian.`,
    actions: [
      // Applicant aprovada vira parceira — welcome vem da Mira (quem cuida de parceiras).
      { kind: 'send_wa', to: r.notify_applicant_phone, via: 'mira', content:
        `Oi! Boas notícias — sua candidatura pra parceira do Círculo Mirian foi aprovada! ` +
        `Em breve a gente te ativa no sistema. Obrigada por confiar na gente.` },
      { kind: 'notify_mirian', content: `Nova parceria aprovada: ${r.partnership_name}.` },
    ],
    next_state: null,
  }
}

async function handleAdminReject(entities: any): Promise<any> {
  const target = (entities?.target_name || '').trim().toLowerCase()
  const reason = (entities?.reason || '').trim()

  if (!target) return { reply: 'Qual candidatura? Manda "lista pendentes".', next_state: null }
  if (!reason) return { reply: 'Me diz o motivo pra eu mandar a mensagem educada pra candidata.', next_state: { pending: 'reject_reason', data: { target } } }

  const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 50 })
  const match = (Array.isArray(list) ? list : []).find((a: any) =>
    String(a.name || '').toLowerCase().includes(target),
  )
  if (!match) return { reply: `Não achei "${target}".`, next_state: null }

  const r = await rpc('b2b_application_reject', { p_application_id: match.id, p_reason: reason })
  if (!r?.ok) return { reply: `Erro: ${r?.error}`, next_state: null }

  return {
    reply: `Rejeitada. Mandei a mensagem educada.`,
    actions: [
      // Applicant rejeitada volta a ser lead em potencial — Lara cuida (atendimento).
      { kind: 'send_wa', to: r.notify_applicant_phone, via: 'lara', content:
        `Oi! Agradeço o interesse em ser parceira do Círculo Mirian. ` +
        `Nesse momento não vamos seguir com essa parceria, mas admiro muito o trabalho de vocês. ` +
        `Se quiser ser nossa paciente, te recebemos com o maior carinho.` },
      { kind: 'notify_mirian', content: `Candidatura rejeitada: ${r.partnership_name}. Motivo: ${reason}.` },
    ],
    next_state: null,
  }
}

async function handleAdminQuery(entities: any): Promise<any> {
  const qt = entities?.query_type || 'pending'
  if (qt === 'pending') {
    const list = await rpc('b2b_applications_list', { p_status: 'pending', p_limit: 10 })
    const arr = Array.isArray(list) ? list : []
    if (!arr.length) return { reply: 'Sem candidaturas pendentes.', next_state: null }
    const lines = arr.map((a: any, i: number) =>
      `${i + 1}. ${a.name} (${a.category || '—'}) · ${a.requested_by_phone}`
    ).join('\n')
    return { reply: `${arr.length} candidaturas pendentes:\n${lines}`, next_state: null }
  }
  // stats: resumo do mês
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/b2b_partnership_impact_score`, {
      method: 'POST',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_partnership_id: null }),
    })
    const arr = await r.json()
    const total = Array.isArray(arr) ? arr.length : 0
    const topName = total ? arr[0].name : '—'
    return { reply: `Stats: ${total} parcerias ativas. Top: ${topName}.`, next_state: null }
  } catch {
    return { reply: 'Não consegui puxar stats agora.', next_state: null }
  }
}

// ════════════════════════════════════════════════════════════
// handleCreatePartnership — cadastro de parceria via voz (admin)
// Fluxo: menu-first (pede tudo numa mensagem) → gather faltantes →
// dedup → confirmação SIM/NÃO → upsert → msg leve pra parceira.
// ════════════════════════════════════════════════════════════

const CP_PILLARS = new Set([
  'saude', 'imagem', 'fitness', 'rede', 'evento',
  'alimentacao', 'institucional', 'status', 'outros',
])

function _stripAccents(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function _normalizePillar(raw: string | undefined | null): string | null {
  if (!raw) return null
  const k = _stripAccents(String(raw).trim())
  if (CP_PILLARS.has(k)) return k
  // Aliases comuns (voz/transcricao pode variar)
  if (/sa[uú]de|medic|clinic/.test(k)) return 'saude'
  if (/imagem|beleza|estetica|moda/.test(k))   return 'imagem'
  if (/fitness|academ|crossfit|esporte/.test(k)) return 'fitness'
  if (/alimen|nutric|restaur|gastron/.test(k)) return 'alimentacao'
  if (/even|festa|casamento|decor/.test(k))    return 'evento'
  if (/rede|networ|comunidad/.test(k))         return 'rede'
  if (/institu|empres/.test(k))                return 'institucional'
  if (/status|luxo|premium/.test(k))           return 'status'
  return null
}

function _slugify(s: string): string {
  return _stripAccents(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Renderiza {placeholders} num template (mesmo pattern do b2b-mira-welcome)
function _renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl
  for (const k of Object.keys(vars)) {
    out = out.split('{' + k + '}').join(String(vars[k]))
  }
  return out
}

// Busca template global em b2b_comm_templates
async function _fetchCommTemplate(eventKey: string, channel: string): Promise<any | null> {
  try {
    const r = await fetch(
      `${_SB_URL}/rest/v1/b2b_comm_templates?event_key=eq.${eventKey}&channel=eq.${channel}&is_active=eq.true&partnership_id=is.null&order=priority.asc&limit=1`,
      { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
    )
    if (!r.ok) return null
    const arr = await r.json()
    return arr && arr[0] ? arr[0] : null
  } catch { return null }
}

async function _evoSendText(phone: string, text: string): Promise<{ waId: string | null; ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${_EVO_URL}/message/sendText/${_EVO_MIRA_INST}`, {
      method: 'POST',
      headers: { 'apikey': _EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text }),
    })
    const body = await r.text()
    if (!r.ok) return { waId: null, ok: false, error: `${r.status}: ${body.slice(0, 200)}` }
    let parsed: any = null
    try { parsed = JSON.parse(body) } catch { /* noop */ }
    return { waId: parsed?.key?.id || null, ok: true }
  } catch (e) {
    return { waId: null, ok: false, error: (e as Error).message }
  }
}

// Log no b2b_comm_dispatch_log (mesmo formato que b2b-mira-welcome usa)
async function _logDispatch(params: {
  clinicId: string | null; partnershipId: string;
  templateId?: string | null; eventKey: string; channel: string;
  recipientRole: string; phone: string; senderInstance: string;
  text: string; waId: string | null; errorMsg?: string | null;
}): Promise<void> {
  try {
    await fetch(`${_SB_URL}/rest/v1/b2b_comm_dispatch_log`, {
      method: 'POST',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        clinic_id:       params.clinicId,
        partnership_id:  params.partnershipId,
        template_id:     params.templateId ?? null,
        event_key:       params.eventKey,
        channel:         params.channel,
        recipient_role:  params.recipientRole,
        recipient_phone: params.phone,
        sender_instance: params.senderInstance,
        text_content:    params.text,
        wa_message_id:   params.waId,
        status:          params.errorMsg ? 'failed' : 'sent',
        error_message:   params.errorMsg ?? null,
      }),
    })
  } catch { /* silencioso */ }
}

// Dedup: procura parceria existente pelo contact_phone (exato ou últimos 8)
async function _cpFindExistingByPhone(contactPhone: string): Promise<{ id: string; name: string } | null> {
  try {
    const d = (contactPhone || '').replace(/\D/g, '')
    if (!d || d.length < 8) return null
    const last8 = d.slice(-8)
    // Fetch por filtro simples + filtra em JS (regex em PostgREST é verboso).
    const r = await fetch(
      `${_SB_URL}/rest/v1/b2b_partnerships?select=id,name,contact_phone&contact_phone=not.is.null&limit=1000`,
      { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
    )
    if (!r.ok) return null
    const arr = await r.json()
    if (!Array.isArray(arr)) return null
    const hit = arr.find((row: any) => {
      const rowDigits = String(row.contact_phone || '').replace(/\D/g, '')
      if (!rowDigits) return false
      return rowDigits === d || rowDigits.slice(-8) === last8
    })
    return hit ? { id: hit.id, name: hit.name } : null
  } catch { return null }
}

function _cpHasPhoneOk(raw: string | undefined | null): boolean {
  if (!raw) return false
  const d = String(raw).replace(/\D/g, '')
  return d.length >= 10 && d.length <= 13
}

function _cpMenu(): string {
  return (
    'Perfeito! Me manda numa mensagem só:\n\n' +
    '• Nome do negócio (ex.: "Clínica da Sílvia")\n' +
    '• Nome do responsável (ex.: "Sílvia Menezes")\n' +
    '• WhatsApp da responsável (ex.: "44 99999-9999")\n' +
    '• Pilar (saúde, imagem, fitness, rede, evento, alimentação, institucional, status, outros)\n' +
    '• Categoria (ex.: "nutricionista") — opcional\n' +
    '• Tier 1, 2 ou 3 — opcional\n\n' +
    'Pode mandar tudo junto. Se esquecer algo eu te pergunto.'
  )
}

async function handleCreatePartnership(
  phone: string, entities: any, opts?: { skipConfirm?: boolean; state?: any },
): Promise<any> {
  // 1. Gate admin (via tabela b2b_admin_phones, capability 'create')
  if (!(await isAdminPhone(phone, 'create'))) {
    return { reply: 'Só admin pode cadastrar parceria por voz.', next_state: null }
  }

  const e = entities || {}
  const stateData: any = opts?.state?.data || {}

  // Merge state + entities (entities nova > state antigo)
  const data: any = {
    partnership_name: e.partnership_name || stateData.partnership_name || null,
    contact_name:     e.contact_name     || stateData.contact_name     || null,
    contact_phone:    (e.contact_phone   || stateData.contact_phone    || '').toString().replace(/\D/g, '') || null,
    pillar:           _normalizePillar(e.pillar) || _normalizePillar(stateData.pillar) || stateData.pillar || null,
    category:         e.category || stateData.category || null,
    tier:             e.tier != null ? Number(e.tier) : (stateData.tier != null ? Number(stateData.tier) : null),
  }

  // Primeira chamada (sem nada no state e sem entities) → menu
  const isFirstTouch =
    !opts?.state &&
    !data.partnership_name && !data.contact_name &&
    !data.contact_phone    && !data.pillar
  if (isFirstTouch) {
    return {
      reply: _cpMenu(),
      next_state: { pending: 'cp_menu_sent', data: {} },
    }
  }

  // 2. Gather missing
  if (!data.partnership_name || String(data.partnership_name).trim().length < 2) {
    return {
      reply: 'Qual o nome do negócio?',
      next_state: { pending: 'cp_name', data },
    }
  }
  if (!data.contact_name || String(data.contact_name).trim().length < 2) {
    return {
      reply: 'Qual o nome da responsável?',
      next_state: { pending: 'cp_contact_name', data },
    }
  }
  if (!_cpHasPhoneOk(data.contact_phone)) {
    return {
      reply: 'Qual o WhatsApp dela? (44 9XXXX-XXXX)',
      next_state: { pending: 'cp_phone', data },
    }
  }
  if (!data.pillar) {
    return {
      reply: 'Qual o pilar? (saúde, imagem, fitness, rede, evento, alimentação, institucional, status, outros)',
      next_state: { pending: 'cp_pillar', data },
    }
  }

  const normalizedPhone = normalize55(data.contact_phone)

  // 3. Dedup (só na primeira passada — antes de confirmar)
  if (!opts?.skipConfirm) {
    const existing = await _cpFindExistingByPhone(normalizedPhone)
    if (existing) {
      return {
        reply: `Já tem parceria com esse WhatsApp: *${existing.name}*. Se quiser atualizar, use o painel.`,
        next_state: null,
      }
    }
  }

  // 4. Confirmação (skipConfirm=true só depois do SIM)
  if (!opts?.skipConfirm) {
    return {
      reply:
        `Confere pra eu cadastrar:\n\n` +
        `• Negócio: *${data.partnership_name}*\n` +
        `• Responsável: *${data.contact_name}*\n` +
        `• WhatsApp: *${_formatPhonePretty(normalizedPhone)}*\n` +
        `• Pilar: *${data.pillar}* · Categoria: *${data.category || 'não informada'}*\n` +
        `• Status inicial: *Avaliar DNA*\n\n` +
        `Manda *SIM* pra criar ou *NÃO* pra cancelar.`,
      next_state: {
        pending: 'cp_confirm',
        data: { ...data, contact_phone: normalizedPhone },
      },
    }
  }

  // 5. Executa upsert
  try {
    const slug = _slugify(String(data.partnership_name))
    const payload: any = {
      name: String(data.partnership_name).trim(),
      pillar: data.pillar,
      category: data.category || null,
      tier: data.tier || 2,
      type: 'institutional',
      contact_name: String(data.contact_name).trim(),
      contact_phone: normalizedPhone,
      status: 'dna_check',
      voucher_monthly_cap: 5,
      voucher_validity_days: 30,
      voucher_min_notice_days: 15,
      created_by: `wa_mira:${phone}`,
    }
    const r = await rpc('b2b_partnership_upsert', { p_slug: slug, p_payload: payload })
    if (!r?.ok) throw new Error(r?.error || 'upsert_failed')
    const newPartnershipId = r.id as string
    const contactFirst = firstName(payload.contact_name)

    // 6. Envia msg de acolhimento pra nova parceira
    const tpl = await _fetchCommTemplate('partnership_registered_light', 'text')
    const bodyTpl = tpl?.text_template ||
      `Oi *{parceira_first}*! 💛 Aqui é da Clínica Mirian de Paula.\n\n` +
      `Você acabou de entrar pro nosso *Círculo de Parceiras* — um projeto curado da Dra. Mirian pra conectar profissionais que cuidam da mesma mulher.\n\n` +
      `Em breve volto com todos os detalhes de como funciona (e seu primeiro voucher pra experimentar).\n\n` +
      `Muito prazer! — Mira, assistente virtual da clínica`
    const msg = _renderTemplate(bodyTpl, {
      parceira: payload.name,
      parceira_first: contactFirst,
      pillar: payload.pillar,
    })

    let sentWaId: string | null = null
    let dispatchErr: string | null = null
    const partnerPhone = normalizedPhone
    if (_EVO_KEY) {
      const res = await _evoSendText(partnerPhone, msg)
      sentWaId = res.waId
      dispatchErr = res.ok ? null : (res.error || 'evo_send_failed')
    } else {
      dispatchErr = 'evo_key_missing'
    }
    await _logDispatch({
      clinicId: await clinicId(), partnershipId: newPartnershipId,
      templateId: tpl?.id ?? null, eventKey: 'partnership_registered_light',
      channel: 'text', recipientRole: 'partner',
      phone: partnerPhone, senderInstance: _EVO_MIRA_INST,
      text: msg, waId: sentWaId, errorMsg: dispatchErr,
    })

    // Audit wa_pro_messages do outbound pra parceira (rastro do envio)
    _logMiraMessage({
      phone: partnerPhone, direction: 'outbound', content: msg,
      intent: 'partnership_registered_light',
      intent_data: { partnership_id: newPartnershipId, via: 'voice_create' },
    })

    return {
      reply:
        `Feito ✅\n\n` +
        `*${payload.name}* cadastrada como "Avaliar DNA".\n\n` +
        `Próximos passos pra ativar:\n` +
        `1. Preencher DNA (excelência/estética/propósito) no painel\n` +
        `2. Mover pra "Em contrato" → "Ativa"\n\n` +
        `Quando ativar, mando o welcome completo pra ${contactFirst}\n` +
        `(texto + áudio de apresentação + voucher demo).\n\n` +
        `Link: https://painel.miriandpaula.com.br/b2b-partners.html`,
      next_state: null,
    }
  } catch (e) {
    return { reply: `Deu erro ao cadastrar: ${(e as Error).message}. Quer tentar de novo?`, next_state: null }
  }
}

function handleOther(role: string): any {
  if (role === 'admin') {
    return { reply: 'Comandos: `aprova X` · `rejeita X, motivo: Y` · `lista pendentes` · `stats`.', next_state: null }
  }
  if (role === 'partner') {
    return { reply: 'Pra emitir voucher: "voucher pra [nome], [telefone], combo [opcional]". Pra falar com a Lara/clínica, só me dizer.', next_state: null }
  }
  // role === 'unknown' nao deveria chegar aqui (edge bloqueia antes). Se chegar,
  // silencia: retorna reply vazio pra a edge nao enviar nada.
  return { reply: '', next_state: null }
}

// handleFeedbackReceived — parceira agradece/confirma apos um evento recente
// (voucher enviado, indicacao feita, msg recebida). Resposta curta, elegante,
// com tom de reciprocidade — sem repetir menu e sem perguntar nada. Encerra
// o turno naturalmente.
// Regra Alden 2026-04-24: pra NAO interferir com conversas reais, so entra
// via classifier quando a mensagem inteira eh feedback positivo curto. Qualquer
// pergunta/pedido novo na mesma msg cai em outro intent.
function handleFeedbackReceived(partnership: any): any {
  const partnerFirst = firstName(partnership?.contact_name || partnership?.partnership_name || '')
  const greet = partnerFirst ? `${partnerFirst}, ` : ''
  return {
    reply:
      `💜 ${greet}isso aqui faz a diferença.\n\n` +
      `Sigo de olho. Quando tiver qualquer outra pessoa pra cuidar com a gente, ` +
      `é só me chamar — registro e cuido da sequência por aqui.`,
    next_state: null,
  }
}

// ════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  // Shared-secret gate — so callers que conhecem B2B_MIRA_ROUTER_SECRET passam.
  // Previne que um atacante que descubra a URL execute voucher_issue,
  // admin_approve, admin_reject, etc. fake.
  if (!_ROUTER_SECRET) {
    console.error('[mira-router] B2B_MIRA_ROUTER_SECRET nao configurado')
    return err('server_misconfigured', 500)
  }
  const provided = req.headers.get('x-mira-router-secret') || ''
  if (!_timingSafeEqual(provided, _ROUTER_SECRET)) {
    return err('unauthorized', 401)
  }

  const _t0 = Date.now()
  try {
    const body = await req.json()
    const phone: string = body?.phone || ''
    const message: string = body?.message || ''
    const state: any = body?.state || null

    if (!phone || !message) return err('phone e message obrigatórios')

    // Log inbound (fire-and-forget; erros ja sao logados no console)
    _logMiraMessage({
      phone, direction: 'inbound', content: message,
      intent: state?.pending ? `continue_${state.pending}` : null,
      intent_data: state || null,
    })

    // 1. Resolve role
    const { role, partnership } = await resolveRole(phone)

    // 2. State com pending (voucher_confirm, recipient_phone, refer_*) continua fluxo.
    // Onboarding via state.step foi removido junto com handleApply.
    if (state && state.pending) {
      // Confirmação de emissão de voucher — protege contra erro de
      // transcrição de áudio (Whisper). Só emite no SIM explícito.
      if (state.pending === 'voucher_confirm') {
        if (_isAffirmative(message)) {
          // Prioriza partnership_id gravada no state (garante consistência
          // se admin estiver em multiplas parcerias).
          let p = partnership
          const pinned = state.data?.partnership_id
          if (pinned && (!p || p.partnership_id !== pinned)) {
            p = { partnership_id: pinned, default_combo: state.data?.combo }
          }
          if (!p) {
            try {
              const lookup = await rpc('b2b_wa_sender_lookup', { p_phone: phone })
              if (lookup?.ok) p = lookup
            } catch { /* ignora */ }
          }
          if (!p) {
            return ok({ ok: true, reply_to: phone,
              reply: 'Perdi a referência da parceria — me manda de novo o pedido do voucher.',
              next_state: null })
          }
          const result = await handleEmitVoucher(phone, state.data || {}, p, { skipConfirm: true })
          return ok({ ok: true, reply_to: phone, ...result })
        }
        if (_isNegative(message)) {
          return ok({ ok: true, reply_to: phone,
            reply: 'Cancelei. Se quiser, me manda de novo com o nome e o WhatsApp corretos.',
            next_state: null })
        }
        // Ambíguo: re-pergunta mantendo state
        return ok({ ok: true, reply_to: phone,
          reply: 'Não entendi — manda *SIM* pra emitir ou *NÃO* pra cancelar.',
          next_state: state })
      }
      // Completar dado pendente (ex: recipient_phone, reject_reason)
      if (state.pending === 'recipient_phone' && role === 'partner') {
        const entities = {
          recipient_name: state.data?.recipient_name,
          recipient_phone: message.replace(/\D/g, ''),
        }
        const result = await handleEmitVoucher(phone, entities, partnership)
        return ok({ ok: true, reply_to: phone, ...result })
      }
      if (state.pending === 'refer_phone') {
        const entities = {
          recipient_name: state.data?.recipient_name,
          recipient_phone: message.replace(/\D/g, ''),
        }
        const result = await handleReferLead(phone, entities)
        return ok({ ok: true, reply_to: phone, ...result })
      }
      if (state.pending === 'refer_name') {
        const result = await handleReferLead(phone, { recipient_name: message.trim() })
        return ok({ ok: true, reply_to: phone, ...result })
      }
      if (state.pending === 'reject_reason' && role === 'admin') {
        const result = await handleAdminReject({
          target_name: state.data?.target,
          reason: message.trim(),
        })
        return ok({ ok: true, reply_to: phone, ...result })
      }

      // ─── State machine: cadastro de parceria por voz ────────────────
      // Os pending cp_* representam perguntas abertas do wizard. A cada
      // resposta a gente enriquece o state.data com o campo recém-coletado
      // e re-chama handleCreatePartnership — ele detecta o próximo faltante.
      if (state.pending && String(state.pending).startsWith('cp_')) {
        const trimmed = message.trim()

        // Confirmação final: SIM/NÃO sobre upsert
        if (state.pending === 'cp_confirm') {
          if (_isAffirmative(message)) {
            const result = await handleCreatePartnership(phone, state.data || {}, { skipConfirm: true })
            return ok({ ok: true, reply_to: phone, ...result })
          }
          if (_isNegative(message)) {
            return ok({ ok: true, reply_to: phone,
              reply: 'Cancelado, nada foi criado.',
              next_state: null })
          }
          return ok({ ok: true, reply_to: phone,
            reply: 'Não entendi — manda *SIM* pra criar ou *NÃO* pra cancelar.',
            next_state: state })
        }

        // Menu enviado: usuário respondeu com dados (pode vir tudo junto)
        // Tenta re-classificar a resposta via Haiku pra extrair entities.
        if (state.pending === 'cp_menu_sent') {
          let entities: any = {}
          try {
            const reclass = await classifyIntent(trimmed, 'admin')
            if (reclass?.intent === 'b2b.create_partnership' && reclass.entities) {
              entities = reclass.entities
            } else if (reclass?.entities) {
              // Mesmo se o classifier achou outro intent, pega entities úteis
              entities = reclass.entities
            }
          } catch { /* fallback pra pattern abaixo */ }

          // Heurística fallback: se msg tem quebra de linha ou "|", tenta parsear
          if (!entities.partnership_name) {
            const lines = trimmed.split(/[\n;|]+/).map(l => l.trim()).filter(Boolean)
            if (lines.length >= 1 && !entities.partnership_name) entities.partnership_name = lines[0]
            if (lines.length >= 2 && !entities.contact_name)     entities.contact_name = lines[1]
            if (lines.length >= 3 && !entities.contact_phone) {
              const m = lines[2].match(/\d[\d\s().-]{8,}/)
              if (m) entities.contact_phone = m[0].replace(/\D/g, '')
            }
            if (lines.length >= 4 && !entities.pillar) entities.pillar = lines[3]
            if (lines.length >= 5 && !entities.category) entities.category = lines[4]
          }
          const result = await handleCreatePartnership(phone, entities, { state: { data: {} } })
          return ok({ ok: true, reply_to: phone, ...result })
        }

        // Perguntas pontuais — campo único por turno
        if (state.pending === 'cp_name') {
          const result = await handleCreatePartnership(phone,
            { partnership_name: trimmed },
            { state })
          return ok({ ok: true, reply_to: phone, ...result })
        }
        if (state.pending === 'cp_contact_name') {
          const result = await handleCreatePartnership(phone,
            { contact_name: trimmed },
            { state })
          return ok({ ok: true, reply_to: phone, ...result })
        }
        if (state.pending === 'cp_phone') {
          const result = await handleCreatePartnership(phone,
            { contact_phone: trimmed.replace(/\D/g, '') },
            { state })
          return ok({ ok: true, reply_to: phone, ...result })
        }
        if (state.pending === 'cp_pillar') {
          const result = await handleCreatePartnership(phone,
            { pillar: trimmed },
            { state })
          return ok({ ok: true, reply_to: phone, ...result })
        }
      }
    }

    // 3. Classifica intent
    const intent = await classifyIntent(message, role)
    let result: any

    switch (intent?.intent) {
      case 'b2b.emit_voucher': {
        // Admin pode emitir se estiver na whitelist de alguma parceria
        let p = partnership
        if (!p) {
          try {
            const lookup = await rpc('b2b_wa_sender_lookup', { p_phone: phone })
            if (lookup?.ok) p = lookup
          } catch { /* ignora */ }
        }
        if (!p) {
          result = {
            reply: 'Pra emitir voucher, você precisa estar na whitelist de alguma parceria. ' +
                   'Posso autorizar agora? Me diz qual parceria.',
            next_state: null,
          }
        } else {
          result = await handleEmitVoucher(phone, intent.entities, p)
        }
        break
      }
      case 'b2b.refer_lead': {
        // Indicação VPI (B2C): resolve o partner direto pelo phone na edge
        result = await handleReferLead(phone, intent.entities)
        break
      }
      case 'b2b.feedback_received': {
        // Mira responde agradecimento/confirmacao com tom elegante e nao
        // repete menu. Apenas parceiras — admin com "obrigada" cai em help.
        if (role !== 'partner') { result = handleOther(role); break }
        result = handleFeedbackReceived(partnership)
        break
      }
      case 'b2b.admin_approve':
        if (role !== 'admin') { result = handleOther(role); break }
        result = await handleAdminApprove(intent.entities)
        break
      case 'b2b.admin_reject':
        if (role !== 'admin') { result = handleOther(role); break }
        result = await handleAdminReject(intent.entities)
        break
      case 'b2b.admin_query':
        if (role !== 'admin') { result = handleOther(role); break }
        result = await handleAdminQuery(intent.entities)
        break
      case 'b2b.create_partnership': {
        // Gate admin via tabela b2b_admin_phones (RPC b2b_is_admin_phone).
        // Se phone não autorizado, handler retorna "Só admin pode...".
        result = await handleCreatePartnership(phone, intent.entities || {})
        break
      }
      default:
        result = handleOther(role)
    }

    // Enriquece notify_admin / notify_mirian — ambos vão pro NOTIFY_PHONE (Alden)
    // (Mirian hoje É a Mira; notificar ela seria loop. Alden recebe tudo.)
    const actions = (result.actions || []).map((a: any) => {
      if (a.kind === 'notify_admin' || a.kind === 'notify_mirian') {
        return { kind: 'send_wa', to: NOTIFY_PHONE, content: a.content }
      }
      return a
    })

    const _responseMs = Date.now() - _t0

    // Log outbound (reply da Mira) + audit
    _logMiraMessage({
      phone, direction: 'outbound', content: result.reply || '',
      intent: intent?.intent || null, intent_data: { role, next_state: result.next_state || null },
      response_ms: _responseMs,
    })
    _logMiraAudit({
      phone, query: message, intent: intent?.intent || null,
      rpc_called: null,
      success: true,
      result_summary: (result.reply || '').slice(0, 200),
      response_ms: _responseMs,
    })

    return ok({
      ok: true,
      reply_to: phone,
      reply: result.reply,
      actions,
      next_state: result.next_state || null,
      intent: intent?.intent,
      role,
    })
  } catch (e) {
    _logMiraAudit({
      phone: '', query: '', intent: null, rpc_called: null,
      success: false, error_message: (e as Error).message,
      response_ms: Date.now() - _t0,
    })
    return err((e as Error).message, 500)
  }
})
