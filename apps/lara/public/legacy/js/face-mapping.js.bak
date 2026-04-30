/**
 * ClinicAI — Face Mapping / Analise Facial
 *
 * Editor 2D com canvas overlay para marcar zonas de tratamento
 * no rosto do paciente. Gera report premium para apresentacao.
 *
 * v2: cores por ZONA (mapa anatomico), crop/zoom, labels "ANTES"
 *
 * Expoe globalmente:
 *   FaceMapping.init(leadId)        — abre o editor para um lead
 *   FaceMapping.openFromModal(lead) — abre direto do lead-modal
 */

;(function () {
  'use strict'

  if (window._fmLoaded) return
  window._fmLoaded = true

  // ── Config ────────────────────────────────────────────────

  // ── Zone categories ────────────────────────────────────────
  // cat: 'fill' (preenchimento, mL) or 'tox' (rugas/toxina, U)
  // min/max: default ranges (editable, saved to localStorage)

  var ZONES_DEFAULT = [
    // Preenchimento (mL)
    { id: 'zigoma-lateral',  label: 'Zigoma Lateral',    desc: 'Projecao',            color: '#5B7FC7', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'zigoma-anterior', label: 'Zigoma Anterior',   desc: 'Preenche sombra',     color: '#6BBF8A', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah' },
    { id: 'temporal',        label: 'Temporal',           desc: 'Vetor lifting',       color: '#9B6FC7', angles: ['front', '45', 'lateral'], cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'olheira',         label: 'Olheira',           desc: 'Sombra periorbital',  color: '#7ECF7E', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah' },
    { id: 'nariz-dorso',     label: 'Nariz Dorso',       desc: 'Projecao dorsal',     color: '#A8B4C8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.3, max: 1.0, defaultTx: 'ah' },
    { id: 'nariz-base',      label: 'Nariz Base',        desc: 'Base / asa nasal',    color: '#B8C4D8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah' },
    { id: 'sulco',           label: 'Sulco Nasogeniano', desc: 'Suavizacao',          color: '#E8A86B', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'marionete',       label: 'Marionete',         desc: 'Refinamento',         color: '#D98BA3', angles: ['45'],              cat: 'fill', unit: 'mL', min: 0.3, max: 1.0, defaultTx: 'ah' },
    { id: 'pre-jowl',        label: 'Pre-jowl',         desc: 'Transicao',           color: '#E8B8C8', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah' },
    { id: 'mandibula',       label: 'Mandibula',         desc: 'Contorno',            color: '#C9A96E', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 1.0, max: 3.0, defaultTx: 'ah' },
    { id: 'mento',           label: 'Mento',             desc: 'Projecao',            color: '#D4A857', angles: ['45', 'lateral'],   cat: 'fill', unit: 'mL', min: 0.5, max: 1.5, defaultTx: 'ah' },
    { id: 'labio',           label: 'Labios',            desc: 'Volume / contorno',   color: '#E07B7B', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.5, max: 1.0, defaultTx: 'ah' },
    { id: 'cod-barras',     label: 'Codigo de Barras',  desc: 'Labio superior',      color: '#D4788A', angles: ['front', '45'],     cat: 'fill', unit: 'mL', min: 0.3, max: 0.5, defaultTx: 'ah' },
    { id: 'pescoco',        label: 'Pescoco',           desc: 'Linhas cervicais',    color: '#B8A8D8', angles: ['front', 'lateral'], cat: 'fill', unit: 'mL', min: 1.0, max: 3.0, defaultTx: 'bio' },
    // Rugas / Toxina (U = unidades)
    { id: 'glabela',         label: 'Glabela',           desc: 'Linhas de expressao', color: '#7BA3CF', angles: ['front'],           cat: 'tox', unit: 'U', min: 10, max: 25, defaultTx: 'botox' },
    { id: 'frontal',         label: 'Frontal',           desc: 'Linhas frontais',     color: '#8ECFC4', angles: ['front'],           cat: 'tox', unit: 'U', min: 10, max: 20, defaultTx: 'botox' },
    { id: 'periorbital',     label: 'Periorbital',       desc: 'Pes de galinha',      color: '#6BAED6', angles: ['front', '45'],     cat: 'tox', unit: 'U', min: 8,  max: 16, defaultTx: 'botox' },
    { id: 'gingival',        label: 'Gingival',          desc: 'Sorriso gengival',    color: '#E8879B', angles: ['front'],           cat: 'tox', unit: 'U', min: 2,  max: 4,  defaultTx: 'botox' },
    { id: 'dao',             label: 'DAO',               desc: 'Depressao do labio',  color: '#C88EA8', angles: ['front', '45'],     cat: 'tox', unit: 'U', min: 4,  max: 8,  defaultTx: 'botox' },
    { id: 'platisma',        label: 'Platisma',          desc: 'Bandas do pescoco',   color: '#A89EC8', angles: ['front', 'lateral'], cat: 'tox', unit: 'U', min: 10, max: 30, defaultTx: 'botox' },
  ]

  // Load custom ranges from localStorage (override min/max)
  var ZONES = _loadZoneRanges()

  function _loadZoneRanges() {
    var custom = {}
    try { custom = JSON.parse(localStorage.getItem('fm_zone_ranges') || '{}') } catch (e) {}
    return ZONES_DEFAULT.map(function (z) {
      var c = custom[z.id]
      return c ? Object.assign({}, z, { min: c.min != null ? c.min : z.min, max: c.max != null ? c.max : z.max }) : Object.assign({}, z)
    })
  }

  function _saveZoneRange(zoneId, min, max) {
    var custom = {}
    try { custom = JSON.parse(localStorage.getItem('fm_zone_ranges') || '{}') } catch (e) {}
    custom[zoneId] = { min: min, max: max }
    localStorage.setItem('fm_zone_ranges', JSON.stringify(custom))
    ZONES = _loadZoneRanges()
  }

  // SVG mini-icons for zone buttons (contour lines)
  var ZONE_ICONS = {
    'zigoma-lateral':  '<path d="M3 6C5 3 9 2 11 5" stroke-width="1.5" fill="none"/>',
    'zigoma-anterior': '<path d="M4 7C6 4 10 4 11 7" stroke-width="1.5" fill="none"/>',
    'temporal':        '<path d="M3 3C5 2 8 2 9 5L8 9" stroke-width="1.5" fill="none"/>',
    'olheira':         '<ellipse cx="6" cy="7" rx="4" ry="2" stroke-width="1.5" fill="none"/>',
    'nariz-dorso':     '<path d="M6 2L6 10" stroke-width="1.5" fill="none"/><path d="M4 10L8 10" stroke-width="1" fill="none"/>',
    'nariz-base':      '<path d="M3 8C4 10 8 10 9 8" stroke-width="1.5" fill="none"/>',
    'sulco':           '<path d="M3 4C4 7 5 9 4 11" stroke-width="1.5" fill="none"/>',
    'marionete':       '<path d="M4 6C3 9 3 11 4 12" stroke-width="1.5" fill="none"/>',
    'pre-jowl':        '<path d="M3 8C4 10 7 11 9 10" stroke-width="1.5" fill="none"/>',
    'mandibula':       '<path d="M2 4C3 8 6 10 10 9" stroke-width="1.5" fill="none"/>',
    'mento':           '<path d="M4 4C3 7 5 9 8 8" stroke-width="1.5" fill="none"/>',
    'labio':           '<path d="M3 6C5 4 7 4 9 6C7 8 5 8 3 6Z" stroke-width="1.5" fill="none"/>',
    'glabela':         '<path d="M3 4L5 6L7 4L9 6" stroke-width="1.5" fill="none"/>',
    'frontal':         '<path d="M2 5L10 5M2 7L10 7M3 9L9 9" stroke-width="1" fill="none"/>',
    'periorbital':     '<path d="M2 6L4 4L6 6L8 4L10 6" stroke-width="1.5" fill="none"/>',
    'gingival':        '<path d="M4 5C5 8 7 8 8 5" stroke-width="1.5" fill="none"/><path d="M4 8L8 8" stroke-width="1" fill="none"/>',
    'dao':             '<path d="M5 4C4 7 3 9 2 10" stroke-width="1.5" fill="none"/><path d="M7 4C8 7 9 9 10 10" stroke-width="1.5" fill="none"/>',
    'platisma':        '<path d="M3 3L3 10M6 2L6 11M9 3L9 10" stroke-width="1.5" fill="none"/>',
    'cod-barras':      '<path d="M3 5L3 9M5 4L5 10M7 5L7 9M9 4L9 10" stroke-width="1" fill="none"/>',
    'pescoco':         '<path d="M2 4C4 6 8 6 10 4M2 7C4 9 8 9 10 7" stroke-width="1.5" fill="none"/>',
  }

  // Vector presets: default start→end direction per zone (relative to image center)
  // dx/dy are percentage offsets from zone center. curve = bezier curvature (0=straight, 1=very curved)
  var VECTOR_PRESETS = {
    'zigoma-lateral':  { dx: 0.12, dy: -0.08, curve: 0.25, desc: 'Projecao lateral' },
    'zigoma-anterior': { dx: 0.08, dy: -0.10, curve: 0.20, desc: 'Elevacao + projecao' },
    'temporal':        { dx: 0.06, dy: -0.14, curve: 0.30, desc: 'Vetor lifting' },
    'mento':           { dx: 0.10, dy: 0.02,  curve: 0.15, desc: 'Projecao anterior' },
    'mandibula':       { dx: 0.08, dy: -0.03, curve: 0.20, desc: 'Definicao contorno' },
    'nariz-dorso':     { dx: 0.08, dy: -0.04, curve: 0.10, desc: 'Projecao dorsal' },
    'nariz-base':      { dx: 0.06, dy: 0.02,  curve: 0.10, desc: 'Refinamento base' },
    'pre-jowl':        { dx: 0.06, dy: -0.04, curve: 0.20, desc: 'Transicao' },
    'labio':           { dx: 0.04, dy: 0.00,  curve: 0.10, desc: 'Volume anterior' },
    'olheira':         { dx: 0.03, dy: -0.03, curve: 0.15, desc: 'Elevacao' },
    'sulco':           { dx: 0.05, dy: -0.04, curve: 0.20, desc: 'Suavizacao' },
    'marionete':       { dx: 0.04, dy: -0.05, curve: 0.20, desc: 'Elevacao' },
  }

  var TREATMENTS = [
    { id: 'ah',       label: 'Acido Hialuronico',  color: '#3B82F6' },
    { id: 'bio',      label: 'Bioestimulador',     color: '#10B981' },
    { id: 'laser',    label: 'Laser / Fotona',     color: '#F59E0B' },
    { id: 'botox',    label: 'Toxina Botulinica',  color: '#8B5CF6' },
    { id: 'peel',     label: 'Peeling',            color: '#EC4899' },
    { id: 'fio',      label: 'Fios de PDO',        color: '#06B6D4' },
  ]

  var ANGLES = [
    { id: 'front',   label: 'Frontal' },
    { id: '45',      label: '45\u00B0' },
    { id: 'lateral', label: 'Lateral' },
  ]

  // ── State ─────────────────────────────────────────────────

  var _lead = null
  var _photos = {}        // { front: File|Blob, '45': ..., lateral: ... }
  var _photoUrls = {}     // objectURLs (cropped)
  var _afterPhotoUrl = null   // DEPOIS (resultado atual) — upload manual
  var _simPhotoUrl = null     // DEPOIS SIMULADO — gerado automaticamente
  var _activeAngle = null
  var _annotations = []   // [{ id, angle, zone, treatment, ml, product, shape:{x,y,rx,ry}, side }]
  var _lastAnalysis = null  // GPT analysis result
  var _editorMode = 'zones' // 'zones' | 'vectors' | 'analysis'
  var _vectors = []       // [{ id, zone, start:{x,y}, end:{x,y}, curve:0.3 }]
  var _nextVecId = 1
  var _selVec = null      // selected vector for dragging
  var _vecDragPart = null // 'end' | 'start' | 'curve'

  // Analysis state
  // Tercos: 4 horizontal lines (y positions as % of image height)
  var _tercoLines = { hairline: 0.05, brow: 0.33, noseBase: 0.62, chin: 0.95 }
  // Ricketts: 2 points (nariz tip, chin tip) as % of image w/h
  var _rickettsPoints = { nose: { x: 0.35, y: 0.38 }, chin: { x: 0.40, y: 0.85 } }
  var _analysisDrag = null // which line/point is being dragged
  var _canvas = null
  var _ctx = null
  var _img = null         // current loaded Image
  var _imgW = 0           // rendered image width on canvas
  var _imgH = 0           // rendered image height on canvas
  var _drawing = false
  var _drawStart = null
  var _mode = 'idle'       // idle | draw | move | resize
  var _selAnn = null       // selected annotation for move/resize
  var _moveStart = null    // {x,y} offset when dragging
  var _resizeHandle = null // 'n'|'s'|'e'|'w' edge being dragged
  var _selectedZone = null
  var _selectedTreatment = 'ah'
  var _selectedMl = '0.5'
  var _selectedSide = 'bilateral'
  var _selectedProduct = ''
  var _nextId = 1
  var _doneItems = []
  var _exportCanvas = null

  // Crop state
  var _cropImg = null
  var _cropCanvas = null
  var _cropCtx = null
  var _cropZoom = 1
  var _cropPanX = 0
  var _cropPanY = 0
  var _cropDragging = false
  var _cropDragStart = null
  var _pendingCropAngle = null

  // ── Feather icon helper ───────────────────────────────────

  function _icon(name, size) {
    size = size || 16
    if (window.feather && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: size, height: size, 'stroke-width': 1.8 })
    }
    return ''
  }

  // ── Zone color helper ─────────────────────────────────────

  function _zoneColor(zoneId) {
    var z = ZONES.find(function (x) { return x.id === zoneId })
    return z ? z.color : '#999'
  }

  function _zonesForAngle(angleId) {
    // All zones available on all views
    return ZONES
  }

  function _viewProgress() {
    // Returns status for each angle: { hasPhoto, annotationCount, complete }
    return ANGLES.map(function (a) {
      var hasPhoto = !!_photoUrls[a.id]
      var count = _annotations.filter(function (ann) { return ann.angle === a.id }).length
      return { id: a.id, label: a.label, hasPhoto: hasPhoto, count: count, complete: hasPhoto && count > 0 }
    })
  }

  function _allViewsComplete() {
    return _viewProgress().every(function (v) { return v.complete })
  }

  // ── Session persistence (localStorage) ─────────────────────

  function _saveSession() {
    if (!_lead) return
    var id = _lead.id || _lead.lead_id || 'unknown'
    try {
      // Convert photo objectURLs to base64 for persistence
      var pending = Object.keys(_photoUrls).length
      if (pending === 0) { _saveSessionData(id); return }

      var photoData = {}
      var done = 0
      Object.keys(_photoUrls).forEach(function (angle) {
        var img = new Image()
        img.onload = function () {
          var c = document.createElement('canvas')
          c.width = img.width; c.height = img.height
          c.getContext('2d').drawImage(img, 0, 0)
          photoData[angle] = c.toDataURL('image/jpeg', 0.8)
          done++
          if (done >= pending) _saveSessionData(id, photoData)
        }
        img.onerror = function () { done++; if (done >= pending) _saveSessionData(id, photoData) }
        img.src = _photoUrls[angle]
      })
    } catch (e) { console.warn('[FaceMapping] Save session failed:', e) }
  }

  function _saveSessionData(id, photoData) {
    try {
      var photos = photoData || {}
      // If no photos and no annotations, clear the session
      if (Object.keys(photos).length === 0 && _annotations.length === 0) {
        localStorage.removeItem('fm_session_' + id)
        localStorage.removeItem('fm_last_session')
        return
      }
      var session = {
        lead: { id: _lead.id || _lead.lead_id, nome: _lead.nome || _lead.name },
        activeAngle: _activeAngle,
        annotations: _annotations,
        vectors: _vectors,
        tercoLines: _tercoLines,
        rickettsPoints: _rickettsPoints,
        editorMode: _editorMode,
        nextId: _nextId,
        nextVecId: _nextVecId,
        photos: photos,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem('fm_session_' + id, JSON.stringify(session))
      localStorage.setItem('fm_last_session', id)
    } catch (e) { console.warn('[FaceMapping] Storage full or error:', e) }
  }

  function _restoreSession(leadId) {
    try {
      var data = localStorage.getItem('fm_session_' + leadId)
      if (!data) return false
      var session = JSON.parse(data)

      _annotations = session.annotations || []
      _vectors = session.vectors || []
      _tercoLines = session.tercoLines || _tercoLines
      _rickettsPoints = session.rickettsPoints || _rickettsPoints
      _editorMode = session.editorMode || 'zones'
      _nextId = session.nextId || 1
      _nextVecId = session.nextVecId || 1
      _activeAngle = session.activeAngle || null

      // Restore photos from base64
      var photos = session.photos || {}
      Object.keys(photos).forEach(function (angle) {
        if (photos[angle]) {
          // Convert data URL to blob URL
          var binary = atob(photos[angle].split(',')[1])
          var arr = new Uint8Array(binary.length)
          for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
          var blob = new Blob([arr], { type: 'image/jpeg' })
          _photoUrls[angle] = URL.createObjectURL(blob)
          _photos[angle] = blob
        }
      })

      console.log('[FaceMapping] Session restored for lead:', leadId, '| annotations:', _annotations.length, '| photos:', Object.keys(_photoUrls).length)
      return true
    } catch (e) {
      console.warn('[FaceMapping] Restore failed:', e)
      return false
    }
  }

  // Auto-save debounced (500ms after last change)
  var _saveTimer = null
  function _autoSave() {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(_saveSession, 500)
  }

  // ── Init ──────────────────────────────────────────────────

  function init(leadId) {
    var leads = window.LeadsService ? window.LeadsService.getLocal() : []
    var lead = leads.find(function (l) { return l.id === leadId || l.lead_id === leadId })
    if (!lead) lead = { id: leadId, nome: 'Paciente' }
    _lead = lead
    _photos = {}
    _photoUrls = {}
    _annotations = []
    _doneItems = []
    _activeAngle = null
    _nextId = 1
    _afterPhotoUrl = null
    _simPhotoUrl = null

    // Try to restore previous session
    _restoreSession(leadId)

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () { _render() }, 100)
  }

  function _restorePage() {
    // Called by sidebar hook on page navigate/reload
    // If we have a lead loaded, just re-render
    if (_lead) {
      _render()
      if (_activeAngle) setTimeout(_initCanvas, 50)
      return
    }
    // Try to restore last session
    try {
      var lastId = localStorage.getItem('fm_last_session')
      if (lastId) {
        init(lastId)
        return
      }
    } catch (e) {}
    // No lead — show patient picker
    var root = document.getElementById('facialAnalysisRoot')
    if (!root) return

    // Load leads for picker
    var leads = []
    try { leads = JSON.parse(localStorage.getItem('clinicai_leads') || '[]') } catch (e) {}
    var recentLeads = leads.slice(0, 20)

    var leadOptions = recentLeads.map(function (l) {
      var name = l.nome || l.name || 'Sem nome'
      return '<button onclick="FaceMapping.init(\'' + l.id + '\')" ' +
        'style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;border:1px solid #E8EAF0;border-radius:10px;background:#fff;cursor:pointer;text-align:left;transition:border-color .2s" ' +
        'onmouseover="this.style.borderColor=\'#C8A97E\'" onmouseout="this.style.borderColor=\'#E8EAF0\'">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#C9A96E);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">' + name.charAt(0).toUpperCase() + '</div>' +
        '<div><div style="font-size:13px;font-weight:600;color:#1A1B2E">' + _esc(name) + '</div>' +
        '<div style="font-size:11px;color:#9CA3AF">' + (l.phone || l.whatsapp || l.telefone || '') + '</div></div>' +
      '</button>'
    }).join('')

    root.innerHTML = '<div class="fm-page">' +
      '<div class="fm-header"><div class="fm-header-left">' +
        '<span class="fm-header-title">Analise Facial</span>' +
      '</div></div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px">' +
        '<div style="max-width:400px;width:100%;text-align:center">' +
          _icon('image', 40) +
          '<h3 style="font-size:18px;font-weight:600;color:#1A1B2E;margin:12px 0 4px">Selecione o Paciente</h3>' +
          '<p style="font-size:13px;color:#9CA3AF;margin-bottom:16px">Escolha um paciente para iniciar a analise facial</p>' +
          '<div style="display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;text-align:left">' +
            (leadOptions || '<p style="font-size:13px;color:#9CA3AF;text-align:center">Nenhum paciente encontrado</p>') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
    if (window.feather) window.feather.replace()
  }

  function openFromModal(lead) {
    _lead = lead
    _photos = {}
    _photoUrls = {}
    _annotations = []
    _doneItems = []
    _activeAngle = null
    _nextId = 1
    _afterPhotoUrl = null
    _simPhotoUrl = null

    if (window.navigateTo) window.navigateTo('facial-analysis')
    setTimeout(function () { _render() }, 100)
  }

  // ── Render ────────────────────────────────────────────────

  function _render() {
    var root = document.getElementById('facialAnalysisRoot')
    if (!root) return

    var name = _lead.nome || _lead.name || 'Paciente'

    root.innerHTML = '<div class="fm-page">' +
      _renderHeader(name) +
      _renderProgressBar() +
      '<div class="fm-body">' +
        _renderPhotoStrip() +
        _renderCanvasArea() +
        _renderToolbar() +
      '</div>' +
    '</div>'

    _bindEvents()
    if (window.feather) window.feather.replace()
  }

  function _renderHeader(name) {
    return '<div class="fm-header">' +
      '<div class="fm-header-left">' +
        '<span class="fm-header-title">Analise Facial</span>' +
        '<span class="fm-patient-badge">' + _icon('user', 14) + ' ' + _esc(name) + '</span>' +
      '</div>' +
      '<div class="fm-header-actions">' +
        '<div class="fm-mode-toggle">' +
          '<button class="fm-mode-btn' + (_editorMode === 'zones' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'zones\')">' + _icon('layers', 14) + ' Zonas</button>' +
          '<button class="fm-mode-btn' + (_editorMode === 'vectors' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'vectors\')">' + _icon('trending-up', 14) + ' Vetores</button>' +
          '<button class="fm-mode-btn' + (_editorMode === 'analysis' ? ' active' : '') + '" onclick="FaceMapping._setEditorMode(\'analysis\')">' + _icon('git-commit', 14) + ' Analise</button>' +
        '</div>' +
        '<button class="fm-btn" onclick="FaceMapping._editRanges()" title="Editar ranges">' + _icon('sliders', 14) + ' Ranges</button>' +
        '<button class="fm-btn" onclick="FaceMapping._clearAll()" title="Limpar tudo">' + _icon('trash-2', 14) + ' Limpar</button>' +
        '<button class="fm-btn" onclick="FaceMapping._exportReport()">' + _icon('download', 14) + ' Exportar Report</button>' +
        '<button class="fm-btn fm-btn-primary" onclick="FaceMapping._saveToSupabase()">' + _icon('save', 14) + ' Salvar</button>' +
      '</div>' +
    '</div>'
  }

  function _renderProgressBar() {
    var progress = _viewProgress()
    var doneCount = progress.filter(function (v) { return v.complete }).length

    var html = '<div class="fm-progress-bar">'

    progress.forEach(function (v, i) {
      var state = v.complete ? 'done' : (v.hasPhoto ? 'photo' : 'empty')
      var isActive = _activeAngle === v.id
      var statusIcon = v.complete
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : (v.hasPhoto ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>')

      html += '<div class="fm-progress-step' + (isActive ? ' active' : '') + ' fm-progress-' + state + '" ' +
        'onclick="FaceMapping._selectAngle(\'' + v.id + '\')">' +
        '<span class="fm-progress-icon">' + statusIcon + '</span>' +
        '<span class="fm-progress-label">' + v.label + '</span>' +
        '<span class="fm-progress-detail">' +
          (v.hasPhoto ? (v.count > 0 ? v.count + ' marcacao' + (v.count > 1 ? 'es' : '') : 'Sem marcacoes') : 'Sem foto') +
        '</span>' +
      '</div>'

      if (i < progress.length - 1) {
        html += '<div class="fm-progress-line' + (progress[i].complete ? ' done' : '') + '"></div>'
      }
    })

    html += '<div class="fm-progress-summary">' + doneCount + '/3</div>'
    html += '</div>'
    return html
  }

  function _renderPhotoStrip() {
    var html = '<div class="fm-photo-strip">'

    ANGLES.forEach(function (a) {
      if (_photoUrls[a.id]) {
        html += '<div class="fm-photo-thumb' + (_activeAngle === a.id ? ' active' : '') + '" ' +
          'onclick="FaceMapping._selectAngle(\'' + a.id + '\')">' +
          '<img src="' + _photoUrls[a.id] + '" alt="' + a.label + '">' +
          '<span class="fm-photo-thumb-label">ANTES \u2022 ' + a.label + '</span>' +
          '<div class="fm-photo-actions">' +
            '<button class="fm-photo-action-btn" onclick="event.stopPropagation();FaceMapping._recrop(\'' + a.id + '\')" title="Recortar">' +
              _icon('crop', 11) +
            '</button>' +
            '<button class="fm-photo-action-btn fm-photo-delete-btn" onclick="event.stopPropagation();FaceMapping._deletePhoto(\'' + a.id + '\')" title="Excluir foto">' +
              _icon('trash-2', 11) +
            '</button>' +
          '</div>' +
        '</div>'
      } else {
        html += '<div class="fm-photo-upload" onclick="FaceMapping._triggerUpload(\'' + a.id + '\')">' +
          _icon('camera', 20) +
          '<span>ANTES</span>' +
          '<span style="font-size:9px">' + a.label + '</span>' +
        '</div>'
      }
    })

    // Separator + DEPOIS / SIMULADO slots for report
    html += '<div style="border-top:1px solid var(--border);margin:8px 0;padding-top:8px">' +
      '<div style="font-size:8px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);text-align:center;margin-bottom:6px">Report</div>'

    // DEPOIS
    if (_afterPhotoUrl) {
      html += '<div class="fm-photo-thumb" style="border-color:#10B981" onclick="FaceMapping._triggerUploadExtra(\'after\')">' +
        '<img src="' + _afterPhotoUrl + '" alt="Depois">' +
        '<span class="fm-photo-thumb-label" style="background:rgba(16,185,129,0.8)">DEPOIS</span>' +
        '<div class="fm-photo-actions"><button class="fm-photo-action-btn fm-photo-delete-btn" onclick="event.stopPropagation();FaceMapping._deleteExtraPhoto(\'after\')" title="Excluir">' + _icon('trash-2', 11) + '</button></div>' +
      '</div>'
    } else {
      html += '<div class="fm-photo-upload" onclick="FaceMapping._triggerUploadExtra(\'after\')" style="border-color:#10B98140">' +
        _icon('camera', 16) + '<span style="font-size:8px">DEPOIS</span></div>'
    }

    // SIMULADO (auto-gerado)
    if (_simPhotoUrl) {
      html += '<div class="fm-photo-thumb" style="border-color:#C9A96E">' +
        '<img src="' + _simPhotoUrl + '" alt="Simulado">' +
        '<span class="fm-photo-thumb-label" style="background:rgba(201,169,110,0.9)">SIMULADO</span>' +
      '</div>'
    } else {
      var hasAnns = _annotations.length > 0
      html += '<div class="fm-photo-upload" ' +
        (hasAnns ? 'onclick="FaceMapping._regenSim()"' : '') +
        ' style="border-color:#C9A96E40;' + (hasAnns ? '' : 'opacity:0.4;cursor:default') + '">' +
        _icon('zap', 16) + '<span style="font-size:7px">AUTO</span><span style="font-size:8px">SIMULADO</span></div>'
    }

    html += '</div>'

    html += '<input type="file" id="fmFileInput" accept="image/*" style="display:none">'
    html += '<input type="file" id="fmExtraFileInput" accept="image/*" style="display:none">'
    html += '</div>'
    return html
  }

  function _renderCanvasArea() {
    if (!_activeAngle || !_photoUrls[_activeAngle]) {
      return '<div class="fm-canvas-area">' +
        '<div class="fm-empty-state">' +
          _icon('image', 48) +
          '<p>Faca o upload das fotos ANTES<br>para iniciar a analise</p>' +
        '</div>' +
      '</div>'
    }

    return '<div class="fm-canvas-area" id="fmCanvasArea">' +
      '<div class="fm-canvas-wrap drawing" id="fmCanvasWrap">' +
        '<canvas id="fmCanvas"></canvas>' +
      '</div>' +
      '<div class="fm-canvas-controls">' +
        '<button onclick="FaceMapping._toggleFullscreen()" title="Tela cheia" class="fm-canvas-ctrl-btn">' + _icon('maximize-2', 14) + '</button>' +
      '</div>' +
    '</div>'
  }

  function _renderToolbar() {
    var html = '<div class="fm-toolbar">'

    // ANALYSIS MODE: show analysis-specific toolbar
    if (_editorMode === 'analysis') {
      html += '<div class="fm-tool-section">' +
        '<div class="fm-tool-section-title">Tipo de Analise</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="fm-zone-btn' + (_activeAngle === 'front' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._selectAngle(\'front\')" style="flex:1;justify-content:center"' +
            (_photoUrls['front'] ? '' : ' disabled') + '>Tercos Faciais</button>' +
          '<button class="fm-zone-btn' + (_activeAngle === 'lateral' ? ' active' : '') + '" ' +
            'onclick="FaceMapping._selectAngle(\'lateral\')" style="flex:1;justify-content:center"' +
            (_photoUrls['lateral'] ? '' : ' disabled') + '>Linha de Ricketts</button>' +
        '</div>' +
      '</div>'

      if (_activeAngle === 'front') {
        var t = _tercoLines
        var totalH = t.chin - t.hairline
        var pSup = totalH > 0 ? Math.round((t.brow - t.hairline) / totalH * 100) : 33
        var pMed = totalH > 0 ? Math.round((t.noseBase - t.brow) / totalH * 100) : 33
        var pInf = totalH > 0 ? Math.round((t.chin - t.noseBase) / totalH * 100) : 33
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Proporcoes</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Ideal: 33% cada terco</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            _propBar('Superior', pSup) +
            _propBar('Medio', pMed) +
            _propBar('Inferior', pInf) +
          '</div>' +
        '</div>'
        html += '<div class="fm-tool-section">' +
          '<div style="font-size:11px;color:var(--text-muted)">Arraste as linhas horizontais na foto para posicionar nos pontos anatomicos.</div>' +
        '</div>'
      } else {
        html += '<div class="fm-tool-section">' +
          '<div class="fm-tool-section-title">Linha de Ricketts</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6">' +
            'Linha da beleza do perfil.<br><br>' +
            'Conecta o ponto mais proeminente do <strong>nariz</strong> ao <strong>mento</strong>.<br><br>' +
            'Os labios devem tocar ou ficar ligeiramente atras desta linha para um perfil harmonioso.<br><br>' +
            '<strong>Arraste os pontos N e M</strong> para ajustar ao rosto da paciente.' +
          '</div>' +
        '</div>'
      }

      html += '</div>'
      return html
    }

    // Zone selector — 2 categories, filtered by active angle
    var allowedZones = _zonesForAngle(_activeAngle)
    var allowedIds = allowedZones.map(function (z) { return z.id })
    var selZone = _selectedZone ? ZONES.find(function (z) { return z.id === _selectedZone }) : null
    var curUnit = selZone ? selZone.unit : 'mL'
    var curStep = curUnit === 'U' ? '1' : '0.1'

    // --- Preenchimento section ---
    var fillZones = ZONES.filter(function (z) { return z.cat === 'fill' })
    html += '<div class="fm-tool-section" style="padding-bottom:10px">' +
      '<div class="fm-tool-section-title">Preenchimento <span style="font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0">(mL)</span></div>' +
      '<div class="fm-zone-grid">'
    fillZones.forEach(function (z) {
      html += _renderZoneBtn(z, allowedIds)
    })
    html += '</div></div>'

    // --- Rugas / Toxina section ---
    var toxZones = ZONES.filter(function (z) { return z.cat === 'tox' })
    html += '<div class="fm-tool-section" style="padding-bottom:10px">' +
      '<div class="fm-tool-section-title">Rugas / Toxina <span style="font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0">(U)</span></div>' +
      '<div class="fm-zone-grid">'
    toxZones.forEach(function (z) {
      html += _renderZoneBtn(z, allowedIds)
    })
    html += '</div></div>'

    // Treatment selector
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Tratamento</div>' +
      '<select class="fm-select" id="fmTreatment" onchange="FaceMapping._onTreatmentChange(this.value)">'

    TREATMENTS.forEach(function (t) {
      html += '<option value="' + t.id + '"' + (_selectedTreatment === t.id ? ' selected' : '') + '>' + t.label + '</option>'
    })

    html += '</select></div>'

    // Quantity + Side + Product — with range hint
    var rangeHint = selZone ? (selZone.min + ' — ' + selZone.max + ' ' + selZone.unit) : ''
    html += '<div class="fm-tool-section">' +
      '<div class="fm-tool-section-title">Detalhes</div>' +
      '<div class="fm-input-row" style="margin-bottom:8px">' +
        '<label>' + curUnit + '</label>' +
        '<input class="fm-input" id="fmMl" type="number" step="' + curStep + '" min="0" max="999" value="' + _selectedMl + '" ' +
          'onchange="FaceMapping._selectedMl=this.value" style="width:70px"' +
          (rangeHint ? ' placeholder="' + rangeHint + '"' : '') + '>' +
        (rangeHint ? '<span style="font-size:10px;color:var(--text-muted)">' + rangeHint + '</span>' : '') +
      '</div>' +
      '<div class="fm-input-row" style="margin-bottom:8px">' +
        '<label>Lado</label>' +
        '<select class="fm-select" id="fmSide" onchange="FaceMapping._selectedSide=this.value" style="width:auto;flex:1">' +
          '<option value="bilateral"' + (_selectedSide === 'bilateral' ? ' selected' : '') + '>Bilateral</option>' +
          '<option value="esquerdo"' + (_selectedSide === 'esquerdo' ? ' selected' : '') + '>Esquerdo</option>' +
          '<option value="direito"' + (_selectedSide === 'direito' ? ' selected' : '') + '>Direito</option>' +
        '</select>' +
      '</div>' +
      '<input class="fm-input" id="fmProduct" placeholder="Produto (ex: Juvederm Voluma)" value="' + _esc(_selectedProduct) + '" ' +
        'onchange="FaceMapping._selectedProduct=this.value">' +
    '</div>'

    // Annotations list
    html += '<div class="fm-tool-section" style="flex:1">' +
      '<div class="fm-tool-section-title">Marcacoes (' + _annotations.length + ')</div>' +
      '<div class="fm-annotations-list">'

    var angleAnnotations = _annotations.filter(function (a) { return a.angle === _activeAngle })
    if (angleAnnotations.length === 0) {
      html += '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px">Selecione uma zona e desenhe na foto</div>'
    } else {
      angleAnnotations.forEach(function (ann) {
        var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
        var z = ZONES.find(function (x) { return x.id === ann.zone })
        var zColor = z ? z.color : '#999'
        html += '<div class="fm-annotation-item">' +
          '<span class="fm-annotation-dot" style="background:' + zColor + '"></span>' +
          '<div class="fm-annotation-info">' +
            '<div class="fm-annotation-zone">' + (z ? z.label : ann.zone) + '</div>' +
            '<div class="fm-annotation-detail">' + t.label + ' \u2022 ' + ann.ml + (z ? z.unit : 'mL') + (ann.product ? ' \u2022 ' + ann.product : '') + '</div>' +
          '</div>' +
          '<button class="fm-annotation-remove" onclick="FaceMapping._removeAnnotation(' + ann.id + ')" title="Remover">&times;</button>' +
        '</div>'
      })
    }

    html += '</div></div>'

    // Total summary
    var totals = _calcTotals()
    if (totals.length > 0) {
      html += '<div class="fm-tool-section">' +
        '<div class="fm-tool-section-title">Resumo Total</div>'
      totals.forEach(function (t) {
        html += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">' +
          '<span style="color:' + t.color + ';font-weight:600">' + t.label + '</span>' +
          '<span style="color:var(--text-primary);font-weight:600">' + t.ml.toFixed(1) + ' mL</span>' +
        '</div>'
      })
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  // ── Canvas ────────────────────────────────────────────────

  var LABEL_MARGIN = 180 // px reserved on the right for labels

  function _initCanvas() {
    _canvas = document.getElementById('fmCanvas')
    if (!_canvas || !_photoUrls[_activeAngle]) return

    _ctx = _canvas.getContext('2d')
    _img = new Image()
    _img.onload = function () {
      var area = document.getElementById('fmCanvasArea')
      var isFS = area && area.classList.contains('fm-fullscreen')

      // Fixed heights: header(64) + progress(44) + controls(40) + borders(10)
      var fixedH = isFS ? 44 : 158
      var areaW = isFS ? window.innerWidth : (area ? area.clientWidth : 800)
      var areaH = window.innerHeight - fixedH

      var maxW = areaW - LABEL_MARGIN - 10
      var maxH = areaH
      // Scale to FIT within available space (never exceed)
      var scale = Math.min(maxW / _img.width, maxH / _img.height)
      _imgW = Math.round(_img.width * scale)
      _imgH = Math.round(_img.height * scale)
      _canvas.width = _imgW + LABEL_MARGIN
      _canvas.height = _imgH
      _redraw()
    }
    _img.src = _photoUrls[_activeAngle]

    _canvas.addEventListener('mousedown', _onMouseDown)
    _canvas.addEventListener('mousemove', _onMouseMove)
    _canvas.addEventListener('mouseup', _onMouseUp)

    _canvas.addEventListener('touchstart', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _onMouseDown({ offsetX: t.clientX - _canvas.getBoundingClientRect().left, offsetY: t.clientY - _canvas.getBoundingClientRect().top })
    })
    _canvas.addEventListener('touchmove', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _onMouseMove({ offsetX: t.clientX - _canvas.getBoundingClientRect().left, offsetY: t.clientY - _canvas.getBoundingClientRect().top })
    })
    _canvas.addEventListener('touchend', function (e) {
      e.preventDefault()
      _onMouseUp()
    })
  }

  function _redraw() {
    if (!_ctx || !_img) return
    // Black background everywhere (matches removed bg)
    _ctx.fillStyle = '#000000'
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height)

    // Draw image
    _ctx.drawImage(_img, 0, 0, _imgW, _imgH)

    // Label area background (right side) — brandbook graphite
    _ctx.fillStyle = '#2C2C2C'
    _ctx.fillRect(_imgW, 0, LABEL_MARGIN, _canvas.height)

    if (_editorMode === 'vectors') {
      // VECTOR MODE: draw vectors with labels
      var vecLabelY = 20
      var VEC_LABEL_H = 38
      var sortedVecs = _vectors.slice().sort(function (a, b) { return a.start.y - b.start.y })
      sortedVecs.forEach(function (vec) {
        _drawVector(vec)
        vecLabelY = _drawVectorLabel(vec, vecLabelY, VEC_LABEL_H)
      })

      // Draw selected vector handles
      if (_selVec) {
        _ctx.save()
        // Start handle
        _ctx.fillStyle = '#fff'
        _ctx.strokeStyle = '#C8A97E'
        _ctx.lineWidth = 2
        _ctx.beginPath()
        _ctx.arc(_selVec.start.x, _selVec.start.y, 6, 0, Math.PI * 2)
        _ctx.fill(); _ctx.stroke()
        // End handle
        _ctx.beginPath()
        _ctx.arc(_selVec.end.x, _selVec.end.y, 6, 0, Math.PI * 2)
        _ctx.fill(); _ctx.stroke()
        _ctx.restore()
      }
    } else if (_editorMode === 'analysis') {
      // ANALYSIS MODE
      if (_activeAngle === 'front') {
        _drawTercos()
      } else if (_activeAngle === 'lateral') {
        _drawRicketts()
      }
    } else {
      // ZONE MODE: draw ellipses + labels
      var anns = _annotations.filter(function (a) { return a.angle === _activeAngle })
      var sorted = anns.slice().sort(function (a, b) { return a.shape.y - b.shape.y })
      var labelY = 20
      var LABEL_H = 38

      sorted.forEach(function (ann) {
        _drawEllipseClean(ann)
        labelY = _drawLabelExternal(ann, labelY, LABEL_H)
      })
    }

    // Selection handles
    if (_selAnn) {
      var s = _selAnn.shape
      var color = _zoneColor(_selAnn.zone)
      _ctx.save()
      _ctx.strokeStyle = '#fff'
      _ctx.lineWidth = 1.5
      _ctx.setLineDash([5, 3])
      _ctx.beginPath()
      _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
      _ctx.stroke()
      _ctx.setLineDash([])

      // 4 handles: N, S, E, W
      var handles = _getHandles(s)
      handles.forEach(function (h) {
        _ctx.fillStyle = '#fff'
        _ctx.strokeStyle = color
        _ctx.lineWidth = 2
        _ctx.beginPath()
        _ctx.arc(h.x, h.y, 5, 0, Math.PI * 2)
        _ctx.fill()
        _ctx.stroke()
      })
      _ctx.restore()
    }

    // Draw current shape being drawn
    if (_mode === 'draw' && _drawStart) {
      var drawColor = _zoneColor(_selectedZone)
      _ctx.save()
      _ctx.beginPath()
      _ctx.strokeStyle = drawColor
      _ctx.lineWidth = 2
      _ctx.setLineDash([6, 4])
      var cx = (_drawStart.x + _drawStart.ex) / 2
      var cy = (_drawStart.y + _drawStart.ey) / 2
      var rx = Math.abs(_drawStart.ex - _drawStart.x) / 2
      var ry = Math.abs(_drawStart.ey - _drawStart.y) / 2
      if (rx > 2 && ry > 2) {
        _ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        _ctx.stroke()
      }
      _ctx.restore()
    }
  }

  function _getHandles(s) {
    return [
      { id: 'n', x: s.x,        y: s.y - s.ry },
      { id: 's', x: s.x,        y: s.y + s.ry },
      { id: 'e', x: s.x + s.rx, y: s.y },
      { id: 'w', x: s.x - s.rx, y: s.y },
    ]
  }

  function _hitHandle(x, y) {
    if (!_selAnn) return null
    var handles = _getHandles(_selAnn.shape)
    for (var i = 0; i < handles.length; i++) {
      var dx = x - handles[i].x, dy = y - handles[i].y
      if (dx * dx + dy * dy <= 64) return handles[i].id // radius 8px
    }
    return null
  }

  function _hitEllipse(x, y) {
    var anns = _annotations.filter(function (a) { return a.angle === _activeAngle })
    // Check in reverse order (topmost first)
    for (var i = anns.length - 1; i >= 0; i--) {
      var s = anns[i].shape
      var dx = (x - s.x) / s.rx
      var dy = (y - s.y) / s.ry
      if (dx * dx + dy * dy <= 1) return anns[i]
    }
    return null
  }

  function _drawEllipseClean(ann) {
    var color = _zoneColor(ann.zone)
    var s = ann.shape

    _ctx.save()

    // Fill — translucent zone color
    _ctx.beginPath()
    _ctx.fillStyle = color + '50'
    _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    _ctx.fill()

    // Stroke
    _ctx.beginPath()
    _ctx.strokeStyle = color
    _ctx.lineWidth = 2
    _ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    _ctx.stroke()

    // White dot at center
    _ctx.beginPath()
    _ctx.fillStyle = '#fff'
    _ctx.arc(s.x, s.y, 3, 0, Math.PI * 2)
    _ctx.fill()
    _ctx.strokeStyle = color
    _ctx.lineWidth = 1
    _ctx.stroke()

    _ctx.restore()
  }

  function _drawLabelExternal(ann, labelY, labelH) {
    var color = _zoneColor(ann.zone)
    var z = ZONES.find(function (x) { return x.id === ann.zone })
    var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
    var s = ann.shape
    var zUnit = z ? z.unit : 'mL'

    // Avoid overlap: ensure labelY doesn't go above the previous
    var targetY = Math.max(labelY, s.y - 10)

    _ctx.save()

    // Leader line: center dot → right edge → label area
    var lineEndX = _imgW + 10
    _ctx.beginPath()
    _ctx.strokeStyle = '#C8A97E'  // champagne
    _ctx.lineWidth = 1
    _ctx.setLineDash([])
    // Horizontal from dot to image edge
    _ctx.moveTo(s.x, s.y)
    _ctx.lineTo(_imgW, s.y)
    // Vertical to label Y
    if (Math.abs(s.y - (targetY + 8)) > 2) {
      _ctx.lineTo(_imgW, targetY + 8)
    }
    // Short horizontal into label area
    _ctx.lineTo(lineEndX, targetY + 8)
    _ctx.stroke()

    // Small dot at line end
    _ctx.beginPath()
    _ctx.fillStyle = color
    _ctx.arc(lineEndX, targetY + 8, 3, 0, Math.PI * 2)
    _ctx.fill()

    // Label text — brandbook: ivory on graphite
    var lx = lineEndX + 8
    _ctx.font = '600 11px Inter, Montserrat, sans-serif'
    _ctx.textAlign = 'left'
    _ctx.fillStyle = '#F5F0E8'  // ivory
    _ctx.fillText(z ? z.label : ann.zone, lx, targetY + 6)

    _ctx.font = '400 9px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = '#C8A97E'  // champagne
    _ctx.fillText(ann.ml + zUnit + ' \u2022 ' + (z ? z.desc : ''), lx, targetY + 18)

    _ctx.restore()

    return targetY + labelH
  }

  // ── Analysis: Tercos + Ricketts ─────────────────────────────

  function _drawTercos() {
    var t = _tercoLines
    var y1 = t.hairline * _imgH
    var y2 = t.brow * _imgH
    var y3 = t.noseBase * _imgH
    var y4 = t.chin * _imgH

    var totalH = y4 - y1
    var sup = y2 - y1
    var med = y3 - y2
    var inf = y4 - y3
    var pSup = totalH > 0 ? Math.round(sup / totalH * 100) : 33
    var pMed = totalH > 0 ? Math.round(med / totalH * 100) : 33
    var pInf = totalH > 0 ? Math.round(inf / totalH * 100) : 33

    _ctx.save()

    // Draw 4 horizontal lines across image
    var lines = [
      { y: y1, label: 'Linha do cabelo' },
      { y: y2, label: 'Sobrancelha' },
      { y: y3, label: 'Base do nariz' },
      { y: y4, label: 'Mento' },
    ]

    lines.forEach(function (l) {
      _ctx.beginPath()
      _ctx.strokeStyle = 'rgba(200,169,126,0.7)'
      _ctx.lineWidth = 1.5
      _ctx.setLineDash([])
      _ctx.moveTo(0, l.y)
      _ctx.lineTo(_imgW, l.y)
      _ctx.stroke()

      // Draggable handle
      _ctx.beginPath()
      _ctx.fillStyle = '#C8A97E'
      _ctx.arc(_imgW - 15, l.y, 6, 0, Math.PI * 2)
      _ctx.fill()
      _ctx.strokeStyle = '#fff'
      _ctx.lineWidth = 2
      _ctx.stroke()
    })

    _ctx.setLineDash([])

    // Color bars on right panel showing proportions
    var barX = _imgW + 15
    var barW = 20
    var idealMin = 28, idealMax = 38

    function _propColor(pct) {
      if (pct >= idealMin && pct <= idealMax) return '#10B981' // green
      if (pct >= 24 && pct <= 42) return '#F59E0B' // yellow
      return '#EF4444' // red
    }

    // Superior
    var cSup = _propColor(pSup)
    _ctx.fillStyle = cSup
    _ctx.fillRect(barX, y1, barW, sup)
    // Medio
    var cMed = _propColor(pMed)
    _ctx.fillStyle = cMed
    _ctx.fillRect(barX, y2, barW, med)
    // Inferior
    var cInf = _propColor(pInf)
    _ctx.fillStyle = cInf
    _ctx.fillRect(barX, y3, barW, inf)

    // Labels
    var lx = barX + barW + 10
    _ctx.font = '700 13px Inter, Montserrat, sans-serif'
    _ctx.textAlign = 'left'

    _ctx.fillStyle = '#F5F0E8'
    _ctx.fillText('Terco Superior', lx, y1 + sup / 2 - 2)
    _ctx.font = '400 11px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = cSup
    _ctx.fillText(pSup + '%' + (pSup >= idealMin && pSup <= idealMax ? '' : (pSup < idealMin ? ' <<' : ' >>')), lx, y1 + sup / 2 + 14)

    _ctx.font = '700 13px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = '#F5F0E8'
    _ctx.fillText('Terco Medio', lx, y2 + med / 2 - 2)
    _ctx.font = '400 11px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = cMed
    _ctx.fillText(pMed + '%' + (pMed >= idealMin && pMed <= idealMax ? '' : (pMed < idealMin ? ' <<' : ' >>')), lx, y2 + med / 2 + 14)

    _ctx.font = '700 13px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = '#F5F0E8'
    _ctx.fillText('Terco Inferior', lx, y3 + inf / 2 - 2)
    _ctx.font = '400 11px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = cInf
    _ctx.fillText(pInf + '%' + (pInf >= idealMin && pInf <= idealMax ? '' : (pInf < idealMin ? ' <' : ' >')), lx, y3 + inf / 2 + 14)

    // Ideal note
    _ctx.font = '400 9px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = 'rgba(200,169,126,0.5)'
    _ctx.fillText('Ideal: 33% cada terco', lx, _imgH - 10)

    _ctx.restore()
  }

  function _drawRicketts() {
    var np = _rickettsPoints.nose
    var cp = _rickettsPoints.chin
    var nx = np.x * _imgW, ny = np.y * _imgH
    var cx = cp.x * _imgW, cy = cp.y * _imgH

    _ctx.save()

    // Ricketts line (nose tip to chin tip)
    _ctx.beginPath()
    _ctx.strokeStyle = '#EF4444'
    _ctx.lineWidth = 2
    _ctx.setLineDash([])
    _ctx.moveTo(nx, ny)
    _ctx.lineTo(cx, cy)
    _ctx.stroke()

    // Extend line slightly beyond both points
    var dx = cx - nx, dy = cy - ny
    var len = Math.sqrt(dx * dx + dy * dy)
    var ux = dx / len, uy = dy / len
    _ctx.beginPath()
    _ctx.strokeStyle = 'rgba(239,68,68,0.3)'
    _ctx.lineWidth = 1.5
    _ctx.setLineDash([6, 4])
    _ctx.moveTo(nx - ux * 30, ny - uy * 30)
    _ctx.lineTo(cx + ux * 30, cy + uy * 30)
    _ctx.stroke()
    _ctx.setLineDash([])

    // Horizontal reference through nose
    _ctx.beginPath()
    _ctx.strokeStyle = 'rgba(239,68,68,0.4)'
    _ctx.lineWidth = 1
    _ctx.moveTo(0, ny)
    _ctx.lineTo(_imgW, ny)
    _ctx.stroke()

    // Vertical reference through nose
    _ctx.beginPath()
    _ctx.strokeStyle = 'rgba(239,68,68,0.4)'
    _ctx.lineWidth = 1
    _ctx.moveTo(nx, 0)
    _ctx.lineTo(nx, _imgH)
    _ctx.stroke()

    // Draggable points
    // Nose point
    _ctx.beginPath()
    _ctx.fillStyle = '#EF4444'
    _ctx.arc(nx, ny, 7, 0, Math.PI * 2)
    _ctx.fill()
    _ctx.strokeStyle = '#fff'
    _ctx.lineWidth = 2
    _ctx.stroke()
    _ctx.font = '600 9px Inter, sans-serif'
    _ctx.fillStyle = '#fff'
    _ctx.textAlign = 'center'
    _ctx.fillText('N', nx, ny + 3)

    // Chin point
    _ctx.beginPath()
    _ctx.fillStyle = '#EF4444'
    _ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    _ctx.fill()
    _ctx.strokeStyle = '#fff'
    _ctx.lineWidth = 2
    _ctx.stroke()
    _ctx.fillStyle = '#fff'
    _ctx.fillText('M', cx, cy + 3)

    // Labels on right panel
    var lx = _imgW + 15
    _ctx.textAlign = 'left'

    _ctx.font = '700 14px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = '#F5F0E8'
    _ctx.fillText('Linha de Ricketts', lx, 30)

    _ctx.font = '400 10px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = '#C8A97E'
    _ctx.fillText('Linha da beleza do perfil', lx, 48)

    _ctx.font = '400 10px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = 'rgba(245,240,232,0.6)'
    var lines = [
      'Do ponto mais proeminente',
      'do nariz (N) ate o mento (M).',
      '',
      'Labios devem tocar ou ficar',
      'ligeiramente atras desta linha',
      'para um perfil harmonioso.',
      '',
      'Arraste os pontos N e M',
      'para ajustar ao rosto.',
    ]
    lines.forEach(function (line, i) {
      _ctx.fillText(line, lx, 75 + i * 15)
    })

    // Angle of the line
    var angleDeg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI)
    _ctx.font = '600 12px Inter, sans-serif'
    _ctx.fillStyle = '#EF4444'
    _ctx.fillText('Angulo: ' + angleDeg + '\u00B0', lx, 230)

    // Switch button hint
    _ctx.font = '400 9px Inter, sans-serif'
    _ctx.fillStyle = 'rgba(200,169,126,0.4)'
    _ctx.fillText('Frontal = Tercos | Lateral = Ricketts', lx, _imgH - 10)

    _ctx.restore()
  }

  // ── Vector drawing ─────────────────────────────────────────

  function _drawVector(vec) {
    var color = _zoneColor(vec.zone)
    var sx = vec.start.x, sy = vec.start.y
    var ex = vec.end.x, ey = vec.end.y

    // Calculate control point for bezier curve
    var mx = (sx + ex) / 2
    var my = (sy + ey) / 2
    var dx = ex - sx, dy = ey - sy
    var len = Math.sqrt(dx * dx + dy * dy)
    // Perpendicular offset for curve
    var nx = -dy / len * vec.curve * len
    var ny = dx / len * vec.curve * len
    var cpx = mx + nx, cpy = my + ny

    _ctx.save()

    // Glow effect
    _ctx.shadowColor = color
    _ctx.shadowBlur = 8

    // Main bezier curve — gradient stroke
    var grad = _ctx.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, color + '40')
    grad.addColorStop(0.3, color + 'CC')
    grad.addColorStop(1, color)

    _ctx.beginPath()
    _ctx.moveTo(sx, sy)
    _ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    _ctx.strokeStyle = grad
    _ctx.lineWidth = 3.5
    _ctx.lineCap = 'round'
    _ctx.stroke()

    _ctx.shadowBlur = 0

    // Thinner inner line for refinement
    _ctx.beginPath()
    _ctx.moveTo(sx, sy)
    _ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    _ctx.strokeStyle = '#fff'
    _ctx.lineWidth = 1
    _ctx.globalAlpha = 0.3
    _ctx.stroke()
    _ctx.globalAlpha = 1

    // Arrowhead at end
    var angle = Math.atan2(ey - cpy, ex - cpx)
    var aLen = 12
    var aWidth = 5
    _ctx.beginPath()
    _ctx.moveTo(ex, ey)
    _ctx.lineTo(ex - aLen * Math.cos(angle - Math.PI / aWidth), ey - aLen * Math.sin(angle - Math.PI / aWidth))
    _ctx.lineTo(ex - aLen * 0.6 * Math.cos(angle), ey - aLen * 0.6 * Math.sin(angle))
    _ctx.lineTo(ex - aLen * Math.cos(angle + Math.PI / aWidth), ey - aLen * Math.sin(angle + Math.PI / aWidth))
    _ctx.closePath()
    _ctx.fillStyle = color
    _ctx.fill()

    // Origin dot
    _ctx.beginPath()
    _ctx.arc(sx, sy, 4, 0, Math.PI * 2)
    _ctx.fillStyle = color + '80'
    _ctx.fill()
    _ctx.strokeStyle = '#fff'
    _ctx.lineWidth = 1.5
    _ctx.stroke()

    _ctx.restore()
  }

  function _drawVectorLabel(vec, labelY, labelH) {
    var z = ZONES.find(function (x) { return x.id === vec.zone })
    var color = z ? z.color : '#C8A97E'
    var preset = VECTOR_PRESETS[vec.zone]
    var desc = preset ? preset.desc : (z ? z.desc : '')

    var targetY = Math.max(labelY, vec.start.y - 10)
    var lineEndX = _imgW + 10

    _ctx.save()

    // Leader line from vector start to label
    _ctx.beginPath()
    _ctx.strokeStyle = '#C8A97E'
    _ctx.lineWidth = 1
    _ctx.moveTo(vec.start.x, vec.start.y)
    _ctx.lineTo(_imgW, vec.start.y)
    if (Math.abs(vec.start.y - (targetY + 8)) > 2) {
      _ctx.lineTo(_imgW, targetY + 8)
    }
    _ctx.lineTo(lineEndX, targetY + 8)
    _ctx.stroke()

    // Dot
    _ctx.beginPath()
    _ctx.fillStyle = color
    _ctx.arc(lineEndX, targetY + 8, 3, 0, Math.PI * 2)
    _ctx.fill()

    // Label text
    var lx = lineEndX + 8
    _ctx.font = '600 11px Inter, Montserrat, sans-serif'
    _ctx.textAlign = 'left'
    _ctx.fillStyle = '#F5F0E8'
    _ctx.fillText(z ? z.label : vec.zone, lx, targetY + 6)

    _ctx.font = '400 9px Inter, Montserrat, sans-serif'
    _ctx.fillStyle = '#C8A97E'
    _ctx.fillText('(' + desc + ')', lx, targetY + 18)

    _ctx.restore()
    return targetY + labelH
  }

  // Hit test for vectors
  function _hitVector(x, y) {
    for (var i = _vectors.length - 1; i >= 0; i--) {
      var v = _vectors[i]
      // Check near start
      var ds = Math.sqrt(Math.pow(x - v.start.x, 2) + Math.pow(y - v.start.y, 2))
      if (ds < 10) return { vec: v, part: 'start' }
      // Check near end
      var de = Math.sqrt(Math.pow(x - v.end.x, 2) + Math.pow(y - v.end.y, 2))
      if (de < 10) return { vec: v, part: 'end' }
      // Check near curve body (simplified: check midpoint area)
      var mx = (v.start.x + v.end.x) / 2
      var my = (v.start.y + v.end.y) / 2
      var dm = Math.sqrt(Math.pow(x - mx, 2) + Math.pow(y - my, 2))
      if (dm < 20) return { vec: v, part: 'start' }  // select for move
    }
    return null
  }

  // Keep old name for report canvases (they draw labels on top)
  function _drawEllipse(ann) { _drawEllipseClean(ann) }

  // ── Mouse handlers ────────────────────────────────────────

  function _onMouseDown(e) {
    var mx = e.offsetX, my = e.offsetY

    // Ignore clicks in the label margin area (except handles)
    var inLabelArea = mx > _imgW

    // ANALYSIS MODE: drag lines/points
    if (_editorMode === 'analysis') {
      if (_activeAngle === 'front') {
        // Check which terco line is near the click
        var keys = ['hairline', 'brow', 'noseBase', 'chin']
        for (var k = 0; k < keys.length; k++) {
          var ly = _tercoLines[keys[k]] * _imgH
          if (Math.abs(my - ly) < 12 && mx < _imgW) {
            _analysisDrag = keys[k]
            _mode = 'move'
            _canvas.style.cursor = 'ns-resize'
            return
          }
        }
      } else if (_activeAngle === 'lateral') {
        // Check Ricketts points
        var nDist = Math.sqrt(Math.pow(mx - _rickettsPoints.nose.x * _imgW, 2) + Math.pow(my - _rickettsPoints.nose.y * _imgH, 2))
        if (nDist < 15) { _analysisDrag = 'nose'; _mode = 'move'; _canvas.style.cursor = 'grab'; return }
        var cDist = Math.sqrt(Math.pow(mx - _rickettsPoints.chin.x * _imgW, 2) + Math.pow(my - _rickettsPoints.chin.y * _imgH, 2))
        if (cDist < 15) { _analysisDrag = 'chin'; _mode = 'move'; _canvas.style.cursor = 'grab'; return }
      }
      _analysisDrag = null
      _redraw()
      return
    }

    // VECTOR MODE: handle vector dragging
    if (_editorMode === 'vectors') {
      var hit = _hitVector(mx, my)
      if (hit) {
        _selVec = hit.vec
        _vecDragPart = hit.part
        _mode = 'move'
        _canvas.style.cursor = 'grabbing'
      } else {
        _selVec = null
      }
      _redraw()
      return
    }

    // 1. Check resize handles on selected annotation
    if (_selAnn) {
      var handle = _hitHandle(mx, my)
      if (handle) {
        _mode = 'resize'
        _resizeHandle = handle
        return
      }
    }

    // 2. Check hit on existing annotation → move
    var hit = _hitEllipse(mx, my)
    if (hit) {
      _selAnn = hit
      _mode = 'move'
      _moveStart = { x: mx - hit.shape.x, y: my - hit.shape.y }
      _canvas.style.cursor = 'grabbing'
      _redraw()
      return
    }

    // 3. Click on empty → deselect
    if (_selAnn && !_selectedZone) {
      _selAnn = null
      _mode = 'idle'
      _redraw()
      return
    }

    // 4. Draw new ellipse (zone must be selected, not in label area)
    if (_selectedZone && !inLabelArea) {
      _selAnn = null
      _mode = 'draw'
      _drawing = true
      _drawStart = { x: mx, y: my, ex: mx, ey: my }
    }
  }

  function _onMouseMove(e) {
    var mx = e.offsetX, my = e.offsetY

    // ANALYSIS MODE: drag lines/points
    if (_editorMode === 'analysis' && _mode === 'move' && _analysisDrag) {
      if (_activeAngle === 'front' && _analysisDrag) {
        _tercoLines[_analysisDrag] = Math.max(0.01, Math.min(0.99, my / _imgH))
        _redraw()
        return
      }
      if (_activeAngle === 'lateral') {
        if (_analysisDrag === 'nose') {
          _rickettsPoints.nose.x = Math.max(0.05, Math.min(0.95, mx / _imgW))
          _rickettsPoints.nose.y = Math.max(0.05, Math.min(0.95, my / _imgH))
        } else if (_analysisDrag === 'chin') {
          _rickettsPoints.chin.x = Math.max(0.05, Math.min(0.95, mx / _imgW))
          _rickettsPoints.chin.y = Math.max(0.05, Math.min(0.95, my / _imgH))
        }
        _redraw()
        return
      }
    }

    if (_editorMode === 'analysis') {
      // Cursor hints
      if (_activeAngle === 'front') {
        var nearLine = false
        var keys = ['hairline', 'brow', 'noseBase', 'chin']
        for (var ki = 0; ki < keys.length; ki++) {
          if (Math.abs(my - _tercoLines[keys[ki]] * _imgH) < 12) { nearLine = true; break }
        }
        _canvas.style.cursor = nearLine ? 'ns-resize' : 'default'
      } else {
        var nD = Math.sqrt(Math.pow(mx - _rickettsPoints.nose.x * _imgW, 2) + Math.pow(my - _rickettsPoints.nose.y * _imgH, 2))
        var cD = Math.sqrt(Math.pow(mx - _rickettsPoints.chin.x * _imgW, 2) + Math.pow(my - _rickettsPoints.chin.y * _imgH, 2))
        _canvas.style.cursor = (nD < 15 || cD < 15) ? 'grab' : 'default'
      }
      return
    }

    // VECTOR MODE: drag vector endpoints
    if (_editorMode === 'vectors' && _mode === 'move' && _selVec) {
      if (_vecDragPart === 'end') {
        _selVec.end.x = mx
        _selVec.end.y = my
      } else {
        // Move entire vector
        var dx = mx - _selVec.start.x
        var dy = my - _selVec.start.y
        _selVec.start.x += dx; _selVec.start.y += dy
        _selVec.end.x += dx; _selVec.end.y += dy
      }
      _redraw()
      return
    }

    if (_editorMode === 'vectors') {
      var h = _hitVector(mx, my)
      _canvas.style.cursor = h ? (h.part === 'end' ? 'crosshair' : 'grab') : 'default'
      return
    }

    if (_mode === 'move' && _selAnn) {
      _selAnn.shape.x = mx - _moveStart.x
      _selAnn.shape.y = my - _moveStart.y
      _redraw()
      return
    }

    if (_mode === 'resize' && _selAnn && _resizeHandle) {
      var s = _selAnn.shape
      switch (_resizeHandle) {
        case 'n': s.ry = Math.max(8, s.y - my); break
        case 's': s.ry = Math.max(8, my - s.y); break
        case 'e': s.rx = Math.max(8, mx - s.x); break
        case 'w': s.rx = Math.max(8, s.x - mx); break
      }
      _redraw()
      return
    }

    if (_mode === 'draw' && _drawStart) {
      _drawStart.ex = mx
      _drawStart.ey = my
      _redraw()
      return
    }

    // Cursor hint
    if (_selAnn && _hitHandle(mx, my)) {
      var h = _hitHandle(mx, my)
      _canvas.style.cursor = (h === 'n' || h === 's') ? 'ns-resize' : 'ew-resize'
    } else if (_hitEllipse(mx, my)) {
      _canvas.style.cursor = 'grab'
    } else {
      _canvas.style.cursor = _selectedZone ? 'crosshair' : 'default'
    }
  }

  function _onMouseUp() {
    if (_editorMode === 'analysis') {
      _mode = 'idle'
      _analysisDrag = null
      _canvas.style.cursor = 'default'
      _redraw()
      return
    }
    if (_editorMode === 'vectors') {
      _mode = 'idle'
      _canvas.style.cursor = 'default'
      _redraw()
      return
    }
    if (_mode === 'move' || _mode === 'resize') {
      _mode = 'idle'
      _canvas.style.cursor = _selectedZone ? 'crosshair' : 'default'
      _autoSave()
      _redraw()
      return
    }

    if (_mode === 'draw' && _drawStart) {
      _drawing = false
      _mode = 'idle'

      var cx = (_drawStart.x + _drawStart.ex) / 2
      var cy = (_drawStart.y + _drawStart.ey) / 2
      var rx = Math.abs(_drawStart.ex - _drawStart.x) / 2
      var ry = Math.abs(_drawStart.ey - _drawStart.y) / 2

      if (rx < 8 || ry < 8) {
        _drawStart = null
        _redraw()
        return
      }

      var mlInput = document.getElementById('fmMl')
      var productInput = document.getElementById('fmProduct')
      var sideSelect = document.getElementById('fmSide')

      var zDef = ZONES.find(function (x) { return x.id === _selectedZone })
      var qty = parseFloat(mlInput ? mlInput.value : _selectedMl) || (zDef ? zDef.min : 0.5)

      // Validate min
      if (zDef && qty < zDef.min) {
        qty = zDef.min
        if (mlInput) { mlInput.value = qty; mlInput.style.borderColor = '#EF4444'; setTimeout(function () { mlInput.style.borderColor = '' }, 1500) }
      }

      var newAnn = {
        id: _nextId++,
        angle: _activeAngle,
        zone: _selectedZone,
        treatment: _selectedTreatment,
        ml: qty,
        product: productInput ? productInput.value : _selectedProduct,
        side: sideSelect ? sideSelect.value : _selectedSide,
        shape: { x: cx, y: cy, rx: rx, ry: ry },
      }
      _annotations.push(newAnn)
      _selAnn = newAnn  // auto-select after drawing
      _simPhotoUrl = null // invalidate simulation
      _autoSave()

      _drawStart = null
      _redraw()
      _refreshToolbar()
    }
  }

  // ── Crop Modal ────────────────────────────────────────────

  function _openCropModal(imgSrc, angle) {
    _pendingCropAngle = angle
    _cropZoom = 1
    _cropPanX = 0
    _cropPanY = 0

    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmCropOverlay'

    var boxW = 360, boxH = 300

    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;width:420px;box-shadow:0 24px 80px rgba(0,0,0,0.3);overflow:hidden">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #E8EAF0">' +
          '<span style="font-size:14px;font-weight:600;color:#1A1B2E">Recortar — ANTES ' + (ANGLES.find(function (a) { return a.id === angle }) || {}).label + '</span>' +
          '<button onclick="document.getElementById(\'fmCropOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;align-items:center;gap:10px">' +
          '<div id="fmCropBox" style="width:' + boxW + 'px;height:' + boxH + 'px;overflow:hidden;border-radius:8px;border:2px solid #E8EAF0;position:relative;cursor:grab;background:#111">' +
            '<canvas id="fmCropCanvas" style="position:absolute;top:0;left:0"></canvas>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;width:100%">' +
            '<span style="font-size:11px;color:#9CA3AF">Zoom</span>' +
            '<input type="range" id="fmCropZoom" min="0.3" max="3" step="0.02" value="1" style="flex:1">' +
            '<span id="fmCropZoomLabel" style="font-size:11px;color:#9CA3AF;min-width:36px">100%</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;width:100%">' +
            '<button onclick="document.getElementById(\'fmCropOverlay\').remove()" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 16px;border:1px solid #E8EAF0;border-radius:10px;background:#fff;color:#374151;font-size:13px;font-weight:500;cursor:pointer">Cancelar</button>' +
            '<button id="fmCropConfirm" style="flex:2;display:flex;align-items:center;justify-content:center;gap:5px;padding:10px 16px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:14px;font-weight:600;cursor:pointer">' + _icon('check', 16) + ' Salvar Recorte</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    _cropCanvas = document.getElementById('fmCropCanvas')
    _cropCtx = _cropCanvas.getContext('2d')

    // HiDPI: render at 2x for sharp output
    var dpr = Math.max(window.devicePixelRatio || 1, 2)

    _cropImg = new Image()
    _cropImg.onload = function () {
      // Canvas pixels = display size * dpr
      _cropCanvas.width = boxW * dpr
      _cropCanvas.height = boxH * dpr
      // CSS keeps it at display size
      _cropCanvas.style.width = boxW + 'px'
      _cropCanvas.style.height = boxH + 'px'
      _cropCtx.scale(dpr, dpr)

      // Fit cover: fill entire box, no black borders
      var scaleW = boxW / _cropImg.width
      var scaleH = boxH / _cropImg.height
      _cropZoom = Math.max(scaleW, scaleH)

      // Center the image (some parts overflow = crop)
      var drawW = _cropImg.width * _cropZoom
      var drawH = _cropImg.height * _cropZoom
      _cropPanX = (boxW - drawW) / 2
      _cropPanY = (boxH - drawH) / 2

      var slider = document.getElementById('fmCropZoom')
      slider.min = (_cropZoom * 0.5).toFixed(2)
      slider.max = (_cropZoom * 5).toFixed(2)
      slider.value = _cropZoom
      document.getElementById('fmCropZoomLabel').textContent = Math.round(_cropZoom * 100) + '%'

      _cropRedraw()
      _bindCropEvents()
    }
    _cropImg.src = imgSrc
  }

  function _cropRedraw() {
    if (!_cropCtx || !_cropImg) return
    _cropCtx.clearRect(0, 0, _cropCanvas.width, _cropCanvas.height)

    var w = _cropImg.width * _cropZoom
    var h = _cropImg.height * _cropZoom
    _cropCtx.drawImage(_cropImg, _cropPanX, _cropPanY, w, h)
  }

  function _bindCropEvents() {
    var box = document.getElementById('fmCropBox')
    var slider = document.getElementById('fmCropZoom')
    var label = document.getElementById('fmCropZoomLabel')
    var confirm = document.getElementById('fmCropConfirm')

    // Drag to pan
    box.addEventListener('mousedown', function (e) {
      _cropDragging = true
      _cropDragStart = { x: e.clientX - _cropPanX, y: e.clientY - _cropPanY }
      box.style.cursor = 'grabbing'
    })
    document.addEventListener('mousemove', _cropMouseMove)
    document.addEventListener('mouseup', function () {
      _cropDragging = false
      if (box) box.style.cursor = 'grab'
    })

    // Touch drag
    box.addEventListener('touchstart', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _cropDragging = true
      _cropDragStart = { x: t.clientX - _cropPanX, y: t.clientY - _cropPanY }
    })
    document.addEventListener('touchmove', function (e) {
      if (!_cropDragging) return
      var t = e.touches[0]
      _cropPanX = t.clientX - _cropDragStart.x
      _cropPanY = t.clientY - _cropDragStart.y
      _cropRedraw()
    })
    document.addEventListener('touchend', function () { _cropDragging = false })

    // Zoom slider
    slider.addEventListener('input', function () {
      var oldZoom = _cropZoom
      _cropZoom = parseFloat(this.value)
      label.textContent = Math.round(_cropZoom * 100) + '%'

      // Adjust pan to keep center (use display coords, not pixel coords)
      var cx = boxW / 2, cy = boxH / 2
      _cropPanX = cx - (cx - _cropPanX) * (_cropZoom / oldZoom)
      _cropPanY = cy - (cy - _cropPanY) * (_cropZoom / oldZoom)
      _cropRedraw()
    })

    // Confirm crop
    confirm.addEventListener('click', function () {
      // Extract at full resolution with black background
      var outCanvas = document.createElement('canvas')
      outCanvas.width = _cropCanvas.width
      outCanvas.height = _cropCanvas.height
      var outCtx = outCanvas.getContext('2d')
      // Black background first
      outCtx.fillStyle = '#000000'
      outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height)
      outCtx.drawImage(_cropCanvas, 0, 0)

      // Show loading on button
      var confirmBtn = document.getElementById('fmCropConfirm')
      if (confirmBtn) confirmBtn.textContent = 'Removendo fundo...'

      outCanvas.toBlob(function (blob) {
        // Try to remove background via n8n
        _removeBackground(blob, function (processedBlob) {
          if (_photoUrls[_pendingCropAngle]) URL.revokeObjectURL(_photoUrls[_pendingCropAngle])
          _photoUrls[_pendingCropAngle] = URL.createObjectURL(processedBlob)
          _photos[_pendingCropAngle] = processedBlob

          if (!_activeAngle) _activeAngle = _pendingCropAngle

          document.getElementById('fmCropOverlay').remove()
          _render()
          _autoSave()
          if (_activeAngle === _pendingCropAngle) setTimeout(_initCanvas, 50)
        })
      }, 'image/png')
    })
  }

  // ── Background Removal ────────────────────────────────────

  // Simple hash for dedup (fast, not cryptographic)
  function _quickHash(b64) {
    var hash = 0
    for (var i = 0; i < b64.length; i += 100) {
      hash = ((hash << 5) - hash) + b64.charCodeAt(i)
      hash |= 0
    }
    return 'fh_' + Math.abs(hash).toString(36) + '_' + b64.length
  }

  function _removeBackground(blob, callback) {
    // Client-side background removal using canvas color detection
    // Works well for portrait photos with uniform backgrounds (clinic setting)
    var img = new Image()
    img.onload = function () {
      var w = img.width, h = img.height
      var c = document.createElement('canvas')
      c.width = w; c.height = h
      var ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)

      var pixels = ctx.getImageData(0, 0, w, h)
      var data = pixels.data

      // Sample background color from corners and edges
      var bgSamples = []
      var sampleSize = Math.floor(Math.min(w, h) * 0.05)
      for (var sy = 0; sy < sampleSize; sy++) {
        for (var sx = 0; sx < sampleSize; sx++) {
          // Top-left corner
          var i = (sy * w + sx) * 4
          bgSamples.push([data[i], data[i+1], data[i+2]])
          // Top-right corner
          i = (sy * w + (w - 1 - sx)) * 4
          bgSamples.push([data[i], data[i+1], data[i+2]])
        }
      }

      // Average background color
      var avgR = 0, avgG = 0, avgB = 0
      bgSamples.forEach(function (s) { avgR += s[0]; avgG += s[1]; avgB += s[2] })
      avgR = Math.round(avgR / bgSamples.length)
      avgG = Math.round(avgG / bgSamples.length)
      avgB = Math.round(avgB / bgSamples.length)

      // Tolerance for background detection (higher = more aggressive)
      var tolerance = 55

      // Replace background pixels with black
      for (var pi = 0; pi < data.length; pi += 4) {
        var dr = Math.abs(data[pi] - avgR)
        var dg = Math.abs(data[pi+1] - avgG)
        var db = Math.abs(data[pi+2] - avgB)
        var dist = Math.sqrt(dr * dr + dg * dg + db * db)

        if (dist < tolerance) {
          // Background pixel — make black
          data[pi] = 0; data[pi+1] = 0; data[pi+2] = 0
        }
      }

      // Apply edge smoothing: second pass with softer threshold near person edges
      var softTolerance = tolerance * 1.3
      for (var pi = 0; pi < data.length; pi += 4) {
        if (data[pi] === 0 && data[pi+1] === 0 && data[pi+2] === 0) continue // already black
        var dr = Math.abs(data[pi] - avgR)
        var dg = Math.abs(data[pi+1] - avgG)
        var db = Math.abs(data[pi+2] - avgB)
        var dist = Math.sqrt(dr * dr + dg * dg + db * db)

        if (dist < softTolerance) {
          // Near-background pixel — blend toward black
          var blend = (softTolerance - dist) / (softTolerance - tolerance)
          blend = Math.max(0, Math.min(1, blend))
          data[pi] = Math.round(data[pi] * (1 - blend))
          data[pi+1] = Math.round(data[pi+1] * (1 - blend))
          data[pi+2] = Math.round(data[pi+2] * (1 - blend))
        }
      }

      ctx.putImageData(pixels, 0, 0)

      c.toBlob(function (resultBlob) {
        console.log('[FaceMapping] Background removed (canvas method)')
        callback(resultBlob)
      }, 'image/png')
    }
    img.src = URL.createObjectURL(blob)
  }

  function _cropMouseMove(e) {
    if (!_cropDragging) return
    _cropPanX = e.clientX - _cropDragStart.x
    _cropPanY = e.clientY - _cropDragStart.y
    _cropRedraw()
  }

  var _pendingExtraType = null // 'after' | 'sim'

  function _triggerUploadExtra(type) {
    _pendingExtraType = type
    var input = document.getElementById('fmExtraFileInput')
    if (input) { input.value = ''; input.click() }
  }

  function _deleteExtraPhoto(type) {
    if (type === 'after') { if (_afterPhotoUrl) URL.revokeObjectURL(_afterPhotoUrl); _afterPhotoUrl = null }
    if (type === 'sim') { if (_simPhotoUrl) URL.revokeObjectURL(_simPhotoUrl); _simPhotoUrl = null }
    _render()
    if (_activeAngle) setTimeout(_initCanvas, 50)
  }

  function _deletePhoto(angle) {
    if (_photoUrls[angle]) URL.revokeObjectURL(_photoUrls[angle])
    delete _photos[angle]
    delete _photoUrls[angle]
    delete _originalFiles[angle]
    _annotations = _annotations.filter(function (a) { return a.angle !== angle })
    _simPhotoUrl = null
    if (_activeAngle === angle) {
      _activeAngle = _photoUrls['front'] ? 'front' : (_photoUrls['45'] ? '45' : (_photoUrls['lateral'] ? 'lateral' : null))
    }
    _selAnn = null
    _autoSave()
    _render()
    if (_activeAngle) setTimeout(_initCanvas, 50)
  }

  function _clearSession() {
    if (!_lead) return
    var id = _lead.id || _lead.lead_id || 'unknown'
    try { localStorage.removeItem('fm_session_' + id) } catch (e) {}
    try { localStorage.removeItem('fm_last_session') } catch (e) {}
  }

  function _recrop(angle) {
    if (!_photoUrls[angle]) return
    // Re-open crop with the original photo if we have it, otherwise current
    var src = _photoUrls[angle]
    // Try to use original file
    if (_photos[angle] && _photos[angle] instanceof File) {
      src = URL.createObjectURL(_photos[angle])
    }
    _openCropModal(src, angle)
  }

  // ── Actions ───────────────────────────────────────────────

  var _pendingUploadAngle = null
  var _originalFiles = {}  // keep originals for re-crop

  function _triggerUpload(angle) {
    _pendingUploadAngle = angle
    var input = document.getElementById('fmFileInput')
    if (input) {
      input.value = ''
      input.click()
    }
  }

  function _bindEvents() {
    var input = document.getElementById('fmFileInput')
    if (input) {
      input.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !_pendingUploadAngle) return

        // Store original for re-crop
        _originalFiles[_pendingUploadAngle] = file

        // Open crop modal
        var tempUrl = URL.createObjectURL(file)
        _openCropModal(tempUrl, _pendingUploadAngle)
      })
    }

    // Extra file input (DEPOIS / SIMULADO)
    var extraInput = document.getElementById('fmExtraFileInput')
    if (extraInput) {
      extraInput.addEventListener('change', function (e) {
        var file = e.target.files[0]
        if (!file || !_pendingExtraType) return
        var url = URL.createObjectURL(file)
        if (_pendingExtraType === 'after') {
          if (_afterPhotoUrl) URL.revokeObjectURL(_afterPhotoUrl)
          _afterPhotoUrl = url
        } else {
          if (_simPhotoUrl) URL.revokeObjectURL(_simPhotoUrl)
          _simPhotoUrl = url
        }
        _render()
        if (_activeAngle) setTimeout(_initCanvas, 50)
      })
    }

    if (_activeAngle && _photoUrls[_activeAngle]) {
      setTimeout(_initCanvas, 50)
    }
  }

  function _setEditorMode(mode) {
    _editorMode = mode
    if (mode === 'vectors') {
      if (_photoUrls['45']) {
        _activeAngle = '45'
      } else {
        alert('Vetores faciais requer foto de 45\u00B0. Faca o upload primeiro.')
        _editorMode = 'zones'
        return
      }
      if (_vectors.length === 0) _generateVectorsFromAnnotations()
    }
    if (mode === 'analysis') {
      // Use frontal for tercos, lateral for Ricketts — start with frontal
      if (_photoUrls['front']) {
        _activeAngle = 'front'
      } else if (_photoUrls['lateral']) {
        _activeAngle = 'lateral'
      } else {
        alert('Analise requer foto frontal ou lateral.')
        _editorMode = 'zones'
        return
      }
    }
    _selAnn = null
    _selVec = null
    _analysisDrag = null
    _render()
    setTimeout(_initCanvas, 50)
  }

  function _generateVectorsFromAnnotations() {
    var anns45 = _annotations.filter(function (a) { return a.angle === '45' })
    _vectors = []
    _nextVecId = 1
    anns45.forEach(function (ann) {
      var preset = VECTOR_PRESETS[ann.zone]
      if (!preset) return
      var s = ann.shape
      _vectors.push({
        id: _nextVecId++,
        zone: ann.zone,
        start: { x: s.x, y: s.y },
        end: { x: s.x + preset.dx * _imgW, y: s.y + preset.dy * _imgH },
        curve: preset.curve,
      })
    })
  }

  function _setCanvasZoom() { /* no-op, kept for API compat */ }
  function _zoomCanvas() { /* no-op */ }

  function _toggleFullscreen() {
    var area = document.getElementById('fmCanvasArea')
    if (!area) return
    if (area.classList.contains('fm-fullscreen')) {
      area.classList.remove('fm-fullscreen')
      document.body.style.overflow = ''
      // Re-init at normal size
      setTimeout(_initCanvas, 50)
    } else {
      area.classList.add('fm-fullscreen')
      document.body.style.overflow = 'hidden'
      // Re-init at fullscreen size
      setTimeout(_initCanvas, 50)
    }
  }

  function _selectAngle(angle) {
    _activeAngle = angle
    // Deselect zone if not allowed on new angle
    if (_selectedZone) {
      var allowed = _zonesForAngle(angle)
      var ids = allowed.map(function (z) { return z.id })
      if (ids.indexOf(_selectedZone) === -1) _selectedZone = null
    }
    _selAnn = null
    _render()
    setTimeout(_initCanvas, 50)
  }

  function _renderZoneBtn(z, allowedIds) {
    var allowed = allowedIds.indexOf(z.id) !== -1
    var iconSvg = ZONE_ICONS[z.id] || ''
    var svgEl = iconSvg
      ? '<svg class="fm-zone-icon" viewBox="0 0 12 12" width="14" height="14" stroke="' + (allowed ? z.color : '#D1D5DB') + '">' + iconSvg + '</svg>'
      : '<span class="fm-zone-dot" style="background:' + (allowed ? z.color : '#D1D5DB') + '"></span>'

    return '<button class="fm-zone-btn' + (_selectedZone === z.id ? ' active' : '') +
      (!allowed ? ' disabled' : '') + '" ' +
      (allowed ? 'onclick="FaceMapping._selectZone(\'' + z.id + '\')" ' : '') +
      'title="' + z.desc + ' (' + z.min + '-' + z.max + z.unit + ')' + (allowed ? '' : ' — nao se aplica') + '" ' +
      'data-zone="' + z.id + '"' +
      (!allowed ? ' disabled' : '') + '>' +
      svgEl + z.label + '</button>'
  }

  function _selectZone(zoneId) {
    _selectedZone = (_selectedZone === zoneId) ? null : zoneId

    // Auto-fill quantity + treatment from zone defaults
    if (_selectedZone) {
      var z = ZONES.find(function (x) { return x.id === _selectedZone })
      if (z) {
        _selectedMl = String(z.min)
        _selectedTreatment = z.defaultTx || (z.cat === 'tox' ? 'botox' : 'ah')
      }
    }

    _refreshToolbar()
  }

  function _onTreatmentChange(val) {
    _selectedTreatment = val
  }

  function _removeAnnotation(id) {
    _annotations = _annotations.filter(function (a) { return a.id !== id })
    _simPhotoUrl = null
    _autoSave()
    _redraw()
    _refreshToolbar()
  }

  function _clearAll() {
    if (!confirm('Limpar todas as marcacoes e fotos?')) return
    _annotations = []
    _vectors = []
    _simPhotoUrl = null
    _afterPhotoUrl = null
    // Clear all photos
    Object.keys(_photoUrls).forEach(function (k) {
      if (_photoUrls[k]) URL.revokeObjectURL(_photoUrls[k])
    })
    _photos = {}
    _photoUrls = {}
    _activeAngle = null
    _clearSession()
    _autoSave()
    _render()
  }

  function _refreshToolbar() {
    var toolbar = document.querySelector('.fm-toolbar')
    if (!toolbar) return
    var temp = document.createElement('div')
    temp.innerHTML = _renderToolbar()
    toolbar.parentNode.replaceChild(temp.firstChild, toolbar)
    if (window.feather) window.feather.replace()
  }

  function _calcTotals() {
    var map = {}
    _annotations.forEach(function (a) {
      if (!map[a.treatment]) {
        var t = TREATMENTS.find(function (x) { return x.id === a.treatment })
        map[a.treatment] = { label: t ? t.label : a.treatment, color: t ? t.color : '#999', ml: 0 }
      }
      map[a.treatment].ml += a.ml
    })
    return Object.values(map)
  }

  // ── Export Report ─────────────────────────────────────────

  function _exportReport() {
    if (_annotations.length === 0) {
      alert('Adicione marcacoes antes de exportar.')
      return
    }
    // No view restriction — export with whatever is available

    // Auto-generate simulation if not yet generated
    if (!_simPhotoUrl) {
      _generateSimulation(function () { _exportReport() })
      return
    }

    var name = _lead.nome || _lead.name || 'Paciente'
    var totals = _calcTotals()
    var totalMl = totals.reduce(function (s, t) { return s + t.ml }, 0)

    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmExportOverlay'

    // Use 45° photo as the main "ANTES" in report top row
    var mainAngle = _photoUrls['45'] ? '45' : (_photoUrls['front'] ? 'front' : 'lateral')

    var html = '<div class="fm-export-modal">' +
      '<div class="fm-export-header">' +
        '<h3>Report de Analise Facial</h3>' +
        '<div style="display:flex;gap:8px">' +
          '<button style="display:flex;align-items:center;gap:5px;padding:8px 14px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:13px;font-weight:600;cursor:pointer" onclick="FaceMapping._downloadReport()">'+
            _icon('download', 14) + ' Baixar PNG</button>' +
          '<button class="fm-btn" onclick="FaceMapping._closeExport()">' +
            _icon('x', 14) + ' Fechar</button>' +
        '</div>' +
      '</div>' +
      '<div class="fm-export-body">' +
        '<div class="fm-report" id="fmReportCard">' +

          '<div class="fm-report-header">' +
            '<div class="fm-report-brand">Clinica Mirian de Paula</div>' +
            '<div class="fm-report-subtitle">Plano de Tratamento Facial</div>' +
            '<div class="fm-report-patient">' + _esc(name) + ' \u2022 ' + _formatDate(new Date()) + '</div>' +
          '</div>' +

          // TOP ROW: ANTES / DEPOIS / DEPOIS SIMULADO (like reference)
          '<div class="fm-report-photos">' +
            // ANTES (45° or main angle)
            '<div class="fm-report-photo-cell">' +
              '<canvas id="fmReportCanvas_main"></canvas>' +
              '<span class="fm-report-photo-label">ANTES</span>' +
            '</div>' +
            // DEPOIS (resultado atual)
            '<div class="fm-report-photo-cell">' +
              (_afterPhotoUrl
                ? '<img id="fmReportAfterImg" src="' + _afterPhotoUrl + '" style="width:100%;height:100%;object-fit:cover">'
                : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.2);font-size:12px;flex-direction:column"><span style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase">Sem foto</span></div>') +
              '<span class="fm-report-photo-label">DEPOIS<br><span style="font-size:9px;font-weight:400">(seu resultado atual)</span></span>' +
            '</div>' +
            // DEPOIS SIMULADO
            '<div class="fm-report-photo-cell">' +
              (_simPhotoUrl
                ? '<img id="fmReportSimImg" src="' + _simPhotoUrl + '" style="width:100%;height:100%;object-fit:cover">'
                : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.2);font-size:12px;flex-direction:column"><span style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase">Sem foto</span></div>') +
              '<span class="fm-report-photo-label" style="background:linear-gradient(transparent,rgba(201,169,110,0.9))"><strong>DEPOIS SIMULADO</strong><br><span style="font-size:9px;font-weight:400">(protocolo completo)</span></span>' +
            '</div>' +
          '</div>' +

          // BOTTOM ROW: 3 panels (O Que Foi Feito / Mapa / Resultado Esperado)
          '<div class="fm-report-panels">' +

            // LEFT: O que foi feito (impacto do problema)
            '<div class="fm-report-panel">' +
              '<div class="fm-report-panel-title">O Que Falta Para Chegar no -10 Anos</div>' +
              _renderDonePanel() +
            '</div>' +

            // CENTER: Annotated face map
            '<div class="fm-report-panel" style="padding:12px">' +
              '<div class="fm-report-panel-title" style="padding:0 12px">Mapa de Tratamento</div>' +
              '<div class="fm-report-center-photo">' +
                '<canvas id="fmReportCenterCanvas"></canvas>' +
              '</div>' +
            '</div>' +

            // RIGHT: Resultado final simulado
            '<div class="fm-report-panel">' +
              '<div class="fm-report-panel-title">Resultado Final Simulado</div>' +
              _renderExpectedPanel() +
            '</div>' +

          '</div>' +

          // Summary bar
          '<div class="fm-report-summary">'

    totals.forEach(function (t) {
      html += '<div class="fm-report-stat">' +
        '<div class="fm-report-stat-value" style="color:' + t.color + '">' + t.ml.toFixed(1) + '</div>' +
        '<div class="fm-report-stat-label">' + t.label + '</div>' +
      '</div>'
    })

    html += '<div class="fm-report-stat">' +
      '<div class="fm-report-stat-value">' + _annotations.length + '</div>' +
      '<div class="fm-report-stat-label">Zonas Tratadas</div>' +
    '</div>'

    html += '</div></div></div></div>'
    overlay.innerHTML = html
    document.body.appendChild(overlay)

    setTimeout(function () { _renderReportCanvases() }, 100)
  }

  function _renderDonePanel() {
    var html = ''
    var uniqueZones = []
    _annotations.forEach(function (a) {
      if (uniqueZones.indexOf(a.zone) === -1) uniqueZones.push(a.zone)
    })
    uniqueZones.forEach(function (zId) {
      var z = ZONES.find(function (x) { return x.id === zId })
      var anns = _annotations.filter(function (a) { return a.zone === zId })
      var desc = anns.map(function (a) {
        var t = TREATMENTS.find(function (x) { return x.id === a.treatment })
        return (t ? t.label : '') + ' ' + a.ml + 'mL'
      }).join(', ')
      var color = z ? z.color : '#C8A97E'

      html += '<div class="fm-report-check">' +
        '<span class="fm-report-check-icon" style="background:' + color + '">' + _svgCheck() + '</span>' +
        '<div class="fm-report-check-text">' +
          '<strong>' + (z ? z.label : zId) + '</strong>' +
          '<span>' + (z ? z.desc : '') + '</span>' +
        '</div>' +
      '</div>'
    })

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Nenhuma zona marcada</div>'
  }

  function _renderExpectedPanel() {
    var results = {
      'zigoma-lateral':  { title: 'Terco medio elevado', desc: 'Efeito lifting natural' },
      'zigoma-anterior': { title: 'Olhar iluminado', desc: 'Sombra preenchida' },
      'temporal':        { title: 'Vetor de sustentacao', desc: 'Lifting sem cirurgia' },
      'olheira':         { title: 'Olhar mais descansado', desc: 'Sombra tratada' },
      'nariz-dorso':     { title: 'Nariz harmonizado', desc: 'Dorso projetado naturalmente' },
      'nariz-base':      { title: 'Base nasal refinada', desc: 'Proporcao equilibrada' },
      'sulco':           { title: 'Sulco suavizado', desc: 'Sem excesso de volume' },
      'marionete':       { title: 'Expressao mais leve', desc: 'Refinamento da marionete' },
      'pre-jowl':        { title: 'Transicao suave', desc: 'Contorno mandibular continuo' },
      'mandibula':       { title: 'Mandibula definida', desc: 'Contorno continuo' },
      'mento':           { title: 'Mento harmonizado', desc: 'Projecao ideal' },
      'labio':           { title: 'Labios naturais', desc: 'Volume harmonico' },
      'glabela':         { title: 'Glabela relaxada', desc: 'Sem linhas de expressao' },
      'frontal':         { title: 'Face mais leve', desc: 'Triangulo invertido restaurado' },
      'periorbital':     { title: 'Olhar rejuvenescido', desc: 'Pes de galinha suavizados' },
      'gingival':        { title: 'Sorriso harmonioso', desc: 'Exposicao gengival corrigida' },
      'dao':             { title: 'Canto labial elevado', desc: 'Expressao mais positiva' },
      'platisma':        { title: 'Pescoco definido', desc: 'Bandas platismais suavizadas' },
      'cod-barras':      { title: 'Labio superior liso', desc: 'Codigo de barras suavizado' },
      'pescoco':         { title: 'Pescoco rejuvenescido', desc: 'Linhas cervicais tratadas' },
    }

    var html = ''
    var seen = []
    _annotations.forEach(function (a) {
      if (seen.indexOf(a.zone) !== -1) return
      seen.push(a.zone)
      var r = results[a.zone] || { title: a.zone, desc: '' }
      var z = ZONES.find(function (x) { return x.id === a.zone })
      html += '<div class="fm-report-check">' +
        '<span class="fm-report-check-icon" style="background:' + (z ? z.color : '#8A9E88') + '">' + _svgCheck() + '</span>' +
        '<div class="fm-report-check-text">' +
          '<strong>' + r.title + '</strong>' +
          '<span>' + r.desc + '</span>' +
        '</div>' +
      '</div>'
    })

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Adicione marcacoes</div>'
  }

  function _renderReportCanvases() {
    // Main ANTES photo (45° preferred)
    var mainAngle = _photoUrls['45'] ? '45' : (_photoUrls['front'] ? 'front' : 'lateral')
    var mainCanvas = document.getElementById('fmReportCanvas_main')
    if (mainCanvas && _photoUrls[mainAngle]) {
      var mainImg = new Image()
      mainImg.onload = function () {
        var scale = 400 / mainImg.width
        mainCanvas.width = 400
        mainCanvas.height = mainImg.height * scale
        var ctx = mainCanvas.getContext('2d')
        ctx.drawImage(mainImg, 0, 0, mainCanvas.width, mainCanvas.height)
      }
      mainImg.src = _photoUrls[mainAngle]
    }

    // Center map canvas (45° with annotations)
    var centerAngle = _photoUrls['45'] ? '45' : (_photoUrls['front'] ? 'front' : 'lateral')
    var cc = document.getElementById('fmReportCenterCanvas')
    if (!cc || !_photoUrls[centerAngle]) return

    var cImg = new Image()
    cImg.onload = function () {
      var scale = 500 / cImg.width
      cc.width = 500
      cc.height = cImg.height * scale
      var ctx = cc.getContext('2d')
      ctx.drawImage(cImg, 0, 0, cc.width, cc.height)

      var anns = _annotations.filter(function (ann) { return ann.angle === centerAngle })
      var origScale = _canvas ? (cc.width / _canvas.width) : 1
      anns.forEach(function (ann) {
        _drawEllipseOn(ctx, _scaleAnn(ann, origScale))
      })
    }
    cImg.src = _photoUrls[centerAngle]
  }

  function _scaleAnn(ann, s) {
    return {
      id: ann.id, angle: ann.angle, zone: ann.zone, treatment: ann.treatment,
      ml: ann.ml, product: ann.product, side: ann.side,
      shape: { x: ann.shape.x * s, y: ann.shape.y * s, rx: ann.shape.rx * s, ry: ann.shape.ry * s }
    }
  }

  function _drawEllipseOn(ctx, ann) {
    var color = _zoneColor(ann.zone)
    var z = ZONES.find(function (x) { return x.id === ann.zone })
    var t = TREATMENTS.find(function (x) { return x.id === ann.treatment }) || TREATMENTS[0]
    var s = ann.shape

    ctx.save()
    ctx.beginPath()
    ctx.fillStyle = color + '70'
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    var label = (z ? z.label : ann.zone)
    var zUnit = z ? z.unit : 'mL'
    var detail = t.label + ' \u2022 ' + ann.ml + zUnit
    ctx.font = '600 11px Inter, Montserrat, sans-serif'
    ctx.textAlign = 'center'

    var tw = Math.max(ctx.measureText(label).width, ctx.measureText(detail).width) + 14
    var tx = s.x
    var ty = s.y - s.ry - 20

    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.beginPath()
    ctx.roundRect(tx - tw / 2, ty - 11, tw, 32, 5)
    ctx.fill()

    ctx.fillStyle = color
    ctx.fillRect(tx - tw / 2, ty - 11, 4, 32)

    ctx.fillStyle = '#fff'
    ctx.fillText(label, tx, ty + 3)
    ctx.font = '400 10px Inter, Montserrat, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(detail, tx, ty + 16)

    ctx.beginPath()
    ctx.strokeStyle = color + '80'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.moveTo(s.x, s.y - s.ry)
    ctx.lineTo(s.x, ty + 21)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.restore()
  }

  function _downloadReport() {
    var report = document.getElementById('fmReportCard')
    if (!report) return

    if (window.html2canvas) {
      window.html2canvas(report, {
        backgroundColor: '#2C2C2C',
        scale: 2,
        useCORS: true,
      }).then(function (canvas) {
        var link = document.createElement('a')
        var name = (_lead.nome || _lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'analise-facial-' + name + '-' + _dateStr() + '.png'
        link.href = canvas.toDataURL('image/png')
        link.click()
      })
    } else {
      var cc = document.getElementById('fmReportCenterCanvas')
      if (cc) {
        var link = document.createElement('a')
        var name = (_lead.nome || _lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'mapa-facial-' + name + '-' + _dateStr() + '.png'
        link.href = cc.toDataURL('image/png')
        link.click()
      }
    }
  }

  function _editRanges() {
    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmRangesOverlay'

    var html = '<div style="background:#fff;border-radius:14px;width:520px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,0.3)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid #E8EAF0;flex-shrink:0">' +
        '<span style="font-size:15px;font-weight:600;color:#1A1B2E">Editar Ranges por Zona</span>' +
        '<button onclick="document.getElementById(\'fmRangesOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div style="padding:16px 20px;overflow-y:auto;flex:1">' +
        '<div style="font-size:11px;color:#9CA3AF;margin-bottom:12px">Quantidade minima (obrigatoria) e maxima (sugestao) por zona. Alteracoes salvas localmente.</div>'

    // Fill
    html += '<div style="font-size:11px;font-weight:600;color:#C9A96E;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Preenchimento (mL)</div>'
    ZONES.filter(function (z) { return z.cat === 'fill' }).forEach(function (z) {
      html += _rangeRow(z)
    })

    // Tox
    html += '<div style="font-size:11px;font-weight:600;color:#8B5CF6;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0 8px">Rugas / Toxina (U)</div>'
    ZONES.filter(function (z) { return z.cat === 'tox' }).forEach(function (z) {
      html += _rangeRow(z)
    })

    html += '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid #E8EAF0;flex-shrink:0">' +
        '<button id="fmRangesSave" style="width:100%;padding:10px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Salvar Ranges</button>' +
      '</div>' +
    '</div>'

    overlay.innerHTML = html
    document.body.appendChild(overlay)

    document.getElementById('fmRangesSave').addEventListener('click', function () {
      ZONES.forEach(function (z) {
        var minEl = document.getElementById('fmRange_min_' + z.id)
        var maxEl = document.getElementById('fmRange_max_' + z.id)
        if (minEl && maxEl) {
          _saveZoneRange(z.id, parseFloat(minEl.value) || z.min, parseFloat(maxEl.value) || z.max)
        }
      })
      document.getElementById('fmRangesOverlay').remove()
      _refreshToolbar()
    })
  }

  function _rangeRow(z) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:' + z.color + ';flex-shrink:0"></span>' +
      '<span style="font-size:12px;color:#1A1B2E;width:130px;flex-shrink:0">' + z.label + '</span>' +
      '<span style="font-size:10px;color:#9CA3AF;width:24px">Min</span>' +
      '<input id="fmRange_min_' + z.id + '" type="number" step="' + (z.unit === 'U' ? '1' : '0.1') + '" value="' + z.min + '" ' +
        'style="width:60px;padding:4px 6px;border:1px solid #E8EAF0;border-radius:6px;font-size:12px;text-align:center">' +
      '<span style="font-size:10px;color:#9CA3AF;width:28px">Max</span>' +
      '<input id="fmRange_max_' + z.id + '" type="number" step="' + (z.unit === 'U' ? '1' : '0.1') + '" value="' + z.max + '" ' +
        'style="width:60px;padding:4px 6px;border:1px solid #E8EAF0;border-radius:6px;font-size:12px;text-align:center">' +
      '<span style="font-size:10px;color:#9CA3AF">' + z.unit + '</span>' +
    '</div>'
  }

  // ── Simulation Generator ────────────────────────────────────

  // Zone descriptions for GPT prompt
  var ZONE_PROMPT_DESC = {
    'zigoma-lateral': 'Slightly increase lateral zygomatic projection, restoring youthful cheek volume',
    'zigoma-anterior': 'Add gentle anterior zygomatic volume to fill the shadow beneath the cheekbone',
    'temporal': 'Restore temporal fossa volume, creating a subtle upward lifting vector',
    'olheira': 'Reduce periorbital shadow by 50%, brighten the tear trough area naturally',
    'nariz-dorso': 'Slightly refine the nasal dorsum projection for better profile balance',
    'nariz-base': 'Subtly refine the nasal base for improved proportion',
    'sulco': 'Soften the nasolabial fold by 40-50%, maintaining some natural expression lines',
    'marionete': 'Soften marionette lines, creating a more relaxed expression',
    'pre-jowl': 'Fill the pre-jowl sulcus for a smooth jaw-to-chin transition',
    'mandibula': 'Define the jawline contour, creating a continuous line from ear to chin',
    'mento': 'Project the chin forward slightly, improving profile balance',
    'labio': 'Add subtle lip volume while maintaining natural shape',
    'cod-barras': 'Smooth perioral lines (barcode lines) above the upper lip',
    'pescoco': 'Smooth cervical lines for a more youthful neck',
    'glabela': 'Relax glabellar lines between the eyebrows',
    'frontal': 'Smooth forehead lines for a more relaxed look',
    'periorbital': 'Soften crow\'s feet around the eyes',
    'gingival': 'Reduce gummy smile appearance',
    'dao': 'Elevate the corners of the mouth for a more positive expression',
    'platisma': 'Soften platysmal bands in the neck',
  }

  function _generateSimulation(callback) {
    var srcAngle = _photoUrls['45'] ? '45' : (_photoUrls['front'] ? 'front' : 'lateral')
    if (!_photoUrls[srcAngle]) return

    // Convert photo to base64 and call n8n webhook (proxy to OpenAI)
    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var anns = _annotations.filter(function (a) { return a.angle === srcAngle })

      // Show loading state
      var btn = document.querySelector('.fm-btn-primary')
      if (btn) { var origBtn = btn.innerHTML; btn.textContent = 'Analisando com IA...' }

      console.log('[FaceMapping] Calling GPT via n8n webhook...')

      fetch('https://flows.aldenquesada.site/webhook/lara-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'facial-ai',
          photo_base64: b64,
          annotations: anns.map(function (a) { return { zone: a.zone, treatment: a.treatment, ml: a.ml } }),
          lead_id: _lead ? (_lead.id || _lead.lead_id) : null,
          lead_name: _lead ? (_lead.nome || _lead.name) : 'Paciente',
          source: 'dashboard',
        }),
      })
      .then(function (res) { return res.json() })
      .then(function (data) {
        console.log('[FaceMapping] GPT response:', data)
        if (data.success) {
          if (data.analysis) _lastAnalysis = data.analysis
          console.log('[FaceMapping] Analysis:', _lastAnalysis ? 'OK' : 'null (using canvas)')
        }
        // Always generate canvas simulation (GPT image gen will come later)
        _generateSimulationCanvas(callback)
        if (btn) { btn.innerHTML = origBtn }
      })
      .catch(function (err) {
        console.error('[FaceMapping] Webhook failed:', err)
        _generateSimulationCanvas(callback)
        if (btn) { btn.innerHTML = origBtn }
      })
    }
    img.src = _photoUrls[srcAngle]
  }

  // Canvas-based fallback simulation (original code)
  function _generateSimulationCanvas(callback) {
    var srcAngle = _photoUrls['45'] ? '45' : (_photoUrls['front'] ? 'front' : 'lateral')
    if (!_photoUrls[srcAngle]) return

    var img = new Image()
    img.onload = function () {
      var w = img.width, h = img.height
      var c = document.createElement('canvas')
      c.width = w; c.height = h
      var ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      var anns = _annotations.filter(function (a) { return a.angle === srcAngle })
      anns.forEach(function (ann) {
        var z = ZONES.find(function (x) { return x.id === ann.zone })
        if (!z) return
        var scale = _canvas ? (w / _imgW) : 1
        var s = { x: ann.shape.x * scale, y: ann.shape.y * scale, rx: ann.shape.rx * scale, ry: ann.shape.ry * scale }
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(s.x, s.y, s.rx * 1.2, s.ry * 1.2, 0, 0, Math.PI * 2)
        ctx.clip()
        ctx.fillStyle = z.id === 'olheira' ? 'rgba(255,240,230,0.3)' : 'rgba(255,235,220,0.15)'
        ctx.beginPath()
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = 'rgba(255,248,240,0.06)'
      ctx.fillRect(0, 0, w, h)
      ctx.restore()

      c.toBlob(function (blob) {
        if (_simPhotoUrl) URL.revokeObjectURL(_simPhotoUrl)
        _simPhotoUrl = URL.createObjectURL(blob)
        if (callback) callback()
      }, 'image/jpeg', 0.95)
    }
    img.src = _photoUrls[srcAngle]
  }

  function _closeExport() {
    var overlay = document.getElementById('fmExportOverlay')
    if (overlay) overlay.remove()
  }

  // ── Save to Supabase ──────────────────────────────────────

  function _saveToSupabase() {
    if (!_lead || !_lead.id) {
      alert('Nenhum paciente selecionado.')
      return
    }

    var data = {
      lead_id: _lead.id || _lead.lead_id,
      session_date: new Date().toISOString().split('T')[0],
      annotations: _annotations.map(function (a) {
        return {
          zone: a.zone, treatment: a.treatment, ml: a.ml,
          product: a.product, side: a.side, angle: a.angle, shape: a.shape,
        }
      }),
      totals: _calcTotals(),
      done_items: _doneItems,
    }

    try {
      var key = 'fm_sessions_' + (data.lead_id)
      var sessions = JSON.parse(localStorage.getItem(key) || '[]')
      sessions.push(data)
      localStorage.setItem(key, JSON.stringify(sessions))
    } catch (e) { /* ignore */ }

    if (window._sbShared) {
      var clinicId = null
      try { clinicId = JSON.parse(localStorage.getItem('clinicai_clinic_id') || 'null') } catch (e) {}
      window._sbShared.rpc('upsert_facial_session', {
        p_clinic_id: clinicId,
        p_lead_id: data.lead_id,
        p_session_data: data,
        p_gpt_analysis: _lastAnalysis || null,
      })
        .then(function (res) {
          if (res.error) console.error('[FaceMapping] Save error:', res.error)
          else console.log('[FaceMapping] Saved to Supabase')
        })
        .catch(function (err) { console.error('[FaceMapping] Save failed:', err) })
    }

    var btn = document.querySelector('.fm-btn-primary')
    if (btn) {
      var orig = btn.innerHTML
      btn.innerHTML = _icon('check', 14) + ' Salvo!'
      btn.style.background = '#10B981'
      btn.style.borderColor = '#10B981'
      setTimeout(function () {
        btn.innerHTML = orig
        btn.style.background = ''
        btn.style.borderColor = ''
      }, 2000)
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s || ''
    return d.innerHTML
  }

  function _formatDate(d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  function _dateStr() {
    return new Date().toISOString().split('T')[0]
  }

  function _propBar(label, pct) {
    var color = (pct >= 28 && pct <= 38) ? '#10B981' : (pct >= 24 && pct <= 42 ? '#F59E0B' : '#EF4444')
    var ideal = pct >= 28 && pct <= 38
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:11px;font-weight:600;color:var(--text-primary);width:60px">' + label + '</span>' +
      '<div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">' +
        '<div style="width:' + Math.min(pct, 100) + '%;height:100%;background:' + color + ';border-radius:4px"></div>' +
      '</div>' +
      '<span style="font-size:12px;font-weight:700;color:' + color + ';min-width:36px;text-align:right">' + pct + '%</span>' +
    '</div>'
  }

  function _svgCheck() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
  }

  // ── Public API ────────────────────────────────────────────

  window.FaceMapping = {
    init: init,
    openFromModal: openFromModal,

    _restorePage: _restorePage,
    _selectAngle: _selectAngle,
    _selectZone: _selectZone,
    _onTreatmentChange: _onTreatmentChange,
    _triggerUpload: _triggerUpload,
    _removeAnnotation: _removeAnnotation,
    _clearAll: _clearAll,
    _exportReport: _exportReport,
    _downloadReport: _downloadReport,
    _closeExport: _closeExport,
    _saveToSupabase: _saveToSupabase,
    _recrop: _recrop,
    _deletePhoto: _deletePhoto,
    _editRanges: _editRanges,
    _setEditorMode: _setEditorMode,
    _setCanvasZoom: _setCanvasZoom,
    _zoomCanvas: _zoomCanvas,
    _toggleFullscreen: _toggleFullscreen,
    _triggerUploadExtra: _triggerUploadExtra,
    _deleteExtraPhoto: _deleteExtraPhoto,
    _regenSim: function () {
      _simPhotoUrl = null
      _generateSimulation(function () { _render(); if (_activeAngle) setTimeout(_initCanvas, 50) })
    },

    get _selectedMl() { return _selectedMl },
    set _selectedMl(v) { _selectedMl = v },
    get _selectedSide() { return _selectedSide },
    set _selectedSide(v) { _selectedSide = v },
    get _selectedProduct() { return _selectedProduct },
    set _selectedProduct(v) { _selectedProduct = v },
  }

})()
