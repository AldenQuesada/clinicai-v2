/**
 * ClinicAI — Supabase client shared (compat shim)
 *
 * Páginas VPI públicas (vpi-qr-batch, vpi-qr-kit, vpi-tv-export, vpi-tv-indoor)
 * apontam pra `js/sb-shared.js`. O client principal (`window._sbShared`) é
 * criado em `js/supabase.js`, mas essas páginas são leves e não precisam do
 * bootstrap inteiro de clinic_data — só do client anon.
 *
 * Este shim cria `window._sbShared` idempotente usando `window.ClinicEnv`.
 *
 * Dependências (no HTML, ORDEM obrigatória):
 *   1. @supabase/supabase-js (CDN)
 *   2. js/clinic-env.js
 *   3. js/sb-shared.js   ← este arquivo
 */
;(function () {
  'use strict'
  if (window._sbShared) return
  var env = window.ClinicEnv || {}
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[sb-shared] supabase-js não carregado antes deste script')
    return
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.error('[sb-shared] ClinicEnv ausente ou incompleto')
    return
  }
  // Config padrao do supabase-js (persistSession=true, autoRefreshToken=true,
  // detectSessionInUrl=true). Ass páginas admin (vpi-qr-batch) precisam pegar
  // a sessão do localStorage pra chamar RPCs restritas a authenticated.
  // Páginas públicas (vpi-qr-kit com token, tv-export) funcionam no anon
  // sem precisar de sessão — o auth=null não atrapalha.
  try {
    window._sbShared = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
  } catch (e) {
    console.error('[sb-shared] createClient falhou:', e)
  }
})()
