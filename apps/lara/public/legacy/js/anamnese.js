/**
 * ClinicAI — Módulo de Anamnese Digital
 *
 * Admin: listagem de templates, builder de sessões/campos,
 *        gestão de solicitações e visualização de respostas com flags.
 *
 * Usa Supabase REST API diretamente (tabelas relacionais, não clinic_data).
 *
 * ⚠ GLOBALS OWNED BY THIS FILE:
 *   initAnamneseAdmin, anamneseTab, anamneseOpenBuilder, anamneseCloseBuilder
 *   anamnBuilderTab, anamnSaveTemplate, anamnAddSession, anamnEditSession
 *   anamnDeleteSession, anamnAddField, anamnSaveField, anamnDeleteField
 *   anamnOpenFieldOptions, anamnSaveFieldOptions
 *   anamneseOpenRequest, anamneseCreateRequest, anamneseCopyLink, anamneseRevokeRequest
 *   anamneseOpenResponse
 */

// ── Imports (ES module) ───────────────────────────────────────────────────
import {
  _get, _post, _patch, _delete, _rpc, _upsert, _upsertLeadAsPatient,
  _state, _dnd, _rawLinksBySlug,
  _parseDbError, _clinicId, _isUUID,
  _esc, _catColor, _catLabel, _fieldTypeLabel, _fmtDate, _parseCondValue,
  _copyToClipboard, _showLoading, _showError, _showToast,
  _setRawLink, _getRawLink,
} from './anamnese-core.js'

import './anamnese-builder.js'

// ── Constantes de paginação (REF-05) ─────────────────────────────────────────
const _REQ_PAGE  = 20
const _RESP_PAGE = 20

