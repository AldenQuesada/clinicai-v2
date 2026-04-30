;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Smart · Constantes e Dados Puros
//  Extraido de agenda-smart.js (refactor 2026-04-23 para <500 LOC)
//
//  Responsabilidade: definir e expor as constantes consumidas pelo
//  core (agenda-smart.js) e por modulos externos. ZERO logica.
//
//  GLOBALS EXPORTADOS:
//    STATE_MACHINE    — transicoes validas entre status de consulta
//    STATUS_LABELS    — labels pt-BR dos status
//    STATUS_COLORS    — paleta (color + bg) por status
//    BLOCK_REASONS    — motivos pre-definidos de block time
//    PAYMENT_METHODS  — metodos de pagamento suportados
//    WA_TPLS          — templates de mensagem WhatsApp por evento
//    createBlockTime  — helper pra criar bloqueio de horario
//
//  Ordem de carregamento: ANTES de agenda-smart.js (constantes sao
//  lidas no init do core via window.STATUS_LABELS etc).
// ══════════════════════════════════════════════════════════════════

// ── State Machine ─────────────────────────────────────────────────
const STATE_MACHINE = {
  agendado:               ['aguardando_confirmacao','confirmado','remarcado','cancelado','no_show'],
  aguardando_confirmacao: ['confirmado','remarcado','cancelado','no_show'],
  confirmado:             ['aguardando','remarcado','cancelado','no_show'],
  aguardando:             ['na_clinica','no_show','cancelado'],
  na_clinica:             ['em_consulta'],
  em_consulta:            ['finalizado'],
  em_atendimento:         ['finalizado','cancelado','na_clinica'],  // legado
  finalizado:             [],
  remarcado:              ['agendado','cancelado'],
  cancelado:              [],
  no_show:                [],
  bloqueado:              ['cancelado'],  // Block time: almoco, ferias, manutencao
}

const STATUS_LABELS = {
  agendado:               'Agendado',
  aguardando_confirmacao: 'Aguard. Confirmação',
  confirmado:             'Confirmado',
  aguardando:             'Aguardando',
  na_clinica:             'Na Clínica',
  em_consulta:            'Em Consulta',
  em_atendimento:         'Em Atendimento',
  finalizado:             'Finalizado',
  remarcado:              'Remarcado',
  cancelado:              'Cancelado',
  no_show:                'No-show',
  bloqueado:              'Bloqueado',
}

const STATUS_COLORS = {
  agendado:               { color:'#3B82F6', bg:'#EFF6FF' },
  aguardando_confirmacao: { color:'#F59E0B', bg:'#FFFBEB' },
  confirmado:             { color:'#10B981', bg:'#ECFDF5' },
  aguardando:             { color:'#8B5CF6', bg:'#EDE9FE' },
  na_clinica:             { color:'#06B6D4', bg:'#ECFEFF' },
  em_consulta:            { color:'#7C3AED', bg:'#F5F3FF' },
  em_atendimento:         { color:'#7C3AED', bg:'#F5F3FF' },
  finalizado:             { color:'#374151', bg:'#F3F4F6' },
  remarcado:              { color:'#F97316', bg:'#FFF7ED' },
  cancelado:              { color:'#EF4444', bg:'#FEF2F2' },
  no_show:                { color:'#DC2626', bg:'#FEF2F2' },
  bloqueado:              { color:'#6B7280', bg:'#F3F4F6' },
}

// ── Block Time ───────────────────────────────────────────────────
const BLOCK_REASONS = [
  { id:'almoco',      label:'Almoco' },
  { id:'intervalo',   label:'Intervalo' },
  { id:'reuniao',     label:'Reuniao' },
  { id:'manutencao',  label:'Manutencao' },
  { id:'ferias',      label:'Ferias' },
  { id:'pessoal',     label:'Pessoal' },
  { id:'outro',       label:'Outro' },
]

function createBlockTime(data, horaInicio, horaFim, profissionalIdx, motivo) {
  if (!window.getAppointments || !window.saveAppointments) return null
  var appts = window.getAppointments()
  var profs = window.getProfessionals ? window.getProfessionals() : []
  var prof = profs[profissionalIdx] || {}
  var block = {
    id:               'block_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    pacienteNome:     motivo || 'Bloqueado',
    pacienteId:       '',
    data:             data,
    horaInicio:       horaInicio,
    horaFim:          horaFim,
    profissionalIdx:  profissionalIdx,
    profissionalNome: prof.nome || prof.display_name || '',
    status:           'bloqueado',
    tipoConsulta:     'bloqueio',
    procedimento:     (BLOCK_REASONS.find(function(r){return r.id===motivo})||{}).label || motivo || 'Bloqueado',
    obs:              '',
    createdAt:        new Date().toISOString(),
  }
  appts.push(block)
  window.saveAppointments(appts)
  if (window.renderAgenda) window.renderAgenda()
  return block
}

