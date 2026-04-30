;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Validation Engine  v1.0
//  Camada 1 (Frontend): todas as regras de negócio da agenda
//  Referência: spec de validações seções 1-21
// ══════════════════════════════════════════════════════════════════

// ── Constantes de status ──────────────────────────────────────────
const BLOCKS_CALENDAR = new Set([
  'agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_consulta'
])
const FREE_STATUSES = new Set(['cancelado','no_show','finalizado','remarcado'])
const LOCKED_STATUSES = new Set(['finalizado','em_consulta','na_clinica'])
// Drag & drop só é bloqueado APÓS o atendimento ser finalizado.
// Status intermediários (na_clinica, em_consulta) permitem reagendar
// caso a secretária precise corrigir algo no fluxo.
const NO_DRAG_STATUSES = new Set(['finalizado'])


// ── Utilitários internos ──────────────────────────────────────────
function _toMins(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function _overlap(s1, e1, s2, e2) {
  return s1 < e2 && e1 > s2
}

function _isPastDate(dateStr) {
  if (!dateStr) return false
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(dateStr + 'T12:00')
  return d < today
}

function _isPastTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false
  return new Date(`${dateStr}T${timeStr}:00`) < new Date()
}

function _todayIso() {
  return new Date().toISOString().slice(0,10)
}

function _getAppts() {
  return window.getAppointments ? window.getAppointments() : []
}

function _getProf(idx) {
  const profs = window.getProfessionals ? window.getProfessionals() : []
  return (idx !== null && idx !== undefined && idx !== '') ? profs[parseInt(idx)] || null : null
}

function _getRoom(idx) {
  const rooms = window.getRooms ? window.getRooms() : []
  return (idx !== null && idx !== undefined && idx !== '') ? rooms[parseInt(idx)] || null : null
}

// ── Horarios da clinica (por dia da semana, com manha/tarde/fechado) ─
// Le direto de clinicai_clinic_settings (gravado pela pagina Dados da Clinica).
// Fallback para clinic_config (range global legado) e depois hardcoded.

const _DOW_KEYS = ['dom','seg','ter','qua','qui','sex','sab']

function _getClinicDay(dateStr) {
  // Retorna { aberto, periods: [{ini,fim,label}] } para o dia de dateStr
  // aberto=false se a clinica nao funciona nesse dia
  // periods vazio = sem horario configurado => fallback default
  var defaults = { aberto: true, periods: [{ ini: '08:00', fim: '19:00', label: 'dia' }] }
  if (!dateStr) return defaults
  try {
    var raw = localStorage.getItem('clinicai_clinic_settings')
    if (!raw) {
      // Fallback clinic_config legado (range global)
      var cfg = JSON.parse(localStorage.getItem('clinic_config') || '{}')
      return { aberto: true, periods: [{ ini: cfg.horarioInicio || '08:00', fim: cfg.horarioFim || '19:00', label: 'dia' }] }
    }
    var data = JSON.parse(raw)
    // data pode estar em multiplos formatos: {horarios}, {data:{horarios}}, {data:{data:{horarios}}}
    var horarios = (data && data.horarios)
                || (data && data.data && data.data.horarios)
                || (data && data.data && data.data.data && data.data.data.horarios)
                || null
    if (!horarios) return defaults
    // Dia da semana (JS: 0=dom..6=sab)
    var dow = new Date(dateStr + 'T12:00:00').getDay()
    var key = _DOW_KEYS[dow]
    var d = horarios[key]
    if (!d) return defaults
    if (d.aberto === false) return { aberto: false, periods: [] }
    var periods = []
    if (d.manha && d.manha.ativo !== false && d.manha.inicio && d.manha.fim) {
      periods.push({ ini: d.manha.inicio, fim: d.manha.fim, label: 'manha' })
    }
    if (d.tarde && d.tarde.ativo !== false && d.tarde.inicio && d.tarde.fim) {
      periods.push({ ini: d.tarde.inicio, fim: d.tarde.fim, label: 'tarde' })
    }
    // Retrocompatibilidade: formato antigo com abertura/fechamento
    if (!periods.length && (d.abertura || d.fechamento)) {
      periods.push({ ini: d.abertura || '08:00', fim: d.fechamento || '18:00', label: 'dia' })
    }
    if (!periods.length) return defaults
    return { aberto: true, periods: periods }
  } catch (e) {
    return defaults
  }
}

