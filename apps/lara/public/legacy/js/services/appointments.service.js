/**
 * ClinicAI — Appointments Service
 *
 * Camada de negócio para agendamentos.
 * Gerencia sincronização bidirecional Supabase ↔ localStorage.
 * Graceful degradation: funciona offline (só localStorage).
 *
 * Depende de:
 *   AppointmentsRepository  (appointments.repository.js)
 *   PermissionsService      (permissions.service.js)
 *   AgendaAccessService     (agenda-access.service.js)  — para resolver professional_id
 *
 * API pública (window.AppointmentsService):
 *   loadForPeriod(dateFrom, dateTo)   — Supabase → merge localStorage → retorna array
 *   syncOne(appt)                     — fire-and-forget: push único para Supabase
 *   softDelete(id)                    — fire-and-forget: soft delete no Supabase
 *   syncBatch()                       — migração completa localStorage → Supabase
 *   getLocalForPeriod(dateFrom, dateTo) — lê localStorage filtrado (para overview)
 *   normalizeForOverview(appts)       — transforma para o formato esperado por agenda-overview.js
 *   getLocalLeadsAsPatients()         — deriva "patients" de clinicai_leads (para overview)
 *   getBirthdays(dateFrom, dateTo)    — aniversariantes de leads no período
 *   canCreate()                       — boolean: usuário pode criar agendamentos?
 *
 * Padrão de sync:
 *   • localStorage é escrito SEMPRE primeiro (operação síncrona, UX imediato)
 *   • Supabase é chamado depois como fire-and-forget (não bloqueia UI)
 *   • loadForPeriod() é chamado no init da página para trazer dados de outros dispositivos
 *   • Conflito: Supabase ganha (fonte de verdade multi-dispositivo)
 */

