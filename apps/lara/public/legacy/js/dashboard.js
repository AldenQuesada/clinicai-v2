/**
 * ClinicAI — Dashboard Module
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  CONTRATO DE INICIALIZAÇÃO — LEIA ANTES DE MODIFICAR        ║
 * ║                                                              ║
 * ║  loadDashboardData() é PRIVADA deste módulo.                 ║
 * ║  Nunca chame loadDashboardData() de outro arquivo.           ║
 * ║                                                              ║
 * ║  Para acionar o dashboard após login, dispare o evento:      ║
 * ║    document.dispatchEvent(new CustomEvent('clinicai:auth-success')) ║
 * ║                                                              ║
 * ║  Este módulo reage ao evento e se auto-inicializa.           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── Listener de autenticação ──────────────────────────────────
// Qualquer módulo que precisar reagir ao login deve seguir este padrão,
// jamais referenciar funções internas de outros arquivos diretamente.
document.addEventListener('clinicai:auth-success', () => loadDashboardData())

// ─── Carregar dados do dashboard ─────────────────────────────
async function loadDashboardData() {
  try {
    // Usa getCurrentProfile() (novo sistema multi-usuário)
    const profile = typeof window.getCurrentProfile === 'function'
      ? window.getCurrentProfile()
      : null

    if (profile) {
      const fullName  = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || '—'
      const parts     = fullName.trim().split(/\s+/)
      const shortName = parts.slice(0, 2).join(' ')
      const initials  = parts.map(n => n[0]).join('').slice(0, 2).toUpperCase()

      const roleLabels = {
        owner:        'Proprietário',
        admin:        'Administrador',
        therapist:    'Terapeuta',
        receptionist: 'Recepcionista',
        viewer:       'Visualizador',
      }
      const roleLabel = roleLabels[profile.role] || profile.role || ''

      const els = {
        headerAvatarInitials:   initials,
        headerAvatarInitialsLg: initials,
        headerUserName:         shortName,
        headerUserNameLg:       fullName,
        headerUserEmail:        profile.email || '',
        headerUserRole:         roleLabel,
        dashboardWelcomeName:   shortName,
        actAvatar1:             initials,
        actAvatar2:             initials,
        actName1:               shortName,
        actName2:               shortName,
      }
      Object.entries(els).forEach(([id, val]) => {
        const el = document.getElementById(id)
        if (el) el.textContent = val
      })

      // Sidebar footer — dados da clínica
      const clinicName = profile.clinic_name || 'ClinicAI'
      const clinicInitials = clinicName.split(' ')
        .filter(w => w.length > 2).map(w => w[0]).join('').slice(0, 2).toUpperCase() || clinicName.slice(0, 2).toUpperCase()
      const sca = document.getElementById('sidebarClinicAvatar')
      const scn = document.getElementById('sidebarClinicName')
      const scp = document.getElementById('sidebarClinicPlan')
      if (sca) sca.textContent = clinicInitials
      if (scn) scn.textContent = clinicName
      if (scp) scp.textContent = 'Plano Premium'
    }

    // Sprint 6-C: KPIs via Supabase (server-side) com fallback automático para localStorage
    const dashboardData = window.DashboardService
      ? await window.DashboardService.getKPIs()
      : _calcLocalKPIs()
    updateKPICards(dashboardData)
    if (dashboardData.funnel?.length) updateFunnel(dashboardData)
    loadLeads()

  } catch (err) {
    console.error('Erro ao carregar dashboard:', err)
  }
}

// ─── KPIs calculados do localStorage ─────────────────────────
function _calcLocalKPIs() {
  try {
    // Combina ambos fixes: leads via cache unificado + appts com namespace por clinic_id
    const _apptKey = window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments'
    const leads = window.ClinicLeadsCache ? ClinicLeadsCache.read() : []
    const appts = JSON.parse(localStorage.getItem(_apptKey) || '[]')

    function _localDay(val) {
      const d = new Date(val)
      if (isNaN(d)) return ''
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0')
    }
    const _now    = new Date()
    const today   = _localDay(_now)
    const monthStr  = today.slice(0, 7)  // YYYY-MM local

    const leadsToday  = leads.filter(l => _localDay(l.createdAt || l.created_at) === today).length
    const totalLeads  = leads.length
    const converted   = leads.filter(l => l.status === 'paciente' || l.status === 'converted').length
    const convRate    = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0

    const monthAppts  = appts.filter(a => (a.data || '').startsWith(monthStr))
    const totalAppts  = monthAppts.length
    const totalRevenue = monthAppts
      .filter(a => a.status === 'finalizado')
      .reduce((sum, a) => sum + (parseFloat(a.valor) || 0), 0)

    return {
      leadsToday,
      totalLeads,
      appointmentsTotal: totalAppts,
      conversionRate:    convRate,
      totalRevenue,
      messagesAiToday:   0,
      leadsTrend:        null,
    }
  } catch {
    return {}
  }
}

// ─── KPI Cards ───────────────────────────────────────────────
function updateKPICards(data) {
  setText('kpiLeadsHoje',     data.leadsToday   ?? '--')
  setText('kpiAgendamentos',  data.appointmentsTotal ?? '--')
  setText('kpiConversao',     data.conversionRate != null ? `${data.conversionRate}%` : '--')
  setText('kpiReceita',       data.totalRevenue  != null ? formatCurrency(data.totalRevenue) : '--')
  setText('kpiMensagensIA',   data.messagesAiToday ?? '--')
  setText('kpiTotalLeads',    data.totalLeads   ?? '--')

  // Trend de leads
  if (data.leadsTrend != null) {
    const trendEl = document.getElementById('kpiLeadsTrend')
    if (trendEl) {
      const up = data.leadsTrend >= 0
      trendEl.textContent = `${up ? '+' : ''}${data.leadsTrend}% vs ontem`
      trendEl.style.color = up ? '#10B981' : '#EF4444'
    }
  }
}

// ─── Funnel ──────────────────────────────────────────────────
function updateFunnel(data) {
  if (!data.funnel) return
  data.funnel.forEach(stage => {
    const key = stage.stage.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')
    const countEl = document.getElementById(`funnel-count-${key}`)
    const pctEl   = document.getElementById(`funnel-pct-${key}`)
    const barEl   = document.getElementById(`funnel-bar-${key}`)
    if (countEl) countEl.textContent = stage.count
    if (pctEl)   pctEl.textContent   = `${stage.pct}%`
    if (barEl)   barEl.style.width   = `${stage.pct}%`
  })
}
