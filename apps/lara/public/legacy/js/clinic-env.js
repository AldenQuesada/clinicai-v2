/**
 * ClinicAI — Environment (compat shim)
 *
 * Páginas mais antigas (vpi-qr-batch, vpi-qr-kit, vpi-tv-export, vpi-tv-indoor)
 * ainda apontam pra `js/clinic-env.js`. O canônico foi movido pra
 * `js/config/env.js` mas renomear em todas as páginas exigiria varredura
 * grande. Este shim mantém compat definindo window.ClinicEnv idempotente.
 *
 * Sincronize com `js/config/env.js` se mudar credenciais.
 */
;(function () {
  'use strict'
  if (window.ClinicEnv) return
  window.ClinicEnv = Object.freeze({
    SUPABASE_URL: 'https://oqboitkpcvuaudouwvkl.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0',
    SHORT_LINK_HOST: 'https://painel.miriandpaula.com.br',
    CLINIC_WA: '554491622986',
    CLINIC_PHONE: '554491622986',
    CLINIC_WHATSAPP: '554491622986',
    CLINIC_ADDRESS: '',   // preencha quando tiver o endereço oficial
    CLINIC_CITY:    'Maringá · PR',
  })
})()