function _formatPeriods(periods) {
  return periods.map(function(p) { return p.ini + '-' + p.fim }).join(' / ')
}

// Verifica se o intervalo [s,e] (em mins) cabe INTEIRO em algum period do dia.
// Retorna null se OK, string com erro se nao couber.
function _checkInPeriods(s, e, day, horaInicio, horaFim) {
  if (!day.aberto) {
    return 'Clinica fechada neste dia da semana. Configure em Dados da Clinica se precisar abrir.'
  }
  if (!day.periods.length) return null
  // Precisa caber inteiro em pelo menos 1 period
  for (var i = 0; i < day.periods.length; i++) {
    var p = day.periods[i]
    var pS = _toMins(p.ini), pE = _toMins(p.fim)
    if (s >= pS && e <= pE) return null  // cabe
  }
  // Nao coube. Detecta se inicio esta em almoco (entre manha e tarde)
  var horarios = _formatPeriods(day.periods)
  // Se tem exatamente 2 periods (manha+tarde), verifica se cai no almoco
  if (day.periods.length === 2) {
    var m = day.periods[0], t = day.periods[1]
    var mE = _toMins(m.fim), tS = _toMins(t.ini)
    if ((s >= mE && s < tS) || (e > mE && e <= tS) || (s < mE && e > tS)) {
      return 'Horario ' + horaInicio + '-' + horaFim + ' cai no intervalo de almoco (' + m.fim + '-' + t.ini + '). Horarios validos: ' + horarios + '.'
    }
  }
  return 'Horario ' + horaInicio + '-' + horaFim + ' fora do funcionamento. Horarios validos neste dia: ' + horarios + '.'
}

// Legado — mantido para callers externos que esperam range simples
function _getClinicHours() {
  try {
    const cfg = JSON.parse(localStorage.getItem('clinic_config') || '{}')
    return { inicio: cfg.horarioInicio || '08:00', fim: cfg.horarioFim || '19:00' }
  } catch { return { inicio: '08:00', fim: '19:00' } }
}

