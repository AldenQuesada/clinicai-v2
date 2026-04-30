// Dashboard: Aniversariantes da semana (birth_date em leads)
//
// Refactor 2026-04-19:
//   - Roteia por LeadsService (single-source — feedback_leads_data_source)
//   - Remove fetch REST direto ao Supabase com URL/chave hardcoded
//   - Normaliza phone p/ wa.me usando prefixo 55 (project_clinic_phone_normalization)
//   - Trata virada de ano (birthdays Jan quando today = Dez)
//   - Observer scoped + dedup init
;(function(){
  'use strict'

  if (window._clinicaiDashboardBirthdaysLoaded) return
  window._clinicaiDashboardBirthdaysLoaded = true

  var CONTAINER_ID = 'dashboard-birthdays'
  var _inited      = false
  var _observer    = null

  // Phone util: normaliza para wa.me. Prefixa 55 quando faltar (BR).
  function _waLink(phone) {
    if (!phone) return ''
    var digits = String(phone).replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length <= 11) digits = '55' + digits
    if (digits.length < 12 || digits.length > 13) return ''
    return 'https://wa.me/' + digits
  }

  function _esc(s){ var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML }

  async function _loadLeads() {
    if (window.LeadsService && typeof window.LeadsService.loadAll === 'function') {
      try { return await window.LeadsService.loadAll() } catch (e) { console.warn('[dashboard-birthdays] LeadsService.loadAll:', e) }
    }
    if (window.ClinicLeadsCache) {
      try { return window.ClinicLeadsCache.read() } catch (_){}
    }
    try { return JSON.parse(localStorage.getItem('clinicai_leads') || '[]') } catch (_) { return [] }
  }

  async function loadBirthdays(container) {
    try {
      // Roteia via LeadsService (LeadsService faz fetch via Supabase client configurado
      // com ClinicEnv; se offline, fallback pra localStorage). Elimina JWT hardcoded.
      var leads = await _loadLeads()
      if (!Array.isArray(leads) || !leads.length) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:#888;font-size:13px">Sem dados</div>'
        return
      }

      var today = new Date()
      today.setHours(0,0,0,0)
      var WINDOW_DAYS = 7
      var endOfWeek = new Date(today)
      endOfWeek.setDate(today.getDate() + WINDOW_DAYS)

      var birthdays = []
      leads.forEach(function(lead) {
        if (!lead || lead.deleted_at) return
        var bd = lead.birth_date || lead.birthDate || lead.nascimento
        if (!bd) return
        var parts = String(bd).split('-')
        if (parts.length < 3) return
        var bYear  = parseInt(parts[0], 10)
        var bMonth = parseInt(parts[1], 10)
        var bDay   = parseInt(parts[2], 10)
        if (isNaN(bMonth) || isNaN(bDay)) return

        // Data do aniversario este ano
        var bdayThisYear = new Date(today.getFullYear(), bMonth - 1, bDay)
        bdayThisYear.setHours(0,0,0,0)

        // Se ja passou este ano, considera proximo ano (lida com virada Dez -> Jan).
        var target = bdayThisYear
        if (bdayThisYear < today) {
          target = new Date(today.getFullYear() + 1, bMonth - 1, bDay)
          target.setHours(0,0,0,0)
        }

        if (target >= today && target < endOfWeek) {
          var age = target.getFullYear() - (bYear || target.getFullYear())
          var diffDays = Math.round((target - today) / 86400000)
          birthdays.push({
            name:  lead.name || lead.nome || '',
            phone: lead.phone || lead.telefone || lead.whatsapp || '',
            phase: lead.phase,
            date:  String(bDay).padStart(2,'0') + '/' + String(bMonth).padStart(2,'0'),
            age:   age > 0 ? age : null,
            diffDays: diffDays,
            id: lead.id,
          })
        }
      })

      birthdays.sort(function(a, b) { return a.diffDays - b.diffDays })

      if (!birthdays.length) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted,#888);font-size:13px">Nenhum aniversariante esta semana</div>'
        _updateLabel(0)
        return
      }

      var html = ''
      birthdays.forEach(function(b) {
        var dayLabel = b.diffDays === 0 ? 'Hoje' : b.diffDays === 1 ? 'Amanha' : 'em ' + b.diffDays + ' dias'
        var dotClass = b.diffDays === 0 ? 'timeline-dot-emerald' : b.diffDays <= 2 ? 'timeline-dot-warning' : 'timeline-dot-blue'
        var waLink   = _waLink(b.phone)
        var ageStr   = b.age ? (b.age + ' anos') : ''

        html += '<div class="timeline-item">'
        html +=   '<div class="timeline-time">' + _esc(b.date) + '</div>'
        html +=   '<div class="timeline-dot ' + dotClass + '"></div>'
        html +=   '<div class="timeline-content">'
        html +=     '<div class="timeline-name">' + _esc(b.name) + '</div>'
        html +=     '<div class="timeline-proc">' + (ageStr ? _esc(ageStr) + ' &middot; ' : '') + _esc(dayLabel) + '</div>'
        if (waLink) {
          html += '    <a href="' + waLink + '" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--accent,#7c5cfc);text-decoration:none">Enviar parabens</a>'
        }
        html +=   '</div>'
        html += '</div>'
      })

      container.innerHTML = html
      _updateLabel(birthdays.length)
    } catch(e) {
      console.warn('[dashboard-birthdays] load:', e)
      container.innerHTML = '<div style="text-align:center;padding:24px;color:#888;font-size:13px">Erro ao carregar</div>'
    }
  }

  function _updateLabel(count) {
    var label = document.getElementById('birthday-period-label')
    if (label) label.textContent = count > 0 ? (count + ' esta semana') : 'Esta semana'
  }

  function init() {
    var el = document.getElementById(CONTAINER_ID)
    if (!el) return
    _inited = true
    if (_observer) { try { _observer.disconnect() } catch(_){} _observer = null }
    loadBirthdays(el)
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  window.addEventListener('clinicai:page-changed', function(e) {
    if (e && e.detail && e.detail.page === 'dashboard-overview') init()
  })

  // Fallback observer — scoped a dashboard-overview se disponivel, com auto-disconnect.
  var scope = document.getElementById('page-dashboard-overview') || document.body
  _observer = new MutationObserver(function() {
    if (_inited) { try { _observer.disconnect() } catch(_){} _observer = null; return }
    var el = document.getElementById(CONTAINER_ID)
    if (el) init()
  })
  _observer.observe(scope, { childList: true, subtree: true })
  setTimeout(function(){ if (_observer) { try { _observer.disconnect() } catch(_){} _observer = null } }, 30000)
})()
