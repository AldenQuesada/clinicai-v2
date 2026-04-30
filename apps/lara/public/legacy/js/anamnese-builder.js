// js/anamnese-builder.js
// ClinicAI — Anamnese Module Builder: sessions, fields, DnD, test mode, mobile preview

import {
  _get, _post, _patch, _delete, _rpc, _upsert,
  _state, _dnd,
  _parseDbError, _clinicId, _isUUID,
  _esc, _catColor, _catLabel, _fieldTypeLabel, _fmtDate, _parseCondValue,
  _copyToClipboard, _showLoading, _showError, _showToast,
} from './anamnese-core.js'

// ── BUILDER ───────────────────────────────────────────────────────────────
async function anamneseOpenBuilder(templateId) {
  const modal = document.getElementById('anmBuilderModal')
  if (!modal) return
  _state.builderOpen = true
  _state.editSession = null
  _state.editField   = null

  const tpl = _state.templates.find(t => t.id === templateId)
  if (!tpl) return

  _state.tpl = { ...tpl }
  document.getElementById('anmBuilderTitle').textContent = tpl.name
  modal.style.display = 'flex'
  // Atualiza botão Dados Gerais após pequeno delay para o DOM estar pronto
  setTimeout(_updateGeneralSessionBtn, 50)

  // Reset right panel
  const bar = document.getElementById('anmBAddFieldBar')
  const picker = document.getElementById('anmBTypePicker')
  const form = document.getElementById('anmBFieldForm')
  if (bar)    bar.style.display = 'none'
  if (picker) picker.style.display = 'none'
  if (form)   form.style.display = 'none'

  await _loadBuilderSessions()
}

function anamneseCloseBuilder() {
  const modal = document.getElementById('anmBuilderModal')
  if (modal) modal.style.display = 'none'
  _state.builderOpen = false
  _state.tpl = null
  _state.sessions = []
  _state.fields = []
  _state.options = {}
  _state.activeSession = null
  // Hide test pane
  const tp = document.getElementById('anmBTestPane')
  if (tp) tp.style.display = 'none'
}

function anamnBuilderTab(tab) {
  // Legacy no-op — layout is now split panel; test mode handled separately
}

async function _loadBuilderSessions() {
  if (!_state.tpl) return
  try {
    const data = await _get('/anamnesis_template_sessions', {
      'template_id': 'eq.' + _state.tpl.id,
      'is_active':   'eq.true',
      'deleted_at':  'is.null',
      'order':       'order_index.asc',
    })
    _state.sessions = data || []
    _renderBuilderSessions()
    // Auto-select first session to populate right panel
    if (_state.sessions.length) {
      anamnSelectSession(_state.sessions[0].id)
    }
  } catch (e) {
    _showToast('Erro ao carregar sessões: ' + e.message, 'error')
  }
}

function _renderBuilderSessions() {
  const el = document.getElementById('anmBSessionsList')
  if (!el) return
  const ss = _state.sessions
  if (!ss.length) {
    el.innerHTML = '<div style="padding:14px 10px;font-size:12px;color:#9CA3AF;text-align:center">Nenhuma sessão.<br>Clique + para adicionar.</div>'
    return
  }
  el.innerHTML = ss.map(s => {
    const isActive = _state.activeSession?.id === s.id
    return `
    <div class="anm-session-item ${isActive ? 'active' : ''}"
         ondragover="_dndSessOver(event,'${s.id}')"
         ondrop="_dndSessDrop(event,'${s.id}')"
         ondragend="_dndEnd()"
         onclick="anamnSelectSession('${s.id}')">
      <div class="anm-field-drag" draggable="true"
           ondragstart="_dndSessStart(event,'${s.id}')"
           onclick="event.stopPropagation()"
           style="margin-right:2px;padding:4px 3px;border-radius:4px;transition:color .15s,background .15s">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="9" y1="4" x2="15" y2="4"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/><line x1="9" y1="20" x2="15" y2="20"/></svg>
      </div>
      <div class="anm-session-label" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(s.title)}</div>
      <div class="anm-session-actions">
        <button onclick="event.stopPropagation();anamnEditSession('${s.id}')" title="Editar">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button onclick="event.stopPropagation();anamnDeleteSession('${s.id}')" title="Excluir">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`
  }).join('')
}

function anamnSelectSession(sessionId) {
  _state.activeSession = _state.sessions.find(s => s.id === sessionId) || null
  _renderBuilderSessions()
  // Update right panel header
  const title = document.getElementById('anmBFieldsPanelTitle')
  if (title && _state.activeSession) {
    title.textContent = _state.activeSession.title
    title.style.color = '#374151'
  }
  // Show add field bar, hide type picker and form
  const bar    = document.getElementById('anmBAddFieldBar')
  const picker = document.getElementById('anmBTypePicker')
  const form   = document.getElementById('anmBFieldForm')
  if (bar)    bar.style.display = 'block'
  if (picker) picker.style.display = 'none'
  if (form)   form.style.display = 'none'
  _state.editField = null
  _loadBuilderFields()
}

function anamnAddSession() {
  // Show inline form at bottom of sessions list
  const form = document.getElementById('anmBNewSessForm')
  if (!form) return
  const titleInput = document.getElementById('anmBNewSessTitle')
  const descInput  = document.getElementById('anmBNewSessDesc')
  if (titleInput) titleInput.value = ''
  if (descInput)  descInput.value = ''
  form.style.display = 'block'
  setTimeout(() => titleInput?.focus(), 50)
}

function anamnCancelAddSession() {
  const form = document.getElementById('anmBNewSessForm')
  if (form) form.style.display = 'none'
}

async function anamnSaveNewSession() {
  const titulo = document.getElementById('anmBNewSessTitle')?.value?.trim()
  const desc   = document.getElementById('anmBNewSessDesc')?.value?.trim() || ''
  if (!titulo) { document.getElementById('anmBNewSessTitle')?.focus(); return }
  // Consulta o max entre sessões ATIVAS para evitar:
  // 1. Conflito 23505 quando _persistOrder deixou valores altos em memória
  // 2. Herdar índice de tombstone (is_active=false, order_index=800000+)
  let nextOrder = 1
  try {
    const maxRows = await _get('/anamnesis_template_sessions', {
      'template_id': 'eq.' + _state.tpl.id,
      'is_active':   'eq.true',
      'deleted_at':  'is.null',
      'select':      'order_index',
      'order':       'order_index.desc',
      'limit':       '1',
    })
    nextOrder = maxRows?.length ? maxRows[0].order_index + 1 : 1
  } catch (_) {
    nextOrder = _state.sessions.length
      ? Math.max(..._state.sessions.map(s => s.order_index)) + 1
      : 1
  }
  const payload = {
    template_id: _state.tpl.id,
    title:       titulo,
    description: desc || null,
    order_index: nextOrder,
    is_active:   true,
  }
  try {
    const rows = await _post('/anamnesis_template_sessions', [payload])
    const session = rows[0]

    _state.sessions.push(session)
    anamnCancelAddSession()
    _renderBuilderSessions()
    anamnSelectSession(session.id)
    _showToast('Sessão criada')
  } catch (e) {
    _showToast('Erro: ' + e.message, 'error')
  }
}

async function anamnEditSession(sessionId) {
  const s = _state.sessions.find(x => x.id === sessionId)
  if (!s) return
  // Inline edit: show form pre-filled
  const form = document.getElementById('anmBNewSessForm')
  const titleInput = document.getElementById('anmBNewSessTitle')
  const descInput  = document.getElementById('anmBNewSessDesc')
  if (!form) return
  titleInput.value = s.title
  descInput.value  = s.description || ''
  form.style.display = 'block'
  // Temporarily swap save button to update mode
  const btn = form.querySelector('button:first-child')
  if (btn) {
    btn.textContent = 'Salvar'
    btn.onclick = async () => {
      const newTitle = titleInput.value.trim()
      const newDesc  = descInput.value.trim() || ''
      if (!newTitle) return
      try {
        const rows = await _patch('/anamnesis_template_sessions',
          { 'id': 'eq.' + sessionId },
          { title: newTitle, description: newDesc || null }
        )
        Object.assign(s, rows[0])
        anamnCancelAddSession()
        _renderBuilderSessions()
        // Restore button
        btn.textContent = 'Criar'
        btn.onclick = anamnSaveNewSession
        _showToast('Sessão atualizada')
      } catch (e) {
        _showToast('Erro: ' + e.message, 'error')
      }
    }
  }
  setTimeout(() => titleInput?.focus(), 50)
}

async function anamnDeleteSession(sessionId) {
  if (!confirm('Excluir esta sessão e todos os seus campos?')) return
  try {
    const now = new Date().toISOString()

    // 1. Busca IDs dos campos da sessão
    const allFields = await _get('/anamnesis_fields', {
      'session_id': 'eq.' + sessionId,
      'select':     'id',
    })

    // 2. Soft-delete nos campos e desativação das opções (preserva respostas clínicas)
    if (allFields?.length) {
      for (const f of allFields) {
        await _patch('/anamnesis_field_options',
          { 'field_id': 'eq.' + f.id },
          { is_active: false }
        ).catch(e => console.warn("[anamnese-builder]", e.message || e))
      }
      await _patch('/anamnesis_fields',
        { 'session_id': 'eq.' + sessionId },
        { deleted_at: now, is_active: false }
      )
    }

    // 3. Soft-delete na sessão: is_active = false
    //    Move order_index para zona de tombstone (> 800000) para liberar o slot
    //    no índice UNIQUE(template_id, order_index) sem violar CHECK(order_index > 0)
    const tombstoneOrder = 800000 + (Date.now() % 99999)
    await _patch('/anamnesis_template_sessions',
      { 'id': 'eq.' + sessionId },
      { is_active: false, order_index: tombstoneOrder }
    )

    // 4. Atualiza estado local e UI
    _state.sessions = _state.sessions.filter(s => s.id !== sessionId)
    const wasActive = _state.activeSession?.id === sessionId
    if (wasActive) {
      _state.activeSession = _state.sessions[0] || null
    }
    _renderBuilderSessions()
    if (_state.activeSession) {
      anamnSelectSession(_state.activeSession.id)
    } else {
      // Nenhuma sessão restante — limpa painel direito
      _state.fields = []
      const list   = document.getElementById('anmBFieldsList')
      const title  = document.getElementById('anmBFieldsPanelTitle')
      const bar    = document.getElementById('anmBAddFieldBar')
      const form   = document.getElementById('anmBFieldForm')
      const picker = document.getElementById('anmBTypePicker')
      if (list)   list.innerHTML = '<div style="padding:20px;font-size:12px;color:#9CA3AF;text-align:center">Nenhuma sessão. Adicione uma sessão para criar campos.</div>'
      if (title)  { title.textContent = 'Nenhuma sessão'; title.style.color = '#9CA3AF' }
      if (bar)    bar.style.display = 'none'
      if (form)   form.style.display = 'none'
      if (picker) picker.style.display = 'none'
    }
    _showToast('Sessão removida')
  } catch (e) {
    _showToast('Erro: ' + _parseDbError(e), 'error')
  }
}

// ── CAMPOS ─────────────────────────────────────────────────────────────────
async function _loadBuilderFields() {
  if (!_state.activeSession) return
  try {
    const data = await _get('/anamnesis_fields', {
      'session_id': 'eq.' + _state.activeSession.id,
      'deleted_at': 'is.null',
      'order':      'order_index.asc',
    })
    _state.fields = data || []
    _renderBuilderFieldsList()
  } catch (e) {
    _showToast('Erro ao carregar campos: ' + e.message, 'error')
  }
}

