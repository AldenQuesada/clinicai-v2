/**
 * ClinicAI - Retoques Modal UI
 *
 * Popup mostrado apos finalize de procedimento perguntando se quer agendar
 * sugestao de retoque. Auto-contido — DOM gerado e removido sem afetar
 * resto da pagina.
 *
 * Expoe window.RetoquesModal:
 *   open(appt, callback)
 *     callback recebe { offsetDays, notes, skipped } ou null se cancelar.
 *
 * Estilo: alinha com paleta dourada (C8A97E) e dark da clinica
 * (ver reference_clinic_brandbook). Sem emojis (feedback_no_emojis).
 */
;(function () {
  'use strict'

  if (window._retoquesModalLoaded) return
  window._retoquesModalLoaded = true

  var GOLD = '#C8A97E'
  var DARK = '#0A0A0A'
  var TEXT = '#F5F0E8'

  function _close(el) {
    if (!el || !el.parentNode) return
    el.style.opacity = '0'
    setTimeout(function () { if (el.parentNode) el.remove() }, 200)
  }

  function _renderOption(p, isSelected) {
    var bg = isSelected ? GOLD : 'transparent'
    var color = isSelected ? DARK : TEXT
    var border = isSelected ? GOLD : 'rgba(200,169,126,0.3)'
    return (
      '<button data-offset="' + p.value + '" type="button" style="' +
        'flex:1 1 calc(33% - 8px);min-width:120px;padding:14px 12px;' +
        'border:1px solid ' + border + ';border-radius:10px;' +
        'background:' + bg + ';color:' + color + ';cursor:pointer;' +
        'font-family:Montserrat,sans-serif;text-align:left;transition:all .15s' +
      '">' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:4px">' + p.label + '</div>' +
        '<div style="font-size:10px;opacity:0.75;line-height:1.3">' + p.description + '</div>' +
      '</button>'
    )
  }

  var RetoquesModal = {
    open: function (appt, callback) {
      var presets = (window.RetoquesConfig && window.RetoquesConfig.OFFSET_PRESETS) || []
      var procedureLabel = (function () {
        if (Array.isArray(appt.procedimentos) && appt.procedimentos.length) {
          return appt.procedimentos.map(function (p) {
            return (typeof p === 'string') ? p : (p.nome || p.label || '')
          }).filter(Boolean).join(' + ')
        }
        return appt.procedimento || appt.tipo || 'Procedimento'
      })()
      var pacienteNome = appt.paciente || appt.pacienteNome || appt.nome || 'paciente'

      var overlay = document.createElement('div')
      overlay.style.cssText = (
        'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;' +
        'backdrop-filter:blur(8px);opacity:0;transition:opacity .2s'
      )
      overlay.innerHTML = (
        '<div style="background:' + DARK + ';border:1px solid rgba(200,169,126,0.2);' +
                    'border-radius:16px;max-width:560px;width:100%;padding:32px;' +
                    'color:' + TEXT + ';font-family:Montserrat,sans-serif;' +
                    'box-shadow:0 32px 80px rgba(0,0,0,0.7)">' +

          // Header
          '<div style="margin-bottom:20px">' +
            '<div style="font-family:Cormorant Garamond,serif;font-size:24px;font-style:italic;' +
                        'color:' + GOLD + ';margin-bottom:6px">Sugerir retoque?</div>' +
            '<div style="font-size:12px;color:rgba(245,240,232,0.65);line-height:1.5">' +
              '<strong style="color:' + TEXT + '">' + pacienteNome + '</strong> acabou de finalizar <em>' + procedureLabel + '</em>. ' +
              'Selecione o intervalo sugerido para acompanhamento — o sistema cuida do lembrete automatico.' +
            '</div>' +
          '</div>' +

          // Opcoes de offset
          '<div id="retoqueOptions" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">' +
            presets.map(function (p) { return _renderOption(p, false) }).join('') +
          '</div>' +

          // Notas
          '<div style="margin-bottom:20px">' +
            '<label style="font-size:10px;color:rgba(200,169,126,0.7);letter-spacing:0.08em;' +
                          'text-transform:uppercase;font-weight:700;display:block;margin-bottom:6px">' +
              'Observacoes (opcional)' +
            '</label>' +
            '<textarea id="retoqueNotes" rows="2" placeholder="Ex.: avaliar projecao do labio superior..." style="' +
                'width:100%;box-sizing:border-box;padding:10px 12px;background:rgba(245,240,232,0.04);' +
                'border:1px solid rgba(200,169,126,0.2);border-radius:8px;color:' + TEXT + ';' +
                'font-size:12px;font-family:Montserrat,sans-serif;resize:vertical"></textarea>' +
          '</div>' +

          // Acoes
          '<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">' +
            '<button id="retoqueSkip" type="button" style="' +
                'padding:10px 16px;border:1px solid rgba(245,240,232,0.15);border-radius:8px;' +
                'background:transparent;color:rgba(245,240,232,0.6);cursor:pointer;' +
                'font-family:Montserrat,sans-serif;font-size:12px">' +
              'Nao sugerir' +
            '</button>' +
            '<button id="retoqueConfirm" type="button" disabled style="' +
                'padding:10px 20px;border:none;border-radius:8px;' +
                'background:rgba(200,169,126,0.3);color:rgba(10,10,10,0.5);cursor:not-allowed;' +
                'font-family:Montserrat,sans-serif;font-size:12px;font-weight:700;' +
                'letter-spacing:0.04em;transition:all .15s">' +
              'Confirmar sugestao' +
            '</button>' +
          '</div>' +

        '</div>'
      )
      document.body.appendChild(overlay)
      requestAnimationFrame(function () { overlay.style.opacity = '1' })

      var selected = null
      var notesEl = overlay.querySelector('#retoqueNotes')
      var confirmBtn = overlay.querySelector('#retoqueConfirm')
      var skipBtn = overlay.querySelector('#retoqueSkip')
      var optsEl = overlay.querySelector('#retoqueOptions')

      function _refreshOptions() {
        optsEl.innerHTML = presets.map(function (p) {
          return _renderOption(p, selected === p.value)
        }).join('')
        // Re-bind clicks
        optsEl.querySelectorAll('button[data-offset]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            selected = parseInt(btn.getAttribute('data-offset'), 10)
            _refreshOptions()
            confirmBtn.disabled = false
            confirmBtn.style.background = GOLD
            confirmBtn.style.color = DARK
            confirmBtn.style.cursor = 'pointer'
          })
        })
      }
      _refreshOptions()

      function _done(result) {
        _close(overlay)
        try { callback && callback(result) } catch (e) { console.warn('[RetoquesModal] callback error:', e) }
      }

      skipBtn.addEventListener('click', function () { _done({ skipped: true }) })
      confirmBtn.addEventListener('click', function () {
        if (!selected) return
        _done({
          offsetDays: selected,
          notes: (notesEl.value || '').trim(),
          skipped: false,
        })
      })
      // ESC fecha
      function _keydown(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', _keydown)
          _done({ skipped: true })
        }
      }
      document.addEventListener('keydown', _keydown)
    },
  }

  window.RetoquesModal = RetoquesModal
})()
