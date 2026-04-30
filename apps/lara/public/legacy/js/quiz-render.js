;(function () {
  'use strict'

  // ── Config (lê de window.ClinicEnv — centralizado em js/config/env.js) ─────
  var _env = window.ClinicEnv || {}
  var SUPABASE_URL = _env.SUPABASE_URL || ''
  var SUPABASE_KEY = _env.SUPABASE_KEY || ''

  // ── State ────────────────────────────────────────────────────────────────────
  var _quiz         = null  // quiz_template object from DB
  var _schema       = null  // parsed schema (intro, questions, scoring, outro)
  var _questions    = []    // array of question objects
  var _answers      = {}    // { [questionId or index]: value }
  var _currentStep  = -1   // -1=intro, 0..N-1=questions, N=contact, N+1=thankyou
  var _submitted    = false
  var _submitCount  = 0       // Rate limit: max 3 per session
  var _quizStartTime = null   // Anti-bot: minimum time check
  var _submitting   = false
  var _utms         = {}
  var _leadData     = { name: '', phone: '', email: '' } // cache para interpolação
  var _sessionId    = null  // fingerprint único por sessão de quiz

  // ── Session ID (unique per quiz attempt) ────────────────────────────────────
  function _generateSessionId() {
    var ts = Date.now().toString(36)
    var rnd = Math.random().toString(36).substring(2, 8)
    return 'qs_' + ts + '_' + rnd
  }

  // ── Event Tracking (fire-and-forget) ────────────────────────────────────────
  // IP hash pseudonimo — derivado de UA + resolucao de tela. Nao identifica
  // usuario, so permite rate limiting server-side (ver migration 482).
  function _computeIpHash() {
    try {
      var s = (navigator.userAgent || '') + '::' + (screen.width || 0) + 'x' + (screen.height || 0)
      var h = 0
      for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 }
      return 'q_' + (h >>> 0).toString(36)
    } catch (e) { return null }
  }
  var _ipHashCached = null
  function _getIpHash() {
    if (_ipHashCached === null) _ipHashCached = _computeIpHash()
    return _ipHashCached
  }

  function _trackEvent(eventType, extra) {
    if (!_quiz || !_sessionId) return
    var body = {
      p_quiz_id:       _quiz.id,
      p_clinic_id:     _quiz.clinic_id,
      p_session_id:    _sessionId,
      p_event_type:    eventType,
      p_step_index:    (extra && extra.step_index != null) ? extra.step_index : null,
      p_step_label:    (extra && extra.step_label)         || null,
      p_contact_name:  _leadData.name  || null,
      p_contact_phone: _leadData.phone || null,
      p_utm_source:    _utms.utm_source    || null,
      p_utm_medium:    _utms.utm_medium    || null,
      p_utm_campaign:  _utms.utm_campaign  || null,
      p_metadata:      (extra && extra.metadata) || {},
      p_ip_hash:       _getIpHash(),
    }
    // fire-and-forget — não bloqueia o fluxo do quiz
    _apiRpc('insert_quiz_event', body).catch(function(err) {
      console.warn('[quiz-track]', eventType, err && err.message)
    })
  }

  // ── Answer helpers (usa QuizId se disponível, fallback por índice) ────────
  function _ansKey(step) {
    var q = _questions[step]
    return (q && q.id) ? q.id : String(step)
  }
  function _getAns(step) {
    var q = _questions[step]
    if (window.QuizId && q) return QuizId.getAnswer(_answers, q, step)
    return _answers[_ansKey(step)]
  }
  function _setAns(step, val) {
    _answers[_ansKey(step)] = val
  }

  // ── Fetch helpers (standalone — no _sbShared dependency) ────────────────────
  function _hdrs() {
    return {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
    }
  }

  async function _apiGet(path, params) {
    var qs = Object.entries(params || {})
      .map(function(e) { return e[0] + '=' + encodeURIComponent(e[1]) })
      .join('&')
    var url = SUPABASE_URL + '/rest/v1' + path + (qs ? '?' + qs : '')
    var res = await fetch(url, { headers: _hdrs() })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function _apiRpc(fn, body) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method:  'POST',
      headers: _hdrs(),
      body:    JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  // ── URL param helpers ────────────────────────────────────────────────────────
  function _getParam(name) {
    return new URLSearchParams(window.location.search).get(name) || ''
  }

  function _captureUtms() {
    var p = new URLSearchParams(window.location.search)
    _utms = {
      utm_source:   p.get('utm_source')   || '',
      utm_medium:   p.get('utm_medium')   || '',
      utm_campaign: p.get('utm_campaign') || '',
    }
  }

  // ── Toast ────────────────────────────────────────────────────────────────────
  var _toastTimer = null

  function _showToast(msg, withRetry) {
    var el    = document.getElementById('toast')
    var msgEl = document.getElementById('toast-msg')
    if (!el || !msgEl) return

    msgEl.textContent = msg

    // Remove any existing retry button
    var existing = el.querySelector('.toast-retry-btn')
    if (existing) el.removeChild(existing)

    if (withRetry) {
      var btn = document.createElement('button')
      btn.className = 'toast-retry-btn'
      btn.textContent = 'Tentar novamente'
      btn.onclick = function() { _hideToast(); _doSubmit() }
      el.appendChild(btn)
    }

    el.classList.add('show')
    if (_toastTimer) clearTimeout(_toastTimer)
    if (!withRetry) {
      _toastTimer = setTimeout(_hideToast, 3500)
    }
  }

  function _hideToast() {
    var el = document.getElementById('toast')
    if (el) el.classList.remove('show')
  }

  // ── Show state screen ────────────────────────────────────────────────────────
  function _showError(title, msg) {
    var ss = document.getElementById('state-screen')
    if (!ss) return
    ss.style.display = 'flex'
    ss.innerHTML =
      '<div class="state-box">' +
        '<div class="state-icon error">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<line x1="12" y1="8" x2="12" y2="12"/>' +
            '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
          '</svg>' +
        '</div>' +
        '<div class="state-title">' + _esc(title) + '</div>' +
        '<div class="state-body">' + _esc(msg) + '</div>' +
      '</div>'
    var qv = document.getElementById('quiz-view')
    if (qv) qv.style.display = 'none'
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── Load quiz from Supabase ──────────────────────────────────────────────────
  async function _loadQuiz(slug) {
    // Use prefetched data if available (started in parallel with script loading)
    if (window._prefetchedQuiz) {
      var pf = window._prefetchedQuiz
      window._prefetchedQuiz = null
      return pf
    }
    // Fallback: fetch normally
    var rows = await _apiGet('/quiz_templates', {
      slug:   'eq.' + slug,
      active: 'eq.true',
      select: '*',
      limit:  '1',
    })
    if (!rows || !rows.length) throw new Error('Quiz não encontrado.')
    return rows[0]
  }

  // ── Score calculation ────────────────────────────────────────────────────────
  function _calcScore() {
    var total = 0
    _questions.forEach(function(q, idx) {
      var ans = _getAns(idx)
      if (ans === undefined || ans === null) return

      if (q.type === 'single_choice' || q.type === 'image_choice') {
        var opt = (q.options || []).find(function(o) { return o.label === ans })
        if (opt && typeof opt.score === 'number') total += opt.score
      } else if (q.type === 'multiple_choice') {
        var selected = Array.isArray(ans) ? ans : []
        selected.forEach(function(label) {
          var o = (q.options || []).find(function(o) { return o.label === label })
          if (o && typeof o.score === 'number') total += o.score
        })
      } else if (q.type === 'scale') {
        total += (typeof ans === 'number' ? ans : parseInt(ans, 10)) || 0
      }
    })
    return total
  }

  function _calcTemperature(score) {
    var scoring = (_schema.scoring) || {}
    var hot  = (scoring.hot  && typeof scoring.hot.min  === 'number') ? scoring.hot.min  : 8
    var warm = (scoring.warm && typeof scoring.warm.min === 'number') ? scoring.warm.min : 4
    if (score >= hot)  return 'hot'
    if (score >= warm) return 'warm'
    return 'cold'
  }

  // ── Phone mask ───────────────────────────────────────────────────────────────
  function _maskPhone(value) {
    // Remove tudo que nao e digito, limita a 11 (DDD + celular BR)
    var v = value.replace(/\D/g, '')
    // Se comeca com 55 (DDI), remove para mascara local
    if (v.length > 11 && v.startsWith('55')) v = v.substring(2)
    v = v.substring(0, 11)
    if (v.length <= 2)  return '(' + v
    if (v.length <= 7)  return '(' + v.substring(0,2) + ') ' + v.substring(2)
    if (v.length <= 11) return '(' + v.substring(0,2) + ') ' + v.substring(2,7) + '-' + v.substring(7)
    return value
  }

  function _isValidBRPhone(phone) {
    var digits = phone.replace(/\D/g, '')
    if (digits.startsWith('55')) digits = digits.substring(2)
    // BR: 10 digitos (fixo) ou 11 digitos (celular com 9)
    return digits.length === 10 || digits.length === 11
  }

  // ── Theme (primary color CSS variables) ─────────────────────────────────────
  function _darkenHex(hex, amount) {
    var c = hex.replace('#', '')
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2]
    var r = Math.max(0, parseInt(c.slice(0,2), 16) - amount)
    var g = Math.max(0, parseInt(c.slice(2,4), 16) - amount)
    var b = Math.max(0, parseInt(c.slice(4,6), 16) - amount)
    return '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0') }).join('')
  }

  function _applyTheme() {
    var primary = ((_schema.appearance || {}).primary_color || '#111111').trim()
    if (!/^#[0-9A-Fa-f]{6}$/.test(primary)) primary = '#111111'
    var hover   = _darkenHex(primary, 30)
    var el = document.getElementById('quiz-theme') || document.createElement('style')
    el.id = 'quiz-theme'
    el.textContent = ':root{--primary:' + primary + ';--primary-hover:' + hover + '}'
    if (!el.parentNode) document.head.appendChild(el)
  }

  // ── Image URL resolver (Google Drive → direct embed) ─────────────────────────
  // NOTE: Duplicated intentionally — quiz-render runs standalone without admin modules
  function _resolveImgUrl(url) {
    if (!url) return url
    var m = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/)
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800'
    var m2 = url.match(/drive\.google\.com\/(?:open|uc)\?.*[?&]id=([^&]+)/)
    if (m2) return 'https://drive.google.com/thumbnail?id=' + m2[1] + '&sz=w800'
    return url
  }

  function _resolveVideoEmbed(url, autoplay) {
    if (!url) return null
    var ap = autoplay ? 1 : 0

    // Google Drive — qualquer link /file/d/ID/* → /preview
    var gd = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]+)/)
    if (gd) return 'https://drive.google.com/file/d/' + gd[1] + '/preview'

    // YouTube (watch, shorts, youtu.be)
    var isShort = url.indexOf('/shorts/') !== -1
    var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    if (yt) {
      var params = '?autoplay=' + ap + '&mute=1&rel=0'
      if (!isShort) params += '&loop=1&playlist=' + yt[1]
      return 'https://www.youtube-nocookie.com/embed/' + yt[1] + params
    }

    // Vimeo
    var vim = url.match(/vimeo\.com\/(\d+)/)
    if (vim) return 'https://player.vimeo.com/video/' + vim[1] + '?autoplay=' + ap + '&muted=1&loop=1'
    return null
  }

  // ── Dynamic variable interpolation ──────────────────────────────────────────
  // Uso: {nome} {email} {telefone} em qualquer título/descrição do quiz
  function _interpolate(text) {
    if (!text || text.indexOf('{') === -1) return text
    var contact = _getLeadData()
    return text
      .replace(/\{nome\}/gi,      contact.name  || '{nome}')
      .replace(/\{email\}/gi,     contact.email || '{email}')
      .replace(/\{telefone\}/gi,  contact.phone || '{telefone}')
  }

  function _getLeadData() {
    var fromQ = _getContactFromAnswers()

    function _domVal(id) {
      var el = document.getElementById(id)
      return el ? el.value.trim() : ''
    }

    return {
      name:  _leadData.name  || fromQ.name  || _domVal('contact-name')   || _domVal('q-contact-name'),
      phone: _leadData.phone || fromQ.phone || _domVal('contact-phone')  || _domVal('q-contact-phone'),
      email: _leadData.email || fromQ.email || _domVal('contact-email')  || _domVal('q-contact-email'),
    }
  }

  // ── Collect contact fields from question answers ─────────────────────────────
  function _getContactFromAnswers() {
    var result = { name: '', phone: '', email: '', queixas: [] }
    _questions.forEach(function(q, idx) {
      var raw = _getAns(idx)
      if (q.type === 'contact_queixas') {
        result.queixas = Array.isArray(raw) ? raw : []
        return
      }
      var ans = typeof raw === 'string' ? raw.trim() : ''
      if (!ans) return
      if (q.type === 'contact_name')  result.name  = ans
      if (q.type === 'contact_phone') result.phone = ans
      if (q.type === 'contact_email') result.email = ans
    })
    return result
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function _doSubmit() {
    if (_submitted || _submitting) return

    // Anti-spam: rate limit (max 3 per session)
    if (_submitCount >= 3) {
      _showToast('Limite de envios atingido. Recarregue a pagina.', true)
      return
    }

    // Anti-bot: quiz deve ter pelo menos 10s de interacao
    if (_quizStartTime && (Date.now() - _quizStartTime) < 10000) {
      _showToast('Por favor, responda as perguntas antes de enviar.', true)
      return
    }

    // Anti-bot: honeypot check
    var hp = document.getElementById('hp-field')
    if (hp && hp.value) return // silently reject bots

    _submitCount++
    _submitting = true

    // Gather contact info — fixed contact step fields take priority, fall back to question answers
    var fromQ   = _getContactFromAnswers()
    var nameEl  = document.getElementById('contact-name')
    var phoneEl = document.getElementById('contact-phone')
    var emailEl = document.getElementById('contact-email')

    var ld = _getLeadData() // lê de todas as fontes: cache, _answers, DOM step contato e DOM perguntas
    var name  = ld.name
    var phone = ld.phone
    var email = ld.email

    _leadData = { name: name, phone: phone, email: email }

    var score       = _calcScore()
    var temperature = _calcTemperature(score)

    var queixas = _getContactFromAnswers().queixas || []

    // Extract age from collagen timeline answer
    var idade = null
    _questions.forEach(function(q, idx) {
      if (q.collagen_timeline) {
        var ans = _getAns(idx)
        if (typeof ans === 'string') idade = parseInt(ans) || null
      }
    })

    var payload = {
      p_quiz_id:            _quiz.id,
      p_clinic_id:          _quiz.clinic_id,
      p_answers:            _answers,
      p_score:              score,
      p_temperature:        temperature,
      p_contact_name:       name,
      p_contact_phone:      phone,
      p_contact_email:      email || null,
      p_utm_source:         _utms.utm_source    || null,
      p_utm_medium:         _utms.utm_medium    || null,
      p_utm_campaign:       _utms.utm_campaign  || null,
      p_kanban_target:      _quiz.kanban_target || '',
      p_queixas_faciais:    queixas,
      p_idade:              idade,
    }

    // Update button state
    var btn = document.getElementById('btn-next')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Enviando...'
    }

    try {
      // Rate limit server-side: phone + ip_hash (pseudonimo, sem IP real).
      // _getIpHash() e o mesmo helper usado em _trackEvent para insert_quiz_event.
      var rlCheck = await _apiRpc('quiz_check_rate_limit', {
        p_phone:   phone,
        p_quiz_id: _quiz.id,
        p_ip_hash: _getIpHash(),
        p_session: _sessionId || null,
      })
      if (rlCheck === false) {
        _showToast('Limite de envios atingido. Tente novamente em 1 hora.')
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar' }
        return
      }
      await _apiRpc('submit_quiz_response', payload)
      _submitted = true
      _trackEvent('quiz_complete', {
        step_index: _questions.length + 1,
        step_label: 'LGPD',
        metadata: { score: score, temperature: temperature },
      })
      if (window.QuizPixels) {
        QuizPixels.fire('CompleteQuiz', { quiz_title: _quiz.title, score: score, temperature: temperature })
        QuizPixels.fire('Lead', { content_name: _quiz.title })
      }
      _goToStep(_questions.length + 2) // thank you screen (lgpd is N+1)
    } catch (err) {
      _submitting = false
      console.error('[quiz] submit error:', err && err.message)
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Ver meu resultado'
      }
      _showToast('Erro: ' + (err && err.message ? err.message.substring(0, 80) : 'falha ao enviar'), true)
    }
  }

  // ── Validate current step ────────────────────────────────────────────────────
  function _isStepValid(step) {
    if (step === -1) return true // intro always valid

    var contactStep  = _questions.length
    var lgpdStep     = _questions.length + 1
    var thankyouStep = _questions.length + 2

    if (step === lgpdStep || step === thankyouStep) return true

    if (step === contactStep) {
      var nameEl  = document.getElementById('contact-name')
      var phoneEl = document.getElementById('contact-phone')
      var name  = nameEl  ? nameEl.value.trim()  : ''
      var phone = phoneEl ? phoneEl.value.trim()  : ''
      return name.length > 0 && _isValidBRPhone(phone)
    }

    var q   = _questions[step]
    var ans
    if (!q) return true

    // Contact field types have their own validation logic
    if (q.type === 'contact_name') {
      ans = _getAns(step)
      return typeof ans === 'string' && ans.trim().length > 0
    }
    if (q.type === 'contact_phone') {
      ans = _getAns(step)
      return typeof ans === 'string' && _isValidBRPhone(ans)
    }
    if (q.type === 'contact_email') {
      return true // always optional
    }
    if (q.type === 'contact_queixas') {
      if (!q.required) return true
      ans = _getAns(step)
      return Array.isArray(ans) && ans.length > 0
    }

    // Collagen timeline: requires slider interaction
    if (q.collagen_timeline) {
      ans = _getAns(step)
      return ans !== undefined && ans !== null && ans !== ''
    }

    if (!q.required) return true

    ans = _getAns(step)
    if (ans === undefined || ans === null || ans === '') return false
    if (Array.isArray(ans) && ans.length === 0) return false
    return true
  }

  // ── Update nav footer ────────────────────────────────────────────────────────
  function _updateNav() {
    var navFooter    = document.getElementById('nav-footer')
    var btn          = document.getElementById('btn-next')
    var progressWrap = document.getElementById('progress-wrap')
    var step = _currentStep

    if (!navFooter || !btn) return

    var introStep    = -1
    var contactStep  = _questions.length
    var lgpdStep     = _questions.length + 1
    var thankyouStep = _questions.length + 2

    // Check if current question has collagen timeline
    var hasCollagen = step >= 0 && step < _questions.length && _questions[step] && _questions[step].collagen_timeline

    // Show/hide persistent header (hidden on intro, lgpd, thankyou, and collagen)
    var header = document.getElementById('quiz-header')
    var showHeader = step !== introStep && step !== lgpdStep && step !== thankyouStep && !hasCollagen
    if (header) header.style.display = showHeader ? 'flex' : 'none'

    // Hide footer and dots on intro, lgpd and thankyou (lgpd has its own button)
    if (step === introStep || step === lgpdStep || step === thankyouStep) {
      navFooter.style.display = 'none'
      if (progressWrap) progressWrap.style.display = 'none'
      return
    }

    navFooter.style.display = 'block'

    // Progress dots (hidden on collagen timeline)
    if (progressWrap) {
      progressWrap.style.display = hasCollagen ? 'none' : 'block'
      var dotsEl = document.getElementById('progress-dots')
      if (dotsEl) {
        var total = _questions.length
        var html  = ''
        for (var d = 0; d < total; d++) {
          var cls = d === step ? 'active' : (d < step ? 'done' : '')
          html += '<div class="progress-dot' + (cls ? ' ' + cls : '') + '"></div>'
        }
        dotsEl.innerHTML = html
      }
    }

    // Button label
    btn.textContent = 'Próximo'

    // Button locked/active based on validity
    var valid = _isStepValid(step)
    btn.classList.toggle('locked', !valid)
    btn.disabled = false
  }

  // ── Screen transition ────────────────────────────────────────────────────────
  function _contactAlreadyCollected() {
    var fromQ = _getContactFromAnswers()
    var phone = fromQ.phone.replace(/\D/g, '')
    return fromQ.name.length > 0 && _isValidBRPhone(phone)
  }

  function _goToStep(nextStep) {
    var contactStep  = _questions.length
    var lgpdStep     = _questions.length + 1
    var thankyouStep = _questions.length + 2

    // Pula contact step se o quiz usa perguntas de contato OU se já coletou nome+fone
    if (nextStep === contactStep && (_contactAlreadyCollected() || _contactAlreadyCollected())) {
      nextStep = lgpdStep
    }

    // Ao entrar no LGPD, captura dados do lead enquanto o DOM ainda existe
    if (nextStep === lgpdStep) {
      var fromQ   = _getContactFromAnswers()
      var nameEl  = document.getElementById('contact-name')
      var phoneEl = document.getElementById('contact-phone')
      var emailEl = document.getElementById('contact-email')
      _leadData = {
        name:  (nameEl  ? nameEl.value.trim()  : '') || fromQ.name,
        phone: (phoneEl ? phoneEl.value.trim()  : '') || fromQ.phone,
        email: (emailEl ? emailEl.value.trim()  : '') || fromQ.email,
      }
    }

    var wrap     = document.getElementById('screens-wrap')
    var oldScreen = wrap.querySelector('.quiz-screen.active')

    if (oldScreen) {
      oldScreen.classList.remove('active')
      oldScreen.classList.add('exit-left')
      setTimeout(function() {
        if (oldScreen.parentNode) oldScreen.parentNode.removeChild(oldScreen)
      }, 300)
    }

    _currentStep = nextStep
    var newScreen = _buildScreen(nextStep)
    wrap.appendChild(newScreen)

    // Track step view
    if (nextStep >= 0 && nextStep !== thankyouStep) {
      var stepQ = _questions[nextStep]
      var stepLabel = nextStep < _questions.length
        ? (stepQ && stepQ.title || 'Pergunta ' + (nextStep + 1))
        : (nextStep === contactStep ? 'Contato' : 'LGPD')
      var stepMeta = {}
      if (stepQ && stepQ.id) stepMeta.question_id = stepQ.id
      // Salvar queixas selecionadas no metadata quando avanca do step de queixas
      var prevStep = nextStep - 1
      var prevQ = prevStep >= 0 ? _questions[prevStep] : null
      if (prevQ && prevQ.type === 'contact_queixas') {
        var queixasSel = _getAns(prevStep)
        if (Array.isArray(queixasSel) && queixasSel.length > 0) {
          stepMeta.queixas = queixasSel
        }
      }
      _trackEvent('step_view', { step_index: nextStep, step_label: stepLabel, metadata: stepMeta })
    }

    // Force reflow then activate
    newScreen.getBoundingClientRect()
    requestAnimationFrame(function() {
      newScreen.classList.add('active')
    })

    _updateNav()
  }

  // ── Build screen elements ────────────────────────────────────────────────────
  function _buildScreen(step) {
    var div = document.createElement('div')
    div.className = 'quiz-screen'

    var introStep    = -1
    var contactStep  = _questions.length
    var lgpdStep     = _questions.length + 1
    var thankyouStep = _questions.length + 2

    if (step === introStep) {
      div.innerHTML = _buildIntroHTML()
      setTimeout(_startCountdown, 100)
    } else if (step === contactStep) {
      div.innerHTML = _buildContactHTML()
      _attachContactListeners(div)
    } else if (step === lgpdStep) {
      div.innerHTML = _buildLgpdHTML()
      _attachLgpdListeners(div)
    } else if (step === thankyouStep) {
      div.innerHTML = _buildThankyouHTML()
      // Track clicks on WhatsApp and custom buttons
      var waLink = div.querySelector('#thankyou-wa-btn')
      if (waLink) waLink.addEventListener('click', function() {
        _trackEvent('whatsapp_click')
        if (window.QuizPixels) QuizPixels.fire('Contact', { quiz_title: _quiz.title })
      })
      var customLink = div.querySelector('#thankyou-custom-btn')
      if (customLink) customLink.addEventListener('click', function() { _trackEvent('btn_click') })
    } else {
      div.innerHTML = _buildQuestionHTML(step)
      _attachQuestionListeners(div, step)
    }

    // Init carousels
    // Cleanup previous animations
    if (_collagenCleanup) { _collagenCleanup(); _collagenCleanup = null }
    setTimeout(function() {
      _initBACarousels(div)
      var cleanup = _initCollagenTimeline(div)
      if (cleanup) _collagenCleanup = cleanup
    }, 50)

    return div
  }

  // ── Carousel & animation cleanup ────────────────────────────────────────────
  var _collagenCleanup = null
  var _baTimers = []
  function _initBACarousels(root) {
    _baTimers.forEach(function(t) { clearInterval(t) })
    _baTimers = []
    var carousels = root.querySelectorAll('[data-ba-carousel]')
    carousels.forEach(function(carousel) {
      var slides = carousel.querySelectorAll('[data-ba-slide]')
      var dots = carousel.querySelectorAll('[data-ba-dot]')
      var total = slides.length
      if (total < 2) return
      var cur = 0
      function goTo(idx) {
        slides[cur].style.opacity = '0'
        setTimeout(function() {
          slides[cur].style.display = 'none'
          cur = idx
          slides[cur].style.display = 'flex'
          void slides[cur].offsetWidth
          slides[cur].style.opacity = '1'
        }, 800)
        dots.forEach(function(d, di) {
          d.style.width = di === idx ? '22px' : '8px'
          d.style.background = di === idx ? '#111' : '#D1D5DB'
        })
      }
      var timer = setInterval(function() { goTo((cur + 1) % total) }, 3000)
      _baTimers.push(timer)
      dots.forEach(function(d, di) {
        d.addEventListener('click', function() {
          if (di === cur) return
          clearInterval(timer)
          goTo(di)
          timer = setInterval(function() { goTo((cur + 1) % total) }, 3000)
          // Update reference in _baTimers
          _baTimers = _baTimers.filter(function(t) { return t !== timer })
          _baTimers.push(timer)
        })
      })
    })

    // Testimonial carousels (slide lateral)
    var tcCarousels = root.querySelectorAll('[data-tc-carousel]')
    tcCarousels.forEach(function(carousel) {
      var track = carousel.querySelector('[data-tc-track]')
      var slides = carousel.querySelectorAll('[data-tc-slide]')
      var dots = carousel.querySelectorAll('[data-tc-dot]')
      var total = slides.length
      if (total < 2 || !track) return
      var cur = 0
      function goTo(idx) {
        track.style.transform = 'translateX(-' + (idx * 100) + '%)'
        track.style.transition = 'transform 600ms ease-in-out'
        dots.forEach(function(d, di) {
          d.style.width = di === idx ? '22px' : '8px'
          d.style.background = di === idx ? '#111' : '#D1D5DB'
        })
        cur = idx
      }
      var timer = setInterval(function() { goTo((cur + 1) % total) }, 3000)
      _baTimers.push(timer)
      dots.forEach(function(d, di) {
        d.addEventListener('click', function() {
          if (di === cur) return
          clearInterval(timer)
          goTo(di)
          timer = setInterval(function() { goTo((cur + 1) % total) }, 3000)
          _baTimers = _baTimers.filter(function(t) { return t !== timer })
          _baTimers.push(timer)
        })
      })
    })
  }

  // ── Shared testimonial builder ──────────────────────────────────────────────
  var _starSvgShared = '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
  function _buildTestimonialCard(t) {
    var starCount = parseInt(t.stars) || 5
    var starsHtml = ''
    for (var s = 0; s < starCount; s++) starsHtml += '<span class="intro-testimonial-star">' + _starSvgShared + '</span>'
    var avatarHtml = t.photo
      ? '<img class="intro-testimonial-avatar" src="' + _esc(_resolveImgUrl(t.photo)) + '" alt="">'
      : '<div class="intro-testimonial-avatar" style="display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#6B7280;background:#E5E7EB">' + _esc((t.title || '?').charAt(0).toUpperCase()) + '</div>'
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
      '<div class="intro-testimonial-quote-open" style="position:static;margin:0">\u201C</div>' +
      '<div class="intro-testimonial-stars">' + starsHtml + '</div>' +
    '</div>' +
      '<div class="intro-testimonial-body">' + _esc(_interpolate(t.body)) + '</div>' +
      '<div class="intro-testimonial-quote-close">\u201D</div>' +
      '<div class="intro-testimonial-footer" style="justify-content:center;position:relative">' +
        avatarHtml +
        (t.title ? '<div class="intro-testimonial-name" style="position:absolute;left:calc(50% + 30px)">' + _esc(_interpolate(t.title)) + '</div>' : '') +
      '</div>'
  }

  // ── Intro HTML (Premium Clean — configuravel) ─────────────────────────────
  function _buildIntroHTML() {
    var intro      = (_schema.intro) || {}
    var clinicName = (_quiz && _quiz.title) || 'Clinica'
    var initial    = clinicName.charAt(0).toUpperCase()
    var logoUrl    = intro.logo_url || ''
    var coverUrl   = intro.image_url || ''
    var videoUrl   = intro.video_url || ''

    // Configuracoes
    var bgColor      = intro.bg_color || '#F4F3F8'
    var ctaColor     = intro.cta_color || '#5B6CFF'
    var ctaStyle     = intro.cta_style || 'gradient'
    var coverHeight  = parseInt(intro.cover_height) || 320
    var coverAspect  = intro.image_aspect || '16:9'
    var showDivider  = intro.show_divider !== false

    // CTA background por estilo
    var ctaBg = ctaStyle === 'gradient'
      ? 'linear-gradient(135deg, ' + ctaColor + ', ' + _adjustColor(ctaColor, 30) + ')'
      : ctaStyle === 'outline' ? 'transparent' : ctaColor
    var ctaBorder = ctaStyle === 'outline' ? '2px solid ' + ctaColor : 'none'
    var ctaTextColor = ctaStyle === 'outline' ? ctaColor : '#FFFFFF'

    // Logo — so mostra se tem URL, senao nao renderiza nada
    var logoHtml = logoUrl
      ? '<img src="' + _esc(_resolveImgUrl(logoUrl)) + '" alt="Logo">'
      : ''

    // Divider — so mostra se tem logo E divider ativo
    var dividerHtml = (showDivider && logoUrl) ? '<div class="intro-divider"></div>' : ''

    // Media (video > image)
    // aspect: '9:16' = reels, '16:9' = paisagem, '1:1' = quadrado, '65' = retrato
    var mediaHtml = ''
    var coverFit = ((_schema.appearance || {}).cover_fit) || 'cover'
    var coverFocus = intro.image_focus || 'center center'
    var coverZoom = intro.image_zoom ? 'transform:scale(' + (intro.image_zoom/100) + ');' : ''
    var coverRadius = (intro.image_radius || '12') + 'px'
    var videoEmbed = _resolveVideoEmbed(videoUrl, intro.video_autoplay !== false)

    if (videoEmbed) {
      if (coverAspect === '9:16') {
        mediaHtml = '<div class="intro-media-reels"><iframe src="' + _esc(videoEmbed) + '" style="width:100%;height:100%;border:0;display:block" allowfullscreen></iframe></div>'
      } else {
        mediaHtml = '<div class="intro-cover" style="height:' + coverHeight + 'px;overflow:hidden;border-radius:' + coverRadius + '"><iframe src="' + _esc(videoEmbed) + '" style="width:100%;height:100%;border:0;display:block" allowfullscreen></iframe></div>'
      }
    } else if (coverUrl) {
      if (coverAspect === '65') {
        mediaHtml = '<div style="position:relative;width:100%;padding-top:65%;border-radius:' + coverRadius + ';overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10),0 1px 6px rgba(0,0,0,0.06);background:#1a1a2e;margin:0 auto 20px"><img src="' + _esc(_resolveImgUrl(coverUrl)) + '" alt="Capa" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:' + _esc(coverFocus) + ';' + coverZoom + 'display:block"></div>'
      } else if (coverAspect === '9:16') {
        mediaHtml = '<div style="max-width:280px;margin:0 auto 20px;border-radius:' + coverRadius + ';overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10)"><img src="' + _esc(_resolveImgUrl(coverUrl)) + '" alt="Capa" style="width:100%;height:auto;display:block;' + coverZoom + '"></div>'
      } else if (coverAspect === '1:1') {
        mediaHtml = '<div class="intro-media-square" style="border-radius:' + coverRadius + ';overflow:hidden"><img src="' + _esc(_resolveImgUrl(coverUrl)) + '" alt="Capa" style="width:100%;height:100%;object-fit:cover;object-position:' + _esc(coverFocus) + ';' + coverZoom + '"></div>'
      } else {
        mediaHtml = '<div style="height:' + coverHeight + 'px;border-radius:' + coverRadius + ';overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10);margin:0 auto 20px"><img src="' + _esc(_resolveImgUrl(coverUrl)) + '" alt="Capa" style="width:100%;height:100%;object-fit:' + coverFit + ';object-position:' + _esc(coverFocus) + ';' + coverZoom + 'display:block"></div>'
      }
    }

    // Authority Badges
    var badges = Array.isArray(intro.badges) ? intro.badges : []
    var badgesHtml = ''
    if (badges.length > 0) {
      var badgeIcons = {
        star:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
        clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        heart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
        shield:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      }
      // Build badge items with dividers, grouped into cards
      // If <=3 badges: one card. If >3: first 2 in one card, rest in another.
      var activeBadges = badges.filter(function(b) { return b.text })
      var badgeItems = activeBadges.map(function(b) {
        var icon = badgeIcons[b.icon] || badgeIcons.star
        var color = b.iconColor || '#6B7280'
        return '<div class="intro-badge"><span style="color:' + _esc(color) + ';display:flex">' + icon + '</span><span>' + _esc(b.text) + '</span></div>'
      })

      function _buildBadgeCard(items) {
        var inner = items.join('<div class="intro-badge-divider"></div>')
        return '<div class="intro-badges-card">' + inner + '</div>'
      }

      if (badgeItems.length <= 3) {
        badgesHtml = '<div class="intro-badges">' + _buildBadgeCard(badgeItems) + '</div>'
      } else {
        var card1 = badgeItems.slice(0, 2)
        var card2 = badgeItems.slice(2)
        badgesHtml = '<div class="intro-badges">' + _buildBadgeCard(card1) + _buildBadgeCard(card2) + '</div>'
      }
    }

    // Countdown
    var countdownSec = parseInt(intro.countdown_seconds) || 0
    var countdownHtml = ''
    if (countdownSec > 0) {
      countdownHtml = '<div class="intro-countdown" id="intro-countdown">' +
        '<div class="intro-countdown-icon">' +
          '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '</div>' +
        '<div class="intro-countdown-text">' +
          '<div class="intro-countdown-label">' + _esc(intro.countdown_text || 'Oferta expira em') + '</div>' +
          '<div class="intro-countdown-timer" id="intro-countdown-timer">' + _fmtCountdown(countdownSec) + '</div>' +
        '</div>' +
      '</div>'
    }

    // Section prompt (pergunta da intro, ex: "Selecione seu genero:")
    var sectionPrompt = intro.section_prompt || ''
    var sectionPromptHtml = sectionPrompt
      ? '<div class="intro-section-prompt">' + _esc(_interpolate(sectionPrompt)) + '</div>'
      : ''

    // Text blocks — blocos de texto customizaveis em qualquer posicao
    var textBlocks = intro.text_blocks || []
    function _blocksAt(pos) {
      return textBlocks.filter(function(b) { return b.after === pos && b.text }).map(function(b) {
        var align = b.align || 'center'
        if (b.variant === 'prompt') {
          return '<div class="intro-text-block variant-prompt" style="color:' + _esc(ctaColor) + ';text-align:' + align + '">' + _esc(_interpolate(b.text)) + '</div>'
        }
        return '<div class="intro-text-block" style="text-align:' + align + '">' + _esc(_interpolate(b.text)) + '</div>'
      }).join('')
    }

    // Checklists
    var checklists = intro.checklists || []
    function _buildChecklistBlock(items) {
      return items.map(function(item, idx) {
        var line = idx < items.length - 1 ? '<hr style="border:none;height:1px;background:#D1D5DB;margin:0">' : ''
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 4px">' +
          '<span style="font-family:Inter,system-ui,sans-serif;font-size:16px;font-weight:500;color:#000;text-align:left;line-height:1.3">' + _esc(_interpolate(item)) + '</span>' +
          '<span style="width:22px;height:22px;min-width:22px;border-radius:50%;background:linear-gradient(135deg,#6854E5,#4881F3);display:flex;align-items:center;justify-content:center;margin-left:10px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>' +
        '</div>' + line
      }).join('')
    }
    function _checklistsAt(pos) {
      var matched = checklists.filter(function(c) { return c.after === pos && c.items && c.items.length })
      if (!matched.length) return ''
      // Single checklist — render as block
      if (matched.length === 1) {
        return '<div style="width:100%;margin:32px 0">' + _buildChecklistBlock(matched[0].items) + '</div>'
      }
      // 2+ checklists — carousel slide lateral
      var id = 'clc-' + pos + '-' + Math.random().toString(36).substr(2,6)
      var slides = matched.map(function(c, i) {
        return '<div data-tc-slide="' + i + '" style="min-width:100%;box-sizing:border-box">' +
          '<div style="width:100%">' + _buildChecklistBlock(c.items) + '</div>' +
        '</div>'
      }).join('')
      var dots = '<div data-tc-dots style="display:flex;justify-content:center;gap:8px;padding:10px 0 4px">' +
        matched.map(function(_, j) {
          return '<button data-tc-dot="' + j + '" style="width:' + (j===0?'22px':'8px') + ';height:8px;border-radius:4px;border:none;padding:0;cursor:pointer;background:' + (j===0?'#111':'#D1D5DB') + ';transition:all 300ms ease"></button>'
        }).join('') + '</div>'
      return '<div data-tc-carousel="' + id + '" style="margin:32px 0;overflow:hidden">' +
        '<div data-tc-track style="display:flex;transition:transform 600ms ease-in-out">' + slides + '</div>' +
        dots + '</div>'
    }

    // Testimonials
    var testimonials = intro.testimonials || []
    function _testimonialsAt(pos) {
      var items = testimonials.filter(function(t) { return t.after === pos && t.body })
      if (!items.length) return ''
      if (items.length === 1) {
        return '<div class="intro-testimonial">' + _buildTestimonialCard(items[0]) + '</div>'
      }
      // Carousel slide lateral
      var id = 'tc-' + pos + '-' + Math.random().toString(36).substr(2,6)
      var slides = items.map(function(t, i) {
        return '<div data-tc-slide="' + i + '" style="min-width:100%;box-sizing:border-box;transition:transform 600ms ease-in-out">' +
          '<div class="intro-testimonial" style="margin:0">' + _buildTestimonialCard(t) + '</div>' +
        '</div>'
      }).join('')
      var dots = '<div data-tc-dots style="display:flex;justify-content:center;gap:8px;padding:10px 0 4px">' +
        items.map(function(_, j) {
          return '<button data-tc-dot="' + j + '" style="width:' + (j===0?'22px':'8px') + ';height:8px;border-radius:4px;border:none;padding:0;cursor:pointer;background:' + (j===0?'#111':'#D1D5DB') + ';transition:all 300ms ease"></button>'
        }).join('') + '</div>'
      return '<div data-tc-carousel="' + id + '" style="margin:32px 0;overflow:hidden">' +
        '<div data-tc-track style="display:flex">' + slides + '</div>' +
        dots +
      '</div>'
    }

    // Before/After Carousel
    var baCarousels = intro.ba_carousels || []
    function _baCarouselsAt(pos) {
      return baCarousels.filter(function(c) { return c.after === pos && c.slides && c.slides.length }).map(function(c) {
        var id = 'ba-' + pos + '-' + Math.random().toString(36).substr(2,6)
        var slidesHtml = c.slides.map(function(s, i) {
          var fb = s.focus_before || 'center 20%'
          var fa = s.focus_after || 'center 20%'
          var zb = s.zoom_before ? 'transform:scale(' + (s.zoom_before/100) + ');' : ''
          var za = s.zoom_after ? 'transform:scale(' + (s.zoom_after/100) + ');' : ''
          return '<div data-ba-slide="' + i + '" style="display:' + (i===0?'flex':'none') + ';opacity:' + (i===0?'1':'0') + ';width:100%;height:100%;position:absolute;top:0;left:0;transition:opacity 800ms ease-in-out">' +
            '<div style="width:50%;height:100%;position:relative;overflow:hidden">' +
              '<img src="' + _esc(_resolveImgUrl(s.before)) + '" alt="Antes" style="width:100%;height:100%;object-fit:cover;object-position:' + _esc(fb) + ';' + zb + 'display:block">' +
              '<div style="position:absolute;bottom:10px;left:10px;background:rgba(0,0,0,0.55);color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:4px 10px;border-radius:6px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)">ANTES</div>' +
            '</div>' +
            '<div style="width:2px;height:100%;background:rgba(255,255,255,0.5);flex-shrink:0;z-index:2"></div>' +
            '<div style="width:50%;height:100%;position:relative;overflow:hidden">' +
              '<img src="' + _esc(_resolveImgUrl(s.after)) + '" alt="Depois" style="width:100%;height:100%;object-fit:cover;object-position:' + _esc(fa) + ';' + za + 'display:block">' +
              '<div style="position:absolute;bottom:10px;right:10px;background:linear-gradient(135deg,rgba(50,215,75,0.65),rgba(91,108,255,0.55));color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:4px 10px;border-radius:6px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)">DEPOIS</div>' +
            '</div>' +
          '</div>'
        }).join('')
        var dotsHtml = '<div data-ba-dots style="display:flex;justify-content:center;gap:8px;padding:12px 0 4px">' +
          c.slides.map(function(_, j) {
            return '<button data-ba-dot="' + j + '" style="width:' + (j===0?'22px':'8px') + ';height:8px;border-radius:4px;border:none;padding:0;cursor:pointer;background:' + (j===0?'#111':'#D1D5DB') + ';transition:all 300ms ease"></button>'
          }).join('') + '</div>'
        return '<div data-ba-carousel="' + id + '" style="width:100%;margin:32px auto;max-width:480px">' +
          '<div style="position:relative;width:100%;padding-top:65%;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10),0 1px 6px rgba(0,0,0,0.06);background:#1a1a2e">' +
            '<div style="position:absolute;top:0;left:0;width:100%;height:100%">' + slidesHtml + '</div>' +
          '</div>' + dotsHtml +
        '</div>'
      }).join('')
    }

    // Collagen Timeline
    var collagenCfg = intro.collagen_timeline || null
    function _collagenAt(pos) {
      if (!collagenCfg || collagenCfg.after !== pos) return ''
      return _buildCollagenTimeline(collagenCfg)
    }

    // Todos os componentes em uma posicao
    function _allAt(pos) {
      return _blocksAt(pos) + _checklistsAt(pos) + _testimonialsAt(pos) + _baCarouselsAt(pos) + _collagenAt(pos)
    }

    // Se o usuario customizou a cor de fundo, aplicar como override
    var wrapStyle = (bgColor && bgColor !== '#F4F3F8')
      ? ' style="background:' + _esc(bgColor) + '"'
      : ''

    return '<div class="screen-inner intro-wrap"' + wrapStyle + '>' +
      '<div class="intro-content">' +
        '<div class="intro-logo">' + logoHtml + '</div>' +
        _allAt('logo') +
        dividerHtml +
        _allAt('divider') +
        '<div class="intro-title" style="text-align:' + _esc(intro.title_align || 'center') + '">' + _esc(_interpolate(intro.title || _quiz.title || 'Quiz')) + '</div>' +
        _allAt('title') +
        ((intro.description && intro.description.trim()) ? '<div class="intro-desc" style="text-align:' + _esc(intro.desc_align || 'center') + '">' + _esc(_interpolate(intro.description)) + '</div>' : '') +
        _allAt('description') +
        badgesHtml +
        _allAt('badges') +
        sectionPromptHtml +
        _allAt('prompt') +
        mediaHtml +
        _allAt('media') +
        countdownHtml +
        _allAt('countdown') +
        _allAt('checklist') +
        _allAt('testimonial') +
        '<div class="intro-brand">' + _esc(intro.brand_text || 'Quiz seguro \u2014 ClinicAI') + '</div>' +
      '</div>' +
      '<div class="intro-cta-wrap">' +
        '<button class="intro-cta" id="btn-start" style="background:' + ctaBg + ';border:' + ctaBorder + ';color:' + ctaTextColor + '">' + _esc(intro.cta_label || 'COMECAR').toUpperCase() + '</button>' +
      '</div>' +
    '</div>'
  }

  // Ajusta cor para criar gradiente (shift hue)
  function _adjustColor(hex, amount) {
    var r = parseInt(hex.slice(1,3), 16)
    var g = parseInt(hex.slice(3,5), 16)
    var b = parseInt(hex.slice(5,7), 16)
    r = Math.min(255, r + amount)
    b = Math.min(255, b + amount)
    return '#' + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)
  }

  function _fmtCountdown(sec) {
    var m = Math.floor(sec / 60)
    var s = sec % 60
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
  }

  var _countdownTimer = null
  var _countdownVisHandler = null

  function _startCountdown() {
    _stopCountdown()
    var el = document.getElementById('intro-countdown-timer')
    if (!el) return
    var intro = (_schema.intro) || {}
    var total = parseInt(intro.countdown_seconds) || 0
    if (total <= 0) return

    var remaining = total

    function _tick() {
      remaining--
      if (remaining <= 0) { _stopCountdown(); el.textContent = '00:00'; return }
      el.textContent = _fmtCountdown(remaining)
    }

    _countdownTimer = setInterval(_tick, 1000)

    _countdownVisHandler = function() {
      if (document.hidden) {
        clearInterval(_countdownTimer)
        _countdownTimer = null
      } else if (!_countdownTimer && remaining > 0) {
        _countdownTimer = setInterval(_tick, 1000)
      }
    }
    document.addEventListener('visibilitychange', _countdownVisHandler)
  }

  function _stopCountdown() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null }
    if (_countdownVisHandler) { document.removeEventListener('visibilitychange', _countdownVisHandler); _countdownVisHandler = null }
  }

  // ── Question HTML ────────────────────────────────────────────────────────────
  function _buildQuestionHTML(step) {
    var q       = _questions[step]
    var current = _getAns(step)

    var backBtn = step > 0
      ? '<button class="q-back-btn" id="btn-back">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
          'Voltar' +
        '</button>'
      : ''

    var bodyHtml = ''

    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      var isMulti = q.type === 'multiple_choice'
      var opts = (q.options || []).map(function(opt, oi) {
        var selected = isMulti
          ? (Array.isArray(current) && current.indexOf(opt.label) !== -1)
          : current === opt.label
        var selClass = selected ? ' selected' : ''
        var indType  = isMulti ? 'check' : 'radio'
        return '<button class="choice-opt' + selClass + '" data-oi="' + oi + '">' +
          '<span class="opt-indicator ' + indType + '"></span>' +
          '<span>' + _esc(opt.label) + '</span>' +
        '</button>'
      }).join('')
      bodyHtml = '<div class="choice-opts" id="choice-opts">' + opts + '</div>'

    } else if (q.type === 'text_input') {
      var val = (typeof current === 'string') ? current : ''
      bodyHtml = '<input type="text" class="q-text-input" id="text-ans" placeholder="' +
        _esc(q.placeholder || 'Sua resposta...') + '" value="' + _esc(val) + '">'

    } else if (q.type === 'scale') {
      var scaleEmojis = ['😕','😐','🙂','😊','😍']
      var scaleLabels = ['1','2','3','4','5']
      var scaleMin = (q.scale_min_label) || 'Pouco'
      var scaleMax = (q.scale_max_label) || 'Muito'
      var btns = scaleEmojis.map(function(em, i) {
        var val     = i + 1
        var selCls  = current === val ? ' selected' : ''
        return '<button class="scale-emoji-btn' + selCls + '" data-val="' + val + '">' +
          '<span>' + em + '</span>' +
          '<span class="scale-emoji-label">' + scaleLabels[i] + '</span>' +
        '</button>'
      }).join('')
      bodyHtml =
        '<div class="scale-wrap">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:#8E8E93">' +
            '<span>' + _esc(scaleMin) + '</span>' +
            '<span>' + _esc(scaleMax) + '</span>' +
          '</div>' +
          '<div class="scale-emojis" id="scale-opts">' + btns + '</div>' +
        '</div>'

    } else if (q.type === 'image_choice') {
      var imgOpts = (q.options || []).map(function(opt, oi) {
        var selected = current === opt.label
        var selClass = selected ? ' selected' : ''
        var imgHtml  = opt.image_url
          ? '<img src="' + _esc(_resolveImgUrl(opt.image_url)) + '" alt="' + _esc(opt.label) + '">'
          : ''
        return '<div class="image-card' + selClass + '" data-oi="' + oi + '">' +
          imgHtml +
          '<div class="image-card-bottom">' +
            '<span class="image-card-label">' + _esc(opt.label) + '</span>' +
            '<span class="image-card-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>' +
          '</div>' +
        '</div>'
      }).join('')
      bodyHtml = '<div class="image-grid" id="img-opts">' + imgOpts + '</div>'

    } else if (q.type === 'contact_name') {
      var val = (typeof current === 'string') ? current : ''
      bodyHtml = '<input type="text" class="contact-input" id="q-contact-name" placeholder="Seu nome completo" value="' + _esc(val) + '" autocomplete="name">'

    } else if (q.type === 'contact_phone') {
      var val = (typeof current === 'string') ? current : ''
      bodyHtml = '<input type="tel" class="contact-input" id="q-contact-phone" placeholder="(XX) XXXXX-XXXX" value="' + _esc(val) + '" autocomplete="tel">'

    } else if (q.type === 'contact_email') {
      var val = (typeof current === 'string') ? current : ''
      bodyHtml = '<input type="email" class="contact-input" id="q-contact-email" placeholder="seu@email.com" value="' + _esc(val) + '" autocomplete="email">'

    } else if (q.type === 'contact_queixas') {
      var selArr = Array.isArray(current) ? current : []
      var queixasOpts = [
        'Rugas na testa', 'P\u00e9 de Galinha', 'Bigode Chin\u00eas', 'Nariz (ponta ca\u00edda)',
        'C\u00f3digo de Barras', 'L\u00e1bios desidratados ou com perda de volume',
        'Flacidez facial', 'Flacidez de P\u00e1lpebras', 'Flacidez na Papada',
        'Poros', 'Cicatrizes de Acne', 'Assimetria facial',
        'Perda de defini\u00e7\u00e3o no contorno do rosto', 'Outro'
      ]
      var opts = queixasOpts.map(function(label, oi) {
        var selected = selArr.indexOf(label) !== -1
        var selClass = selected ? ' selected' : ''
        return '<button class="choice-opt' + selClass + '" data-oi="' + oi + '">' +
          '<span class="opt-indicator check"></span>' +
          '<span>' + _esc(label) + '</span>' +
        '</button>'
      }).join('')
      bodyHtml = '<div class="choice-opts" id="queixas-opts">' + opts + '</div>'
    }

    var descHtml = q.description
      ? '<div class="q-description">' + _esc(_interpolate(q.description)) + '</div>'
      : ''

    // Image choice usa titulo como Section Prompt (mais leve)
    var titleClass = q.type === 'image_choice' ? 'q-section-prompt' : 'q-title'
    var align = q.title_align || 'center'
    var alignStyle = ';text-align:' + align
    var descAlign = q.desc_align || 'center'

    // Question image
    var qImg = q.q_image || {}
    var qImgHtml = ''
    if (qImg.url) {
      var imgRadius = (qImg.radius || '12') + 'px'
      var imgAspect = qImg.aspect || '16:9'
      var imgFocus = qImg.focus || 'center center'
      var imgZoom = qImg.zoom ? 'transform:scale(' + (qImg.zoom/100) + ');' : ''
      var aspectStyle = imgAspect === '1:1' ? 'aspect-ratio:1/1;'
        : imgAspect === '9:16' ? 'max-width:280px;margin:0 auto;'
        : imgAspect === '65' ? 'padding-top:65%;position:relative;'
        : 'aspect-ratio:16/9;'
      var imgFitStyle = imgAspect === '9:16' ? 'width:100%;height:auto;' : 'width:100%;height:100%;object-fit:cover;'
      var imgTag = imgAspect === '65'
        ? '<div style="' + aspectStyle + 'border-radius:' + imgRadius + ';overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10);background:#1a1a2e"><img src="' + _esc(_resolveImgUrl(qImg.url)) + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:' + _esc(imgFocus) + ';' + imgZoom + 'display:block"></div>'
        : '<div style="' + aspectStyle + 'border-radius:' + imgRadius + ';overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10)"><img src="' + _esc(_resolveImgUrl(qImg.url)) + '" style="' + imgFitStyle + 'object-position:' + _esc(imgFocus) + ';' + imgZoom + 'display:block"></div>'
      qImgHtml = '<div style="margin:32px 0;text-align:center">' +
        (qImg.title ? '<div style="font-family:Inter,sans-serif;font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:6px">' + _esc(_interpolate(qImg.title)) + '</div>' : '') +
        imgTag +
        (qImg.desc ? '<div style="font-family:Inter,sans-serif;font-size:13px;color:#8B8BA3;margin-top:6px;line-height:1.4">' + _esc(_interpolate(qImg.desc)) + '</div>' : '') +
      '</div>'
    }
    var qImgPos = qImg.position || 'after_title'

    // Text blocks, Checklists, Testimonials e BA Carousels por questao
    var qTextBlocks = q.text_blocks || []
    var qChecklists = q.checklists || []
    var qTestimonials = q.testimonials || []
    var qBACarousels = q.ba_carousels || []
    var _qCtaColor = ((_schema.intro || {}).cta_color) || '#5B6CFF'

    function _qComponentsAt(position) {
      var html = ''
      // Text blocks
      qTextBlocks.filter(function(b) { return b.position === position && b.text }).forEach(function(b) {
        if (b.variant === 'prompt') {
          html += '<div class="intro-text-block variant-prompt" style="color:' + _esc(_qCtaColor) + '">' + _esc(_interpolate(b.text)) + '</div>'
        } else {
          html += '<div class="intro-text-block">' + _esc(_interpolate(b.text)) + '</div>'
        }
      })
      var qAllItems = []
      qChecklists.forEach(function(c) {
        if (c.position === position && c.items && c.items.length) qAllItems = qAllItems.concat(c.items)
      })
      if (qAllItems.length) {
        var items = qAllItems.map(function(item, idx) {
          var line = idx < qAllItems.length - 1 ? '<hr style="border:none;height:1px;background:#D1D5DB;margin:0">' : ''
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 4px">' +
            '<span style="font-family:Inter,system-ui,sans-serif;font-size:16px;font-weight:500;color:#000;text-align:left;line-height:1.3">' + _esc(_interpolate(item)) + '</span>' +
            '<span style="width:22px;height:22px;min-width:22px;border-radius:50%;background:linear-gradient(135deg,#6854E5,#4881F3);display:flex;align-items:center;justify-content:center;margin-left:10px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>' +
          '</div>' + line
        }).join('')
        html += '<div style="width:100%;margin:32px 0">' + items + '</div>'
      }
      // BA Carousels
      qBACarousels.filter(function(c) { return c.position === position && c.slides && c.slides.length }).forEach(function(c) {
        var cid = 'ba-q-' + Math.random().toString(36).substr(2,6)
        var sHtml = c.slides.map(function(s, i) {
          var fb = s.focus_before || 'center 20%'
          var fa = s.focus_after || 'center 20%'
          var zb = s.zoom_before ? 'transform:scale(' + (s.zoom_before/100) + ');' : ''
          var za = s.zoom_after ? 'transform:scale(' + (s.zoom_after/100) + ');' : ''
          return '<div data-ba-slide="' + i + '" style="display:' + (i===0?'flex':'none') + ';opacity:' + (i===0?'1':'0') + ';width:100%;height:100%;position:absolute;top:0;left:0;transition:opacity 800ms ease-in-out">' +
            '<div style="width:50%;height:100%;position:relative;overflow:hidden"><img src="' + _esc(_resolveImgUrl(s.before)) + '" style="width:100%;height:100%;object-fit:cover;object-position:' + _esc(fb) + ';' + zb + 'display:block"><div style="position:absolute;bottom:10px;left:10px;background:rgba(0,0,0,0.55);color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:4px 10px;border-radius:6px;backdrop-filter:blur(4px)">ANTES</div></div>' +
            '<div style="width:2px;height:100%;background:rgba(255,255,255,0.5);flex-shrink:0;z-index:2"></div>' +
            '<div style="width:50%;height:100%;position:relative;overflow:hidden"><img src="' + _esc(_resolveImgUrl(s.after)) + '" style="width:100%;height:100%;object-fit:cover;object-position:' + _esc(fa) + ';' + za + 'display:block"><div style="position:absolute;bottom:10px;right:10px;background:linear-gradient(135deg,rgba(50,215,75,0.65),rgba(91,108,255,0.55));color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:4px 10px;border-radius:6px;backdrop-filter:blur(4px)">DEPOIS</div></div>' +
          '</div>'
        }).join('')
        var dHtml = '<div data-ba-dots style="display:flex;justify-content:center;gap:8px;padding:12px 0 4px">' + c.slides.map(function(_, j) {
          return '<button data-ba-dot="' + j + '" style="width:' + (j===0?'22px':'8px') + ';height:8px;border-radius:4px;border:none;padding:0;cursor:pointer;background:' + (j===0?'#111':'#D1D5DB') + ';transition:all 300ms ease"></button>'
        }).join('') + '</div>'
        html += '<div data-ba-carousel="' + cid + '" style="width:100%;margin:32px auto;max-width:480px"><div style="position:relative;width:100%;padding-top:65%;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10),0 1px 6px rgba(0,0,0,0.06);background:#1a1a2e"><div style="position:absolute;top:0;left:0;width:100%;height:100%">' + sHtml + '</div></div>' + dHtml + '</div>'
      })
      var qTmItems = qTestimonials.filter(function(t) { return t.position === position && t.body })
      if (qTmItems.length === 1) {
        html += '<div class="intro-testimonial">' + _buildTestimonialCard(qTmItems[0]) + '</div>'
      } else if (qTmItems.length > 1) {
        var tcId = 'tc-q-' + Math.random().toString(36).substr(2,6)
        var tcSlides = qTmItems.map(function(t, i) {
          return '<div data-tc-slide="' + i + '" style="min-width:100%;box-sizing:border-box"><div class="intro-testimonial" style="margin:0">' + _buildTestimonialCard(t) + '</div></div>'
        }).join('')
        var tcDots = '<div data-tc-dots style="display:flex;justify-content:center;gap:8px;padding:10px 0 4px">' +
          qTmItems.map(function(_, j) { return '<button data-tc-dot="' + j + '" style="width:' + (j===0?'22px':'8px') + ';height:8px;border-radius:4px;border:none;padding:0;cursor:pointer;background:' + (j===0?'#111':'#D1D5DB') + ';transition:all 300ms ease"></button>' }).join('') + '</div>'
        html += '<div data-tc-carousel="' + tcId + '" style="margin:32px 0;overflow:hidden"><div data-tc-track style="display:flex">' + tcSlides + '</div>' + tcDots + '</div>'
      }
      // Collagen Timeline
      var qCollagen = q.collagen_timeline || null
      if (qCollagen && qCollagen.position === position) {
        html += _buildCollagenTimeline(qCollagen)
      }
      return html
    }

    return '<div class="screen-inner">' +
      backBtn +
      _qComponentsAt('above') +
      (qImgPos === 'above' ? qImgHtml : '') +
      '<div class="' + titleClass + '" style="' + alignStyle + '">' + _esc(_interpolate(q.title)) + '</div>' +
      (qImgPos === 'after_title' ? qImgHtml : '') +
      (descHtml ? descHtml.replace('class="q-description"', 'class="q-description" style="text-align:' + descAlign + '"') : '') +
      (qImgPos === 'after_desc' ? qImgHtml : '') +
      bodyHtml +
      (qImgPos === 'below' ? qImgHtml : '') +
      _qComponentsAt('below') +
    '</div>'
  }

  // ── Question listeners ───────────────────────────────────────────────────────
  function _attachQuestionListeners(screenEl, step) {
    var q = _questions[step]
    var backBtn = screenEl.querySelector('#btn-back')
    if (backBtn) {
      backBtn.onclick = function() { _goToStep(step - 1) }
    }

    if (q.type === 'single_choice') {
      var opts = screenEl.querySelectorAll('.choice-opt')
      opts.forEach(function(btn) {
        btn.onclick = function() {
          opts.forEach(function(b) { b.classList.remove('selected') })
          btn.classList.add('selected')
          var oi  = parseInt(btn.getAttribute('data-oi'), 10)
          _setAns(step, q.options[oi].label)
          _updateNav()
          setTimeout(function() {
            if (_isStepValid(step)) _goToStep(step + 1)
          }, 300)
        }
      })

    } else if (q.type === 'multiple_choice') {
      if (!Array.isArray(_getAns(step))) _setAns(step, [])
      var opts = screenEl.querySelectorAll('.choice-opt')
      opts.forEach(function(btn) {
        btn.onclick = function() {
          var oi    = parseInt(btn.getAttribute('data-oi'), 10)
          var label = q.options[oi].label
          var arr   = _getAns(step) || []
          var idx   = arr.indexOf(label)
          if (idx === -1) {
            arr.push(label)
            btn.classList.add('selected')
          } else {
            arr.splice(idx, 1)
            btn.classList.remove('selected')
          }
          _setAns(step, arr)
          _updateNav()
        }
      })

    } else if (q.type === 'text_input') {
      var inp = screenEl.querySelector('#text-ans')
      if (inp) {
        inp.addEventListener('input', function() {
          _setAns(step, inp.value)
          _updateNav()
        })
      }

    } else if (q.type === 'scale') {
      var btns = screenEl.querySelectorAll('.scale-emoji-btn')
      btns.forEach(function(btn) {
        btn.onclick = function() {
          btns.forEach(function(b) { b.classList.remove('selected') })
          btn.classList.add('selected')
          _setAns(step, parseInt(btn.getAttribute('data-val'), 10))
          _updateNav()
        }
      })

    } else if (q.type === 'image_choice') {
      var imgClicked = false
      var opts = screenEl.querySelectorAll('.image-card')
      opts.forEach(function(el) {
        el.onclick = function() {
          if (imgClicked) return
          imgClicked = true
          opts.forEach(function(o) { o.classList.remove('selected'); o.classList.add('disabled') })
          el.classList.add('selected')
          el.classList.remove('disabled')
          var oi = parseInt(el.getAttribute('data-oi'), 10)
          _setAns(step, q.options[oi].label)
          _updateNav()
          setTimeout(function() {
            imgClicked = false
            opts.forEach(function(o) { o.classList.remove('disabled') })
            if (_isStepValid(step)) _goToStep(step + 1)
          }, 150)
        }
      })

    } else if (q.type === 'contact_name') {
      var inp = screenEl.querySelector('#q-contact-name')
      if (inp) {
        inp.addEventListener('input', function() {
          _setAns(step, inp.value)
          _leadData.name = inp.value.trim()
          _updateNav()
        })
        inp.addEventListener('blur', function() {
          if (_leadData.name) _trackEvent('step_view', { step_index: step, step_label: q.title || 'Nome' })
        })
      }

    } else if (q.type === 'contact_phone') {
      var inp = screenEl.querySelector('#q-contact-phone')
      if (inp) {
        inp.addEventListener('input', function() {
          inp.value = _maskPhone(inp.value)
          _setAns(step, inp.value)
          _leadData.phone = inp.value.trim()
          _updateNav()
        })
        inp.addEventListener('blur', function() {
          if (_leadData.phone) _trackEvent('step_view', { step_index: step, step_label: q.title || 'WhatsApp' })
        })
      }

    } else if (q.type === 'contact_email') {
      var inp = screenEl.querySelector('#q-contact-email')
      if (inp) inp.addEventListener('input', function() {
        _setAns(step, inp.value)
        _leadData.email = inp.value.trim()
        _updateNav()
      })
    }

    // Collagen timeline slider
    if (q.collagen_timeline) {
      screenEl.addEventListener('collagen-age-selected', function(e) {
        _setAns(step, e.detail.age + ' anos')
        _updateNav()
      })
    }

    if (q.type === 'contact_queixas') {
      var opts = screenEl.querySelectorAll('#queixas-opts .choice-opt')
      opts.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var label = btn.querySelector('span:last-of-type').textContent
          var arr = Array.isArray(_getAns(step)) ? _getAns(step).slice() : []
          var idx = arr.indexOf(label)
          if (idx === -1) {
            arr.push(label)
            btn.classList.add('selected')
          } else {
            arr.splice(idx, 1)
            btn.classList.remove('selected')
          }
          _setAns(step, arr)
          _updateNav()
        })
      })
    }
  }

  // ── Contact HTML ─────────────────────────────────────────────────────────────
  function _buildContactHTML() {
    var fromQ     = _getContactFromAnswers()
    var hasName   = fromQ.name.length > 0
    var hasPhone  = _isValidBRPhone(fromQ.phone)
    var hasEmail  = fromQ.email.length > 0

    // Campo nome: só mostra se não foi coletado via pergunta
    var nameField = hasName
      ? '<input type="hidden" id="contact-name" value="' + _esc(fromQ.name) + '">'
      : '<div class="contact-field">' +
          '<label class="contact-label" for="contact-name">Nome completo <span style="color:#EF4444">*</span></label>' +
          '<input type="text" class="contact-input" id="contact-name" placeholder="Seu nome" autocomplete="name" value="">' +
          '<div class="field-err-msg" id="err-name" style="display:none">Informe seu nome.</div>' +
        '</div>'

    // Campo telefone: só mostra se não foi coletado via pergunta
    var phoneField = hasPhone
      ? '<input type="hidden" id="contact-phone" value="' + _esc(fromQ.phone) + '">'
      : '<div class="contact-field">' +
          '<label class="contact-label" for="contact-phone">WhatsApp <span style="color:#EF4444">*</span></label>' +
          '<input type="tel" class="contact-input" id="contact-phone" placeholder="(XX) XXXXX-XXXX" autocomplete="tel" value="">' +
          '<div class="field-err-msg" id="err-phone" style="display:none">Informe um WhatsApp válido.</div>' +
        '</div>'

    // E-mail: sempre opcional, só mostra se não coletado
    var emailField = hasEmail
      ? '<input type="hidden" id="contact-email" value="' + _esc(fromQ.email) + '">'
      : '<div class="contact-field">' +
          '<label class="contact-label" for="contact-email">E-mail <span style="color:#6B7280;font-weight:400">(opcional)</span></label>' +
          '<input type="email" class="contact-input" id="contact-email" placeholder="seu@email.com" autocomplete="email" value="">' +
        '</div>'

    return '<div class="screen-inner">' +
      '<button class="q-back-btn" id="btn-back">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
        'Voltar' +
      '</button>' +
      '<div class="contact-title">Quase lá!</div>' +
      '<div class="contact-subtitle">Como podemos entrar em contato?</div>' +
      nameField + phoneField + emailField +
      // Honeypot anti-bot (hidden field — bots fill it, humans don't see it)
      '<input id="hp-field" type="text" autocomplete="off" tabindex="-1" style="position:absolute;left:-9999px;opacity:0;height:0;width:0">' +
    '</div>'
  }

  function _attachContactListeners(screenEl) {
    var backBtn = screenEl.querySelector('#btn-back')
    if (backBtn) {
      var prevStep = _questions.length - 1 >= 0 ? _questions.length - 1 : -1
      backBtn.onclick = function() { _goToStep(prevStep) }
    }

    var nameEl  = screenEl.querySelector('#contact-name')
    var phoneEl = screenEl.querySelector('#contact-phone')

    function _onChange() { _updateNav() }

    if (nameEl) {
      nameEl.addEventListener('input', function() {
        _leadData.name = nameEl.value.trim()
        _onChange()
      })
      nameEl.addEventListener('blur', function() {
        if (_leadData.name) _trackEvent('step_view', { step_index: _questions.length, step_label: 'Contato' })
      })
    }
    if (phoneEl) {
      phoneEl.addEventListener('input', function() {
        var raw    = phoneEl.value
        var masked = _maskPhone(raw)
        phoneEl.value = masked
        _leadData.phone = masked.trim()
        _onChange()
      })
      phoneEl.addEventListener('blur', function() {
        if (_leadData.phone) _trackEvent('step_view', { step_index: _questions.length, step_label: 'Contato' })
      })
    }
  }

  // ── LGPD HTML ────────────────────────────────────────────────────────────────
  function _buildLgpdHTML() {
    return '<div class="screen-inner">' +
      '<div class="lgpd-wrap">' +
        '<div class="lgpd-icon-wrap">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
            '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>' +
          '</svg>' +
        '</div>' +
        '<div class="lgpd-heading">Seus dados estão seguros</div>' +
        '<div class="lgpd-sub">Precisamos da sua confirmação antes de continuar.</div>' +
        '<div class="lgpd-box">' +
          '<strong>Proteção de Dados (LGPD)</strong><br><br>' +
          'Suas informações serão usadas exclusivamente para entrar em contato sobre os serviços da clínica, ' +
          'de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). ' +
          'Seus dados não serão compartilhados com terceiros sem o seu consentimento.' +
        '</div>' +
        '<div class="lgpd-check-row" id="lgpd-check-row">' +
          '<div class="lgpd-check-box" id="lgpd-check-box">' +
            '<svg id="lgpd-check-icon" width="12" height="12" fill="none" stroke="#fff" stroke-width="3" viewBox="0 0 24 24" style="display:none"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</div>' +
          '<div class="lgpd-check-label">Estou ciente e concordo com o uso das minhas informações conforme a LGPD.</div>' +
        '</div>' +
        '<button class="lgpd-confirm-btn" id="lgpd-confirm-btn">Confirmar e ver resultado</button>' +
      '</div>' +
    '</div>'
  }

  function _attachLgpdListeners(el) {
    var row     = el.querySelector('#lgpd-check-row')
    var icon    = el.querySelector('#lgpd-check-icon')
    var btn     = el.querySelector('#lgpd-confirm-btn')
    var checked = false

    if (row) {
      row.onclick = function() {
        checked = !checked
        row.classList.toggle('checked', checked)
        if (icon) icon.style.display = checked ? 'block' : 'none'
        if (btn)  btn.classList.toggle('active', checked)
      }
    }

    if (btn) {
      btn.onclick = function() {
        if (!checked) return
        _doSubmit()
      }
    }
  }

  // ── Collagen Timeline ─────────────────────────────────────────────────────
  function _buildCollagenTimeline(config) {
    // Inject range slider CSS once
    if (!document.getElementById('collagen-slider-css')) {
      var style = document.createElement('style')
      style.id = 'collagen-slider-css'
      style.textContent =
        '[data-age-slider]::-webkit-slider-thumb{-webkit-appearance:none;width:36px;height:36px;border-radius:50%;background:#fff;border:3px solid #5B6CFF;box-shadow:0 3px 12px rgba(91,108,255,0.4);cursor:pointer;margin-top:-11px}' +
        '[data-age-slider]::-moz-range-thumb{width:32px;height:32px;border-radius:50%;background:#fff;border:3px solid #5B6CFF;box-shadow:0 3px 12px rgba(91,108,255,0.4);cursor:pointer}' +
        '[data-age-slider]::-webkit-slider-runnable-track{height:14px;border-radius:7px}'
      document.head.appendChild(style)
    }
    config = config || {}
    var imgs = config.images || [
      'https://drive.google.com/thumbnail?id=1g6nasKaKer1SVmvnyVblU26MDaDUoQnP&sz=w400',
      'https://drive.google.com/thumbnail?id=1UVVXFbhNT7YQQG5AF9TYFsDKUVyCuHoi&sz=w400',
      'https://drive.google.com/thumbnail?id=1Fff3ywU87iAwQkZxS6i7fqcOEGt-yfZ7&sz=w400',
      'https://drive.google.com/thumbnail?id=1dYZK5sOOQP30Nv_zF8iSDGexvqXcZi3v&sz=w400',
    ]

    // SVG collagen decline curve path (x: 0-300, y: 0-60, inverted y)
    // peaks at ~x=30 (age 25), declines after x=60 (age 30)
    var curvePath = 'M 0,55 C 20,50 40,8 60,6 C 80,4 90,5 100,8 C 130,14 160,24 190,36 C 220,46 250,52 300,58'

    // Grid lines for the graph (horizontal)
    var gridLines = ''
    for (var gi = 0; gi < 4; gi++) {
      var gy = 15 * gi + 8
      gridLines += '<line x1="0" y1="' + gy + '" x2="300" y2="' + gy + '" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="4,4"/>'
    }

    // X-axis labels
    var xLabels = [
      { x: 30, label: '25' },
      { x: 60, label: '30' },
      { x: 130, label: '40' },
      { x: 200, label: '50' },
      { x: 270, label: '60' },
    ]
    var xLabelHtml = xLabels.map(function(l) {
      return '<text x="' + l.x + '" y="72" text-anchor="middle" fill="#9CA3AF" font-size="9" font-family="Inter,system-ui,sans-serif">' + l.label + '</text>'
    }).join('')

    var html =
      '<div data-collagen-timeline style="' +
        'max-width:380px;margin:0 auto;padding:20px;font-family:Inter,system-ui,sans-serif;' +
        'border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);' +
        'background:rgba(255,255,255,0.95);backdrop-filter:blur(10px)">' +

        // Title
        '<div style="text-align:center;font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:20px;letter-spacing:-0.3px">' +
          'Evolu\u00e7\u00e3o do Col\u00e1geno' +
        '</div>' +

        // Face image area
        '<div style="position:relative;width:160px;height:160px;margin:0 auto 20px;border-radius:50%;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12)">' +
          imgs.map(function(url, i) {
            return '<img data-face-img="' + i + '" src="' + _esc(url) + '" alt="" style="' +
              'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;' +
              'opacity:' + (i === 0 ? '1' : '0') + ';transition:opacity 0.8s ease-in-out">'
          }).join('') +
          // Age overlay
          '<div data-age-label style="' +
            'position:absolute;bottom:0;left:0;right:0;padding:6px 0;' +
            'background:linear-gradient(transparent,rgba(0,0,0,0.6));' +
            'text-align:center;color:#fff;font-size:14px;font-weight:600;letter-spacing:0.5px">' +
            '25 anos' +
          '</div>' +
        '</div>' +

        // Collagen level label + bar
        '<div style="margin-bottom:16px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<span style="font-size:12px;font-weight:600;color:#374151;letter-spacing:0.3px">N\u00edvel de Col\u00e1geno</span>' +
            '<span data-collagen-pct style="font-size:13px;font-weight:700;color:#32D74B;font-variant-numeric:tabular-nums">100%</span>' +
          '</div>' +
          '<div style="width:100%;height:12px;border-radius:6px;background:#F3F4F6;overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,0.08)">' +
            '<div data-collagen-bar style="' +
              'width:100%;height:100%;border-radius:6px;' +
              'background:linear-gradient(90deg,#32D74B,#34D058);' +
              'transition:width 0.3s ease,background 0.3s ease">' +
            '</div>' +
          '</div>' +
        '</div>' +

        // SVG Collagen curve graph
        '<div style="margin-bottom:16px">' +
          '<svg data-collagen-svg viewBox="0 0 300 75" style="width:100%;height:80px;display:block" preserveAspectRatio="xMidYMid meet">' +
            gridLines +
            '<path d="' + curvePath + '" fill="none" stroke="#E5E7EB" stroke-width="1.5"/>' +
            '<path data-curve-path d="' + curvePath + '" fill="none" stroke="url(#collagen-grad)" stroke-width="2.5" stroke-linecap="round"' +
              ' stroke-dasharray="500" stroke-dashoffset="500"/>' +
            '<defs>' +
              '<linearGradient id="collagen-grad" x1="0%" y1="0%" x2="100%" y2="0%">' +
                '<stop offset="0%" stop-color="#32D74B"/>' +
                '<stop offset="50%" stop-color="#FFD60A"/>' +
                '<stop offset="100%" stop-color="#FF453A"/>' +
              '</linearGradient>' +
            '</defs>' +
            xLabelHtml +
          '</svg>' +
        '</div>' +

        // Dynamic text
        '<div data-phase-text style="' +
          'text-align:center;font-size:13px;color:#4B5563;line-height:1.5;' +
          'min-height:40px;margin-bottom:14px;transition:opacity 0.4s ease;font-weight:500">' +
          'Produ\u00e7\u00e3o m\u00e1xima de col\u00e1geno. Pele firme e el\u00e1stica.' +
        '</div>' +

        // Warning badges container
        '<div data-badges-wrap style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;min-height:26px">' +
        '</div>' +

        // Phase 2: Interactive slider (hidden initially)
        '<div data-collagen-interactive style="display:none;margin-top:20px;text-align:center">' +
          '<div style="font-size:16px;font-weight:700;color:#1a1a2e;margin-bottom:4px">Qual \u00e9 a sua idade?</div>' +
          '<div style="font-size:12px;color:#8B8BA3;margin-bottom:16px">Arraste para ver seu n\u00edvel de col\u00e1geno</div>' +
          '<div style="position:relative;padding:0 4px">' +
            '<input data-age-slider type="range" min="18" max="65" value="30" step="1" style="' +
              'width:100%;height:14px;border-radius:7px;outline:none;-webkit-appearance:none;appearance:none;' +
              'background:linear-gradient(90deg,#32D74B 0%,#FFD60A 50%,#FF453A 100%);cursor:pointer;' +
              'touch-action:none;padding:12px 0;box-sizing:content-box">' +
            '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:#9CA3AF;font-weight:600">' +
              '<span>18</span><span>30</span><span>40</span><span>50</span><span>65</span>' +
            '</div>' +
          '</div>' +
          '<div data-age-display style="margin-top:12px;font-size:28px;font-weight:800;color:#1a1a2e">30 anos</div>' +
          '<div data-age-impact style="font-size:13px;color:#4B5563;margin-top:4px;font-weight:500;min-height:20px">Col\u00e1geno em alta produ\u00e7\u00e3o</div>' +
        '</div>' +

      '</div>'

    return html
  }

  function _initCollagenTimeline(root) {
    var container = root.querySelector('[data-collagen-timeline]')
    if (!container) return

    var faceImgs   = container.querySelectorAll('[data-face-img]')
    var ageLabel   = container.querySelector('[data-age-label]')
    var pctLabel   = container.querySelector('[data-collagen-pct]')
    var bar        = container.querySelector('[data-collagen-bar]')
    var curvePath  = container.querySelector('[data-curve-path]')
    var phaseText  = container.querySelector('[data-phase-text]')
    var badgesWrap = container.querySelector('[data-badges-wrap]')

    // Phase definitions
    var phases = [
      { tStart: 0,    tEnd: 2000, ageStart: 18, ageEnd: 34, pctStart: 100, pctEnd: 95,
        face: 0, text: 'Produ\u00e7\u00e3o m\u00e1xima de col\u00e1geno. Pele firme e el\u00e1stica.', badges: [] },
      { tStart: 2000, tEnd: 4000, ageStart: 35, ageEnd: 44, pctStart: 95,  pctEnd: 85,
        face: 1, text: 'In\u00edcio da queda de col\u00e1geno. Primeiras linhas finas aparecem. -5%', badges: ['Rugas finas'] },
      { tStart: 4000, tEnd: 6000, ageStart: 45, ageEnd: 54, pctStart: 85,  pctEnd: 70,
        face: 2, text: 'Perda acelerada. Rugas profundas e flacidez se intensificam. -30%', badges: ['Rugas finas', 'Perda de volume', 'Flacidez'] },
      { tStart: 6000, tEnd: 8000, ageStart: 55, ageEnd: 65, pctStart: 70,  pctEnd: 50,
        face: 3, text: 'Flacidez avan\u00e7ada. Perda de firmeza e contorno facial. -50%', badges: ['Rugas finas', 'Perda de volume', 'Flacidez', 'Rugas profundas'] },
    ]
    var finalText = 'Evitando isso, mantenha uma pele mais jovem com o tratamento certo.'

    // Measure the SVG curve total length
    var pathLen = curvePath ? curvePath.getTotalLength() : 500
    if (curvePath) {
      curvePath.style.strokeDasharray = pathLen
      curvePath.style.strokeDashoffset = pathLen
    }

    var totalDuration = 8000
    var startTime = null
    var lastPhaseIdx = -1
    var animId = null
    var allBadgeLabels = ['Rugas finas', 'Perda de volume', 'Flacidez', 'Rugas profundas']
    var shownBadges = {}

    function lerp(a, b, t) { return a + (b - a) * t }

    function getBarColor(pct) {
      if (pct > 70) return 'linear-gradient(90deg,#32D74B,#34D058)'
      if (pct > 45) return 'linear-gradient(90deg,#FFD60A,#FFCA28)'
      return 'linear-gradient(90deg,#FF453A,#FF6B6B)'
    }

    function getPctColor(pct) {
      if (pct > 70) return '#32D74B'
      if (pct > 45) return '#D97706'
      return '#FF453A'
    }

    function tick(now) {
      if (!startTime) startTime = now
      var elapsed = now - startTime
      var progress = Math.min(elapsed / totalDuration, 1)

      // Determine current phase
      var phase = null
      var phaseIdx = -1
      for (var i = 0; i < phases.length; i++) {
        if (elapsed >= phases[i].tStart && elapsed < phases[i].tEnd) {
          phase = phases[i]
          phaseIdx = i
          break
        }
      }

      // After all phases, hold final state
      if (!phase && elapsed >= totalDuration) {
        phase = phases[phases.length - 1]
        phaseIdx = phases.length - 1
      }

      if (phase) {
        // Phase-local progress (0..1)
        var phaseProgress = Math.min((elapsed - phase.tStart) / (phase.tEnd - phase.tStart), 1)

        // Interpolate values
        var currentPct = Math.round(lerp(phase.pctStart, phase.pctEnd, phaseProgress))
        var currentAge = Math.round(lerp(phase.ageStart, phase.ageEnd, phaseProgress))

        // Update collagen bar
        if (bar) {
          bar.style.width = currentPct + '%'
          bar.style.background = getBarColor(currentPct)
        }

        // Update percentage label
        if (pctLabel) {
          pctLabel.textContent = currentPct + '%'
          pctLabel.style.color = getPctColor(currentPct)
        }

        // Update age label
        if (ageLabel) {
          ageLabel.textContent = currentAge + ' anos'
        }

        // Crossfade face images
        if (faceImgs.length > 0) {
          for (var fi = 0; fi < faceImgs.length; fi++) {
            faceImgs[fi].style.opacity = fi === phase.face ? '1' : '0'
          }
        }

        // Update phase text (only on phase change)
        if (phaseIdx !== lastPhaseIdx) {
          lastPhaseIdx = phaseIdx
          if (phaseText) {
            phaseText.style.opacity = '0'
            setTimeout(function() {
              var txt = (elapsed >= totalDuration) ? finalText : phase.text
              phaseText.textContent = txt
              phaseText.style.opacity = '1'
            }, 300)
          }

          // Show badges for this phase
          if (badgesWrap) {
            phase.badges.forEach(function(label) {
              if (shownBadges[label]) return
              shownBadges[label] = true
              var badge = document.createElement('span')
              badge.style.cssText =
                'display:inline-block;padding:4px 10px;background:#FEF3C7;color:#92400E;' +
                'font-size:11px;font-weight:600;border-radius:12px;opacity:0;' +
                'transform:translateY(6px);transition:opacity 0.5s ease,transform 0.5s ease;' +
                'white-space:nowrap'
              badge.textContent = label
              badgesWrap.appendChild(badge)
              // Trigger animation
              requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                  badge.style.opacity = '1'
                  badge.style.transform = 'translateY(0)'
                })
              })
            })
          }
        }
      }

      // Animate SVG curve (stroke-dashoffset)
      if (curvePath) {
        var curveOffset = pathLen * (1 - progress)
        curvePath.style.strokeDashoffset = Math.max(curveOffset, 0)
      }

      // Continue animation or hold
      if (elapsed < totalDuration) {
        animId = requestAnimationFrame(tick)
      } else {
        // Final state
        if (phaseText && phaseText.textContent !== finalText) {
          phaseText.style.opacity = '0'
          setTimeout(function() {
            phaseText.textContent = finalText
            phaseText.style.opacity = '1'
          }, 300)
        }

        // Phase 2: Show interactive slider after 1s pause
        setTimeout(function() {
          var interactive = container.querySelector('[data-collagen-interactive]')
          if (!interactive) return
          interactive.style.display = 'block'
          interactive.style.opacity = '0'
          interactive.style.transition = 'opacity 0.6s ease'
          requestAnimationFrame(function() { interactive.style.opacity = '1' })

          // Hide badges (clean up for interactive mode)
          if (badgesWrap) badgesWrap.style.display = 'none'

          var slider = container.querySelector('[data-age-slider]')
          var ageDisplay = container.querySelector('[data-age-display]')
          var ageImpact = container.querySelector('[data-age-impact]')

          if (!slider) return

          function updateFromSlider() {
            var age = parseInt(slider.value)

            // Age display
            if (ageDisplay) ageDisplay.textContent = age + ' anos'

            // Determine collagen % and face based on age
            var pct, faceIdx, impact
            if (age <= 25) {
              pct = 100; faceIdx = 0
              impact = 'Produ\u00e7\u00e3o m\u00e1xima de col\u00e1geno. Pele firme e el\u00e1stica.'
            } else if (age <= 34) {
              pct = Math.round(100 - (age - 25) * 0.5); faceIdx = 0
              impact = 'Col\u00e1geno em alta produ\u00e7\u00e3o. In\u00edcio de linhas finas.'
            } else if (age <= 44) {
              pct = Math.round(95 - (age - 35) * 1.5); faceIdx = 1
              impact = 'Queda de col\u00e1geno acelerando. Rugas come\u00e7am a aparecer. -' + (100 - pct) + '%'
            } else if (age <= 54) {
              pct = Math.round(80 - (age - 45) * 2); faceIdx = 2
              impact = 'Perda significativa. Sulcos e flacidez vis\u00edveis. -' + (100 - pct) + '%'
            } else {
              pct = Math.round(60 - (age - 55) * 2.5); faceIdx = 3
              impact = 'Redu\u00e7\u00e3o cr\u00edtica de col\u00e1geno. Flacidez avan\u00e7ada. -' + (100 - pct) + '%'
            }
            pct = Math.max(pct, 20)

            // Update bar
            if (bar) {
              bar.style.width = pct + '%'
              bar.style.background = getBarColor(pct)
            }
            if (pctLabel) {
              pctLabel.textContent = pct + '%'
              pctLabel.style.color = getPctColor(pct)
            }

            // Update face
            for (var fi = 0; fi < faceImgs.length; fi++) {
              faceImgs[fi].style.opacity = fi === faceIdx ? '1' : '0'
            }

            // Update age label on face
            if (ageLabel) ageLabel.textContent = age + ' anos'

            // Update impact text
            if (ageImpact) ageImpact.textContent = impact

            // Update phase text
            if (phaseText) {
              phaseText.textContent = impact
            }

            // Update SVG curve position indicator
            if (curvePath && pathLen) {
              var ageProgress = Math.min((age - 18) / (65 - 18), 1)
              curvePath.style.strokeDashoffset = pathLen * (1 - ageProgress)
            }
          }

          var hasInteracted = false
          slider.addEventListener('input', function() {
            hasInteracted = true
            updateFromSlider()
            // Dispatch event with age for quiz step validation
            container.dispatchEvent(new CustomEvent('collagen-age-selected', { detail: { age: parseInt(slider.value) }, bubbles: true }))
          })
          // Set initial visual state (don't save as answer yet)
          slider.value = 30
          updateFromSlider()

        }, 1000)
      }
    }

    // Use IntersectionObserver to start only when visible
    if (typeof IntersectionObserver !== 'undefined') {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            observer.disconnect()
            animId = requestAnimationFrame(tick)
          }
        })
      }, { threshold: 0.3 })
      observer.observe(container)
    } else {
      // Fallback: start immediately
      animId = requestAnimationFrame(tick)
    }

    // Return cleanup function
    return function cleanup() {
      if (animId) cancelAnimationFrame(animId)
    }
  }

  // ── Thankyou HTML ────────────────────────────────────────────────────────────
  function _buildThankyouHTML() {
    var outro    = (_schema.outro) || {}
    var waPhoneRaw = (outro.wa_phone || '').replace(/\D/g, '')
    var waPhone = waPhoneRaw.length >= 10
      ? (waPhoneRaw.startsWith('55') ? waPhoneRaw : '55' + waPhoneRaw)
      : ''
    var waMsg = encodeURIComponent(_interpolate(outro.wa_message || 'Ola! Acabei de responder o quiz e gostaria de saber mais.'))
    var vidUrl   = outro.video_url   || ''
    var imgUrl   = outro.image_url   || ''
    var autoplay = outro.video_autoplay !== false

    // Mídia: vídeo tem prioridade sobre imagem
    var mediaHtml = ''
    if (vidUrl) {
      var isGdrive = vidUrl.indexOf('drive.google.com') !== -1
      var embedSrc = _resolveVideoEmbed(vidUrl, autoplay)
      if (embedSrc) {
        var iframeAllow = isGdrive
          ? 'autoplay'
          : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        mediaHtml = '<div class="thankyou-video-wrap">' +
          '<iframe src="' + _esc(embedSrc) + '" frameborder="0" allow="' + iframeAllow + '" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>' +
          '</div>'
      }
    } else if (imgUrl) {
      var tyImgFocus = outro.image_focus || 'center center'
      var tyImgZoom = outro.image_zoom ? 'transform:scale(' + (outro.image_zoom/100) + ');' : ''
      var tyImgRadius = (outro.image_radius || '12') + 'px'
      var tyImgAspect = outro.image_aspect || '16:9'
      if (tyImgAspect === '65') {
        mediaHtml = '<div style="position:relative;width:100%;padding-top:65%;border-radius:' + tyImgRadius + ';overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10);background:#1a1a2e;margin-bottom:20px"><img src="' + _esc(_resolveImgUrl(imgUrl)) + '" alt="" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:' + _esc(tyImgFocus) + ';' + tyImgZoom + 'display:block"></div>'
      } else if (tyImgAspect === '9:16') {
        mediaHtml = '<div style="max-width:280px;border-radius:' + tyImgRadius + ';overflow:hidden;margin:0 auto 20px;box-shadow:0 4px 20px rgba(0,0,0,0.10)"><img src="' + _esc(_resolveImgUrl(imgUrl)) + '" alt="" style="width:100%;height:auto;' + tyImgZoom + 'display:block"></div>'
      } else if (tyImgAspect === '1:1') {
        mediaHtml = '<div style="width:70%;max-width:240px;aspect-ratio:1/1;border-radius:' + tyImgRadius + ';overflow:hidden;margin:0 auto 20px;box-shadow:0 4px 20px rgba(0,0,0,0.10)"><img src="' + _esc(_resolveImgUrl(imgUrl)) + '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:' + _esc(tyImgFocus) + ';' + tyImgZoom + 'display:block"></div>'
      } else {
        mediaHtml = '<div style="width:100%;aspect-ratio:16/9;border-radius:' + tyImgRadius + ';overflow:hidden;margin-bottom:20px;box-shadow:0 4px 20px rgba(0,0,0,0.10)"><img src="' + _esc(_resolveImgUrl(imgUrl)) + '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:' + _esc(tyImgFocus) + ';' + tyImgZoom + 'display:block"></div>'
      }
    }

    // Botão personalizado
    var customBtn = (outro.btn_label && outro.btn_url)
      ? '<a class="thankyou-custom-btn" id="thankyou-custom-btn" href="' + _esc(outro.btn_url) + '" target="_blank" rel="noopener" style="background:' + _esc(outro.btn_color || '#111') + ';color:' + _esc(outro.btn_text_color || '#fff') + '">' + _esc(outro.btn_label) + '</a>'
      : ''

    // Button: link alternativo tem prioridade, senão WhatsApp
    var btnHref = outro.btn_link
      ? _esc(outro.btn_link)
      : (waPhone ? 'https://wa.me/' + waPhone + '?text=' + waMsg : '')
    var btnTarget = outro.btn_link ? '_blank' : 'whatsapp_session'
    var btnLabel = _esc(outro.wa_btn_label || 'Falar no WhatsApp')
    var btnBg = _esc(outro.btn_color || '#25D366')
    var btnTxt = _esc(outro.btn_text_color || '#fff')
    var waBtn = btnHref
      ? '<a class="thankyou-wa-btn" id="thankyou-wa-btn" href="' + btnHref + '" target="' + btnTarget + '" rel="noopener" style="background:' + btnBg + ';color:' + btnTxt + ';box-shadow:0 6px 24px ' + btnBg + '50">' +
          btnLabel +
        '</a>'
      : ''

    // Thankyou components — organized by position
    var tySlots = { above_media: '', below_media: '', above_btn: '' }
    var badgeIcons = {
      star:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
      clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
      heart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
      shield:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    }
    // Badges
    var tyBadges = (outro.badges || []).filter(function(b) { return b.text })
    if (tyBadges.length) {
      var tyBadgeItems = tyBadges.map(function(b) {
        var icon = badgeIcons[b.icon] || badgeIcons.star
        var color = b.iconColor || '#6B7280'
        return '<div class="intro-badge"><span style="color:' + _esc(color) + ';display:flex">' + icon + '</span><span>' + _esc(b.text) + '</span></div>'
      })
      var tyBadgeInner = tyBadgeItems.join('<div class="intro-badge-divider"></div>')
      var bPos = outro.badges_position || 'below_media'
      tySlots[bPos] += '<div class="intro-badges" style="margin:16px 0"><div class="intro-badges-card">' + tyBadgeInner + '</div></div>'
    }
    // Text blocks
    ;(outro.text_blocks || []).forEach(function(b) {
      if (!b.text) return
      var color = b.variant === 'prompt' ? (((_schema.intro || {}).cta_color) || '#5B6CFF') : '#6B7280'
      var size = b.variant === 'prompt' ? '18px' : '15px'
      var weight = b.variant === 'prompt' ? '500' : '400'
      var pos = b.position || 'below_media'
      tySlots[pos] += '<div style="text-align:center;font-family:Inter,sans-serif;font-size:' + size + ';font-weight:' + weight + ';color:' + color + ';margin:16px 0;line-height:1.5">' + _esc(_interpolate(b.text)) + '</div>'
    })
    // Checklists
    ;(outro.checklists || []).forEach(function(c) {
      if (!c.items || !c.items.length) return
      var pos = c.position || 'below_media'
      tySlots[pos] += '<div style="width:100%;margin:32px 0">' + c.items.map(function(item, idx) {
        var line = idx < c.items.length - 1 ? '<hr style="border:none;height:1px;background:#D1D5DB;margin:0">' : ''
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 4px">' +
          '<span style="font-family:Inter,sans-serif;font-size:16px;font-weight:500;color:#000;text-align:left;line-height:1.3">' + _esc(_interpolate(item)) + '</span>' +
          '<span style="width:22px;height:22px;min-width:22px;border-radius:50%;background:linear-gradient(135deg,#6854E5,#4881F3);display:flex;align-items:center;justify-content:center;margin-left:10px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>' +
        '</div>' + line
      }).join('') + '</div>'
    })
    // Testimonials
    ;(outro.testimonials || []).filter(function(t) { return t.body }).forEach(function(t) {
      var pos = t.after || 'below_media'
      tySlots[pos] += '<div class="intro-testimonial">' + _buildTestimonialCard(t) + '</div>'
    })
    // Countdown
    var tyCdSec = parseInt(outro.countdown_seconds) || 0
    if (tyCdSec > 0) {
      var cdPos = outro.countdown_position || 'below_media'
      tySlots[cdPos] += '<div class="intro-countdown" id="ty-intro-countdown">' +
        '<div class="intro-countdown-icon"><svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
        '<div class="intro-countdown-text"><div class="intro-countdown-label">' + _esc(outro.countdown_text || 'Oferta expira em') + '</div>' +
        '<div class="intro-countdown-timer" id="ty-countdown-timer">' + _fmtCountdown(tyCdSec) + '</div></div></div>'
    }

    var mainBtn = waBtn

    return '<div class="screen-inner" style="display:flex;flex-direction:column;height:100%">' +
      '<div class="thankyou-wrap" style="flex:1;overflow-y:auto">' +
        '<div class="thankyou-icon">' +
          '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="20 6 9 17 4 12"/>' +
          '</svg>' +
        '</div>' +
        '<div class="thankyou-title">' + _esc(_interpolate(outro.title   || 'Perfeito!')) + '</div>' +
        '<div class="thankyou-msg">'   + _esc(_interpolate(outro.message || 'Nossa equipe entrará em contato em breve.')) + '</div>' +
        tySlots.above_media +
        mediaHtml +
        tySlots.below_media +
      '</div>' +
      tySlots.above_btn +
      (mainBtn ? '<div class="intro-cta-wrap" style="flex-shrink:0">' + mainBtn + '</div>' : '') +
    '</div>'
  }

  // ── Attach global back button ────────────────────────────────────────────────
  function _attachBackBtn() {
    var btn = document.getElementById('btn-back-footer')
    if (!btn) return
    btn.onclick = function() {
      var lgpdStep = _questions.length + 1
      // Se estiver no lgpd, volta para a última pergunta (ou contact se existir)
      if (_currentStep === lgpdStep) {
        var prev = _contactAlreadyCollected() ? _questions.length - 1 : _questions.length
        _goToStep(prev)
        return
      }
      var prev = _currentStep <= 0 ? -1 : _currentStep - 1
      _goToStep(prev)
    }
  }

  // ── Populate header with quiz data ────────────────────────────────────────────
  function _populateHeader() {
    var nameEl = document.getElementById('header-name')
    if (nameEl) nameEl.textContent = _quiz.title || 'Quiz'
  }

  // ── Attach global next button ────────────────────────────────────────────────
  function _attachNextBtn() {
    var btn = document.getElementById('btn-next')
    if (!btn) return
    btn.onclick = function() {
      var step         = _currentStep
      var contactStep  = _questions.length
      var lgpdStep     = _questions.length + 1
      var thankyouStep = _questions.length + 2

      if (step === thankyouStep || step === lgpdStep) return

      if (step === contactStep) {
        // Validate contact fields
        var nameEl  = document.getElementById('contact-name')
        var phoneEl = document.getElementById('contact-phone')
        var errName  = document.getElementById('err-name')
        var errPhone = document.getElementById('err-phone')
        var name  = nameEl  ? nameEl.value.trim()  : ''
        var phone = phoneEl ? phoneEl.value.trim()  : ''
        var valid = true

        if (!name) {
          if (nameEl)  nameEl.classList.add('err')
          if (errName) errName.style.display = 'block'
          valid = false
        } else {
          if (nameEl)  nameEl.classList.remove('err')
          if (errName) errName.style.display = 'none'
        }

        if (!_isValidBRPhone(phone)) {
          if (phoneEl)  phoneEl.classList.add('err')
          if (errPhone) errPhone.style.display = 'block'
          valid = false
        } else {
          if (phoneEl)  phoneEl.classList.remove('err')
          if (errPhone) errPhone.style.display = 'none'
        }

        if (!valid) return
        // Salva antes de destruir o DOM do step de contato
        var emailEl = document.getElementById('contact-email')
        _leadData = {
          name:  name,
          phone: phone,
          email: emailEl ? emailEl.value.trim() : '',
        }
        _goToStep(lgpdStep) // sempre passa pelo LGPD antes de submeter
        return
      }

      // Question steps — locked means required not answered, but we still allow advance if not required
      if (!_isStepValid(step) && _questions[step] && _questions[step].required) {
        _showToast('Por favor, responda antes de continuar.')
        return
      }
      _goToStep(step + 1)
    }
  }

  // ── Attach intro start button (delegated, screen not in DOM yet) ─────────────
  function _attachIntroBtn() {
    document.getElementById('screens-wrap').addEventListener('click', function(e) {
      var startBtn = e.target.closest && e.target.closest('#btn-start')
      if (!startBtn) startBtn = (e.target.id === 'btn-start') ? e.target : null
      if (startBtn) {
        _stopCountdown()
        _trackEvent('quiz_start')
        if (window.QuizPixels) QuizPixels.fire('InitiateQuiz', { quiz_title: _quiz.title })
        _goToStep(0)
      }
    })
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function _init() {
    _captureUtms()
    _sessionId = _generateSessionId()
    var slug = _getParam('q')
    if (!slug) {
      _showError('Quiz não encontrado', 'Nenhum quiz foi especificado na URL.')
      return
    }

    try {
      _quiz   = await _loadQuiz(slug)
      _schema = _quiz.schema || {}
      _questions = Array.isArray(_schema.questions) ? _schema.questions : []

      // Garantir IDs nas perguntas (quizzes legados)
      if (window.QuizId) QuizId.ensureIds(_questions)

      _applyTheme()

      // Init pixels (Facebook, Google, TikTok)
      if (window.QuizPixels && _schema.pixels) QuizPixels.init(_schema.pixels)

      // Track page view (quiz carregou com sucesso)
      _trackEvent('page_view')
      if (window.QuizPixels) QuizPixels.fire('PageView')

      // Show quiz view
      var ss = document.getElementById('state-screen')
      var qv = document.getElementById('quiz-view')
      if (ss) ss.style.display = 'none'
      if (qv) qv.style.display = 'flex'

      _populateHeader()
      _attachNextBtn()
      _attachBackBtn()
      _attachIntroBtn()

      // Render intro screen
      _quizStartTime = Date.now()
      _goToStep(-1)

    } catch (err) {
      _showError('Quiz indisponível', err.message || 'Não foi possível carregar o quiz.')
    }
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init)
  } else {
    _init()
  }

})()