// Renderiza a lista de campos a partir do estado (sem fetch)
function _renderBuilderFieldsList() {
  const list = document.getElementById('anmBFieldsList')
  if (!list) return
  const trash = `
    <div class="anm-trash-zone"
         ondragover="_dndTrashOver(event)"
         ondragleave="_dndTrashLeave(event)"
         ondrop="_dndTrashDrop(event)">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      Soltar aqui para excluir
    </div>`
  if (!_state.fields.length) {
    list.innerHTML = '<div class="anm-empty-sm">Nenhum campo nesta sessão.</div>' + trash
    return
  }
  const isSep   = f => f.field_type === 'description_text' && f.settings_json?.display === 'separator'
  const isBlock = f => f.field_type === 'description_text' && f.settings_json?.display === 'block'
  list.innerHTML = _state.fields.map((f, idx) => {
    const sep = isSep(f)
    const dupBtn = `<button onclick="anamnDuplicateField('${f.id}')" title="Duplicar" class="anm-btn-xs" style="padding:3px 6px">
        <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>`
    const delBtn = `<button onclick="anamnDeleteField('${f.id}')" title="Excluir" class="anm-btn-xs anm-btn-danger-xs">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`

    if (sep) return `
      <div class="anm-field-item anm-sep-item" data-field-id="${f.id}"
           ondragover="_dndFieldOver(event,'${f.id}')"
           ondrop="_dndFieldDrop(event,'${f.id}')"
           ondragend="_dndEnd()">
        <div class="anm-field-drag" draggable="true"
             ondragstart="_dndFieldStart(event,'${f.id}')" title="Arrastar para reordenar">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="9" y1="4" x2="15" y2="4"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/><line x1="9" y1="20" x2="15" y2="20"/></svg>
        </div>
        <div style="flex:1;display:flex;align-items:center;gap:8px;padding:0 4px">
          <div style="flex:1;height:1px;border-top:2px dashed #D1D5DB"></div>
          <span style="font-size:10px;color:#9CA3AF;white-space:nowrap;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Separador</span>
          <div style="flex:1;height:1px;border-top:2px dashed #D1D5DB"></div>
        </div>
        <div class="anm-field-actions">${dupBtn}${delBtn}</div>
      </div>`

    if (isBlock(f)) {
      const s = f.settings_json || {}
      const pos = s.image_position || 'left'
      const imgThumb = s.image_url
        ? `<img src="${_esc(s.image_url)}" style="width:100%;height:100%;object-fit:contain;display:block">`
        : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF">
             <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
           </div>`
      const imgPanel = `<div style="width:30%;min-height:52px;background:#fff;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center">${imgThumb}</div>`
      const txtPanel = `<div style="flex:1;padding:4px 8px;display:flex;flex-direction:column;justify-content:center;gap:2px">
          <div style="font-size:12px;font-weight:600;color:#111">${_esc(s.block_title || f.label)}</div>
          ${s.block_description ? `<div style="font-size:11px;color:#9CA3AF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${_esc(s.block_description)}</div>` : ''}
        </div>`
      return `
        <div class="anm-field-item anm-block-item" data-field-id="${f.id}"
             ondragover="_dndFieldOver(event,'${f.id}')"
             ondrop="_dndFieldDrop(event,'${f.id}')"
             ondragend="_dndEnd()">
          <div class="anm-field-drag" draggable="true"
               ondragstart="_dndFieldStart(event,'${f.id}')" title="Arrastar para reordenar">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="9" y1="4" x2="15" y2="4"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/><line x1="9" y1="20" x2="15" y2="20"/></svg>
          </div>
          <div style="flex:1;display:flex;flex-direction:${{left:'row',right:'row-reverse',top:'column',bottom:'column-reverse'}[pos]||'row'};gap:8px;align-items:stretch;min-width:0;overflow:hidden">
            ${imgPanel}${txtPanel}
          </div>
          <div class="anm-field-actions" style="flex-shrink:0">
            ${dupBtn}
            <button onclick="anamnEditField('${f.id}')" title="Editar" class="anm-btn-xs">Editar</button>
            ${delBtn}
          </div>
        </div>`
    }

    return `
      <div class="anm-field-item" data-field-id="${f.id}"
           ondragover="_dndFieldOver(event,'${f.id}')"
           ondrop="_dndFieldDrop(event,'${f.id}')"
           ondragend="_dndEnd()">
        <div class="anm-field-drag" draggable="true"
             ondragstart="_dndFieldStart(event,'${f.id}')" title="Arrastar para reordenar">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="9" y1="4" x2="15" y2="4"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/><line x1="9" y1="20" x2="15" y2="20"/></svg>
        </div>
        <div class="anm-field-info">
          <div class="anm-field-label">${_esc(f.label)} ${f.is_required ? '<span class="anm-req">*</span>' : ''}</div>
          <div class="anm-field-type">${_fieldTypeLabel(f.field_type, f.settings_json)} · <code>${_esc(f.field_key)}</code></div>
        </div>
        <div class="anm-field-actions">
          ${['single_select','radio_select','multi_select','single_select_dynamic'].includes(f.field_type)
            ? `<button onclick="anamnOpenFieldOptions('${f.id}')" title="Opções" class="anm-btn-xs">Opções</button>`
            : ''}
          ${dupBtn}
          <button onclick="anamnEditField('${f.id}')" title="Editar" class="anm-btn-xs">Editar</button>
          ${delBtn}
        </div>
      </div>`
  }).join('') + trash
}

// Entry point: atualiza header e dispara o fetch+render
function _renderBuilderFields() {
  const list = document.getElementById('anmBFieldsList')
  if (!list) return
  if (!_state.activeSession) {
    list.innerHTML = '<div class="anm-empty-sm">Selecione uma sessão.</div>'
    return
  }
  _loadBuilderFields()
}

// ── MODO TESTE ──────────────────────────────────────────────────────────────
let _testValues = {}
let _testSessionIdx = 0
let _testSessions = []
let _testFields = []
let _testOptMap = {}

function anamnBuilderToggleTest() {
  const pane = document.getElementById('anmBTestPane')
  if (!pane) return
  const isOpen = pane.style.display === 'flex'
  if (isOpen) {
    pane.style.display = 'none'
    document.getElementById('anmBtnTest').style.background = '#fff'
    document.getElementById('anmBtnTest').style.color = '#7C3AED'
  } else {
    _testValues = {}
    _testSessionIdx = 0
    pane.style.display = 'flex'
    document.getElementById('anmBtnTest').style.background = '#7C3AED'
    document.getElementById('anmBtnTest').style.color = '#fff'
    _loadAndRenderTestMode()
  }
}

function anamnTestReset() {
  _testValues = {}
  _testSessionIdx = 0
  _renderTestSession()
}

function anamnTestGo(dir) {
  if (dir > 0) {
    const btn = document.getElementById('anmTestNextBtn')
    if (btn && btn.dataset.locked === 'true') {
      const s = _testSessions[_testSessionIdx]
      if (s?._isGeneral) {
        // Destaca os 3 campos obrigatórios da sessão Dados Gerais
        ;['__gd_nome', '__gd_birth_date'].forEach(key => {
          if (_testValues[key]) return
          const el = document.getElementById('anmT_' + key)
          if (el) {
            el.style.borderColor = '#EF4444'
            el.style.transition  = 'border-color .2s'
            setTimeout(() => { el.style.borderColor = '' }, 2000)
          }
        })
      } else if (s) {
        _testFields.filter(f => f.session_id === s.id && f.is_required).forEach(f => {
          const val   = _testValues[f.field_key]
          const empty = val === undefined || val === null || val === '' ||
            (Array.isArray(val) && val.length === 0)
          if (!empty) return
          const el = document.querySelector(`[id="anmT_${f.field_key}"]`)
          if (el) {
            el.style.borderColor = '#EF4444'
            el.style.transition  = 'border-color .2s'
            setTimeout(() => { el.style.borderColor = '' }, 2000)
          }
        })
      }
      const first = document.querySelector('[id^="anmT_"]')
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
  }
  _testSessionIdx = Math.max(0, Math.min(_testSessions.length - 1, _testSessionIdx + dir))
  _renderTestSession()
}

window._anmTestEnviar = function() {
  const el = document.getElementById('anmBTestContent')
  if (!el) return
  // Tenta encontrar o nome preenchido no formulário
  const nomeCandidates = ['__gd_nome', 'nome', 'name', 'nome_completo', 'paciente', 'nome_paciente']
  let nome = ''
  for (const k of nomeCandidates) {
    if (_testValues[k] && String(_testValues[k]).trim()) { nome = String(_testValues[k]).trim().split(' ')[0]; break }
  }
  window._anmTestLgpdChecked = false
  el.innerHTML = `
    <div style="max-width:420px;margin:0 auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:56px;height:56px;background:#EDE9FE;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:#7C3AED">
          <svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div style="font-size:18px;font-weight:700;color:#111;margin-bottom:6px">${nome ? `Obrigado, ${_esc(nome)}!` : 'Obrigado!'}</div>
        <div style="font-size:13px;color:#6B7280;line-height:1.6">Antes de enviar, precisamos da sua confirmação sobre o uso dos seus dados.</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:16px;font-size:12px;color:#374151;line-height:1.7;margin-bottom:16px">
        <strong>Proteção de Dados (LGPD)</strong><br><br>
        Seus dados pessoais e de saúde são tratados com total sigilo e segurança. As informações fornecidas são utilizadas <strong>exclusivamente para fins de consulta médica</strong> e acompanhamento do seu tratamento. Não compartilhamos seus dados com terceiros sem consentimento expresso.<br><br>
        Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento, conforme a Lei nº 13.709/2018 (LGPD).
      </div>
      <div id="anmTestLgpdRow" onclick="window._anmTestToggleLgpd()"
        style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1.5px solid #E5E7EB;border-radius:12px;cursor:pointer;margin-bottom:16px;transition:border-color .15s">
        <div id="anmTestLgpdBox" style="width:20px;height:20px;border:2px solid #D1D5DB;border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px;transition:all .15s">
          <svg id="anmTestLgpdIcon" width="12" height="12" fill="none" stroke="#fff" stroke-width="3" viewBox="0 0 24 24" style="display:none"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style="font-size:13px;color:#374151;line-height:1.5">Estou ciente e concordo com a coleta e uso das minhas informações para fins de consulta, conforme a LGPD.</div>
      </div>
      <button id="anmTestLgpdBtn" onclick="window._anmTestConfirmLgpd()"
        style="width:100%;padding:13px;background:#7C3AED;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;opacity:.4;pointer-events:none;transition:opacity .15s">
        Enviar Formulário
      </button>
    </div>`
}

window._anmTestToggleLgpd = function() {
  window._anmTestLgpdChecked = !window._anmTestLgpdChecked
  const row  = document.getElementById('anmTestLgpdRow')
  const box  = document.getElementById('anmTestLgpdBox')
  const icon = document.getElementById('anmTestLgpdIcon')
  const btn  = document.getElementById('anmTestLgpdBtn')
  const c = window._anmTestLgpdChecked
  if (row)  { row.style.borderColor = c ? '#7C3AED' : '#E5E7EB'; row.style.background = c ? '#F5F3FF' : '#fff' }
  if (box)  { box.style.background = c ? '#7C3AED' : ''; box.style.borderColor = c ? '#7C3AED' : '#D1D5DB' }
  if (icon) icon.style.display = c ? 'block' : 'none'
  if (btn)  { btn.style.opacity = c ? '1' : '.4'; btn.style.pointerEvents = c ? 'all' : 'none' }
}

window._anmTestConfirmLgpd = function() {
  if (!window._anmTestLgpdChecked) return
  const el = document.getElementById('anmBTestContent')
  if (!el) return
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;gap:16px">
      <div style="width:56px;height:56px;background:#D1FAE5;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#059669">
        <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style="font-size:17px;font-weight:700;color:#111">Simulação concluída!</div>
      <div style="font-size:13px;color:#6B7280;max-width:300px;line-height:1.6">MODO TESTE — nenhum dado foi salvo. O fluxo completo (envio + LGPD) está funcionando corretamente.</div>
      <button onclick="anamnTestReset()" style="margin-top:8px;padding:10px 24px;background:#7C3AED;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">
        Reiniciar teste
      </button>
    </div>`
}

async function _loadAndRenderTestMode() {
  const el = document.getElementById('anmBTestContent')
  if (!el || !_state.tpl) return
  el.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div>'
  try {
    const [sessions, fields] = await Promise.all([
      _get('/anamnesis_template_sessions', {
        'template_id': 'eq.' + _state.tpl.id,
        'is_active': 'eq.true',
        'order': 'order_index.asc',
      }),
      _get('/anamnesis_fields', {
        'template_id': 'eq.' + _state.tpl.id,
        'deleted_at': 'is.null',
        'order': 'order_index.asc',
      }),
    ])
    const selectFields = (fields || []).filter(f => ['single_select','radio_select','multi_select','single_select_dynamic'].includes(f.field_type))
    let allOptions = []
    if (selectFields.length) {
      const ids = selectFields.map(f => f.id).join(',')
      allOptions = await _get('/anamnesis_field_options', {
        'field_id': 'in.(' + ids + ')',
        'order': 'order_index.asc',
      })
    }
    _testSessions = sessions || []
    _testFields   = fields   || []
    _testOptMap   = {}
    ;(allOptions || []).forEach(o => {
      if (!_testOptMap[o.field_id]) _testOptMap[o.field_id] = []
      _testOptMap[o.field_id].push(o)
    })

    // Injeta sessão virtual de Dados Gerais no início (modo teste sempre mostra)
    _testSessions = [
      { id: '__GENERAL_DATA__', title: 'Dados Gerais', description: 'Confirme e complete seus dados cadastrais', _isGeneral: true },
      ..._testSessions,
    ]
    // Pré-popula mock completo para visualização realista
    _testValues['__gd_nome']        = 'Maria Silva Santos'
    _testValues['__gd_sexo']        = 'Feminino'
    _testValues['__gd_cpf']         = '871.264.980-07'   // CPF válido para teste
    _testValues['__gd_telefone']    = '(11) 99999-8888'
    _testValues['__gd_birth_date']  = ''                  // paciente preenche
    _testValues['__gd_rg']          = ''
    _testValues['__gd_pais']        = 'Brasil'
    _testValues['__gd_cep']         = ''
    _testValues['__gd_logradouro']  = ''
    _testValues['__gd_numero']      = ''
    _testValues['__gd_bairro']      = ''
    _testValues['__gd_cidade']      = ''
    _testValues['__gd_estado']      = ''

    _testSessionIdx = 0
    _renderTestSession()
  } catch (e) {
    el.innerHTML = `<div style="color:#EF4444;font-size:13px;padding:20px">Erro: ${_esc(e.message)}</div>`
  }
}

function _renderTestSession() {
  const el = document.getElementById('anmBTestContent')
  if (!el) return

  if (!_testSessions.length) {
    el.innerHTML = '<div style="text-align:center;color:#9CA3AF;font-size:13px;padding:40px">Nenhuma sessão criada ainda.</div>'
    return
  }

  const total   = _testSessions.length
  const idx     = _testSessionIdx
  const s       = _testSessions[idx]
  const isFirst = idx === 0
  const isLast  = idx === total - 1

  // Sessão virtual Dados Gerais
  if (s._isGeneral) {
    const sexoM = _testValues['__gd_sexo'] === 'Masculino'
    const sexoF = _testValues['__gd_sexo'] === 'Feminino'
    const birth = _testValues['__gd_birth_date'] || ''
    const age   = birth ? _calcTestAge(birth) : ''

    const inp = (id, val, ph, handler, maxl) =>
      `<input id="anmT___gd_${id}" type="text" value="${_esc(val||'')}" placeholder="${_esc(ph)}"
        ${maxl?`maxlength="${maxl}"`:''}
        oninput="${handler}"
        style="width:100%;border:1.5px solid #E5E7EB;border-radius:9px;padding:10px 12px;font-size:14px;color:#111;background:#fff;outline:none;font-family:inherit;box-sizing:border-box">`

    const lbl = (text, req, fromCad) =>
      `<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;display:flex;align-items:center;gap:6px">
        ${_esc(text)}${req?' <span style="color:#EF4444">*</span>':''}
        ${fromCad?`<span style="background:#EFF6FF;color:#3B82F6;font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;border:1px solid #BFDBFE">Do cadastro</span>`:''}
      </div>`

    const sep = `<div style="border-top:1px dashed #E5E7EB;margin:4px 0"></div>`

    const fieldsHtml = `
      <!-- Nome -->
      <div>${lbl('Nome Completo',true,!!_testValues['__gd_nome'])}${inp('nome',_testValues['__gd_nome'],'Nome e sobrenome',"_anmTestGdSet('nome',this.value)")}</div>

      <!-- Sexo -->
      <div>
        ${lbl('Sexo Biológico',true,!!_testValues['__gd_sexo'])}
        <div style="display:flex;gap:10px">
          <button onclick="_anmTestGdSexo('Masculino')"
            style="flex:1;padding:10px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid ${sexoM?'#7C3AED':'#E5E7EB'};background:${sexoM?'#7C3AED':'#fff'};color:${sexoM?'#fff':'#6B7280'}">Masculino</button>
          <button onclick="_anmTestGdSexo('Feminino')"
            style="flex:1;padding:10px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid ${sexoF?'#7C3AED':'#E5E7EB'};background:${sexoF?'#7C3AED':'#fff'};color:${sexoF?'#fff':'#6B7280'}">Feminino</button>
        </div>
      </div>

      <!-- CPF -->
      <div>${lbl('CPF',true,!!_testValues['__gd_cpf'])}${inp('cpf',_testValues['__gd_cpf'],'000.000.000-00',"_anmTestGdSetCpf(this.value)",'14')}</div>

      <!-- WhatsApp +55 -->
      <div>
        ${lbl('WhatsApp',true,!!_testValues['__gd_telefone'])}
        <div style="display:flex;align-items:center">
          <div style="padding:10px 12px;background:#F3F4F6;border:1.5px solid #E5E7EB;border-right:none;border-radius:9px 0 0 9px;font-size:13px;color:#374151;font-weight:600;white-space:nowrap">🇧🇷 +55</div>
          <input id="anmT___gd_telefone" type="tel" value="${_esc(_testValues['__gd_telefone']||'')}" placeholder="(00) 00000-0000" maxlength="15"
            oninput="_anmTestGdSetPhone(this.value)"
            style="flex:1;border:1.5px solid #E5E7EB;border-left:none;border-radius:0 9px 9px 0;padding:10px 12px;font-size:14px;color:#111;background:#fff;outline:none;font-family:inherit">
        </div>
      </div>

      ${sep}

      <!-- Nascimento + Idade -->
      <div>
        ${lbl('Data de Nascimento',true,false)}
        <input id="anmT___gd_birth_date" type="date" value="${_esc(birth)}" onchange="_anmTestGdBirth(this.value)"
          style="width:100%;border:1.5px solid #E5E7EB;border-radius:9px;padding:10px 12px;font-size:14px;color:#111;background:#fff;outline:none;font-family:inherit;box-sizing:border-box">
      </div>
      <div>
        ${lbl('Idade',false,false)}
        <div id="anmT_gd_age_display" style="border:1.5px solid #E5E7EB;border-radius:9px;padding:10px 12px;font-size:14px;color:#6B7280;background:#F9FAFB">
          ${age ? age + ' anos' : '—'}
        </div>
      </div>

      <!-- RG -->
      <div>${lbl('RG',false,!!_testValues['__gd_rg'])}${inp('rg',_testValues['__gd_rg'],'00.000.000-0',"_anmTestGdSetRg(this.value)",'12')}</div>

      ${sep}

      <!-- País -->
      <div>
        ${lbl('País',true,false)}
        <input type="text" value="Brasil" readonly style="width:100%;border:1.5px solid #E5E7EB;border-radius:9px;padding:10px 12px;font-size:14px;color:#6B7280;background:#F9FAFB;outline:none;font-family:inherit;box-sizing:border-box">
      </div>

      <!-- CEP -->
      <div>${lbl('CEP',true,false)}${inp('cep',_testValues['__gd_cep'],'00000-000',"_anmTestGdSetCep(this.value)",'9')}</div>

      <!-- Logradouro -->
      <div>${lbl('Logradouro',true,false)}${inp('logradouro',_testValues['__gd_logradouro'],'Preenchido pelo CEP',"_anmTestGdSet('logradouro',this.value)")}</div>

      <!-- Número + Complemento -->
      <div style="display:flex;gap:10px">
        <div style="flex:0 0 30%">${lbl('Número',true,false)}${inp('numero',_testValues['__gd_numero'],'Nº',"_anmTestGdSet('numero',this.value)",'10')}</div>
        <div style="flex:1">${lbl('Complemento',false,false)}${inp('complemento',_testValues['__gd_complemento'],'Apto, Bloco...',"_anmTestGdSet('complemento',this.value)")}</div>
      </div>

      <!-- Bairro -->
      <div>${lbl('Bairro',true,false)}${inp('bairro',_testValues['__gd_bairro'],'Preenchido pelo CEP',"_anmTestGdSet('bairro',this.value)")}</div>

      <!-- Cidade + Estado -->
      <div style="display:flex;gap:10px">
        <div style="flex:1">${lbl('Cidade',true,false)}${inp('cidade',_testValues['__gd_cidade'],'Preenchido pelo CEP',"_anmTestGdSet('cidade',this.value)")}</div>
        <div style="flex:0 0 30%">
          ${lbl('UF',true,false)}
          <select id="anmT___gd_estado" onchange="_anmTestGdSet('estado',this.value)"
            style="width:100%;border:1.5px solid #E5E7EB;border-radius:9px;padding:10px 8px;font-size:14px;color:#111;background:#fff;outline:none;font-family:inherit">
            <option value="">UF</option>
            ${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf=>`<option value="${uf}"${_testValues['__gd_estado']===uf?' selected':''}>${uf}</option>`).join('')}
          </select>
        </div>
      </div>
    `

    el.innerHTML = `
      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Sessão ${idx + 1} de ${total}</span>
          <span style="font-size:11px;color:#9CA3AF">${_esc(_state.tpl?.name || '')}</span>
        </div>
        <div style="height:4px;background:#E5E7EB;border-radius:4px;overflow:hidden">
          <div style="height:100%;background:#7C3AED;border-radius:4px;width:${Math.round(((idx+1)/total)*100)}%;transition:width .3s ease"></div>
        </div>
      </div>
      <div style="border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;margin-bottom:20px">
        <div style="padding:14px 18px;background:#F9FAFB;border-bottom:1px solid #E5E7EB">
          <div style="font-size:14px;font-weight:700;color:#111">Dados Gerais</div>
          <div style="font-size:12px;color:#6B7280;margin-top:3px">Confirme e complete seus dados cadastrais</div>
        </div>
        <div style="padding:20px;display:flex;flex-direction:column;gap:16px">${fieldsHtml}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <button onclick="anamnTestGo(-1)" disabled
          style="display:flex;align-items:center;gap:6px;padding:10px 20px;border:1.5px solid #E5E7EB;border-radius:9px;background:#fff;color:#D1D5DB;font-size:13px;font-weight:600;cursor:default">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>Anterior
        </button>
        <span style="font-size:12px;color:#9CA3AF">1 / ${total}</span>
        <button id="anmTestNextBtn" onclick="anamnTestGo(1)" data-locked="false"
          style="display:flex;align-items:center;gap:6px;padding:10px 20px;border:1.5px solid #7C3AED;border-radius:9px;background:#7C3AED;color:#fff;font-size:13px;font-weight:600;cursor:pointer">
          Próximo <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `
    _testCheckNext()
    return
  }

  const sFields = _testFields.filter(f => f.session_id === s.id)

  // Render fields for this session (preserve values via DOM restore after render)
  const fieldsHtml = sFields
    .map(f => _renderTestField(f, _testOptMap[f.id] || []))
    .filter(Boolean)
    .join('')

  el.innerHTML = `
    <!-- Progress bar -->
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Sessão ${idx + 1} de ${total}</span>
        <span style="font-size:11px;color:#9CA3AF">${_esc(_state.tpl?.name || '')}</span>
      </div>
      <div style="height:4px;background:#E5E7EB;border-radius:4px;overflow:hidden">
        <div style="height:100%;background:#7C3AED;border-radius:4px;width:${Math.round(((idx + 1) / total) * 100)}%;transition:width .3s ease"></div>
      </div>
    </div>

    <!-- Session card -->
    <div style="border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 18px;background:#F9FAFB;border-bottom:1px solid #E5E7EB">
        <div style="font-size:14px;font-weight:700;color:#111">${_esc(s.title)}</div>
        ${s.description ? `<div style="font-size:12px;color:#6B7280;margin-top:3px">${_esc(s.description)}</div>` : ''}
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:16px" id="anmTestFieldsWrap">
        ${fieldsHtml || '<div style="font-size:12px;color:#9CA3AF;text-align:center;padding:16px">Nenhum campo nesta sessão</div>'}
      </div>
    </div>

    <!-- Navigation -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <button onclick="anamnTestGo(-1)" ${isFirst ? 'disabled' : ''}
        style="display:flex;align-items:center;gap:6px;padding:10px 20px;border:1.5px solid #E5E7EB;border-radius:9px;background:#fff;color:${isFirst ? '#D1D5DB' : '#374151'};font-size:13px;font-weight:600;cursor:${isFirst ? 'default' : 'pointer'}">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        Anterior
      </button>
      <span style="font-size:12px;color:#9CA3AF">${idx + 1} / ${total}</span>
      <button id="anmTestNextBtn" onclick="${isLast ? 'window._anmTestEnviar()' : 'anamnTestGo(1)'}"
        style="display:flex;align-items:center;gap:6px;padding:10px 20px;border:1.5px solid #7C3AED;border-radius:9px;background:#7C3AED;color:#fff;font-size:13px;font-weight:600;cursor:pointer">
        ${isLast ? 'Enviar' : 'Próximo'}
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `

  // Verifica obrigatórios logo após renderizar
  _testCheckNext()

  // Restore existing values into rendered inputs
  Object.entries(_testValues).forEach(([key, val]) => {
    const el2 = document.getElementById('anmT_' + key)
    if (!el2) return
    if (el2.type === 'range' || el2.type === 'text' || el2.type === 'number' || el2.type === 'date' || el2.tagName === 'SELECT' || el2.tagName === 'TEXTAREA') {
      el2.value = val
      const vEl = document.getElementById('anmTV_' + key)
      if (vEl) vEl.textContent = val
    }
    if (el2.tagName === 'SELECT') el2.value = val
  })
}

function _calcTestAge(dateStr) {
  if (!dateStr) return ''
  const birth = new Date(dateStr)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age >= 0 ? String(age) : ''
}

// Máscaras no modo teste (replicam as do form-render.html)
function _tMaskCpf(v) {
  const d = v.replace(/\D/g,'').slice(0,11)
  if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/,'$1.$2.$3-$4')
  if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d+)/,'$1.$2.$3')
  if (d.length > 3) return d.replace(/(\d{3})(\d+)/,'$1.$2')
  return d
}
function _tMaskCep(v) {
  const d = v.replace(/\D/g,'').slice(0,8)
  return d.length > 5 ? d.replace(/(\d{5})(\d+)/,'$1-$2') : d
}
function _tMaskPhone(v) {
  const d = v.replace(/\D/g,'').slice(0,11)
  if (d.length > 10) return d.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3')
  if (d.length > 6)  return d.replace(/(\d{2})(\d{4})(\d+)/,'($1) $2-$3')
  if (d.length > 2)  return d.replace(/(\d{2})(\d+)/,'($1) $2')
  return d
}
function _tMaskRg(v) {
  const d = v.replace(/[^0-9xX]/gi,'').slice(0,9).toUpperCase()
  if (d.length > 8) return d.replace(/(\d{2})(\d{3})(\d{3})(\w)/,'$1.$2.$3-$4')
  if (d.length > 5) return d.replace(/(\d{2})(\d{3})(\w+)/,'$1.$2.$3')
  if (d.length > 2) return d.replace(/(\d{2})(\w+)/,'$1.$2')
  return d
}

