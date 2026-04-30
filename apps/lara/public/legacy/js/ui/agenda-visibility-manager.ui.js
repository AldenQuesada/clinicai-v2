/**
 * ClinicAI — Agenda Visibility Manager UI
 *
 * Painel de configuração de quem pode ver/editar a agenda de cada profissional.
 *
 * Regras de exibição:
 *   admin / owner   => veem e gerenciam todos os pares
 *   therapist       => veem e gerenciam apenas a própria agenda
 *   receptionist / viewer => sem acesso a este painel
 *
 * Depende de:
 *   AgendaAccessService          (agenda-access.service.js)
 *   AgendaVisibilityRepository   (agenda-visibility.repository.js)
 *   PermissionsService           (permissions.service.js)
 *
 * API pública (window.AgendaVisibilityManagerUI):
 *   openModal()   — abre o modal de configuração
 *   render(el)    — renderiza inline em um elemento existente
 */

;(function () {
  'use strict'

  if (window._clinicaiAgendaVisManagerLoaded) return
  window._clinicaiAgendaVisManagerLoaded = true

  // ── Escape HTML ──────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  function _toast(msg, type) {
    const bg = type === 'error' ? '#FEF2F2' : type === 'warn' ? '#FFFBEB' : '#F0FDF4'
    const cl = type === 'error' ? '#DC2626' : type === 'warn' ? '#D97706' : '#15803D'
    const t  = document.createElement('div')
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${cl};
      padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;
      z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-width:320px`
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 3500)
  }

  // ── Labels de roles ──────────────────────────────────────────────────────
  const ROLE_LABELS = {
    owner:        'Proprietário',
    admin:        'Administrador',
    therapist:    'Terapeuta',
    receptionist: 'Recepcionista',
    viewer:       'Visualizador',
  }

  const PERM_LABELS = {
    edit: 'Editar',
    view: 'Visualizar',
    none: 'Sem acesso',
  }

  // ── Spinner ──────────────────────────────────────────────────────────────
  function _spinner() {
    return `<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:13px">
      Carregando...
    </div>`
  }

  // ── Renderização do painel ────────────────────────────────────────────────

  /**
   * Renderiza a lista de profissionais + quem tem acesso à agenda de cada um.
   * @param {HTMLElement} container
   * @param {boolean} isAdminView — true = admin/owner, false = therapist (só a própria)
   */
  async function _renderPanel(container, isAdminView) {
    container.innerHTML = _spinner()

    const repo    = window.AgendaVisibilityRepository
    const service = window.AgendaAccessService
    if (!repo || !service) {
      container.innerHTML = `<div style="color:#EF4444;padding:16px;font-size:13px">
        Serviço indisponível. Recarregue a página.
      </div>`
      return
    }

    // Carrega lista de profissionais conforme o role
    const prosResult = isAdminView
      ? await repo.listAllProfessionals()
      : { ok: true, data: service.getAll().filter(p => p.is_self) }

    if (!prosResult.ok) {
      container.innerHTML = `<div style="color:#EF4444;padding:16px;font-size:13px">
        Erro ao carregar profissionais: ${_esc(prosResult.error)}
      </div>`
      return
    }

    const professionals = prosResult.data || []

    if (!professionals.length) {
      container.innerHTML = `<div style="padding:32px;text-align:center;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:12px">
        Nenhum profissional cadastrado.
        <br><br>
        <small>Acesse Configurações → Equipe para registrar profissionais.</small>
      </div>`
      return
    }

    container.innerHTML = ''

    // Renderiza um card por profissional
    for (const pro of professionals) {
      const card = document.createElement('div')
      card.style.cssText = `
        border:1px solid #E5E7EB;border-radius:14px;margin-bottom:16px;overflow:hidden`

      // Header do card
      const header = document.createElement('div')
      header.style.cssText = `
        display:flex;align-items:center;gap:12px;padding:14px 16px;
        background:#F9FAFB;border-bottom:1px solid #E5E7EB`
      header.innerHTML = `
        <div style="width:36px;height:36px;border-radius:50%;background:${_esc(pro.color || '#7C3AED')};
          display:flex;align-items:center;justify-content:center;
          font-size:13px;font-weight:700;color:#fff;flex-shrink:0">
          ${_esc(_initials(pro.display_name))}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:#111">
            ${_esc(pro.display_name)}
            ${pro.is_self ? '<span style="background:#EFF6FF;color:#2563EB;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;margin-left:6px">Você</span>' : ''}
          </div>
          ${pro.specialty ? `<div style="font-size:11px;color:#9CA3AF;margin-top:1px">${_esc(pro.specialty)}</div>` : ''}
        </div>`

      // Botão "Adicionar acesso"
      if (isAdminView || pro.is_self) {
        const btnAdd = document.createElement('button')
        btnAdd.style.cssText = `
          display:flex;align-items:center;gap:5px;padding:6px 12px;
          background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;
          border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer`
        btnAdd.innerHTML = `
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14"/>
          </svg> Compartilhar`
        btnAdd.addEventListener('click', () => _openShareModal(pro, container, isAdminView))
        header.appendChild(btnAdd)
      }

      card.appendChild(header)

      // Corpo: lista de acessos concedidos
      const body = document.createElement('div')
      body.style.padding = '12px 16px'
      body.dataset.grantsFor = pro.id

      await _renderGrants(body, pro.id, isAdminView || pro.is_self)
      card.appendChild(body)
      container.appendChild(card)
    }
  }

  /**
   * Renderiza a lista de acessos concedidos para um profissional.
   * @param {HTMLElement} container
   * @param {string} ownerId
   * @param {boolean} canManage — pode revogar/alterar
   */
  async function _renderGrants(container, ownerId, canManage) {
    container.innerHTML = _spinner()

    const result = await window.AgendaVisibilityRepository.listGrants(ownerId)
    if (!result.ok) {
      container.innerHTML = `<div style="font-size:12px;color:#EF4444">Erro ao carregar acessos.</div>`
      return
    }

    const grants = result.data || []

    if (!grants.length) {
      container.innerHTML = `<div style="font-size:12px;color:#9CA3AF;padding:4px 0">
        Nenhum acesso compartilhado. Apenas administradores e recepcionistas têm acesso implícito.
      </div>`
      return
    }

    container.innerHTML = ''
    grants.forEach(grant => {
      const row = document.createElement('div')
      row.style.cssText = `
        display:flex;align-items:center;gap:10px;padding:8px 0;
        border-bottom:1px solid #F3F4F6`

      const permColor = grant.permission === 'edit' ? '#16A34A' : '#2563EB'
      const permBg    = grant.permission === 'edit' ? '#F0FDF4' : '#EFF6FF'

      row.innerHTML = `
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#111">${_esc(grant.viewer_name)}</div>
          <div style="font-size:11px;color:#9CA3AF">${_esc(ROLE_LABELS[grant.viewer_role] || grant.viewer_role)}</div>
        </div>
        <span style="background:${permBg};color:${permColor};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">
          ${_esc(PERM_LABELS[grant.permission] || grant.permission)}
        </span>`

      if (canManage) {
        const btnRevoke = document.createElement('button')
        btnRevoke.title = 'Revogar acesso'
        btnRevoke.style.cssText = `
          padding:5px 8px;background:#FEF2F2;border:none;border-radius:6px;
          cursor:pointer;color:#DC2626;font-size:11px;font-weight:600`
        btnRevoke.textContent = 'Revogar'
        btnRevoke.addEventListener('click', async () => {
          btnRevoke.disabled = true
          btnRevoke.textContent = '...'
          const res = await window.AgendaAccessService.revokeAccess(ownerId, grant.viewer_id)
          if (res.ok) {
            _toast('Acesso revogado.', 'warn')
            await _renderGrants(container, ownerId, canManage)
          } else {
            _toast('Erro: ' + (res.error || 'desconhecido'), 'error')
            btnRevoke.disabled = false
            btnRevoke.textContent = 'Revogar'
          }
        })
        row.appendChild(btnRevoke)
      }

      container.appendChild(row)
    })
  }

  /**
   * Abre modal para compartilhar a agenda com um membro da equipe.
   * @param {object} pro — profissional dono da agenda
   * @param {HTMLElement} panelContainer — para re-render após salvar
   * @param {boolean} isAdminView
   */
  function _openShareModal(pro, panelContainer, isAdminView) {
    // Carrega membros da clínica (via list_staff RPC já existente)
    const sbShared = window._sbShared
    if (!sbShared) { _toast('Conexão indisponível.', 'error'); return }

    // Remove modal anterior se existir
    document.getElementById('_agendaShareModal')?.remove()

    const overlay = document.createElement('div')
    overlay.id = '_agendaShareModal'
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);
      display:flex;align-items:center;justify-content:center;
      z-index:99998;padding:24px`

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:18px;padding:28px;width:100%;max-width:420px;
        box-shadow:0 24px 80px rgba(0,0,0,0.25)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="font-size:15px;font-weight:700;color:#111;margin:0">Compartilhar agenda</h3>
            <p style="font-size:12px;color:#6B7280;margin:3px 0 0">${_esc(pro.display_name)}</p>
          </div>
          <button id="_shareClose" style="background:none;border:none;cursor:pointer;color:#9CA3AF">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div id="_shareErr" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px"></div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">Membro da equipe</label>
          <select id="_shareMember" style="width:100%;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;outline:none;background:#fff">
            <option value="">Carregando...</option>
          </select>
        </div>
        <div style="margin-bottom:24px">
          <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px">Nível de acesso</label>
          <div style="display:flex;gap:8px">
            <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;cursor:pointer;font-size:13px">
              <input type="radio" name="_sharePermission" value="view" checked style="accent-color:#7C3AED">
              <div>
                <div style="font-weight:600;color:#111">Visualizar</div>
                <div style="font-size:11px;color:#9CA3AF">Vê os agendamentos, não edita</div>
              </div>
            </label>
            <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;cursor:pointer;font-size:13px">
              <input type="radio" name="_sharePermission" value="edit" style="accent-color:#7C3AED">
              <div>
                <div style="font-weight:600;color:#111">Editar</div>
                <div style="font-size:11px;color:#9CA3AF">Pode criar e mover agendamentos</div>
              </div>
            </label>
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <button id="_shareCancel" style="flex:1;padding:11px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
          <button id="_shareSave"   style="flex:2;padding:11px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Compartilhar</button>
        </div>
      </div>`

    document.body.appendChild(overlay)

    // Fecha no overlay
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('#_shareClose').addEventListener('click', () => overlay.remove())
    overlay.querySelector('#_shareCancel').addEventListener('click', () => overlay.remove())

    // Carrega membros da equipe
    sbShared.rpc('list_staff').then(({ data, error }) => {
      const sel = overlay.querySelector('#_shareMember')
      if (!sel) return
      if (error || !data?.ok) {
        sel.innerHTML = '<option value="">Erro ao carregar membros</option>'
        return
      }
      const staff = (data.staff || []).filter(s =>
        s.id !== pro.id && s.is_active && !['owner', 'admin'].includes(s.role)
      )
      if (!staff.length) {
        sel.innerHTML = '<option value="">Nenhum membro elegível</option>'
        return
      }
      sel.innerHTML = staff.map(s => {
        const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email
        return `<option value="${_esc(s.id)}">${_esc(name)} (${_esc(ROLE_LABELS[s.role] || s.role)})</option>`
      }).join('')
    })

    // Salvar
    overlay.querySelector('#_shareSave').addEventListener('click', async () => {
      const viewerId   = overlay.querySelector('#_shareMember')?.value
      const permission = overlay.querySelector('input[name="_sharePermission"]:checked')?.value
      const errEl      = overlay.querySelector('#_shareErr')
      const btn        = overlay.querySelector('#_shareSave')

      if (!viewerId) {
        if (errEl) { errEl.textContent = 'Selecione um membro.'; errEl.style.display = 'block' }
        return
      }

      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }
      if (errEl) errEl.style.display = 'none'

      const res = await window.AgendaAccessService.grantAccess(pro.id, viewerId, permission)

      if (res.ok) {
        overlay.remove()
        _toast('Acesso compartilhado com sucesso.', 'success')
        // Re-renderiza o painel de grants para o profissional afetado
        const grantsContainer = panelContainer.querySelector(`[data-grants-for="${pro.id}"]`)
        if (grantsContainer) {
          await _renderGrants(grantsContainer, pro.id, isAdminView || true)
        }
      } else {
        const msgs = {
          insufficient_permissions: 'Sem permissão para esta ação.',
          can_only_share_own_agenda: 'Você só pode compartilhar sua própria agenda.',
          invalid_permission: 'Nível de acesso inválido.',
        }
        if (errEl) {
          errEl.textContent = msgs[res.error] || res.error || 'Erro desconhecido'
          errEl.style.display = 'block'
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Compartilhar' }
      }
    })
  }

  /** Retorna iniciais de um nome */
  function _initials(name) {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /**
   * Abre o painel de configuração de visibilidade em um modal.
   */
  function openModal() {
    const perms = window.PermissionsService
    if (!perms?.canAny(['agenda:manage-visibility', 'agenda:share-own'])) {
      const t = document.createElement('div')
      t.style.cssText = `position:fixed;bottom:24px;right:24px;background:#FFFBEB;color:#D97706;
        padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:99999`
      t.textContent = 'Sem permissão para gerenciar visibilidade de agendas.'
      document.body.appendChild(t)
      setTimeout(() => t.remove(), 3500)
      return
    }

    const isAdminView = perms.isAtLeast('admin')

    document.getElementById('_agendaVisModal')?.remove()

    const overlay = document.createElement('div')
    overlay.id = '_agendaVisModal'
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);
      display:flex;align-items:center;justify-content:center;
      z-index:9997;padding:24px`

    const panel = document.createElement('div')
    panel.style.cssText = `
      background:#fff;border-radius:20px;width:100%;max-width:600px;
      max-height:80vh;display:flex;flex-direction:column;
      box-shadow:0 24px 80px rgba(0,0,0,0.25);overflow:hidden`

    // Header
    panel.innerHTML = `
      <div style="padding:20px 24px 16px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <h2 style="font-size:16px;font-weight:700;color:#111;margin:0">Visibilidade da Agenda</h2>
          <p style="font-size:12px;color:#6B7280;margin:4px 0 0">
            ${isAdminView
              ? 'Configure quem pode ver e editar a agenda de cada profissional.'
              : 'Compartilhe sua agenda com outros membros da equipe.'}
          </p>
        </div>
        <button id="_agendaVisClose" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div id="_agendaVisBody" style="flex:1;overflow-y:auto;padding:20px 24px"></div>`

    overlay.appendChild(panel)
    document.body.appendChild(overlay)

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    panel.querySelector('#_agendaVisClose').addEventListener('click', () => overlay.remove())

    const body = panel.querySelector('#_agendaVisBody')
    _renderPanel(body, isAdminView)
  }

  /**
   * Renderiza o painel inline em um elemento existente.
   * Útil para embedar em páginas de configurações.
   *
   * @param {HTMLElement} el
   */
  function render(el) {
    if (!el) return
    const perms = window.PermissionsService
    const isAdminView = perms ? perms.isAtLeast('admin') : false
    _renderPanel(el, isAdminView)
  }

  // ── Exposição global ────────────────────────────────────────────────────
  window.AgendaVisibilityManagerUI = Object.freeze({
    openModal,
    render,
  })

})()
