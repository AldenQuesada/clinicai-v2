/**
 * Helpers compartilhados pelas Server Actions do CRM (Camada 5).
 *
 * Convencao das actions:
 *   1. Zod valida input · falha vira { ok:false, error:'invalid_input', details }
 *   2. loadServerReposContext() resolve auth + clinic_id (throw 401 se sem JWT)
 *   3. Retorna Result<T, E> discriminated union · UI narrow sem cast
 *   4. updateTag() apos mutation pra invalidar Next.js cache
 *      (Next.js 16 · semantica read-your-own-writes pra Server Actions)
 *   5. Logger estruturado · info no sucesso, warn em falha esperada,
 *      error em exception
 *
 * Convencao READ vs MUTATION (importante pra Camada 6+):
 *   - MUTATION (insert/update/delete/RPC com side-effect) → SEMPRE Server
 *     Action. Garante validation Zod, role gate, logger, cache invalidation.
 *   - READ (select/get/list) → RSC chama `repos.X.method()` direto via
 *     `loadServerReposContext()`. Nao envolve Server Action wrapper · mais
 *     ergonomico, sem overhead, e RSC ja roda server-side com auth resolvida.
 *     Reads em pages podem usar `unstable_cache` com tags do CRM_TAGS.
 *
 * UI consumer:
 *   // mutation
 *   const r = await createLeadAction(formData)
 *   if (r.ok) router.push(`/crm/leads/${r.data.leadId}`)
 *   else setError(r.error)
 *
 *   // read (RSC)
 *   const { repos, ctx } = await loadServerReposContext()
 *   const leads = await repos.leads.listByPhase(ctx.clinic_id, 'lead')
 */

import type { ZodError } from 'zod'

// ── Result<T, E> · discriminated union ──────────────────────────────────────

export type Result<T, E extends string = string> =
  | { ok: true; data: T }
  | { ok: false; error: E; details?: Record<string, unknown> }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail<E extends string = string>(
  error: E,
  details?: Record<string, unknown>,
): Result<never, E> {
  return { ok: false, error, details }
}

/**
 * Converte ZodError em Result fail formatado · `details.issues` tem
 * shape `{ formErrors, fieldErrors }` pronto pro consumer renderizar
 * inline em campos de formulario.
 */
export function zodFail(err: ZodError): Result<never> {
  return {
    ok: false,
    error: 'invalid_input',
    details: { issues: err.flatten() },
  }
}

// ── Cache tags · revalidateTag granular pos-mutation ────────────────────────
//
// Uso: import { CRM_TAGS } from './shared'
//      revalidateTag(CRM_TAGS.leads)
//
// Pages que consomem listas usam unstable_cache com mesmas tags · invalidam
// quando mutation roda. Tags genericas (sem clinic_id) porque
// loadServerContext escopa por JWT · cache key implicito por user.

export const CRM_TAGS = {
  leads: 'crm.leads',
  appointments: 'crm.appointments',
  patients: 'crm.patients',
  orcamentos: 'crm.orcamentos',
  phaseHistory: 'crm.phase_history',
} as const

// ── Auth/Authorization gating ──────────────────────────────────────────────

/**
 * Erro pra usar em situacoes onde Server Action recebe request sem JWT
 * valido OU usuario nao tem role suficiente pra mutation. UI deve render
 * 401 ou 403 explicito.
 *
 * loadServerReposContext() ja throw quando sem JWT · use isso aqui pra
 * checks adicionais de role (ex: soft-delete = is_admin).
 */
/**
 * Tipo de retorno do requireRole quando role insuficiente · estruturalmente
 * compativel com Result<T,E>.fail mas sem `data` pra ser assignable a
 * qualquer Result<T> via spread.
 */
export type ForbiddenResult = {
  ok: false
  error: 'forbidden'
  details?: Record<string, unknown>
}

export function requireRole(
  actualRole: string | null | undefined,
  allowed: ReadonlyArray<string>,
): ForbiddenResult | null {
  if (!actualRole || !allowed.includes(actualRole)) {
    return {
      ok: false,
      error: 'forbidden',
      details: { required: allowed, got: actualRole ?? null },
    }
  }
  return null
}

// ── Re-export pra reduzir imports nos arquivos de actions ───────────────────

export { z } from 'zod'
// Next.js 16: revalidateTag exige (tag, profile); updateTag(tag) eh o
// API correto pra Server Actions (read-your-own-writes semantics). Camada
// 5 usa updateTag em todas mutations · cron/webhook futuros usariam
// revalidateTag direto se precisarem.
export { updateTag } from 'next/cache'
export { loadServerReposContext } from '@/lib/repos'
export { createLogger, hashPhone } from '@clinicai/logger'
