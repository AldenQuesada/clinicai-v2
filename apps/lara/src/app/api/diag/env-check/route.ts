/**
 * GET /api/diag/env-check
 *
 * Health-check de envs criticas em runtime · mostra QUAIS envs o container
 * Easypanel está enxergando (sem expor valores). Util pra debugar
 * "server_misconfigured" quando Easypanel/Vercel nao propaga env nova.
 *
 * Reposta booleana por env · valor real NUNCA exposto.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TRACKED_ENVS = [
  'WA_INBOUND_SECRET',
  'LARA_WA_INBOUND_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'META_APP_SECRET',
  'ANTHROPIC_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'COLD_OPEN_SECRET',
  'LARA_TENANT_FAILFAST',
  'LARA_PROMPT_DB_STRICT',
  'GROQ_API_KEY',
  'SENTRY_DSN',
] as const;

export async function GET() {
  const result: Record<string, { present: boolean; length: number }> = {};
  for (const key of TRACKED_ENVS) {
    const v = process.env[key];
    result[key] = {
      present: !!v && v.length > 0,
      length: v?.length ?? 0,
    };
  }
  return NextResponse.json({
    ok: true,
    runtime: process.version,
    envs: result,
    timestamp: new Date().toISOString(),
  });
}
