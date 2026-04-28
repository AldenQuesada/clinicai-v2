/**
 * Banco de mídias da Lara · Server Component.
 *
 * CRUD completo do `wa_media_bank`:
 *   - upload de novas fotos (Storage bucket 'media' · before-after/<funnel>/)
 *   - edicao inline (caption, queixas, funnel, fase, ordem)
 *   - toggle ativo/inativo (soft hide · audit-safe)
 *
 * Lara consome via RPC wa_get_media (lib/webhook/media-dispatch.ts) ·
 * mudancas aqui aplicam imediatamente no proximo [FOTO:tag].
 */

import { redirect } from 'next/navigation'
import { Image as ImageIcon, Upload, AlertTriangle } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { uploadMediaAction } from './actions'
import { MediaRow } from './MediaRow'
import type { WaMediaBankDTO } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

interface MediaView {
  id: string
  filename: string
  url: string
  funnel: string | null
  queixas: string[]
  caption: string | null
  phase: string | null
  sort_order: number
  is_active: boolean
}

function toView(m: WaMediaBankDTO): MediaView {
  return {
    id: m.id,
    filename: m.filename,
    url: m.url,
    funnel: m.funnel,
    queixas: m.queixas,
    caption: m.caption,
    phase: m.phase,
    sort_order: m.sortOrder,
    is_active: m.isActive,
  }
}

async function loadMedia(): Promise<{ media: MediaView[]; canManage: boolean }> {
  const { ctx, repos } = await loadServerReposContext()
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
  const dtos = await repos.mediaBank.listAll(ctx.clinic_id)
  return { media: dtos.map(toView), canManage }
}

export default async function MediaPage() {
  const { media, canManage } = await loadMedia()

  if (!canManage) {
    redirect('/dashboard')
  }

  const olheiras = media.filter((m) => m.funnel === 'olheiras')
  const fullface = media.filter((m) => m.funnel === 'fullface')
  const outros = media.filter((m) => m.funnel !== 'olheiras' && m.funnel !== 'fullface')

  const activeCount = media.filter((m) => m.is_active).length

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">
                Banco de mídias
              </span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Fotos antes/depois enviadas pela Lara · {media.length} no banco ·{' '}
              <span className="text-[hsl(var(--primary))]">{activeCount} ativas</span>
            </p>
          </div>
        </div>

        <div className="rounded-card border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 p-4 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
          <div className="text-sm text-[hsl(var(--foreground))]">
            <strong>Lara escolhe foto pela tag</strong> [FOTO:queixa] que ela mesma escreve.
            Se queixa não tiver foto cadastrada, ela pega qualquer ativa do funnel. Caption
            ideal: <em>nome + idade + assinatura</em> (ex: &quot;Miriam Poppi, 52 anos · Resultado
            real Dra. Mirian de Paula&quot;).
          </div>
        </div>

        <details className="mb-8 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
          <summary className="cursor-pointer px-5 py-4 flex items-center gap-2 text-sm font-display-uppercase tracking-widest text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))] rounded-card transition-colors">
            <Upload className="w-4 h-4" />
            Subir nova foto
          </summary>
          <form
            action={uploadMediaAction}
            encType="multipart/form-data"
            className="p-5 space-y-4 border-t border-[hsl(var(--chat-border))]"
          >
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                Arquivo (jpg/png/webp · max 5MB)
              </label>
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                required
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))] file:mr-3 file:px-3 file:py-1 file:rounded-pill file:border-0 file:bg-[hsl(var(--primary))] file:text-[hsl(var(--primary-foreground))] file:text-[10px] file:uppercase file:tracking-widest file:cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Funnel
                </label>
                <select
                  name="funnel"
                  required
                  defaultValue=""
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
                >
                  <option value="" disabled>
                    selecionar...
                  </option>
                  <option value="olheiras">olheiras</option>
                  <option value="fullface">fullface</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Ordem
                </label>
                <input
                  type="number"
                  name="sort_order"
                  defaultValue={0}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                Caption (nome + idade · vai como legenda da foto pro paciente)
              </label>
              <input
                name="caption"
                placeholder='ex: "Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula"'
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                Queixas (separadas por vírgula · só entram tags válidas)
              </label>
              <input
                name="queixas"
                placeholder="olheiras, sulcos, flacidez, contorno..."
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                válidas: geral, olheiras, sulcos, flacidez, contorno, papada, textura, rugas,
                rejuvenescimento, fullface, firmeza, manchas, mandibula, perfil, bigode_chines
              </p>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                Fase (opcional · ex: agendamento, fechamento)
              </label>
              <input
                name="phase"
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2 rounded-pill font-display-uppercase text-xs tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
            >
              Subir foto
            </button>
          </form>
        </details>

        <div className="space-y-8">
          {fullface.length > 0 && (
            <FunnelSection
              title="Full Face"
              emoji="✨"
              media={fullface}
              canManage={canManage}
            />
          )}
          {olheiras.length > 0 && (
            <FunnelSection
              title="Olheiras"
              emoji="👁️"
              media={olheiras}
              canManage={canManage}
            />
          )}
          {outros.length > 0 && (
            <FunnelSection
              title="Sem funnel"
              emoji="📸"
              media={outros}
              canManage={canManage}
            />
          )}
          {media.length === 0 && (
            <div className="text-center py-16 text-[hsl(var(--muted-foreground))] text-sm">
              Banco vazio · use o formulário acima pra subir a primeira foto
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function FunnelSection({
  title,
  emoji,
  media,
  canManage,
}: {
  title: string
  emoji: string
  media: MediaView[]
  canManage: boolean
}) {
  const activeCount = media.filter((m) => m.is_active).length
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">{emoji}</span>
        <h2 className="font-display-uppercase text-sm tracking-widest text-[hsl(var(--foreground))]">
          {title}
        </h2>
        <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
          {media.length} · {activeCount} ativa{activeCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-3">
        {media.map((m) => (
          <MediaRow key={m.id} media={m} canManage={canManage} />
        ))}
      </div>
    </section>
  )
}
