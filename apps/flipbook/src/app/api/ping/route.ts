// Debug endpoint · responde texto plano sem tocar Supabase nem env.
// Usar pra isolar se Traefik/Easypanel consegue rotear pro container.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  return new Response('ok', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