window._anmTestGdSet = function(key, val) {
  _testValues['__gd_' + key] = val
  _testCheckNext()
}

window._anmTestGdSetCpf = function(val) {
  const m = _tMaskCpf(val)
  _testValues['__gd_cpf'] = m
  const inp = document.getElementById('anmT___gd_cpf')
  if (inp && inp.value !== m) inp.value = m
  _testCheckNext()
}

window._anmTestGdSetPhone = function(val) {
  const m = _tMaskPhone(val)
  _testValues['__gd_telefone'] = m
  const inp = document.getElementById('anmT___gd_telefone')
  if (inp && inp.value !== m) inp.value = m
  _testCheckNext()
}

window._anmTestGdSetRg = function(val) {
  const m = _tMaskRg(val)
  _testValues['__gd_rg'] = m
  const inp = document.getElementById('anmT___gd_rg')
  if (inp && inp.value !== m) inp.value = m
}

window._anmTestGdSetCep = function(val) {
  const m = _tMaskCep(val)
  _testValues['__gd_cep'] = m
  const inp = document.getElementById('anmT___gd_cep')
  if (inp && inp.value !== m) inp.value = m
  _testCheckNext()
  const clean = m.replace(/\D/g,'')
  if (clean.length !== 8) return
  fetch('https://viacep.com.br/ws/' + clean + '/json/')
    .then(r => r.json())
    .then(d => {
      if (d.erro) return
      const map = { logradouro: d.logradouro, bairro: d.bairro, cidade: d.localidade, estado: d.uf, pais: 'Brasil' }
      Object.entries(map).forEach(([k, v]) => {
        if (!v) return
        _testValues['__gd_' + k] = v
        const el = document.getElementById('anmT___gd_' + k)
        if (el) el.value = v
      })
      _testCheckNext()
    })
    .catch(e => console.warn("[anamnese-builder]", e.message || e))
}

window._anmTestGdSexo = function(val) {
  _testValues['__gd_sexo'] = val
  _renderTestSession()
}

window._anmTestGdBirth = function(val) {
  _testValues['__gd_birth_date'] = val
  const age = _calcTestAge(val)
  _testValues['__gd_age'] = age
  const el = document.getElementById('anmT_gd_age_display')
  if (el) el.textContent = age ? age + ' anos' : '—'
  _testCheckNext()
}

function _renderTestField(f, opts) {
  // Check conditional visibility
  const cond = f.conditional_rules_json || {}
  if (cond.dependsOn) {
    const depVal = _testValues[cond.dependsOn]
    let visible = false
    if (cond.operator === 'equals')     visible = String(depVal) === String(cond.value)
    if (cond.operator === 'not_equals') visible = String(depVal) !== String(cond.value)
    if (cond.operator === 'includes')   visible = Array.isArray(depVal) ? depVal.includes(cond.value) : String(depVal).includes(String(cond.value))
    if (!visible) return ''
  }

  const s = f.settings_json || {}
  const req = f.is_required ? '<span style="color:#EF4444;margin-left:2px">*</span>' : ''
  const desc = f.description ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px">${_esc(f.description)}</div>` : ''
  const label = `<label style="font-size:13px;font-weight:600;color:#374151">${_esc(f.label)}${req}</label>${desc}`
  const inp = id => `id="anmT_${_esc(f.field_key)}" onchange="window._anmTestChange('${_esc(f.field_key)}', this)" oninput="window._anmTestChange('${_esc(f.field_key)}', this)"`

  const wrap = (inner) => `<div style="display:flex;flex-direction:column;gap:5px">${label}${inner}</div>`

  if (f.field_type === 'section_title') {
    const align = s.align || 'left'
    const hasBg = s.background === 'light'
    return `<div style="font-size:13px;font-weight:700;color:#111;padding:${hasBg?'8px 12px':'4px 0'};border-top:${hasBg?'none':'1px solid #F3F4F6'};text-align:${align};border-radius:${hasBg?'8px':'0'};background:${hasBg?'#F1F5F9':'transparent'}">${_esc(f.label)}</div>`
  }
  if (f.field_type === 'description_text' && s.display === 'separator')
    return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
      <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#E5E7EB)"></div>
      <div style="width:4px;height:4px;background:#D1D5DB;border-radius:50%;flex-shrink:0"></div>
      <div style="flex:1;height:1px;background:linear-gradient(to left,transparent,#E5E7EB)"></div>
    </div>`
  if (f.field_type === 'description_text' && s.display === 'block') {
    const pos = s.image_position || 'left'
    const isHoriz = pos === 'left' || pos === 'right'
    const flexDir = { left:'row', right:'row-reverse', top:'column', bottom:'column-reverse' }[pos]
    const imgStyle = isHoriz ? 'width:38%;min-height:80px;flex-shrink:0;border-radius:8px;overflow:hidden'
                              : 'width:100%;height:160px;border-radius:8px;overflow:hidden'
    const imgContent = s.image_url
      ? `<img src="${_esc(s.image_url)}" alt="${_esc(s.image_alt||'')}"
              style="width:100%;height:100%;object-fit:contain;display:block"
              onerror="this.parentElement.style.background='#F9FAFB'">`
      : ''
    return `<div style="display:flex;flex-direction:${flexDir};gap:12px;align-items:${isHoriz?'center':'stretch'};padding:4px 0">
        ${s.image_url ? `<div style="${imgStyle};background:#fff;display:flex;align-items:center;justify-content:center">${imgContent}</div>` : ''}
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;justify-content:center">
          ${s.block_title ? `<div style="font-size:14px;font-weight:700;color:#111;line-height:1.3">${_esc(s.block_title)}</div>` : ''}
          ${s.block_description ? `<div style="font-size:12px;color:#6B7280;line-height:1.55">${_esc(s.block_description)}</div>` : ''}
        </div>
      </div>`
  }
  if (f.field_type === 'image_pair' || (f.field_type === 'description_text' && s.display === 'image_pair')) {
    const count     = s.count || 2
    const inverted  = s.inverted || false
    const showRadio = s.show_radio || false
    const genTitle  = s.title || ''
    const genDesc   = s.description || ''
    let   images    = (s.images && s.images.length >= count) ? s.images.slice(0, count) : Array.from({length:count},(_,i)=>s.images?.[i]||{})
    if (inverted) images = [...images].reverse()

    const curSel = _testValues[f.field_key] || ''
    const imgCard = (img, idx) => {
      const val   = String(idx)
      const sel   = showRadio && curSel === val
      return `
      <div onclick="${showRadio ? `window._anmTestSet('${_esc(f.field_key)}','${val}',null)` : ''}"
           style="flex:1;min-width:0;text-align:center;cursor:${showRadio?'pointer':'default'};border-radius:10px;border:2px solid ${sel?'#7C3AED':'transparent'};padding:6px;background:${sel?'#F5F3FF':'transparent'};transition:all .12s">
        ${img.url
          ? `<img src="${_esc(img.url)}" alt="${_esc(img.title||'')}" style="width:100%;max-height:200px;object-fit:contain;border-radius:8px;background:#F9FAFB;display:block">`
          : `<div style="width:100%;height:100px;border-radius:8px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;font-size:12px;color:#9CA3AF">Sem imagem</div>`}
        ${img.title ? `<div style="font-size:12px;font-weight:600;color:#111;margin-top:6px">${_esc(img.title)}</div>` : ''}
        ${showRadio ? `<div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px">
          <div style="width:16px;height:16px;border-radius:50%;border:2px solid ${sel?'#7C3AED':'#D1D5DB'};background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${sel?'<div style="width:8px;height:8px;border-radius:50%;background:#7C3AED"></div>':''}
          </div>
          <span style="font-size:12px;color:${sel?'#7C3AED':'#9CA3AF'}">${sel?'Selecionado':'Selecionar'}</span>
        </div>` : ''}
      </div>`
    }

    // Montar linhas: 2→[2], 3→[2,1], 4→[2,2]
    const rows = count === 4
      ? [[0,1],[2,3]]
      : count === 3
        ? [[0,1],[2]]
        : [[0,1]]

    const rowsHtml = rows.map(row => `
      <div style="display:flex;gap:12px">
        ${row.map(i => imgCard(images[i] || {}, i)).join('')}
        ${row.length === 1 ? '<div style="flex:1"></div>' : ''}
      </div>`).join('')

    return `<div style="display:flex;flex-direction:column;gap:4px">
      ${genTitle ? `<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:4px">${_esc(genTitle)}</div>` : ''}
      ${genDesc  ? `<div style="font-size:12px;color:#6B7280;margin-bottom:10px">${_esc(genDesc)}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px">${rowsHtml}</div>
    </div>`
  }
  if (f.field_type === 'description_text' || f.field_type === 'label')
    return `<div style="font-size:12px;color:#6B7280">${_esc(f.label)}</div>`
  if (f.field_type === 'text')
    return wrap(`<input class="cs-input" ${inp()} style="font-size:13px" placeholder="${_esc(f.placeholder||'')}">`)
  if (f.field_type === 'textarea')
    return wrap(`<textarea class="cs-input" ${inp()} rows="3" style="font-size:13px;resize:vertical" placeholder="${_esc(f.placeholder||'')}"></textarea>`)
  if (f.field_type === 'number' && s.display !== 'scale_select')
    return wrap(`<input type="number" class="cs-input" ${inp()} style="font-size:13px" placeholder="${_esc(f.placeholder||'')}" ${s.min!=null?'min="'+s.min+'"':''} ${s.max!=null?'max="'+s.max+'"':''}>`)
  if (f.field_type === 'date')
    return wrap(`<input type="date" class="cs-input" ${inp()} style="font-size:13px">`)
  if (f.field_type === 'boolean') {
    const y = s.yes_label || 'Sim', n = s.no_label || 'Não'
    return wrap(`
      <div style="display:flex;gap:8px">
        <button onclick="window._anmTestSet('${_esc(f.field_key)}','true',this.closest('div'))" data-val="true"
          style="flex:1;padding:9px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;transition:all .12s"
          onmouseover="if(this.dataset.val!=='true_active')this.style.borderColor='#7C3AED'" onmouseout="if(this.dataset.val!=='true_active')this.style.borderColor='#E5E7EB'">${_esc(y)}</button>
        <button onclick="window._anmTestSet('${_esc(f.field_key)}','false',this.closest('div'))" data-val="false"
          style="flex:1;padding:9px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;transition:all .12s"
          onmouseover="if(this.dataset.val!=='false_active')this.style.borderColor='#7C3AED'" onmouseout="if(this.dataset.val!=='false_active')this.style.borderColor='#E5E7EB'">${_esc(n)}</button>
      </div>`)
  }
  if (f.field_type === 'radio_select' || (f.field_type === 'multi_select' && s.display === 'radio_select')) {
    const cur = _testValues[f.field_key] || ''
    return wrap(`<div style="display:flex;flex-direction:column;gap:8px">
      ${opts.map(o => {
        const checked = cur === o.value
        return `<label onclick="window._anmTestRadio('${_esc(f.field_key)}','${_esc(o.value)}')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid ${checked?'#7C3AED':'#E5E7EB'};border-radius:10px;background:${checked?'#F5F3FF':'#fff'};cursor:pointer;transition:all .12s">
          <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${checked?'#7C3AED':'#D1D5DB'};display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#fff">
            ${checked?'<div style="width:9px;height:9px;border-radius:50%;background:#7C3AED"></div>':''}
          </div>
          <span style="font-size:13px;color:${checked?'#6D28D9':'#374151'};font-weight:${checked?'600':'400'}">${_esc(o.label)}</span>
        </label>`
      }).join('') || '<div style="font-size:12px;color:#9CA3AF">Sem opções</div>'}
    </div>`)
  }
  if (f.field_type === 'single_select' || (f.field_type === 'multi_select' && s.display === 'single_select'))
    return wrap(`<select class="cs-select" ${inp()} style="font-size:13px"><option value="">Selecione...</option>${opts.map(o => `<option value="${_esc(o.value)}">${_esc(o.label)}</option>`).join('')}</select>`)
  if (f.field_type === 'multi_select') {
    const sorted = [...opts.filter(o => o.value !== '__outros__'), ...opts.filter(o => o.value === '__outros__')]
    return wrap(`<div style="display:flex;flex-direction:column;gap:6px">${sorted.map(o => {
      const isOutros = o.value === '__outros__'
      return `
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:8px 12px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff" onmouseover="this.style.borderColor='#A78BFA'" onmouseout="this.style.borderColor='#E5E7EB'">
        <input type="checkbox" value="${_esc(o.value)}" onchange="${isOutros ? `window._anmTestMultiOutros('${_esc(f.field_key)}',this)` : `window._anmTestMulti('${_esc(f.field_key)}',this)`}" style="accent-color:#7C3AED;width:15px;height:15px;flex-shrink:0">
        ${_esc(o.label)}
      </label>${isOutros ? `
      <input type="text" id="anmTestOutros_${_esc(f.field_key)}" placeholder="Digite quais por favor"
        style="display:none;font-size:13px;padding:8px 12px;border:1.5px solid #C4B5FD;border-radius:8px;outline:none;margin-left:8px"
        oninput="window._anmTestOutrosText('${_esc(f.field_key)}',this.value)">` : ''}`
    }).join('')}</div>`)
  }
  if (f.field_type === 'scale_select' || s.display === 'scale_select') {
    const min = Number(s.min ?? 1), max = Number(s.max ?? 10), step = Number(s.step ?? 1)
    const initVal = Number(_testValues[f.field_key] ?? min)
    const pct = ((initVal - min) / (max - min)) * 100
    // Cor dinâmica: verde (0%) → amarelo (50%) → vermelho (100%)
    const hue = Math.round(120 - (pct / 100) * 120)
    const color = `hsl(${hue},72%,40%)`
    // Posição do thumb corrigida: track tem left:13px right:13px, thumb de 26px
    const thumbLeft = `calc(13px + (100% - 26px) * ${pct / 100})`
    // Tick marks
    const totalSteps = Math.round((max - min) / step)
    const ticks = totalSteps <= 20
      ? Array.from({length: totalSteps + 1}).map(() => '<div class="anm-scale-tick"></div>').join('')
      : ''
    return wrap(`
      <div class="anm-scale-wrap">
        <div class="anm-scale-value-row">
          <span class="anm-scale-num" id="anmTV_${_esc(f.field_key)}" style="color:${color}">${initVal}</span>
        </div>
        <div class="anm-scale-track-wrap">
          <div class="anm-scale-track">
            <div class="anm-scale-fill" id="anmTFill_${_esc(f.field_key)}" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="anm-scale-thumb" id="anmTThumb_${_esc(f.field_key)}" style="left:${thumbLeft};color:${color}"></div>
          <input type="range" class="anm-scale-input"
            id="anmT_${_esc(f.field_key)}"
            min="${min}" max="${max}" step="${step}" value="${initVal}"
            oninput="window._anmScaleInput('${_esc(f.field_key)}',this,${min},${max})"
            onchange="window._anmScaleInput('${_esc(f.field_key)}',this,${min},${max})">
        </div>
        ${ticks ? `<div class="anm-scale-ticks">${ticks}</div>` : ''}
        <div class="anm-scale-labels">
          <span class="anm-scale-label-min">${_esc(String(s.min_label || min))}</span>
          <span class="anm-scale-label-max">${_esc(String(s.max_label || max))}</span>
        </div>
      </div>`)
  }
  if (f.field_type === 'file_upload' || f.field_type === 'image_upload')
    return wrap(`<input type="file" class="cs-input" style="font-size:12px" accept="${_esc(s.accept||'')}">`)

  return wrap(`<input class="cs-input" ${inp()} style="font-size:13px" placeholder="${_esc(f.placeholder||'')}">`)
}

