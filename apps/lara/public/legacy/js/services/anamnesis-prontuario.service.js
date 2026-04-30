/**
 * ClinicAI — Anamnesis-Prontuário Service (Sprint 6-D)
 *
 * Camada de negócio para o vínculo automático anamnese → prontuário.
 *
 * RESPONSABILIDADE DESTA CAMADA:
 *   A criação do registro de prontuário acontece EXCLUSIVAMENTE no banco
 *   via database trigger (server-side, atômico, dentro da transação do
 *   complete_anamnesis_form). Esta camada JS NÃO cria registros — apenas:
 *     1. Consulta se o vínculo existe (para UI)
 *     2. Invalida o cache do prontuário do paciente (para refresh automático)
 *
 * Depende de:
 *   AnamnesisProntuarioRepository  (anamnesis-prontuario.repository.js)
 *   MedicalRecordsService          (medical-records.service.js) — para invalidação de cache
 *
 * API pública (window.AnamnesisProntuarioService):
 *   getLinkForResponse(responseId)         — verifica/retorna vínculo prontuário
 *   onAnamnesisCompleted(responseId, patientId) — chama após conclusão da anamnese
 *                                               (invalida cache + polling de confirmação)
 */

;(function () {
  'use strict'

  if (window._clinicaiAnmPronServiceLoaded) return
  window._clinicaiAnmPronServiceLoaded = true

  // ── Helpers de acesso ─────────────────────────────────────────
  function _repo() { return window.AnamnesisProntuarioRepository || null }

  // ── getLinkForResponse ────────────────────────────────────────
  /**
   * Verifica se existe um prontuário vinculado a uma resposta de anamnese.
   * Retorna null (sem lançar) se Supabase indisponível.
   *
   * @param {string} responseId  — UUID da anamnesis_response
   * @returns {Promise<{linked: boolean, recordId?, patientId?, title?, createdAt?}|null>}
   */
  async function getLinkForResponse(responseId) {
    const repo = _repo()
    if (!repo || !responseId) return null

    const result = await repo.getLink(responseId)
    if (!result.ok) {
      console.warn('[AnamnesisProntuarioService] getLinkForResponse falhou:', result.error)
      return null
    }
    return result.data
  }

  // ── onAnamnesisCompleted ──────────────────────────────────────
  /**
   * Deve ser chamado pelo formulário de anamnese após conclusão bem-sucedida.
   * Responsabilidades:
   *   1. Invalida o cache local do prontuário do paciente
   *      (para que a próxima abertura do prontuário busque os dados frescos)
   *   2. Polling curto (3 tentativas × 2s) para confirmar que o trigger
   *      criou o registro — útil para feedback na UI de admin
   *
   * Fire-and-forget: erros são logados mas NÃO propagados.
   * A conclusão da anamnese já ocorreu no servidor independentemente disto.
   *
   * @param {string} responseId  — UUID da anamnesis_response
   * @param {string} [patientId] — UUID do paciente (para invalidar cache)
   */
  function onAnamnesisCompleted(responseId, patientId) {
    // Invalida cache do prontuário imediatamente
    if (patientId) {
      _invalidateProntuarioCache(patientId)
    }

    // Polling não-bloqueante para confirmar criação do vínculo
    if (responseId) {
      _pollForLink(responseId, 3, 2000).catch(e => console.warn("[anamnesis-prontuario.service]", e.message || e))
    }
  }

  // ── _invalidateProntuarioCache ────────────────────────────────
  // Remove o cache localStorage do prontuário de um paciente.
  // O próximo acesso ao prontuário buscará os dados frescos do Supabase,
  // garantindo que o registro gerado pelo trigger seja exibido.
  function _invalidateProntuarioCache(patientId) {
    try {
      localStorage.removeItem('clinicai_mr_' + patientId)
    } catch { /* silencioso */ }
  }

  // ── _pollForLink ──────────────────────────────────────────────
  // Polling com backoff fixo: aguarda o trigger criar o registro.
  // Usado apenas para confirmação de UI — não é crítico para a operação.
  // Dispara o evento 'clinicai:prontuario-linked' quando confirmado.
  async function _pollForLink(responseId, maxAttempts, intervalMs) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await _sleep(intervalMs)

      const link = await getLinkForResponse(responseId)

      if (link?.linked) {
        document.dispatchEvent(new CustomEvent('clinicai:prontuario-linked', {
          detail: { responseId, ...link },
        }))
        return
      }
    }
    // Esgotou tentativas — silencioso (o trigger pode ainda estar processando)
  }

  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ── Exposição global ──────────────────────────────────────────
  window.AnamnesisProntuarioService = Object.freeze({
    getLinkForResponse,
    onAnamnesisCompleted,
  })

})()
