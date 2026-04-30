/**
 * ClinicAI — Users Admin Module v2 (Premium)
 *
 * API publica (window.*):
 *   loadUsersAdmin()        — carrega lista + KPIs + convites
 *   loadPendingInvites()    — carrega convites pendentes
 *   openInviteModal()       — abre modal de convite
 *   openEditProfileModal()  — edita perfil do usuario logado
 *   showMyProfileModal()    — modal Meu Perfil
 *   showChangePasswordModal() — modal Alterar Senha
 *
 * Todas as operacoes via RPCs SECURITY DEFINER.
 */
;(function () {
'use strict'

const _env = window.ClinicEnv || {}
let _sbInstance = null
function _sb() {
  if (!_sbInstance) _sbInstance = window._sbShared || (window.supabase?.createClient ? window.supabase.createClient(_env.SUPABASE_URL || '', _env.SUPABASE_KEY || '') : null)
  return _sbInstance
}

const ROLE_CONFIG = {
  owner:        { label: 'Proprietario', icon: 'crown',  color: '#C9A96E', bg: '#FEF3C7', desc: 'Acesso irrestrito a todo o sistema' },
  admin:        { label: 'Administrador',icon: 'shield', color: '#7C3AED', bg: '#EDE9FE', desc: 'Acesso total, gerencia equipe e config' },
  therapist:    { label: 'Especialista', icon: 'heart',  color: '#10b981', bg: '#D1FAE5', desc: 'Agenda, pacientes, prontuario, face mapping' },
  receptionist: { label: 'Secretaria',  icon: 'phone',  color: '#3b82f6', bg: '#DBEAFE', desc: 'Agenda, pacientes, WhatsApp, leads' },
  viewer:       { label: 'Visualizador', icon: 'eye',    color: '#6b7280', bg: '#F3F4F6', desc: 'Somente leitura em todo o sistema' },
}

const ERROR_MESSAGES = {
  insufficient_permissions:        'Sem permissao para realizar esta acao.',
  invalid_role:                    'Nivel de acesso invalido.',
  only_owner_can_invite_admin:     'Apenas o proprietario pode convidar administradores.',
  already_member:                  'Este e-mail ja e membro ativo da clinica.',
  clinic_not_found:                'Clinica nao encontrada. Recarregue a pagina.',
  cannot_change_owner:             'Nao e possivel alterar o proprietario por este fluxo.',
  user_not_found_or_already_active:'Usuario nao encontrado ou ja esta ativo.',
  invite_not_found:                'Convite nao encontrado ou ja foi cancelado.',
  user_not_found:                  'Usuario nao encontrado nesta clinica.',
  professional_not_found:          'Profissional nao encontrado nesta clinica.',
  professional_already_linked:     'Este profissional ja esta vinculado a outro usuario.',
  user_already_linked_to_another:  'Este usuario ja esta vinculado a outro profissional.',
}
function _errMsg(code) { return ERROR_MESSAGES[code] || code || 'Erro desconhecido' }

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
function _feather(n, s) { s = s || 16; return '<i data-feather="' + n + '" style="width:' + s + 'px;height:' + s + 'px"></i>' }

function _initials(f, l) { return ((f || '').charAt(0) + (l || '').charAt(0)).toUpperCase() || '?' }
function _fullName(u) { return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || '--' }
function _timeAgo(iso) {
  if (!iso) return '--'
  var d = new Date(iso), diff = Math.floor((Date.now() - d) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff < 30) return diff + 'd atras'
  return d.toLocaleDateString('pt-BR')
}

// ── Toast premium ───────────────────────────────────────────────
function _toast(msg, type) {
  var colors = { success: '#059669', ok: '#059669', warn: '#92400e', error: '#DC2626' }
  var bgs = { success: '#D1FAE5', ok: '#D1FAE5', warn: '#FEF3C7', error: '#FEE2E2' }
  var icons = { success: 'check-circle', ok: 'check-circle', warn: 'alert-circle', error: 'x-circle' }
  var t = document.createElement('div')
  t.className = '_ua-toast _ua-toast-enter'
  t.innerHTML = '<span style="display:flex;align-items:center;gap:8px">' + _feather(icons[type] || 'info', 16) + ' ' + _esc(msg) + '</span>'
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10000;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.12);color:' + (colors[type] || '#374151') + ';background:' + (bgs[type] || '#F3F4F6') + ';animation:_uaToastIn .3s ease'
  document.body.appendChild(t)
  if (window.feather) feather.replace({ root: t })
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s' }, 2800)
  setTimeout(() => t.remove(), 3200)
}

// ── Modal premium ───────────────────────────────────────────────
function _createModal(id, content) {
  document.getElementById(id)?.remove()
  var overlay = document.createElement('div')
  overlay.id = id
  overlay.className = '_ua-modal-backdrop'
  overlay.innerHTML = '<div class="_ua-modal _ua-modal-enter">' + content + '</div>'
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(id) })
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { _closeModal(id); document.removeEventListener('keydown', handler) }
  })
  document.body.appendChild(overlay)
  if (window.feather) feather.replace({ root: overlay })
  return overlay
}
function _closeModal(id) {
  var m = document.getElementById(id)
  if (m) { m.style.opacity = '0'; setTimeout(() => m.remove(), 200) }
}