// Auto-gera field_key a partir do label (só se o usuário não editou manualmente)
window._anmAutoKey = function(label) {
  const keyEl = document.getElementById('anmFKey')
  if (!keyEl || keyEl.dataset.manual === '1') return
  const key = label
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50)
  keyEl.value = key
}

// Global helpers for test mode interactivity

// Slider visual (escala) — atualiza fill, thumb e valor sem re-render
window._anmScaleInput = function(key, el, min, max) {
  const val = Number(el.value)
  _testValues[key] = val
  const pct = ((val - min) / (max - min)) * 100
  // Cor dinâmica: verde (min) → amarelo (meio) → vermelho (max)
  const hue = Math.round(120 - (pct / 100) * 120)
  const color = `hsl(${hue},72%,40%)`
  const thumbLeft = `calc(13px + (100% - 26px) * ${pct / 100})`
  const numEl   = document.getElementById('anmTV_' + key)
  const fillEl  = document.getElementById('anmTFill_' + key)
  const thumbEl = document.getElementById('anmTThumb_' + key)
  if (numEl)   { numEl.textContent = val; numEl.style.color = color }
  if (fillEl)  { fillEl.style.width = pct + '%'; fillEl.style.background = color }
  if (thumbEl) { thumbEl.style.left = thumbLeft; thumbEl.style.color = color }
  const hasDependents = _testFields.some(f => f.conditional_rules_json?.dependsOn === key)
  if (hasDependents) _renderTestSession()
}

function _testCheckNext() {
  const btn = document.getElementById('anmTestNextBtn')
  if (!btn) return
  const s = _testSessions[_testSessionIdx]
  if (!s) return

  // Sessão virtual Dados Gerais: valida nome, sexo e data de nascimento
  if (s._isGeneral) {
    const req = ['__gd_nome','__gd_sexo','__gd_birth_date',
                 '__gd_cpf','__gd_telefone',
                 '__gd_cep','__gd_logradouro','__gd_numero','__gd_bairro','__gd_cidade','__gd_estado','__gd_pais']
    let ok = req.every(k => { const v = _testValues[k]; return v && String(v).trim() })
    if (ok && _testValues['__gd_telefone']) ok = _testValues['__gd_telefone'].replace(/\D/g,'').length >= 10
    if (ok && _testValues['__gd_cep'])      ok = _testValues['__gd_cep'].replace(/\D/g,'').length === 8
    btn.dataset.locked = ok ? 'false' : 'true'
    btn.style.background  = ok ? '#7C3AED' : '#DDD6FE'
    btn.style.borderColor = ok ? '#7C3AED' : '#DDD6FE'
    btn.style.color       = ok ? '#fff'    : '#8B5CF6'
    btn.style.cursor      = ok ? 'pointer' : 'default'
    btn.style.opacity     = '1'
    return
  }

  const sFields = _testFields.filter(f => f.session_id === s.id)
  let allFilled = true
  for (const f of sFields) {
    if (!f.is_required) continue
    // Verifica visibilidade condicional
    const cond = f.conditional_rules_json || {}
    if (cond.dependsOn) {
      const depVal = _testValues[cond.dependsOn]
      let visible = false
      if (cond.operator === 'equals')     visible = String(depVal) === String(cond.value)
      if (cond.operator === 'not_equals') visible = String(depVal) !== String(cond.value)
      if (cond.operator === 'includes')   visible = Array.isArray(depVal) ? depVal.includes(cond.value) : String(depVal ?? '').includes(String(cond.value))
      if (!visible) continue
    }
    const val   = _testValues[f.field_key]
    const empty = val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0)
    if (empty) { allFilled = false; break }
  }
  if (allFilled) {
    btn.style.background   = '#7C3AED'
    btn.style.borderColor  = '#7C3AED'
    btn.style.color        = '#fff'
    btn.style.opacity      = '1'
    btn.style.cursor       = 'pointer'
    btn.dataset.locked     = 'false'
  } else {
    btn.style.background   = '#EDE9FE'
    btn.style.borderColor  = '#DDD6FE'
    btn.style.color        = '#8B5CF6'
    btn.style.opacity      = '1'
    btn.style.cursor       = 'pointer'
    btn.dataset.locked     = 'true'
  }
}

window._anmTestChange = function(key, el) {
  _testValues[key] = el.value
  _testCheckNext()
  // Re-render only if field has conditionals that depend on this key
  const hasDependents = _testFields.some(f => f.conditional_rules_json?.dependsOn === key)
  if (hasDependents) _renderTestSession()
}
window._anmTestSet = function(key, val, container) {
  _testValues[key] = val
  container.querySelectorAll('button').forEach(b => {
    const isActive = b.dataset.val === val
    b.style.background = isActive ? '#7C3AED' : '#fff'
    b.style.color = isActive ? '#fff' : '#374151'
    b.style.borderColor = isActive ? '#7C3AED' : '#E5E7EB'
  })
  _testCheckNext()
  const hasDependents = _testFields.some(f => f.conditional_rules_json?.dependsOn === key)
  if (hasDependents) _renderTestSession()
}
window._anmTestRadio = function(key, val) {
  _testValues[key] = val
  _testCheckNext()
  // Re-renderiza sempre para atualizar estado visual de todos os radio buttons
  _renderTestSession()
}
window._anmTestMulti = function(key, cb) {
  if (!Array.isArray(_testValues[key])) _testValues[key] = []
  if (cb.checked) _testValues[key].push(cb.value)
  else _testValues[key] = _testValues[key].filter(v => v !== cb.value)
  _testCheckNext()
  const hasDependents = _testFields.some(f => f.conditional_rules_json?.dependsOn === key)
  if (hasDependents) _renderTestSession()
}

window._anmTestMultiOutros = function(key, cb) {
  if (!Array.isArray(_testValues[key])) _testValues[key] = []
  const txtEl = document.getElementById('anmTestOutros_' + key)
  if (cb.checked) {
    if (!_testValues[key].includes('__outros__')) _testValues[key].push('__outros__')
    if (txtEl) txtEl.style.display = 'block'
  } else {
    _testValues[key] = _testValues[key].filter(v => v !== '__outros__')
    delete _testValues[key + '__outros_texto']
    if (txtEl) { txtEl.style.display = 'none'; txtEl.value = '' }
  }
  _testCheckNext()
  const hasDependents = _testFields.some(f => f.conditional_rules_json?.dependsOn === key)
  if (hasDependents) _renderTestSession()
}

window._anmTestOutrosText = function(key, text) {
  _testValues[key + '__outros_texto'] = text
}

function anamnAddField() {
  if (!_state.activeSession) { _showToast('Selecione uma sessão primeiro.', 'error'); return }
  anamnShowTypePicker()
}

function anamnEditField(fieldId) {
  const f = _state.fields.find(x => x.id === fieldId)
  if (!f) return
  _state.editField = f
  _state._pendingOptions = []
  anamnHideTypePicker()
  if (f.settings_json?.display === 'block') { _showBlockForm(f); return }
  // Mapeia tipos salvos com alias de volta para o tipo visual
  const displayType =
    (f.field_type === 'number'           && f.settings_json?.display === 'scale_select')  ? 'scale_select'  :
    (f.field_type === 'description_text' && f.settings_json?.display === 'image_pair')    ? 'image_pair'    :
    (f.field_type === 'multi_select'     && f.settings_json?.display === 'radio_select')  ? 'radio_select'  :
    (f.field_type === 'multi_select'     && f.settings_json?.display === 'single_select') ? 'single_select' :
    f.field_type
  _showInlineFieldForm(displayType, f)
}

function anamnCancelFieldForm() {
  const form   = document.getElementById('anmBFieldForm')
  const picker = document.getElementById('anmBTypePicker')
  if (form)   form.style.display = 'none'
  if (picker) picker.style.display = 'none'
  _state.editField = null
  _state._pendingOptions = []
  _state._igImages = []
}

// Legacy alias
function anamnCloseFieldModal() { anamnCancelFieldForm() }

