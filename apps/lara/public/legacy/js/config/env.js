/**
 * ClinicAI — Environment Configuration
 *
 * Fonte ÚNICA de verdade para credenciais e configurações de ambiente.
 * Todos os módulos devem ler de window.ClinicEnv em vez de hardcodar valores.
 *
 * Para deploy em produção:
 *   1. Substituir os valores abaixo por variáveis de ambiente do servidor
 *   2. Ou gerar este arquivo dinamicamente no build/deploy pipeline
 *   3. Ou servir via endpoint protegido e carregar antes dos módulos
 *
 * Uso:
 *   var url = window.ClinicEnv.SUPABASE_URL
 *   var key = window.ClinicEnv.SUPABASE_KEY
 */
;(function () {
  'use strict'

  if (window.ClinicEnv) return

  window.ClinicEnv = Object.freeze({
    SUPABASE_URL: 'https://oqboitkpcvuaudouwvkl.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0',
    // OpenAI API key: loaded from localStorage (set via Settings > Integracoes)
    // Never committed to git. Set via: localStorage.setItem('clinicai_openai_key', 'sk-...')
    OPENAI_KEY: null,
    // Facial Analysis Python API — null = offline-first (features avancadas desabilitadas)
    // Para ativar: deploy Dockerfile em api/ e setar URL aqui
    // Local: 'http://localhost:8107'
    FACIAL_API_URL: 'https://facial.miriandpaula.com.br',
    // Magazine AI: Edge Function que wrappa Anthropic Claude p/ gerar conteudo de slots
    // Deploy: `supabase functions deploy magazine-ai-generate`
    // Secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
    MAGAZINE_AI_ENDPOINT: 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/magazine-ai-generate',
    // Allowlist de endpoints AI permitidos. Qualquer fetch() para AI DEVE
    // validar contra esta lista antes de enviar cabecalhos com anon JWT —
    // previne exfiltracao se MAGAZINE_AI_ENDPOINT for adulterado.
    // Ver code-review/magazine.md C2.
    AI_ENDPOINT_ALLOWLIST: Object.freeze([
      /^https:\/\/oqboitkpcvuaudouwvkl\.supabase\.co\/functions\/v1\//,
      // Adicionar aqui outros endpoints confiaveis quando necessario.
      // NUNCA permitir dominios externos — anon JWT vaza inteiro no header.
    ]),
    // WhatsApp oficial da clínica (Lara / instância Mih no Evolution).
    // Usado pelo botão "Agendar minha avaliação" na página do voucher
    // — deeplink wa.me/<phone>?text=... abre conversa com a clínica.
    CLINIC_WA: '554491622986',
    CLINIC_PHONE: '554491622986',
    // Endereço físico da clínica — renderizado no rodapé do Kit QR VPI
    // (vpi-qr-kit.html). Alden: troque CLINIC_ADDRESS pelo endereço real
    // (ex: 'Av. Colombo, 1234 · Zona 7') — a cidade já tá setada como
    // Maringá-PR baseado no DDD 44 dos telefones operacionais.
    CLINIC_ADDRESS: '',
    CLINIC_CITY:    'Maringá · PR',
    CLINIC_WHATSAPP: '554491622986',
    // Host público das páginas (voucher.html, parceiro.html, r.html,
    // public_embaixadora.html). Todo QR e short-link da revista/VPI aponta
    // pra cá. Antes caía no fallback window.location.origin (easypanel).
    SHORT_LINK_HOST: 'https://painel.miriandpaula.com.br',
    // Cache-buster: incrementar a cada deploy para forçar recarga dos scripts
    ASSET_VERSION: '20260419a',
  })

})()