// ── Inicialização ─────────────────────────────────────────────────────────
function initAnamneseAdmin() {
  _render()
  anamneseTab(_state.tab)
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function anamneseTab(tab) {
  _state.tab = tab
  ;['templates','requests','responses'].forEach(t => {
    const btn = document.getElementById('anmTab_' + t)
    const pnl = document.getElementById('anmPanel_' + t)
    if (btn) btn.classList.toggle('csn-active', t === tab)
    if (pnl) pnl.style.display = t === tab ? 'block' : 'none'
  })
  if (tab === 'templates')  _loadTemplates()
  if (tab === 'requests')   _loadRequests()
  if (tab === 'responses')  _loadResponses()
}

// ── TEMPLATES ─────────────────────────────────────────────────────────────
async function _loadTemplates() {
  const el = document.getElementById('anmPanel_templates')
  if (!el) return
  const listEl = document.getElementById('anmTemplatesList') || el
  _showLoading(listEl)
  try {
    const cid = _clinicId()
    const data = await _get('/anamnesis_templates', {
      'clinic_id': 'eq.' + cid,
      'deleted_at': 'is.null',
      'order':     'created_at.desc',
      'select':    '*',
    })
    _state.templates = data || []
    _renderTemplates()
  } catch (e) {
    _showError(listEl, e.message)
  }
}

function _renderTemplates() {
  const el = document.getElementById('anmTemplatesList')
  if (!el) return
  const tpls = _state.templates
  if (!tpls.length) {
    el.innerHTML = `<div class="anm-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1" ry="1"/></svg><p>Nenhum template criado.<br>Crie seu primeiro modelo de anamnese.</p></div>`
    return
  }
  el.innerHTML = tpls.map(t => `
    <div class="anm-card">
      <div class="anm-card-header">
        <div class="anm-card-icon" style="background:${_catColor(t.category)}22;color:${_catColor(t.category)}">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1" ry="1"/></svg>
        </div>
        <div class="anm-card-info">
          <div class="anm-card-title">${_esc(t.name)}</div>
          <div class="anm-card-sub">${_catLabel(t.category)} · v${t.version}</div>
        </div>
        <div class="anm-card-badge ${t.is_active ? 'badge-green' : 'badge-gray'}">${t.is_active ? 'Ativo' : 'Inativo'}</div>
      </div>
      ${t.description ? `<div class="anm-card-desc">${_esc(t.description)}</div>` : ''}
      <div class="anm-card-footer">
        <button class="anm-btn-sm" onclick="anamneseOpenBuilder('${t.id}')">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Builder
        </button>
        <button class="anm-btn-sm" onclick="anamneseNewRequest('${t.id}', '${_esc(t.name)}')">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Enviar Link
        </button>
        <button class="anm-btn-sm anm-btn-danger" onclick="anamneseDeleteTemplate('${t.id}')">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
        ${t.is_default ? '<span class="anm-default-badge">Padrão</span>' : ''}
      </div>
    </div>
  `).join('')
}

function anamneseNewTemplate() {
  let modal = document.getElementById('anmNewTplModal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'anmNewTplModal'
    modal.style.cssText = 'position:fixed;inset:0;z-index:9300;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center'
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:16px">Novo Template</div>
        <div class="cs-label-wrap" style="margin-bottom:8px">
          <label class="cs-label">Nome do template <span style="color:#EF4444">*</span></label>
          <input id="anmNewTplName" class="cs-input" placeholder="ex: Anamnese Geral" autofocus>
        </div>
        <div class="cs-label-wrap" style="margin-bottom:20px">
          <label class="cs-label">Categoria</label>
          <select id="anmNewTplCat" class="cs-select">
            <option value="general">Geral</option>
            <option value="facial">Facial</option>
            <option value="body">Corporal</option>
            <option value="capillary">Capilar</option>
            <option value="epilation">Epilação</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button class="btn-outline" onclick="document.getElementById('anmNewTplModal').remove()">Cancelar</button>
          <button class="btn-primary" onclick="_confirmNewTemplate()">Criar Template</button>
        </div>
      </div>`
    document.body.appendChild(modal)
  }
  modal.style.display = 'flex'
  setTimeout(() => document.getElementById('anmNewTplName')?.focus(), 50)
}

async function _confirmNewTemplate() {
  const nome = document.getElementById('anmNewTplName')?.value?.trim()
  const cat  = document.getElementById('anmNewTplCat')?.value || 'general'
  if (!nome) { document.getElementById('anmNewTplName')?.focus(); return }
  document.getElementById('anmNewTplModal')?.remove()
  try {
    const rows = await _post('/anamnesis_templates', [{
      clinic_id:   _clinicId(),
      name:        nome,
      category:    cat,
      is_active:   true,
      is_default:  false,
      version:     1,
    }])
    _state.templates.unshift(rows[0])
    _renderTemplates()
    _showToast('Template "' + nome + '" criado')
    window.anamneseOpenBuilder(rows[0].id)
  } catch (e) {
    _showToast('Erro ao criar template: ' + e.message, 'error')
  }
}

async function anamneseDeleteTemplate(id) {
  if (!confirm('Excluir este template? Solicitações existentes não serão afetadas.')) return
  try {
    await _patch('/anamnesis_templates', { 'id': 'eq.' + id }, { deleted_at: new Date().toISOString() })
    _state.templates = _state.templates.filter(t => t.id !== id)
    _renderTemplates()
    _showToast('Template excluído')
  } catch (e) {
    _showToast(_parseDbError(e), 'error')
  }
}


// ── REQUESTS ───────────────────────────────────────────────────────────────
async function _loadRequests(reset = true) {
  const el = document.getElementById('anmPanel_requests')
  if (!el) return
  const listEl = document.getElementById('anmRequestsList') || el
  if (reset) {
    _state.requestsOffset  = 0
    _state.requestsHasMore = false
    _state.requests        = []
    _showLoading(listEl)
  }
  try {
    const cid  = _clinicId()
    const data = await _get('/anamnesis_requests', {
      'clinic_id': 'eq.' + cid,
      'order':     'created_at.desc',
      'select':    '*,anamnesis_templates(name),patients(full_name,phone)',
      'limit':     String(_REQ_PAGE + 1),
      'offset':    String(_state.requestsOffset),
    })
    const rows = data || []
    _state.requestsHasMore = rows.length > _REQ_PAGE
    const page = _state.requestsHasMore ? rows.slice(0, _REQ_PAGE) : rows
    if (reset) {
      _state.requests = page
    } else {
      _state.requests.push(...page)
    }
    _state.requestsOffset += page.length
    _renderRequests()
  } catch (e) {
    _showError(listEl, e.message)
  }
}

async function _loadMoreRequests() {
  if (!_state.requestsHasMore) return
  await _loadRequests(false)
}

function _renderRequests() {
  const el = document.getElementById('anmRequestsList')
  if (!el) return
  const reqs = _state.requests
  if (!reqs.length) {
    el.innerHTML = '<div class="anm-empty"><p>Nenhuma solicitação enviada ainda.</p></div>'
    return
  }
  const statusColor = {
    draft: '#9CA3AF', sent: '#3B82F6', opened: '#8B5CF6',
    in_progress: '#F59E0B', completed: '#10B981', expired: '#EF4444',
    revoked: '#DC2626', cancelled: '#9CA3AF',
  }
  const statusLabel = {
    draft: 'Rascunho', sent: 'Enviado', opened: 'Aberto',
    in_progress: 'Em Progresso', completed: 'Concluído', expired: 'Expirado',
    revoked: 'Revogado', cancelled: 'Cancelado',
  }
  const loadMoreBtn = _state.requestsHasMore
    ? `<div style="text-align:center;padding:16px">
        <button onclick="window._loadMoreRequests()"
          style="padding:8px 20px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#6B7280;font-size:12px;font-weight:600;cursor:pointer">
          Carregar mais
        </button>
       </div>`
    : ''
  el.innerHTML = `
    <table class="anm-table">
      <thead><tr>
        <th>Paciente</th><th>Template</th><th>Status</th>
        <th>Enviado em</th><th>Concluído em</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${reqs.map(r => `
          <tr>
            <td><div class="anm-cell-main">${_esc(r.patients?.full_name || '—')}</div><div class="anm-cell-sub">${_esc(r.patients?.phone || '')}</div></td>
            <td>${_esc(r.anamnesis_templates?.name || '—')}</td>
            <td><span class="anm-status-badge" style="background:${statusColor[r.status]}22;color:${statusColor[r.status]}">${statusLabel[r.status]||r.status}</span></td>
            <td>${r.sent_at ? _fmtDate(r.sent_at) : '—'}</td>
            <td>${r.completed_at ? _fmtDate(r.completed_at) : '—'}</td>
            <td>
              <div style="display:flex;gap:5px">
                <button class="anm-btn-xs" onclick="anameseCopyLink('${r.public_slug}')" title="Copiar link">
                  <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                ${['completed','in_progress','opened'].includes(r.status)
                  ? `<button class="anm-btn-xs" onclick="anamneseOpenResponse('${r.id}', 'request')">Ver</button>`
                  : ''}
                ${!['revoked','cancelled','expired','completed'].includes(r.status)
                  ? `<button class="anm-btn-xs anm-btn-danger-xs" onclick="anamneseRevokeRequest('${r.id}')">Revogar</button>`
                  : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${loadMoreBtn}
  `
}

// Modal para criar nova solicitação
let _newRequestTemplateId = ''
let _newRequestTemplateName = ''

function anamneseNewRequest(templateId, templateName) {
  _newRequestTemplateId   = templateId
  _newRequestTemplateName = templateName
  const modal = document.getElementById('anmNewRequestModal')
  if (!modal) return
  document.getElementById('anmNRTemplateName').textContent = templateName
  document.getElementById('anmNRPatientId').value   = ''
  document.getElementById('anmNRPatientName').value = ''
  document.getElementById('anmNRExpires').value = ''
  _loadPatientSuggestList()
  modal.style.display = 'flex'
}

function anamneseCloseNewRequest() {
  document.getElementById('anmNewRequestModal').style.display = 'none'
}

function _loadPatientSuggestList() {
  const allLeads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
  const leads = allLeads.filter(l => !l.deleted && (l.name || l.nome))
    .sort((a, b) => (a.name || a.nome || '').localeCompare(b.name || b.nome || '', 'pt-BR'))

  const dl = document.getElementById('anmPatientList')
  if (dl) {
    dl.innerHTML = leads.map(l =>
      `<option value="${_esc(l.name || l.nome || '')}">`
    ).join('')
  }

  window._anmPatientMap = {}
  window._anmLeadMap    = {}
  leads.forEach(l => {
    const name = l.name || l.nome || ''
    window._anmPatientMap[name] = l.id
    window._anmLeadMap[l.id]   = l
  })
}

function anamnPatientInput(val) {
  const id = window._anmPatientMap?.[val] || ''
  document.getElementById('anmNRPatientId').value = id
}

async function anamneseCreateRequest() {
  const leadId = document.getElementById('anmNRPatientId').value.trim()
  const exp    = document.getElementById('anmNRExpires').value
  if (!leadId) { if (window._showToast) _showToast('Atenção', 'Selecione um paciente', 'warn'); return }
  try {
    // Garante que o lead existe na tabela patients do Supabase (upsert seguro)
    const patientId = await _upsertLeadAsPatient(leadId)

    const result = await _rpc('create_anamnesis_request', {
      p_clinic_id:   _clinicId(),
      p_patient_id:  patientId,
      p_template_id: _newRequestTemplateId,
      // Default: 30 dias se o campo de expiração não foi preenchido
      p_expires_at:  exp ? new Date(exp).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const r = Array.isArray(result) ? result[0] : result

    // Constrói o link usando form-render.html (formulário do paciente)
    // Token no fragment (#) — não é enviado em Referer nem aparece em logs de servidor
    const fullLink = location.origin + '/form-render.html?slug=' + r.public_slug + '#token=' + r.raw_token

    // Persiste link no sessionStorage — permite re-cópia após navegação interna (REF-04)
    // raw_token não é recuperável do banco (guardado apenas como hash SHA-256)
    _setRawLink(r.public_slug, fullLink)

    anamneseCloseNewRequest()
    _copyToClipboard(fullLink)
    _showLinkModal(r.public_slug, fullLink)

    // ── WhatsApp automatico: enviar link ao paciente ──
    _sendAnamneseWhatsApp(leadId, fullLink)

    anamneseTab('requests')
  } catch (e) {
    _showToast('Erro ao criar solicitação: ' + _parseDbError(e), 'error')
  }
}

// Mostra modal com o link completo do paciente para facilitar cópia / envio.
// Chamada automaticamente após criar solicitação e pelo botão "Copiar link" na listagem.
function _showLinkModal(slug, link) {
  const existing = document.getElementById('anmLinkModal')
  if (existing) existing.remove()

  const modal = document.createElement('div')
  modal.id = 'anmLinkModal'
  modal.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center'
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 28px 24px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:#111">Link do Paciente</div>
        <button onclick="document.getElementById('anmLinkModal').remove()"
                style="background:none;border:none;cursor:pointer;color:#6B7280;padding:4px;line-height:0">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div style="font-size:12px;color:#6B7280;margin-bottom:8px">
        Copie e envie este link ao paciente. O token é exibido apenas uma vez — após recarregar a página não será possível recuperá-lo.
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="anmLinkModalInput" type="text" value="${_esc(link)}" readonly
               style="flex:1;font-size:12px;padding:10px 12px;border:1.5px solid #E5E7EB;border-radius:8px;color:#374151;background:#F9FAFB;min-width:0;cursor:text"
               onclick="this.select()">
        <button id="anmLinkModalCopyBtn"
                onclick="_copyLinkFromModal('${_esc(slug)}')"
                style="white-space:nowrap;padding:10px 16px;border:none;border-radius:8px;background:#7C3AED;color:#fff;font-size:12px;font-weight:600;cursor:pointer">
          Copiar
        </button>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between">
        <button onclick="_resendAnamneseWA('${_esc(slug)}')"
                style="padding:8px 14px;border:1.5px solid #25D366;border-radius:8px;background:#fff;color:#25D366;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          Reenviar WhatsApp
        </button>
        <span style="font-size:11px;color:#9CA3AF">slug: ${_esc(slug)}</span>
      </div>
    </div>`

  document.body.appendChild(modal)
  // Fecha ao clicar fora
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
  // Seleciona o input automaticamente
  setTimeout(() => document.getElementById('anmLinkModalInput')?.select(), 50)
}

function _copyLinkFromModal(slug) {
  const link = _getRawLink(slug)
  if (!link) {
    _showToast('Link não disponível. O token só é exibido no momento da criação.', 'info')
    return
  }
  _copyToClipboard(link)
  const btn = document.getElementById('anmLinkModalCopyBtn')
  if (btn) {
    btn.textContent = 'Copiado!'
    btn.style.background = '#059669'
    setTimeout(() => { btn.textContent = 'Copiar'; btn.style.background = '#7C3AED' }, 2000)
  }
  _showToast('Link copiado!')
}

// ── WhatsApp automatico: enviar link da anamnese ao paciente ──
function _sendAnamneseWhatsApp(leadId, link) {
  if (!window._sbShared) return
  try {
    var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    var lead = leads.find(function(l) { return l.id === leadId })
    if (!lead) return
    var phone = ((lead.whatsapp || lead.phone || lead.telefone) || '').replace(/\D/g, '')
    if (!phone) { _showToast('Paciente sem telefone — envie o link manualmente', 'warning'); return }
    var nome = lead.nome || lead.name || 'Paciente'
    var clinica = window._getClinicaNome ? _getClinicaNome() : 'Clinica'

    var msg = 'Ola, *' + nome + '*!\n\n'
      + 'Para garantirmos o melhor atendimento personalizado, pedimos que preencha sua *Ficha de Anamnese* antes da consulta:\n\n'
      + link + '\n\n'
      + 'O preenchimento e rapido (5 min) e nos ajuda a entender melhor o seu historico e objetivos.\n\n'
      + 'Qualquer duvida estamos a disposicao!\n'
      + '*Equipe ' + clinica + '*'

    window._sbShared.rpc('wa_outbox_enqueue_appt', {
      p_phone: phone,
      p_content: msg,
      p_lead_name: nome,
    }).then(function(res) {
      if (res.error) {
        console.warn('[Anamnese] WA falhou:', res.error.message)
        _showToast('Link copiado, mas WhatsApp falhou — envie manualmente', 'warning')
      } else {
        _showToast('Link enviado via WhatsApp para ' + nome, 'success')
      }
    }).catch(function(e) {
      console.warn('[Anamnese] WA exception:', e)
      _showToast('Link copiado, mas WhatsApp falhou', 'warning')
    })
  } catch(e) {
    console.warn('[Anamnese] _sendAnamneseWhatsApp erro:', e)
  }
}

function _resendAnamneseWA(slug) {
  var link = _getRawLink(slug)
  if (!link) { _showToast('Link nao disponivel. O token so e exibido na criacao.', 'warning'); return }
  // Find the request to get the patient
  var reqRow = document.querySelector('[data-slug="' + slug + '"]')
  var leadId = reqRow ? reqRow.dataset.patientId : null
  if (leadId) {
    _sendAnamneseWhatsApp(leadId, link)
  } else {
    _showToast('Paciente nao encontrado — copie e envie manualmente', 'warning')
  }
}

function anameseCopyLink(slug) {
  const link = _getRawLink(slug)
  if (link) {
    _showLinkModal(slug, link)
    return
  }
  // Token não recuperável após a sessão do browser terminar — por design de segurança
  // (armazenado como hash SHA-256 no banco, nunca em plain-text)
  _showToast('Link não disponível. Revogue esta solicitação e crie uma nova para obter um link fresco.', 'info')
}

async function anamneseRevokeRequest(requestId) {
  if (!confirm('Revogar esta solicitação? O paciente não conseguirá mais acessar o link.')) return
  try {
    await _patch('/anamnesis_requests',
      { 'id': 'eq.' + requestId },
      { status: 'revoked', revoked_at: new Date().toISOString() }
    )
    const req = _state.requests.find(r => r.id === requestId)
    if (req) req.status = 'revoked'
    _renderRequests()
    _showToast('Solicitação revogada')
  } catch (e) {
    _showToast(_parseDbError(e), 'error')
  }
}

// ── RESPONSES ──────────────────────────────────────────────────────────────
async function _loadResponses(reset = true) {
  const el = document.getElementById('anmPanel_responses')
  if (!el) return
  const listEl = document.getElementById('anmResponsesList') || el
  if (reset) {
    _state.responsesOffset  = 0
    _state.responsesHasMore = false
    _state.responses        = []
    _showLoading(listEl)
  }
  try {
    const cid  = _clinicId()
    const data = await _get('/anamnesis_responses', {
      'clinic_id': 'eq.' + cid,
      'order':     'updated_at.desc',
      'select':    '*,patients(full_name),anamnesis_templates(name),anamnesis_requests(public_slug)',
      'limit':     String(_RESP_PAGE + 1),
      'offset':    String(_state.responsesOffset),
    })
    const rows = data || []
    _state.responsesHasMore = rows.length > _RESP_PAGE
    const page = _state.responsesHasMore ? rows.slice(0, _RESP_PAGE) : rows
    if (reset) {
      _state.responses = page
    } else {
      _state.responses.push(...page)
    }
    _state.responsesOffset += page.length
    _renderResponsesList()
  } catch (e) {
    _showError(listEl, e.message)
  }
}

async function _loadMoreResponses() {
  if (!_state.responsesHasMore) return
  await _loadResponses(false)
}

function _renderResponsesList() {
  const el = document.getElementById('anmResponsesList')
  if (!el) return
  const resps = _state.responses
  if (!resps.length) {
    el.innerHTML = '<div class="anm-empty"><p>Nenhuma resposta registrada ainda.</p></div>'
    return
  }
  const statusColor = { not_started:'#9CA3AF', in_progress:'#F59E0B', completed:'#10B981', abandoned:'#EF4444', cancelled:'#9CA3AF' }
  const statusLabel = { not_started:'Não iniciado', in_progress:'Em Progresso', completed:'Concluído', abandoned:'Abandonado', cancelled:'Cancelado' }
  const loadMoreBtn = _state.responsesHasMore
    ? `<div style="text-align:center;padding:16px">
        <button onclick="window._loadMoreResponses()"
          style="padding:8px 20px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#6B7280;font-size:12px;font-weight:600;cursor:pointer">
          Carregar mais
        </button>
       </div>`
    : ''
  el.innerHTML = `
    <table class="anm-table">
      <thead><tr>
        <th>Paciente</th><th>Template</th><th>Progresso</th>
        <th>Status</th><th>Concluído em</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${resps.map(r => `
          <tr>
            <td>${_esc(r.patients?.full_name || '—')}</td>
            <td>${_esc(r.anamnesis_templates?.name || '—')}</td>
            <td>
              <div class="anm-progress-bar">
                <div class="anm-progress-fill" style="width:${r.progress_percent}%"></div>
              </div>
              <div class="anm-progress-text">${parseFloat(r.progress_percent).toFixed(0)}%</div>
            </td>
            <td><span class="anm-status-badge" style="background:${statusColor[r.status]}22;color:${statusColor[r.status]}">${statusLabel[r.status]||r.status}</span></td>
            <td>${r.completed_at ? _fmtDate(r.completed_at) : '—'}</td>
            <td><button class="anm-btn-xs" onclick="anamneseOpenResponse('${r.id}')">Ver</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${loadMoreBtn}
  `
}

// hint = 'request' quando chamado da aba Requests (id é request_id, não response_id)
function _formatAddress(addr) {
  if (!addr) return ''
  if (typeof addr === 'string') { try { addr = JSON.parse(addr) } catch(e) { return addr } }
  var parts = []
  if (addr.logradouro) parts.push(addr.logradouro + (addr.numero ? ', ' + addr.numero : ''))
  if (addr.complemento) parts.push(addr.complemento)
  if (addr.bairro) parts.push(addr.bairro)
  var cityState = []
  if (addr.cidade) cityState.push(addr.cidade)
  if (addr.estado) cityState.push(addr.estado)
  if (cityState.length) parts.push(cityState.join(' - '))
  if (addr.cep) parts.push('CEP: ' + addr.cep)
  return parts.join(' | ') || '—'
}

async function anamneseOpenResponse(idArg, hint) {
  const modal = document.getElementById('anmResponseModal')
  if (!modal) return
  _showLoading(document.getElementById('anmResponseContent'))
  modal.style.display = 'flex'

  try {
    // 1. Resolve o response_id a partir do argumento recebido
    let responseId = null

    if (hint === 'request') {
      // Chamada da aba Requests: idArg é request_id; busca response pelo FK request_id
      const inState = _state.responses.find(r => r.request_id === idArg)
      if (inState) {
        responseId = inState.id
      } else {
        // Estado local pode estar vazio (aba Responses não foi visitada) — consulta DB
        const byReq = await _get('/anamnesis_responses', {
          'request_id': 'eq.' + idArg,
          'select':     'id',
          'limit':      '1',
        })
        responseId = byReq?.[0]?.id || null
      }
    } else {
      // Chamada da aba Responses: idArg é response_id direto
      responseId = idArg
    }

    if (!responseId) {
      _showError(document.getElementById('anmResponseContent'), 'Resposta não encontrada para esta solicitação.')
      return
    }

    // 2. Carrega resposta, respostas de campos, sessões, flags e sugestões em paralelo
    const [respData, answers, flags, suggestions] = await Promise.all([
      _get('/anamnesis_responses', {
        'id':     'eq.' + responseId,
        'select': '*,patients(*),anamnesis_templates(name,id)',
      }),
      _get('/anamnesis_answers', {
        'response_id': 'eq.' + responseId,
        // order_index para ordenação correta dentro de cada sessão
        'select': '*,anamnesis_fields(label,field_key,field_type,session_id,order_index)',
        'order':  'created_at.asc',
      }),
      _get('/anamnesis_response_flags', {
        'response_id': 'eq.' + responseId,
        'order': 'severity.desc',
      }),
      _get('/anamnesis_response_protocol_suggestions', {
        'response_id': 'eq.' + responseId,
        'order': 'priority.desc',
      }),
    ])

    const rd = (respData || [])[0]

    // 3. Carrega sessões do template para exibir títulos no agrupamento
    let sessions = []
    if (rd?.template_id) {
      try {
        sessions = await _get('/anamnesis_template_sessions', {
          'template_id': 'eq.' + rd.template_id,
          'is_active':   'eq.true',
          'deleted_at':  'is.null',
          'order':       'order_index.asc',
          'select':      'id,title,order_index',
        }) || []
      } catch (_) { /* não crítico — respostas ainda são exibidas sem títulos de sessão */ }
    }

    _state.responseData = { response: rd, answers, flags, suggestions, sessions }
    _renderResponseModal()
  } catch (e) {
    _showError(document.getElementById('anmResponseContent'), e.message)
  }
}

function anamneseCloseResponse() {
  document.getElementById('anmResponseModal').style.display = 'none'
  _state.responseData = null
}

function _renderResponseModal() {
  const el = document.getElementById('anmResponseContent')
  if (!el || !_state.responseData) return
  const { response, answers, flags, suggestions, sessions } = _state.responseData
  const pat = response?.patients

  // full_name é coluna gerada (first_name || ' ' || last_name); fallback manual para segurança
  const patName = pat?.full_name
    || ((pat?.first_name || '') + ' ' + (pat?.last_name || '')).trim()
    || '—'

  const severityColor = { info:'#3B82F6', warning:'#F59E0B', high:'#EF4444', critical:'#DC2626' }
  const severityLabel = { info:'Info', warning:'Atenção', high:'Alto', critical:'Crítico' }

  // ── Agrupa respostas por sessão ────────────────────────────────────────────
  // Ordena cada grupo por order_index do campo (preserva a ordem do template)
  const sessMap = {}   // session_id → {title, items:[]}
  const noSess  = []   // respostas cujo campo não tem session_id (edge case)

  ;(sessions || []).forEach(s => {
    sessMap[s.id] = { title: s.title, items: [] }
  })

  ;(answers || []).sort((a, b) => {
    const oa = a.anamnesis_fields?.order_index ?? 9999
    const ob = b.anamnesis_fields?.order_index ?? 9999
    return oa - ob
  }).forEach(a => {
    const sid = a.anamnesis_fields?.session_id
    if (sid && sessMap[sid]) {
      sessMap[sid].items.push(a)
    } else {
      noSess.push(a)
    }
  })

  // Gera HTML de uma resposta individual
  const answerHtml = (a) => {
    const label = a.anamnesis_fields?.label || a.field_key
    let   val   = a.normalized_text
    // Fallback: formata value_json legível
    if (!val && a.value_json !== null && a.value_json !== undefined) {
      if (Array.isArray(a.value_json)) val = a.value_json.join(', ')
      else if (typeof a.value_json === 'object') val = JSON.stringify(a.value_json)
      else val = String(a.value_json)
    }
    return `
      <div class="anm-answer-item">
        <div class="anm-answer-label">${_esc(label)}</div>
        <div class="anm-answer-val">${_esc(val || '—')}</div>
      </div>`
  }

  // Gera blocos agrupados por sessão
  const sessionsWithAnswers = (sessions || []).filter(s => sessMap[s.id]?.items.length)
  const groupedHtml = sessionsWithAnswers.length
    ? sessionsWithAnswers.map(s => `
        <div class="anm-response-sess-group">
          <div class="anm-response-sess-title">${_esc(s.title)}</div>
          <div class="anm-answers-list">
            ${sessMap[s.id].items.map(answerHtml).join('')}
          </div>
        </div>
      `).join('')
    // Sem dados de sessão (preview/teste) — lista plana
    : (answers || []).map(answerHtml).join('')

  const noSessHtml = noSess.length
    ? `<div class="anm-answers-list">${noSess.map(answerHtml).join('')}</div>`
    : ''

  const totalAnswers = (answers || []).length

  el.innerHTML = `
    <div class="anm-response-layout">
      <!-- Dados gerais do paciente -->
      <div class="anm-response-section">
        <div class="anm-response-section-title">Paciente</div>
        <div class="anm-response-grid2">
          <div><label>Nome</label><div style="font-weight:600">${_esc(patName)}</div></div>
          <div><label>Telefone</label><div>${_esc(pat?.phone || '—')}</div></div>
          ${pat?.cpf ? `<div><label>CPF</label><div>${_esc(pat.cpf)}</div></div>` : ''}
          ${pat?.sex ? `<div><label>Sexo</label><div>${pat.sex === 'M' ? 'Masculino' : 'Feminino'}</div></div>` : ''}
          ${pat?.birth_date ? `<div><label>Nascimento</label><div>${_esc(pat.birth_date)}</div></div>` : ''}
          ${pat?.rg ? `<div><label>RG</label><div>${_esc(pat.rg)}</div></div>` : ''}
          ${pat?.email ? `<div><label>E-mail</label><div>${_esc(pat.email)}</div></div>` : ''}
          ${response?.progress_percent != null ? `<div><label>Progresso</label><div>${parseFloat(response.progress_percent).toFixed(0)}%</div></div>` : ''}
        </div>
        ${pat?.address_json ? `<div style="margin-top:8px"><label style="font-size:10px;color:#9CA3AF;font-weight:600">Endereco</label><div style="font-size:12px;color:#374151">${_formatAddress(pat.address_json)}</div></div>` : ''}
      </div>

      <!-- Flags clínicas -->
      ${flags?.length ? `
        <div class="anm-response-section">
          <div class="anm-response-section-title">Flags Clínicas (${flags.length})</div>
          <div class="anm-flags-list">
            ${flags.map(f => `
              <div class="anm-flag-item anm-flag-${f.severity}">
                <div class="anm-flag-sev" style="background:${severityColor[f.severity]}22;color:${severityColor[f.severity]}">${severityLabel[f.severity]}</div>
                <div class="anm-flag-msg"><strong>${_esc(f.flag_code)}</strong> — ${_esc(f.message)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Sugestões de protocolo -->
      ${suggestions?.length ? `
        <div class="anm-response-section">
          <div class="anm-response-section-title">Protocolos Sugeridos (${suggestions.length})</div>
          <div class="anm-proto-list">
            ${suggestions.map(s => `
              <div class="anm-proto-item">
                <div class="anm-proto-code">${_esc(s.protocol_code)}</div>
                <div class="anm-proto-name">${_esc(s.protocol_name)}</div>
                ${s.reason ? `<div class="anm-proto-reason">${_esc(s.reason)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Consentimento LGPD -->
      ${(() => {
        const lgpd = (answers||[]).find(a => a.field_key === '__lgpd_consent')
        if (!lgpd || !lgpd.value_json) return ''
        const c = typeof lgpd.value_json === 'string' ? JSON.parse(lgpd.value_json) : lgpd.value_json
        return `<div class="anm-response-section" style="background:#F0FDF4;border-radius:8px;padding:10px 14px;border:1px solid #BBF7D0">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#065F46">
            <svg width="14" height="14" fill="none" stroke="#10B981" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Consentimento LGPD
          </div>
          <div style="font-size:11px;color:#374151;margin-top:4px">
            Aceito em: <strong>${_esc(c.accepted_at || '—')}</strong> |
            Versao: ${_esc(c.terms_version || '1.0')} |
            Slug: ${_esc(c.form_slug || '—')}
          </div>
        </div>`
      })()}

      <!-- Respostas agrupadas por sessao -->
      <div class="anm-response-section">
        <div class="anm-response-section-title">Respostas (${totalAnswers})</div>
        ${totalAnswers ? groupedHtml + noSessHtml : '<div style="color:#9CA3AF;font-size:13px;padding:8px 0">Nenhuma resposta registrada ainda.</div>'}
      </div>
    </div>
  `
}

// ── RENDER PRINCIPAL ───────────────────────────────────────────────────────
function _render() {
  const page = document.getElementById('page-settings-anamnese')
  if (!page) return
  page.innerHTML = `
    <div class="page-title-row">
      <div class="page-title-left">
        <h1 class="page-title">Fichas de Anamnese</h1>
        <p class="page-subtitle">Templates, solicitações de preenchimento e respostas clínicas com flags automáticas</p>
      </div>
      <div class="page-title-actions" id="anmPageActions"></div>
    </div>

    <!-- Tabs principais -->
    <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap">
      <button id="anmTab_templates" class="csn csn-active" onclick="anamneseTab('templates')">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        Templates
      </button>
      <button id="anmTab_requests" class="csn" onclick="anamneseTab('requests')">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Solicitações
      </button>
      <button id="anmTab_responses" class="csn" onclick="anamneseTab('responses')">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Respostas
      </button>
    </div>

    <!-- Panel: Templates -->
    <div id="anmPanel_templates">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:13px;color:#6B7280">Modelos de formulários clínicos multi-step</div>
        <button class="btn-primary" onclick="anamneseNewTemplate()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Template
        </button>
      </div>
      <div id="anmTemplatesList" class="anm-cards-grid"></div>
    </div>

    <!-- Panel: Requests -->
    <div id="anmPanel_requests" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:13px;color:#6B7280">Links únicos enviados a pacientes</div>
      </div>
      <div id="anmRequestsList"></div>
    </div>

    <!-- Panel: Responses -->
    <div id="anmPanel_responses" style="display:none">
      <div style="font-size:13px;color:#6B7280;margin-bottom:16px">Fichas preenchidas pelos pacientes</div>
      <div id="anmResponsesList"></div>
    </div>

    <!-- Modal: Builder — Split Panel -->
    <div id="anmBuilderModal" style="display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);align-items:center;justify-content:center">
      <div style="position:relative;width:calc(100% - 40px);max-width:1160px;margin:auto;background:#fff;border-radius:20px;display:flex;flex-direction:column;height:88vh;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.18)">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid #F3F4F6;flex-shrink:0">
          <div>
            <div id="anmBuilderTitle" style="font-size:15px;font-weight:700;color:#111"></div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:1px">Builder de Anamnese</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button id="anmBtnTest" onclick="anamnBuilderToggleTest()" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid #7C3AED;border-radius:8px;background:#fff;color:#7C3AED;font-size:12px;font-weight:600;cursor:pointer">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Testar
            </button>
            <button id="anmBtnGeneralSession" onclick="anamnToggleGeneralSession()"
              title="Ativar/Desativar sessão de dados gerais do paciente"
              style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#9CA3AF;font-size:12px;font-weight:600;cursor:pointer">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Dados Gerais
            </button>
            <button onclick="anamnOpenMobilePreview()" title="Testar no celular" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid #10B981;border-radius:8px;background:#fff;color:#10B981;font-size:12px;font-weight:600;cursor:pointer">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              Celular
            </button>
            <button onclick="anamneseCloseBuilder()" style="background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;padding:7px;border-radius:8px;display:flex;align-items:center">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Split Panel Body -->
        <div style="display:flex;flex:1;overflow:hidden">

          <!-- Left: Sessions column -->
          <div style="width:238px;flex-shrink:0;border-right:1px solid #F3F4F6;display:flex;flex-direction:column;background:#FAFAFA">
            <div style="padding:11px 14px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.7px">Sessões</span>
              <button onclick="anamnAddSession()" title="Nova sessão" style="width:22px;height:22px;border-radius:5px;background:#7C3AED;border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center">
                <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
            <div id="anmBSessionsList" style="flex:1;overflow-y:auto;padding:6px"></div>
            <!-- Inline new session form -->
            <div id="anmBNewSessForm" style="display:none;padding:10px 12px;border-top:1px solid #E5E7EB;background:#fff">
              <input id="anmBNewSessTitle" class="cs-input" style="font-size:12px;padding:7px 10px;margin-bottom:5px;width:100%;box-sizing:border-box" placeholder="Nome da sessão..." />
              <input id="anmBNewSessDesc" class="cs-input" style="font-size:12px;padding:7px 10px;margin-bottom:7px;width:100%;box-sizing:border-box" placeholder="Descrição (opcional)" />
              <div style="display:flex;gap:5px">
                <button onclick="anamnSaveNewSession()" style="flex:1;padding:6px;background:#7C3AED;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Criar</button>
                <button onclick="anamnCancelAddSession()" style="flex:1;padding:6px;background:#F3F4F6;color:#374151;border:none;border-radius:6px;font-size:11px;cursor:pointer">Cancelar</button>
              </div>
            </div>
          </div>

          <!-- Right: Fields column -->
          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
            <!-- Subheader -->
            <div style="padding:11px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;flex-shrink:0;min-height:44px">
              <span id="anmBFieldsPanelTitle" style="font-size:12px;font-weight:600;color:#9CA3AF">Selecione uma sessão à esquerda</span>
            </div>
            <!-- Fields list -->
            <div id="anmBFieldsList" style="flex:1;overflow-y:auto;padding:10px 16px;display:flex;flex-direction:column;gap:5px"></div>
            <!-- Type picker -->
            <div id="anmBTypePicker" style="display:none;padding:10px 16px 13px;border-top:1px solid #F3F4F6;background:#F9FAFB;flex-shrink:0">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Tipo de campo</span>
                <button onclick="anamnHideTypePicker()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:11px;padding:2px 4px">cancelar</button>
              </div>
              <div id="anmBTypePillsRow" style="display:flex;flex-wrap:wrap;gap:5px"></div>
            </div>
            <!-- Inline field form -->
            <div id="anmBFieldForm" style="display:none;border-top:2px solid #7C3AED;background:#fff;max-height:52vh;overflow-y:auto;flex-shrink:0"></div>
            <!-- Add field bottom bar -->
            <div id="anmBAddFieldBar" style="display:none;padding:9px 16px;border-top:1px solid #F3F4F6;flex-shrink:0">
              <button onclick="anamnShowTypePicker()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border:1.5px dashed #D1D5DB;border-radius:8px;background:#fff;color:#9CA3AF;font-size:12px;font-weight:500;cursor:pointer" onmouseover="this.style.borderColor='#7C3AED';this.style.color='#7C3AED'" onmouseout="this.style.borderColor='#D1D5DB';this.style.color='#9CA3AF'">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Adicionar campo
              </button>
            </div>
          </div>
        </div>

        <!-- Test Mode Overlay (inside builder) -->
        <div id="anmBTestPane" style="display:none;position:absolute;inset:0;background:#fff;border-radius:20px;z-index:10;flex-direction:column;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #F3F4F6;flex-shrink:0">
            <div>
              <div style="font-size:14px;font-weight:700;color:#111">Modo Teste</div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:2px">Preencha o formulário como o paciente para testar campos e condicionais</div>
            </div>
            <div style="display:flex;gap:8px">
              <button onclick="anamnTestReset()" style="padding:6px 14px;border:1.5px solid #E5E7EB;border-radius:7px;background:#fff;color:#374151;font-size:12px;font-weight:600;cursor:pointer">Limpar</button>
              <button onclick="anamnBuilderToggleTest()" style="padding:6px 14px;border:1.5px solid #E5E7EB;border-radius:7px;background:#fff;color:#374151;font-size:12px;font-weight:600;cursor:pointer">Fechar Teste</button>
            </div>
          </div>
          <div id="anmBTestContent" style="flex:1;overflow-y:auto;padding:24px;max-width:700px;width:100%;margin:0 auto"></div>
        </div>

      </div>
    </div>

    <!-- Modal: Opções do Campo -->
    <div id="anmOptionsModal" style="display:none;position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,.5);align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;width:100%;max-width:480px;max-height:85vh;display:flex;flex-direction:column">
        <!-- Header fixo -->
        <div style="padding:24px 28px 0;flex-shrink:0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div id="anmOptionsTitle" style="font-size:15px;font-weight:700;color:#111"></div>
            <button onclick="anamnCloseOptionsModal()" style="background:none;border:none;cursor:pointer;color:#6B7280">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style="display:grid;grid-template-columns:20px 1fr 1fr 36px;gap:6px;margin-bottom:8px;font-size:11px;font-weight:600;color:#9CA3AF;padding:0 4px">
            <div></div><div>Label</div><div>Valor</div><div></div>
          </div>
        </div>
        <!-- Lista rolável -->
        <div id="anmOptionsList" style="overflow-y:auto;flex:1;padding:0 28px 12px"></div>
        <!-- Footer fixo com botões de ação -->
        <div id="anmOptionsFooter" style="padding:16px 28px;border-top:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:8px;flex-wrap:wrap">
          <div id="anmOptionsAddBtns" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          <button class="btn-outline" onclick="anamnCloseOptionsModal()">Fechar</button>
        </div>
      </div>
    </div>

    <!-- Modal: Nova Solicitação -->
    <div id="anmNewRequestModal" style="display:none;position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.5);align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:460px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div style="font-size:15px;font-weight:700;color:#111">Enviar Anamnese</div>
          <button onclick="anamneseCloseNewRequest()" style="background:none;border:none;cursor:pointer;color:#6B7280">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style="margin-bottom:18px;padding:12px 14px;background:#F5F3FF;border-radius:10px;font-size:13px;color:#5B21B6">
          Template: <strong id="anmNRTemplateName"></strong>
        </div>
        <div class="cs-label-wrap" style="margin-bottom:14px">
          <label class="cs-label">Paciente <span style="color:#EF4444">*</span></label>
          <input id="anmNRPatientName" class="cs-input" list="anmPatientList" placeholder="Buscar paciente..." oninput="anamnPatientInput(this.value)">
          <datalist id="anmPatientList"></datalist>
          <input type="hidden" id="anmNRPatientId">
        </div>
        <div class="cs-label-wrap" style="margin-bottom:20px">
          <label class="cs-label">Expiração (opcional)</label>
          <input type="datetime-local" id="anmNRExpires" class="cs-input">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button class="btn-outline" onclick="anamneseCloseNewRequest()">Cancelar</button>
          <button class="btn-primary" onclick="anamneseCreateRequest()">Gerar Link</button>
        </div>
      </div>
    </div>

    <!-- Modal: Visualizar Resposta -->
    <div id="anmResponseModal" style="display:none;position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.5);align-items:flex-start;justify-content:center;overflow-y:auto;padding:40px 20px">
      <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:800px;position:relative">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div style="font-size:15px;font-weight:700;color:#111">Ficha de Anamnese</div>
          <button onclick="anamneseCloseResponse()" style="background:none;border:none;cursor:pointer;color:#6B7280">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div id="anmResponseContent"></div>
      </div>
    </div>
  `
}

// ── Exposição global ──────────────────────────────────────────────────────
window.initAnamneseAdmin         = initAnamneseAdmin
window.anamneseTab               = anamneseTab
window.anamneseNewTemplate        = anamneseNewTemplate
window._confirmNewTemplate        = _confirmNewTemplate
window.anamneseDeleteTemplate    = anamneseDeleteTemplate
window.anamneseNewRequest        = anamneseNewRequest
window.anamneseCloseNewRequest   = anamneseCloseNewRequest
window.anamneseCreateRequest     = anamneseCreateRequest
window.anameseCopyLink           = anameseCopyLink
window._copyLinkFromModal        = _copyLinkFromModal
window._resendAnamneseWA         = _resendAnamneseWA
window.anamneseRevokeRequest     = anamneseRevokeRequest
window.anamneseOpenResponse      = anamneseOpenResponse
window.anamneseCloseResponse     = anamneseCloseResponse
window.anamnPatientInput         = anamnPatientInput
window._loadMoreRequests         = _loadMoreRequests
window._loadMoreResponses        = _loadMoreResponses
