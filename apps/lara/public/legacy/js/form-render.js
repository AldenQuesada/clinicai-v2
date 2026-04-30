;(function () {
  'use strict'

  // ── Config (lê de window.ClinicEnv — centralizado em js/config/env.js) ─────
  const _env = window.ClinicEnv || {}
  const SUPABASE_URL = _env.SUPABASE_URL || ''
  const SUPABASE_KEY = _env.SUPABASE_KEY || ''
  const BASE_URL    = SUPABASE_URL + '/rest/v1'

  function _hdrs() {
    return {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    }
  }

  async function _get(path, qs) {
    const search = Object.entries(qs || {}).map(([k,v]) => k + '=' + encodeURIComponent(v)).join('&')
    const url    = BASE_URL + path + (search ? '?' + search : '')
    const res    = await fetch(url, { headers: _hdrs() })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function _patch(path, qs, body) {
    const search = Object.entries(qs || {}).map(([k,v]) => k + '=' + encodeURIComponent(v)).join('&')
    const url    = BASE_URL + path + (search ? '?' + search : '')
    const res    = await fetch(url, { method: 'PATCH', headers: _hdrs(), body: JSON.stringify(body) })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function _upsert(path, body, onConflict = null) {
    const url = BASE_URL + path + (onConflict ? '?on_conflict=' + onConflict : '')
    const res = await fetch(url, {
      method: 'POST',
      headers: { ..._hdrs(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function _rpc(fn, body) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: _hdrs(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    const txt = await res.text()
    if (!txt) return null
    try { return JSON.parse(txt) } catch (e) { return null }
  }

  async function _post(path, body) {
    const res = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: _hdrs(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  // ── Retry com backoff exponencial ────────────────────────────────────────────
  // Usado para operações críticas (complete_anamnesis_form) sujeitas a falhas
  // transitórias de rede. Não retenta erros permanentes (4xx sem ser 429/503).
  async function _withRetry(fn, maxAttempts, baseDelayMs, onRetry) {
    maxAttempts  = maxAttempts  || 3
    baseDelayMs  = baseDelayMs  || 1000
    let lastErr
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (e) {
        lastErr = e
        if (attempt < maxAttempts) {
          if (typeof onRetry === 'function') onRetry(attempt + 1, maxAttempts)
          const delay = baseDelayMs * Math.pow(2, attempt - 1) // 1s, 2s, 4s
          await new Promise(function(r) { setTimeout(r, delay) })
        }
      }
    }
    throw lastErr
  }

  // ── _ensureResponse ──────────────────────────────────────────────────────────
  async function _ensureResponse(reqId, patId, tplId, clinId) {
    try {
      const existing = await _get('/anamnesis_responses', {
        'request_id': 'eq.' + reqId,
        'select':     'id,status',
      })
      if (existing && existing.length) return { id: existing[0].id, existed: true }

      const rows = await _upsert('/anamnesis_responses', [{
        request_id:  reqId,
        clinic_id:   clinId,
        patient_id:  patId,
        template_id: tplId,
        status:      'not_started',
        started_at:  new Date().toISOString(),
      }], 'request_id')
      const newId = (rows && rows[0] && rows[0].id) || null
      if (!newId) throw new Error('Response criada mas ID não retornado pelo servidor.')
      return { id: newId, existed: false }
    } catch (e) {
      console.error('[ClinicAI] Falha ao criar/recuperar anamnesis_response:', e.message)
      throw e
    }
  }

  // ── _saveSessionAnswers ─────────────────────────────────────────────────────
  var _formCompleted = false
  async function _saveSessionAnswers(sessId) {
    if (!responseId || IS_TEST || _formCompleted) return
    try {
      const fields = sessId === GENERAL_SESSION_ID ? [] : (fieldsBySess[sessId] || [])
      if (!fields.length) return

      const answersPayload = []
      for (const f of fields) {
        const raw = values[f.field_key]
        if (raw === undefined || raw === null || raw === '') continue

        const _NON_INPUT_TYPES = ['section_title', 'label', 'description_text', 'image_pair']
        if (_NON_INPUT_TYPES.includes(f.field_type)) continue

        let normalizedText = ''
        if (f.field_key === 'cpf' || f.field_key === '__gd_cpf' ||
            f.field_key === 'rg'  || f.field_key === '__gd_rg') {
          normalizedText = '[REDACTED]'
        } else if (f.field_type === 'rich_text') {
          normalizedText = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        } else if (Array.isArray(raw))        normalizedText = raw.join(', ')
        else if (typeof raw === 'object') normalizedText = JSON.stringify(raw)
        else                              normalizedText = String(raw)

        // Redatar PII (CPF/RG) tambem no value_json
        var isPII = f.field_key === 'cpf' || f.field_key === '__gd_cpf' || f.field_key === 'rg' || f.field_key === '__gd_rg'
        answersPayload.push({
          response_id:     responseId,
          clinic_id:       clinicId,
          field_id:        f.id,
          field_key:       f.field_key,
          value_json:      isPII ? '[REDACTED]' : (Array.isArray(raw) ? raw : (typeof raw === 'object' ? raw : String(raw))),
          normalized_text: normalizedText.slice(0, 1000),
        })
      }

      if (answersPayload.length) {
        await _upsert('/anamnesis_answers', answersPayload, 'response_id,field_id')
      }

      const allFields   = Object.values(fieldsBySess).flat().filter(f => checkCondition(f))
      const totalCount  = allFields.length
      const filledCount = allFields.filter(f => {
        const v = values[f.field_key]
        return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
      }).length
      const progressPct = totalCount > 0 ? Math.min(100, Math.round((filledCount / totalCount) * 100)) : 0

      await _patch('/anamnesis_responses',
        { 'id': 'eq.' + responseId },
        {
          status:             'in_progress',
          current_session_id: (sessId && sessId !== GENERAL_SESSION_ID) ? sessId : null,
          progress_percent:   progressPct,
        }
      )
    } catch (e) {
      console.warn('[ClinicAI] Erro ao salvar respostas da sessão:', e.message)
      throw e
    }
  }

  // ── Indicador de status de save ─────────────────────────────────────────────
  let _saveStatusTimer = null
  function _setSaveStatus(state) {
    const el = document.getElementById('save-status')
    if (!el) return
    clearTimeout(_saveStatusTimer)

    const icons = {
      saving: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin-slow"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
      saved:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      error:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    }
    const labels = { saving: 'Salvando...', saved: 'Salvo', error: 'Erro ao salvar' }
    const colors = { saving: '#6B7280', saved: '#10B981', error: '#EF4444' }

    if (state === 'idle') { el.style.opacity = '0'; return }

    el.style.color   = colors[state]
    el.style.opacity = '1'
    el.innerHTML     = `${icons[state] || ''}<span>${labels[state] || ''}</span>`

    if (state === 'saved') {
      _saveStatusTimer = setTimeout(function() { el.style.opacity = '0' }, 3000)
    }
  }

  // ── Auto-save com debounce 1.5s ─────────────────────────────────────────────
  function _triggerAutoSave() {
    if (!responseId || IS_TEST) return
    clearTimeout(_autoSaveTimer)
    _setSaveStatus('saving')
    _autoSaveTimer = setTimeout(async function() {
      const sess = sessions[currentIdx]
      if (!sess || sess._isGeneral) { _setSaveStatus('idle'); return }
      try {
        await _saveSessionAnswers(sess.id)
        _setSaveStatus('saved')
      } catch (_) {
        _setSaveStatus('error')
      }
    }, 1500)
  }

  // ── Flush pendente ao fechar a aba ──────────────────────────────────────────
  window.addEventListener('beforeunload', function() {
    if (!responseId || IS_TEST) return
    const sess = sessions[currentIdx]
    if (!sess || sess._isGeneral) return
    try {
      sessionStorage.setItem(
        'anm_unsaved_' + responseId,
        JSON.stringify({ sessId: sess.id, payload: values, ts: Date.now() })
      )
    } catch (_) {}
  })

  // ── Restore de respostas salvas ─────────────────────────────────────────────
  async function _restoreAnswers(respId) {
    if (!respId || IS_TEST) return
    try {
      const saved = await _get('/anamnesis_answers', {
        'response_id': 'eq.' + respId,
        'select':      'field_key,value_json',
      })
      if (saved && saved.length) {
        for (const a of saved) {
          if (!a.field_key || a.value_json === undefined || a.value_json === null) continue
          const raw = a.value_json
          values[a.field_key] = Array.isArray(raw) ? raw
            : (typeof raw === 'object' && raw !== null) ? raw
            : String(raw)
        }
      }
    } catch (e) {
      console.warn('[ClinicAI] Não foi possível restaurar respostas anteriores:', e.message)
    }

    try {
      const bkpKey = 'anm_unsaved_' + respId
      const bkp    = sessionStorage.getItem(bkpKey)
      if (bkp) {
        const { payload, ts } = JSON.parse(bkp)
        if (ts && Date.now() - ts < 30 * 60 * 1000 && payload) {
          for (const k of Object.keys(payload)) { values[k] = payload[k] }
        }
        sessionStorage.removeItem(bkpKey)
      }
    } catch (_) {}
  }

  // ── URL params ──────────────────────────────────────────────────────────────
  const params   = new URLSearchParams(location.search)
  let   TMPL_ID  = params.get('id')
  const IS_TEST  = params.get('mode') === 'test'
  const SLUG     = params.get('slug')
  // Token lido APENAS do fragment (#token=) — nunca do query string (previne vazamento em logs/Referer).
  // Fallback: sessionStorage (mesma aba, nao persiste entre sessoes).
  var _rawToken = new URLSearchParams(location.hash.substring(1)).get('token')
  if (!_rawToken && SLUG) {
    try { _rawToken = sessionStorage.getItem('anm_token_' + SLUG) } catch(e) {}
  }
  if (_rawToken && SLUG) {
    try { sessionStorage.setItem('anm_token_' + SLUG, _rawToken) } catch(e) {}
    // Limpar fragment do URL para nao ficar visivel no historico
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  }
  const TOKEN = _rawToken

  // ── State ───────────────────────────────────────────────────────────────────
  let sessions      = []
  let fieldsBySess  = {}
  let optsByField   = {}
  let currentIdx    = 0
  let values        = {}
  let patientData   = null
  let requestId     = null
  let patientId     = null
  let responseId    = null
  let clinicId      = null
  let fieldKeyToId  = {}
  let _autoSaveTimer = null

  function _getTplSettings(tplId) {
    try { return JSON.parse(localStorage.getItem('anm_tpl_settings') || '{}')[tplId] || {} } catch(_) { return {} }
  }

  const GENERAL_SESSION_ID = '__GENERAL_DATA__'

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s != null ? s : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')
  }

  function showStateScreen(type, title, body) {
    document.getElementById('state-screen').style.display = 'flex'
    document.getElementById('form-view').style.display    = 'none'
    const icons = {
      loading: `<svg class="spinner" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
      error:   `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      success: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    }
    document.getElementById('state-screen').innerHTML = `
      <div class="state-box">
        <div class="state-icon ${esc(type)}">${icons[type] || ''}</div>
        <div class="state-title">${esc(title)}</div>
        <div class="state-body">${esc(body)}</div>
      </div>`
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  async function boot() {
    try {
      if (SLUG) { await bootPatientLink(); return }
      if (!TMPL_ID) {
        showStateScreen('error', 'Link inválido', 'Nenhum formulário especificado. Verifique o link e tente novamente.')
        return
      }
      await bootWithTemplate(TMPL_ID, null, null)
    } catch (err) {
      console.error('[ClinicAI] Erro no boot:', err.message)
      showStateScreen('error', 'Erro ao carregar', 'Não foi possível carregar o formulário. Verifique sua conexão e tente novamente.')
    }
  }

  // ── Boot via link do paciente ────────────────────────────────────────────────
  async function bootPatientLink() {
    if (!TOKEN) {
      showStateScreen('error', 'Link inválido', 'Token de acesso ausente. Verifique o link e tente novamente.')
      return
    }

    let req
    try {
      const rows = await _rpc('validate_anamnesis_token', {
        p_public_slug: SLUG,
        p_raw_token:   TOKEN,
      })
      req = Array.isArray(rows) ? rows[0] : rows
    } catch (_) {
      req = null
    }

    if (!req) {
      showStateScreen('error', 'Link inválido', 'Este link não existe ou o token é inválido. Verifique o link e tente novamente.')
      return
    }

    // error_code granular (P2 + Sprint Final)
    if (req.error_code === 'rate_limited') {
      showStateScreen('error', 'Muitas tentativas', 'Você fez muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.')
      return
    }
    if (req.error_code === 'revoked') {
      showStateScreen('error', 'Link revogado', 'Este link foi cancelado pela clínica. Solicite um novo link.')
      return
    }
    if (req.error_code === 'expired' || (req.expires_at && new Date(req.expires_at) < new Date())) {
      showStateScreen('error', 'Link expirado', 'Este link de acesso expirou. Solicite um novo link à clínica.')
      return
    }
    if (req.error_code === 'completed') {
      showStateScreen('success', 'Formulário já enviado', 'Você já preencheu este formulário. Obrigado!')
      return
    }
    // Fallback para status legado (requests antes do P2)
    if (['revoked', 'cancelled'].includes(req.status)) {
      showStateScreen('error', 'Link revogado', 'Este link foi cancelado. Solicite um novo link à clínica.')
      return
    }

    requestId = req.request_id
    patientId = req.patient_id
    TMPL_ID   = req.template_id
    clinicId  = req.clinic_id

    // Dados do paciente vem enriquecidos da RPC validate_anamnesis_token
    // (patient_name, patient_phone, patient_data com CPF, sexo, endereco, etc.)
    var enrichedData = req.patient_data || {}
    patientData = {
      id:             patientId,
      nome:           req.patient_name || enrichedData.nome || '',
      telefone:       req.patient_phone || enrichedData.telefone || '',
      sexo:           enrichedData.sexo || '',
      cpf:            enrichedData.cpf || '',
      rg:             enrichedData.rg || '',
      dataNascimento: enrichedData.data_nascimento || enrichedData.dataNascimento || '',
      endereco:       _parseEndereco(enrichedData.endereco) || {},
      leadId:         patientId,
    }

    const ensureResult = await _ensureResponse(requestId, patientId, TMPL_ID, clinicId)
    responseId = ensureResult.id
    if (ensureResult.existed && responseId) {
      await _restoreAnswers(responseId)
    }

    if (['sent', 'draft'].includes(req.status)) {
      _rpc('mark_anamnesis_request_opened', {
        p_request_id: requestId,
        p_ip_address: null,
        p_user_agent: navigator.userAgent || null,
      }).catch(function(e) { console.warn("[form-render]", e.message || e) })
    }

    await bootWithTemplate(TMPL_ID, patientData, null, req.template_snapshot_json || null)
  }

  // ── Boot com template ────────────────────────────────────────────────────────
  async function bootWithTemplate(tplId, pData, tplSettingsOverride, snapshot) {
    snapshot = snapshot || null
    let hasGeneralSession
    let tplName = 'Anamnese'

    // ── Branch A: usa snapshot congelado ────────────────────────────────────
    if (snapshot && snapshot.sessions && snapshot.sessions.length) {
      tplName = snapshot.template_name || 'Anamnese'
      const localSettings = _getTplSettings(tplId)
      hasGeneralSession = IS_TEST
        ? true
        : (snapshot.has_general_session != null
            ? snapshot.has_general_session
            : (tplSettingsOverride && tplSettingsOverride.has_general_session != null
                ? tplSettingsOverride.has_general_session
                : (localSettings.has_general_session || false)))

      sessions = snapshot.sessions.map(function(s) {
        return { id: s.id, title: s.title, name: s.title, order_index: s.order_index }
      })
      sessions.forEach(function(s) { fieldsBySess[s.id] = [] })
      snapshot.sessions.forEach(function(s) {
        ;(s.fields || []).forEach(function(f) {
          fieldsBySess[s.id].push(f)
          fieldKeyToId[f.field_key] = f.id
          if (f.options && f.options.length) optsByField[f.id] = f.options
        })
      })
    } else {
    // ── Branch B: busca template vivo ────────────────────────────────────────
    // Busca has_general_session do DB (coluna canônica). Fallback pra
    // snapshot parcial → tplSettingsOverride → localStorage admin → default true.
    const tplRows = await _get('/anamnesis_templates', { 'id': 'eq.' + tplId, 'select': 'id,name,has_general_session' })
    if (!tplRows || !tplRows.length) {
      showStateScreen('error', 'Formulário não encontrado', 'Este link pode ter expirado ou o formulário não existe.')
      return
    }
    tplName = (tplRows[0] && tplRows[0].name) || 'Anamnese'

    const localSettings  = _getTplSettings(tplId)
    const tplSettingsObj = tplSettingsOverride || {}
    const dbHasGeneral = (tplRows[0] && tplRows[0].has_general_session != null) ? tplRows[0].has_general_session : null
    hasGeneralSession = IS_TEST
      ? true
      : (dbHasGeneral != null
          ? dbHasGeneral
          : ((snapshot && snapshot.has_general_session != null)
              ? snapshot.has_general_session
              : (tplSettingsObj.has_general_session != null
                  ? tplSettingsObj.has_general_session
                  : (localSettings.has_general_session != null ? localSettings.has_general_session : true))))

    const sessRows = await _get('/anamnesis_template_sessions', {
      'template_id': 'eq.' + tplId,
      'is_active':   'eq.true',
      'order':       'order_index.asc',
    })
    sessions = sessRows || []
    } // fim Branch B

    if (IS_TEST && !pData) {
      pData = {
        nome: 'Maria Silva Santos', sexo: 'Feminino', cpf: '12345678900',
        telefone: '(11) 99999-8888', rg: '', dataNascimento: '', endereco: {}, leadId: null,
      }
      patientData = pData
    }

    if (hasGeneralSession && pData) {
      const virtualSession = {
        id: GENERAL_SESSION_ID, name: 'Dados Gerais',
        description: 'Confirme e complete seus dados cadastrais', _isGeneral: true,
      }
      sessions = [virtualSession].concat(sessions)
      fieldsBySess[GENERAL_SESSION_ID] = []
    }

    if (sessions.length === 0) {
      showStateScreen('error', 'Formulário vazio', 'Este formulário não possui sessões configuradas.')
      return
    }

    // So buscar fields/options do banco se NAO usou snapshot (Branch A ja carregou do snapshot)
    var usedSnapshot = !!(snapshot && snapshot.sessions && snapshot.sessions.length)
    const realSessIds = sessions.filter(function(s) { return !s._isGeneral }).map(function(s) { return s.id })
    if (realSessIds.length > 0 && !usedSnapshot) {
      const fields = await _get('/anamnesis_fields', {
        'session_id': 'in.(' + realSessIds.join(',') + ')',
        'deleted_at': 'is.null',
        'order':      'order_index.asc',
      })
      sessions.filter(function(s) { return !s._isGeneral }).forEach(function(s) { fieldsBySess[s.id] = [] })
      ;(fields || []).forEach(function(f) {
        if (fieldsBySess[f.session_id]) fieldsBySess[f.session_id].push(f)
        fieldKeyToId[f.field_key] = f.id
      })

      const selectFields = (fields || []).filter(function(f) {
        return f.field_type === 'single_select' || f.field_type === 'radio_select' || f.field_type === 'multi_select'
      })
      if (selectFields.length > 0) {
        const fids = selectFields.map(function(f) { return f.id })
        const opts = await _get('/anamnesis_field_options', {
          'field_id': 'in.(' + fids.join(',') + ')',
          'order':    'order_index.asc',
        })
        ;(opts || []).forEach(function(o) {
          if (!optsByField[o.field_id]) optsByField[o.field_id] = []
          optsByField[o.field_id].push(o)
        })
      }
    }

    if (pData) {
      if (pData.nome)      values['__gd_nome']      = pData.nome
      if (pData.sexo)      values['__gd_sexo']      = pData.sexo
      if (pData.cpf)       values['__gd_cpf']       = pData.cpf
      if (pData.telefone)  values['__gd_telefone']  = pData.telefone
      if (pData.dataNascimento) {
        values['__gd_birth_date'] = pData.dataNascimento
        values['__gd_age'] = _calcAge(pData.dataNascimento)
      }
      if (pData.rg) values['__gd_rg'] = pData.rg
      const end = pData.endereco || {}
      if (end.cep)         values['__gd_cep']         = end.cep
      if (end.logradouro)  values['__gd_logradouro']  = end.logradouro
      if (end.numero)      values['__gd_numero']      = end.numero
      if (end.complemento) values['__gd_complemento'] = end.complemento
      if (end.bairro)      values['__gd_bairro']      = end.bairro
      if (end.cidade)      values['__gd_cidade']      = end.cidade
      if (end.estado)      values['__gd_estado']      = end.estado
    }

    document.getElementById('state-screen').style.display = 'none'
    const fv = document.getElementById('form-view')
    fv.style.display = 'flex'
    document.getElementById('template-name').textContent = tplName
    document.title = tplName

    if (IS_TEST) document.getElementById('test-banner').style.display = 'block'

    currentIdx = 0
    renderSession()
  }

  // ── Máscaras e validação ─────────────────────────────────────────────────────
  function _maskCpf(v) {
    const d = v.replace(/\D/g,'').slice(0,11)
    if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/,'$1.$2.$3-$4')
    if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d+)/,'$1.$2.$3')
    if (d.length > 3) return d.replace(/(\d{3})(\d+)/,'$1.$2')
    return d
  }

  function _maskCep(v) {
    const d = v.replace(/\D/g,'').slice(0,8)
    return d.length > 5 ? d.replace(/(\d{5})(\d+)/,'$1-$2') : d
  }

  function _maskPhone(v) {
    const d = v.replace(/\D/g,'').slice(0,11)
    if (d.length > 10) return d.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3')
    if (d.length > 6)  return d.replace(/(\d{2})(\d{4})(\d+)/,'($1) $2-$3')
    if (d.length > 2)  return d.replace(/(\d{2})(\d+)/,'($1) $2')
    return d
  }

  function _maskRg(v) {
    const d = v.replace(/[^0-9xX]/gi,'').slice(0,9).toUpperCase()
    if (d.length > 8) return d.replace(/(\d{2})(\d{3})(\d{3})(\w)/,'$1.$2.$3-$4')
    if (d.length > 5) return d.replace(/(\d{2})(\d{3})(\w+)/,'$1.$2.$3')
    if (d.length > 2) return d.replace(/(\d{2})(\w+)/,'$1.$2')
    return d
  }

  function _validateCpf(cpf) {
    const d = cpf.replace(/\D/g,'')
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
    let s = 0, r
    for (let i = 0; i < 9; i++) s += +d[i] * (10-i)
    r = 11 - s%11; if (r >= 10) r = 0
    if (r !== +d[9]) return false
    s = 0
    for (let i = 0; i < 10; i++) s += +d[i] * (11-i)
    r = 11 - s%11; if (r >= 10) r = 0
    return r === +d[10]
  }

  // ── Collagen Timeline Animation + Slider ──────────────────────
  function _initCollagenField(f, container) {
    var ct = container.querySelector('[data-collagen-timeline]')
    if (!ct) return
    var faceImgs=ct.querySelectorAll('[data-face-img]'), ageLabel=ct.querySelector('[data-age-label]')
    var pctLabel=ct.querySelector('[data-collagen-pct]'), bar=ct.querySelector('[data-collagen-bar]')
    var curvePath=ct.querySelector('[data-curve-path]'), phaseText=ct.querySelector('[data-phase-text]')
    var badgesWrap=ct.querySelector('[data-badges-wrap]')
    var phases=[
      {tS:0,tE:2000,aS:18,aE:34,pS:100,pE:95,face:0,text:'Producao maxima de colageno. Pele firme e elastica.',badges:[]},
      {tS:2000,tE:4000,aS:35,aE:44,pS:95,pE:85,face:1,text:'Inicio da queda. Primeiras linhas finas aparecem. -5%',badges:['Rugas finas']},
      {tS:4000,tE:6000,aS:45,aE:54,pS:85,pE:70,face:2,text:'Perda acelerada. Rugas e flacidez se intensificam. -30%',badges:['Rugas finas','Perda de volume','Flacidez']},
      {tS:6000,tE:8000,aS:55,aE:65,pS:70,pE:50,face:3,text:'Flacidez avancada. Perda de contorno facial. -50%',badges:['Rugas finas','Perda de volume','Flacidez','Rugas profundas']},
    ]
    var pathLen=curvePath?curvePath.getTotalLength():500
    if(curvePath){curvePath.style.strokeDasharray=pathLen;curvePath.style.strokeDashoffset=pathLen}
    var startTime=null,lastP=-1,shownB={},animId=null
    function lerp(a,b,t){return a+(b-a)*t}
    function barColor(p){return p>70?'linear-gradient(90deg,#32D74B,#34D058)':p>45?'linear-gradient(90deg,#FFD60A,#FFCA28)':'linear-gradient(90deg,#FF453A,#FF6B6B)'}
    function pctColor(p){return p>70?'#32D74B':p>45?'#D97706':'#FF453A'}
    function tick(now){
      if(!startTime)startTime=now;var el=now-startTime,pr=Math.min(el/8000,1)
      var ph=null,pi=-1;for(var i=0;i<phases.length;i++){if(el>=phases[i].tS&&el<phases[i].tE){ph=phases[i];pi=i;break}}
      if(!ph&&el>=8000){ph=phases[3];pi=3}
      if(ph){
        var pp=Math.min((el-ph.tS)/(ph.tE-ph.tS),1),cp=Math.round(lerp(ph.pS,ph.pE,pp)),ca=Math.round(lerp(ph.aS,ph.aE,pp))
        if(bar){bar.style.width=cp+'%';bar.style.background=barColor(cp)}
        if(pctLabel){pctLabel.textContent=cp+'%';pctLabel.style.color=pctColor(cp)}
        if(ageLabel)ageLabel.textContent=ca+' anos'
        if(pi!==lastP){lastP=pi;faceImgs.forEach(function(img,i){img.style.opacity=i===ph.face?'1':'0'})
          if(phaseText){phaseText.style.opacity='0';setTimeout(function(){phaseText.textContent=ph.text;phaseText.style.opacity='1'},300)}
          ph.badges.forEach(function(b){if(!shownB[b]){shownB[b]=1;var el2=document.createElement('span');el2.style.cssText='padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:#FEF3C7;color:#92400E;opacity:0;transform:translateY(6px);transition:all 0.5s';el2.textContent=b;badgesWrap.appendChild(el2);setTimeout(function(){el2.style.opacity='1';el2.style.transform='translateY(0)'},50)}})
        }
      }
      if(curvePath)curvePath.style.strokeDashoffset=pathLen*(1-pr)
      if(pr<1)animId=requestAnimationFrame(tick)
      else setTimeout(function(){ct.querySelector('[data-collagen-interactive]').style.display='block'},1000)
    }
    // Start on visibility
    var obs=new IntersectionObserver(function(entries){if(entries[0].isIntersecting){obs.disconnect();requestAnimationFrame(tick)}},{threshold:0.3})
    obs.observe(ct)
    // Slider
    var slider=ct.querySelector('[data-age-slider]')
    if(slider){
      slider.addEventListener('input',function(){
        var age=parseInt(slider.value),pct=age<=25?100:age<=30?100-((age-25)*1):age<=40?95-((age-40+10)*1.5):age<=50?80-((age-40)*2):60-((age-50)*1.5)
        pct=Math.max(30,Math.round(pct))
        var disp=ct.querySelector('[data-age-display]'),imp=ct.querySelector('[data-age-impact]')
        if(disp)disp.textContent=age+' anos'
        if(imp)imp.textContent=pct>85?'Colageno em alta producao':pct>70?'Inicio da queda natural':pct>55?'Perda moderada - tratamento recomendado':'Perda significativa - intervencao indicada'
        if(bar){bar.style.width=pct+'%';bar.style.background=barColor(pct)}
        if(pctLabel){pctLabel.textContent=pct+'%';pctLabel.style.color=pctColor(pct)}
        if(ageLabel)ageLabel.textContent=age+' anos'
        var fi=age<=34?0:age<=44?1:age<=54?2:3;faceImgs.forEach(function(img,i){img.style.opacity=i===fi?'1':'0'})
        FRM.setValue(f.field_key,{idade:age,colageno_pct:pct},f.id)
      })
    }
  }

  function _parseEndereco(str) {
    if (!str) return null
    if (typeof str === 'object') return str
    // Parse "Rua X, 123, Bairro, Cidade/UF, CEP"
    var parts = str.split(',').map(function(s) { return s.trim() })
    var obj = { logradouro: parts[0] || '' }
    if (parts[1]) obj.numero = parts[1]
    if (parts[2]) obj.bairro = parts[2]
    if (parts[3]) {
      var cityState = parts[3].split('/')
      obj.cidade = (cityState[0] || '').trim()
      obj.estado = (cityState[1] || '').trim()
    }
    if (parts[4]) obj.cep = parts[4].replace(/\D/g, '')
    return obj
  }

  function _calcAge(dateStr) {
    if (!dateStr) return ''
    const b = new Date(dateStr)
    if (isNaN(b)) return ''
    const now = new Date()
    let age = now.getFullYear() - b.getFullYear()
    const m = now.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
    return age < 0 ? '' : String(age)
  }

  // ── Render session ───────────────────────────────────────────────────────────
  function renderSession() {
    const sess   = sessions[currentIdx]
    const total  = sessions.length
    const isLast = currentIdx === total - 1

    const pct = Math.round(((currentIdx + 1) / total) * 100)
    document.getElementById('progress-label').textContent = `Sessão ${currentIdx + 1} de ${total}`
    document.getElementById('progress-fill').style.width  = pct + '%'

    document.getElementById('session-title').textContent = sess.name || ''
    const descEl = document.getElementById('session-description')
    if (sess.description) {
      descEl.textContent   = sess.description
      descEl.style.display = 'block'
    } else {
      descEl.style.display = 'none'
    }

    if (sess._isGeneral) {
      document.getElementById('fields-list').innerHTML = renderGeneralDataSession()
      attachGeneralDataListeners()
    } else {
      const sFields = fieldsBySess[sess.id] || []
      console.log('[ClinicAI] renderSession:', sess.id?.substring(0,8), 'fields:', sFields.length, sFields.map(function(f){return f.field_key}).join(', '))
      document.getElementById('fields-list').innerHTML =
        sFields.map(function(f) { return renderField(f) }).filter(Boolean).join('')

      sFields.forEach(function(f) { restoreValue(f) })
      _attachFieldListeners(sFields)
    }

    const btnPrev = document.getElementById('btn-prev')
    const btnNext = document.getElementById('btn-next')
    btnPrev.style.display = currentIdx === 0 ? 'none' : 'block'
    btnNext.textContent   = isLast ? 'Enviar' : 'Próximo'

    checkNextButton()

    const mc = document.getElementById('main-content')
    if (mc) mc.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Render Sessão Dados Gerais ───────────────────────────────────────────────
  // Sem handlers inline — todos os eventos são registrados em attachGeneralDataListeners().
  function renderGeneralDataSession() {
    const pd  = patientData || {}
    const end = pd.endereco || {}

    function badge() {
      return `<span style="display:inline-flex;align-items:center;gap:3px;background:#EFF6FF;color:#3B82F6;font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;border:1px solid #BFDBFE">
        <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Do cadastro
      </span>`
    }

    function fld(label, id, val, placeholder, opts) {
      opts = opts || {}
      return `<div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          ${esc(label)}${opts.req ? ' <span class="req">*</span>' : ''}
          ${opts.badge && val ? badge() : ''}
        </div>
        <input type="text" id="${id}" class="f-input" value="${esc(val)}"
          placeholder="${esc(placeholder)}"
          ${opts.max ? `maxlength="${opts.max}"` : ''}
          ${opts.ro ? 'readonly style="background:#F9FAFB;color:#6B7280"' : ''}>
      </div>`
    }

    const birthVal = values['__gd_birth_date'] || ''
    const ageVal   = birthVal ? (_calcAge(birthVal) || '') : ''
    const sexoVal  = values['__gd_sexo'] || ''
    const ufs      = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

    return `
      ${fld('Nome Completo','gd_nome', values['__gd_nome']||'', 'Nome e sobrenome', {req:true, badge:true, badgeVal:pd.nome})}

      <div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          Sexo Biológico <span class="req">*</span>${pd.sexo ? badge() : ''}
        </div>
        <div style="display:flex;gap:10px" id="gd_sexo_wrap">
          <button type="button" class="bool-btn${sexoVal==='Masculino'?' active':''}" id="gd_sexo_M">Masculino</button>
          <button type="button" class="bool-btn${sexoVal==='Feminino'?' active':''}"  id="gd_sexo_F">Feminino</button>
        </div>
      </div>

      <div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          CPF <span class="req">*</span>${pd.cpf ? badge() : ''}
        </div>
        <input type="text" id="gd_cpf" class="f-input" value="${esc(values['__gd_cpf']||'')}"
          placeholder="000.000.000-00" maxlength="14">
        <div id="gd_cpf_hint" style="font-size:11px;color:#9CA3AF;margin-top:4px;display:none">CPF inválido</div>
      </div>

      <div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          WhatsApp <span class="req">*</span>${pd.telefone ? badge() : ''}
        </div>
        <div style="display:flex;align-items:center;gap:0">
          <div style="padding:9px 10px;background:#F3F4F6;border:1.5px solid #E5E7EB;border-right:none;border-radius:9px 0 0 9px;font-size:13px;color:#374151;font-weight:600;white-space:nowrap">
            🇧🇷 +55
          </div>
          <input type="tel" id="gd_telefone" class="f-input"
            style="border-radius:0 9px 9px 0;border-left:none"
            value="${esc(values['__gd_telefone']||'')}"
            placeholder="(00) 00000-0000" maxlength="15">
        </div>
      </div>

      <div class="field-separator">
        <div class="field-separator-line" style="background:linear-gradient(to right,transparent,#E5E7EB)"></div>
        <div class="field-separator-dot"></div>
        <div class="field-separator-line" style="background:linear-gradient(to left,transparent,#E5E7EB)"></div>
      </div>

      <div class="field-wrap">
        <div class="field-label">Data de Nascimento <span class="req">*</span></div>
        <input type="date" id="gd_birth_date" class="f-input" value="${esc(birthVal)}">
      </div>
      <div class="field-wrap">
        <div class="field-label">Idade</div>
        <div class="f-input" id="gd_age_display"
          style="background:#F9FAFB;color:#374151;border-color:#E5E7EB;pointer-events:none;user-select:none">
          ${ageVal ? ageVal + ' anos' : '—'}
        </div>
      </div>

      <div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          RG${pd.rg ? ' ' + badge() : ''}
        </div>
        <input type="text" id="gd_rg" class="f-input" value="${esc(values['__gd_rg']||'')}"
          placeholder="00.000.000-0" maxlength="12">
      </div>

      <div class="field-separator">
        <div class="field-separator-line" style="background:linear-gradient(to right,transparent,#E5E7EB)"></div>
        <div class="field-separator-dot"></div>
        <div class="field-separator-line" style="background:linear-gradient(to left,transparent,#E5E7EB)"></div>
      </div>

      <div class="field-wrap">
        <div class="field-label">País <span class="req">*</span></div>
        <input type="text" id="gd_pais" class="f-input"
          value="${esc(values['__gd_pais']||'Brasil')}"
          readonly style="background:#F9FAFB;color:#374151">
      </div>

      <div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          CEP <span class="req">*</span>${end.cep ? badge() : ''}
        </div>
        <input type="text" id="gd_cep" class="f-input" value="${esc(values['__gd_cep']||'')}"
          placeholder="00000-000" maxlength="9">
        <div id="gd_cep_hint" style="font-size:11px;color:#9CA3AF;margin-top:4px;display:none">CEP não encontrado</div>
      </div>

      <div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          Logradouro <span class="req">*</span>${end.logradouro ? badge() : ''}
        </div>
        <input type="text" id="gd_logradouro" class="f-input" value="${esc(values['__gd_logradouro']||'')}"
          placeholder="Preenchido pelo CEP">
      </div>

      <div style="display:flex;gap:10px">
        <div class="field-wrap" style="flex:0 0 30%">
          <div class="field-label">Número <span class="req">*</span></div>
          <input type="text" id="gd_numero" class="f-input" value="${esc(values['__gd_numero']||'')}"
            placeholder="Nº" maxlength="10">
        </div>
        <div class="field-wrap" style="flex:1">
          <div class="field-label">Complemento</div>
          <input type="text" id="gd_complemento" class="f-input" value="${esc(values['__gd_complemento']||'')}"
            placeholder="Apto, Bloco...">
        </div>
      </div>

      <div class="field-wrap">
        <div class="field-label" style="display:flex;align-items:center;gap:6px">
          Bairro <span class="req">*</span>${end.bairro ? badge() : ''}
        </div>
        <input type="text" id="gd_bairro" class="f-input" value="${esc(values['__gd_bairro']||'')}"
          placeholder="Preenchido pelo CEP">
      </div>

      <div style="display:flex;gap:10px">
        <div class="field-wrap" style="flex:1">
          <div class="field-label" style="display:flex;align-items:center;gap:6px">
            Cidade <span class="req">*</span>${end.cidade ? badge() : ''}
          </div>
          <input type="text" id="gd_cidade" class="f-input" value="${esc(values['__gd_cidade']||'')}"
            placeholder="Preenchido pelo CEP">
        </div>
        <div class="field-wrap" style="flex:0 0 30%">
          <div class="field-label">UF <span class="req">*</span></div>
          <select id="gd_estado" class="f-select">
            <option value="">UF</option>
            ${ufs.map(function(uf) { return `<option value="${uf}"${values['__gd_estado']===uf?' selected':''}>${uf}</option>` }).join('')}
          </select>
        </div>
      </div>`
  }

  // ── Attach event listeners — Dados Gerais ───────────────────────────────────
  // Centraliza todos os event listeners da sessão virtual, sem inline handlers.
  function attachGeneralDataListeners() {
    if (!values['__gd_pais']) values['__gd_pais'] = 'Brasil'

    const $ = function(id) { return document.getElementById(id) }

    // Nome
    const elNome = $('gd_nome')
    if (elNome) elNome.addEventListener('input', function() { FRM.setGd('__gd_nome', elNome.value) })

    // Sexo
    const elSexoM = $('gd_sexo_M')
    const elSexoF = $('gd_sexo_F')
    if (elSexoM) elSexoM.addEventListener('click', function() { FRM.setGdSexo('Masculino') })
    if (elSexoF) elSexoF.addEventListener('click', function() { FRM.setGdSexo('Feminino') })

    // CPF
    const elCpf = $('gd_cpf')
    if (elCpf) elCpf.addEventListener('input', function() { FRM.setGdCpf(elCpf.value) })

    // Telefone
    const elPhone = $('gd_telefone')
    if (elPhone) elPhone.addEventListener('input', function() { FRM.setGdPhone(elPhone.value) })

    // Data de nascimento
    const elBirth = $('gd_birth_date')
    if (elBirth) elBirth.addEventListener('change', function() { FRM.setGdBirth(elBirth.value) })

    // RG
    const elRg = $('gd_rg')
    if (elRg) elRg.addEventListener('input', function() { FRM.setGdRg(elRg.value) })

    // CEP
    const elCep = $('gd_cep')
    if (elCep) elCep.addEventListener('input', function() { FRM.setGdCep(elCep.value) })

    // Endereço (preenchidos pelo CEP, mas editáveis)
    const addrFields = [
      ['gd_logradouro', '__gd_logradouro'],
      ['gd_numero',     '__gd_numero'],
      ['gd_complemento','__gd_complemento'],
      ['gd_bairro',     '__gd_bairro'],
      ['gd_cidade',     '__gd_cidade'],
    ]
    addrFields.forEach(function(pair) {
      const el = $(pair[0])
      if (el) el.addEventListener('input', function() { FRM.setGd(pair[1], el.value) })
    })

    // Estado (select)
    const elEstado = $('gd_estado')
    if (elEstado) elEstado.addEventListener('change', function() { FRM.setGd('__gd_estado', elEstado.value) })

    checkNextButton()
  }

  // ── Conditional check ────────────────────────────────────────────────────────
  function checkCondition(f) {
    const cond = f.conditional_rules_json || {}
    if (!cond.dependsOn) return true
    const depVal = values[cond.dependsOn]
    if (cond.operator === 'equals')     return String(depVal) === String(cond.value)
    if (cond.operator === 'not_equals') return String(depVal) !== String(cond.value)
    if (cond.operator === 'includes')   return Array.isArray(depVal)
      ? depVal.includes(cond.value)
      : String(depVal != null ? depVal : '').includes(String(cond.value))
    return true
  }

  // ── Render one field — sem inline event handlers ─────────────────────────────
  // Todos os eventos são registrados por _attachFieldListeners() após innerHTML.
  function renderField(f) {
    if (!checkCondition(f)) return `<div id="field_${f.id}" style="display:none" data-field-id="${f.id}" data-field-key="${esc(f.field_key)}"></div>`

    const s    = f.settings_json || {}
    const req  = f.is_required ? '<span class="req">*</span>' : ''
    const desc = f.description  ? `<div class="field-desc">${esc(f.description)}</div>` : ''
    const label = `<div class="field-label">${esc(f.label)}${req}</div>${desc}`

    function wrap(inner, noLabel) {
      return `<div class="field-wrap" id="field_${f.id}" data-field-id="${esc(f.id)}" data-field-key="${esc(f.field_key)}">${noLabel ? '' : label}${inner}</div>`
    }

    if (f.field_type === 'section_title') {
      const align = s.align || 'left'
      const hasBg = s.background === 'light'
      const cls = ['field-section-title', align !== 'left' ? 'st-' + align : '', hasBg ? 'st-bg' : ''].filter(Boolean).join(' ')
      return `<div class="${cls}" id="field_${f.id}" data-field-id="${esc(f.id)}">${esc(f.label)}</div>`
    }

    if (f.field_type === 'description_text' && s.display === 'separator')
      return `<div class="field-separator" id="field_${f.id}" data-field-id="${esc(f.id)}">
        <div class="field-separator-line" style="background:linear-gradient(to right,transparent,#E5E7EB)"></div>
        <div class="field-separator-dot"></div>
        <div class="field-separator-line" style="background:linear-gradient(to left,transparent,#E5E7EB)"></div>
      </div>`

    if (f.field_type === 'description_text' && s.display === 'block') {
      const pos     = s.image_position || 'left'
      const isHoriz = pos === 'left' || pos === 'right'
      const flexDir = { left:'row', right:'row-reverse', top:'column', bottom:'column-reverse' }[pos] || 'row'
      const imgWrapStyle = isHoriz ? '' : 'style="width:100%;height:130px"'
      const imgHtml = s.image_url
        ? `<img src="${esc(s.image_url)}" alt="${esc(s.image_alt||'')}" style="object-fit:contain;width:100%;height:100%;display:block;border-radius:8px;background:#fff" onerror="this.parentElement.innerHTML='<div class=\\'block-image-placeholder\\'>Imagem indisponível</div>'">`
        : `<div class="block-image-placeholder"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
      return `<div class="field-desc-block" id="field_${f.id}" data-field-id="${esc(f.id)}" style="flex-direction:${flexDir}">
        <div class="block-image-wrap" ${imgWrapStyle}>${imgHtml}</div>
        <div class="block-text">
          ${s.block_title       ? `<div class="block-text-title">${esc(s.block_title)}</div>` : ''}
          ${s.block_description ? `<div class="block-text-body">${esc(s.block_description)}</div>` : ''}
        </div>
      </div>`
    }

    if (f.field_type === 'image_pair' || (f.field_type === 'description_text' && s.display === 'image_pair')) {
      const count    = s.count || 2
      const inverted = s.inverted || false
      const showRadio= s.show_radio || false
      const genTitle = s.title || ''
      const genDesc  = s.description || ''
      let   images   = (s.images && s.images.length >= count) ? s.images.slice(0, count) : Array.from({length:count},function(_,i){return (s.images && s.images[i]) || {}})
      if (inverted) images = images.slice().reverse()
      const inputId = 'finp_ig_' + f.id

      const imgCard = function(img, idx) {
        const val = String(idx)
        return `
        <div class="img-grid-card" id="igc_${f.id}_${idx}" data-val="${val}" data-action="${showRadio ? 'imgGrid' : ''}" data-key="${esc(f.field_key)}" data-fid="${esc(f.id)}">
          <div class="img-grid-img-wrap">
            ${img.url
              ? `<img src="${esc(img.url)}" alt="${esc(img.title||'')}" class="img-grid-img" onerror="this.parentElement.innerHTML='<div class=\\'img-grid-placeholder\\'>Imagem indisponível</div>'">`
              : `<div class="img-grid-placeholder"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
          </div>
          ${img.title ? `<div class="img-grid-title">${esc(img.title)}</div>` : ''}
          ${showRadio ? `<div class="img-grid-radio" id="igr_${f.id}_${idx}">
            <div class="ig-radio-circle"><div class="ig-radio-dot" style="display:none"></div></div>
            <span class="ig-radio-label">Selecionar</span>
          </div>` : ''}
        </div>`
      }

      const rows = count === 4 ? [[0,1],[2,3]] : count === 3 ? [[0,1],[2]] : [[0,1]]
      const rowsHtml = rows.map(function(row) { return `
        <div class="img-grid-row">
          ${row.map(function(i) { return imgCard(images[i] || {}, i) }).join('')}
          ${row.length === 1 ? '<div class="img-grid-card img-grid-card--spacer"></div>' : ''}
        </div>`}).join('')

      return `<div class="img-grid-wrap" id="field_${f.id}" data-field-id="${esc(f.id)}">
        ${genTitle ? `<div class="img-grid-gen-title">${esc(genTitle)}</div>` : ''}
        ${genDesc  ? `<div class="img-grid-gen-desc">${esc(genDesc)}</div>`  : ''}
        <input type="hidden" id="${inputId}" data-field-key="${esc(f.field_key)}">
        ${rowsHtml}
      </div>`
    }

    if (f.field_type === 'description_text' || f.field_type === 'label')
      return `<div style="font-size:14px;color:#6B7280;line-height:1.6" id="field_${f.id}" data-field-id="${esc(f.id)}">${esc(f.label)}</div>`

    const inputId = 'finp_' + f.id

    if (f.field_type === 'text')
      return wrap(`<input class="f-input" id="${inputId}" placeholder="${esc(f.placeholder||'')}" value="">`)

    if (f.field_type === 'textarea')
      return wrap(`<textarea class="f-textarea" id="${inputId}" placeholder="${esc(f.placeholder||'')}"></textarea>`)

    if (f.field_type === 'number' && s.display !== 'scale_select') {
      const minAttr = s.min != null ? `min="${s.min}"` : ''
      const maxAttr = s.max != null ? `max="${s.max}"` : ''
      return wrap(`<input type="number" class="f-input" id="${inputId}"
        placeholder="${esc(f.placeholder||'')}" ${minAttr} ${maxAttr} value="">`)
    }

    if (f.field_type === 'date')
      return wrap(`<input type="date" class="f-input" id="${inputId}" value="">`)

    if (f.field_type === 'boolean') {
      const yLbl = s.yes_label || 'Sim'
      const nLbl = s.no_label  || 'Não'
      return wrap(`<div class="bool-wrap" id="${inputId}">
        <button class="bool-btn" data-val="true">${esc(yLbl)}</button>
        <button class="bool-btn" data-val="false">${esc(nLbl)}</button>
      </div>`)
    }

    if (f.field_type === 'radio_select' || (f.field_type === 'multi_select' && s.display === 'radio_select')) {
      const opts = optsByField[f.id] || []
      const cur  = values[f.field_key] || ''
      const items = opts.map(function(o) {
        const checked = cur === o.value
        return `<button class="radio-opt${checked?' active':''}" data-val="${esc(o.value)}">
          <div class="radio-circle">${checked?'<div class="radio-dot"></div>':''}</div>
          <span>${esc(o.label)}</span>
        </button>`
      }).join('')
      return wrap(`<div class="radio-opts" id="${inputId}">${items || '<div style="font-size:13px;color:#9CA3AF">Sem opções</div>'}</div>`)
    }

    if (f.field_type === 'single_select' || (f.field_type === 'multi_select' && s.display === 'single_select')) {
      const opts = optsByField[f.id] || []
      const pills = opts.map(function(o) { return `
        <button class="single-opt" data-val="${esc(o.value)}">
          <div class="opt-radio"></div>
          <span>${esc(o.label)}</span>
        </button>`}).join('')
      return wrap(`<div class="single-opts" id="${inputId}">${pills || '<div style="font-size:13px;color:#9CA3AF">Sem opções</div>'}</div>`)
    }

    if (f.field_type === 'multi_select') {
      const opts   = optsByField[f.id] || []
      const sorted = opts.filter(function(o) { return o.value !== '__outros__' }).concat(opts.filter(function(o) { return o.value === '__outros__' }))
      const pills  = sorted.map(function(o) {
        const isOutros = o.value === '__outros__'
        return `
        <button class="multi-opt" data-val="${esc(o.value)}">${esc(o.label)}</button>` +
        (isOutros ? `
        <input type="text" id="outros_txt_${esc(f.id)}" class="f-input"
          placeholder="Digite quais por favor"
          style="display:none;margin-top:4px;margin-left:8px">` : '')
      }).join('')
      return wrap(`<div class="multi-opts" id="${inputId}">${pills || '<div style="font-size:13px;color:#9CA3AF">Sem opções</div>'}</div>`)
    }

    if (f.field_type === 'number' && s.display === 'scale_select') {
      const min   = Number(s.min  != null ? s.min  : 1)
      const max   = Number(s.max  != null ? s.max  : 10)
      const step  = Number(s.step != null ? s.step : 1)
      const initV = Number(values[f.field_key] != null ? values[f.field_key] : min)
      const pct   = max > min ? ((initV - min) / (max - min)) * 100 : 0
      const hue   = Math.round(120 - (pct / 100) * 120)
      const color = `hsl(${hue},72%,40%)`
      const thumbL = `calc(13px + (100% - 26px) * ${pct / 100})`
      const totalSteps = Math.round((max - min) / step)
      const ticks = totalSteps <= 20
        ? Array.from({length: totalSteps + 1}).map(function() { return '<div class="anm-scale-tick"></div>' }).join('')
        : ''
      return wrap(`
        <div class="anm-scale-wrap">
          <div class="anm-scale-value-row">
            <span class="anm-scale-num" id="scale_num_${f.id}" style="color:${color}">${initV}</span>
          </div>
          <div class="anm-scale-track-wrap">
            <div class="anm-scale-track">
              <div class="anm-scale-fill" id="scale_fill_${f.id}" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="anm-scale-thumb" id="scale_thumb_${f.id}" style="left:${thumbL};color:${color}"></div>
            <input type="range" class="anm-scale-input" id="scale_input_${f.id}"
              min="${min}" max="${max}" step="${step}" value="${initV}">
          </div>
          ${ticks ? `<div class="anm-scale-ticks">${ticks}</div>` : ''}
          <div class="anm-scale-labels">
            <span class="anm-scale-label-min">${esc(String(s.min_label || min))}</span>
            <span class="anm-scale-label-max">${esc(String(s.max_label || max))}</span>
          </div>
        </div>`, false)
    }

    // ── Collagen Timeline (special animated field) ──
    if (s.display === 'collagen_timeline' || f.field_key === 'collagen_timeline') {
      var ctImgs = [
        'https://drive.google.com/thumbnail?id=1g6nasKaKer1SVmvnyVblU26MDaDUoQnP&sz=w400',
        'https://drive.google.com/thumbnail?id=1UVVXFbhNT7YQQG5AF9TYFsDKUVyCuHoi&sz=w400',
        'https://drive.google.com/thumbnail?id=1Fff3ywU87iAwQkZxS6i7fqcOEGt-yfZ7&sz=w400',
        'https://drive.google.com/thumbnail?id=1dYZK5sOOQP30Nv_zF8iSDGexvqXcZi3v&sz=w400',
      ]
      var ctCurve = 'M 0,55 C 20,50 40,8 60,6 C 80,4 90,5 100,8 C 130,14 160,24 190,36 C 220,46 250,52 300,58'
      var ctGrid = ''; for(var gi=0;gi<4;gi++){var gy=15*gi+8;ctGrid+='<line x1="0" y1="'+gy+'" x2="300" y2="'+gy+'" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="4,4"/>'}
      var ctXL = [{x:30,l:'25'},{x:60,l:'30'},{x:130,l:'40'},{x:200,l:'50'},{x:270,l:'60'}].map(function(a){return'<text x="'+a.x+'" y="72" text-anchor="middle" fill="#9CA3AF" font-size="9">'+a.l+'</text>'}).join('')
      var ctHtml =
        '<div data-collagen-timeline style="max-width:400px;margin:12px auto;padding:20px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);background:#fff">' +
        '<div style="text-align:center;font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:16px">Evolucao do Colageno</div>' +
        '<div style="position:relative;width:180px;height:180px;margin:0 auto 16px;border-radius:50%;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12)">' +
        ctImgs.map(function(u,i){return'<img data-face-img="'+i+'" src="'+u+'" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:'+(i===0?'1':'0')+';transition:opacity 0.8s">'}).join('') +
        '<div data-age-label style="position:absolute;bottom:0;left:0;right:0;padding:6px;background:linear-gradient(transparent,rgba(0,0,0,0.6));text-align:center;color:#fff;font-size:14px;font-weight:600">25 anos</div></div>' +
        '<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:#374151">Nivel de Colageno</span><span data-collagen-pct style="font-size:13px;font-weight:700;color:#32D74B">100%</span></div>' +
        '<div style="width:100%;height:12px;border-radius:6px;background:#F3F4F6;overflow:hidden"><div data-collagen-bar style="width:100%;height:100%;border-radius:6px;background:linear-gradient(90deg,#32D74B,#34D058);transition:width 0.3s,background 0.3s"></div></div></div>' +
        '<svg data-collagen-svg viewBox="0 0 300 75" style="width:100%;height:80px;display:block">' + ctGrid +
        '<path d="'+ctCurve+'" fill="none" stroke="#E5E7EB" stroke-width="1.5"/>' +
        '<path data-curve-path d="'+ctCurve+'" fill="none" stroke="url(#cg-'+f.id+')" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="500" stroke-dashoffset="500"/>' +
        '<defs><linearGradient id="cg-'+f.id+'" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#32D74B"/><stop offset="50%" stop-color="#FFD60A"/><stop offset="100%" stop-color="#FF453A"/></linearGradient></defs>' + ctXL + '</svg>' +
        '<div data-phase-text style="text-align:center;font-size:13px;color:#4B5563;line-height:1.5;min-height:36px;margin:10px 0;font-weight:500">Producao maxima de colageno. Pele firme e elastica.</div>' +
        '<div data-badges-wrap style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;min-height:26px"></div>' +
        '<div data-collagen-interactive style="display:none;margin-top:16px;text-align:center">' +
        '<div style="font-size:16px;font-weight:700;color:#1a1a2e;margin-bottom:4px">Qual e a sua idade?</div>' +
        '<div style="font-size:12px;color:#8B8BA3;margin-bottom:12px">Arraste para ver seu nivel de colageno</div>' +
        '<input data-age-slider type="range" min="18" max="65" value="30" step="1" style="width:100%;height:14px;border-radius:7px;outline:none;-webkit-appearance:none;appearance:none;background:linear-gradient(90deg,#32D74B 0%,#FFD60A 50%,#FF453A 100%);cursor:pointer;touch-action:none">' +
        '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#9CA3AF;font-weight:600"><span>18</span><span>30</span><span>40</span><span>50</span><span>65</span></div>' +
        '<div data-age-display style="margin-top:10px;font-size:28px;font-weight:800;color:#1a1a2e">30 anos</div>' +
        '<div data-age-impact style="font-size:13px;color:#4B5563;margin-top:4px;font-weight:500">Colageno em alta producao</div>' +
        '</div></div>'

      // Inject slider CSS
      if (!document.getElementById('ct-slider-css')) {
        var sty = document.createElement('style'); sty.id = 'ct-slider-css'
        sty.textContent = '[data-age-slider]::-webkit-slider-thumb{-webkit-appearance:none;width:36px;height:36px;border-radius:50%;background:#fff;border:3px solid #5B6CFF;box-shadow:0 3px 12px rgba(91,108,255,0.4);cursor:pointer;margin-top:-11px}[data-age-slider]::-moz-range-thumb{width:32px;height:32px;border-radius:50%;background:#fff;border:3px solid #5B6CFF;cursor:pointer}'
        document.head.appendChild(sty)
      }

      return wrap(ctHtml)
    }

    if (f.field_type === 'file_upload' || f.field_type === 'image_upload') {
      const accept = s.accept || (f.field_type === 'image_upload' ? 'image/*' : '')
      return wrap(`<input type="file" class="f-file" id="${inputId}" accept="${esc(accept)}">`)
    }

    // fallback
    return wrap(`<input class="f-input" id="${inputId}" placeholder="${esc(f.placeholder||'')}" value="">`)
  }

  // ── Attach field event listeners — substitui inline handlers ────────────────
  // Chamado imediatamente após renderField() → innerHTML é setado no DOM.
  // Também chamado por reEvalConditionals() após re-render de um campo.
  function _attachFieldListeners(fields) {
    fields.forEach(function(f) {
      const s = f.settings_json || {}

      // Escala numérica (range input tem ID diferente)
      if (f.field_type === 'number' && s.display === 'scale_select') {
        const scaleInp = document.getElementById('scale_input_' + f.id)
        if (scaleInp) {
          const min = Number(s.min != null ? s.min : 1)
          const max = Number(s.max != null ? s.max : 10)
          scaleInp.addEventListener('input',  function() { updateScale(f, scaleInp, min, max) })
          scaleInp.addEventListener('change', function() { updateScale(f, scaleInp, min, max) })
        }
        return
      }

      const inp = document.getElementById('finp_' + f.id)
      if (!inp) return

      if (f.field_type === 'text' || f.field_type === 'textarea' || f.field_type === 'rich_text') {
        inp.addEventListener('input', function() { FRM.setValue(f.field_key, inp.value, f.id) })

      } else if (f.field_type === 'number') {
        inp.addEventListener('input', function() { FRM.setValue(f.field_key, inp.value, f.id) })

      } else if (f.field_type === 'date') {
        inp.addEventListener('change', function() { FRM.setValue(f.field_key, inp.value, f.id) })

      } else if (f.field_type === 'boolean') {
        inp.querySelectorAll('.bool-btn').forEach(function(btn) {
          btn.addEventListener('click', function() { FRM.setBool(f.field_key, btn.dataset.val, f.id) })
        })

      } else if (f.field_type === 'radio_select' || (f.field_type === 'multi_select' && s.display === 'radio_select')) {
        inp.querySelectorAll('.radio-opt').forEach(function(btn) {
          btn.addEventListener('click', function() { FRM.setSingle(f.field_key, btn.dataset.val, f.id) })
        })

      } else if (f.field_type === 'single_select' || (f.field_type === 'multi_select' && s.display === 'single_select')) {
        inp.querySelectorAll('.single-opt').forEach(function(btn) {
          btn.addEventListener('click', function() { FRM.setSingle(f.field_key, btn.dataset.val, f.id) })
        })

      } else if (f.field_type === 'multi_select') {
        inp.querySelectorAll('.multi-opt').forEach(function(btn) {
          btn.addEventListener('click', function() { FRM.toggleMulti(f.field_key, btn.dataset.val, f.id) })
        })
        const outrosTxt = document.getElementById('outros_txt_' + f.id)
        if (outrosTxt) {
          outrosTxt.addEventListener('input', function() {
            FRM.setOutrosText(f.field_key, f.id, outrosTxt.value)
            outrosTxt.classList.remove('error')
            const errEl = outrosTxt.nextElementSibling
            if (errEl && errEl.classList.contains('field-error')) errEl.remove()
          })
        }

      } else if (f.field_type === 'image_pair' || (f.field_type === 'description_text' && s.display === 'image_pair')) {
        if (s.show_radio) {
          const count = s.count || 2
          for (let i = 0; i < count; i++) {
            ;(function(idx) {
              const card = document.getElementById('igc_' + f.id + '_' + idx)
              if (card) card.addEventListener('click', function() { FRM.setImgGrid(f.field_key, String(idx), f.id) })
            })(i)
          }
        }

      } else if (f.settings_json?.display === 'collagen_timeline' || f.field_key === 'collagen_timeline') {
        _initCollagenField(f, inp)

      } else if (f.field_type === 'file_upload' || f.field_type === 'image_upload') {
        inp.addEventListener('change', function() { _handleFileUpload(f, inp) })

      } else {
        // fallback: input genérico
        inp.addEventListener('input', function() { FRM.setValue(f.field_key, inp.value, f.id) })
      }
    })
  }

  // ── File upload handler ─────────────────────────────────────────────────────
  async function _handleFileUpload(f, inputEl) {
    var file = inputEl.files && inputEl.files[0]
    if (!file) return

    var maxSize = f.field_type === 'image_upload' ? 10 * 1024 * 1024 : 25 * 1024 * 1024 // 10MB images, 25MB files
    if (file.size > maxSize) {
      _toastWarn('Arquivo muito grande. Maximo: ' + (maxSize / 1024 / 1024) + 'MB')
      inputEl.value = ''
      return
    }

    // Show uploading state
    var wrapper = inputEl.closest('.f-field')
    var preview = wrapper ? wrapper.querySelector('.f-upload-preview') : null
    if (!preview) {
      preview = document.createElement('div')
      preview.className = 'f-upload-preview'
      preview.style.cssText = 'margin-top:8px;font-size:12px;color:#6B7280'
      if (wrapper) wrapper.appendChild(preview)
    }
    preview.innerHTML = '<div style="color:#7C3AED;font-weight:600">Enviando...</div>'

    try {
      var ext = file.name.split('.').pop() || 'bin'
      var path = 'anamnese/' + (responseId || 'tmp') + '/' + f.field_key + '_' + Date.now() + '.' + ext

      var sb = window._anamneseSb || (window.supabase ? window.supabase.createClient(
        window.ClinicEnv?.SUPABASE_URL || 'https://oqboitkpcvuaudouwvkl.supabase.co',
        window.ClinicEnv?.SUPABASE_KEY || ''
      ) : null)

      if (!sb) {
        // Fallback: store as base64 in value_json
        var reader = new FileReader()
        reader.onload = function() {
          FRM.setValue(f.field_key, { name: file.name, size: file.size, type: file.type, data: reader.result }, f.id)
          preview.innerHTML = _renderUploadPreview(f.field_type, file.name, reader.result)
        }
        reader.readAsDataURL(file)
        return
      }

      var { data, error } = await sb.storage.from('uploads').upload(path, file, { upsert: true })
      if (error) throw error

      var publicUrl = sb.storage.from('uploads').getPublicUrl(path).data.publicUrl
      FRM.setValue(f.field_key, { name: file.name, url: publicUrl, size: file.size, type: file.type }, f.id)
      preview.innerHTML = _renderUploadPreview(f.field_type, file.name, publicUrl)
    } catch(e) {
      console.error('[Anamnese] Upload falhou:', e)
      preview.innerHTML = '<div style="color:#DC2626;font-weight:600">Erro no upload. Tente novamente.</div>'
    }
  }

  function _renderUploadPreview(fieldType, name, src) {
    if (fieldType === 'image_upload' && src) {
      return '<div style="margin-top:4px"><img src="' + src + '" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid #E5E7EB" alt="' + (name||'') + '"><div style="font-size:11px;color:#10B981;font-weight:600;margin-top:4px">Enviado: ' + (name||'') + '</div></div>'
    }
    return '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;padding:8px;background:#F0FDF4;border-radius:6px;border:1px solid #BBF7D0"><svg width="14" height="14" fill="none" stroke="#10B981" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span style="font-size:12px;color:#065F46;font-weight:600">' + (name||'Arquivo') + '</span></div>'
  }

  // ── Restore value into DOM ───────────────────────────────────────────────────
  function restoreValue(f) {
    const s   = f.settings_json || {}
    const val = values[f.field_key]
    if (val === undefined) return
    const inputId = 'finp_' + f.id

    if (f.field_type === 'text' || f.field_type === 'textarea') {
      const el = document.getElementById(inputId); if (el) el.value = val
    }
    if (f.field_type === 'number' && s.display !== 'scale_select') {
      const el = document.getElementById(inputId); if (el) el.value = val
    }
    if (f.field_type === 'date') {
      const el = document.getElementById(inputId); if (el) el.value = val
    }
    if (f.field_type === 'boolean') {
      const wrap = document.getElementById(inputId)
      if (wrap) wrap.querySelectorAll('.bool-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.val === String(val))
      })
    }
    if (f.field_type === 'radio_select' || (f.field_type === 'multi_select' && f.settings_json && f.settings_json.display === 'radio_select')) {
      const wrap = document.getElementById(inputId)
      if (wrap) wrap.querySelectorAll('.radio-opt').forEach(function(btn) {
        const active = btn.dataset.val === String(val)
        btn.classList.toggle('active', active)
        const dot = btn.querySelector('.radio-dot')
        if (active && !dot) {
          const circle = btn.querySelector('.radio-circle')
          if (circle) circle.innerHTML = '<div class="radio-dot"></div>'
        } else if (!active && dot) { dot.remove() }
      })
    }
    if (f.field_type === 'single_select' || (f.field_type === 'multi_select' && f.settings_json && f.settings_json.display === 'single_select')) {
      const wrap = document.getElementById(inputId)
      if (wrap) wrap.querySelectorAll('.single-opt').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.val === String(val))
      })
    }
    if (f.field_type === 'multi_select') {
      const wrap = document.getElementById(inputId)
      if (wrap && Array.isArray(val)) wrap.querySelectorAll('.multi-opt').forEach(function(btn) {
        btn.classList.toggle('active', val.includes(btn.dataset.val))
      })
      const outrosEl = document.getElementById('outros_txt_' + f.id)
      if (outrosEl) {
        const hasOutros = Array.isArray(val) && val.includes('__outros__')
        outrosEl.style.display = hasOutros ? 'block' : 'none'
        if (hasOutros && values[f.field_key + '__outros_texto']) outrosEl.value = values[f.field_key + '__outros_texto']
      }
    }
    if (f.field_type === 'number' && s.display === 'scale_select') {
      const min = Number(s.min != null ? s.min : 1)
      const max = Number(s.max != null ? s.max : 10)
      const inp = document.getElementById('scale_input_' + f.id)
      if (inp) { inp.value = val; updateScale(f, inp, min, max) }
    }
  }

  // ── Update scale visuals ─────────────────────────────────────────────────────
  function updateScale(f, inp, min, max) {
    const v   = Number(inp.value)
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0
    const hue = Math.round(120 - (pct / 100) * 120)
    const color = `hsl(${hue},72%,40%)`
    const thumbL = `calc(13px + (100% - 26px) * ${pct / 100})`
    const numEl  = document.getElementById('scale_num_'   + f.id)
    const fillEl = document.getElementById('scale_fill_'  + f.id)
    const thumbEl= document.getElementById('scale_thumb_' + f.id)
    if (numEl)   { numEl.textContent = v; numEl.style.color = color }
    if (fillEl)  { fillEl.style.width = pct + '%'; fillEl.style.background = color }
    if (thumbEl) { thumbEl.style.left = thumbL; thumbEl.style.color = color }
    values[f.field_key] = v
    checkNextButton()
  }

  // ── Check next button ────────────────────────────────────────────────────────
  function checkNextButton() {
    const btn = document.getElementById('btn-next')
    if (!btn) return
    const sess = sessions[currentIdx]
    let allFilled = true

    if (sess._isGeneral) {
      const req = [
        '__gd_nome','__gd_sexo','__gd_birth_date',
        '__gd_cpf','__gd_telefone',
        '__gd_cep','__gd_logradouro','__gd_numero','__gd_bairro','__gd_cidade','__gd_estado','__gd_pais',
      ]
      allFilled = req.every(function(k) { const v = values[k]; return v && String(v).trim() })
      if (allFilled && values['__gd_cpf']) allFilled = _validateCpf(values['__gd_cpf'])
      if (allFilled && values['__gd_telefone']) allFilled = values['__gd_telefone'].replace(/\D/g,'').length >= 10
    } else {
      const sFields = fieldsBySess[sess.id] || []
      for (let i = 0; i < sFields.length; i++) {
        const f = sFields[i]
        if (!f.is_required) continue
        if (!checkCondition(f)) continue
        const val = values[f.field_key]
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          allFilled = false; break
        }
      }
      if (allFilled) {
        for (let i = 0; i < sFields.length; i++) {
          const f = sFields[i]
          if (!checkCondition(f)) continue
          const val = values[f.field_key]
          if (Array.isArray(val) && val.includes('__outros__')) {
            const txt = (values[f.field_key + '__outros_texto'] || '').trim()
            if (!txt) { allFilled = false; break }
          }
        }
      }
    }

    btn.classList.toggle('btn-locked', !allFilled)
  }

  // ── Validate current session ─────────────────────────────────────────────────
  function validateSession() {
    const sess = sessions[currentIdx]

    if (sess._isGeneral) {
      let ok = true
      document.querySelectorAll('[id^="gd_err_"]').forEach(function(e) { e.remove() })
      document.querySelectorAll('#gd_nome,#gd_birth_date,#gd_cpf,#gd_telefone,#gd_cep,#gd_logradouro,#gd_numero,#gd_bairro,#gd_cidade').forEach(function(e) { e.classList.remove('error') })

      function gdErr(inputId, msg) {
        ok = false
        const inp = document.getElementById(inputId)
        if (!inp) return
        inp.classList.add('error')
        const d = document.createElement('div')
        d.id = 'gd_err_' + inputId; d.className = 'field-error'; d.textContent = msg
        inp.parentNode.appendChild(d)
      }

      const txtRequired = [
        { id:'gd_nome',       key:'__gd_nome',        msg:'Nome obrigatório' },
        { id:'gd_birth_date', key:'__gd_birth_date',  msg:'Data de nascimento obrigatória' },
        { id:'gd_cpf',        key:'__gd_cpf',         msg:'CPF obrigatório' },
        { id:'gd_telefone',   key:'__gd_telefone',    msg:'WhatsApp obrigatório' },
        { id:'gd_cep',        key:'__gd_cep',         msg:'CEP obrigatório' },
        { id:'gd_logradouro', key:'__gd_logradouro',  msg:'Logradouro obrigatório' },
        { id:'gd_numero',     key:'__gd_numero',      msg:'Número obrigatório' },
        { id:'gd_bairro',     key:'__gd_bairro',      msg:'Bairro obrigatório' },
        { id:'gd_cidade',     key:'__gd_cidade',      msg:'Cidade obrigatória' },
      ]
      txtRequired.forEach(function(r) {
        const v = values[r.key]
        if (!v || !String(v).trim()) gdErr(r.id, r.msg)
      })

      if (!values['__gd_sexo']) {
        ok = false
        const wrap = document.getElementById('gd_sexo_wrap')
        if (wrap && !document.getElementById('gd_err_sexo')) {
          const d = document.createElement('div')
          d.id = 'gd_err_sexo'; d.className = 'field-error'; d.textContent = 'Selecione o sexo'
          wrap.parentNode.appendChild(d)
        }
      }

      if (!values['__gd_estado']) {
        ok = false
        const sel = document.getElementById('gd_estado')
        if (sel && !document.getElementById('gd_err_estado')) {
          sel.classList.add('error')
          const d = document.createElement('div')
          d.id = 'gd_err_estado'; d.className = 'field-error'; d.textContent = 'Estado obrigatório'
          sel.parentNode.appendChild(d)
        }
      }

      if (values['__gd_cpf'] && values['__gd_cpf'].replace(/\D/g,'').length === 11 && !_validateCpf(values['__gd_cpf'])) {
        gdErr('gd_cpf', 'CPF inválido — verifique os dígitos')
      }

      if (values['__gd_telefone'] && values['__gd_telefone'].replace(/\D/g,'').length < 10) {
        gdErr('gd_telefone', 'Número de WhatsApp incompleto')
      }

      if (!ok) {
        const firstErr = document.querySelector('.field-error')
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return ok
    }

    const sFields = fieldsBySess[sess.id] || []
    let ok = true

    sFields.forEach(function(f) {
      if (!checkCondition(f)) return
      const val    = values[f.field_key]
      const fieldEl= document.getElementById('field_' + f.id)
      if (!fieldEl) return

      fieldEl.querySelectorAll('.field-error').forEach(function(e) { e.remove() })
      fieldEl.querySelectorAll('.f-input,.f-textarea,.f-select,.f-file').forEach(function(e) { e.classList.remove('error') })

      if (f.is_required) {
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)
        if (isEmpty) {
          ok = false
          fieldEl.querySelectorAll('.f-input,.f-textarea,.f-select,.f-file').forEach(function(e) { e.classList.add('error') })
          const errDiv = document.createElement('div')
          errDiv.className   = 'field-error'
          errDiv.textContent = 'Campo obrigatório'
          fieldEl.appendChild(errDiv)
          return
        }
      }

      if (Array.isArray(val) && val.includes('__outros__')) {
        const txt = (values[f.field_key + '__outros_texto'] || '').trim()
        if (!txt) {
          ok = false
          const outrosEl = document.getElementById('outros_txt_' + f.id)
          if (outrosEl) {
            outrosEl.classList.add('error')
            const errDiv = document.createElement('div')
            errDiv.className   = 'field-error'
            errDiv.textContent = 'Informe qual "Outros"'
            outrosEl.insertAdjacentElement('afterend', errDiv)
          }
        }
      }
    })

    if (!ok) {
      const firstErr = document.querySelector('.field-error')
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return ok
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  window.goSession = function(dir) {
    if (dir > 0 && !validateSession()) return

    const isLast = currentIdx === sessions.length - 1

    if (dir > 0) {
      const currentSess = sessions[currentIdx]
      if (currentSess && !currentSess._isGeneral) {
        _setSaveStatus('saving')
        _saveSessionAnswers(currentSess.id)
          .then(function() { _setSaveStatus('saved') })
          .catch(function() { _setSaveStatus('error') })
      }
    }

    if (dir > 0 && isLast) { showLgpdScreen(); return }

    currentIdx = Math.max(0, Math.min(sessions.length - 1, currentIdx + dir))
    renderSession()
    reEvalConditionals()
  }

  function showLgpdScreen() {
    const nomeCandidates = ['__gd_nome', 'nome', 'name', 'nome_completo', 'paciente', 'nome_paciente']
    let nome = ''
    for (let i = 0; i < nomeCandidates.length; i++) {
      const k = nomeCandidates[i]
      if (values[k] && String(values[k]).trim()) { nome = String(values[k]).trim().split(' ')[0]; break }
    }
    if (!nome && patientData && patientData.nome) nome = patientData.nome.trim().split(' ')[0]

    const lgpdEl    = document.getElementById('lgpd-screen')
    const formEl    = document.getElementById('form-view')
    const titleEl   = document.getElementById('lgpd-title')
    const subtitleEl= document.getElementById('lgpd-subtitle')

    if (titleEl)    titleEl.textContent    = nome ? `Obrigado, ${nome}!` : 'Obrigado!'
    if (subtitleEl) subtitleEl.textContent = 'Antes de enviar, precisamos da sua confirmação sobre o uso dos seus dados.'

    const row  = document.getElementById('lgpd-check-row')
    const icon = document.getElementById('lgpd-check-icon')
    const btn  = document.getElementById('btn-lgpd-confirm')
    if (row)  row.classList.remove('checked')
    if (icon) icon.style.display = 'none'
    if (btn)  btn.classList.remove('active')
    window._lgpdChecked = false

    if (formEl) formEl.style.display = 'none'
    if (lgpdEl) lgpdEl.style.display = 'flex'
  }

  function showSuccessScreen() {
    document.getElementById('lgpd-screen').style.display  = 'none'
    document.getElementById('form-view').style.display    = 'none'
    document.getElementById('state-screen').style.display = 'flex'

    // Redirect URL: configurable via template settings or localStorage
    var redirectUrl = ''
    var redirectLabel = ''
    try {
      var tplSettings = _getTplSettings(TMPL_ID)
      redirectUrl   = (tplSettings && tplSettings.redirect_url)   || localStorage.getItem('anm_redirect_url')   || ''
      redirectLabel = (tplSettings && tplSettings.redirect_label) || localStorage.getItem('anm_redirect_label') || 'Conheca nossos tratamentos'
    } catch(e) {}

    // Default: Instagram oficial da Mirian
    if (!redirectUrl) {
      redirectUrl   = 'https://www.instagram.com/miriandpaula/'
      redirectLabel = 'Siga @miriandpaula no Instagram'
    }

    var redirectBtn = redirectUrl
      ? '<a href="' + redirectUrl + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;margin-top:20px;padding:12px 24px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;box-shadow:0 4px 12px rgba(124,58,237,.3)">'
        + '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
        + redirectLabel + '</a>'
      : ''

    var autoRedirect = redirectUrl
      ? '<div style="margin-top:12px;font-size:12px;color:#9CA3AF">Redirecionando em <span id="anm-countdown">10</span> segundos...</div>'
      : ''

    document.getElementById('state-screen').innerHTML =
      '<div class="state-box">'
      + '<div class="state-icon success">'
      + '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</div>'
      + '<div class="state-title">Formulario enviado!</div>'
      + '<div class="state-body">Seus dados foram registrados com seguranca e serao utilizados exclusivamente para fins da sua consulta. Obrigado!</div>'
      + redirectBtn
      + autoRedirect
      + '</div>'

    // Auto-redirect after 10s
    if (redirectUrl) {
      var countdown = 10
      var timer = setInterval(function() {
        countdown--
        var el = document.getElementById('anm-countdown')
        if (el) el.textContent = countdown
        if (countdown <= 0) { clearInterval(timer); window.location.href = redirectUrl }
      }, 1000)
    }
  }

  // ── Re-evaluate conditionals ─────────────────────────────────────────────────
  function reEvalConditionals() {
    const sess    = sessions[currentIdx]
    const sFields = fieldsBySess[sess.id] || []
    sFields.forEach(function(f) {
      const el   = document.getElementById('field_' + f.id)
      if (!el) return
      const cond = f.conditional_rules_json || {}
      if (!cond.dependsOn) return
      const visible = checkCondition(f)
      if (visible && el.style.display === 'none') {
        el.outerHTML = renderField(f)
        // Re-attach listeners para o campo re-renderizado
        _attachFieldListeners([f])
        restoreValue(f)
      } else if (!visible) {
        el.style.display = 'none'
        el.innerHTML     = ''
      }
    })
  }

  // ── Public FRM API ───────────────────────────────────────────────────────────
  const FRM = window.FRM = {
    setValue: function(key, val, fieldId) {
      values[key] = val
      const el = document.getElementById('field_' + fieldId)
      if (el) {
        el.querySelectorAll('.field-error').forEach(function(e) { e.remove() })
        el.querySelectorAll('.f-input,.f-textarea').forEach(function(e) { e.classList.remove('error') })
      }
      reEvalConditionals()
      checkNextButton()
      _triggerAutoSave()
    },

    setBool: function(key, val, fieldId) {
      values[key] = val
      const wrap = document.getElementById('finp_' + fieldId)
      if (wrap) wrap.querySelectorAll('.bool-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.val === val)
      })
      const el = document.getElementById('field_' + fieldId)
      if (el) el.querySelectorAll('.field-error').forEach(function(e) { e.remove() })
      reEvalConditionals()
      checkNextButton()
      _triggerAutoSave()
    },

    setSingle: function(key, val, fieldId) {
      values[key] = val
      const wrap = document.getElementById('finp_' + fieldId)
      if (wrap) {
        wrap.querySelectorAll('.single-opt').forEach(function(btn) {
          btn.classList.toggle('active', btn.dataset.val === val)
        })
        wrap.querySelectorAll('.radio-opt').forEach(function(btn) {
          const active = btn.dataset.val === val
          btn.classList.toggle('active', active)
          const circle = btn.querySelector('.radio-circle')
          if (circle) circle.innerHTML = active ? '<div class="radio-dot"></div>' : ''
        })
      }
      const el = document.getElementById('field_' + fieldId)
      if (el) el.querySelectorAll('.field-error').forEach(function(e) { e.remove() })
      reEvalConditionals()
      checkNextButton()
      _triggerAutoSave()
    },

    toggleMulti: function(key, val, fieldId) {
      if (!values[key]) values[key] = []
      const arr = values[key]
      const idx = arr.indexOf(val)
      if (idx >= 0) arr.splice(idx, 1)
      else arr.push(val)
      const wrap = document.getElementById('finp_' + fieldId)
      if (wrap) wrap.querySelectorAll('.multi-opt').forEach(function(btn) {
        btn.classList.toggle('active', arr.includes(btn.dataset.val))
      })
      if (val === '__outros__') {
        const txtEl = document.getElementById('outros_txt_' + fieldId)
        if (txtEl) {
          const showing = arr.includes('__outros__')
          txtEl.style.display = showing ? 'block' : 'none'
          if (!showing) { txtEl.value = ''; delete values[key + '__outros_texto'] }
        }
      }
      const el = document.getElementById('field_' + fieldId)
      if (el) el.querySelectorAll('.field-error').forEach(function(e) { e.remove() })
      reEvalConditionals()
      checkNextButton()
      _triggerAutoSave()
    },

    setOutrosText: function(key, fieldId, text) {
      values[key + '__outros_texto'] = text
    },

    setImgGrid: function(key, val, fieldId) {
      values[key] = val
      let f = null
      const sids = Object.keys(fieldsBySess)
      for (let i = 0; i < sids.length; i++) {
        f = fieldsBySess[sids[i]].find(function(x) { return x.id === fieldId })
        if (f) break
      }
      const count = (f && f.settings_json && f.settings_json.count) || 2
      for (let i = 0; i < count; i++) {
        const card  = document.getElementById('igc_' + fieldId + '_' + i)
        const radio = document.getElementById('igr_' + fieldId + '_' + i)
        const sel   = String(i) === val
        if (card)  card.classList.toggle('ig-selected', sel)
        if (radio) {
          const dot    = radio.querySelector('.ig-radio-dot')
          const lbl    = radio.querySelector('.ig-radio-label')
          const circle = radio.querySelector('.ig-radio-circle')
          if (dot)    dot.style.display = sel ? 'block' : 'none'
          if (lbl)    lbl.textContent   = sel ? 'Selecionado' : 'Selecionar'
          if (circle) circle.style.borderColor = sel ? '#7C3AED' : '#D1D5DB'
        }
      }
      checkNextButton()
      _triggerAutoSave()
    },

    setGdSexo: function(val) {
      values['__gd_sexo'] = val
      ;['M', 'F'].forEach(function(id) {
        const btn = document.getElementById('gd_sexo_' + id)
        if (btn) btn.classList.toggle('active', (id === 'M' ? 'Masculino' : 'Feminino') === val)
      })
      checkNextButton()
    },

    setGdBirth: function(val) {
      values['__gd_birth_date'] = val
      const age = _calcAge(val)
      values['__gd_age'] = age || ''
      const el = document.getElementById('gd_age_display')
      if (el) el.textContent = age ? age + ' anos' : '—'
      document.getElementById('gd_birth_error') && document.getElementById('gd_birth_error').remove()
      const inp = document.getElementById('gd_birth_date')
      if (inp) inp.classList.remove('error')
      checkNextButton()
    },

    setGd: function(key, val) {
      values[key] = val
      checkNextButton()
    },

    setGdCpf: function(val) {
      const masked = _maskCpf(val)
      values['__gd_cpf'] = masked
      const inp = document.getElementById('gd_cpf')
      if (inp && inp.value !== masked) inp.value = masked
      const hint = document.getElementById('gd_cpf_hint')
      if (hint) {
        const full = masked.replace(/\D/g,'').length === 11
        hint.style.display = full && !_validateCpf(masked) ? 'block' : 'none'
        hint.style.color   = '#EF4444'
        hint.textContent   = 'CPF inválido'
      }
      checkNextButton()
    },

    setGdPhone: function(val) {
      const masked = _maskPhone(val)
      values['__gd_telefone'] = masked
      const inp = document.getElementById('gd_telefone')
      if (inp && inp.value !== masked) inp.value = masked
      checkNextButton()
    },

    setGdRg: function(val) {
      const masked = _maskRg(val)
      values['__gd_rg'] = masked
      const inp = document.getElementById('gd_rg')
      if (inp && inp.value !== masked) inp.value = masked
    },

    setGdCep: function(val) {
      const masked = _maskCep(val)
      values['__gd_cep'] = masked
      const inp = document.getElementById('gd_cep')
      if (inp && inp.value !== masked) inp.value = masked
      checkNextButton()

      const clean = masked.replace(/\D/g,'')
      const hint  = document.getElementById('gd_cep_hint')
      if (clean.length !== 8) { if (hint) hint.style.display = 'none'; return }

      const _cepCtrl    = new AbortController()
      const _cepTimeout = setTimeout(function() { _cepCtrl.abort() }, 5000)
      fetch('https://viacep.com.br/ws/' + clean + '/json/', { signal: _cepCtrl.signal })
        .then(function(r) { clearTimeout(_cepTimeout); return r.json() })
        .then(function(d) {
          if (d.erro) {
            if (hint) { hint.style.display = 'block'; hint.style.color = '#EF4444'; hint.textContent = 'CEP não encontrado' }
            return
          }
          if (hint) hint.style.display = 'none'
          const map = {
            '__gd_logradouro': d.logradouro,
            '__gd_bairro':     d.bairro,
            '__gd_cidade':     d.localidade,
            '__gd_estado':     d.uf,
            '__gd_pais':       'Brasil',
          }
          Object.keys(map).forEach(function(k) {
            const v = map[k]
            if (!v) return
            values[k] = v
            const el = document.getElementById(k.replace('__gd_','gd_'))
            if (el) el.value = v
          })
          checkNextButton()
        })
        .catch(function() { if (hint) { hint.style.display = 'block'; hint.textContent = 'Erro ao consultar CEP' } })
    },

    toggleLgpd: function() {
      window._lgpdChecked = !window._lgpdChecked
      const row  = document.getElementById('lgpd-check-row')
      const icon = document.getElementById('lgpd-check-icon')
      const btn  = document.getElementById('btn-lgpd-confirm')
      if (row)  row.classList.toggle('checked', window._lgpdChecked)
      if (icon) icon.style.display = window._lgpdChecked ? 'block' : 'none'
      if (btn)  btn.classList.toggle('active', window._lgpdChecked)
    },

    confirmLgpd: async function() {
      if (!window._lgpdChecked) return
      if (IS_TEST) {
        document.getElementById('lgpd-screen').style.display = 'none'
        document.getElementById('state-screen').style.display = 'flex'
        document.getElementById('state-screen').innerHTML = `
          <div class="state-box">
            <div class="state-icon success">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="state-title">Simulação concluída!</div>
            <div class="state-body">MODO TESTE — nenhum dado foi salvo. O fluxo de envio e LGPD está funcionando corretamente.</div>
          </div>`
        return
      }

      const btnConfirm = document.getElementById('btn-lgpd-confirm')
      if (window._lastFormSubmit && Date.now() - window._lastFormSubmit < 30000) {
        if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Aguarde 30s...' }
        setTimeout(function() { if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Enviar Formulário' } }, 30000 - (Date.now() - window._lastFormSubmit))
        return
      }
      window._lastFormSubmit = Date.now()
      if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Enviando...' }

      // ── 1. Salva sessões pendentes ───────────────────────────────────────
      try {
        const currentSess  = sessions[currentIdx]
        const realSessions = sessions.filter(function(s) { return !s._isGeneral })
        for (let i = 0; i < realSessions.length; i++) {
          const s = realSessions[i]
          if (s.id !== (currentSess && currentSess.id)) await _saveSessionAnswers(s.id)
        }
      } catch (e) {
        console.error('[ClinicAI] Falha ao salvar sessões pendentes antes da conclusão:', e.message)
      }

      // ── 2. Coleta answers da sessão atual ───────────────────────────────
      const finalAnswers = []
      const currentSess  = sessions[currentIdx]
      if (currentSess && !currentSess._isGeneral && responseId) {
        const sessFields = fieldsBySess[currentSess.id] || []
        for (let i = 0; i < sessFields.length; i++) {
          const f   = sessFields[i]
          const raw = values[f.field_key]
          if (raw === undefined || raw === null || raw === '') continue
          const nonInput = ['section_title', 'label', 'description_text']
          if (nonInput.includes(f.field_type)) continue
          let normText = ''
          if (f.field_key === 'cpf' || f.field_key === '__gd_cpf' ||
              f.field_key === 'rg'  || f.field_key === '__gd_rg') {
            normText = '[REDACTED]'
          } else if (Array.isArray(raw))       normText = raw.join(', ')
          else if (typeof raw === 'object')     normText = JSON.stringify(raw)
          else                                  normText = String(raw)
          var isPII2 = f.field_key === 'cpf' || f.field_key === '__gd_cpf' || f.field_key === 'rg' || f.field_key === '__gd_rg'
          finalAnswers.push({
            field_id:        f.id,
            field_key:       f.field_key,
            value_json:      isPII2 ? '[REDACTED]' : (Array.isArray(raw) ? raw : (typeof raw === 'object' ? raw : String(raw))),
            normalized_text: normText.slice(0, 1000),
          })
        }
      }

      // ── 3. Coleta campos do paciente (incluindo novos: sex, rg, birth_date, address) ──
      let ptFirstName = null, ptLastName = null, ptPhone = null, ptCpf = null
      let ptSex = null, ptRg = null, ptBirthDate = null, ptAddress = null

      if (patientId && values['__gd_nome']) {
        const nome = String(values['__gd_nome']).trim()
        const sp   = nome.indexOf(' ')
        ptFirstName = sp > 0 ? nome.slice(0, sp) : nome
        if (sp > 0) ptLastName = nome.slice(sp + 1).trim() || null
      }
      if (values['__gd_telefone']) ptPhone = String(values['__gd_telefone'])
      if (values['__gd_cpf'])      ptCpf   = String(values['__gd_cpf']).replace(/\D/g, '')
      if (values['__gd_sexo'])     ptSex   = String(values['__gd_sexo'])
      if (values['__gd_rg'])       ptRg    = String(values['__gd_rg'])
      if (values['__gd_birth_date']) ptBirthDate = String(values['__gd_birth_date'])
      if (values['__gd_cep'] || values['__gd_logradouro']) {
        ptAddress = {
          cep:         values['__gd_cep']         || null,
          logradouro:  values['__gd_logradouro']  || null,
          numero:      values['__gd_numero']      || null,
          complemento: values['__gd_complemento'] || null,
          bairro:      values['__gd_bairro']      || null,
          cidade:      values['__gd_cidade']      || null,
          estado:      values['__gd_estado']      || null,
          pais:        values['__gd_pais']        || 'Brasil',
        }
      }

      // ── 4. Registrar consentimento LGPD ─────────────────────────
      var lgpdConsent = {
        accepted: true,
        accepted_at: new Date().toISOString(),
        terms_version: '1.0',
        user_agent: navigator.userAgent || '',
        form_slug: SLUG || '',
      }

      // Consentimento LGPD: NAO enviar como answer (field_id null viola NOT NULL).
      // Salvar separadamente via update no response.
      try {
        await _patch('/anamnesis_responses', { id: 'eq.' + responseId }, { lgpd_consent: lgpdConsent })
      } catch (e) {
        // Se coluna lgpd_consent nao existe, salvar no metadata do response
        console.warn('[ClinicAI] LGPD consent save fallback:', e.message)
      }

      // ── 5. RPC atomico com retry (3 tentativas, backoff 1s/2s/4s) ───────
      try {
        await _withRetry(async function() {
          await _rpc('complete_anamnesis_form', {
            p_response_id:          responseId,
            p_request_id:           requestId,
            p_patient_id:           patientId,
            p_clinic_id:            clinicId,
            p_patient_first_name:   ptFirstName,
            p_patient_last_name:    ptLastName,
            p_patient_phone:        ptPhone,
            p_patient_cpf:          ptCpf,
            p_patient_sex:          ptSex,
            p_patient_rg:           ptRg,
            p_patient_birth_date:   ptBirthDate,
            p_patient_address:      ptAddress,
            p_final_answers:        finalAnswers.length ? finalAnswers : null,
          })
        }, 3, 1000, function(attempt, total) {
          if (btnConfirm) btnConfirm.textContent = 'Tentando novamente (' + attempt + '/' + total + ')...'
        })
      } catch (e) {
        console.error('[ClinicAI] Falha ao concluir formulário:', e.message)
        if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Enviar Formulário' }
        showStateScreen('error', 'Erro ao enviar', 'Não foi possível registrar o envio. Verifique sua conexão e tente novamente.')
        return
      }

      // Marcar como completado — bloqueia auto-save
      _formCompleted = true
      // Limpar token do sessionStorage apos completar
      if (SLUG) { try { sessionStorage.removeItem('anm_token_' + SLUG) } catch(e) {} }

      showSuccessScreen()
    },
  }

  // ── Event listeners para elementos estáticos do HTML ────────────────────────
  // Substituem os atributos onclick removidos do form-render.html.
  // Executados após o DOM estar disponível (script carregado ao fim do body).
  ;(function _attachStaticListeners() {
    const lgpdRow    = document.getElementById('lgpd-check-row')
    const btnConfirm = document.getElementById('btn-lgpd-confirm')
    const btnPrev    = document.getElementById('btn-prev')
    const btnNext    = document.getElementById('btn-next')
    if (lgpdRow)    lgpdRow.addEventListener('click',    function() { FRM.toggleLgpd() })
    if (btnConfirm) btnConfirm.addEventListener('click', function() { FRM.confirmLgpd() })
    if (btnPrev)    btnPrev.addEventListener('click',    function() { window.goSession(-1) })
    if (btnNext)    btnNext.addEventListener('click',    function() { window.goSession(1)  })
  })()

  // ── Init ─────────────────────────────────────────────────────────────────────
  boot()

})()
