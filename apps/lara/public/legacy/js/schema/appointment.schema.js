/**
 * ClinicAI — Canonical Appointment Schema
 * ==========================================
 *
 * FONTE ÚNICA DE VERDADE para os nomes de campos de um appointment.
 * Todo código novo (modal de agendamento, finalização, timeline,
 * prontuário, cashflow, Mira, relatórios) deve usar EXATAMENTE estes
 * nomes. Campos legacy têm fallback de leitura (`getProcs`, `getPagamentos`)
 * mas nunca devem ser escritos novos registros.
 *
 * ------------------------------------------------------------------
 * CAMPOS CANÔNICOS
 * ------------------------------------------------------------------
 *
 * appt.id                  string     — 'appt_xxx' ou uuid
 * appt.pacienteId          uuid       — relacionamento com leads/patients
 * appt.pacienteNome        string     — snapshot do nome (pra não quebrar se paciente for apagado)
 * appt.pacientePhone       string     — snapshot do phone
 * appt.profissionalIdx     int        — índice no array local de profs (compat)
 * appt.profissionalNome    string     — snapshot do nome do prof
 * appt._professionalId     uuid       — FK real no Supabase (setado pelo _enrichForSupabase)
 * appt.salaIdx             int|null
 * appt.data                'YYYY-MM-DD'
 * appt.horaInicio          'HH:MM'
 * appt.horaFim             'HH:MM'
 * appt.status              enum       — 'agendado'|'confirmado'|...|'finalizado'|'cancelado'
 *
 * appt.tipoConsulta        'avaliacao'|'procedimento'
 * appt.tipoAvaliacao       'cortesia'|'paga'   (só se tipoConsulta === 'avaliacao')
 * appt.cortesiaMotivo      string              (só se tipoAvaliacao === 'cortesia')
 *
 * ------------------------------------------------------------------
 * PROCEDIMENTOS — nome canônico: `procedimentos` (array)
 * ------------------------------------------------------------------
 *
 * appt.procedimentos: Array<{
 *   nome:             string     — nome do procedimento (catálogo ou custom)
 *   valor:            number     — valor unitário (float)
 *   cortesia:         boolean    — se true, não entra no total financeiro
 *   cortesiaMotivo:   string     — obrigatório se cortesia === true
 *   retornoTipo:      'avulso'|'retorno'
 *   retornoIntervalo: int        — dias (7/15/30/60/90/120/150/180/365), 0 se avulso
 *   realizado:        boolean    — true após finalização; false no agendamento
 *   realizadoEm:      ISO string — timestamp da finalização (null se não realizado)
 * }>
 *
 * NOMES LEGACY (só leitura, nunca escrita):
 *   - appt.procedimentosRealizados  → migrar pra procedimentos
 *   - appt.procedimento (string)    → migrar pra procedimentos[0].nome
 *
 * ------------------------------------------------------------------
 * PAGAMENTOS — nome canônico: `pagamentos` (array)
 * ------------------------------------------------------------------
 *
 * appt.pagamentos: Array<{
 *   forma:        'pix'|'dinheiro'|'debito'|'credito'|'parcelado'|'entrada_saldo'|'boleto'|'link'|'cortesia'|'convenio'
 *   valor:        number          — valor desta linha
 *   status:       'aberto'|'pago' — pago = quitado; aberto = em aberto
 *   parcelas:     int             — >=1 (sempre 1 se forma não comporta parcelamento)
 *   valorParcela: number          — valor / parcelas
 *   comentario:   string          — opcional
 *   // Campos específicos por forma (todos opcionais):
 *   primeiroVencimento: 'YYYY-MM-DD'
 *   entrada:            number (só entrada_saldo)
 *   saldo:              number (só entrada_saldo)
 *   formaEntrada:       forma (só entrada_saldo)
 *   formaSaldo:         forma (só entrada_saldo)
 *   vencimentoSaldo:    'YYYY-MM-DD'
 *   recebido:           number (só dinheiro)
 *   troco:              number (só dinheiro)
 *   convenioNome:       string (só convenio)
 *   autorizacao:        string (só convenio)
 *   linkUrl:            string (só link)
 *   motivoCortesia:     string (só forma==='cortesia')
 * }>
 *
 * NOMES LEGACY (só leitura):
 *   - appt.pagamentoDetalhes  (object, não array) → migrar pra pagamentos[]
 *
 * ------------------------------------------------------------------
 * CAMPOS DERIVADOS (preservar para compat retroativa)
 * ------------------------------------------------------------------
 *
 * appt.valor              number — total do appt (sum de pagamentos OU consulta)
 * appt.valorPago          number — quanto já foi efetivamente pago
 * appt.formaPagamento     string — derivado: pagamentos[0].forma ou 'misto'
 * appt.statusPagamento    'pendente'|'aberto'|'parcial'|'pago' — derivado do array
 * appt.valorCortesia      number — agregado: sum(procs.where(cortesia).valor)
 * appt.qtdProcsCortesia   int
 * appt.motivoCortesia     string — concat dos motivos de cortesia dos procs
 *
 * ------------------------------------------------------------------
 * HISTÓRICOS
 * ------------------------------------------------------------------
 *
 * appt.historicoStatus:     Array<{ status, at, by, motivo? }>
 * appt.historicoAlteracoes: Array<{ action_type, old_value, new_value, changed_by, changed_at, reason }>
 *
 * action_types conhecidos:
 *   - 'mudanca_status'
 *   - 'edicao'
 *   - 'remarcacao_drag'
 *   - 'reagendamento_manual'
 *   - 'finalizacao'
 *   - 'cancelamento'
 *   - 'no_show'
 *
 * ------------------------------------------------------------------
 * HELPERS canonicalizados (uso recomendado)
 * ------------------------------------------------------------------
 */