function anamnShowTypePicker() {
  const picker = document.getElementById('anmBTypePicker')
  const form   = document.getElementById('anmBFieldForm')
  const bar    = document.getElementById('anmBAddFieldBar')
  if (!picker) return
  if (form)  form.style.display = 'none'
  if (bar)   bar.style.display = 'none'
  _state.editField = null
  _state._pendingOptions = []
  const types = [
    { v:'text',          l:'Texto',         icon:'T' },
    { v:'textarea',      l:'Área de texto', icon:'¶' },
    { v:'boolean',       l:'Sim / Não',     icon:'?' },
    { v:'number',        l:'Número',        icon:'#' },
    { v:'date',          l:'Data',          icon:'📅' },
    { v:'radio_select',  l:'Seleção única', icon:'◉' },
    { v:'single_select', l:'Lista',         icon:'▾' },
    { v:'multi_select',  l:'Múltipla',      icon:'☑' },
    { v:'scale_select',  l:'Escala',        icon:'▤' },
    { v:'file_upload',   l:'Arquivo',       icon:'↑' },
    { v:'image_upload',  l:'Imagem',        icon:'🖼' },
    { v:'image_pair',    l:'Grade de Imagens',icon:'⊟' },
    { v:'section_title', l:'Título',        icon:'H' },
    { v:'description_text', l:'Texto livre', icon:'✎' },
    { v:'separator',        l:'Separador',  icon:'—' },
    { v:'block',            l:'Bloco',      icon:'⊞' },
  ]
  const row = document.getElementById('anmBTypePillsRow')
  if (row) {
    row.innerHTML = types.map(t => `
      <button onclick="anamnSelectFieldType('${t.v}')"
        style="display:flex;align-items:center;gap:5px;padding:6px 12px;border:1.5px solid #E5E7EB;border-radius:20px;background:#fff;font-size:12px;font-weight:500;color:#374151;cursor:pointer;transition:all .12s"
        onmouseover="this.style.borderColor='#7C3AED';this.style.background='#F5F3FF';this.style.color='#7C3AED'"
        onmouseout="this.style.borderColor='#E5E7EB';this.style.background='#fff';this.style.color='#374151'">
        <span style="font-size:13px">${t.icon}</span>${t.l}
      </button>
    `).join('')
  }
  picker.style.display = 'block'
  picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function anamnHideTypePicker() {
  const picker = document.getElementById('anmBTypePicker')
  const bar    = document.getElementById('anmBAddFieldBar')
  if (picker) picker.style.display = 'none'
  if (bar && _state.activeSession) bar.style.display = 'block'
}

function anamnSelectFieldType(type) {
  anamnHideTypePicker()
  _state.editField = null
  _state._pendingOptions = []
  if (type === 'separator') { anamnInsertSeparator(); return }
  if (type === 'block')     { _showBlockForm(null);   return }
  _showInlineFieldForm(type, null)
}

async function anamnInsertSeparator() {
  if (!_state.activeSession) return
  try {
    let nextOrder = 1
    try {
      const maxRows = await _get('/anamnesis_fields', {
        'session_id': 'eq.' + _state.activeSession.id,
        'select': 'order_index', 'order': 'order_index.desc', 'limit': '1',
      })
      nextOrder = maxRows?.length ? maxRows[0].order_index + 1 : 1
    } catch (_) {
      nextOrder = _state.fields.length ? Math.max(..._state.fields.map(f => f.order_index)) + 1 : 1
    }
    const ts = Date.now()
    const rows = await _post('/anamnesis_fields', [{
      template_id:  _state.tpl.id,
      session_id:   _state.activeSession.id,
      field_key:    'sep_' + ts,
      label:        'Separador',
      field_type:   'description_text',
      order_index:  nextOrder,
      is_required:  false,
      is_active:    true,
      is_visible:   true,
      settings_json: { display: 'separator' },
      validation_rules: {},
      conditional_rules_json: {},
    }])
    _state.fields.push(rows[0])
    _renderBuilderFieldsList()
    _showToast('Separador adicionado')
  } catch (e) {
    _showToast('Erro: ' + e.message, 'error')
  }
}

// ── BLOCO (imagem + texto) ──────────────────────────────────────────────────
// 4 posições: left | right | top | bottom
let _blockPos = 'left'

function _showBlockForm(field) {
  const formEl = document.getElementById('anmBFieldForm')
  if (!formEl) return
  const s = field?.settings_json || {}
  _blockPos = s.image_position || 'left'
  // Restaura a imagem existente para o preview ao editar
  window._anmBlkDataUrl = s.image_url || null
  formEl.innerHTML = _buildBlockFormHtml(field)
  formEl.style.display = 'block'
  _renderBlockPreview()
  formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function _buildBlockFormHtml(field) {
  const s   = field?.settings_json || {}
  const esc = _esc
  const hasImage = !!(s.image_url)

  // Seção de imagem: thumbnail com ações (se já tem) ou inputs (se não tem)
  const imgSection = hasImage ? `
    <div class="cs-label-wrap" style="margin-bottom:14px">
      <label class="cs-label">Imagem</label>
      <div style="display:flex;gap:10px;align-items:center;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:10px;padding:10px">
        <div style="width:72px;height:54px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#F3F4F6">
          <img id="anmBlkThumb" src="${esc(s.image_url)}" style="width:100%;height:100%;object-fit:contain;display:block"
            onerror="this.style.display='none'">
        </div>
        <div style="flex:1;min-width:0">
          <div id="anmBlkFileInfo" style="font-size:11px;color:#6B7280;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${s.image_url.startsWith('data:') ? 'Imagem carregada do arquivo' : esc(s.image_url)}
          </div>
          <div style="display:flex;gap:6px">
            <label style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:7px;font-size:11px;color:#7C3AED;cursor:pointer;font-weight:600">
              <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Trocar
              <input type="file" accept="image/*" style="display:none" onchange="window._anmBlkFile(this)">
            </label>
            <button onclick="window._anmBlkRemove()" style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:#FEF2F2;border:1.5px solid #FECACA;border-radius:7px;font-size:11px;color:#EF4444;cursor:pointer;font-weight:600">
              <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Remover
            </button>
            <label style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:7px;font-size:11px;color:#6B7280;cursor:pointer;font-weight:600">
              URL
              <input id="anmBlkUrlHidden" type="text" style="display:none" oninput="window._anmBlkUrlChange(this.value)">
            </label>
          </div>
          <input id="anmBlkUrl" type="hidden" value="${esc(s.image_url)}">
        </div>
      </div>
    </div>` : `
    <div class="cs-label-wrap" style="margin-bottom:14px">
      <label class="cs-label">Imagem</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="anmBlkUrl" class="cs-input" placeholder="https://... ou cole uma URL"
          value="" oninput="_renderBlockPreview()" style="flex:1">
        <label style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:8px;font-size:12px;color:#7C3AED;cursor:pointer;white-space:nowrap;font-weight:600">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Arquivo
          <input type="file" accept="image/*" style="display:none" onchange="window._anmBlkFile(this)">
        </label>
      </div>
      <div id="anmBlkFileInfo" style="font-size:11px;color:#9CA3AF;margin-top:4px"></div>
    </div>`

  return `
  <div style="padding:18px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#111">${field ? 'Editar Bloco' : 'Novo Bloco'}</div>
      <button onclick="anamnCancelFieldForm()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="cs-label-wrap">
        <label class="cs-label">Título <span style="color:#EF4444">*</span></label>
        <input id="anmBlkTitle" class="cs-input" placeholder="ex: Região afetada"
          value="${esc(s.block_title || field?.label || '')}" oninput="_renderBlockPreview()">
      </div>
      <div class="cs-label-wrap">
        <label class="cs-label">Alt da imagem</label>
        <input id="anmBlkAlt" class="cs-input" placeholder="Descrição acessível" value="${esc(s.image_alt || '')}">
      </div>
      <div class="cs-label-wrap" style="grid-column:1/-1">
        <label class="cs-label">Descrição</label>
        <textarea id="anmBlkDesc" class="cs-input" rows="2" placeholder="Texto explicativo"
          style="resize:vertical" oninput="_renderBlockPreview()">${esc(s.block_description || '')}</textarea>
      </div>
    </div>

    ${imgSection}

    <!-- Posição: 4 botões visuais -->
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Posição da imagem</div>
      <div style="display:flex;gap:8px">
        ${[
          { pos:'left',   label:'Esquerda', svg:`<rect x="2" y="4" width="8" height="10" rx="1" fill="currentColor" opacity=".7"/><rect x="12" y="4" width="10" height="3" rx="1" fill="currentColor" opacity=".3"/><rect x="12" y="9" width="7" height="2" rx="1" fill="currentColor" opacity=".2"/>` },
          { pos:'right',  label:'Direita',  svg:`<rect x="14" y="4" width="8" height="10" rx="1" fill="currentColor" opacity=".7"/><rect x="2" y="4" width="10" height="3" rx="1" fill="currentColor" opacity=".3"/><rect x="2" y="9" width="7" height="2" rx="1" fill="currentColor" opacity=".2"/>` },
          { pos:'top',    label:'Acima',    svg:`<rect x="2" y="2" width="20" height="7" rx="1" fill="currentColor" opacity=".7"/><rect x="2" y="12" width="20" height="3" rx="1" fill="currentColor" opacity=".3"/><rect x="2" y="17" width="13" height="2" rx="1" fill="currentColor" opacity=".2"/>` },
          { pos:'bottom', label:'Abaixo',   svg:`<rect x="2" y="15" width="20" height="7" rx="1" fill="currentColor" opacity=".7"/><rect x="2" y="4" width="20" height="3" rx="1" fill="currentColor" opacity=".3"/><rect x="2" y="9" width="13" height="2" rx="1" fill="currentColor" opacity=".2"/>` },
        ].map(o => {
          const active = _blockPos === o.pos
          return `<button id="anmBlkPosBtn_${o.pos}" onclick="window._setBlockPos('${o.pos}')"
            style="flex:1;padding:8px 4px;border:1.5px solid ${active?'#7C3AED':'#E5E7EB'};border-radius:8px;background:${active?'#F5F3FF':'#fff'};cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all .12s">
            <svg width="24" height="18" viewBox="0 0 24 24" style="color:${active?'#7C3AED':'#9CA3AF'}">${o.svg}</svg>
            <span style="font-size:10px;font-weight:${active?'700':'500'};color:${active?'#7C3AED':'#9CA3AF'}">${o.label}</span>
          </button>`
        }).join('')}
      </div>
    </div>

    <!-- Preview ao vivo -->
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:#9CA3AF;margin-bottom:6px">Preview</div>
      <div id="anmBlkPreview" style="border:1.5px dashed #D1D5DB;border-radius:10px;overflow:hidden;min-height:80px"></div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="anamnCancelFieldForm()" class="anm-btn-xs" style="padding:8px 16px;font-size:12px">Cancelar</button>
      <button onclick="anamnSaveBlock()" style="padding:8px 18px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">
        ${field ? 'Salvar' : 'Criar Bloco'}
      </button>
    </div>
  </div>`
}

window._setBlockPos = function(pos) {
  _blockPos = pos
  ;['left','right','top','bottom'].forEach(p => {
    const btn = document.getElementById('anmBlkPosBtn_' + p)
    if (!btn) return
    const active = p === pos
    btn.style.borderColor = active ? '#7C3AED' : '#E5E7EB'
    btn.style.background  = active ? '#F5F3FF' : '#fff'
    btn.querySelector('svg').style.color = active ? '#7C3AED' : '#9CA3AF'
    btn.querySelector('span').style.color      = active ? '#7C3AED' : '#9CA3AF'
    btn.querySelector('span').style.fontWeight = active ? '700' : '500'
  })
  _renderBlockPreview()
}

window._anmBlkRemove = function() {
  window._anmBlkDataUrl = null
  const f = _state.editField
  // Rebuild form section with empty image inputs
  _showBlockForm(f ? { ...f, settings_json: { ...f.settings_json, image_url: '' } } : null)
}

window._anmBlkUrlChange = function(val) {
  window._anmBlkDataUrl = val || null
  const thumb = document.getElementById('anmBlkThumb')
  if (thumb) thumb.src = val
  const urlInput = document.getElementById('anmBlkUrl')
  if (urlInput) urlInput.value = val
  _renderBlockPreview()
}

function _renderBlockPreview() {
  const el = document.getElementById('anmBlkPreview')
  if (!el) return
  const urlInput = document.getElementById('anmBlkUrl')
  const url   = window._anmBlkDataUrl || urlInput?.value.trim() || ''
  const title = document.getElementById('anmBlkTitle')?.value.trim() || 'Título'
  const desc  = document.getElementById('anmBlkDesc')?.value.trim()  || 'Descrição...'

  const isHoriz  = _blockPos === 'left' || _blockPos === 'right'
  const flexDir  = { left:'row', right:'row-reverse', top:'column', bottom:'column-reverse' }[_blockPos]
  const imgStyle = isHoriz
    ? 'width:38%;min-height:80px;flex-shrink:0'
    : 'width:100%;height:100px'

  const imgBox = `
    <div style="${imgStyle};background:#fff;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center">
      ${url
        ? `<img src="${_esc(url)}" style="width:100%;height:100%;object-fit:contain;display:block" onerror="this.style.display='none'">`
        : `<div style="text-align:center;color:#9CA3AF;font-size:11px;padding:10px">
             <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 3px;display:block"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
             Sem imagem
           </div>`}
    </div>`

  const textBox = `
    <div style="flex:1;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0">
      <div style="font-size:13px;font-weight:700;color:#111;line-height:1.3">${_esc(title)}</div>
      <div style="font-size:12px;color:#6B7280;line-height:1.5">${_esc(desc)}</div>
    </div>`

  el.innerHTML = `<div style="display:flex;flex-direction:${flexDir};align-items:stretch;min-height:80px">${imgBox}${textBox}</div>`
}

window._anmBlkFile = function(input) {
  const file = input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    window._anmBlkDataUrl = e.target.result
    // Atualiza thumbnail se existir (modo edição com imagem)
    const thumb = document.getElementById('anmBlkThumb')
    if (thumb) { thumb.src = e.target.result; thumb.style.display = 'block' }
    const info = document.getElementById('anmBlkFileInfo')
    if (info) info.textContent = 'Arquivo: ' + file.name
    // Atualiza URL hidden
    const urlEl = document.getElementById('anmBlkUrl')
    if (urlEl) urlEl.value = e.target.result
    _renderBlockPreview()
  }
  reader.readAsDataURL(file)
}

async function anamnSaveBlock() {
  const title = document.getElementById('anmBlkTitle')?.value.trim()
  if (!title) { document.getElementById('anmBlkTitle')?.focus(); return }
  const desc    = document.getElementById('anmBlkDesc')?.value.trim()  || ''
  const alt     = document.getElementById('anmBlkAlt')?.value.trim()   || ''
  const urlInp  = document.getElementById('anmBlkUrl')?.value.trim()   || ''
  const imageUrl = window._anmBlkDataUrl || urlInp
  window._anmBlkDataUrl = null

  const sJson = {
    display:           'block',
    image_position:    _blockPos,
    block_title:       title,
    block_description: desc,
    image_url:         imageUrl,
    image_alt:         alt,
  }

  const f = _state.editField
  try {
    if (f) {
      const rows = await _patch('/anamnesis_fields',
        { 'id': 'eq.' + f.id },
        { label: title, settings_json: sJson }
      )
      const idx = _state.fields.findIndex(x => x.id === f.id)
      if (idx >= 0) _state.fields[idx] = rows[0]
      _state.editField = null
    } else {
      if (!_state.activeSession) return
      let nextOrder = 1
      try {
        const maxRows = await _get('/anamnesis_fields', {
          'session_id': 'eq.' + _state.activeSession.id,
          'select': 'order_index', 'order': 'order_index.desc', 'limit': '1',
        })
        nextOrder = maxRows?.length ? maxRows[0].order_index + 1 : 1
      } catch (_) {
        nextOrder = _state.fields.length ? Math.max(..._state.fields.map(x => x.order_index)) + 1 : 1
      }
      const ts = Date.now()
      const rows = await _post('/anamnesis_fields', [{
        template_id:  _state.tpl.id,
        session_id:   _state.activeSession.id,
        field_key:    'block_' + ts,
        label:        title,
        field_type:   'description_text',
        order_index:  nextOrder,
        is_required:  false,
        is_active:    true,
        is_visible:   true,
        settings_json: sJson,
        validation_rules: {},
        conditional_rules_json: {},
      }])
      _state.fields.push(rows[0])
    }
    anamnCancelFieldForm()
    _renderBuilderFieldsList()
    _showToast(f ? 'Bloco atualizado' : 'Bloco adicionado')
  } catch (e) {
    _showToast('Erro: ' + e.message, 'error')
  }
}

function _showInlineFieldForm(type, field) {
  const formEl = document.getElementById('anmBFieldForm')
  if (!formEl) return
  const title = field ? 'Editar campo' : 'Novo campo — ' + _fieldTypeLabel(type)
  const settings = field?.settings_json || {}
  const cond = field?.conditional_rules_json || {}

  formEl.innerHTML = `
    <div style="padding:18px 20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#111">${_esc(title)}</div>
        <button onclick="anamnCancelFieldForm()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="cs-label-wrap">
          <label class="cs-label">Label <span style="color:#EF4444">*</span></label>
          <input id="anmFLabel" class="cs-input" placeholder="ex: Possui herpes labial?" value="${_esc(field?.label||'')}" oninput="window._anmAutoKey(this.value)">
        </div>
        <div class="cs-label-wrap">
          <label class="cs-label">Chave (field_key) <span style="color:#EF4444">*</span></label>
          <input id="anmFKey" class="cs-input" placeholder="ex: herpes_history" value="${_esc(field?.field_key||'')}" oninput="this.dataset.manual='1'">
        </div>
        <input type="hidden" id="anmFType" value="${_esc(type)}">
        <div class="cs-label-wrap" style="grid-column:1/-1">
          <label class="cs-label">Descrição <span style="font-size:11px;color:#9CA3AF">(aparece abaixo do label)</span></label>
          <input id="anmFDesc" class="cs-input" placeholder="Texto de ajuda" value="${_esc(field?.description||'')}">
        </div>
        <div class="cs-label-wrap">
          <label class="cs-label">Placeholder</label>
          <input id="anmFPlaceholder" class="cs-input" placeholder="Texto placeholder" value="${_esc(field?.placeholder||'')}">
        </div>
        <div class="cs-label-wrap">
          <label class="cs-label">Dica (help text)</label>
          <input id="anmFHelp" class="cs-input" placeholder="Tooltip informativo" value="${_esc(field?.help_text||'')}">
        </div>
        <div style="display:flex;gap:16px;align-items:center;padding-top:4px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="anmFRequired" style="accent-color:#7C3AED" ${field?.is_required ? 'checked' : ''}> Obrigatório
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="anmFActive" style="accent-color:#7C3AED" ${field == null || field?.is_active ? 'checked' : ''}> Ativo
          </label>
        </div>
        <div id="anmFTypeConfig" style="grid-column:1/-1"></div>
        <div style="grid-column:1/-1;border-top:1px solid #F3F4F6;padding-top:12px">
          <div style="font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Regra condicional (opcional)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="cs-label-wrap">
              <label class="cs-label">Depende de</label>
              <input id="anmFCondKey" class="cs-input" placeholder="field_key" value="${_esc(cond.dependsOn||'')}">
            </div>
            <div class="cs-label-wrap">
              <label class="cs-label">Operador</label>
              <select id="anmFCondOp" class="cs-select">
                <option value="equals" ${(cond.operator||'equals')==='equals'?'selected':''}>equals</option>
                <option value="includes" ${cond.operator==='includes'?'selected':''}>includes</option>
                <option value="not_equals" ${cond.operator==='not_equals'?'selected':''}>not_equals</option>
              </select>
            </div>
            <div class="cs-label-wrap">
              <label class="cs-label">Valor</label>
              <input id="anmFCondVal" class="cs-input" placeholder="ex: true" value="${_esc(cond.value !== undefined ? String(cond.value) : '')}">
            </div>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid #F3F4F6">
        <button onclick="anamnCancelFieldForm()" class="btn-outline" style="font-size:12px;padding:7px 16px">Cancelar</button>
        <button onclick="anamnSaveField()" class="btn-primary" style="font-size:12px;padding:7px 16px">Salvar campo</button>
      </div>
    </div>
  `
  formEl.style.display = 'block'
  // Render type-specific config
  _renderTypeConfig(type, settings, field?.id || null)
  // Auto-focus label
  setTimeout(() => document.getElementById('anmFLabel')?.focus(), 50)
  formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function _populateFieldModal(f) {
  const g = id => document.getElementById(id)
  g('anmFKey').value         = f?.field_key    || ''
  g('anmFLabel').value       = f?.label        || ''
  g('anmFDesc').value        = f?.description  || ''
  g('anmFHelp').value        = f?.help_text    || ''
  g('anmFType').value        = f?.field_type   || 'text'
  g('anmFPlaceholder').value = f?.placeholder  || ''
  g('anmFRequired').checked  = f?.is_required  ?? false
  g('anmFActive').checked    = f?.is_active    ?? true
  const cond = f?.conditional_rules_json || {}
  g('anmFCondKey').value = cond.dependsOn || ''
  g('anmFCondOp').value  = cond.operator  || 'equals'
  g('anmFCondVal').value = cond.value     !== undefined ? String(cond.value) : ''
  // Renderiza config dinâmica baseada no tipo
  _renderTypeConfig(f?.field_type || 'text', f?.settings_json || {}, f?.id || null)
}

async function anamnSaveField() {
  const g     = id => document.getElementById(id)
  const key   = g('anmFKey').value.trim()
  const label = g('anmFLabel').value.trim()
  const ftype = g('anmFType').value || (_state.editField?.field_type || 'text')
  if (!key || !label) { _toastWarn('Campo chave e label são obrigatórios'); return }

  const condKey = g('anmFCondKey').value.trim()
  const condOp  = g('anmFCondOp').value
  const condVal = g('anmFCondVal').value.trim()
  const cond    = condKey
    ? { dependsOn: condKey, operator: condOp, value: _parseCondValue(condVal, condOp) }
    : {}

  let nextOrder = _state.editField ? _state.editField.order_index : 1
  if (!_state.editField) {
    // Consulta o banco incluindo deletados para evitar conflito no constraint (session_id, order_index)
    try {
      const maxRows = await _get('/anamnesis_fields', {
        'session_id': 'eq.' + _state.activeSession.id,
        'select':     'order_index',
        'order':      'order_index.desc',
        'limit':      '1',
      })
      nextOrder = maxRows?.length ? maxRows[0].order_index + 1 : 1
    } catch (_) {
      nextOrder = (_state.fields.length ? Math.max(..._state.fields.map(f => f.order_index)) + 1 : 1)
    }
  }

  // Tipos que não existem no enum do banco — salva com alias + display hint
  const dbFieldType = ftype === 'scale_select'   ? 'number'
    : ftype === 'image_pair'   ? 'description_text'
    : ftype === 'radio_select' ? 'multi_select'
    : ftype === 'single_select'? 'multi_select'
    : ftype

  const typeSettings = _collectTypeSettings(ftype)
  if (ftype === 'scale_select')  typeSettings.display = 'scale_select'
  if (ftype === 'image_pair')    typeSettings.display = 'image_pair'
  if (ftype === 'radio_select')  typeSettings.display = 'radio_select'
  if (ftype === 'single_select') typeSettings.display = 'single_select'

  const payload = {
    template_id:            _state.tpl.id,
    session_id:             _state.activeSession.id,
    field_key:              key,
    label:                  label,
    description:            g('anmFDesc').value.trim() || null,
    help_text:              g('anmFHelp').value.trim() || null,
    field_type:             dbFieldType,
    placeholder:            g('anmFPlaceholder').value.trim() || null,
    is_required:            g('anmFRequired').checked,
    is_active:              g('anmFActive').checked,
    is_visible:             true,
    order_index:            nextOrder,
    validation_rules:       {},
    settings_json:          typeSettings,
    conditional_rules_json: cond,
  }

  try {
    if (_state.editField) {
      const rows = await _patch('/anamnesis_fields',
        { 'id': 'eq.' + _state.editField.id },
        payload
      )
      const idx = _state.fields.findIndex(f => f.id === _state.editField.id)
      if (idx >= 0) _state.fields[idx] = rows[0]
      anamnCancelFieldForm()
      _renderBuilderFieldsList()
      _showToast('Campo salvo')
    } else {
      // Helper para inserir campo + opções
      const _doInsert = async () => {
        const rows = await _post('/anamnesis_fields', [payload])
        const newField = rows[0]
        _state.fields.push(newField)
        const pending = _state._pendingOptions || []
        if (pending.length && ['single_select','radio_select','multi_select','single_select_dynamic'].includes(ftype)) {
          await _post('/anamnesis_field_options', pending.map((o, i) => ({
            field_id:    newField.id,
            label:       o.label,
            value:       o.value,
            order_index: i + 1,
            is_active:   true,
          })))
          _state.options[newField.id] = []
        }
        _state._pendingOptions = []
        return newField
      }

      try {
        await _doInsert()
      } catch (postErr) {
        // Se conflito em (template_id, field_key): campo ativo com mesma chave existe.
        // Com o partial unique index (WHERE deleted_at IS NULL) da migration sprint3,
        // isso só ocorre para registros vivos — soft-delete para liberar a chave e re-inserir.
        let parsed = {}
        try { parsed = JSON.parse(postErr.message) } catch (_) {}
        if (parsed.code === '23505' && parsed.message?.includes('field_key')) {
          const now = new Date().toISOString()
          const ghosts = await _get('/anamnesis_fields', {
            'template_id': 'eq.' + _state.tpl.id,
            'field_key':   'eq.' + key,
            'deleted_at':  'is.null',   // apenas registros ativos conflitantes
            'select':      'id',
          })
          for (const g of (ghosts || [])) {
            // Soft-delete: preserva histórico clínico vinculado ao campo
            await _patch('/anamnesis_fields',
              { 'id': 'eq.' + g.id },
              { deleted_at: now, is_active: false }
            )
            await _patch('/anamnesis_field_options',
              { 'field_id': 'eq.' + g.id },
              { is_active: false }
            ).catch(e => console.warn("[anamnese-builder]", e.message || e))
          }
          await _doInsert()
        } else {
          throw postErr
        }
      }

      anamnCancelFieldForm()
      _renderBuilderFieldsList()
      _showToast('Campo salvo')
    }
  } catch (e) {
    _showToast(_parseDbError(e), 'error')
  }
}

async function anamnMoveField(fieldId, dir) {
  const idx = _state.fields.findIndex(f => f.id === fieldId)
  const swapIdx = idx + dir
  if (idx < 0 || swapIdx < 0 || swapIdx >= _state.fields.length) return
  // Troca posições no array local e atribui order_index sequencial
  ;[_state.fields[idx], _state.fields[swapIdx]] = [_state.fields[swapIdx], _state.fields[idx]]
  _state.fields.forEach((f, i) => { f.order_index = i + 1 })
  _renderBuilderFieldsList()
  try {
    await _persistOrder('/anamnesis_fields', _state.fields)
    _showToast('Campo movido')
  } catch (e) {
    _showToast('Erro ao mover: ' + e.message, 'error')
  }
}

async function anamnDuplicateField(fieldId) {
  const orig = _state.fields.find(f => f.id === fieldId)
  if (!orig) return
  try {
    const ts = Date.now()
    const newKey = orig.field_key.replace(/^sep_\d+$/, '')
      ? orig.field_key + '_copia'
      : 'sep_' + ts
    const nextOrder = Math.max(..._state.fields.map(f => f.order_index)) + 1
    // Remove campos exclusivos do registro original antes de inserir
    const { id, created_at, updated_at, ...rest } = orig
    const rows = await _post('/anamnesis_fields', [{
      ...rest,
      field_key:   newKey.length > 50 ? 'campo_' + ts : newKey,
      order_index: nextOrder,
    }])
    _state.fields.push(rows[0])
    _renderBuilderFieldsList()
    _showToast('Campo duplicado')
  } catch (e) {
    _showToast('Erro ao duplicar: ' + e.message, 'error')
  }
}

async function anamnDeleteField(fieldId) {
  if (!confirm('Excluir este campo?')) return
  try {
    const now = new Date().toISOString()
    // Soft-delete: preserva respostas clínicas históricas ligadas a este campo
    await _patch('/anamnesis_fields',
      { 'id': 'eq.' + fieldId },
      { deleted_at: now, is_active: false }
    )
    // Desativa as opções do campo (sem deletar — mantém histórico)
    await _patch('/anamnesis_field_options',
      { 'field_id': 'eq.' + fieldId },
      { is_active: false }
    ).catch(e => console.warn("[anamnese-builder]", e.message || e))
    _state.fields = _state.fields.filter(f => f.id !== fieldId)
    _renderBuilderFieldsList()
    _showToast('Campo removido')
  } catch (e) {
    _showToast(_parseDbError(e), 'error')
  }
}

// ── OPÇÕES DOS CAMPOS ──────────────────────────────────────────────────────
async function anamnOpenFieldOptions(fieldId) {
  const f = _state.fields.find(x => x.id === fieldId)
  if (!f) return
  _state.editField = f
  const modal = document.getElementById('anmOptionsModal')
  if (!modal) return
  document.getElementById('anmOptionsTitle').textContent = 'Opções — ' + f.label
  _showLoading(document.getElementById('anmOptionsList'))
  modal.style.display = 'flex'

  try {
    const opts = await _get('/anamnesis_field_options', {
      'field_id': 'eq.' + fieldId,
      'order':    'order_index.asc',
    })
    _state.options[fieldId] = opts || []
    _renderFieldOptions(fieldId)
  } catch (e) {
    _showError(document.getElementById('anmOptionsList'), e.message)
  }
}

function anamnCloseOptionsModal() {
  document.getElementById('anmOptionsModal').style.display = 'none'
  _state.editField = null
}

function _renderFieldOptions(fieldId) {
  const el = document.getElementById('anmOptionsList')
  if (!el) return
  const opts = _state.options[fieldId] || []
  const _ef = _state.editField
  const _efDisplay = _ef?.settings_json?.display
  const isMulti = _ef?.field_type === 'multi_select' && _efDisplay !== 'radio_select' && _efDisplay !== 'single_select'
  const hasOutros = opts.some(o => o.value === '__outros__')
  el.innerHTML = (opts.length ? '' : '<div style="font-size:13px;color:#9CA3AF;padding:8px 4px">Nenhuma opção adicionada.</div>') +
  opts.map((o, i) => {
    const isOutrosOpt = o.value === '__outros__'
    return `
    <div class="anm-option-item"
         style="${isOutrosOpt ? 'border:1.5px dashed #A78BFA;background:#F5F3FF;' : ''}"
         ondragover="_dndOptOver(event,'${o.id}')"
         ondrop="_dndOptDrop(event,'${fieldId}','${o.id}')"
         ondragend="_dndEnd()">
      <span class="anm-opt-drag" draggable="true"
            ondragstart="_dndOptStart(event,'${fieldId}','${o.id}')"
            title="Arrastar para reordenar">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
      </span>
      <input class="anm-opt-label" value="${_esc(o.label)}" data-opt-id="${o.id}" data-field="label"
        ${isOutrosOpt ? 'readonly style="color:#6D28D9;font-weight:600;background:#EDE9FE;cursor:default"' : ''}
        onchange="${isOutrosOpt ? '' : `anamnUpdateOptionInline('${fieldId}','${o.id}','label',this.value)`}">
      <input class="anm-opt-value" value="${_esc(o.value)}" data-opt-id="${o.id}" data-field="value"
        ${isOutrosOpt ? 'readonly style="color:#6D28D9;font-style:italic;background:#EDE9FE;cursor:default"' : `onchange="anamnUpdateOptionInline('${fieldId}','${o.id}','value',this.value)"`}>
      <button onclick="anamnDeleteOption('${fieldId}','${o.id}')" class="anm-btn-xs anm-btn-danger-xs">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`
  }).join('')

  // Botões no footer fixo
  const footerBtns = document.getElementById('anmOptionsAddBtns')
  if (footerBtns) {
    footerBtns.innerHTML =
      `<button class="anm-btn-add-opt" onclick="anamnAddOption('${fieldId}')">+ Adicionar opção</button>` +
      (isMulti && !hasOutros ? `<button class="anm-btn-add-opt" style="color:#7C3AED;border-color:#C4B5FD;background:#F5F3FF" onclick="anamnAddOutrosOption('${fieldId}')">+ Adicionar opção "Outros"</button>` : '')
  }
}

async function anamnUpdateOptionInline(fieldId, optId, field, value) {
  try {
    await _patch('/anamnesis_field_options',
      { 'id': 'eq.' + optId },
      { [field]: value }
    )
    // Atualiza memória para que _renderFieldOptions após DnD use valor correto
    const opt = (_state.options[fieldId] || []).find(o => o.id === optId)
    if (opt) opt[field] = value
  } catch (e) {
    console.error('Erro ao atualizar opção:', e)
  }
}

async function anamnAddOption(fieldId) {
  const label = prompt('Nome da opção:')
  if (!label?.trim()) return
  const value = label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'') || ('opt_' + Date.now())
  const opts = _state.options[fieldId] || []
  const nextOrder = opts.length ? Math.max(...opts.map(o => o.order_index)) + 1 : 1
  try {
    const rows = await _post('/anamnesis_field_options', [{
      field_id:    fieldId,
      label:       label.trim(),
      value:       value,
      order_index: nextOrder,
      is_active:   true,
    }])
    if (!_state.options[fieldId]) _state.options[fieldId] = []
    _state.options[fieldId].push(rows[0])
    _renderFieldOptions(fieldId)
    _showToast('Opção adicionada')
  } catch (e) {
    _showToast(_parseDbError(e), 'error')
  }
}

async function anamnAddOutrosOption(fieldId) {
  const opts = _state.options[fieldId] || []
  if (opts.some(o => o.value === '__outros__')) { _showToast('Opção "Outros" já existe'); return }
  const nextOrder = opts.length ? Math.max(...opts.map(o => o.order_index)) + 1 : 1
  try {
    const rows = await _post('/anamnesis_field_options', [{
      field_id:    fieldId,
      label:       'Outros',
      value:       '__outros__',
      order_index: nextOrder,
      is_active:   true,
    }])
    if (!_state.options[fieldId]) _state.options[fieldId] = []
    _state.options[fieldId].push(rows[0])
    _renderFieldOptions(fieldId)
    _showToast('Opção "Outros" adicionada')
  } catch(e) {
    _showToast(_parseDbError(e), 'error')
  }
}

async function anamnDeleteOption(fieldId, optId) {
  try {
    await _delete('/anamnesis_field_options', { 'id': 'eq.' + optId })
    _state.options[fieldId] = (_state.options[fieldId] || []).filter(o => o.id !== optId)
    _renderFieldOptions(fieldId)
    _showToast('Opção removida')
  } catch (e) {
    _showToast(_parseDbError(e), 'error')
  }
}

// ── PREVIEW ────────────────────────────────────────────────────────────────
async function _renderBuilderPreview() {
  const el = document.getElementById('anmBPreviewWrap')
  if (!el) return
  _showLoading(el)
  try {
    // Carrega sessões + campos
    const [sessions, fields] = await Promise.all([
      _get('/anamnesis_template_sessions', {
        'template_id': 'eq.' + _state.tpl.id,
        'is_active': 'eq.true',
        'order': 'order_index.asc',
      }),
      _get('/anamnesis_fields', {
        'template_id': 'eq.' + _state.tpl.id,
        'deleted_at': 'is.null',
        'order': 'order_index.asc',
      }),
    ])
    el.innerHTML = `
      <div class="anm-preview-wrap">
        <div class="anm-preview-header">
          <div class="anm-preview-title">${_esc(_state.tpl.name)}</div>
          <div class="anm-preview-sub">${sessions.length} sessões · ${fields.length} campos</div>
        </div>
        ${(sessions || []).map(s => {
          const sFields = (fields || []).filter(f => f.session_id === s.id && f.is_active)
          return `
            <div class="anm-preview-session">
              <div class="anm-preview-session-title">${s.order_index}. ${_esc(s.title)}</div>
              ${s.description ? `<div class="anm-preview-session-desc">${_esc(s.description)}</div>` : ''}
              ${sFields.map(f => `
                <div class="anm-preview-field">
                  <div class="anm-preview-field-label">${_esc(f.label)} ${f.is_required ? '<span class="anm-req">*</span>' : ''}</div>
                  <div class="anm-preview-field-type">${_fieldTypeLabel(f.field_type)}</div>
                  ${f.conditional_rules_json?.dependsOn ? `<div class="anm-preview-cond">Condicional: <code>${f.conditional_rules_json.dependsOn}</code></div>` : ''}
                </div>
              `).join('')}
            </div>
          `
        }).join('')}
      </div>
    `
  } catch (e) {
    _showError(el, e.message)
  }
}

// ── CAMPO: CONFIG DINÂMICA POR TIPO ────────────────────────────────────────────
function anamnFieldTypeChanged() {
  const type = document.getElementById('anmFType')?.value
  if (!type) return
  const settings = _state.editField?.settings_json || {}
  const fieldId  = _state.editField?.id || null
  _renderTypeConfig(type, settings, fieldId)
}

function _renderTypeConfig(type, settings, fieldId) {
  const el = document.getElementById('anmFTypeConfig')
  if (!el) return
  const s = settings || {}

  if (['text', 'textarea', 'rich_text', 'label', 'description_text'].includes(type)) {
    el.innerHTML = ''; return
  }

  const wrap = (html) => `<div style="border-top:1px solid #F3F4F6;padding-top:14px;margin-top:4px;margin-bottom:4px">${html}</div>`
  const title = (t) => `<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:10px">${t}</div>`
  const grid2 = (html) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${html}</div>`
  const grid3 = (html) => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">${html}</div>`
  const field = (lbl, inp) => `<div class="cs-label-wrap"><label class="cs-label">${lbl}</label>${inp}</div>`

  if (type === 'section_title') {
    const align = s.align || 'left'
    const bg    = s.background || 'none'
    const alignBtn = (v, lbl) => {
      const active = align === v
      return `<button type="button" onclick="_anmSTAlign('${v}')" id="anmSTA_${v}"
        style="${active ? 'background:#7C3AED;color:#fff;border-color:#7C3AED' : 'background:#fff;color:#374151;border-color:#E5E7EB'};font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid;cursor:pointer">${lbl}</button>`
    }
    const bgBtn = (v, lbl) => {
      const active = bg === v
      return `<button type="button" onclick="_anmSTBg('${v}')" id="anmSTB_${v}"
        style="${active ? 'background:#7C3AED;color:#fff;border-color:#7C3AED' : 'background:#fff;color:#374151;border-color:#E5E7EB'};font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid;cursor:pointer">${lbl}</button>`
    }
    el.innerHTML = wrap(
      title('Estilo do Título') +
      `<input type="hidden" id="anmSTAlign" value="${align}">` +
      `<input type="hidden" id="anmSTBg"    value="${bg}">` +
      field('Alinhamento',
        `<div style="display:flex;gap:6px;flex-wrap:wrap">
          ${alignBtn('left','← Esquerda')}${alignBtn('center','↔ Centro')}${alignBtn('right','→ Direita')}
        </div>`) +
      field('Fundo',
        `<div style="display:flex;gap:6px;flex-wrap:wrap">
          ${bgBtn('none','Sem fundo')}${bgBtn('light','Fundo suave')}
        </div>`)
    ); return
  }

  if (type === 'boolean') {
    el.innerHTML = wrap(title('Opções Sim / Não') + grid2(
      field('Texto para "Sim"', `<input id="anmFBoolYes" class="cs-input" value="${_esc(s.yes_label||'Sim')}" placeholder="Sim">`) +
      field('Texto para "Não"', `<input id="anmFBoolNo"  class="cs-input" value="${_esc(s.no_label||'Não')}" placeholder="Não">`)
    )); return
  }

  if (type === 'number') {
    el.innerHTML = wrap(title('Limites numéricos') + grid2(
      field('Mínimo', `<input id="anmFNumMin" type="number" class="cs-input" value="${s.min??''}" placeholder="sem limite">`) +
      field('Máximo', `<input id="anmFNumMax" type="number" class="cs-input" value="${s.max??''}" placeholder="sem limite">`)
    )); return
  }

  if (type === 'date') {
    const sel = (v, lbl) => `<option value="${v}" ${(s.format||'date')===v?'selected':''}>${lbl}</option>`
    el.innerHTML = wrap(title('Formato de data') +
      field('Formato', `<select id="anmFDateFmt" class="cs-select">${sel('date','Data completa (DD/MM/AAAA)')}${sel('month','Mês e Ano (MM/AAAA)')}${sel('year','Apenas Ano (AAAA)')}</select>`)
    ); return
  }

  if (type === 'scale_select') {
    el.innerHTML = wrap(title('Configuração de Escala') + grid3(
      field('Mínimo',  `<input id="anmFScaleMin"  type="number" class="cs-input" value="${s.min??1}">`) +
      field('Máximo',  `<input id="anmFScaleMax"  type="number" class="cs-input" value="${s.max??10}">`) +
      field('Passo',   `<input id="anmFScaleStep" type="number" class="cs-input" value="${s.step??1}">`)
    ) + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">` +
      field('Label do mínimo', `<input id="anmFScaleMinL" class="cs-input" value="${_esc(s.min_label||'')}" placeholder="ex: Nada">`) +
      field('Label do máximo', `<input id="anmFScaleMaxL" class="cs-input" value="${_esc(s.max_label||'')}" placeholder="ex: Muito intenso">`) +
    `</div>`); return
  }

  if (type === 'file_upload' || type === 'image_upload') {
    const dflt = type === 'image_upload' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.png,.docx'
    el.innerHTML = wrap(title('Configuração de Upload') + grid2(
      field('Tipos aceitos',         `<input id="anmFUploadAccept" class="cs-input" value="${_esc(s.accept||dflt)}" placeholder=".pdf,.jpg">`) +
      field('Tamanho máximo (MB)',   `<input id="anmFUploadMax"   type="number" class="cs-input" value="${s.max_mb??10}">`)
    )); return
  }

  if (type === 'image_pair') {
    const count    = s.count || 2
    const inverted = s.inverted || false
    const showRadio= s.show_radio || false
    const genTitle = s.title || ''
    const genDesc  = s.description || ''
    const imgs     = s.images || Array.from({length: count}, () => ({ url:'', title:'' }))

    // Inicializa a cópia em memória com os dados carregados do banco
    _state._igImages = Array.from({length: count}, (_, i) => ({
      url:   (imgs[i] || {}).url   || '',
      title: (imgs[i] || {}).title || '',
    }))

    const pill = (id, label, active) =>
      `<button type="button" id="${id}" onclick="_anmIGCount(${label})"
        style="min-width:36px;padding:5px 12px;border-radius:6px;border:1.5px solid;cursor:pointer;font-size:12px;font-weight:600;transition:all .12s;${active
          ? 'background:#7C3AED;color:#fff;border-color:#7C3AED'
          : 'background:#fff;color:#374151;border-color:#E5E7EB'}">${label}</button>`

    // oninput atualiza _state._igImages para garantir persistência independente do DOM
    const imgCard = (n, img) => `
      <div style="border:1.5px solid #E5E7EB;border-radius:10px;padding:12px;background:#FAFAFA">
        <div style="font-size:11px;font-weight:700;color:#7C3AED;margin-bottom:8px;letter-spacing:.5px;display:flex;align-items:center;gap:6px">
          <div style="width:18px;height:18px;border-radius:5px;background:#EDE9FE;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7C3AED;font-weight:800">${n}</div>
          IMAGEM ${n}
        </div>
        ${field('URL', `<input id="anmIGImg${n}Url" class="cs-input" value="${_esc(img.url||'')}" placeholder="https://..."
          oninput="window._anmIGSetImg(${n-1},'url',this.value)">`)}
        ${field('Título', `<input id="anmIGImg${n}Title" class="cs-input" value="${_esc(img.title||'')}" placeholder="Ex: Opção A"
          oninput="window._anmIGSetImg(${n-1},'title',this.value)">`)}
      </div>`

    el.innerHTML = wrap(
      title('Grade de Imagens') +
      `<input type="hidden" id="anmIGCount" value="${count}">
       <input type="hidden" id="anmIGInverted" value="${inverted}">` +

      // Número de imagens
      `<div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#6B7280;margin-bottom:6px">Número de imagens</div>
        <div style="display:flex;gap:6px">
          ${pill('anmIGP2',2,count===2)}
          ${pill('anmIGP3',3,count===3)}
          ${pill('anmIGP4',4,count===4)}
        </div>
      </div>` +

      // Título e descrição gerais
      field('Título geral', `<input id="anmIGTitle" class="cs-input" value="${_esc(genTitle)}" placeholder="Ex: Como você se vê hoje?">`) +
      field('Descrição', `<input id="anmIGDesc" class="cs-input" value="${_esc(genDesc)}" placeholder="Instrução ao paciente (opcional)">`) +

      // Opções
      `<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#374151">
          <input type="checkbox" id="anmIGInvertedChk" ${inverted?'checked':''} onchange="_anmIGToggleInverted(this.checked)" style="accent-color:#7C3AED;width:14px;height:14px">
          Inverter ordem
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#374151">
          <input type="checkbox" id="anmIGRadioChk" ${showRadio?'checked':''} onchange="document.getElementById('anmIGShowRadio').value=this.checked" style="accent-color:#7C3AED;width:14px;height:14px">
          Seleção por radio button
        </label>
        <input type="hidden" id="anmIGShowRadio" value="${showRadio}">
      </div>` +

      // Cards das imagens
      `<div id="anmIGImgCards" style="display:flex;flex-direction:column;gap:8px">` +
      Array.from({length: count}, (_, i) => imgCard(i+1, imgs[i] || {})).join('') +
      `</div>`
    ); return
  }

  if (['single_select', 'radio_select', 'multi_select', 'single_select_dynamic'].includes(type)) {
    if (fieldId) {
      const opts = _state.options[fieldId] || []
      el.innerHTML = wrap(title('Opções de seleção') +
        (opts.length
          ? `<div style="font-size:12px;color:#6B7280">${opts.map(o => `<span style="display:inline-block;background:#F3F4F6;border-radius:5px;padding:2px 8px;margin:2px;font-size:11px">${_esc(o.label)}</span>`).join('')}</div><div style="font-size:11px;color:#9CA3AF;margin-top:6px">Edite as opções pelo botão <strong>Opções</strong> na lista de campos.</div>`
          : `<div style="font-size:12px;color:#9CA3AF">Use o botão <strong>Opções</strong> na lista de campos para gerenciar as opções.</div>`)
      ); return
    }
    // Campo novo: editor inline — começa com 3 opções padrão
    if (!_state._pendingOptions?.length) {
      _state._pendingOptions = [
        { label: 'Opção 1', value: 'opcao_1', order_index: 1 },
        { label: 'Opção 2', value: 'opcao_2', order_index: 2 },
        { label: 'Opção 3', value: 'opcao_3', order_index: 3 },
      ]
    }
    el.innerHTML = wrap(
      `<div style="margin-bottom:10px">${title('Opções do campo')}</div>` +
      `<div id="anmFInlineOptsList"></div>`
    )
    _renderInlineOpts()
    return
  }

  el.innerHTML = ''
}

function _renderInlineOpts() {
  const el = document.getElementById('anmFInlineOptsList')
  if (!el) return
  const opts = _state._pendingOptions || []
  const rows = opts.length
    ? opts.map((o, i) => `
    <div style="display:grid;grid-template-columns:1fr 1fr 28px;gap:6px;margin-bottom:6px;align-items:center">
      <input class="cs-input" style="font-size:12px;padding:5px 8px" placeholder="Label"
             value="${_esc(o.label)}" onchange="_updateInlineOpt(${i},'label',this.value)">
      <input class="cs-input" style="font-size:12px;padding:5px 8px" placeholder="Valor"
             value="${_esc(o.value)}" onchange="_updateInlineOpt(${i},'value',this.value)">
      <button type="button" onclick="_removeInlineOpt(${i})" class="anm-btn-xs anm-btn-danger-xs" style="padding:5px">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('')
    : ''
  el.innerHTML = rows +
    `<div style="display:flex;justify-content:flex-end;margin-top:6px">
      <button type="button" onclick="anamnAddInlineOpt()" class="anm-btn-xs">+ Opção</button>
    </div>`
}

function anamnAddInlineOpt() {
  _state._pendingOptions = _state._pendingOptions || []
  const n = _state._pendingOptions.length + 1
  _state._pendingOptions.push({ label: 'Opção ' + n, value: 'opcao_' + n, order_index: n })
  _renderInlineOpts()
}

function _updateInlineOpt(idx, field, value) {
  if (_state._pendingOptions?.[idx]) _state._pendingOptions[idx][field] = value
}

function _removeInlineOpt(idx) {
  _state._pendingOptions = (_state._pendingOptions || []).filter((_, i) => i !== idx)
  _renderInlineOpts()
}

function _collectTypeSettings(type) {
  const g = (id) => document.getElementById(id)
  if (type === 'section_title')
    return { align: g('anmSTAlign')?.value || 'left', background: g('anmSTBg')?.value || 'none' }
  if (type === 'boolean')
    return { yes_label: g('anmFBoolYes')?.value || 'Sim', no_label: g('anmFBoolNo')?.value || 'Não' }
  if (type === 'number')
    return { min: g('anmFNumMin')?.value !== '' ? Number(g('anmFNumMin').value) : null, max: g('anmFNumMax')?.value !== '' ? Number(g('anmFNumMax').value) : null }
  if (type === 'date')
    return { format: g('anmFDateFmt')?.value || 'date' }
  if (type === 'scale_select')
    return { min: Number(g('anmFScaleMin')?.value||1), max: Number(g('anmFScaleMax')?.value||10), step: Number(g('anmFScaleStep')?.value||1), min_label: g('anmFScaleMinL')?.value||'', max_label: g('anmFScaleMaxL')?.value||'' }
  if (type === 'file_upload' || type === 'image_upload')
    return { accept: g('anmFUploadAccept')?.value || '', max_mb: Number(g('anmFUploadMax')?.value||10) }
  if (type === 'image_pair') {
    const count = Number(g('anmIGCount')?.value || 2)
    // Usa _state._igImages como fonte primária (atualizado via oninput em tempo real)
    // e DOM como fallback para garantir que nenhum valor seja perdido
    const images = Array.from({length: count}, (_, i) => {
      const fromState = _state._igImages[i]
      const fromDom   = {
        url:   g(`anmIGImg${i+1}Url`)?.value   || '',
        title: g(`anmIGImg${i+1}Title`)?.value || '',
      }
      // Prefere o valor que não está vazio — DOM tem prioridade se o usuário digitou lá
      return {
        url:   fromDom.url   || fromState?.url   || '',
        title: fromDom.title || fromState?.title || '',
      }
    })
    // Sincroniza state com os valores finais coletados
    _state._igImages = images.map(img => ({ ...img }))
    return {
      count,
      inverted:   g('anmIGInverted')?.value === 'true',
      show_radio: g('anmIGShowRadio')?.value === 'true',
      title:      g('anmIGTitle')?.value  || '',
      description:g('anmIGDesc')?.value   || '',
      images,
    }
  }
  return {}
}

// ── SECTION TITLE helpers ──────────────────────────────────────────────────────
window._anmSTAlign = function(val) {
  const hid = document.getElementById('anmSTAlign')
  if (hid) hid.value = val
  const active = 'background:#7C3AED;color:#fff;border-color:#7C3AED;font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid;cursor:pointer'
  const normal = 'background:#fff;color:#374151;border-color:#E5E7EB;font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid;cursor:pointer'
  ;['left','center','right'].forEach(v => {
    const b = document.getElementById('anmSTA_' + v)
    if (b) b.style.cssText = v === val ? active : normal
  })
}

window._anmSTBg = function(val) {
  const hid = document.getElementById('anmSTBg')
  if (hid) hid.value = val
  const active = 'background:#7C3AED;color:#fff;border-color:#7C3AED;font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid;cursor:pointer'
  const normal = 'background:#fff;color:#374151;border-color:#E5E7EB;font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid;cursor:pointer'
  ;['none','light'].forEach(v => {
    const b = document.getElementById('anmSTB_' + v)
    if (b) b.style.cssText = v === val ? active : normal
  })
}

// ── IMAGE GRID helpers ─────────────────────────────────────────────────────────
// Atualiza um campo específico de _state._igImages ao digitar
window._anmIGSetImg = function(idx, field, value) {
  if (!_state._igImages[idx]) _state._igImages[idx] = { url: '', title: '' }
  _state._igImages[idx][field] = value
}

window._anmIGCount = function(n) {
  const hidEl = document.getElementById('anmIGCount')
  if (!hidEl) return
  hidEl.value = n
  // Atualiza pills
  ;[2,3,4].forEach(v => {
    const b = document.getElementById('anmIGP' + v)
    if (!b) return
    b.style.background   = v === n ? '#7C3AED' : '#fff'
    b.style.color        = v === n ? '#fff'    : '#374151'
    b.style.borderColor  = v === n ? '#7C3AED' : '#E5E7EB'
  })
  const container = document.getElementById('anmIGImgCards')
  if (!container) return

  // Expande ou encolhe _state._igImages mantendo valores existentes
  while (_state._igImages.length < n) _state._igImages.push({ url: '', title: '' })
  _state._igImages = _state._igImages.slice(0, n)

  container.innerHTML = Array.from({length: n}, (_, i) => {
    const img = _state._igImages[i] || {}
    return `
    <div style="border:1.5px solid #E5E7EB;border-radius:10px;padding:12px;background:#FAFAFA">
      <div style="font-size:11px;font-weight:700;color:#7C3AED;margin-bottom:8px;letter-spacing:.5px;display:flex;align-items:center;gap:6px">
        <div style="width:18px;height:18px;border-radius:5px;background:#EDE9FE;display:flex;align-items:center;justify-content:center;font-size:10px;color:#7C3AED;font-weight:800">${i+1}</div>
        IMAGEM ${i+1}
      </div>
      <div style="display:grid;gap:6px">
        <label style="font-size:11px;font-weight:600;color:#6B7280">URL</label>
        <input id="anmIGImg${i+1}Url" class="cs-input" value="${_esc(img.url||'')}" placeholder="https://..."
          oninput="window._anmIGSetImg(${i},'url',this.value)">
        <label style="font-size:11px;font-weight:600;color:#6B7280">Título</label>
        <input id="anmIGImg${i+1}Title" class="cs-input" value="${_esc(img.title||'')}" placeholder="Ex: Opção ${String.fromCharCode(65+i)}"
          oninput="window._anmIGSetImg(${i},'title',this.value)">
      </div>
    </div>`
  }).join('')
}

window._anmIGToggleInverted = function(checked) {
  const hidEl = document.getElementById('anmIGInverted')
  if (hidEl) hidEl.value = checked
}

// ── DRAG & DROP ────────────────────────────────────────────────────────────────

// ── Sessões ──────────────────────────────────────────────────────────────────
function _dndSessStart(e, id) {
  _dnd = { type: 'session', id, fieldId: null }
  e.dataTransfer.effectAllowed = 'move'
  e.stopPropagation()
  const item = e.currentTarget.closest('.anm-session-item') || e.currentTarget.parentElement
  setTimeout(() => item?.classList.add('anm-dragging'), 0)
}

function _dndSessOver(e, id) {
  if (_dnd.type !== 'session' || _dnd.id === id) return
  e.preventDefault()
  document.querySelectorAll('.anm-session-item.anm-drag-over').forEach(el => el.classList.remove('anm-drag-over'))
  e.currentTarget.classList.add('anm-drag-over')
}

function _dndSessDrop(e, targetId) {
  e.preventDefault()
  e.currentTarget.classList.remove('anm-drag-over')
  if (_dnd.type !== 'session' || _dnd.id === targetId) return
  const srcIdx = _state.sessions.findIndex(s => s.id === _dnd.id)
  const tgtIdx = _state.sessions.findIndex(s => s.id === targetId)
  if (srcIdx < 0 || tgtIdx < 0) return
  // Snapshot para rollback em caso de falha na persistência
  const snapshot = _state.sessions.map(s => ({ ...s }))
  const [moved] = _state.sessions.splice(srcIdx, 1)
  _state.sessions.splice(tgtIdx, 0, moved)
  _state.sessions.forEach((s, i) => { s.order_index = i + 1 })
  _renderBuilderSessions()
  _persistOrder('/anamnesis_template_sessions', _state.sessions).catch(err => {
    _state.sessions = snapshot
    _renderBuilderSessions()
    _showToast('Erro ao reordenar sessão: ' + _parseDbError(err), 'error')
  })
  _showToast('Sessão reordenada')
}

// ── Campos ───────────────────────────────────────────────────────────────────
function _dndFieldStart(e, id) {
  _dnd = { type: 'field', id, fieldId: null }
  e.dataTransfer.effectAllowed = 'move'
  e.stopPropagation()
  const item = e.currentTarget.closest('.anm-field-item') || e.currentTarget.parentElement
  setTimeout(() => item?.classList.add('anm-dragging'), 0)
}

function _dndFieldOver(e, id) {
  if (_dnd.type !== 'field' || _dnd.id === id) return
  e.preventDefault()
  document.querySelectorAll('.anm-field-item.anm-drag-over').forEach(el => el.classList.remove('anm-drag-over'))
  e.currentTarget.classList.add('anm-drag-over')
}

function _dndFieldDrop(e, targetId) {
  e.preventDefault()
  e.currentTarget.classList.remove('anm-drag-over')
  if (_dnd.type !== 'field' || _dnd.id === targetId) return
  const srcIdx = _state.fields.findIndex(f => f.id === _dnd.id)
  const tgtIdx = _state.fields.findIndex(f => f.id === targetId)
  if (srcIdx < 0 || tgtIdx < 0) return
  // Snapshot para rollback em caso de falha na persistência
  const snapshot = _state.fields.map(f => ({ ...f }))
  const [moved] = _state.fields.splice(srcIdx, 1)
  _state.fields.splice(tgtIdx, 0, moved)
  _state.fields.forEach((f, i) => { f.order_index = i + 1 })
  _renderBuilderFieldsList()
  _persistOrder('/anamnesis_fields', _state.fields).catch(err => {
    _state.fields = snapshot
    _renderBuilderFieldsList()
    _showToast('Erro ao reordenar campo: ' + _parseDbError(err), 'error')
  })
  _showToast('Campo reordenado')
}

function _dndTrashOver(e) {
  if (_dnd.type !== 'field') return
  e.preventDefault()
  e.currentTarget.classList.add('anm-trash-active')
}

function _dndTrashLeave(e) {
  e.currentTarget.classList.remove('anm-trash-active')
}

function _dndTrashDrop(e) {
  e.preventDefault()
  e.currentTarget.classList.remove('anm-trash-active')
  if (_dnd.type !== 'field') return
  const id = _dnd.id
  const f = _state.fields.find(x => x.id === id)
  _dnd = { type: null, id: null, fieldId: null }
  if (!confirm(`Excluir o campo "${f?.label || 'este campo'}"?`)) return
  _deleteFieldDirect(id)
}

async function _deleteFieldDirect(fieldId) {
  try {
    // Verifica se existem respostas para este campo antes de excluir
    const existing = await _get('/anamnesis_answers', {
      'field_id': 'eq.' + fieldId,
      'select':   'id',
      'limit':    '1',
    }).catch(() => [])
    if (existing?.length) {
      const ok = confirm(
        'Este campo possui respostas de pacientes.\n\n' +
        'O campo será desativado e não aparecerá em novos formulários, ' +
        'mas as respostas existentes serão preservadas.\n\nDeseja continuar?'
      )
      if (!ok) return
    }

    const now = new Date().toISOString()
    // Soft-delete: preserva histórico de respostas clínicas; zera order_index (evita tombstone)
    await _patch('/anamnesis_fields',
      { 'id': 'eq.' + fieldId },
      { deleted_at: now, is_active: false, order_index: null }
    )
    await _patch('/anamnesis_field_options',
      { 'field_id': 'eq.' + fieldId },
      { is_active: false }
    ).catch(e => console.warn("[anamnese-builder]", e.message || e))
    _state.fields = _state.fields.filter(f => f.id !== fieldId)
    _renderBuilderFieldsList()
    _showToast('Campo excluído')
  } catch (e) {
    _showToast('Erro ao excluir campo: ' + _parseDbError(e), 'error')
  }
}

// ── Opções ───────────────────────────────────────────────────────────────────
function _dndOptStart(e, fieldId, optId) {
  _dnd = { type: 'option', id: optId, fieldId }
  e.dataTransfer.effectAllowed = 'move'
  e.stopPropagation()
  const item = e.currentTarget.closest('.anm-option-item') || e.currentTarget.parentElement
  setTimeout(() => item?.classList.add('anm-dragging'), 0)
}

function _dndOptOver(e, optId) {
  if (_dnd.type !== 'option' || _dnd.id === optId) return
  e.preventDefault()
  document.querySelectorAll('.anm-option-item.anm-drag-over').forEach(el => el.classList.remove('anm-drag-over'))
  e.currentTarget.classList.add('anm-drag-over')
}

function _dndOptDrop(e, fieldId, targetOptId) {
  e.preventDefault()
  e.currentTarget.classList.remove('anm-drag-over')
  if (_dnd.type !== 'option' || _dnd.id === targetOptId || _dnd.fieldId !== fieldId) return
  const opts = _state.options[fieldId] || []
  const srcIdx = opts.findIndex(o => o.id === _dnd.id)
  const tgtIdx = opts.findIndex(o => o.id === targetOptId)
  if (srcIdx < 0 || tgtIdx < 0) return
  const [moved] = opts.splice(srcIdx, 1)
  opts.splice(tgtIdx, 0, moved)
  opts.forEach((o, i) => { o.order_index = i + 1 })
  _renderFieldOptions(fieldId)
  _persistOrder('/anamnesis_field_options', opts)
  _showToast('Opção reordenada')
}

// ── Shared ────────────────────────────────────────────────────────────────────
function _dndEnd() {
  document.querySelectorAll('.anm-dragging').forEach(el => el.classList.remove('anm-dragging'))
  document.querySelectorAll('.anm-drag-over').forEach(el => el.classList.remove('anm-drag-over'))
  _dnd = { type: null, id: null, fieldId: null }
}

// REF-02 — delega reordenação para RPCs atômicas no banco.
// Uma única chamada por operação substitui N×2 PATCHes individuais.
async function _persistOrder(path, items) {
  if (!items.length) return
  const ids = items.map(x => x.id)
  if (path === '/anamnesis_template_sessions') {
    const tplId = _state.tpl?.id
    if (!tplId) return
    await _rpc('reorder_anamnesis_sessions', { p_template_id: tplId, p_ids: ids })
  } else if (path === '/anamnesis_fields') {
    const sessId = _state.activeSession
    if (!sessId) return
    await _rpc('reorder_anamnesis_fields', { p_session_id: sessId, p_ids: ids })
  } else if (path === '/anamnesis_field_options') {
    // field_id vem do próprio item (coluna da tabela)
    const fieldId = items[0]?.field_id
    if (!fieldId) return
    await _rpc('reorder_anamnesis_field_options', { p_field_id: fieldId, p_ids: ids })
  }
}

// ── Utilitários ────────────────────────────────────────────────────────────
// ── Preview Mobile ───────────────────────────────────────────────────────

// Tenta descobrir o IP local da rede via WebRTC
function _getLocalIP() {
  return new Promise(resolve => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] })
      pc.createDataChannel('')
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => resolve(null))
      pc.onicecandidate = e => {
        if (!e?.candidate) return
        const m = e.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/)
        if (m && m[1] !== '127.0.0.1' && !m[1].startsWith('169.')) {
          resolve(m[1])
          pc.close()
        }
      }
      setTimeout(() => resolve(null), 2500)
    } catch { resolve(null) }
  })
}

async function anamnOpenMobilePreview() {
  if (!_state.tpl) return
  const id   = _state.tpl.id
  const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80')
  const path = window.location.pathname.replace(/\/[^/]*$/, '')

  // Se já estamos num IP real (não localhost/file), usa direto; senão tenta WebRTC
  let ip = null
  const host = window.location.hostname
  if (host && host !== 'localhost' && host !== '127.0.0.1' && !/^file/.test(window.location.protocol)) {
    ip = host
  } else {
    ip = await _getLocalIP()
  }

  const buildUrl = (ipVal, portVal) => {
    const p = portVal ? `:${portVal}` : ''
    return `http://${ipVal}${p}${path}/form-render.html?id=${id}&mode=test`
  }

  // URL relativa — funciona em qualquer ambiente (local, staging, produção)
  const localUrl = `${path}/form-render.html?id=${id}&mode=test`
  // URL com IP — necessária apenas para abrir no celular físico via QR ou link
  const formUrl = ip ? buildUrl(ip, port) : ''

  // Remove modal anterior se existir
  document.getElementById('anmMobileModal')?.remove()

  // guardamos para _anmRebuildQR poder recalcular
  window._anmMobileState = { id, port, path }

  const modal = document.createElement('div')
  modal.id = 'anmMobileModal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px'

  // Banner de alerta quando IP não foi detectado
  const ipAlertBanner = ip ? '' : `
    <div style="background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start">
      <svg width="16" height="16" fill="none" stroke="#D97706" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>
        <div style="font-size:12px;font-weight:700;color:#92400E;margin-bottom:2px">IP nao detectado automaticamente</div>
        <div style="font-size:11px;color:#92400E;line-height:1.5">Digite o IP do seu computador no campo abaixo.<br>Para descobrir o IP: abra o <b>Prompt de Comando</b> e rode:</div>
        <div style="background:#1E1E2E;border-radius:6px;padding:6px 10px;font-family:monospace;font-size:11px;color:#FCD34D;display:flex;align-items:center;justify-content:space-between;margin-top:6px">
          <span>ipconfig</span>
          <button onclick="navigator.clipboard.writeText('ipconfig')"
            style="background:rgba(252,211,77,.15);border:none;cursor:pointer;padding:2px 7px;border-radius:4px;color:#FCD34D;font-size:10px;font-weight:600">Copiar</button>
        </div>
        <div style="font-size:10px;color:#92400E;margin-top:4px">Procure <b>"Endereço IPv4"</b> no adaptador <b>Wi-Fi</b> (ex: 192.168.1.10)</div>
      </div>
    </div>`

  const ipInputBorderColor = ip ? '#10B981' : '#F59E0B'
  const ipInputLabel = ip
    ? `<span style="color:#10B981;font-size:11px;font-weight:600;display:flex;align-items:center;gap:3px"><svg width="12" height="12" fill="none" stroke="#10B981" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Detectado</span>`
    : `<span style="color:#F59E0B;font-size:11px;font-weight:600">Digite abaixo</span>`

  const qrBlock = ip
    ? `<canvas id="anmMQrCanvas" width="140" height="140" style="display:block;border-radius:4px"></canvas>`
    : `<div id="anmMQrPlaceholder" style="width:140px;height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#FFFBEB;border-radius:8px">
         <svg width="28" height="28" fill="none" stroke="#D97706" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>
         <div style="font-size:9px;color:#D97706;text-align:center;line-height:1.4;font-weight:600">Digite o IP<br>para gerar</div>
       </div>`

  modal.innerHTML = `
    <div style="background:#fff;border-radius:18px;width:100%;max-width:520px;box-shadow:0 24px 60px rgba(0,0,0,.18);overflow:hidden;max-height:90vh;overflow-y:auto">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #F3F4F6;position:sticky;top:0;background:#fff;z-index:2">
        <div>
          <div style="font-size:14px;font-weight:700;color:#111">Testar no Celular</div>
          <div style="font-size:11px;color:#9CA3AF;margin-top:1px">${_esc(_state.tpl.name || '')}</div>
        </div>
        <button onclick="document.getElementById('anmMobileModal').remove()"
          style="background:#F3F4F6;border:none;cursor:pointer;padding:7px;border-radius:8px;color:#6B7280;display:flex;align-items:center">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid #F3F4F6">
        <button id="anmMTabQr" onclick="anmnSwitchTab('qr')"
          style="flex:1;padding:11px;font-size:12px;font-weight:600;color:#7C3AED;border:none;border-bottom:2px solid #7C3AED;background:#fff;cursor:pointer">
          QR Code — Celular
        </button>
        <button id="anmMTabFrame" onclick="anmnSwitchTab('frame')"
          style="flex:1;padding:11px;font-size:12px;font-weight:500;color:#9CA3AF;border:none;border-bottom:2px solid transparent;background:#fff;cursor:pointer">
          Preview no Navegador
        </button>
      </div>

      <!-- Tab QR -->
      <div id="anmMPaneQr" style="padding:20px 22px">

        ${ipAlertBanner}

        <!-- Servidor -->
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px">
          <div style="width:22px;height:22px;background:#7C3AED;color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:#111;margin-bottom:4px">Inicie o servidor local</div>
            <div style="background:#1E1E2E;border-radius:8px;padding:9px 12px;font-family:monospace;font-size:12px;color:#A78BFA;display:flex;align-items:center;justify-content:space-between">
              <span>npx serve . -p 3000</span>
              <button onclick="navigator.clipboard.writeText('npx serve . -p 3000')"
                style="background:rgba(167,139,250,.15);border:none;cursor:pointer;padding:3px 8px;border-radius:5px;color:#A78BFA;font-size:10px;font-weight:600">
                Copiar
              </button>
            </div>
            <div style="font-size:10px;color:#9CA3AF;margin-top:3px">O terminal mostrará a URL de rede. Use a linha <b style="color:#111">Network:</b></div>
          </div>
        </div>

        <!-- IP -->
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px">
          <div style="width:22px;height:22px;background:#7C3AED;color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="font-size:12px;font-weight:600;color:#111">IP do seu computador</div>
              ${ipInputLabel}
            </div>
            <div style="display:flex;gap:6px">
              <input id="anmMIpInput" value="${_esc(ip || '')}" placeholder="ex: 192.168.1.10" autofocus
                style="flex:1;border:2px solid ${ipInputBorderColor};border-radius:7px;padding:8px 12px;font-size:13px;font-family:monospace;outline:none;transition:border-color .2s"
                oninput="window._anmRebuildQR(this.value)">
              <input id="anmMPortInput" value="${_esc(port || '3000')}" placeholder="3000"
                style="width:70px;border:1.5px solid #E5E7EB;border-radius:7px;padding:8px 10px;font-size:13px;font-family:monospace;outline:none;text-align:center"
                oninput="window._anmRebuildQR(document.getElementById('anmMIpInput').value,this.value)">
            </div>
            ${ip ? '' : '<div style="font-size:10px;color:#9CA3AF;margin-top:4px">Cole o Endereço IPv4 do adaptador Wi-Fi (do <code>ipconfig</code> acima)</div>'}
          </div>
        </div>

        <!-- QR -->
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="width:22px;height:22px;background:${ip ? '#10B981' : '#D1D5DB'};color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:${ip ? '#111' : '#9CA3AF'};margin-bottom:8px">Escaneie com o celular</div>
            <div style="display:flex;gap:14px;align-items:center">
              <div id="anmMQrWrap" style="background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:12px;padding:8px;flex-shrink:0">
                ${qrBlock}
              </div>
              <div style="flex:1">
                <div style="font-size:10px;color:#9CA3AF;margin-bottom:3px;text-transform:uppercase;letter-spacing:.4px;font-weight:600">URL gerada</div>
                <div id="anmMFormUrl" style="font-size:10px;color:${ip ? '#7C3AED' : '#9CA3AF'};word-break:break-all;background:${ip ? '#F5F3FF' : '#F9FAFB'};padding:7px;border-radius:6px;font-family:monospace;line-height:1.4">${ip ? _esc(formUrl) : 'Aguardando IP...'}</div>
                <button onclick="if(document.getElementById('anmMFormUrl').textContent!=='Aguardando IP...')navigator.clipboard.writeText(document.getElementById('anmMFormUrl').textContent)"
                  style="margin-top:5px;background:${ip ? '#F5F3FF' : '#F3F4F6'};border:1px solid ${ip ? '#DDD6FE' : '#E5E7EB'};border-radius:6px;color:${ip ? '#7C3AED' : '#9CA3AF'};font-size:10px;font-weight:600;padding:5px 10px;cursor:pointer;width:100%">
                  Copiar URL
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Tab Frame -->
      <div id="anmMPaneFrame" style="display:none;padding:16px 22px 22px">
        <div style="font-size:11px;color:#9CA3AF;margin-bottom:10px;text-align:center">Simulação de tela mobile (390px)</div>
        <div style="display:flex;justify-content:center">
          <div style="width:390px;height:600px;border:8px solid #1E1E2E;border-radius:40px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative;background:#000">
            <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:120px;height:6px;background:#1E1E2E;border-radius:0 0 10px 10px;z-index:2"></div>
            <iframe id="anmMFrame" src="${localUrl}" style="width:100%;height:100%;border:none;background:#fff;border-radius:32px" loading="lazy"></iframe>
          </div>
        </div>
        <div style="text-align:center;margin-top:10px;display:flex;gap:8px;justify-content:center">
          <button onclick="const f=document.getElementById('anmMFrame');if(f)f.src=f.src"
            style="font-size:11px;color:#6B7280;background:none;border:1px solid #E5E7EB;border-radius:6px;padding:5px 12px;cursor:pointer">
            Recarregar
          </button>
          <a href="${localUrl}" target="_blank"
            style="font-size:11px;color:#7C3AED;background:none;border:1px solid #DDD6FE;border-radius:6px;padding:5px 12px;cursor:pointer;text-decoration:none">
            Abrir em nova aba
          </a>
        </div>
      </div>

    </div>`

  document.body.appendChild(modal)
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })

  // Renderiza QR local se IP disponível
  if (ip) {
    const qrCanvas = modal.querySelector('#anmMQrCanvas')
    if (qrCanvas && window.QRLocal) window.QRLocal.toCanvas(qrCanvas, formUrl, { size: 140 })
  }

  // Auto-foca no campo de IP quando não foi detectado automaticamente
  if (!ip) {
    setTimeout(() => {
      const ipInp = document.getElementById('anmMIpInput')
      if (ipInp) ipInp.focus()
    }, 100)
  }
}

