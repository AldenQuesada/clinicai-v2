;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Validation · Cancel / No-show modal
//  Extraido de agenda-validation.js (seam 1, 2026-04-24) p/ reduzir
//  o monolito. Depende de globals:
//    window.STATUS_LABELS, window.getAppointments, window.saveAppointments,
//    window.AgendaValidator, window.AppointmentsService, window._getQueue,
//    window._saveQueue, window._openRecovery, window._applyStatusTag,
//    window.apptTransition, window.renderAgenda, window.SdrService,
//    window._showToast, window.showValidationErrors
// ══════════════════════════════════════════════════════════════════

// Motivos padrão para cancelamento/no-show (mesmos valores que o base
// exporta — duplicados aqui pra desacoplar ordem de carregamento)
const CANCEL_REASONS = [
  'Desistência',
  'Problema financeiro',
  'Imprevisto pessoal',
  'Doença',
  'Conflito de horário',
  'Remarcação solicitada pelo paciente',
  'Cancelado pela clínica',
  'Outro',
]
const NOSHOW_REASONS = [
  'Não compareceu sem aviso',
  'Sem resposta às tentativas de contato',
  'Imprevisto de última hora (informado depois)',
  'Esquecimento',
  'Problema de transporte',
  'Outro',
]

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Resolve lista de ids alvo conforme escopo:
//   'one'    -> só o apptId atual
//   'future' -> atual + todas futuras da mesma serie (data >= agora)
//   'all'    -> todas da serie ainda cancelaveis (exclui finalizado/cancelado/no_show)
function _resolveCancelTargets(appts, current, scope) {
  if (scope === 'one' || !current.recurrenceGroupId) return [current.id]
  const nowTs = Date.now()
  const out = []
  appts.forEach(a => {
    if (a.recurrenceGroupId !== current.recurrenceGroupId) return
    if (a.status === 'finalizado' || a.status === 'cancelado' || a.status === 'no_show') return
    if (scope === 'future') {
      if (a.id === current.id) { out.push(a.id); return }
      const apptTs = a.data
        ? new Date(a.data + 'T' + (a.horaInicio || '00:00') + ':00').getTime()
        : 0
      if (apptTs >= nowTs) out.push(a.id)
      return
    }
    out.push(a.id)
  })
  return out
}

// Calcula resumo da serie: quantas cancelaveis + quantas futuras.
function _cancelSeriesInfo(appts, groupId, currentDate, currentId) {
  if (!groupId) return null
  const nowTs = Date.now()
  let cancellable = 0, future = 0
  appts.forEach(a => {
    if (a.recurrenceGroupId !== groupId) return
    if (a.status === 'finalizado' || a.status === 'cancelado' || a.status === 'no_show') return
    cancellable++
    const apptTs = a.data
      ? new Date(a.data + 'T' + (a.horaInicio || '00:00') + ':00').getTime()
      : 0
    if (a.id !== currentId && apptTs >= nowTs) future++
  })
  return { cancellableCount: cancellable, futureCount: future }
}

