/**
 * ClinicAI — Tasks Repository
 *
 * Acesso puro ao Supabase para o módulo de tarefas.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   sdr_get_tasks(p_status?, p_limit?, p_offset?)
 *   sdr_update_task_status(p_task_id, p_status)
 *   sdr_get_professionals()
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiTasksRepoLoaded) return
  window._clinicaiTasksRepoLoaded = true

  function _sb() {
    var sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)  { return { ok: true,  data: data,  error: null  } }
  function _err(e)    { return { ok: false, data: null,  error: typeof e === 'string' ? e : (e && e.message ? e.message : 'Erro desconhecido') } }

  // ── listTasks ─────────────────────────────────────────────────
  /**
   * Lista tarefas da clínica com filtro opcional de status.
   * @param {object} [opts]
   * @param {string|null} [opts.status]   'pending' | 'done' | null (todos)
   * @param {number}      [opts.limit]
   * @param {number}      [opts.offset]
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function listTasks({ status = null, limit = 100, offset = 0 } = {}) {
    try {
      var { data, error } = await _sb().rpc('sdr_get_tasks', {
        p_status: status || null,
        p_limit:  limit,
        p_offset: offset,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data && data.data ? data.data : [])
    } catch (e) { return _err(e) }
  }

  // ── updateStatus ──────────────────────────────────────────────
  /**
   * Atualiza o status de uma tarefa (fire-and-forget seguro).
   * @param {string} taskId
   * @param {string} status  — 'pending' | 'done'
   * @returns {Promise<{ok, data, error}>}
   */
  async function updateStatus(taskId, status) {
    try {
      var { data, error } = await _sb().rpc('sdr_update_task_status', {
        p_task_id: taskId,
        p_status:  status,
      })
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data)
    } catch (e) { return _err(e) }
  }

  // ── getProfessionals ──────────────────────────────────────────
  /**
   * Lista profissionais disponíveis para atribuição de tarefas.
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function getProfessionals() {
    try {
      var { data, error } = await _sb().rpc('sdr_get_professionals')
      if (error) return _err(error)
      if (data && data.ok === false) return _err(data.error)
      return _ok(data && data.data ? data.data : [])
    } catch (e) { return _err(e) }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.TasksRepository = Object.freeze({
    listTasks,
    updateStatus,
    getProfessionals,
  })

})()