// ── Inject styles ───────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('_uaStyles')) return
  var s = document.createElement('style')
  s.id = '_uaStyles'
  s.textContent = ''
    + '@keyframes _uaFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}'
    + '@keyframes _uaShimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}'
    + '@keyframes _uaModalIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}'
    + '@keyframes _uaToastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}'
    + '@keyframes _uaPulse{0%,100%{opacity:1}50%{opacity:.5}}'
    + '._ua-fade{animation:_uaFadeUp .4s ease both}'
    + '._ua-skeleton{background:linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%);background-size:200px 100%;animation:_uaShimmer 1.5s infinite;border-radius:8px}'
    + '._ua-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;transition:opacity .2s}'
    + '._ua-modal{background:#fff;border-radius:18px;width:100%;max-width:520px;box-shadow:0 25px 60px rgba(0,0,0,.2);overflow:hidden}'
    + '._ua-modal-enter{animation:_uaModalIn .25s ease}'
    + '._ua-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}'
    + '._ua-kpi{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;transition:all .25s}'
    + '._ua-kpi:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(201,169,110,.1);border-color:rgba(201,169,110,.3)}'
    + '._ua-kpi-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
    + '._ua-kpi-value{font-size:22px;font-weight:800;color:#111827;line-height:1}'
    + '._ua-kpi-label{font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.3px}'
    + '._ua-pills{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}'
    + '._ua-pill{background:#fff;border:1.5px solid #e5e7eb;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;color:#6b7280;cursor:pointer;transition:all .2s}'
    + '._ua-pill:hover{border-color:#C9A96E;color:#C9A96E}'
    + '._ua-pill-active{background:#C9A96E;border-color:#C9A96E;color:#fff}'
    + '._ua-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px 20px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:16px;transition:all .2s;flex-wrap:wrap}'
    + '._ua-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.05);border-color:rgba(201,169,110,.2)}'
    + '._ua-avatar{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0}'
    + '._ua-name{font-size:14px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '._ua-email{font-size:12px;color:#9ca3af;margin-top:2px}'
    + '._ua-role-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.2px}'
    + '._ua-dot{width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0;animation:_uaPulse 2s ease infinite}'
    + '._ua-btn-icon{background:none;border:1.5px solid #e5e7eb;color:#6b7280;width:34px;height:34px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .2s}'
    + '._ua-btn-icon:hover{border-color:#C9A96E;color:#C9A96E;background:rgba(201,169,110,.04)}'
    + '._ua-btn-icon-danger:hover{border-color:#FCA5A5;color:#DC2626;background:#FEF2F2}'
    + '._ua-btn-gold{background:linear-gradient(135deg,#C9A96E,#a8894f);color:#fff;border:none;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .2s;box-shadow:0 2px 8px rgba(201,169,110,.3)}'
    + '._ua-btn-gold:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(201,169,110,.4)}'
    + '._ua-btn-gold:disabled{opacity:.6;pointer-events:none}'
    + '._ua-btn-danger{background:#fff;color:#DC2626;border:1.5px solid #FCA5A5;padding:8px 18px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:6px}'
    + '._ua-btn-danger:hover{background:#FEE2E2;transform:translateY(-1px)}'
    + '._ua-input{padding:9px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;background:#fff;transition:all .2s;font-family:inherit;width:100%;box-sizing:border-box}'
    + '._ua-input:focus{border-color:#C9A96E;box-shadow:0 0 0 3px rgba(201,169,110,.1)}'
    + '._ua-role-opt{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1.5px solid #e5e7eb;border-radius:12px;cursor:pointer;transition:all .2s}'
    + '._ua-role-opt:hover{border-color:#C9A96E;background:rgba(201,169,110,.03)}'
    + '._ua-role-opt-active{border-color:#C9A96E;background:rgba(201,169,110,.06);box-shadow:0 0 0 3px rgba(201,169,110,.1)}'
    + '._ua-pending{color:#D97706;font-size:11px;font-weight:600}'
    + '._ua-expired{color:#DC2626;font-size:11px;font-weight:600}'
    + '._ua-section-title{font-size:13px;font-weight:700;color:#374151;margin:24px 0 12px;display:flex;align-items:center;gap:8px}'
    + '._ua-empty{text-align:center;padding:40px;color:#9ca3af;font-size:13px;background:#fafafa;border-radius:12px}'
    // Module access chips (inline on card)
    + '._ua-access-grid{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}'
    + '._ua-access-item{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600}'
    + '._ua-access-on{background:#D1FAE5;color:#059669}'
    + '._ua-access-off{background:#F3F4F6;color:#d1d5db;text-decoration:line-through}'
    // Detail panel (expandable)
    + '._ua-card-wrap{margin-bottom:8px}'
    + '._ua-detail-panel{background:#fafafa;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:16px 20px}'
    + '._ua-detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}'
    + '._ua-detail-section{background:#fff;border:1px solid #f3f4f6;border-radius:10px;padding:10px 12px}'
    + '._ua-detail-header{display:flex;align-items:center;gap:6px;font-size:12px;color:#111827;margin-bottom:6px;justify-content:space-between}'
    + '._ua-detail-header._ua-detail-off{color:#d1d5db}'
    + '._ua-detail-page{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#6b7280;padding:3px 0 3px 20px}'
    + '._ua-detail-page._ua-detail-off{color:#d1d5db}'
    + '._ua-check-on{color:#10b981;display:flex;align-items:center}'
    + '._ua-check-off{color:#e5e7eb;display:flex;align-items:center}'
    // Toggle switches for per-user permissions
    + '._ua-perm-toggle{position:relative;display:inline-block;width:32px;height:18px;cursor:pointer;flex-shrink:0}'
    + '._ua-perm-toggle input{opacity:0;width:0;height:0;position:absolute}'
    + '._ua-perm-switch{position:absolute;inset:0;background:#e5e7eb;border-radius:18px;transition:all .25s}'
    + '._ua-perm-switch:before{content:"";position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;left:2px;top:2px;transition:transform .25s;box-shadow:0 1px 2px rgba(0,0,0,.15)}'
    + '._ua-perm-toggle input:checked + ._ua-perm-switch{background:#10b981}'
    + '._ua-perm-toggle input:checked + ._ua-perm-switch:before{transform:translateX(14px)}'
    + '._ua-save-perms{margin-top:12px;text-align:right}'
  document.head.appendChild(s)
}

// ── Staff list + filter state ───────────────────────────────────
let _staff = []
let _invites = []
let _filter = 'all'
let _permOverrides = {} // module|page|role → boolean
let _expandedUser = null // user id com detalhes expandidos

// ── Calcula modulos acessiveis por role ─────────────────────────
const MODULE_ICONS = {
  dashboard: 'grid', 'captacao-fullface': 'star', 'captacao-protocolos': 'activity',
  agenda: 'calendar', patients: 'heart', whatsapp: 'message-circle',
  growth: 'trending-up', 'app-rejuvenescimento': 'zap', financeiro: 'dollar-sign',
  ferramentas: 'tool', mira: 'cpu', settings: 'settings',
}

function _getModulesForRole(role) {
  var nav = window.NAV_CONFIG || []
  var modules = []
  nav.forEach(function (section) {
    var sRoles = section.roles || []
    // Check override first
    var overKey = section.section + '||' + role
    var allowed = overKey in _permOverrides ? _permOverrides[overKey]
      : (sRoles.length === 0 || sRoles.indexOf(role) >= 0)
    modules.push({
      id: section.section,
      label: section.label,
      icon: MODULE_ICONS[section.section] || 'folder',
      allowed: allowed,
      pages: (section.pages || []).map(function (p) {
        var pRoles = p.roles || sRoles
        var pKey = section.section + '|' + p.page + '|' + role
        var sKey = section.section + '||' + role
        var pAllowed = pKey in _permOverrides ? _permOverrides[pKey]
          : sKey in _permOverrides ? _permOverrides[sKey]
          : (pRoles.length === 0 || pRoles.indexOf(role) >= 0)
        return { id: p.page, label: p.label, allowed: pAllowed }
      })
    })
  })
  return modules
}

