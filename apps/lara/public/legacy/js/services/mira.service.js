/**
 * ClinicAI — Mira Service
 *
 * Orquestrador da Mira: recebe mensagem do profissional, autentica,
 * detecta intent (regex Tier 1 + Claude Haiku Tier 2 fallback),
 * chama RPC apropriada, formata resposta.
 *
 * MODULAR: deps so de MiraRepository. Zero acoplamento com Lara.
 *
 * Tier 1 (regex puro): handles 80% das queries comuns instantaneo, R$ 0
 * Tier 2 (Claude Haiku): so quando regex nao bate, ~R$ 0.001/query
 */
;(function () {
  'use strict'
  if (window._clinicaiMiraSvcLoaded) return
  window._clinicaiMiraSvcLoaded = true

  function _repo() { return window.MiraRepository || null }

  // ── Intent Parser Tier 1: regex ───────────────────────────

  var INTENT_PATTERNS = [
    // HELP
    { intent: 'help',           re: /^\s*(\/?ajuda|\/?help|comandos|menu|opcoes|opções)\s*$/i },
    { intent: 'greeting',       re: /^\s*(oi|ola|olá|bom dia|boa tarde|boa noite|hey|hello|e ai)\s*[!?.]*\s*$/i },

    // AGENDA
    { intent: 'agenda_today',   re: /(agenda|horario|atendimento).*(hoje|do dia)|tenho hoje|tenho agenda hoje|quem.*hoje/i },
    { intent: 'agenda_tomorrow',re: /(agenda|horario|atendimento).*(amanha|amanhã)|tenho amanha|tenho amanhã/i },
    { intent: 'agenda_week',    re: /(agenda|horario).*(semana|esta semana)|minha semana/i },
    { intent: 'agenda_free',    re: /(horario|horarios).*(livre|livres|disponivel|disponiveis|vazio)|tem horario|esta livre/i },

    // PACIENTES
    { intent: 'patient_lookup', re: /(paciente|cliente|quem e|quem é).*([A-Z][a-z]+)/i },
    { intent: 'patient_phone',  re: /(telefone|contato|whats|whatsapp).*(de|do|da)\s+([A-Z][a-z]+)/i },
    { intent: 'patient_balance',re: /(quanto|saldo|deve|devendo).*([A-Z][a-z]+)/i },

    // FINANCEIRO
    { intent: 'finance_revenue',re: /(faturei|faturamento|receita|fatura|recebi).*(hoje|semana|mes|mês)/i },
    { intent: 'finance_commission', re: /(minha\s+)?comissao|comissão|quanto\s+ganhei/i },
    { intent: 'finance_coverage',   re: /cobertura|fixo|gasto fixo|cobrir.*despesa/i },
    { intent: 'finance_meta',   re: /(minha\s+)?meta|atingindo.*meta|bati.*meta/i },
  ]

  function parseIntent(text) {
    if (!text) return { intent: 'unknown', confidence: 0 }
    var t = String(text).trim()

    for (var i = 0; i < INTENT_PATTERNS.length; i++) {
      var p = INTENT_PATTERNS[i]
      var match = t.match(p.re)
      if (match) {
        return {
          intent: p.intent,
          confidence: 1.0,
          tier: 'regex',
          match: match,
          text: t,
        }
      }
    }

    return { intent: 'unknown', confidence: 0, tier: 'none', text: t }
  }

  // ── Formatador de respostas (WhatsApp markdown) ───────────

  function _bold(s) { return '*' + s + '*' }
  function _line() { return '─────────────' }

  function formatHelp(profName) {
    return ''
      + 'Oi ' + (profName || 'Doutor(a)') + '! 👋\n\n'
      + 'Tenho 4 areas de informacao:\n'
      + '📋 ' + _bold('/pacientes')  + '  — busca, saldo, historico\n'
      + '📅 ' + _bold('/agenda')     + '     — sua agenda, horarios livres\n'
      + '💰 ' + _bold('/financeiro') + ' — receita, comissao, cobertura\n'
      + '❓ ' + _bold('/ajuda')      + '      — todos os comandos\n\n'
      + 'Pode me perguntar em portugues normal, sem comando.'
  }

  function formatGreeting(profName) {
    return 'Oi ' + (profName || 'Doutor(a)') + '! Sou a Mira, sua assistente. Diga ' + _bold('/ajuda') + ' pra ver o que posso fazer.'
  }

  function formatUnknown() {
    return ''
      + '🤔 Nao entendi, mas estou aprendendo!\n\n'
      + 'Por enquanto eu entendo perguntas como:\n'
      + '• "tenho agenda hoje?"\n'
      + '• "quanto faturei essa semana?"\n'
      + '• "qual minha comissao do mes?"\n'
      + '• "quem e a Maria Silva?"\n\n'
      + 'Digite ' + _bold('/ajuda') + ' pra mais comandos.'
  }

  function formatNotImplemented(intent) {
    return ''
      + '⏳ Ja entendi voce — intent: ' + _bold(intent) + '\n\n'
      + 'Essa consulta esta sendo construida na proxima fase do sprint da Mira. '
      + 'Por enquanto so reconheco. Em breve ja estarei respondendo.'
  }

  // ── Helpers de data e dinheiro ────────────────────────────

  function _pad(n) { return n < 10 ? '0' + n : '' + n }
  function _isoDate(d) { return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()) }
  function _brDate(d)  { if (typeof d === 'string') d = new Date(d + 'T12:00:00'); return _pad(d.getDate()) + '/' + _pad(d.getMonth() + 1) }
  function _today()    { return new Date() }
  function _tomorrow() { var d = new Date(); d.setDate(d.getDate() + 1); return d }
  function _weekRange() {
    var d = new Date(), day = d.getDay() // 0=dom
    var monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7))
    var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    return { start: _isoDate(monday), end: _isoDate(sunday) }
  }
  function _monthRange() {
    var d = new Date()
    var start = new Date(d.getFullYear(), d.getMonth(), 1)
    var end   = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { start: _isoDate(start), end: _isoDate(end) }
  }
  function _todayRange() { var t = _isoDate(_today()); return { start: t, end: t } }

  function _money(n) {
    if (n == null || isNaN(n)) return 'R$ 0,00'
    var v = Number(n).toFixed(2).replace('.', ',')
    return 'R$ ' + v.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }
  function _pct(n) { return (n >= 0 ? '+' : '') + Number(n).toFixed(1).replace('.', ',') + '%' }

  function _extractName(text) {
    if (!text) return ''
    // Remove palavras de comando comuns
    var stop = /\b(quem|e|é|paciente|cliente|telefone|contato|whats|whatsapp|de|do|da|quanto|saldo|deve|devendo|me|a|o|me|esta|está)\b/gi
    var cleaned = text.replace(stop, ' ').replace(/[?!.]/g, '').replace(/\s+/g, ' ').trim()
    return cleaned
  }

  function _periodFromText(text) {
    var t = (text || '').toLowerCase()
    if (/hoje|do dia/.test(t))                       return Object.assign({ label: 'hoje' }, _todayRange())
    if (/semana/.test(t))                            return Object.assign({ label: 'essa semana' }, _weekRange())
    if (/mes|mês/.test(t))                           return Object.assign({ label: 'esse mes' }, _monthRange())
    return Object.assign({ label: 'esse mes' }, _monthRange()) // default
  }

  // ── Formatters de resposta ────────────────────────────────

  function formatAgenda(data, label) {
    if (!data || !data.appointments || data.appointments.length === 0) {
      return '📅 ' + _bold('Agenda — ' + (label || data.date)) + '\n\nNenhum agendamento.'
    }
    var lines = ['📅 ' + _bold('Agenda — ' + (label || data.date)), _line()]
    data.appointments.forEach(function(a) {
      var time = (a.time || '').substring(0, 5)
      var status = a.status === 'finalizado' ? '✅' : (a.status === 'cancelado' ? '❌' : '⏳')
      lines.push(status + ' ' + _bold(time) + ' — ' + (a.patient || 'Sem nome') + (a.procedure ? ' · ' + a.procedure : ''))
    })
    lines.push(_line())
    lines.push('Total: ' + _bold(data.total) + ' · Finalizados: ' + data.finalized + ' · Pendentes: ' + data.pending)
    return lines.join('\n')
  }

  function formatFreeSlots(data, label) {
    if (!data || !data.busy || data.busy.length === 0) {
      return '🟢 ' + _bold('Horarios — ' + (label || data.date)) + '\n\nDia totalmente livre.'
    }
    var lines = ['📅 ' + _bold('Ocupados — ' + (label || data.date)), _line()]
    data.busy.forEach(function(b) {
      var s = (b.start_time || '').substring(0, 5)
      var e = (b.end_time || '').substring(0, 5)
      lines.push('🔴 ' + _bold(s + (e ? '–' + e : '')) + ' — ' + (b.patient || 'Reservado'))
    })
    return lines.join('\n')
  }

  function formatPatientList(data) {
    if (!data || !data.results || data.results.length === 0) {
      return '🔍 Nenhum paciente encontrado para "' + (data && data.query || '') + '".'
    }
    var lines = ['👥 ' + _bold('Pacientes encontrados'), _line()]
    data.results.forEach(function(r, i) {
      lines.push((i + 1) + '. ' + _bold(r.name) + (r.phone ? ' · ' + r.phone : ''))
      var meta = []
      if (r.phase) meta.push('fase: ' + r.phase)
      if (r.temperature) meta.push('temp: ' + r.temperature)
      if (r.status) meta.push(r.status)
      if (meta.length) lines.push('   ' + meta.join(' · '))
    })
    return lines.join('\n')
  }

  function formatPatientBalance(data) {
    if (!data || !data.patient) return '🔍 Paciente nao encontrado.'
    var p = data.patient
    var lines = [
      '💰 ' + _bold('Saldo — ' + p.name),
      _line(),
      'Total: ' + _bold(_money(data.total)),
      'Pago: '  + _money(data.paid),
      'Saldo devedor: ' + _bold(_money(data.balance)),
    ]
    if (data.appointments && data.appointments.length) {
      lines.push(_line())
      lines.push(_bold('Atendimentos:'))
      data.appointments.slice(0, 5).forEach(function(a) {
        var saldoApt = Math.max(0, Number(a.value || 0) - Number(a.paid || 0))
        lines.push('• ' + _brDate(a.date) + ' — ' + (a.procedure || 's/proc') + ' · ' + _money(a.value) + ' (saldo ' + _money(saldoApt) + ')')
      })
    }
    return lines.join('\n')
  }

  function formatFinanceSummary(data, label) {
    if (!data) return 'Sem dados financeiros.'
    var lines = [
      '💰 ' + _bold('Receita — ' + (label || 'periodo')),
      _line(),
      'Bruto: ' + _bold(_money(data.bruto)),
      'Atendimentos: ' + data.qtd,
      'Ticket medio: ' + _money(data.ticket_medio),
    ]
    if (data.delta_pct != null) {
      var arrow = data.delta_pct >= 0 ? '📈' : '📉'
      lines.push(arrow + ' vs anterior: ' + _pct(data.delta_pct) + ' (' + _money(data.previous_bruto) + ')')
    }
    return lines.join('\n')
  }

  function formatFinanceCommission(data, label) {
    if (!data) return 'Sem dados de comissao.'
    return [
      '💼 ' + _bold('Comissao — ' + (label || 'periodo')),
      _line(),
      'Bruto gerado: ' + _money(data.bruto),
      'Comissao: ' + _bold(_money(data.comissao)),
      'Percentual efetivo: ' + Number(data.percentual || 0).toFixed(1).replace('.', ',') + '%',
    ].join('\n')
  }

  function formatRpcError(data) {
    if (!data) return '⚠️ Sem resposta do servidor.'
    if (data.error === 'unauthorized') return formatUnauthorized()
    if (data.error === 'patient_not_found') return '🔍 Paciente nao encontrado.'
    if (data.error === 'query_too_short')   return '🔍 Termo de busca muito curto. Mande pelo menos 2 letras.'
    return '⚠️ ' + (data.error || 'erro desconhecido')
  }

  // ── Execucao de intents (chama RPC + formata) ─────────────

  async function executeIntent(parsed, phone) {
    var repo = _repo()
    var intent = parsed.intent
    var text = parsed.text || ''

    // AGENDA
    if (intent === 'agenda_today') {
      var r = await repo.agenda(phone, _isoDate(_today()))
      if (!r.ok || !r.data || r.data.ok === false) return formatRpcError(r.data)
      return formatAgenda(r.data, 'hoje')
    }
    if (intent === 'agenda_tomorrow') {
      var r2 = await repo.agenda(phone, _isoDate(_tomorrow()))
      if (!r2.ok || !r2.data || r2.data.ok === false) return formatRpcError(r2.data)
      return formatAgenda(r2.data, 'amanha')
    }
    if (intent === 'agenda_week') {
      var w = _weekRange()
      var t = _isoDate(_today())
      var rw = await repo.agenda(phone, t)
      if (!rw.ok || !rw.data || rw.data.ok === false) return formatRpcError(rw.data)
      return formatAgenda(rw.data, 'hoje (' + w.start + ' a ' + w.end + ')')
    }
    if (intent === 'agenda_free') {
      var rf = await repo.agendaFreeSlots(phone, _isoDate(_today()))
      if (!rf.ok || !rf.data || rf.data.ok === false) return formatRpcError(rf.data)
      return formatFreeSlots(rf.data, 'hoje')
    }

    // PACIENTES
    if (intent === 'patient_lookup' || intent === 'patient_phone') {
      var name = _extractName(text)
      if (!name || name.length < 2) return '🔍 Diga o nome do paciente. Ex: "quem e Maria Silva?"'
      var rp = await repo.patientSearch(phone, name, 5)
      if (!rp.ok || !rp.data || rp.data.ok === false) return formatRpcError(rp.data)
      return formatPatientList(rp.data)
    }
    if (intent === 'patient_balance') {
      var name2 = _extractName(text)
      if (!name2 || name2.length < 2) return '🔍 Diga o nome do paciente. Ex: "quanto a Maria Silva me deve?"'
      var rb = await repo.patientBalance(phone, name2)
      if (!rb.ok || !rb.data || rb.data.ok === false) return formatRpcError(rb.data)
      return formatPatientBalance(rb.data)
    }

    // FINANCEIRO
    if (intent === 'finance_revenue') {
      var per = _periodFromText(text)
      var rs = await repo.financeSummary(phone, per.start, per.end)
      if (!rs.ok || !rs.data || rs.data.ok === false) return formatRpcError(rs.data)
      return formatFinanceSummary(rs.data, per.label)
    }
    if (intent === 'finance_commission') {
      var per2 = _periodFromText(text)
      var rc = await repo.financeCommission(phone, per2.start, per2.end)
      if (!rc.ok || !rc.data || rc.data.ok === false) return formatRpcError(rc.data)
      return formatFinanceCommission(rc.data, per2.label)
    }
    if (intent === 'finance_coverage' || intent === 'finance_meta') {
      var perM = _periodFromText('mes')
      var rcv = await repo.financeSummary(phone, perM.start, perM.end)
      if (!rcv.ok || !rcv.data || rcv.data.ok === false) return formatRpcError(rcv.data)
      var d = rcv.data
      var receita = d.receita || d.revenue || 0
      var ticket = d.ticket_medio || d.avg_ticket || 0
      var delta = d.delta_pct || 0
      var deltaIcon = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️'
      if (intent === 'finance_meta') {
        return '🎯 *Acompanhamento do Mes*\n\n'
          + 'Receita acumulada: *R$ ' + receita.toLocaleString('pt-BR') + '*\n'
          + 'Ticket medio: *R$ ' + ticket.toLocaleString('pt-BR') + '*\n'
          + deltaIcon + ' ' + (delta > 0 ? '+' : '') + delta.toFixed(1) + '% vs mes anterior'
      }
      return '💰 *Cobertura do Mes*\n\n'
        + 'Receita acumulada: *R$ ' + receita.toLocaleString('pt-BR') + '*\n'
        + 'Ticket medio: *R$ ' + ticket.toLocaleString('pt-BR') + '*\n'
        + deltaIcon + ' ' + (delta > 0 ? '+' : '') + delta.toFixed(1) + '% vs mes anterior'
    }

    return formatNotImplemented(intent)
  }

  function formatRateLimited(count, max) {
    return ''
      + '⛔ Voce atingiu o limite de ' + max + ' queries por dia (' + count + '/' + max + ').\n\n'
      + 'O contador zera automatico amanha. Se for urgente, peca ao admin pra liberar.'
  }

  function formatUnauthorized() {
    return '🚫 Numero nao autorizado. Peca ao admin pra cadastrar voce na lista de profissionais Mira.'
  }

  function formatNoPermission(area) {
    var labels = { agenda: 'Agenda', pacientes: 'Pacientes', financeiro: 'Financeiro' }
    return '🔒 Voce nao tem permissao para consultar ' + _bold(labels[area] || area) + '.\n\nPeca ao admin pra liberar essa area no seu cadastro.'
  }

  // Mapa intent → area de permissao
  var INTENT_AREA = {
    agenda_today:    'agenda',
    agenda_tomorrow: 'agenda',
    agenda_week:     'agenda',
    agenda_free:     'agenda',
    patient_lookup:  'pacientes',
    patient_phone:   'pacientes',
    patient_balance: 'pacientes',
    finance_revenue:    'financeiro',
    finance_commission: 'financeiro',
    finance_coverage:   'financeiro',
    finance_meta:       'financeiro',
  }

  function _hasPermission(perms, area) {
    if (!area) return true
    if (!perms) return true // sem perms cadastradas = libera tudo (compat com numeros antigos)
    return perms[area] !== false
  }

  // ── Orquestrador principal ────────────────────────────────

  /**
   * handleMessage(phone, text) → { ok, response, intent, ms }
   * Funciona em dois modos:
   *   - Real: validacao + auth + rate limit + log
   *   - Test: bypass auth se opts.bypassAuth=true
   */
  // SSOT: chama wa_pro_handle_message direto. Fonte unica de verdade.
  async function handleMessageSSOT(phone, text) {
    try {
      var sb = window._sbShared
      if (!sb) throw new Error('Supabase client nao disponivel')
      var r = await sb.rpc('wa_pro_handle_message', { p_phone: phone, p_text: text })
      if (r.error) return { ok: false, response: '⚠️ ' + r.error.message, intent: 'error' }
      var d = r.data || {}
      return {
        ok: d.ok !== false,
        response: d.response || 'Sem resposta',
        intent: d.intent || 'unknown',
        professional: d.professional || null,
        ms: d.elapsed_ms || 0,
        quota: d.quota || null,
        tier: 'rpc',
      }
    } catch (e) {
      return { ok: false, response: '⚠️ ' + (e.message || e), intent: 'error' }
    }
  }

  async function handleMessage(phone, text, opts) {
    opts = opts || {}
    var startedAt = Date.now()

    if (!text || !String(text).trim()) {
      return { ok: false, response: 'Mensagem vazia', intent: 'empty' }
    }

    // SSOT: se nao eh bypass, delega pra RPC
    if (!opts.bypassAuth) {
      return handleMessageSSOT(phone, text)
    }

    var repo = _repo()
    if (!repo) {
      return { ok: false, response: 'MiraRepository nao disponivel', intent: 'error' }
    }

    var prof = null
    var waNumberId = null

    // 1. Autenticacao
    if (!opts.bypassAuth) {
      var authRes = await repo.authenticate(phone)
      if (!authRes.ok || !authRes.data || !authRes.data.ok) {
        return {
          ok: false,
          response: formatUnauthorized(),
          intent: 'unauthorized',
          ms: Date.now() - startedAt,
        }
      }
      prof = {
        id:           authRes.data.professional_id,
        name:         authRes.data.name,
        access_scope: authRes.data.access_scope,
        permissions:  authRes.data.permissions || null,
      }
      waNumberId = authRes.data.wa_number_id

      // 2. Rate limit
      var rlRes = await repo.checkRateLimit(prof.id)
      if (!rlRes.ok || !rlRes.data || !rlRes.data.ok) {
        var rl = (rlRes && rlRes.data) || {}
        return {
          ok: false,
          response: formatRateLimited(rl.count || 0, rl.max || 50),
          intent: 'rate_limited',
          ms: Date.now() - startedAt,
        }
      }
    } else {
      prof = opts.testProfessional || { id: null, name: 'Tester', access_scope: 'full', permissions: { agenda: true, pacientes: true, financeiro: true } }
    }

    // 3. Parse intent (Tier 1: regex)
    var parsed = parseIntent(text)

    // 4. Roteamento de respostas
    var response = ''
    if (parsed.intent === 'help') {
      response = formatHelp(prof.name)
    } else if (parsed.intent === 'greeting') {
      response = formatGreeting(prof.name)
    } else if (parsed.intent === 'unknown') {
      response = formatUnknown()
    } else {
      // Checa permissao antes de executar
      var area = INTENT_AREA[parsed.intent]
      if (area && !_hasPermission(prof.permissions, area)) {
        response = formatNoPermission(area)
      } else {
        try {
          response = await executeIntent(parsed, phone)
        } catch (e) {
          console.warn('[Mira] executeIntent error:', e)
          response = '⚠️ Erro ao processar: ' + (e && e.message || e)
        }
      }
    }

    var elapsedMs = Date.now() - startedAt

    // 5. Log (sempre, se autenticado)
    if (!opts.bypassAuth && prof.id) {
      repo.logQuery({
        phone:           phone,
        professional_id: prof.id,
        wa_number_id:    waNumberId,
        query:           text,
        intent:          parsed.intent,
        response:        response,
        success:         true,
        response_ms:     elapsedMs,
      }).catch(function(e) { console.warn('[Mira] log fail:', e) })
    }

    return {
      ok: true,
      response: response,
      intent: parsed.intent,
      tier: parsed.tier,
      professional: prof,
      ms: elapsedMs,
    }
  }

  window.MiraService = Object.freeze({
    handleMessage: handleMessage,
    handleMessageSSOT: handleMessageSSOT,
    parseIntent:   parseIntent,
    formatHelp:    formatHelp,
    formatGreeting: formatGreeting,
    formatUnknown: formatUnknown,
    listNumbers:   function() { return _repo() ? _repo().listNumbers() : Promise.resolve({ ok: false, data: [] }) },
    listProfessionals: function() { return _repo() ? _repo().listProfessionals() : Promise.resolve({ ok: false, data: [] }) },
    registerNumber: function(p) { return _repo() ? _repo().registerNumber(p) : Promise.resolve({ ok: false }) },
  })
})()
