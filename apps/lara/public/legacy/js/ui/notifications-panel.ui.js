/**
 * ClinicAI — Notifications Panel UI
 *
 * Componente completo de notificações: sininho no header + painel dropdown.
 *
 * Depende de:
 *   NotificationsService  (notifications.service.js)
 *
 * API pública (window.NotificationsPanelUI):
 *   mount(bellContainerId)  — injeta o sininho em um container do header
 *   unmount()               — remove componente e listeners
 *
 * Uso:
 *   <div id="notificationsBell"></div>
 *   NotificationsPanelUI.mount('notificationsBell')
 */

;(function () {
  'use strict'

  if (window._clinicaiNotifPanelLoaded) return
  window._clinicaiNotifPanelLoaded = true

  // ── IDs internos ────────────────────────────────────────────────────────
  const BELL_ID    = '_notifBell'
  const BADGE_ID   = '_notifBadge'
  const PANEL_ID   = '_notifPanel'
  const LIST_ID    = '_notifList'

  let _containerId = null
  let _open        = false
  let _mounted     = false

  // ── Tipos de notificação: ícone + cor ───────────────────────────────────
  const TYPE_CONFIG = {
    invite_accepted: {
      color: '#16A34A', bg: '#F0FDF4',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <polyline points="17 11 19 13 23 9"/>
      </svg>`,
    },
    appointment_created: {
      color: '#2563EB', bg: '#EFF6FF',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
      </svg>`,
    },
    appointment_cancelled: {
      color: '#DC2626', bg: '#FEF2F2',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="10" y1="14" x2="14" y2="18"/><line x1="14" y1="14" x2="10" y2="18"/>
      </svg>`,
    },
    appointment_reminder: {
      color: '#D97706', bg: '#FFFBEB',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>`,
    },
    staff_deactivated: {
      color: '#7C3AED', bg: '#F5F3FF',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>
      </svg>`,
    },
    system: {
      color: '#6B7280', bg: '#F9FAFB',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`,
    },
    // ── Alertas internos (Tags + Rules) ──────────────────────────
    internal_info: {
      color: '#2563EB', bg: '#EFF6FF',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>`,
    },
    internal_sucesso: {
      color: '#16A34A', bg: '#F0FDF4',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>`,
    },
    internal_alerta: {
      color: '#D97706', bg: '#FFFBEB',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>`,
    },
    internal_urgente: {
      color: '#DC2626', bg: '#FEF2F2',
      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`,
    },
  }

  function _typeConfig(type) {
    return TYPE_CONFIG[type] || TYPE_CONFIG.system
  }

  // ── Time ago ────────────────────────────────────────────────────────────
  function _timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime()
    const mins  = Math.floor(diff / 60_000)
    if (mins < 1)   return 'agora'
    if (mins < 60)  return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days  = Math.floor(hours / 24)
    if (days < 30)  return `${days}d`
    return new Date(isoString).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  // ── Render badge ────────────────────────────────────────────────────────
  function _updateBadge(count) {
    const badge = document.getElementById(BADGE_ID)
    if (!badge) return
    if (count > 0) {
      badge.textContent  = count > 99 ? '99+' : String(count)
      badge.style.display = 'flex'
    } else {
      badge.style.display = 'none'
    }
  }

  // ── Render lista de notificações ────────────────────────────────────────
  function _renderList() {
    const list = document.getElementById(LIST_ID)
    if (!list) return

    const notifications = window.NotificationsService?.getAll() ?? []

    if (!notifications.length) {
      list.innerHTML = `
        <div style="padding:40px 24px;text-align:center;color:#9CA3AF">
          <svg width="32" height="32" fill="none" stroke="#D1D5DB" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 10px;display:block">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <div style="font-size:13px;font-weight:500;color:#6B7280">Nenhuma notificação</div>
        </div>`
      return
    }

    list.innerHTML = ''

    notifications.forEach(n => {
      const cfg  = _typeConfig(n.type)
      const item = document.createElement('div')
      item.dataset.notifId = n.id
      item.style.cssText = `
        display:flex;gap:12px;padding:12px 16px;cursor:pointer;
        background:${n.is_read ? '#fff' : '#FAFAF9'};
        border-bottom:1px solid #F3F4F6;transition:background .1s`

      item.innerHTML = `
        <div style="
          width:36px;height:36px;border-radius:50%;background:${cfg.bg};
          color:${cfg.color};display:flex;align-items:center;justify-content:center;
          flex-shrink:0;margin-top:1px">
          ${cfg.icon}
        </div>
        <div style="flex:1;min-width:0">
          <div style="
            font-size:13px;font-weight:${n.is_read ? '500' : '700'};
            color:${n.is_read ? '#6B7280' : '#111'};
            line-height:1.4;margin-bottom:2px">
            ${_esc(n.title)}
          </div>
          ${n.body ? `<div style="font-size:12px;color:#9CA3AF;line-height:1.4;margin-bottom:3px">${_esc(n.body)}</div>` : ''}
          <div style="font-size:11px;color:#C4C4C4">${_timeAgo(n.created_at)}</div>
        </div>
        ${!n.is_read ? `<div style="
          width:8px;height:8px;border-radius:50%;background:#7C3AED;
          flex-shrink:0;margin-top:6px"></div>` : ''}`

      item.addEventListener('mouseenter', () => { item.style.background = '#F9FAFB' })
      item.addEventListener('mouseleave', () => { item.style.background = n.is_read ? '#fff' : '#FAFAF9' })

      item.addEventListener('click', async () => {
        if (!n.is_read) {
          await window.NotificationsService?.markRead(n.id)
          // O onChange vai re-renderizar
        }
      })

      list.appendChild(item)
    })

    // Botão "carregar mais"
    if (window.NotificationsService?.hasMore()) {
      const btnMore = document.createElement('div')
      btnMore.style.cssText = `
        padding:12px;text-align:center;font-size:12px;color:#7C3AED;
        font-weight:600;cursor:pointer;border-bottom:1px solid #F3F4F6`
      btnMore.textContent = 'Carregar mais'
      btnMore.addEventListener('click', async () => {
        btnMore.textContent = 'Carregando...'
        await window.NotificationsService?.loadMore()
      })
      list.appendChild(btnMore)
    }
  }

  // ── Escape HTML ─────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  // ── Painel dropdown ─────────────────────────────────────────────────────
  function _createPanel() {
    document.getElementById(PANEL_ID)?.remove()

    const panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.style.cssText = `
      position:fixed;top:60px;right:16px;width:360px;max-height:480px;
      background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.18);
      border:1px solid #F3F4F6;z-index:9990;display:flex;flex-direction:column;
      overflow:hidden`

    // Header do painel
    const header = document.createElement('div')
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding:14px 16px;border-bottom:1px solid #F3F4F6;flex-shrink:0`

    const unread = window.NotificationsService?.getUnreadCount() ?? 0

    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px;font-weight:700;color:#111">Notificações</span>
        ${unread > 0 ? `<span style="background:#7C3AED;color:#fff;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700">${unread}</span>` : ''}
      </div>
      <button id="_notifMarkAll" style="
        font-size:11px;color:#7C3AED;font-weight:600;background:none;
        border:none;cursor:pointer;padding:4px 8px;border-radius:6px">
        Marcar tudo como lido
      </button>`

    header.querySelector('#_notifMarkAll').addEventListener('click', async (e) => {
      e.stopPropagation()
      await window.NotificationsService?.markAllRead()
    })

    // Lista scrollável
    const listWrapper = document.createElement('div')
    listWrapper.style.cssText = 'flex:1;overflow-y:auto'
    listWrapper.innerHTML = `<div id="${LIST_ID}"></div>`

    panel.appendChild(header)
    panel.appendChild(listWrapper)
    document.body.appendChild(panel)

    _renderList()

    // Fecha ao clicar fora
    setTimeout(() => {
      document.addEventListener('click', _handleOutsideClick)
    }, 10)

    return panel
  }

  function _handleOutsideClick(e) {
    const panel = document.getElementById(PANEL_ID)
    const bell  = document.getElementById(BELL_ID)
    if (!panel) return
    if (!panel.contains(e.target) && !bell?.contains(e.target)) {
      _closePanel()
    }
  }

  function _closePanel() {
    document.getElementById(PANEL_ID)?.remove()
    document.removeEventListener('click', _handleOutsideClick)
    _open = false
  }

  function _togglePanel() {
    if (_open) {
      _closePanel()
    } else {
      _open = true
      _createPanel()
    }
  }

  // ── Listener do serviço ─────────────────────────────────────────────────
  function _onServiceChange({ notifications, unread }) {
    _updateBadge(unread)
    // Atualiza painel se estiver aberto
    if (_open) {
      const header = document.querySelector(`#${PANEL_ID} span[style*="background:#7C3AED"]`)
      if (header) header.textContent = unread
      _renderList()
    }
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /**
   * Monta o sininho no container indicado.
   *
   * @param {string} containerId
   */
  function mount(containerId) {
    if (_mounted) unmount()
    _containerId = containerId
    _mounted     = true

    const container = document.getElementById(containerId)
    if (!container) {
      console.warn('[NotificationsPanelUI] Container não encontrado:', containerId)
      return
    }

    container.innerHTML = `
      <button id="${BELL_ID}" style="
        position:relative;width:36px;height:36px;border-radius:10px;
        background:none;border:none;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        color:#6B7280;transition:background .15s"
        title="Notificações">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span id="${BADGE_ID}" style="
          display:none;position:absolute;top:4px;right:4px;
          min-width:16px;height:16px;border-radius:8px;
          background:#EF4444;color:#fff;font-size:9px;font-weight:800;
          align-items:center;justify-content:center;padding:0 3px;
          border:1.5px solid #fff;line-height:1">
        </span>
      </button>`

    document.getElementById(BELL_ID).addEventListener('click', (e) => {
      e.stopPropagation()
      _togglePanel()
    })

    // Estado inicial
    const unread = window.NotificationsService?.getUnreadCount() ?? 0
    _updateBadge(unread)

    window.NotificationsService?.onChange(_onServiceChange)
  }

  /**
   * Remove o componente e seus listeners.
   */
  function unmount() {
    if (!_mounted) return
    _closePanel()
    window.NotificationsService?.offChange(_onServiceChange)
    const container = document.getElementById(_containerId)
    if (container) container.innerHTML = ''
    _containerId = null
    _mounted     = false
    _open        = false
  }

  // ── Exposição global ────────────────────────────────────────────────────
  window.NotificationsPanelUI = Object.freeze({ mount, unmount })

})()