function _renderModuleAccess(role, userId) {
  var nav = window.NAV_CONFIG || []
  var userPerms = _userPermsCache[userId] || {}
  var html = '<div class="_ua-access-grid">'
  nav.forEach(function (section) {
    if (section.section === 'settings') return
    var allowed = _getEffectiveForUser(section.section, null, role, userPerms)
    var icon = MODULE_ICONS[section.section] || 'folder'
    var cls = allowed ? '_ua-access-item _ua-access-on' : '_ua-access-item _ua-access-off'
    html += '<div class="' + cls + '" title="' + _esc(section.label) + '">' + _feather(icon, 12) + ' ' + _esc(section.label) + '</div>'
  })
  html += '</div>'
  return html
}

// userPerms: { "module|page": true/false } overrides for this specific user
let _userPermsCache = {} // userId → { "module|page": bool }

async function _loadUserPerms(userId) {
  if (_userPermsCache[userId]) return _userPermsCache[userId]
  try {
    var r = await _sb().rpc('get_user_permissions', { p_user_id: userId })
    var perms = {}
    if (r.data && r.data.permissions) {
      r.data.permissions.forEach(p => { perms[p.module_id + '|' + (p.page_id || '')] = p.allowed })
    }
    _userPermsCache[userId] = perms
    return perms
  } catch (e) { return {} }
}

function _getEffectiveForUser(moduleId, pageId, role, userPerms) {
  // Owner bypass inegociavel — Mirian (dona) sempre scope=full em TUDO.
  // Ver feedback/project_clinic_mirian_full_access — nenhum override pode limitar owner.
  if (role === 'owner') return true
  var uKey = moduleId + '|' + (pageId || '')
  if (uKey in userPerms) return userPerms[uKey]
  // Section-level user override
  if (pageId) {
    var uSectionKey = moduleId + '|'
    if (uSectionKey in userPerms) return userPerms[uSectionKey]
  }
  // Role-level override
  var rKey = moduleId + '|' + (pageId || '') + '|' + role
  if (rKey in _permOverrides) return _permOverrides[rKey]
  if (pageId) {
    var rSectionKey = moduleId + '||' + role
    if (rSectionKey in _permOverrides) return _permOverrides[rSectionKey]
  }
  // Default from nav-config
  var nav = window.NAV_CONFIG || []
  var section = nav.find(s => s.section === moduleId)
  if (!section) return true
  if (pageId) {
    var page = section.pages.find(p => p.page === pageId)
    var pRoles = (page && page.roles) || section.roles || []
    return pRoles.length === 0 || pRoles.indexOf(role) >= 0
  }
  var sRoles = section.roles || []
  return sRoles.length === 0 || sRoles.indexOf(role) >= 0
}

function _renderModuleDetail(role, userId, userPerms) {
  var nav = window.NAV_CONFIG || []
  var isOwner = role === 'owner'
  var html = '<div class="_ua-detail-grid">'
  nav.forEach(function (section) {
    if (section.section === 'settings') return
    var sAllowed = _getEffectiveForUser(section.section, null, role, userPerms)
    var icon = MODULE_ICONS[section.section] || 'folder'

    html += '<div class="_ua-detail-section">'
      + '<div class="_ua-detail-header">'
        + '<div style="display:flex;align-items:center;gap:6px">' + _feather(icon, 14) + ' <strong>' + _esc(section.label) + '</strong></div>'
        + (isOwner ? '<span class="_ua-check-on">' + _feather('check', 12) + '</span>'
          : '<label class="_ua-perm-toggle"><input type="checkbox" class="_ua-user-perm" data-uid="' + userId + '" data-module="' + section.section + '" data-page=""'
            + (sAllowed ? ' checked' : '') + '><span class="_ua-perm-switch"></span></label>')
      + '</div>'

    if (section.pages && section.pages.length > 1) {
      section.pages.forEach(function (p) {
        var pAllowed = _getEffectiveForUser(section.section, p.page, role, userPerms)
        html += '<div class="_ua-detail-page">'
          + '<span>' + _esc(p.label) + '</span>'
          + (isOwner ? '<span class="_ua-check-on">' + _feather('check', 10) + '</span>'
            : '<label class="_ua-perm-toggle"><input type="checkbox" class="_ua-user-perm" data-uid="' + userId + '" data-module="' + section.section + '" data-page="' + p.page + '"'
              + (pAllowed ? ' checked' : '') + '><span class="_ua-perm-switch"></span></label>')
          + '</div>'
      })
    }
    html += '</div>'
  })
  html += '</div>'
  if (!isOwner) {
    html += '<div class="_ua-save-perms"><button class="_ua-btn-gold _ua-save-user-perms" data-uid="' + userId + '" style="padding:7px 16px;font-size:12px">' + _feather('save', 13) + ' Salvar Permissoes</button></div>'
  }
  return html
}

// ── MAIN LOADER ─────────────────────────────────────────────────
async function loadUsersAdmin() {
  _injectStyles()
  const container = document.getElementById('usersAdminList')
  if (!container) return

  container.innerHTML = _skeletonRows(4)

  try {
    var results = await Promise.all([
      _sb().rpc('list_staff'),
      _sb().rpc('list_pending_invites'),
      _sb().rpc('get_module_permissions').then(r => r, () => ({ data: { permissions: [] } })),
    ])
    // Load permission overrides
    var permsData = (results[2].data && results[2].data.permissions) || []
    _permOverrides = {}
    permsData.forEach(p => { _permOverrides[p.module_id + '|' + (p.page_id || '') + '|' + p.role] = p.allowed })

    if (results[0].error) throw results[0].error
    if (!results[0].data?.ok) throw new Error(_errMsg(results[0].data?.error))
    _staff = results[0].data.staff || []

    if (results[1].data?.ok !== false) {
      _invites = Array.isArray(results[1].data) ? results[1].data : (results[1].data?.data || [])
    }

    _renderAll(container)
  } catch (e) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:#EF4444;font-size:13px;background:#FEF2F2;border-radius:10px">' + _esc(e.message) + '</div>'
  }
}
window.loadUsersAdmin = loadUsersAdmin