window._anmRebuildQR = function(ipVal, portVal) {
  const st  = window._anmMobileState
  if (!st) return
  const ip  = (ipVal ?? '').trim()
  const p   = ((portVal ?? document.getElementById('anmMPortInput')?.value ?? '3000')).toString().trim()
  const isValidIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)

  const urlEl  = document.getElementById('anmMFormUrl')
  const wrap   = document.getElementById('anmMQrWrap')
  const ipInp  = document.getElementById('anmMIpInput')

  if (!isValidIp) {
    // IP inválido: mostra placeholder
    if (wrap) wrap.innerHTML = `<div style="width:140px;height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#FFFBEB;border-radius:8px"><svg width="28" height="28" fill="none" stroke="#D97706" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg><div style="font-size:9px;color:#D97706;text-align:center;line-height:1.4;font-weight:600">IP inválido</div></div>`
    if (urlEl) { urlEl.textContent = 'Aguardando IP...'; urlEl.style.color = '#9CA3AF'; urlEl.style.background = '#F9FAFB' }
    if (ipInp) ipInp.style.borderColor = ip.length > 0 ? '#EF4444' : '#F59E0B'
    return
  }

  // IP válido
  if (ipInp) ipInp.style.borderColor = '#10B981'
  const url    = `http://${ip}:${p}${st.path}/form-render.html?id=${st.id}&mode=test`
  if (wrap) {
    wrap.innerHTML = '<canvas id="anmMQrCanvas" width="140" height="140" style="display:block;border-radius:4px"></canvas>'
    const qrCanvas = wrap.querySelector('canvas')
    if (qrCanvas && window.QRLocal) window.QRLocal.toCanvas(qrCanvas, url, { size: 140 })
  }
  if (urlEl)  { urlEl.textContent = url; urlEl.style.color = '#7C3AED'; urlEl.style.background = '#F5F3FF' }

  // Atualiza iframe se existir, ou substitui o placeholder
  const frame = document.getElementById('anmMFrame')
  if (frame) {
    frame.src = url
  } else {
    const msgEl = document.getElementById('anmMFrameMsg')
    if (msgEl) {
      const iframe = document.createElement('iframe')
      iframe.id = 'anmMFrame'
      iframe.src = url
      iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;border-radius:32px'
      iframe.loading = 'lazy'
      msgEl.replaceWith(iframe)
    }
  }

  // Atualiza link "Abrir em nova aba"
  const tabLink = document.getElementById('anmMOpenTab')
  if (tabLink) { tabLink.href = url; tabLink.target = '_blank'; tabLink.style.color = '#7C3AED'; tabLink.style.borderColor = '#DDD6FE'; tabLink.onclick = null }
}

