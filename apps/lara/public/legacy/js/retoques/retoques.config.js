/**
 * ClinicAI - Retoques Config
 *
 * Constantes do modulo de Retoques Pos-Procedimento.
 * Mantido isolado em window.RetoquesConfig para nao poluir escopo global.
 *
 * Decisao de design: enum de status replicado do schema SQL para evitar
 * "magic strings" pelo codigo. Se mudar aqui, tambem checar a CHECK
 * constraint da migration (atualmente nao tem CHECK, status e text livre,
 * mas a UI so reconhece estes valores).
 */
;(function () {
  'use strict'

  if (window.RetoquesConfig) return

  window.RetoquesConfig = {
    // Opcoes oferecidas no popup pos-finalize
    OFFSET_PRESETS: [
      { value: 14,  label: '14 dias',  description: 'Avaliacao imediata (Botox)' },
      { value: 30,  label: '30 dias',  description: 'Manutencao mensal (HA labios)' },
      { value: 60,  label: '60 dias',  description: 'Bimestral (HA terco medio)' },
      { value: 90,  label: '90 dias',  description: 'Trimestral (manutencao geral)' },
      { value: 120, label: '4 meses',  description: 'Botox (proxima sessao)' },
      { value: 180, label: '6 meses',  description: 'Manutencao semestral' },
    ],

    STATUS: {
      SUGGESTED:  'suggested',   // criado, aguardando contato/resposta
      CONTACTED:  'contacted',   // mensagem WA enviada
      CONFIRMED:  'confirmed',   // paciente confirmou
      SCHEDULED:  'scheduled',   // virou appointment real
      COMPLETED:  'completed',   // retoque foi finalizado
      MISSED:     'missed',      // data passou sem agendamento
      CANCELLED:  'cancelled',   // sugestao removida
    },

    STATUS_LABELS: {
      suggested: 'Sugerido',
      contacted: 'Contatado',
      confirmed: 'Confirmado',
      scheduled: 'Agendado',
      completed: 'Realizado',
      missed:    'Perdido',
      cancelled: 'Cancelado',
    },

    STATUS_COLORS: {
      suggested: '#C8A97E',  // dourado neutro
      contacted: '#3B82F6',  // azul
      confirmed: '#10B981',  // verde
      scheduled: '#10B981',
      completed: '#06B6D4',  // ciano (fechado positivo)
      missed:    '#EF4444',  // vermelho
      cancelled: 'rgba(245,240,232,0.4)',  // cinza
    },

    // Estados considerados "ativos" — um retoque suggested/contacted/confirmed
    // ainda esta no funil. scheduled/completed sairam, missed/cancelled fechados.
    ACTIVE_STATUSES: ['suggested', 'contacted', 'confirmed'],

    // Tag aplicada ao lead quando sugestao e criada — engata na engine de
    // wa_agenda_automations para disparar mensagens (se houver regra).
    TAG_SUGGESTED: 'retoque_sugerido',
  }
})()