function _renderAll(container) {
  const myProfile = window.getCurrentProfile?.() || {}
  const active = _staff.filter(u => u.is_active)
  const inactive = _staff.filter(u => !u.is_active)

  // KPIs
  const roleCounts = {}
  active.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1 })

  const kpis = [
    { label: 'Total Ativos', value: active.length, icon: 'users', color: '#C9A96E' },
    { label: 'Especialistas', value: roleCounts.therapist || 0, icon: 'heart', color: '#10b981' },
    { label: 'Secretarias', value: roleCounts.receptionist || 0, icon: 'phone', color: '#3b82f6' },
    { label: 'Convites', value: _invites.length, icon: 'mail', color: '#f59e0b' },
  ]

  let html = '<div class="_ua-kpi-grid">'
  kpis.forEach((k, i) => {
    html += '<div class="_ua-kpi _ua-fade" style="animation-delay:' + (i * 50) + 'ms">'
      + '<div class="_ua-kpi-icon" style="background:' + k.color + '15;color:' + k.color + '">' + _feather(k.icon, 18) + '</div>'
      + '<div><div class="_ua-kpi-value">' + k.value + '</div><div class="_ua-kpi-label">' + k.label + '</div></div>'
      + '</div>'
  })
  html += '</div>'

  // Filter pills
  const filters = [
    { id: 'all', label: 'Todos (' + active.length + ')' },
    { id: 'admin', label: 'Admin' },
    { id: 'therapist', label: 'Especialistas' },
    { id: 'receptionist', label: 'Secretarias' },
    { id: 'viewer', label: 'Visualizadores' },
    { id: 'inactive', label: 'Inativos (' + inactive.length + ')' },
  ]
  html += '<div class="_ua-pills">'
  filters.forEach(f => {
    html += '<button class="_ua-pill' + (_filter === f.id ? ' _ua-pill-active' : '') + '" data-filter="' + f.id + '">' + f.label + '</button>'
  })
  html += '</div>'

  // Filtered list
  const filtered = _filter === 'all' ? active
    : _filter === 'inactive' ? inactive
    : active.filter(u => u.role === _filter)

  if (filtered.length === 0) {
    html += '<div class="_ua-empty">' + _feather('users', 24) + '<br>Nenhum membro encontrado</div>'
  } else {
    filtered.forEach((u, idx) => {
      const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.viewer
      const isSelf = u.id === myProfile.id
      const isOwner = u.role === 'owner'
      const canManage = !isSelf && !isOwner

      var isExpanded = _expandedUser === u.id
      html += '<div class="_ua-card-wrap _ua-fade" style="animation-delay:' + (idx * 40 + 200) + 'ms">'
        + '<div class="_ua-card">'
          + '<div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1">'
            + '<div class="_ua-avatar" style="background:' + rc.bg + ';color:' + rc.color + '">' + _initials(u.first_name, u.last_name) + '</div>'
            + '<div style="min-width:0">'
              + '<div class="_ua-name">'
                + (u.is_active ? '<span class="_ua-dot" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>' : '')
                + _esc(_fullName(u))
                + (isSelf ? ' <span style="background:#DBEAFE;color:#3b82f6;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;margin-left:4px">Voce</span>' : '')
                + (!u.is_active ? ' <span style="background:#FEE2E2;color:#DC2626;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;margin-left:4px">Inativo</span>' : '')
              + '</div>'
              + '<div class="_ua-email">' + _esc(u.email) + '</div>'
              + (u.professional
                  ? '<div style="margin-top:4px;display:inline-flex;align-items:center;gap:6px;background:#EDE9FE;color:#6D28D9;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600">'
                    + _feather('link', 11) + ' ' + _esc(u.professional.display_name)
                    + (canManage ? ' <button class="_ua-unlink" data-id="' + u.id + '" data-name="' + _esc(_fullName(u)) + '" data-prof="' + _esc(u.professional.display_name) + '" style="background:none;border:none;cursor:pointer;color:#6D28D9;padding:0;margin-left:2px;display:inline-flex;align-items:center" title="Desvincular profissional">' + _feather('x', 11) + '</button>' : '')
                  + '</div>'
                  : (canManage
                      ? '<button class="_ua-link" data-id="' + u.id + '" data-name="' + _esc(_fullName(u)) + '" style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;background:#F3F4F6;color:#6B7280;border:1px dashed #D1D5DB;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer">' + _feather('link', 11) + ' Vincular a profissional</button>'
                      : ''))
              + '<div class="_ua-module-chips" style="margin-top:6px">' + _renderModuleAccess(u.role, u.id) + '</div>'
            + '</div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap">'
            + '<span class="_ua-role-badge" style="color:' + rc.color + ';background:' + rc.bg + '">' + _feather(rc.icon, 12) + ' ' + rc.label + '</span>'
            + '<button class="_ua-btn-icon _ua-toggle-detail" data-id="' + u.id + '" title="Ver permissoes">' + _feather(isExpanded ? 'chevron-up' : 'chevron-down', 14) + '</button>'
            + (canManage ? ''
              + '<button class="_ua-btn-icon _ua-edit-role" data-id="' + u.id + '" data-role="' + u.role + '" data-name="' + _esc(_fullName(u)) + '" title="Alterar acesso">' + _feather('edit-2', 14) + '</button>'
              + (u.is_active
                ? '<button class="_ua-btn-icon _ua-btn-icon-danger _ua-deactivate" data-id="' + u.id + '" data-name="' + _esc(_fullName(u)) + '" title="Desativar">' + _feather('user-x', 14) + '</button>'
                : '<button class="_ua-btn-icon _ua-activate" data-id="' + u.id + '" data-name="' + _esc(_fullName(u)) + '" title="Reativar">' + _feather('user-check', 14) + '</button>')
             : '')
          + '</div>'
        + '</div>'
        + '<div class="_ua-detail-panel" id="_ua-detail-' + u.id + '" style="display:' + (isExpanded ? 'block' : 'none') + '"></div>'
        + '</div>'
    })
  }

  // Convites pendentes
  if (_invites.length > 0) {
    html += '<div class="_ua-section-title">' + _feather('mail', 15) + ' Convites Pendentes</div>'
    _invites.forEach((inv, idx) => {
      const rc = ROLE_CONFIG[inv.role] || ROLE_CONFIG.viewer
      const expired = inv.expires_at && new Date(inv.expires_at) < new Date()
      html += '<div class="_ua-card _ua-fade" style="animation-delay:' + (idx * 40 + 400) + 'ms">'
        + '<div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1">'
          + '<div class="_ua-avatar" style="background:' + rc.bg + ';color:' + rc.color + '">' + _feather('mail', 18) + '</div>'
          + '<div><div class="_ua-name">' + _esc(inv.email) + '</div>'
            + '<div class="_ua-email">' + (expired ? '<span class="_ua-expired">Expirado</span>' : '<span class="_ua-pending">Pendente</span>') + ' · enviado ' + _timeAgo(inv.created_at) + '</div>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px">'
          + '<span class="_ua-role-badge" style="color:' + rc.color + ';background:' + rc.bg + '">' + _feather(rc.icon, 12) + ' ' + rc.label + '</span>'
          + '<button class="_ua-btn-icon _ua-btn-icon-danger _ua-revoke" data-id="' + inv.id + '" data-email="' + _esc(inv.email) + '" title="Revogar">' + _feather('x', 14) + '</button>'
        + '</div>'
        + '</div>'
    })
  }

  container.innerHTML = html
  if (window.feather) feather.replace({ root: container })

  // Bind events
  container.querySelectorAll('._ua-pill').forEach(btn => {
    btn.addEventListener('click', () => { _filter = btn.dataset.filter; _renderAll(container) })
  })
  container.querySelectorAll('._ua-edit-role').forEach(btn => {
    btn.addEventListener('click', () => openChangeRoleModal(btn.dataset.id, btn.dataset.role, btn.dataset.name))
  })
  container.querySelectorAll('._ua-deactivate').forEach(btn => {
    btn.addEventListener('click', () => _confirmAction('deactivate', btn.dataset.id, btn.dataset.name))
  })
  container.querySelectorAll('._ua-activate').forEach(btn => {
    btn.addEventListener('click', () => _confirmAction('activate', btn.dataset.id, btn.dataset.name))
  })
  container.querySelectorAll('._ua-revoke').forEach(btn => {
    btn.addEventListener('click', () => _confirmAction('revoke', btn.dataset.id, btn.dataset.email))
  })
  container.querySelectorAll('._ua-link').forEach(btn => {
    btn.addEventListener('click', () => openLinkProfessionalModal(btn.dataset.id, btn.dataset.name))
  })
  container.querySelectorAll('._ua-unlink').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Desvincular ' + btn.dataset.name + ' do profissional "' + btn.dataset.prof + '"?')) return
      window.UsersRepository.unlinkFromProfessional(btn.dataset.id).then(r => {
        if (!r.ok) { _toast(_errMsg(r.error), 'error'); return }
        _toast('Vinculo removido', 'ok')
        loadUsersAdmin()
      })
    })
  })
  // Toggle detail panel (load user perms on first expand)
  container.querySelectorAll('._ua-toggle-detail').forEach(btn => {
    btn.addEventListener('click', async () => {
      var uid = btn.dataset.id
      var panel = document.getElementById('_ua-detail-' + uid)
      if (!panel) return
      if (_expandedUser === uid) {
        _expandedUser = null
        panel.style.display = 'none'
        _renderAll(container) // re-render to update chevron
        return
      }
      // Collapse any other
      _expandedUser = uid
      // Find user role
      var user = _staff.find(u => u.id === uid)
      if (!user) return
      panel.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">Carregando permissoes...</div>'
      panel.style.display = 'block'
      // Load user-specific permissions
      var userPerms = await _loadUserPerms(uid)
      panel.innerHTML = _renderModuleDetail(user.role, uid, userPerms)
      if (window.feather) feather.replace({ root: panel })
      // Bind save button
      panel.querySelectorAll('._ua-save-user-perms').forEach(saveBtn => {
        saveBtn.addEventListener('click', async () => {
          var toggles = panel.querySelectorAll('._ua-user-perm')
          var batch = []
          toggles.forEach(t => {
            batch.push({ module_id: t.dataset.module, page_id: t.dataset.page || null, allowed: t.checked })
          })
          saveBtn.disabled = true
          saveBtn.innerHTML = _feather('loader', 13) + ' Salvando...'
          try {
            var r = await _sb().rpc('set_user_permissions', { p_user_id: uid, p_permissions: batch })
            if (r.error) throw new Error(r.error.message)
            if (r.data && !r.data.ok) throw new Error(r.data.error)
            _userPermsCache[uid] = null // invalidate cache
            _toast('Permissoes de ' + _fullName(user) + ' salvas!', 'ok')
            // Reload to update chips
            var freshPerms = await _loadUserPerms(uid)
            panel.innerHTML = _renderModuleDetail(user.role, uid, freshPerms)
            if (window.feather) feather.replace({ root: panel })
          } catch (e) {
            _toast('Erro: ' + e.message, 'error')
            saveBtn.disabled = false
            saveBtn.textContent = 'Salvar Permissoes'
          }
        })
      })
      _renderAll(container) // re-render to update chevron
    })
  })
}

