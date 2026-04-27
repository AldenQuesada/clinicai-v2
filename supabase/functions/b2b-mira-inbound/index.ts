/**
 * ClinicAI — B2B Mira Inbound (webhook Evolution direto, bypass n8n)
 *
 * Recebe webhook `messages.upsert` da instancia mira-mirian da Evolution,
 * transcreve audio via OpenAI Whisper se necessario, chama b2b-mira-router,
 * persiste state em mira_conversation_state, e envia a resposta + actions
 * de volta via Evolution API.
 *
 * Substitui o fluxo n8n `https://flows.aldenquesada.site/webhook/mira-webhook`
 * que saiu do ar em 2026-04-22 (HTTP 500), derrubando o atendimento Mira.
 *
 * Auth: header `x-inbound-secret` === env `WA_INBOUND_SECRET`.
 *
 * Webhook Evolution esperado:
 *   POST /b2b-mira-inbound
 *   { event: "messages.upsert", instance: "mira-mirian", data: {
 *       key: { remoteJid, fromMe, id },
 *       message: { conversation?, extendedTextMessage?, audioMessage?, ... },
 *       messageType, pushName
 *   } }
 */

const _SB_URL   = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
// Aceita B2B_MIRA_INBOUND_SECRET (dedicado) ou WA_INBOUND_SECRET (compat).
// Precedencia do dedicado — permite rotacionar so essa edge sem afetar wa-inbound.
const _SECRET   = Deno.env.get('B2B_MIRA_INBOUND_SECRET') || Deno.env.get('WA_INBOUND_SECRET') || ''
const _OPENAI   = Deno.env.get('OPENAI_API_KEY') || ''
const _EVO_URL  = Deno.env.get('EVOLUTION_BASE_URL') || 'https://evolution.aldenquesada.site'
const _EVO_KEY  = Deno.env.get('EVOLUTION_API_KEY') || ''
const _EVO_INST      = Deno.env.get('EVOLUTION_MIRA_INSTANCE') || 'mira-mirian'
const _EVO_LARA_INST = Deno.env.get('EVOLUTION_INSTANCE')       || 'Mih'

// Mapeia "via" -> function_key canonico em mira_channels
// Mira fala com parceiros (partner_response); Lara fala com leads/convidadas (recipient_voucher ou vpi_partner)
function _viaToFunctionKey(via?: string): string {
  if (via === 'lara') return 'recipient_voucher'
  return 'partner_response'
}

type Channel = { instance: string; apiUrl: string; apiKey: string; source: 'db' | 'env' }

// Cache leve em memoria pra reduzir roundtrip (5 min TTL)
const _channelCache = new Map<string, { ch: Channel; exp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

async function resolveChannel(via?: string): Promise<Channel> {
  const fk = _viaToFunctionKey(via)
  const cached = _channelCache.get(fk)
  if (cached && cached.exp > Date.now()) return cached.ch

  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/mira_channel_get_config`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_function_key: fk }),
    })
    if (r.ok) {
      const cfg = await r.json()
      if (cfg && cfg.ok && cfg.instance_id && cfg.api_url && cfg.api_key) {
        const ch: Channel = {
          instance: String(cfg.instance_id),
          apiUrl:   String(cfg.api_url),
          apiKey:   String(cfg.api_key),
          source:   'db',
        }
        _channelCache.set(fk, { ch, exp: Date.now() + CACHE_TTL_MS })
        return ch
      }
    }
  } catch (_) { /* fallback */ }

  const envCh: Channel = {
    instance: via === 'lara' ? _EVO_LARA_INST : _EVO_INST,
    apiUrl:   _EVO_URL,
    apiKey:   _EVO_KEY,
    source:   'env',
  }
  return envCh
}

// Legacy helper: retorna so instance string (compat com callers existentes)
function _instFor(via?: string): string {
  return via === 'lara' ? _EVO_LARA_INST : _EVO_INST
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-inbound-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// Baixa audio decodificado da Evolution (PTT vem cifrado WA; Evolution decripta).
async function evoDownloadAudio(instance: string, messageKey: unknown): Promise<{ b64: string; mime: string } | null> {
  try {
    const r = await fetch(`${_EVO_URL}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { 'apikey': _EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
    })
    if (!r.ok) {
      console.error('[evo_get_base64]', r.status, (await r.text()).slice(0, 200))
      return null
    }
    const d = await r.json()
    const b64 = d?.base64 || d?.data || ''
    const mime = d?.mimetype || 'audio/ogg'
    if (!b64) return null
    return { b64, mime }
  } catch (e) {
    console.error('[evo_get_base64] ex:', (e as Error).message)
    return null
  }
}