window.anmnSwitchTab = function(tab) {
  const qrPane    = document.getElementById('anmMPaneQr')
  const framePane = document.getElementById('anmMPaneFrame')
  const tabQr     = document.getElementById('anmMTabQr')
  const tabFrame  = document.getElementById('anmMTabFrame')
  if (tab === 'qr') {
    qrPane.style.display    = 'block'
    framePane.style.display = 'none'
    tabQr.style.color       = '#7C3AED'
    tabQr.style.borderBottomColor = '#7C3AED'
    tabQr.style.fontWeight  = '600'
    tabFrame.style.color    = '#9CA3AF'
    tabFrame.style.borderBottomColor = 'transparent'
    tabFrame.style.fontWeight = '500'
  } else {
    qrPane.style.display    = 'none'
    framePane.style.display = 'block'
    tabFrame.style.color    = '#7C3AED'
    tabFrame.style.borderBottomColor = '#7C3AED'
    tabFrame.style.fontWeight = '600'
    tabQr.style.color       = '#9CA3AF'
    tabQr.style.borderBottomColor = 'transparent'
    tabQr.style.fontWeight  = '500'
  }
}

// ── Sessão de Dados Gerais ────────────────────────────────────────────────
function _getGeneralSessionFlag() {
  if (!_state.tpl) return false
  // Tenta leitura do DB primeiro, fallback localStorage
  if (_state.tpl.settings_json?.has_general_session !== undefined)
    return !!_state.tpl.settings_json.has_general_session
  const map = JSON.parse(localStorage.getItem('anm_tpl_settings') || '{}')
  return !!(map[_state.tpl.id]?.has_general_session ?? true) // default: ativado
}

