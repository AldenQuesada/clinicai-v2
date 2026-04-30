/**
 * ClinicAI — Agenda Modal
 *
 * Extraído de api.js. Gerencia o modal de Nova / Editar Consulta
 * e o modal de detalhe de agendamento.
 *
 * Funções públicas (window.*):
 *   openApptModal(id, date, time, profIdx)
 *   closeApptModal()
 *   saveAppt()
 *   deleteAppt()
 *   openApptDetail(id)
 *   apptSearchPatient(q)
 *   selectApptPatient(id, nome)
 *   apptProcAutofill(procNome)
 *   apptTipoChange()
 *
 * Depende de (globals de api.js):
 *   window._apptGetAll, _apptSaveAll, _apptGenId, _apptAddMinutes,
 *   window._apptFmtDate, _apptRefresh, _apptStatusCfg, _apptCheckConflict,
 *   window._apptSetLeadStatus, _apptEnviarMsg,
 *   window.getProfessionals, getRooms, getTechnologies,
 *   window.AgendaValidator, AppointmentsService, scheduleAutomations,
 *   window._applyStatusTag, showValidationErrors, _showToast
 *
 * NOTA: Este arquivo é carregado APÓS api.js. Todas as referências a helpers
 * de api.js são feitas via window.* para garantir acesso pós-inicialização.
 */