;(function () {
  'use strict'

  if (window._clinicaiApptServiceLoaded) return
  window._clinicaiApptServiceLoaded = true

  const APPT_KEY = 'clinicai_appointments'

  // Multi-tenant safe: se ClinicStorage disponivel, le/escreve em chave
  // namespaced por clinic_id (evita vazamento entre operadores no mesmo device).
  function _storageKey() {
    return window.ClinicStorage ? window.ClinicStorage.nsKey(APPT_KEY) : APPT_KEY
  }

  // ── Helpers de acesso ─────────────────────────────────────────
  function _repo()  { return window.AppointmentsRepository || null }

  function _canCreate() {
    const perms = window.PermissionsService
    return perms ? perms.can('agenda:create') : true  // fallback permissivo
  }

  // ── Mapeamento de status: localStorage → formato de overview ─
  // agenda-overview.js foi escrito com nomes da API externa.
  // Esta tabela faz a tradução sem tocar no código original.
  const _STATUS_TO_OVERVIEW = {
    agendado:               'scheduled',
    aguardando_confirmacao: 'scheduled',
    confirmado:             'confirmed',
    aguardando:             'confirmed',
    na_clinica:             'attended',
    em_consulta:            'attended',
    em_atendimento:         'attended',
    finalizado:             'attended',
    cancelado:              'cancelled',
    no_show:                'no_show',
    remarcado:              'rescheduled',
  }

  // Inverso: status da overview (ou do que o usuário clica) → localStorage
  const _OVERVIEW_TO_STATUS = {
    confirmed: 'confirmado',
    attended:  'na_clinica',
  }

  // ── Resolver professional_id a partir do índice ───────────────
  function _resolveProfessionalId(profissionalIdx) {
    try {
      const svc = window.AgendaAccessService
      if (!svc) return null
      const profs = svc.getAll()
      if (!Array.isArray(profs) || profissionalIdx == null) return null
      return profs[profissionalIdx]?.id || null
    } catch { return null }
  }

  // ── Prepara agendamento para Supabase (adiciona _professionalId) ─
  function _enrichForSupabase(appt) {
    const enriched = { ...appt }
    const profId = _resolveProfessionalId(appt.profissionalIdx)
    if (profId) enriched._professionalId = profId
    // Resolver phone do paciente se nao veio no appt
    if (!enriched.pacientePhone && enriched.pacienteId && window.LeadsService) {
      var leads = LeadsService.getLocal()
      var lead = leads.find(function(l) { return l.id === enriched.pacienteId })
      if (lead) enriched.pacientePhone = lead.phone || lead.whatsapp || ''
    }
    return enriched
  }

  // ── localStorage helpers (namespaced por clinic_id) ──────────
  function _readLocal() {
    try { return JSON.parse(localStorage.getItem(_storageKey()) || '[]') } catch { return [] }
  }

  // Defesa em profundidade: mesmo que _maybeRemapLocalId falhe (bug futuro,
  // race condition, localStorage escrito por versão antiga do código), o
  // _writeLocal garante que nunca persistimos pares (UUID + legacy) do mesmo
  // appointment. Prioridade: UUID > legacy; desempate por updated_at.
  // Chave de dedup: pacienteId|data|horaInicio|profissionalIdx (tupla que
  // representa "mesmo agendamento em outro ID").
  const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  function _dedupAppts(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return arr
    const byKey = new Map()
    for (const a of arr) {
      if (!a || !a.id) continue
      const key = [a.pacienteId || '', a.data || '', a.horaInicio || '', a.profissionalIdx ?? ''].join('|')
      const existing = byKey.get(key)
      if (!existing) { byKey.set(key, a); continue }
      const aIsUuid = _UUID_RE.test(a.id)
      const eIsUuid = _UUID_RE.test(existing.id)
      // Preferir UUID; se ambos iguais nesse eixo, pegar o mais recente
      if (aIsUuid && !eIsUuid) byKey.set(key, a)
      else if (eIsUuid && !aIsUuid) { /* keep existing */ }
      else {
        const aTs = Date.parse(a.updated_at || a.updatedAt || a.createdAt || 0) || 0
        const eTs = Date.parse(existing.updated_at || existing.updatedAt || existing.createdAt || 0) || 0
        if (aTs > eTs) byKey.set(key, a)
      }
    }
    const deduped = Array.from(byKey.values())
    if (deduped.length !== arr.length) {
      console.warn('[AppointmentsService] _writeLocal dedup removeu', arr.length - deduped.length, 'duplicata(s)')
    }
    return deduped
  }

  function _writeLocal(arr) {
    try { localStorage.setItem(_storageKey(), JSON.stringify(_dedupAppts(arr))) } catch (e) {
      if (e.name !== 'QuotaExceededError') console.warn('[AppointmentsService] localStorage:', e)
    }
  }

  // ── loadForPeriod ─────────────────────────────────────────────
  /**
   * Busca agendamentos de um período no Supabase e mescla com localStorage.
   * Supabase ganha em caso de conflito (fonte de verdade multi-dispositivo).
   * Usa cache local como fallback se Supabase indisponível.
   *
   * @param {string} dateFrom  YYYY-MM-DD
   * @param {string} dateTo    YYYY-MM-DD
   * @returns {Promise<object[]>}  array mesclado (mesmo formato localStorage)
   */
  async function loadForPeriod(dateFrom, dateTo) {
    const repo  = _repo()
    const local = _readLocal()

    if (!repo) return local.filter(a => a.data >= dateFrom && a.data <= dateTo)

    const result = await repo.listForPeriod(dateFrom, dateTo)

    if (!result.ok) {
      console.warn('[AppointmentsService] Supabase indisponível, usando localStorage:', result.error)
      return local.filter(a => a.data >= dateFrom && a.data <= dateTo)
    }

    const remote = result.data   // formato já é o do localStorage (o RPC retorna assim)

    if (!remote.length) {
      // Nenhum dado no Supabase para o período — retorna local
      return local.filter(a => a.data >= dateFrom && a.data <= dateTo)
    }

    // Mescla: Supabase ganha por ID; registros locais não presentes no remote são mantidos
    const remoteById = {}
    remote.forEach(r => { remoteById[r.id] = r })

    const merged = [
      // Registros remotos (Supabase ganha)
      ...remote,
      // Registros locais fora do período buscado (mantidos intactos)
      ...local.filter(l => l.data < dateFrom || l.data > dateTo),
      // Registros locais no período que NÃO existem no Supabase (ainda não sincronizados)
      ...local.filter(l => l.data >= dateFrom && l.data <= dateTo && !remoteById[l.id]),
    ]

    // Backup antes de sobrescrever (rollback em caso de dados corrompidos)
    try { localStorage.setItem(_storageKey() + '_backup', localStorage.getItem(_storageKey()) || '[]') } catch(e) { /* quota */ }
    _writeLocal(merged)
    return remote
  }

  // ── syncOne ───────────────────────────────────────────────────
  /**
   * Envia um agendamento para o Supabase (fire-and-forget).
   * Chamado após saveAppointments() em api.js.
   * Silencia erros — localStorage sempre prevalece como cache local.
   *
   * @param {object} appt  — agendamento no formato localStorage
   */
  var OFFLINE_QUEUE_KEY = 'clinicai_appt_offline_queue'
  function _offlineKey() {
    return window.ClinicStorage ? window.ClinicStorage.nsKey(OFFLINE_QUEUE_KEY) : OFFLINE_QUEUE_KEY
  }

  function _addToOfflineQueue(appt) {
    try {
      var q = JSON.parse(localStorage.getItem(_offlineKey()) || '[]')
      // Avoid duplicates
      q = q.filter(function(x) { return x.id !== appt.id })
      q.push(appt)
      localStorage.setItem(_offlineKey(), JSON.stringify(q))
    } catch(e) { /* quota */ }
  }

  var _retryingOffline = false

  async function _retryOfflineQueue() {
    var repo = _repo()
    if (!repo || _retryingOffline) return
    _retryingOffline = true
    try {
      var q = JSON.parse(localStorage.getItem(_offlineKey()) || '[]')
      if (!q.length) { _retryingOffline = false; return }
      var batch = q.slice(0, 5)
      var rest = q.slice(5)
      var results = await Promise.allSettled(batch.map(function(appt) { return repo.upsert(appt) }))
      var failed = []
      results.forEach(function(r, i) {
        if (r.status === 'rejected' || (r.value && !r.value.ok)) failed.push(batch[i])
      })
      var remaining = rest.concat(failed)
      if (remaining.length) localStorage.setItem(_offlineKey(), JSON.stringify(remaining))
      else localStorage.removeItem(_offlineKey())
    } catch(e) { /* silencioso */ }
    _retryingOffline = false
  }

  function syncOne(appt) {
    const repo = _repo()
    if (!repo || !appt?.id) {
      _addToOfflineQueue(_enrichForSupabase(appt))
      return Promise.resolve({ ok: false, queued: true })
    }

    const enriched = _enrichForSupabase(appt)
    const p = repo.upsert(enriched).then(function(result) {
      if (result && !result.ok) {
        console.warn('[AppointmentsService] syncOne falhou, adicionando ao offline queue:', appt.id)
        _addToOfflineQueue(enriched)
      } else {
        // Mig 811: remap ID legado se servidor gerou novo
        _maybeRemapLocalId(enriched.id, result && result.data)
      }
      return result || { ok: false }
    }).catch(function(err) {
      console.warn('[AppointmentsService] syncOne offline:', appt.id, err.message || err)
      _addToOfflineQueue(enriched)
      return { ok: false, error: err && err.message || String(err) }
    })

    // Retry offline queue on every successful connection
    _retryOfflineQueue()
    return p
  }

  /**
   * Versão awaitable de syncOne — para chamadores que precisam saber
   * se o save realmente persistiu no Supabase antes de prosseguir.
   * Retorna { ok: bool, error?: string, queued?: bool }
   *
   * Uso:
   *   const result = await AppointmentsService.syncOneAwait(appt)
   *   if (!result.ok) showError(result.error)
   */
  async function syncOneAwait(appt) {
    const repo = _repo()
    if (!repo) {
      _addToOfflineQueue(_enrichForSupabase(appt))
      return { ok: false, queued: true, error: 'Sem conexão. Salvo localmente.' }
    }
    if (!appt?.id) return { ok: false, error: 'Appointment sem ID' }

    const enriched = _enrichForSupabase(appt)
    try {
      const result = await repo.upsert(enriched)
      if (result && !result.ok) {
        _addToOfflineQueue(enriched)
        return { ok: false, queued: true, error: result.error || 'Erro ao sincronizar' }
      }
      // Mig 811: server pode ter remapeado ID legado (appt_<ts>_<rand>) pra UUID novo.
      // Sincroniza localStorage pra evitar appt fantasma com ID velho.
      _maybeRemapLocalId(enriched.id, result && result.data)
      return { ok: true }
    } catch (err) {
      _addToOfflineQueue(enriched)
      return { ok: false, queued: true, error: err.message || String(err) }
    }
  }

  // Detecta resposta do appt_upsert v2 (mig 811): se id_remapped=true,
  // troca o ID antigo pelo novo no localStorage e loga warning.
  function _maybeRemapLocalId(originalId, serverResp) {
    if (!serverResp || !serverResp.id_remapped || !serverResp.id) return
    const newId = serverResp.id
    if (newId === originalId) return
    try {
      const appts = _readLocal()
      const idx = appts.findIndex(a => a.id === originalId)
      if (idx < 0) return
      appts[idx] = { ...appts[idx], id: newId }
      _writeLocal(appts)
      console.info('[AppointmentsService] ID legado remapeado:', originalId, '→', newId)
    } catch (e) {
      console.warn('[AppointmentsService] _maybeRemapLocalId falhou:', e)
    }
  }

  // ── syncSeriesAwait ───────────────────────────────────────────
  /**
   * Persiste uma série recorrente de appointments em UMA transação server-side
   * via RPC appt_create_series (migration 483). Substitui o Promise.all de
   * syncOneAwait que deixava registros órfãos em caso de falha parcial.
   *
   * @param {object[]} appts  — array de appointments (base + filhos)
   * @returns {Promise<{ok, queued?, count?, error?}>}
   */
  async function syncSeriesAwait(appts) {
    if (!Array.isArray(appts) || !appts.length) {
      return { ok: false, error: 'Serie vazia' }
    }
    const sb = window._sbShared
    if (!sb) {
      // Sem conexão: enfileira cada um individualmente
      appts.forEach(a => _addToOfflineQueue(_enrichForSupabase(a)))
      return { ok: false, queued: true, error: 'Sem conexão. Série salva localmente para sync futuro.' }
    }
    const enriched = appts.map(_enrichForSupabase)
    try {
      const { data, error } = await sb.rpc('appt_create_series', { p_appts: enriched })
      if (error) {
        // Qualquer falha na RPC = toda série revertida no servidor (atomicidade).
        // Enfileirar cada um localmente para retry.
        enriched.forEach(a => _addToOfflineQueue(a))
        return { ok: false, queued: true, error: error.message || String(error) }
      }
      if (data && data.ok === false) {
        enriched.forEach(a => _addToOfflineQueue(a))
        return { ok: false, queued: true, error: data.error || 'Servidor rejeitou serie' }
      }
      return { ok: true, count: (data && data.count) || enriched.length }
    } catch (err) {
      enriched.forEach(a => _addToOfflineQueue(a))
      return { ok: false, queued: true, error: err.message || String(err) }
    }
  }

  // ── softDelete ────────────────────────────────────────────────
  /**
   * Dispara soft delete no Supabase (fire-and-forget).
   * Chamado após deleteAppt() em api.js.
   *
   * @param {string} id  — appt_... ID
   */
  function softDelete(id) {
    const repo = _repo()
    if (!repo || !id) return

    repo.remove(id).catch(err => {
      console.warn('[AppointmentsService] softDelete falhou silenciosamente:', err)
    })
  }

  // ── syncBatch ─────────────────────────────────────────────────
  /**
   * Migra TODOS os agendamentos do localStorage para Supabase.
   * Idempotente. Destinado à execução única na primeira integração.
   *
   * @returns {Promise<{ok, inserted, updated, errors, error?}>}
   */
  async function syncBatch() {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase não disponível' }

    const local = _readLocal()
    if (!local.length) return { ok: true, inserted: 0, updated: 0, errors: 0 }

    // Enriquece com _professionalId quando disponível
    const enriched = local.map(_enrichForSupabase)

    const result = await repo.syncBatch(enriched)
    if (!result.ok) return { ok: false, error: result.error }

    return { ok: true, ...result.data }
  }

  // ── getLocalForPeriod ─────────────────────────────────────────
  /**
   * Lê agendamentos do localStorage filtrados por data.
   * Usado por agenda-overview.js para KPIs sem chamada de rede.
   *
   * @param {Date} dateFrom
   * @param {Date} dateTo
   * @returns {object[]}
   */
  function getLocalForPeriod(dateFrom, dateTo) {
    const from = dateFrom instanceof Date ? dateFrom.toISOString().slice(0, 10) : String(dateFrom)
    const to   = dateTo   instanceof Date ? dateTo.toISOString().slice(0, 10)   : String(dateTo)
    return _readLocal().filter(a => {
      const d = a.data || ''
      return d >= from && d <= to
    })
  }

  // ── normalizeForOverview ──────────────────────────────────────
  /**
   * Transforma array de agendamentos (formato localStorage) para o formato
   * esperado pelas funções _aoRenderKpis, _aoRenderStats, _aoRenderTimeline, etc.
   * em agenda-overview.js.
   *
   * A função agenda-overview.js foi escrita usando a API externa e espera:
   *   a.status:       'scheduled' | 'confirmed' | 'attended' | 'no_show' | 'cancelled' | 'rescheduled'
   *   a.scheduledAt:  ISO timestamp para ordenação e grouping
   *   a.procedure:    { price: number, name: string }
   *   a.patient:      { name: string, leadId: string }
   *   a.professional: { name: string }
   *
   * @param {object[]} appts  — formato localStorage
   * @returns {object[]}       — formato agenda-overview
   */
  function normalizeForOverview(appts) {
    return appts.map(a => ({
      ...a,
      // Status traduzido
      status:       _STATUS_TO_OVERVIEW[a.status] || a.status,
      // ISO timestamp que as funções de gráfico/agrupamento usam
      scheduledAt:  a.data ? `${a.data}T${a.horaInicio || '00:00'}:00` : null,
      // Objeto procedure (para _aoRenderKpis: a.procedure?.price)
      procedure:    { price: a.valor || 0, name: a.procedimento || '' },
      // Objeto patient (para flyouts de paciente)
      patient:      { name: a.pacienteNome || '', leadId: a.pacienteId || '' },
      // Objeto professional (para ranking)
      professional: { name: a.profissionalNome || '' },
    }))
  }

  // ── getLocalLeadsAsPatients ───────────────────────────────────
  /**
   * Deriva lista de "patients" de clinicai_leads enriquecida com
   * data do último agendamento — para a seção "sem retorno" da overview.
   *
   * @returns {object[]}
   */
  function getLocalLeadsAsPatients() {
    try {
      const leads = (window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [])
      const appts = _readLocal()

      // Última consulta por lead
      const lastApptByLead = {}
      for (const a of appts) {
        if (!a.pacienteId || ['cancelado','no_show','remarcado'].includes(a.status)) continue
        if (!lastApptByLead[a.pacienteId] || a.data > lastApptByLead[a.pacienteId]) {
          lastApptByLead[a.pacienteId] = a.data
        }
      }

      return leads.map(l => ({
        id:          l.id,
        leadId:      l.id,
        name:        l.name || l.nome || '—',
        phone:       l.phone || l.whatsapp || '',
        email:       l.email || '',
        birthdate:   l.dataNascimento || l.nascimento || l.birthdate || null,
        lastApptAt:  lastApptByLead[l.id] || null,
        status:      l.status || 'active',
      }))
    } catch { return [] }
  }

  // ── getBirthdays ──────────────────────────────────────────────
  /**
   * Retorna aniversariantes de clinicai_leads cujo aniversário cai
   * dentro do período [dateFrom, dateTo] (compara mês+dia, ignora ano).
   *
   * @param {Date} dateFrom
   * @param {Date} dateTo
   * @returns {object[]}
   */
  function getBirthdays(dateFrom, dateTo) {
    try {
      const from   = dateFrom instanceof Date ? dateFrom : new Date(dateFrom + 'T00:00:00')
      const to     = dateTo   instanceof Date ? dateTo   : new Date(dateTo   + 'T23:59:59')
      const leads  = (window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : [])
      const result = []

      const now = new Date()
      const year = now.getFullYear()

      for (const l of leads) {
        const bd = l.dataNascimento || l.nascimento || l.birthdate
        if (!bd) continue

        // Tenta parsear como YYYY-MM-DD ou DD/MM/YYYY
        let month, day
        const matchISO = String(bd).match(/^(\d{4})-(\d{2})-(\d{2})/)
        const matchBR  = String(bd).match(/^(\d{2})\/(\d{2})\/(\d{4})/)

        if (matchISO) {
          month = parseInt(matchISO[2], 10)
          day   = parseInt(matchISO[3], 10)
        } else if (matchBR) {
          day   = parseInt(matchBR[1], 10)
          month = parseInt(matchBR[2], 10)
        } else continue

        // Constrói data de aniversário no ano corrente para comparação
        const bdThisYear = new Date(year, month - 1, day)
        if (bdThisYear >= from && bdThisYear <= to) {
          result.push({
            id:        l.id,
            leadId:    l.id,
            name:      l.name || l.nome || '—',
            phone:     l.phone || l.whatsapp || '',
            birthdate: bd,
            age:       year - (matchISO ? parseInt(matchISO[1], 10) : parseInt(matchBR[3], 10)),
            bdDate:    bdThisYear.toISOString().slice(0, 10),
          })
        }
      }

      return result.sort((a, b) => a.bdDate.localeCompare(b.bdDate))
    } catch { return [] }
  }

  // ── updateLocalStatus ─────────────────────────────────────────
  /**
   * Atualiza o status de um agendamento no localStorage e dispara
   * sync para Supabase (fire-and-forget).
   * Usado por aoConfirmAppt e aoMarkAttended em agenda-overview.js.
   *
   * @param {string} id              — appt_... ID
   * @param {string} overviewStatus  — 'confirmed' | 'attended'
   * @returns {{ ok: boolean, appt?: object }}
   */
  function updateLocalStatus(id, overviewStatus) {
    const newStatus = _OVERVIEW_TO_STATUS[overviewStatus]
    if (!newStatus) return { ok: false }

    const appts = _readLocal()
    const idx   = appts.findIndex(a => a.id === id)
    if (idx < 0) return { ok: false }

    appts[idx] = { ...appts[idx], status: newStatus }
    _writeLocal(appts)
    syncOne(appts[idx])

    return { ok: true, appt: appts[idx] }
  }

  // ── canCreate ─────────────────────────────────────────────────
  function canCreate() { return _canCreate() }

  // ============================================================
  // Wrappers de WhatsApp / VPI / catálogo (delegam pro Repository)
  // ============================================================
  // Mantêm a UI desacoplada do Repository e abrem porta pra adicionar
  // logica de negocio (rate limiting, dedup, retry com offline queue,
  // permission checks) no futuro sem mudar callers.

  function _normalizeWAResult(r) {
    if (!r) return { ok: false, error: 'no_response' }
    return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error }
  }

  /**
   * Cancela serie inteira de appointments recorrentes.
   * Delega pra Repository.deleteSeries; mantem callers desacoplados.
   */
  async function deleteSeries(groupId) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase indisponivel' }
    return _normalizeWAResult(await repo.deleteSeries(groupId))
  }

  /**
   * Envia uma mensagem WhatsApp ad-hoc pelo wa_outbox.
   * Use pra notificacoes pontuais (botao WA do appt, alerta double-check).
   */
  async function enqueueWAReminder(payload) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase indisponivel' }
    return _normalizeWAResult(await repo.enqueueWAReminder(payload))
  }

  /**
   * Cancela mensagens WA pendentes pra um appointment (cancelamento, no_show).
   * Fire-and-forget — nao bloqueia UI.
   */
  function cancelWAByAppt(apptId) {
    const repo = _repo()
    if (!repo || !apptId) return Promise.resolve({ ok: false })
    return repo.cancelWAByAppt(apptId).then(_normalizeWAResult)
  }

  /**
   * Agenda mensagem automatica (24h, 1h, consentimento).
   * Returns Promise pro caller decidir error handling.
   */
  function scheduleWAAutomation(payload) {
    const repo = _repo()
    if (!repo) return Promise.resolve({ ok: false, error: 'Supabase indisponivel' })
    return repo.scheduleWAAutomation(payload).then(_normalizeWAResult)
  }

  /**
   * Marca regra como enviada (idempotente). Usado pelo engine de automacao
   * antes de despachar pra evitar envio duplo.
   */
  async function tryMarkAutomationSent(payload) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase indisponivel' }
    return _normalizeWAResult(await repo.tryMarkAutomationSent(payload))
  }

  /**
   * Lista catalogo de procedimentos da clinica (cache-friendly).
   */
  async function listProcedures() {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase indisponivel', data: [] }
    return _normalizeWAResult(await repo.listProcedures())
  }

  /**
   * Lista procedimentos com pricing partner-aware (VPI). Usado quando
   * o paciente foi indicado por embaixadora — aplica desconto ou regra.
   */
  async function listProceduresWithPartnerPricing(leadId) {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'Supabase indisponivel', data: {} }
    return _normalizeWAResult(await repo.listProceduresWithPartnerPricing(leadId))
  }

  /**
   * Resolve nome da parceira VPI pra um lead (alertas/badges).
   */
  async function getPartnerNameByLead(leadId) {
    const repo = _repo()
    if (!repo) return { ok: false, data: { indicated: false } }
    return _normalizeWAResult(await repo.getPartnerNameByLead(leadId))
  }

  // ── Auto-init: carrega período atual ao autenticar ────────────
  document.addEventListener('clinicai:auth-success', () => {
    // Carrega o mês atual em background para popular localStorage com dados do Supabase
    const now   = new Date()
    const from  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const to    = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    loadForPeriod(from, to).catch(e => console.warn("[appointments.service]", e.message || e))
  })

  // ── Exposição global ──────────────────────────────────────────
  window.AppointmentsService = Object.freeze({
    // Core CRUD + sync
    loadForPeriod,
    syncOne,
    syncOneAwait,
    syncSeriesAwait,
    softDelete,
    syncBatch,
    // Recurrence
    deleteSeries,
    // WhatsApp / automacao
    enqueueWAReminder,
    cancelWAByAppt,
    scheduleWAAutomation,
    tryMarkAutomationSent,
    // Catalogo / VPI
    listProcedures,
    listProceduresWithPartnerPricing,
    getPartnerNameByLead,
    // Overview helpers
    getLocalForPeriod,
    normalizeForOverview,
    getLocalLeadsAsPatients,
    getBirthdays,
    updateLocalStatus,
    canCreate,
  })

})()