// Le antecedencia_min (em HORAS) do clinicai_clinic_settings. 0 = sem regra.
function _getMinAdvanceHours() {
  try {
    const raw = localStorage.getItem('clinicai_clinic_settings')
    if (!raw) return 0
    const d = JSON.parse(raw)
    const s = (d && d.settings) || (d && d.data && d.data.settings) || (d && d.data) || d
    const v = Number(s && s.antecedencia_min)
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch { return 0 }
}

// Status que so fazem sentido NO DIA do appt (paciente fisicamente na clinica
// ou consulta em curso). Se o agendamento e pra data futura, esses nao podem
// ser o status inicial.
const SAME_DAY_ONLY_STATUSES = new Set([
  'na_clinica', 'em_consulta', 'em_atendimento', 'finalizado'
])

// ── Validador principal ───────────────────────────────────────────
const AgendaValidator = {

  // ─────────────────────────────────────────────────────────────────
  // 1. Campos obrigatórios
  // ─────────────────────────────────────────────────────────────────
  validateRequiredFields(data) {
    const errs = []
    if (!data.pacienteNome?.trim() && !data.pacienteId) {
      errs.push('Paciente é obrigatório.')
    }
    if (!data.pacienteId) {
      errs.push('Selecione um paciente cadastrado. Não é possível agendar sem patient_id.')
    }
    if (!data.data) errs.push('Data é obrigatória.')
    if (!data.horaInicio) errs.push('Horário inicial é obrigatório.')
    if (!data.horaFim) errs.push('Horário final é obrigatório.')
    if (data.profissionalIdx === undefined || data.profissionalIdx === null || data.profissionalIdx === '') {
      errs.push('Profissional é obrigatório.')
    }
    if (!data.tipoConsulta) errs.push('Tipo de atendimento é obrigatório.')
    if (!data.status) errs.push('Status inicial é obrigatório.')
    if (!data.origem) errs.push('Origem do agendamento é obrigatória.')

    // Bug #2 (auditoria 2026-04-23): status "só dia atual" não pode ser
    // o inicial num agendamento em data futura. 'na_clinica' implica
    // paciente já na clínica; 'em_consulta' implica consulta em andamento;
    // esses estados emergem via transição no próprio dia, não na criação.
    if (data.status && data.data && SAME_DAY_ONLY_STATUSES.has(data.status)) {
      if (data.data > _todayIso()) {
        errs.push(`Status "${data.status}" só vale pro dia do agendamento. Use "agendado", "aguardando_confirmacao" ou "confirmado" pra datas futuras.`)
      }
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 2. Validações de horário
  // ─────────────────────────────────────────────────────────────────
  validateTime(data, isEdit = false) {
    const errs = []
    const { data: dateStr, horaInicio, horaFim } = data
    if (!dateStr || !horaInicio || !horaFim) return errs

    if (!isEdit) {
      if (_isPastDate(dateStr)) {
        errs.push('Não é possível agendar em data passada.')
      } else if (dateStr === _todayIso() && _isPastTime(dateStr, horaInicio)) {
        errs.push('Não é possível agendar em horário passado.')
      } else {
        // Bug #1 (auditoria 2026-04-23): respeitar antecedencia_min (horas)
        // do clinic_settings. Se o delta do agendamento ao agora for menor
        // que o minimo, bloqueia.
        const minH = _getMinAdvanceHours()
        if (minH > 0) {
          const apptAt = new Date(`${dateStr}T${horaInicio}:00`)
          const deltaH = (apptAt - new Date()) / 3600000
          if (deltaH < minH) {
            errs.push(`Antecedência mínima é de ${minH}h. Este horário está a ${deltaH.toFixed(1)}h do agora.`)
          }
        }
      }
    }

    const s = _toMins(horaInicio)
    const e = _toMins(horaFim)
    if (e <= s) errs.push('Horario final deve ser posterior ao horario inicial.')
    var duracao = e - s
    if (duracao <= 0) errs.push('Duracao nao pode ser zero.')
    if (duracao > 480) errs.push('Duracao maxima e 8 horas (480 min). Atual: ' + duracao + ' min.')

    // Valida contra horarios do DIA ESPECIFICO (manha/tarde/fechado/almoco)
    const day = _getClinicDay(dateStr)
    const err = _checkInPeriods(s, e, day, horaInicio, horaFim)
    if (err) errs.push(err)

    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 3. Validações de profissional
  // ─────────────────────────────────────────────────────────────────
  validateProfessional(data) {
    const errs = []
    const prof = _getProf(data.profissionalIdx)
    if (!prof) { errs.push('Profissional não encontrado.'); return errs }
    if (prof.ativo === false || prof.status === 'inativo') {
      errs.push(`${prof.nome} está inativo e não pode receber agendamentos.`)
    }
    if (prof.emFerias || prof.status === 'ferias') {
      errs.push(`${prof.nome} está em férias/bloqueado.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 4. Conflito por profissional
  // ─────────────────────────────────────────────────────────────────
  checkProfConflict(data, excludeId = null) {
    const errs = []
    const { profissionalIdx, data: dateStr, horaInicio, horaFim } = data
    if (profissionalIdx === null || profissionalIdx === undefined || profissionalIdx === '') return errs
    if (!dateStr || !horaInicio || !horaFim) return errs

    const s = _toMins(horaInicio), e = _toMins(horaFim)
    const conflicts = _getAppts().filter(a => {
      if (excludeId && a.id === excludeId) return false
      if (String(a.profissionalIdx) !== String(profissionalIdx)) return false
      if (a.data !== dateStr) return false
      if (!BLOCKS_CALENDAR.has(a.status)) return false
      return a.horaInicio && a.horaFim && _overlap(s, e, _toMins(a.horaInicio), _toMins(a.horaFim))
    })
    if (conflicts.length) {
      const prof = _getProf(profissionalIdx)
      const detalhes = conflicts.map(c => `${c.pacienteNome||'Paciente'} (${c.horaInicio}–${c.horaFim})`).join(', ')
      errs.push(`Conflito: ${prof?.nome||'Profissional'} já está ocupado — ${detalhes}.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 5. Conflito por sala
  // ─────────────────────────────────────────────────────────────────
  checkRoomConflict(data, excludeId = null) {
    const errs = []
    const { salaIdx, data: dateStr, horaInicio, horaFim } = data
    if (salaIdx === null || salaIdx === undefined || salaIdx === '') return errs
    if (!dateStr || !horaInicio || !horaFim) return errs

    const s = _toMins(horaInicio), e = _toMins(horaFim)
    const conflicts = _getAppts().filter(a => {
      if (excludeId && a.id === excludeId) return false
      if (String(a.salaIdx) !== String(salaIdx)) return false
      if (a.data !== dateStr) return false
      if (!BLOCKS_CALENDAR.has(a.status)) return false
      return a.horaInicio && a.horaFim && _overlap(s, e, _toMins(a.horaInicio), _toMins(a.horaFim))
    })
    if (conflicts.length) {
      const room = _getRoom(salaIdx)
      const detalhes = conflicts.map(c => `${c.pacienteNome||'Paciente'} (${c.horaInicio}–${c.horaFim})`).join(', ')
      errs.push(`Conflito de sala: ${room?.nome||'Sala'} já está ocupada — ${detalhes}.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 6. Conflito por paciente
  // ─────────────────────────────────────────────────────────────────
  checkPatientConflict(data, excludeId = null) {
    const errs = []
    const { pacienteId, data: dateStr, horaInicio, horaFim } = data
    if (!pacienteId || !dateStr || !horaInicio || !horaFim) return errs

    const s = _toMins(horaInicio), e = _toMins(horaFim)
    const conflicts = _getAppts().filter(a => {
      if (excludeId && a.id === excludeId) return false
      if (a.pacienteId !== pacienteId) return false
      if (a.data !== dateStr) return false
      if (!BLOCKS_CALENDAR.has(a.status)) return false
      return a.horaInicio && a.horaFim && _overlap(s, e, _toMins(a.horaInicio), _toMins(a.horaFim))
    })
    if (conflicts.length) {
      const horarios = conflicts.map(c => `${c.horaInicio}–${c.horaFim}`).join(', ')
      errs.push(`Paciente já possui agendamento neste horário: ${horarios}.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 6b. Mesmo paciente com gap <1h (back-to-back)
  //     Regra: se precisa de mais tempo, aumente a duracao da consulta.
  //     Exceção: gap >= 60min libera (paciente pode sair e voltar).
  // ─────────────────────────────────────────────────────────────────
  checkPatientBackToBack(data, excludeId = null) {
    const errs = []
    const { pacienteId, data: dateStr, horaInicio, horaFim } = data
    if (!pacienteId || !dateStr || !horaInicio || !horaFim) return errs

    const MIN_GAP = 60 // minutos
    const s = _toMins(horaInicio), e = _toMins(horaFim)

    const nearby = _getAppts().filter(a => {
      if (excludeId && a.id === excludeId) return false
      if (a.pacienteId !== pacienteId) return false
      if (a.data !== dateStr) return false
      if (!BLOCKS_CALENDAR.has(a.status)) return false
      if (!a.horaInicio || !a.horaFim) return false
      const aS = _toMins(a.horaInicio), aE = _toMins(a.horaFim)
      // Ignora overlap (ja coberto por checkPatientConflict)
      if (_overlap(s, e, aS, aE)) return false
      // Gap = distancia entre blocos
      const gap = s >= aE ? s - aE : aS - e
      return gap >= 0 && gap < MIN_GAP
    })

    if (nearby.length) {
      const detalhes = nearby.map(c => `${c.horaInicio}–${c.horaFim}`).join(', ')
      errs.push(
        `Paciente ja tem agendamento proximo (${detalhes}) com menos de 1h de intervalo. ` +
        `Se precisa de mais tempo, aumente a duracao da consulta. ` +
        `Caso o paciente saia e volte, agende com pelo menos 1h de gap.`
      )
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 7. Validação de transição de status
  // ─────────────────────────────────────────────────────────────────
  validateTransition(appt, newStatus) {
    const errs = []
    if (!appt) return ['Agendamento não encontrado.']
    const SM = window.STATE_MACHINE || {}
    const allowed = SM[appt.status] || []
    if (!allowed.includes(newStatus)) {
      const SL = window.STATUS_LABELS || {}
      errs.push(`Transição inválida: ${SL[appt.status]||appt.status} → ${SL[newStatus]||newStatus}. Fluxo não permitido.`)
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 8. Validação de cancelamento / no-show
  // ─────────────────────────────────────────────────────────────────
  validateCancelOrNoShow(appt, reason) {
    const errs = []
    if (!reason?.trim()) errs.push('Motivo é obrigatório para cancelamento ou no-show.')
    if (appt.status === 'finalizado') errs.push('Agendamento finalizado não pode ser cancelado.')
    if (appt.status === 'em_consulta') {
      errs.push('Paciente em consulta — finalize o atendimento antes de cancelar.')
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 9. Validação de finalização
  // ─────────────────────────────────────────────────────────────────
  validateFinalize(appt, finData) {
    const errs = []
    const allowedForFinalize = ['na_clinica','em_consulta','aguardando','confirmado','agendado']
    if (!allowedForFinalize.includes(appt.status)) {
      errs.push(`Status "${appt.status}" não permite finalização direta.`)
    }
    if (appt.status === 'finalizado') {
      errs.push('Atendimento já foi finalizado.')
      return errs
    }
    const { tipoConsulta, tipoAvaliacao, valor, statusPagamento } = finData || {}
    if (tipoConsulta === 'avaliacao' && tipoAvaliacao === 'paga') {
      if (!valor || Number(valor) <= 0) {
        errs.push('Avaliação paga exige valor definido.')
      }
      if (statusPagamento === 'pendente') {
        errs.push('Avaliação paga: registre o pagamento (parcial ou total) antes de finalizar.')
      }
    }
    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 10. Validação de drag & drop
  // ─────────────────────────────────────────────────────────────────
  validateDragDrop(appt, newDate, newTime, newEndTime) {
    const errs = []
    if (!appt) return ['Agendamento não encontrado.']

    if (appt.status === 'finalizado') {
      return ['Atendimento finalizado não pode ser movido. Use "Duplicar" para novo agendamento.']
    }
    if (appt.status === 'em_consulta') {
      return ['Paciente em consulta — não é possível mover o agendamento.']
    }
    if (appt.status === 'na_clinica') {
      return ['Paciente já está na clínica — use a ação de remarcação formal com justificativa.']
    }
    if (!newDate || !newTime || !newEndTime) return errs

    if (_isPastDate(newDate)) return ['Não é possível mover para data passada.']
    if (newDate === _todayIso() && _isPastTime(newDate, newTime)) {
      return ['Não é possível mover para horário passado.']
    }

    const newData = { profissionalIdx: appt.profissionalIdx, salaIdx: appt.salaIdx,
      pacienteId: appt.pacienteId, data: newDate, horaInicio: newTime, horaFim: newEndTime }

    errs.push(...this.checkProfConflict(newData, appt.id))
    errs.push(...this.checkRoomConflict(newData, appt.id))
    errs.push(...this.checkPatientConflict(newData, appt.id))
    errs.push(...this.checkPatientBackToBack(newData, appt.id))

    return errs
  },

  // ─────────────────────────────────────────────────────────────────
  // 11. Validação completa para salvar (novo ou edição)
  // ─────────────────────────────────────────────────────────────────
  validateSave(data, excludeId = null) {
    const isEdit = !!excludeId
    const errs = []

    errs.push(...this.validateRequiredFields(data))
    if (errs.length) return { ok: false, errors: errs }

    errs.push(...this.validateTime(data, isEdit))
    errs.push(...this.validateProfessional(data))
    errs.push(...this.checkProfConflict(data, excludeId))
    errs.push(...this.checkRoomConflict(data, excludeId))
    errs.push(...this.checkPatientConflict(data, excludeId))
    errs.push(...this.checkPatientBackToBack(data, excludeId))

    return { ok: errs.length === 0, errors: errs }
  },

  // ─────────────────────────────────────────────────────────────────
  // 12. Verificar se agendamento pode ser editado
  // ─────────────────────────────────────────────────────────────────
  canEdit(appt) {
    if (!appt) return { ok: false, errors: ['Agendamento não encontrado.'] }
    if (appt.status === 'finalizado') {
      return { ok: false, errors: ['Agendamento finalizado não pode ser editado diretamente.'] }
    }
    return { ok: true, errors: [] }
  },

  // ─────────────────────────────────────────────────────────────────
  // 13. Verificar se pode arrastar (drag)
  // ─────────────────────────────────────────────────────────────────
  canDrag(appt) {
    if (!appt) return false
    return !NO_DRAG_STATUSES.has(appt.status)
  },

  // ─────────────────────────────────────────────────────────────────
  // 14. Expoe horarios do dia para UI (desabilitar fechado, sugerir slots)
  // ─────────────────────────────────────────────────────────────────
  getClinicDay(dateStr) { return _getClinicDay(dateStr) },
  checkInPeriods(s, e, day, horaInicio, horaFim) { return _checkInPeriods(s, e, day, horaInicio, horaFim) },

  // Retorna { blocked, reason, kind } para um slot (dateStr + timeStr + duracao)
  //   kind: 'closed' | 'lunch' | 'out' | null
  isSlotBlocked(dateStr, timeStr, durationMin) {
    if (!dateStr || !timeStr) return { blocked: false }
    var dur = durationMin || 30
    var day = _getClinicDay(dateStr)
    if (!day.aberto) return { blocked: true, kind: 'closed', reason: 'Clinica fechada' }
    // Horario ja passou no dia atual — impede novos agendamentos no passado.
    // (Slots com appt existente continuam clicaveis via canClick||hasAppts.)
    if (dateStr === _todayIso() && _isPastTime(dateStr, timeStr)) {
      return { blocked: true, kind: 'past', reason: 'Horario ja passou' }
    }
    var s = _toMins(timeStr)
    var e = s + dur
    // Dentro de algum period?
    for (var i = 0; i < day.periods.length; i++) {
      var p = day.periods[i]
      var pS = _toMins(p.ini), pE = _toMins(p.fim)
      if (s >= pS && e <= pE) return { blocked: false }
    }
    // Detecta almoco (entre 2 periods)
    if (day.periods.length === 2) {
      var m = day.periods[0], t = day.periods[1]
      var mE = _toMins(m.fim), tS = _toMins(t.ini)
      if (s >= mE && s < tS) return { blocked: true, kind: 'lunch', reason: 'Almoco ' + m.fim + '-' + t.ini }
    }
    return { blocked: true, kind: 'out', reason: 'Fora do expediente' }
  },

  // Proximo slot livre (horario valido + sem conflito de profissional)
  //   retorna {horaInicio, horaFim} ou null
  suggestNextSlot(dateStr, profissionalIdx, durationMin) {
    if (!dateStr) return null
    var dur = durationMin || 60
    var day = _getClinicDay(dateStr)
    if (!day.aberto || !day.periods.length) return null
    var step = 15 // minutos
    var appts = _getAppts().filter(function(a){
      return a.data === dateStr
        && BLOCKS_CALENDAR.has(a.status)
        && (profissionalIdx === null || profissionalIdx === undefined || profissionalIdx === ''
            || String(a.profissionalIdx) === String(profissionalIdx))
    })
    for (var i = 0; i < day.periods.length; i++) {
      var p = day.periods[i]
      var pS = _toMins(p.ini), pE = _toMins(p.fim)
      for (var t = pS; t + dur <= pE; t += step) {
        var hasConflict = appts.some(function(a){
          if (!a.horaInicio || !a.horaFim) return false
          return _overlap(t, t + dur, _toMins(a.horaInicio), _toMins(a.horaFim))
        })
        if (!hasConflict) {
          var toHM = function(m){ return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0') }
          return { horaInicio: toHM(t), horaFim: toHM(t + dur) }
        }
      }
    }
    return null
  },
}

// ── UI: Exibir erros de validação ─────────────────────────────────
function showValidationErrors(errors, title) {
  if (!errors || !errors.length) return
  let modal = document.getElementById('validationErrorModal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'validationErrorModal'
    document.body.appendChild(modal)
  }
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px'
  modal.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="background:#EF4444;padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style="font-size:13px;font-weight:800;color:#fff">${title || 'Não foi possível salvar'}</span>
        </div>
        <button onclick="document.getElementById('validationErrorModal').style.display='none'" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">×</button>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto">
        ${errors.map(e => `
          <div style="display:flex;align-items:flex-start;gap:9px;padding:9px 11px;background:#FEF2F2;border-radius:8px;border-left:3px solid #EF4444">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" style="flex-shrink:0;margin-top:1px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            <span style="font-size:12px;color:#7F1D1D;line-height:1.4">${e}</span>
          </div>`).join('')}
      </div>
      <div style="padding:12px 18px;border-top:1px solid #F3F4F6">
        <button onclick="document.getElementById('validationErrorModal').style.display='none'" style="width:100%;padding:10px;background:#EF4444;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:700">Corrigir e tentar novamente</button>
      </div>
    </div>`
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none' })
}
function showErrorToast(msg) {
  let t = document.getElementById('agendaErrToast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'agendaErrToast'
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none'
    document.body.appendChild(t)
  }
  t.innerHTML = `<div style="background:#EF4444;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 16px rgba(239,68,68,.4);animation:fadeIn .15s ease">${msg}</div>`
  clearTimeout(t._tm)
  t._tm = setTimeout(() => { t.innerHTML = '' }, 3500)
}

// ── Expose (Object.freeze — ADR contrato canonico) ─────────────
// API publica imutavel: consumidores externos nao podem monkeypatch
// AgendaValidator.canEdit, swapar STATE_MACHINE, etc. Quebra tentativas
// acidentais ou maliciosas de alterar validacao em runtime.
window.AgendaValidator       = Object.freeze(AgendaValidator)
window.BLOCKS_CALENDAR       = BLOCKS_CALENDAR    // Set — ja imutavel por semantica
window.FREE_STATUSES         = FREE_STATUSES
window.LOCKED_STATUSES       = LOCKED_STATUSES
window.NO_DRAG_STATUSES      = NO_DRAG_STATUSES
window.showValidationErrors  = showValidationErrors
window.showErrorToast        = showErrorToast
// CANCEL_REASONS, NOSHOW_REASONS, openCancelModal, confirmCancelWithReason,
// addAuditLog — movidos pra agenda-validation.cancel.js (seam 1 · 2026-04-24).

// ── Namespace agregador congelado (contrato canonico do projeto) ─
// Os window.<fn> acima permanecem para compatibilidade com onclick inline.
// Cancel module tem seu proprio namespace window.AgendaValidationCancel.
window.AgendaValidationModule = Object.freeze({
  Validator: AgendaValidator,
  BLOCKS_CALENDAR: BLOCKS_CALENDAR,
  FREE_STATUSES: FREE_STATUSES,
  LOCKED_STATUSES: LOCKED_STATUSES,
  NO_DRAG_STATUSES: NO_DRAG_STATUSES,
  showValidationErrors: showValidationErrors,
  showErrorToast: showErrorToast
})

})()
