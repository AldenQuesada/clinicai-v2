/**
 * Database types · placeholder até rodarmos:
 *
 *   pnpm dlx supabase gen types typescript --project-id oqboitkpcvuaudouwvkl > packages/supabase/src/types.generated.ts
 *
 * Por enquanto export tipo `any`-ish pra desbloquear TS strict. Substituir
 * pelos tipos gerados na Fase 1 antes de subir prod.
 *
 * TODO(Fase 1): regenerar via supabase CLI · auto-tipa todas tabelas + RPCs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any
