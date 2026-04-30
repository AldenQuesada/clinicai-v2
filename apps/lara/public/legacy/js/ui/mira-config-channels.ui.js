/**
 * ClinicAI, Mira Config, aba "Canais"
 *
 * Permite mapear cada funcao da Mira/Secretaria pro wa_number correto
 * + cadastrar novos numeros via UI (sem SQL hardcoded).
 *
 * Depende: window._sbShared (Supabase), jQuery-style fallback nao usado.
 * Expoe: window.MiraConfigChannels.render(rootEl) -> string HTML
 *
 * Conformidade §12-14: IIFE + Object.freeze + <500 LOC.
 */
;(function () {
  'use strict'
  if (window.MiraConfigChannels) return

  var _state = {
    channels: [],
    numbers: [],
    loading: false,
    error: null,
    showAddNumber: false,
  }

  var FUNCTION_META = {
    partner_onboarding:  { label: 'Mira, welcome B2B',            desc: 'Mira envia welcome + audio quando parceria vira active' },
    partner_voucher_req: { label: 'Mira, recebe pedido voucher',  desc: 'Parceiro manda audio/texto pra Mira pedindo voucher' },
    partner_response:    { label: 'Mira, responde ao parceiro',   desc: 'Confirmacoes, follow-ups, orientacoes ao parceiro' },
    vpi_partner:         { label: 'Lara, VPI (parceira B2C, 100%)', desc: 'Lara opera 100% do VPI: saudade, dormante, aniversario, pos-procedimento, missao, top trimestre' },
    recipient_voucher:   { label: 'Lara, voucher pra convidada',  desc: 'Lara (secretaria) envia voucher pra quem foi presenteada' },
    recipient_followup:  { label: 'Lara, follow-up da convidada', desc: 'Lara lembra convidada de agendar tratamento' },
  }

  var FUNCTION_ORDER = [
    'partner_onboarding','partner_voucher_req','partner_response',
    'vpi_partner','recipient_voucher','recipient_followup'
  ]

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function sb() { return window._sbShared }

  async function _loadAll() {
    _state.loading = true; _state.error = null
    try {
      var r1 = await sb().rpc('mira_channels_list')
      if (r1.error) throw new Error(r1.error.message)
      _state.channels = (r1.data && r1.data.channels) || []

      // Numeros: usa tabela direto (simples, sem repo por enquanto)
      var r2 = await sb().from('wa_numbers')
        .select('id,phone,label,instance_id,is_active,number_type')
        .order('created_at', { ascending: true })
      if (r2.error) throw new Error(r2.error.message)
      _state.numbers = r2.data || []
    } catch (e) {
      _state.error = e.message || String(e)
    } finally {
      _state.loading = false
    }
  }

  function _renderHeader() {
    return '<div class="mc-section-title" style="margin:0 0 16px">' +
      'Canais Mira e Secretaria' +
    '</div>' +
    '<p style="font-size:13px;color:#6B7280;margin:0 0 20px;line-height:1.55">' +
      'Cada funcao abaixo e executada por um numero WhatsApp. ' +
      'Voce escolhe de qual numero sai cada tipo de mensagem, sem precisar alterar codigo.' +
    '</p>'
  }

  function _renderChannelRow(ch) {
    var meta = FUNCTION_META[ch.function_key] || { label: ch.function_key, desc: '' }
    var warn = !ch.wa_number_id ? '<span style="color:#B91C1C;font-size:11px;margin-left:6px">NAO CONFIGURADO</span>' : ''
    var inactiveWarn = (ch.wa_number_id && !ch.wa_is_active)
      ? '<div style="color:#B45309;font-size:11px;margin-top:4px">Numero selecionado esta inativo</div>'
      : ''

    var options = '<option value="">— Sem numero —</option>'
    _state.numbers.forEach(function (n) {
      var sel = n.id === ch.wa_number_id ? ' selected' : ''
      var inactive = n.is_active ? '' : ' [inativo]'
      options += '<option value="' + esc(n.id) + '"' + sel + '>' +
        esc(n.phone) + ' - ' + esc(n.label || 'sem label') + inactive +
      '</option>'
    })

    return '<div class="mc-ch-row" style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:600;color:#111">' + esc(meta.label) + warn + '</div>' +
          '<div style="font-size:11px;color:#6B7280;margin-top:2px">' + esc(meta.desc) + '</div>' +
        '</div>' +
        '<span style="font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;background:#F9FAFB;padding:2px 7px;border-radius:4px">' +
          esc(ch.function_key) +
        '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
        '<select class="mc-ch-select" data-function="' + esc(ch.function_key) + '" ' +
          'style="flex:1;padding:8px 10px;border:1px solid #E5E7EB;border-radius:6px;font-family:inherit;font-size:12px;background:#fff;color:#111">' +
          options +
        '</select>' +
        '<button class="mc-ch-save" data-function="' + esc(ch.function_key) + '" ' +
          'style="padding:8px 14px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">' +
          'Salvar' +
        '</button>' +
      '</div>' +
      inactiveWarn +
    '</div>'
  }

  function _renderNumbersPanel() {
    var rows = _state.numbers.map(function (n) {
      var typeLabel = n.number_type === 'clinic_official' ? 'oficial' : 'profissional'
      var activeBadge = n.is_active
        ? '<span style="font-size:10px;background:#ECFDF5;color:#047857;padding:2px 7px;border-radius:99px">ATIVO</span>'
        : '<span style="font-size:10px;background:#FEF2F2;color:#991B1B;padding:2px 7px;border-radius:99px">INATIVO</span>'
      var instance = n.instance_id
        ? '<span style="font-size:10px;color:#6B7280;margin-left:6px">inst: ' + esc(n.instance_id) + '</span>'
        : '<span style="font-size:10px;color:#B91C1C;margin-left:6px">sem instance (nao envia)</span>'
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #F3F4F6">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600;color:#111">' + esc(n.phone) + ' ' + activeBadge + '</div>' +
          '<div style="font-size:11px;color:#6B7280;margin-top:2px">' + esc(n.label || 'sem label') + ' · ' + typeLabel + instance + '</div>' +
        '</div>' +
        '<button class="mc-num-edit" data-id="' + esc(n.id) + '" ' +
          'style="padding:5px 10px;background:#fff;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;cursor:pointer;color:#374151">' +
          'Editar' +
        '</button>' +
      '</div>'
    }).join('')

    return '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px">' +
      '<div style="padding:14px 16px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">' +
        '<div style="font-size:13px;font-weight:700;color:#111">Numeros WhatsApp cadastrados</div>' +
        '<button id="mcAddNumberBtn" style="padding:7px 12px;background:#7a1f2b;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600">+ Cadastrar numero</button>' +
      '</div>' +
      (rows || '<div style="padding:20px;text-align:center;color:#9CA3AF">Nenhum numero cadastrado.</div>') +
    '</div>'
  }

  function _renderAddNumberModal(existingId) {
    var existing = existingId ? _state.numbers.find(function (n) { return n.id === existingId }) : null
    var title = existing ? 'Editar numero' : 'Cadastrar numero'
    return '<div id="mcNumModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;justify-content:center;align-items:center;padding:20px">' +
      '<div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
          '<h3 style="font-size:16px;font-weight:700;color:#111;margin:0">' + title + '</h3>' +
          '<button id="mcNumClose" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6B7280">&times;</button>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:12px">' +
          _inp('phone', 'Telefone (ex: 5544991622986)', existing && existing.phone, !!existing) +
          _inp('label', 'Label (ex: Secretaria Mirian)', existing && existing.label) +
          _inp('instance_id', 'Instance Evolution (ex: mira-mirian)', existing && existing.instance_id) +
          _inp('api_url', 'API URL (deixe vazio pra usar default)', existing && existing.api_url) +
          _inp('api_key', 'API Key', existing && existing.api_key) +
          _sel('number_type', 'Tipo', [
            { v: 'clinic_official', l: 'Oficial da clinica' },
            { v: 'professional_private', l: 'Profissional privado' }
          ], existing && existing.number_type) +
          _chk('is_active', 'Ativo', existing ? !!existing.is_active : true) +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end">' +
          '<button id="mcNumCancel" style="padding:9px 16px;background:#fff;border:1px solid #E5E7EB;border-radius:6px;font-size:12px;cursor:pointer;color:#374151">Cancelar</button>' +
          '<button id="mcNumSave" data-existing="' + esc(existingId || '') + '" ' +
            'style="padding:9px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">Salvar</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _inp(name, label, value, disabled) {
    return '<div>' +
      '<label style="display:block;font-size:11px;font-weight:600;color:#6B7280;margin-bottom:4px;letter-spacing:0.5px">' + esc(label) + '</label>' +
      '<input type="text" data-field="' + name + '" value="' + esc(value || '') + '"' +
        (disabled ? ' disabled' : '') +
        ' style="width:100%;padding:8px 10px;border:1px solid #E5E7EB;border-radius:6px;font-family:inherit;font-size:12px' +
        (disabled ? ';background:#F9FAFB;color:#6B7280' : '') +
        '" />' +
    '</div>'
  }

  function _sel(name, label, options, value) {
    var opts = options.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (o.v === value ? ' selected' : '') + '>' + esc(o.l) + '</option>'
    }).join('')
    return '<div>' +
      '<label style="display:block;font-size:11px;font-weight:600;color:#6B7280;margin-bottom:4px">' + esc(label) + '</label>' +
      '<select data-field="' + name + '" style="width:100%;padding:8px 10px;border:1px solid #E5E7EB;border-radius:6px;font-family:inherit;font-size:12px;background:#fff">' +
        opts +
      '</select>' +
    '</div>'
  }

  function _chk(name, label, checked) {
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<input type="checkbox" id="mcChk_' + name + '" data-field="' + name + '"' + (checked ? ' checked' : '') + ' />' +
      '<label for="mcChk_' + name + '" style="font-size:12px;color:#111;cursor:pointer">' + esc(label) + '</label>' +
    '</div>'
  }

  function _render(rootEl) {
    if (!rootEl) return ''
    if (_state.loading) return '<div class="mc-empty" style="padding:40px;text-align:center;color:#6B7280">Carregando canais...</div>'
    if (_state.error) return '<div class="mc-empty" style="padding:40px;text-align:center;color:#B91C1C">Erro: ' + esc(_state.error) + '</div>'

    var channelMap = {}
    _state.channels.forEach(function (c) { channelMap[c.function_key] = c })
    var rows = FUNCTION_ORDER.map(function (fk) {
      return _renderChannelRow(channelMap[fk] || { function_key: fk, wa_number_id: null })
    }).join('')

    // Canais empilhados (coluna esquerda)
    var channelsCol = '<div style="display:flex;flex-direction:column;gap:10px">' + rows + '</div>'

    // Split 2 colunas: canais esquerda, numeros direita (1:1 desktop, stack <960px)
    var split = '<div class="mc-ch-split" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start">' +
      channelsCol +
      _renderNumbersPanel() +
    '</div>' +
    '<style>@media (max-width:960px){.mc-ch-split{grid-template-columns:1fr !important}}</style>'

    // Re-bind depois do render
    setTimeout(function () { _bind(rootEl) }, 0)

    return _renderHeader() + split
  }

  function _bind(rootEl) {
    if (!rootEl) return
    // Salvar canal
    rootEl.querySelectorAll('.mc-ch-save').forEach(function (btn) {
      btn.onclick = async function () {
        var fn = btn.getAttribute('data-function')
        var sel = rootEl.querySelector('.mc-ch-select[data-function="' + fn + '"]')
        var newId = sel && sel.value
        btn.disabled = true; btn.textContent = 'Salvando...'
        try {
          var r = await sb().rpc('mira_channels_upsert', {
            p_function_key: fn,
            p_wa_number_id: newId || null,
          })
          if (r.error) throw new Error(r.error.message)
          btn.textContent = '✓ Salvo'
          setTimeout(function () { btn.textContent = 'Salvar'; btn.disabled = false }, 1400)
          await _reload(rootEl)
        } catch (e) {
          btn.textContent = 'Erro'
          alert('Falhou ao salvar: ' + (e.message || ''))
          btn.disabled = false
        }
      }
    })

    // Add / edit numero
    var addBtn = rootEl.querySelector('#mcAddNumberBtn')
    if (addBtn) addBtn.onclick = function () { _openModal(rootEl, null) }
    rootEl.querySelectorAll('.mc-num-edit').forEach(function (btn) {
      btn.onclick = function () { _openModal(rootEl, btn.getAttribute('data-id')) }
    })
  }

  function _openModal(rootEl, existingId) {
    var wrap = document.createElement('div')
    wrap.innerHTML = _renderAddNumberModal(existingId)
    document.body.appendChild(wrap.firstChild)
    var modal = document.getElementById('mcNumModal')
    modal.querySelector('#mcNumClose').onclick = function () { modal.remove() }
    modal.querySelector('#mcNumCancel').onclick = function () { modal.remove() }
    modal.querySelector('#mcNumSave').onclick = async function (ev) {
      var btn = ev.currentTarget
      btn.disabled = true; btn.textContent = 'Salvando...'
      var payload = {}
      modal.querySelectorAll('[data-field]').forEach(function (el) {
        var f = el.getAttribute('data-field')
        if (el.type === 'checkbox') payload[f] = el.checked
        else if (el.value != null && el.value !== '') payload[f] = el.value
      })
      try {
        var r = await sb().rpc('wa_number_upsert', { p_payload: payload })
        if (r.error) throw new Error(r.error.message)
        modal.remove()
        await _reload(rootEl)
      } catch (e) {
        alert('Falhou: ' + (e.message || ''))
        btn.disabled = false
        btn.textContent = 'Salvar'
      }
    }
  }

  async function _reload(rootEl) {
    await _loadAll()
    rootEl.innerHTML = _render(rootEl)
    if (window.feather) feather.replace({ root: rootEl })
  }

  // Render entry point chamado por mira-config.ui.js
  function render(rootEl) {
    if (!_state.loaded) {
      _state.loaded = true
      _loadAll().then(function () { rootEl.innerHTML = _render(rootEl) })
      return '<div class="mc-empty" style="padding:40px;text-align:center;color:#6B7280">Carregando canais...</div>'
    }
    return _render(rootEl)
  }

  window.MiraConfigChannels = Object.freeze({ render: render, reload: _reload })
})()
