/**
 * ClinicAI — LeadsTable (extraído de leads.js no Sprint 9)
 *
 * Renderização da tabela de leads e todas as ações inline:
 * toggle ativo, tag popover, editar, deletar.
 *
 * Depende de globals em leads.js:
 *   _leadsRefreshKanban(), _leadsUpdateCache(), viewLead()
 *
 * Expõe globalmente:
 *   renderLeadsTable(leads)
 *   leadsToggleActive(leadId, leadName, isActive, checkbox, e)
 *   leadsOpenTagPopover(leadId, anchorBtn)
 *   leadsActionEdit(leadId, e)
 *   leadsActionDelete(leadId, leadName, e)
 */

// ── Configuração de fase e temperatura ───────────────────────

var _TABLE_PHASE_CFG = {
  captacao:    { label: 'Captacao',    color: '#6366f1' },
  agendamento: { label: 'Agendamento', color: '#8b5cf6' },
  paciente:    { label: 'Paciente',    color: '#10b981' },
  orcamento:   { label: 'Orcamento',   color: '#f59e0b' },
}

var _TABLE_TEMP_CFG = {
  cold: { label: 'Frio',   color: '#93c5fd', bg: '#eff6ff' },
  warm: { label: 'Morno',  color: '#f59e0b', bg: '#fffbeb' },
  hot:  { label: 'Quente', color: '#f87171', bg: '#fef2f2' },
}

// ── Renderização da tabela ────────────────────────────────────

