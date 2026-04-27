/**
 * Re-export do package canônico @clinicai/ai.
 *
 * Antes: arquivo local com lógica duplicada de Whisper + console.log com 80
 * chars do que o paciente disse (vazamento PHI · achado N6 da auditoria
 * 2026-04-27 · Gap 3 do MIGRATION_DOCTRINE).
 *
 * Depois: package canônico (logging estruturado sem PHI, mesma API).
 *
 * Mantido o nome do arquivo + assinatura pra não quebrar imports legados.
 */

export { transcribeAudio, getGroqClient } from '@clinicai/ai'