// ── Payment Methods ───────────────────────────────────────────────
const PAYMENT_METHODS = [
  { id:'pix',           label:'PIX'            },
  { id:'dinheiro',      label:'Dinheiro'        },
  { id:'debito',        label:'Débito'          },
  { id:'credito',       label:'Crédito'         },
  { id:'parcelado',     label:'Parcelado'       },
  { id:'entrada_saldo', label:'Entrada + Saldo' },
  { id:'boleto',        label:'Boleto'          },
  { id:'link',          label:'Link Pagamento'  },
  { id:'cortesia',      label:'Cortesia'        },
  { id:'convenio',      label:'Convênio'        },
]

// ── WhatsApp Templates ────────────────────────────────────────────
const WA_TPLS = {
  agendado: {
    label:'Agendamento Confirmado',
    fn:(v)=>`Olá, *${v.nome}*! 😊\n\nSeu agendamento foi confirmado!\n\n📅 *Data:* ${v.data}\n⏰ *Horário:* ${v.hora}\n👨‍⚕️ *Profissional:* ${v.profissional}\n💆 *Procedimento:* ${v.procedimento}\n\n📍 ${v.clinica}\n\nQualquer dúvida estamos aqui!`
  },
  confirmacao: {
    label:'Confirmação D-1',
    fn:(v)=>`Olá, *${v.nome}*! ✨\n\nAmanhã você tem consulta conosco:\n\n📅 *${v.data}* às *${v.hora}*\n👨‍⚕️ *${v.profissional}*\n\nConfirme sua presença respondendo *SIM* ou entre em contato para remarcar.\n\n📍 ${v.clinica}`
  },
  chegou_o_dia: {
    label:'Chegou o Dia',
    fn:(v)=>`Bom dia, *${v.nome}*! ☀️\n\nHoje é o seu dia! Sua consulta é às *${v.hora}*.\n\n👨‍⚕️ ${v.profissional}\n📍 ${v.clinica}\n\nTe esperamos!`
  },
  antes: {
    label:'30 Min Antes',
    fn:(v)=>`Olá, *${v.nome}*! ⏰\n\nSua consulta começa em *30 minutos* (${v.hora}).\n\nEstamos te aguardando!\n\n📍 ${v.clinica}`
  },
  remarcado: {
    label:'Remarcamento',
    fn:(v)=>`Olá, *${v.nome}*! 📅\n\nSua consulta foi remarcada para:\n\n📅 *${v.data}* às *${v.hora}*\n👨‍⚕️ *${v.profissional}*\n\nQualquer dúvida entre em contato.\n\n📍 ${v.clinica}`
  },
  cancelado: {
    label:'Cancelamento',
    fn:(v)=>`Olá, *${v.nome}*!\n\nSua consulta de ${v.data} foi cancelada.\n\nQueremos te atender em breve! Quando quiser reagendar é só nos chamar. 💜\n\n${v.clinica}`
  },
  no_show: {
    label:'Recuperação No-show',
    fn:(v)=>`Olá, *${v.nome}*! 🌸\n\nNotamos que você não pôde comparecer hoje. Tudo bem?\n\nEstamos à disposição para reagendar quando for melhor para você.\n\n📍 ${v.clinica}`
  },
  pos_atendimento: {
    label:'Pos-Atendimento',
    fn:(v)=>`Ola, *${v.nome}*!\n\nFoi um prazer atender voce hoje!\n\nSe tiver qualquer duvida sobre os cuidados, pode nos chamar.\n\nSua avaliacao significa muito para nos!\n\n*${v.clinica}*`
  },
  avaliacao: {
    label:'Pedir Avaliacao',
    fn:(v)=>`Ola, *${v.nome}*!\n\nEsperamos que esteja se sentindo bem apos o atendimento!\n\nSua opiniao nos ajuda muito a melhorar. Poderia nos avaliar?\n\nhttps://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review\n\nMuito obrigado!\n\n*${v.clinica}*`
  },
}

// ── Expose (Object.freeze — ADR contrato canonico) ─────────────
// STATE_MACHINE, STATUS_LABELS, STATUS_COLORS sao fontes da verdade
// pra validacao e exibicao de status. Freeze previne monkeypatch —
// se alguem tentar STATE_MACHINE['agendado'] = [...], throw em strict.
window.STATE_MACHINE   = Object.freeze(STATE_MACHINE)
window.STATUS_LABELS   = Object.freeze(STATUS_LABELS)
window.STATUS_COLORS   = Object.freeze(STATUS_COLORS)
window.BLOCK_REASONS   = Object.freeze(BLOCK_REASONS)
window.PAYMENT_METHODS = Object.freeze(PAYMENT_METHODS)
window.WA_TPLS         = Object.freeze(WA_TPLS)
window.createBlockTime = createBlockTime

// Namespace congelado (contrato canonico do projeto)
window.AgendaSmartConstants = Object.freeze({
  STATE_MACHINE: STATE_MACHINE,
  STATUS_LABELS: STATUS_LABELS,
  STATUS_COLORS: STATUS_COLORS,
  BLOCK_REASONS: BLOCK_REASONS,
  PAYMENT_METHODS: PAYMENT_METHODS,
  WA_TPLS: WA_TPLS,
  createBlockTime: createBlockTime
})

})()
