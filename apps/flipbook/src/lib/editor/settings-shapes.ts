/**
 * Schemas Zod e helpers de leitura segura dos `flipbooks.settings` (jsonb).
 *
 * Por que aqui: o jsonb é livre (merge raso); pode ter shape mal-formado
 * em runtime (livros antigos, edição parcial, migrations futuras). Cada
 * helper retorna um shape validado ou fallback seguro — Reader nunca
 * lida com `unknown` direto.
 */
import { z } from 'zod'

type Json = Record<string, unknown> | null | undefined

// ─────────────────────────────────────────────────────────────────────
// CONTROLS · visibilidade dos botões do Reader
// ─────────────────────────────────────────────────────────────────────
export const ControlsSchema = z.object({
  download: z.boolean().optional(),
  share: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
  zoom: z.boolean().optional(),
  first_last: z.boolean().optional(),
  print: z.boolean().optional(),
  thumbnails: z.boolean().optional(),
  search: z.boolean().optional(),
  sound: z.boolean().optional(),
}).partial()
export type ControlsConfig = z.infer<typeof ControlsSchema>

export function readControls(s: Json): ControlsConfig {
  return ControlsSchema.safeParse((s as Record<string, unknown> | null | undefined)?.controls).data ?? {}
}

// ─────────────────────────────────────────────────────────────────────
// PAGINATION · estilo da barra inferior
// ─────────────────────────────────────────────────────────────────────
export const PaginationSchema = z.object({
  style: z.enum(['thumbs-numbers', 'numbers', 'thumbs', 'hidden']).optional(),
})
export type PaginationConfig = z.infer<typeof PaginationSchema>

export function readPagination(s: Json): PaginationConfig {
  return PaginationSchema.safeParse((s as Record<string, unknown> | null | undefined)?.pagination).data ?? {}
}

// ─────────────────────────────────────────────────────────────────────
// BACKGROUND · cor sólida (image+style ficam pra fase 2)
// ─────────────────────────────────────────────────────────────────────
export const BackgroundSchema = z.object({
  type: z.enum(['color', 'image']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  image_url: z.string().url().optional(),
})
export type BackgroundConfig = z.infer<typeof BackgroundSchema>

export function readBackground(s: Json): BackgroundConfig {
  return BackgroundSchema.safeParse((s as Record<string, unknown> | null | undefined)?.background).data ?? {}
}

// ─────────────────────────────────────────────────────────────────────
// PAGE EFFECT · efeito de virada + som
// ─────────────────────────────────────────────────────────────────────
export const PageEffectSchema = z.object({
  effect: z.enum(['magazine', 'book', 'album', 'notebook', 'slider', 'cards', 'coverflow', 'onepage']).optional(),
  disposition: z.enum(['adaptive', 'single', 'double']).optional(),
  sound: z.boolean().optional(),
})
export type PageEffectConfig = z.infer<typeof PageEffectSchema>

export function readPageEffect(s: Json): PageEffectConfig {
  return PageEffectSchema.safeParse((s as Record<string, unknown> | null | undefined)?.page_effect).data ?? {}
}

// ─────────────────────────────────────────────────────────────────────
// LOGO · overlay no Reader
// ─────────────────────────────────────────────────────────────────────
export const LogoSchema = z.object({
  url: z.string().url(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
  size: z.number().min(20).max(200).optional(),
  href: z.string().url().nullable().optional(),
})
export type LogoConfig = z.infer<typeof LogoSchema>

export function readLogo(s: Json): LogoConfig | null {
  const parsed = LogoSchema.safeParse((s as Record<string, unknown> | null | undefined)?.logo)
  return parsed.success ? parsed.data : null
}

// ─────────────────────────────────────────────────────────────────────
// BG AUDIO · trilha sonora opcional
// ─────────────────────────────────────────────────────────────────────
export const BgAudioSchema = z.object({
  url: z.string().url(),
  page_start: z.number().int().min(1).optional(),
  page_end: z.number().int().min(1).optional(),
  volume: z.number().min(0).max(1).optional(),
  loop: z.boolean().optional(),
})
export type BgAudioConfig = z.infer<typeof BgAudioSchema>

export function readBgAudio(s: Json): BgAudioConfig | null {
  const parsed = BgAudioSchema.safeParse((s as Record<string, unknown> | null | undefined)?.bg_audio)
  return parsed.success ? parsed.data : null
}

// ─────────────────────────────────────────────────────────────────────
// TOC CUSTOM · entries do autor
// ─────────────────────────────────────────────────────────────────────
export const TocSchema = z.object({
  enabled: z.boolean().optional(),
  entries: z.array(z.object({
    label: z.string().min(1).max(200),
    page: z.number().int().min(1),
  })).max(200).optional(),
})
export type TocConfig = z.infer<typeof TocSchema>

export function readToc(s: Json): TocConfig {
  return TocSchema.safeParse((s as Record<string, unknown> | null | undefined)?.toc).data ?? {}
}

// ─────────────────────────────────────────────────────────────────────
// LEAD CAPTURE · config do modal mid-book
// ─────────────────────────────────────────────────────────────────────
export const LeadCaptureSchema = z.object({
  page: z.number().int().min(1),
  title: z.string().max(200).optional(),
  dismissible: z.boolean().optional(),
})
export type LeadCaptureConfig = z.infer<typeof LeadCaptureSchema>

export function readLeadCapture(s: Json): LeadCaptureConfig | null {
  const parsed = LeadCaptureSchema.safeParse((s as Record<string, unknown> | null | undefined)?.lead_capture)
  return parsed.success ? parsed.data : null
}

// ─────────────────────────────────────────────────────────────────────
// REDIRECT URL · pre-render redirect server-side
// ─────────────────────────────────────────────────────────────────────
export function readRedirectUrl(s: Json): string | null {
  const url = (s as Record<string, unknown> | null | undefined)?.redirect_url
  if (typeof url !== 'string') return null
  const parsed = z.string().url().regex(/^https?:\/\//).safeParse(url)
  return parsed.success ? parsed.data : null
}
