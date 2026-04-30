// js/anamnese-core.js
// ClinicAI — Anamnese Module Core: config, HTTP, state, utilities

// ── Config (lê de window.ClinicEnv — centralizado em js/config/env.js) ─────
const _env = window.ClinicEnv || {}
export const SUPABASE_URL = _env.SUPABASE_URL || ''
export const SUPABASE_KEY = _env.SUPABASE_KEY || ''
export const BASE_URL = SUPABASE_URL + '/rest/v1'
// ID da clínica — resolve do perfil autenticado, fallback legacy
export const ANAMNESE_CLINIC_ID = (() => { try { const p = JSON.parse(sessionStorage.getItem('clinicai_profile') || 'null'); if (p?.clinic_id) return p.clinic_id } catch {} return '00000000-0000-0000-0000-000000000001' })()

// ── Helpers HTTP ──────────────────────────────────────────────────────────
export function _headers(extra = {}) {
  return {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Prefer':        'return=representation',
    ...extra,
  }
}

export async function _get(path, params = {}) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const url = BASE_URL + path + (qs ? '?' + qs : '')
  const res = await fetch(url, { headers: _headers() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function _post(path, body) {
  const res = await fetch(BASE_URL + path, {
    method:  'POST',
    headers: _headers(),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function _patch(path, params, body) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const res = await fetch(BASE_URL + path + '?' + qs, {
    method:  'PATCH',
    headers: _headers(),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function _delete(path, params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const res = await fetch(BASE_URL + path + '?' + qs, {
    method:  'DELETE',
    headers: _headers({ 'Prefer': 'return=representation' }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function _rpc(fn, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method:  'POST',
    headers: _headers(),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function _upsert(path, body) {
  const res = await fetch(BASE_URL + path, {
    method:  'POST',
    headers: _headers({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Garante que o lead do localStorage existe na tabela patients do Supabase.
// Retorna o UUID do paciente na tabela (usa o leadId como UUID se for válido,
// ou gera um novo UUID e persiste o mapeamento em clinicai_lead_patient_map).
export async function _upsertLeadAsPatient(leadId) {
  const lead = window._anmLeadMap?.[leadId]
  if (!lead) throw new Error('Lead não encontrado')

  // 1. Verifica o mapa local primeiro
  const patientMap = JSON.parse(localStorage.getItem('clinicai_lead_patient_map') || '{}')
  let patientId = patientMap[leadId]

  // 2. Se não tiver no mapa, tenta encontrar no banco pelo id
  if (!patientId) {
    const candidateId = _isUUID(leadId) ? leadId : null
    if (candidateId) {
      try {
        const existing = await _get('/patients', { 'id': 'eq.' + candidateId, 'limit': '1' })
        if (existing?.length) patientId = existing[0].id
      } catch (_) { /* segue para criar */ }
    }
  }

  // 3. Se ainda não encontrou, usa o leadId como UUID (se válido) ou gera um novo
  if (!patientId) {
    patientId = _isUUID(leadId) ? leadId : crypto.randomUUID()
  }

  // Persiste o mapa localmente
  patientMap[leadId] = patientId
  localStorage.setItem('clinicai_lead_patient_map', JSON.stringify(patientMap))

  // Divide o nome em first_name / last_name conforme schema da tabela patients
  const fullName  = (lead.name || lead.nome || 'Paciente').trim()
  const spaceIdx  = fullName.indexOf(' ')
  const firstName = spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName
  const lastName  = spaceIdx > 0 ? fullName.slice(spaceIdx + 1).trim() || null : null

  await _upsert('/patients', [{
    id:         patientId,
    clinic_id:  _clinicId(),
    first_name: firstName,
    last_name:  lastName,
    phone:      lead.phone || lead.whatsapp || lead.telefone || null,
    email:      lead.email || null,
  }])

  return patientId
}

// ── Estado ────────────────────────────────────────────────────────────────
export let _state = {
  tab:          'templates',   // 'templates' | 'requests' | 'responses'
  templates:    [],
  requests:     [],
  responses:    [],
  // builder
  builderOpen:  false,
  builderTab:   'sessions',    // 'sessions' | 'fields' | 'preview'
  tpl:          null,          // template em edição
  sessions:     [],
  fields:       [],
  options:      {},            // field_id → options[]
  editSession:  null,
  editField:    null,
  activeSession: null,         // session selecionada no builder
  _igImages:    [],            // cópia em memória dos dados das imagens (image_pair)
  // request
  requestModal: false,
  // response
  responseModal: false,
  responseData:  null,
  // campo modal
  _pendingOptions: [],
  // paginação (REF-05)
  requestsOffset:   0,
  requestsHasMore:  false,
  responsesOffset:  0,
  responsesHasMore: false,
}

export let _dnd = { type: null, id: null, fieldId: null }

// Mapa session-level de slug → URL completa do link do paciente.
// raw_token só é retornado na criação (armazenado como hash no banco);
// este mapa permite re-copiar o link enquanto a página estiver aberta.
export const _rawLinksBySlug = new Map()

// ── Helper: traduz erros do Postgres para mensagens amigáveis ─────────────
export function _parseDbError(e) {
  let parsed = {}
  try { parsed = JSON.parse(e.message) } catch (_) {}
  const code = parsed.code || ''
  const msg  = parsed.message || e.message || ''
  const det  = parsed.details || ''

  if (code === '23505') {
    if (msg.includes('field_key'))    return 'Já existe um campo com essa chave neste template. Escolha uma chave diferente.'
    if (msg.includes('order_index'))  return 'Conflito de ordenação. Tente novamente.'
    if (det.includes('value'))        return 'Já existe uma opção com esse valor. Use um valor diferente.'
    return 'Registro duplicado. Verifique os dados e tente novamente.'
  }
  if (code === '23503') return 'Referência inválida: registro vinculado não encontrado.'
  if (code === '23502') return 'Campo obrigatório não preenchido.'
  if (code === '22P02') return 'Valor inválido fornecido.'
  if (code === '42501') return 'Permissão negada. Verifique as configurações de acesso.'

  // Fallback: mensagem legível do Postgres (sem JSON bruto)
  return msg || e.message || 'Erro desconhecido. Tente novamente.'
}

export function _clinicId() {
  return ANAMNESE_CLINIC_ID
}

export function _isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '')
}

// ── Utilitários ────────────────────────────────────────────────────────────
export function _esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
}

export function _catColor(c) {
  return { general:'#7C3AED', facial:'#EC4899', body:'#3B82F6', capillary:'#059669', epilation:'#F59E0B', custom:'#6B7280' }[c] || '#7C3AED'
}

export function _catLabel(c) {
  return { general:'Geral', facial:'Facial', body:'Corporal', capillary:'Capilar', epilation:'Epilação', custom:'Customizado' }[c] || c
}

export function _fieldTypeLabel(t, settings) {
  if (t === 'number'           && settings?.display === 'scale_select')  return 'Escala'
  if (t === 'description_text' && settings?.display === 'separator')     return 'Separador'
  if (t === 'description_text' && settings?.display === 'block')         return 'Bloco'
  if (t === 'description_text' && settings?.display === 'image_pair')    return 'Grade de Imagens'
  if (t === 'multi_select'     && settings?.display === 'radio_select')  return 'Seleção única'
  if (t === 'multi_select'     && settings?.display === 'single_select') return 'Lista'
  const m = { text:'Texto', textarea:'Área de texto', rich_text:'Rich Text', number:'Número', date:'Data',
    boolean:'Sim/Não', radio_select:'Seleção única', single_select:'Lista', multi_select:'Múltipla escolha',
    single_select_dynamic:'Seleção dinâmica', scale_select:'Escala', file_upload:'Arquivo',
    image_upload:'Imagem', image_pair:'Grade de Imagens', section_title:'Título', label:'Label', description_text:'Texto descritivo' }
  return m[t] || t
}

export function _fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }) } catch { return s }
}

export function _parseCondValue(val, op) {
  if (val === 'true') return true
  if (val === 'false') return false
  if (!isNaN(val) && val !== '') return Number(val)
  return val
}

export function _copyToClipboard(text) {
  try { navigator.clipboard.writeText(text) } catch { const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta) }
}

export function _showLoading(el) {
  if (!el) return
  if (window.Skeleton) {
    el.innerHTML = '<div style="padding:16px">' + Skeleton.cards(2) + '</div>'
  } else {
    el.innerHTML = '<div style="padding:40px;text-align:center"><div class="sk sk-line sk-w60" style="margin:12px auto"></div><div class="sk sk-line sk-w40" style="margin:8px auto"></div></div>'
  }
}

export function _showError(el, msg) {
  if (!el) return
  el.innerHTML = `<div style="padding:32px;text-align:center;color:#EF4444;font-size:13px">Erro: ${_esc(msg)}</div>`
}

export let _toastTimer = null
// ── Raw link sessionStorage cache (REF-04) ───────────────────────────────
// raw_token é retornado apenas na criação (armazenado como SHA-256 no banco).
// sessionStorage mantém os links enquanto o browser/aba estiver aberto,
// permitindo re-copiar após navegação interna sem recarregar a página.
const _SS_LINK_PFX = 'anm_link_'

export function _setRawLink(slug, link) {
  _rawLinksBySlug.set(slug, link)
  try { sessionStorage.setItem(_SS_LINK_PFX + slug, link) } catch (_) {}
}

export function _getRawLink(slug) {
  if (_rawLinksBySlug.has(slug)) return _rawLinksBySlug.get(slug)
  try {
    const stored = sessionStorage.getItem(_SS_LINK_PFX + slug)
    if (stored) { _rawLinksBySlug.set(slug, stored); return stored }
  } catch (_) {}
  return null
}

export function _showToast(msg, type = 'success') {
  let t = document.getElementById('anmToast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'anmToast'
    t.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;background:#111;color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.25);transform:translateY(-8px);opacity:0;transition:all .25s ease'
    document.body.appendChild(t)
  }
  const iconColor = type === 'error' ? '#F87171' : type === 'info' ? '#60A5FA' : '#4ADE80'
  t.innerHTML = `<svg width="16" height="16" fill="none" stroke="${iconColor}" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> ${_esc(msg)}`
  requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateY(0)' })
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(-8px)' }, 3000)
}
