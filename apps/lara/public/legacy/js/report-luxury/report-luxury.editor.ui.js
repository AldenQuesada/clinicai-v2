/**
 * ClinicAI - Report Luxury Editor UI (com Preview ao Vivo)
 *
 * Layout:
 *   [ Sidebar abas | Form | Preview (mobile/tablet/desktop) ]
 *
 * Preview:
 *   - Iframe srcdoc isolado renderizando ReportLuxuryRenderer.buildPreviewHtml(overrides)
 *   - Overrides incluem _state.dirty (edicoes nao salvas) — preview ao vivo
 *   - Toggle viewport: 375px (mobile), 768px (tablet), 1024px (desktop)
 *   - Debounce de 350ms ao digitar para nao re-renderizar a cada tecla
 */
;(function () {
  'use strict'
  if (window._reportLuxuryEditorLoaded) return
  window._reportLuxuryEditorLoaded = true

  var GOLD = '#C8A97E'
  var GOLD_DARK = '#A8895E'
  var IVORY = '#F5F0E8'
  var GRAPHITE = '#2C2C2C'
  var GRAPHITE_LIGHT = '#4A4A4A'
  var BEGE = '#E8DDD0'
  var WHITE = '#FEFCF8'

  var VIEWPORTS = [
    { id: 'mobile',  label: 'Mobile',  width: 375,  icon: 'M' },
    { id: 'tablet',  label: 'Tablet',  width: 768,  icon: 'T' },
    { id: 'desktop', label: 'Desktop', width: 1024, icon: 'D' },
  ]

  var _state = {
    activeGroup: null,
    dirty: {},
    loading: false,
    viewport: 'mobile',
    previewTimer: null,
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c] }) }
  function _toast(m, t) { if (window.toast) return window.toast(m, t || 'info'); if (window.showToast) return window.showToast(m, t || 'info') }

  function _defaults() { return window.ReportLuxuryTemplatesDefaults }
  function _service()  { return window.ReportLuxuryTemplates }

  function _load() {
    if (!_service() || !_defaults()) return
    _state.loading = true
    if (!_state.activeGroup) _state.activeGroup = _defaults().GROUPS[0].id
    _render()
    _service().load().then(function () {
      _state.loading = false
      _render()
    })
  }

  function _render() {
    var root = document.getElementById('report-editor-root')
    if (!root) return
    var d = _defaults()
    if (!d) {
      root.innerHTML = '<div style="padding:40px;text-align:center">Carregando templates...</div>'
      return
    }

    root.innerHTML = '<div style="font-family:Montserrat,sans-serif;color:' + GRAPHITE + ';height:100vh;display:flex;flex-direction:column">' +
      _headerHtml() +
      '<div style="flex:1;display:grid;grid-template-columns:200px 1fr 1fr;min-height:0">' +
        _sidebarHtml() +
        _formHtml() +
        _previewPaneHtml() +
      '</div>' +
    '</div>'

    _bind()
    _refreshPreview()  // primeira renderizacao do iframe
  }

  function _headerHtml() {
    var dirtyCount = Object.keys(_state.dirty).length
    return '<div style="padding:18px 28px;background:' + WHITE + ';border-bottom:1px solid ' + BEGE + ';display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-weight:300;font-size:24px;color:' + GRAPHITE + ';line-height:1.1">Editor do <em style="color:' + GOLD_DARK + '">report luxury</em></div>' +
        '<div style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';margin-top:4px">Edite qualquer texto · preview atualiza ao vivo</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:center">' +
        (dirtyCount > 0 ? '<span style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:' + GOLD + ';font-weight:600">' + dirtyCount + ' alteração(ões) não salva(s)</span>' : '') +
        '<button id="rleSaveAll" style="padding:12px 24px;background:' + GRAPHITE + ';color:' + IVORY + ';border:none;font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer;font-family:Montserrat,sans-serif">Salvar</button>' +
      '</div>' +
    '</div>'
  }

  function _sidebarHtml() {
    var d = _defaults()
    return '<div style="background:' + IVORY + ';border-right:1px solid ' + BEGE + ';padding:16px 0;overflow-y:auto">' +
      d.GROUPS.map(function (g) {
        var active = _state.activeGroup === g.id
        var dirtyInGroup = Object.keys(_state.dirty).filter(function (k) {
          var e = d.BY_KEY[k]
          return e && e.group === g.id
        }).length
        var style = 'display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px 20px;background:' + (active ? WHITE : 'transparent') +
          ';border:none;border-left:3px solid ' + (active ? GOLD : 'transparent') +
          ';font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:0.13em;text-transform:uppercase;color:' + (active ? GRAPHITE : GRAPHITE_LIGHT) +
          ';font-weight:' + (active ? '600' : '400') + ';cursor:pointer'
        return '<button data-group="' + g.id + '" style="' + style + '">' +
          '<span>' + _esc(g.label) + '</span>' +
          (dirtyInGroup ? '<span style="background:' + GOLD + ';color:' + GRAPHITE + ';width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700">' + dirtyInGroup + '</span>' : '') +
        '</button>'
      }).join('') +
    '</div>'
  }

  function _formHtml() {
    var d = _defaults()
    var entries = d.ENTRIES.filter(function (e) { return e.group === _state.activeGroup })
    var groupLabel = (d.GROUPS.find(function (g) { return g.id === _state.activeGroup }) || {}).label || ''

    return '<div style="background:' + WHITE + ';overflow-y:auto;padding:24px 28px;border-right:1px solid ' + BEGE + '">' +
      '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-weight:300;font-size:22px;color:' + GRAPHITE + ';margin-bottom:6px">' + _esc(groupLabel) + '</div>' +
      '<div style="font-size:10px;color:' + GRAPHITE_LIGHT + ';margin-bottom:24px;line-height:1.6;opacity:0.8">' +
        'Use <code style="font-family:monospace;color:' + GOLD_DARK + '">&lt;em&gt;</code> para itálico champagne · <code style="font-family:monospace;color:' + GOLD_DARK + '">&lt;strong&gt;</code> para negrito' +
      '</div>' +
      entries.map(_entryHtml).join('') +
    '</div>'
  }

  function _entryHtml(e) {
    var svc = _service()
    var current = svc ? svc.get(e.key) : e.default
    var isOverridden = svc && svc.getRaw(e.key) != null
    var dirtyFlag = _state.dirty[e.key] !== undefined
    var displayValue = dirtyFlag ? _state.dirty[e.key] : current

    var inputHtml
    if (e.multiline) {
      inputHtml = '<textarea data-key="' + e.key + '" rows="4" style="width:100%;box-sizing:border-box;padding:12px 14px;background:' + IVORY + ';border:1px solid ' + (dirtyFlag ? GOLD : BEGE) + ';font-family:\'Cormorant Garamond\',serif;font-size:14px;color:' + GRAPHITE + ';line-height:1.6;resize:vertical">' + _esc(displayValue) + '</textarea>'
    } else {
      inputHtml = '<input data-key="' + e.key + '" type="text" value="' + _esc(displayValue) + '" style="width:100%;box-sizing:border-box;padding:10px 14px;background:' + IVORY + ';border:1px solid ' + (dirtyFlag ? GOLD : BEGE) + ';font-family:\'Cormorant Garamond\',serif;font-size:14px;color:' + GRAPHITE + '">'
    }

    return '<div style="margin-bottom:20px">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
        '<label style="font-size:9px;letter-spacing:0.13em;text-transform:uppercase;color:' + GOLD_DARK + ';font-weight:500">' + _esc(e.label) + '</label>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          (dirtyFlag ? '<span style="font-size:8px;letter-spacing:0.13em;text-transform:uppercase;color:' + GOLD + ';font-weight:600">Não salvo</span>' :
            (isOverridden ? '<span style="font-size:8px;letter-spacing:0.13em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + '">Personalizado</span>' : '')) +
          (isOverridden || dirtyFlag ? '<button data-reset="' + e.key + '" style="padding:3px 8px;background:transparent;border:1px solid ' + BEGE + ';font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';cursor:pointer;font-family:Montserrat,sans-serif">Resetar</button>' : '') +
        '</div>' +
      '</div>' +
      inputHtml +
    '</div>'
  }

  function _previewPaneHtml() {
    var current = VIEWPORTS.find(function (v) { return v.id === _state.viewport }) || VIEWPORTS[0]
    return '<div style="background:#2a2724;display:flex;flex-direction:column;overflow:hidden">' +
      // Toolbar do preview
      '<div style="padding:12px 16px;background:#1a1817;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(200,169,126,0.15)">' +
        '<div style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:' + GOLD + ';font-weight:600">Preview</div>' +
        '<div style="display:flex;gap:4px">' +
          VIEWPORTS.map(function (v) {
            var sel = v.id === _state.viewport
            return '<button data-vp="' + v.id + '" title="' + v.label + ' · ' + v.width + 'px" style="padding:6px 10px;background:' + (sel ? GOLD : 'transparent') + ';color:' + (sel ? GRAPHITE : 'rgba(245,240,232,0.7)') + ';border:1px solid ' + (sel ? GOLD : 'rgba(200,169,126,0.25)') + ';font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;cursor:pointer">' + v.label + '</button>'
          }).join('') +
          '<button id="rleReloadPreview" title="Recarregar" style="padding:6px 10px;background:transparent;color:rgba(245,240,232,0.7);border:1px solid rgba(200,169,126,0.25);font-family:Montserrat,sans-serif;font-size:10px;cursor:pointer;margin-left:8px">↻</button>' +
        '</div>' +
      '</div>' +
      // Frame do preview centralizado
      '<div style="flex:1;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto">' +
        '<div style="background:#000;box-shadow:0 24px 60px rgba(0,0,0,0.5);width:' + current.width + 'px;max-width:100%;height:calc(100vh - 200px);transition:width .25s ease">' +
          '<iframe id="rlePreviewFrame" style="width:100%;height:100%;border:none;background:#1a1817;display:block"></iframe>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _bind() {
    var root = document.getElementById('report-editor-root')
    if (!root) return

    root.querySelectorAll('[data-group]').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.activeGroup = b.getAttribute('data-group')
        _render()
      })
    })

    root.querySelectorAll('[data-vp]').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.viewport = b.getAttribute('data-vp')
        _render()
      })
    })

    root.querySelectorAll('[data-key]').forEach(function (el) {
      el.addEventListener('input', function () {
        var key = el.getAttribute('data-key')
        var val = el.value
        var d = _defaults()
        var defaultVal = d.getDefault(key)
        var current = _service().getRaw(key)
        if (val === current || (current == null && val === defaultVal)) {
          delete _state.dirty[key]
        } else {
          _state.dirty[key] = val
        }
        // Atualiza badge "Não salvo" no header e no campo, mas NAO re-renderiza
        // tudo (preserva o cursor). Apenas o preview muda.
        _updateDirtyBadges()
        _schedulePreviewRefresh()
      })
    })

    root.querySelectorAll('[data-reset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-reset')
        if (!confirm('Resetar este campo para o texto padrão?')) return
        delete _state.dirty[key]
        _service().reset(key).then(function () {
          _toast('Campo resetado', 'success')
          _render()
        }).catch(function (e) { _toast('Falha: ' + (e.message || ''), 'error') })
      })
    })

    var saveBtn = root.querySelector('#rleSaveAll')
    if (saveBtn) saveBtn.addEventListener('click', _saveAll)

    var reloadBtn = root.querySelector('#rleReloadPreview')
    if (reloadBtn) reloadBtn.addEventListener('click', _refreshPreview)
  }

  function _updateDirtyBadges() {
    var root = document.getElementById('report-editor-root')
    if (!root) return
    var dirtyCount = Object.keys(_state.dirty).length
    // Atualiza so o header (label "X alteracoes") sem mexer no form para preservar cursor
    var hdr = root.querySelector('#rleSaveAll')
    if (hdr && hdr.parentNode) {
      var existing = hdr.parentNode.querySelector('.rle-dirty-count')
      if (existing) existing.remove()
      if (dirtyCount > 0) {
        var span = document.createElement('span')
        span.className = 'rle-dirty-count'
        span.style.cssText = 'font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:' + GOLD + ';font-weight:600;margin-right:4px'
        span.textContent = dirtyCount + ' não salva(s)'
        hdr.parentNode.insertBefore(span, hdr)
      }
    }
  }

  function _schedulePreviewRefresh() {
    if (_state.previewTimer) clearTimeout(_state.previewTimer)
    _state.previewTimer = setTimeout(_refreshPreview, 350)
  }

  function _refreshPreview() {
    var iframe = document.getElementById('rlePreviewFrame')
    if (!iframe || !window.ReportLuxuryRenderer || !window.ReportLuxuryRenderer.buildPreviewHtml) return
    try {
      var html = window.ReportLuxuryRenderer.buildPreviewHtml(_state.dirty)
      iframe.srcdoc = html
    } catch (e) { console.warn('[ReportEditor] preview error:', e) }
  }

  function _saveAll() {
    var keys = Object.keys(_state.dirty)
    if (!keys.length) { _toast('Nenhuma alteração para salvar', 'info'); return }
    var svc = _service()
    if (!svc) { _toast('Serviço indisponível', 'error'); return }

    Promise.all(keys.map(function (k) {
      return svc.set(k, _state.dirty[k])
    })).then(function () {
      _state.dirty = {}
      _toast(keys.length + ' alteração(ões) salva(s)', 'success')
      _render()
    }).catch(function (e) {
      _toast('Falha ao salvar: ' + (e.message || ''), 'error')
    })
  }

  window.ReportLuxuryEditor = { init: _load, refreshPreview: _refreshPreview }

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('clinicai:page-change', function (e) {
      if (e.detail === 'report-editor') _load()
    })
    var t = setInterval(function () {
      var page = document.getElementById('page-report-editor')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(t); _load()
      }
    }, 500)
    setTimeout(function () { clearInterval(t) }, 30000)
  })
})()