// ── INVITE MODAL ────────────────────────────────────────────────
// ── LINK USER TO PROFESSIONAL MODAL ────────────────────────────
async function openLinkProfessionalModal(userId, userName) {
  const modal = _createModal('linkProfModal', ''
    + '<div style="padding:22px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;justify-content:space-between">'
      + '<div><h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Vincular a Profissional</h3><p style="margin:3px 0 0;font-size:12px;color:#6b7280">Usuario: <strong>' + _esc(userName) + '</strong></p></div>'
      + '<button onclick="_closeModal(\'linkProfModal\')" class="_ua-btn-icon">' + _feather('x', 18) + '</button>'
    + '</div>'
    + '<div style="padding:24px;max-height:70vh;overflow-y:auto">'
      + '<div id="_linkProfErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:14px"></div>'
      + '<div id="_linkProfList" style="display:flex;flex-direction:column;gap:8px">'
        + '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">Carregando profissionais...</div>'
      + '</div>'
    + '</div>'
    + '<div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end">'
      + '<button onclick="_closeModal(\'linkProfModal\')" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">Fechar</button>'
    + '</div>')

  const r = await window.UsersRepository.listUnlinkedProfessionals()
  const listEl = document.getElementById('_linkProfList')
  if (!listEl) return
  if (!r.ok) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#DC2626;font-size:12px">Erro: ' + _esc(_errMsg(r.error)) + '</div>'
    return
  }
  const profs = Array.isArray(r.data) ? r.data : []
  if (!profs.length) {
    listEl.innerHTML = '<div style="padding:28px;text-align:center;color:#6b7280;font-size:13px">'
      + _feather('users', 22) + '<br><br><strong>Sem profissionais disponiveis.</strong><br>Todos os profissionais ja tem usuario vinculado ou nenhum foi cadastrado em Equipe.</div>'
    if (window.feather) feather.replace({ root: listEl })
    return
  }
  listEl.innerHTML = profs.map(p => ''
    + '<button class="_link-pick-prof" data-prof-id="' + p.id + '" data-name="' + _esc(p.display_name) + '" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;text-align:left;cursor:pointer;transition:all .15s">'
      + '<div style="min-width:0">'
        + '<div style="font-size:13px;font-weight:700;color:#111">' + _esc(p.display_name) + '</div>'
        + '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + _esc(p.specialty || p.nivel || '—') + (p.email ? ' · ' + _esc(p.email) : '') + '</div>'
      + '</div>'
      + '<span style="color:#7C3AED;font-size:12px;font-weight:600">Vincular ' + _feather('chevron-right', 12) + '</span>'
    + '</button>').join('')
  if (window.feather) feather.replace({ root: listEl })

  listEl.querySelectorAll('._link-pick-prof').forEach(btn => {
    btn.addEventListener('click', async () => {
      const errEl = document.getElementById('_linkProfErr')
      if (errEl) errEl.style.display = 'none'
      btn.disabled = true
      btn.style.opacity = '0.6'
      const res = await window.UsersRepository.linkToProfessional(userId, btn.dataset.profId)
      if (!res.ok) {
        if (errEl) { errEl.textContent = _errMsg(res.error); errEl.style.display = 'block' }
        btn.disabled = false; btn.style.opacity = '1'
        return
      }
      _toast('Usuario vinculado a ' + btn.dataset.name, 'ok')
      _closeModal('linkProfModal')
      loadUsersAdmin()
    })
  })
}
window.openLinkProfessionalModal = openLinkProfessionalModal

