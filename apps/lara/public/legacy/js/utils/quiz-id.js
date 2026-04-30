/**
 * ClinicAI — Quiz ID Utilities
 *
 * Módulo compartilhado para gestão de IDs únicos de perguntas.
 * Usado por quiz-admin.js e quiz-render.js.
 *
 * Responsabilidades:
 *   - Gerar IDs únicos para perguntas
 *   - Garantir que perguntas sem ID recebam um (migração in-place)
 *   - Resolver respostas: ID-based ou index-based (fallback legado)
 *   - Mapear answers para exibição com contexto da pergunta
 */
;(function () {
  'use strict'

  if (window._clinicaiQuizIdLoaded) return
  window._clinicaiQuizIdLoaded = true

  // ── Gerar ID único para pergunta ──────────────────────────────────────────
  function generateId() {
    var ts = Date.now().toString(36)
    var rnd = Math.random().toString(36).substring(2, 7)
    return 'q_' + ts + rnd
  }

  // ── Garantir que todas as perguntas têm ID ────────────────────────────────
  // Retorna true se alguma pergunta foi modificada (precisa salvar)
  function ensureIds(questions) {
    if (!Array.isArray(questions)) return false
    var changed = false
    questions.forEach(function (q) {
      if (!q.id) {
        q.id = generateId()
        changed = true
      }
    })
    return changed
  }

  // ── Buscar pergunta por ID ────────────────────────────────────────────────
  function findById(questions, id) {
    if (!Array.isArray(questions) || !id) return null
    return questions.find(function (q) { return q.id === id }) || null
  }

  // ── Buscar índice por ID ──────────────────────────────────────────────────
  function indexById(questions, id) {
    if (!Array.isArray(questions) || !id) return -1
    return questions.findIndex(function (q) { return q.id === id })
  }

  // ── Converter answers index-based para ID-based ───────────────────────────
  // Usado para migrar respostas antigas { "0": "val" } → { "q_xxx": "val" }
  function migrateAnswers(answers, questions) {
    if (!answers || typeof answers !== 'object' || !Array.isArray(questions)) return answers
    var result = {}
    var hasLegacy = false
    var hasNew = false

    Object.keys(answers).forEach(function (key) {
      if (key.indexOf('q_') === 0) {
        hasNew = true
        result[key] = answers[key]
      } else {
        hasLegacy = true
        var idx = parseInt(key, 10)
        if (!isNaN(idx) && questions[idx] && questions[idx].id) {
          result[questions[idx].id] = answers[key]
        } else {
          // Mantém chave original se não conseguir mapear
          result[key] = answers[key]
        }
      }
    })

    return result
  }

  // ── Resolver uma resposta: tenta por ID, fallback por índice ──────────────
  function getAnswer(answers, question, stepIndex) {
    if (!answers || !question) return undefined
    // Tenta por ID primeiro
    if (question.id && answers[question.id] !== undefined) {
      return answers[question.id]
    }
    // Fallback: por índice (dados legados)
    if (answers[stepIndex] !== undefined) {
      return answers[stepIndex]
    }
    return undefined
  }

  // ── Gravar uma resposta usando ID da pergunta ─────────────────────────────
  function setAnswer(answers, question, stepIndex, value) {
    if (!answers || !question) return
    var key = question.id || String(stepIndex)
    answers[key] = value
  }

  // ── Mapear answers para exibição (lista ordenada com contexto) ────────────
  // Retorna [{ questionTitle, questionType, answer, score, index }]
  function mapForDisplay(answers, questions) {
    if (!answers || typeof answers !== 'object' || !Array.isArray(questions)) return []

    var items = []

    // Primeiro: percorre as perguntas na ordem atual
    questions.forEach(function (q, idx) {
      var val = getAnswer(answers, q, idx)
      if (val === undefined) return

      var score = null
      if (q.options && !Array.isArray(val)) {
        var opt = q.options.find(function (o) { return o.label === val })
        if (opt && typeof opt.score === 'number') score = opt.score
      }

      items.push({
        questionId:    q.id || null,
        questionTitle: q.title || 'Pergunta ' + (idx + 1),
        questionType:  q.type || 'unknown',
        answer:        val,
        score:         score,
        options:       q.options || [],
        index:         idx,
      })
    })

    // Segundo: chaves em answers que não mapearam para nenhuma pergunta (perguntas removidas)
    var mappedKeys = {}
    questions.forEach(function (q, idx) {
      if (q.id) mappedKeys[q.id] = true
      mappedKeys[String(idx)] = true
    })

    Object.keys(answers).forEach(function (key) {
      if (mappedKeys[key]) return
      items.push({
        questionId:    key,
        questionTitle: 'Pergunta removida (' + key + ')',
        questionType:  'unknown',
        answer:        answers[key],
        score:         null,
        options:       [],
        index:         -1,
      })
    })

    return items
  }

  // ── Exposição global ──────────────────────────────────────────────────────
  window.QuizId = Object.freeze({
    generateId:     generateId,
    ensureIds:      ensureIds,
    findById:       findById,
    indexById:      indexById,
    migrateAnswers: migrateAnswers,
    getAnswer:      getAnswer,
    setAnswer:      setAnswer,
    mapForDisplay:  mapForDisplay,
  })

})()