function _updateGeneralSessionBtn() {
  const btn = document.getElementById('anmBtnGeneralSession')
  if (!btn) return
  const enabled = _getGeneralSessionFlag()
  btn.style.borderColor = enabled ? '#7C3AED' : '#E5E7EB'
  btn.style.background  = enabled ? '#F5F3FF' : '#fff'
  btn.style.color       = enabled ? '#7C3AED' : '#9CA3AF'
  btn.title = enabled ? 'Dados Gerais: ATIVADO — clique para desativar' : 'Dados Gerais: DESATIVADO — clique para ativar'
}

async function anamnToggleGeneralSession() {
  if (!_state.tpl) return
  const current = _getGeneralSessionFlag()
  const enabled = !current

  // Tenta salvar no DB
  try {
    const sj = { ...(typeof _state.tpl.settings_json === 'object' ? _state.tpl.settings_json : {}), has_general_session: enabled }
    await _patch('/anamnesis_templates', { 'id': 'eq.' + _state.tpl.id }, { settings_json: sj })
    if (!_state.tpl.settings_json) _state.tpl.settings_json = {}
    _state.tpl.settings_json.has_general_session = enabled
  } catch (_) {
    // Fallback: localStorage
  }

  // Sempre salva no localStorage (cache garantido)
  const map = JSON.parse(localStorage.getItem('anm_tpl_settings') || '{}')
  if (!map[_state.tpl.id]) map[_state.tpl.id] = {}
  map[_state.tpl.id].has_general_session = enabled
  localStorage.setItem('anm_tpl_settings', JSON.stringify(map))

  _updateGeneralSessionBtn()
  _showToast(enabled ? 'Sessão "Dados Gerais" ativada — aparecerá sempre como 1ª sessão' : 'Sessão "Dados Gerais" desativada', enabled ? 'success' : 'info')
}

// ── Exposição global (builder) ────────────────────────────────────────────
window.anamneseOpenBuilder       = anamneseOpenBuilder
window.anamneseCloseBuilder      = anamneseCloseBuilder
window.anamnBuilderTab           = anamnBuilderTab
window.anamnSelectSession        = anamnSelectSession
window.anamnAddSession           = anamnAddSession
window.anamnCancelAddSession     = anamnCancelAddSession
window.anamnSaveNewSession       = anamnSaveNewSession
window.anamnEditSession          = anamnEditSession
window.anamnDeleteSession        = anamnDeleteSession
window.anamnAddField             = anamnAddField
window.anamnEditField            = anamnEditField
window.anamnCloseFieldModal      = anamnCloseFieldModal
window.anamnCancelFieldForm      = anamnCancelFieldForm
window.anamnShowTypePicker       = anamnShowTypePicker
window.anamnHideTypePicker       = anamnHideTypePicker
window.anamnSelectFieldType      = anamnSelectFieldType
window.anamnSaveField            = anamnSaveField
window.anamnBuilderToggleTest    = anamnBuilderToggleTest
window.anamnTestReset            = anamnTestReset
window.anamnTestGo               = anamnTestGo
window.anamnDeleteField          = anamnDeleteField
window.anamnMoveField            = anamnMoveField
window.anamnDuplicateField       = anamnDuplicateField
window.anamnSaveBlock            = anamnSaveBlock
window.anamnOpenMobilePreview    = anamnOpenMobilePreview
window.anamnOpenFieldOptions     = anamnOpenFieldOptions
window.anamnCloseOptionsModal    = anamnCloseOptionsModal
window.anamnUpdateOptionInline   = anamnUpdateOptionInline
window.anamnAddOption            = anamnAddOption
window.anamnAddOutrosOption      = anamnAddOutrosOption
window.anamnDeleteOption         = anamnDeleteOption
window.anamnFieldTypeChanged     = anamnFieldTypeChanged
window.anamnAddInlineOpt         = anamnAddInlineOpt
window._updateInlineOpt          = _updateInlineOpt
window._removeInlineOpt          = _removeInlineOpt
window._dndSessStart             = _dndSessStart
window._dndSessOver              = _dndSessOver
window._dndSessDrop              = _dndSessDrop
window._dndFieldStart            = _dndFieldStart
window._dndFieldOver             = _dndFieldOver
window._dndFieldDrop             = _dndFieldDrop
window._dndTrashOver             = _dndTrashOver
window._dndTrashLeave            = _dndTrashLeave
window._dndTrashDrop             = _dndTrashDrop
window._dndOptStart              = _dndOptStart
window._dndOptOver               = _dndOptOver
window._dndOptDrop               = _dndOptDrop
window._dndEnd                   = _dndEnd
window.anamnToggleGeneralSession = anamnToggleGeneralSession
window.anmnSwitchTab             = anmnSwitchTab