function renderLeadsTable(leads, offset, append) {
  var tbody = document.getElementById('leadsTableBody')
  if (!tbody) return
  offset = offset || 0

  if (!append && !leads.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF">Nenhum lead encontrado</td></tr>'
    return
  }

  var html = leads.map(function(lead, idx) {
    var rowIdx = offset + idx
    var tc = _TABLE_TEMP_CFG[lead.temperature] || _TABLE_TEMP_CFG.cold

    var phone  = lead.phone || lead.whatsapp || lead.telefone || ''
    var digits = phone.replace(/\D/g, '')
    var waHref = digits ? 'https://wa.me/' + (window.formatWaPhone ? formatWaPhone(digits) : '55'+digits) : ''
    var waBtnHtml = waHref
      ? '<a href="' + waHref + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" ' +
        'style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;color:#22c55e;background:#f0fdf4;border:1px solid #bbf7d0;text-decoration:none;flex-shrink:0;transition:background 0.12s" ' +
        'title="Abrir no WhatsApp">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
        '</a>'
      : ''

    var esc = window.escHtml || function(s) { return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
    var safeName  = (lead.name || '').replace(/'/g, "\\'")
    var safePhone = phone.replace(/'/g, "\\'")

    return '<tr data-lead-row="1" style="border-bottom:1px solid #F3F4F6;cursor:pointer" onclick="viewLead(\'' + esc(lead.id) + '\')">' +

      '<td style="padding:12px 8px 12px 16px;font-size:12px;color:#9CA3AF;font-weight:500">' + (rowIdx + 1) + '</td>' +

      '<td style="padding:12px 16px">' +
        '<div style="font-weight:500;color:#111;font-size:14px">' + esc(lead.name || '—') + '</div>' +
        '<div style="display:flex;align-items:center;gap:5px;margin-top:2px">' +
          '<span style="font-size:12px;color:#9CA3AF">' + esc(phone) + '</span>' +
          waBtnHtml +
        '</div>' +
      '</td>' +

      '<td style="padding:8px 16px" onclick="event.stopPropagation()">' +
        '<button class="lt-temp-badge" data-lead-id="' + lead.id + '" data-temp="' + (lead.temperature || 'cold') + '" ' +
          'onclick="_leadsTempPopover(this,\'' + lead.id + '\',\'' + (lead.temperature || 'cold') + '\')" ' +
          'style="color:' + tc.color + ';background:' + tc.bg + ';border-color:' + tc.color + '40">' +
          '<span class="lc-badge-dot" style="background:' + tc.color + '"></span>' + tc.label +
        '</button>' +
      '</td>' +

      '<td style="padding:8px 16px" onclick="event.stopPropagation()">' +
        '<div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;overflow:hidden" data-tags-row="' + lead.id + '">' +
          '<span style="font-size:11px;color:#d1d5db">—</span>' +
        '</div>' +
        '<button class="lt-tag-add-btn" onclick="leadsOpenTagPopover(\'' + lead.id + '\',this)" title="Gerenciar tags">' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>' +
      '</td>' +

      (function() {
        var cf   = lead.customFields || lead.data || {}
        var nd   = (lead.data && lead.data.data) || cf.data || {}  // data aninhado do import legado
        var qf   = lead.queixas_faciais || cf.queixas_faciais || nd.queixas_faciais || []
        var qfArr = Array.isArray(qf) ? qf : []
        var queixa = qfArr.length
          ? qfArr.map(function(x){ return typeof x === 'string' ? x : (x && (x.label || x.nome || x.name)) || '' }).filter(Boolean).join(', ')
          : (cf.queixaPrincipal || cf.queixa || cf.queixas || nd.queixa || nd.queixas || lead.queixas || lead.queixa || '')
        return '<td style="padding:8px 16px;max-width:200px">' +
          (queixa
            ? '<span style="font-size:11px;color:#374151;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3">' + queixa.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>'
            : '<span style="font-size:11px;color:#d1d5db">—</span>') +
        '</td>'
      })() +

      '<td style="padding:12px 16px;text-align:center" onclick="event.stopPropagation()">' +
        '<label class="lt-toggle" title="' + (lead.is_active === false ? 'Ativar lead' : 'Desativar lead') + '">' +
          '<input type="checkbox" ' + (lead.is_active !== false ? 'checked' : '') + ' ' +
            'onchange="leadsToggleActive(\'' + lead.id + '\',\'' + safeName + '\',this.checked,this,event)">' +
          '<span class="lt-toggle-track"></span>' +
        '</label>' +
      '</td>' +

      '<td style="padding:12px 16px;text-align:center" onclick="event.stopPropagation()">' +
        '<div style="display:inline-flex;gap:4px;align-items:center">' +
          '<button onclick="leadsActionSchedule(\'' + lead.id + '\',\'' + safeName + '\',\'' + safePhone + '\',event)" title="Agendar" ' +
            'style="background:none;border:1px solid #e5e7eb;padding:5px 7px;border-radius:7px;cursor:pointer;color:#6b7280;display:flex;align-items:center;transition:all 0.12s">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
          '</button>' +
          '<button onclick="leadsActionEdit(\'' + lead.id + '\',event)" title="Editar" ' +
            'style="background:none;border:1px solid #e5e7eb;padding:5px 7px;border-radius:7px;cursor:pointer;color:#6b7280;display:flex;align-items:center;transition:all 0.12s">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button onclick="leadsActionDelete(\'' + lead.id + '\',\'' + safeName + '\',event)" title="Deletar" ' +
            'style="background:none;border:1px solid #fee2e2;padding:5px 7px;border-radius:7px;cursor:pointer;color:#ef4444;display:flex;align-items:center;transition:all 0.12s">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</td>' +

    '</tr>'
  }).join('')

  if (append) {
    tbody.insertAdjacentHTML('beforeend', html)
  } else {
    tbody.innerHTML = html
  }

  // Carrega tags em bulk apenas para os leads renderizados agora
  if (window.SdrService && leads.length) {
    var leadIds = leads.map(function(l) { return l.id })
    window.SdrService.getTagsBulk('lead', leadIds).then(function(result) {
      if (!result.ok) return
      var tagsMap = result.data || {}
      leads.forEach(function(lead) {
        _leadsRenderTagCell(lead.id, tagsMap[lead.id] || [])
      })
    })
  }
}

// ── Tags ──────────────────────────────────────────────────────

function leadsOpenTagPopover(leadId, anchorBtn) {
  if (!window.TagPopover) return
  window.TagPopover.open(anchorBtn, leadId, {
    onChanged: function(tags) {
      // Atualiza célula de tags imediatamente (sem refresh)
      _leadsRenderTagCell(leadId, tags || [])
      _leadsRefreshKanban()
      // Se filtro de tag ativo, re-filtra para refletir adição/remoção
      var tagSel = document.getElementById('leadsTagFilter')
      if (tagSel && tagSel.value) {
        loadLeads()
      }
    },
  })
}

var _TAGS_TEMP_SLUGS = new Set(['lead.frio', 'lead.morno', 'lead.quente', 'lead_frio', 'lead_morno', 'lead_quente'])

function _leadsRenderTagCell(leadId, tags) {
  var cell = document.querySelector('[data-tags-row="' + leadId + '"]')
  if (!cell) return
  var filtered = (tags || []).filter(function(t) {
    return t.category !== 'temperatura' && !_TAGS_TEMP_SLUGS.has(t.slug)
  })
  var html = filtered.map(function(t) {
    return '<span style="font-size:10px;font-weight:500;padding:1px 6px;border-radius:4px;border:1px solid ' +
      t.color + '20;background:' + t.color + '12;color:' + t.color + ';white-space:nowrap">' + t.label + '</span>'
  }).join('')
  cell.innerHTML = html || '<span style="font-size:11px;color:#d1d5db">—</span>'
}

// ── Toggle ativo ──────────────────────────────────────────────

function leadsToggleActive(leadId, leadName, isActive, checkbox, e) {
  if (e) e.stopPropagation()

  var title    = isActive ? 'Ativar lead' : 'Desativar lead'
  var msg      = isActive
    ? 'Deseja ativar o lead <strong>' + leadName + '</strong>?<br>Ele voltará a aparecer nas views ativas.'
    : 'Deseja desativar o lead <strong>' + leadName + '</strong>?<br>Ele ficará oculto nas views ativas.'
  var btnColor = isActive ? '#22c55e' : '#f59e0b'

  var modal = document.createElement('div')
  modal.className = 'lt-modal-overlay'
  modal.innerHTML =
    '<div class="lt-modal">' +
      '<div class="lt-modal-title">' + title + '</div>' +
      '<div class="lt-modal-body">' + msg + '</div>' +
      '<div class="lt-modal-btns">' +
        '<button class="lt-modal-btn-cancel">Cancelar</button>' +
        '<button class="lt-modal-btn-confirm" style="background:' + btnColor + '">Confirmar</button>' +
      '</div>' +
    '</div>'
  document.body.appendChild(modal)

  modal.querySelector('.lt-modal-btn-cancel').onclick = function() {
    checkbox.checked = !isActive
    modal.remove()
  }

  modal.querySelector('.lt-modal-btn-confirm').onclick = async function() {
    modal.remove()
    if (!window._sbShared) return
    await window._sbShared.from('leads').update({ is_active: isActive }).eq('id', leadId)
    _leadsUpdateCache(leadId, { is_active: isActive })
  }
}

// ── Editar ────────────────────────────────────────────────────

function leadsActionEdit(leadId, e) {
  if (e) e.stopPropagation()
  viewLead(leadId)
}

// ── Deletar com segurança ─────────────────────────────────────

function leadsActionDelete(leadId, leadName, e) {
  if (e) e.stopPropagation()

  var modal = document.createElement('div')
  modal.className = 'lt-modal-overlay'
  modal.innerHTML =
    '<div class="lt-modal">' +
      '<div class="lt-modal-title lt-modal-danger">Deletar lead</div>' +
      '<div class="lt-modal-body">Esta acao e <strong>permanente e irreversivel</strong>.<br><br>' +
        'Para confirmar, digite o nome do lead abaixo:<br>' +
        '<span class="lt-modal-confirm-name">' + esc(leadName) + '</span>' +
      '</div>' +
      '<input id="ltDeleteInput" class="lt-modal-input lt-modal-input-danger" type="text" placeholder="Digite o nome exato...">' +
      '<div class="lt-modal-btns">' +
        '<button class="lt-modal-btn-cancel">Cancelar</button>' +
        '<button class="lt-modal-btn-delete" id="ltDeleteBtn" disabled>Deletar</button>' +
      '</div>' +
    '</div>'
  document.body.appendChild(modal)

  var input  = modal.querySelector('#ltDeleteInput')
  var delBtn = modal.querySelector('#ltDeleteBtn')

  input.addEventListener('input', function() {
    delBtn.disabled = input.value.trim() !== leadName.trim()
  })

  modal.querySelector('.lt-modal-btn-cancel').onclick = function() { modal.remove() }

  delBtn.onclick = async function() {
    delBtn.disabled = true; delBtn.textContent = 'Deletando...'
    if (!window._sbShared) return
    var result = await window._sbShared.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', leadId)
    if (result.error) {
      input.style.borderColor = '#ef4444'
      delBtn.disabled = false; delBtn.textContent = 'Deletar'
      return
    }
    modal.remove()
    try {
      var leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      leads = leads.filter(function(l) { return l.id !== leadId })
      // store.set mantem o timestamp LWW (_ts_clinicai_leads) para sync correto
      if (window.store && typeof window.store.set === 'function') {
        window.store.set('clinicai_leads', leads)
      } else {
        localStorage.setItem('clinicai_leads', JSON.stringify(leads))
      }
    } catch { /* silencioso */ }
    loadLeads()
  }
}
