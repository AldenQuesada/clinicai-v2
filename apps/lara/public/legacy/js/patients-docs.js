/**
 * ClinicAI — Documentos do Paciente (page-patients-docs)
 *
 * Busca paciente por nome e lista todos os consentimentos assinados.
 * Integra com legal_doc_requests via Supabase.
 */
;(function () {
  'use strict'

  var _timer = null
  var STATUS = { pending: ['Pendente','#F59E0B'], viewed: ['Visualizado','#3B82F6'], signed: ['Assinado','#10B981'], expired: ['Expirado','#6B7280'], revoked: ['Revogado','#EF4444'] }

  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

  async function _search(query) {
    var el = document.getElementById('patdocs-results')
    if (!el || !window._sbShared) return

    var q = (query || '').trim()
    if (q.length < 2) { el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Digite o nome do paciente.</div>'; return }

    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">Buscando...</div>'

    var res = await window._sbShared.from('legal_doc_requests')
      .select('id,patient_name,professional_name,status,created_at,signed_at,template_id')
      .ilike('patient_name', '%' + q + '%')
      .neq('status', 'purged')
      .order('created_at', { ascending: false })
      .limit(50)

    var docs = res.data || []
    if (!docs.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum documento encontrado para "' + _esc(q) + '".</div>'; return }

    // Agrupar por paciente
    var byPatient = {}
    docs.forEach(function (d) {
      var name = d.patient_name || 'Desconhecido'
      if (!byPatient[name]) byPatient[name] = []
      byPatient[name].push(d)
    })

    var html = ''
    Object.keys(byPatient).forEach(function (name) {
      var list = byPatient[name]
      html += '<div style="margin-bottom:16px">'
        + '<div style="font-size:13px;font-weight:700;color:var(--text-primary);padding:8px 0;border-bottom:1px solid var(--border)">' + _esc(name) + ' <span style="font-size:11px;color:var(--text-muted);font-weight:400">(' + list.length + ' doc' + (list.length > 1 ? 's' : '') + ')</span></div>'

      list.forEach(function (d) {
        var s = STATUS[d.status] || [d.status, '#6B7280']
        var date = d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : ''
        var signedDate = d.signed_at ? new Date(d.signed_at).toLocaleString('pt-BR') : ''

        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">'
          + '<div style="width:6px;height:6px;border-radius:50%;background:' + s[1] + ';flex-shrink:0"></div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:11px;color:var(--text-muted)">' + date + ' | ' + _esc(d.professional_name || '') + '</div>'
          + '</div>'
          + '<span style="font-size:10px;padding:2px 8px;background:' + s[1] + '15;color:' + s[1] + ';border-radius:4px;font-weight:600">' + s[0] + '</span>'
          + (signedDate ? '<span style="font-size:9px;color:var(--text-muted)">' + signedDate + '</span>' : '')
          + '</div>'
      })
      html += '</div>'
    })

    el.innerHTML = html
  }

  window._searchPatientDocs = function (query) {
    clearTimeout(_timer)
    _timer = setTimeout(function () { _search(query) }, 300)
  }
})()
