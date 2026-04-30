/**
 * ClinicAI — Legal Document Templates UI (Settings > Documentos)
 *
 * CRUD de modelos de documentos legais.
 * Lista documentos recentes com status.
 *
 * Depende de: LegalDocumentsService
 */
;(function () {
  'use strict'

  if (window._clinicaiLegalDocTemplatesLoaded) return
  window._clinicaiLegalDocTemplatesLoaded = true

  var _editingId = null

  // ── Rich editor commands ───────────────────────────────────
  function ldeCmd(cmd, val) {
    document.execCommand(cmd, false, val || null)
    var editor = document.getElementById('lde_content')
    if (editor) editor.focus()
  }

  function ldeInsertVar(varName) {
    if (!varName) return
    var editor = document.getElementById('lde_content')
    if (!editor) return
    editor.focus()

    var tag = '<span class="lde-var" contenteditable="false">{{' + varName + '}}</span>&nbsp;'
    document.execCommand('insertHTML', false, tag)
  }

  function _getEditorContent() {
    var editor = document.getElementById('lde_content')
    if (!editor) return ''
    return editor.innerHTML
  }

  function _setEditorContent(html) {
    var editor = document.getElementById('lde_content')
    if (!editor) return
    if (!html) { editor.innerHTML = ''; return }
    // Se o conteudo e texto plano (sem tags HTML), converter \n em <p>
    if (html.indexOf('<') === -1) {
      var paragraphs = html.split(/\n\n+/)
      html = paragraphs.map(function (p) {
        return '<p>' + p.replace(/\n/g, '<br>') + '</p>'
      }).join('')
    }
    editor.innerHTML = html
  }

  var TYPE_LABELS = {
    injetavel: 'Injetaveis',
    tecnologia: 'Tecnologias',
    manual: 'Manuais',
    uso_imagem: 'Uso de Imagem',
    procedimento: 'Procedimento',
    anestesia: 'Anestesia',
    custom: 'Personalizado',
  }

  var TYPE_COLORS = {
    injetavel: '#7C3AED',
    tecnologia: '#0891B2',
    manual: '#F59E0B',
    uso_imagem: '#8B5CF6',
    procedimento: '#6B7280',
    anestesia: '#EF4444',
    custom: '#6B7280',
  }

  var TYPE_ORDER = ['injetavel', 'tecnologia', 'manual', 'uso_imagem', 'procedimento', 'anestesia', 'custom']

  var STATUS_LABELS = {
    pending: 'Pendente',
    viewed: 'Visualizado',
    signed: 'Assinado',
    expired: 'Expirado',
    revoked: 'Revogado',
  }

  var STATUS_COLORS = {
    pending: '#F59E0B',
    viewed: '#3B82F6',
    signed: '#10B981',
    expired: '#6B7280',
    revoked: '#EF4444',
  }

  // ── Dashboard metricas ─────────────────────────────────────
  async function loadLegalDocMetrics() {
    var dash = document.getElementById('legal_doc_metrics_dash')
    if (!dash || !window._sbShared) return

    // Buscar metricas filtrando purged
    var allRes = await window._sbShared.from('legal_doc_requests')
      .select('status,template_id,signed_at,created_at')
      .neq('status', 'purged')
    var templates = LegalDocumentsService.getTemplates() || []
    var imgIds = templates.filter(function (t) { return t.doc_type === 'uso_imagem' }).map(function (t) { return t.id })

    var allData = (allRes.data || [])
    var tcleData = allData.filter(function (r) { return imgIds.indexOf(r.template_id) === -1 })
    var imgData = allData.filter(function (r) { return imgIds.indexOf(r.template_id) >= 0 })

    function calc(arr) {
      var total = arr.length
      var signed = arr.filter(function (r) { return r.status === 'signed' }).length
      var pending = arr.filter(function (r) { return r.status === 'pending' || r.status === 'viewed' }).length
      var expired = arr.filter(function (r) { return r.status === 'expired' }).length
      var now = Date.now()
      var week = arr.filter(function (r) { return (now - new Date(r.created_at).getTime()) < 7 * 86400000 })
      var signed7 = week.filter(function (r) { return r.status === 'signed' }).length
      return { total: total, signed: signed, pending: pending, expired: expired, sign_rate: total > 0 ? Math.round(signed / total * 1000) / 10 : 0, last_7: week.length, signed_7: signed7 }
    }

    var t = calc(tcleData)
    var img = calc(imgData)

    function _row(label, cards, accent) {
      var h = '<div style="margin-bottom:14px">'
        + '<div style="font-size:11px;font-weight:700;color:' + accent + ';margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">' + label + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">'
      cards.forEach(function (c) {
        h += '<div style="padding:10px 8px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;text-align:center">'
          + '<div style="font-size:20px;font-weight:800;color:' + c.color + '">' + c.value + '</div>'
          + '<div style="font-size:8px;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-top:2px">' + c.label + '</div>'
          + '</div>'
      })
      h += '</div></div>'
      return h
    }

    var html = _row('Consentimentos (TCLE)', [
      { label: 'Enviados', value: t.total || 0, color: '#374151' },
      { label: 'Assinados', value: t.signed || 0, color: '#10B981' },
      { label: 'Taxa', value: (t.sign_rate || 0) + '%', color: '#0891B2' },
      { label: '7 dias', value: (t.signed_7 || 0) + '/' + (t.last_7 || 0), color: '#3B82F6' },
    ], '#10B981')

    html += _row('Uso de Imagem', [
      { label: 'Enviados', value: img.total || 0, color: '#374151' },
      { label: 'Assinados', value: img.signed || 0, color: '#10B981' },
      { label: 'Recusados', value: (img.expired || 0) + (img.pending || 0), color: '#EF4444' },
      { label: 'Taxa', value: (img.sign_rate || 0) + '%', color: img.sign_rate >= 50 ? '#10B981' : '#EF4444' },
    ], '#7C3AED')

    dash.innerHTML = html
  }

  // ── Load templates ─────────────────────────────────────────
  async function loadLegalDocTemplates() {
    var list = document.getElementById('legal_doc_templates_list')
    if (!list || !window.LegalDocumentsService) return

    var templates = await LegalDocumentsService.loadTemplates()
    if (!templates.length) {
      list.innerHTML = '<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:12px;background:#F9FAFB;border-radius:10px">Nenhum modelo cadastrado. Clique em "Novo Modelo" para comecar.</div>'
      return
    }

    // Agrupar por doc_type
    var groups = {}
    templates.forEach(function (t) {
      var type = t.doc_type || 'custom'
      if (!groups[type]) groups[type] = []
      groups[type].push(t)
    })

    var html = ''
    TYPE_ORDER.forEach(function (type) {
      if (!groups[type] || !groups[type].length) return
      var groupLabel = TYPE_LABELS[type] || type
      var groupColor = TYPE_COLORS[type] || '#6B7280'
      var count = groups[type].length

      html += '<div style="margin-bottom:20px">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ' + groupColor + '20">'
        + '<span style="font-size:13px;font-weight:700;color:' + groupColor + '">' + groupLabel + '</span>'
        + '<span style="font-size:10px;padding:2px 8px;background:' + groupColor + '15;color:' + groupColor + ';border-radius:10px;font-weight:600">' + count + '</span>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px">'

      groups[type].forEach(function (t) {
        var typeColor = TYPE_COLORS[t.doc_type] || '#6B7280'
        // Remover prefixo "TCLE - " para nome mais limpo
        var displayName = t.name.replace(/^TCLE\s*-\s*/i, '')

        html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fff;border:1.5px solid #E5E7EB;border-radius:10px;transition:border-color .15s" onmouseenter="this.style.borderColor=\'' + typeColor + '\'" onmouseleave="this.style.borderColor=\'#E5E7EB\'">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:12px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(displayName) + '</div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">'
          + '<span style="font-size:9px;color:#9CA3AF">v' + t.version + '</span>'
          + (t.professional_name ? '<span style="font-size:9px;padding:1px 6px;background:#EDE9FE;color:#7C3AED;border-radius:4px">' + _esc(t.professional_name.split(' ')[0]) + '</span>' : '')
          + (t.trigger_status ? '<span style="font-size:9px;padding:1px 6px;background:#F0FDF4;color:#10B981;border-radius:4px">Auto: ' + _esc(t.trigger_status) + '</span>' : '')
          + '</div></div>'
          + '<div style="display:flex;gap:3px">'
          + '<button data-action="edit" data-id="' + t.id + '" style="padding:5px 8px;background:#F3F4F6;border:none;border-radius:6px;cursor:pointer;font-size:10px;color:#374151">Editar</button>'
          + '<button data-action="dup" data-id="' + t.id + '" style="padding:5px 8px;background:#F3F4F6;border:none;border-radius:6px;cursor:pointer;font-size:10px;color:#374151">Duplicar</button>'
          + '<button data-action="test" data-id="' + t.id + '" style="padding:5px 8px;background:#ECFEFF;border:none;border-radius:6px;cursor:pointer;font-size:10px;color:#0891B2;font-weight:600">Testar</button>'
          + '<button data-action="del" data-id="' + t.id + '" data-name="' + _esc(displayName) + '" style="padding:5px 8px;background:#FEF2F2;border:none;border-radius:6px;cursor:pointer;font-size:10px;color:#EF4444">Excluir</button>'
          + '</div></div>'
      })

      html += '</div></div>'
    })

    list.innerHTML = html

    // Event delegation (seguro contra XSS)
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]')
      if (!btn) return
      var action = btn.dataset.action
      var id = btn.dataset.id
      if (action === 'edit') editLegalDocTemplate(id)
      else if (action === 'dup') duplicateLegalDocTemplate(id)
      else if (action === 'test') testLegalDocTemplate(id)
      else if (action === 'del') deleteLegalDocTemplate(id, btn.dataset.name || '')
    })
  }

  // ── Populate professional dropdown ─────────────────────────
  function _populateProfDropdown(selectedId) {
    var sel = document.getElementById('lde_professional_id')
    if (!sel) return
    var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
    sel.innerHTML = '<option value="">Usar do agendamento</option>'
    profs.forEach(function (p) {
      if (!p.is_active) return
      var opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.display_name + (p.specialty ? ' — ' + p.specialty : '')
      if (p.id === selectedId) opt.selected = true
      sel.appendChild(opt)
    })
  }

  // ── Editor ─────────────────────────────────────────────────
  function addLegalDocTemplate() {
    console.log('[LegalDocs] addLegalDocTemplate called')
    _editingId = null
    var el = function (id) { return document.getElementById(id) }
    if (el('lde_name')) el('lde_name').value = ''
    if (el('lde_type')) el('lde_type').value = 'uso_imagem'
    if (el('lde_trigger_status')) el('lde_trigger_status').value = ''
    if (el('lde_trigger_procs')) el('lde_trigger_procs').value = ''
    if (el('lde_redirect_url')) el('lde_redirect_url').value = ''
    if (el('lde_px_fb')) el('lde_px_fb').value = ''
    if (el('lde_px_ga')) el('lde_px_ga').value = ''
    if (el('lde_px_gtm')) el('lde_px_gtm').value = ''
    if (el('lde_px_tiktok')) el('lde_px_tiktok').value = ''
    if (el('lde_px_custom')) el('lde_px_custom').value = ''
    _populateProfDropdown(null)
    _setEditorContent('')
    if (el('legal_doc_editor_title')) el('legal_doc_editor_title').textContent = 'Novo Modelo'
    if (el('legal_doc_editor')) {
      el('legal_doc_editor').style.display = 'block'
      setTimeout(function () { el('legal_doc_editor').scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 100)
    }
  }

  function editLegalDocTemplate(id) {
    var templates = LegalDocumentsService.getTemplates()
    var t = templates.find(function (x) { return x.id === id })
    if (!t) return

    _editingId = id
    var el = function (id) { return document.getElementById(id) }
    if (el('lde_name')) el('lde_name').value = t.name
    if (el('lde_type')) el('lde_type').value = t.doc_type
    if (el('lde_trigger_status')) el('lde_trigger_status').value = t.trigger_status || ''
    if (el('lde_trigger_procs')) el('lde_trigger_procs').value = (t.trigger_procedures || []).join(', ')
    if (el('lde_redirect_url')) el('lde_redirect_url').value = t.redirect_url || ''
    var px = {}
    try { px = t.tracking_scripts ? JSON.parse(t.tracking_scripts) : {} } catch (e) { px = {} }
    if (el('lde_px_fb')) el('lde_px_fb').value = px.fb_pixel_id || ''
    if (el('lde_px_ga')) el('lde_px_ga').value = px.ga_id || ''
    if (el('lde_px_gtm')) el('lde_px_gtm').value = px.gtm_id || ''
    if (el('lde_px_tiktok')) el('lde_px_tiktok').value = px.tiktok_id || ''
    if (el('lde_px_custom')) el('lde_px_custom').value = px.custom_scripts || ''
    _populateProfDropdown(t.professional_id)
    _setEditorContent(t.content)
    if (el('legal_doc_editor_title')) el('legal_doc_editor_title').textContent = 'Editar: ' + t.name
    if (el('legal_doc_editor')) {
      el('legal_doc_editor').style.display = 'block'
      setTimeout(function () { el('legal_doc_editor').scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 100)
    }
  }

  function closeLegalDocEditor() {
    _editingId = null
    var editor = document.getElementById('legal_doc_editor')
    if (editor) editor.style.display = 'none'
  }

  async function saveLegalDocTemplate() {
    var name = (document.getElementById('lde_name') || {}).value || ''
    var docType = (document.getElementById('lde_type') || {}).value || 'custom'
    var content = _getEditorContent()

    if (!name.trim()) { if (window._showToast) _showToast('Documentos', 'Informe o nome do modelo', 'warning'); return }
    if (!content.trim()) { if (window._showToast) _showToast('Documentos', 'Informe o texto do documento', 'warning'); return }

    var triggerStatus = (document.getElementById('lde_trigger_status') || {}).value || ''
    var triggerProcsRaw = (document.getElementById('lde_trigger_procs') || {}).value || ''
    var triggerProcs = triggerProcsRaw.split(',').map(function (s) { return s.trim() }).filter(Boolean)

    var profId = (document.getElementById('lde_professional_id') || {}).value || ''
    var redirectUrl = (document.getElementById('lde_redirect_url') || {}).value || ''
    var pixelData = {}
    var pxFb = (document.getElementById('lde_px_fb') || {}).value || ''
    var pxGa = (document.getElementById('lde_px_ga') || {}).value || ''
    var pxGtm = (document.getElementById('lde_px_gtm') || {}).value || ''
    var pxTiktok = (document.getElementById('lde_px_tiktok') || {}).value || ''
    var pxCustom = (document.getElementById('lde_px_custom') || {}).value || ''
    if (pxFb) pixelData.fb_pixel_id = pxFb.trim()
    if (pxGa) pixelData.ga_id = pxGa.trim()
    if (pxGtm) pixelData.gtm_id = pxGtm.trim()
    if (pxTiktok) pixelData.tiktok_id = pxTiktok.trim()
    if (pxCustom) pixelData.custom_scripts = pxCustom.trim()
    var trackingScripts = Object.keys(pixelData).length ? JSON.stringify(pixelData) : ''

    var data = {
      name: name.trim(), doc_type: docType, content: content.trim(),
      trigger_status: triggerStatus || null,
      trigger_procedures: triggerProcs.length ? triggerProcs : null,
      professional_id: profId || null,
      redirect_url: redirectUrl.trim() || null,
      tracking_scripts: trackingScripts.trim() || null,
    }
    if (_editingId) data.id = _editingId

    var res = await LegalDocumentsService.saveTemplate(data)
    if (res.ok) {
      if (window._showToast) _showToast('Documentos', 'Modelo "' + name + '" salvo', 'success')
      closeLegalDocEditor()
      await loadLegalDocTemplates()
    } else {
      if (window._showToast) _showToast('Documentos', 'Erro: ' + (res.error || 'desconhecido'), 'error')
    }
  }

  // ── Duplicar ────────────────────────────────────────────────
  async function duplicateLegalDocTemplate(id) {
    var templates = LegalDocumentsService.getTemplates()
    var t = templates.find(function (x) { return x.id === id })
    if (!t) return

    var res = await LegalDocumentsService.saveTemplate({
      name: t.name + ' (Copia)',
      doc_type: t.doc_type,
      content: t.content,
      trigger_status: t.trigger_status || null,
      trigger_procedures: t.trigger_procedures || null,
    })
    if (res.ok) {
      if (window._showToast) _showToast('Documentos', '"' + t.name + '" duplicado', 'success')
      await loadLegalDocTemplates()
    } else {
      if (window._showToast) _showToast('Documentos', 'Erro: ' + (res.error || 'desconhecido'), 'error')
    }
  }

  // ── Testar (gerar link de exemplo) ─────────────────────────
  async function testLegalDocTemplate(id) {
    var templates = LegalDocumentsService.getTemplates()
    var tmpl = templates.find(function (x) { return x.id === id })

    // Resolver profissional pelo nome do template (extrair procedimento)
    var procName = ''
    if (tmpl) {
      procName = (tmpl.name || '').replace(/^TCLE\s*-\s*/i, '').trim()
      // Tentar trigger_procedures primeiro
      if (tmpl.trigger_procedures && tmpl.trigger_procedures.length) {
        procName = tmpl.trigger_procedures[0]
      }
    }

    // Buscar profissional responsavel
    var profIdx = 0
    var profId = null
    if (procName && window.LegalDocumentsService.resolveProfessionalForProcedure) {
      var resolved = await LegalDocumentsService.resolveProfessionalForProcedure(procName)
      if (resolved && resolved.ok && resolved.professional_id) {
        profId = resolved.professional_id
        // Encontrar idx no array de profissionais
        var profs = typeof getProfessionals === 'function' ? getProfessionals() : []
        for (var pi = 0; pi < profs.length; pi++) {
          if (profs[pi].id === profId) { profIdx = pi; break }
        }
      }
    }

    var testData = {
      pacienteNome: 'Maria Silva Teste',
      pacienteCpf: '529.982.247-25',
      profissionalIdx: profIdx,
      professional_id: profId,
      procedimento: procName || 'Avaliacao',
      horaInicio: new Date().getHours().toString().padStart(2, '0') + ':' + new Date().getMinutes().toString().padStart(2, '0'),
    }

    var res = await LegalDocumentsService.createRequest(id, testData)
    if (res.ok) {
      if (window._showToast) _showToast('Documentos', 'Link gerado! Abrindo...', 'success')
      window.open(res.link, '_blank')
      loadLegalDocRequests()
    } else {
      if (window._showToast) _showToast('Documentos', 'Erro: ' + (res.error || 'desconhecido'), 'error')
    }
  }

  // ── Requests recentes ──────────────────────────────────────
  async function loadLegalDocRequests() {
    var list = document.getElementById('legal_doc_requests_list')
    if (!list || !window.LegalDocumentsService) return

    var res = await LegalDocumentsService.listRequests({ limit: 50 })
    var data = (res.ok && res.data) ? res.data.filter(function (r) { return r.status !== 'purged' }) : []
    if (!data.length) {
      list.innerHTML = '<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:12px">Nenhum documento gerado ainda.</div>'
      return
    }

    var html = ''
    data.forEach(function (r) {
      var statusLabel = STATUS_LABELS[r.status] || r.status
      var statusColor = STATUS_COLORS[r.status] || '#6B7280'
      var date = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : ''
      var signedDate = r.signed_at ? new Date(r.signed_at).toLocaleString('pt-BR') : ''

      var canResend = r.status === 'pending' || r.status === 'viewed'
      var resendBtn = canResend && r.patient_phone
        ? '<button onclick="resendLegalDocWhatsApp(\'' + _esc(r.patient_phone) + '\',\'' + _esc(r.patient_name) + '\')" title="Reenviar lembrete via WhatsApp" style="padding:4px 8px;background:#25D366;border:none;border-radius:5px;cursor:pointer;font-size:9px;color:#fff;font-weight:600;white-space:nowrap">WhatsApp</button>'
        : ''

      html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fff;border:1px solid #F3F4F6;border-radius:8px">'
        + '<div style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';flex-shrink:0"></div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:12px;font-weight:600;color:#111">' + _esc(r.patient_name) + '</div>'
        + '<div style="font-size:10px;color:#9CA3AF">' + date + (r.professional_name ? ' | ' + _esc(r.professional_name) : '') + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + resendBtn
        + '<div style="text-align:right">'
        + '<span style="font-size:10px;padding:2px 8px;background:' + statusColor + '15;color:' + statusColor + ';border-radius:4px;font-weight:600">' + statusLabel + '</span>'
        + (signedDate ? '<div style="font-size:9px;color:#9CA3AF;margin-top:2px">' + signedDate + '</div>' : '')
        + '</div></div></div>'
    })

    list.innerHTML = html
  }

  // ── Auto-load when page opens ───────────────────────────────
  function _initLegalDocsPage() {
    loadLegalDocMetrics()
    loadLegalDocTemplates()
    loadLegalDocRequests()
    loadLegalDocAdvancedConfig()
  }

  // Hook via MutationObserver — detecta quando a pagina fica visivel
  function _watchPageActive() {
    var page = document.getElementById('page-settings-documentos')
    if (!page) return

    var observer = new MutationObserver(function () {
      if (page.classList.contains('active')) {
        _initLegalDocsPage()
      }
    })
    observer.observe(page, { attributes: true, attributeFilter: ['class'] })
  }

  // Inicializar quando DOM pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _watchPageActive)
  } else {
    _watchPageActive()
  }

  // Fallback: hook antigo para settings panel
  var _origClinicSection2 = window.clinicSection
  if (_origClinicSection2) {
    window.clinicSection = function (sec) {
      _origClinicSection2(sec)
      if (sec === 'documentos') _initLegalDocsPage()
    }
  }

  // ── Utils ──────────────────────────────────────────────────
  function _esc(s) {
    if (!s) return ''
    var div = document.createElement('div')
    div.textContent = s
    return div.innerHTML
  }

  // ── Reenviar lembrete via WhatsApp ──────────────────────────
  async function resendLegalDocWhatsApp(phone, name) {
    if (!phone) {
      if (window._showToast) _showToast('Documentos', 'Telefone nao disponivel', 'warning')
      return
    }
    if (window._showToast) _showToast('Documentos', 'Enviando lembrete para ' + name + '...', 'info')

    var digits = (phone || '').replace(/\D/g, '')
    if (!digits.startsWith('55') || digits.length < 12) digits = '55' + digits

    var firstName = (name || '').split(' ')[0] || ''
    var msg = 'Ola' + (firstName ? ' ' + firstName : '') + '! '
      + 'Lembramos que voce tem um documento pendente de assinatura digital. '
      + 'Por favor, verifique a mensagem anterior com o link de acesso. '
      + 'Se nao encontrar, entre em contato conosco. Obrigado!'

    if (window.InboxService && InboxService.sendText) {
      var r = await InboxService.sendText(digits, msg)
      if (r.ok) {
        if (window._showToast) _showToast('Documentos', 'Lembrete enviado para ' + name, 'success')
      } else {
        if (window._showToast) _showToast('Documentos', 'Falha no envio', 'error')
      }
    } else {
      if (window._showToast) _showToast('Documentos', 'InboxService indisponivel', 'error')
    }
  }

  // ── Expose ─────────────────────────────────────────────────
  // ── Config avancada (redirect + pixels globais) ────────────
  async function loadLegalDocAdvancedConfig() {
    if (!window._sbShared) return
    try {
      var res = await window._sbShared.from('clinics').select('settings,website').limit(1).single()
      if (!res.data) return
      var s = res.data.settings || {}
      var el = function (id) { return document.getElementById(id) }
      if (el('ld_consent_redirect_url')) el('ld_consent_redirect_url').value = s.consent_redirect_url || res.data.website || ''

      var px = s.consent_pixels || {}
      if (typeof px === 'string') try { px = JSON.parse(px) } catch (e) { px = {} }
      if (el('ld_g_px_fb')) el('ld_g_px_fb').value = px.fb_pixel_id || ''
      if (el('ld_g_px_ga')) el('ld_g_px_ga').value = px.ga_id || ''
      if (el('ld_g_px_gtm')) el('ld_g_px_gtm').value = px.gtm_id || ''
      if (el('ld_g_px_tiktok')) el('ld_g_px_tiktok').value = px.tiktok_id || ''
    } catch (e) {}
  }

  async function saveLegalDocAdvancedConfig() {
    if (!window._sbShared) return
    var el = function (id) { return (document.getElementById(id) || {}).value || '' }

    var pixels = {}
    if (el('ld_g_px_fb').trim()) pixels.fb_pixel_id = el('ld_g_px_fb').trim()
    if (el('ld_g_px_ga').trim()) pixels.ga_id = el('ld_g_px_ga').trim()
    if (el('ld_g_px_gtm').trim()) pixels.gtm_id = el('ld_g_px_gtm').trim()
    if (el('ld_g_px_tiktok').trim()) pixels.tiktok_id = el('ld_g_px_tiktok').trim()

    try {
      var res = await window._sbShared.from('clinics').select('id,settings').limit(1).single()
      if (!res.data) return
      var settings = res.data.settings || {}
      settings.consent_redirect_url = el('ld_consent_redirect_url').trim() || null
      settings.consent_pixels = Object.keys(pixels).length ? pixels : null

      var upd = await window._sbShared.from('clinics').update({ settings: settings }).eq('id', res.data.id)
      if (upd.error) {
        if (window._showToast) _showToast('Documentos', 'Erro: ' + upd.error.message, 'error')
      } else {
        if (window._showToast) _showToast('Documentos', 'Pixels globais salvos', 'success')
      }
    } catch (e) {
      if (window._showToast) _showToast('Documentos', 'Erro: ' + e.message, 'error')
    }
  }

  window.loadLegalDocMetrics    = loadLegalDocMetrics
  window.loadLegalDocTemplates  = loadLegalDocTemplates
  window.loadLegalDocRequests   = loadLegalDocRequests
  window.addLegalDocTemplate    = addLegalDocTemplate
  window.editLegalDocTemplate   = editLegalDocTemplate
  window.closeLegalDocEditor    = closeLegalDocEditor
  window.saveLegalDocTemplate   = saveLegalDocTemplate
  window.testLegalDocTemplate    = testLegalDocTemplate
  window.duplicateLegalDocTemplate = duplicateLegalDocTemplate
  // ── Excluir template (soft delete com confirmacao) ─────────
  async function deleteLegalDocTemplate(id, name) {
    // Confirmacao 1: pergunta basica
    var confirm1 = window.confirm('Deseja excluir o modelo "' + name + '"?\n\nEsta acao nao pode ser desfeita.')
    if (!confirm1) return

    // Confirmacao 2: digitar nome para confirmar
    var typed = window.prompt('Para confirmar, digite o nome do modelo:\n' + name)
    if (!typed || typed.trim().toLowerCase() !== name.trim().toLowerCase()) {
      if (window._showToast) _showToast('Documentos', 'Nome incorreto. Exclusao cancelada.', 'warning')
      return
    }

    if (!window._sbShared) return
    // Soft delete: setar deleted_at
    var res = await window._sbShared.from('legal_doc_templates').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (res.error) {
      if (window._showToast) _showToast('Documentos', 'Erro: ' + res.error.message, 'error')
    } else {
      if (window._showToast) _showToast('Documentos', '"' + name + '" excluido', 'success')
      await loadLegalDocTemplates()
      loadLegalDocMetrics()
    }
  }

  // ── Limpar registros ────────────────────────────────────────
  async function purgeTestDocRequests() {
    if (!window._sbShared) return

    var typed = window.prompt('Isso vai apagar TODOS os registros de documentos.\n\nDigite CONFIRMAR para continuar:')
    if (!typed || typed.trim() !== 'CONFIRMAR') {
      if (window._showToast) _showToast('Documentos', 'Cancelado', 'warning')
      return
    }

    try {
      // Tentar RPC primeiro, fallback para update direto
      var rpcRes = await window._sbShared.rpc('legal_doc_purge_all', {})
      if (rpcRes.error) {
        // Fallback: marcar como purged (RLS filtra por clinic_id)
        var upd = await window._sbShared.from('legal_doc_requests')
          .update({ status: 'purged' })
          .neq('status', 'purged')
      } else {
        var upd = rpcRes
      }
      if (upd.error) {
        if (window._showToast) _showToast('Documentos', 'Erro: ' + upd.error.message, 'error')
        return
      }
      // Limpar short links de consentimento
      await window._sbShared.from('short_links').delete().like('code', 'tc-%')

      if (window._showToast) _showToast('Documentos', 'Registros limpos. Metricas resetadas.', 'success')
      loadLegalDocRequests()
      loadLegalDocMetrics()
    } catch (e) {
      if (window._showToast) _showToast('Documentos', 'Erro: ' + e.message, 'error')
    }
  }

  window.purgeTestDocRequests = purgeTestDocRequests
  window.deleteLegalDocTemplate = deleteLegalDocTemplate
  window.resendLegalDocWhatsApp  = resendLegalDocWhatsApp
  window.saveLegalDocAdvancedConfig = saveLegalDocAdvancedConfig
  window.loadLegalDocAdvancedConfig = loadLegalDocAdvancedConfig
  window.ldeCmd                 = ldeCmd
  window.ldeInsertVar           = ldeInsertVar
})()
