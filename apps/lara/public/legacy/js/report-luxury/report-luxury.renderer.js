/**
 * ClinicAI - Report Luxury Renderer
 *
 * Renderiza o report no estilo do prototipo aprovado: paleta brandbook
 * (Champagne + Ivory + Cormorant + Montserrat), estrutura de pagina de
 * vendas (capa, carta, pull quote, credenciais, diagnostico completo,
 * protocolo, comparativo com slider animado, casos, ancoragem,
 * investimento, cashback, inclusos, FAQs, CTA).
 *
 * Substitui FM._exportReport.
 *
 * Slider antes/depois com auto-animacao ping-pong (6s) — pausa no hover,
 * controle manual no drag/click. Codigo herdado de share-fm.html, adaptado
 * para o iframe-friendly do overlay.
 */
;(function () {
  'use strict'
  if (window._reportLuxuryRendererLoaded) return
  window._reportLuxuryRendererLoaded = true

  var FM = window._FM

  // Overrides voláteis usados pelo preview ao vivo do editor admin.
  // Quando setado, T(key) checa este mapa antes do cache do service.
  var _previewOverrides = null

  // T(key) = Template lookup com fallback aos defaults. Suporta HTML.
  // SANITIZADO via ClinicSanitizer — templates editaveis sao HTML mas podem
  // conter XSS armazenado (ver case-gallery-share.md H1). A allowlist cobre
  // tags editoriais (em, strong, br, h1-h6, p, ul, ol, li, table, etc) e
  // bloqueia script/iframe/style/on*/javascript:.
  function T(key) {
    var raw = ''
    if (_previewOverrides && _previewOverrides[key] != null) raw = _previewOverrides[key]
    else if (window.ReportLuxuryTemplates && window.ReportLuxuryTemplates.get) {
      var v = window.ReportLuxuryTemplates.get(key)
      if (v != null) raw = v
      else if (window.ReportLuxuryTemplatesDefaults) raw = window.ReportLuxuryTemplatesDefaults.getDefault(key) || ''
    } else if (window.ReportLuxuryTemplatesDefaults) {
      raw = window.ReportLuxuryTemplatesDefaults.getDefault(key) || ''
    }
    if (!raw) return ''
    if (window.ClinicSanitizer && typeof window.ClinicSanitizer.clean === 'function') {
      return window.ClinicSanitizer.clean(raw, { allowStyle: true })
    }
    return raw
  }

  // Escape SOMENTE para conteudo dinamico (nome de paciente, etc).
  // Templates editaveis ja sao HTML — nao aplicar _esc neles.
  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c] }) }
  // Converte \n em <br> e mantem HTML do template
  function _multiline(s) { return String(s == null ? '' : s).replace(/\n/g, '<br><br>') }

  function _clinicName() { return FM._clinicName ? FM._clinicName() : 'Clinica' }
  function _profName()   { return FM._profName ? FM._profName() : 'Especialista' }
  function _tagline()    { return FM._tagline ? FM._tagline() : 'Harmonia que revela. Precisão que dura.' }

  function _today() {
    var d = new Date()
    var months = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']
    return d.getDate() + ' &middot; ' + months[d.getMonth()] + ' &middot; ' + d.getFullYear()
  }

  // ── Coletor de dados do FM ───────────────────────────────────
  function _collectFmData() {
    var ang = FM._activeAngle || 'front'
    var beforeUrl = (FM._photoUrls && FM._photoUrls[ang]) || null
    var afterUrl  = (FM._afterPhotoByAngle && FM._afterPhotoByAngle[ang]) || null

    var mandibular = null
    if (FM._metricAngles) {
      mandibular = {
        amf:        FM._metricAngles.amf,
        aijLeft:    FM._metricAngles.aij_left,
        aijRight:   FM._metricAngles.aij_right,
        rmz:        FM._metricAngles.rmz,
        label:      FM._metricAngles.classification ? FM._metricAngles.classification.label : null,
      }
    }

    var nasal = {}
    if (FM.Nasal && FM.Nasal.compute) {
      ;['nasofrontal', 'nasolabial', 'nasofacial'].forEach(function (m) {
        var v = FM.Nasal.compute('antes', m)
        if (v != null) nasal[m] = v
      })
    }

    var thirds = null
    if (FM._scanData && FM._scanData.thirds && FM._scanData.thirds.proportions) {
      var p = FM._scanData.thirds.proportions
      thirds = {
        upper:  Math.round((p.upper || 0) * 100),
        middle: Math.round((p.middle || 0) * 100),
        lower:  Math.round((p.lower || 0) * 100),
      }
    } else if (FM._tercoLines) {
      // Fallback aproximado a partir das linhas manuais
      var t = FM._tercoLines
      var sup = (t.brow - t.hairline) || 0
      var mid = (t.noseBase - t.brow) || 0
      var low = (t.chin - t.noseBase) || 0
      var tot = sup + mid + low
      if (tot > 0) thirds = {
        upper:  Math.round((sup / tot) * 100),
        middle: Math.round((mid / tot) * 100),
        lower:  Math.round((low / tot) * 100),
      }
    }

    var symmetry = null
    if (FM._scanData && FM._scanData.symmetry && FM._scanData.symmetry.overall != null) {
      symmetry = Math.round(FM._scanData.symmetry.overall)
    }

    var ricketts = null
    if (FM.Nasal && FM.Nasal.compute) {
      var r = FM.Nasal.compute('antes', 'ricketts')
      if (r) ricketts = { lipUpper: r.lipUpper, lipLower: r.lipLower }
    }

    return {
      angle: ang,
      beforeUrl: beforeUrl,
      afterUrl:  afterUrl,
      mandibular: mandibular,
      nasal: nasal,
      thirds: thirds,
      symmetry: symmetry,
      ricketts: ricketts,
    }
  }

  function _collectAnnotations() {
    return (FM._annotations || []).map(function (a, i) {
      var t = (FM.TREATMENTS || []).find(function (x) { return x.id === a.treatment })
      var z = (FM.ZONES || []).find(function (x) { return x.id === a.zone })
      return {
        i: i + 1,
        zone: z ? z.label : a.zone,
        treatment: t ? t.label : a.treatment,
        units: a.ml,
        unitLabel: t ? t.priceUnit : 'ml',
      }
    })
  }

  // ── ENTRY POINT ──────────────────────────────────────────────
  FM._exportReport = function () {
    if (!FM._lead) { FM._showToast && FM._showToast('Selecione um paciente primeiro.', 'warn'); return }
    if (!window.ReportLuxuryPreExport) { FM._showToast && FM._showToast('Modulo pre-export nao carregado', 'error'); return }

    var input = {
      leadName:       FM._lead.nome || FM._lead.name || 'Paciente',
      leadAge:        FM._lead.idade || FM._lead.age,
      leadGender:     FM._lead.genero || 'F',
      annotations:    FM._annotations || [],
      clinicName:     _clinicName(),
      profName:       _profName(),
      tagline:        _tagline(),
    }

    // Garante que templates estao carregados antes de abrir o modal
    var preload = (window.ReportLuxuryTemplates && window.ReportLuxuryTemplates.load)
      ? window.ReportLuxuryTemplates.load()
      : Promise.resolve()
    preload.then(function () {
      window.ReportLuxuryPreExport.open(input, function (payload) {
        if (!payload) return
        _renderOverlay(payload)
      })
    })
  }

  function _renderOverlay(payload) {
    if (document.getElementById('fmReportOverlay')) document.getElementById('fmReportOverlay').remove()
    var fmData = _collectFmData()
    var annotations = _collectAnnotations()

    var overlay = document.createElement('div')
    overlay.id = 'fmReportOverlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#1a1817;overflow-y:auto;padding:24px 16px 64px'

    var fmt = window.ReportLuxuryPricing.formatBRL

    overlay.innerHTML = _renderToolbar(payload) + _renderDoc(payload, fmData, annotations, fmt)
    document.body.appendChild(overlay)

    _bindToolbar()
    _bindSlider(overlay)
  }

  function _renderToolbar(payload) {
    return '<div style="max-width:760px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;padding:8px 0;color:#F5F0E8;font-family:Montserrat,sans-serif">' +
      '<div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#C8A97E">Plano de harmonia &middot; ' + _esc(payload.input.leadName) + '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="rlxDownloadPng" style="padding:8px 16px;background:#C8A97E;color:#0A0A0A;border:none;font-size:11px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;cursor:pointer">Baixar PNG</button>' +
        '<button id="rlxPrint" style="padding:8px 14px;background:transparent;color:#C8A97E;border:1px solid #C8A97E;font-size:11px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;cursor:pointer">Imprimir</button>' +
        '<button id="rlxClose" style="padding:8px 14px;background:transparent;color:rgba(245,240,232,0.6);border:1px solid rgba(245,240,232,0.2);font-size:11px;cursor:pointer">Fechar</button>' +
      '</div>' +
    '</div>'
  }

  function _bindToolbar() {
    var ov = document.getElementById('fmReportOverlay')
    if (!ov) return
    ov.querySelector('#rlxClose').addEventListener('click', function () { ov.remove() })
    ov.querySelector('#rlxPrint').addEventListener('click', function () { window.print() })
    ov.querySelector('#rlxDownloadPng').addEventListener('click', _downloadPng)
  }

  function _downloadPng() {
    if (!window.html2canvas) { FM._showToast && FM._showToast('html2canvas nao carregado', 'warn'); return }
    var card = document.getElementById('rlxDoc')
    if (!card) return
    FM._showLoading && FM._showLoading('Gerando PNG...')
    window.html2canvas(card, { backgroundColor: '#FEFCF8', scale: 2, useCORS: true, logging: false })
      .then(function (canvas) {
        FM._hideLoading && FM._hideLoading()
        var link = document.createElement('a')
        var name = (FM._lead.nome || FM._lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'plano-harmonia-' + name + '.png'
        link.href = canvas.toDataURL('image/png')
        link.click()
      })
      .catch(function () { FM._hideLoading && FM._hideLoading() })
  }

  function _bindSlider(overlay) {
    var slider = overlay.querySelector('.rlx-compare')
    if (!slider) return
    var wrap = slider.querySelector('.rlx-after-wrap')
    var handle = slider.querySelector('.rlx-handle')
    if (!wrap || !handle) return

    var pct = 50
    var dragging = false
    var paused = false
    var animStart = null
    var rafId = null

    function set(p) {
      pct = Math.max(0, Math.min(100, p))
      wrap.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)'
      handle.style.left = pct + '%'
    }
    function autoTick(ts) {
      if (!animStart) animStart = ts
      var elapsed = (ts - animStart) % 6000  // 6s ciclo completo
      var phase = elapsed / 6000  // 0..1
      // Triangulo: 0 -> 1 -> 0
      var v = phase < 0.5 ? phase * 2 : (1 - phase) * 2
      set(v * 100)
      rafId = requestAnimationFrame(autoTick)
    }
    function startAuto() {
      if (paused || dragging || rafId) return
      animStart = null
      rafId = requestAnimationFrame(autoTick)
    }
    function stopAuto() { if (rafId) { cancelAnimationFrame(rafId); rafId = null } }

    function onMove(clientX) {
      var rect = slider.getBoundingClientRect()
      set(((clientX - rect.left) / rect.width) * 100)
    }
    slider.addEventListener('mousedown', function (e) { dragging = true; stopAuto(); onMove(e.clientX); e.preventDefault() })
    document.addEventListener('mousemove', function (e) { if (dragging) onMove(e.clientX) })
    document.addEventListener('mouseup', function () { if (dragging) { dragging = false; setTimeout(startAuto, 800) } })
    slider.addEventListener('touchstart', function (e) { dragging = true; stopAuto(); if (e.touches[0]) onMove(e.touches[0].clientX) }, { passive: true })
    document.addEventListener('touchmove', function (e) { if (dragging && e.touches[0]) onMove(e.touches[0].clientX) }, { passive: true })
    document.addEventListener('touchend', function () { if (dragging) { dragging = false; setTimeout(startAuto, 800) } })
    slider.addEventListener('mouseenter', function () { paused = true; stopAuto() })
    slider.addEventListener('mouseleave', function () { paused = false; setTimeout(startAuto, 200) })

    set(0)
    setTimeout(startAuto, 800)
  }

  // ── Render do documento ──────────────────────────────────────
  function _renderDoc(payload, fmData, annotations, fmt) {
    return '<div id="rlxDoc">' + _styles() +
      _coverHtml(payload) +
      _letterHtml(payload) +
      _pullquoteHtml() +
      _credentialsHtml() +
      _diagnosisHtml(fmData) +
      _protocolHtml(annotations) +
      _timelineHtml() +
      _visualHtml(fmData) +
      _casesHtml(payload.cases) +
      _anchorHtml(payload.pricing, fmt) +
      _investmentHtml(payload, fmt) +
      (payload.cashbackOn ? _cashbackHtml() : '') +
      _includesHtml(payload.cashbackOn) +
      _faqsHtml() +
      _ctaHtml() +
      _footerHtml(payload) +
    '</div>'
  }

  function _styles() {
    return '<style>' +
      '#rlxDoc { max-width:760px;margin:0 auto;background:#FEFCF8;color:#2C2C2C;font-family:"Montserrat",sans-serif;font-weight:300;line-height:1.6;-webkit-font-smoothing:antialiased;box-shadow:0 40px 100px rgba(0,0,0,0.5) }' +
      '#rlxDoc h1,#rlxDoc h2,#rlxDoc h3 { font-family:"Cormorant Garamond",serif;font-weight:400;color:#2C2C2C }' +
      '#rlxDoc h1 { font-style:italic;font-weight:300;line-height:1.1;letter-spacing:-0.01em }' +
      '#rlxDoc h2 { font-weight:400;line-height:1.15;letter-spacing:-0.005em }' +
      '#rlxDoc h3 { font-family:"Montserrat",sans-serif;font-weight:500;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#C8A97E }' +
      '#rlxDoc em { color:#A8895E;font-style:italic }' +
      '#rlxDoc .fold { padding:96px 64px;border-bottom:1px solid #E8DDD0;position:relative }' +
      '#rlxDoc .fold > * + * { margin-top:24px }' +
      '#rlxDoc .diamond { width:6px;height:6px;background:#C8A97E;transform:rotate(45deg);display:inline-block;margin:0 8px;vertical-align:middle }' +
      // cover
      '#rlxDoc .cover { background:linear-gradient(180deg,#1a1817 0%,#2C2C2C 100%);color:#F5F0E8;padding:120px 64px 96px;text-align:center;position:relative;overflow:hidden }' +
      '#rlxDoc .cover::before { content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(200,169,126,0.12),transparent 60%);pointer-events:none }' +
      '#rlxDoc .cover .logo-mark { font-size:9px;letter-spacing:0.5em;text-transform:uppercase;color:#C8A97E;font-weight:500;margin-bottom:14px }' +
      '#rlxDoc .cover .logo-name { font-family:"Cormorant Garamond",serif;font-weight:300;font-size:48px;letter-spacing:0.02em;color:#F5F0E8;line-height:1 }' +
      '#rlxDoc .cover .logo-rule { width:80px;height:1px;background:#C8A97E;margin:28px auto 32px;opacity:0.5 }' +
      '#rlxDoc .cover .tagline { font-family:"Cormorant Garamond",serif;font-style:italic;font-size:16px;color:rgba(245,240,232,0.65);margin-bottom:72px }' +
      '#rlxDoc .cover .slogan { font-family:"Cormorant Garamond",serif;font-style:italic;font-weight:300;font-size:38px;line-height:1.25;color:#F5F0E8;max-width:580px;margin:0 auto 56px;letter-spacing:-0.005em }' +
      '#rlxDoc .cover .slogan em { color:#C8A97E }' +
      '#rlxDoc .cover .for { font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(245,240,232,0.5);margin-bottom:6px }' +
      '#rlxDoc .cover .patient-name { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:28px;color:#F5F0E8;letter-spacing:0.01em }' +
      '#rlxDoc .cover .date-line { margin-top:48px;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(245,240,232,0.4) }' +
      // letter
      '#rlxDoc .letter h2 { font-size:36px;max-width:540px }' +
      '#rlxDoc .letter .body-text { font-family:"Cormorant Garamond",serif;font-weight:300;font-size:19px;line-height:1.65;color:#4A4A4A;max-width:540px;white-space:pre-wrap }' +
      '#rlxDoc .letter .signature { margin-top:48px;font-family:"Cormorant Garamond",serif;font-style:italic;font-size:22px;color:#2C2C2C }' +
      '#rlxDoc .letter .signature::before { content:"— ";color:#C8A97E }' +
      '#rlxDoc .letter .role { font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A8895E;font-weight:500;margin-top:4px }' +
      // pullquote
      '#rlxDoc .pullquote { background:#2C2C2C;color:#F5F0E8;padding:96px 64px;text-align:center;position:relative }' +
      '#rlxDoc .pullquote::before { content:""";font-family:"Cormorant Garamond",serif;font-style:italic;font-size:140px;color:#C8A97E;line-height:1;opacity:0.35;position:absolute;top:24px;left:50%;transform:translateX(-50%) }' +
      '#rlxDoc .pullquote blockquote { font-family:"Cormorant Garamond",serif;font-style:italic;font-weight:300;font-size:30px;line-height:1.4;color:#F5F0E8;max-width:600px;margin:32px auto 24px;position:relative }' +
      '#rlxDoc .pullquote blockquote em { color:#C8A97E;font-style:italic }' +
      '#rlxDoc .pullquote cite { font-style:normal;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(245,240,232,0.55);font-weight:500 }' +
      // credentials
      '#rlxDoc .credentials { padding:32px 48px;background:#F5F0E8;border-top:1px solid #E8DDD0;border-bottom:1px solid #E8DDD0;display:flex;justify-content:space-around;align-items:center;text-align:center;gap:32px;flex-wrap:wrap }' +
      '#rlxDoc .credentials .item .num { font-family:"Cormorant Garamond",serif;font-style:italic;font-weight:400;font-size:32px;color:#A8895E;line-height:1;margin-bottom:4px }' +
      '#rlxDoc .credentials .item .label { font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#4A4A4A;font-weight:500 }' +
      // diagnosis
      '#rlxDoc .diagnosis { background:#FEFCF8;padding-bottom:64px }' +
      '#rlxDoc .diagnosis h3 { text-align:center;margin-bottom:12px }' +
      '#rlxDoc .diagnosis h2 { text-align:center;font-size:36px;max-width:480px;margin-left:auto;margin-right:auto }' +
      '#rlxDoc .diagnosis .lead { text-align:center;font-family:"Cormorant Garamond",serif;font-style:italic;font-size:17px;color:#4A4A4A;max-width:520px;margin:0 auto 64px;line-height:1.6 }' +
      '#rlxDoc .map-block { margin-bottom:56px;padding-top:48px;border-top:1px solid #E8DDD0 }' +
      '#rlxDoc .map-block:first-of-type { padding-top:0;border-top:none }' +
      '#rlxDoc .map-block .map-header { display:flex;justify-content:space-between;align-items:baseline;margin-bottom:28px;flex-wrap:wrap;gap:12px }' +
      '#rlxDoc .map-block .map-title { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:24px;color:#2C2C2C }' +
      '#rlxDoc .map-block .map-title em { color:#A8895E;font-style:italic }' +
      '#rlxDoc .map-block .map-summary { font-family:"Cormorant Garamond",serif;font-style:italic;font-size:14px;color:#4A4A4A }' +
      '#rlxDoc .map-block .map-summary.good { color:#8A9E88 }' +
      '#rlxDoc .map-block .map-summary.adjust { color:#C4937A }' +
      '#rlxDoc .metrics { display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:#E8DDD0;border:1px solid #E8DDD0 }' +
      '#rlxDoc .metrics.cols-3 { grid-template-columns:repeat(3,1fr) }' +
      '#rlxDoc .metric { background:#F5F0E8;padding:28px 18px;text-align:center }' +
      '#rlxDoc .metric .name { font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#A8895E;font-weight:500;margin-bottom:14px }' +
      '#rlxDoc .metric .value { font-family:"Cormorant Garamond",serif;font-weight:300;font-size:42px;line-height:1;color:#2C2C2C;margin-bottom:6px }' +
      '#rlxDoc .metric .value .deg,#rlxDoc .metric .value .unit { font-size:22px;opacity:0.4;vertical-align:top;margin-left:2px }' +
      '#rlxDoc .metric .ideal { font-size:9px;color:#4A4A4A;opacity:0.6 }' +
      '#rlxDoc .thirds-bar { display:flex;height:60px;background:#E8DDD0;border:1px solid #E8DDD0;overflow:hidden }' +
      '#rlxDoc .thirds-bar .seg { flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#F5F0E8;border-right:1px solid #E8DDD0;padding:8px 6px }' +
      '#rlxDoc .thirds-bar .seg:last-child { border-right:none }' +
      '#rlxDoc .thirds-bar .seg .pct { font-family:"Cormorant Garamond",serif;font-size:22px;color:#2C2C2C }' +
      '#rlxDoc .thirds-bar .seg .lbl { font-size:8px;letter-spacing:0.15em;text-transform:uppercase;color:#4A4A4A;margin-top:4px }' +
      '#rlxDoc .symmetry-gauge { text-align:center;padding:20px 0 }' +
      '#rlxDoc .symmetry-gauge .pct-big { font-family:"Cormorant Garamond",serif;font-weight:300;font-size:64px;color:#8A9E88;line-height:1;margin-bottom:8px }' +
      '#rlxDoc .symmetry-gauge .pct-big .unit { font-size:28px;opacity:0.5;vertical-align:top }' +
      '#rlxDoc .symmetry-gauge .scale { height:4px;background:#E8DDD0;max-width:420px;margin:18px auto 8px }' +
      '#rlxDoc .symmetry-gauge .scale .fill { height:100%;background:#8A9E88 }' +
      '#rlxDoc .symmetry-gauge .scale-label { font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#4A4A4A;opacity:0.7 }' +
      '#rlxDoc .ricketts-row { display:grid;grid-template-columns:1fr auto 100px;gap:18px;align-items:baseline;padding:16px 0;border-bottom:1px solid #E8DDD0 }' +
      '#rlxDoc .ricketts-row:last-child { border-bottom:none }' +
      '#rlxDoc .ricketts-row .lbl { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:16px;color:#2C2C2C }' +
      '#rlxDoc .ricketts-row .val { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:22px;line-height:1;color:#2C2C2C }' +
      '#rlxDoc .ricketts-row .val.good { color:#8A9E88 }' +
      '#rlxDoc .ricketts-row .val.adjust { color:#C4937A }' +
      '#rlxDoc .ricketts-row .status { font-size:9px;letter-spacing:0.2em;text-transform:uppercase;text-align:right;color:#4A4A4A }' +
      // protocol
      '#rlxDoc .protocol h2 { font-size:38px;margin-bottom:16px;max-width:520px }' +
      '#rlxDoc .protocol .lead { font-family:"Cormorant Garamond",serif;font-style:italic;font-size:17px;color:#4A4A4A;max-width:540px;line-height:1.6;margin-bottom:56px }' +
      '#rlxDoc .zones { list-style:none;padding:0 }' +
      '#rlxDoc .zone { display:grid;grid-template-columns:60px 1fr auto;gap:28px;padding:28px 0;border-top:1px solid #E8DDD0;align-items:baseline }' +
      '#rlxDoc .zone:last-child { border-bottom:1px solid #E8DDD0 }' +
      '#rlxDoc .zone .num { font-family:"Cormorant Garamond",serif;font-style:italic;font-weight:300;font-size:36px;color:#C8A97E;line-height:1 }' +
      '#rlxDoc .zone .body .name { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:22px;color:#2C2C2C;margin-bottom:6px;line-height:1.2 }' +
      '#rlxDoc .zone .body .product { font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#4A4A4A;opacity:0.7 }' +
      '#rlxDoc .zone .qty { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:28px;color:#2C2C2C;line-height:1;text-align:right }' +
      '#rlxDoc .zone .qty .unit { font-size:13px;opacity:0.5;margin-left:4px;font-weight:300 }' +
      // timeline 5D
      '#rlxDoc .timeline { background:#FEFCF8 }' +
      '#rlxDoc .timeline h2 { font-size:38px;max-width:520px;margin-bottom:16px }' +
      '#rlxDoc .timeline .lead { font-family:"Cormorant Garamond",serif;font-style:italic;font-size:17px;color:#4A4A4A;max-width:540px;line-height:1.6;margin-bottom:64px }' +
      '#rlxDoc .timeline-track { position:relative;padding-left:28px }' +
      '#rlxDoc .timeline-stage { position:relative;padding-bottom:36px;padding-left:28px }' +
      '#rlxDoc .timeline-stage:last-child { padding-bottom:0 }' +
      '#rlxDoc .timeline-dot { position:absolute;top:6px;left:-6px;width:14px;height:14px;border-radius:50%;background:#C8A97E;box-shadow:0 0 0 4px #FEFCF8,0 0 0 5px #E8DDD0;z-index:2 }' +
      '#rlxDoc .timeline-line { position:absolute;top:24px;left:0;bottom:-12px;width:1px;background:#E8DDD0 }' +
      '#rlxDoc .timeline-body { padding-top:1px }' +
      '#rlxDoc .timeline-when { font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#A8895E;font-weight:600;margin-bottom:8px }' +
      '#rlxDoc .timeline-title { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:22px;color:#2C2C2C;margin-bottom:8px;line-height:1.2 }' +
      '#rlxDoc .timeline-text { font-family:"Cormorant Garamond",serif;font-weight:300;font-style:italic;font-size:16px;color:#4A4A4A;line-height:1.6;max-width:520px }' +
      // visual
      '#rlxDoc .visual { background:#F5F0E8 }' +
      '#rlxDoc .visual h2 { text-align:center;font-size:36px;max-width:460px;margin:0 auto 40px }' +
      '#rlxDoc .rlx-compare { position:relative;width:100%;background:#000;overflow:hidden;user-select:none;touch-action:none;cursor:ew-resize;aspect-ratio:8/5 }' +
      '#rlxDoc .rlx-compare img { display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;-webkit-user-drag:none;position:absolute;inset:0 }' +
      '#rlxDoc .rlx-compare .rlx-after-wrap { position:absolute;inset:0;overflow:hidden;clip-path:inset(0 50% 0 0) }' +
      '#rlxDoc .rlx-compare .rlx-label { position:absolute;top:14px;padding:5px 12px;background:rgba(15,15,15,0.65);backdrop-filter:blur(6px);font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:0.25em;color:#C8A97E;text-transform:uppercase;font-weight:600;z-index:3 }' +
      '#rlxDoc .rlx-compare .rlx-label.before { left:14px }' +
      '#rlxDoc .rlx-compare .rlx-label.after { right:14px }' +
      '#rlxDoc .rlx-compare .rlx-handle { position:absolute;top:0;bottom:0;left:50%;width:2px;background:#C8A97E;transform:translateX(-1px);z-index:2;pointer-events:none }' +
      '#rlxDoc .rlx-compare .rlx-handle::before { content:"";position:absolute;top:50%;left:50%;width:38px;height:38px;background:#C8A97E;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 4px 16px rgba(0,0,0,0.4) }' +
      '#rlxDoc .rlx-compare .rlx-handle::after { content:"";position:absolute;top:50%;left:50%;width:14px;height:14px;background:#0A0A0A;border-radius:2px;transform:translate(-50%,-50%) rotate(45deg) }' +
      '#rlxDoc .visual .placeholder-photos { display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100% }' +
      '#rlxDoc .visual .ph { aspect-ratio:4/5;background:linear-gradient(135deg,#DFC5A0,#A8895E);position:relative;display:flex;align-items:center;justify-content:center;color:rgba(245,240,232,0.6);font-style:italic }' +
      // cases
      '#rlxDoc .cases { background:#FEFCF8;padding:96px 64px }' +
      '#rlxDoc .cases h3 { text-align:center;margin-bottom:14px }' +
      '#rlxDoc .cases h2 { text-align:center;font-size:36px;max-width:520px;margin:0 auto 56px }' +
      '#rlxDoc .case { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:48px }' +
      '#rlxDoc .case-photo { aspect-ratio:4/5;background:linear-gradient(135deg,#DFC5A0,#A8895E);position:relative;overflow:hidden }' +
      '#rlxDoc .case-photo img { width:100%;height:100%;object-fit:cover;display:block }' +
      '#rlxDoc .case-photo .label { position:absolute;top:12px;left:12px;font-size:8px;letter-spacing:0.3em;text-transform:uppercase;color:#F5F0E8;background:rgba(44,44,44,0.55);padding:4px 10px }' +
      '#rlxDoc .case-meta { grid-column:1/-1;display:flex;justify-content:space-between;align-items:baseline;padding:14px 0 0;border-top:1px solid #E8DDD0;font-family:"Cormorant Garamond",serif;font-style:italic;font-size:14px;color:#4A4A4A }' +
      '#rlxDoc .case-meta .who { font-family:"Montserrat",sans-serif;font-style:normal;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2C2C2C;font-weight:500 }' +
      // anchor
      '#rlxDoc .anchor { background:#F5F0E8;text-align:center;padding:80px 64px }' +
      '#rlxDoc .anchor h3 { color:#C8A97E;margin-bottom:14px }' +
      '#rlxDoc .anchor h2 { font-size:32px;max-width:520px;margin:0 auto 56px }' +
      '#rlxDoc .anchor .compare-rows { max-width:480px;margin:0 auto;border-top:1px solid #E8DDD0 }' +
      '#rlxDoc .anchor .row { display:flex;justify-content:space-between;align-items:baseline;padding:24px 0;border-bottom:1px solid #E8DDD0;font-size:14px;color:#4A4A4A;font-weight:300 }' +
      '#rlxDoc .anchor .row .price { font-family:"Cormorant Garamond",serif;font-size:22px }' +
      '#rlxDoc .anchor .row.highlight { color:#2C2C2C }' +
      '#rlxDoc .anchor .row.highlight .price { color:#A8895E;font-size:26px;font-weight:500 }' +
      '#rlxDoc .anchor .row.highlight .label::before { content:"◆";color:#C8A97E;margin-right:12px;font-size:10px }' +
      '#rlxDoc .anchor .note { margin-top:32px;font-family:"Cormorant Garamond",serif;font-style:italic;font-size:15px;color:#4A4A4A;max-width:460px;margin-left:auto;margin-right:auto }' +
      // investment
      '#rlxDoc .investment { background:linear-gradient(180deg,#2C2C2C 0%,#1a1817 100%);color:#F5F0E8;text-align:center }' +
      '#rlxDoc .investment h3 { color:#C8A97E;margin-bottom:16px }' +
      '#rlxDoc .investment .label-small { font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(245,240,232,0.5);margin-bottom:18px }' +
      '#rlxDoc .investment .amount { font-family:"Cormorant Garamond",serif;font-weight:300;font-size:72px;line-height:1;margin-bottom:12px }' +
      '#rlxDoc .investment .amount .currency { font-size:28px;opacity:0.5;vertical-align:top;margin-right:4px }' +
      '#rlxDoc .investment .terms { font-family:"Cormorant Garamond",serif;font-style:italic;font-size:16px;color:rgba(245,240,232,0.65);margin-top:8px }' +
      // cashback
      '#rlxDoc .cashback { background:#F5F0E8;padding:96px 64px;position:relative;overflow:hidden }' +
      '#rlxDoc .cashback::before { content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 0% 0%,rgba(200,169,126,0.12),transparent 50%),radial-gradient(ellipse at 100% 100%,rgba(200,169,126,0.08),transparent 50%);pointer-events:none }' +
      '#rlxDoc .cashback .badge { display:inline-block;padding:6px 16px;border:1px solid #C8A97E;color:#A8895E;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;font-weight:500;margin-bottom:28px;background:#FEFCF8 }' +
      '#rlxDoc .cashback h2 { font-size:42px;line-height:1.15;max-width:580px;margin-bottom:28px }' +
      '#rlxDoc .cashback h2 em { color:#A8895E;font-style:italic;font-weight:400 }' +
      '#rlxDoc .cashback .body-text { font-family:"Cormorant Garamond",serif;font-weight:300;font-size:19px;line-height:1.7;color:#4A4A4A;max-width:560px }' +
      '#rlxDoc .cashback .body-text strong { color:#2C2C2C;font-weight:500 }' +
      '#rlxDoc .cashback .pillars { margin-top:48px;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #E8DDD0;border-bottom:1px solid #E8DDD0 }' +
      '#rlxDoc .cashback .pillar { padding:32px 20px;text-align:center;border-right:1px solid #E8DDD0 }' +
      '#rlxDoc .cashback .pillar:last-child { border-right:none }' +
      '#rlxDoc .cashback .pillar .icon { font-family:"Cormorant Garamond",serif;font-style:italic;font-size:32px;color:#C8A97E;margin-bottom:14px }' +
      '#rlxDoc .cashback .pillar .text { font-family:"Cormorant Garamond",serif;font-style:italic;font-size:15px;color:#2C2C2C;line-height:1.5 }' +
      '#rlxDoc .cashback .pillar .text strong { font-family:"Montserrat",sans-serif;font-style:normal;font-weight:500;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#A8895E;display:block;margin-bottom:8px }' +
      // includes
      '#rlxDoc .includes { background:#FEFCF8;padding:80px 64px }' +
      '#rlxDoc .includes h3 { text-align:center;margin-bottom:14px }' +
      '#rlxDoc .includes h2 { text-align:center;font-size:32px;max-width:480px;margin:0 auto 56px }' +
      '#rlxDoc .includes ul { list-style:none;padding:0;max-width:520px;margin:0 auto }' +
      '#rlxDoc .includes li { display:grid;grid-template-columns:24px 1fr;gap:18px;padding:18px 0;border-bottom:1px solid #E8DDD0;align-items:baseline }' +
      '#rlxDoc .includes li::before { content:"◆";color:#C8A97E;font-size:8px;line-height:1.8 }' +
      '#rlxDoc .includes li .name { font-family:"Cormorant Garamond",serif;font-weight:400;font-size:18px;color:#2C2C2C }' +
      '#rlxDoc .includes li .desc { font-size:12px;color:#4A4A4A;margin-top:2px;line-height:1.5 }' +
      // faqs
      '#rlxDoc .faqs { background:#F5F0E8 }' +
      '#rlxDoc .faqs h2 { font-size:32px;margin-bottom:56px;max-width:520px }' +
      '#rlxDoc .faqs h2 em { color:#A8895E }' +
      '#rlxDoc .faq-item { padding:32px 0;border-top:1px solid #E8DDD0 }' +
      '#rlxDoc .faq-item:last-child { border-bottom:1px solid #E8DDD0 }' +
      '#rlxDoc .faq-item .q { font-family:"Cormorant Garamond",serif;font-weight:400;font-style:italic;font-size:22px;color:#2C2C2C;margin-bottom:14px;line-height:1.3 }' +
      '#rlxDoc .faq-item .a { font-family:"Cormorant Garamond",serif;font-weight:300;font-size:17px;color:#4A4A4A;line-height:1.65;max-width:600px }' +
      '#rlxDoc .faq-item .a em { color:#A8895E;font-style:italic }' +
      // cta
      '#rlxDoc .cta { text-align:center;padding:96px 64px;background:linear-gradient(180deg,#FEFCF8 0%,#F5F0E8 100%) }' +
      '#rlxDoc .cta .slogan-echo { font-family:"Cormorant Garamond",serif;font-style:italic;font-weight:300;font-size:30px;line-height:1.3;color:#2C2C2C;max-width:540px;margin:0 auto 48px }' +
      '#rlxDoc .cta .slogan-echo em { color:#A8895E }' +
      '#rlxDoc .cta .button { display:inline-block;padding:18px 36px;background:#2C2C2C;color:#F5F0E8;font-family:"Montserrat",sans-serif;font-weight:500;font-size:12px;letter-spacing:0.25em;text-transform:uppercase;text-decoration:none }' +
      // footer
      '#rlxDoc .footer-rlx { padding:40px 64px;background:#F5F0E8;text-align:center;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#4A4A4A;font-weight:500;line-height:2 }' +
      '#rlxDoc .footer-rlx .seal { display:inline-flex;align-items:center;gap:8px;margin-bottom:12px }' +
      '#rlxDoc .footer-rlx .seal::before,#rlxDoc .footer-rlx .seal::after { content:"";width:30px;height:1px;background:#C8A97E }' +
      '@media print { body { background:white !important } #fmReportOverlay { background:white !important;padding:0 !important } #fmReportOverlay > div:first-child { display:none } #rlxDoc { box-shadow:none;max-width:100% } .fold,.cases,.investment,.cashback { page-break-inside:avoid } }' +
    '</style>'
  }

  // ── HTML por bloco ───────────────────────────────────────────
  function _coverHtml(payload) {
    return '<section class="cover">' +
      '<div class="logo-mark">CLINICA</div>' +
      '<div class="logo-name">' + _esc(payload.input.clinicName) + '</div>' +
      '<div class="logo-rule"></div>' +
      '<div class="tagline">' + T('tagline') + '</div>' +
      '<h1 class="slogan">' + T('slogan.headline_main') + '</h1>' +
      '<div class="for">PREPARADO PARA</div>' +
      '<div class="patient-name">' + _esc(payload.input.leadName) + '</div>' +
      '<div class="date-line">' + _today() + '</div>' +
    '</section>'
  }

  function _letterHtml(payload) {
    // Carta tem tratamento especial: payload.letter sobrescreve template
    var body = payload.letter && payload.letter.trim() ? payload.letter : T('letter.body')
    return '<section class="fold letter">' +
      '<h3>' + T('letter.kicker') + '</h3>' +
      '<h2>' + T('letter.title') + '</h2>' +
      '<div class="body-text">' + _multiline(body) + '</div>' +
      '<div class="signature">' + _esc(payload.input.profName) + '</div>' +
      '<div class="role">' + T('letter.role') + '</div>' +
    '</section>'
  }

  function _pullquoteHtml() {
    return '<section class="pullquote">' +
      '<blockquote>' + T('slogan.flat') + '</blockquote>' +
      '<cite>' + T('pullquote.attribution') + '</cite>' +
    '</section>'
  }

  function _credentialsHtml() {
    return '<div class="credentials">' +
      '<div class="item"><div class="num">' + T('credentials.item1.num') + '</div><div class="label">' + T('credentials.item1.label') + '</div></div>' +
      '<div class="item"><div class="num">' + T('credentials.item2.num') + '</div><div class="label">' + T('credentials.item2.label') + '</div></div>' +
      '<div class="item"><div class="num">' + T('credentials.item3.num') + '</div><div class="label">' + T('credentials.item3.label') + '</div></div>' +
    '</div>'
  }

  function _diagnosisHtml(d) {
    var html = '<section class="fold diagnosis">' +
      '<h3>' + T('diagnosis.kicker') + '</h3>' +
      '<h2>' + T('diagnosis.title') + '</h2>' +
      '<p class="lead">' + T('diagnosis.lead') + '</p>'

    if (d.mandibular) {
      html += _mapBlock('Mapa <em>mandibular</em>', d.mandibular.label || '',
        '<div class="metrics">' +
          (d.mandibular.amf      != null ? _metric('AMF · Frontal',  d.mandibular.amf,      '°', d.mandibular.label || '') : '') +
          (d.mandibular.aijLeft  != null ? _metric('AIJ · Esquerdo', d.mandibular.aijLeft,  '°', '') : '') +
          (d.mandibular.aijRight != null ? _metric('AIJ · Direito',  d.mandibular.aijRight, '°', '') : '') +
          (d.mandibular.rmz      != null ? _metric('RMZ · Ratio M/Z', d.mandibular.rmz,    '',  'Harmônica 0,85—0,95') : '') +
        '</div>')
    }

    if (d.thirds) {
      html += _mapBlock('Terços <em>faciais</em>', 'proporções',
        '<div class="thirds-bar">' +
          '<div class="seg"><div class="pct">' + d.thirds.upper + '%</div><div class="lbl">Terço superior</div></div>' +
          '<div class="seg"><div class="pct">' + d.thirds.middle + '%</div><div class="lbl">Terço médio</div></div>' +
          '<div class="seg"><div class="pct">' + d.thirds.lower + '%</div><div class="lbl">Terço inferior</div></div>' +
        '</div>')
    }

    if (d.symmetry != null) {
      html += _mapBlock('Simetria <em>geral</em>', d.symmetry >= 90 ? 'altíssima' : (d.symmetry >= 75 ? 'boa' : 'leve assimetria'),
        '<div class="symmetry-gauge">' +
          '<div class="pct-big">' + d.symmetry + '<span class="unit">%</span></div>' +
          '<div class="scale-label">Coerência entre os dois lados do rosto</div>' +
          '<div class="scale"><div class="fill" style="width:' + d.symmetry + '%"></div></div>' +
        '</div>')
    }

    if (d.ricketts) {
      html += _mapBlock('Linha de <em>Ricketts</em>', '',
        '<div>' +
          (d.ricketts.lipUpper != null ? _rickettsRow('Lábio superior', d.ricketts.lipUpper) : '') +
          (d.ricketts.lipLower != null ? _rickettsRow('Lábio inferior', d.ricketts.lipLower) : '') +
        '</div>')
    }

    if (d.nasal && Object.keys(d.nasal).length) {
      html += _mapBlock('Análise <em>nasal</em> · complementar', '',
        '<div class="metrics cols-3">' +
          (d.nasal.nasolabial  != null ? _metric('Nasolabial',  d.nasal.nasolabial,  '°', '100—110°') : '') +
          (d.nasal.nasofrontal != null ? _metric('Nasofrontal', d.nasal.nasofrontal, '°', '120—130°') : '') +
          (d.nasal.nasofacial  != null ? _metric('Nasofacial',  d.nasal.nasofacial,  '°', '30—35°')   : '') +
        '</div>')
    }

    return html + '</section>'
  }

  function _mapBlock(title, summary, content) {
    return '<div class="map-block">' +
      '<div class="map-header">' +
        '<div class="map-title">' + title + '</div>' +
        (summary ? '<div class="map-summary good">' + _esc(summary) + '</div>' : '') +
      '</div>' + content +
    '</div>'
  }

  function _metric(name, value, unit, ideal) {
    var displayValue = (typeof value === 'number') ? (Math.round(value * 10) / 10) : value
    return '<div class="metric">' +
      '<div class="name">' + _esc(name) + '</div>' +
      '<div class="value">' + displayValue + (unit ? '<span class="deg">' + unit + '</span>' : '') + '</div>' +
      (ideal ? '<div class="ideal">' + _esc(ideal) + '</div>' : '') +
    '</div>'
  }

  function _rickettsRow(label, mm) {
    var fmt = (mm >= 0 ? '+' : '') + (Math.round(mm * 10) / 10).toFixed(1) + 'mm'
    return '<div class="ricketts-row">' +
      '<div class="lbl">' + _esc(label) + '</div>' +
      '<div class="val">' + fmt + '</div>' +
      '<div class="status">' + (Math.abs(mm) <= 4 ? 'Ideal' : 'Atenção') + '</div>' +
    '</div>'
  }

  function _protocolHtml(annotations) {
    if (!annotations.length) return ''
    var roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x']
    var titlePre = T('protocol.title_pre')
    var titlePost = T('protocol.title_post')
    return '<section class="fold protocol">' +
      '<h3>' + T('protocol.kicker') + '</h3>' +
      '<h2>' + (titlePre ? titlePre + ' ' : '') + annotations.length + ' ' + titlePost + '</h2>' +
      '<p class="lead">' + T('protocol.lead') + '</p>' +
      '<ul class="zones">' +
        annotations.map(function (a, i) {
          return '<li class="zone">' +
            '<div class="num">' + (roman[i] || (i + 1)) + '</div>' +
            '<div class="body">' +
              '<div class="name">' + _esc(a.zone) + '</div>' +
              '<div class="product">' + _esc(a.treatment) + '</div>' +
            '</div>' +
            '<div class="qty">' + a.units + '<span class="unit">' + _esc(a.unitLabel) + '</span></div>' +
          '</li>'
        }).join('') +
      '</ul>' +
    '</section>'
  }

  // ── Linha do Tempo do Método Lifting 5D ──────────────────────
  // Cronograma editorial (Mês 0 → 12) que materializa o protocolo
  // integrado da clínica. Independente do plano da paciente — mostra
  // a estrutura do método como um todo.
  function _timelineHtml() {
    var stages = []
    for (var i = 1; i <= 6; i++) {
      stages.push({
        when:  T('timeline.stage' + i + '.when'),
        title: T('timeline.stage' + i + '.title'),
        text:  T('timeline.stage' + i + '.text'),
      })
    }
    return '<section class="fold timeline">' +
      '<h3>' + T('timeline.kicker') + '</h3>' +
      '<h2>' + T('timeline.title') + '</h2>' +
      '<p class="lead">' + T('timeline.lead') + '</p>' +
      '<div class="timeline-track">' +
        stages.map(function (s, i) {
          return '<div class="timeline-stage">' +
            '<div class="timeline-dot"></div>' +
            (i < stages.length - 1 ? '<div class="timeline-line"></div>' : '') +
            '<div class="timeline-body">' +
              '<div class="timeline-when">' + s.when + '</div>' +
              '<div class="timeline-title">' + s.title + '</div>' +
              '<div class="timeline-text">' + s.text + '</div>' +
            '</div>' +
          '</div>'
        }).join('') +
      '</div>' +
    '</section>'
  }

  function _visualHtml(d) {
    var hasBoth = d.beforeUrl && d.afterUrl
    if (hasBoth) {
      return '<section class="fold visual">' +
        '<h3>Sua projeção</h3>' +
        '<h2>Como você está <span class="diamond"></span> como podemos <em>chegar</em></h2>' +
        '<div class="rlx-compare">' +
          '<img src="' + _esc(d.beforeUrl) + '" alt="antes" crossorigin="anonymous">' +
          '<div class="rlx-after-wrap"><img src="' + _esc(d.afterUrl) + '" alt="depois" crossorigin="anonymous"></div>' +
          '<div class="rlx-label before">Antes</div>' +
          '<div class="rlx-label after">Depois</div>' +
          '<div class="rlx-handle"></div>' +
        '</div>' +
      '</section>'
    }
    var single = d.beforeUrl || d.afterUrl
    if (single) {
      return '<section class="fold visual">' +
        '<h3>Sua projeção</h3>' +
        '<h2>Foto atual</h2>' +
        '<img src="' + _esc(single) + '" style="width:100%;display:block">' +
      '</section>'
    }
    return ''
  }

  function _casesHtml(cases) {
    if (!cases || !cases.length) return ''
    return '<section class="cases">' +
      '<h3>Casos reais</h3>' +
      '<h2>Pacientes <em>com perfil similar</em></h2>' +
      cases.map(function (c) {
        var ph = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(245,240,232,0.6);font-style:italic;font-size:14px">[ foto ]</div>'
        return '<div class="case">' +
          '<div class="case-photo"><div class="label">Antes</div>' + (c.beforeUrl ? '<img src="' + _esc(c.beforeUrl) + '" crossorigin="anonymous">' : ph) + '</div>' +
          '<div class="case-photo"><div class="label">Depois</div>' + (c.afterUrl ? '<img src="' + _esc(c.afterUrl) + '" crossorigin="anonymous">' : ph) + '</div>' +
          '<div class="case-meta">' +
            '<div class="who">' + _esc(c.initials) + (c.age ? ', ' + c.age + ' anos' : '') + '</div>' +
            '<div>' + _esc(c.summary || (c.focusLabel + ' · ' + c.months + ' meses')) + '</div>' +
          '</div>' +
        '</div>'
      }).join('') +
    '</section>'
  }

  function _anchorHtml(pricing, fmt) {
    if (!pricing || pricing.savings <= 0) return ''
    return '<section class="anchor">' +
      '<h3>Lógica do investimento</h3>' +
      '<h2>' + T('anchor.title') + '</h2>' +
      '<div class="compare-rows">' +
        '<div class="row"><span class="label">Procedimentos isolados</span><span class="price">' + fmt(pricing.isolated) + '</span></div>' +
        '<div class="row highlight"><span class="label">Protocolo integrado Mirian de Paula</span><span class="price">' + fmt(pricing.integrated) + '</span></div>' +
      '</div>' +
      '<p class="note">' + T('anchor.note') + '</p>' +
    '</section>'
  }

  function _investmentHtml(payload, fmt) {
    var inst = payload.installment
    return '<section class="fold investment">' +
      '<h3>' + T('investment.kicker') + '</h3>' +
      '<div class="label-small">' + T('investment.label') + '</div>' +
      '<div class="amount"><span class="currency">R$</span>' + (payload.pricing.integrated || 0).toLocaleString('pt-BR') + '</div>' +
      (inst ? '<div class="terms">ou ' + inst.n + 'x de ' + fmt(inst.value) + ' sem juros</div>' : '') +
    '</section>'
  }

  function _cashbackHtml() {
    return '<section class="cashback">' +
      '<div class="badge">' + T('cashback.badge') + '</div>' +
      '<h2>' + T('cashback.headline') + '</h2>' +
      '<div class="body-text">' + _multiline(T('cashback.body')) + '</div>' +
      '<div class="pillars">' +
        '<div class="pillar"><div class="icon">i</div><div class="text"><strong>' + T('cashback.pillar1.label') + '</strong>' + T('cashback.pillar1.text') + '</div></div>' +
        '<div class="pillar"><div class="icon">ii</div><div class="text"><strong>' + T('cashback.pillar2.label') + '</strong>' + T('cashback.pillar2.text') + '</div></div>' +
        '<div class="pillar"><div class="icon">iii</div><div class="text"><strong>' + T('cashback.pillar3.label') + '</strong>' + T('cashback.pillar3.text') + '</div></div>' +
      '</div>' +
    '</section>'
  }

  function _includesHtml(cashbackOn) {
    var items = [
      [T('includes.item1.name'), T('includes.item1.desc')],
      [T('includes.item2.name'), T('includes.item2.desc')],
      [T('includes.item3.name'), T('includes.item3.desc')],
      [T('includes.item4.name'), T('includes.item4.desc')],
    ]
    if (cashbackOn) items.push([T('includes.item5.name'), T('includes.item5.desc')])
    items.push([T('includes.item6.name'), T('includes.item6.desc')])

    return '<section class="includes">' +
      '<h3>' + T('includes.kicker') + '</h3>' +
      '<h2>' + T('includes.title') + '</h2>' +
      '<ul>' +
        items.map(function (it) {
          return '<li><span></span><div><div class="name">' + it[0] + '</div><div class="desc">' + it[1] + '</div></div></li>'
        }).join('') +
      '</ul>' +
    '</section>'
  }

  function _faqsHtml() {
    var faqs = [
      [T('faq.q1'), T('faq.a1')],
      [T('faq.q2'), T('faq.a2')],
      [T('faq.q3'), T('faq.a3')],
    ]
    return '<section class="fold faqs">' +
      '<h3>' + T('faq.kicker') + '</h3>' +
      '<h2>' + T('faq.title') + '</h2>' +
      faqs.map(function (f) {
        return '<div class="faq-item"><div class="q">' + f[0] + '</div><div class="a">' + f[1] + '</div></div>'
      }).join('') +
    '</section>'
  }

  function _ctaHtml() {
    return '<section class="cta">' +
      '<div class="slogan-echo">' + T('slogan.flat') + '</div>' +
      '<a href="#" class="button">' + T('cta.button_text') + '</a>' +
      '<div class="reassurance" style="margin-top:18px;font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:14px;color:#4A4A4A">' + T('cta.reassurance') + '</div>' +
    '</section>'
  }

  function _footerHtml(payload) {
    return '<footer class="footer-rlx">' +
      '<div class="seal">' + T('footer.confidentiality') + '</div>' +
      '<div>uso pessoal &middot; ' + _esc(payload.input.leadName) + '</div>' +
    '</footer>'
  }

  // Mantem _previewReport e _downloadReport apontando pro novo gerador
  // (compat com botoes existentes)
  if (!FM._previewReport) FM._previewReport = function () { FM._exportReport() }
  if (!FM._downloadReport) FM._downloadReport = function () {
    if (document.getElementById('fmReportOverlay')) _downloadPng()
    else FM._exportReport()
  }

  // ── API publica para preview no editor admin ─────────────────
  // Gera HTML completo standalone (com <head>, fontes Google e CSS)
  // usando dados ficticios. overrides = mapa { 'slogan.flat': '...' }
  // que sobrescreve T() em memoria — assim o editor reflete edicoes
  // nao salvas em tempo real.
  function _mockPayload() {
    return {
      input: {
        leadName:  'Fernanda Almeida',
        clinicName: (FM._clinicName ? FM._clinicName() : 'Clinica Mirian de Paula'),
        profName:   (FM._profName   ? FM._profName()   : 'Dra. Mirian de Paula'),
        tagline:    (FM._tagline    ? FM._tagline()    : 'Harmonia que revela. Precisão que dura.'),
      },
      letter: '',  // usa template default
      cashbackOn: true,
      pricing: {
        isolated: 7200, integrated: 4280, savings: 2920,
        lines: [
          { id: 'ah',       label: 'Ácido Hialurônico', units: 2.8, unitLabel: 'mL', subtotal: 2240 },
          { id: 'botox',    label: 'Toxina Botulínica', units: 16,  unitLabel: 'U',  subtotal: 400  },
          { id: 'bio',      label: 'Bioestimulador',    units: 1,   unitLabel: 'mL', subtotal: 1200 },
        ],
      },
      installment: { n: 6, value: 760 },
      cases: [],
    }
  }
  function _mockFmData() {
    return {
      angle: 'front', beforeUrl: null, afterUrl: null,
      mandibular: { amf: 128, aijLeft: 28, aijRight: 29, rmz: 0.92, label: 'Definida' },
      nasal:      { nasolabial: 104, nasofrontal: 133, nasofacial: 32 },
      thirds:     { upper: 33, middle: 35, lower: 32 },
      symmetry:   94,
      ricketts:   { lipUpper: -2.1, lipLower: -1.4 },
    }
  }
  function _mockAnnotations() {
    return [
      { i: 1, zone: 'Refinamento da radix',           treatment: 'Ácido hialurônico · densidade média',     units: 0.3, unitLabel: 'mL' },
      { i: 2, zone: 'Projeção lateral · zigoma esquerdo', treatment: 'Ácido hialurônico · alta sustentação', units: 1.0, unitLabel: 'mL' },
      { i: 3, zone: 'Projeção lateral · zigoma direito',  treatment: 'Ácido hialurônico · alta sustentação', units: 1.0, unitLabel: 'mL' },
      { i: 4, zone: 'Suavização do sulco nasolabial', treatment: 'Ácido hialurônico · densidade baixa',     units: 0.5, unitLabel: 'mL' },
      { i: 5, zone: 'Relaxamento da expressão frontal', treatment: 'Toxina botulínica',                     units: 16,  unitLabel: 'U'  },
    ]
  }

  window.ReportLuxuryRenderer = {
    buildPreviewHtml: function (overrides) {
      _previewOverrides = overrides || null
      try {
        var payload = _mockPayload()
        var fmData = _mockFmData()
        var annotations = _mockAnnotations()
        var fmt = window.ReportLuxuryPricing.formatBRL
        return (
          '<!DOCTYPE html><html lang="pt-BR"><head>' +
          '<meta charset="UTF-8">' +
          '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
          '<link rel="preconnect" href="https://fonts.googleapis.com">' +
          '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
          '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">' +
          '<style>html,body{margin:0;padding:0;background:#1a1817;-webkit-font-smoothing:antialiased}#rlxDoc{margin:0 auto}</style>' +
          '</head><body>' +
          _renderDoc(payload, fmData, annotations, fmt) +
          '</body></html>'
        )
      } finally { _previewOverrides = null }
    },
  }
})()
