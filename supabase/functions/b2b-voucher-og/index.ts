/**
 * ClinicAI — B2B Voucher OG Image (Fase 3)
 *
 * Gera uma imagem Open Graph (1200x630) pro preview do voucher no WhatsApp
 * e outras redes sociais. Lê o token via ?t= ou body, busca dados do voucher
 * via RPC b2b_voucher_get_by_token e renderiza um SVG temático.
 *
 * Retorno padrão: image/svg+xml (fallback sempre disponível, compatível com
 * a maioria dos crawlers OG modernos — Facebook, LinkedIn, Twitter/X).
 * WhatsApp legado pode não renderizar SVG; para esses casos, ative PNG via
 * ?format=png, que tenta render com @resvg/resvg-wasm (pode falhar em
 * runtimes sem WASM — degrada pra SVG automaticamente).
 *
 * Tema:
 *   voucher.theme === 'dark'           → bg #0F0D0A / accent #C9A96E / ink #F5F0E8
 *   voucher.theme === 'light'          → bg #FFFFFF / accent #7A1F2B / ink #1A1A1A
 *   voucher.theme === 'auto' | null    → b2b_seasonal_current() (bg_hex/accent_hex/ink_hex)
 *
 * Query params:
 *   ?t=TOKEN       — token do voucher (obrigatório pra render real)
 *   ?format=png    — força PNG via resvg (opt-in; default svg)
 *   ?debug=1       — retorna JSON com metadados (dev-only)
 *
 * Fallback: token inválido/ausente → imagem "Clínica Mirian de Paula · Voucher Presente"
 * (NÃO retorna 404 pra evitar cache negativo no WhatsApp).
 */

const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// ─── Paletas ────────────────────────────────────────────────
const THEMES = {
  dark:  { bg: '#0F0D0A', ink: '#F5F0E8', accent: '#C9A96E', soft: '#A89680' },
  light: { bg: '#FFFFFF', ink: '#1A1A1A', accent: '#7A1F2B', soft: '#6B5F58' },
} as const

const FALLBACK_THEME = THEMES.dark

// ─── CORS ───────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Supabase RPC via REST ──────────────────────────────────
async function rpc(name: string, args: Record<string, unknown>) {
  if (!_SB_URL || !_SB_KEY) throw new Error('Supabase env ausente')
  const resp = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY,
      'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`[${name}] ${resp.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

// ─── Helpers ────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c])
}

function upper(s: unknown): string {
  return String(s == null ? '' : s).toUpperCase()
}

function firstName(s: unknown): string {
  if (!s) return ''
  return String(s).trim().replace(/\s*\(teste\)\s*$/i, '').trim()
}

function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-f]{3,8}$/i.test(s)
}

// deno-lint-ignore no-explicit-any
async function resolveTheme(voucher: any): Promise<{ bg: string; ink: string; accent: string; soft: string }> {
  const t = (voucher?.theme || '').toLowerCase()
  if (t === 'dark')  return THEMES.dark
  if (t === 'light') return THEMES.light

  // auto ou null → consulta calendário sazonal
  try {
    const seasonal = await rpc('b2b_seasonal_current', {})
    // aceita tanto shape plano quanto envelope { ok, theme: {...} }
    // deno-lint-ignore no-explicit-any
    const s: any = seasonal?.theme || seasonal?.data || seasonal
    if (s && isHex(s.bg_hex) && isHex(s.accent_hex) && isHex(s.ink_hex)) {
      return {
        bg: s.bg_hex,
        ink: s.ink_hex,
        accent: s.accent_hex,
        soft: isHex(s.soft_hex) ? s.soft_hex : s.ink_hex,
      }
    }
  } catch (_) { /* silencioso, usa fallback */ }

  return FALLBACK_THEME
}

// ─── SVG builder ────────────────────────────────────────────
interface RenderInput {
  partnerName: string
  recipientName: string
  comboLabel: string | null
  theme: { bg: string; ink: string; accent: string; soft: string }
}

