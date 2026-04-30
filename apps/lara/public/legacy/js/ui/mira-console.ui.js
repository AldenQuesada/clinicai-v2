/**
 * ClinicAI — Mira Console UI
 * Pagina de teste/console pra Mira: chat interface no dashboard
 *
 * MODULAR: pagina propria, isolada de outros modulos.
 * Renderiza em #miraConsoleRoot
 *
 * Tem 2 modos:
 *   1. Test mode (default): bypass auth, simula como tester
 *   2. Real mode: usa um numero cadastrado (selecionavel)
 */
;(function () {
  'use strict'
  if (window._clinicaiMiraConsoleLoaded) return
  window._clinicaiMiraConsoleLoaded = true

  var _state = {
    messages: [],     // [{from: 'user'|'mira', text, intent, ms}]
    testPhone: '',    // numero do profissional pra simular
    bypassAuth: true,
    numbers: [],
  }

  function init() {
    var root = document.getElementById('miraConsoleRoot')
    if (!root) return
    _renderShell()
    _loadNumbers()
  }

  async function _loadNumbers() {
    if (!window.MiraService) return
    try {
      var res = await window.MiraService.listNumbers()
      if (res && res.ok) {
        _state.numbers = (res.data || []).filter(function(n) { return n.number_type === 'professional_private' })
        _renderHeader()
      }
    } catch (e) { console.warn('[MiraConsole] _loadNumbers:', e) }
  }

  function _renderShell() {
    var root = document.getElementById('miraConsoleRoot')
    if (!root) return

    root.innerHTML = ''
      + '<div style="padding:28px 32px;max-width:980px;margin:0 auto">'

        // Header
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:16px;flex-wrap:wrap">'
          + '<div>'
            + '<h2 style="margin:0;font-size:22px;font-weight:700;color:#111827">Mira — Console de Teste</h2>'
            + '<p style="margin:4px 0 0;font-size:13px;color:#6b7280">Teste a Mira em tempo real. Sem WhatsApp, sem n8n, so chat direto no dashboard.</p>'
          + '</div>'
          + '<div style="display:flex;gap:8px;align-items:center">'
            + '<button id="miraBtnRegister" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">Cadastrar numero</button>'
            + '<button id="miraBtnClear" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">Limpar chat</button>'
          + '</div>'
        + '</div>'

        + '<div id="miraHeaderInfo" style="margin-bottom:18px"></div>'

        // Chat container
        + '<div style="display:grid;grid-template-columns:1fr 280px;gap:18px">'

          // Coluna chat
          + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;height:560px;box-shadow:0 1px 3px rgba(0,0,0,.04)">'
            + '<div style="background:#075e54;color:#fff;padding:14px 18px;display:flex;align-items:center;gap:12px">'
              + '<div style="width:36px;height:36px;border-radius:50%;background:#c9a96e;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#fff">M</div>'
              + '<div>'
                + '<div style="font-size:14px;font-weight:700">Mira</div>'
                + '<div style="font-size:11px;opacity:.85">online · console de teste</div>'
              + '</div>'
            + '</div>'
            + '<div id="miraChatBody" style="flex:1;overflow-y:auto;padding:18px 16px;background:#efeae2;display:flex;flex-direction:column;gap:8px"></div>'
            + '<div style="padding:12px 16px;background:#f0f0f0;border-top:1px solid #e5e7eb;display:flex;gap:8px">'
              + '<input type="text" id="miraInput" placeholder="Digite uma mensagem... (ex: oi mira, tenho hoje?, faturei essa semana)" style="flex:1;padding:10px 14px;border:1px solid #e5e7eb;border-radius:20px;font-size:13px;outline:none;background:#fff">'
              + '<button id="miraSend" style="background:#075e54;color:#fff;border:none;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:18px">➤</button>'
            + '</div>'
          + '</div>'

          // Coluna sidebar (info + sugestoes)
          + '<div style="display:flex;flex-direction:column;gap:12px">'
            + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px">'
              + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Modo</div>'
              + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#374151">'
                + '<input type="checkbox" id="miraBypassAuth" checked style="cursor:pointer">'
                + 'Bypass auth (testar sem cadastrar)'
              + '</label>'
              + '<div id="miraNumberSelectWrap" style="display:none;margin-top:10px">'
                + '<label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Numero cadastrado</label>'
                + '<select id="miraNumberSelect" style="width:100%;padding:7px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px"></select>'
              + '</div>'
            + '</div>'

            + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px">'
              + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Sugestoes rapidas</div>'
              + _suggestionBtn('oi mira')
              + _suggestionBtn('/ajuda')
              + _suggestionBtn('tenho hoje?')
              + _suggestionBtn('quem e Maria Silva?')
              + _suggestionBtn('quanto faturei essa semana?')
              + _suggestionBtn('minha comissao do mes')
            + '</div>'

            + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px;font-size:11px;color:#065f46;line-height:1.5">'
              + '<strong>Status atual:</strong><br>'
              + '✅ Tier 1 regex ativo<br>'
              + '⏳ Tier 2 Claude Haiku (proxima fase)<br>'
              + '⏳ RPCs de execucao (Fases 2-4)<br>'
              + '⏳ Conexao WhatsApp/n8n (depois)'
            + '</div>'
          + '</div>'

        + '</div>'

      + '</div>'

    document.getElementById('miraSend').addEventListener('click', _handleSend)
    document.getElementById('miraInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') _handleSend()
    })
    document.getElementById('miraBtnClear').addEventListener('click', function() {
      _state.messages = []
      _renderChat()
    })
    document.getElementById('miraBtnRegister').addEventListener('click', _openRegisterModal)
    document.getElementById('miraBypassAuth').addEventListener('change', function(e) {
      _state.bypassAuth = e.target.checked
      var wrap = document.getElementById('miraNumberSelectWrap')
      wrap.style.display = _state.bypassAuth ? 'none' : 'block'
    })
    document.querySelectorAll('.mira-suggest').forEach(function(b) {
      b.addEventListener('click', function() {
        document.getElementById('miraInput').value = b.getAttribute('data-q')
        _handleSend()
      })
    })

    // Welcome message
    _state.messages.push({
      from: 'mira',
      text: 'Oi! 👋 Sou a Mira em modo de teste. Manda qualquer pergunta pra eu reconhecer o intent. Por enquanto eu so reconheco — as fases de execucao vem em seguida.',
      intent: 'welcome',
      ms: 0,
    })
    _renderChat()
  }

  function _renderHeader() {
    var info = document.getElementById('miraHeaderInfo')
    if (!info) return
    var count = _state.numbers.length
    info.innerHTML = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:12px;color:#6b7280">'
      + '<strong style="color:#111827">' + count + '</strong> numero(s) cadastrado(s) como profissional. '
      + (count === 0 ? '<span style="color:#f59e0b">Use o botao "Cadastrar numero" pra adicionar a Dra Mirian.</span>' : '')
      + '</div>'

    var sel = document.getElementById('miraNumberSelect')
    if (sel) {
      sel.innerHTML = '<option value="">— escolha um —</option>'
        + _state.numbers.map(function(n) {
          return '<option value="' + n.phone + '">' + (n.professional_name || n.label || n.phone) + ' (' + n.phone + ')</option>'
        }).join('')
    }
  }

  function _suggestionBtn(q) {
    return '<button class="mira-suggest" data-q="' + q + '" style="display:block;width:100%;text-align:left;background:#f9fafb;border:1px solid #e5e7eb;color:#374151;padding:8px 12px;margin-bottom:5px;border-radius:6px;font-size:11px;cursor:pointer">' + q + '</button>'
  }

  function _renderChat() {
    var body = document.getElementById('miraChatBody')
    if (!body) return
    body.innerHTML = _state.messages.map(function(m) {
      var isUser = m.from === 'user'
      var bg = isUser ? '#dcf8c6' : '#fff'
      var align = isUser ? 'flex-end' : 'flex-start'
      var radius = isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px'
      var meta = ''
      if (!isUser && m.intent && m.intent !== 'welcome') {
        meta = '<div style="font-size:9px;color:#9ca3af;margin-top:4px">intent: ' + m.intent + (m.ms ? ' · ' + m.ms + 'ms' : '') + '</div>'
      }
      return '<div style="align-self:' + align + ';max-width:80%;background:' + bg + ';padding:8px 12px;border-radius:' + radius + ';font-size:13px;line-height:1.4;white-space:pre-line;color:#111;box-shadow:0 1px 1px rgba(0,0,0,.05)">'
        + _escHtml(m.text)
        + meta
        + '</div>'
    }).join('')
    body.scrollTop = body.scrollHeight
  }

  function _escHtml(s) {
    return String(s || '').replace(/[&<>]/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;' }[c]
    }).replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
  }

  async function _handleSend() {
    var input = document.getElementById('miraInput')
    var text = (input.value || '').trim()
    if (!text) return
    input.value = ''

    _state.messages.push({ from: 'user', text: text })
    _renderChat()

    if (!window.MiraService) {
      _state.messages.push({ from: 'mira', text: 'MiraService nao carregado.', intent: 'error' })
      _renderChat()
      return
    }

    var phone = _state.bypassAuth
      ? '5544000000000'
      : (document.getElementById('miraNumberSelect') ? document.getElementById('miraNumberSelect').value : '')

    if (!_state.bypassAuth && !phone) {
      _state.messages.push({ from: 'mira', text: 'Selecione um numero cadastrado primeiro.', intent: 'error' })
      _renderChat()
      return
    }

    var res = await window.MiraService.handleMessage(phone, text, {
      bypassAuth: _state.bypassAuth,
      testProfessional: { id: null, name: 'Tester', access_scope: 'full' },
    })

    _state.messages.push({
      from: 'mira',
      text: res.response || '(sem resposta)',
      intent: res.intent,
      ms: res.ms,
    })
    _renderChat()
  }

  // ── Modal: Cadastrar numero ────────────────────────────────

  // Cache local pra mapear option value → { phone, prof_id }
  var _profOptions = []

  function _bestPhone(p) {
    return (p.whatsapp || p.telefone || p.phone || '').toString().trim()
  }
  function _digitsOnly(s) {
    return String(s || '').replace(/[^0-9]/g, '')
  }

  async function _openRegisterModal() {
    var existing = document.getElementById('miraRegBackdrop')
    if (existing) existing.remove()

    var html = ''
      + '<div id="miraRegBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;padding:0;box-shadow:0 25px 50px rgba(0,0,0,.25);overflow:hidden">'
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Cadastrar Numero Profissional</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Selecione o profissional — telefone e ID sao puxados automatico</p>'
            + '</div>'
            + '<button onclick="document.getElementById(\'miraRegBackdrop\').remove()" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px;font-size:20px">×</button>'
          + '</div>'
          + '<div style="padding:24px;display:flex;flex-direction:column;gap:16px">'

            // Dropdown profissional (com telefone)
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Profissional</label>'
              + '<select id="miraRegProfSelect" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;background:#fff">'
                + '<option value="">Carregando...</option>'
              + '</select>'
              + '<div id="miraRegProfHint" style="font-size:11px;color:#9ca3af;margin-top:4px">Lista atualizada de profissionais ativos com WhatsApp cadastrado</div>'
            + '</div>'

            // Telefone (auto-preenchido, editavel)
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Telefone (auto)</label>'
              + '<input type="text" id="miraRegPhone" placeholder="auto-preenchido ao escolher profissional" readonly style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;background:#f9fafb;color:#374151">'
              + '<div style="font-size:11px;color:#9ca3af;margin-top:4px">Se quiser editar, desbloqueie clicando no campo</div>'
            + '</div>'

            // Permissoes (checkboxes)
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Permissoes — areas que pode consultar</label>'
              + '<div style="display:flex;flex-direction:column;gap:8px;background:#f9fafb;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px">'
                + _permCheck('agenda',     'Agenda',     'Ver agenda do dia, semana, horarios livres')
                + _permCheck('pacientes',  'Pacientes',  'Buscar paciente, ver telefone, saldo devedor')
                + _permCheck('financeiro', 'Financeiro', 'Receita, comissao, cobertura, meta')
              + '</div>'
            + '</div>'

            // Hidden: prof_id, label, scope
            + '<input type="hidden" id="miraRegProfId">'
            + '<input type="hidden" id="miraRegLabel">'
            + '<input type="hidden" id="miraRegScope" value="own">'

          + '</div>'
          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button onclick="document.getElementById(\'miraRegBackdrop\').remove()" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>'
            + '<button id="miraRegSave" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Cadastrar</button>'
          + '</div>'
        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)
    document.getElementById('miraRegSave').addEventListener('click', _handleRegister)
    document.getElementById('miraRegPhone').addEventListener('focus', function(e) { e.target.removeAttribute('readonly') })
    document.getElementById('miraRegProfSelect').addEventListener('change', _onProfSelected)
    await _loadProfessionalsIntoSelect()
  }

  function _permCheck(value, label, hint) {
    return ''
      + '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">'
        + '<input type="checkbox" class="mira-perm" data-area="' + value + '" checked style="margin-top:2px;cursor:pointer;width:16px;height:16px;accent-color:#10b981">'
        + '<div>'
          + '<div style="font-size:13px;font-weight:600;color:#111827">' + label + '</div>'
          + '<div style="font-size:11px;color:#6b7280">' + hint + '</div>'
        + '</div>'
      + '</label>'
  }

  function _onProfSelected(e) {
    var idx = parseInt(e.target.value, 10)
    if (isNaN(idx) || idx < 0 || !_profOptions[idx]) {
      document.getElementById('miraRegProfId').value = ''
      document.getElementById('miraRegPhone').value = ''
      document.getElementById('miraRegLabel').value = ''
      return
    }
    var p = _profOptions[idx]
    document.getElementById('miraRegProfId').value = p.id
    document.getElementById('miraRegPhone').value = _digitsOnly(p.phone)
    document.getElementById('miraRegLabel').value = 'Mira ' + (p.display_name || '').split(' ')[0]
  }

  async function _loadProfessionalsIntoSelect() {
    var sel = document.getElementById('miraRegProfSelect')
    var hint = document.getElementById('miraRegProfHint')
    if (!sel || !window.MiraService || !window.MiraService.listProfessionals) return
    try {
      var res = await window.MiraService.listProfessionals()
      var all = (res && res.ok && Array.isArray(res.data)) ? res.data : []
      // Filtra so quem tem telefone cadastrado
      _profOptions = all
        .map(function(p) { return { id: p.id, display_name: p.display_name, specialty: p.specialty, phone: _bestPhone(p) } })
        .filter(function(p) { return p.phone && _digitsOnly(p.phone).length >= 10 })

      if (_profOptions.length === 0) {
        sel.innerHTML = '<option value="">Nenhum profissional com WhatsApp cadastrado</option>'
        if (hint) hint.innerHTML = '<span style="color:#f59e0b">Cadastre o WhatsApp do profissional em Configuracoes > Funcionarios primeiro</span>'
        return
      }

      var skipped = all.length - _profOptions.length
      sel.innerHTML = '<option value="">— escolha —</option>'
        + _profOptions.map(function(p, i) {
          var label = (p.display_name || 'Sem nome') + ' — ' + p.phone + (p.specialty ? ' · ' + p.specialty : '')
          return '<option value="' + i + '">' + _escHtml(label) + '</option>'
        }).join('')
      if (hint && skipped > 0) {
        hint.innerHTML = _profOptions.length + ' profissional(is) com WhatsApp · ' + skipped + ' sem telefone foram ocultados'
      }
    } catch (e) {
      console.warn('[MiraConsole] _loadProfessionalsIntoSelect:', e)
      sel.innerHTML = '<option value="">Erro ao carregar</option>'
    }
  }

  async function _handleRegister() {
    var phone = _digitsOnly(document.getElementById('miraRegPhone').value)
    var profId = document.getElementById('miraRegProfId').value.trim()
    var label = document.getElementById('miraRegLabel').value.trim()
    var scope = document.getElementById('miraRegScope').value

    // Coleta checkboxes de permissoes
    var perms = { agenda: false, pacientes: false, financeiro: false }
    document.querySelectorAll('.mira-perm').forEach(function(cb) {
      perms[cb.getAttribute('data-area')] = cb.checked
    })

    if (!profId) { _toastWarn('Selecione um profissional'); return }
    if (!phone || phone.length < 10) { _toastWarn('Telefone invalido'); return }
    if (!perms.agenda && !perms.pacientes && !perms.financeiro) {
      _toastWarn('Marque ao menos uma area de permissao'); return
    }

    if (!window.MiraService) { _toastWarn('MiraService nao carregado'); return }
    var res = await window.MiraService.registerNumber({
      phone: phone,
      professional_id: profId,
      label: label,
      access_scope: scope,
      permissions: perms,
    })
    if (res && res.ok) {
      _toastWarn('Numero cadastrado com sucesso!')
      var b = document.getElementById('miraRegBackdrop')
      if (b) b.remove()
      _loadNumbers()
    } else {
      _toastErr('Erro ao cadastrar: ' + (res && res.error || 'desconhecido'))
    }
  }

  window.MiraConsoleUI = Object.freeze({ init: init })
})()
