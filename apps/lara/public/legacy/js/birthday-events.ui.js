/**
 * ClinicAI — Birthday Events
 *
 * Todos os event handlers do modulo de aniversarios.
 * Separado do render para manter arquivos pequenos.
 *
 * Depende de: BirthdayUI, BirthdayTemplatesUI, BirthdayService
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayEventsLoaded) return
  window._clinicaiBirthdayEventsLoaded = true

  var _ico = function (n, sz) { return window.BirthdayUI ? window.BirthdayUI.ico(n, sz) : '' }

  function attach() {
    _attachTabs()
    _attachPauseResume()
    _attachScan()
    _attachSegFilters()
    _attachLeadToggles()
    _attachAutoExclude()
    _attachTemplateActions()
    _attachTemplateForm()
    _attachFormattingToolbar()
    _attachLivePreview()
    _attachShortLinks()
    _attachVipFilter()
  }

  function _attachVipFilter() {
    var cb = document.getElementById('bdayVipOnly')
    if (cb) {
      cb.addEventListener('change', function() {
        if (window.BirthdayUI && window.BirthdayUI.setVipFilter) {
          window.BirthdayUI.setVipFilter(cb.checked)
        }
      })
    }
  }

  // ── Tab navigation ─────────────────────────────────────────
  function _attachTabs() {
    document.querySelectorAll('.bday-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.BirthdayUI.setState('tab', btn.dataset.tab)
        if (window.BirthdayTemplatesUI) window.BirthdayTemplatesUI.setEditId(null)
        window.BirthdayUI.render()
      })
    })
  }

  // ── Pause / Resume ──────────────────────────────────────────
  function _attachPauseResume() {
    var pauseBtn = document.getElementById('bdayPauseBtn')
    var resumeBtn = document.getElementById('bdayResumeBtn')

    if (pauseBtn) {
      pauseBtn.addEventListener('click', async function () {
        if (!confirm('Pausar todas as campanhas de aniversario? Nenhuma mensagem sera enviada ate retomar.')) return
        pauseBtn.disabled = true
        pauseBtn.textContent = 'Pausando...'
        var r = await window.BirthdayService.pauseAll()
        window.BirthdayUI.render()
        _toast((r.data?.paused || 0) + ' campanhas pausadas', 'success')
      })
    }

    if (resumeBtn) {
      resumeBtn.addEventListener('click', async function () {
        resumeBtn.disabled = true
        resumeBtn.textContent = 'Retomando...'
        var r = await window.BirthdayService.resumeAll()
        window.BirthdayUI.render()
        _toast((r.data?.resumed || 0) + ' campanhas retomadas', 'success')
      })
    }
  }

  // ── Scan button ────────────────────────────────────────────
  function _attachScan() {
    var btn = document.getElementById('bdayScanBtn')
    if (!btn) return
    btn.addEventListener('click', async function () {
      btn.disabled = true
      btn.innerHTML = _ico('loader', 14) + ' Escaneando...'
      var result = await window.BirthdayService.runScan()
      window.BirthdayUI.setState('loading', true)
      window.BirthdayUI.render()
      await window.BirthdayService.loadAll()
      window.BirthdayUI.setState('loading', false)
      window.BirthdayUI.render()

      var msg = result.campaigns_created + ' campanhas criadas'
      if (result.enqueued > 0) msg += ', ' + result.enqueued + ' mensagens enfileiradas'
      _toast(msg, 'success')
    })
  }

  // ── Segment filters ────────────────────────────────────────
  function _attachSegFilters() {
    document.querySelectorAll('.bday-seg-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.BirthdayUI.setState('segFilter', btn.dataset.seg || null)
        window.BirthdayUI.render()
      })
    })
  }

  // ── Lead toggles (per-campaign activate/deactivate) ─────────
  function _attachLeadToggles() {
    document.querySelectorAll('[data-toggle-lead]').forEach(function (cb) {
      cb.addEventListener('change', async function () {
        var r = await window.BirthdayService.toggleLead(cb.dataset.toggleLead, cb.checked)
        if (r.ok) {
          window.BirthdayUI.render()
          _toast(cb.checked ? 'Lead ativado' : 'Lead desativado', 'success')
        } else {
          cb.checked = !cb.checked
          _toast(r.data?.error || 'Erro ao alterar', 'error')
        }
      })
    })
  }

  // ── Auto-exclude button ────────────────────────────────────
  function _attachAutoExclude() {
    var btn = document.getElementById('bdayAutoExclude')
    if (!btn) return
    btn.addEventListener('click', async function () {
      btn.disabled = true
      btn.textContent = 'Aplicando...'
      var r = await window.BirthdayService.autoExclude()
      window.BirthdayUI.render()
      _toast((r.data?.excluded || 0) + ' leads exclu\u00eddos pelas regras', 'success')
    })
  }

  // ── Template actions (edit, delete, toggle, add) ───────────
  function _attachTemplateActions() {
    var tmplUI = window.BirthdayTemplatesUI
    if (!tmplUI) return

    // Add new
    var addBtn = document.getElementById('bdayAddTmpl')
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        tmplUI.setEditId('new')
        window.BirthdayUI.render()
      })
    }

    // Edit
    document.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tmplUI.setEditId(btn.dataset.edit)
        window.BirthdayUI.render()
      })
    })

    // Delete
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Remover esta mensagem da sequencia?')) return
        await window.BirthdayService.deleteTemplate(btn.dataset.del)
        window.BirthdayUI.render()
      })
    })

    // Toggle active
    document.querySelectorAll('[data-toggle]').forEach(function (cb) {
      cb.addEventListener('change', async function () {
        await window.BirthdayService.toggleTemplate(cb.dataset.toggle, cb.checked)
        window.BirthdayUI.render()
      })
    })
  }

  // ── Template form (save, cancel) ───────────────────────────
  function _attachTemplateForm() {
    var tmplUI = window.BirthdayTemplatesUI
    if (!tmplUI) return
    var editId = tmplUI.getEditId()
    if (!editId) return

    // Save
    var saveBtn = document.getElementById('bdayTmplSave')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var label = (document.getElementById('bdayTmplLabel')?.value || '').trim()
        var content = (document.getElementById('bdayTmplContent')?.value || '').trim()
        var offset = parseInt(document.getElementById('bdayTmplOffset')?.value) || 30
        var hour = parseInt(document.getElementById('bdayTmplHour')?.value) || 10
        var order = parseInt(document.getElementById('bdayTmplOrder')?.value) || 1
        var media = (document.getElementById('bdayTmplMedia')?.value || '').trim()

        if (!label) { _toast('Preencha o titulo', 'error'); return }
        if (!content) { _toast('Preencha a mensagem', 'error'); return }

        saveBtn.disabled = true
        saveBtn.textContent = 'Salvando...'

        await window.BirthdayService.saveTemplate({
          id: editId === 'new' ? null : editId,
          label: label,
          content: content,
          day_offset: offset,
          send_hour: hour,
          sort_order: order,
          media_url: media || null
        })
        tmplUI.setEditId(null)
        window.BirthdayUI.render()
        _toast('Mensagem salva', 'success')
      })
    }

    // Cancel
    var cancelBtn = document.getElementById('bdayTmplCancel')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        tmplUI.setEditId(null)
        window.BirthdayUI.render()
      })
    }
  }

  // ── Live preview (textarea → phone preview) ────────────────
  function _attachLivePreview() {
    var textarea = document.getElementById('bdayTmplContent')
    var chat = document.getElementById('bdayPhoneChat')
    var hourInput = document.getElementById('bdayTmplHour')
    if (!textarea || !chat) return

    var previewLead = { name: 'Maria', queixas: 'flacidez e rugas', age_turning: 45, has_open_budget: true, budget_title: 'Lifting 5D', budget_total: 3500 }

    var checkSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 12 5 16 12 6"/><polyline points="7 12 11 16 18 6"/></svg>'

    function _updatePreview() {
      var linkInput = document.getElementById('bdayTmplLink')
      var text = textarea.value
      if (linkInput && linkInput.value.trim()) text += '\n\n' + linkInput.value.trim()
      var resolved = window.BirthdayService.resolveVariables(text, previewLead)
      var formatted = window.BirthdayTemplatesUI.waFormat(resolved)
      formatted = formatted.replace(/\[(nome|queixas|idade|orcamento)\]/gi, '<span class="bc-wa-tag">[$1]</span>')
      var h = hourInput ? parseInt(hourInput.value) || 10 : 10
      var hStr = (h < 10 ? '0' : '') + h + ':00'
      if (formatted && formatted.trim()) {
        chat.innerHTML = '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + formatted + '</div><div class="bc-wa-bubble-time">' + hStr + ' ' + checkSvg + '</div></div>'
      } else {
        chat.innerHTML = '<div class="bc-wa-empty">Digite a mensagem ao lado para ver o preview</div>'
      }
    }

    textarea.addEventListener('input', _updatePreview)
    if (hourInput) hourInput.addEventListener('input', _updatePreview)
    var linkInput = document.getElementById('bdayTmplLink')
    if (linkInput) linkInput.addEventListener('input', _updatePreview)
  }

  // ── Formatting toolbar (reuses bc-* classes from broadcast) ─
  function _attachFormattingToolbar() {
    var textarea = document.getElementById('bdayTmplContent')
    if (!textarea) return

    // Tag insertion ([nome], [queixas], etc) — bc-tag-btn class
    document.querySelectorAll('.bc-tag-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _insertAtCursor(textarea, btn.dataset.tag)
      })
    })

    // Wrap formatting (*bold*, _italic_, ~strike~, ```mono```) — bc-fmt-btn class
    document.querySelectorAll('.bc-fmt-btn').forEach(function (btn) {
      if (!btn.dataset.wrap) return
      btn.addEventListener('click', function () {
        var wrap = btn.dataset.wrap
        var start = textarea.selectionStart
        var end = textarea.selectionEnd
        var text = textarea.value
        var selected = text.substring(start, end)

        if (selected) {
          var before = text.substring(Math.max(0, start - wrap.length), start)
          var after = text.substring(end, end + wrap.length)
          if (before === wrap && after === wrap) {
            textarea.value = text.substring(0, start - wrap.length) + selected + text.substring(end + wrap.length)
            textarea.selectionStart = start - wrap.length
            textarea.selectionEnd = end - wrap.length
          } else {
            textarea.value = text.substring(0, start) + wrap + selected + wrap + text.substring(end)
            textarea.selectionStart = start + wrap.length
            textarea.selectionEnd = end + wrap.length
          }
        } else {
          textarea.value = text.substring(0, start) + wrap + wrap + text.substring(end)
          textarea.selectionStart = textarea.selectionEnd = start + wrap.length
        }
        textarea.focus()
        textarea.dispatchEvent(new Event('input'))
      })
    })

    // Emoji picker — bc-emoji-* classes
    var emojiToggle = document.getElementById('bdayEmojiToggle')
    var emojiPicker = document.getElementById('bdayEmojiPicker')
    if (emojiToggle && emojiPicker) {
      emojiToggle.addEventListener('click', function () {
        emojiPicker.classList.toggle('open')
      })
      document.querySelectorAll('.bc-emoji-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          _insertAtCursor(textarea, btn.dataset.emoji)
          emojiPicker.classList.remove('open')
        })
      })
    }
  }

  function _insertAtCursor(textarea, text) {
    var start = textarea.selectionStart
    var end = textarea.selectionEnd
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end)
    textarea.selectionStart = textarea.selectionEnd = start + text.length
    textarea.focus()
    textarea.dispatchEvent(new Event('input'))
  }

  // ── Short links ────────────────────────────────────────────
  function _attachShortLinks() {
    var addBtn = document.getElementById('bdayAddLink')
    var form = document.getElementById('bdayLinkForm')
    if (addBtn && form) {
      addBtn.addEventListener('click', function () {
        form.style.display = form.style.display === 'none' ? 'block' : 'none'
      })
    }

    var cancelBtn = document.getElementById('bdayLinkCancel')
    if (cancelBtn && form) {
      cancelBtn.addEventListener('click', function () { form.style.display = 'none' })
    }

    var saveBtn = document.getElementById('bdayLinkSave')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var code = (document.getElementById('bdayLinkCode')?.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
        var url = (document.getElementById('bdayLinkUrl')?.value || '').trim()
        var title = (document.getElementById('bdayLinkTitle')?.value || '').trim()
        if (!code || !url) { _toast('Preencha c\u00f3digo e URL', 'error'); return }
        if (!url.startsWith('http')) { _toast('URL deve come\u00e7ar com http', 'error'); return }

        saveBtn.disabled = true
        saveBtn.textContent = 'Criando...'
        var sbUrl = (window.ClinicEnv?.SUPABASE_URL || '') + '/rest/v1/rpc/short_link_create'
        var key = window.ClinicEnv?.SUPABASE_KEY || ''
        await fetch(sbUrl, {
          method: 'POST',
          headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_code: code, p_url: url, p_title: title || null })
        })
        await window.BirthdayTemplatesUI.loadShortLinks()
        window.BirthdayUI.render()
        _toast('Link criado: /r.html?c=' + code, 'success')
      })
    }

    // Copy buttons
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(btn.dataset.copy).then(function () {
          _toast('Link copiado!', 'success')
        }).catch(function () {
          // Fallback
          var input = document.createElement('input')
          input.value = btn.dataset.copy
          document.body.appendChild(input)
          input.select()
          document.execCommand('copy')
          document.body.removeChild(input)
          _toast('Link copiado!', 'success')
        })
      })
    })

    // Delete buttons
    document.querySelectorAll('[data-del-code]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Excluir este link?')) return
        var sbUrl = (window.ClinicEnv?.SUPABASE_URL || '') + '/rest/v1/rpc/short_link_delete'
        var key = window.ClinicEnv?.SUPABASE_KEY || ''
        await fetch(sbUrl, {
          method: 'POST',
          headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_code: btn.dataset.delCode })
        })
        await window.BirthdayTemplatesUI.loadShortLinks()
        window.BirthdayUI.render()
        _toast('Link exclu\u00eddo', 'success')
      })
    })
  }

  // ── Toast helper ───────────────────────────────────────────
  function _toast(msg, type) {
    var existing = document.querySelector('.bday-toast')
    if (existing) existing.remove()
    var el = document.createElement('div')
    el.className = 'bday-toast bday-toast-' + (type || 'info')
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(function () { el.classList.add('bday-toast-show') }, 10)
    setTimeout(function () { el.remove() }, 3000)
  }

  // ── Expose ─────────────────────────────────────────────────
  window.BirthdayEvents = Object.freeze({ attach: attach })
})()