// @ts-nocheck — wrapper IIFE
(function () {
  'use strict'
  if (typeof window === 'undefined') return

  /**
   * Lê procedimentos do appt em formato canônico.
   * Faz fallback para `procedimentosRealizados` (legacy) e para
   * `procedimento` string (super legacy).
   * @param {object} appt
   * @returns {Array<object>}
   */
  function getProcs(appt) {
    if (!appt) return []
    if (Array.isArray(appt.procedimentos) && appt.procedimentos.length) {
      return appt.procedimentos
    }
    if (Array.isArray(appt.procedimentosRealizados) && appt.procedimentosRealizados.length) {
      // Normaliza items legacy (às vezes strings, às vezes objetos)
      return appt.procedimentosRealizados.map(function(p) {
        if (typeof p === 'string') return { nome: p, valor: 0, cortesia: false, retornoTipo: 'avulso' }
        return {
          nome:             p.nome || p.name || '',
          valor:            parseFloat(p.valor || p.preco || 0) || 0,
          cortesia:         !!p.cortesia,
          cortesiaMotivo:   p.cortesiaMotivo || '',
          retornoTipo:      p.retornoTipo === 'retorno' ? 'retorno' : 'avulso',
          retornoIntervalo: parseInt(p.retornoIntervalo) || 0,
          realizado:        p.realizado !== undefined ? !!p.realizado : true, // legacy assumia realizado
          realizadoEm:      p.realizadoEm || null,
        }
      })
    }
    if (appt.procedimento && typeof appt.procedimento === 'string') {
      // Super legacy: procedimento como string
      return [{
        nome: appt.procedimento, valor: parseFloat(appt.valor) || 0,
        cortesia: false, retornoTipo: 'avulso', realizado: false,
      }]
    }
    return []
  }

  /**
   * Lê pagamentos do appt em formato canônico.
   * Faz fallback para `pagamentoDetalhes` (legacy object).
   * @param {object} appt
   * @returns {Array<object>}
   */
  function getPagamentos(appt) {
    if (!appt) return []
    if (Array.isArray(appt.pagamentos) && appt.pagamentos.length) {
      return appt.pagamentos
    }
    // Fallback: pagamentoDetalhes object (finalização legada)
    var det = appt.pagamentoDetalhes
    if (det && typeof det === 'object') {
      return _legacyDetalhesToArray(det, appt)
    }
    // Super legacy: só formaPagamento + valor
    if (appt.formaPagamento && appt.valor) {
      return [{
        forma: appt.formaPagamento,
        valor: parseFloat(appt.valor) || 0,
        status: appt.statusPagamento === 'pago' ? 'pago' : 'aberto',
        parcelas: 1,
        valorParcela: parseFloat(appt.valor) || 0,
        comentario: '',
      }]
    }
    return []
  }

  /**
   * Converte pagamentoDetalhes (object legacy) para array canônico.
   */
  function _legacyDetalhesToArray(det, appt) {
    var valorTotal = parseFloat(appt && appt.valor) || 0
    var statusLegacy = (appt && appt.statusPagamento) || 'pendente'
    var forma = det.forma || (appt && appt.formaPagamento) || ''

    // Caso entrada_saldo: 2 linhas
    if (forma === 'entrada_saldo' && det.entrada) {
      var saldo = parseFloat(det.saldo) || (valorTotal - parseFloat(det.entrada))
      return [
        {
          forma: det.formaEntrada || 'pix',
          valor: parseFloat(det.entrada) || 0,
          status: 'pago',
          parcelas: 1,
          valorParcela: parseFloat(det.entrada) || 0,
          comentario: 'Entrada',
        },
        {
          forma: det.formaSaldo || 'boleto',
          valor: saldo,
          status: statusLegacy === 'pago' ? 'pago' : 'aberto',
          parcelas: 1,
          valorParcela: saldo,
          comentario: 'Saldo',
          vencimentoSaldo: det.vencimentoSaldo || '',
        },
      ]
    }

    // Caso geral: 1 linha
    var parcelas = parseInt(det.parcelas) || 1
    return [{
      forma: forma,
      valor: valorTotal,
      status: statusLegacy === 'pago' ? 'pago' : 'aberto',
      parcelas: parcelas,
      valorParcela: parcelas > 0 ? Math.round((valorTotal / parcelas) * 100) / 100 : valorTotal,
      comentario: det.motivo || '',
      primeiroVencimento: det.primeiroVencimento || '',
      motivoCortesia: forma === 'cortesia' ? (det.motivo || '') : '',
      convenioNome: det.convenioNome || '',
      autorizacao: det.autorizacao || '',
      linkUrl: det.linkUrl || '',
      recebido: parseFloat(det.recebido) || 0,
      troco: parseFloat(det.troco) || 0,
    }]
  }

  /**
   * Deriva formaPagamento legacy a partir de pagamentos[].
   * @param {Array} pagamentos
   * @returns {string}
   */
  function deriveFormaPagamento(pagamentos) {
    if (!Array.isArray(pagamentos) || !pagamentos.length) return ''
    if (pagamentos.length === 1) return pagamentos[0].forma || ''
    return 'misto'
  }

  /**
   * Deriva statusPagamento legacy a partir de pagamentos[].
   * @param {Array} pagamentos
   * @returns {'pendente'|'aberto'|'parcial'|'pago'}
   */
  function deriveStatusPagamento(pagamentos) {
    if (!Array.isArray(pagamentos) || !pagamentos.length) return 'pendente'
    var pagos = pagamentos.filter(function(p) { return p.status === 'pago' }).length
    if (pagos === 0) return 'aberto'
    if (pagos === pagamentos.length) return 'pago'
    return 'parcial'
  }

  /**
   * Deriva valorCortesia (soma dos procs cortesia).
   */
  function deriveValorCortesia(procedimentos) {
    if (!Array.isArray(procedimentos)) return 0
    var M = window.Money
    var vals = procedimentos.filter(function(p) { return p.cortesia }).map(function(p) { return parseFloat(p.valor) || 0 })
    return M ? M.sum(vals) : vals.reduce(function(s, v) { return s + v }, 0)
  }

  /**
   * Merge de procedimentos: pega o array "base" (agendamento) e
   * atualiza com as modificações do "updated" (finalização), preservando
   * campos de planejamento (cortesia, retorno) quando não especificados.
   *
   * Match é feito por `nome` — se o nome bate, faz merge; senão, adiciona.
   *
   * @param {Array} base
   * @param {Array} updated
   * @returns {Array}
   */
  function mergeProcs(base, updated) {
    var baseArr = Array.isArray(base) ? base.slice() : []
    var updArr = Array.isArray(updated) ? updated : []
    var byNome = {}
    baseArr.forEach(function(p, i) { if (p && p.nome) byNome[p.nome] = i })

    updArr.forEach(function(up) {
      if (!up || !up.nome) return
      var idx = byNome[up.nome]
      if (idx !== undefined) {
        // Merge: preserva campos de planejamento do base se update não tiver
        var existing = baseArr[idx]
        baseArr[idx] = {
          nome:             existing.nome,
          valor:            up.valor !== undefined ? up.valor : existing.valor,
          cortesia:         up.cortesia !== undefined ? up.cortesia : existing.cortesia,
          cortesiaMotivo:   up.cortesiaMotivo || existing.cortesiaMotivo || '',
          retornoTipo:      up.retornoTipo || existing.retornoTipo || 'avulso',
          retornoIntervalo: up.retornoIntervalo !== undefined ? up.retornoIntervalo : (existing.retornoIntervalo || 0),
          realizado:        true,
          realizadoEm:      up.realizadoEm || new Date().toISOString(),
        }
      } else {
        // Adiciona novo
        baseArr.push({
          nome:             up.nome,
          valor:            parseFloat(up.valor) || 0,
          cortesia:         !!up.cortesia,
          cortesiaMotivo:   up.cortesiaMotivo || '',
          retornoTipo:      up.retornoTipo || 'avulso',
          retornoIntervalo: parseInt(up.retornoIntervalo) || 0,
          realizado:        true,
          realizadoEm:      up.realizadoEm || new Date().toISOString(),
        })
      }
    })
    return baseArr
  }

  window.ApptSchema = {
    getProcs: getProcs,
    getPagamentos: getPagamentos,
    deriveFormaPagamento: deriveFormaPagamento,
    deriveStatusPagamento: deriveStatusPagamento,
    deriveValorCortesia: deriveValorCortesia,
    mergeProcs: mergeProcs,
  }
})()
