'use client'

import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, Music } from 'lucide-react'

interface Props {
  url: string
  /** Toca automático apenas se currentPage between [pageStart..pageEnd]. */
  pageStart?: number
  pageEnd?: number
  currentPage: number
  /** 0..1, default 0.6 */
  volume?: number
  loop?: boolean
  /** Pausa em fullscreen mode (modo apresentação). */
  pauseInFullscreen?: boolean
  isFullscreen?: boolean
}

/**
 * Audio de fundo do livro · consume `settings.bg_audio`.
 *
 * Comportamento:
 * - Toca quando currentPage entra no range [pageStart..pageEnd]
 * - Pausa fora do range
 * - Pausa em fullscreen (presentation mode)
 * - Browser exige interação do user pra autoplay com som — botão flutuante
 *   (canto inferior esquerdo) faz o "first play" virar consentido
 *
 * Plug:
 *   const bg = readBgAudio(book.settings)
 *   {bg?.url && <BgAudioPlayer url={bg.url} pageStart={bg.page_start} ... currentPage={currentPage} />}
 */
export function BgAudioPlayer({
  url, pageStart = 1, pageEnd = 9999, currentPage,
  volume = 0.6, loop = true,
  pauseInFullscreen = true, isFullscreen = false,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [armed, setArmed] = useState(false)  // user clicou pra liberar autoplay
  const [muted, setMuted] = useState(false)

  const inRange = currentPage >= pageStart && currentPage <= pageEnd
  const shouldPlay = armed && inRange && !(pauseInFullscreen && isFullscreen) && !muted

  // Sincroniza play/pause com shouldPlay
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (shouldPlay) {
      el.play().catch(() => { /* user-gesture ainda exigido em alguns browsers */ })
    } else {
      el.pause()
    }
  }, [shouldPlay])

  // Sincroniza volume
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = Math.max(0, Math.min(1, volume))
  }, [volume])

  if (!url) return null

  return (
    <>
      <audio ref={audioRef} src={url} loop={loop} preload="auto" aria-label="Áudio de fundo do livro" />
      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="absolute bottom-4 left-4 z-10 w-9 h-9 rounded-full bg-bg-elevated/85 backdrop-blur border border-gold/40 text-gold hover:bg-gold hover:text-bg transition flex items-center justify-center shadow-lg"
          title="Ativar trilha sonora do livro"
          aria-label="Ativar trilha sonora"
        >
          <Music className="w-4 h-4" strokeWidth={1.5} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="absolute bottom-4 left-4 z-10 w-9 h-9 rounded-full bg-bg-elevated/85 backdrop-blur border border-border text-text-muted hover:text-gold hover:border-gold transition flex items-center justify-center shadow-lg"
          title={muted ? 'Ativar trilha sonora' : 'Mutar trilha sonora'}
          aria-label={muted ? 'Ativar trilha sonora' : 'Mutar trilha sonora'}
        >
          {muted ? <VolumeX className="w-4 h-4" strokeWidth={1.5} /> : <Volume2 className="w-4 h-4" strokeWidth={1.5} />}
        </button>
      )}
    </>
  )
}
