/**
 * ClinicAI — Sidebar Navigation Engine
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  RESPONSABILIDADES DESTE MÓDULO                                      ║
 * ║                                                                      ║
 * ║  1. Renderizar o sidebar a partir de NAV_CONFIG (nav-config.js)      ║
 * ║  2. Filtrar itens por papel do usuário (role) e plano (plan)         ║
 * ║  3. Gerenciar navegação: acordeão, flyout, active state, breadcrumb  ║
 * ║  4. Trocar páginas (navigateTo)                                       ║
 * ║  5. Reconstruir o menu quando o papel/plano mudar (pós-login)        ║
 * ║                                                                      ║
 * ║  DEPENDÊNCIAS (devem carregar antes):                                ║
 * ║    utils.js     → utils gerais                                       ║
 * ║    auth.js      → getUser()                                          ║
 * ║    nav-config.js → NAV_CONFIG, ROLES, PLANS                          ║
 * ║                                                                      ║
 * ║  API PÚBLICA (window.*):                                             ║
 * ║    navigateTo(pageId)          — troca de página                     ║
 * ║    handleSubItemClick(el)      — ativa subitem e navega              ║
 * ║    closeNavFlyout()            — fecha flyout do sidebar colapsado   ║
 * ║    buildSidebar(user)          — reconstrói o menu (após login etc.) ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

;(function () {
  'use strict'

  if (window._clinicaiSidebarLoaded) {
    console.error('[ClinicAI/sidebar] sidebar.js carregado mais de uma vez. Verifique o index.html.')
    return
  }
  window._clinicaiSidebarLoaded = true

  // ══════════════════════════════════════════════════════════════
  // 1. CHECAGEM DE PERMISSÃO
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário tem permissão para ver um item de nav.
   *
   * Regras:
   *   - roles[] vazio  → sem restrição de papel, todos passam
   *   - roles[] set    → user.role deve estar na lista
   *   - plans[] vazio  → sem restrição de plano, todos passam
   *   - plans[] set    → user.plan deve estar na lista
   *   - user null/undefined → modo demo/dev, passa tudo (não há login)
   *
   * @param {{ roles?: string[], plans?: string[] }} item   — seção ou página
   * @param {{ role?: string, plan?: string }|null}  user   — usuário atual
   * @returns {boolean}
   */
  // Cache de overrides de permissao (carregado uma vez do banco)
  let _permOverrides = null

  /**
   * Carrega permissoes efetivas do usuario logado.
   * Prioridade: user_module_permissions > clinic_module_permissions > nav-config default
   */
  async function _loadPermOverrides() {
    if (_permOverrides) return
    _permOverrides = {}
    try {
      var sb = window._sbShared
      if (!sb) return
      var r = await sb.rpc('get_my_effective_permissions')
      if (r.error || !r.data) return
      // role_overrides: {"module|page": true/false}
      var roleOv = r.data.role_overrides || {}
      var userOv = r.data.user_overrides || {}
      // Merge: user > role. Key format in DB: "module|page"
      // Convert to our format: "module|page|role"
      var role = r.data.role || ''
      Object.keys(roleOv).forEach(function (k) {
        _permOverrides[k + '|' + role] = roleOv[k]
      })
      // User overrides (highest priority, stored without role)
      Object.keys(userOv).forEach(function (k) {
        _permOverrides['_user_' + k] = userOv[k]
      })
    } catch (e) { /* silencioso — usa defaults se falhar */ }
  }

  function _userCan(item, user, sectionId, pageId) {
    if (!user) return true

    if (_permOverrides) {
      // 1. User-level override (highest priority)
      var uKey = '_user_' + (sectionId || '') + '|' + (pageId || '')
      if (uKey in _permOverrides) return _permOverrides[uKey]
      // User override at section level
      if (pageId) {
        var uSectionKey = '_user_' + (sectionId || '') + '|'
        if (uSectionKey in _permOverrides) return _permOverrides[uSectionKey]
      }

      // 2. Role-level override
      if (user.role) {
        var rKey = (sectionId || '') + '|' + (pageId || '') + '|' + user.role
        if (rKey in _permOverrides) return _permOverrides[rKey]
        if (pageId) {
          var rSectionKey = (sectionId || '') + '||' + user.role
          if (rSectionKey in _permOverrides) return _permOverrides[rSectionKey]
        }
      }
    }

    // 3. Fallback: defaults do nav-config
    if (item.roles && item.roles.length > 0) {
      if (!item.roles.includes(user.role)) return false
    }
    if (item.plans && item.plans.length > 0) {
      const userPlan = user.plan || user.tenant?.plan
      if (!item.plans.includes(userPlan)) return false
    }
    return true
  }

  // ══════════════════════════════════════════════════════════════
  // 2. RENDERIZAÇÃO DO HTML
  // ══════════════════════════════════════════════════════════════

  /**
   * Escapa caracteres especiais para uso seguro em HTML.
   * Previne XSS mesmo que strings do config contenham caracteres perigosos.
   *
   * @param {*} str
   * @returns {string}
   */
  // ── Lazy-load: carrega scripts pesados sob demanda ─────────
  var _lazyLoaded = {}
  function _lazyLoad(pageId) {
    var v = (window.ClinicEnv || {}).ASSET_VERSION || '0'
    var map = {
      'settings-injetaveis':   ['js/injetaveis.js?v=' + v],
      'settings-procedimentos':['js/procedimentos.js?v=' + v],
      'financeiro':            ['js/financeiro.js?v=' + v, 'js/financeiro-reports.js?v=' + v],
    }
    // Qualquer pagina fin-* tambem carrega o modulo financeiro
    if (/^fin-/.test(pageId)) {
      map[pageId] = ['js/financeiro.js?v=' + v, 'js/financeiro-reports.js?v=' + v]
    }
    var scripts = map[pageId]
    if (!scripts) return
    scripts.forEach(function(src) {
      if (_lazyLoaded[src]) return
      _lazyLoaded[src] = true
      var s = document.createElement('script')
      s.src = src
      s.defer = true
      document.head.appendChild(s)
    })
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /**
   * Gera o HTML completo do nav filtrado pelas permissões do usuário.
   *
   * @param {{ role?: string, plan?: string }|null} user
   * @returns {string} HTML pronto para ser injetado em #sidebarNav
   */
  function _buildNavHTML(user) {
    const config = window.NAV_CONFIG

    if (!Array.isArray(config)) {
      console.error(
        '[ClinicAI/sidebar] window.NAV_CONFIG não é um array. ' +
        'Certifique-se que nav-config.js carrega antes de sidebar.js.',
      )
      return ''
    }

    let html = ''

    config.forEach(section => {
      // ── Filtro de seção (com overrides do banco) ──────────────
      if (!_userCan(section, user, section.section, null)) return

      // ── Filtro de páginas ────────────────────────────────────
      const visiblePages = section.pages.filter(page => {
        const effectiveRoles = page.roles !== undefined ? page.roles : section.roles
        const effectivePlans = page.plans !== undefined ? page.plans : section.plans
        return _userCan({ roles: effectiveRoles, plans: effectivePlans }, user, section.section, page.page)
      })

      // Seção sem páginas visíveis não aparece no menu
      if (!visiblePages.length) return

      // ── Renderiza a seção ────────────────────────────────────
      html += `<div class="nav-section">`
      html += `<div class="nav-item" data-section="${_esc(section.section)}">`
      html += `<div class="nav-item-main">`
      html += `<span class="nav-icon"><i data-feather="${_esc(section.icon)}"></i></span>`
      html += `<span class="nav-label">${_esc(section.label)}</span>`
      html += `<span class="nav-arrow"><i data-feather="chevron-right"></i></span>`
      html += `</div>`
      html += `<ul class="nav-subitems">`

      visiblePages.forEach(page => {
        const highlightCls = page.highlight     ? ' nav-subitem-highlight' : ''
        const activeCls    = page.defaultActive ? ' active'               : ''

        const extUrlAttr = page.externalUrl ? ` data-external-url="${_esc(page.externalUrl)}"` : ''
        html += `<li`
        html += ` class="nav-subitem${highlightCls}${activeCls}"`
        html += ` data-page="${_esc(page.page)}"`
        html += ` data-breadcrumb="${_esc(page.breadcrumb)}"`
        html += extUrlAttr
        html += `>${_esc(page.label)}</li>`
      })

      html += `</ul></div></div>`
    })

    return html
  }

  // ══════════════════════════════════════════════════════════════
  // 3. BUILD PÚBLICO
  // ══════════════════════════════════════════════════════════════

  /**
   * (Re)constrói o sidebar nav filtrando por permissões do usuário.
   * Seguro para chamar múltiplas vezes (ex: após login, troca de plano).
   *
   * O estado de navegação atual é preservado: se a página ativa ainda
   * é visível após rebuild, ela permanece ativa. Caso contrário, o
   * sistema navega para o dashboard.
   *
   * @param {{ role?: string, plan?: string }|null} user — null = modo dev
   */
  function buildSidebar(user) {
    const nav = document.getElementById('sidebarNav')
    if (!nav) {
      console.warn('[ClinicAI/sidebar] #sidebarNav não encontrado no DOM.')
      return
    }

    // Prioridade: ?page= na URL > subitem ativo > localStorage > null
    const urlPage = new URLSearchParams(window.location.search).get('page')
    const previousPage = urlPage
      || document.querySelector('.nav-subitem.active')?.dataset.page
      || (() => { try { return localStorage.getItem('clinicai_last_page') } catch { return null } })()
      || null

    // Injeta o novo HTML filtrado
    nav.innerHTML = _buildNavHTML(user)

    // Reinicializa os ícones Feather — escopo: apenas o nav reconstruído
    _replaceFeatherIcons(nav)

    // Anexa todos os event listeners ao novo DOM
    _attachNavEvents()

    // Tenta restaurar a página que estava ativa antes do rebuild / reload
    // Se tem previousPage, NAO abre dashboard primeiro (evita flash)
    if (previousPage) {
      const restoredItem = nav.querySelector(`.nav-subitem[data-page="${previousPage}"]`)
      if (restoredItem) {
        // Marca o estado visual do sidebar
        document.querySelectorAll('.nav-subitem').forEach(si => si.classList.remove('active'))
        restoredItem.classList.add('active')
        const parentNavItem = restoredItem.closest('.nav-item')
        if (parentNavItem) {
          document.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('has-active'))
          parentNavItem.classList.add('has-active', 'open')
        }
        _updateBreadcrumb(restoredItem.dataset.breadcrumb || restoredItem.textContent)
        // Garante que o conteúdo da página também seja exibido (necessário após F5)
        navigateTo(previousPage)
      } else {
        // Página não está mais visível após troca de papel → volta para dashboard
        _openDefaultSection()
        navigateTo('dashboard-overview')
      }
    } else {
      // Sem página anterior → abre dashboard
      _openDefaultSection()
      navigateTo('dashboard-overview')
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 4. EVENT LISTENERS DE NAVEGAÇÃO
  // ══════════════════════════════════════════════════════════════

  /* Timer para fechar o flyout com delay (evita fechar ao mover o mouse) */
  let _flyoutCloseTimer = null

  function _cancelFlyoutClose() {
    if (_flyoutCloseTimer) { clearTimeout(_flyoutCloseTimer); _flyoutCloseTimer = null }
  }

  function _scheduleFlyoutClose() {
    _cancelFlyoutClose()
    _flyoutCloseTimer = setTimeout(closeNavFlyout, 120)
  }

  /**
   * Anexa todos os event listeners ao DOM recém-renderizado.
   * Chamado internamente pelo buildSidebar — não use diretamente.
   * Usa _navCleanup para remover listeners anteriores (evita acumulacao).
   */
  var _navCleanup = []

  function _attachNavEvents() {
    // Limpar listeners anteriores para evitar acumulacao
    _navCleanup.forEach(function(fn) { fn() })
    _navCleanup = []

    const flyout = document.getElementById('navFlyout')

    // ── Itens principais (header de cada seção) ──────────────
    document.querySelectorAll('.nav-item').forEach(navItem => {
      const mainEl = navItem.querySelector('.nav-item-main')
      if (!mainEl) return

      const onClick = () => {
        if (!document.body.classList.contains('sidebar-collapsed')) {
          navItem.classList.toggle('open')
        }
      }
      const onEnter = () => {
        if (document.body.classList.contains('sidebar-collapsed')) {
          _cancelFlyoutClose()
          _showNavFlyout(navItem, mainEl)
        }
      }
      const onLeave = () => {
        if (document.body.classList.contains('sidebar-collapsed')) {
          _scheduleFlyoutClose()
        }
      }

      mainEl.addEventListener('click', onClick)
      mainEl.addEventListener('mouseenter', onEnter)
      mainEl.addEventListener('mouseleave', onLeave)
      _navCleanup.push(function() {
        mainEl.removeEventListener('click', onClick)
        mainEl.removeEventListener('mouseenter', onEnter)
        mainEl.removeEventListener('mouseleave', onLeave)
      })
    })

    // ── Flyout: mantém aberto enquanto o mouse está sobre ele ──
    if (flyout) {
      flyout.addEventListener('mouseenter', _cancelFlyoutClose)
      flyout.addEventListener('mouseleave', _scheduleFlyoutClose)
      _navCleanup.push(function() {
        flyout.removeEventListener('mouseenter', _cancelFlyoutClose)
        flyout.removeEventListener('mouseleave', _scheduleFlyoutClose)
      })
    }

    // ── Sub-itens: clique navega para a página ─────────────────
    document.querySelectorAll('.nav-subitem').forEach(subItem => {
      const handler = (e) => {
        e.stopPropagation()
        handleSubItemClick(subItem)
      }
      subItem.addEventListener('click', handler)
      _navCleanup.push(function() { subItem.removeEventListener('click', handler) })
    })
  }

  // ══════════════════════════════════════════════════════════════
  // 5. FLYOUT (sidebar colapsada)
  // ══════════════════════════════════════════════════════════════

  /**
   * Exibe o painel flyout ao lado de um item do sidebar colapsado.
   * Posicionado automaticamente para não sair da viewport.
   *
   * @param {HTMLElement} navItem — .nav-item que acionou o hover
   * @param {HTMLElement} mainEl  — .nav-item-main (usado para posição)
   */
  function _showNavFlyout(navItem, mainEl) {
    const flyout = document.getElementById('navFlyout')
    if (!flyout) return

    const subitems = navItem.querySelectorAll('.nav-subitem')
    if (!subitems.length) return

    const label = navItem.querySelector('.nav-label')?.textContent.trim() || ''

    // Monta HTML do flyout
    let html = `<div class="nav-flyout-title">${_esc(label)}</div><ul class="nav-flyout-list">`
    subitems.forEach(si => {
      const activeCls    = si.classList.contains('active')               ? ' nav-flyout-active'    : ''
      const highlightCls = si.classList.contains('nav-subitem-highlight') ? ' nav-flyout-highlight' : ''
      html += `<li`
      html += ` class="nav-flyout-item${activeCls}${highlightCls}"`
      html += ` data-page="${_esc(si.dataset.page || '')}"`
      html += ` data-breadcrumb="${_esc(si.dataset.breadcrumb || si.textContent.trim())}"`
      if (si.dataset.externalUrl) html += ` data-external-url="${_esc(si.dataset.externalUrl)}"`
      html += `>${_esc(si.textContent.trim())}</li>`
    })
    html += '</ul>'
    flyout.innerHTML = html

    // Posiciona alinhado com o item hovered
    const rect = mainEl.getBoundingClientRect()
    flyout.style.top  = `${rect.top}px`
    flyout.style.left = '64px'
    flyout.classList.add('active')
    flyout.dataset.openSection = navItem.dataset.section || ''

    // Ajuste de posição caso ultrapasse a base da viewport
    requestAnimationFrame(() => {
      const maxTop = window.innerHeight - flyout.offsetHeight - 8
      flyout.style.top = `${Math.min(rect.top, maxTop)}px`
    })

    // Cliques nos itens do flyout espelham o comportamento do sidebar normal
    flyout.querySelectorAll('.nav-flyout-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        const realSub = document.querySelector(`.nav-subitem[data-page="${item.dataset.page}"]`)
        if (realSub) handleSubItemClick(realSub)
        closeNavFlyout()
      })
    })
  }

  /**
   * Fecha o flyout do sidebar colapsado.
   * Exportado para que initGlobalClickHandler (app.js) possa fechar ao
   * clicar fora do sidebar.
   */
  function closeNavFlyout() {
    _cancelFlyoutClose()
    const flyout = document.getElementById('navFlyout')
    if (flyout) {
      flyout.classList.remove('active')
      flyout.dataset.openSection = ''
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 6. CLIQUE EM SUB-ITEM
  // ══════════════════════════════════════════════════════════════

  /**
   * Processa o clique em um sub-item:
   *   1. Remove active de todos os sub-itens
   *   2. Marca o clicado como active
   *   3. Marca o nav-item pai como has-active
   *   4. Atualiza o breadcrumb
   *   5. Troca a página visível
   *
   * Exportado porque o flyout e outros módulos (ex: botão "Voltar" do
   * placeholder) precisam acionar a navegação programaticamente.
   *
   * @param {HTMLElement} subItem — elemento .nav-subitem clicado
   */
  function handleSubItemClick(subItem) {
    // Link externo: abre em nova aba, nao altera SPA
    const extUrl = subItem.dataset.externalUrl
    if (extUrl) {
      window.open(extUrl, '_blank', 'noopener')
      return
    }

    // Atualiza estado visual dos sub-itens
    document.querySelectorAll('.nav-subitem').forEach(si => si.classList.remove('active'))
    subItem.classList.add('active')

    // Atualiza has-active no nav-item pai
    document.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('has-active'))
    const parentNavItem = subItem.closest('.nav-item')
    if (parentNavItem) parentNavItem.classList.add('has-active')

    // Breadcrumb e troca de página
    _updateBreadcrumb(subItem.dataset.breadcrumb || subItem.textContent)
    const pageId = subItem.dataset.page
    if (pageId) navigateTo(pageId)
  }

  // ══════════════════════════════════════════════════════════════
  // 7. BREADCRUMB
  // ══════════════════════════════════════════════════════════════

  /**
   * Atualiza os elementos de breadcrumb no header.
   * Formato esperado: "Seção > Página" ou "Seção > Sub > Página".
   *
   * @param {string} breadcrumb
   */
  function _updateBreadcrumb(breadcrumb) {
    const parts  = breadcrumb.split('>').map(p => p.trim())
    const textEl = document.getElementById('breadcrumbText')
    const currEl = document.getElementById('breadcrumbCurrent')

    if (parts.length >= 2) {
      if (textEl) textEl.textContent = parts[0]
      if (currEl) currEl.textContent = parts[parts.length - 1]
    } else {
      if (textEl) textEl.textContent = 'Dashboard'
      if (currEl) currEl.textContent = breadcrumb
    }

    _replaceFeatherIcons()
  }

  // ══════════════════════════════════════════════════════════════
  // 8. TROCA DE PÁGINA
  // ══════════════════════════════════════════════════════════════

  /**
   * Exibe a página com data-page correspondente ao pageId.
   * Páginas não implementadas exibem o placeholder com o título correto.
   *
   * @param {string} pageId — valor do data-page do sub-item
   */
  function navigateTo(pageId) {
    // Guard: bloquear navegacao se paciente em consulta sem finalizar
    if (window._checkPendingConsulta && !window._checkPendingConsulta(pageId)) return

    // Auto-collapse sidebar ao navegar
    document.body.classList.add('sidebar-collapsed')
    try { localStorage.setItem('sidebar_collapsed', '1') } catch {}

    // Persiste a página atual para sobreviver a reloads (F5)
    try { localStorage.setItem('clinicai_last_page', pageId) } catch {}

    // Atualiza ?page= na URL para refletir a página ativa.
    // Sem isso, um ?page= antigo na URL (ex: bookmark) sequestraria todo F5
    // independente da navegação subsequente — pois urlPage tem prioridade
    // sobre localStorage no buildSidebar.
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('page') !== pageId) {
        url.searchParams.set('page', pageId)
        history.replaceState(null, '', url.pathname + url.search + url.hash)
      }
    } catch {}

    // Oculta todas as páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))

    const targetPage = document.getElementById(`page-${pageId}`)

    let activePage = null

    if (targetPage) {
      targetPage.classList.add('active')
      activePage = targetPage
    } else {
      // Página não implementada → mostra placeholder com título correto
      const placeholder = document.getElementById('page-placeholder')
      if (placeholder) {
        const activeSubItem = document.querySelector('.nav-subitem.active')
        const titleEl = document.getElementById('placeholderTitle')
        if (titleEl && activeSubItem) {
          titleEl.textContent = activeSubItem.textContent.trim()
        }
        placeholder.classList.add('active')
        activePage = placeholder
      }
    }

    // Cirúrgico: reprocessa apenas os ícones da página recém-exibida
    _replaceFeatherIcons(activePage)

    // Lazy-load: carrega modulos pesados sob demanda
    _lazyLoad(pageId)

    // Hooks de módulos externos para páginas com init especial
    if (pageId === 'growth-partners') {
      if (typeof window.vpiRefreshKpis === 'function') window.vpiRefreshKpis('')
      if (typeof window.vpiRenderDashboard === 'function') window.vpiRenderDashboard()
    }
    if (pageId === 'growth-referral' && typeof window.vpiRenderRanking === 'function') {
      window.vpiRenderRanking('2')
    }
    if (pageId === 'settings-anamnese' && typeof window.initAnamneseAdmin === 'function') {
      window.initAnamneseAdmin()
    }
    if (pageId === 'settings-backups' && typeof window.renderSettingsBackups === 'function') {
      window.renderSettingsBackups()
    }
    if (pageId === 'wa-disparos' && typeof window.AutomationsUI?.init === 'function') {
      window.AutomationsUI.init('disparos-root', 'disparos')
    }
    if (pageId === 'funnel-automations' && typeof window.FunnelAutomationsUI?.init === 'function') {
      window.FunnelAutomationsUI.init('funnel-automations-root')
    }
    if (pageId === 'settings-automation' && typeof window.AutomationsUI?.init === 'function') {
      window.AutomationsUI.init('automations-root', 'rules')
    }
    if (pageId === 'inbox' && typeof window.InboxUI?.init === 'function') {
      window.InboxUI.init()
    }
    if (pageId === 'analytics-wa' && typeof window.AnalyticsUI?.init === 'function') {
      window.AnalyticsUI.init()
    }
    if (pageId === 'patients-prontuario' && typeof window._initProntuarioPage === 'function') {
      window._initProntuarioPage()
    }
    if (pageId === 'facial-analysis' && window.FaceMapping) {
      window.FaceMapping._resetToSelector()
    }

    // ── Leads contextualizados por funil ────────────────────────
    if (window.LeadsContext) {
      if (pageId === 'leads-fullface')   window.LeadsContext.init('fullface')
      if (pageId === 'leads-protocolos') window.LeadsContext.init('protocolos')
    }

    // ── Agenda: tabelas de leads por phase ───────────────────────
    if (window.AgendaLeads) {
      if (pageId === 'agenda-agendados')  window.AgendaLeads.renderAgendados()
      if (pageId === 'agenda-cancelados') window.AgendaLeads.renderCancelados()
    }

    // ── Pacientes: recarregar ao navegar ─────────────────────────
    if (pageId === 'patients-all' && window.loadPatients) {
      window.loadPatients()
    }

    // ── Orcamentos: recarregar ao navegar ────────────────────────
    if (pageId === 'orcamentos' && window.loadOrcamentos) {
      window.loadOrcamentos()
    }

    // ── Captação — Kanbans segmentados ──────────────────────────
    if (window.CaptacaoKanbans) {
      if (pageId === 'kanban-fullface')   window.CaptacaoKanbans.initFullFace()
      if (pageId === 'kanban-protocolos') window.CaptacaoKanbans.initProtocolos()
    }

    // ── Page Builder ──────────────────────────────────────────────
    if (pageId === 'page-builder' && window.PBEditor) {
      window.PBEditor.mount()
    }

    // ── Captação — Quiz contextualizado por funil ────────────────
    if (window.QuizAdmin) {
      if (pageId === 'quiz-fullface')    window.QuizAdmin.init('kanban-fullface')
      if (pageId === 'quiz-protocolos')  window.QuizAdmin.init('kanban-protocolos')
      if (pageId === 'quiz-templates')   window.QuizAdmin.init(null, 'quizAdminRoot')
    }

    // ── Relatórios Financeiros — hub + sub-relatórios ────────────
    if (window.FinReports) {
      if (pageId === 'fin-reports') {
        window.FinReports.render()
      } else if (/^fin-(cashflow|billing|receipts|default|ticket|conversion|commissions|by-procedure|by-patient|by-campaign)$/.test(pageId)) {
        window.FinReports.renderPage(pageId)
      }
    }

    // ── Mira (WhatsApp Assistente Interno) ──────────────────────
    if (pageId === 'mira-config' && window.MiraConfigUI) {
      window.MiraConfigUI.init()
    }
    if (pageId === 'mira-console' && window.MiraConsoleUI) {
      window.MiraConsoleUI.init()
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 9. HELPERS INTERNOS
  // ══════════════════════════════════════════════════════════════

  /** Abre a seção Dashboard por padrão ao carregar */
  function _openDefaultSection() {
    const defaultSection = document.querySelector('.nav-item[data-section="dashboard"]')
    if (defaultSection) {
      defaultSection.classList.add('open', 'has-active')
    }
  }

  /**
   * Reinicializa os ícones Feather cirurgicamente no container informado.
   * @param {Element|null} container — processa apenas ícones dentro deste elemento
   */
  function _replaceFeatherIcons(container) {
    featherIn(container, { 'stroke-width': 1.8, width: 16, height: 16 })
  }

  // ══════════════════════════════════════════════════════════════
  // 10. INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', async () => {
    // Carrega overrides de permissao do banco (nao bloqueia render)
    _loadPermOverrides().catch(function () {})
    // Build inicial com o perfil cacheado (null = modo dev → mostra tudo)
    const user = typeof window.getCurrentProfile === 'function' ? window.getCurrentProfile() : null
    buildSidebar(user)
  })

  /**
   * Reconstrói o sidebar quando o login completa e o papel/plano
   * do usuário ficam disponíveis.
   * Disparado por auth.js via:
   *   document.dispatchEvent(new CustomEvent('clinicai:auth-success', { detail: profile }))
   */
  document.addEventListener('clinicai:auth-success', async (e) => {
    // Recarrega permissoes com usuario autenticado
    _permOverrides = null
    await _loadPermOverrides()
    const user = e.detail
      || (typeof window.getCurrentProfile === 'function' ? window.getCurrentProfile() : null)
    buildSidebar(user)
  })

  // ══════════════════════════════════════════════════════════════
  // 11. API PÚBLICA
  // ══════════════════════════════════════════════════════════════

  Object.assign(window, {
    navigateTo,        // usado por: placeholder back btn, outros módulos JS
    handleSubItemClick,// usado por: flyout, links externos
    closeNavFlyout,    // usado por: initGlobalClickHandler (app.js)
    buildSidebar,      // usado por: admin panel (troca de plano/papel em runtime)
  })

})()