function openCancelModal(apptId, statusAlvo) {
  const appts = window.getAppointments ? window.getAppointments() : []
  const appt  = appts.find(a => a.id === apptId)
  if (!appt) return

  const isNoShow   = statusAlvo === 'no_show'
  const title      = isNoShow ? 'Registrar No-show' : 'Cancelar Agendamento'
  const cor        = isNoShow ? '#DC2626' : '#EF4444'
  const reasons    = isNoShow ? NOSHOW_REASONS : CANCEL_REASONS
  const SL         = window.STATUS_LABELS || {}

  const groupId = appt.recurrenceGroupId || null
  const seriesInfo = (!isNoShow && groupId)
    ? _cancelSeriesInfo(appts, groupId, appt.data, appt.id)
    : null

  let m = document.getElementById('cancelReasonModal')
  if (!m) { m = document.createElement('div'); m.id = 'cancelReasonModal'; document.body.appendChild(m) }

  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px'
  m.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:${cor};padding:14px 18px">
        <div style="font-size:14px;font-weight:800;color:#fff">${title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px">${_esc(appt.pacienteNome||'Paciente')} · ${_esc(appt.data||'')} ${_esc(appt.horaInicio||'')}</div>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px">Motivo <span style="color:#EF4444">*</span></label>
          <select id="cancelReasonSel" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff">
            <option value="">— Selecione —</option>
            ${reasons.map(r => `<option value="${_esc(r)}">${_esc(r)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px">Observação (opcional)</label>
          <textarea id="cancelReasonObs" rows="2" placeholder="Detalhes adicionais..." style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;resize:vertical;outline:none;box-sizing:border-box;font-family:inherit"></textarea>
        </div>
        <div style="padding:10px 11px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;font-size:11px;color:#92400E;line-height:1.4">
          <strong>${isNoShow ? 'No-show registrado' : 'Ao cancelar'}:</strong> ${isNoShow ? 'Lead vai pra fluxo de recuperação automática.' : 'Lead volta pra fase "perdido" e entra no fluxo de reativação em 7 dias.'}
        </div>
        ${seriesInfo && seriesInfo.cancellableCount > 1 ? `
          <div style="padding:10px 11px;background:#F5F3FF;border:1.5px solid #C4B5FD;border-radius:8px;font-size:12px">
            <div style="font-weight:700;color:#6D28D9;margin-bottom:6px">Esta sessão faz parte de uma série (${seriesInfo.cancellableCount} sessões canceláveis)</div>
            <label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer;padding:4px 0">
              <input type="radio" name="cancelScope" value="one" checked style="margin-top:2px">
              <div>
                <div style="font-weight:700;color:#111">Só essa sessão</div>
                <div style="font-size:11px;color:#6B7280">Demais sessões da série seguem normais</div>
              </div>
            </label>
            ${seriesInfo.futureCount > 0 ? `
            <label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer;padding:4px 0">
              <input type="radio" name="cancelScope" value="future" style="margin-top:2px">
              <div>
                <div style="font-weight:700;color:#111">Essa + ${seriesInfo.futureCount} futura${seriesInfo.futureCount>1?'s':''}</div>
                <div style="font-size:11px;color:#6B7280">Sessões passadas/realizadas não são afetadas</div>
              </div>
            </label>` : ''}
            <label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer;padding:4px 0">
              <input type="radio" name="cancelScope" value="all" style="margin-top:2px">
              <div>
                <div style="font-weight:700;color:#111">Todas as sessões restantes (${seriesInfo.cancellableCount})</div>
                <div style="font-size:11px;color:#6B7280">Inclui sessões passadas ainda não realizadas</div>
              </div>
            </label>
          </div>
        ` : ''}
      </div>
      <div style="padding:12px 18px;border-top:1px solid #F3F4F6;display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('cancelReasonModal').style.display='none'" style="padding:9px 14px;border:1px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;cursor:pointer;font-size:13px;font-weight:700">Voltar</button>
        <button onclick="window.confirmCancelWithReason('${_esc(apptId)}','${_esc(statusAlvo)}')" style="padding:9px 16px;background:${cor};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">Confirmar ${isNoShow ? 'No-show' : 'Cancelamento'}</button>
      </div>
    </div>`
  m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none' })
}

function confirmCancelWithReason(apptId, statusAlvo) {
  const reasonSel = document.getElementById('cancelReasonSel')?.value?.trim()
  const reasonObs = document.getElementById('cancelReasonObs')?.value?.trim()

  if (!reasonSel) {
    const el = document.getElementById('cancelReasonSel')
    if (el) { el.style.borderColor = '#EF4444'; setTimeout(()=>el.style.borderColor='#E5E7EB',2000) }
    return
  }

  const appts = window.getAppointments ? window.getAppointments() : []
  const idx   = appts.findIndex(a => a.id === apptId)
  if (idx < 0) return

  const appt      = appts[idx]
  const motivo    = reasonSel + (reasonObs ? ` — ${reasonObs}` : '')
  const at        = new Date().toISOString()

  const scopeEl = document.querySelector('input[name="cancelScope"]:checked')
  const scope = (statusAlvo === 'cancelado' && appt.recurrenceGroupId && scopeEl) ? scopeEl.value : 'one'

  const targetIds = _resolveCancelTargets(appts, appt, scope)

  if (!targetIds.length) {
    if (window.showValidationErrors) window.showValidationErrors(['Nenhum agendamento elegível pra cancelar.'], 'Não foi possível processar')
    return
  }

  const motivoExt = scope === 'one' ? motivo : `${motivo} (série cancelada · escopo=${scope})`
  const changed = []
  targetIds.forEach(id => {
    const i = appts.findIndex(a => a.id === id)
    if (i < 0) return
    const target = appts[i]

    if (window.AgendaValidator) {
      const errs = window.AgendaValidator.validateCancelOrNoShow(target, motivoExt)
      if (errs.length) return
    }

    if (!appts[i].historicoStatus) appts[i].historicoStatus = []
    appts[i].historicoStatus.push({ status: statusAlvo, at, by: 'manual', motivo: motivoExt })
    if (!appts[i].historicoAlteracoes) appts[i].historicoAlteracoes = []
    appts[i].historicoAlteracoes.push({
      action_type:  statusAlvo === 'no_show' ? 'no_show' : 'cancelamento',
      old_value:    { status: target.status },
      new_value:    { status: statusAlvo, motivo: motivoExt, scope },
      changed_by:   'secretaria',
      changed_at:   at,
      reason:       motivoExt,
    })
    if (statusAlvo === 'cancelado') {
      appts[i].canceladoEm = at
      appts[i].motivoCancelamento = motivoExt
    } else {
      appts[i].noShowEm = at
      appts[i].motivoNoShow = motivoExt
    }
    appts[i].status = statusAlvo
    changed.push(appts[i])
  })

  if (!changed.length) {
    if (window.showValidationErrors) window.showValidationErrors(['Nenhum agendamento pôde ser cancelado (todos finalizados ou em consulta).'], 'Não foi possível processar')
    return
  }

  if (window.saveAppointments) window.saveAppointments(appts)

  if (window.AppointmentsService) {
    changed.forEach(a => window.AppointmentsService.syncOne(a))
  }

  if (window._showToast && changed.length > 1) {
    window._showToast('Série cancelada', changed.length + ' sessões canceladas', 'success')
  }

  const m = document.getElementById('cancelReasonModal')
  if (m) m.style.display = 'none'

  if (window._applyStatusTag && appts[idx].pacienteId) {
    const tagMap = { cancelado: 'cancelado', no_show: 'falta' }
    const tagId  = tagMap[statusAlvo]
    if (tagId) window._applyStatusTag(appts[idx], tagId, 'manual')
  }

  if (appts[idx].pacienteId && window.SdrService && window.SdrService.changePhase) {
    if (statusAlvo === 'cancelado') {
      window.SdrService.changePhase(appts[idx].pacienteId, 'perdido', 'cancelamento: ' + motivo)
    }
  }

  if (window._getQueue) {
    const cancelledIds = new Set(changed.map(a => a.id))
    const q = window._getQueue().map(x => cancelledIds.has(x.apptId) ? { ...x, executed: true } : x)
    if (window._saveQueue) window._saveQueue(q)
  }

  if (window.renderAgenda) window.renderAgenda()

  if (scope === 'one' && window._openRecovery) setTimeout(() => window._openRecovery(appts[idx]), 300)
}

// Audit log helper — compartilhado com outros pontos do sistema que
// nao sao do cancel flow mas precisam anotar historico de appts.
function addAuditLog(appt, actionType, oldValue, newValue, reason) {
  if (!appt.historicoAlteracoes) appt.historicoAlteracoes = []
  appt.historicoAlteracoes.push({
    action_type:  actionType,
    old_value:    oldValue,
    new_value:    newValue,
    changed_by:   'secretaria',
    changed_at:   new Date().toISOString(),
    reason:       reason || '',
  })
  return appt
}

// Expose
window.CANCEL_REASONS = Object.freeze(CANCEL_REASONS)
window.NOSHOW_REASONS = Object.freeze(NOSHOW_REASONS)
window.openCancelModal = openCancelModal
window.confirmCancelWithReason = confirmCancelWithReason
window.addAuditLog = addAuditLog

window.AgendaValidationCancel = Object.freeze({
  CANCEL_REASONS: CANCEL_REASONS,
  NOSHOW_REASONS: NOSHOW_REASONS,
  openCancelModal: openCancelModal,
  confirmCancelWithReason: confirmCancelWithReason,
  addAuditLog: addAuditLog
})

})()
