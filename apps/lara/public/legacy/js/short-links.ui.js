/**
 * ClinicAI — Short Links UI (standalone page)
 *
 * Encurtador de links com tracking de clicks e pixels.
 * Page: short-links | Root: shortLinksRoot
 *
 * Depende de: window.ClinicEnv
 */
;(function () {
  'use strict'
  if (window._clinicaiShortLinksLoaded) return
  window._clinicaiShortLinksLoaded = true

  function _sb() { return window._sbShared || null }
  async function _rpc(name, params) {
    try {
      var sb = _sb()
      if (!sb) return null
      var res = await sb.rpc(name, params || {})
      if (res.error) { console.warn('[ShortLinks] RPC ' + name + ':', res.error.message); return null }
      return res.data
    } catch (e) { return null }
  }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }
  function _ico(n, sz) {
    if (typeof feather !== 'undefined' && feather.icons && feather.icons[n])
      return feather.icons[n].toSvg({ width: sz || 16, height: sz || 16, 'stroke-width': 1.8 })
    return ''
  }

  var _links = []
  var _loaded = false
  var _showForm = false
  var _editPixels = null
  var _baseUrl = ''
  var _showRefPanel = true

  // ── Pixel field definitions ─────────────────────────────────
  var PIXEL_FIELDS = [
    { key: 'meta_pixel_id',        label: 'Meta Pixel ID',        placeholder: 'Ex: 123456789012345',  validate: /^\d{10,20}$/, icon: 'facebook',     tip: 'ID numerico do pixel (Gerenciador de Eventos Meta)', eventKey: 'meta_event' },
    { key: 'meta_event',           label: 'Meta Evento',          placeholder: 'Lead, Purchase, etc.', validate: null,          icon: null,           tip: 'Evento alem de PageView (opcional)', listKey: 'meta' },
    { key: 'google_ads_id',        label: 'Google Ads ID',        placeholder: 'Ex: AW-123456789',     validate: /^AW-\d{5,15}$/, icon: 'target',    tip: 'ID da tag de conversao Google Ads' },
    { key: 'google_ads_label',     label: 'Google Ads Label',     placeholder: 'Ex: AbC-D_efG12',      validate: null,          icon: null,           tip: 'Label da conversao (opcional)' },
    { key: 'google_analytics_id',  label: 'Google Analytics ID',  placeholder: 'Ex: G-XXXXXXXXXX',     validate: /^G-[A-Z0-9]{5,15}$/, icon: 'bar-chart', tip: 'ID da propriedade GA4', eventKey: 'ga_event' },
    { key: 'ga_event',             label: 'GA Evento',            placeholder: 'generate_lead, etc.',  validate: null,          icon: null,           tip: 'Evento personalizado GA4 (opcional)', listKey: 'ga' },
    { key: 'tiktok_pixel_id',      label: 'TikTok Pixel ID',     placeholder: 'Ex: CXXXXXXXXX',       validate: /^C[A-Z0-9]{5,20}$/, icon: 'video', tip: 'ID do pixel TikTok', eventKey: 'tiktok_event' },
    { key: 'tiktok_event',         label: 'TikTok Evento',       placeholder: 'SubmitForm, etc.',     validate: null,          icon: null,           tip: 'Evento TikTok (opcional)', listKey: 'tiktok' },
  ]

  // ── Editable event lists (localStorage-backed) ────────────
  var LS_KEY = 'clinicai_pixel_events'
  var DEFAULT_EVENTS = {
    meta:   ['PageView', 'Lead', 'Purchase', 'CompleteRegistration', 'Contact', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Schedule'],
    ga:     ['generate_lead', 'sign_up', 'purchase', 'page_view', 'begin_checkout', 'add_to_cart', 'view_item', 'contact', 'schedule'],
    tiktok: ['PageView', 'SubmitForm', 'Contact', 'CompleteRegistration', 'ViewContent', 'ClickButton', 'Download', 'PlaceAnOrder'],
  }

  function _loadEvents() {
    try {
      var saved = JSON.parse(localStorage.getItem(LS_KEY))
      if (saved && saved.meta && saved.ga && saved.tiktok) return saved
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_EVENTS))
  }
  function _saveEvents(events) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(events)) } catch (e) { /* ignore */ }
  }
  function _getEventList(listKey) {
    return _loadEvents()[listKey] || []
  }

  async function _loadLinks() {
    var data = await _rpc('short_link_list')
    _links = Array.isArray(data) ? data : []
    _loaded = true
  }

  function _countPixels(px) {
    if (!px) return 0
    var count = 0
    if (px.meta_pixel_id) count++
    if (px.google_ads_id) count++
    if (px.google_analytics_id) count++
    if (px.tiktok_pixel_id) count++
    if (px.custom_head) count++
    return count
  }

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  function _render() {
    var root = document.getElementById('shortLinksRoot')
    if (!root) return
    _baseUrl = window.location.origin + '/r.html?c='

    var html = '<div class="sl-layout">'

    // ── LEFT COLUMN: links ────────────────────────────────
    html += '<div class="sl-main">'
    html += '<div class="sl-module">'

    // Header
    html += '<div class="sl-header">'
    html += '<div class="sl-title">' + _ico('link', 22) + ' <span>Encurtador de Links</span></div>'
    html += '<div class="sl-header-actions">'
    html += '<button class="sl-ref-toggle" id="slRefToggle" title="' + (_showRefPanel ? 'Ocultar' : 'Mostrar') + ' referencia de eventos">' + _ico('book-open', 14) + '</button>'
    html += '<button class="sl-add-btn" id="slAddBtn">' + _ico('plus-circle', 14) + ' Novo link</button>'
    html += '</div>'
    html += '</div>'

    html += '<p class="sl-subtitle">Crie links curtos com rastreamento de cliques e pixels de conversao para campanhas, mensagens e redes sociais.</p>'

    // Form
    html += '<div class="sl-form" id="slForm" style="display:' + (_showForm ? 'block' : 'none') + '">'
    html += '<div class="sl-form-row">'
    html += '<div class="sl-form-field sl-form-code"><label>Codigo</label><div class="sl-code-input"><span class="sl-code-prefix">/r?c=</span><input class="sl-input" id="slCode" placeholder="niver"></div></div>'
    html += '<div class="sl-form-field" style="flex:2"><label>URL de destino</label><input class="sl-input" id="slUrl" placeholder="https://..."></div>'
    html += '<div class="sl-form-field" style="flex:1"><label>Titulo (opcional)</label><input class="sl-input" id="slTitle" placeholder="Descricao"></div>'
    html += '</div>'
    html += _renderPixelSection('create', {})
    html += '<div class="sl-form-actions">'
    html += '<button class="sl-btn-save" id="slSave">' + _ico('check', 14) + ' Criar link</button>'
    html += '<button class="sl-btn-cancel" id="slCancel">Cancelar</button>'
    html += '</div>'
    html += '</div>'

    // Stats
    var totalClicks = 0, totalWithPixels = 0
    _links.forEach(function (l) {
      totalClicks += (l.clicks || 0)
      if (_countPixels(l.pixels) > 0) totalWithPixels++
    })
    html += '<div class="sl-stats">'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + _links.length + '</span><span class="sl-stat-lbl">Links</span></div>'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + totalClicks + '</span><span class="sl-stat-lbl">Cliques totais</span></div>'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + totalWithPixels + '</span><span class="sl-stat-lbl">Com pixels</span></div>'
    html += '</div>'

    // Links list
    html += '<div class="sl-list">'
    if (!_loaded) {
      html += '<div class="sl-empty">Carregando...</div>'
    } else if (!_links.length) {
      html += '<div class="sl-empty">Nenhum link criado. Clique em "+ Novo link" para comecar.</div>'
    } else {
      _links.forEach(function (l) {
        var short = _baseUrl + l.code
        var pxCount = _countPixels(l.pixels)
        var isEditing = _editPixels === l.code

        html += '<div class="sl-item' + (isEditing ? ' sl-item-editing' : '') + '">'
        html += '<div class="sl-item-main">'
        html += '<div class="sl-item-left">'
        html += '<div class="sl-item-short" data-copy="' + _esc(short) + '">' + _ico('link', 13) + ' <span>' + _esc(short) + '</span></div>'
        html += '<div class="sl-item-dest">' + _ico('arrow-right', 10) + ' ' + _esc(l.url) + '</div>'
        if (l.title) html += '<div class="sl-item-title">' + _esc(l.title) + '</div>'
        html += '</div>'
        html += '<div class="sl-item-right">'
        html += '<div class="sl-item-clicks">' + _ico('bar-chart-2', 14) + ' <span>' + (l.clicks || 0) + '</span></div>'
        html += '<button class="sl-item-btn sl-pixel-btn' + (pxCount > 0 ? ' sl-pixel-active' : '') + '" data-pixel-toggle="' + _esc(l.code) + '" title="' + (pxCount > 0 ? pxCount + ' pixel(s) ativo(s)' : 'Configurar pixels') + '">'
        html += _ico('zap', 14)
        if (pxCount > 0) html += '<span class="sl-pixel-badge">' + pxCount + '</span>'
        html += '</button>'
        html += '<button class="sl-item-btn sl-copy-btn" data-copy="' + _esc(short) + '" title="Copiar">' + _ico('copy', 14) + '</button>'
        html += '<button class="sl-item-btn sl-open-btn" data-open="' + _esc(short) + '" title="Abrir link">' + _ico('external-link', 14) + '</button>'
        html += '<button class="sl-item-btn sl-del-btn" data-del="' + _esc(l.code) + '" title="Excluir">' + _ico('trash-2', 14) + '</button>'
        html += '</div>'
        html += '</div>'

        if (isEditing) {
          html += '<div class="sl-pixel-editor">'
          html += _renderPixelSection('edit-' + l.code, l.pixels || {})
          html += '<div class="sl-form-actions">'
          html += '<button class="sl-btn-save sl-pixel-save" data-save-pixel="' + _esc(l.code) + '">' + _ico('check', 14) + ' Salvar pixels</button>'
          html += '<button class="sl-btn-cancel sl-pixel-cancel" data-cancel-pixel="' + _esc(l.code) + '">Cancelar</button>'
          html += '</div>'
          html += '</div>'
        }

        html += '</div>'
      })
    }
    html += '</div>'
    html += '</div>' // sl-module
    html += '</div>' // sl-main

    // ── RIGHT COLUMN: reference panel ─────────────────────
    if (_showRefPanel) {
      html += _renderRefPanel()
    }

    html += '</div>' // sl-layout

    root.innerHTML = html
    _attachEvents()
  }

  // ══════════════════════════════════════════════════════════
  // REFERENCE PANEL (right side, editable)
  // ══════════════════════════════════════════════════════════
  function _renderRefPanel() {
    var events = _loadEvents()
    var html = ''

    html += '<div class="sl-ref-panel">'
    html += '<div class="sl-ref-title">' + _ico('book-open', 16) + ' Referencia de Eventos</div>'
    html += '<p class="sl-ref-desc">Edite as listas abaixo para personalizar os eventos disponiveis nos selects. Alteracoes ficam salvas no seu navegador.</p>'

    // Meta events
    html += _renderRefSection('meta', 'Meta Pixel', 'facebook', events.meta, [
      { ev: 'PageView',              desc: 'Automatico (sempre dispara)' },
      { ev: 'Lead',                  desc: 'Captacao de lead' },
      { ev: 'Purchase',              desc: 'Venda concluida' },
      { ev: 'CompleteRegistration',  desc: 'Cadastro / formulario' },
      { ev: 'Contact',               desc: 'Clique em contato' },
      { ev: 'ViewContent',           desc: 'Visualizou pagina / oferta' },
      { ev: 'AddToCart',             desc: 'Adicionou ao carrinho' },
      { ev: 'InitiateCheckout',      desc: 'Iniciou pagamento' },
      { ev: 'Schedule',              desc: 'Agendou consulta' },
    ])

    // GA events
    html += _renderRefSection('ga', 'Google Analytics (GA4)', 'bar-chart', events.ga, [
      { ev: 'generate_lead',   desc: 'Captacao de lead' },
      { ev: 'sign_up',         desc: 'Cadastro' },
      { ev: 'purchase',        desc: 'Venda concluida' },
      { ev: 'page_view',       desc: 'Visualizacao de pagina' },
      { ev: 'begin_checkout',  desc: 'Iniciou pagamento' },
      { ev: 'add_to_cart',     desc: 'Adicionou ao carrinho' },
      { ev: 'view_item',       desc: 'Visualizou item' },
      { ev: 'contact',         desc: 'Clique em contato' },
      { ev: 'schedule',        desc: 'Agendou consulta' },
    ])

    // TikTok events
    html += _renderRefSection('tiktok', 'TikTok Pixel', 'video', events.tiktok, [
      { ev: 'PageView',              desc: 'Automatico (sempre dispara)' },
      { ev: 'SubmitForm',            desc: 'Enviou formulario' },
      { ev: 'Contact',               desc: 'Clique em contato' },
      { ev: 'CompleteRegistration',  desc: 'Cadastro' },
      { ev: 'ViewContent',           desc: 'Visualizou pagina' },
      { ev: 'ClickButton',           desc: 'Clicou em CTA' },
      { ev: 'Download',              desc: 'Download de material' },
      { ev: 'PlaceAnOrder',          desc: 'Fez pedido' },
    ])

    // Google Ads note
    html += '<div class="sl-ref-section">'
    html += '<div class="sl-ref-section-title">' + _ico('target', 14) + ' Google Ads</div>'
    html += '<p class="sl-ref-note">Google Ads usa o evento <strong>conversion</strong> automaticamente. Configure o ID (AW-xxx) e Label da conversao criada no painel do Google Ads. Nao ha lista fixa de eventos.</p>'
    html += '</div>'

    // Custom tags note
    html += '<div class="sl-ref-section">'
    html += '<div class="sl-ref-section-title">' + _ico('code', 14) + ' Tags Personalizadas</div>'
    html += '<p class="sl-ref-note">Cole qualquer tag HTML/Script no campo "Tags personalizadas": GTM, Hotjar, Clarity, etc. O codigo e injetado na pagina de redirecionamento antes do redirect.</p>'
    html += '</div>'

    // Suggestions for clinic
    html += '<div class="sl-ref-section sl-ref-suggestions">'
    html += '<div class="sl-ref-section-title">' + _ico('star', 14) + ' Sugestoes para Clinica</div>'
    html += '<table class="sl-ref-table"><thead><tr><th>Tipo de link</th><th>Meta</th><th>TikTok</th><th>GA4</th></tr></thead><tbody>'
    html += '<tr><td>Aniversario / oferta</td><td>Lead</td><td>SubmitForm</td><td>generate_lead</td></tr>'
    html += '<tr><td>Agendamento</td><td>Schedule</td><td>Contact</td><td>schedule</td></tr>'
    html += '<tr><td>WhatsApp</td><td>Contact</td><td>Contact</td><td>contact</td></tr>'
    html += '<tr><td>Quiz / avaliacao</td><td>CompleteRegistration</td><td>SubmitForm</td><td>sign_up</td></tr>'
    html += '<tr><td>Pagina de vendas</td><td>ViewContent</td><td>ViewContent</td><td>view_item</td></tr>'
    html += '</tbody></table>'
    html += '</div>'

    html += '</div>' // sl-ref-panel
    return html
  }

  function _renderRefSection(key, title, icon, currentList, defaultDescs) {
    var html = ''
    html += '<div class="sl-ref-section" data-ref-section="' + key + '">'
    html += '<div class="sl-ref-section-title">' + _ico(icon, 14) + ' ' + title + '</div>'

    // Table
    html += '<table class="sl-ref-table">'
    html += '<thead><tr><th>Evento</th><th>Descricao</th><th></th></tr></thead>'
    html += '<tbody>'
    currentList.forEach(function (ev, i) {
      var desc = ''
      defaultDescs.forEach(function (d) { if (d.ev === ev) desc = d.desc })
      html += '<tr>'
      html += '<td><code>' + _esc(ev) + '</code></td>'
      html += '<td class="sl-ref-desc-cell">' + _esc(desc || 'Personalizado') + '</td>'
      html += '<td><button class="sl-ref-remove-btn" data-ref-remove="' + key + '" data-ref-idx="' + i + '" title="Remover">' + _ico('x', 12) + '</button></td>'
      html += '</tr>'
    })
    html += '</tbody>'
    html += '</table>'

    // Add new
    html += '<div class="sl-ref-add">'
    html += '<input class="sl-input sl-ref-add-input" id="slRefAdd-' + key + '" placeholder="Novo evento...">'
    html += '<button class="sl-ref-add-btn" data-ref-add="' + key + '">' + _ico('plus', 12) + '</button>'
    html += '</div>'

    // Reset
    html += '<button class="sl-ref-reset-btn" data-ref-reset="' + key + '">Restaurar padrao</button>'

    html += '</div>'
    return html
  }

  // ══════════════════════════════════════════════════════════
  // PIXEL SECTION (form fields)
  // ══════════════════════════════════════════════════════════
  function _renderPixelSection(prefix, pixels) {
    var html = ''
    html += '<div class="sl-pixel-section">'
    html += '<div class="sl-pixel-header">'
    html += '<span>' + _ico('zap', 14) + ' Pixels e Tags de Rastreamento</span>'
    html += '</div>'

    html += '<div class="sl-pixel-grid">'
    PIXEL_FIELDS.forEach(function (f) {
      var val = (pixels && pixels[f.key]) || ''
      var isEvent = f.key.indexOf('event') > -1 || f.key === 'ga_event'
      var cls = 'sl-pixel-field' + (isEvent ? ' sl-pixel-sub' : '')

      html += '<div class="' + cls + '">'
      html += '<label>' + (f.icon ? _ico(f.icon, 12) + ' ' : '') + f.label + '</label>'

      // Event fields get datalist from editable localStorage events
      if (f.listKey) {
        var evList = _getEventList(f.listKey)
        html += '<input class="sl-input sl-pixel-input" data-px-key="' + f.key + '" data-px-prefix="' + prefix + '" list="dl-' + f.listKey + '-' + prefix + '" placeholder="' + f.placeholder + '" value="' + _esc(val) + '">'
        html += '<datalist id="dl-' + f.listKey + '-' + prefix + '">'
        evList.forEach(function (e) { html += '<option value="' + _esc(e) + '">' })
        html += '</datalist>'
      } else {
        html += '<input class="sl-input sl-pixel-input" data-px-key="' + f.key + '" data-px-prefix="' + prefix + '" placeholder="' + f.placeholder + '" value="' + _esc(val) + '">'
      }

      if (f.tip) html += '<span class="sl-pixel-tip">' + f.tip + '</span>'
      if (f.validate) html += '<span class="sl-pixel-error" id="pxerr-' + prefix + '-' + f.key + '"></span>'
      html += '</div>'
    })
    html += '</div>'

    // Custom head tags
    var customVal = (pixels && pixels.custom_head) || ''
    html += '<div class="sl-pixel-custom">'
    html += '<label>' + _ico('code', 12) + ' Tags personalizadas (HTML/Script)</label>'
    html += '<textarea class="sl-input sl-pixel-textarea" data-px-key="custom_head" data-px-prefix="' + prefix + '" rows="3" placeholder="Cole aqui scripts de tracking adicionais (GTM, Hotjar, etc.)">' + _esc(customVal) + '</textarea>'
    html += '<span class="sl-pixel-tip">Aceita tags &lt;script&gt; e &lt;noscript&gt;. Executado na pagina de redirecionamento antes do redirect.</span>'
    html += '</div>'

    html += '</div>'
    return html
  }

  // ══════════════════════════════════════════════════════════
  // COLLECT & VALIDATE PIXELS
  // ══════════════════════════════════════════════════════════
  function _collectPixels(prefix) {
    var pixels = {}
    var valid = true

    document.querySelectorAll('[data-px-prefix="' + prefix + '"]').forEach(function (el) {
      var key = el.dataset.pxKey
      var val = (el.value || '').trim()
      if (val) pixels[key] = val
    })

    PIXEL_FIELDS.forEach(function (f) {
      var errEl = document.getElementById('pxerr-' + prefix + '-' + f.key)
      if (!errEl) return
      var val = pixels[f.key]
      if (val && f.validate && !f.validate.test(val)) {
        errEl.textContent = 'Formato invalido'
        errEl.style.display = 'block'
        valid = false
      } else {
        errEl.textContent = ''
        errEl.style.display = 'none'
      }
    })

    if (pixels.meta_event && !pixels.meta_pixel_id) { valid = false; _toast('Meta Evento requer Meta Pixel ID', 'error') }
    if (pixels.google_ads_label && !pixels.google_ads_id) { valid = false; _toast('Google Ads Label requer Google Ads ID', 'error') }
    if (pixels.ga_event && !pixels.google_analytics_id) { valid = false; _toast('GA Evento requer Google Analytics ID', 'error') }
    if (pixels.tiktok_event && !pixels.tiktok_pixel_id) { valid = false; _toast('TikTok Evento requer TikTok Pixel ID', 'error') }

    return valid ? pixels : null
  }

  // ══════════════════════════════════════════════════════════
  // EVENTS
  // ══════════════════════════════════════════════════════════
  function _attachEvents() {
    // Toggle ref panel
    var refBtn = document.getElementById('slRefToggle')
    if (refBtn) refBtn.addEventListener('click', function () { _showRefPanel = !_showRefPanel; _render() })

    var addBtn = document.getElementById('slAddBtn')
    if (addBtn) addBtn.addEventListener('click', function () { _showForm = !_showForm; _editPixels = null; _render() })

    var cancelBtn = document.getElementById('slCancel')
    if (cancelBtn) cancelBtn.addEventListener('click', function () { _showForm = false; _render() })

    var saveBtn = document.getElementById('slSave')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var code = (document.getElementById('slCode')?.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
        var url = (document.getElementById('slUrl')?.value || '').trim()
        var title = (document.getElementById('slTitle')?.value || '').trim()
        if (!code) { _toast('Preencha o codigo', 'error'); return }
        if (!url || !url.startsWith('http')) { _toast('URL invalida', 'error'); return }

        var pixels = _collectPixels('create')
        if (pixels === null) return

        saveBtn.disabled = true; saveBtn.textContent = 'Criando...'
        var res = await _rpc('short_link_create', { p_code: code, p_url: url, p_title: title || null, p_pixels: pixels })
        if (res && res.error === 'code_exists') {
          _toast('Codigo ja existe, escolha outro', 'error')
          saveBtn.disabled = false; saveBtn.textContent = 'Criar link'
          return
        }
        _showForm = false
        await _loadLinks()
        _render()
        _toast('Link criado: /r.html?c=' + code, 'success')
      })
    }

    // Copy
    document.querySelectorAll('.sl-copy-btn[data-copy], .sl-item-short[data-copy]').forEach(function (el) {
      el.addEventListener('click', function () {
        navigator.clipboard.writeText(el.dataset.copy).then(function () {
          _toast('Link copiado!', 'success')
        }).catch(function () {
          var inp = document.createElement('input'); inp.value = el.dataset.copy
          document.body.appendChild(inp); inp.select(); document.execCommand('copy')
          document.body.removeChild(inp); _toast('Link copiado!', 'success')
        })
      })
    })

    // Open in new tab
    document.querySelectorAll('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () { window.open(btn.dataset.open, '_blank') })
    })

    // Toggle pixel editor
    document.querySelectorAll('[data-pixel-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.dataset.pixelToggle
        _editPixels = (_editPixels === code) ? null : code
        _showForm = false
        _render()
      })
    })

    // Save pixels
    document.querySelectorAll('[data-save-pixel]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var code = btn.dataset.savePixel
        var pixels = _collectPixels('edit-' + code)
        if (pixels === null) return
        btn.disabled = true; btn.textContent = 'Salvando...'
        await _rpc('short_link_update_pixels', { p_code: code, p_pixels: pixels })
        _editPixels = null
        await _loadLinks()
        _render()
        _toast('Pixels atualizados', 'success')
      })
    })

    // Cancel pixel edit
    document.querySelectorAll('[data-cancel-pixel]').forEach(function (btn) {
      btn.addEventListener('click', function () { _editPixels = null; _render() })
    })

    // Delete link
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Excluir este link?')) return
        await _rpc('short_link_delete', { p_code: btn.dataset.del })
        await _loadLinks()
        _render()
        _toast('Link excluido', 'success')
      })
    })

    // ── Reference panel events ────────────────────────────
    // Add event
    document.querySelectorAll('[data-ref-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.refAdd
        var input = document.getElementById('slRefAdd-' + key)
        if (!input) return
        var val = (input.value || '').trim()
        if (!val) return
        var events = _loadEvents()
        if (events[key].indexOf(val) > -1) { _toast('Evento ja existe', 'error'); return }
        events[key].push(val)
        _saveEvents(events)
        _render()
        _toast('Evento "' + val + '" adicionado', 'success')
      })
    })

    // Enter key on add input
    document.querySelectorAll('.sl-ref-add-input').forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var key = input.id.replace('slRefAdd-', '')
          var btn = document.querySelector('[data-ref-add="' + key + '"]')
          if (btn) btn.click()
        }
      })
    })

    // Remove event
    document.querySelectorAll('[data-ref-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.refRemove
        var idx = parseInt(btn.dataset.refIdx, 10)
        var events = _loadEvents()
        var removed = events[key].splice(idx, 1)
        _saveEvents(events)
        _render()
        _toast('Evento "' + removed[0] + '" removido', 'success')
      })
    })

    // Reset to defaults
    document.querySelectorAll('[data-ref-reset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.refReset
        var events = _loadEvents()
        events[key] = JSON.parse(JSON.stringify(DEFAULT_EVENTS[key]))
        _saveEvents(events)
        _render()
        _toast('Lista restaurada ao padrao', 'success')
      })
    })
  }

  function _toast(msg, type) {
    var el = document.createElement('div')
    el.className = 'bday-toast bday-toast-' + (type || 'info')
    el.textContent = msg; document.body.appendChild(el)
    setTimeout(function () { el.classList.add('bday-toast-show') }, 10)
    setTimeout(function () { el.remove() }, 3000)
  }

  async function mount() {
    await _loadLinks()
    _render()
  }

  document.addEventListener('DOMContentLoaded', function () {
    var check = setInterval(function () {
      var page = document.getElementById('page-short-links')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(check); mount()
      }
    }, 500)
    setTimeout(function () { clearInterval(check) }, 30000)
  })

  window.ShortLinksUI = Object.freeze({ mount: mount })
})()
