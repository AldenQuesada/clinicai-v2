#!/usr/bin/env node
/**
 * Gera packages/supabase/src/types.ts via Supabase Management API.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/generate-types.mjs
 *
 * Ou via package.json:
 *   pnpm db:types
 *
 * Requer:
 *   - SUPABASE_ACCESS_TOKEN env (personal access token de
 *     https://supabase.com/dashboard/account/tokens)
 *   - SUPABASE_PROJECT_REF env (default: oqboitkpcvuaudouwvkl)
 *
 * Por que nao usar `supabase gen types typescript` direto?
 *   - Evita dependencia do CLI Supabase (instalacao demorada · cmake build)
 *   - Endpoint da Management API e mais simples e suficiente
 *   - 1 dependencia a menos no repo
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl';

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN nao setado.');
  console.error('   Gere em: https://supabase.com/dashboard/account/tokens');
  console.error('   Uso: SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:types');
  process.exit(1);
}

const URL = `https://api.supabase.com/v1/projects/${REF}/types/typescript`;

console.log(`→ Buscando types de ${REF}...`);

const res = await fetch(URL, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});

if (!res.ok) {
  console.error(`❌ HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const json = await res.json();
const types = json.types;

if (!types || typeof types !== 'string') {
  console.error('❌ Resposta sem campo `types`:', JSON.stringify(json).slice(0, 200));
  process.exit(1);
}

// Header com data de geracao
const header = `/**
 * Database types · auto-gerado via supabase Management API.
 *
 * NAO EDITAR MANUALMENTE. Pra regenerar:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:types
 *
 * Ultima geracao: ${new Date().toISOString()}
 * Project ref: ${REF}
 */

`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '..', 'packages', 'supabase', 'src', 'types.ts');

await fs.writeFile(outPath, header + types);

const stats = await fs.stat(outPath);
console.log(`✅ Salvo em ${outPath}`);
console.log(`   Tamanho: ${(stats.size / 1024).toFixed(1)} KB`);
