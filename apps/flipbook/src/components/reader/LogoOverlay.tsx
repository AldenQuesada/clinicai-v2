'use client'

import { useState } from 'react'

export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface Props {
  url: string
  position?: LogoPosition
  /** Tamanho em px (lado maior). Default 80. */
  size?: number
  /** Link opcional · wrap em <a target="_blank">. */
  href?: string | null
  /** Esconde em fullscreen mode (modo apresentação). */
  hideInFullscreen?: boolean
  isFullscreen?: boolean
}

const POSITION_CLS: Record<LogoPosition, string> = {
  'top-left':     'top-4 left-4',
  'top-right':    'top-4 right-4',
  'bottom-left':  'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
}

/**
 * Overlay de logo no Reader · consume `settings.logo` do flipbook.
 * Plug:
 *   const logo = readLogo(book.settings)
 *   {logo?.url && <LogoOverlay url={logo.url} position={logo.position} ... />}
 */
export function LogoOverlay({ url, position = 'bottom-right', size = 80, href, hideInFullscreen = true, isFullscreen = false }: Props) {
  const [hover, setHover] = useState(false)

  if (hideInFullscreen && isFullscreen) return null

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="object-contain pointer-events-auto select-none transition-opacity duration-300"
      style={{
        maxWidth: size,
        maxHeight: size,
        opacity: hover ? 1 : 0.6,
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
      }}
      draggable={false}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    />
  )

  const wrapper = (
    <div
      className={`absolute z-10 pointer-events-none ${POSITION_CLS[position]}`}
      aria-hidden={!href}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener sponsored"
          className="block pointer-events-auto"
          title="Visitar site"
        >
          {img}
        </a>
      ) : img}
    </div>
  )

  return wrapper
}