async function whisperTranscribe(b64: string, mime: string): Promise<string> {
  if (!_OPENAI) throw new Error('OPENAI_API_KEY nao configurado')
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('mpeg') ? 'mp3' : 'ogg'
  const form = new FormData()
  form.append('file', new Blob([bin], { type: mime }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'pt')
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${_OPENAI}` },
    body: form,
  })
  if (!r.ok) throw new Error(`whisper ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const d = await r.json()
  return String(d?.text || '').trim()
}

async function evoSendText(phone: string, text: string, via?: string): Promise<{ waId: string | null; inst: string }> {
  const ch = await resolveChannel(via)
  const r = await fetch(`${ch.apiUrl}/message/sendText/${ch.instance}`, {
    method: 'POST',
    headers: { 'apikey': ch.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, text }),
  })
  if (!r.ok) {
    console.error(`[evo_send_text/${ch.instance}]`, r.status, (await r.text()).slice(0, 200))
    return { waId: null, inst: ch.instance }
  }
  const d = await r.json().catch(() => null)
  return { waId: d?.key?.id || null, inst: ch.instance }
}

// clinic_id cache — logDispatch e chamada varias vezes por request; resolver
// _default_clinic_id() toda vez adiciona latencia desnecessaria (ADR-016
// multi-tenant). Cache miss so no primeiro request.
let _CLINIC_ID_CACHE: string | null = null
async function clinicId(): Promise<string> {
  if (_CLINIC_ID_CACHE) return _CLINIC_ID_CACHE
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/_default_clinic_id`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (r.ok) _CLINIC_ID_CACHE = (await r.json()) as string
  } catch (_) { /* fallback abaixo */ }
  _CLINIC_ID_CACHE ||= '00000000-0000-0000-0000-000000000001'
  return _CLINIC_ID_CACHE
}

// Grava em b2b_comm_dispatch_log — audit trail de toda mensagem saida pela edge.
// Fire-and-forget, nao bloqueia resposta se falhar. PRECISA de clinic_id
// (coluna NOT NULL desde a origem da tabela). Sem clinic_id, INSERT falha
// silenciosamente no try/catch e o audit trail inteiro fica vazio em prod.
// Bug descoberto 2026-04-24: dispatch_log zerado durante incidente verify_jwt
// fez parecer que a Mira nao estava enviando nada — na verdade as msgs
// saiam, so o rastro que sumia.
async function logDispatch(opts: {
  phone: string; text: string; waId: string | null; inst: string;
  eventKey: string; recipientRole: 'partner' | 'beneficiary' | 'admin' | 'unknown';
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/b2b_comm_dispatch_log`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        clinic_id:       await clinicId(),
        event_key:       opts.eventKey,
        channel:         'text',
        recipient_role:  opts.recipientRole,
        recipient_phone: opts.phone,
        sender_instance: opts.inst,
        text_content:    opts.text.slice(0, 2000),
        wa_message_id:   opts.waId,
        status:          opts.waId ? 'sent' : 'failed',
        error_message:   opts.errorMessage ?? null,
      }),
    })
    if (!r.ok) {
      const body = await r.text()
      console.error('[log_dispatch]', r.status, body.slice(0, 200))
    }
  } catch (e) {
    console.error('[log_dispatch]', (e as Error).message)
  }
}

// Dedup por wa_message_id inbound — Evolution pode re-entregar webhook
// (retry em erro de rede). Sem isso, emissao de voucher pode duplicar.
// Guarda em mira_conversation_state com chave especial (expire 2h).
async function wasRecentlyProcessed(waMessageId: string): Promise<boolean> {
  if (!waMessageId) return false
  const key = `__processed__${waMessageId.slice(0, 40)}`
  const r = await fetch(
    `${_SB_URL}/rest/v1/mira_conversation_state?phone=eq.${encodeURIComponent(key)}&expires_at=gt.${new Date().toISOString()}&select=phone&limit=1`,
    { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
  )
  if (!r.ok) return false
  const arr = await r.json()
  return Array.isArray(arr) && arr.length > 0
}

async function markProcessed(waMessageId: string): Promise<void> {
  if (!waMessageId) return
  const key = `__processed__${waMessageId.slice(0, 40)}`
  const now = new Date()
  const exp = new Date(now.getTime() + 2 * 60 * 60 * 1000)  // 2h
  try {
    await fetch(`${_SB_URL}/rest/v1/mira_conversation_state`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        phone: key, state: { wa_message_id: waMessageId },
        updated_at: now.toISOString(), expires_at: exp.toISOString(),
      }),
    })
  } catch (e) {
    console.error('[mark_processed]', (e as Error).message)
  }
}