function buildOrnament(x: number, y: number, color: string, scale = 1): string {
  // Flourish simétrico (replicado do voucher.html, viewBox 180x28)
  // Usa transform pra posicionar e escalar
  const sw = 0.8
  return `<g transform="translate(${x},${y}) scale(${scale})" stroke="${color}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 14 C 26 14, 28 4, 48 14 S 72 14, 82 14"/>
    <path d="M172 14 C 154 14, 152 4, 132 14 S 108 14, 98 14"/>
    <path d="M82 14 C 82 9, 86 6, 90 10 C 94 6, 98 9, 98 14 C 98 19, 92 22, 90 22 C 88 22, 82 19, 82 14 Z" fill="${color}"/>
    <circle cx="4"   cy="14" r="1.2" fill="${color}" stroke="none"/>
    <circle cx="176" cy="14" r="1.2" fill="${color}" stroke="none"/>
    <circle cx="90"  cy="14" r="1"   fill="${color}" stroke="none"/>
  </g>`
}

function buildSvg(input: RenderInput): string {
  const { partnerName, recipientName, comboLabel, theme } = input
  const { bg, ink, accent, soft } = theme
  const W = 1200, H = 630

  // Centraliza ornamento: viewBox original 180x28. Pra ocupar ~380px no canvas final:
  // scale = 380/180 ≈ 2.11. Centrado em x = (1200 - 380) / 2 = 410
  const ornamentScale = 2.2
  const ornamentW = 180 * ornamentScale // 396
  const ornamentX = (W - ornamentW) / 2 // 402

  const topOrnamentY = 70
  const bottomOrnamentY = H - 130

  // Tipografia:
  //   - serif stack genérica (Georgia/Times tem em quase todo renderer incluindo resvg)
  //   - cursive stack pra "Voucher"
  const SERIF = "'Cormorant Garamond', 'EB Garamond', Georgia, 'Times New Roman', serif"
  const SCRIPT = "'Mea Culpa', 'Great Vibes', 'Brush Script MT', cursive, serif"

  // Linhas verticais aproximadas:
  //   y=70  → ornamento top (28 * 2.2 = ~62 de altura)
  //   y=180 → parceiros
  //   y=270 → "Voucher" (script gigante)
  //   y=360 → "PRESENTE" (serif enorme)
  //   y=450 → "EXCLUSIVO PARA"
  //   y=510 → nome destinatária
  //   y=bottom-ornament
  //   y=H-40 → footer "clinicamirian.com.br"

  const partnerLine = partnerName
    ? `${esc(partnerName)}  &  Mirian de Paula`
    : 'Clínica Mirian de Paula'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>

  <!-- borda interna sutil -->
  <rect x="32" y="32" width="${W - 64}" height="${H - 64}" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1"/>

  ${buildOrnament(ornamentX, topOrnamentY, accent, ornamentScale)}

  <!-- Parceria -->
  <text x="${W / 2}" y="190" text-anchor="middle"
        font-family="${SERIF}" font-size="34" font-style="italic"
        fill="${ink}" fill-opacity="0.92">${esc(partnerLine)}</text>

  <!-- "Voucher" (script) -->
  <text x="${W / 2}" y="310" text-anchor="middle"
        font-family="${SCRIPT}" font-size="120"
        fill="${accent}">Voucher</text>

  <!-- "PRESENTE" (serif block) -->
  <text x="${W / 2}" y="400" text-anchor="middle"
        font-family="${SERIF}" font-size="84" font-weight="600"
        letter-spacing="14" fill="${ink}">PRESENTE</text>

  <!-- Faixa "EXCLUSIVO PARA" -->
  <text x="${W / 2}" y="470" text-anchor="middle"
        font-family="${SERIF}" font-size="22" letter-spacing="6"
        fill="${soft}">EXCLUSIVO PARA</text>

  <!-- Nome destinatária -->
  <text x="${W / 2}" y="520" text-anchor="middle"
        font-family="${SERIF}" font-size="42" font-weight="600"
        fill="${ink}">${esc(upper(recipientName || 'VOCÊ'))}</text>

  ${comboLabel ? `
  <!-- Combo sutil -->
  <text x="${W / 2}" y="555" text-anchor="middle"
        font-family="${SERIF}" font-size="20" font-style="italic"
        fill="${soft}">${esc(comboLabel)}</text>
  ` : ''}

  ${buildOrnament(ornamentX, bottomOrnamentY, accent, ornamentScale)}

  <!-- Footer minúsculo -->
  <text x="${W / 2}" y="${H - 30}" text-anchor="middle"
        font-family="${SERIF}" font-size="16" letter-spacing="4"
        fill="${soft}" fill-opacity="0.8">CLÍNICA MIRIAN DE PAULA · MARINGÁ</text>
</svg>`
}

// ─── Combo label humano ─────────────────────────────────────
function formatCombo(c: unknown): string | null {
  if (!c) return null
  return String(c).replace(/[_]+/g, ' ').replace(/\s*\+\s*/g, ' · ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

// ─── SVG → PNG (opt-in via ?format=png) ─────────────────────
// Usa @resvg/resvg-wasm via esm.sh. Se falhar (runtime sem WASM,
// network timeout, etc), retornamos null pro handler degradar pra SVG.
async function tryRenderPng(svg: string): Promise<Uint8Array | null> {
  try {
    // import dinâmico pra não quebrar o cold-start quando PNG não é pedido
    // deno-lint-ignore no-explicit-any
    const mod: any = await import('https://esm.sh/@resvg/resvg-wasm@2.6.2')
    // Inicializa WASM uma vez
    // deno-lint-ignore no-explicit-any
    const g = globalThis as any
    if (!g.__RESVG_INIT__) {
      await mod.initWasm(fetch('https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm'))
      g.__RESVG_INIT__ = true
    }
    const resvg = new mod.Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      // Fontes: resvg-wasm não carrega fontes do SO; usa defaults.
      // Como nosso SVG usa stacks genéricas (serif/cursive), resvg vai cair
      // nas fontes embutidas do binário wasm — renderização aceitável.
      font: { loadSystemFonts: false, defaultFontFamily: 'serif' },
    })
    const rendered = resvg.render()
    return rendered.asPng()
  } catch (e) {
    console.warn('[b2b-voucher-og] PNG render falhou, caindo pra SVG:', (e as Error).message)
    return null
  }
}

// ─── Handler principal ──────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders })

  // ── Extrai token + flags ────────────────────────────────
  const url = new URL(req.url)
  let token = url.searchParams.get('t') || url.searchParams.get('token') || ''
  const wantPng = (url.searchParams.get('format') || '').toLowerCase() === 'png'
  const debug = url.searchParams.get('debug') === '1'

  if (!token && req.method === 'POST') {
    try {
      const body = await req.json()
      token = body?.token || body?.t || ''
    } catch { /* ignore */ }
  }

  // ── Busca voucher (ou monta fallback) ────────────────────
  // deno-lint-ignore no-explicit-any
  let voucher: any = null
  let fetchError: string | null = null

  if (token) {
    try {
      const res = await rpc('b2b_voucher_get_by_token', { p_token: token })
      if (res?.ok && res.voucher) voucher = res.voucher
      else fetchError = res?.error || 'voucher não encontrado'
    } catch (e) {
      fetchError = (e as Error).message
    }
  } else {
    fetchError = 'token ausente'
  }

  // ── Resolve tema ────────────────────────────────────────
  const theme = await resolveTheme(voucher)

  // ── Monta input ─────────────────────────────────────────
  const input: RenderInput = {
    partnerName: voucher?.partnership?.name || '',
    recipientName: firstName(voucher?.recipient_name) || '',
    comboLabel: formatCombo(voucher?.combo),
    theme,
  }

  const svg = buildSvg(input)

  // ── Debug: retorna JSON com metadados ───────────────────
  if (debug) {
    return new Response(JSON.stringify({
      ok: true,
      token_present: !!token,
      fetch_error: fetchError,
      voucher_found: !!voucher,
      theme,
      input,
      svg_bytes: svg.length,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Retorna PNG se solicitado (com fallback pra SVG) ───
  if (wantPng) {
    const png = await tryRenderPng(svg)
    if (png) {
      return new Response(png, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'X-Voucher-Found': voucher ? '1' : '0',
        },
      })
    }
    // cai pra SVG sem ruído
  }

  // ── Default: SVG ────────────────────────────────────────
  return new Response(svg, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'X-Voucher-Found': voucher ? '1' : '0',
    },
  })
})
