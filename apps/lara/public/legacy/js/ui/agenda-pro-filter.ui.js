/**
 * ClinicAI — Agenda Professional Filter UI
 *
 * Componente de seleção de profissional para a agenda.
 * Renderiza pills clicáveis com cor, iniciais, nome e indicador de permissão.
 *
 * Depende de:
 *   AgendaAccessService  (agenda-access.service.js)
 *
 * Eventos emitidos:
 *   'clinicai:agenda-filter-changed'
 *     detail: { selected: string[] }  — array de profile IDs selecionados
 *     bubbles: true
 *
 * API pública (window.AgendaProFilterUI):
 *   mount(containerId)     — renderiza no container e escuta mudanças do serviço
 *   unmount()              — remove listeners, limpa DOM
 *   getSelected()          — array de profile IDs selecionados
 *   setSelected(ids)       — define seleção programaticamente
 *   selectAll()            — seleciona todos os visíveis
 *   selectSelf()           — seleciona apenas o próprio profissional
 */

;(function () {
  'use strict'

  if (window._clinicaiAgendaProFilterLoaded) return
  window._clinicaiAgendaProFilterLoaded = true

  // ── Estado interno ──────────────────────────────────────────────────────
  let _containerId = null
  let _selected    = new Set()
  let _mounted     = false

  // ── Helpers visuais ─────────────────────────────────────────────────────

  /** Retorna as iniciais de um nome (máx 2 chars) */
  function _initials(name) {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  /** Clareia uma cor hex em 40% (para background do pill) */
  function _lighten(hex) {
    try {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      const lr = Math.round(r + (255 - r) * 0.82)
      const lg = Math.round(g + (255 - g) * 0.82)
      const lb = Math.round(b + (255 - b) * 0.82)
      return `rgb(${lr},${lg},${lb})`
    } catch {
      return '#F3F4F6'
    }
  }

  /** Ícone SVG inline para indicar permissão */
  function _permIcon(permission) {
    if (permission === 'edit') {
      // lápis
      return `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" title="Pode editar">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>`
    }
    // olho (view-only)
    return `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" title="Somente leitura">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`
  }

  // ── Renderização ─────────────────────────────────────────────────────────

  function _render() {
    const container = document.getElementById(_containerId)
    if (!container) return

    const professionals = window.AgendaAccessService?.getAll() ?? []

    if (!professionals.length) {
      container.innerHTML = `
        <div style="padding:8px 12px;font-size:12px;color:#9CA3AF;font-style:italic">
          Nenhum profissional disponível
        </div>`
      return
    }

    container.innerHTML = ''

    // Botão "Todos"
    const allSelected = professionals.every(p => _selected.has(p.id))
    const btnAll = document.createElement('button')
    btnAll.dataset.proFilterAll = 'true'
    btnAll.style.cssText = `
      display:inline-flex;align-items:center;gap:6px;
      padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;
      cursor:pointer;border:1.5px solid;transition:all .15s;margin-right:6px;margin-bottom:6px;
      background:${allSelected ? '#7C3AED' : '#F9FAFB'};
      color:${allSelected ? '#fff' : '#6B7280'};
      border-color:${allSelected ? '#7C3AED' : '#E5E7EB'};`
    btnAll.textContent = 'Todos'
    btnAll.addEventListener('click', () => {
      if (allSelected) {
        _selected.clear()
      } else {
        professionals.forEach(p => _selected.add(p.id))
      }
      _render()
      _emit()
    })
    container.appendChild(btnAll)

    // Pill por profissional
    professionals.forEach(pro => {
      const isSelected = _selected.has(pro.id)
      const bg         = isSelected ? pro.color : _lighten(pro.color)
      const textColor  = isSelected ? '#fff'    : pro.color
      const border     = isSelected ? pro.color : _lighten(pro.color)

      const pill = document.createElement('button')
      pill.dataset.proFilterId = pro.id
      pill.style.cssText = `
        display:inline-flex;align-items:center;gap:6px;
        padding:5px 12px 5px 6px;border-radius:20px;font-size:12px;font-weight:600;
        cursor:pointer;border:1.5px solid;transition:all .15s;
        margin-right:6px;margin-bottom:6px;
        background:${bg};color:${textColor};border-color:${border};`

      // Avatar circular com iniciais
      const avatar = document.createElement('span')
      avatar.style.cssText = `
        width:22px;height:22px;border-radius:50%;
        background:${isSelected ? 'rgba(255,255,255,0.25)' : pro.color};
        color:${isSelected ? '#fff' : '#fff'};
        display:inline-flex;align-items:center;justify-content:center;
        font-size:9px;font-weight:800;flex-shrink:0`
      avatar.textContent = _initials(pro.display_name)

      const label = document.createElement('span')
      label.textContent = pro.display_name
      if (pro.is_self) {
        label.textContent += ' (Você)'
      }

      // Indicador de permissão
      const permEl = document.createElement('span')
      permEl.style.cssText = `
        opacity:0.7;display:inline-flex;align-items:center;
        margin-left:2px;`
      permEl.innerHTML = _permIcon(pro.permission)

      pill.appendChild(avatar)
      pill.appendChild(label)
      pill.appendChild(permEl)

      pill.addEventListener('click', () => {
        if (_selected.has(pro.id)) {
          _selected.delete(pro.id)
        } else {
          _selected.add(pro.id)
        }
        _render()
        _emit()
      })

      container.appendChild(pill)
    })
  }

  function _emit() {
    const container = document.getElementById(_containerId)
    if (!container) return
    container.dispatchEvent(new CustomEvent('clinicai:agenda-filter-changed', {
      detail:  { selected: Array.from(_selected) },
      bubbles: true,
    }))
  }

  // ── Listener de mudanças no serviço ────────────────────────────────────
  function _onServiceChange(professionals) {
    // Mantém a seleção atual se os IDs ainda existem; remove os inválidos
    const validIds = new Set(professionals.map(p => p.id))
    for (const id of _selected) {
      if (!validIds.has(id)) _selected.delete(id)
    }
    // Se nada selecionado, seleciona tudo por padrão
    if (_selected.size === 0) {
      professionals.forEach(p => _selected.add(p.id))
    }
    _render()
    _emit()
  }

  // ── API pública ─────────────────────────────────────────────────────────

  /**
   * Monta o componente no container indicado.
   * Renderiza imediatamente com os dados do cache e escuta atualizações.
   *
   * @param {string} containerId — id do elemento HTML
   */
  function mount(containerId) {
    if (_mounted) unmount()
    _containerId = containerId
    _mounted     = true

    // Seleção inicial: todos
    const all = window.AgendaAccessService?.getAll() ?? []
    all.forEach(p => _selected.add(p.id))

    _render()

    // Escuta mudanças do serviço
    window.AgendaAccessService?.onChange(_onServiceChange)
  }

  /**
   * Remove o componente e seus listeners.
   */
  function unmount() {
    if (!_mounted) return
    window.AgendaAccessService?.offChange(_onServiceChange)
    const container = document.getElementById(_containerId)
    if (container) container.innerHTML = ''
    _selected.clear()
    _containerId = null
    _mounted     = false
  }

  /**
   * @returns {string[]} — profile IDs selecionados
   */
  function getSelected() {
    return Array.from(_selected)
  }

  /**
   * Define a seleção programaticamente.
   * @param {string[]} ids
   */
  function setSelected(ids) {
    _selected = new Set(ids)
    _render()
    _emit()
  }

  /**
   * Seleciona todos os profissionais visíveis.
   */
  function selectAll() {
    const all = window.AgendaAccessService?.getAll() ?? []
    all.forEach(p => _selected.add(p.id))
    _render()
    _emit()
  }

  /**
   * Seleciona apenas o próprio profissional do usuário logado.
   */
  function selectSelf() {
    const all  = window.AgendaAccessService?.getAll() ?? []
    const self = all.find(p => p.is_self)
    _selected.clear()
    if (self) _selected.add(self.id)
    _render()
    _emit()
  }

  // ── Exposição global ────────────────────────────────────────────────────
  window.AgendaProFilterUI = Object.freeze({
    mount,
    unmount,
    getSelected,
    setSelected,
    selectAll,
    selectSelf,
  })

})()
