/**
 * ClinicAI — Agenda Modal · Detail view
 * Extraido de agenda-modal.js (seam 4 · 2026-04-24). Visualizacao read-only
 * do agendamento com 4 abas (resumo, detalhes, financeiro, obs). Modo view
 * por padrao, edicao requer dupla confirmacao (checkbox + botao).
 *
 * Dependencias via window._apptInternal (bus): getAppts, saveAppts, addMins,
 * fmtDate, refresh, warn, statusCfg, registerHandler, cleanupHandlers.
 * Ja globais: getProfessionals, getRooms, _showToast, navigateTo, openLead,
 * _setConsent, _toggleAnamnese, AppointmentsService, _getQueue, _saveQueue,
 * openApptModal (delegado pra reabrir em modo edit).
 */
;(function () {
  'use strict'

  // Internal bus lazy-load
  var _I = null
  function I() { return (_I = _I || window._apptInternal || {}) }

  // Shortcuts pra manter codigo original legivel
  function _getAppts()    { return I().getAppts ? I().getAppts() : [] }
  function _saveAppts(a)  { return I().saveAppts && I().saveAppts(a) }
  function _addMins(t, m) { return I().addMins ? I().addMins(t, m) : t }
  function _fmtDate(iso)  { return I().fmtDate ? I().fmtDate(iso) : iso }
  function _refresh()     { return I().refresh && I().refresh() }
  function _warn(msg)     { return I().warn ? I().warn(msg) : alert(msg) }
  function _statusCfg()   { return I().statusCfg ? I().statusCfg() : (window._apptStatusCfg || {}) }
  function _apptRegisterHandler(t, type, h, o) { if (I().registerHandler) I().registerHandler(t, type, h, o); else if (t && t.addEventListener) t.addEventListener(type, h, o) }
  function _apptCleanupHandlers() { if (I().cleanupHandlers) I().cleanupHandlers() }

  // ── Modal de detalhe — estado e renderizacao ─────────────────
  // Estrutura: 4 abas (resumo, detalhes, financeiro, obs). Modo view por
  // padrao, edicao requer dupla confirmacao (checkbox + botao).
  var _apptDetailState = { id: null, mode: 'view', tab: 'resumo' }

  var _APPT_STATUS_OPTS = [
    ['agendado','Agendado'],['aguardando_confirmacao','Aguard. Confirmacao'],
    ['confirmado','Confirmado'],['aguardando','Aguardando'],['na_clinica','Na Clinica'],
    ['em_consulta','Em Consulta'],['em_atendimento','Em Atendimento'],
    ['finalizado','Finalizado'],['remarcado','Remarcado'],
    ['cancelado','Cancelado'],['no_show','No-show']
  ]
  var _APPT_TIPO_PAC_OPTS = [['novo','Novo'],['retorno','Retorno']]
  var _APPT_TIPO_ATEND_OPTS = [['avaliacao','Consulta'],['procedimento','Procedimento']]
  var _APPT_ORIGEM_OPTS = [['','—'],['whatsapp','WhatsApp'],['instagram','Instagram'],['indicacao','Indicacao'],['site','Site'],['direto','Direto']]
  var _APPT_DURACAO_OPTS = [30,45,60,90,120,150,180]
  var _APPT_FORMA_PAG_OPTS = [['','—'],['pix','PIX'],['dinheiro','Dinheiro'],['debito','Debito'],['credito','Credito'],['parcelado','Parcelado'],['boleto','Boleto'],['transferencia','Transferencia'],['misto','Misto']]

  function _selOpts(opts, selected) {
    return opts.map(function(o) {
      var v = Array.isArray(o) ? o[0] : o
      var l = Array.isArray(o) ? o[1] : (v + ' min')
      return '<option value="' + v + '"' + (String(v) === String(selected || '') ? ' selected' : '') + '>' + l + '</option>'
    }).join('')
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function(c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c] }) }

  // openApptDetail agora async: sincroniza com Supabase antes de renderizar
  // para evitar versao stale quando outra aba/dispositivo editou.
  // Fallback: se sync falha, renderiza versao local com warning.
  async function openApptDetail(id) {
    var apptsPre = _getAppts()
    var aPre = apptsPre.find(function(x) { return x.id === id })
    if (!aPre) return

    // Overlay leve de sync (nao bloqueia se renderizacao vier rapido)
    var syncOverlay = null
    try {
      syncOverlay = document.createElement('div')
      syncOverlay.id = 'apptDetailSyncOverlay'
      syncOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;z-index:9997'
      syncOverlay.innerHTML = '<div style="background:#fff;padding:14px 22px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);font-size:13px;color:#374151;display:flex;align-items:center;gap:10px">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
        + '<span>Sincronizando agendamento...</span>'
        + '</div>'
        + '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>'
      document.body.appendChild(syncOverlay)
    } catch (e) { /* noop */ }

    // Tenta sincronizar pelo periodo da data do appt (loadForPeriod mescla
    // local + Supabase e atualiza localStorage). Se falhar, usa versao local.
    try {
      if (window.AppointmentsService && window.AppointmentsService.loadForPeriod && aPre.data) {
        await window.AppointmentsService.loadForPeriod(aPre.data, aPre.data)
      }
    } catch (err) {
      console.warn('[openApptDetail] sync falhou, usando versao local:', err && err.message || err)
      if (window._showToast) _showToast('Aviso', 'Nao foi possivel sincronizar com servidor — exibindo versao local.', 'warn')
    } finally {
      if (syncOverlay && syncOverlay.parentNode) syncOverlay.parentNode.removeChild(syncOverlay)
    }

    // Re-le pos-sync (Supabase pode ter trazido versao mais nova)
    const appts = _getAppts()
    const a = appts.find(x => x.id === id)
    if (!a) return

    // Inicializar campos de documentos se ausentes
    let changed = false
    if (a.anamneseRespondida === undefined) { a.anamneseRespondida = false; changed = true }
    if (!a.consentimentoImagem) { a.consentimentoImagem = 'pendente'; changed = true }
    if (!a.consentimentoProcedimento) { a.consentimentoProcedimento = 'pendente'; changed = true }
    if (changed) _saveAppts(appts)

    _apptDetailState.id = id
    _apptDetailState.mode = 'view'
    _apptDetailState.tab = 'resumo'
    _renderApptDetail()
  }

  function _renderApptDetail() {
    var id = _apptDetailState.id
    var mode = _apptDetailState.mode
    var tab = _apptDetailState.tab
    var a = _getAppts().find(function(x) { return x.id === id })
    if (!a) { var ex0 = document.getElementById('apptDetailDlg'); if (ex0) ex0.remove(); return }

    var APPT_STATUS_CFG = _statusCfg()
    var s = APPT_STATUS_CFG[a.status] || APPT_STATUS_CFG.agendado || {}
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var salas = typeof getRooms === 'function' ? getRooms() : []
    var profNome = a.profissionalNome || (profs[a.profissionalIdx] && profs[a.profissionalIdx].nome) || '—'
    var salaNome = (salas[a.salaIdx] && salas[a.salaIdx].nome) || '—'

    var canFinish = ['agendado','confirmado','em_atendimento'].includes(a.status)
    var canReagendar = !['finalizado','cancelado','no_show'].includes(a.status)
    var canEditRules = true
    if (window.AgendaValidator && AgendaValidator.canEdit) {
      var ce = AgendaValidator.canEdit(a)
      canEditRules = !!(ce && ce.ok)
    }

    var existing = document.getElementById('apptDetailDlg')
    if (existing) existing.remove()
    // Limpa handlers da render anterior (ex: keydown esc) antes de re-registrar
    _apptCleanupHandlers()

    var dlg = document.createElement('div')
    dlg.id = 'apptDetailDlg'
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9998'
    dlg.innerHTML = _apptDetailHTML(a, s, profs, salas, profNome, salaNome, mode, tab, canFinish, canReagendar, canEditRules)

    dlg.addEventListener('click', function (e) {
      if (e.target === dlg && mode === 'view') dlg.remove()
    })
    // Keydown handler registrado no _apptActiveHandlers para cleanup em _apptDetailClose.
    // Evita acumulo de listeners quando detail e reaberto multiplas vezes.
    var escHandler = function(e) {
      if (e.key !== 'Escape') return
      if (_apptDetailState.mode === 'edit') {
        if (confirm('Descartar alteracoes em andamento?')) {
          _apptDetailState.mode = 'view'; _renderApptDetail()
        }
      } else {
        _apptDetailClose()
      }
    }
    _apptRegisterHandler(document, 'keydown', escHandler)
    document.body.appendChild(dlg)
  }

  function _apptDetailHTML(a, s, profs, salas, profNome, salaNome, mode, tab, canFinish, canReagendar, canEditRules) {
    var id = a.id
    var isEdit = mode === 'edit'
    var tabBtn = function(key, label) {
      var active = tab === key
      return '<button data-tab="' + key + '" onclick="_apptDetailSetTab(\'' + key + '\')" '
        + 'style="flex:1;padding:9px 8px;border:none;background:' + (active ? '#fff' : 'transparent')
        + ';border-bottom:2px solid ' + (active ? '#7C3AED' : 'transparent')
        + ';font-size:11px;font-weight:700;cursor:pointer;color:' + (active ? '#7C3AED' : '#6B7280')
        + ';transition:all .15s">' + label + '</button>'
    }

    var consentSel = function(field, val) {
      var opts = field === 'procedimento'
        ? [['pendente','Pendente'],['assinado','Assinado']]
        : [['pendente','Pendente'],['assinado','Assinado'],['recusado','Recusado']]
      return '<select onchange="_setConsent(\'' + id + '\',\'' + field + '\',this.value)" '
        + 'style="font-size:10px;padding:3px 5px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer">'
        + opts.map(function(o) { return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>' }).join('')
        + '</select>'
    }
    var consentBadge = function(val) {
      if (val === 'assinado') return '<span style="color:#059669;font-size:11px;font-weight:700">&#10003; Assinado</span>'
      if (val === 'recusado') return '<span style="color:#DC2626;font-size:11px;font-weight:700">&#10007; Recusado</span>'
      return '<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; Pendente</span>'
    }
    var docBool = function(val, t, f) {
      return val
        ? '<span style="color:#059669;font-size:11px;font-weight:700">&#10003; ' + t + '</span>'
        : '<span style="color:#D97706;font-size:11px;font-weight:700">&#9711; ' + f + '</span>'
    }

    // ── Aba Resumo ───────────────────────────────────────────────
    var tabResumo = ''
    if (isEdit) {
      tabResumo = ''
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Data</div>'
        +     '<input id="sd_data" type="date" value="' + _esc(a.data) + '" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box"></div>'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Inicio</div>'
        +     '<input id="sd_inicio" type="time" value="' + _esc(a.horaInicio) + '" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box"></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Duracao</div>'
        +     '<select id="sd_duracao" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff">'
        +       _selOpts(_APPT_DURACAO_OPTS, _apptDetailDur(a)) + '</select></div>'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Status</div>'
        +     '<select id="sd_status" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff">'
        +       _selOpts(_APPT_STATUS_OPTS, a.status) + '</select></div>'
        + '</div>'
        + '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Procedimento</div>'
        +   '<input id="sd_proc" type="text" value="' + _esc(a.procedimento) + '" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box"></div>'
        + '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Profissional</div>'
        +   '<select id="sd_prof" style="width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff">'
        +     '<option value="">Selecione...</option>'
        +     profs.map(function(p,i) { return '<option value="' + i + '"' + (i === a.profissionalIdx ? ' selected' : '') + '>' + _esc(p.nome) + '</option>' }).join('')
        +   '</select></div>'
    } else {
      tabResumo = ''
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Procedimento</div>'
        +     '<div style="font-size:13px;font-weight:600;color:#111827">' + _esc(a.procedimento || '—') + '</div></div>'
        +   '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:3px">Profissional</div>'
        +     '<div style="font-size:13px;font-weight:600;color:#111827">' + _esc(profNome) + '</div></div>'
        + '</div>'
    }

    tabResumo += ''
      + '<div style="background:#F9FAFB;border-radius:10px;padding:14px">'
      +   '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Documentos &amp; Consentimentos</div>'
      +   '<div style="display:flex;flex-direction:column;gap:9px">'
      +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +       '<span style="font-size:12px;color:#374151;flex:1">Ficha de Anamnese</span>'
      +       '<div style="display:flex;align-items:center;gap:6px">'
      +         docBool(a.anamneseRespondida, 'Respondida', 'Pendente')
      +         '<button onclick="_toggleAnamnese(\'' + id + '\')" style="font-size:10px;padding:3px 8px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer;color:#6B7280">' + (a.anamneseRespondida ? 'Desfazer' : 'Marcar') + '</button>'
      +       '</div></div>'
      +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +       '<span style="font-size:12px;color:#374151;flex:1">Consentimento de Imagem</span>'
      +       '<div style="display:flex;align-items:center;gap:6px">' + consentBadge(a.consentimentoImagem) + consentSel('imagem', a.consentimentoImagem) + '</div></div>'
      +     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +       '<span style="font-size:12px;color:#374151;flex:1">Consentimento do Procedimento</span>'
      +       '<div style="display:flex;align-items:center;gap:6px">' + consentBadge(a.consentimentoProcedimento) + consentSel('procedimento', a.consentimentoProcedimento) + '</div></div>'
      +   '</div></div>'

    // ── Aba Detalhes ─────────────────────────────────────────────
    var fieldRO = function(label, val) {
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6">'
        + '<span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.04em">' + label + '</span>'
        + '<span style="font-size:13px;color:#111827;font-weight:500;text-align:right">' + _esc(val || '—') + '</span></div>'
    }
    var fieldEdit = function(label, html) {
      return '<div style="display:flex;flex-direction:column;gap:4px">'
        + '<label style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.04em">' + label + '</label>'
        + html + '</div>'
    }
    var inputCss = 'width:100%;padding:7px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;box-sizing:border-box;background:#fff'

    var tabDetalhes
    if (isEdit) {
      tabDetalhes = '<div style="display:flex;flex-direction:column;gap:12px">'
        + fieldEdit('Sala', '<select id="sd_sala" style="' + inputCss + '"><option value="">Selecione...</option>'
            + salas.map(function(r,i) { return '<option value="' + i + '"' + (i === a.salaIdx ? ' selected' : '') + '>' + _esc(r.nome) + '</option>' }).join('') + '</select>')
        + fieldEdit('Tipo Paciente', '<select id="sd_tipo_pac" style="' + inputCss + '">' + _selOpts(_APPT_TIPO_PAC_OPTS, a.tipoPaciente) + '</select>')
        + fieldEdit('Indicado Por', '<input id="sd_indicado" type="text" value="' + _esc(a.indicadoPor) + '" style="' + inputCss + '">')
        + fieldEdit('Tipo Atendimento', '<select id="sd_tipo_atend" style="' + inputCss + '">' + _selOpts(_APPT_TIPO_ATEND_OPTS, a.tipoConsulta) + '</select>')
        + fieldEdit('Origem', '<select id="sd_origem" style="' + inputCss + '">' + _selOpts(_APPT_ORIGEM_OPTS, a.origem) + '</select>')
      + '</div>'
    } else {
      tabDetalhes = '<div>'
        + fieldRO('Sala', salaNome)
        + fieldRO('Tipo Paciente', a.tipoPaciente === 'retorno' ? 'Retorno' : (a.tipoPaciente === 'novo' ? 'Novo' : '—'))
        + fieldRO('Indicado Por', a.indicadoPor)
        + fieldRO('Duracao', _apptDetailDur(a) + ' min')
        + fieldRO('Tipo Atendimento', a.tipoConsulta === 'avaliacao' ? 'Consulta' : (a.tipoConsulta === 'procedimento' ? 'Procedimento' : '—'))
        + fieldRO('Origem', a.origem)
      + '</div>'
    }

    // ── Aba Financeiro ───────────────────────────────────────────
    var hasMultiPag = Array.isArray(a.pagamentos) && a.pagamentos.length > 1
    var hasMultiProc = Array.isArray(a.procedimentos) && a.procedimentos.length > 1
    var fmtBR = function(v) { return 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',') }
    var statusPagLabel = { aberto: 'Aberto', pago: 'Pago', parcial: 'Parcial', pendente: 'Pendente' }
    var tabFin
    var pagsList = ''
    if (Array.isArray(a.pagamentos) && a.pagamentos.length) {
      pagsList = '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #E5E7EB">'
        + '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:6px">Pagamentos (' + a.pagamentos.length + ')</div>'
        + a.pagamentos.map(function(p) {
            return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#374151">'
              + '<span>' + _esc(p.forma || '—') + (p.parcelas > 1 ? ' (' + p.parcelas + 'x)' : '') + '</span>'
              + '<span style="font-weight:600">' + fmtBR(p.valor) + ' · ' + (p.status === 'pago' ? '<span style="color:#059669">pago</span>' : '<span style="color:#D97706">aberto</span>') + '</span>'
              + '</div>'
          }).join('')
        + '</div>'
    }
    var procsList = ''
    if (Array.isArray(a.procedimentos) && a.procedimentos.length) {
      procsList = '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #E5E7EB">'
        + '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:6px">Procedimentos (' + a.procedimentos.length + ')</div>'
        + a.procedimentos.map(function(p) {
            return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#374151">'
              + '<span>' + _esc(p.nome) + (p.cortesia ? ' <span style="color:#16A34A;font-weight:700">· cortesia</span>' : '') + '</span>'
              + '<span style="font-weight:600">' + fmtBR(p.valor) + '</span>'
              + '</div>'
          }).join('')
        + '</div>'
    }

    if (isEdit) {
      var canEditValor = !hasMultiPag && !hasMultiProc
      var lockNote = (hasMultiPag || hasMultiProc)
        ? '<div style="font-size:10px;color:#92400E;background:#FEF3C7;padding:6px 8px;border-radius:6px;margin-top:6px;line-height:1.4">'
            + 'Pagamentos ou procedimentos multiplos detectados. Para alterar valores e pagamentos, abra o modal completo (botao "Editar" do agendamento original).</div>'
        : ''
      tabFin = '<div style="display:flex;flex-direction:column;gap:12px">'
        + fieldEdit('Valor Total', '<input id="sd_valor" type="number" step="0.01" value="' + _esc(a.valor || 0) + '"'
            + (canEditValor ? '' : ' disabled')
            + ' style="' + inputCss + (canEditValor ? '' : ';background:#F3F4F6;color:#9CA3AF') + '">')
        + fieldEdit('Forma de Pagamento', '<select id="sd_forma_pag" style="' + inputCss + (canEditValor ? '' : ';background:#F3F4F6;color:#9CA3AF') + '"'
            + (canEditValor ? '' : ' disabled') + '>' + _selOpts(_APPT_FORMA_PAG_OPTS, a.formaPagamento) + '</select>')
        + lockNote
        + pagsList + procsList
      + '</div>'
    } else {
      tabFin = '<div>'
        + fieldRO('Valor Total', a.valor ? fmtBR(a.valor) : '—')
        + fieldRO('Forma Pagamento', a.formaPagamento)
        + fieldRO('Status Pagamento', statusPagLabel[a.statusPagamento] || a.statusPagamento || '—')
        + pagsList + procsList
      + '</div>'
    }

    // ── Aba Observacoes ──────────────────────────────────────────
    var tabObs
    if (isEdit) {
      tabObs = fieldEdit('Observacoes',
        '<textarea id="sd_obs" rows="6" style="' + inputCss + ';resize:vertical;font-family:inherit">' + _esc(a.obs) + '</textarea>')
    } else {
      tabObs = '<div style="white-space:pre-wrap;font-size:13px;color:#374151;line-height:1.5;min-height:100px;background:#F9FAFB;padding:12px;border-radius:8px">'
        + (a.obs ? _esc(a.obs) : '<span style="color:#9CA3AF">Sem observacoes.</span>')
        + '</div>'
    }
    if (a.cortesiaMotivo) {
      tabObs += '<div style="margin-top:10px;padding:10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px">'
        + '<div style="font-size:10px;font-weight:700;color:#16A34A;text-transform:uppercase;margin-bottom:3px">Motivo da Cortesia</div>'
        + '<div style="font-size:12px;color:#374151">' + _esc(a.cortesiaMotivo) + '</div></div>'
    }

    var tabContent = tab === 'detalhes' ? tabDetalhes : (tab === 'financeiro' ? tabFin : (tab === 'obs' ? tabObs : tabResumo))

    // ── Footer ───────────────────────────────────────────────────
    var footer
    if (isEdit) {
      footer = '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + '<button onclick="_apptDetailEditCancel()" style="padding:10px 18px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px">Cancelar</button>'
        + '<button onclick="_apptDetailEditSave()" style="padding:10px 22px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:800;font-size:13px;box-shadow:0 4px 12px rgba(124,58,237,.3)">Salvar Alteracoes</button>'
      + '</div>'
    } else {
      footer = '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + (canFinish ? '<button onclick="document.getElementById(\'apptDetailDlg\').remove();openFinalizarModal(\'' + id + '\')" style="flex:2 1 100%;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Finalizar Atendimento</button>' : '')
        + (canReagendar ? '<button onclick="apptReagendar(\'' + id + '\')" style="flex:1;padding:11px;background:#3B82F6;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>'
            + 'Reagendar</button>' : '')
      + '</div>'
    }

    var editBtn = canEditRules && !isEdit
      ? '<button onclick="_apptDetailEditRequest()" title="Editar agendamento" style="padding:5px 10px;border:1px solid #E5E7EB;border-radius:7px;background:#fff;cursor:pointer;font-size:11px;font-weight:700;color:#7C3AED;display:flex;align-items:center;gap:4px">'
        + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        + 'Editar</button>'
      : ''
    var modeBadge = isEdit
      ? '<span style="font-size:10px;font-weight:800;color:#fff;background:#7C3AED;padding:4px 10px;border-radius:20px">EDITANDO</span>'
      : '<span style="font-size:10px;font-weight:700;color:' + (s.color || '#6B7280') + ';background:' + (s.bg || '#F3F4F6') + ';padding:4px 10px;border-radius:20px">' + (s.label || a.status) + '</span>'

    return ''
      + '<div style="background:#fff;border-radius:16px;width:92%;max-width:540px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25)">'
      +   '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E5E7EB;flex-shrink:0">'
      +     '<div>'
      +       '<div style="font-size:17px;font-weight:800;color:#111827">' + _esc(a.pacienteNome || 'Paciente') + '</div>'
      +       '<div style="font-size:12px;color:#6B7280;margin-top:2px">' + _esc(_fmtDate(a.data)) + '&nbsp;&nbsp;' + _esc(a.horaInicio) + '&ndash;' + _esc(a.horaFim) + '</div>'
      +     '</div>'
      +     '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
      +       modeBadge + editBtn
      +       '<button onclick="_apptDetailClose()" style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>'
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;background:#F9FAFB;border-bottom:1px solid #E5E7EB;flex-shrink:0">'
      +     tabBtn('resumo', 'Resumo') + tabBtn('detalhes', 'Detalhes') + tabBtn('financeiro', 'Financeiro') + tabBtn('obs', 'Observacoes')
      +   '</div>'
      +   '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;flex:1">' + tabContent + '</div>'
      +   '<div style="padding:14px 20px;border-top:1px solid #F3F4F6;flex-shrink:0">' + footer + '</div>'
      + '</div>'
  }

  function _apptDetailDur(a) {
    if (!a.horaInicio || !a.horaFim) return 60
    var hi = a.horaInicio.split(':').map(Number)
    var hf = a.horaFim.split(':').map(Number)
    var d = (hf[0]*60 + hf[1]) - (hi[0]*60 + hi[1])
    return d > 0 ? d : 60
  }

  function _apptDetailSetTab(t) {
    // Antes de trocar de aba em modo edit, capturar os valores atuais
    // pra nao perder edicoes ao re-renderizar.
    if (_apptDetailState.mode === 'edit') _apptDetailCaptureEdits()
    _apptDetailState.tab = t
    _renderApptDetail()
    _apptDetailRestoreCaptured()
  }

  // Buffer pra preservar valores entre re-renders durante edicao
  var _apptDetailEditBuf = {}
  function _apptDetailCaptureEdits() {
    var ids = ['sd_data','sd_inicio','sd_duracao','sd_status','sd_proc','sd_prof',
               'sd_sala','sd_tipo_pac','sd_indicado','sd_tipo_atend','sd_origem',
               'sd_valor','sd_forma_pag','sd_obs']
    ids.forEach(function(id) {
      var el = document.getElementById(id)
      if (el) _apptDetailEditBuf[id] = el.value
    })
  }
  function _apptDetailRestoreCaptured() {
    Object.keys(_apptDetailEditBuf).forEach(function(id) {
      var el = document.getElementById(id)
      if (el) el.value = _apptDetailEditBuf[id]
    })
  }

  function _apptDetailClose() {
    if (_apptDetailState.mode === 'edit') {
      if (!confirm('Descartar alteracoes em andamento?')) return
    }
    _apptDetailState.mode = 'view'
    _apptDetailEditBuf = {}
    _apptCleanupHandlers()
    var dlg = document.getElementById('apptDetailDlg')
    if (dlg) dlg.remove()
  }

  // ── Confirmacao dupla pra entrar em modo edit ────────────────
  function _apptDetailEditRequest() {
    var a = _getAppts().find(function(x) { return x.id === _apptDetailState.id })
    if (!a) return
    if (window.AgendaValidator && AgendaValidator.canEdit) {
      var ce = AgendaValidator.canEdit(a)
      if (ce && !ce.ok) {
        if (typeof showValidationErrors === 'function') showValidationErrors(ce.errors, 'Edicao nao permitida')
        else _warn('Este agendamento nao pode ser editado.')
        return
      }
    }

    var ex = document.getElementById('apptEditConfirmDlg')
    if (ex) ex.remove()
    var c = document.createElement('div')
    c.id = 'apptEditConfirmDlg'
    c.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999'
    c.innerHTML = ''
      + '<div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      +   '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
      +     '<div style="width:36px;height:36px;border-radius:50%;background:#FEF3C7;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
      +       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      +     '</div>'
      +     '<div style="font-size:15px;font-weight:800;color:#111827">Editar agendamento</div>'
      +   '</div>'
      +   '<div style="font-size:13px;color:#6B7280;line-height:1.5;margin-bottom:14px">'
      +     'Voce esta prestes a editar dados de um agendamento ja confirmado. As alteracoes sao registradas no historico e podem afetar lembretes automaticos.'
      +   '</div>'
      +   '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:8px;cursor:pointer;margin-bottom:14px" onmouseover="this.style.borderColor=\'#7C3AED\'" onmouseout="this.style.borderColor=\'#E5E7EB\'">'
      +     '<input type="checkbox" id="apptEditConfirmCk" onchange="document.getElementById(\'apptEditConfirmGo\').disabled=!this.checked;document.getElementById(\'apptEditConfirmGo\').style.opacity=this.checked?\'1\':\'.45\'" style="margin-top:2px;width:15px;height:15px;accent-color:#7C3AED;cursor:pointer;flex-shrink:0">'
      +     '<span style="font-size:12px;color:#374151;font-weight:600">Confirmo que quero editar este agendamento e entendo que as alteracoes serao registradas.</span>'
      +   '</label>'
      +   '<div style="display:flex;gap:8px;justify-content:flex-end">'
      +     '<button onclick="document.getElementById(\'apptEditConfirmDlg\').remove()" style="padding:9px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px">Cancelar</button>'
      +     '<button id="apptEditConfirmGo" disabled onclick="_apptDetailEditStart()" style="padding:9px 18px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:800;font-size:12px;opacity:.45">Iniciar edicao</button>'
      +   '</div>'
      + '</div>'
    c.addEventListener('click', function(e) { if (e.target === c) c.remove() })
    document.body.appendChild(c)
  }

  function _apptDetailEditStart() {
    var c = document.getElementById('apptEditConfirmDlg')
    if (c) c.remove()
    _apptDetailEditBuf = {}
    _apptDetailState.mode = 'edit'
    _renderApptDetail()
  }

  function _apptDetailEditCancel() {
    if (!confirm('Descartar alteracoes em andamento?')) return
    _apptDetailEditBuf = {}
    _apptDetailState.mode = 'view'
    _renderApptDetail()
  }

  function _apptDetailEditSave() {
    _apptDetailCaptureEdits()
    var b = _apptDetailEditBuf
    var id = _apptDetailState.id
    var appts = _getAppts()
    var idx = appts.findIndex(function(x) { return x.id === id })
    if (idx < 0) { _warn('Agendamento nao encontrado.'); return }
    var old = Object.assign({}, appts[idx])

    // Validacao basica
    var data = b.sd_data || old.data
    var inicio = b.sd_inicio || old.horaInicio
    var duracao = parseInt(b.sd_duracao || _apptDetailDur(old), 10) || 60
    if (!data || !inicio) { _warn('Informe data e horario.'); return }
    var todayIso = new Date().toISOString().slice(0, 10)
    if (data < todayIso && !['finalizado','cancelado','no_show'].includes(old.status)) {
      if (!confirm('Data esta no passado. Salvar mesmo assim?')) return
    }

    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var profIdx = b.sd_prof !== undefined && b.sd_prof !== '' ? parseInt(b.sd_prof, 10) : old.profissionalIdx
    if (isNaN(profIdx)) profIdx = old.profissionalIdx
    var salaIdx = b.sd_sala !== undefined && b.sd_sala !== '' ? parseInt(b.sd_sala, 10) : (old.salaIdx == null ? null : old.salaIdx)
    if (b.sd_sala === '') salaIdx = null

    var hasMultiPag = Array.isArray(old.pagamentos) && old.pagamentos.length > 1
    var hasMultiProc = Array.isArray(old.procedimentos) && old.procedimentos.length > 1
    var canEditValor = !hasMultiPag && !hasMultiProc

    var fim = _addMins(inicio, duracao)
    var novo = Object.assign({}, old, {
      data: data,
      horaInicio: inicio,
      horaFim: fim,
      status: b.sd_status || old.status,
      procedimento: b.sd_proc != null ? b.sd_proc : old.procedimento,
      profissionalIdx: profIdx,
      profissionalNome: profs[profIdx] && profs[profIdx].nome || old.profissionalNome,
      salaIdx: salaIdx,
      tipoPaciente: b.sd_tipo_pac || old.tipoPaciente,
      indicadoPor: b.sd_indicado != null ? b.sd_indicado : old.indicadoPor,
      tipoConsulta: b.sd_tipo_atend || old.tipoConsulta,
      origem: b.sd_origem != null ? b.sd_origem : old.origem,
      obs: b.sd_obs != null ? b.sd_obs : old.obs,
    })
    if (canEditValor) {
      novo.valor = parseFloat(b.sd_valor) || 0
      novo.formaPagamento = b.sd_forma_pag || ''
      // Sincroniza pagamento unico se existir
      if (Array.isArray(novo.pagamentos) && novo.pagamentos.length === 1) {
        novo.pagamentos = [Object.assign({}, novo.pagamentos[0], {
          forma: novo.formaPagamento || novo.pagamentos[0].forma,
          valor: novo.valor,
        })]
      }
    }

    // Validacao de conflito (camada 1)
    if (window.AgendaValidator && AgendaValidator.validateSave) {
      var vr = AgendaValidator.validateSave(novo, id)
      if (!vr.ok) {
        if (typeof showValidationErrors === 'function') showValidationErrors(vr.errors, 'Nao foi possivel editar')
        else _warn(vr.errors && vr.errors[0] || 'Validacao falhou.')
        return
      }
    }

    // Audit log
    if (!novo.historicoAlteracoes) novo.historicoAlteracoes = []
    var auditFields = ['data','horaInicio','horaFim','profissionalIdx','profissionalNome','salaIdx','procedimento','tipoConsulta','origem','valor','formaPagamento','status','obs','indicadoPor','tipoPaciente']
    var oldVals = {}, newVals = {}, hasChanges = false
    auditFields.forEach(function(f) {
      if (String(old[f] || '') !== String(novo[f] || '')) {
        oldVals[f] = old[f]; newVals[f] = novo[f]; hasChanges = true
      }
    })
    if (!hasChanges) {
      _apptDetailState.mode = 'view'
      _apptDetailEditBuf = {}
      _renderApptDetail()
      if (window._showToast) _showToast('Sem alteracoes', 'Nada para salvar', 'info')
      return
    }
    novo.historicoAlteracoes.push({
      action_type: 'edicao',
      old_value: oldVals,
      new_value: newVals,
      changed_by: 'secretaria',
      changed_at: new Date().toISOString(),
      reason: 'Edicao inline (modal lateral)',
    })

    appts[idx] = novo
    var prev = JSON.parse(JSON.stringify(_getAppts()))
    _saveAppts(appts)

    // Reagendar automacoes se data/hora mudou
    if ((old.data !== novo.data || old.horaInicio !== novo.horaInicio) && typeof scheduleAutomations === 'function') {
      if (window._getQueue && window._saveQueue) {
        var q = _getQueue().map(function(x) { return x.apptId === id ? Object.assign({}, x, { executed: true }) : x })
        _saveQueue(q)
      }
      scheduleAutomations(novo)
    }

    _refresh()
    _apptDetailEditBuf = {}
    _apptDetailState.mode = 'view'
    _renderApptDetail()
    if (window._showToast) _showToast('Agendamento atualizado', novo.pacienteNome || '', 'success')

    // Sync Supabase com rollback
    if (window.AppointmentsService && AppointmentsService.syncOneAwait) {
      AppointmentsService.syncOneAwait(novo).then(function(result) {
        if (!result.ok && !result.queued) {
          _saveAppts(prev)
          _refresh()
          if (window._showToast) _showToast('Erro ao sincronizar', result.error || 'Falha no servidor — revertido', 'error')
        }
      })
    }
  }


  // Expose
  window.openApptDetail           = openApptDetail
  window._apptDetailSetTab        = _apptDetailSetTab
  window._apptDetailClose         = _apptDetailClose
  window._apptDetailEditRequest   = _apptDetailEditRequest
  window._apptDetailEditStart     = _apptDetailEditStart
  window._apptDetailEditCancel    = _apptDetailEditCancel
  window._apptDetailEditSave      = _apptDetailEditSave

  window.AgendaModalDetail = Object.freeze({
    open:         openApptDetail,
    setTab:       _apptDetailSetTab,
    close:        _apptDetailClose,
    editRequest:  _apptDetailEditRequest,
    editStart:    _apptDetailEditStart,
    editCancel:   _apptDetailEditCancel,
    editSave:     _apptDetailEditSave
  })
})()
