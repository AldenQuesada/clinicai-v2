/**
 * ClinicAI — Module Permissions UI (Premium)
 * Matriz de permissoes: Modulos x Roles com toggles visuais.
 *
 * Renderiza em #modulePermissionsRoot (dentro de Configuracoes > Permissoes)
 *
 * Logica:
 *   - Le defaults do NAV_CONFIG (hardcoded)
 *   - Le overrides do banco (clinic_module_permissions)
 *   - Override > default. Se nao tem override, usa default.
 *   - Owner nunca perde acesso (toggle desabilitado)
 *   - Salva via bulk_set_module_permissions (batch upsert)
 */
;(function () {
  'use strict'
  if (window._clinicaiModulePermsLoaded) return
  window._clinicaiModulePermsLoaded = true

  var _root = null
  var _loading = false
  var _saving = false
  var _overrides = {} // key: "module|page|role" → boolean
  var _dirty = {}     // mudancas pendentes

  // Owner sempre tem acesso total — exibido como nota acima da matriz,
  // nao entra como coluna de toggle.
  var ROLES_ORDER = ['admin', 'therapist', 'receptionist', 'viewer']
  var ROLE_LABELS = {
    owner:        { short: 'Dono',    icon: 'crown',  color: '#C9A96E' },
    admin:        { short: 'Admin',   icon: 'shield', color: '#7C3AED' },
    therapist:    { short: 'Espec.',  icon: 'heart',  color: '#10b981' },
    receptionist: { short: 'Secret.', icon: 'phone',  color: '#3b82f6' },
    viewer:       { short: 'Visual.', icon: 'eye',    color: '#6b7280' },
  }

  var MODULE_ICONS = {
    dashboard: 'grid', 'captacao-fullface': 'star', 'captacao-protocolos': 'activity',
    agenda: 'calendar', patients: 'heart', whatsapp: 'message-circle',
    growth: 'trending-up', 'app-rejuvenescimento': 'zap', financeiro: 'dollar-sign',
    ferramentas: 'tool', mira: 'cpu', settings: 'settings',
  }

  function _esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function _feather(n, s) { s = s || 16; return '<i data-feather="' + n + '" style="width:' + s + 'px;height:' + s + 'px"></i>' }

  function _key(moduleId, pageId, role) {
    return moduleId + '|' + (pageId || '') + '|' + role
  }

  // ── Init ──────────────────────────────────────────────────────

  async function init() {
    _root = document.getElementById('modulePermissionsRoot')
    if (!_root) return
    _loading = true
    _render()
    await _loadPermissions()
    _loading = false
    _render()
  }

  async function _loadPermissions() {
    var sb = window._sbShared
    if (!sb) return
    try {
      var r = await sb.rpc('get_module_permissions')
      if (r.error) { console.warn('[ModulePerms] RPC error:', r.error.message); return }
      var perms = (r.data && r.data.permissions) || []
      _overrides = {}
      perms.forEach(function (p) {
        _overrides[_key(p.module_id, p.page_id, p.role)] = p.allowed
      })
    } catch (e) { console.warn('[ModulePerms] load error:', e) }
  }

  // ── Resolve effective permission ──────────────────────────────

  function _getDefault(section, page, role) {
    // Se roles[] vazio no config = todos tem acesso
    var sectionRoles = section.roles || []
    if (page && page.roles) sectionRoles = page.roles

    if (sectionRoles.length === 0) return true
    return sectionRoles.indexOf(role) >= 0
  }

  function _getEffective(moduleId, pageId, role, section, page) {
    var k = _key(moduleId, pageId, role)
    if (k in _dirty) return _dirty[k]
    if (k in _overrides) return _overrides[k]
    return _getDefault(section, page, role)
  }

  // ── Render ────────────────────────────────────────────────────

  function _render() {
    if (!_root) return

    if (_loading) {
      _root.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af">' + _feather('loader', 20) + ' Carregando permissoes...</div>'
      if (window.feather) feather.replace({ root: _root })
      return
    }

    var nav = window.NAV_CONFIG || []
    var hasDirty = Object.keys(_dirty).length > 0

    // Header
    var html = '<div class="mp-header">'
      + '<div>'
        + '<div class="mp-title">' + _feather('lock', 20) + ' Permissoes por Modulo</div>'
        + '<div class="mp-desc">Controle quais funcionalidades cada nivel de acesso pode ver no sistema</div>'
      + '</div>'
      + '<button id="mpSaveBtn" class="mp-btn-gold"' + (hasDirty ? '' : ' disabled') + '>'
        + _feather('save', 15) + ' Salvar Alteracoes'
        + (hasDirty ? ' <span class="mp-dirty-badge">' + Object.keys(_dirty).length + '</span>' : '')
      + '</button>'
      + '</div>'

    // Owner banner — sempre acesso total
    var ownerCfg = ROLE_LABELS.owner
    html += '<div class="mp-owner-banner" style="border-left:3px solid ' + ownerCfg.color + '">'
      + '<div class="mp-owner-icon" style="background:' + ownerCfg.color + '22;color:' + ownerCfg.color + '">'
      +   _feather(ownerCfg.icon, 16)
      + '</div>'
      + '<div>'
      +   '<div class="mp-owner-title" style="color:' + ownerCfg.color + '">' + ownerCfg.short + ' &middot; acesso total</div>'
      +   '<div class="mp-owner-desc">O dono da clinica sempre tem acesso a todos os modulos e nao pode ser limitado.</div>'
      + '</div>'
    + '</div>'

    // Legend — alinhada a direita, acima das colunas de toggle
    html += '<div class="mp-legend"><div class="mp-legend-spacer"></div><div class="mp-legend-cells">'
    ROLES_ORDER.forEach(function (r) {
      var cfg = ROLE_LABELS[r]
      html += '<span class="mp-legend-item" style="color:' + cfg.color + '">' + _feather(cfg.icon, 12) + ' ' + cfg.short + '</span>'
    })
    html += '</div></div>'

    // Modules
    html += '<div class="mp-modules">'
    nav.forEach(function (section, sIdx) {
      if (section.section === 'settings') return // nao permite remover acesso a config

      var icon = MODULE_ICONS[section.section] || 'folder'

      // Section row
      html += '<div class="mp-section mp-fade" style="animation-delay:' + (sIdx * 40) + 'ms">'
        + '<div class="mp-section-left">'
          + '<div class="mp-section-icon">' + _feather(icon, 18) + '</div>'
          + '<div class="mp-section-name">' + _esc(section.label) + '</div>'
        + '</div>'
        + '<div class="mp-toggles">'

      ROLES_ORDER.forEach(function (role) {
        var allowed = _getEffective(section.section, null, role, section, null)
        var k = _key(section.section, null, role)
        var isDirty = k in _dirty

        html += '<div class="mp-toggle-cell">'
          + '<label class="mp-toggle' + (isDirty ? ' mp-toggle-dirty' : '') + '">'
            + '<input type="checkbox" class="mp-check" data-module="' + section.section + '" data-page="" data-role="' + role + '"'
              + (allowed ? ' checked' : '') + '>'
            + '<span class="mp-switch"></span>'
          + '</label>'
          + '</div>'
      })

      html += '</div></div>'

      // Page rows (sub-items)
      if (section.pages && section.pages.length > 1) {
        section.pages.forEach(function (page) {
          html += '<div class="mp-page">'
            + '<div class="mp-page-left">'
              + '<span class="mp-page-indent"></span>'
              + '<div class="mp-page-name">' + _esc(page.label) + '</div>'
            + '</div>'
            + '<div class="mp-toggles">'

          ROLES_ORDER.forEach(function (role) {
            var allowed = _getEffective(section.section, page.page, role, section, page)
            var k = _key(section.section, page.page, role)
            var isDirty = k in _dirty

            html += '<div class="mp-toggle-cell">'
              + '<label class="mp-toggle' + (isDirty ? ' mp-toggle-dirty' : '') + '">'
                + '<input type="checkbox" class="mp-check" data-module="' + section.section + '" data-page="' + page.page + '" data-role="' + role + '"'
                  + (allowed ? ' checked' : '') + '>'
                + '<span class="mp-switch"></span>'
              + '</label>'
              + '</div>'
          })

          html += '</div></div>'
        })
      }
    })
    html += '</div>'

    // Styles
    html += _styles()

    _root.innerHTML = html
    if (window.feather) feather.replace({ root: _root })

    // Events
    _root.querySelectorAll('.mp-check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var mod = cb.dataset.module
        var pg = cb.dataset.page || null
        var role = cb.dataset.role
        var k = _key(mod, pg, role)
        _dirty[k] = cb.checked

        // Se toggle de secao, propaga pras sub-paginas
        if (!pg) {
          var section = (window.NAV_CONFIG || []).find(function (s) { return s.section === mod })
          if (section && section.pages) {
            section.pages.forEach(function (p) {
              var pk = _key(mod, p.page, role)
              _dirty[pk] = cb.checked
            })
          }
        }

        _render()
      })
    })

    document.getElementById('mpSaveBtn')?.addEventListener('click', _save)
  }

  // ── Save ──────────────────────────────────────────────────────

  async function _save() {
    if (_saving || Object.keys(_dirty).length === 0) return
    _saving = true
    var btn = document.getElementById('mpSaveBtn')
    if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 15) + ' Salvando...' }

    var batch = Object.keys(_dirty).map(function (k) {
      var parts = k.split('|')
      return { module_id: parts[0], page_id: parts[1] || null, role: parts[2], allowed: _dirty[k] }
    })

    try {
      var sb = window._sbShared
      var r = await sb.rpc('bulk_set_module_permissions', { p_permissions: batch })
      if (r.error) throw new Error(r.error.message)
      if (r.data && !r.data.ok) throw new Error(r.data.error || 'Erro desconhecido')

      // Merge dirty into overrides
      Object.keys(_dirty).forEach(function (k) { _overrides[k] = _dirty[k] })
      _dirty = {}
      _toast('Permissoes salvas! Recarregue a pagina para aplicar.', 'ok')
    } catch (e) {
      _toast('Erro: ' + e.message, 'error')
    }

    _saving = false
    _render()
  }

  // ── Toast ─────────────────────────────────────────────────────

  function _toast(msg, type) {
    var colors = { ok: '#059669', error: '#DC2626' }
    var bg = { ok: '#D1FAE5', error: '#FEE2E2' }
    var t = document.createElement('div')
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10000;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.12);color:' + (colors[type] || '#374151') + ';background:' + (bg[type] || '#F3F4F6') + ';animation:mpFadeIn .3s ease'
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s' }, 3000)
    setTimeout(function () { t.remove() }, 3500)
  }

  // ── Styles ────────────────────────────────────────────────────

  function _styles() {
    return '<style>'
      + '@keyframes mpFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}'
      + '@keyframes mpFadeIn{from{opacity:0}to{opacity:1}}'
      + '.mp-fade{animation:mpFadeUp .35s ease both}'

      + '.mp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:16px;flex-wrap:wrap}'
      + '.mp-title{font-size:16px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px}'
      + '.mp-desc{font-size:12px;color:#6b7280;margin-top:3px}'

      + '.mp-btn-gold{background:linear-gradient(135deg,#C9A96E,#a8894f);color:#fff;border:none;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .2s;box-shadow:0 2px 8px rgba(201,169,110,.3)}'
      + '.mp-btn-gold:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(201,169,110,.4)}'
      + '.mp-btn-gold:disabled{opacity:.4;pointer-events:none;transform:none}'
      + '.mp-dirty-badge{background:rgba(255,255,255,.3);padding:1px 7px;border-radius:10px;font-size:10px;margin-left:4px}'

      + '.mp-owner-banner{display:flex;align-items:center;gap:12px;padding:12px 16px;background:linear-gradient(135deg,#fdf8ee,#fff);border:1px solid #f0e4cb;border-radius:12px;margin-bottom:12px}'
      + '.mp-owner-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
      + '.mp-owner-title{font-size:13px;font-weight:800;letter-spacing:.02em}'
      + '.mp-owner-desc{font-size:11px;color:#6b7280;margin-top:2px;line-height:1.4}'

      + '.mp-legend{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:6px 16px}'
      + '.mp-legend-spacer{flex:1;min-width:180px}'
      + '.mp-legend-cells{display:flex;gap:0}'
      + '.mp-legend-item{width:56px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:3px;text-transform:uppercase;letter-spacing:.04em}'

      + '.mp-modules{display:flex;flex-direction:column;gap:2px}'

      // Section row
      + '.mp-section{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;transition:all .2s}'
      + '.mp-section:hover{box-shadow:0 2px 8px rgba(0,0,0,.04);border-color:rgba(201,169,110,.2)}'
      + '.mp-section-left{display:flex;align-items:center;gap:12px;min-width:180px}'
      + '.mp-section-icon{width:34px;height:34px;border-radius:10px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280}'
      + '.mp-section-name{font-size:14px;font-weight:700;color:#111827}'

      // Page row (sub)
      + '.mp-page{display:flex;align-items:center;justify-content:space-between;padding:8px 16px 8px 28px;background:#fafafa;border-left:2px solid #e5e7eb;margin-left:32px;transition:background .15s}'
      + '.mp-page:hover{background:#f3f4f6}'
      + '.mp-page-left{display:flex;align-items:center;gap:8px;min-width:180px}'
      + '.mp-page-indent{width:14px;height:1px;background:#d1d5db;flex-shrink:0}'
      + '.mp-page-name{font-size:12px;font-weight:500;color:#6b7280}'

      // Toggle grid
      + '.mp-toggles{display:flex;gap:0}'
      + '.mp-toggle-cell{width:56px;display:flex;align-items:center;justify-content:center}'

      // Toggle switch
      + '.mp-toggle{position:relative;display:inline-block;width:36px;height:20px;cursor:pointer}'
      + '.mp-toggle input{opacity:0;width:0;height:0;position:absolute}'
      + '.mp-switch{position:absolute;inset:0;background:#e5e7eb;border-radius:20px;transition:all .25s}'
      + '.mp-switch:before{content:"";position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform .25s;box-shadow:0 1px 3px rgba(0,0,0,.15)}'
      + '.mp-toggle input:checked + .mp-switch{background:#10b981}'
      + '.mp-toggle input:checked + .mp-switch:before{transform:translateX(16px)}'
      + '.mp-toggle-locked{opacity:.5;cursor:not-allowed}'
      + '.mp-toggle-locked .mp-switch{background:#C9A96E !important}'
      + '.mp-toggle-dirty .mp-switch{box-shadow:0 0 0 2px rgba(201,169,110,.4)}'

      + '</style>'
  }

  window.ModulePermissionsUI = Object.freeze({ init: init })
})()
