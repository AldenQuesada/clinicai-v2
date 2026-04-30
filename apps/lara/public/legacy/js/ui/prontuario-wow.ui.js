/**
 * ClinicAI — Prontuario WOW Effects
 *
 * Modulo de efeitos premium para o prontuario clinico:
 *   1. Timeline Unificada (cronologia mista de todos os eventos)
 *   2. Header do Paciente Premium (foto, idade, tags, resumo)
 *   3. Alertas Clinicos Persistentes (banner alergias/restricoes)
 *   4. Galeria Before/After (fotos face mapping + anexos)
 *   5. Prescricao Estruturada (medicamento, dose, frequencia)
 *   6. Evolucao SOAP (Subjetivo/Objetivo/Avaliacao/Plano)
 *   7. Historico Financeiro Completo (LTV, grafico, orcamentos)
 *   8. Export PDF Professional (logo clinica, selecao registros)
 *   9. Comparador Before/After (2 datas lado a lado)
 *  10. Assinatura Digital (selo, bloqueia edicao)
 *
 * Depende de:
 *   MedicalRecordEditorUI  (medical-record-editor.ui.js)
 *   window._sbShared       (supabase client)
 *   Chart.js               (graficos financeiros)
 */

;(function () {
  'use strict'

  if (window._clinicaiProntuarioWowLoaded) return
  window._clinicaiProntuarioWowLoaded = true

  // ── Helpers ───────────────────────────────────────────────────
  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
  function _fmtDate(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  }
  function _fmtDateShort(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
  }
  function _age(birthDate) {
    if (!birthDate) return null
    var d = new Date(birthDate)
    var now = new Date()
    var age = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--
    return age
  }
  function _phoneFmt(phone) {
    if (!phone) return ''
    var clean = phone.replace(/\D/g, '')
    if (clean.length === 11) return '(' + clean.slice(0,2) + ') ' + clean.slice(2,7) + '-' + clean.slice(7)
    if (clean.length === 13) return '+' + clean.slice(0,2) + ' (' + clean.slice(2,4) + ') ' + clean.slice(4,9) + '-' + clean.slice(9)
    return phone
  }

  // ── SVG Icons ─────────────────────────────────────────────────
  var ICO = {
    timeline:  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    user:      '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    alert:     '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    phone:     '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>',
    calendar:  '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    file:      '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    dollar:    '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    chat:      '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    camera:    '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    pill:      '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="6" rx="3"/><line x1="12" y1="11" x2="12" y2="17"/></svg>',
    check:     '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    shield:    '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    download:  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    pen:       '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    lock:      '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
    tag:       '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  }

  // ── Event type config for unified timeline ────────────────────
  var TIMELINE_TYPES = {
    nota_clinica:  { label: 'Nota Clinica',  color: '#3B82F6', icon: ICO.file },
    evolucao:      { label: 'Evolucao',      color: '#10B981', icon: ICO.check },
    prescricao:    { label: 'Prescricao',    color: '#8B5CF6', icon: ICO.pill },
    alerta:        { label: 'Alerta',        color: '#EF4444', icon: ICO.alert },
    observacao:    { label: 'Observacao',    color: '#F59E0B', icon: ICO.file },
    procedimento:  { label: 'Procedimento',  color: '#06B6D4', icon: ICO.calendar },
    anamnese:      { label: 'Anamnese',      color: '#EC4899', icon: ICO.file },
    agendamento:   { label: 'Agendamento',   color: '#8B5CF6', icon: ICO.calendar },
    documento:     { label: 'Documento',     color: '#059669', icon: ICO.shield },
    whatsapp:      { label: 'WhatsApp',      color: '#25D366', icon: ICO.chat },
    pagamento:     { label: 'Pagamento',     color: '#10B981', icon: ICO.dollar },
    foto:          { label: 'Foto',          color: '#F97316', icon: ICO.camera },
    quiz:          { label: 'Avaliacao',     color: '#6366F1', icon: ICO.check },
    analise_facial:{ label: 'Analise Facial', color: '#C8A97E', icon: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2C8.5 2 6 5 6 9c0 2 .5 3.5 1.5 5C9 16 10 18 10 20h4c0-2 1-4 2.5-6 1-1.5 1.5-3 1.5-5 0-4-2.5-7-6-7z"/><circle cx="9.5" cy="8.5" r=".5" fill="currentColor"/><circle cx="14.5" cy="8.5" r=".5" fill="currentColor"/></svg>' },
  }

  // ================================================================
  // WOW #2: Header do Paciente Premium
  // ================================================================
  function renderPatientHeader(patientId, patientName) {
    var leads = []
    try { leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [] } catch (e) {}
    var lead = leads.find(function (l) { return l.id === patientId }) || {}

    var name = patientName || lead.name || lead.nome || 'Paciente'
    var phone = lead.phone || lead.whatsapp || ''
    var email = lead.email || ''
    var birthDate = lead.birth_date || lead.data_nascimento || null
    var patientAge = _age(birthDate)
    var initials = name.trim().split(/\s+/).map(function(w){return w[0]}).join('').slice(0,2).toUpperCase()
    var tags = lead.tags || []
    if (typeof tags === 'string') try { tags = JSON.parse(tags) } catch(e) { tags = [] }
    var origem = lead.origem || lead.source || ''
    var phase = lead.phase || lead.fase || ''

    // Calculate days since last appointment
    var lastVisitText = ''
    try {
      var _apptKey = window.ClinicStorage ? window.ClinicStorage.nsKey('clinicai_appointments') : 'clinicai_appointments'
      var appts = JSON.parse(localStorage.getItem(_apptKey) || '[]')
      var patAppts = appts.filter(function(a) { return a.pacienteId === patientId || a.patient_id === patientId })
      if (patAppts.length) {
        var sorted = patAppts.sort(function(a,b) { return (b.data||b.scheduled_date||'').localeCompare(a.data||a.scheduled_date||'') })
        var lastDate = sorted[0].data || sorted[0].scheduled_date
        if (lastDate) {
          var diff = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000)
          lastVisitText = diff === 0 ? 'Hoje' : diff === 1 ? 'Ontem' : 'Ha ' + diff + ' dias'
        }
      }
    } catch(e) {}

    var html = '<div style="background:linear-gradient(135deg,var(--surface) 0%,#F8F6F3 100%);border:1.5px solid var(--border);border-radius:14px;padding:20px;margin-bottom:16px">'

    // Row 1: Avatar + Info + Actions
    html += '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">'

    // Avatar
    html += '<div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#C9A96E,#D4B978);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:800;flex-shrink:0;box-shadow:0 4px 12px rgba(201,169,110,.3)">'
      + initials + '</div>'

    // Name + meta
    html += '<div style="flex:1;min-width:200px">'
      + '<div style="font-size:16px;font-weight:800;color:var(--text-primary);letter-spacing:-.02em">' + _esc(name) + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px">'

    if (patientAge !== null) {
      html += '<span style="font-size:11px;color:var(--text-muted)">' + patientAge + ' anos</span>'
    }
    if (phone) {
      var waLink = 'https://wa.me/' + phone.replace(/\D/g,'')
      html += '<a href="' + waLink + '" target="_blank" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#25D366;text-decoration:none;font-weight:600">'
        + ICO.phone + ' ' + _esc(_phoneFmt(phone)) + '</a>'
    }
    if (lastVisitText) {
      html += '<span style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:3px">' + ICO.calendar + ' ' + lastVisitText + '</span>'
    }
    if (origem) {
      html += '<span style="font-size:10px;padding:2px 8px;background:#3B82F61A;color:#3B82F6;border-radius:4px;font-weight:600">' + _esc(origem) + '</span>'
    }

    html += '</div></div>'

    // Quick actions
    html += '<div style="display:flex;gap:6px;flex-shrink:0">'
      + '<button onclick="ProntuarioWow.exportPDF()" title="Exportar PDF" style="width:34px;height:34px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">' + ICO.download + '</button>'
      + '</div>'

    html += '</div>'

    // Row 2: Tags
    if (tags.length || phase) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px">'
      if (phase) {
        html += '<span style="font-size:10px;padding:3px 10px;background:#C9A96E1A;color:#C9A96E;border-radius:12px;font-weight:700;display:flex;align-items:center;gap:3px">' + ICO.tag + ' ' + _esc(phase) + '</span>'
      }
      tags.forEach(function(t) {
        var tName = typeof t === 'string' ? t : (t.name || t.label || '')
        var tColor = (typeof t === 'object' && t.color) ? t.color : '#6B7280'
        if (tName) {
          html += '<span style="font-size:10px;padding:3px 10px;background:' + tColor + '1A;color:' + tColor + ';border-radius:12px;font-weight:600">' + _esc(tName) + '</span>'
        }
      })
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  // ================================================================
  // WOW #3: Alertas Clinicos Persistentes
  // ================================================================
  async function renderClinicalAlerts(patientId) {
    // Buscar alertas do prontuario (tipo 'alerta')
    var sb = window._sbShared
    if (!sb) return ''

    var res = await sb.from('medical_records')
      .select('id,title,content,created_at')
      .eq('patient_id', patientId)
      .eq('record_type', 'alerta')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5)

    var alerts = (res.data || [])
    if (!alerts.length) return ''

    var html = '<div style="background:linear-gradient(135deg,#FEF2F2,#FFF7ED);border:1.5px solid #EF444440;border-radius:10px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px">'
      + '<div style="flex-shrink:0;margin-top:2px;color:#EF4444">' + ICO.alert + '</div>'
      + '<div style="flex:1">'
      + '<div style="font-size:11px;font-weight:700;color:#EF4444;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px">Alertas Clinicos</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">'

    alerts.forEach(function(a) {
      var text = a.title || (a.content || '').substring(0, 60)
      html += '<span style="font-size:11px;padding:3px 10px;background:#FEE2E2;color:#DC2626;border-radius:6px;font-weight:600">' + _esc(text) + '</span>'
    })

    html += '</div></div></div>'
    return html
  }

  // ================================================================
  // WOW #1: Timeline Unificada
  // ================================================================
  async function renderUnifiedTimeline(patientId, patientName) {
    var sb = window._sbShared
    if (!sb) return '<div style="padding:20px;text-align:center;color:var(--text-muted)">Supabase indisponivel</div>'

    var events = []

    // 1. Medical records
    var mrRes = await sb.from('medical_records')
      .select('id,record_type,title,content,professional_id,created_at,is_confidential')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    ;(mrRes.data || []).forEach(function(r) {
      events.push({ type: r.record_type, date: r.created_at, title: r.title || TIMELINE_TYPES[r.record_type]?.label || 'Registro', detail: (r.content || '').substring(0, 120), source: 'medical_records', id: r.id, confidential: r.is_confidential })
    })

    // 2. Appointments
    var apRes = await sb.from('appointments')
      .select('id,procedimento,procedure_name,professional_name,scheduled_date,data,status,valor')
      .or('patient_id.eq.' + patientId + ',pacienteId.eq.' + patientId)
      .order('scheduled_date', { ascending: false })
      .limit(30)
    ;(apRes.data || []).forEach(function(a) {
      var date = a.data || a.scheduled_date
      var proc = a.procedimento || a.procedure_name || 'Consulta'
      var statusLabel = { agendado:'Agendado', confirmado:'Confirmado', em_consulta:'Em consulta', finalizado:'Finalizado', cancelado:'Cancelado', no_show:'No-show' }
      events.push({ type: 'agendamento', date: date, title: proc, detail: (a.professional_name || '') + ' · ' + (statusLabel[a.status] || a.status) + (a.valor ? ' · R$ ' + Number(a.valor).toFixed(2).replace('.',',') : ''), source: 'appointments', id: a.id })
    })

    // 3. Legal documents
    var docRes = await sb.from('legal_doc_requests')
      .select('id,professional_name,status,created_at,signed_at')
      .or('patient_id.eq.' + patientId + ',patient_name.ilike.%' + (patientName || '').trim() + '%')
      .neq('status', 'purged')
      .order('created_at', { ascending: false })
      .limit(20)
    ;(docRes.data || []).forEach(function(d) {
      var statusMap = { pending:'Pendente', viewed:'Visualizado', signed:'Assinado', expired:'Expirado', revoked:'Revogado' }
      events.push({ type: 'documento', date: d.created_at, title: 'Consentimento', detail: (d.professional_name || '') + ' · ' + (statusMap[d.status] || d.status), source: 'legal_doc_requests', id: d.id })
    })

    // 4. WhatsApp messages (last 20)
    var leads = []
    try { leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [] } catch(e) {}
    var lead = leads.find(function(l) { return l.id === patientId }) || {}
    var phone = (lead.phone || lead.whatsapp || '').replace(/\D/g, '')
    if (phone.length >= 8) {
      var suffix = phone.slice(-8)
      var waRes = await sb.from('wa_messages')
        .select('id,from_me,content,message_type,timestamp')
        .like('remote_jid', '%' + suffix + '%')
        .order('timestamp', { ascending: false })
        .limit(20)
      ;(waRes.data || []).forEach(function(m) {
        var content = m.content || (m.message_type === 'image' ? '[Imagem]' : m.message_type === 'audio' ? '[Audio]' : '[Mensagem]')
        events.push({ type: 'whatsapp', date: m.timestamp, title: m.from_me ? 'Mensagem enviada' : 'Mensagem recebida', detail: content.substring(0, 80), source: 'wa_messages', id: m.id })
      })
    }

    // 5. Attachments
    var attRes = await sb.from('medical_record_attachments')
      .select('id,file_name,file_type,created_at')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10)
    ;(attRes.data || []).forEach(function(f) {
      events.push({ type: 'foto', date: f.created_at, title: f.file_name, detail: f.file_type || '', source: 'attachments', id: f.id })
    })

    // 6. Facial analysis sessions (Supabase + localStorage)
    try {
      var fmRes = await sb.from('facial_sessions')
        .select('id,session_data,gpt_analysis,updated_at,created_at')
        .eq('lead_id', patientId)
        .order('updated_at', { ascending: false })
        .limit(10)
      ;(fmRes.data || []).forEach(function(fs) {
        var sd = null
        try { sd = typeof fs.session_data === 'string' ? JSON.parse(fs.session_data) : fs.session_data } catch(e) {}
        var annCount = sd && sd.annotations ? sd.annotations.length : 0
        var photoCount = sd && sd.photos ? Object.keys(sd.photos).filter(function(k) { return sd.photos[k] }).length : 0
        var detail = photoCount + ' foto' + (photoCount !== 1 ? 's' : '') + ' · ' + annCount + ' marcacao' + (annCount !== 1 ? 'es' : '')
        if (sd && sd.annotations && sd.annotations.length > 0) {
          var zoneNames = []
          sd.annotations.forEach(function(a) {
            var name = a.zone || ''
            if (name && zoneNames.indexOf(name) === -1) zoneNames.push(name)
          })
          if (zoneNames.length > 0) detail += ' · ' + zoneNames.slice(0, 4).join(', ') + (zoneNames.length > 4 ? ' +' + (zoneNames.length - 4) : '')
        }
        events.push({
          type: 'analise_facial', date: fs.updated_at || fs.created_at,
          title: 'Analise Facial', detail: detail,
          source: 'facial_sessions', id: fs.id,
          _fmSessionId: fs.id, _fmLeadId: patientId
        })
      })
    } catch(e) {}

    // Fallback: localStorage session if no Supabase sessions found
    var hasFmFromDb = events.some(function(e) { return e.type === 'analise_facial' })
    if (!hasFmFromDb) {
      try {
        var fmLocal = localStorage.getItem('fm_session_' + patientId)
        if (fmLocal) {
          var fmParsed = JSON.parse(fmLocal)
          if (fmParsed && fmParsed.savedAt) {
            var annCount2 = fmParsed.annotations ? fmParsed.annotations.length : 0
            var photoCount2 = fmParsed.photos ? Object.keys(fmParsed.photos).filter(function(k) { return fmParsed.photos[k] }).length : 0
            events.push({
              type: 'analise_facial', date: fmParsed.savedAt,
              title: 'Analise Facial (local)', detail: photoCount2 + ' fotos · ' + annCount2 + ' marcacoes',
              source: 'localStorage', id: 'local',
              _fmLeadId: patientId
            })
          }
        }
      } catch(e) {}
    }

    // Sort by date descending
    events.sort(function(a, b) { return (b.date || '').localeCompare(a.date || '') })

    if (!events.length) {
      return '<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">Nenhum evento registrado para este paciente.</div>'
    }

    // Group by date
    var html = '<div style="position:relative;padding-left:28px">'
    // Vertical line
    html += '<div style="position:absolute;left:11px;top:8px;bottom:8px;width:2px;background:var(--border,#E5E7EB);border-radius:1px"></div>'

    var lastDateGroup = ''
    events.forEach(function(ev) {
      var cfg = TIMELINE_TYPES[ev.type] || { label: ev.type, color: '#6B7280', icon: ICO.file }
      var dateGroup = ev.date ? new Date(ev.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }) : 'Sem data'

      // Date separator
      if (dateGroup !== lastDateGroup) {
        html += '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin:16px 0 8px -28px;padding-left:28px;text-transform:uppercase;letter-spacing:.03em">' + _esc(dateGroup) + '</div>'
        lastDateGroup = dateGroup
      }

      // Event dot
      html += '<div style="position:relative;margin-bottom:8px">'
        + '<div style="position:absolute;left:-22px;top:12px;width:10px;height:10px;border-radius:50%;background:' + cfg.color + ';border:2px solid var(--surface,#fff);z-index:1"></div>'

      // Event card
      html += '<div style="padding:10px 14px;background:var(--surface,#fff);border:1px solid var(--border,#E5E7EB);border-radius:8px;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.06)\'" onmouseout="this.style.boxShadow=\'none\'">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:' + cfg.color + ';padding:2px 8px;background:' + cfg.color + '12;border-radius:4px">' + cfg.icon + ' ' + _esc(cfg.label) + '</span>'
        + '<span style="font-size:12px;font-weight:600;color:var(--text-primary)">' + _esc(ev.title) + '</span>'
        + (ev.confidential ? '<span style="color:#EF4444;font-size:10px">' + ICO.lock + '</span>' : '')
        + '<span style="font-size:10px;color:var(--text-muted);margin-left:auto;white-space:nowrap">' + (ev.date ? new Date(ev.date).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '') + '</span>'
        + '</div>'

      if (ev.detail) {
        html += '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap;word-break:break-word">' + _esc(ev.detail) + '</div>'
      }

      // FM action buttons
      if (ev.type === 'analise_facial' && ev._fmLeadId) {
        html += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
          + '<button onclick="FaceMapping.init(\'' + ev._fmLeadId + '\')" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #C8A97E40;border-radius:6px;background:transparent;color:#C8A97E;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">' + ICO.camera + ' Abrir</button>'
          + '<button onclick="FaceMapping.init(\'' + ev._fmLeadId + '\');setTimeout(function(){FaceMapping._exportReport&&FaceMapping._exportReport()},300)" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #C8A97E40;border-radius:6px;background:transparent;color:#C8A97E;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">' + ICO.file + ' Report</button>'
          + '<button onclick="window._prontuarioFmPresent&&window._prontuarioFmPresent(\'' + ev._fmLeadId + '\')" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid rgba(200,169,126,0.3);border-radius:6px;background:linear-gradient(135deg,#C8A97E,#A8895E);color:#0A0A0A;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">' + ICO.download + ' Apresentar</button>'
        + '</div>'
      }

      html += '</div></div>'
    })

    html += '</div>'
    return html
  }

  // ================================================================
  // WOW #5: Prescricao Estruturada
  // ================================================================
  function renderPrescriptionForm(containerId, patientId, patientName) {
    return '<div id="mr-prescription-form" style="background:var(--surface);border:1.5px solid #8B5CF640;border-radius:12px;padding:20px;margin-bottom:16px">'
      + '<div style="font-size:13px;font-weight:700;color:#8B5CF6;margin-bottom:14px;display:flex;align-items:center;gap:7px">' + ICO.pill + ' Prescricao Estruturada</div>'
      + '<div id="mr-rx-items">'
      + _rxItemRow(0)
      + '</div>'
      + '<button onclick="ProntuarioWow._addRxItem()" style="margin-top:8px;padding:6px 14px;border:1.5px dashed var(--border);border-radius:8px;background:transparent;color:var(--text-muted);font-size:11px;cursor:pointer">+ Adicionar medicamento</button>'
      + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
      + '<button onclick="ProntuarioWow._printRx(\'' + _esc(patientId) + '\',\'' + _esc(patientName) + '\')" style="padding:8px 16px;border:1.5px solid #8B5CF6;border-radius:8px;background:transparent;color:#8B5CF6;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">' + ICO.download + ' Imprimir</button>'
      + '<button onclick="ProntuarioWow._saveRx(\'' + _esc(containerId) + '\',\'' + _esc(patientId) + '\')" style="padding:8px 16px;background:#8B5CF6;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Salvar no Prontuario</button>'
      + '</div>'
      + '</div>'
  }

  var _rxCount = 1
  function _rxItemRow(idx) {
    var style = 'width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);color:var(--text-primary);outline:none;box-sizing:border-box'
    return '<div class="rx-item" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;align-items:end">'
      + '<div><label style="font-size:10px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:3px">Medicamento</label><input class="rx-med" placeholder="Ex: Dipirona 500mg" style="' + style + '"></div>'
      + '<div><label style="font-size:10px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:3px">Dose</label><input class="rx-dose" placeholder="500mg" style="' + style + '"></div>'
      + '<div><label style="font-size:10px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:3px">Frequencia</label><input class="rx-freq" placeholder="8/8h" style="' + style + '"></div>'
      + '<div><label style="font-size:10px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:3px">Duracao</label><input class="rx-dur" placeholder="7 dias" style="' + style + '"></div>'
      + '</div>'
  }

  function _addRxItem() {
    var container = document.getElementById('mr-rx-items')
    if (!container) return
    container.insertAdjacentHTML('beforeend', _rxItemRow(_rxCount++))
  }

  function _collectRxItems() {
    var items = []
    document.querySelectorAll('.rx-item').forEach(function(row) {
      var med = row.querySelector('.rx-med')?.value.trim()
      var dose = row.querySelector('.rx-dose')?.value.trim()
      var freq = row.querySelector('.rx-freq')?.value.trim()
      var dur = row.querySelector('.rx-dur')?.value.trim()
      if (med) items.push({ med: med, dose: dose, freq: freq, dur: dur })
    })
    return items
  }

  async function _saveRx(containerId, patientId) {
    var items = _collectRxItems()
    if (!items.length) return
    var content = 'PRESCRICAO MEDICA\n' + new Array(40).join('-') + '\n\n'
    items.forEach(function(it, i) {
      content += (i+1) + '. ' + it.med + '\n   Dose: ' + (it.dose || '-') + ' | Frequencia: ' + (it.freq || '-') + ' | Duracao: ' + (it.dur || '-') + '\n\n'
    })
    var svc = window.MedicalRecordsService
    if (svc) {
      await svc.create({ patientId: patientId, recordType: 'prescricao', title: 'Prescricao - ' + new Date().toLocaleDateString('pt-BR'), content: content })
      if (typeof window.showToast === 'function') window.showToast('Prescricao salva no prontuario', 'success')
    }
  }

  function _printRx(patientId, patientName) {
    var items = _collectRxItems()
    if (!items.length) return
    var w = window.open('', '_blank', 'width=600,height=800')
    w.document.write('<html><head><title>Prescricao</title><style>body{font-family:Georgia,serif;padding:40px;max-width:500px;margin:0 auto}h2{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px;border-bottom:1px solid #ddd;font-size:14px}.footer{margin-top:60px;text-align:center;border-top:1px solid #333;padding-top:10px;font-size:12px}@media print{button{display:none}}</style></head><body>')
    w.document.write('<h2>Prescricao Medica</h2>')
    w.document.write('<p><strong>Paciente:</strong> ' + _esc(patientName) + '<br><strong>Data:</strong> ' + new Date().toLocaleDateString('pt-BR') + '</p>')
    w.document.write('<table>')
    items.forEach(function(it, i) {
      w.document.write('<tr><td><strong>' + (i+1) + '. ' + _esc(it.med) + '</strong><br>Dose: ' + _esc(it.dose || '-') + ' &middot; Frequencia: ' + _esc(it.freq || '-') + ' &middot; Duracao: ' + _esc(it.dur || '-') + '</td></tr>')
    })
    w.document.write('</table>')
    w.document.write('<div class="footer">Assinatura do profissional<br><br>______________________________<br>CRM/CRO</div>')
    w.document.write('<button onclick="window.print()" style="margin-top:20px;padding:10px 20px;cursor:pointer">Imprimir</button>')
    w.document.write('</body></html>')
    w.document.close()
  }

  // ================================================================
  // WOW #6: Evolucao SOAP
  // ================================================================
  function renderSOAPForm(containerId, patientId) {
    var fields = [
      { key: 'S', label: 'Subjetivo', placeholder: 'Queixa do paciente, historico relatado, sintomas...', color: '#3B82F6' },
      { key: 'O', label: 'Objetivo', placeholder: 'Exame fisico, sinais vitais, observacoes clinicas...', color: '#10B981' },
      { key: 'A', label: 'Avaliacao', placeholder: 'Diagnostico, hipotese diagnostica, analise...', color: '#F59E0B' },
      { key: 'P', label: 'Plano', placeholder: 'Conduta, prescricoes, retorno, encaminhamentos...', color: '#8B5CF6' },
    ]

    var html = '<div style="background:var(--surface);border:1.5px solid #10B98140;border-radius:12px;padding:20px;margin-bottom:16px">'
      + '<div style="font-size:13px;font-weight:700;color:#10B981;margin-bottom:14px;display:flex;align-items:center;gap:7px">' + ICO.check + ' Evolucao SOAP</div>'

    fields.forEach(function(f) {
      html += '<div style="margin-bottom:10px">'
        + '<label style="font-size:11px;font-weight:700;color:' + f.color + ';display:flex;align-items:center;gap:6px;margin-bottom:4px">'
        + '<span style="width:20px;height:20px;border-radius:4px;background:' + f.color + '1A;color:' + f.color + ';display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">' + f.key + '</span>'
        + f.label + '</label>'
        + '<textarea id="mr-soap-' + f.key + '" rows="2" placeholder="' + f.placeholder + '" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface);color:var(--text-primary);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5"></textarea>'
        + '</div>'
    })

    html += '<div style="display:flex;justify-content:flex-end">'
      + '<button onclick="ProntuarioWow._saveSOAP(\'' + _esc(containerId) + '\',\'' + _esc(patientId) + '\')" style="padding:8px 18px;background:#10B981;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Salvar Evolucao</button>'
      + '</div></div>'

    return html
  }

  async function _saveSOAP(containerId, patientId) {
    var parts = ['S','O','A','P'].map(function(k) {
      var el = document.getElementById('mr-soap-' + k)
      return { key: k, value: (el ? el.value.trim() : '') }
    })
    var content = parts.filter(function(p){return p.value}).map(function(p) {
      var labels = { S:'SUBJETIVO', O:'OBJETIVO', A:'AVALIACAO', P:'PLANO' }
      return '[ ' + labels[p.key] + ' ]\n' + p.value
    }).join('\n\n')

    if (!content) return
    var svc = window.MedicalRecordsService
    if (svc) {
      await svc.create({ patientId: patientId, recordType: 'evolucao', title: 'Evolucao SOAP - ' + new Date().toLocaleDateString('pt-BR'), content: content })
      if (typeof window.showToast === 'function') window.showToast('Evolucao SOAP salva', 'success')
      // Clear fields
      ;['S','O','A','P'].forEach(function(k) { var el = document.getElementById('mr-soap-' + k); if (el) el.value = '' })
    }
  }

  // ================================================================
  // WOW #7: Historico Financeiro Completo
  // ================================================================
  async function renderFinanceComplete(patientId) {
    var sb = window._sbShared
    if (!sb) return ''

    // Fetch appointments with valor
    var res = await sb.from('appointments')
      .select('id,procedimento,procedure_name,scheduled_date,data,valor,status,forma_pagamento')
      .or('patient_id.eq.' + patientId + ',pacienteId.eq.' + patientId)
      .in('status', ['finalizado'])
      .order('scheduled_date', { ascending: true })
      .limit(200)
    var appts = res.data || []

    var totalGasto = 0
    var monthlyData = {}
    appts.forEach(function(a) {
      var v = Number(a.valor) || 0
      totalGasto += v
      var d = a.data || a.scheduled_date
      if (d) {
        var key = new Date(d).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' })
        monthlyData[key] = (monthlyData[key] || 0) + v
      }
    })

    var numVisits = appts.length
    var avgTicket = numVisits > 0 ? totalGasto / numVisits : 0

    var html = '<div style="display:flex;flex-direction:column;gap:14px">'

    // KPI Cards
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'
    html += _kpiCard('LTV Total', 'R$ ' + totalGasto.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), '#10B981')
    html += _kpiCard('Visitas', numVisits.toString(), '#3B82F6')
    html += _kpiCard('Ticket Medio', 'R$ ' + avgTicket.toFixed(0), '#8B5CF6')
    html += _kpiCard('Ultima Visita', appts.length ? _fmtDateShort(appts[appts.length-1].data || appts[appts.length-1].scheduled_date) : '-', '#F59E0B')
    html += '</div>'

    // Chart (if Chart.js available and has data)
    if (typeof Chart !== 'undefined' && Object.keys(monthlyData).length > 1) {
      html += '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:14px">'
        + '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px">Gastos ao longo do tempo</div>'
        + '<canvas id="mr-finance-chart" height="140"></canvas>'
        + '</div>'
    }

    html += '</div>'

    // Render chart after DOM update
    if (typeof Chart !== 'undefined' && Object.keys(monthlyData).length > 1) {
      setTimeout(function() {
        var canvas = document.getElementById('mr-finance-chart')
        if (!canvas) return
        new Chart(canvas, {
          type: 'bar',
          data: {
            labels: Object.keys(monthlyData),
            datasets: [{
              data: Object.values(monthlyData),
              backgroundColor: '#C9A96E40',
              borderColor: '#C9A96E',
              borderWidth: 1.5,
              borderRadius: 4,
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { callback: function(v) { return 'R$ ' + v } } },
              x: { grid: { display: false } }
            }
          }
        })
      }, 100)
    }

    return html
  }

  function _kpiCard(label, value, color) {
    return '<div style="padding:14px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;text-align:center">'
      + '<div style="font-size:20px;font-weight:800;color:' + color + ';letter-spacing:-.02em">' + value + '</div>'
      + '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:600">' + label + '</div></div>'
  }

  // ================================================================
  // WOW #8: Export PDF Professional
  // ================================================================
  async function exportPDF() {
    // Get current patient from MedicalRecordEditorUI state
    var state = null
    try {
      var instances = Object.keys(window._clinicaiMrEditorInstances || {})
      // Fallback: read from DOM
    } catch(e) {}

    var patientName = document.getElementById('prontuario-patient-name')?.textContent || 'Paciente'
    var sb = window._sbShared
    if (!sb) { alert('Supabase indisponivel'); return }

    // Find patient ID from current context
    var editorRoot = document.getElementById('prontuario-editor-root')
    var summaryEl = editorRoot?.querySelector('[id^="mr-summary-"]')
    var patientId = null

    // Try to get from the UI state - search in the MedicalRecordEditorUI
    var leads = []
    try { leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [] } catch(e) {}
    var matchedLead = leads.find(function(l) { return (l.name || l.nome || '').trim() === patientName.trim() })
    if (matchedLead) patientId = matchedLead.id

    if (!patientId) { alert('Paciente nao identificado'); return }

    // Fetch all records
    var res = await sb.from('medical_records')
      .select('record_type,title,content,created_at,is_confidential')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    var records = res.data || []

    // Fetch clinic data
    var clinicName = 'ClinicAI'
    try {
      var clinicRes = await sb.from('clinics').select('name').limit(1).single()
      if (clinicRes.data) clinicName = clinicRes.data.name
    } catch(e) {}

    // Generate PDF via print window
    var w = window.open('', '_blank', 'width=800,height=1000')
    var typeLabels = { nota_clinica:'Nota Clinica', evolucao:'Evolucao', prescricao:'Prescricao', alerta:'ALERTA', observacao:'Observacao', procedimento:'Procedimento', anamnese:'Anamnese' }

    w.document.write('<!DOCTYPE html><html><head><title>Prontuario - ' + _esc(patientName) + '</title>')
    w.document.write('<style>')
    w.document.write('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:30px 40px;max-width:700px;margin:0 auto;color:#1a1a2e;font-size:13px;line-height:1.6}')
    w.document.write('.header{text-align:center;border-bottom:3px solid #C9A96E;padding-bottom:16px;margin-bottom:24px}')
    w.document.write('.header h1{font-size:20px;color:#1a1a2e;margin:0 0 4px}.header p{color:#666;font-size:12px;margin:0}')
    w.document.write('.patient{background:#F8F6F3;padding:14px 20px;border-radius:8px;margin-bottom:20px}')
    w.document.write('.record{border-left:3px solid #C9A96E;padding:10px 16px;margin-bottom:12px;page-break-inside:avoid}')
    w.document.write('.record .type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#C9A96E;margin-bottom:4px}')
    w.document.write('.record .title{font-size:13px;font-weight:700;margin-bottom:2px}')
    w.document.write('.record .content{white-space:pre-wrap;font-size:12px;color:#444}')
    w.document.write('.record .meta{font-size:10px;color:#999;margin-top:4px}')
    w.document.write('.footer{margin-top:30px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:10px}')
    w.document.write('.alert{border-left-color:#EF4444;background:#FEF2F2}')
    w.document.write('@media print{button{display:none!important}}')
    w.document.write('</style></head><body>')

    w.document.write('<div class="header"><h1>' + _esc(clinicName) + '</h1><p>Prontuario Eletronico</p></div>')
    w.document.write('<div class="patient"><strong>' + _esc(patientName) + '</strong><br>Data de emissao: ' + new Date().toLocaleDateString('pt-BR') + ' · ' + records.length + ' registros</div>')

    records.forEach(function(r) {
      var cls = r.record_type === 'alerta' ? 'record alert' : 'record'
      w.document.write('<div class="' + cls + '">')
      w.document.write('<div class="type">' + _esc(typeLabels[r.record_type] || r.record_type) + '</div>')
      if (r.title) w.document.write('<div class="title">' + _esc(r.title) + '</div>')
      w.document.write('<div class="content">' + _esc(r.content) + '</div>')
      w.document.write('<div class="meta">' + _fmtDate(r.created_at) + (r.is_confidential ? ' · Confidencial' : '') + '</div>')
      w.document.write('</div>')
    })

    w.document.write('<div class="footer">Documento gerado eletronicamente por ' + _esc(clinicName) + ' · ' + new Date().toLocaleString('pt-BR') + '</div>')
    w.document.write('<div style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:10px 30px;background:#C9A96E;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">Imprimir / Salvar PDF</button></div>')
    w.document.write('</body></html>')
    w.document.close()
  }

  // ================================================================
  // WOW #4 + #9: Galeria Before/After + Comparador
  // ================================================================
  function renderBeforeAfterGallery(patientId) {
    var fmData = null
    try {
      var raw = localStorage.getItem('fm_session_' + patientId)
      if (raw) fmData = JSON.parse(raw)
    } catch(e) {}

    if (!fmData || !fmData.photos) {
      return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Nenhuma foto de face mapping disponivel para comparacao.</div>'
    }

    var photos = fmData.photos || {}
    var afterPhotos = fmData.afterPhotos || {}
    var angleLabels = { front:'Frontal', left:'Esquerda', right:'Direita', oblique_left:'Obliqua E', oblique_right:'Obliqua D' }
    var angles = Object.keys(photos).filter(function(k) { return photos[k] })

    if (!angles.length) {
      return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Nenhuma foto disponivel.</div>'
    }

    var html = '<div style="display:flex;flex-direction:column;gap:16px">'

    angles.forEach(function(angle) {
      var before = photos[angle]
      var after = afterPhotos[angle]

      html += '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:14px">'
        + '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">' + _esc(angleLabels[angle] || angle) + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr' + (after ? ' 1fr' : '') + ';gap:12px">'

      // Before
      if (before && typeof before === 'string' && before.startsWith('data:')) {
        html += '<div style="text-align:center">'
          + '<div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">ANTES</div>'
          + '<img src="' + before + '" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;border:1px solid var(--border)" />'
          + '</div>'
      }

      // After
      if (after && typeof after === 'string' && after.startsWith('data:')) {
        html += '<div style="text-align:center">'
          + '<div style="font-size:10px;font-weight:600;color:#10B981;margin-bottom:4px">DEPOIS</div>'
          + '<img src="' + after + '" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;border:1px solid #10B98140" />'
          + '</div>'
      }

      html += '</div></div>'
    })

    // Metrics summary if available
    if (fmData.metrics && typeof fmData.metrics === 'object') {
      html += '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:14px">'
        + '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px">Metricas Faciais</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">'
      Object.entries(fmData.metrics).forEach(function(pair) {
        if (typeof pair[1] === 'number' || typeof pair[1] === 'string') {
          html += '<div style="padding:8px;background:var(--bg,#F9FAFB);border-radius:6px;text-align:center">'
            + '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">' + pair[1] + '</div>'
            + '<div style="font-size:9px;color:var(--text-muted)">' + _esc(pair[0].replace(/_/g,' ')) + '</div></div>'
        }
      })
      html += '</div></div>'
    }

    // Annotations summary (treatment zones)
    var fmAnns = fmData.annotations || []
    if (fmAnns.length > 0) {
      html += '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:14px">'
        + '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">Zonas Tratadas</div>'
        + '<div style="display:flex;flex-direction:column;gap:4px">'
      fmAnns.forEach(function(ann) {
        var zoneName = ann.zone || ''
        var dose = ann.ml ? parseFloat(ann.ml).toFixed(1) : '-'
        var unit = (ann.unit === 'U' || zoneName.indexOf('glabela') !== -1 || zoneName.indexOf('frontal') !== -1 || zoneName.indexOf('periorbital') !== -1) ? 'U' : 'mL'
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg,#F9FAFB);border-radius:4px">'
          + '<span style="font-size:12px;color:var(--text-primary);font-weight:500">' + _esc(zoneName.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })) + '</span>'
          + '<div style="display:flex;align-items:center;gap:8px">'
          + (ann.product ? '<span style="font-size:10px;color:var(--text-muted)">' + _esc(ann.product) + '</span>' : '')
          + '<span style="font-size:12px;font-weight:700;color:' + (unit === 'U' ? '#8B5CF6' : '#3B82F6') + '">' + dose + ' ' + unit + '</span>'
          + '</div></div>'
      })
      html += '</div></div>'
    }

    // Action buttons
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">'
      + '<button onclick="FaceMapping.init(\'' + patientId + '\')" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid #C8A97E40;border-radius:8px;background:transparent;color:#C8A97E;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">' + ICO.camera + ' Abrir Analise</button>'
      + '<button onclick="window._prontuarioFmPresent(\'' + patientId + '\')" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;border-radius:8px;background:linear-gradient(135deg,#C8A97E,#A8895E);color:#0A0A0A;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">' + ICO.download + ' Apresentar para Paciente</button>'
    + '</div>'

    html += '</div>'
    return html
  }

  // ================================================================
  // Apresentacao FM direto do prontuario
  // ================================================================
  window._prontuarioFmPresent = function(leadId) {
    if (!window.FaceMapping) return

    // Init FM with lead data (loads session)
    FaceMapping.init(leadId)

    // Wait for FM to load, then open report in presentation mode
    setTimeout(function() {
      if (FaceMapping._exportReport) {
        FaceMapping._exportReport()
        // Auto-enter presentation mode after report renders
        setTimeout(function() {
          if (FaceMapping._presentReport) FaceMapping._presentReport()
        }, 500)
      }
    }, 400)
  }

  // ================================================================
  // WOW #10: Assinatura Digital
  // ================================================================
  async function signRecord(recordId) {
    var sb = window._sbShared
    if (!sb) return

    var profile = typeof window.getCurrentProfile === 'function' ? window.getCurrentProfile() : null
    if (!profile) { alert('Perfil nao carregado'); return }

    var signedContent = '\n\n' + new Array(40).join('-') + '\nAssinado digitalmente por: ' + (profile.first_name || '') + ' ' + (profile.last_name || '') + '\nData: ' + new Date().toLocaleString('pt-BR') + '\nID: ' + profile.id

    // Update record: append signature + mark as signed via title prefix
    var { data: record, error } = await sb.from('medical_records')
      .select('content,title')
      .eq('id', recordId)
      .single()

    if (error || !record) return

    await sb.from('medical_records')
      .update({
        content: record.content + signedContent,
        title: (record.title || '') + ' [ASSINADO]',
      })
      .eq('id', recordId)

    if (typeof window.showToast === 'function') window.showToast('Registro assinado digitalmente', 'success')
  }

  // ================================================================
  // Exposicao Global
  // ================================================================
  // ── Request Doc from Lead Modal ────────────────────────────────
  async function _showRequestDocModalLm(patientId, patientName) {
    var svc = window.LegalDocumentsService
    if (!svc) return
    var templates = svc.getTemplates()
    if (!templates || !templates.length) templates = await svc.loadTemplates()

    if (!templates || !templates.length) {
      alert('Nenhum template de documento disponivel')
      return
    }

    var choice = templates.map(function(t,i) { return (i+1) + '. ' + t.name }).join('\n')
    var idx = prompt('Selecione o template:\n' + choice + '\n\nDigite o numero:')
    if (!idx) return
    var tmpl = templates[parseInt(idx) - 1]
    if (!tmpl) return

    var result = await svc.createRequest(tmpl.id, {
      patient_id: patientId,
      id: patientId,
      pacienteNome: patientName,
      patient_name: patientName,
    })

    if (result && result.ok) {
      if (typeof window.showToast === 'function') window.showToast('Documento solicitado', 'success')
    } else {
      alert((result && result.error) || 'Erro ao solicitar documento')
    }
  }

  window.ProntuarioWow = {
    renderPatientHeader: renderPatientHeader,
    renderClinicalAlerts: renderClinicalAlerts,
    renderUnifiedTimeline: renderUnifiedTimeline,
    renderPrescriptionForm: renderPrescriptionForm,
    renderSOAPForm: renderSOAPForm,
    renderFinanceComplete: renderFinanceComplete,
    renderBeforeAfterGallery: renderBeforeAfterGallery,
    exportPDF: exportPDF,
    signRecord: signRecord,
    _addRxItem: _addRxItem,
    _saveRx: _saveRx,
    _printRx: _printRx,
    _saveSOAP: _saveSOAP,
    _showRequestDocModalLm: _showRequestDocModalLm,
  }

})()
