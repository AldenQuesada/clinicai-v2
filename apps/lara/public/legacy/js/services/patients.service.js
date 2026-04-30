/**
 * ClinicAI — Patients Service (Sprint 7)
 *
 * Camada de negócio para pacientes com sync Supabase ↔ localStorage.
 *
 * ESTRATÉGIA:
 *   - loadAll(): busca do Supabase, normaliza, salva em clinicai_patients, retorna
 *   - getLocal(): leitura síncrona do cache localStorage (sem await)
 *   - syncOne(patient): fire-and-forget upsert para Supabase
 *   - syncBatch(): migração inicial de leads → patients
 *
 * FORMATO do cache clinicai_patients (compatível com renderPatientsTable):
 *   { id, leadId, name, phone, email, status, notes,
 *     proceduresDone[], totalRevenue, lastProcedureAt,
 *     firstProcedureAt, totalProcedures, createdAt }
 *
 * Depende de:
 *   PatientsRepository  (patients.repository.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiPatientsSvcLoaded) return
  window._clinicaiPatientsSvcLoaded = true

  const CACHE_KEY = 'clinicai_patients'

  function _repo() { return window.PatientsRepository || null }

  function _readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') }
    catch { return [] }
  }

  function _writeCache(patients) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(patients)) }
    catch { /* quota excedida */ }
  }

  // Mapeia o objeto retornado pelo Supabase (snake_case) pro shape JS (camelCase).
  // Convencao Postgres+JS: SQL = snake_case, JS = camelCase. Boundary aqui traduz.
  // RPC patients_list (mig 750+) retorna snake_case.
  function _normalize(p) {
    return {
      id:               p.id,
      leadId:           p.lead_id            || null,
      name:             p.name               || '—',
      phone:            p.phone              || '—',
      email:            p.email              || null,
      status:           p.status             || 'active',
      notes:            p.notes              || null,
      proceduresDone:   [],                              // enriquecido por appointments
      totalProcedures:  p.total_procedures   || 0,
      totalRevenue:     p.total_revenue      || 0,
      firstProcedureAt: p.first_procedure_at || null,
      lastProcedureAt:  p.last_procedure_at  || null,
      createdAt:        p.created_at         || null,
      _createdAt:       p.created_at         || null,    // alias para filtros de período
    }
  }

  // ── loadAll ───────────────────────────────────────────────────
  async function loadAll() {
    const repo = _repo()
    if (!repo) return _readCache()

    const result = await repo.listAll()
    if (!result.ok) {
      console.warn('[PatientsService] loadAll falhou, usando cache:', result.error)
      return _readCache()
    }

    const normalized = (result.data || []).map(_normalize)
    _writeCache(normalized)
    return normalized
  }

  // ── getLocal ──────────────────────────────────────────────────
  function getLocal() {
    return _readCache()
  }

  // ── syncOne ───────────────────────────────────────────────────
  function syncOne(patient) {
    const repo = _repo()
    if (!repo || !patient) return

    repo.upsert({
      id:              patient.id,
      leadId:          patient.leadId     || null,
      name:            patient.name !== '—' ? patient.name : null,
      phone:           patient.phone      || null,
      email:           patient.email      || null,
      status:          patient.status     || 'active',
      notes:           patient.notes      || null,
      totalProcedures: patient.totalProcedures || 0,
      totalRevenue:    patient.totalRevenue    || 0,
    }).then(result => {
      if (!result.ok) console.warn('[PatientsService] syncOne falhou:', result.error)
    }).catch(e => console.warn("[patients.service]", e.message || e))
  }

  // ── syncBatch ─────────────────────────────────────────────────
  // Migração inicial: envia leads com status 'paciente'/'attending' para Supabase
  async function syncBatch() {
    const repo = _repo()
    if (!repo) return { ok: false, error: 'PatientsRepository não disponível' }

    const leads = window.ClinicLeadsCache ? window.ClinicLeadsCache.read() : []
    const patientLeads = leads.filter(l =>
      ['paciente', 'attending', 'patient'].includes(l.status)
    )

    if (!patientLeads.length) {
      console.info('[PatientsService] syncBatch: nenhum lead paciente encontrado')
      return { ok: true, inserted: 0, errors: 0 }
    }

    const payload = patientLeads.map(l => ({
      leadId:          l.id,
      name:            l.name || l.nome || '',
      phone:           l.phone || l.whatsapp || '',
      email:           l.email || null,
      status:          'active',
      totalProcedures: 0,
      totalRevenue:    0,
    }))

    const result = await repo.syncBatch(payload)
    if (!result.ok) {
      console.error('[PatientsService] syncBatch falhou:', result.error)
      return { ok: false, error: result.error }
    }

    console.info('[PatientsService] syncBatch:', result.data)
    return result.data
  }

  // ── Auto-init após autenticação ───────────────────────────────
  document.addEventListener('clinicai:auth-success', () => {
    loadAll().catch(e => console.warn("[patients.service]", e.message || e))
  })

  // ── Exposição global ──────────────────────────────────────────
  window.PatientsService = Object.freeze({
    loadAll,
    getLocal,
    syncOne,
    syncBatch,
  })

})()