async function stateGet(phone: string): Promise<unknown | null> {
  const r = await fetch(
    `${_SB_URL}/rest/v1/mira_conversation_state?phone=eq.${phone}&expires_at=gt.${new Date().toISOString()}&select=state&limit=1`,
    { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
  )
  if (!r.ok) return null
  const arr = await r.json()
  return arr?.[0]?.state ?? null
}

async function stateSet(phone: string, state: unknown | null): Promise<void> {
  const now = new Date()
  const exp = new Date(now.getTime() + 15 * 60 * 1000)  // 15 min
  if (state === null || state === undefined) {
    // Clear
    await fetch(`${_SB_URL}/rest/v1/mira_conversation_state?phone=eq.${phone}`, {
      method: 'DELETE',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` },
    })
    return
  }
  await fetch(`${_SB_URL}/rest/v1/mira_conversation_state`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      phone, state, updated_at: now.toISOString(), expires_at: exp.toISOString(),
    }),
  })
}

// Regra de negocio (Alden 2026-04-22): Mira NUNCA responde phone desconhecido.
// Se nao for admin ou partner cadastrado em b2b_partnership_wa_senders, silencia.
// Antes desse gate, o router classificava como 'unknown' e caia num fallback
// "Quer ser nossa parceira?" — enviado pra qualquer desconhecido que mandasse
// msg, incluindo numeros sem relacao com a clinica.
// Normaliza pra os ultimos 11 digitos (DDD+9+8 BR). E bom pra comparacao
// estrita — last8 da colisao frequente (ex: 5511987654321 vs 554491287654321
// compartilham 87654321 e o lookup por last8 pega o errado).
function last11(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-11)
}

type Role = 'admin' | 'partner' | null

async function resolveRole(phone: string): Promise<Role> {
  try {
    const phoneDigits = String(phone).replace(/\D/g, '')
    const last8 = phoneDigits.slice(-8)
    const last11p = last11(phone)

    // Fonte canonica de admin operacional (agenda/financeiro/pacientes):
    // wa_numbers com number_type=professional_private e is_active=true.
    // Esta tabela casa 1:1 com a UI "Gestao da Mira". b2b_admin_phones
    // cobre subset com poderes B2B extra (aprovar/criar parceria), mas
    // todo admin B2B esta tambem em wa_numbers, entao checar wa_numbers
    // eh suficiente pro ACL da edge.
    const waRes = await fetch(
      `${_SB_URL}/rest/v1/wa_numbers?is_active=eq.true&number_type=eq.professional_private&select=phone`,
      { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
    )
    if (waRes.ok) {
      const nums = await waRes.json() as Array<{ phone: string }>
      if (nums.some(n => last11(n.phone) === last11p || String(n.phone).replace(/\D/g, '').slice(-8) === last8)) {
        return 'admin'
      }
    } else {
      console.error('[resolveRole] wa_numbers fetch failed', waRes.status, (await waRes.text()).slice(0, 200))
    }

    // Partner: match last11 OU last8 contra b2b_partnership_wa_senders ativos.
    // last8 fallback cobre o caso BR onde WhatsApp entrega número sem o 9 extra
    // (ex: DDD 44 antigo, LID mapeado pra número de 12 dígitos). Exemplo real:
    // Léo Biaggi cadastrada como 5544999181362 (13d), Evolution entrega JID
    // 554499181362 (12d) — last11 diferente, last8 igual (99181362).
    const sndRes = await fetch(
      `${_SB_URL}/rest/v1/b2b_partnership_wa_senders?active=eq.true&select=phone`,
      { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
    )
    if (sndRes.ok) {
      const senders = await sndRes.json() as Array<{ phone: string }>
      if (senders.some(s => {
        const d = String(s.phone).replace(/\D/g, '')
        return last11(s.phone) === last11p || d.slice(-8) === last8
      })) return 'partner'
    }

    return null
  } catch (e) {
    console.error('[mira-inbound] resolveRole falhou, fail-closed:', (e as Error).message)
    return null
  }
}

// Compat pra logic antigo: isAllowedPhone retorna apenas boolean.
async function isAllowedPhone(phone: string): Promise<boolean> {
  return (await resolveRole(phone)) !== null
}

// Normaliza prefixos comuns ("Mira,", "eu quero", "por favor") pra o classifier
// do wa_pro_handle_message pegar o verbo certo. Sem isso, "Mira, eu quero
// agendar uma paciente" cai em 'unknown' porque o regex espera ^verbo.
function normalizeForAdmin(text: string): string {
  let t = String(text || '').trim()
  // remove vocativo Mira: "Mira, ..." / "oi mira,", "mira escuta", etc
  t = t.replace(/^(oi\s+|olha\s+|escuta\s+)?mira[\s,.:]+/i, '')
  // remove filler words no comeco: "olha,", "olhe", "escuta,"
  t = t.replace(/^(olha[\s,]+|olhe[\s,]+|escuta[\s,]+)/i, '')
  // remove cortesia: "por favor", "por gentileza"
  t = t.replace(/^(por\s+favor[\s,]+|por\s+gentileza[\s,]+)/i, '')
  // remove auxiliares: "eu quero", "quero", "eu preciso", "preciso", "posso",
  // "eu vou", "vou", "gostaria de", "queria", "saber"
  t = t.replace(/^(eu\s+)?(quero|queria|preciso|posso|vou|gostaria\s+de|saber)\s+/i, '')
  return t.trim()
}

// Comando global do admin — quando o texto bate aqui, a edge limpa o state
// multi-turn ANTES de chamar wa_pro_handle_message. Evita que um state
// residual (ex: awaiting_patient_registration) capture a mensagem nova e
// retorne "faltou CPF/telefone/sexo" quando o admin quer na verdade saber
// faturamento/agenda/etc.
function looksLikeGlobalAdminCommand(text: string): boolean {
  const t = String(text || '').trim().toLowerCase()
  return /^(ajuda|help|menu|comandos|\/ajuda|\/help)\b/.test(t)
      || /(tenho|minha|meu|quero)\s+(agenda|horario)/.test(t)
      || /(quem|quais).*(pagou|paga|pag\w+)/.test(t)
      || /(faturei|faturamento|receita|comissao|comissão)/.test(t)
      || /^(marca|marcar|agenda|agendar|cancela|cancelar|reagenda|reagendar|desmarca|desmarcar|remarca|remarcar)\s+\S/.test(t)
      || /^quem\s+(e|é|eh)\s+\S/.test(t)
      || /(quanto.*deve|saldo\s+do|saldo\s+da)/.test(t)
      || /(proximo|próximo)\s+(paciente|consulta)/.test(t)
}

async function clearContext(phone: string): Promise<void> {
  try {
    await fetch(`${_SB_URL}/rest/v1/wa_pro_context?phone=eq.${encodeURIComponent(phone)}`, {
      method: 'DELETE',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` },
    })
  } catch (e) {
    console.error('[clearContext]', (e as Error).message)
  }
}

