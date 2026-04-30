/**
 * ClinicAI — Dashboard Service (Sprint 6-C)
 *
 * Camada de negócio para KPIs do dashboard.
 * Estratégia: Supabase-first com fallback automático para localStorage.
 * Graceful degradation: funciona 100% offline sem nenhuma mudança de UX.
 *
 * Depende de:
 *   DashboardRepository  (dashboard.repository.js)
 *
 * API pública (window.DashboardService):
 *   getKPIs()  — retorna objeto de KPIs (Supabase ou localStorage)
 *
 * Formato de retorno (compatível com updateKPICards em dashboard.js):
 *   {
 *     leadsToday:        number,
 *     leadsYesterday:    number,
 *     totalLeads:        number,
 *     converted:         number,
 *     conversionRate:    number,   // percentual 0-100
 *     leadsTrend:        number,   // % variação vs ontem (pode ser null)
 *     appointmentsTotal: number,
 *     totalRevenue:      number,
 *     messagesAiToday:   number,
 *     funnel:            Array<{stage, count}>,
 *     _source:           'supabase' | 'localStorage'
 *   }
 */

;(function () {
  'use strict'

  if (window._clinicaiDashServiceLoaded) return
  window._clinicaiDashServiceLoaded = true

  // ── Fallback: calcula KPIs a partir do localStorage ───────────
  // Usado quando Supabase não está disponível (offline, não autenticado).
  // Lógica idêntica à que estava em _calcLocalKPIs() do dashboard.js,
  // porém aqui vive na camada de serviço — sem acoplamento ao módulo UI.
  function _calcFromLocalStorage() {
    try {
      // Combina: leads via cache unificado + appts com namespace por clinic_id
      const _apptKey = window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments'
      const leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : []
      const appts = JSON.parse(localStorage.getItem(_apptKey) || '[]')

      // Usa data LOCAL (não UTC) para evitar que leads criados às 22h-23h
      // apareçam como "hoje" no servidor UTC (UTC-3 → UTC+0 = dia seguinte)
      function _localDay(val) {
        const d = new Date(val)
        if (isNaN(d)) return ''
        return d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0')
      }
      const _now      = new Date()
      const today     = _localDay(_now)
      const _yd       = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 1)
      const yesterday = _localDay(_yd)
      const monthStr  = today.slice(0, 7)  // YYYY-MM local

      // ── Leads ─────────────────────────────────────────────────
      const activeLeads    = leads.filter(l => l.status !== 'archived')
      const leadsToday     = activeLeads.filter(l => _localDay(l.createdAt || l.created_at) === today).length
      const leadsYesterday = activeLeads.filter(l => _localDay(l.createdAt || l.created_at) === yesterday).length
      const totalLeads     = activeLeads.length
      const converted      = activeLeads.filter(l =>
        ['patient', 'paciente', 'converted', 'attending'].includes(l.status)
      ).length
      const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0
      const leadsTrend     = leadsYesterday > 0
        ? Math.round(((leadsToday - leadsYesterday) / leadsYesterday) * 100)
        : (leadsToday > 0 ? 100 : null)

      // ── Agendamentos & Receita ─────────────────────────────────
      const monthAppts   = appts.filter(a => (a.data || '').startsWith(monthStr))
      const totalRevenue = monthAppts
        .filter(a => a.status === 'finalizado')
        .reduce((sum, a) => sum + (parseFloat(a.valor) || 0), 0)

      // ── Funil ─────────────────────────────────────────────────
      const funnelMap = {}
      activeLeads.forEach(l => {
        const s = l.status || 'new'
        funnelMap[s] = (funnelMap[s] || 0) + 1
      })
      const funnel = Object.entries(funnelMap)
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count)

      return {
        leadsToday,
        leadsYesterday,
        totalLeads,
        converted,
        conversionRate,
        leadsTrend,
        appointmentsTotal: monthAppts.length,
        totalRevenue,
        messagesAiToday:   0,
        funnel,
        _source: 'localStorage',
      }
    } catch (err) {
      console.warn('[DashboardService] Fallback localStorage falhou:', err)
      return { _source: 'localStorage' }
    }
  }

  // ── getKPIs ───────────────────────────────────────────────────
  /**
   * Retorna KPIs consolidados da clínica.
   * Tenta Supabase primeiro; fallback automático para localStorage.
   *
   * @returns {Promise<object>}  KPIs no formato esperado por updateKPICards()
   */
  async function getKPIs() {
    const repo = window.DashboardRepository

    if (!repo) {
      return _calcFromLocalStorage()
    }

    const result = await repo.fetchKPIs()

    if (!result.ok || !result.data) {
      console.warn('[DashboardService] Supabase indisponível, usando localStorage:', result.error)
      return _calcFromLocalStorage()
    }

    // Supabase retorna números como strings em alguns drivers — normaliza
    const d = result.data
    return {
      leadsToday:        Number(d.leadsToday        ?? 0),
      leadsYesterday:    Number(d.leadsYesterday     ?? 0),
      totalLeads:        Number(d.totalLeads         ?? 0),
      converted:         Number(d.converted          ?? 0),
      conversionRate:    Number(d.conversionRate      ?? 0),
      leadsTrend:        d.leadsTrend != null ? Number(d.leadsTrend) : null,
      appointmentsTotal: Number(d.appointmentsTotal  ?? 0),
      totalRevenue:      Number(d.totalRevenue        ?? 0),
      messagesAiToday:   Number(d.messagesAiToday     ?? 0),
      funnel:            Array.isArray(d.funnel) ? d.funnel : [],
      _source:           'supabase',
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.DashboardService = Object.freeze({ getKPIs })

})()