;(function () {
  'use strict'

  // ── Helpers locais que acessam internals de api.js via window ─
  function _getAppts()       {
    if (window._apptGetAll) return window._apptGetAll()
    var k = window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments'
    try { return JSON.parse(localStorage.getItem(k) || '[]') } catch (e) { return [] }
  }
  function _saveAppts(arr)   { if (window._apptSaveAll) window._apptSaveAll(arr) }
  function _genId() {
    if (window._apptGenId) return window._apptGenId()
    // Fallback: UUID puro (mig 809+811 exigem). crypto.randomUUID disponivel em todo browser moderno.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }
  function _addMins(t, m)    { return window._apptAddMinutes ? window._apptAddMinutes(t, m) : t }
  function _fmtDate(iso)     { return window._apptFmtDate ? window._apptFmtDate(iso) : iso }
  function _refresh()        { if (window._apptRefresh) window._apptRefresh() }
  function _statusCfg()      { return window._apptStatusCfg || {} }
  function _warn(msg)        { if (window._showToast) _showToast('Atenção', msg, 'warn'); else alert(msg) }
  function _checkConflict(a, all) { return window._apptCheckConflict ? window._apptCheckConflict(a, all) : { conflict: false } }
  function _setLeadStatus(id, s, skip) { if (window._apptSetLeadStatus) window._apptSetLeadStatus(id, s, skip) }
  // _enviarMsg removido: engine dispara regras de confirmacao via processAppointment

  // ── Event delegation: centraliza data-action em vez de onclick=fn ─
  // Vantagem: bindings sobrevivem ao re-render, menos globals no window
  // e um único ponto de dispatch para todas as interações dos cards.
  var _apptDelegationBound = false
  function _bindApptDelegation() {
    if (_apptDelegationBound) return
    var modal = document.getElementById('apptModal')
    if (!modal) return
    _apptDelegationBound = true
    modal.addEventListener('click', _apptHandleDelegated)
    modal.addEventListener('input', _apptHandleDelegated)
    modal.addEventListener('change', _apptHandleDelegated)
  }
  function _apptHandleDelegated(e) {
    var el = e.target.closest('[data-action]')
    if (!el) return
    var action = el.dataset.action
    var idx = parseInt(el.dataset.idx)
    var field = el.dataset.field
    var value = el.dataset.value

    // input/change → somente para elementos editáveis
    if (e.type === 'input' || e.type === 'change') {
      if (action === 'apptPagamentoField') apptUpdatePagamento(idx, field, el.value)
      else if (action === 'apptProcField') apptProcUpdate(idx, field, el.value)
      return
    }
    // click → botões
    if (e.type !== 'click') return
    if (action === 'apptPagamentoRemove')  apptRemovePagamento(idx)
    else if (action === 'apptPagamentoToggle') apptTogglePago(idx)
    else if (action === 'apptProcRemove')  apptRemoveProc(idx)
    else if (action === 'apptProcSetCortesia') apptProcUpdate(idx, 'cortesia', value === 'true')
    else if (action === 'apptProcSetRetorno')  apptProcUpdate(idx, 'retornoTipo', value)
  }

  // ── openApptModal ─────────────────────────────────────────────
  function openApptModal(id, date, time, profIdx) {
    _bindApptDelegation()
    const modal = document.getElementById('apptModal')
    if (!modal) return

    // Estado limpo a cada abertura. Splice preserva refs compartilhadas
    // (_apptProcs -> _apptState.procs, _apptPagamentos -> _apptState.pagamentos).
    // Deve rodar antes de carregar dados de edicao (linha ~154).
    _apptStateReset()
    _apptCleanupHandlers()
    _apptEnableSave()

    // Preenche profissionais. Mantem o indice original do array de getProfessionals()
    // como value (appointments.profissionalIdx referencia esse indice) e omite
    // membros sem espaco na agenda (agenda_enabled=false) — social media, financeiro etc.
    const profSel = document.getElementById('appt_prof')
    if (profSel) {
      const profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      profSel.innerHTML = '<option value="">Selecione...</option>' +
        profs.map((p, i) => p && p.agenda_enabled === false
          ? ''
          : `<option value="${i}">${p.nome}${p.especialidade ? ' – ' + p.especialidade : ''}</option>`
        ).join('')
    }

    // Preenche salas
    const salaSel = document.getElementById('appt_sala')
    if (salaSel) {
      const salas = typeof getRooms === 'function' ? getRooms() : []
      salaSel.innerHTML = '<option value="">Selecione...</option>' +
        salas.map((s, i) => {
          const resp = Array.isArray(s.responsaveis) ? s.responsaveis : (s.responsavel ? [s.responsavel] : [])
          return `<option value="${i}">${s.nome}${resp.length ? ' – ' + resp.join(', ') : ''}</option>`
        }).join('')
    }

    // Preenche procedimentos (datalist)
    const procList = document.getElementById('apptProcList')
    if (procList) {
      const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
      procList.innerHTML = techs.map(t => `<option value="${t.nome}"/>`).join('')
    }

    const deleteBtn = document.getElementById('apptDeleteBtn')

    if (id) {
      // Editar existente
      const a = _getAppts().find(x => x.id === id)
      if (!a) return
      document.getElementById('apptModalTitle').textContent = 'Editar Consulta'
      document.getElementById('appt_id').value = id
      document.getElementById('appt_paciente_q').value = a.pacienteNome || ''
      document.getElementById('appt_paciente_id').value = a.pacienteId || ''
      document.getElementById('appt_proc').value = a.procedimento || ''
      document.getElementById('appt_data').value = a.data || ''
      document.getElementById('appt_inicio').value = a.horaInicio || ''
      document.getElementById('appt_status').value = a.status || 'agendado'
      document.getElementById('appt_confirmacao').checked = !!a.confirmacaoEnviada
      document.getElementById('appt_consentimento').checked = a.consentimentoImagem === 'assinado' || a.consentimentoImagem === true
      document.getElementById('appt_obs').value = a.obs || ''
      if (profSel && a.profissionalIdx !== undefined) profSel.value = a.profissionalIdx
      if (salaSel && a.salaIdx !== undefined) salaSel.value = a.salaIdx
      // Duração
      const [hs, ms] = a.horaInicio.split(':').map(Number)
      const [he, me] = a.horaFim.split(':').map(Number)
      const dur = (he * 60 + me) - (hs * 60 + ms)
      document.getElementById('appt_duracao').value = dur > 0 ? dur : 60
      // Novos campos
      const tipoEl = document.getElementById('appt_tipo'); if (tipoEl) tipoEl.value = a.tipoConsulta || ''
      const origEl = document.getElementById('appt_origem'); if (origEl) origEl.value = a.origem || ''
      const valEl  = document.getElementById('appt_valor'); if (valEl)  valEl.value  = a.valor || ''
      const pagEl  = document.getElementById('appt_forma_pag'); if (pagEl) pagEl.value = a.formaPagamento || ''
      const indEl  = document.getElementById('appt_indicado_por'); if (indEl) indEl.value = a.indicadoPor || ''
      const indIdEl= document.getElementById('appt_indicado_por_id'); if (indIdEl) indIdEl.value = a.indicadoPorId || ''
      apptLoadPagamentos(a.pagamentos, a.formaPagamento, a.valor)
      if (a.tipoAvaliacao) {
        const rad = document.querySelector(`input[name="appt_tipo_aval"][value="${a.tipoAvaliacao}"]`)
        if (rad) rad.checked = true
        apptSetAval(a.tipoAvaliacao)
      }
      const motEl = document.getElementById('appt_cortesia_motivo'); if (motEl) motEl.value = a.cortesiaMotivo || ''
      // Carrega procedimentos salvos com todos os campos novos.
      // Push in-place para preservar a ref compartilhada com _apptState.procs
      // (_apptStateReset ja limpou o array no topo de openApptModal).
      if (Array.isArray(a.procedimentos) && a.procedimentos.length > 0) {
        a.procedimentos.forEach(function(p) {
          _apptProcs.push({
            nome:             p.nome || '',
            valor:            parseFloat(p.valor) || 0,
            cortesia:         !!p.cortesia,
            cortesiaMotivo:   p.cortesiaMotivo || '',
            retornoTipo:      p.retornoTipo === 'retorno' ? 'retorno' : 'avulso',
            retornoIntervalo: parseInt(p.retornoIntervalo) || 0,
          })
        })
        _renderApptProcs()
      }
      if (a.tipoConsulta === 'avaliacao' || a.tipoConsulta === 'procedimento') apptSetTipo(a.tipoConsulta)
      apptTipoChange()
      if (deleteBtn) deleteBtn.style.display = 'inline-flex'
    } else {
      // Nova
      document.getElementById('apptModalTitle').textContent = 'Nova Consulta'
      document.getElementById('appt_id').value = ''
      document.getElementById('appt_paciente_q').value = ''
      document.getElementById('appt_paciente_id').value = ''
      document.getElementById('appt_proc').value = ''
      document.getElementById('appt_data').value = date || (new Date().toISOString().slice(0, 10))
      document.getElementById('appt_inicio').value = time || '08:00'
      document.getElementById('appt_status').value = 'agendado'
      document.getElementById('appt_confirmacao').checked = false
      document.getElementById('appt_consentimento').checked = false
      document.getElementById('appt_obs').value = ''
      document.getElementById('appt_duracao').value = 60
      const tipoEl2 = document.getElementById('appt_tipo'); if (tipoEl2) tipoEl2.value = ''
      const origEl2 = document.getElementById('appt_origem'); if (origEl2) origEl2.value = ''
      const valEl2  = document.getElementById('appt_valor'); if (valEl2)  valEl2.value  = ''
      apptResetPagamentos()
      apptTipoChange()
      if (profIdx != null && profSel) {
        profSel.value = profIdx
      } else if (profSel) {
        // Pré-seleção do profissional principal (Mirian) quando secretária ou
        // dona está logada — vista semana não tem coluna por profissional,
        // então abre no slot sem profIdx e cai aqui. Poupa um clique.
        var _principalIdx = _apptFindPrincipalIdx()
        if (_principalIdx >= 0) profSel.value = _principalIdx
      }
      if (deleteBtn) deleteBtn.style.display = 'none'
    }

    document.getElementById('apptPatientDrop').style.display = 'none'
    document.getElementById('appt_paciente_warn').style.display = 'none'
    // Reset novos campos — tipoPaciente é auto-detectado a partir do historico
    var tipoPac = document.getElementById('appt_tipo_paciente'); if (tipoPac) tipoPac.value = 'novo'
    var pacIdAtual = document.getElementById('appt_paciente_id') && document.getElementById('appt_paciente_id').value
    if (pacIdAtual) apptDetectTipoPaciente(pacIdAtual)
    var indicado = document.getElementById('appt_indicado_por'); if (indicado) indicado.value = ''
    var indicadoId = document.getElementById('appt_indicado_por_id'); if (indicadoId) indicadoId.value = ''
    var indicadoDrop = document.getElementById('apptIndicadoDrop'); if (indicadoDrop) indicadoDrop.style.display = 'none'
    var procsList = document.getElementById('apptProcsList'); if (procsList) procsList.innerHTML = ''
    var procsTotal = document.getElementById('apptProcsTotal'); if (procsTotal) procsTotal.textContent = ''
    // Reset tipo buttons
    var avalRow = document.getElementById('apptTipoAvalRow'); if (avalRow) avalRow.style.display = 'none'
    var pagaRow = document.getElementById('apptPagaRow'); if (pagaRow) pagaRow.style.display = 'none'
    var procRow = document.getElementById('apptProcRow'); if (procRow) procRow.style.display = 'none'
    modal.style.display = 'flex'
    document.body.style.overflow = 'hidden'
    apptUpdateEndTime()

    // Auto-preencher sala + valor de consulta do profissional selecionado.
    // skipIfFilled=true preserva valor salvo em agendamentos antigos (edit).
    apptAutoSala()
    apptAutoValorConsulta({ skipIfFilled: true })

    // Restaurar draft se novo (sem id) e existe draft salvo.
    // Campos passados explicitamente pelo caller (slot da agenda) tem precedencia.
    if (!id) {
      var skipFields = []
      if (date) skipFields.push('appt_data')
      if (time) skipFields.push('appt_inicio')
      if (profIdx != null) skipFields.push('appt_prof')
      _restoreDraft({ skipFields: skipFields })
    }
    _bindDraftListeners()

    // Carregar procedimentos da BD (async, popula select quando pronto)
    _cachedClinicProcs = null
    _loadClinicProcs().then(function(procs) { _populateProcSelect(procs) })
  }

  // ── closeApptModal ────────────────────────────────────────────
  function closeApptModal() {
    _saveDraft()
    const m = document.getElementById('apptModal')
    if (m) m.style.display = 'none'
    document.body.style.overflow = ''
    _apptCleanupHandlers()
    _apptEnableSave()
  }

  // ── apptProcAutofill ──────────────────────────────────────────
  function apptProcAutofill(procNome) {
    if (!procNome) return
    var techs = typeof getTechnologies === 'function' ? getTechnologies() : []
    var tech = techs.find(function(t) { return t.nome === procNome })
    if (tech && tech.duracao) {
      var dur = parseInt(tech.duracao)
      if (!isNaN(dur) && dur > 0) {
        var el = document.getElementById('appt_duracao')
        if (el) el.value = dur
        apptUpdateEndTime()
      }
    }
    // Auto-preencher valor do procedimento
    var valorEl = document.getElementById('appt_proc_valor')
    if (valorEl && tech && tech.preco) {
      valorEl.value = tech.preco
    }
  }

  // ── apptUpdateEndTime — preview de hora fim em tempo real ─────
  function apptUpdateEndTime() {
    var inicio = document.getElementById('appt_inicio') && document.getElementById('appt_inicio').value
    var duracao = parseInt((document.getElementById('appt_duracao') && document.getElementById('appt_duracao').value) || '60')
    var preview = document.getElementById('appt_fim_preview')
    if (!preview) return
    if (!inicio) { preview.textContent = ''; return }
    var fim = _addMins(inicio, duracao)
    preview.textContent = 'Termina as ' + fim
  }

  // ── apptTipoChange (legacy compat) ──────────────────────────
  function apptTipoChange() {
    var tipo = document.getElementById('appt_tipo') && document.getElementById('appt_tipo').value
    var avalRow = document.getElementById('apptTipoAvalRow')
    var pagaRow = document.getElementById('apptPagaRow')
    var procRow = document.getElementById('apptProcRow')
    if (avalRow) avalRow.style.display = (tipo === 'avaliacao') ? '' : 'none'
    if (pagaRow) pagaRow.style.display = 'none'
    if (procRow) procRow.style.display = (tipo === 'procedimento') ? '' : 'none'
  }

  // ── Estado consolidado do modal de agendamento ───────────────
  var _apptState = {
    procs: [],
    pagamentos: [],
    multiProcChoice: null,
  }
  function _apptStateReset() {
    _apptState.procs.splice(0)
    _apptState.pagamentos.splice(0)
    _apptState.multiProcChoice = null
  }

  // ── Profissional principal default para secretária/dona ──────
  // Mirian é sócia/dona; no fluxo de agendamento, quando a secretária
  // (role=receptionist) ou a própria Mirian (role=owner) está logada,
  // o select de Profissional abre já com ela selecionada.
  // Retorna o índice no array de getProfessionals() ou -1 se não aplica.
  function _apptFindPrincipalIdx() {
    try {
      var profile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : null
      if (!profile) return -1
      if (profile.role !== 'owner' && profile.role !== 'receptionist') return -1
      var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      if (!profs.length) return -1
      // Prioridade 1: profissional vinculado ao próprio owner logado.
      if (profile.role === 'owner' && profile.id) {
        var byUser = profs.findIndex(function(p) { return p && p.user_id === profile.id && p.ativo !== false && p.agenda_enabled !== false })
        if (byUser >= 0) return byUser
      }
      // Prioridade 2: primeiro sócio ativo com espaço na agenda (cobre secretária).
      var bySocio = profs.findIndex(function(p) { return p && (p.nivel || 'funcionario') === 'socio' && p.ativo !== false && p.agenda_enabled !== false })
      return bySocio
    } catch (_) { return -1 }
  }

  // ── Listeners ativos do modal (cleanup preventivo de memory leak) ─
  // Qualquer addEventListener em document/window feito enquanto o modal
  // esta aberto deve ser registrado aqui; closeApptModal / _apptDetailClose
  // iteram e removem tudo na saida.
  var _apptActiveHandlers = []
  function _apptRegisterHandler(target, type, handler, options) {
    target.addEventListener(type, handler, options)
    _apptActiveHandlers.push({ target: target, type: type, handler: handler, options: options })
  }
  function _apptCleanupHandlers() {
    while (_apptActiveHandlers.length) {
      var h = _apptActiveHandlers.pop()
      try { h.target.removeEventListener(h.type, h.handler, h.options) } catch (e) { /* noop */ }
    }
  }

  // ── Controle de duplo submit / validacao inline ──────────────
  // Botao #apptSaveBtn e desabilitado durante sync + enquanto houver
  // erros inline ativos (bordas em var(--danger) marcadas por _inlineValidate).
  function _apptSaveBtn() { return document.getElementById('apptSaveBtn') }
  function _apptDisableSave(reason) {
    var btn = _apptSaveBtn()
    if (!btn) return
    btn.disabled = true
    btn.style.opacity = '0.6'
    btn.style.cursor = 'not-allowed'
    if (reason === 'syncing') {
      var lbl = btn.querySelector('[data-appt-save-label]')
      if (lbl) lbl.textContent = 'Salvando...'
    }
  }
  function _apptEnableSave() {
    var btn = _apptSaveBtn()
    if (!btn) return
    btn.disabled = false
    btn.style.opacity = ''
    btn.style.cursor = ''
    var lbl = btn.querySelector('[data-appt-save-label]')
    if (lbl) lbl.textContent = 'Salvar'
  }
  // Varre campos do modal por borda danger (erro inline) — bloqueia save
  // quando houver erro visivel ao usuario.
  function _apptHasInlineErrors() {
    var modal = document.getElementById('apptModal')
    if (!modal) return false
    var fields = modal.querySelectorAll('input, select, textarea')
    for (var i = 0; i < fields.length; i++) {
      var s = fields[i].style && fields[i].style.borderColor
      if (s && /var\(--danger\)|#DC2626|#EF4444|rgb\(220,\s*38,\s*38\)/i.test(s)) return true
    }
    return false
  }

  // ── Auto-save draft ─────────────────────────────────────────
  var DRAFT_KEY = 'clinicai_appt_draft'
  var _draftTimer = null

  function _draftFieldIds() {
    return ['appt_paciente_q','appt_paciente_id','appt_paciente_phone','appt_data',
            'appt_inicio','appt_duracao','appt_prof','appt_sala','appt_proc',
            'appt_tipo','appt_origem','appt_valor','appt_obs',
            'appt_cortesia_motivo','appt_indicado_por','appt_indicado_por_id',
            'appt_tipo_paciente','appt_status']
  }

  function _saveDraft() {
    var editId = document.getElementById('appt_id')
    if (editId && editId.value) return
    var draft = {}
    _draftFieldIds().forEach(function (fid) {
      var el = document.getElementById(fid)
      if (el) draft[fid] = el.value || ''
    })
    var rad = document.querySelector('input[name="appt_tipo_aval"]:checked')
    draft._tipoAval = rad ? rad.value : ''
    draft._confirmacao = !!(document.getElementById('appt_confirmacao') || {}).checked
    draft._consentimento = !!(document.getElementById('appt_consentimento') || {}).checked
    draft._procs = JSON.parse(JSON.stringify(_apptState.procs))
    draft._pagamentos = JSON.parse(JSON.stringify(_apptState.pagamentos))
    draft._ts = Date.now()
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch (e) { /* quota */ }
  }

  function _scheduleDraftSave() {
    if (_draftTimer) clearTimeout(_draftTimer)
    _draftTimer = setTimeout(_saveDraft, 2000)
  }

  function _clearDraft() {
    localStorage.removeItem(DRAFT_KEY)
    if (_draftTimer) { clearTimeout(_draftTimer); _draftTimer = null }
  }

  function _restoreDraft(opts) {
    try {
      var raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return false
      var d = JSON.parse(raw)
      // Janela reduzida: 5 min. Senao o rascunho fica perseguindo o user.
      if (Date.now() - d._ts > 300000) { _clearDraft(); return false }
      // So restaura se o rascunho tiver conteudo real (paciente preenchido OU procs OU pagamentos)
      var hasPaciente = !!(d.appt_paciente_q || d.appt_paciente_id)
      var hasProcs    = Array.isArray(d._procs) && d._procs.length
      var hasPagto    = Array.isArray(d._pagamentos) && d._pagamentos.length
      if (!hasPaciente && !hasProcs && !hasPagto) { _clearDraft(); return false }
      // Campos que o caller passou explicitamente nao devem ser sobrescritos
      // pelo rascunho (ex: clique em slot da agenda define data/hora/profissional).
      var skipFields = (opts && Array.isArray(opts.skipFields)) ? opts.skipFields : []
      _draftFieldIds().forEach(function (fid) {
        if (skipFields.indexOf(fid) >= 0) return
        var el = document.getElementById(fid)
        if (el && d[fid]) el.value = d[fid]
      })
      if (d._tipoAval) {
        var rad = document.querySelector('input[name="appt_tipo_aval"][value="' + d._tipoAval + '"]')
        if (rad) rad.checked = true
      }
      var confEl = document.getElementById('appt_confirmacao')
      if (confEl) confEl.checked = !!d._confirmacao
      var consEl = document.getElementById('appt_consentimento')
      if (consEl) consEl.checked = !!d._consentimento
      if (Array.isArray(d._procs) && d._procs.length) {
        _apptState.procs.length = 0
        d._procs.forEach(function (p) { _apptState.procs.push(p) })
        _renderApptProcs()
      }
      if (Array.isArray(d._pagamentos) && d._pagamentos.length) {
        _apptState.pagamentos.length = 0
        d._pagamentos.forEach(function (p) { _apptState.pagamentos.push(p) })
        if (typeof apptRenderPagamentos === 'function') apptRenderPagamentos()
      }
      if (d.appt_tipo) apptSetTipo(d.appt_tipo)
      if (d._tipoAval) apptSetAval(d._tipoAval)
      apptTipoChange()
      apptUpdateEndTime()
      if (window._showToast) _showToast('Rascunho restaurado', 'Dados do agendamento anterior foram recuperados', 'info')
      return true
    } catch (e) { _clearDraft(); return false }
  }

  function _bindDraftListeners() {
    var modal = document.getElementById('apptModal')
    if (!modal || modal._draftBound) return
    modal._draftBound = true
    modal.addEventListener('input', _scheduleDraftSave)
    modal.addEventListener('change', _scheduleDraftSave)
    modal.addEventListener('change', _inlineValidate)
  }

  function _inlineValidate(e) {
    var id = e.target.id
    if (id === 'appt_data') {
      var val = e.target.value
      var today = new Date().toISOString().slice(0, 10)
      var editId = (document.getElementById('appt_id') || {}).value
      if (!editId && val && val < today) {
        e.target.style.borderColor = 'var(--danger)'
        e.target.title = 'Data no passado'
      } else {
        e.target.style.borderColor = ''
        e.target.title = ''
      }
    }
    if (id === 'appt_inicio') {
      var dataEl = document.getElementById('appt_data')
      var today2 = new Date().toISOString().slice(0, 10)
      var editId2 = (document.getElementById('appt_id') || {}).value
      if (!editId2 && dataEl && dataEl.value === today2) {
        var now = new Date()
        var parts = e.target.value.split(':')
        var chosen = new Date(today2 + 'T' + e.target.value + ':00')
        if (chosen < now) {
          e.target.style.borderColor = 'var(--danger)'
          e.target.title = 'Horario ja passou'
        } else {
          e.target.style.borderColor = ''
          e.target.title = ''
        }
      }
    }
  }

  // ── Toggle Consulta / Procedimento ─────────────────────────
  var _apptProcs = _apptState.procs

  function _apptHasConsultaData() {
    var aval = document.getElementById('appt_taval_hidden') && document.getElementById('appt_taval_hidden').value
    var val  = document.getElementById('appt_valor') && document.getElementById('appt_valor').value
    var mot  = document.getElementById('appt_cortesia_motivo') && document.getElementById('appt_cortesia_motivo').value
    var hasPag = _apptPagamentos.some(function(p) { return p.forma || p.valor })
    return !!(aval || val || mot || hasPag)
  }

  function _apptHasProcedimentoData() {
    return Array.isArray(_apptProcs) && _apptProcs.length > 0
  }

  function _apptClearConsultaData() {
    var hidden = document.getElementById('appt_taval_hidden'); if (hidden) hidden.value = ''
    var rPaga = document.getElementById('appt_taval_paga'); if (rPaga) rPaga.checked = false
    var rCort = document.getElementById('appt_taval_cortesia'); if (rCort) rCort.checked = false
    var btnCort = document.getElementById('appt_aval_cortesia'); if (btnCort) { btnCort.style.background = '#fff'; btnCort.style.borderColor = '#BBF7D0' }
    var btnPaga = document.getElementById('appt_aval_paga'); if (btnPaga) { btnPaga.style.background = '#fff'; btnPaga.style.borderColor = '#FECACA' }
    var valEl = document.getElementById('appt_valor'); if (valEl) valEl.value = ''
    var motEl = document.getElementById('appt_cortesia_motivo'); if (motEl) motEl.value = ''
    apptResetPagamentos()
  }

  function _apptClearProcedimentoData() {
    _apptProcs.splice(0)  // muta in-place; preserva ref compartilhada com _apptState.procs
    var procsList = document.getElementById('apptProcsList'); if (procsList) procsList.innerHTML = ''
    var procsTotal = document.getElementById('apptProcsTotal'); if (procsTotal) procsTotal.textContent = ''
    var procSel = document.getElementById('appt_proc_select'); if (procSel) procSel.value = ''
    var procVal = document.getElementById('appt_proc_valor'); if (procVal) procVal.value = ''
  }

  function apptSetTipo(tipo) {
    var btnC = document.getElementById('appt_tipo_btn_consulta')
    var btnP = document.getElementById('appt_tipo_btn_proc')
    var avalRow = document.getElementById('apptTipoAvalRow')
    var pagaRow = document.getElementById('apptPagaRow')
    var cortRow = document.getElementById('apptCortesiaRow')
    var procRow = document.getElementById('apptProcRow')
    var tipoSel = document.getElementById('appt_tipo')
    var tipoAtual = tipoSel && tipoSel.value

    // Confirma antes de descartar dados do outro lado
    if (tipo === 'avaliacao' && tipoAtual === 'procedimento' && _apptHasProcedimentoData()) {
      if (!confirm('Trocar para Consulta vai apagar os procedimentos adicionados. Continuar?')) return
      _apptClearProcedimentoData()
    } else if (tipo === 'procedimento' && tipoAtual === 'avaliacao' && _apptHasConsultaData()) {
      if (!confirm('Trocar para Procedimento vai apagar os dados da consulta. Continuar?')) return
      _apptClearConsultaData()
    }
    // Clear adicional: sempre zera valor/pagamentos ao trocar tipo,
    // evita "cruzamento" de dados quando confirm skip (ex: valor 0).
    if (tipoAtual && tipoAtual !== tipo) {
      var valEl = document.getElementById('appt_valor'); if (valEl) valEl.value = ''
      apptResetPagamentos()
    }

    if (tipo === 'avaliacao') {
      if (tipoSel) tipoSel.value = 'avaliacao'
      if (btnC) { btnC.style.background = '#EEF2FF'; btnC.style.borderColor = '#4F46E5'; btnC.style.color = '#4F46E5' }
      if (btnP) { btnP.style.background = '#fff'; btnP.style.borderColor = '#C7D2FE'; btnP.style.color = '#4F46E5' }
      if (avalRow) avalRow.style.display = ''
      if (procRow) procRow.style.display = 'none'
      if (pagaRow) pagaRow.style.display = 'none'
      if (cortRow) cortRow.style.display = 'none'
    } else {
      if (tipoSel) tipoSel.value = 'procedimento'
      if (btnP) { btnP.style.background = '#EEF2FF'; btnP.style.borderColor = '#4F46E5'; btnP.style.color = '#4F46E5' }
      if (btnC) { btnC.style.background = '#fff'; btnC.style.borderColor = '#C7D2FE'; btnC.style.color = '#4F46E5' }
      if (avalRow) avalRow.style.display = 'none'
      if (procRow) procRow.style.display = ''
      if (pagaRow) pagaRow.style.display = 'none'
      if (cortRow) cortRow.style.display = 'none'
    }
    apptShowPagamentosBlock()
  }

  function apptSetAval(val) {
    var btnCort = document.getElementById('appt_aval_cortesia')
    var btnPaga = document.getElementById('appt_aval_paga')
    var pagaRow = document.getElementById('apptPagaRow')
    var cortRow = document.getElementById('apptCortesiaRow')
    var hiddenEl = document.getElementById('appt_taval_hidden')
    var radioPaga = document.getElementById('appt_taval_paga')
    var radioCort = document.getElementById('appt_taval_cortesia')

    if (val === 'cortesia') {
      if (btnCort) { btnCort.style.background = '#F0FDF4'; btnCort.style.borderColor = '#16A34A' }
      if (btnPaga) { btnPaga.style.background = '#fff'; btnPaga.style.borderColor = '#FECACA' }
      if (pagaRow) pagaRow.style.display = 'none'
      if (cortRow) cortRow.style.display = ''
      if (radioCort) radioCort.checked = true
      // Limpa valor/pagamentos (não se aplicam à cortesia)
      var valEl = document.getElementById('appt_valor'); if (valEl) valEl.value = ''
      apptResetPagamentos()
    } else {
      if (btnPaga) { btnPaga.style.background = '#FEF2F2'; btnPaga.style.borderColor = '#DC2626' }
      if (btnCort) { btnCort.style.background = '#fff'; btnCort.style.borderColor = '#BBF7D0' }
      if (pagaRow) pagaRow.style.display = ''
      if (cortRow) cortRow.style.display = 'none'
      if (radioPaga) radioPaga.checked = true
      // Limpa motivo cortesia (não se aplica a paga)
      var motEl = document.getElementById('appt_cortesia_motivo'); if (motEl) motEl.value = ''
      if (_apptPagamentos.length === 0) apptResetPagamentos()
      // Se valor está vazio (típico voltando de cortesia que zerou), repreenche
      // com o valor_consulta do profissional selecionado. skipIfFilled respeita
      // se o user já digitou valor customizado antes.
      var valElP = document.getElementById('appt_valor')
      if (valElP && !valElP.value) apptAutoValorConsulta({ skipIfFilled: true })
      if (valElP && valElP.value && _apptPagamentos.length === 1 && !_apptPagamentos[0].valor) {
        _apptPagamentos[0].valor = parseFloat(valElP.value) || 0
      }
    }
    if (hiddenEl) hiddenEl.value = val
    apptShowPagamentosBlock()
  }

  // ── Carregar procedimentos da BD ─────────────────────────────
  var _cachedClinicProcs = null

  async function _loadClinicProcs() {
    if (_cachedClinicProcs) return _cachedClinicProcs
    var procs = []

    // Carregar procedimentos do Supabase
    if (window.ProcedimentosRepository) {
      var res = await ProcedimentosRepository.getAll(true)
      if (res.ok && Array.isArray(res.data)) {
        res.data.forEach(function(p) {
          procs.push({
            nome: p.nome,
            categoria: p.categoria || 'Procedimentos',
            valor: parseFloat(p.preco) || 0,
            duracao: parseInt(p.duracao_min) || 60,
            sessoes: parseInt(p.sessoes) || 0,
            intervalo_sessoes_dias: parseInt(p.intervalo_sessoes_dias) || 0,
            fases: Array.isArray(p.fases) ? p.fases : [],
          })
        })
      }
    }

    // Carregar injetaveis do Supabase
    if (window.InjetaveisRepository) {
      var res2 = await InjetaveisRepository.getAll(true)
      if (res2.ok && Array.isArray(res2.data)) {
        res2.data.forEach(function(inj) {
          procs.push({ nome: inj.nome, categoria: 'Injetaveis', valor: parseFloat(inj.preco || inj.preco_custo) || 0, duracao: 60 })
        })
      }
    }

    // Carregar technologies (aparelhos)
    if (typeof getTechnologies === 'function') {
      getTechnologies().forEach(function(t) {
        // Evitar duplicados
        if (!procs.find(function(p) { return p.nome === t.nome })) {
          procs.push({ nome: t.nome, categoria: 'Tecnologias', valor: 0, duracao: parseInt(t.duracao) || 60 })
        }
      })
    }

    // Se BD vazia, usar catalogo fallback
    if (!procs.length) {
      procs = [
        { nome:'Toxina Botulinica (Botox)', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Labios', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Olheiras', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Bigode Chines', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Malar', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Mandibula', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'AH - Queixo', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Bioestimulador - Sculptra', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Bioestimulador - Radiesse', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Bio Remodelador de Colageno', categoria:'Injetaveis', valor:0, duracao:60 },
        { nome:'Fotona 4D', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Fotona - Intimo', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Fotona - Capilar', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Fotona - Corporal', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Peeling Quimico', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Microagulhamento', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Limpeza de Pele', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Hidratacao Facial', categoria:'Tecnologias', valor:0, duracao:60 },
        { nome:'Lifting 5D - Protocolo Completo', categoria:'Lifting 5D', valor:0, duracao:60 },
        { nome:'Lifting 5D - Sessao Fotona', categoria:'Lifting 5D', valor:0, duracao:60 },
        { nome:'Lifting 5D - Sessao Injetaveis', categoria:'Lifting 5D', valor:0, duracao:60 },
        { nome:'Veu de Noiva', categoria:'Lifting 5D', valor:0, duracao:60 },
      ]
    }

    _cachedClinicProcs = procs
    return procs
  }

  function _populateProcSelect(procs) {
    var sel = document.getElementById('appt_proc_select')
    if (!sel) return

    // Agrupar por categoria
    var cats = {}
    procs.forEach(function(p) {
      var cat = p.categoria || 'Outros'
      if (!cats[cat]) cats[cat] = []
      cats[cat].push(p)
    })

    var html = '<option value="">Selecionar procedimento...</option>'
    Object.keys(cats).forEach(function(cat) {
      html += '<optgroup label="' + cat.replace(/"/g, '&quot;') + '">'
      cats[cat].forEach(function(p) {
        var sessoes = p.sessoes || 0
        var intervalo = p.intervalo_sessoes_dias || 0
        var fasesArr = Array.isArray(p.fases) ? p.fases : []
        var fasesAttr = fasesArr.length
          ? JSON.stringify(fasesArr).replace(/"/g, '&quot;')
          : ''
        html += '<option value="' + (p.nome || '').replace(/"/g, '&quot;')
          + '" data-valor="' + (p.valor || 0)
          + '" data-dur="' + (p.duracao || 60)
          + '" data-sessoes="' + sessoes
          + '" data-intervalo="' + intervalo + '"'
          + (fasesAttr ? ' data-fases="' + fasesAttr + '"' : '')
          + '>'
          + (p.nome || '').replace(/</g, '&lt;')
          + (p.valor > 0 ? ' — R$ ' + p.valor.toLocaleString('pt-BR') : '')
          + '</option>'
      })
      html += '</optgroup>'
    })
    sel.innerHTML = html
  }

  // ── Selecionar procedimento do catalogo ─────────────────────
  function apptProcSelected(sel) {
    if (!sel.value) return
    var opt = sel.options[sel.selectedIndex]
    var valor = opt && opt.dataset.valor ? parseFloat(opt.dataset.valor) : 0

    // Preencher valor da tabela
    var valorEl = document.getElementById('appt_proc_valor')
    if (valorEl && valor > 0) valorEl.value = valor

    // Preencher campo hidden pra compatibilidade
    var procHidden = document.getElementById('appt_proc')
    if (procHidden) procHidden.value = sel.value
  }

  // ── Adicionar procedimento a lista ─────────────────────────
  // Escala de intervalos de retorno (compartilhada com o prontuario)
  var APPT_RETORNO_INTERVALS = [
    { value: 7,   label: '1 semana' },
    { value: 15,  label: '15 dias' },
    { value: 30,  label: '1 mês' },
    { value: 60,  label: '2 meses' },
    { value: 90,  label: '3 meses' },
    { value: 120, label: '4 meses' },
    { value: 150, label: '5 meses' },
    { value: 180, label: '6 meses' },
    { value: 365, label: '1 ano' },
  ]

  function _apptRetornoOpts(selected) {
    return '<option value="">Sem retorno</option>' +
      APPT_RETORNO_INTERVALS.map(function(r) {
        var sel = parseInt(selected) === r.value ? ' selected' : ''
        return '<option value="' + r.value + '"' + sel + '>' + r.label + '</option>'
      }).join('')
  }

  // Sincroniza o valor total do pagamento com o total a pagar
  // (consulta ou soma dos procs). Só afeta quando há 1 linha única —
  // se o usuário já dividiu em múltiplas formas, não mexe.
  function apptSyncPagamentoTotal() {
    if (_apptPagamentos.length !== 1) return
    _apptPagamentos[0].valor = _apptValorTotalPagar()
    apptRenderPagamentos()
  }

  function apptAddProc() {
    var selEl = document.getElementById('appt_proc_select')
    var nameEl = document.getElementById('appt_proc')
    var valorEl = document.getElementById('appt_proc_valor')
    var name = (selEl && selEl.value) || (nameEl && nameEl.value.trim())
    var valor = valorEl ? parseFloat(valorEl.value || '0') : 0
    if (!name) return
    // Captura defaults de recorrencia do catalogo (data-sessoes/data-intervalo/data-fases)
    var defaultSessoes = 0, defaultIntervalo = 0, defaultFases = null
    if (selEl && selEl.selectedOptions && selEl.selectedOptions[0]) {
      var opt = selEl.selectedOptions[0]
      defaultSessoes = parseInt(opt.dataset.sessoes) || 0
      defaultIntervalo = parseInt(opt.dataset.intervalo) || 0
      if (opt.dataset.fases) {
        try { defaultFases = JSON.parse(opt.dataset.fases) } catch(e) { defaultFases = null }
      }
    }
    _apptProcs.push({
      nome: name,
      valor: valor,
      cortesia: false,
      cortesiaMotivo: '',
      retornoTipo: 'avulso',
      retornoIntervalo: 0,
      fases: defaultFases || null,
    })
    if (selEl) selEl.value = ''
    if (nameEl) nameEl.value = ''
    if (valorEl) valorEl.value = ''
    _renderApptProcs()
    apptShowPagamentosBlock()
    apptSyncPagamentoTotal()

    // Auto-preenche recorrencia se procedimento tem defaults no catalogo
    // (so em novo agendamento, nao em edit)
    var isEdit = (document.getElementById('appt_id') || {}).value
    // Multi-fase tem prioridade — total vem do somatorio, intervalo da 1a fase
    var hasFases = Array.isArray(defaultFases) && defaultFases.length > 0
    var totalDerivado = hasFases ? _recTotalFromFases(defaultFases) : defaultSessoes
    var intervaloInicial = hasFases ? (parseInt(defaultFases[0].intervalo_dias) || defaultIntervalo) : defaultIntervalo

    if (!isEdit && totalDerivado > 1 && intervaloInicial > 0) {
      var recCheck = document.getElementById('appt_rec_check')
      var recInterval = document.getElementById('appt_rec_interval')
      var recTotal = document.getElementById('appt_rec_total')
      var recProcSel = document.getElementById('appt_rec_proc')
      if (recCheck && !recCheck.checked) {
        recCheck.checked = true
        apptToggleRecurrence(recCheck)
      }
      if (recInterval) {
        recInterval.value = intervaloInicial
        // Multi-fase: o intervalo unico nao representa a serie (desabilita edicao
        // e deixa claro que a cadencia vem das fases).
        recInterval.disabled = !!hasFases
        recInterval.title = hasFases
          ? 'Cadencia controlada pelas fases do procedimento'
          : ''
      }
      if (recTotal) {
        recTotal.value = totalDerivado
        recTotal.disabled = !!hasFases
        recTotal.title = hasFases
          ? 'Total derivado das fases do procedimento'
          : ''
      }
      // Aponta o select do procedimento recorrente pro que acabou de ser adicionado
      if (recProcSel) {
        var newIdx = _apptProcs.length - 1
        recProcSel.value = String(newIdx)
      }
      _apptRecurrenceUpdatePreview()
      var msg = hasFases
        ? name + ': ' + _recFasesLabel(defaultFases) + ' (' + totalDerivado + ' sessoes)'
        : name + ': ' + defaultSessoes + ' sessoes a cada ' + defaultIntervalo + ' dias'
      if (window._showToast) window._showToast('Recorrencia sugerida', msg, 'info')
    }

    // Alerta se mais de 1 procedimento em 1h
    if (_apptProcs.length > 1) _checkMultiProcAlert()
  }

  function apptRemoveProc(i) {
    _apptProcs.splice(i, 1)
    _renderApptProcs()
    apptShowPagamentosBlock()
    apptSyncPagamentoTotal()
    apptUpdatePagamentosTotal()
  }

  // ── Alerta multi-procedimento ──────────────────────────────
  // BLOCKING modal: decisão obrigatória (não fecha com × / Esc /
  // click-fora). Única saída é escolher uma das 3 opções e clicar
  // Confirmar. Estado vive em _apptState.multiProcChoice.

  function _checkMultiProcAlert() {
    var durEl = document.getElementById('appt_duracao')
    var durAtual = durEl ? parseInt(durEl.value) : 60
    if (durAtual > 60) return // ja aumentou, nao alertar

    _multiProcCloseAlert() // garante limpeza de instancia anterior
    _apptState.multiProcChoice = null

    var alert = document.createElement('div')
    alert.id = 'multiProcAlert'
    alert.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px'
    alert.innerHTML =
      '<div id="multiProcInner" role="alertdialog" aria-modal="true" aria-labelledby="multiProcTitle" style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)">' +
        '<div style="background:#F59E0B;padding:14px 18px">' +
          '<div id="multiProcTitle" style="font-size:14px;font-weight:800;color:#fff">Mais de 1 procedimento</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:2px">' + _apptProcs.length + ' procedimentos na mesma sessao — decisão obrigatória</div>' +
        '</div>' +
        '<div style="padding:16px 18px">' +
          '<div style="font-size:13px;color:#374151;line-height:1.55;margin-bottom:14px">O tempo pode nao ser suficiente para todos os procedimentos. Escolha uma opção para continuar:</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px" id="multiProcOpts">' +
            _multiProcOpt(60,  'Manter 1h') +
            _multiProcOpt(90,  'Aumentar pra 1h30') +
            _multiProcOpt(120, 'Aumentar pra 2h') +
          '</div>' +
          '<div style="display:flex;margin-top:16px">' +
            '<button type="button" id="multiProcConfirmBtn" onclick="_multiProcConfirm()" disabled style="flex:1;padding:10px 16px;background:#9CA3AF;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:not-allowed;opacity:.6">Selecione uma opção</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    // NÃO há click-fora nem Esc — decisão obrigatória.
    document.body.appendChild(alert)
  }

  function _multiProcOpt(dur, label) {
    return '<button type="button" onclick="_multiProcPick(' + dur + ')" id="multiProcOpt_' + dur + '"' +
      ' style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1.5px solid #E5E7EB;border-radius:9px;cursor:pointer;text-align:left;width:100%;transition:all .15s">' +
      '<span style="width:14px;height:14px;border:1.5px solid #D1D5DB;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center" id="multiProcDot_' + dur + '"></span>' +
      '<span style="font-size:13px;font-weight:600;color:#374151">' + label + '</span>' +
      '</button>'
  }

  function _multiProcPick(dur) {
    _apptState.multiProcChoice = dur
    // Repinta visual
    [60, 90, 120].forEach(function(d) {
      var btn = document.getElementById('multiProcOpt_' + d)
      var dot = document.getElementById('multiProcDot_' + d)
      if (!btn || !dot) return
      var sel = d === dur
      btn.style.background = sel ? '#FFFBEB' : '#fff'
      btn.style.borderColor = sel ? '#F59E0B' : '#E5E7EB'
      dot.style.borderColor = sel ? '#F59E0B' : '#D1D5DB'
      dot.innerHTML = sel ? '<span style="width:7px;height:7px;background:#F59E0B;border-radius:50%"></span>' : ''
    })
    // Habilita Confirmar
    var btnConfirm = document.getElementById('multiProcConfirmBtn')
    if (btnConfirm) {
      btnConfirm.disabled = false
      btnConfirm.style.background = '#F59E0B'
      btnConfirm.style.cursor = 'pointer'
      btnConfirm.style.opacity = '1'
      btnConfirm.textContent = 'Confirmar'
    }
  }

  function _multiProcConfirm() {
    var dur = _apptState.multiProcChoice
    if (!dur) return
    var durEl = document.getElementById('appt_duracao')
    if (durEl) durEl.value = dur
    apptUpdateEndTime()
    _multiProcCloseAlert()

    // Validacao escondida: se manteve 1h com multiplos procs, dispara
    // double-check via WhatsApp para o responsavel da agenda confirmar
    // que o tempo é suficiente. Roda apos fechar o modal pra nao travar
    // a UI se createDoubleCheck lancar erro.
    if (dur === 60 && _apptProcs.length > 1) {
      try {
        var paciente = (document.getElementById('appt_paciente_q') && document.getElementById('appt_paciente_q').value) || 'Paciente'
        var procsNomes = _apptProcs.map(function(p) { return p.nome }).join(', ')
        var msg = paciente + ' tem ' + _apptProcs.length + ' procedimentos (' + procsNomes + ') agendados em 1 hora.\nPor favor revise e confirme se o tempo e suficiente.'

        var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
        var responsavel = profs.find(function(p) { return /mirian/i.test(p.nome || p.display_name || '') }) || profs[0]
        var respPhone = responsavel && (responsavel.phone || responsavel.whatsapp || responsavel.telefone) || ''
        var respName = responsavel && (responsavel.display_name || responsavel.nome) || 'Responsavel'

        if (window.createDoubleCheck) {
          createDoubleCheck('multi_proc', 'Multiplos procedimentos em 1h', msg, respPhone, respName)
        }
      } catch (e) { console.error('[multi_proc double-check]', e) }
    }
  }

  // Chamado APENAS pelo _multiProcConfirm após o usuário escolher.
  // Não há outro caminho de fechamento — modal é blocking.
  function _multiProcCloseAlert() {
    var alertEl = document.getElementById('multiProcAlert')
    if (alertEl) alertEl.remove()
    _apptState.multiProcChoice = null
  }

  function apptProcUpdate(i, field, value) {
    var p = _apptProcs[i]
    if (!p) return
    if (field === 'valor')             p.valor = parseFloat(value) || 0
    else if (field === 'retornoIntervalo') p.retornoIntervalo = parseInt(value) || 0
    else                                p[field] = value
    if (field === 'cortesia') {
      // Limpa motivo se voltou pra paga; limpa valor se virou cortesia
      if (!value) p.cortesiaMotivo = ''
    }
    if (field === 'retornoTipo' && value !== 'retorno') p.retornoIntervalo = 0
    _renderApptProcs()
    _updateApptTotalWithDiscount()
    apptShowPagamentosBlock()
    apptSyncPagamentoTotal()
    apptUpdatePagamentosTotal()
  }

  function _renderApptProcs() {
    var list = document.getElementById('apptProcsList')
    var totalEl = document.getElementById('apptProcsTotal')
    if (!list) return
    if (!_apptProcs.length) {
      list.innerHTML = '<div style="font-size:11px;color:#9CA3AF;padding:4px 0">Nenhum procedimento adicionado</div>'
      if (totalEl) totalEl.textContent = ''
      _updateApptTotalWithDiscount()
      return
    }
    // Onclick direto (mais robusto que delegation pra este caso)
    // html`` continua escapando valores interpolados.
    var H = window.html
    list.innerHTML = _apptProcs.map(function(p, i) {
      var cortesia = !!p.cortesia
      var bgCard = cortesia ? '#F0FDF4' : '#fff'
      var bdCard = cortesia ? '#86EFAC' : '#E5E7EB'
      var btnCortBg = cortesia ? '#16A34A' : '#fff'
      var btnCortFg = cortesia ? '#fff'    : '#16A34A'
      var btnPagaBg = !cortesia ? '#4F46E5' : '#fff'
      var btnPagaFg = !cortesia ? '#fff'    : '#4F46E5'

      var motivoHtml = cortesia
        ? H`<input type="text" placeholder="Motivo da cortesia *" value="${p.cortesiaMotivo || ''}" oninput="apptProcUpdate(${i}, 'cortesiaMotivo', this.value)" style="width:100%;margin-top:4px;padding:5px 7px;border:1px solid #86EFAC;border-radius:5px;font-size:11px;outline:none;box-sizing:border-box;background:#fff"/>`
        : ''

      var retorno = p.retornoTipo || 'avulso'
      var btnAvBg = retorno === 'avulso' ? '#7C3AED' : '#fff'
      var btnAvFg = retorno === 'avulso' ? '#fff'    : '#7C3AED'
      var btnRtBg = retorno === 'retorno' ? '#7C3AED' : '#fff'
      var btnRtFg = retorno === 'retorno' ? '#fff'    : '#7C3AED'
      var intervaloHtml = retorno === 'retorno'
        ? H`<select onchange="apptProcUpdate(${i}, 'retornoIntervalo', this.value)" style="flex:1;padding:5px 7px;border:1px solid #DDD6FE;border-radius:5px;font-size:11px;background:#fff;outline:none">${H.raw(_apptRetornoOpts(p.retornoIntervalo))}</select>`
        : ''

      var valorStr = p.valor ? p.valor.toFixed(2) : ''
      var valorOrTag = cortesia
        ? H`<span style="font-size:10px;font-weight:700;color:#16A34A">CORTESIA</span>`
        : H`<input type="number" step="0.01" value="${valorStr}" oninput="apptProcUpdate(${i}, 'valor', this.value)" style="width:75px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;text-align:right;outline:none"/>`

      return H`<div data-proc-row="${i}" style="background:${bgCard};border:1px solid ${bdCard};border-radius:8px;padding:7px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="flex:1;font-size:11px;font-weight:700;color:#374151">${p.nome || ''}</span>
          ${H.raw(valorOrTag)}
          <button type="button" onclick="apptRemoveProc(${i})" style="background:#FEE2E2;color:#DC2626;border:none;border-radius:5px;font-size:12px;font-weight:700;width:22px;height:22px;cursor:pointer;line-height:1">×</button>
        </div>
        <div style="display:flex;gap:5px;margin-top:5px">
          <button type="button" onclick="apptProcUpdate(${i}, 'cortesia', false)" style="flex:1;padding:4px 8px;background:${btnPagaBg};color:${btnPagaFg};border:1px solid #C7D2FE;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Pago</button>
          <button type="button" onclick="apptProcUpdate(${i}, 'cortesia', true)" style="flex:1;padding:4px 8px;background:${btnCortBg};color:${btnCortFg};border:1px solid #BBF7D0;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Cortesia</button>
        </div>
        ${H.raw(motivoHtml)}
        <div style="display:flex;gap:5px;margin-top:5px">
          <button type="button" onclick="apptProcUpdate(${i}, 'retornoTipo', 'avulso')" style="flex:1;padding:4px 8px;background:${btnAvBg};color:${btnAvFg};border:1px solid #DDD6FE;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Sessão Avulsa</button>
          <button type="button" onclick="apptProcUpdate(${i}, 'retornoTipo', 'retorno')" style="flex:1;padding:4px 8px;background:${btnRtBg};color:${btnRtFg};border:1px solid #DDD6FE;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">Com Retorno</button>
          ${H.raw(intervaloHtml)}
        </div>
      </div>`
    }).join('')

    _updateApptTotalWithDiscount()
    // Recorrencia visivel so se houver procedimentos
    if (typeof _apptUpdateRecurrenceVisibility === 'function') _apptUpdateRecurrenceVisibility()
  }

  // ── Desconto ───────────────────────────────────────────────
  function apptToggleDesconto(cb) {
    var row = document.getElementById('apptDescontoRow')
    if (row) row.style.display = cb.checked ? '' : 'none'
    if (!cb.checked) {
      var inp = document.getElementById('appt_desconto_valor')
      if (inp) inp.value = ''
    }
    _updateApptTotalWithDiscount()
  }

  function apptCalcDesconto() {
    _updateApptTotalWithDiscount()
    apptSyncPagamentoTotal()
    apptUpdatePagamentosTotal()
  }

  function _updateApptTotalWithDiscount() {
    var totalEl = document.getElementById('apptProcsTotal')
    // Cortesias não entram no subtotal financeiro
    var subtotal = _apptProcs.reduce(function(s, p) { return s + (p.cortesia ? 0 : (p.valor || 0)) }, 0)
    var descontoVal = parseFloat((document.getElementById('appt_desconto_valor') || {}).value || '0') || 0
    var total = Math.max(0, subtotal - descontoVal)
    var pct = subtotal > 0 ? Math.round((descontoVal / subtotal) * 100) : 0

    var pctEl = document.getElementById('appt_desconto_pct')
    if (pctEl) pctEl.textContent = descontoVal > 0 ? '(' + pct + '% de desconto)' : ''

    if (totalEl) {
      if (subtotal <= 0) { totalEl.textContent = ''; return }
      var html = 'Subtotal: R$ ' + subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      if (descontoVal > 0) {
        html += '  —  Desconto: R$ ' + descontoVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' (' + pct + '%)'
        html += '  —  <strong style="color:#10B981">Total: R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</strong>'
      }
      totalEl.innerHTML = html
    }

    // Atualizar campo valor principal
    var valorPrincipal = document.getElementById('appt_valor')
    if (valorPrincipal) valorPrincipal.value = total || ''
  }

  // ── Auto-preencher sala ao selecionar profissional ─────────
  // ── apptOnProfChange — handler único para troca de profissional ──
  // Cascata: auto-sala + auto-valor (puxa valor_consulta padrão).
  function apptOnProfChange() {
    apptAutoSala()
    apptAutoValorConsulta()
  }

  function apptAutoValorConsulta(opts) {
    var skipIfFilled = !!(opts && opts.skipIfFilled)
    var profSel = document.getElementById('appt_prof')
    if (!profSel) return
    var profIdx = parseInt(profSel.value)
    if (isNaN(profIdx)) return
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = profs[profIdx]
    if (!prof) return
    var v = parseFloat(prof.valor_consulta) || 0
    if (v <= 0) return
    var valEl = document.getElementById('appt_valor')
    if (!valEl) return
    // Na abertura do modal (skipIfFilled), preserva valor existente —
    // agendamentos antigos podem ter valor cobrado diferente do default atual.
    // Na troca manual do select (sem flag), sobrescreve com valor do novo prof.
    if (skipIfFilled && valEl.value && parseFloat(valEl.value) > 0) return
    valEl.value = v.toFixed(2)
    // Só mexe nos pagamentos se o tipo for consulta (ou indefinido).
    // Em procedimento, o total vem da soma dos procs, não da consulta.
    var tipoEl = document.getElementById('appt_tipo')
    var tipo = tipoEl && tipoEl.value
    if (tipo === 'procedimento') return
    if (_apptPagamentos.length === 1 && (!_apptPagamentos[0].valor || _apptPagamentos[0].valor === 0)) {
      _apptPagamentos[0].valor = v
      apptRenderPagamentos()
    }
    apptUpdatePagamentosTotal()
  }

  // ── Pagamentos múltiplos (Consulta Paga ou Procedimento) ────
  // Estrutura: _apptPagamentos = [{
  //   forma, valor, status: 'aberto'|'pago',
  //   parcelas, valorParcela, comentario
  // }]
  // Ref alias do _apptState.pagamentos (mesma identidade — reset
  // coordenado em _apptStateReset)
  var _apptPagamentos = _apptState.pagamentos

  var FORMAS_PAGAMENTO = [
    { value: 'pix',           label: 'PIX' },
    { value: 'dinheiro',      label: 'Dinheiro' },
    { value: 'debito',        label: 'Débito' },
    { value: 'credito',       label: 'Crédito' },
    { value: 'parcelado',     label: 'Parcelado' },
    { value: 'entrada_saldo', label: 'Entrada + Saldo' },
    { value: 'boleto',        label: 'Boleto' },
    { value: 'link',          label: 'Link Pagamento' },
    { value: 'convenio',      label: 'Convênio' },
  ]

  function _apptFormaTemParcelas(forma) {
    return forma === 'credito' || forma === 'parcelado'
  }

  function _formaOptions(selected) {
    return '<option value="">Forma...</option>' +
      FORMAS_PAGAMENTO.map(function(f) {
        var sel = f.value === selected ? ' selected' : ''
        return '<option value="' + f.value + '"' + sel + '>' + f.label + '</option>'
      }).join('')
  }

  // Total a pagar = consulta (appt_valor) ou soma dos procedimentos
  // (excluindo cortesias) com desconto
  function _apptValorTotalPagar() {
    var tipoEl = document.getElementById('appt_tipo')
    var tipo = tipoEl && tipoEl.value
    if (tipo === 'procedimento') {
      var subtotal = _apptProcs.reduce(function(s, p) {
        return s + (p.cortesia ? 0 : (parseFloat(p.valor) || 0))
      }, 0)
      var desc = parseFloat((document.getElementById('appt_desconto_valor') || {}).value || '0') || 0
      return Math.max(0, subtotal - desc)
    }
    var valEl = document.getElementById('appt_valor')
    return parseFloat((valEl && valEl.value) || '0') || 0
  }

  function apptResetPagamentos() {
    _apptPagamentos.length = 0
    _apptPagamentos.push({ forma: '', valor: 0, status: 'aberto', parcelas: 1, valorParcela: 0, comentario: '' })
    apptRenderPagamentos()
  }

  function apptLoadPagamentos(arr, fallbackForma, fallbackValor) {
    _apptPagamentos.length = 0
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach(function(p) {
        _apptPagamentos.push({
          forma:        p.forma || '',
          valor:        parseFloat(p.valor) || 0,
          status:       p.status === 'pago' ? 'pago' : 'aberto',
          parcelas:     parseInt(p.parcelas) || 1,
          valorParcela: parseFloat(p.valorParcela) || 0,
          comentario:   p.comentario || '',
        })
      })
    } else {
      _apptPagamentos.push({
        forma: fallbackForma || '',
        valor: parseFloat(fallbackValor) || 0,
        status: 'aberto',
        parcelas: 1,
        valorParcela: parseFloat(fallbackValor) || 0,
        comentario: '',
      })
    }
    apptRenderPagamentos()
  }

  function apptAddPagamento() {
    _apptPagamentos.push({ forma: '', valor: 0, status: 'aberto', parcelas: 1, valorParcela: 0, comentario: '' })
    apptRenderPagamentos()
  }

  function apptRemovePagamento(idx) {
    if (_apptPagamentos.length <= 1) return
    _apptPagamentos.splice(idx, 1)
    apptRenderPagamentos()
  }

  function apptUpdatePagamento(idx, field, value) {
    var p = _apptPagamentos[idx]
    if (!p) return
    if (field === 'valor')          p.valor = parseFloat(value) || 0
    else if (field === 'parcelas') {
      var n = parseInt(value) || 1
      if (n < 1) n = 1
      if (n > 24) n = 24
      p.parcelas = n
    }
    else if (field === 'valorParcela') p.valorParcela = parseFloat(value) || 0
    else                            p[field] = value
    // Recalcula valorParcela quando valor ou parcelas mudam
    if (field === 'valor' || field === 'parcelas' || field === 'forma') {
      if (_apptFormaTemParcelas(p.forma) && p.parcelas > 0) {
        p.valorParcela = window.Money ? window.Money.div(p.valor, p.parcelas) : +(p.valor / p.parcelas).toFixed(2)
      } else {
        p.valorParcela = p.valor
      }
    }
    if (field === 'forma') apptRerenderPagamentoRow(idx)
    else apptUpdatePagamentosTotal()
  }

  // Re-renderiza UMA linha de pagamento in-place — preserva foco
  // dos outros inputs (comentário, valor) enquanto o usuário edita.
  function apptRerenderPagamentoRow(idx) {
    var row = document.querySelector('[data-pagamento-row="' + idx + '"]')
    if (!row) { apptRenderPagamentos(); return }
    var H = window.html
    var canRemove = _apptPagamentos.length > 1
    var p = _apptPagamentos[idx]
    if (!p) return
    var pago = p.status === 'pago'
    var bg   = pago ? '#F0FDF4' : '#fff'
    var bd   = pago ? '#86EFAC' : '#E5E7EB'
    var btnTxt = pago ? 'Pago' : 'Aberto'
    var btnBg  = pago ? '#16A34A' : '#F3F4F6'
    var btnFg  = pago ? '#fff'    : '#6B7280'
    var temParcelas = _apptFormaTemParcelas(p.forma)
    var valorStr = p.valor ? p.valor.toFixed(2) : ''
    var valorParcelaStr = p.valorParcela ? p.valorParcela.toFixed(2) : ''

    var parcelasHtml = temParcelas
      ? H`<div style="display:flex;gap:5px;align-items:center;margin-top:5px">
          <label style="font-size:10px;font-weight:700;color:#6B7280">Parcelas</label>
          <input type="number" min="1" max="24" value="${p.parcelas || 1}" oninput="apptUpdatePagamento(${idx}, 'parcelas', this.value)" style="width:50px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
          <span style="font-size:10px;color:#6B7280">x R$</span>
          <input type="number" step="0.01" value="${valorParcelaStr}" oninput="apptUpdatePagamento(${idx}, 'valorParcela', this.value)" style="width:80px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
        </div>`
      : ''
    var removeBtn = canRemove
      ? H`<button type="button" onclick="apptRemovePagamento(${idx})" style="padding:5px 7px;background:#FEE2E2;color:#DC2626;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;line-height:1">×</button>`
      : ''

    row.style.background = bg
    row.style.borderColor = bd
    row.innerHTML = H`<div style="display:flex;gap:5px;align-items:center">
        <select onchange="apptUpdatePagamento(${idx}, 'forma', this.value)" style="flex:1;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;background:#fff;outline:none">${H.raw(_formaOptions(p.forma))}</select>
        <input type="number" step="0.01" placeholder="0,00" value="${valorStr}" oninput="apptUpdatePagamento(${idx}, 'valor', this.value)" style="width:75px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none"/>
        <button type="button" onclick="apptTogglePago(${idx})" style="padding:5px 8px;background:${btnBg};color:${btnFg};border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">${btnTxt}</button>
        ${H.raw(removeBtn)}
      </div>
      ${H.raw(parcelasHtml)}
      <input type="text" placeholder="Comentário (opcional)" value="${p.comentario || ''}" oninput="apptUpdatePagamento(${idx}, 'comentario', this.value)" style="width:100%;margin-top:5px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box"/>`
    apptUpdatePagamentosTotal()
  }

  function apptTogglePago(idx) {
    if (!_apptPagamentos[idx]) return
    _apptPagamentos[idx].status = _apptPagamentos[idx].status === 'pago' ? 'aberto' : 'pago'
    apptRenderPagamentos()
  }

  function apptShowPagamentosBlock() {
    var block = document.getElementById('apptPagamentosBlock')
    if (!block) return
    var tipoEl = document.getElementById('appt_tipo')
    var tipo = tipoEl && tipoEl.value
    var avalEl = document.getElementById('appt_taval_hidden')
    var aval = avalEl && avalEl.value
    var consultaPaga = tipo === 'avaliacao' && aval === 'paga'
    // Procedimento: só mostra pagamento se houver ao menos 1 NÃO cortesia
    var procWithPaid = tipo === 'procedimento' && _apptProcs.some(function(p) { return !p.cortesia })
    block.style.display = (consultaPaga || procWithPaid) ? '' : 'none'
    if (consultaPaga || procWithPaid) {
      if (_apptPagamentos.length === 0) apptResetPagamentos()
      else apptRenderPagamentos()
    }
  }

  function apptRenderPagamentos() {
    var list = document.getElementById('apptPagamentosList')
    if (!list) return
    var H = window.html
    var canRemove = _apptPagamentos.length > 1
    list.innerHTML = _apptPagamentos.map(function(p, i) {
      var pago = p.status === 'pago'
      var bg   = pago ? '#F0FDF4' : '#fff'
      var bd   = pago ? '#86EFAC' : '#E5E7EB'
      var btnTxt = pago ? 'Pago' : 'Aberto'
      var btnBg  = pago ? '#16A34A' : '#F3F4F6'
      var btnFg  = pago ? '#fff'    : '#6B7280'
      var temParcelas = _apptFormaTemParcelas(p.forma)
      var valorStr = p.valor ? p.valor.toFixed(2) : ''
      var valorParcelaStr = p.valorParcela ? p.valorParcela.toFixed(2) : ''

      var parcelasHtml = temParcelas
        ? H`<div style="display:flex;gap:5px;align-items:center;margin-top:5px">
            <label style="font-size:10px;font-weight:700;color:#6B7280">Parcelas</label>
            <input type="number" min="1" max="24" value="${p.parcelas || 1}" oninput="apptUpdatePagamento(${i}, 'parcelas', this.value)" style="width:50px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
            <span style="font-size:10px;color:#6B7280">x R$</span>
            <input type="number" step="0.01" value="${valorParcelaStr}" oninput="apptUpdatePagamento(${i}, 'valorParcela', this.value)" style="width:80px;padding:4px 6px;border:1px solid #E5E7EB;border-radius:5px;font-size:11px;outline:none"/>
          </div>`
        : ''

      var removeBtn = canRemove
        ? H`<button type="button" onclick="apptRemovePagamento(${i})" style="padding:5px 7px;background:#FEE2E2;color:#DC2626;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;line-height:1">×</button>`
        : ''

      return H`<div data-pagamento-row="${i}" style="background:${bg};border:1px solid ${bd};border-radius:8px;padding:7px">
        <div style="display:flex;gap:5px;align-items:center">
          <select onchange="apptUpdatePagamento(${i}, 'forma', this.value)" style="flex:1;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;background:#fff;outline:none">${H.raw(_formaOptions(p.forma))}</select>
          <input type="number" step="0.01" placeholder="0,00" value="${valorStr}" oninput="apptUpdatePagamento(${i}, 'valor', this.value)" style="width:75px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none"/>
          <button type="button" onclick="apptTogglePago(${i})" style="padding:5px 8px;background:${btnBg};color:${btnFg};border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">${btnTxt}</button>
          ${H.raw(removeBtn)}
        </div>
        ${H.raw(parcelasHtml)}
        <input type="text" placeholder="Comentário (opcional)" value="${p.comentario || ''}" oninput="apptUpdatePagamento(${i}, 'comentario', this.value)" style="width:100%;margin-top:5px;padding:5px 7px;border:1px solid #E5E7EB;border-radius:6px;font-size:11px;outline:none;box-sizing:border-box"/>
      </div>`
    }).join('')
    apptUpdatePagamentosTotal()
  }

  function apptUpdatePagamentosTotal() {
    var totalEl = document.getElementById('apptPagamentosTotal')
    if (!totalEl) return
    var M = window.Money
    var total = M ? M.sum(_apptPagamentos.map(function(p) { return p.valor })) : _apptPagamentos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
    var valor = _apptValorTotalPagar()
    var diff = M ? M.sub(valor, total) : +(valor - total).toFixed(2)
    var fmt = M ? M.format : function(v) { return 'R$ ' + (parseFloat(v)||0).toFixed(2) }
    if (M ? M.isZero(diff) : Math.abs(diff) < 0.01) {
      totalEl.style.color = '#16A34A'
      totalEl.textContent = 'Alocado: ' + fmt(total) + ' / ' + fmt(valor)
    } else if (diff > 0) {
      totalEl.style.color = '#DC2626'
      totalEl.textContent = 'Falta alocar ' + fmt(diff) + ' (alocado: ' + fmt(total) + ' / ' + fmt(valor) + ')'
    } else {
      totalEl.style.color = '#DC2626'
      totalEl.textContent = 'Excesso de ' + fmt(Math.abs(diff)) + ' (alocado: ' + fmt(total) + ' / ' + fmt(valor) + ')'
    }
  }

  function apptAutoSala() {
    var profSel = document.getElementById('appt_prof')
    var salaSel = document.getElementById('appt_sala')
    if (!profSel || !salaSel) return
    var profIdx = parseInt(profSel.value)
    if (isNaN(profIdx)) return
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = profs[profIdx]
    if (!prof) return
    var rooms = typeof getRooms === 'function' ? getRooms() : []
    for (var i = 0; i < rooms.length; i++) {
      if (prof.sala_id === rooms[i].id || prof.sala === rooms[i].nome) {
        salaSel.value = i
        return
      }
    }
  }

  // ── Fuzzy search helpers ────────────────────────────────────
  function _normalize(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
  function _fuzzyMatch(query, target) {
    var qi = 0
    for (var ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) qi++
    }
    return qi === query.length
  }

  // ── apptSearchPatient (debounced 300ms) ──────────────────────
  var _searchTimer = null
  var _leadsCache = null

  function apptSearchPatient(q) {
    if (_searchTimer) clearTimeout(_searchTimer)
    _searchTimer = setTimeout(function() { _doPatientSearch(q) }, 300)
  }

  function _doPatientSearch(q) {
    const drop = document.getElementById('apptPatientDrop')
    const warn = document.getElementById('appt_paciente_warn')
    if (!q.trim()) { drop.style.display = 'none'; warn.style.display = 'none'; return }
    // Cache leads to avoid reloading on every keystroke
    if (!_leadsCache) {
      _leadsCache = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      // Invalidate cache after 30s
      setTimeout(function() { _leadsCache = null }, 30000)
    }
    const leads = _leadsCache
    const ql = _normalize(q)
    const matches = leads
      .map(function (l) {
        var nome = _normalize(l.nome || l.name || '')
        var phone = l.phone || l.whatsapp || ''
        if (nome.includes(ql)) return { l: l, score: 0 }
        if (phone.includes(q)) return { l: l, score: 1 }
        if (_fuzzyMatch(ql, nome)) return { l: l, score: 2 }
        return null
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.score - b.score })
      .map(function (m) { return m.l })
      .slice(0, 8)

    if (!matches.length) {
      drop.style.display = 'none'
      warn.style.display = 'block'
      return
    }

    warn.style.display = 'none'
    drop.innerHTML = matches.map(l => {
      const nome = l.nome || l.name || 'Paciente'
      const phone = l.phone || l.whatsapp || ''
      return `<div data-lead-id="${l.id || ''}" data-lead-name="${nome.replace(/"/g, '&quot;')}" data-lead-phone="${phone}"
        style="padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #F3F4F6"
        onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background=''">
        <div style="font-weight:600;color:#111">${nome.replace(/</g, '&lt;')}</div>
        ${phone ? `<div style="font-size:11px;color:#9CA3AF">${phone.replace(/</g, '&lt;')}</div>` : ''}
      </div>`
    }).join('')
    // Use event delegation with single handler (prevents listener accumulation)
    drop.onclick = function(e) {
      var el = e.target.closest('[data-lead-id]')
      if (el) selectApptPatient(el.dataset.leadId, el.dataset.leadName, el.dataset.leadPhone)
    }
    drop.style.display = 'block'
  }

  // ── selectApptPatient ─────────────────────────────────────────
  function selectApptPatient(id, nome, phone) {
    document.getElementById('appt_paciente_q').value = nome
    document.getElementById('appt_paciente_id').value = id
    var phoneEl = document.getElementById('appt_paciente_phone')
    if (phoneEl) phoneEl.value = phone || ''
    document.getElementById('apptPatientDrop').style.display = 'none'
    document.getElementById('appt_paciente_warn').style.display = 'none'
    apptDetectTipoPaciente(id)
  }

  // ── apptIndicadoSearch / apptIndicadoSelect ──────────────────
  // Dropdown de busca para "Indicado por". Forca selecao da lista —
  // o usuario nao pode digitar nome livre. Reusa _leadsCache.
  var _indicadoTimer = null

  function apptIndicadoSearch(q) {
    var idEl = document.getElementById('appt_indicado_por_id')
    if (idEl) idEl.value = ''
    if (_indicadoTimer) clearTimeout(_indicadoTimer)
    _indicadoTimer = setTimeout(function() { _doIndicadoSearch(q) }, 200)
  }

  function _doIndicadoSearch(q) {
    var drop = document.getElementById('apptIndicadoDrop')
    if (!drop) return
    if (!_leadsCache) {
      _leadsCache = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
      setTimeout(function() { _leadsCache = null }, 30000)
    }
    var pacienteAtualId = (document.getElementById('appt_paciente_id') && document.getElementById('appt_paciente_id').value) || ''
    var query = (q || '').trim().toLowerCase()
    var matches = _leadsCache
      .filter(function(l) { return (l.id || '') !== pacienteAtualId })
      .filter(function(l) {
        if (!query) return true
        var nome = (l.nome || l.name || '').toLowerCase()
        return nome.includes(query)
      })
      .slice(0, 8)

    if (!matches.length) { drop.style.display = 'none'; return }

    drop.innerHTML = matches.map(function(l) {
      var nome = l.nome || l.name || 'Paciente'
      var phone = l.phone || l.whatsapp || ''
      return '<div data-ind-id="' + (l.id || '') + '" data-ind-name="' + nome.replace(/"/g, '&quot;') + '"' +
        ' style="padding:8px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid #F3F4F6"' +
        ' onmouseover="this.style.background=\'#F9FAFB\'" onmouseout="this.style.background=\'\'">' +
        '<div style="font-weight:600;color:#111">' + nome.replace(/</g, '&lt;') + '</div>' +
        (phone ? '<div style="font-size:10px;color:#9CA3AF">' + phone.replace(/</g, '&lt;') + '</div>' : '') +
        '</div>'
    }).join('')
    drop.onclick = function(e) {
      var el = e.target.closest('[data-ind-id]')
      if (el) apptIndicadoSelect(el.dataset.indId, el.dataset.indName)
    }
    drop.style.display = 'block'
  }

  function apptIndicadoSelect(id, nome) {
    var inp = document.getElementById('appt_indicado_por')
    var idEl = document.getElementById('appt_indicado_por_id')
    if (inp) inp.value = nome
    if (idEl) idEl.value = id
    var drop = document.getElementById('apptIndicadoDrop')
    if (drop) drop.style.display = 'none'
  }

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', function(e) {
    var drop = document.getElementById('apptIndicadoDrop')
    var inp = document.getElementById('appt_indicado_por')
    if (!drop || drop.style.display === 'none') return
    if (e.target === inp || drop.contains(e.target)) return
    drop.style.display = 'none'
    // Se digitou algo mas nao selecionou, limpa
    if (inp && !document.getElementById('appt_indicado_por_id').value) inp.value = ''
  })

  // ── apptDetectTipoPaciente ───────────────────────────────────
  // Regra: se o paciente ja tem >=1 atendimento finalizado, é "retorno".
  // Caso contrario, "novo". Ignora o appointment em edição.
  function apptDetectTipoPaciente(pacienteId) {
    var tipoEl = document.getElementById('appt_tipo_paciente')
    if (!tipoEl || !pacienteId) return
    var editId = (document.getElementById('appt_id') && document.getElementById('appt_id').value) || ''
    var all = _getAppts()
    var jaAtendido = all.some(function(a) {
      return a.id !== editId && a.pacienteId === pacienteId && a.status === 'finalizado'
    })
    tipoEl.value = jaAtendido ? 'retorno' : 'novo'
  }

  // ── saveAppt ──────────────────────────────────────────────────
  // Fluxo: validar → salvar localStorage otimistico → syncOneAwait →
  //        toast+close+refresh (sucesso) OU reverter localStorage (falha).
  // Botao disable impede duplo submit. Se houver erros inline, aborta
  // imediatamente sem submit.
  async function saveAppt() {
    // Guard de duplo submit: se ja esta rodando, ignora.
    var _saveBtn = _apptSaveBtn()
    if (_saveBtn && _saveBtn.disabled) return
    // Guard de erros inline: nao submete se houver campos com borda danger.
    if (_apptHasInlineErrors()) {
      _warn('Corrija os campos destacados em vermelho antes de salvar.')
      return
    }
    const nome = document.getElementById('appt_paciente_q') && document.getElementById('appt_paciente_q').value.trim()
    if (!nome) { _warn('Selecione o paciente'); return }
    const data   = document.getElementById('appt_data') && document.getElementById('appt_data').value
    const inicio = document.getElementById('appt_inicio') && document.getElementById('appt_inicio').value
    if (!data || !inicio) { _warn('Informe data e horario'); return }

    // Validar horario passado (camada obrigatoria — independe do AgendaValidator)
    var todayIso = new Date().toISOString().slice(0, 10)
    var editId0 = document.getElementById('appt_id') && document.getElementById('appt_id').value
    if (!editId0) {
      if (data < todayIso) { _warn('Nao e possivel agendar em data passada.'); return }
      if (data === todayIso && new Date(data + 'T' + inicio + ':00') < new Date()) {
        _warn('Nao e possivel agendar em horario que ja passou.'); return
      }
    }

    const duracao = parseInt((document.getElementById('appt_duracao') && document.getElementById('appt_duracao').value) || '60')
    const fim     = _addMins(inicio, duracao)
    const profIdx = parseInt(((document.getElementById('appt_prof') && document.getElementById('appt_prof').value) || '0')) || 0
    const salaIdx = parseInt((document.getElementById('appt_sala') && document.getElementById('appt_sala').value) || '')
    const profs   = typeof getProfessionals === 'function' ? getProfessionals() : []

    // Validação tipo de atendimento (Consulta vs Procedimento — exclusivos)
    const tipoAtend = (document.getElementById('appt_tipo') && document.getElementById('appt_tipo').value) || ''
    if (!tipoAtend) { _warn('Selecione o tipo de atendimento (Consulta ou Procedimento).'); return }

    const tipoAvalEl = document.querySelector('input[name="appt_tipo_aval"]:checked')
    const tipoAvalVal = tipoAvalEl && tipoAvalEl.value || ''
    const cortesiaMotivo = (document.getElementById('appt_cortesia_motivo') && document.getElementById('appt_cortesia_motivo').value.trim()) || ''

    if (tipoAtend === 'avaliacao') {
      if (!tipoAvalVal) { _warn('Indique se a consulta e Cortesia ou Paga.'); return }
      if (tipoAvalVal === 'cortesia' && !cortesiaMotivo) {
        _warn('Informe o motivo da cortesia.'); return
      }
    }
    if (tipoAtend === 'procedimento' && (!_apptProcs || _apptProcs.length === 0)) {
      _warn('Adicione ao menos um procedimento.'); return
    }
    if (tipoAtend === 'procedimento') {
      var procSemMotivo = _apptProcs.find(function(p) { return p.cortesia && !(p.cortesiaMotivo && p.cortesiaMotivo.trim()) })
      if (procSemMotivo) { _warn('Informe o motivo da cortesia em "' + procSemMotivo.nome + '".'); return }
      var procSemIntervalo = _apptProcs.find(function(p) { return p.retornoTipo === 'retorno' && (!p.retornoIntervalo || p.retornoIntervalo <= 0) })
      if (procSemIntervalo) { _warn('Selecione o intervalo de retorno em "' + procSemIntervalo.nome + '".'); return }
    }

    // Validação pagamentos (Consulta Paga OU Procedimento)
    const valorTotal = parseFloat((document.getElementById('appt_valor') && document.getElementById('appt_valor').value) || '0') || 0
    const consultaPaga = tipoAtend === 'avaliacao' && tipoAvalVal === 'paga'
    const procWithItems = tipoAtend === 'procedimento' && _apptProcs.length > 0
    if (consultaPaga && valorTotal <= 0) { _warn('Informe o valor da consulta.'); return }
    if (consultaPaga || procWithItems) {
      if (!_apptPagamentos.length) { _warn('Adicione ao menos uma forma de pagamento.'); return }
      var faltaForma = _apptPagamentos.find(function(p) { return !p.forma })
      if (faltaForma) { _warn('Selecione a forma de cada pagamento.'); return }
      var faltaParcelas = _apptPagamentos.find(function(p) {
        return _apptFormaTemParcelas(p.forma) && (!p.parcelas || p.parcelas < 1)
      })
      if (faltaParcelas) { _warn('Informe o numero de parcelas para pagamento parcelado/credito.'); return }
      var parcelasExcede = _apptPagamentos.find(function(p) {
        return _apptFormaTemParcelas(p.forma) && p.parcelas > 24
      })
      if (parcelasExcede) { _warn('Numero maximo de parcelas: 24.'); return }
      var M = window.Money
      var somaPag = M ? M.sum(_apptPagamentos.map(function(p) { return p.valor })) : _apptPagamentos.reduce(function(s, p) { return s + (parseFloat(p.valor) || 0) }, 0)
      var totalEsperado = _apptValorTotalPagar()
      var matches = M ? M.eq(somaPag, totalEsperado) : Math.abs(somaPag - totalEsperado) < 0.01
      if (!matches) {
        _warn('A soma dos pagamentos (' + (M ? M.format(somaPag) : 'R$ ' + somaPag.toFixed(2)) + ') deve ser igual ao total (' + (M ? M.format(totalEsperado) : 'R$ ' + totalEsperado.toFixed(2)) + ').'); return
      }
    }

    const apptData = {
      pacienteId:          (document.getElementById('appt_paciente_id') && document.getElementById('appt_paciente_id').value) || '',
      pacienteNome:        nome,
      pacientePhone:       (document.getElementById('appt_paciente_phone') && document.getElementById('appt_paciente_phone').value) || '',
      profissionalIdx:     profIdx,
      profissionalNome:    profs[profIdx] && profs[profIdx].nome || '',
      salaIdx:             isNaN(salaIdx) ? null : salaIdx,
      procedimento:        (document.getElementById('appt_proc') && document.getElementById('appt_proc').value.trim()) || '',
      data,
      horaInicio:          inicio,
      horaFim:             fim,
      status:              (document.getElementById('appt_status') && document.getElementById('appt_status').value) || 'agendado',
      tipoConsulta:        tipoAtend,
      tipoAvaliacao:       tipoAtend === 'avaliacao' ? tipoAvalVal : '',
      cortesiaMotivo:      (tipoAtend === 'avaliacao' && tipoAvalVal === 'cortesia') ? cortesiaMotivo : '',
      origem:              (document.getElementById('appt_origem') && document.getElementById('appt_origem').value) || '',
      valor:               (consultaPaga || procWithItems) ? _apptValorTotalPagar() : 0,
      pagamentos:          (consultaPaga || procWithItems)
        ? _apptPagamentos.map(function(p) {
            return {
              forma:        p.forma,
              valor:        parseFloat(p.valor) || 0,
              status:       p.status === 'pago' ? 'pago' : 'aberto',
              parcelas:     _apptFormaTemParcelas(p.forma) ? (parseInt(p.parcelas) || 1) : 1,
              valorParcela: _apptFormaTemParcelas(p.forma) ? (parseFloat(p.valorParcela) || 0) : (parseFloat(p.valor) || 0),
              comentario:   p.comentario || '',
            }
          })
        : [],
      formaPagamento:      (function() {
        if (!consultaPaga && !procWithItems) return ''
        if (_apptPagamentos.length === 1) return _apptPagamentos[0].forma || ''
        return 'misto'
      })(),
      statusPagamento:     (function() {
        if (!consultaPaga && !procWithItems) return 'pendente'
        var pagos = _apptPagamentos.filter(function(p) { return p.status === 'pago' }).length
        if (pagos === 0) return 'aberto'
        if (pagos === _apptPagamentos.length) return 'pago'
        return 'parcial'
      })(),
      confirmacaoEnviada:  (document.getElementById('appt_confirmacao') && document.getElementById('appt_confirmacao').checked) || false,
      consentimentoImagem: (document.getElementById('appt_consentimento') && document.getElementById('appt_consentimento').checked) ? 'assinado' : 'pendente',
      obs:                 (document.getElementById('appt_obs') && document.getElementById('appt_obs').value.trim()) || '',
      tipoPaciente:        (document.getElementById('appt_tipo_paciente') && document.getElementById('appt_tipo_paciente').value) || 'novo',
      indicadoPor:         (document.getElementById('appt_indicado_por') && document.getElementById('appt_indicado_por').value.trim()) || '',
      indicadoPorId:       (document.getElementById('appt_indicado_por_id') && document.getElementById('appt_indicado_por_id').value) || '',
      procedimentos:       tipoAtend === 'procedimento' && _apptProcs.length
        ? _apptProcs.map(function(p) {
            return {
              nome:             p.nome,
              valor:            parseFloat(p.valor) || 0,
              cortesia:         !!p.cortesia,
              cortesiaMotivo:   p.cortesia ? (p.cortesiaMotivo || '') : '',
              retornoTipo:      p.retornoTipo === 'retorno' ? 'retorno' : 'avulso',
              retornoIntervalo: p.retornoTipo === 'retorno' ? (parseInt(p.retornoIntervalo) || 0) : 0,
            }
          })
        : [],
      // Agregados de cortesia (alimentam relatórios financeiros)
      valorCortesia: (function() {
        if (tipoAtend !== 'procedimento') return 0
        var M = window.Money
        var cortValores = _apptProcs.filter(function(p) { return p.cortesia }).map(function(p) { return p.valor })
        return M ? M.sum(cortValores) : cortValores.reduce(function(s, v) { return s + (parseFloat(v) || 0) }, 0)
      })(),
      qtdProcsCortesia: tipoAtend === 'procedimento'
        ? _apptProcs.filter(function(p) { return p.cortesia }).length
        : 0,
      motivoCortesia: (function() {
        if (tipoAtend !== 'procedimento') return ''
        var motivos = _apptProcs.filter(function(p) { return p.cortesia && p.cortesiaMotivo }).map(function(p) { return p.nome + ': ' + p.cortesiaMotivo })
        return motivos.join(' | ')
      })(),
      // Recurrence: injetado por _apptPersistSeries / apptCreateNextSessionOnly
      // via window.__apptPendingRecurrence — nao afeta saves normais.
      recurrenceGroupId:     (window.__apptPendingRecurrence && window.__apptPendingRecurrence.groupId) || null,
      recurrenceIndex:       (window.__apptPendingRecurrence && window.__apptPendingRecurrence.index) || null,
      recurrenceTotal:       (window.__apptPendingRecurrence && window.__apptPendingRecurrence.total) || null,
      recurrenceProcedure:   (window.__apptPendingRecurrence && window.__apptPendingRecurrence.procName) || null,
      recurrenceIntervalDays:(window.__apptPendingRecurrence && window.__apptPendingRecurrence.interval) || null,
    }

    const appts  = _getAppts()
    const editId = document.getElementById('appt_id') && document.getElementById('appt_id').value

    // Validação via AgendaValidator (camada 1)
    if (window.AgendaValidator) {
      const vResult = AgendaValidator.validateSave(apptData, editId || null)
      if (!vResult.ok) {
        if (typeof showValidationErrors === 'function') showValidationErrors(vResult.errors, editId ? 'Não foi possível editar' : 'Não foi possível agendar')
        return
      }
    } else {
      // Fallback: validação básica legada
      const provisional = Object.assign({}, apptData, { id: editId || '__new__' })
      const { conflict, reason: confReason } = _checkConflict(provisional, appts)
      if (conflict) { _warn('Conflito de horario: ' + confReason); return }
    }

    // Verificar se edição é permitida
    if (editId && window.AgendaValidator) {
      const existing = appts.find(a => a.id === editId)
      if (existing) {
        const canEdit = AgendaValidator.canEdit(existing)
        if (!canEdit.ok) {
          if (typeof showValidationErrors === 'function') showValidationErrors(canEdit.errors, 'Edição não permitida')
          return
        }
      }
    }

    let isNew  = false
    let novoId = null

    if (editId) {
      const idx = appts.findIndex(a => a.id === editId)
      if (idx >= 0) {
        const old = Object.assign({}, appts[idx])
        appts[idx] = Object.assign({}, appts[idx], apptData)
        // Audit log de edição — registra todos os campos alterados
        if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
        var _auditFields = ['data','horaInicio','horaFim','profissionalIdx','profissionalNome','salaIdx','procedimento','tipoConsulta','tipoAvaliacao','origem','valor','formaPagamento','statusPagamento','status','confirmacaoEnviada','consentimentoImagem','obs','pacienteId','indicadoPor','tipoPaciente','cortesiaMotivo','valorCortesia','qtdProcsCortesia']
        var _oldVals = {}, _newVals = {}, _hasChanges = false
        _auditFields.forEach(function(f) {
          if (String(old[f] || '') !== String(apptData[f] || '')) {
            _oldVals[f] = old[f]; _newVals[f] = apptData[f]; _hasChanges = true
          }
        })
        var _oldProcsJson = JSON.stringify(old.procedimentos || [])
        var _newProcsJson = JSON.stringify(apptData.procedimentos || [])
        if (_oldProcsJson !== _newProcsJson) { _oldVals.procedimentos = old.procedimentos; _newVals.procedimentos = apptData.procedimentos; _hasChanges = true }
        var _oldPagsJson = JSON.stringify(old.pagamentos || [])
        var _newPagsJson = JSON.stringify(apptData.pagamentos || [])
        if (_oldPagsJson !== _newPagsJson) { _oldVals.pagamentos = old.pagamentos; _newVals.pagamentos = apptData.pagamentos; _hasChanges = true }
        if (_hasChanges) {
          appts[idx].historicoAlteracoes.push({
            action_type: 'edicao',
            old_value:   _oldVals,
            new_value:   _newVals,
            changed_by:  'secretaria',
            changed_at:  new Date().toISOString(),
            reason:      'Edicao manual',
          })
        }
        // Recalcular automações se data/hora mudou — cancela antigas primeiro
        if ((old.data !== apptData.data || old.horaInicio !== apptData.horaInicio) && typeof scheduleAutomations === 'function') {
          if (window._getQueue && window._saveQueue) {
            var q = _getQueue().map(function(x) { return x.apptId === editId ? Object.assign({}, x, { executed: true }) : x })
            _saveQueue(q)
          }
          scheduleAutomations(appts[idx])
        }
      }
    } else {
      novoId = _genId()
      appts.push(Object.assign({ id: novoId, createdAt: new Date().toISOString(), historicoAlteracoes: [] }, apptData))
      isNew = true
    }

    // Snapshot pra rollback em caso de falha de sync.
    // prevAppts restaura localStorage; prevState restaura procs+pagamentos
    // do modal (importante quando usuario tenta novamente).
    const prevAppts = JSON.parse(JSON.stringify(_getAppts()))
    const prevState = {
      procs:      JSON.parse(JSON.stringify(_apptState.procs)),
      pagamentos: JSON.parse(JSON.stringify(_apptState.pagamentos)),
    }

    // 1) Grava otimisticamente no localStorage (UX rapida)
    _saveAppts(appts)
    _apptDisableSave('syncing')

    // 2) Sincroniza com Supabase ANTES de fechar/toast/refresh.
    // Se falhar, reverte localStorage e state do modal; nao fecha.
    const savedId = editId || novoId
    const saved = appts.find(a => a.id === savedId)
    try {
      if (window.AppointmentsService && saved) {
        const result = await AppointmentsService.syncOneAwait(saved)
        if (!result.ok && !result.queued) {
          // Rollback duro: sem conexao mas servidor rejeitou (ex: validacao, RLS)
          _saveAppts(prevAppts)
          _apptState.procs.splice(0); prevState.procs.forEach(function(p) { _apptState.procs.push(p) })
          _apptState.pagamentos.splice(0); prevState.pagamentos.forEach(function(p) { _apptState.pagamentos.push(p) })
          _refresh()
          if (window._showToast) _showToast('Falha ao sincronizar com servidor', (result.error || 'Tente novamente.'), 'error')
          _apptEnableSave()
          return
        }
        // Se result.queued (offline), avisa mas segue o fluxo — fica no offline queue
        if (result.queued) {
          if (window._showToast) _showToast('Salvo offline', 'Sera sincronizado quando voltar a conexao.', 'info')
        }
      }
    } catch (err) {
      // Defesa extra: excecao inesperada
      _saveAppts(prevAppts)
      _apptState.procs.splice(0); prevState.procs.forEach(function(p) { _apptState.procs.push(p) })
      _apptState.pagamentos.splice(0); prevState.pagamentos.forEach(function(p) { _apptState.pagamentos.push(p) })
      _refresh()
      if (window._showToast) _showToast('Falha ao sincronizar com servidor', (err && err.message) || 'Tente novamente.', 'error')
      _apptEnableSave()
      return
    }

    // 3) Sucesso: fecha modal, limpa draft, toast e refresca
    closeApptModal()
    _refresh()
    _clearDraft()
    if (window._showToast) _showToast(isNew ? 'Agendamento criado' : 'Agendamento atualizado', nome, 'success')

    // 4) Automacoes e hooks pos-save (best-effort; nao quebra fluxo)
    if (isNew) {
      const apptCompleto = Object.assign({}, apptData, { id: novoId, profissionalNome: profs[profIdx] && profs[profIdx].nome || '' })
      const isNovo = (apptCompleto.tipoPaciente || 'novo') !== 'retorno'
      const linkPromise = (isNovo && typeof _gerarLinkAnamnese === 'function')
        ? _gerarLinkAnamnese(apptCompleto.id, apptCompleto.pacienteId).catch(function(e) { console.warn('[Agenda-modal] falha link:', e); return null })
        : Promise.resolve(null)
      // Exporta a promise das automacoes pra que series de recorrencia possam
      // aguardar a msg universal de Agendamento ser enfileirada antes de disparar
      // a msg consolidada da serie (senao ha race e a consolidada pode ir primeiro).
      var autoPromise = linkPromise.then(function(link) {
        if (link) apptCompleto.link_anamnese = link
        if (typeof scheduleAutomations === 'function') scheduleAutomations(apptCompleto)
        if (window.AutomationsEngine && window.AutomationsEngine.processStatusChange) {
          return AutomationsEngine.processStatusChange(apptCompleto, apptCompleto.status || 'agendado')
            .catch(function(e) { console.error('[Agenda-modal] processStatusChange inicial falhou:', e) })
        }
      })
      window.__apptLastAutomationsPromise = autoPromise
      if (typeof _applyStatusTag === 'function' && apptCompleto.pacienteId) {
        _applyStatusTag(apptCompleto, 'agendado', 'criacao')
      }
      if (apptCompleto.pacienteId) {
        _setLeadStatus(apptCompleto.pacienteId, 'scheduled', ['patient', 'attending'])
      }
      if (window.SdrService && apptCompleto.pacienteId) {
        SdrService.onLeadScheduled(apptCompleto.pacienteId, apptCompleto)
      }
    }
  }

  // ── deleteAppt ────────────────────────────────────────────────
  function deleteAppt() {
    const id = document.getElementById('appt_id') && document.getElementById('appt_id').value
    if (!id) return
    if (!confirm('Excluir esta consulta?')) return
    const appts = _getAppts().filter(a => a.id !== id)
    _saveAppts(appts)
    closeApptModal()
    _refresh()
    // Soft delete no Supabase (fire-and-forget)
    if (window.AppointmentsService && window.AppointmentsService.softDelete) {
      window.AppointmentsService.softDelete(id)
    }
  }

  // ── openApptDetail ────────────────────────────────────────────
  // ── apptReagendar — dialog dedicado de reagendamento ─────────
  // Abre um mini-dialog com nova data/hora/motivo, valida via
  // AgendaValidator, grava histórico, aplica nova data, dispara
  // scheduleAutomations (WhatsApp) e refresca a agenda.
  function apptReagendar(id) {
    var a = _getAppts().find(function(x) { return x.id === id })
    if (!a) return
    // Guarda: status que bloqueiam reagendamento
    var blocked = ['finalizado', 'cancelado', 'no_show']
    if (blocked.indexOf(a.status) !== -1) {
      _warn('Atendimentos com status "' + a.status + '" nao podem ser reagendados.')
      return
    }

    var existing = document.getElementById('apptReagendarDlg')
    if (existing) existing.remove()

    var H = window.html
    var fmtD = _fmtDate(a.data)

    var dlg = document.createElement('div')
    dlg.id = 'apptReagendarDlg'
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10015;display:flex;align-items:center;justify-content:center;padding:16px'
    dlg.innerHTML = H`<div id="apptReagendarInner" role="dialog" aria-modal="true" aria-labelledby="apptReagendarTitle" style="background:#fff;border-radius:14px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:#3B82F6;padding:14px 18px;color:#fff;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div id="apptReagendarTitle" style="font-size:14px;font-weight:800">Reagendar consulta</div>
          <div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:2px">${a.pacienteNome || 'Paciente'}</div>
        </div>
        <button type="button" onclick="document.getElementById('apptReagendarDlg').remove()" aria-label="Fechar" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:700;line-height:1">×</button>
      </div>
      <div style="padding:18px">
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:10px 12px;margin-bottom:14px">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Agendamento atual</div>
          <div style="font-size:13px;font-weight:700;color:#111">${fmtD} &nbsp;${a.horaInicio}–${a.horaFim}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div>
            <label style="font-size:10px;font-weight:700;color:#6B7280;display:block;margin-bottom:4px">NOVA DATA *</label>
            <input id="rg_data" type="date" value="${a.data}" style="width:100%;padding:8px 10px;border:1.5px solid #BFDBFE;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:#6B7280;display:block;margin-bottom:4px">NOVO HORÁRIO *</label>
            <input id="rg_hora" type="time" value="${a.horaInicio}" style="width:100%;padding:8px 10px;border:1.5px solid #BFDBFE;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:10px;font-weight:700;color:#6B7280;display:block;margin-bottom:4px">MOTIVO <span style="color:#9CA3AF">(opcional, registrado na timeline)</span></label>
          <textarea id="rg_motivo" rows="2" placeholder="Ex: paciente pediu adiar, conflito de agenda..." style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" onclick="document.getElementById('apptReagendarDlg').remove()" style="padding:9px 16px;background:#F3F4F6;color:#6B7280;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Cancelar</button>
          <button type="button" onclick="apptReagendarConfirm('${id}')" style="padding:9px 20px;background:#3B82F6;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Confirmar reagendamento</button>
        </div>
      </div>
    </div>`
    dlg.addEventListener('click', function(e) {
      var inner = document.getElementById('apptReagendarInner')
      if (inner && !inner.contains(e.target)) dlg.remove()
    })
    document.body.appendChild(dlg)
    setTimeout(function() {
      var dataEl = document.getElementById('rg_data')
      if (dataEl) dataEl.focus()
    }, 0)
  }

  function apptReagendarConfirm(id) {
    var appts = _getAppts()
    var idx = appts.findIndex(function(x) { return x.id === id })
    if (idx < 0) return
    var a = appts[idx]

    var novaData  = (document.getElementById('rg_data') || {}).value
    var novaHora  = (document.getElementById('rg_hora') || {}).value
    var motivo    = ((document.getElementById('rg_motivo') || {}).value || '').trim()

    if (!novaData || !novaHora) {
      _warn('Informe a nova data e hora.')
      return
    }

    // Validação: data/hora no futuro
    var todayIso = new Date().toISOString().slice(0, 10)
    if (novaData < todayIso) {
      _warn('Nao e possivel reagendar para data passada.')
      return
    }
    if (novaData === todayIso && new Date(novaData + 'T' + novaHora + ':00') < new Date()) {
      _warn('Nao e possivel reagendar para horario que ja passou.')
      return
    }

    // Calcula nova hora fim preservando a duração
    var oldStart = a.horaInicio.split(':').map(Number)
    var oldEnd   = a.horaFim.split(':').map(Number)
    var duration = (oldEnd[0] * 60 + oldEnd[1]) - (oldStart[0] * 60 + oldStart[1])
    var novaHoraFim = _addMins(novaHora, duration)

    // Validação via AgendaValidator (mesmo pipeline do drag & drop)
    if (window.AgendaValidator && AgendaValidator.validateDragDrop) {
      var errs = AgendaValidator.validateDragDrop(a, novaData, novaHora, novaHoraFim)
      if (errs && errs.length) {
        if (window.showValidationErrors) showValidationErrors(errs, 'Reagendamento não permitido')
        else _warn(errs.join('. '))
        return
      }
    } else {
      // Fallback legado: checa conflito
      var provisional = Object.assign({}, a, { data: novaData, horaInicio: novaHora, horaFim: novaHoraFim })
      var conf = _checkConflict(provisional, appts)
      if (conf && conf.conflict) {
        _warn('Conflito de horario: ' + (conf.reason || 'Outro agendamento no mesmo horario.'))
        return
      }
    }

    // Registra histórico completo
    if (!appts[idx].historicoAlteracoes) appts[idx].historicoAlteracoes = []
    appts[idx].historicoAlteracoes.push({
      action_type: 'reagendamento_manual',
      old_value:   { data: a.data, horaInicio: a.horaInicio, horaFim: a.horaFim },
      new_value:   { data: novaData, horaInicio: novaHora, horaFim: novaHoraFim },
      changed_by:  'secretaria',
      changed_at:  new Date().toISOString(),
      reason:      motivo || 'Reagendamento manual via botão',
    })
    if (!appts[idx].historicoStatus) appts[idx].historicoStatus = []
    appts[idx].historicoStatus.push({
      status: appts[idx].status,
      at:     new Date().toISOString(),
      by:     'reagendar_btn',
      motivo: 'Reagendado de ' + a.data + ' ' + a.horaInicio + ' para ' + novaData + ' ' + novaHora + (motivo ? ' — ' + motivo : ''),
    })

    // Aplica nova data/hora preservando duração
    appts[idx].data          = novaData
    appts[idx].horaInicio    = novaHora
    appts[idx].horaFim       = novaHoraFim
    appts[idx].lastRescheduledAt = new Date().toISOString()
    appts[idx].rescheduledCount  = (appts[idx].rescheduledCount || 0) + 1
    if (motivo) appts[idx].reagendamentoMotivo = motivo

    _saveAppts(appts)

    // Sync Supabase
    if (window.AppointmentsService && window.AppointmentsService.syncOne) {
      AppointmentsService.syncOne(appts[idx])
    }
    // Reaplica automações (WhatsApp de confirmação, 24h/30min antes)
    if (window.scheduleAutomations) scheduleAutomations(appts[idx])
    // Tag de reagendado
    if (window._applyStatusTag && appts[idx].pacienteId) {
      _applyStatusTag(appts[idx], 'reagendado', 'reagendar_btn')
    }
    // SDR hook
    if (window.SdrService && appts[idx].pacienteId) {
      SdrService.onLeadScheduled(appts[idx].pacienteId, appts[idx])
    }

    // Fecha dialogs e refresca
    var dlg = document.getElementById('apptReagendarDlg'); if (dlg) dlg.remove()
    var detail = document.getElementById('apptDetailDlg'); if (detail) detail.remove()
    _refresh()

    // Toast de sucesso
    if (window.Modal) {
      Modal.alert({
        title: 'Reagendado com sucesso',
        message: appts[idx].pacienteNome + ' — novo horário: ' + _fmtDate(novaData) + ' ' + novaHora + '. Mensagem de confirmação WhatsApp reagendada automaticamente.',
        tone: 'success'
      })
    }
  }


  // ── Exposição global ──────────────────────────────────────────
  window.openApptModal     = openApptModal
  window.closeApptModal    = closeApptModal
  window.saveAppt          = saveAppt
  window.deleteAppt        = deleteAppt
  window.apptSearchPatient = apptSearchPatient
  window.selectApptPatient = selectApptPatient
  window.apptIndicadoSearch = apptIndicadoSearch
  window.apptIndicadoSelect = apptIndicadoSelect
  window.apptOnProfChange   = apptOnProfChange
  window.apptReagendar      = apptReagendar
  window.apptReagendarConfirm = apptReagendarConfirm
  window.apptAddPagamento   = apptAddPagamento
  window.apptRemovePagamento = apptRemovePagamento
  window.apptUpdatePagamento = apptUpdatePagamento
  window.apptTogglePago     = apptTogglePago
  window.apptUpdatePagamentosTotal = apptUpdatePagamentosTotal
  window.apptProcUpdate     = apptProcUpdate
  window.apptProcAutofill  = apptProcAutofill
  window.apptTipoChange    = apptTipoChange
  window.apptUpdateEndTime = apptUpdateEndTime
  window.apptSetTipo       = apptSetTipo
  window.apptSetAval       = apptSetAval
  window.apptAddProc       = apptAddProc
  window.apptRemoveProc    = apptRemoveProc
  window.apptAutoSala       = apptAutoSala
  window.apptProcSelected   = apptProcSelected
  window.apptToggleDesconto = apptToggleDesconto
  window.apptCalcDesconto   = apptCalcDesconto
  window._multiProcPick     = _multiProcPick
  window._multiProcConfirm  = _multiProcConfirm
  window._multiProcCloseAlert = _multiProcCloseAlert


  // ── Internal bus pra arquivos irmaos (agenda-modal.recurrence.js, .detail.js) ─
  // Expoe helpers locais do IIFE sem poluir window diretamente.
  window._apptInternal = Object.freeze({
    getAppts:      _getAppts,
    saveAppts:     _saveAppts,
    genId:         _genId,
    addMins:       _addMins,
    fmtDate:       _fmtDate,
    refresh:       _refresh,
    warn:          _warn,
    checkConflict: _checkConflict,
    setLeadStatus: _setLeadStatus,
    saveAppt:      saveAppt,
    getProcs:      function() { return _apptProcs },
    statusCfg:       _statusCfg,
    registerHandler: _apptRegisterHandler,
    cleanupHandlers: _apptCleanupHandlers
  })

  // ── Namespace agregador congelado (contrato canonico do projeto) ─
  // Os window.<fn> acima permanecem para compatibilidade com onclick inline.
  window.AgendaModal = Object.freeze({
    open: openApptModal,
    close: closeApptModal,
    save: saveAppt,
    delete: deleteAppt,
    openDetail: openApptDetail,
    searchPatient: apptSearchPatient,
    selectPatient: selectApptPatient,
    onProfChange: apptOnProfChange,
    reagendar: apptReagendar,
    setTipo: apptSetTipo,
    setAval: apptSetAval,
    addProc: apptAddProc,
    removeProc: apptRemoveProc,
    toggleRecurrence: apptToggleRecurrence,
    saveWithSeries: apptSaveWithSeries,
    createNextSessionOnly: apptCreateNextSessionOnly
  })

})()
