/**
 * Página temporária · /evolution-qr · QR code de reconexão Evolution.
 *
 * Motivo (2026-06-08): a instância Mih (canal "Lara"/recipient · envia voucher
 * pro destinatário) caiu. Não existe tela de QR no painel. Esta página usa a
 * EVOLUTION_API_KEY que já vive no servidor (nunca exposta ao browser) pra
 * chamar GET /instance/connect/{instance} e renderizar o QR pra escanear.
 *
 * Auth: dupla camada · (authed) layout + checagem explícita de role
 * (owner/admin). Sem secret na URL.
 *
 * Default instance: EVOLUTION_INSTANCE_MIH ?? 'Mih' (mesma resolução do
 * dispatcher em process-message.ts:454). Override via ?instance=mira-mirian
 * pra reconectar a Mira se precisar.
 *
 * Auto-refresh: meta http-equiv refresh 20s · o QR do Evolution rota a cada
 * ~20-30s · cada reload re-chama connect e pega QR novo.
 *
 * REMOVER após reconectar (página de manutenção · não faz parte do produto).
 */

import type { ReactNode } from 'react'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ConnectResponse {
  pairingCode?: string | null
  code?: string | null
  base64?: string | null
  count?: number
}

interface StateResponse {
  instance?: { instanceName?: string; state?: string }
  state?: string
}

async function fetchState(
  apiUrl: string,
  apiKey: string,
  instance: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/+$/, '')}/instance/connectionState/${encodeURIComponent(instance)}`,
      { headers: { apikey: apiKey }, cache: 'no-store' },
    )
    if (!res.ok) return null
    const data = (await res.json()) as StateResponse
    return data.instance?.state ?? data.state ?? null
  } catch {
    return null
  }
}

async function fetchConnect(
  apiUrl: string,
  apiKey: string,
  instance: string,
): Promise<{ ok: boolean; data?: ConnectResponse; status?: number; error?: string }> {
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/+$/, '')}/instance/connect/${encodeURIComponent(instance)}`,
      { headers: { apikey: apiKey }, cache: 'no-store' },
    )
    if (!res.ok) {
      return { ok: false, status: res.status, error: await res.text().catch(() => '') }
    }
    return { ok: true, data: (await res.json()) as ConnectResponse }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export default async function EvolutionQrPage({
  searchParams,
}: {
  searchParams: Promise<{ instance?: string }>
}) {
  // Gate explícito de role (além do (authed) layout).
  let role: string | null | undefined
  try {
    const { ctx } = await loadMiraServerContext()
    role = ctx.role
  } catch {
    return <Shell title="Sessão necessária">Faça login no painel e recarregue.</Shell>
  }
  if (role && !['owner', 'admin'].includes(role)) {
    return <Shell title="Sem permissão">Só owner/admin pode reconectar canais.</Shell>
  }

  const sp = await searchParams
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance =
    (sp.instance && sp.instance.trim()) || process.env.EVOLUTION_INSTANCE_MIH || 'Mih'

  if (!apiUrl || !apiKey) {
    return (
      <Shell title="Config Evolution faltando">
        EVOLUTION_API_URL={String(!!apiUrl)} · EVOLUTION_API_KEY={String(!!apiKey)} no servidor.
      </Shell>
    )
  }

  const state = await fetchState(apiUrl, apiKey, instance)
  if (state === 'open') {
    return (
      <Shell title={`Instância "${instance}" · CONECTADA ✓`}>
        <p style={{ color: '#4ade80', fontWeight: 600 }}>
          Já está conectada (state=open). Nada a escanear.
        </p>
        <p style={{ opacity: 0.7, marginTop: 8 }}>
          O dispatch de voucher pra Mariana já pode sair. Volte pro chat que eu
          audito o estado do voucher e reenvio se preciso.
        </p>
      </Shell>
    )
  }

  const conn = await fetchConnect(apiUrl, apiKey, instance)
  if (!conn.ok || !conn.data) {
    return (
      <Shell title={`Falha ao pedir QR · instância "${instance}"`}>
        <p style={{ color: '#f87171' }}>
          HTTP {conn.status ?? '—'} · {conn.error || 'sem detalhe'}
        </p>
        <p style={{ opacity: 0.7, marginTop: 8 }}>
          Se for 404, o nome da instância está errado — tente
          ?instance=&lt;nome-exato&gt; na URL.
        </p>
      </Shell>
    )
  }

  const { base64, pairingCode } = conn.data
  const imgSrc = base64
    ? base64.startsWith('data:')
      ? base64
      : `data:image/png;base64,${base64}`
    : null

  return (
    <Shell title={`Reconectar "${instance}" · escaneie o QR`} refreshSeconds={20}>
      {imgSrc ? (
        <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc} alt="QR Evolution" width={320} height={320} />
        </div>
      ) : (
        <p style={{ color: '#fbbf24' }}>
          Evolution não devolveu imagem de QR (state={state ?? '—'}). Recarregue
          em alguns segundos.
        </p>
      )}
      {pairingCode ? (
        <p style={{ marginTop: 12 }}>
          Ou pareie por código:{' '}
          <code style={{ fontSize: 20, letterSpacing: 2, color: '#C9A96E' }}>
            {pairingCode}
          </code>{' '}
          (WhatsApp → Aparelhos conectados → Conectar com número de telefone)
        </p>
      ) : null}
      <ol style={{ opacity: 0.8, marginTop: 16, lineHeight: 1.7 }}>
        <li>No celular do número 2986: WhatsApp → Aparelhos conectados.</li>
        <li>Conectar um aparelho → escaneie o QR acima.</li>
        <li>
          Quando aparecer “CONECTADA ✓” (a página recarrega sozinha a cada 20s),
          terminou.
        </li>
      </ol>
      <p style={{ opacity: 0.5, marginTop: 16, fontSize: 13 }}>
        Página de manutenção temporária · state atual: {state ?? '—'}
      </p>
    </Shell>
  )
}

function Shell({
  title,
  children,
  refreshSeconds,
}: {
  title: string
  children: ReactNode
  refreshSeconds?: number
}) {
  return (
    <div style={{ padding: 32, maxWidth: 560, margin: '0 auto', color: '#EDE7DC' }}>
      {refreshSeconds ? <meta httpEquiv="refresh" content={String(refreshSeconds)} /> : null}
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#C9A96E' }}>
        {title}
      </h1>
      {children}
    </div>
  )
}
