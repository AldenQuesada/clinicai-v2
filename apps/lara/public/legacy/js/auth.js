/**
 * ClinicAI — Auth Layer (Supabase Auth)
 *
 * Funções globais exportadas:
 *   requireAuth()        — guard para páginas protegidas (chama no DOMContentLoaded)
 *   doLogout()           — logout + redirect para login.html
 *   doLogin()            — chamado pelo formulário de login (legado, não usado em login.html)
 *   getCurrentProfile()  — retorna perfil cacheado { id, email, role, first_name, last_name }
 *   showLoginModal()     — redirect para login.html (compat. com código legado)
 *   getToken()           — access_token do JWT atual (para headers de API)
 *   isLoggedIn()         — true se há sessão ativa
 *   apiFetch()           — fetch autenticado (compat. com código legado)
 */

;(function () {
'use strict'

// Config (lê de window.ClinicEnv — centralizado em js/config/env.js)
const _env = window.ClinicEnv || {}
const SUPABASE_URL = _env.SUPABASE_URL || ''
const SUPABASE_KEY = _env.SUPABASE_KEY || ''

const PROFILE_KEY = 'clinicai_profile'

// ── Supabase client singleton para auth ──────────────────────
// Reutiliza window._sbShared (exposto por supabase.js) para evitar
// múltiplas instâncias GoTrueClient no mesmo contexto do browser.
let _sb = null
function _getClient() {
  if (!_sb) {
    _sb = window._sbShared
         || (window.supabase?.createClient
             ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
             : null)
  }
  return _sb
}

// ── Perfil (cache em sessionStorage) ─────────────────────────
function getCurrentProfile() {
  try { return JSON.parse(sessionStorage.getItem(PROFILE_KEY) || 'null') } catch { return null }
}

async function _loadProfile() {
  try {
    const cached = getCurrentProfile()
    if (cached) return cached

    const { data, error } = await _getClient().rpc('get_my_profile')
    if (error || !data || !data.ok) {
      console.warn('[auth] get_my_profile:', error || data)
      return null
    }
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(data))
    return data
  } catch (e) {
    console.warn('[auth] _loadProfile failed:', e)
    return null
  }
}

// ── Labels de role ────────────────────────────────────────────
const ROLE_LABELS = {
  owner:         'Proprietário',
  admin:         'Administrador',
  therapist:     'Terapeuta',
  receptionist:  'Recepcionista',
  viewer:        'Visualizador',
}

// ── Atualiza sidebar footer E header com dados do usuário ──────
window._updateSidebarUser = _updateSidebarUser
function _updateSidebarUser(profile, _retry) {
  if (!profile) return

  const first     = (profile.first_name || '').trim()
  const last      = (profile.last_name  || '').trim()
  const initials  = ((first[0] || '') + (last[0] || '')).toUpperCase()
                 || (profile.email || 'U')[0].toUpperCase()
  const name      = [first, last].filter(Boolean).join(' ') || profile.email || ''
  const roleLabel = ROLE_LABELS[profile.role] || profile.role || ''

  const avatarEl = document.getElementById('sidebarClinicAvatar')

  // Se sidebar ainda não está no DOM, tenta novamente após 300ms (máx 3x)
  if (!avatarEl && (_retry || 0) < 3) {
    setTimeout(() => _updateSidebarUser(profile, (_retry || 0) + 1), 300)
    return
  }

  // ── Sidebar footer ────────────────────────────────────────────
  if (avatarEl) avatarEl.textContent = initials
  const nameEl = document.getElementById('sidebarClinicName')
  const planEl = document.getElementById('sidebarClinicPlan')
  if (nameEl) nameEl.textContent = name
  if (planEl) planEl.textContent = roleLabel

  // ── Header (avatar + nome do usuário logado) ──────────────────
  const headerAvatar   = document.getElementById('headerAvatarInitials')
  const headerAvatarLg = document.getElementById('headerAvatarInitialsLg')
  const headerName     = document.getElementById('headerUserName')
  const headerNameLg   = document.getElementById('headerUserNameLg')
  const headerEmail    = document.getElementById('headerUserEmail')
  const headerRole     = document.getElementById('headerUserRole')

  if (headerAvatar)   headerAvatar.textContent   = initials
  if (headerAvatarLg) headerAvatarLg.textContent = initials
  if (headerName)     headerName.textContent     = name
  if (headerNameLg)   headerNameLg.textContent   = name
  if (headerEmail)    headerEmail.textContent     = profile.email || ''
  if (headerRole)     headerRole.textContent      = roleLabel
}

// ── Clinic ID — resolve do perfil autenticado, fallback legacy ───
const CLINIC_ID = (function() { try { var p = JSON.parse(sessionStorage.getItem('clinicai_profile') || 'null'); if (p && p.clinic_id) return p.clinic_id } catch(e) {} return '00000000-0000-0000-0000-000000000001' })()

// ── Setup modal: criação de perfil owner (primeiro acesso) ────
async function _showOwnerSetup() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.id = 'ownerSetupOverlay'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px'
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:40px;width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,0.3)">
        <div style="text-align:center;margin-bottom:28px">
          <div style="width:52px;height:52px;background:linear-gradient(135deg,#7C3AED,#5B21B6);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px">
            <svg width="24" height="24" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <h2 style="font-size:18px;font-weight:700;color:#111;margin-bottom:6px">Configurar sua conta</h2>
          <p style="font-size:13px;color:#6B7280">Primeiro acesso — configure seu perfil de proprietário</p>
        </div>
        <div id="ownerSetupErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;text-align:center"></div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">Nome</label>
          <input id="ownerFirstName" type="text" placeholder="Ex: Alden" style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none" />
        </div>
        <div style="margin-bottom:24px">
          <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">Sobrenome</label>
          <input id="ownerLastName" type="text" placeholder="Ex: Silva" style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none" />
        </div>
        <button id="ownerSetupBtn" onclick="window._submitOwnerSetup()" style="width:100%;padding:12px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">Criar meu perfil</button>
      </div>`
    document.body.appendChild(overlay)

    window._submitOwnerSetup = async function () {
      const firstName = (document.getElementById('ownerFirstName')?.value || '').trim()
      const lastName  = (document.getElementById('ownerLastName')?.value || '').trim()
      const errEl     = document.getElementById('ownerSetupErr')
      const btn       = document.getElementById('ownerSetupBtn')

      if (!firstName) {
        if (errEl) { errEl.textContent = 'Informe seu nome'; errEl.style.display = 'block' }
        return
      }

      if (btn) { btn.disabled = true; btn.textContent = 'Criando...' }
      if (errEl) errEl.style.display = 'none'

      try {
        const { data, error } = await _getClient().rpc('create_owner_profile', {
          p_clinic_id:  CLINIC_ID,
          p_first_name: firstName,
          p_last_name:  lastName || '',
        })
        if (error) throw error
        if (!data?.ok) throw new Error(data?.error || 'Erro desconhecido')

        overlay.remove()
        delete window._submitOwnerSetup
        resolve({ first_name: firstName, last_name: lastName })
      } catch (e) {
        const msg = e.message === 'owner_already_exists'
          ? 'Já existe um proprietário cadastrado nesta clínica.'
          : e.message === 'already_has_profile'
          ? 'Sua conta já possui um perfil ativo.'
          : e.message || 'Erro ao criar perfil'
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block' }
        if (btn)   { btn.disabled = false; btn.textContent = 'Criar meu perfil' }
      }
    }
  })
}

// ── Guard principal ───────────────────────────────────────────
// Chame no início do DOMContentLoaded de qualquer página protegida.
// Redireciona para login.html se não há sessão válida.
async function requireAuth() {
  const client = _getClient()
  if (!client) {
    window.location.replace('login.html')
    return false
  }

  // getSession auto-renova o token se expirado (usa refresh token)
  const { data, error } = await client.auth.getSession()
  if (error || !data?.session) {
    window.location.replace('login.html')
    return false
  }

  // Sessão válida — carrega perfil
  let profile = await _loadProfile()

  // Primeiro acesso: sem perfil → setup owner
  if (!profile || profile.error === 'profile_not_found') {
    await _showOwnerSetup()
    sessionStorage.removeItem(PROFILE_KEY)
    await client.auth.refreshSession()
    profile = await _loadProfile()
  }

  _updateSidebarUser(profile)

  // Notifica módulos que dependem do perfil (ex: sidebar.js filtra por role)
  document.dispatchEvent(new CustomEvent('clinicai:auth-success', { detail: profile }))

  // Carrega configurações da clínica no contexto global (silencioso, não bloqueia boot)
  if (window.ClinicContext) {
    window.ClinicContext.load().catch(e =>
      console.warn('[ClinicContext] Falha silenciosa:', e.message)
    )
  }

  // Migração one-time: localStorage → Supabase (silenciosa, não bloqueia o boot)
  if (window.LocalMigrationService && !window.LocalMigrationService.hasMigrated()) {
    window.LocalMigrationService.run().catch(e =>
      console.warn('[Migration] Falha silenciosa:', e.message)
    )
  }

  return true
}
window.requireAuth = requireAuth

// ── Logout ────────────────────────────────────────────────────
async function doLogout() {
  if (!confirm('Deseja sair da conta?')) return
  sessionStorage.removeItem(PROFILE_KEY)
  await _getClient().auth.signOut()
  window.location.replace('login.html')
}
window.doLogout = doLogout

// ── Redirect para login (compat.) ─────────────────────────────
function showLoginModal() {
  window.location.replace('login.html')
}
window.showLoginModal = showLoginModal

// ── getToken: access_token do JWT (para headers de API REST) ──
function getToken() {
  try {
    // Supabase v2 armazena a sessão com chave sb-{ref}-auth-token
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!key) return null
    return JSON.parse(localStorage.getItem(key) || 'null')?.access_token || null
  } catch { return null }
}
window.getToken = getToken

function isLoggedIn() { return !!getToken() }
window.isLoggedIn = isLoggedIn

function clearToken() {
  sessionStorage.removeItem(PROFILE_KEY)
}
window.clearToken = clearToken

// ── apiFetch (compat. com módulos que ainda usam) ─────────────
const API_BASE = window.location.origin + '/api/v1'
async function apiFetch(path, options) {
  options = options || {}
  const token = getToken()
  const res = await fetch(API_BASE + path, Object.assign({}, options, {
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {},
      options.headers || {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined,
  }))
  if (res.status === 401) {
    throw new Error('Sessão expirada ou sem permissão')
  }
  return res.json()
}
window.apiFetch = apiFetch

// ── Recuperar senha via Supabase ──────────────────────────────
async function doForgotPassword() {
  const emailEl = document.getElementById('forgotEmail')
  const msgEl   = document.getElementById('forgotMsg')
  const errEl   = document.getElementById('forgotErr')
  const btn     = document.getElementById('forgotBtn')

  const email = emailEl ? emailEl.value.trim() : ''
  if (!email) {
    if (errEl) { errEl.textContent = 'Informe seu e-mail'; errEl.style.display = 'block' }
    return
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...' }

  try {
    const { error } = await _getClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html'
    })
    if (error) throw error
    if (msgEl) { msgEl.textContent = 'Instruções enviadas! Verifique seu e-mail.'; msgEl.style.display = 'block' }
    if (errEl) errEl.style.display = 'none'
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Erro ao enviar instruções'; errEl.style.display = 'block' }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar instruções' }
  }
}
window.doForgotPassword = doForgotPassword

// doLogin — compat. com qualquer chamada legada
async function doLogin() {
  const email = (document.getElementById('loginEmail') || {}).value || ''
  const pass  = (document.getElementById('loginPassword') || {}).value || ''
  const btn   = document.getElementById('loginBtn')
  const errEl = document.getElementById('loginError')

  if (btn)   { btn.disabled = true; btn.textContent = 'Entrando...' }
  if (errEl) errEl.style.display = 'none'

  try {
    const { error } = await _getClient().auth.signInWithPassword({ email, password: pass })
    if (error) throw error
    document.getElementById('loginModal')?.remove()
    window.location.replace('index.html')
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Erro ao fazer login'; errEl.style.display = 'block' }
    if (btn)   { btn.disabled = false; btn.textContent = 'Entrar' }
  }
}
window.doLogin = doLogin

// showRegisterModal — compat.
window.showRegisterModal = function () {
  if (window._showToast) _showToast('Acesso', 'Solicite acesso ao administrador da clinica.', 'info'); else alert('Solicite acesso ao administrador da clinica.')
}

// Export getCurrentProfile
window.getCurrentProfile = getCurrentProfile

})()
