/**
 * ClinicAI — Prontuário Module (Page Controller)
 *
 * Controlador da página "Prontuário Eletrônico" (page-patients-prontuario).
 * Gerencia:
 *   • Busca e seleção de paciente
 *   • Estado da página (seleção → visualização)
 *   • Delegação para MedicalRecordEditorUI
 *
 * Depende de:
 *   MedicalRecordEditorUI  (medical-record-editor.ui.js)
 *   MedicalRecordsService  (medical-records.service.js)
 *
 * Ponto de entrada externo:
 *   window.openProntuario(patientId, patientName)  — chamado de patients.js
 */

;(function () {
  'use strict'

  const EDITOR_CONTAINER = 'prontuario-editor-root'
  let _currentPatientId   = null

  // ── Ponto de entrada externo ──────────────────────────────────
  /**
   * Abre o prontuário de um paciente diretamente, navegando para a página.
   * Chamado por patients.js via botão "Ver Prontuário".
   */
  function openProntuario(patientId, patientName) {
    // Navega para a página via sidebar
    const navItem = document.querySelector('.nav-subitem[data-page="patients-prontuario"]')
    if (navItem && typeof window.handleSubItemClick === 'function') {
      window.handleSubItemClick(navItem)
    } else if (typeof window.navigateTo === 'function') {
      window.navigateTo('patients-prontuario')
    }
    // Aguarda o DOM estabilizar antes de abrir o paciente
    setTimeout(() => _openPatient(patientId, patientName || 'Paciente'), 50)
  }

  // ── Inicialização da página ───────────────────────────────────
  function _init() {
    const searchInput = document.getElementById('prontuario-search')
    if (searchInput) {
      searchInput.addEventListener('input', _debounce(_onSearch, 300))
    }

    const backBtn = document.getElementById('prontuario-back-btn')
    if (backBtn) backBtn.addEventListener('click', _showSearch)

    // Se chamado com paciente pré-selecionado via openProntuario, não mostra busca
    if (!_currentPatientId) {
      _showSearch()
    }
  }

  // ── Busca de pacientes ────────────────────────────────────────
  function _onSearch() {
    const query = document.getElementById('prontuario-search')?.value.trim().toLowerCase() || ''
    const leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : []

    const results = query.length < 2
      ? leads.slice(0, 20)
      : leads.filter(l => {
          const name = (l.name || l.nome || '').toLowerCase()
          const phone = (l.phone || l.whatsapp || '').toLowerCase()
          return name.includes(query) || phone.includes(query)
        }).slice(0, 20)

    _renderSearchResults(results)
  }

  function _renderSearchResults(leads) {
    const list = document.getElementById('prontuario-search-results')
    if (!list) return

    if (!leads.length) {
      list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum paciente encontrado.</div>`
      return
    }

    list.innerHTML = leads.map(l => {
      const name  = l.name || l.nome || '—'
      const phone = l.phone || l.whatsapp || ''
      const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
      return `<div onclick="window._prontuarioSelectPatient('${_esc(l.id)}', '${_esc(name)}')"
        style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s"
        onmouseover="this.style.background='var(--surface-hover,#F9FAFB)'" onmouseout="this.style.background='transparent'">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--accent-gold)1A;color:var(--accent-gold);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${initials}</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${_esc(name)}</div>
          ${phone ? `<div style="font-size:12px;color:var(--text-muted)">${_esc(phone)}</div>` : ''}
        </div>
      </div>`
    }).join('')
  }

  // ── Seleção de paciente ───────────────────────────────────────
  function _openPatient(patientId, patientName) {
    _currentPatientId = patientId

    // Oculta busca, exibe editor
    const searchPanel = document.getElementById('prontuario-search-panel')
    const editorPanel = document.getElementById('prontuario-editor-panel')
    const nameEl      = document.getElementById('prontuario-patient-name')

    if (searchPanel) searchPanel.style.display = 'none'
    if (editorPanel) editorPanel.style.display = 'block'
    if (nameEl)      nameEl.textContent = patientName

    const svc = window.MedicalRecordsService
    if (!svc) {
      document.getElementById(EDITOR_CONTAINER).innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">
          Prontuário eletrônico requer conexão com Supabase.<br>Verifique sua conexão e recarregue a página.
        </div>`
      return
    }

    if (typeof window.MedicalRecordEditorUI?.mount === 'function') {
      window.MedicalRecordEditorUI.mount(EDITOR_CONTAINER, { patientId, patientName })
    }
  }

  function _showSearch() {
    _currentPatientId = null
    if (window.MedicalRecordEditorUI) {
      window.MedicalRecordEditorUI.unmount(EDITOR_CONTAINER)
    }
    const searchPanel = document.getElementById('prontuario-search-panel')
    const editorPanel = document.getElementById('prontuario-editor-panel')
    if (searchPanel) searchPanel.style.display = 'block'
    if (editorPanel) editorPanel.style.display = 'none'

    const input = document.getElementById('prontuario-search')
    if (input) { input.value = ''; input.focus() }
    _onSearch()
  }

  // ── Utilities ─────────────────────────────────────────────────
  // Unificado com ClinicEsc para escape completo (inclui &, <, >, ', ").
  // Para interpolacao em onclick="fn('{id}','{name}')" use ClinicEsc.js (JS escape)
  // apos ClinicEsc.html (HTML escape); caso contrario, escape HTML apenas.
  function _esc(str) {
    if (window.ClinicEsc && window.ClinicEsc.html) return window.ClinicEsc.html(str)
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function _debounce(fn, ms) {
    let t
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.openProntuario           = openProntuario
  window._prontuarioSelectPatient = _openPatient

  // Chamado pelo sidebar.js quando a página de prontuário é ativada
  window._initProntuarioPage = function () {
    _init()
    if (!_currentPatientId) _onSearch()
  }

})()
