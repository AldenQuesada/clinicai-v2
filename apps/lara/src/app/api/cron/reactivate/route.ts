/**
 * GET /api/cron/reactivate · DESABILITADO 2026-05-06 (Mih ghost Lara audit).
 *
 * Originalmente: cron horario · D1 reactivation (23h-26h window) · enviava
 * "Você acabou se ocupando por aí..." via Cloud API pra leads inativos.
 *
 * Bug detectado 2026-05-06: cron disparava Cloud API msgs em conversations
 * com wa_number_id Mih/Secretaria · resultado: sender='lara'
 * provider_class='cloud_api_wamid' aparecia na inbox /secretaria do dash
 * novo · contaminação cross-canal.
 *
 * Endpoint virou no-op · GitHub Actions cron desabilitado em
 * .github/workflows/lara-crons.yml. Body original removido (git history
 * preserva). Re-habilitar SÓ após filtro per-canal (só Cloud Lara · não Mih).
 *
 * Auth N3 mantida pra observability · log.warn se alguém ainda chamar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronSecret } from '@clinicai/utils';
import { createLogger } from '@clinicai/logger';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Audit fix N3: valida cron secret · fail-CLOSED se env ausente.
  // Aceita LARA_CRON_SECRET (preferido) OU CRON_SECRET (compat com prod
  // existente em 2026-04-27). Defina UMA das duas no Easypanel.
  const reject =
    validateCronSecret(req, 'LARA_CRON_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET');
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status });
  }

  // ─── DESABILITADO 2026-05-06 · Mih ghost Lara audit ───────────────────
  // Cron disparava msg "Você acabou se ocupando por aí..." via Cloud API
  // (sender='lara' provider_class='cloud_api_wamid') em convs com
  // wa_number_id='ead8a6f9-...' (Mih/Secretaria) · contaminava o inbox
  // /secretaria do dash novo com mensagens da Lara que não pertencem ao
  // canal. Workflow lara-crons.yml também foi desabilitado neste commit
  // (defesa em profundidade · GH cron + endpoint no-op).
  //
  // Re-habilitar SÓ após:
  //   1. Filtro per-canal · só reativar conv com wa_number_id Cloud Lara
  //      (não Mih)
  //   2. Decisão Alden sobre se reativação D1 ainda faz sentido (Lara nova
  //      v2 + cold-open cobrem cold leads de outro jeito agora)
  //
  // Body original preservado abaixo · só não roda. Auth + log mantidos
  // pra observability (vemos se algo ainda está chamando).
  log.warn(
    { ip: req.headers.get('x-forwarded-for') ?? null },
    'cron.reactivate.disabled · audit 2026-05-06 mih ghost lara · noop',
  );
  return NextResponse.json({
    ok: true,
    disabled: true,
    reason: 'disabled after Mih ghost Lara audit 2026-05-06',
    processed: 0,
  });

  // Body original (findReactivationCandidates + Cloud API send) removido
  // intencionalmente · git history (commit anterior) preserva pra revival
  // após implementar filtro per-canal (Cloud Lara only · não Mih).
}