function openInviteModal() {
  const canInviteAdmin = window.PermissionsService?.isAtLeast('owner') ?? false
  const roleOpts = Object.entries(ROLE_CONFIG)
    .filter(([r]) => r !== 'owner' && (canInviteAdmin || r !== 'admin'))
    .map(([r, cfg]) => '<option value="' + r + '">' + _esc(cfg.label) + ' — ' + cfg.desc + '</option>')
    .join('')

  const modal = _createModal('inviteModal', ''
    + '<div style="padding:22px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;justify-content:space-between">'
      + '<div><h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Convidar Membro</h3><p style="margin:3px 0 0;font-size:12px;color:#6b7280">O convite expira em 48h. Permissoes ja aplicadas ao aceitar.</p></div>'
      + '<button onclick="_closeModal(\'inviteModal\')" class="_ua-btn-icon">' + _feather('x', 18) + '</button>'
    + '</div>'
    + '<div style="padding:24px;display:flex;flex-direction:column;gap:16px;max-height:70vh;overflow-y:auto">'
      + '<div id="_inviteErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:10px;font-size:13px"></div>'
      + '<div id="_inviteOk" style="display:none;background:#D1FAE5;color:#059669;padding:14px;border-radius:10px;font-size:13px;line-height:1.6"></div>'
      + '<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Email</label>'
        + '<input id="_inviteEmail" type="email" placeholder="colaborador@clinica.com" class="_ua-input"></div>'
      + '<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Nivel de acesso</label>'
        + '<select id="_inviteRole" class="_ua-input">' + roleOpts + '</select></div>'
      + '<div id="_invRoleDesc"></div>'
      + '<div>'
        + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">' + _feather('lock', 13) + ' Permissoes de Modulos</label>'
        + '<div id="_invModulePerms" style="background:#fafafa;border:1px solid #f3f4f6;border-radius:10px;padding:12px"></div>'
      + '</div>'
    + '</div>'
    + '<div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end">'
      + '<button onclick="_closeModal(\'inviteModal\')" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>'
      + '<button id="_inviteSubmitBtn" class="_ua-btn-gold">Enviar Convite</button>'
    + '</div>')

  // Role description + module toggles
  function updateRoleUI() {
    var sel = document.getElementById('_inviteRole')
    var desc = document.getElementById('_invRoleDesc')
    var permsEl = document.getElementById('_invModulePerms')
    if (!sel) return
    var role = sel.value
    var rc = ROLE_CONFIG[role] || {}

    // Desc
    if (desc) {
      desc.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:' + (rc.bg || '#f3f4f6') + ';border-radius:10px;font-size:12px;color:' + (rc.color || '#6b7280') + ';font-weight:600">' + _feather(rc.icon || 'info', 14) + ' ' + (rc.desc || '') + '</div>'
      if (window.feather) feather.replace({ root: desc })
    }

    // Module toggles based on role defaults
    if (permsEl) {
      var nav = window.NAV_CONFIG || []
      var html = ''
      nav.forEach(function (section) {
        if (section.section === 'settings') return
        var sRoles = section.roles || []
        var defaultOn = sRoles.length === 0 || sRoles.indexOf(role) >= 0
        var icon = MODULE_ICONS[section.section] || 'folder'
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 4px;border-bottom:1px solid #f3f4f6">'
          + '<div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#374151">' + _feather(icon, 14) + ' ' + _esc(section.label) + '</div>'
          + '<label class="_ua-perm-toggle"><input type="checkbox" class="_inv-module-perm" data-module="' + section.section + '"' + (defaultOn ? ' checked' : '') + '><span class="_ua-perm-switch"></span></label>'
          + '</div>'
      })
      permsEl.innerHTML = html
      if (window.feather) feather.replace({ root: permsEl })
    }
  }
  updateRoleUI()
  document.getElementById('_inviteRole')?.addEventListener('change', updateRoleUI)
  document.getElementById('_inviteEmail')?.focus()

  document.getElementById('_inviteSubmitBtn')?.addEventListener('click', async () => {
    const email = (document.getElementById('_inviteEmail')?.value || '').trim().toLowerCase()
    const role = document.getElementById('_inviteRole')?.value || ''
    const errEl = document.getElementById('_inviteErr')
    const okEl = document.getElementById('_inviteOk')
    const btn = document.getElementById('_inviteSubmitBtn')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (errEl) { errEl.textContent = 'Email invalido'; errEl.style.display = 'block' }; return }
    if (errEl) errEl.style.display = 'none'
    if (okEl) okEl.style.display = 'none'
    if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Enviando...' }

    // Collect module permissions from toggles
    const modulePerms = []
    document.querySelectorAll('._inv-module-perm').forEach(cb => {
      modulePerms.push({ module_id: cb.dataset.module, page_id: null, allowed: cb.checked })
    })

    try {
      const { data, error } = await _sb().rpc('invite_staff', { p_email: email, p_role: role, p_permissions: modulePerms })
      if (error) throw error
      if (!data?.ok) throw new Error(_errMsg(data?.error))

      const joinUrl = window.location.origin + '/join.html?token=' + data.raw_token
      if (okEl) {
        okEl.innerHTML = '<strong>Convite gerado!</strong> Envie o link para <strong>' + _esc(data.email) + '</strong>:<br>'
          + '<div style="background:#fff;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;margin:8px 0;word-break:break-all;font-size:11px;font-family:monospace">' + _esc(joinUrl) + '</div>'
          + '<button id="_copyInvBtn" class="_ua-btn-gold" style="padding:6px 14px;font-size:12px">' + _feather('copy', 12) + ' Copiar link</button>'
          + ' <span style="font-size:11px;color:#6B7280;margin-left:8px">Valido por 48h</span>'
        okEl.style.display = 'block'
        setTimeout(() => {
          document.getElementById('_copyInvBtn')?.addEventListener('click', function () {
            navigator.clipboard.writeText(joinUrl).then(() => { this.textContent = 'Copiado!' })
          })
          if (window.feather) feather.replace({ root: okEl })
        }, 50)
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar outro convite' }
      setTimeout(() => loadUsersAdmin(), 600)
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block' }
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar Convite' }
    }
  })
}
window.openInviteModal = openInviteModal

