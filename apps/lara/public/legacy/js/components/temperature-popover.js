/**
 * ClinicAI — TemperaturePopover (extraído de leads.js no Sprint 9)
 *
 * Popover flutuante para selecionar a temperatura de um lead.
 * Reutiliza as classes CSS do TagPopover (tag-popover, tp-*).
 *
 * Expõe globalmente:
 *   _leadsTempPopover(anchorEl, leadId, currentTemp)
 *   leadsSetTemperature(leadId, temp, badgeEl)
 */

var _TEMP_CFG = {
  cold: { label: 'Frio',   color: '#93c5fd', bg: '#eff6ff', icon: '❄' },
  warm: { label: 'Morno',  color: '#f59e0b', bg: '#fffbeb', icon: '◑' },
  hot:  { label: 'Quente', color: '#f87171', bg: '#fef2f2', icon: '●' },
}

var _tempPopoverEl      = null
var _tempOutsideHandler = null

function _tempEscHandler(e) { if (e.key === 'Escape') _leadsTempPopoverClose() }

function _leadsTempPopoverClose() {
  if (_tempOutsideHandler) {
    document.removeEventListener('mousedown', _tempOutsideHandler)
    _tempOutsideHandler = null
  }
  document.removeEventListener('keydown', _tempEscHandler)
  _tempPopoverEl?.remove()
  _tempPopoverEl = null
}

function _leadsTempPopover(anchorEl, leadId, currentTemp) {
  _leadsTempPopoverClose()

  var tagsHtml = Object.keys(_TEMP_CFG).map(function(key) {
    var cfg    = _TEMP_CFG[key]
    var active = key === currentTemp
    return '<button class="tp-tag-btn" style="' +
      '--tag-color:' + cfg.color + ';' +
      'border-color:' + (active ? cfg.color : '#e5e7eb') + ';' +
      'background:' + (active ? cfg.color + '18' : '#fff') + ';' +
      'color:' + (active ? cfg.color : '#374151') + ';' +
      'width:100%" data-temp="' + key + '">' +
        '<span class="tp-tag-dot" style="background:' + cfg.color + '"></span>' +
        cfg.icon + ' ' + cfg.label +
        (active ? '<svg class="tp-tag-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="' + cfg.color + '" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
    '</button>'
  }).join('')

  var wrapper = document.createElement('div')
  wrapper.innerHTML =
    '<div class="tag-popover" style="position:fixed;z-index:9999;width:200px">' +
      '<div class="tp-header">' +
        '<span class="tp-title">Temperatura</span>' +
        '<button class="tp-close-btn" id="tempPopClose">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="tp-body" style="padding:10px 12px">' +
        '<div class="tp-group-tags" style="flex-direction:column;gap:5px;display:flex">' + tagsHtml + '</div>' +
      '</div>' +
    '</div>'

  _tempPopoverEl = wrapper.firstElementChild
  document.body.appendChild(_tempPopoverEl)

  var rect    = anchorEl.getBoundingClientRect()
  var popW    = 200
  var popH    = _tempPopoverEl.offsetHeight || 160
  var winW    = window.innerWidth
  var winH    = window.innerHeight
  var scrollY = window.scrollY || document.documentElement.scrollTop
  var left    = rect.left + rect.width / 2 - popW / 2
  var top     = rect.bottom + scrollY + 8
  if (left + popW > winW - 12) left = winW - popW - 12
  if (left < 8) left = 8
  if (rect.bottom + popH + 8 > winH) top = rect.top + scrollY - popH - 8
  _tempPopoverEl.style.left = left + 'px'
  _tempPopoverEl.style.top  = top  + 'px'

  _tempPopoverEl.querySelector('#tempPopClose').onclick = _leadsTempPopoverClose

  _tempPopoverEl.querySelectorAll('.tp-tag-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var temp = btn.dataset.temp
      _leadsTempPopoverClose()
      await leadsSetTemperature(leadId, temp, anchorEl)
    })
  })

  _tempOutsideHandler = function(e) {
    if (_tempPopoverEl && !_tempPopoverEl.contains(e.target) && e.target !== anchorEl) {
      _leadsTempPopoverClose()
    }
  }
  setTimeout(function() {
    document.addEventListener('mousedown', _tempOutsideHandler)
    document.addEventListener('keydown', _tempEscHandler)
  }, 0)
}

async function leadsSetTemperature(leadId, temp, badgeEl) {
  var cfg = _TEMP_CFG[temp] || _TEMP_CFG.cold
  if (badgeEl) {
    badgeEl.style.color       = cfg.color
    badgeEl.style.background  = cfg.bg
    badgeEl.style.borderColor = cfg.color + '40'
    badgeEl.dataset.temp      = temp
    badgeEl.innerHTML = '<span class="lc-badge-dot" style="background:' + cfg.color + '"></span>' + cfg.label
  }
  if (window.SdrService) await SdrService.setTemperature(leadId, temp)
  else if (window._sbShared) await window._sbShared.from('leads').update({ temperature: temp }).eq('id', leadId)
  _leadsUpdateCache(leadId, { temperature: temp })
  _leadsRefreshKanban()
  window.RulesService?.evaluateRules(leadId, 'temperature_changed', { temperature: temp })
}
