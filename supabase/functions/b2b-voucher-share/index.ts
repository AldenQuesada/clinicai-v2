/**
 * ClinicAI — B2B Voucher Share (OG meta + redirect)
 *
 * Retorna HTML mínimo com meta tags Open Graph preenchidas server-side
 * (pro crawler do WhatsApp renderizar preview rico) e redireciona
 * humanos pra voucher.html depois de 200ms.
 *
 * URL: /functions/v1/b2b-voucher-share?t=TOKEN
 *
 * Essa é a URL que vai nas mensagens enviadas pela Mira.
 */

const _SB_URL = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const VOUCHER_BASE = 'https://painel.miriandpaula.com.br/voucher.html'
const OG_IMG_BASE  = _SB_URL + '/functions/v1/b2b-voucher-og'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`[${name}] ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function esc(s: string | null | undefined): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  })[c]!)
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'você'
  return String(full).trim().replace(/\s*\(teste\)\s*$/i, '').split(/\s+/)[0] || 'você'
}

function buildHtml(opts: {
  token: string
  title: string
  description: string
  imageUrl: string
  destinationUrl: string
}) {
  const { token, title, description, imageUrl, destinationUrl } = opts
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Clínica Mirian de Paula">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(destinationUrl)}">
<meta property="og:locale" content="pt_BR">

<!-- Twitter / X -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(imageUrl)}">

<link rel="canonical" href="${esc(destinationUrl)}">
<meta http-equiv="refresh" content="0; url=${esc(destinationUrl)}">
<style>
  body {
    margin: 0; padding: 0; min-height: 100vh;
    background: #0F0D0A; color: #F5F0E8;
    font-family: Georgia, serif;
    display: flex; align-items: center; justify-content: center;
    text-align: center; padding: 40px 20px;
  }
  .msg { max-width: 400px; }
  .msg h1 { font-weight: 300; font-size: 32px; margin-bottom: 10px; color: #C9A96E; font-style: italic; }
  .msg p { font-size: 14px; opacity: 0.75; margin-bottom: 16px; }
  .msg a { color: #DFC5A0; text-decoration: none; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
  .msg a:hover { color: #C9A96E; }
</style>
</head>
<body>
  <div class="msg">
    <h1>Abrindo seu voucher…</h1>
    <p>Se não carregar automaticamente:</p>
    <a href="${esc(destinationUrl)}">Abrir meu voucher</a>
  </div>
  <script>
    setTimeout(function () {
      window.location.replace(${JSON.stringify(destinationUrl)});
    }, 200);
  </script>
</body>
</html>`
}

function fallbackHtml() {
  const url = VOUCHER_BASE
  return buildHtml({
    token: '',
    title: 'Voucher Presente · Clínica Mirian de Paula',
    description: 'Cuidado, excelência e beleza em Maringá.',
    imageUrl: OG_IMG_BASE,
    destinationUrl: url,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: cors })
  }

  try {
    const u = new URL(req.url)
    const token = (u.searchParams.get('t') || u.searchParams.get('token') || '').trim()

    if (!token) {
      return new Response(fallbackHtml(), {
        headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8',
                   'Cache-Control': 'public, max-age=300' },
      })
    }

    // Busca voucher sem marcar como 'opened' (usa select direto ao invés de RPC)
    const r = await fetch(
      `${_SB_URL}/rest/v1/b2b_vouchers?token=eq.${encodeURIComponent(token)}` +
      `&select=token,recipient_name,combo,valid_until,partnership:b2b_partnerships(name,slogans)`,
      { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` } },
    )
    const rows = await r.json()
    const v = Array.isArray(rows) && rows.length ? rows[0] : null

    if (!v) {
      return new Response(fallbackHtml(), {
        headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8',
                   'Cache-Control': 'public, max-age=60' },
      })
    }

    const nome = firstName(v.recipient_name)
    const parceiro = v.partnership?.name || 'nossa parceira'
    const slogan = Array.isArray(v.partnership?.slogans) && v.partnership.slogans[0]
      ? v.partnership.slogans[0] : null

    const title = `Voucher Presente para ${nome}`
    const description = slogan ||
      `${parceiro} & Mirian de Paula uniram forças pra te entregar um cuidado único.`
    const imageUrl = `${OG_IMG_BASE}?t=${encodeURIComponent(token)}`
    const destinationUrl = `${VOUCHER_BASE}?t=${encodeURIComponent(token)}`

    const html = buildHtml({ token, title, description, imageUrl, destinationUrl })

    return new Response(html, {
      headers: {
        ...cors,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
      },
    })
  } catch (e) {
    console.error('[voucher-share] erro:', (e as Error).message)
    return new Response(fallbackHtml(), {
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
})