// ── CHANGE ROLE MODAL ───────────────────────────────────────────
function openChangeRoleModal(userId, currentRole, name) {
  const canInviteAdmin = window.PermissionsService?.isAtLeast('owner') ?? false
  const roleCards = Object.entries(ROLE_CONFIG)
    .filter(([r]) => r !== 'owner' && (canInviteAdmin || r !== 'admin'))
    .map(([r, cfg]) => ''
      + '<label class="_ua-role-opt' + (r === currentRole ? ' _ua-role-opt-active' : '') + '">'
        + '<input type="radio" name="_newRole" value="' + r + '"' + (r === currentRole ? ' checked' : '') + ' style="accent-color:#C9A96E;width:18px;height:18px;margin-top:2px;flex-shrink:0">'
        + '<div style="flex:1">'
          + '<div style="display:flex;align-items:center;gap:8px"><span style="color:' + cfg.color + '">' + _feather(cfg.icon, 16) + '</span><strong>' + cfg.label + '</strong></div>'
          + '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + cfg.desc + '</div>'
        + '</div>'
      + '</label>'
    ).join('')

  const modal = _createModal('changeRoleModal', ''
    + '<div style="padding:22px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;justify-content:space-between">'
      + '<div><h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Alterar Acesso</h3><p style="margin:3px 0 0;font-size:12px;color:#6b7280">' + _esc(name) + '</p></div>'
      + '<button onclick="_closeModal(\'changeRoleModal\')" class="_ua-btn-icon">' + _feather('x', 18) + '</button>'
    + '</div>'
    + '<div style="padding:24px;display:flex;flex-direction:column;gap:8px">' + roleCards + '</div>'
    + '<div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end">'
      + '<button onclick="_closeModal(\'changeRoleModal\')" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>'
      + '<button id="_changeRoleSaveBtn" class="_ua-btn-gold">Salvar</button>'
    + '</div>')

  // Highlight on change
  modal.querySelectorAll('._ua-role-opt input').forEach(inp => {
    inp.addEventListener('change', () => {
      modal.querySelectorAll('._ua-role-opt').forEach(o => o.classList.remove('_ua-role-opt-active'))
      inp.closest('._ua-role-opt').classList.add('_ua-role-opt-active')
    })
  })

  modal.querySelector('#_changeRoleSaveBtn').addEventListener('click', async () => {
    const newRole = modal.querySelector('input[name="_newRole"]:checked')?.value
    if (!newRole || newRole === currentRole) { _closeModal('changeRoleModal'); return }
    const btn = modal.querySelector('#_changeRoleSaveBtn')
    if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Salvando...' }
    try {
      const { data, error } = await _sb().rpc('update_staff_role', { p_user_id: userId, p_new_role: newRole })
      if (error) throw error
      if (!data?.ok) throw new Error(_errMsg(data?.error))
      _closeModal('changeRoleModal')
      _toast('Acesso alterado!', 'ok')
      loadUsersAdmin()
    } catch (e) {
      _toast('Erro: ' + e.message, 'error')
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar' }
    }
  })
}
window.openChangeRoleModal = openChangeRoleModal

// ── CONFIRM ACTION (deactivate, activate, revoke) ───────────────
function _confirmAction(action, id, nameOrEmail) {
  const config = {
    deactivate: { title: 'Desativar Membro', desc: 'Remover acesso de <strong>' + _esc(nameOrEmail) + '</strong> ao sistema?', icon: 'user-x', btn: 'Desativar', cls: '_ua-btn-danger' },
    activate:   { title: 'Reativar Membro',  desc: 'Restaurar acesso de <strong>' + _esc(nameOrEmail) + '</strong>?', icon: 'user-check', btn: 'Reativar', cls: '_ua-btn-gold' },
    revoke:     { title: 'Revogar Convite',   desc: 'Cancelar convite para <strong>' + _esc(nameOrEmail) + '</strong>?', icon: 'x-circle', btn: 'Revogar', cls: '_ua-btn-danger' },
  }[action]

  const modal = _createModal('confirmActionModal', ''
    + '<div style="padding:32px;text-align:center">'
      + '<div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#FEE2E2,#FECACA);display:inline-flex;align-items:center;justify-content:center;color:#DC2626">' + _feather(config.icon, 28) + '</div>'
      + '<h3 style="margin:16px 0 8px;font-size:18px;font-weight:700;color:#111827">' + config.title + '</h3>'
      + '<p style="margin:0;font-size:13px;color:#6b7280">' + config.desc + '</p>'
    + '</div>'
    + '<div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:center">'
      + '<button onclick="_closeModal(\'confirmActionModal\')" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>'
      + '<button id="_confirmBtn" class="' + config.cls + '">' + config.btn + '</button>'
    + '</div>')

  modal.querySelector('#_confirmBtn')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#_confirmBtn')
    if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' ...' }
    try {
      const rpc = action === 'deactivate' ? 'deactivate_staff' : action === 'activate' ? 'activate_staff' : 'revoke_invite'
      const param = action === 'revoke' ? { p_invite_id: id } : { p_user_id: id }
      const { data, error } = await _sb().rpc(rpc, param)
      if (error) throw error
      if (!data?.ok) throw new Error(_errMsg(data?.error))
      _closeModal('confirmActionModal')
      _toast(config.title + ' concluido!', 'ok')
      loadUsersAdmin()
    } catch (e) {
      _toast('Erro: ' + e.message, 'error')
      if (btn) { btn.disabled = false; btn.textContent = config.btn }
    }
  })
}

// ── PENDING INVITES (standalone call) ───────────────────────────
async function loadPendingInvites() {
  // Integrado no loadUsersAdmin — este e chamado separadamente para refresh
  loadUsersAdmin()
}
window.loadPendingInvites = loadPendingInvites

// ── EDIT PROFILE MODAL ──────────────────────────────────────────
function openEditProfileModal() {
  const profile = window.getCurrentProfile?.() || {}
  const modal = _createModal('editProfileModal', ''
    + '<div style="padding:22px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;justify-content:space-between">'
      + '<div><h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Editar Perfil</h3></div>'
      + '<button onclick="_closeModal(\'editProfileModal\')" class="_ua-btn-icon">' + _feather('x', 18) + '</button>'
    + '</div>'
    + '<div style="padding:24px;display:flex;flex-direction:column;gap:16px">'
      + '<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Nome</label>'
        + '<input id="_editFirst" type="text" value="' + _esc(profile.first_name || '') + '" class="_ua-input"></div>'
      + '<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Sobrenome</label>'
        + '<input id="_editLast" type="text" value="' + _esc(profile.last_name || '') + '" class="_ua-input"></div>'
    + '</div>'
    + '<div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end">'
      + '<button onclick="_closeModal(\'editProfileModal\')" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>'
      + '<button id="_editSaveBtn" class="_ua-btn-gold">Salvar</button>'
    + '</div>')

  document.getElementById('_editFirst')?.focus()
  modal.querySelector('#_editSaveBtn')?.addEventListener('click', async () => {
    const firstName = (document.getElementById('_editFirst')?.value || '').trim()
    const lastName = (document.getElementById('_editLast')?.value || '').trim()
    if (!firstName) { _toast('Informe seu nome', 'warn'); return }
    const btn = modal.querySelector('#_editSaveBtn')
    if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Salvando...' }
    try {
      const { error } = await _sb().from('profiles').update({ first_name: firstName, last_name: lastName }).eq('id', profile.id)
      if (error) throw error
      const updated = { ...profile, first_name: firstName, last_name: lastName }
      sessionStorage.setItem('clinicai_profile', JSON.stringify(updated))
      _closeModal('editProfileModal')
      _toast('Perfil atualizado!', 'ok')
      window._updateSidebarUser?.(updated)
    } catch (e) {
      _toast('Erro: ' + e.message, 'error')
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar' }
    }
  })
}
window.openEditProfileModal = openEditProfileModal

