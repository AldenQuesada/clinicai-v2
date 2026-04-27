/**
 * Helpers compartilhados pra autenticação de cron handlers.
 *
 * Padrão originalmente extraído de apps/mira/src/lib/cron.ts (que tinha
 * MIRA_CRON_SECRET hardcoded). Aqui é genérico: caller passa o nome da env.
 *
 * Cron handlers em qualquer app deveriam validar com isso antes de processar.
 *
 * Uso típico:
 *
 *   export async function GET(req: NextRequest) {
 *     const reject = validateCronSecret(req, 'LARA_CRON_SECRET')
 *     if (reject) return reject
 *     // ... processa
 *   }
 */

export function timingSafeEqualString(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export interface CronAuthRejection {
  status: number
  body: { ok: false; error: string }
}

/**
 * Valida cron secret de uma request.
 *
 * Política fail-CLOSED: se a env var não existir, retorna 500 (deploy bug).
 * NUNCA bypassa em prod sem secret · cron público é vetor de mass-messaging.
 *
 * @param req Request (NextRequest ou similar com .headers.get())
 * @param envName Nome da env var (ex: 'LARA_CRON_SECRET', 'MIRA_CRON_SECRET')
 * @param headerName Header a ler (default 'x-cron-secret')
 * @returns null se válido · objeto de rejection se inválido
 */
export function validateCronSecret(
  req: { headers: { get(name: string): string | null } },
  envName: string,
  headerName = 'x-cron-secret',
): CronAuthRejection | null {
  const secret = process.env[envName] ?? ''
  if (!secret) {
    return {
      status: 500,
      body: { ok: false, error: `${envName}_not_configured` },
    }
  }
  const provided = req.headers.get(headerName) ?? ''
  if (!timingSafeEqualString(provided, secret)) {
    return {
      status: 401,
      body: { ok: false, error: 'unauthorized' },
    }
  }
  return null
}
