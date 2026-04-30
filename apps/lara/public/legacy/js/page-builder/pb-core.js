/**
 * ClinicAI — Page Builder Core
 *
 * State management, block definitions, Supabase CRUD.
 *
 * Depende de: window.ClinicEnv
 */
;(function () {
  'use strict'
  if (window._pbCoreLoaded) return
  window._pbCoreLoaded = true

  var _url = function () { return window.ClinicEnv?.SUPABASE_URL || '' }
  var _key = function () { return window.ClinicEnv?.SUPABASE_KEY || '' }
  function _sb() { return window._sbShared || null }
  async function _rpc(name, params) {
    try {
      var sb = _sb()
      if (!sb) return null
      var res = await sb.rpc(name, params || {})
      if (res.error) { console.warn('[PB] RPC ' + name + ':', res.error.message); return null }
      return res.data
    } catch (e) { return null }
  }

  // ── Block definitions ──────────────────────────────────────
  var BLOCK_TYPES = [
    { type: 'hero', label: 'Hero', icon: 'layout', defaults: { title: '', subtitle: '', theme: 'dark', bg_color: '', image_url: '', label: '', tagline: '', description: '' } },
    { type: 'title', label: 'T\u00edtulo', icon: 'type', defaults: { text: '', subtitle: '', align: 'left' } },
    { type: 'text', label: 'Texto', icon: 'align-left', defaults: { content: '', align: 'left' } },
    { type: 'image', label: 'Imagem', icon: 'image', defaults: { url: '', alt: '', height: '' } },
    { type: 'video', label: 'V\u00eddeo', icon: 'play-circle', defaults: { url: '' } },
    { type: 'badges', label: 'Badges', icon: 'award', defaults: { items: [{ icon: '\u2728', text: '' }] } },
    { type: 'check', label: 'Checklist', icon: 'check-square', defaults: { items: [''] } },
    { type: 'testimonial', label: 'Depoimento', icon: 'message-square', defaults: { body: '', author: '', stars: 5, date: '' } },
    { type: 'carousel', label: 'Carrossel', icon: 'layers', defaults: { slides: [{ url: '' }] } },
    { type: 'buttons', label: 'Bot\u00f5es', icon: 'mouse-pointer', defaults: { items: [{ label: '', url: '', style: 'champagne' }] } },
    { type: 'price', label: 'Pre\u00e7o', icon: 'dollar-sign', defaults: { label: '', original: 0, value: 0, parcelas: 0 } },
    { type: 'divider', label: 'Divisor', icon: 'minus', defaults: {} },
    { type: 'spacer', label: 'Espa\u00e7o', icon: 'maximize-2', defaults: { height: 60 } },
    { type: 'toggles', label: 'Toggles', icon: 'toggle-left', defaults: { items: [{ label: '', default_on: false }] } },
    { type: 'links', label: 'Links', icon: 'link-2', defaults: { label: '', title: '', items: [{ title: '', subtitle: '', url: '', icon_svg: '' }] } },
    { type: 'testimonials', label: 'Depoimentos', icon: 'message-square', defaults: { label: '', title: '', items: [{ body: '', author: '', meta: '', stars: 5 }] } },
    { type: 'before_after', label: 'Antes/Depois', icon: 'columns', defaults: { label: '', title: '', slides: [{ before_url: '', after_url: '', procedure: '', detail: '' }] } },
    { type: 'cta_section', label: 'CTA Se\u00e7\u00e3o', icon: 'target', defaults: { label: '', headline: '', subtitle: '', button_label: '', button_url: '', button_style: 'champagne' } },
    { type: 'footer', label: 'Rodap\u00e9', icon: 'align-center', defaults: { clinic_label: 'Cl\u00ednica', clinic_name: 'Mirian de Paula', tagline: 'Harmonia que revela. Precis\u00e3o que dura.', social: [] } },
  ]

  // ── State ──────────────────────────────────────────────────
  var _pages = []
  var _currentPage = null  // full page object with schema
  var _selectedBlockIdx = -1
  var _view = 'list'  // list | editor
  var _dirty = false

  // ── API ────────────────────────────────────────────────────
  async function loadPages() {
    var data = await _rpc('page_list')
    _pages = Array.isArray(data) ? data : []
    return _pages
  }

  async function loadPage(id) {
    // Fetch full page with schema
    var key = _key()
    try {
      var r = await fetch(_url() + '/rest/v1/page_templates?id=eq.' + id + '&select=*', {
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
      })
      var rows = await r.json()
      if (rows && rows.length) {
        _currentPage = rows[0]
        if (typeof _currentPage.schema === 'string') _currentPage.schema = JSON.parse(_currentPage.schema)
        _selectedBlockIdx = -1
        _dirty = false
      }
    } catch (e) {}
    return _currentPage
  }

  async function createPage(slug, title) {
    var r = await _rpc('page_save', { p_slug: slug, p_title: title })
    if (r && r.ok) await loadPages()
    return r
  }

  async function savePage() {
    if (!_currentPage) return null
    var r = await _rpc('page_save', {
      p_id: _currentPage.id,
      p_slug: _currentPage.slug,
      p_title: _currentPage.title,
      p_schema: _currentPage.schema,
      p_status: _currentPage.status
    })
    if (r && r.ok) { _dirty = false; await loadPages() }
    return r
  }

  async function deletePage(id) {
    var r = await _rpc('page_delete', { p_id: id })
    if (r && r.ok) {
      if (_currentPage && _currentPage.id === id) _currentPage = null
      await loadPages()
    }
    return r
  }

  async function publishPage(id) {
    return _rpc('page_save', { p_id: id, p_status: 'published' })
  }

  // ── Block operations ───────────────────────────────────────
  function getBlocks() {
    return _currentPage && _currentPage.schema ? (_currentPage.schema.blocks || []) : []
  }

  function addBlock(type) {
    var def = BLOCK_TYPES.find(function (b) { return b.type === type })
    if (!def || !_currentPage) return
    var block = Object.assign({ type: type }, JSON.parse(JSON.stringify(def.defaults)))
    _currentPage.schema.blocks.push(block)
    _selectedBlockIdx = _currentPage.schema.blocks.length - 1
    _dirty = true
  }

  function removeBlock(idx) {
    if (!_currentPage) return
    _currentPage.schema.blocks.splice(idx, 1)
    if (_selectedBlockIdx >= _currentPage.schema.blocks.length) _selectedBlockIdx = _currentPage.schema.blocks.length - 1
    _dirty = true
  }

  function moveBlock(idx, dir) {
    if (!_currentPage) return
    var blocks = _currentPage.schema.blocks
    var target = idx + dir
    if (target < 0 || target >= blocks.length) return
    var tmp = blocks[idx]
    blocks[idx] = blocks[target]
    blocks[target] = tmp
    _selectedBlockIdx = target
    _dirty = true
  }

  function updateBlock(idx, key, value) {
    if (!_currentPage || !_currentPage.schema.blocks[idx]) return
    _currentPage.schema.blocks[idx][key] = value
    _dirty = true
  }

  function getBlock(idx) {
    return _currentPage && _currentPage.schema.blocks ? _currentPage.schema.blocks[idx] : null
  }

  // ── Sticky button ──────────────────────────────────────────
  function getStickyButton() {
    return _currentPage && _currentPage.schema ? _currentPage.schema.sticky_button : null
  }

  function setStickyButton(btn) {
    if (!_currentPage) return
    _currentPage.schema.sticky_button = btn
    _dirty = true
  }

  // ── Appearance ─────────────────────────────────────────────
  function getAppearance() {
    return _currentPage && _currentPage.schema ? (_currentPage.schema.appearance || {}) : {}
  }

  function setAppearance(key, val) {
    if (!_currentPage) return
    if (!_currentPage.schema.appearance) _currentPage.schema.appearance = {}
    _currentPage.schema.appearance[key] = val
    _dirty = true
  }

  // ── Expose ─────────────────────────────────────────────────
  window.PB = Object.freeze({
    BLOCK_TYPES: BLOCK_TYPES,
    // State
    getPages: function () { return _pages },
    getCurrentPage: function () { return _currentPage },
    getSelectedIdx: function () { return _selectedBlockIdx },
    setSelectedIdx: function (i) { _selectedBlockIdx = i },
    getView: function () { return _view },
    setView: function (v) { _view = v },
    isDirty: function () { return _dirty },
    // API
    loadPages: loadPages,
    loadPage: loadPage,
    createPage: createPage,
    savePage: savePage,
    deletePage: deletePage,
    publishPage: publishPage,
    // Blocks
    getBlocks: getBlocks,
    addBlock: addBlock,
    removeBlock: removeBlock,
    moveBlock: moveBlock,
    updateBlock: updateBlock,
    getBlock: getBlock,
    // Config
    getStickyButton: getStickyButton,
    setStickyButton: setStickyButton,
    getAppearance: getAppearance,
    setAppearance: setAppearance,
    // Marca dirty apos mutacao in-place (array items, sub-fields).
    // Usado pelos handlers de input do pb-editor para evitar re-render completo.
    markDirty: function () { _dirty = true },
  })
})()