// ── MY PROFILE MODAL ────────────────────────────────────────────
function showMyProfileModal() {
  const profile = window.getCurrentProfile?.() || {}
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || 'Usuario'
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const rc = ROLE_CONFIG[profile.role] || ROLE_CONFIG.viewer

  _createModal('_myProfileModal', ''
    + '<div style="background:linear-gradient(135deg,#C9A96E,#a8894f);padding:32px;text-align:center;position:relative">'
      + '<button onclick="_closeModal(\'_myProfileModal\')" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,.18);border:none;border-radius:50%;width:30px;height:30px;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center">' + _feather('x', 14) + '</button>'
      + '<div style="width:68px;height:68px;background:rgba(255,255,255,.22);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;margin-bottom:12px">' + _esc(initials) + '</div>'
      + '<div style="font-size:17px;font-weight:700;color:#fff">' + _esc(name) + '</div>'
      + '<div style="margin-top:6px"><span class="_ua-role-badge" style="color:#fff;background:rgba(255,255,255,.2)">' + _feather(rc.icon, 12) + ' ' + rc.label + '</span></div>'
    + '</div>'
    + '<div style="padding:22px 24px">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">'
        + '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Email</div><div style="font-size:13px;color:#111;font-weight:500;word-break:break-all">' + _esc(profile.email || '') + '</div></div>'
        + '<div><div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Acesso</div><div style="font-size:13px;color:#111;font-weight:500">' + _esc(rc.label) + '</div></div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px">'
        + '<button onclick="_closeModal(\'_myProfileModal\');openEditProfileModal()" style="width:100%;padding:10px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">' + _feather('edit-2', 14) + ' Editar Nome</button>'
        + '<button onclick="_closeModal(\'_myProfileModal\');showChangePasswordModal()" style="width:100%;padding:10px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">' + _feather('lock', 14) + ' Alterar Senha</button>'
      + '</div>'
    + '</div>')
}
window.showMyProfileModal = showMyProfileModal

// ── CHANGE PASSWORD MODAL ───────────────────────────────────────
function showChangePasswordModal() {
  _createModal('_changePwModal', ''
    + '<div style="padding:22px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between">'
      + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Alterar Senha</h3>'
      + '<button onclick="_closeModal(\'_changePwModal\')" class="_ua-btn-icon">' + _feather('x', 18) + '</button>'
    + '</div>'
    + '<div style="padding:24px;display:flex;flex-direction:column;gap:14px">'
      + '<div id="_cpwErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:10px;font-size:13px"></div>'
      + '<div id="_cpwOk" style="display:none;background:#D1FAE5;color:#059669;padding:10px 14px;border-radius:10px;font-size:13px"></div>'
      + '<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Senha Atual</label><input id="_cpwCurrent" type="password" placeholder="••••••" class="_ua-input"></div>'
      + '<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Nova Senha</label><input id="_cpwNew" type="password" placeholder="Minimo 6 caracteres" class="_ua-input"></div>'
      + '<div><label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Confirmar</label><input id="_cpwConfirm" type="password" placeholder="Repita a nova senha" class="_ua-input"></div>'
    + '</div>'
    + '<div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:8px;justify-content:flex-end">'
      + '<button onclick="_closeModal(\'_changePwModal\')" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>'
      + '<button id="_cpwBtn" class="_ua-btn-gold">Salvar Nova Senha</button>'
    + '</div>')

  document.getElementById('_cpwBtn')?.addEventListener('click', doChangePassword)
}
window.showChangePasswordModal = showChangePasswordModal

async function doChangePassword() {
  const current = document.getElementById('_cpwCurrent')?.value?.trim()
  const newPw = document.getElementById('_cpwNew')?.value?.trim()
  const confirm = document.getElementById('_cpwConfirm')?.value?.trim()
  const errEl = document.getElementById('_cpwErr')
  const okEl = document.getElementById('_cpwOk')
  const btn = document.getElementById('_cpwBtn')
  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block' }; if (okEl) okEl.style.display = 'none' }

  if (!current || !newPw || !confirm) { showErr('Preencha todos os campos'); return }
  if (newPw.length < 6) { showErr('Nova senha deve ter pelo menos 6 caracteres'); return }
  if (newPw !== confirm) { showErr('As senhas nao coincidem'); return }

  if (btn) { btn.disabled = true; btn.innerHTML = _feather('loader', 14) + ' Salvando...' }
  if (errEl) errEl.style.display = 'none'

  try {
    const profile = window.getCurrentProfile?.() || {}
    const { error: signInErr } = await _sb().auth.signInWithPassword({ email: profile.email, password: current })
    if (signInErr) { showErr('Senha atual incorreta'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar Nova Senha' }; return }
    const { error: updateErr } = await _sb().auth.updateUser({ password: newPw })
    if (updateErr) throw updateErr
    if (okEl) { okEl.textContent = 'Senha alterada com sucesso!'; okEl.style.display = 'block' }
    setTimeout(() => _closeModal('_changePwModal'), 1600)
  } catch (e) {
    showErr(e.message || 'Erro ao alterar senha')
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar Nova Senha' }
  }
}
window.doChangePassword = doChangePassword

function togglePassVis(inputId, eyeId) {
  const input = document.getElementById(inputId)
  if (!input) return
  input.type = input.type === 'password' ? 'text' : 'password'
}
window.togglePassVis = togglePassVis

// ── SKELETON ────────────────────────────────────────────────────
function _skeletonRows(n) {
  _injectStyles()
  let html = '<div class="_ua-kpi-grid">'
  for (let i = 0; i < 4; i++) html += '<div class="_ua-kpi"><div class="_ua-skeleton" style="width:36px;height:36px"></div><div><div class="_ua-skeleton" style="width:40px;height:22px;margin-bottom:4px"></div><div class="_ua-skeleton" style="width:60px;height:10px"></div></div></div>'
  html += '</div>'
  for (let i = 0; i < n; i++) {
    html += '<div class="_ua-card"><div style="display:flex;align-items:center;gap:14px"><div class="_ua-skeleton" style="width:44px;height:44px;border-radius:12px"></div><div><div class="_ua-skeleton" style="width:140px;height:14px;margin-bottom:6px"></div><div class="_ua-skeleton" style="width:180px;height:11px"></div></div></div></div>'
  }
  return html
}

// Expose _closeModal globally for inline onclick handlers
window._closeModal = _closeModal

})()
