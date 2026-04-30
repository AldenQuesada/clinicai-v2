/**
 * ClinicAI - Report Luxury Pre-Export Modal
 *
 * Modal de 3 abas que aparece antes de gerar o report luxury:
 *   1. Comercial      — investimento integrado, isolado, parcelamento
 *   2. Casos similares — seleciona ate 3 casos da galeria
 *   3. Personalizacao  — carta editorial editavel, foco, toggle cashback
 *
 * Ao confirmar, retorna um payload completo via callback que o
 * ReportLuxuryRenderer usa para gerar o HTML final.
 *
 * API:
 *   ReportLuxuryPreExport.open({ annotations, leadName, ... }, callback)
 *     callback(payload | null)
 */
;(function () {
  'use strict'
  if (window._reportLuxuryPreexportLoaded) return
  window._reportLuxuryPreexportLoaded = true

  var GOLD = '#C8A97E'
  var GOLD_DARK = '#A8895E'
  var IVORY = '#F5F0E8'
  var GRAPHITE = '#2C2C2C'
  var GRAPHITE_LIGHT = '#4A4A4A'
  var BEGE = '#E8DDD0'
  var WHITE = '#FEFCF8'

  var _state = {
    activeTab: 'commercial',
    overlay: null,
    pricing: null,
    selectedCases: [],
    casesAvailable: [],
    casesLoading: false,
    casesSignedUrls: {},
    customLetter: '',
    cashbackOn: true,
    manualIntegrated: null,
    manualIsolated: null,
    installmentN: 6,
    callback: null,
    input: null,
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c] }) }
  function _toast(m, t) { if (window.toast) return window.toast(m, t || 'info'); if (window.showToast) return window.showToast(m, t || 'info') }

  var DEFAULT_LETTER = (
    'O que voce vera a seguir nao e uma lista de procedimentos. E a traducao do que seu rosto esta pedindo — ' +
    'observado com calma, medido com precisao e desenhado para preservar quem voce e.\n\n' +
    'Cada zona indicada tem motivo. Cada dose tem proporcao. Nada aqui e pensado para te transformar em outra pessoa: ' +
    'tudo aqui e pensado para te devolver coerencia entre dentro e fora.'
  )

  function _close() {
    if (_state.overlay) {
      var o = _state.overlay
      o.style.opacity = '0'
      setTimeout(function () { if (o.parentNode) o.remove() }, 200)
      _state.overlay = null
    }
  }

  function _open(input, callback) {
    _state.input = input
    _state.callback = callback
    _state.activeTab = 'commercial'
    _state.selectedCases = []
    _state.customLetter = DEFAULT_LETTER
    _state.cashbackOn = true
    _state.manualIntegrated = null
    _state.manualIsolated = null
    _state.installmentN = 6
    _state.casesSignedUrls = {}

    // Calcula pricing inicial
    if (window.ReportLuxuryPricing) {
      _state.pricing = window.ReportLuxuryPricing.calculate(input.annotations || [])
    }

    var ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(8px);overflow-y:auto;opacity:0;transition:opacity .2s'
    document.body.appendChild(ov)
    _state.overlay = ov
    _render()
    requestAnimationFrame(function () { ov.style.opacity = '1' })

    // Carrega casos em paralelo
    _loadCases()
  }

  function _loadCases() {
    if (!window.CaseGalleryService) return
    _state.casesLoading = true
    window.CaseGalleryService.list().then(function (rows) {
      _state.casesAvailable = rows
      _state.casesLoading = false
      // Auto-seleciona 3 mais recentes
      _state.selectedCases = rows.slice(0, 3).map(function (r) { return r.id })
      // Resolve signed URLs em paralelo
      var promises = []
      rows.forEach(function (r) {
        ['photo_before_path', 'photo_after_path'].forEach(function (k) {
          var p = r[k]
          if (!p || _state.casesSignedUrls[p]) return
          promises.push(window.CaseGalleryService.signedUrl(p).then(function (u) { _state.casesSignedUrls[p] = u }))
        })
      })
      Promise.all(promises).then(function () { _render() })
      _render()
    })
  }

  // ── Render principal ─────────────────────────────────────────
  function _render() {
    if (!_state.overlay) return
    _state.overlay.innerHTML =
      '<div style="background:' + WHITE + ';max-width:760px;width:100%;color:' + GRAPHITE + ';font-family:Montserrat,sans-serif;max-height:92vh;display:flex;flex-direction:column">' +
        _renderHeader() +
        _renderTabs() +
        '<div style="flex:1;overflow-y:auto;padding:32px 36px;background:' + IVORY + '">' +
          _renderActiveTab() +
        '</div>' +
        _renderFooter() +
      '</div>'
    _bind()
  }

  function _renderHeader() {
    return '<div style="padding:24px 36px;background:' + WHITE + ';border-bottom:1px solid ' + BEGE + ';display:flex;justify-content:space-between;align-items:baseline">' +
      '<div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-weight:300;font-size:24px;color:' + GRAPHITE + '">Gerar plano de <em style="color:' + GOLD_DARK + '">harmonia</em></div>' +
        '<div style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';margin-top:4px">Para ' + _esc(_state.input.leadName || 'paciente') + '</div>' +
      '</div>' +
      '<button id="rlxClose" style="background:transparent;border:none;color:' + GRAPHITE_LIGHT + ';font-size:20px;cursor:pointer;padding:4px 8px">&times;</button>' +
    '</div>'
  }

  function _renderTabs() {
    var tabs = [
      { id: 'commercial',    label: 'Comercial' },
      { id: 'cases',         label: 'Casos similares' },
      { id: 'personalize',   label: 'Personalização' },
    ]
    return '<div style="display:flex;background:' + WHITE + ';border-bottom:1px solid ' + BEGE + '">' +
      tabs.map(function (t) {
        var active = _state.activeTab === t.id
        return '<button data-tab="' + t.id + '" style="flex:1;padding:14px 18px;background:transparent;border:none;border-bottom:2px solid ' + (active ? GOLD : 'transparent') + ';color:' + (active ? GRAPHITE : GRAPHITE_LIGHT) + ';font-family:Montserrat,sans-serif;font-size:11px;font-weight:' + (active ? '600' : '400') + ';letter-spacing:0.15em;text-transform:uppercase;cursor:pointer">' + t.label + '</button>'
      }).join('') +
    '</div>'
  }

  function _renderActiveTab() {
    if (_state.activeTab === 'commercial')  return _renderCommercialTab()
    if (_state.activeTab === 'cases')       return _renderCasesTab()
    if (_state.activeTab === 'personalize') return _renderPersonalizeTab()
    return ''
  }

  // ── ABA 1: Comercial ─────────────────────────────────────────
  function _renderCommercialTab() {
    var p = _state.pricing
    if (!p || !p.lines.length) {
      return '<div style="padding:40px;text-align:center;color:' + GRAPHITE_LIGHT + ';font-style:italic">Nenhuma anotacao no Face Mapping. Marque as zonas antes de gerar o report.</div>'
    }
    var fmt = window.ReportLuxuryPricing.formatBRL
    var integrated = _state.manualIntegrated != null ? _state.manualIntegrated : p.integrated
    var isolated   = _state.manualIsolated   != null ? _state.manualIsolated   : p.isolated
    var savings    = isolated - integrated
    var installments = window.ReportLuxuryPricing.suggestInstallments(integrated)

    var linesHtml = p.lines.map(function (l) {
      return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid ' + BEGE + ';font-size:12px">' +
        '<span style="color:' + GRAPHITE + '">' + _esc(l.label) + ' &middot; <span style="color:' + GRAPHITE_LIGHT + '">' + l.units + ' ' + l.unitLabel + '</span></span>' +
        '<span style="font-family:\'Cormorant Garamond\',serif;font-size:16px;color:' + GRAPHITE + '">' + fmt(l.subtotal) + '</span>' +
      '</div>'
    }).join('')

    return _section('Anotacoes do Face Mapping',
      '<div style="background:' + WHITE + ';padding:18px 22px;border:1px solid ' + BEGE + '">' + linesHtml + '</div>'
    ) +

    _section('Investimento',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">' +
        _priceField('Procedimentos isolados', 'rlxIsolated', isolated) +
        _priceField('Protocolo integrado (final)', 'rlxIntegrated', integrated) +
      '</div>' +
      (savings > 0
        ? '<div style="margin-top:14px;padding:12px 16px;background:' + WHITE + ';border-left:2px solid ' + GOLD + ';font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:14px;color:' + GRAPHITE + '">Economia de <strong style="font-style:normal;font-family:Montserrat,sans-serif;font-weight:600">' + fmt(savings) + '</strong> pelo protocolo integrado.</div>'
        : '')
    ) +

    (installments.length ? _section('Parcelamento sugerido',
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        installments.map(function (i) {
          var sel = i.n === _state.installmentN
          return '<button data-installment="' + i.n + '" style="padding:10px 16px;background:' + (sel ? GOLD : WHITE) + ';color:' + (sel ? GRAPHITE : GRAPHITE_LIGHT) + ';border:1px solid ' + (sel ? GOLD : BEGE) + ';font-family:\'Cormorant Garamond\',serif;font-size:14px;cursor:pointer">' + i.n + 'x de ' + fmt(i.value) + '</button>'
        }).join('') +
      '</div>'
    ) : '')
  }

  // ── ABA 2: Casos similares ───────────────────────────────────
  function _renderCasesTab() {
    if (_state.casesLoading) return '<div style="padding:40px;text-align:center;color:' + GRAPHITE_LIGHT + '">Carregando galeria...</div>'
    if (!_state.casesAvailable.length) {
      return '<div style="padding:40px;text-align:center;background:' + WHITE + ';border:1px dashed ' + BEGE + '">' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:18px;color:' + GRAPHITE_LIGHT + ';margin-bottom:8px">Nenhum caso cadastrado</div>' +
        '<div style="font-size:12px;color:' + GRAPHITE_LIGHT + ';opacity:0.7;line-height:1.6">Acesse <strong>Agenda &rsaquo; Galeria de Casos</strong> para cadastrar antes de gerar o report.</div>' +
      '</div>'
    }
    var grid = _state.casesAvailable.map(function (r) {
      var sel = _state.selectedCases.indexOf(r.id) >= 0
      var beforeUrl = _state.casesSignedUrls[r.photo_before_path]
      var afterUrl  = _state.casesSignedUrls[r.photo_after_path]
      var imgStyle = 'width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:linear-gradient(135deg,#DFC5A0,#A8895E)'
      var ph = '<div style="' + imgStyle + ';display:flex;align-items:center;justify-content:center;color:rgba(245,240,232,0.6);font-style:italic;font-size:11px">[ foto ]</div>'
      return '<div data-case="' + r.id + '" style="cursor:pointer;border:2px solid ' + (sel ? GOLD : BEGE) + ';background:' + WHITE + ';position:relative;transition:all .15s">' +
        (sel ? '<div style="position:absolute;top:8px;right:8px;width:24px;height:24px;background:' + GOLD + ';color:' + GRAPHITE + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;z-index:2">&check;</div>' : '') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:' + BEGE + '">' +
          (beforeUrl ? '<img src="' + _esc(beforeUrl) + '" style="' + imgStyle + '">' : ph) +
          (afterUrl  ? '<img src="' + _esc(afterUrl)  + '" style="' + imgStyle + '">' : ph) +
        '</div>' +
        '<div style="padding:12px 14px">' +
          '<div style="font-family:\'Cormorant Garamond\',serif;font-size:15px;color:' + GRAPHITE + '">' + _esc(r.patient_initials) + (r.patient_age ? ', ' + r.patient_age : '') + '</div>' +
          '<div style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:' + GOLD_DARK + ';margin-top:2px">' + _esc(r.focus_label) + '</div>' +
        '</div>' +
      '</div>'
    }).join('')

    return _section('Selecione ate 3 casos similares (' + _state.selectedCases.length + '/3)',
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">' + grid + '</div>'
    )
  }

  // ── ABA 3: Personalizacao ────────────────────────────────────
  function _renderPersonalizeTab() {
    return _section('Carta de abertura (editavel)',
      '<textarea id="rlxLetter" rows="8" style="width:100%;padding:14px 16px;background:' + WHITE + ';border:1px solid ' + BEGE + ';font-family:\'Cormorant Garamond\',serif;font-size:15px;color:' + GRAPHITE + ';line-height:1.6;resize:vertical">' + _esc(_state.customLetter) + '</textarea>'
    ) +
    _section('Cashback Fotona 4D',
      '<label style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:14px 18px;background:' + WHITE + ';border:1px solid ' + BEGE + '">' +
        '<input type="checkbox" id="rlxCashback"' + (_state.cashbackOn ? ' checked' : '') + ' style="accent-color:' + GOLD + ';width:18px;height:18px">' +
        '<span style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:15px;color:' + GRAPHITE + '">Incluir bloco do diferencial Mirian de Paula no report</span>' +
      '</label>'
    )
  }

  function _section(title, body) {
    return '<div style="margin-bottom:24px">' +
      '<div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:' + GOLD_DARK + ';font-weight:500;margin-bottom:12px">' + title + '</div>' +
      body +
    '</div>'
  }

  function _priceField(label, id, value) {
    return '<div>' +
      '<label style="display:block;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';margin-bottom:6px">' + label + '</label>' +
      '<input id="' + id + '" type="number" step="100" value="' + value + '" style="width:100%;padding:14px 16px;background:' + WHITE + ';border:1px solid ' + BEGE + ';font-family:\'Cormorant Garamond\',serif;font-size:24px;color:' + GRAPHITE + '">' +
    '</div>'
  }

  function _renderFooter() {
    return '<div style="padding:18px 36px;background:' + WHITE + ';border-top:1px solid ' + BEGE + ';display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-size:11px;color:' + GRAPHITE_LIGHT + ';font-style:italic">Tudo configurado? O report sera gerado com os dados acima.</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="rlxCancel" style="padding:10px 18px;background:transparent;border:1px solid ' + BEGE + ';font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';cursor:pointer;font-family:Montserrat,sans-serif">Cancelar</button>' +
        '<button id="rlxGenerate" style="padding:10px 22px;background:' + GRAPHITE + ';color:' + IVORY + ';border:none;font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer;font-family:Montserrat,sans-serif">Gerar report</button>' +
      '</div>' +
    '</div>'
  }

  function _bind() {
    var o = _state.overlay
    o.querySelector('#rlxClose').addEventListener('click', function () { _close(); _state.callback && _state.callback(null) })
    o.querySelector('#rlxCancel').addEventListener('click', function () { _close(); _state.callback && _state.callback(null) })
    o.querySelector('#rlxGenerate').addEventListener('click', _onGenerate)
    o.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        _captureFormState()
        _state.activeTab = b.getAttribute('data-tab')
        _render()
      })
    })

    if (_state.activeTab === 'commercial') {
      var iso = o.querySelector('#rlxIsolated')
      var inte = o.querySelector('#rlxIntegrated')
      if (iso) iso.addEventListener('input', function () { _state.manualIsolated = parseFloat(iso.value) || 0 })
      if (inte) inte.addEventListener('input', function () { _state.manualIntegrated = parseFloat(inte.value) || 0 })
      o.querySelectorAll('[data-installment]').forEach(function (b) {
        b.addEventListener('click', function () { _state.installmentN = parseInt(b.getAttribute('data-installment'), 10); _render() })
      })
    }
    if (_state.activeTab === 'cases') {
      o.querySelectorAll('[data-case]').forEach(function (el) {
        el.addEventListener('click', function () {
          var id = el.getAttribute('data-case')
          var idx = _state.selectedCases.indexOf(id)
          if (idx >= 0) _state.selectedCases.splice(idx, 1)
          else if (_state.selectedCases.length < 3) _state.selectedCases.push(id)
          else _toast('Maximo 3 casos', 'warn')
          _render()
        })
      })
    }
    if (_state.activeTab === 'personalize') {
      var l = o.querySelector('#rlxLetter')
      if (l) l.addEventListener('input', function () { _state.customLetter = l.value })
      var c = o.querySelector('#rlxCashback')
      if (c) c.addEventListener('change', function () { _state.cashbackOn = c.checked })
    }
  }

  function _captureFormState() {
    var o = _state.overlay
    if (!o) return
    var iso  = o.querySelector('#rlxIsolated')
    var inte = o.querySelector('#rlxIntegrated')
    var l    = o.querySelector('#rlxLetter')
    var c    = o.querySelector('#rlxCashback')
    if (iso)  _state.manualIsolated   = parseFloat(iso.value) || 0
    if (inte) _state.manualIntegrated = parseFloat(inte.value) || 0
    if (l)    _state.customLetter     = l.value
    if (c)    _state.cashbackOn       = c.checked
  }

  function _onGenerate() {
    _captureFormState()
    var p = _state.pricing
    var integrated = _state.manualIntegrated != null ? _state.manualIntegrated : (p ? p.integrated : 0)
    var isolated   = _state.manualIsolated   != null ? _state.manualIsolated   : (p ? p.isolated : 0)
    var installments = window.ReportLuxuryPricing.suggestInstallments(integrated)
    var chosenInstallment = installments.find(function (i) { return i.n === _state.installmentN }) || installments[0] || null

    var selectedCaseObjects = _state.selectedCases
      .map(function (id) { return _state.casesAvailable.find(function (c) { return c.id === id }) })
      .filter(Boolean)
      .map(function (c) {
        return {
          id: c.id,
          initials: c.patient_initials,
          age: c.patient_age,
          focusLabel: c.focus_label,
          months: c.months_since_procedure,
          summary: c.summary,
          beforeUrl: _state.casesSignedUrls[c.photo_before_path] || null,
          afterUrl:  _state.casesSignedUrls[c.photo_after_path]  || null,
        }
      })

    var payload = {
      input:        _state.input,
      pricing:      { integrated: integrated, isolated: isolated, savings: isolated - integrated, lines: p ? p.lines : [] },
      installment:  chosenInstallment,
      cases:        selectedCaseObjects,
      letter:       _state.customLetter,
      cashbackOn:   _state.cashbackOn,
    }
    var cb = _state.callback
    _close()
    cb && cb(payload)
  }

  window.ReportLuxuryPreExport = { open: _open, close: _close }
})()