// Admin: chama wa_pro_handle_message (RPC com agenda/financeiro/pacientes/help).
// Retorna { response, intent } — response sai como reply; intent ajuda a
// decidir se cai pro router B2B pra intents como emit_voucher/approve.
async function callWaProAdmin(phone: string, text: string): Promise<any | null> {
  try {
    const normalized = normalizeForAdmin(text)
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/wa_pro_handle_message`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_phone: phone, p_text: normalized }),
    })
    if (!r.ok) {
      console.error('[wa_pro_handle_message]', r.status, (await r.text()).slice(0, 200))
      return null
    }
    return await r.json()
  } catch (e) {
    console.error('[wa_pro_handle_message] ex:', (e as Error).message)
    return null
  }
}

// Regex que detecta intencao B2B na msg — se bate, admin "help/unknown"
// do wa_pro cai pra b2b-mira-router (que entende emit_voucher, approve,
// reject, create_partnership, refer_lead).
function looksLikeB2B(text: string): boolean {
  return /\b(voucher|presente|cupom|parceir|parceria|emite|emitir|aprova|aprovar|rejeita|rejeitar|cadastr(a|ar)\s+(nov[oa]?\s+)?parceir|adiciona\s+parcer|indico|indicar|indica[cç][aã]o|conheço\s+alguém|tenho\s+uma\s+amiga)\b/i.test(text)
}

const _ROUTER_SECRET = Deno.env.get('B2B_MIRA_ROUTER_SECRET') || ''

async function callRouter(phone: string, message: string, state: unknown | null): Promise<any> {
  if (!_ROUTER_SECRET) {
    throw new Error('B2B_MIRA_ROUTER_SECRET nao configurado na edge')
  }
  const r = await fetch(`${_SB_URL}/functions/v1/b2b-mira-router`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
      'x-mira-router-secret': _ROUTER_SECRET,
    },
    body: JSON.stringify({ phone, message, state }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`router ${r.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  // Shared-secret — webhook externo (Evolution) nao carrega JWT Supabase.
  if (!_SECRET) {
    console.error('[mira-inbound] WA_INBOUND_SECRET nao configurado')
    return json({ ok: false, error: 'server_misconfigured' }, 500)
  }
  const provided = req.headers.get('x-inbound-secret') || ''
  if (!timingSafeEqual(provided, _SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  try {
    const body = await req.json()
    const event = body?.event || ''
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      return json({ ok: true, skip: 'not_message_event' })
    }

    const data = body?.data || body
    const key = data?.key || {}
    if (key?.fromMe) return json({ ok: true, skip: 'outbound' })

    const remoteJid: string = key?.remoteJid || ''
    if (!remoteJid || remoteJid.includes('@g.us')) {
      return json({ ok: true, skip: 'group_or_invalid' })
    }

    // WhatsApp entrega 2 formatos de JID:
    //   - <phone>@s.whatsapp.net → número real, extrai direto
    //   - <lid>@lid             → identificador interno (privacy mode).
    //                             Número real vem em key.senderPn ou data.senderPn.
    // Sem esse tratamento, LID cai como "phone" no b2b_wa_sender_lookup
    // (que usa last8 do número) e o sender nunca bate. Sintoma em prod:
    // Flavia Sobral mandou mensagem pela LID 43847488925824, fallback b2b.other.
    let phone = ''
    if (remoteJid.endsWith('@lid')) {
      const senderPn: string = key?.senderPn || data?.senderPn || ''
      phone = senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '')
      if (!phone) {
        console.warn('[mira-inbound] LID sem senderPn, descarta:', remoteJid)
        return json({ ok: true, skip: 'lid_without_senderPn', lid: remoteJid })
      }
    } else {
      phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    }
    if (!/^\d{10,15}$/.test(phone)) return json({ ok: true, skip: 'bad_phone', phone })

    // GATE de autorizacao — antes de qualquer processamento caro (Whisper, router).
    // Desconhecidos sao silenciados: nao baixa audio, nao chama router, nao envia
    // mensagem de volta. Numero entra so se for admin ou partner ativo.
    const role = await resolveRole(phone)
    if (role === null) {
      return json({ ok: true, skip: 'unauthorized_phone', phone })
    }

    // Dedup por wa_message_id — Evolution retry pode entregar 2x. Sem isso,
    // voucher duplica. Confere antes de processar; marca ao final.
    const waMsgId: string = key?.id || ''
    if (waMsgId && await wasRecentlyProcessed(waMsgId)) {
      return json({ ok: true, skip: 'already_processed', wa_message_id: waMsgId })
    }

    const msg = data?.message || {}
    let content: string = msg?.conversation
      || msg?.extendedTextMessage?.text
      || msg?.imageMessage?.caption
      || msg?.videoMessage?.caption
      || ''
    let transcribedFromAudio = false

    if (!content && (msg?.audioMessage || data?.messageType === 'audioMessage')) {
      const dl = await evoDownloadAudio(_EVO_INST, key)
      if (!dl) {
        const txt = 'Não consegui baixar seu áudio — pode mandar em texto, por favor?'
        const res = await evoSendText(phone, txt, 'mira')
        await logDispatch({ phone, text: txt, waId: res.waId, inst: res.inst,
          eventKey: 'mira_audio_download_fail', recipientRole: 'partner' })
        return json({ ok: true, error: 'audio_download_failed' })
      }
      try {
        content = await whisperTranscribe(dl.b64, dl.mime)
        transcribedFromAudio = true
      } catch (e) {
        console.error('[whisper]', (e as Error).message)
        const txt = 'Tive um problema pra transcrever o áudio. Pode escrever em texto?'
        const res = await evoSendText(phone, txt, 'mira')
        await logDispatch({ phone, text: txt, waId: res.waId, inst: res.inst,
          eventKey: 'mira_whisper_fail', recipientRole: 'partner' })
        return json({ ok: true, error: 'whisper_failed' })
      }
    }

    if (!content) return json({ ok: true, skip: 'empty_message' })

    // Admin: regra de roteamento
    //   1. msg parece B2B (voucher, parceira, indicar) → router B2B
    //   2. caso contrario → wa_pro_handle_message responde (inclusive quando
    //      intent eh unknown, retorna 'help' + menu — bem melhor que cair
    //      no router B2B que so tem "Comandos: aprova X...").
    if (role === 'admin' && !looksLikeB2B(content)) {
      // Pre-clear state se msg bate em comando global — evita state residual
      // (ex: awaiting_patient_registration) capturar e retornar erro CPF/sexo.
      if (looksLikeGlobalAdminCommand(normalizeForAdmin(content))) {
        await clearContext(phone)
      }
      const waPro = await callWaProAdmin(phone, content)
      if (waPro?.ok && waPro?.response) {
        const waIntent = waPro.intent || 'unknown'
        const res = await evoSendText(phone, waPro.response, 'mira')
        await logDispatch({
          phone, text: waPro.response, waId: res.waId, inst: res.inst,
          eventKey: `admin.${waIntent}`, recipientRole: 'admin',
        })
        if (waMsgId) await markProcessed(waMsgId)
        return json({
          ok: true, phone, wa_message_id: waMsgId,
          routed_to: 'wa_pro_admin', intent: waIntent,
          transcribed: transcribedFromAudio,
          content_preview: content.slice(0, 120),
        })
      }
      // Fall-through: msg admin com teor B2B → router B2B
    }

    // Normaliza telefone pra formato router (que usa lastDigits/normalize55).
    // Evolution entrega sem +, apenas digitos; basta passar adiante.
    const currentState = await stateGet(phone)
    const routerResp = await callRouter(phone, content, currentState)

    // Atualiza state (pode ser null, objeto, ou ausente → mantém atual)
    if (Object.prototype.hasOwnProperty.call(routerResp || {}, 'next_state')) {
      await stateSet(phone, routerResp.next_state ?? null)
    }

    // Reply principal sempre vai pela Mira (conversa com parceira/admin que mandou msg).
    if (routerResp?.reply) {
      const res = await evoSendText(phone, routerResp.reply, 'mira')
      await logDispatch({
        phone, text: routerResp.reply, waId: res.waId, inst: res.inst,
        eventKey: 'mira_router_reply', recipientRole: 'partner',
      })
    }

    // Actions colaterais — respeita hint "via" do router pra escolher instancia
    // (via: 'lara' manda voucher/msg pra lead pela Lara/Mih; 'mira' = padrao).
    const actions: any[] = Array.isArray(routerResp?.actions) ? routerResp.actions : []
    for (const a of actions) {
      if (a?.kind === 'send_wa' && a?.to && a?.content) {
        try {
          const res = await evoSendText(String(a.to), String(a.content), a.via)
          const role: 'beneficiary' | 'partner' | 'admin' =
            a.via === 'lara' ? 'beneficiary'
            : String(a.to) === String(a.to).replace(/\D/g, '') && a.to === phone ? 'partner'
            : 'admin'
          await logDispatch({
            phone: String(a.to), text: String(a.content),
            waId: res.waId, inst: res.inst,
            eventKey: a.event_key || 'mira_router_action',
            recipientRole: role,
          })
        } catch (e) {
          console.error('[action send_wa]', (e as Error).message)
        }
      }
    }

    // Marca como processado apos sucesso — se algo jogou exception antes,
    // deixa sem marcar pra Evolution retry re-entregar e completar.
    if (waMsgId) await markProcessed(waMsgId)

    return json({
      ok: true,
      phone,
      wa_message_id: waMsgId,
      transcribed: transcribedFromAudio,
      content_preview: content.slice(0, 120),
      reply_preview: (routerResp?.reply || '').slice(0, 120),
      actions_count: actions.length,
    })
  } catch (e) {
    console.error('[mira-inbound] erro:', (e as Error).message)
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
