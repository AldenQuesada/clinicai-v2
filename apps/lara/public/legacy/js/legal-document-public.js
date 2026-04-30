/**
 * ClinicAI — Legal Document Public Page (Premium)
 *
 * Pagina publica para assinatura digital de documentos legais.
 * Acesso via token: legal-document.html#slug=X&token=Y
 *
 * 4 etapas com stepper visual:
 *   1. Identificacao — confirma nome e CPF
 *   2. Documento — texto completo, scroll obrigatorio
 *   3. Assinatura — canvas touch com linha guia
 *   4. Confirmacao — checkbox + submit
 *
 * Lei 14.063/2020 — assinatura eletronica simples
 */
;(function () {
  'use strict'

  // ── State ──────────────────────────────────────────────────
  var _sb = null
  var _slug = ''
  var _token = ''
  var _doc = null
  var _step = 0
  var _signerName = ''
  var _signerCpf = ''
  var _scrolledToBottom = false
  var _signatureData = ''
  var _accepted = false
  var _submitting = false
  var _geoloc = null
  var _errorMsg = ''

  // ── Toast system ──────────────────────────────────────────
  var _toastTimer = null
  function _toast(msg, type) {
    var el = document.getElementById('ldToast')
    if (!el) return
    el.textContent = msg
    el.className = 'ld-toast ' + (type || 'error')
    clearTimeout(_toastTimer)
    requestAnimationFrame(function () { el.classList.add('show') })
    _toastTimer = setTimeout(function () { el.classList.remove('show') }, 3500)
  }

  // ── Stepper ───────────────────────────────────────────────
  var STEP_ICONS = [
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
  ]
  var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>'

  function _renderStepper() {
    var el = document.getElementById('ldStepper')
    if (!el) return
    if (_step <= 0 || _step > 4) { el.style.display = 'none'; return }
    el.style.display = 'flex'

    var html = ''
    for (var i = 1; i <= 4; i++) {
      var cls = i < _step ? 'done' : i === _step ? 'active' : 'pending'
      var icon = i < _step ? CHECK_SVG : STEP_ICONS[i - 1]
      html += '<div class="ld-step-item">'
        + '<div class="ld-step-dot ' + cls + '">' + icon + '</div>'
        + (i < 4 ? '<div class="ld-step-line' + (i < _step ? ' done' : '') + '"></div>' : '')
        + '</div>'
    }
    el.innerHTML = html
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    var hash = window.location.hash.substring(1)
    var params = {}
    hash.split('&').forEach(function (p) {
      var parts = p.split('=')
      if (parts.length === 2) params[parts[0]] = decodeURIComponent(parts[1])
    })

    _slug = params.slug || ''
    _token = params.token || ''

    if (!_slug || !_token) {
      _errorMsg = 'Link invalido. Solicite um novo link ao consultorio.'
      _step = -1
      _render()
      return
    }

    if (!window.ClinicEnv) {
      _errorMsg = 'Configuracao nao encontrada.'
      _step = -1
      _render()
      return
    }

    _sb = window.supabase.createClient(ClinicEnv.SUPABASE_URL, ClinicEnv.SUPABASE_KEY)

    // Geolocalizacao so sera solicitada na etapa de assinatura (com consentimento)
    _geoloc = null

    _step = 0
    _render()
    _loadClinicConfig()
    _validateToken()
  }

  // ── Carregar config de redirect ─────────────────────────────
  // LGPD Art. 11: pixels 3rd-party (FB/GA/GTM/TikTok) REMOVIDOS desta pagina.
  // A pagina renderiza PII sensivel (nome, CPF, profissional, hash do documento)
  // e qualquer pageview de pixel vaza esses dados a Meta/Google/ByteDance
  // sem consentimento inequivoco — violacao do artigo sobre dados sensiveis
  // de saude. Se tracking for necessario no futuro, deve ser:
  //   1. Disparado APENAS apos assinatura (step 5).
  //   2. Sem PII no payload (usar hash SHA-256 anonimo do request_id).
  //   3. Com banner de consent visivel antes do step 1.
  //   4. Em scope server-side (Conversions API), nunca client pixel bruto.
  // Ver code-review/legal-docs.md C1, H6, M6.
  async function _loadClinicConfig() {
    try {
      var templateRedirect = null

      // 1. Redirect_url do template especifico
      var reqRes = await _sb.from('legal_doc_requests').select('template_id').eq('public_slug', _slug).single()
      if (reqRes.data && reqRes.data.template_id) {
        var tmplRes = await _sb.from('legal_doc_templates').select('redirect_url').eq('id', reqRes.data.template_id).single()
        if (tmplRes.data) templateRedirect = tmplRes.data.redirect_url
      }

      // 2. Config global da clinica — somente dados publicos para UX
      var clinicRes = await _sb.from('clinics').select('settings,website,whatsapp,phone').limit(1).single()
      if (clinicRes.data) {
        var waNum = (clinicRes.data.whatsapp || clinicRes.data.phone || '').replace(/\D/g, '')
        if (waNum && !waNum.startsWith('55')) waNum = '55' + waNum
        if (waNum) window._ldClinicWhatsApp = waNum
      }
      var gs = clinicRes.data ? (clinicRes.data.settings || {}) : {}

      // Redirect: template > clinica > website
      window._ldRedirectUrl = templateRedirect || gs.consent_redirect_url || (clinicRes.data && clinicRes.data.website) || ''

    } catch (e) { console.warn('[LegalDocs] Config load error:', e.message) }
  }

  // ── Validate token ─────────────────────────────────────────
  async function _validateToken() {
    try {
      var res = await _sb.rpc('legal_doc_validate_token', { p_slug: _slug, p_token: _token, p_ip: null })

      if (res.error) {
        _errorMsg = res.error.message || 'Erro ao validar documento.'
        _step = -1
        _render()
        return
      }

      var data = res.data
      if (!data || !data.ok) {
        _errorMsg = data ? data.error : 'Documento nao encontrado.'
        _step = -1
        _render()
        return
      }

      _doc = data.data
      _signerName = _doc.patient_name || ''
      // So pre-preencher CPF se for valido (evita 000.000.000-00)
      var rawCpf = (_doc.patient_cpf || '').replace(/\D/g, '')
      _signerCpf = (rawCpf && rawCpf.length === 11 && !/^(\d)\1{10}$/.test(rawCpf)) ? _formatCpf(rawCpf) : ''

      document.getElementById('ldHeaderSub').textContent = _doc.professional_name ? 'Dr(a). ' + _doc.professional_name : 'Consentimento Digital'

      // LGPD/XSS: remove token+slug do URL apos validacao para evitar
      // leakage via extensions, screenshots, share. Ver legal-docs.md C2.
      try {
        if (window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState(null, '', window.location.pathname)
        }
      } catch (e) { /* silencioso */ }

      _step = 1
      _render()
    } catch (e) {
      _errorMsg = 'Erro de conexao. Verifique sua internet.'
      _step = -1
      _render()
    }
  }

  // ── Render ─────────────────────────────────────────────────
  function _render() {
    var root = document.getElementById('ldRoot')
    if (!root) return

    var progress = { 0: 0, 1: 25, 2: 50, 3: 75, 4: 90, 5: 100, '-1': 0 }
    var pEl = document.getElementById('ldProgress')
    if (pEl) pEl.style.width = (progress[_step] || 0) + '%'

    _renderStepper()

    if (_step === 0) { root.innerHTML = _renderLoading(); return }
    if (_step === -1) { root.innerHTML = _renderError(); return }
    if (_step === 5) {
      root.innerHTML = _renderSuccess()
      _fireConversionEvents()
      var stepperEl = document.getElementById('ldStepper')
      if (stepperEl) stepperEl.style.display = 'none'
      return
    }

    var html = '<div class="ld-card">'
    if (_step === 1) html += _renderStep1()
    if (_step === 2) html += _renderStep2()
    if (_step === 3) html += _renderStep3()
    if (_step === 4) html += _renderStep4()
    html += '</div>'

    root.innerHTML = html

    if (_step === 2) _bindScrollDetection()
    if (_step === 3) _initCanvas()
  }

  // ── Step 1: Identificacao ──────────────────────────────────
  function _renderStep1() {
    var firstName = (_signerName || '').split(' ')[0]
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 1 de 4</div>'
      + '<div class="ld-step-title">Identifica&#231;&#227;o</div>'
      + '<div class="ld-step-desc">' + (firstName ? firstName + ', confirme' : 'Confirme') + ' seus dados pessoais para prosseguir com a assinatura.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div class="ld-field"><label class="ld-label" for="ldName">Nome completo</label>'
      + '<input class="ld-input" id="ldName" value="' + _esc(_signerName) + '" placeholder="Seu nome completo" autocomplete="name" /></div>'
      + '<div class="ld-field"><label class="ld-label" for="ldCpf">CPF</label>'
      + '<input class="ld-input" id="ldCpf" value="' + _esc(_signerCpf) + '" placeholder="000.000.000-00" inputmode="numeric" oninput="this.value=window._ldFormatCpf(this.value)" maxlength="14" autocomplete="off" /></div>'
      + '<button class="ld-btn ld-btn-primary" onclick="window._ldNext(1)">Continuar</button>'
      + '</div>'
  }

  // ── Step 2: Documento ──────────────────────────────────────
  function _renderStep2() {
    var firstName = (_signerName || '').split(' ')[0]
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 2 de 4</div>'
      + '<div class="ld-step-title">Leia o Documento</div>'
      + '<div class="ld-step-desc">' + (firstName ? firstName + ', role' : 'Role') + ' at&#233; o final do documento para poder continuar.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div class="ld-doc-text" id="ldDocText">' + _sanitize(_doc.content || '') + '</div>'
      + '<div class="ld-scroll-hint" id="ldScrollHint">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><polyline points="6 9 12 15 18 9"/></svg>'
      + ' Role at&#233; o final para continuar</div>'
      + '<button class="ld-btn ld-btn-primary" id="ldDocNext" onclick="window._ldNext(2)"'
      + (_scrolledToBottom ? '' : ' disabled') + '>'
      + (_scrolledToBottom ? 'Li e desejo continuar' : 'Role at&#233; o final para continuar')
      + '</button>'
      + '<button class="ld-btn ld-btn-secondary" onclick="window._ldBack(2)">Voltar</button>'
      + '</div>'
  }

  // ── Step 3: Assinatura ─────────────────────────────────────
  function _renderStep3() {
    var firstName = (_signerName || '').split(' ')[0]
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 3 de 4</div>'
      + '<div class="ld-step-title">Sua Assinatura</div>'
      + '<div class="ld-step-desc">' + (firstName ? firstName + ', desenhe' : 'Desenhe') + ' sua assinatura no campo abaixo usando o dedo ou o mouse.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div class="ld-sig-container" id="ldSigContainer">'
      + '<canvas class="ld-sig-canvas" id="ldSigCanvas" width="500" height="200"></canvas>'
      + '<div class="ld-sig-guide"></div>'
      + '<div class="ld-sig-placeholder" id="ldSigPlaceholder">'
      + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>'
      + 'Toque ou clique para assinar</div>'
      + '</div>'
      + '<div class="ld-sig-actions"><button class="ld-sig-clear" onclick="window._ldClearSig()">Limpar assinatura</button></div>'
      + '<button class="ld-btn ld-btn-primary" onclick="window._ldNext(3)" style="margin-top:16px">Continuar</button>'
      + '<button class="ld-btn ld-btn-secondary" onclick="window._ldBack(3)">Voltar</button>'
      + '</div>'
  }

  // ── Step 4: Confirmacao ────────────────────────────────────
  function _renderStep4() {
    var firstName = (_signerName || '').split(' ')[0]
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 4 de 4</div>'
      + '<div class="ld-step-title">Confirma&#231;&#227;o Final</div>'
      + '<div class="ld-step-desc">' + (firstName ? firstName + ', revise' : 'Revise') + ' todos os dados e confirme a assinatura.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div style="padding:16px;background:linear-gradient(135deg,#FAFBFC,#F3F4F6);border-radius:14px;margin-bottom:16px;font-size:13px">'
      + '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E7EB"><span style="color:#6B7280">Paciente</span><span style="font-weight:600">' + _esc(_signerName) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E7EB"><span style="color:#6B7280">CPF</span><span style="font-weight:600">' + _esc(_signerCpf) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E7EB"><span style="color:#6B7280">Profissional</span><span style="font-weight:600">' + _esc(_doc.professional_name || '-') + '</span></div>'
      + (_doc.professional_reg ? '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #E5E7EB"><span style="color:#6B7280">Registro</span><span style="font-weight:600">' + _esc(_doc.professional_reg) + '</span></div>' : '')
      + '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#6B7280">Data</span><span style="font-weight:600">' + new Date().toLocaleDateString('pt-BR') + '</span></div>'
      + '</div>'
      + '<div style="text-align:center;padding:16px;border:1.5px solid #E5E7EB;border-radius:14px;margin-bottom:16px;background:#fff">'
      + '<div style="font-size:10px;color:#9CA3AF;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;font-weight:600">Sua assinatura</div>'
      + '<img src="' + _signatureData + '" style="max-width:220px;height:auto" />'
      + '</div>'
      + '<label class="ld-check" onclick="window._ldToggleAccept()">'
      + '<input type="checkbox" id="ldAccept" ' + (_accepted ? 'checked' : '') + ' />'
      + '<span class="ld-check-text">Li, compreendi e concordo com todos os termos deste documento. Declaro que as informa&#231;&#245;es prestadas s&#227;o verdadeiras.</span>'
      + '</label>'
      + '<div style="font-size:9px;color:#9CA3AF;margin-bottom:14px;text-align:center;font-family:monospace">Hash: ' + (_doc.document_hash || '').substring(0, 16) + '...</div>'
      + '<button class="ld-btn ld-btn-primary" onclick="window._ldSubmit()"'
      + (_accepted && !_submitting ? '' : ' disabled') + '>'
      + (_submitting ? '<span style="display:inline-flex;align-items:center;gap:8px"><span class="ld-loading-spinner" style="width:18px;height:18px;border-width:2px;margin:0"></span> Registrando assinatura...</span>' : 'Assinar Documento')
      + '</button>'
      + '<button class="ld-btn ld-btn-secondary" onclick="window._ldBack(4)"' + (_submitting ? ' disabled' : '') + '>Voltar</button>'
      + '</div>'
  }

  // ── States ─────────────────────────────────────────────────
  function _renderLoading() {
    return '<div class="ld-card"><div class="ld-loading">'
      + '<div class="ld-loading-spinner"></div>'
      + '<div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px">Carregando documento</div>'
      + '<div style="font-size:12px;color:#9CA3AF">Verificando autenticidade&#8230;</div>'
      + '</div></div>'
  }

  function _renderError() {
    // Removido fallback hardcoded do numero da Mirian — outra clinica usando
    // esta codebase apontaria para o WhatsApp errado. Ver legal-docs.md H5.
    var waNumber = window._ldClinicWhatsApp || ''
    var waMsg = encodeURIComponent('Ol\u00e1, tive dificuldade para acessar meu documento de consentimento. Pode me ajudar?')
    var waLink = waNumber ? ('https://wa.me/' + waNumber + '?text=' + waMsg) : ''

    var contactHtml = waLink
      ? '<a href="' + waLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;margin-top:20px;padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;text-decoration:none;font-family:inherit">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.597-.838-6.326-2.234l-.151-.121-3.297 1.105 1.105-3.297-.121-.151A9.96 9.96 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>'
        + 'Falar com a cl&#237;nica</a>'
      : '<div style="margin-top:20px;padding:12px 16px;background:#F3F4F6;border-radius:10px;font-size:12px;color:#6B7280;line-height:1.6">Entre em contato com o consult&#243;rio que enviou este link.</div>'

    return '<div class="ld-card"><div class="ld-error">'
      + '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      + '<div style="font-size:18px;font-weight:700;margin-bottom:8px;color:#111">Documento Indispon&#237;vel</div>'
      + '<div style="font-size:13px;color:#6B7280;line-height:1.6;max-width:300px;margin:0 auto">' + _esc(_errorMsg) + '</div>'
      + contactHtml
      + '</div></div>'
  }

  function _renderSuccess() {
    var sigDate = new Date().toLocaleString('pt-BR')
    var hashFull = _doc.document_hash || ''
    var hashShort = hashFull.substring(0, 12)

    return '<div class="ld-card"><div class="ld-success">'
      + '<div class="ld-success-check"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="30" stroke-dashoffset="0"><polyline points="20 6 9 17 4 12"/></svg></div>'
      + '<div class="ld-success-title">Documento Assinado</div>'
      + '<div class="ld-success-text">Obrigado, <strong>' + _esc(_signerName.split(' ')[0]) + '</strong>!<br>Sua assinatura foi registrada com sucesso e tem validade jur&#237;dica conforme a Lei 14.063/2020.</div>'

      + '<div class="ld-success-seal">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
      + 'ASSINADO DIGITALMENTE</div>'

      // Comprovante
      + '<div class="ld-success-card">'
      + '<div class="ld-success-card-title">Comprovante de Assinatura</div>'
      + '<div class="ld-success-card-row"><span class="ld-success-card-label">Signatario</span><span class="ld-success-card-value">' + _esc(_signerName) + '</span></div>'
      + '<div class="ld-success-card-row"><span class="ld-success-card-label">CPF</span><span class="ld-success-card-value">' + _esc(_signerCpf) + '</span></div>'
      + '<div class="ld-success-card-row"><span class="ld-success-card-label">Profissional</span><span class="ld-success-card-value">' + _esc(_doc.professional_name || '-') + '</span></div>'
      + '<div class="ld-success-card-row"><span class="ld-success-card-label">Data/Hora</span><span class="ld-success-card-value">' + sigDate + '</span></div>'
      + '</div>'

      // Botao PDF
      + '<div class="ld-success-btns">'
      + '<button class="ld-btn" onclick="window._ldDownloadPdf()" style="background:linear-gradient(135deg,#C9A96E,#D4B978);color:#1a1a2e;font-size:12px;padding:12px">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:6px"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      + 'Baixar Comprovante em PDF</button>'
      + '</div>'

      // Bloco autenticidade + hash explicado
      + '<div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,#F0FDF4,#ECFDF5);border:1px solid #10B98130;border-radius:14px;text-align:left">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
      + '<span style="font-size:12px;font-weight:700;color:#065F46">Autenticidade Garantida</span></div>'
      + '<p style="font-size:11px;color:#374151;line-height:1.7;margin:0 0 10px">'
      + 'Este documento possui um <strong>c&#243;digo de autenticidade exclusivo</strong> (hash SHA-256), gerado automaticamente a partir do conte&#250;do integral do documento. '
      + 'Esse c&#243;digo funciona como uma "impress&#227;o digital": se qualquer caractere do documento for alterado, o c&#243;digo muda completamente.'
      + '</p>'
      + '<p style="font-size:11px;color:#374151;line-height:1.7;margin:0 0 10px">'
      + 'Isso significa que <strong>ningu&#233;m pode modificar</strong> este documento ap&#243;s a assinatura sem que a altera&#231;&#227;o seja detectada. '
      + 'Seu consentimento est&#225; protegido e pode ser verificado a qualquer momento.'
      + '</p>'
      + '<div style="background:#fff;padding:10px 12px;border-radius:8px;border:1px solid #D1FAE5;margin-top:8px">'
      + '<div style="font-size:8px;text-transform:uppercase;letter-spacing:.8px;color:#6B7280;font-weight:700;margin-bottom:4px">Codigo de Autenticidade (SHA-256)</div>'
      + '<div style="font-size:9px;font-family:monospace;color:#1F2937;word-break:break-all;line-height:1.6">' + _esc(hashFull) + '</div>'
      + '</div></div>'

      // Botao Finalizar
      + '<div style="margin-top:16px">'
      + '<button class="ld-btn ld-btn-primary" onclick="window._ldFinish()" style="background:linear-gradient(135deg,#10B981,#059669);color:#fff">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-2px;margin-right:6px"><polyline points="20 6 9 17 4 12"/></svg>'
      + 'Finalizar</button>'
      + '</div>'

      // LGPD
      + '<div class="ld-lgpd">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
      + 'Seus dados estao protegidos pela LGPD (Lei 13.709/2018)</div>'

      + '</div></div>'
  }

  // ── Conversion tracking ─────────────────────────────────────
  // LGPD Art. 11: pixels 3rd-party REMOVIDOS desta pagina. Tracking de
  // conversao agora vive no lado servidor (trigger on legal_doc_requests
  // status=signed -> Conversions API sem PII) — ver legal-docs.md C1/M6.
  // Esta funcao e' preservada como no-op para retro-compatibilidade com
  // _render() no step=5.
  function _fireConversionEvents() { /* intencionalmente vazio — ver comentario acima */ }

  // ── Navigation ─────────────────────────────────────────────
  function _formatCpf(v) {
    var d = v.replace(/\D/g, '').substring(0, 11)
    if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
    if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
    if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, '$1.$2')
    return d
  }

  function _validateCpf(cpf) {
    var d = cpf.replace(/\D/g, '')
    if (d.length !== 11) return false
    if (/^(\d)\1{10}$/.test(d)) return false
    for (var t = 9; t < 11; t++) {
      var sum = 0
      for (var i = 0; i < t; i++) sum += parseInt(d[i]) * ((t + 1) - i)
      var r = ((sum * 10) % 11) % 10
      if (parseInt(d[t]) !== r) return false
    }
    return true
  }

  function _cpfsMatch(a, b) {
    if (!a || !b) return true
    return a.replace(/\D/g, '') === b.replace(/\D/g, '')
  }

  window._ldNext = function (fromStep) {
    if (fromStep === 1) {
      _signerName = (document.getElementById('ldName') || {}).value || ''
      _signerCpf = (document.getElementById('ldCpf') || {}).value || ''

      if (!_signerName.trim()) { _toast('Informe seu nome completo.', 'warning'); return }
      if (!_signerCpf.trim()) { _toast('Informe seu CPF.', 'warning'); return }
      if (!_validateCpf(_signerCpf)) { _toast('CPF inv\u00e1lido. Verifique os d\u00edgitos.', 'error'); return }
      if (_doc.patient_cpf && !_cpfsMatch(_signerCpf, _doc.patient_cpf)) {
        _toast('O CPF informado n\u00e3o corresponde ao cadastrado.', 'error'); return
      }

      _step = 2
    } else if (fromStep === 2) {
      if (!_scrolledToBottom) return
      _step = 3
    } else if (fromStep === 3) {
      var canvas = document.getElementById('ldSigCanvas')
      if (canvas) _signatureData = canvas.toDataURL('image/png')
      if (!_signatureData || _signatureData === 'data:,') { _toast('Desenhe sua assinatura no campo.', 'warning'); return }
      if (_isCanvasBlank(canvas)) { _toast('Desenhe sua assinatura no campo.', 'warning'); return }
      _step = 4
    }
    _render()
  }

  window._ldBack = function (fromStep) {
    if (fromStep === 2) _step = 1
    else if (fromStep === 3) _step = 2
    else if (fromStep === 4) _step = 3
    _render()
  }

  window._ldToggleAccept = function () {
    _accepted = !_accepted
    var el = document.getElementById('ldAccept')
    if (el) el.checked = _accepted
    _render()
  }

  // ── Scroll detection ───────────────────────────────────────
  function _bindScrollDetection() {
    var docText = document.getElementById('ldDocText')
    if (!docText) return

    if (docText.scrollHeight <= docText.clientHeight + 10) {
      _scrolledToBottom = true
      var btn = document.getElementById('ldDocNext')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Li e desejo continuar' }
      return
    }

    var hint = document.getElementById('ldScrollHint')
    if (hint) hint.style.display = 'block'

    docText.addEventListener('scroll', function () {
      if (docText.scrollTop + docText.clientHeight >= docText.scrollHeight - 20) {
        _scrolledToBottom = true
        var btn = document.getElementById('ldDocNext')
        if (btn) { btn.disabled = false; btn.innerHTML = 'Li e desejo continuar' }
        if (hint) hint.style.display = 'none'
      }
    })
  }

  // ── Canvas signature ───────────────────────────────────────
  var _drawing = false
  var _lastX = 0, _lastY = 0

  function _initCanvas() {
    var canvas = document.getElementById('ldSigCanvas')
    if (!canvas) return

    var container = document.getElementById('ldSigContainer')
    var w = container.clientWidth
    var h = Math.max(Math.round(w * 0.4), 180)
    canvas.width = w
    canvas.height = h

    var ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    function getPos(e) {
      var rect = canvas.getBoundingClientRect()
      var touch = e.touches ? e.touches[0] : e
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }

    function startDraw(e) {
      e.preventDefault()
      _drawing = true
      var pos = getPos(e)
      _lastX = pos.x; _lastY = pos.y
      container.classList.add('active')
      var ph = document.getElementById('ldSigPlaceholder')
      if (ph) ph.style.opacity = '0'
    }

    function draw(e) {
      if (!_drawing) return
      e.preventDefault()
      var pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(_lastX, _lastY)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      _lastX = pos.x; _lastY = pos.y
    }

    function stopDraw() { _drawing = false }

    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDraw)
    canvas.addEventListener('mouseleave', stopDraw)
    canvas.addEventListener('touchstart', startDraw, { passive: false })
    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', stopDraw)
  }

  window._ldClearSig = function () {
    var canvas = document.getElementById('ldSigCanvas')
    if (!canvas) return
    var ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    var ph = document.getElementById('ldSigPlaceholder')
    if (ph) ph.style.opacity = '1'
    var container = document.getElementById('ldSigContainer')
    if (container) container.classList.remove('active')
    _signatureData = ''
  }

  function _isCanvasBlank(canvas) {
    if (!canvas) return true
    var ctx = canvas.getContext('2d')
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false
    }
    return true
  }

  // ── Submit ─────────────────────────────────────────────────
  window._ldSubmit = async function () {
    if (!_accepted || _submitting) return
    _submitting = true
    _render()

    // Solicitar geolocalizacao com consentimento (LGPD)
    if (!_geoloc && navigator.geolocation) {
      try {
        await new Promise(function (resolve) {
          navigator.geolocation.getCurrentPosition(
            function (pos) { _geoloc = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }; resolve() },
            function () { resolve() },
            { timeout: 3000 }
          )
        })
      } catch (e) { /* silencioso */ }
    }

    try {
      var res = await _sb.rpc('legal_doc_submit_signature', {
        p_slug: _slug,
        p_token: _token,
        p_signer_name: _signerName.trim(),
        p_signer_cpf: _signerCpf.trim() || null,
        p_signature_data: _signatureData,
        p_ip_address: null,
        p_user_agent: navigator.userAgent.substring(0, 120),
        p_geolocation: _geoloc ? JSON.stringify(_geoloc) : null,
        p_acceptance_text: 'Li, compreendi e concordo com todos os termos deste documento.'
      })

      if (res.error) {
        _toast('Erro: ' + res.error.message, 'error')
        _submitting = false
        _render()
        return
      }

      var data = res.data
      if (!data || !data.ok) {
        _toast(data ? data.error : 'Falha ao registrar assinatura.', 'error')
        _submitting = false
        _render()
        return
      }

      _step = 5
      _submitting = false
      _render()
    } catch (e) {
      _toast('Erro de conexao. Tente novamente.', 'error')
      _submitting = false
      _render()
    }
  }

  // ── Utils ──────────────────────────────────────────────────
  function _esc(s) {
    if (!s) return ''
    var div = document.createElement('div')
    div.textContent = s
    return div.innerHTML
  }

  // Delegacao a ClinicSanitizer.clean — ver js/shared/html-sanitizer.js.
  // allowStyle=true: documentos legais podem precisar de negrito/italico/
  // alinhamento via style inline. Sanitizado para remover expression/url/@import.
  function _sanitize(html) {
    if (!html) return ''
    if (window.ClinicSanitizer && typeof window.ClinicSanitizer.clean === 'function') {
      return window.ClinicSanitizer.clean(html, { allowStyle: true })
    }
    // Fallback defensivo (ClinicSanitizer ausente) — apenas escape total.
    var tmp = document.createElement('div')
    tmp.textContent = html
    return tmp.innerHTML
  }

  window._ldFormatCpf = _formatCpf

  // ── Finalizar (redirect configuravel via clinics.settings) ─
  window._ldFinish = function () {
    var url = (window._ldRedirectUrl || '').trim()
    // Bloqueia schemes perigosos (javascript:, data:, vbscript:) e protocolos
    // incorretos — evita XSS via admin malicioso configurando redirect.
    // Ver legal-docs.md M8.
    var isSafeRedirect = false
    if (url) {
      if (window.ClinicSanitizer && typeof window.ClinicSanitizer.isSafeUrl === 'function') {
        isSafeRedirect = window.ClinicSanitizer.isSafeUrl(url)
      } else {
        isSafeRedirect = /^https?:\/\//i.test(url)
      }
    }
    if (isSafeRedirect) {
      window.location.href = url
    } else {
      // Fallback: fecha a aba ou vai pro site
      window.close()
      // Se nao conseguiu fechar (restricao do browser), mostra mensagem
      setTimeout(function () {
        var root = document.getElementById('ldRoot')
        if (root) root.innerHTML = '<div class="ld-card"><div class="ld-success" style="padding:60px 28px">'
          + '<div class="ld-success-title" style="color:#10B981">Tudo certo!</div>'
          + '<div class="ld-success-text">Voc&#234; j&#225; pode fechar esta p&#225;gina.</div></div></div>'
      }, 500)
    }
  }

  // ── Download PDF (premium layout) ─────────────────────────
  window._ldDownloadPdf = function () {
    var w = window.open('', '_blank')
    if (!w) { _toast('Permita popups para baixar o PDF.', 'warning'); return }

    var sigDate = new Date().toLocaleString('pt-BR')
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<title>Documento Assinado - ' + _esc(_signerName) + '</title>'
      + '<style>'
      + '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap");'
      + 'body{font-family:"Inter",Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px 24px;color:#111;font-size:13px;line-height:1.8}'
      + 'h2,h3{color:#1a1a2e;margin:20px 0 8px}'
      + 'p{margin-bottom:10px}'
      + 'ul,ol{margin:8px 0;padding-left:24px}'
      + 'li{margin-bottom:4px}'
      + '.header{text-align:center;padding-bottom:20px;border-bottom:2px solid #C9A96E;margin-bottom:24px}'
      + '.header h1{font-size:16px;color:#1a1a2e;margin-bottom:4px}'
      + '.header p{font-size:11px;color:#6B7280;margin:0}'
      + '.sig-box{margin-top:40px;padding:24px;background:#FAFBFC;border:1px solid #E5E7EB;border-radius:12px}'
      + '.sig-box h3{margin-top:0;color:#1a1a2e}'
      + '.sig-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #E5E7EB;font-size:12px}'
      + '.sig-row:last-child{border:none}'
      + '.sig-label{color:#6B7280}'
      + '.sig-value{font-weight:600}'
      + '.sig-img{max-width:280px;max-height:100px;margin:16px 0}'
      + '.seal{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border:2px solid #10B981;border-radius:8px;color:#10B981;font-weight:700;font-size:11px;margin-top:16px}'
      + '.legal{font-size:10px;color:#9CA3AF;margin-top:12px}'
      + '.hash{font-family:monospace;font-size:9px;color:#9CA3AF;margin-top:16px;word-break:break-all;padding:10px;background:#F3F4F6;border-radius:6px}'
      + '@media print{body{margin:20px;padding:20px} .sig-box{break-inside:avoid}}'
      + '</style></head><body>'

      + '<div class="header">'
      + '<h1>' + _esc((_doc && _doc.clinic_name) || 'CL\u00CDNICA') + '</h1>'
      + '<p>Documento assinado digitalmente</p>'
      + '</div>'

      + (_doc && _doc.content ? _sanitize(_doc.content) : '')

      + '<div class="sig-box">'
      + '<h3>COMPROVANTE DE ASSINATURA DIGITAL</h3>'
      + '<div class="sig-row"><span class="sig-label">Signatario</span><span class="sig-value">' + _esc(_signerName) + '</span></div>'
      + '<div class="sig-row"><span class="sig-label">CPF</span><span class="sig-value">' + _esc(_signerCpf) + '</span></div>'
      + '<div class="sig-row"><span class="sig-label">Profissional</span><span class="sig-value">' + _esc(_doc.professional_name || '-') + '</span></div>'
      + '<div class="sig-row"><span class="sig-label">Data/Hora</span><span class="sig-value">' + sigDate + '</span></div>'

    if (_signatureData) {
      html += '<div style="text-align:center"><img class="sig-img" src="' + _signatureData + '" /></div>'
    }

    html += '<div class="seal">ASSINADO DIGITALMENTE</div>'
      + '<div class="legal">Assinatura eletronica simples nos termos da Lei 14.063/2020. Documento com validade juridica.</div>'
      + '<div class="legal">Navegador: ' + _esc(navigator.userAgent.substring(0, 80)) + '</div>'

    if (_doc && _doc.document_hash) {
      html += '<div class="hash">Hash de integridade (SHA-256): ' + _esc(_doc.document_hash) + '</div>'
    }

    html += '</div></body></html>'

    w.document.write(html)
    w.document.close()
    setTimeout(function () { w.print() }, 500)
  }

  // ── Start ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
