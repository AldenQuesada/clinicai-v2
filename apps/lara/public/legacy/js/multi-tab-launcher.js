/**
 * ClinicAI — Multi-Tab Launcher
 *
 * Abre paginas extras em abas separadas apos o login, com um clique.
 * Configuravel por role: cada papel define quais paginas abrem automaticamente.
 *
 * Fluxo:
 *   1. auth.js dispara 'clinicai:auth-success' com o profile
 *   2. Este modulo verifica se ha abas configuradas para o role
 *   3. Se ?page= esta na URL, esta aba ja foi aberta pelo launcher → nao mostra banner
 *   4. Senao, exibe banner com botao para abrir as abas extras
 *   5. Ao clicar, abre cada pagina via window.open() e persiste flag na sessionStorage
 *
 * Dependencias: nenhuma (vanilla JS, zero deps)
 * Carregado por: index.html (defer)
 */
;(function () {
  'use strict'

  if (window._clinicaiMultiTabLoaded) return
  window._clinicaiMultiTabLoaded = true

  // ── Config: paginas extras por role ──────────────────────────
  const TABS_BY_ROLE = {
    owner:        [{ page: 'inbox', label: 'Central de WhatsApp' }, { page: 'agenda', label: 'Agenda' }],
    admin:        [{ page: 'inbox', label: 'Central de WhatsApp' }, { page: 'agenda', label: 'Agenda' }],
    receptionist: [{ page: 'inbox', label: 'Central de WhatsApp' }, { page: 'agenda', label: 'Agenda' }],
    therapist:    [{ page: 'agenda', label: 'Agenda' }],
    viewer:       [],
  }

  const SESSION_KEY = 'clinicai_tabs_opened'

  // ── Verifica se esta aba ja foi aberta pelo launcher ─────────
  function _isLaunchedTab() {
    return new URLSearchParams(window.location.search).has('page')
  }

  // ── Verifica se ja abriu as abas nesta sessao ────────────────
  function _alreadyOpened() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
  }

  function _markOpened() {
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
  }

  // ── Abre as abas extras ──────────────────────────────────────
  function _openTabs(tabs) {
    const base = window.location.origin + window.location.pathname
    tabs.forEach(t => {
      window.open(`${base}?page=${t.page}`, `clinicai_${t.page}`)
    })
    _markOpened()
  }

  // ── Cria e exibe o banner ────────────────────────────────────
  function _showBanner(tabs) {
    if (document.getElementById('multiTabBanner')) return

    const banner = document.createElement('div')
    banner.id = 'multiTabBanner'
    banner.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
      'background:#1a1a2e', 'color:#e0e0e0', 'border:1px solid rgba(255,255,255,0.1)',
      'border-radius:12px', 'padding:16px 20px', 'max-width:340px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.3)', 'font-family:Inter,system-ui,sans-serif',
      'font-size:13px', 'line-height:1.5', 'animation:mtlSlideIn .3s ease-out',
    ].join(';')

    const tabList = tabs.map(t => t.label).join(' + ')

    banner.innerHTML = `
      <style>
        @keyframes mtlSlideIn { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        #multiTabBanner button { cursor:pointer; border:none; border-radius:8px; padding:8px 16px; font-size:13px; font-weight:600; transition:opacity .15s }
        #multiTabBanner button:hover { opacity:.85 }
      </style>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <strong style="color:#c9a84c">Abrir abas de trabalho</strong>
      </div>
      <div style="margin-bottom:12px;color:#aaa">Abrir <strong style="color:#e0e0e0">${tabList}</strong> em abas separadas?</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="mtlDismiss" style="background:transparent;color:#888;padding:8px 12px">Depois</button>
        <button id="mtlOpen" style="background:#c9a84c;color:#1a1a2e">Abrir abas</button>
      </div>
    `

    document.body.appendChild(banner)

    document.getElementById('mtlOpen').addEventListener('click', () => {
      _openTabs(tabs)
      banner.remove()
    })

    document.getElementById('mtlDismiss').addEventListener('click', () => {
      banner.remove()
    })

    // Auto-dismiss apos 15s
    setTimeout(() => { if (banner.parentNode) banner.remove() }, 15000)
  }

  // ── Listener principal ───────────────────────────────────────
  document.addEventListener('clinicai:auth-success', (e) => {
    if (_isLaunchedTab() || _alreadyOpened()) return

    const profile = e.detail
      || (typeof window.getCurrentProfile === 'function' ? window.getCurrentProfile() : null)
    if (!profile) return

    const role = profile.role || 'viewer'
    const tabs = TABS_BY_ROLE[role] || []
    if (!tabs.length) return

    // Pequeno delay para nao competir com o boot visual
    setTimeout(() => _showBanner(tabs), 1500)
  })

  // ── API publica (para testes/admin) ──────────────────────────
  window.MultiTabLauncher = Object.freeze({
    openTabs: (role) => {
      const tabs = TABS_BY_ROLE[role || 'receptionist'] || []
      if (tabs.length) _openTabs(tabs)
    },
    config: TABS_BY_ROLE,
  })

})()
