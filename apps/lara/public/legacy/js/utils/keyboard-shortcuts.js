;(function () {
  'use strict'
  if (window._kbShortcutsLoaded) return
  window._kbShortcutsLoaded = true

  // ── Dark mode toggle ──────────────────────────────────────
  var THEME_KEY = 'clinicai_theme'
  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
    var icon = document.getElementById('themeToggleIcon')
    if (icon) icon.setAttribute('data-feather', theme === 'dark' ? 'sun' : 'moon')
    if (window.feather) feather.replace()
  }
  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light'
    _applyTheme(current === 'dark' ? 'light' : 'dark')
  }
  var saved = localStorage.getItem(THEME_KEY)
  if (saved) _applyTheme(saved)
  window.toggleTheme = toggleTheme

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase()
    var inInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable

    // Esc — fechar modal aberto
    if (e.key === 'Escape') {
      var apptModal = document.getElementById('apptModal')
      if (apptModal && apptModal.style.display !== 'none') {
        if (window.closeApptModal) closeApptModal()
        return
      }
      var finModal = document.getElementById('finModal')
      if (finModal && finModal.style.display !== 'none') {
        finModal.style.display = 'none'
        document.body.style.overflow = ''
        return
      }
    }

    if (inInput) return

    // Ctrl+N ou Ctrl+Shift+N — novo agendamento
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault()
      if (window.openApptModal) openApptModal()
      return
    }

    // Ctrl+K — busca rapida (foca no campo de busca de leads se visivel)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      var searchInputs = ['appt_paciente_q', 'searchLeads', 'leadsSearchInput', 'patientsSearchInput']
      for (var i = 0; i < searchInputs.length; i++) {
        var el = document.getElementById(searchInputs[i])
        if (el && el.offsetParent !== null) { el.focus(); el.select(); return }
      }
      var globalSearch = document.querySelector('[data-global-search]')
      if (globalSearch) { globalSearch.focus(); globalSearch.select() }
      return
    }
  })
})()
