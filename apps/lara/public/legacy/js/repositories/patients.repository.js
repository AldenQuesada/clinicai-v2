/**
 * ClinicAI — Patients Repository (Sprint 7)
 *
 * Acesso puro ao Supabase para a tabela patients.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * Schema real da tabela patients:
 *   id text, leadId text, tenantId text, name text, phone text,
 *   email text, status text, totalProcedures int, totalRevenue float,
 *   firstProcedureAt timestamp, lastProcedureAt timestamp,
 *   createdAt timestamp, updatedAt timestamp, notes text, deleted_at timestamptz
 *
 * RPCs consumidas:
 *   patients_list(p_clinic_id?)
 *   patients_upsert(p_id, p_lead_id, p_name, p_phone, p_email,
 *                   p_status, p_notes, p_total_procedures, p_total_revenue,
 *                   p_clinic_id?)
 *   patients_get_by_lead(p_lead_id)
 *   patients_sync_batch(p_patients, p_clinic_id?)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiPatientsRepoLoaded) return
  window._clinicaiPatientsRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── listAll ───────────────────────────────────────────────────
  async function listAll() {
    try {
      const { data, error } = await _sb().rpc('patients_list')
      if (error) return _err(error.message || String(error))
      return _ok(Array.isArray(data) ? data : [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── upsert ────────────────────────────────────────────────────
  async function upsert(patient) {
    try {
      const { data, error } = await _sb().rpc('patients_upsert', {
        p_id:               patient.id                || null,
        p_lead_id:          patient.leadId            || null,
        p_name:             patient.name              || null,
        p_phone:            patient.phone !== '—' ? (patient.phone || null) : null,
        p_email:            patient.email             || null,
        p_status:           patient.status            || 'active',
        p_notes:            patient.notes             || null,
        p_total_procedures: patient.totalProcedures   || 0,
        p_total_revenue:    patient.totalRevenue      || 0,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── getByLead ─────────────────────────────────────────────────
  async function getByLead(leadId) {
    try {
      const { data, error } = await _sb().rpc('patients_get_by_lead', {
        p_lead_id: leadId,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── syncBatch ─────────────────────────────────────────────────
  async function syncBatch(patients) {
    if (!patients?.length) return _ok({ ok: true, total: 0, inserted: 0, errors: 0 })
    try {
      const { data, error } = await _sb().rpc('patients_sync_batch', {
        p_patients: patients,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.PatientsRepository = Object.freeze({
    listAll,
    upsert,
    getByLead,
    syncBatch,
  })

})()
