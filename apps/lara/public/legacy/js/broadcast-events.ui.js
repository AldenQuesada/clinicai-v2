/**
 * ClinicAI — Broadcast Events (extracted from automations.ui.js)
 *
 * All broadcast event handlers and bindings.
 * Uses BroadcastUI.getState() / setState() for state access.
 * Uses window._clinicaiRender() for re-renders.
 */

;(function () {
  'use strict'

  if (window._clinicaiBroadcastEventsLoaded) return
  window._clinicaiBroadcastEventsLoaded = true

  // ── Shared helper aliases ───────────────────────────────────
  var _esc = function(s) { return window._clinicaiHelpers.esc(s) }
  var _feather = function(n, s) { return window._clinicaiHelpers.feather(n, s) }

  function _render() { window._clinicaiRender() }

  function _showToast(msg, type) {
    if (window._clinicaiHelpers && window._clinicaiHelpers.showToast) window._clinicaiHelpers.showToast(msg, type)
  }

  // ── Event binding ───────────────────────────────────────────

  function _bindBroadcastEvents(root) {
    var st = window.BroadcastUI.getState()

    // Prefill vindo da tabela de leads (botao Broadcast na bulk bar)
    try {
      var raw = sessionStorage.getItem('clinicai_broadcast_prefill')
      if (raw) {
        var pref = JSON.parse(raw)
        // so aplica se recente (<5min) e ainda nao aplicado nesta sessao
        var fresh = pref && pref.ts && (Date.now() - pref.ts) < 5 * 60 * 1000
        var already = st.broadcastMode === 'new' && (st.broadcastForm && st.broadcastForm.selected_leads && st.broadcastForm.selected_leads.length)
        if (fresh && !already && Array.isArray(pref.lead_ids) && pref.lead_ids.length) {
          var allLeads = (window.LeadsService && window._clinicaiAllLeadsCache) || []
          // Tenta pegar do cache global ou LeadsService
          if (!allLeads.length) {
            allLeads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
          }
          var byId = {}
          allLeads.forEach(function (l) { byId[l.id] = l })
          var selected = pref.lead_ids.map(function (id) {
            var l = byId[id] || { id: id, name: '(lead)', phone: '' }
            return { id: l.id, name: l.name || l.nome || '(sem nome)', phone: l.phone || l.telefone || '' }
          })
          var form = window.BroadcastUI.emptyForm()
          form.selected_leads = selected
          // So aceita [queixa] se EXATAMENTE 1 queixa foi filtrada
          if (pref.queixas && pref.queixas.length === 1 && window.LeadsQueixa) {
            form._target_queixa = window.LeadsQueixa.label(pref.queixas[0])
            form.name = 'Broadcast — ' + form._target_queixa + ' (' + selected.length + ')'
          } else if (pref.queixas && pref.queixas.length > 1) {
            form.name = 'Broadcast — ' + pref.queixas.length + ' queixas (' + selected.length + ')'
          } else {
            form.name = 'Broadcast — ' + selected.length + ' lead(s)'
          }
          window.BroadcastUI.setState('broadcastForm', form)
          window.BroadcastUI.setState('broadcastMode', 'new')
          window.BroadcastUI.setState('broadcastSelected', null)
          window.BroadcastUI.setState('bcPanelOpen', true)
          window.BroadcastUI.setState('bcPanelTab', 'editor')
          window.BroadcastUI.setState('_editingBroadcastId', null)
          sessionStorage.removeItem('clinicai_broadcast_prefill')
          setTimeout(_render, 0)
        }
      }
    } catch (e) { console.warn('[broadcast] prefill error:', e) }

    // New broadcast buttons (stats sidebar + center empty state)
    var newBtns = root.querySelectorAll('#bcNewBtn, #bcNewBtn2')
    newBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        // Tenta restaurar rascunho salvo (< 7 dias)
        var draft = window.BroadcastUI.draftLoad ? window.BroadcastUI.draftLoad() : null
        var formBase = (draft && (draft.name || draft.content || draft.media_url))
          ? draft
          : window.BroadcastUI.emptyForm()
        window.BroadcastUI.setState('broadcastForm', formBase)
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('broadcastSelected', null)
        window.BroadcastUI.setState('bcPanelOpen', true)
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', null)
        if (formBase !== draft) { /* noop */ } else if (draft) {
          if (window._showToast) _showToast('Rascunho recuperado — continue de onde parou', 'info')
        }
        _render()
      })
    })

    // Slide panel close button — goes back to history (never fully closes)
    var closeBtn = document.getElementById('bcSlideClose')
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        var curState = window.BroadcastUI.getState()
        if (curState.panelTab === 'editor') {
          window.BroadcastUI.setState('bcPanelTab', 'history')
          window.BroadcastUI.setState('broadcastMode', 'detail')
          if (!curState.selected && curState.broadcasts.length > 0) {
            window.BroadcastUI.setState('broadcastSelected', curState.broadcasts[0].id)
          }
        }
        _render()
      })
    }

    // Slide panel overlay — no action (panel stays open)
    var overlay = document.getElementById('bcSlideOverlay')
    if (overlay) {
      overlay.addEventListener('click', function() {
        // panel stays open — do nothing
      })
    }

    // Delete broadcast — step 1: show confirm
    document.querySelectorAll('.bc-hist-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        window.BroadcastUI.setState('bcDeleteConfirm', btn.dataset.id)
        _render()
      })
    })

    // Delete broadcast — step 2: confirm yes
    document.querySelectorAll('.bc-hist-del-yes').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.preventDefault()
        e.stopPropagation()
        var id = btn.dataset.id
        window.BroadcastUI.setState('bcDeleteConfirm', null)
        var result = await window.BroadcastService.deleteBroadcast(id)
        if (result && result.ok) {
          _showToast('Disparo removido')
          var curState = window.BroadcastUI.getState()
          if (curState.selected === id) {
            window.BroadcastUI.setState('broadcastSelected', null)
            window.BroadcastUI.setState('broadcastMode', 'detail')
          }
          await window.BroadcastUI.loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao remover', 'error')
          _render()
        }
      })
    })

    // Delete broadcast — step 2: confirm no
    document.querySelectorAll('.bc-hist-del-no').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        window.BroadcastUI.setState('bcDeleteConfirm', null)
        _render()
      })
    })

    // Panel tab switching
    root.querySelectorAll('.bc-slide-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.panelTab
        var curState = window.BroadcastUI.getState()
        if (tab && tab !== curState.panelTab) {
          window.BroadcastUI.setState('bcPanelTab', tab)
          if (tab === 'history' || tab === 'scheduled') {
            window.BroadcastUI.setState('broadcastSelected', null)
            window.BroadcastUI.setState('broadcastMode', 'dashboard')
          }
          _render()
        }
      })
    })

    // History tab item click — show detail in center, panel stays open
    root.querySelectorAll('.bc-hist-item').forEach(function(item) {
      item.addEventListener('click', async function() {
        window.BroadcastUI.setState('broadcastSelected', item.dataset.id)
        window.BroadcastUI.setState('broadcastMode', 'detail')
        window.BroadcastUI.setState('bcStats', null)
        window.BroadcastUI.setState('bcSegment', 'all')
        window.BroadcastUI.setState('bcSegmentLeads', [])
        window.BroadcastUI.setState('bcConfirmSend', false)
        _render()
        // Load stats async
        if (window.BroadcastService && window.BroadcastService.getBroadcastStats) {
          var result = await window.BroadcastService.getBroadcastStats(item.dataset.id)
          if (result && result.ok && result.data) {
            window.BroadcastUI.setState('bcStats', result.data)
            _render()
          }
        }
      })
    })

    // Media upload button → trigger file input
    var uploadBtn = document.getElementById('bcMediaUploadBtn')
    var fileInput = document.getElementById('bcMediaFile')
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function() { fileInput.click() })
      fileInput.addEventListener('change', async function() {
        if (!fileInput.files || !fileInput.files[0]) return
        var file = fileInput.files[0]
        if (!file.type.startsWith('image/')) {
          _showToast('Selecione um arquivo de imagem', 'error')
          return
        }
        window.BroadcastUI.setState('bcUploading', true)
        uploadBtn.textContent = 'Enviando...'
        uploadBtn.disabled = true
        try {
          var ts = Date.now()
          var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          var path = 'broadcasts/' + ts + '-' + safeName
          // Credenciais via ClinicEnv (fonte unica) — nao hardcodar.
          var sbUrl = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) || ''
          var sbKey = (window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY) || ''
          if (!sbUrl || !sbKey) throw new Error('Supabase config ausente')
          var uploadUrl = sbUrl + '/storage/v1/object/media/' + path
          var resp = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'apikey': sbKey,
              'Authorization': 'Bearer ' + sbKey,
              'Content-Type': file.type,
              'x-upsert': 'true'
            },
            body: file
          })
          if (!resp.ok) throw new Error('Upload falhou: ' + resp.status)
          var publicUrl = sbUrl + '/storage/v1/object/public/media/' + path
          window.BroadcastUI.saveFormFields()
          var curForm = window.BroadcastUI.getState().form
          curForm.media_url = publicUrl
          window.BroadcastUI.setState('broadcastForm', curForm)
          window.BroadcastUI.setState('bcUploading', false)
          _render()
          _showToast('Imagem enviada com sucesso')
        } catch (err) {
          window.BroadcastUI.setState('bcUploading', false)
          _showToast('Erro no upload: ' + err.message, 'error')
          uploadBtn.textContent = 'Enviar imagem'
          uploadBtn.disabled = false
        }
      })
    }

    // Media remove
    var removeMedia = document.getElementById('bcMediaRemove')
    if (removeMedia) {
      removeMedia.addEventListener('click', function() {
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        curForm.media_url = ''
        window.BroadcastUI.setState('broadcastForm', curForm)
        _render()
      })
    }

    // Media position radios
    document.querySelectorAll('input[name="bcMediaPos"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        curForm.media_position = radio.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        var scrollPanel = document.querySelector('.bc-slide-body') || document.querySelector('.bc-center')
        var scrollPos = scrollPanel ? scrollPanel.scrollTop : 0
        _render()
        var restored = document.querySelector('.bc-slide-body') || document.querySelector('.bc-center')
        if (restored) restored.scrollTop = scrollPos
      })
    })

    // Schedule mode radios
    document.querySelectorAll('input[name="bcScheduleMode"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var schedInput = document.getElementById('bcScheduleAt')
        if (schedInput) {
          schedInput.disabled = (radio.value === 'now')
          if (radio.value === 'now') schedInput.value = ''
        }
      })
    })

    // Real-time phone preview binding + char counter
    var contentEl = root.querySelector('#bcContent')
    var charCountEl = root.querySelector('#bcCharCount')
    var charCounterWrap = root.querySelector('#bcCharCounter')
    function _updateCharCounter(len) {
      if (!charCountEl || !charCounterWrap) return
      charCountEl.textContent = len
      // reset then apply
      charCounterWrap.style.color = 'var(--text-muted)'
      charCounterWrap.style.fontWeight = '400'
      if (len > 4096) {
        charCounterWrap.style.color = '#EF4444'
        charCounterWrap.style.fontWeight = '600'
      } else if (len > 3500) {
        charCounterWrap.style.color = '#F59E0B'
        charCounterWrap.style.fontWeight = '500'
      }
    }
    if (contentEl) {
      // Update once on bind for prefilled content
      _updateCharCounter(contentEl.value.length)
      contentEl.addEventListener('input', function() {
        var curForm = window.BroadcastUI.getState().form
        curForm.content = contentEl.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(contentEl.value)
        _updateCharCounter(contentEl.value.length)
      })
    }
    // Expose updater for tag/format/emoji handlers to call after mutating textarea
    window.BroadcastUI._updateCharCounter = _updateCharCounter

    // Tag insert buttons
    root.querySelectorAll('.bc-tag-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var tag = btn.dataset.tag
        var start = textarea.selectionStart
        var end = textarea.selectionEnd
        var text = textarea.value
        textarea.value = text.substring(0, start) + tag + text.substring(end)
        textarea.selectionStart = textarea.selectionEnd = start + tag.length
        textarea.focus()
        var curForm = window.BroadcastUI.getState().form
        curForm.content = textarea.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(textarea.value)
        if (window.BroadcastUI._updateCharCounter) window.BroadcastUI._updateCharCounter(textarea.value.length)
      })
    })

    // Emoji picker toggle + insert
    var emojiToggle = document.getElementById('bcEmojiToggle')
    var emojiPicker = document.getElementById('bcEmojiPicker')
    if (emojiToggle && emojiPicker) {
      emojiToggle.addEventListener('click', function(e) {
        e.stopPropagation()
        emojiPicker.classList.toggle('open')
      })
      document.addEventListener('click', function() { emojiPicker.classList.remove('open') }, { once: true })
    }
    document.querySelectorAll('.bc-emoji-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation()
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var emoji = btn.dataset.emoji
        var text = textarea.value
        var start = textarea === document.activeElement ? textarea.selectionStart : text.length
        textarea.value = text.substring(0, start) + emoji + text.substring(start)
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
        textarea.focus()
        var curForm = window.BroadcastUI.getState().form
        curForm.content = textarea.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(textarea.value)
        if (window.BroadcastUI._updateCharCounter) window.BroadcastUI._updateCharCounter(textarea.value.length)
        if (emojiPicker) emojiPicker.classList.remove('open')
      })
    })

    // Format buttons (bold, italic, strikethrough, mono) — exclude emoji toggle
    document.querySelectorAll('.bc-fmt-btn[data-wrap]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var wrap = btn.dataset.wrap
        var start = textarea.selectionStart
        var end = textarea.selectionEnd
        var text = textarea.value
        var rawSelected = text.substring(start, end)
        // Trim selection — format only the actual text, not surrounding spaces
        var trimStart = 0
        var trimEnd = rawSelected.length
        while (trimStart < trimEnd && rawSelected[trimStart] === ' ') trimStart++
        while (trimEnd > trimStart && rawSelected[trimEnd - 1] === ' ') trimEnd--
        var selected = rawSelected.substring(trimStart, trimEnd)
        start = start + trimStart
        end = start + selected.length
        if (selected) {
          // Toggle: if already wrapped, remove; otherwise add
          var alreadyWrapped = selected.length >= wrap.length * 2
            && selected.substring(0, wrap.length) === wrap
            && selected.substring(selected.length - wrap.length) === wrap
          // Also check if the surrounding text has the wrap
          var outerWrapped = start >= wrap.length
            && text.substring(start - wrap.length, start) === wrap
            && text.substring(end, end + wrap.length) === wrap
          if (alreadyWrapped) {
            // Remove inner wrap
            var unwrapped = selected.substring(wrap.length, selected.length - wrap.length)
            textarea.value = text.substring(0, start) + unwrapped + text.substring(end)
            textarea.selectionStart = start
            textarea.selectionEnd = start + unwrapped.length
          } else if (outerWrapped) {
            // Remove outer wrap
            textarea.value = text.substring(0, start - wrap.length) + selected + text.substring(end + wrap.length)
            textarea.selectionStart = start - wrap.length
            textarea.selectionEnd = end - wrap.length
          } else {
            // Add wrap
            textarea.value = text.substring(0, start) + wrap + selected + wrap + text.substring(end)
            textarea.selectionStart = start
            textarea.selectionEnd = end + (wrap.length * 2)
          }
        } else {
          textarea.value = text.substring(0, start) + wrap + wrap + text.substring(end)
          textarea.selectionStart = textarea.selectionEnd = start + wrap.length
        }
        textarea.focus()
        var curForm = window.BroadcastUI.getState().form
        curForm.content = textarea.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(textarea.value)
        if (window.BroadcastUI._updateCharCounter) window.BroadcastUI._updateCharCounter(textarea.value.length)
      })
    })

    // Lead search + select
    var searchInput = document.getElementById('bcLeadSearch')
    var dropdown = document.getElementById('bcLeadDropdown')
    var _searchTimeout = null

    if (searchInput && dropdown) {
      // Paginacao da busca — top 20 por default, "Mostrar mais" revela resto em lotes
      var _searchPageSize = 20
      var _searchAllMatches = []
      var _searchShown = 0

      function _renderSearchDropdown() {
        var total = _searchAllMatches.length
        if (total === 0) {
          dropdown.innerHTML = '<div class="bc-lead-option bc-lead-empty">Nenhum lead encontrado</div>'
          return
        }
        var slice = _searchAllMatches.slice(0, _searchShown)
        var html = slice.map(function(l) {
          var lName = l.name || l.nome || ''
          var phone = l.phone || l.whatsapp || l.telefone || ''
          return '<div class="bc-lead-option" data-id="' + _esc(l.id) + '" data-nome="' + _esc(lName) + '" data-phone="' + _esc(phone) + '">'
            + '<span class="bc-lead-opt-name">' + _esc(lName) + '</span>'
            + (phone ? '<span class="bc-lead-opt-phone">' + _esc(phone) + '</span>' : '')
            + '</div>'
        }).join('')
        if (_searchShown < total) {
          var rest = total - _searchShown
          html += '<div class="bc-lead-option bc-lead-more" data-action="show-more" style="text-align:center;font-weight:700;color:var(--accent-gold);cursor:pointer">'
            + 'Mostrar mais (' + Math.min(rest, _searchPageSize) + ' de ' + rest + ' restantes)</div>'
        } else if (total > _searchPageSize) {
          html += '<div class="bc-lead-option bc-lead-empty" style="font-size:10px;color:var(--text-dim)">' + total + ' leads encontrados</div>'
        }
        dropdown.innerHTML = html
      }

      searchInput.addEventListener('input', function() {
        clearTimeout(_searchTimeout)
        var q = searchInput.value.trim().toLowerCase()
        if (q.length < 2) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return }
        _searchTimeout = setTimeout(async function() {
          var allLeads = []
          if (window.LeadsService) allLeads = await window.LeadsService.loadAll()
          var curForm = window.BroadcastUI.getState().form
          var selectedIds = curForm.selected_leads.map(function(l) { return l.id })
          _searchAllMatches = allLeads.filter(function(l) {
            var lName = l.name || l.nome || ''
            if (!lName || selectedIds.indexOf(l.id) !== -1) return false
            if (l.deleted_at || (l.phone && l.phone.indexOf('_MERGED') !== -1)) return false
            return lName.toLowerCase().indexOf(q) !== -1
          })
          _searchShown = Math.min(_searchPageSize, _searchAllMatches.length)
          _renderSearchDropdown()
          dropdown.style.display = 'block'
        }, 200)
      })

      // Handler de "Mostrar mais" dentro do dropdown — precisa ser capture (mousedown)
      // pra nao perder o foco do input antes do click
      dropdown.addEventListener('mousedown', function(e) {
        var more = e.target.closest('[data-action="show-more"]')
        if (!more) return
        e.preventDefault()
        _searchShown = Math.min(_searchShown + _searchPageSize, _searchAllMatches.length)
        _renderSearchDropdown()
      })

      searchInput.addEventListener('blur', function() {
        setTimeout(function() { dropdown.style.display = 'none' }, 200)
      })

      dropdown.addEventListener('mousedown', function(e) {
        var opt = e.target.closest('.bc-lead-option')
        if (!opt || opt.classList.contains('bc-lead-empty')) return
        e.preventDefault()
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        curForm.selected_leads.push({
          id: opt.dataset.id,
          nome: opt.dataset.nome,
          phone: opt.dataset.phone
        })
        window.BroadcastUI.setState('broadcastForm', curForm)
        searchInput.value = ''
        dropdown.style.display = 'none'
        var scrollPanel = document.querySelector('.bc-slide-body') || document.querySelector('.bc-center')
        var scrollPos = scrollPanel ? scrollPanel.scrollTop : 0
        _render()
        if (scrollPanel) {
          var restored = document.querySelector('.bc-slide-body') || document.querySelector('.bc-center')
          if (restored) restored.scrollTop = scrollPos
        }
      })
    }

    // Remove lead chip
    document.querySelectorAll('.bc-chip-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        curForm.selected_leads = curForm.selected_leads.filter(function(l) { return l.id !== id })
        window.BroadcastUI.setState('broadcastForm', curForm)
        var scrollPanel = document.querySelector('.bc-slide-body') || document.querySelector('.bc-center')
        var scrollPos = scrollPanel ? scrollPanel.scrollTop : 0
        _render()
        var restored = document.querySelector('.bc-slide-body') || document.querySelector('.bc-center')
        if (restored) restored.scrollTop = scrollPos
      })
    })

    // Cancel form
    var cancelForm = document.getElementById('bcCancelForm')
    if (cancelForm) {
      cancelForm.addEventListener('click', function() {
        var curState = window.BroadcastUI.getState()
        window.BroadcastUI.setState('bcPanelTab', 'history')
        window.BroadcastUI.setState('broadcastMode', 'detail')
        if (!curState.selected && curState.broadcasts.length > 0) {
          window.BroadcastUI.setState('broadcastSelected', curState.broadcasts[0].id)
        }
        _render()
      })
    }

    // Save
    var saveBtn = document.getElementById('bcSaveBtn')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        // Anti-duplicata: se ja esta salvando, ignora cliques subsequentes
        if (window.BroadcastUI.getState().saving) return
        if (saveBtn.disabled) return
        saveBtn.disabled = true
        // Restaurar botao em qualquer saida (sucesso ou erro)
        var _restoreBtn = function () { try { saveBtn.disabled = false } catch (_) {} }
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        var name = curForm.name || ''
        var content = curForm.content || ''
        var mediaUrl = curForm.media_url || ''
        var mediaPosition = curForm.media_position || 'above'
        var filterPhase = (document.getElementById('bcFilterPhase') || {}).value || ''
        var filterTemp = (document.getElementById('bcFilterTemp') || {}).value || ''
        var filterFunnel = (document.getElementById('bcFilterFunnel') || {}).value || ''
        var filterSource = (document.getElementById('bcFilterSource') || {}).value || ''
        var batchSize = parseInt((document.getElementById('bcBatchSize') || {}).value) || 10
        var batchInterval = parseInt((document.getElementById('bcBatchInterval') || {}).value) || 10

        if (!name.trim() || !content.trim()) {
          _showToast('Nome e mensagem sao obrigatorios', 'error')
          _restoreBtn()
          return
        }

        // Validacao [queixa]: exige queixa carregada do prefill (curForm._target_queixa)
        var hasQueixaTag = /\[queixa\]/i.test(content)
        if (hasQueixaTag && !curForm._target_queixa) {
          _showToast('Tag [queixa] precisa de exatamente 1 queixa filtrada na origem. Volte aos Leads, marque 1 queixa, selecione e clique Broadcast.', 'error')
          _restoreBtn()
          return
        }

        // Validacao de limite de caracteres (WhatsApp: 4096)
        if (content.length > 4096) {
          _showToast('Mensagem passa do limite do WhatsApp (4096 caracteres). Atual: ' + content.length, 'error')
          _restoreBtn()
          return
        }

        var filter = {}
        if (filterPhase) filter.phase = filterPhase
        if (filterTemp) filter.temperature = filterTemp
        if (filterFunnel) filter.funnel = filterFunnel
        if (filterSource) filter.source_type = filterSource
        if (curForm._target_queixa) filter.queixa = curForm._target_queixa

        window.BroadcastUI.setState('broadcastSaving', true)
        _render()

        var editId = window.BroadcastUI.getState().editingId
        var saveData = {
          name: name.trim(),
          content: content.trim(),
          media_url: mediaUrl.trim() || null,
          media_caption: curForm.media_caption ? curForm.media_caption.trim() : null,
          media_position: mediaPosition,
          target_filter: filter,
          batch_size: batchSize,
          batch_interval_min: batchInterval,
          selected_lead_ids: curForm.selected_leads.map(function(l) { return l.id }),
          scheduled_at: curForm.scheduled_at ? new Date(curForm.scheduled_at).toISOString() : null,
        }

        var result
        if (editId) {
          result = await window.BroadcastService.updateBroadcast(editId, saveData)
        } else {
          result = await window.BroadcastService.createBroadcast(saveData)
        }

        window.BroadcastUI.setState('broadcastSaving', false)

        if (result && result.ok) {
          var hasSchedule = curForm.scheduled_at && curForm.scheduled_at.length > 0
          var broadcastId = editId || result.data?.id || null

          if (hasSchedule && broadcastId) {
            // Scheduled: auto-start to enqueue with future scheduled_at
            if (editId) {
              // Editing: reschedule (clears old outbox, resets to draft, then start)
              await window.BroadcastService.rescheduleBroadcast(editId, saveData)
            }
            // Start to enqueue messages with scheduled_at in the future
            await window.BroadcastUI.loadBroadcasts()
            var startResult = await window.BroadcastService.startBroadcast(broadcastId)
            if (startResult && startResult.ok) {
              _showToast('Programado para ' + new Date(curForm.scheduled_at).toLocaleString('pt-BR'))
            } else {
              _showToast('Erro ao programar: ' + (startResult?.error || ''), 'error')
            }
          } else {
            _showToast(editId ? 'Disparo atualizado!' : 'Disparo criado! ' + (result.data?.total_targets || 0) + ' destinatarios')
          }

          // Show confirmation screen to review before sending
          var sentId = editId || result.data?.id || null
          window.BroadcastUI.setState('broadcastSelected', sentId)
          window.BroadcastUI.setState('broadcastMode', 'detail')
          window.BroadcastUI.setState('bcPanelTab', 'editor')
          window.BroadcastUI.setState('_editingBroadcastId', null)
          window.BroadcastUI.setState('bcConfirmSend', true)
          await window.BroadcastUI.loadBroadcasts()
          // Sucesso: limpar rascunho
          if (window.BroadcastUI.draftClear) window.BroadcastUI.draftClear()
          _restoreBtn()
        } else {
          _showToast(result?.error || 'Erro ao salvar disparo', 'error')
          _restoreBtn()
          _render()
        }
      })
    }

    // Segment click — load leads for that segment
    document.querySelectorAll('.bc-seg-item[data-seg]').forEach(function(item) {
      item.addEventListener('click', async function() {
        var seg = item.dataset.seg
        var center = document.querySelector('.bc-center')
        var scrollPos = center ? center.scrollTop : 0
        window.BroadcastUI.setState('bcSegment', seg)
        window.BroadcastUI.setState('bcSegmentLeads', [])
        window.BroadcastUI.setState('bcSegmentLoading', true)
        _render()
        var center2 = document.querySelector('.bc-center')
        if (center2) center2.scrollTop = scrollPos
        var curState = window.BroadcastUI.getState()
        if (window.BroadcastService && window.BroadcastService.getBroadcastLeads && curState.selected) {
          try {
            var result = await window.BroadcastService.getBroadcastLeads(curState.selected, seg)
            if (result && result.ok && Array.isArray(result.data)) {
              window.BroadcastUI.setState('bcSegmentLeads', result.data)
            }
          } finally {
            window.BroadcastUI.setState('bcSegmentLoading', false)
          }
          var center3 = document.querySelector('.bc-center')
          var scrollPos2 = center3 ? center3.scrollTop : scrollPos
          _render()
          var center4 = document.querySelector('.bc-center')
          if (center4) center4.scrollTop = scrollPos2
        } else {
          window.BroadcastUI.setState('bcSegmentLoading', false)
        }
      })
    })

    // Edit button — load broadcast data into form
    // FIX (19/04): restaura form._target_queixa a partir de target_filter.queixa
    // para que a tag [queixa] nao quebre em edit. Sem esse campo, o validador
    // do save rejeita a tag ao salvar, confundindo o user.
    document.querySelectorAll('.bc-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id
        var broadcasts = window.BroadcastUI.getState().broadcasts
        var b = broadcasts.find(function(x) { return x.id === id })
        if (!b) return

        var tf = b.target_filter || {}
        var form = {
          name: b.name || '',
          content: b.content || '',
          media_url: b.media_url || '',
          media_caption: b.media_caption || '',
          media_position: b.media_position || 'above',
          filter_phase: tf.phase || '',
          filter_temperature: tf.temperature || '',
          filter_funnel: tf.funnel || '',
          filter_source: tf.source_type || '',
          batch_size: b.batch_size || 10,
          batch_interval_min: b.batch_interval_min || 10,
          selected_leads: [],
          scheduled_at: b.scheduled_at ? new Date(new Date(b.scheduled_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16) : '',
        }
        // Restaura queixa target (label humanizado) para preservar [queixa] tag
        // tf.queixa vem gravado como label humanizado (ver save linha 602).
        // Restaura tal qual para passar na validacao [queixa] do save.
        if (tf.queixa) form._target_queixa = tf.queixa

        window.BroadcastUI.setState('broadcastForm', form)
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', id)
        _render()
      })
    })

    // Clone from history list — tambem restaura _target_queixa
    document.querySelectorAll('.bc-hist-clone-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        var id = btn.dataset.id
        var broadcasts = window.BroadcastUI.getState().broadcasts
        var b = broadcasts.find(function(x) { return x.id === id })
        if (!b) return
        var tf = b.target_filter || {}
        var form = {
          name: (b.name || '') + ' (copia)',
          content: b.content || '',
          media_url: b.media_url || '',
          media_caption: b.media_caption || '',
          media_position: b.media_position || 'above',
          filter_phase: tf.phase || '',
          filter_temperature: tf.temperature || '',
          filter_funnel: tf.funnel || '',
          filter_source: tf.source_type || '',
          batch_size: b.batch_size || 10,
          batch_interval_min: b.batch_interval_min || 10,
          selected_leads: [],
          scheduled_at: '',
        }
        // tf.queixa vem gravado como label humanizado (ver save linha 602).
        // Restaura tal qual para passar na validacao [queixa] do save.
        if (tf.queixa) form._target_queixa = tf.queixa
        window.BroadcastUI.setState('broadcastForm', form)
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', null)
        _render()
      })
    })

    // Pre-send button — show checklist
    document.querySelectorAll('.bc-presend-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastUI.setState('bcConfirmSend', true)
        _render()
      })
    })

    // Confirm cancel
    document.querySelectorAll('.bc-confirm-no').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastUI.setState('bcConfirmSend', false)
        _render()
      })
    })

    // Clone from detail — tambem restaura _target_queixa
    document.querySelectorAll('.bc-clone-detail-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id
        var broadcasts = window.BroadcastUI.getState().broadcasts
        var b = broadcasts.find(function(x) { return x.id === id })
        if (!b) return
        var tf = b.target_filter || {}
        var form = {
          name: (b.name || '') + ' (copia)',
          content: b.content || '',
          media_url: b.media_url || '',
          media_caption: b.media_caption || '',
          media_position: b.media_position || 'above',
          filter_phase: tf.phase || '',
          filter_temperature: tf.temperature || '',
          filter_funnel: tf.funnel || '',
          filter_source: tf.source_type || '',
          batch_size: b.batch_size || 10,
          batch_interval_min: b.batch_interval_min || 10,
          selected_leads: [],
          scheduled_at: '',
        }
        // tf.queixa vem gravado como label humanizado (ver save linha 602).
        // Restaura tal qual para passar na validacao [queixa] do save.
        if (tf.queixa) form._target_queixa = tf.queixa
        window.BroadcastUI.setState('broadcastForm', form)
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', null)
        _render()
      })
    })

    // Start buttons
    root.querySelectorAll('.bc-start-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.dataset.id
        var targets = parseInt(btn.dataset.targets) || 0
        if (targets === 0) {
          _showToast('Nenhum destinatario encontrado para este filtro', 'error')
          return
        }
        if (!confirm('Iniciar disparo para ' + targets + ' destinatarios?')) return
        var originalLabel = btn.innerHTML
        btn.disabled = true
        btn.textContent = 'Iniciando...'
        var result = null
        var caughtErr = null
        try {
          result = await window.BroadcastService.startBroadcast(id)
        } catch (err) {
          caughtErr = err
        }
        try {
          if (caughtErr) {
            _showToast('Erro ao iniciar: ' + (caughtErr.message || caughtErr), 'error')
            btn.disabled = false
            btn.innerHTML = originalLabel
            _render()
            return
          }
          if (result && result.ok) {
            var est = result.data?.estimated_minutes || 0
            var schedFor = result.data?.scheduled_for
            var msg = 'Disparo iniciado! ' + (result.data?.enqueued || 0) + ' msgs'
            if (schedFor && new Date(schedFor) > new Date(Date.now() + 60000)) {
              msg += ' — agendado para ' + new Date(schedFor).toLocaleString('pt-BR')
            } else if (est > 0) {
              msg += ' (~' + est + 'min para concluir)'
            }
            _showToast(msg)
            window.BroadcastUI.setState('broadcastSelected', id)
            window.BroadcastUI.setState('broadcastMode', 'detail')
            window.BroadcastUI.setState('bcPanelTab', 'editor')
            window.BroadcastUI.setState('bcConfirmSend', false)
            await window.BroadcastUI.loadBroadcasts()
            // Sucesso: broadcast mudou de status, re-render descarta o botao.
            // Nao reabilitamos (botao some); mas se por algum motivo o elemento
            // continuar montado, re-habilita como fallback.
            if (document.body.contains(btn)) {
              btn.disabled = false
              btn.innerHTML = originalLabel
            }
          } else {
            _showToast(result?.error || 'Erro ao iniciar', 'error')
            btn.disabled = false
            btn.innerHTML = originalLabel
            _render()
          }
        } catch (uiErr) {
          // Garante que o botao nunca trava mesmo se o re-render falhar
          _showToast('Erro ao atualizar UI: ' + (uiErr.message || uiErr), 'error')
          btn.disabled = false
          btn.innerHTML = originalLabel
        }
      })
    })

    // Cancel buttons
    root.querySelectorAll('.bc-cancel-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.dataset.id
        if (!confirm('Cancelar este disparo? Mensagens pendentes serao removidas.')) return
        btn.disabled = true
        btn.textContent = 'Cancelando...'
        var result = await window.BroadcastService.cancelBroadcast(id)
        if (result && result.ok) {
          _showToast('Disparo cancelado. ' + (result.data?.removed_from_outbox || 0) + ' mensagens removidas')
          await window.BroadcastUI.loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao cancelar', 'error')
          _render()
        }
      })
    })

    // Dashboard period filter buttons
    document.querySelectorAll('.bc-dash-filter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastDashboard.setState('bcDashPeriod', btn.dataset.period)
        _render()
      })
    })

    // Dashboard metric tabs
    document.querySelectorAll('.bc-dash-metric-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastDashboard.setState('bcDashMetric', btn.dataset.metric)
        _render()
      })
    })

    // Dashboard sort select
    var dashSort = document.getElementById('bcDashSort')
    if (dashSort) {
      dashSort.addEventListener('change', function() {
        window.BroadcastDashboard.setState('bcDashSort', dashSort.value)
        _render()
      })
    }
  }

  // ── Expose ──────────────────────────────────────────────────

  window.BroadcastEvents = Object.freeze({
    bind: _bindBroadcastEvents
  })

})()
