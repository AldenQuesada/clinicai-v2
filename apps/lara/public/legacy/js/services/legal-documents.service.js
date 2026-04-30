/**
 * ClinicAI — Legal Documents Service
 *
 * Gerencia templates, requests e assinaturas de documentos legais.
 * Renderiza variaveis do paciente/profissional nos templates.
 *
 * Depende de:
 *   window._sbShared      — Supabase client
 *   getRooms()            — cache de salas
 *   getProfessionals()    — cache de profissionais
 */
;(function () {
  'use strict'

  if (window._clinicaiLegalDocsLoaded) return
  window._clinicaiLegalDocsLoaded = true

  var _templates = null
  var _baseUrl = ''
  var _clinicDataFromDb = null
  var _cacheClinicId = null

  function _getCurrentUserEmail() {
    try { return window._sbShared?.auth?.getUser()?.data?.user?.email || 'admin' } catch (e) { return 'admin' }
  }

  // ── Invalidar cache se clinica mudou ──────────────────────
  function _checkCacheValid() {
    var currentClinicId = null
    try { currentClinicId = window._sbShared ? window._sbShared.auth.getUser()?.data?.user?.app_metadata?.clinic_id : null } catch (e) {}
    if (!currentClinicId) {
      try { currentClinicId = JSON.parse(localStorage.getItem('clinicai_session') || '{}').clinic_id } catch (e) {}
    }
    if (currentClinicId && _cacheClinicId && currentClinicId !== _cacheClinicId) {
      _templates = null
      _clinicDataFromDb = null
      _resolvedProfCache = {}
      _procedureBlocks = null
    }
    if (currentClinicId) _cacheClinicId = currentClinicId
  }

  // ── Carregar dados da clinica do banco (CNPJ, endereco) ───
  async function _loadClinicData() {
    if (_clinicDataFromDb || !window._sbShared) return
    try {
      var res = await window._sbShared.from('clinics').select('name,address,fiscal').limit(1).single()
      if (res.data) {
        var addr = res.data.address || {}
        var fiscal = res.data.fiscal || {}
        _clinicDataFromDb = {
          name: res.data.name || '',
          cnpj: fiscal.cnpj || '',
          endereco: [addr.rua, addr.num, addr.comp, addr.bairro, addr.cidade, addr.estado].filter(Boolean).join(', '),
        }
      }
    } catch (e) { /* silencioso */ }
  }

  // ── Detectar base URL do dashboard ─────────────────────────
  function _getBaseUrl() {
    if (_baseUrl) return _baseUrl
    _baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/')
    return _baseUrl
  }

  // ── Render template com variaveis ──────────────────────────
  function renderTemplate(content, vars) {
    if (!content) return ''
    return content.replace(/\{\{(\w+)\}\}/g, function (_, key) {
      return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
    })
  }

  // ── Resolver profissional responsavel por procedimento ─────
  var _resolvedProfCache = {}

  async function resolveProfessionalForProcedure(procedureName) {
    if (!procedureName || !window._sbShared) return null
    var key = procedureName.toLowerCase().trim()
    if (_resolvedProfCache[key]) return _resolvedProfCache[key]

    var res = await window._sbShared.rpc('resolve_professional_for_procedure', { p_procedure: procedureName })
    if (res.data && res.data.ok) {
      _resolvedProfCache[key] = res.data
      return res.data
    }
    return null
  }

  // ── Construir variaveis a partir de appointment + profissional
  function buildVars(opts) {
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    var prof = null

    // Profissional vem do agendamento (quem agendou = quem assina o TCLE)
    if (opts.profissionalIdx !== undefined && profs[opts.profissionalIdx]) {
      prof = profs[opts.profissionalIdx]
    }
    if (!prof && opts.professional_id) {
      prof = profs.find(function (p) { return p.id === opts.professional_id })
    }

    // Nome da clinica: banco > localStorage > fallback
    var clinicName = (_clinicDataFromDb && _clinicDataFromDb.name) ? _clinicDataFromDb.name : ''
    if (!clinicName && window._getClinicaNome) {
      var n = _getClinicaNome()
      if (n && n !== 'nossa cl\u00ednica' && n !== 'nossa clinica') clinicName = n
    }
    if (!clinicName && window.ClinicEnv && ClinicEnv.CLINIC_NAME) clinicName = ClinicEnv.CLINIC_NAME
    if (!clinicName) clinicName = 'Clinica Mirian de Paula'

    // Dados da clinica (banco > localStorage)
    var clinicData = {}
    try { clinicData = JSON.parse(localStorage.getItem('clinicai_clinic_data') || '{}') } catch (e) {}
    if (_clinicDataFromDb) {
      if (_clinicDataFromDb.cnpj) clinicData.cnpj = _clinicDataFromDb.cnpj
      if (_clinicDataFromDb.endereco) clinicData.endereco = _clinicDataFromDb.endereco
    }

    // Endereco paciente (se disponivel no lead)
    var pacienteEndereco = opts.endereco || opts.patient_address || ''
    if (!pacienteEndereco && opts.data && opts.data.endereco) pacienteEndereco = opts.data.endereco

    return {
      nome:                    opts.pacienteNome || opts.patient_name || '',
      cpf:                     opts.pacienteCpf || opts.patient_cpf || '',
      data:                    new Date().toLocaleDateString('pt-BR'),
      data_extenso:            _dataExtenso(),
      profissional:            prof ? (prof.display_name || prof.nome || '') : (opts.profissionalNome || opts.professional_name || ''),
      registro_profissional:   prof ? (prof.crm || '') : '',
      especialidade:           prof ? (prof.specialty || prof.cargo || '') : '',
      procedimento:            opts.procedimento || opts.procedure_name || '',
      clinica:                 clinicName,
      hora:                    opts.horaInicio || opts.start_time || '',
      cnpj:                    clinicData.cnpj || '',
      endereco_clinica:        clinicData.endereco || '',
      endereco_paciente:       pacienteEndereco,
      data_nascimento:         opts.dataNascimento || opts.birth_date || (opts.data ? opts.data.nascimento : '') || '',
    }
  }

  function _dataExtenso() {
    var d = new Date()
    var meses = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear()
  }

  // ══════════════════════════════════════════════════════════
  //  TEMPLATES
  // ══════════════════════════════════════════════════════════

  async function loadTemplates() {
    _checkCacheValid()
    if (!window._sbShared) return []
    var res = await window._sbShared.rpc('legal_doc_list_templates', {})
    if (res.data && res.data.ok) {
      _templates = res.data.data || []
      return _templates
    }
    return []
  }

  function getTemplates() { return _templates || [] }

  async function saveTemplate(data) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }

    var row = {
      name: data.name,
      content: data.content,
      doc_type: data.doc_type || 'custom',
      is_active: data.is_active !== false,
      trigger_status: data.trigger_status || null,
      trigger_procedures: data.trigger_procedures && data.trigger_procedures.length ? data.trigger_procedures : null,
      professional_id: data.professional_id || null,
      tracking_scripts: data.tracking_scripts || null,
      redirect_url: data.redirect_url || null,
      updated_by: _getCurrentUserEmail(),
    }

    var res
    if (data.id) {
      // Update existente
      res = await window._sbShared.from('legal_doc_templates')
        .update(row)
        .eq('id', data.id)
        .select('id')
        .single()
    } else {
      // Insert novo
      row.slug = data.slug || 'doc-' + Math.random().toString(36).substring(2, 10)
      res = await window._sbShared.from('legal_doc_templates')
        .insert(row)
        .select('id')
        .single()
    }

    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true, id: res.data ? res.data.id : null }
  }

  // ══════════════════════════════════════════════════════════
  //  REQUESTS (gerar documento para paciente)
  // ══════════════════════════════════════════════════════════

  async function createRequest(templateId, apptOrOpts) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }

    // Deduplicar: nao criar se ja existe request ativo para este appointment + template
    var apptId = apptOrOpts.appointmentId || apptOrOpts.appointment_id
    if (apptId) {
      var dupCheck = await window._sbShared.from('legal_doc_requests')
        .select('id')
        .eq('template_id', templateId)
        .eq('appointment_id', apptId)
        .not('status', 'in', '("revoked","purged")')
        .limit(1)
      if (dupCheck.data && dupCheck.data.length > 0) {
        console.log('[LegalDocs] Dedup: ja existe request para este appointment+template')
        return { ok: true, id: dupCheck.data[0].id, deduplicated: true }
      }
    }

    // Carregar template + dados clinica em paralelo
    await Promise.all([
      !_templates ? loadTemplates() : Promise.resolve(),
      _loadClinicData(),
    ])
    var tmpl = (_templates || []).find(function (t) { return t.id === templateId })
    if (!tmpl) return { ok: false, error: 'Template nao encontrado' }

    // Se template tem profissional definido, usar ele; senao, do agendamento
    if (tmpl.professional_id && !apptOrOpts.professional_id && apptOrOpts.profissionalIdx === undefined) {
      var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
      var tProf = profs.find(function (p) { return p.id === tmpl.professional_id })
      if (tProf) {
        apptOrOpts = Object.assign({}, apptOrOpts, { professional_id: tProf.id })
      }
    }

    // Construir variaveis (profissional vem do agendamento ou do template)
    var vars = buildVars(apptOrOpts)

    // Renderizar snapshot (ou usar override se fornecido)
    var snapshot = apptOrOpts._contentOverride || renderTemplate(tmpl.content, vars)

    var res = await window._sbShared.rpc('legal_doc_create_request', {
      p_template_id: templateId,
      p_patient_id: apptOrOpts.patient_id || apptOrOpts.id || null,
      p_patient_name: vars.nome,
      p_patient_cpf: vars.cpf || null,
      p_patient_phone: apptOrOpts.pacienteTelefone || apptOrOpts.patient_phone || null,
      p_appointment_id: apptOrOpts.appointmentId || apptOrOpts.appointment_id || null,
      p_professional_name: vars.profissional,
      p_professional_reg: vars.registro_profissional || null,
      p_professional_spec: vars.especialidade || null,
      p_content_snapshot: snapshot,
      p_expires_hours: 48,
    })

    if (res.error) return { ok: false, error: res.error.message }
    if (res.data && !res.data.ok) return { ok: false, error: res.data.error || 'Erro' }

    var slug = res.data.slug
    var token = res.data.token
    var fullLink = _getBaseUrl() + 'legal-document.html#slug=' + slug + '&token=' + token

    // Criar short link (sem tracking — so para encurtar)
    var link = fullLink
    try {
      var shortCode = 'tc-' + slug.replace('ld-', '')
      var slRes = await window._sbShared.from('short_links').insert({
        code: shortCode,
        url: fullLink,
        title: 'Consentimento',
        clicks: 0,
      }).select('code').single()
      if (slRes.data) {
        link = _getBaseUrl() + 'r.html?c=' + shortCode
      }
    } catch (e) { /* fallback para link completo */ }

    return { ok: true, id: res.data.id, slug: slug, token: token, link: link }
  }

  // ── Listar requests ────────────────────────────────────────
  async function listRequests(opts) {
    if (!window._sbShared) return { ok: false }
    opts = opts || {}
    var res = await window._sbShared.rpc('legal_doc_list_requests', {
      p_patient_id: opts.patient_id || null,
      p_appointment_id: opts.appointment_id || null,
      p_status: opts.status || null,
      p_limit: opts.limit || 50,
    })
    if (res.error) return { ok: false, error: res.error.message }
    if (res.data && res.data.ok) return { ok: true, data: res.data.data || [] }
    return { ok: false }
  }

  // ── Revogar ────────────────────────────────────────────────
  async function revokeRequest(id) {
    if (!window._sbShared) return { ok: false }
    var res = await window._sbShared.rpc('legal_doc_revoke', { p_id: id })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true }
  }

  // ══════════════════════════════════════════════════════════
  //  CONVENIENCE: criar e obter link em um passo
  // ══════════════════════════════════════════════════════════

  async function generateLink(templateSlugOrId, apptOrOpts) {
    if (!_templates) await loadTemplates()

    var tmpl = (_templates || []).find(function (t) {
      return t.id === templateSlugOrId || t.slug === templateSlugOrId
    })
    if (!tmpl) return { ok: false, error: 'Template "' + templateSlugOrId + '" nao encontrado' }

    return createRequest(tmpl.id, apptOrOpts)
  }

  // ══════════════════════════════════════════════════════════
  //  AUTO-SEND: gerar docs automaticamente por status/procedimento
  // ══════════════════════════════════════════════════════════

  // ── Carregar blocos de procedimentos do banco ───────────────
  var _procedureBlocks = null

  async function loadProcedureBlocks() {
    if (!window._sbShared) return []
    var res = await window._sbShared.rpc('legal_doc_list_procedure_blocks', {})
    if (res.data && res.data.ok) {
      _procedureBlocks = res.data.data || []
      return _procedureBlocks
    }
    return []
  }

  // ── Resolver quais blocos correspondem aos procedimentos ───
  function matchProcedureBlocks(procedureNames) {
    if (!_procedureBlocks || !procedureNames || !procedureNames.length) return []

    var matched = []
    procedureNames.forEach(function (name) {
      var nameLower = (typeof name === 'string' ? name : name.nome || '').toLowerCase()
      var found = _procedureBlocks.find(function (block) {
        // Match por nome exato
        if (block.procedure_name.toLowerCase() === nameLower) return true
        // Match por keywords
        if (block.procedure_keys && block.procedure_keys.length) {
          return block.procedure_keys.some(function (key) {
            return nameLower.indexOf(key.toLowerCase()) >= 0
          })
        }
        return false
      })
      if (found && matched.indexOf(found) === -1) matched.push(found)
    })
    return matched
  }

  // ── Montar HTML dos blocos empilhados ──────────────────────
  function buildStackedBlocks(blocks) {
    if (!blocks || !blocks.length) return { blocos_procedimentos: '', lista_procedimentos: '' }

    var lista = blocks.map(function (b, i) { return (i + 1) + '. ' + b.procedure_name }).join(', ')

    var html = ''
    blocks.forEach(function (block, idx) {
      if (idx > 0) html += '<hr style="margin:24px 0;border:none;border-top:1px solid #E5E7EB">'

      html += '<h3>PROCEDIMENTO ' + (idx + 1) + ': ' + block.procedure_name.toUpperCase() + '</h3>'

      if (block.finalidade) html += '<h4>Finalidade</h4><p>' + block.finalidade + '</p>'
      if (block.descricao) html += '<h4>Descricao do Procedimento</h4>' + block.descricao
      if (block.alternativas) html += '<h4>Alternativas</h4>' + block.alternativas
      if (block.beneficios) html += '<h4>Beneficios Esperados</h4>' + block.beneficios
      if (block.riscos) html += '<h4>Riscos e Complicacoes</h4>' + block.riscos
        + '<p><em>Todas essas reacoes sao geralmente transitorias e reversiveis. Comprometo-me a comunicar sintomas anormais e comparecer as consultas de evolucao.</em></p>'
      if (block.contraindicacoes) html += '<h4>Contraindicacoes</h4>' + block.contraindicacoes
      if (block.resultados) html += '<h4>Resultados e Duracao</h4>' + block.resultados
      if (block.cuidados_pre) html += '<h4>Cuidados Pre-Procedimento</h4>' + block.cuidados_pre
      if (block.cuidados_pos) html += '<h4>Cuidados Pos-Procedimento</h4>' + block.cuidados_pos
      if (block.conforto) html += '<h4>Tecnicas de Conforto</h4>' + block.conforto
    })

    return { blocos_procedimentos: html, lista_procedimentos: lista }
  }

  // ── Criar TCLE composto para multiplos procedimentos ──────
  async function createCompositeTCLE(templateSlugOrId, apptOrOpts, procedureNames) {
    if (!window._sbShared) return { ok: false, error: 'Supabase nao disponivel' }

    if (!_templates) await loadTemplates()
    if (!_procedureBlocks) await loadProcedureBlocks()

    var tmpl = (_templates || []).find(function (t) { return t.id === templateSlugOrId || t.slug === templateSlugOrId })
    if (!tmpl) return { ok: false, error: 'Template TCLE nao encontrado' }

    // Resolver blocos
    var blocks = matchProcedureBlocks(procedureNames)
    if (!blocks.length) return { ok: false, error: 'Nenhum bloco de procedimento encontrado para: ' + procedureNames.join(', ') }

    // Construir variaveis + blocos
    var vars = buildVars(apptOrOpts)
    var stacked = buildStackedBlocks(blocks)
    vars.blocos_procedimentos = stacked.blocos_procedimentos
    vars.lista_procedimentos = stacked.lista_procedimentos
    vars.procedimento = stacked.lista_procedimentos

    var snapshot = renderTemplate(tmpl.content, vars)

    return createRequest(tmpl.id, Object.assign({}, apptOrOpts, {
      procedimento: vars.procedimento,
      _contentOverride: snapshot,
    }))
  }

  // ── Verificar se paciente e Novo (nunca fez checking) ──────
  async function _isPatientNew(patientName) {
    if (!patientName || !window._sbShared) return true
    var res = await window._sbShared.from('appointments')
      .select('id')
      .ilike('patient_name', patientName.trim())
      .in('status', ['finalizado', 'em_consulta'])
      .limit(1)
    return !res.data || res.data.length === 0
  }

  // ── Verificar se paciente ja fez este procedimento antes ───
  async function _hasCompletedProcedure(patientName, procedureName) {
    if (!patientName || !procedureName || !window._sbShared) return false
    var res = await window._sbShared.from('appointments')
      .select('id')
      .ilike('patient_name', patientName.trim())
      .ilike('procedure_name', '%' + procedureName.trim() + '%')
      .in('status', ['finalizado', 'em_consulta'])
      .limit(1)
    return res.data && res.data.length > 0
  }

  async function autoSendForStatus(status, apptOrOpts) {
    if (!_templates) await loadTemplates()

    var patientName = apptOrOpts.pacienteNome || apptOrOpts.patient_name || ''
    var procedimento = (apptOrOpts.procedimento || apptOrOpts.procedure_name || '').toLowerCase()

    // Determinar se paciente e Novo ou Retorno
    var isNew = await _isPatientNew(patientName)
    // Determinar se ja fez este procedimento antes (sessao de protocolo)
    var alreadyDidProcedure = !isNew && procedimento ? await _hasCompletedProcedure(patientName, apptOrOpts.procedimento || apptOrOpts.procedure_name || '') : false

    console.log('[LegalDocs] Auto-send:', { patientName: patientName, isNew: isNew, procedimento: procedimento, alreadyDidProcedure: alreadyDidProcedure })

    var matching = (_templates || []).filter(function (t) {
      if (!t.is_active || !t.trigger_status) return false
      if (t.trigger_status !== status) return false

      var isImageDoc = t.doc_type === 'uso_imagem'

      // USO DE IMAGEM: so automatico para paciente Novo
      if (isImageDoc && !isNew) {
        console.log('[LegalDocs] Imagem bloqueado para retorno:', t.name)
        return false
      }

      // TCLE com procedimento especifico
      if (t.trigger_procedures && t.trigger_procedures.length > 0) {
        var match = t.trigger_procedures.some(function (p) { return procedimento.indexOf(p.toLowerCase()) >= 0 })
        if (!match) return false

        // Se e retorno e ja fez este procedimento -> sessao de protocolo, nao envia
        if (!isNew && alreadyDidProcedure) {
          console.log('[LegalDocs] Sessao de protocolo, bloqueado:', t.name)
          return false
        }
      }

      // TCLE generico (sem trigger_procedures) — so para Novo
      if (!isImageDoc && (!t.trigger_procedures || !t.trigger_procedures.length)) {
        if (!isNew) return false
      }

      return true
    })

    if (!matching.length) {
      console.log('[LegalDocs] Nenhum template matched')
      return []
    }

    var results = []
    for (var i = 0; i < matching.length; i++) {
      var res = await createRequest(matching[i].id, apptOrOpts)
      results.push({ template: matching[i].name, ok: res.ok, link: res.link, error: res.error })

      if (res.ok) {
        if (window._showToast) {
          _showToast('Documento', matching[i].name + ' gerado para ' + (apptOrOpts.pacienteNome || ''), 'success')
        }
        var phone = apptOrOpts.pacienteTelefone || apptOrOpts.patient_phone || ''
        if (phone && res.link) {
          _sendDocLinkWhatsApp(phone, apptOrOpts.pacienteNome || apptOrOpts.patient_name || '', matching[i].name, res.link)
        }
      }
    }
    return results
  }

  // ── Enviar link de documento via WhatsApp (via InboxService) ──
  async function _sendDocLinkWhatsApp(phone, patientName, templateName, link) {
    var digits = (phone || '').replace(/\D/g, '')
    if (!digits) return
    if (!digits.startsWith('55') || digits.length < 12) digits = '55' + digits

    var firstName = (patientName || '').split(' ')[0] || ''
    var msg = 'Ola' + (firstName ? ' ' + firstName : '') + '! '
      + 'Segue o documento "' + templateName + '" para sua assinatura digital. '
      + 'Por favor, acesse o link abaixo, confira os dados e assine:\n\n'
      + link + '\n\n'
      + 'O link expira em 48 horas. Qualquer duvida, estamos a disposicao!'

    if (window.InboxService && InboxService.sendText) {
      var r = await InboxService.sendText(digits, msg)
      if (r.ok) console.log('[LegalDocs] WhatsApp enviado para', digits)
      else console.warn('[LegalDocs] WhatsApp falhou:', r.error)
    } else {
      console.warn('[LegalDocs] InboxService nao disponivel')
    }
  }

  // ── Envio manual de link via WhatsApp ──────────────────────
  async function sendDocLink(phone, patientName, templateName, link) {
    return _sendDocLinkWhatsApp(phone, patientName, templateName, link)
  }

  // ── Envio manual de consentimento (seletor de templates) ──
  async function sendManualConsent(apptId) {
    if (!window.getAppointments || !window._sbShared) return

    var appt = getAppointments().find(function (a) { return a.id === apptId })
    if (!appt) { if (window._showToast) _showToast('Documentos', 'Agendamento n\u00e3o encontrado', 'error'); return }

    if (!_templates) await loadTemplates()
    var activeTemplates = (_templates || []).filter(function (t) { return t.is_active })
    if (!activeTemplates.length) { if (window._showToast) _showToast('Documentos', 'Nenhum modelo ativo', 'warning'); return }

    // Montar lista de opcoes
    var opts = activeTemplates.map(function (t, i) {
      var label = t.name.replace(/^TCLE\s*-\s*/i, '')
      return (i + 1) + '. ' + label
    }).join('\n')

    var choice = window.prompt('Selecione o documento para enviar:\n\n' + opts + '\n\nDigite o n\u00famero:')
    if (!choice) return

    var idx = parseInt(choice, 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= activeTemplates.length) {
      if (window._showToast) _showToast('Documentos', 'Op\u00e7\u00e3o inv\u00e1lida', 'warning')
      return
    }

    var tmpl = activeTemplates[idx]
    var apptData = {
      pacienteNome: appt.pacienteNome || appt.patient_name || '',
      pacienteCpf: appt.pacienteCpf || '',
      pacienteTelefone: appt.pacienteTelefone || appt.patient_phone || '',
      profissionalIdx: appt.profissionalIdx,
      professional_id: appt.professional_id,
      procedimento: appt.procedimento || appt.procedure_name || '',
      horaInicio: appt.horaInicio || appt.start_time || '',
      appointmentId: appt.id,
    }

    var res = await createRequest(tmpl.id, apptData)
    if (res.ok) {
      if (window._showToast) _showToast('Documentos', tmpl.name.replace(/^TCLE\s*-\s*/i, '') + ' enviado!', 'success')
      var phone = apptData.pacienteTelefone
      if (phone && res.link) {
        _sendDocLinkWhatsApp(phone, apptData.pacienteNome, tmpl.name, res.link)
      }
    } else {
      if (window._showToast) _showToast('Documentos', 'Erro: ' + (res.error || 'desconhecido'), 'error')
    }
  }

  // Expor para uso no agenda-smart
  window._sendManualConsent = sendManualConsent

  // ── Public API ─────────────────────────────────────────────
  window.LegalDocumentsService = Object.freeze({
    loadTemplates:    loadTemplates,
    getTemplates:     getTemplates,
    saveTemplate:     saveTemplate,
    createRequest:    createRequest,
    listRequests:     listRequests,
    revokeRequest:    revokeRequest,
    generateLink:     generateLink,
    autoSendForStatus:  autoSendForStatus,
    sendDocLink:      sendDocLink,
    createCompositeTCLE:  createCompositeTCLE,
    loadProcedureBlocks:  loadProcedureBlocks,
    matchProcedureBlocks: matchProcedureBlocks,
    buildStackedBlocks:   buildStackedBlocks,
    renderTemplate:   renderTemplate,
    buildVars:        buildVars,
    resolveProfessionalForProcedure: resolveProfessionalForProcedure,
  })
})()
