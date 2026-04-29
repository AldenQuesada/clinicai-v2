#!/usr/bin/env node
/**
 * Aplica mig 72 (appointment_change_status RPC) em prod via Management API.
 * Mesmo padrao de generate-types.mjs (fetch nativo do Node).
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration-72.mjs
 */

import fs from 'node:fs/promises';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl';
const MIG_PATH = new URL(
  '../db/migrations/20260800000072_clinicai_v2_appointment_change_status.sql',
  import.meta.url,
);

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN nao setado');
  process.exit(1);
}

const sql = await fs.readFile(MIG_PATH, 'utf8');

console.log(`Aplicando mig 72 em ${REF} (${sql.length} chars)...`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  },
);

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text.slice(0, 2000));
process.exit(res.ok ? 0 : 1);
