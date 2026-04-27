'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

interface Props {
  coverUrl: string | null
  title: string
  subtitle: string | null
  author: string
  edition: string | null
  onDismiss: () => void
}

/**
 * Capa cinematográfica antes do flipbook abrir · efeito wow.
 * - Fade-in da capa + glow + parallax leve no hover
 * - Texto sobreposto com staggered reveal
 * - Skip click ou auto-dismiss em 4s
 */
export function CinematicCover({ coverUrl, title, subtitle, author, edition, onDismiss }: Props) {
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)

  useEffect(() => {
    const auto = setTimeout(onDismiss, 4500)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(auto); window.removeEventListener('keydown', onKey) }
  }, [onDismiss])

  function onMove(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    setMouseX((e.clientX - rect.left) / rect.width - 0.5)
    setMouseY((e.clientY - rect.top) / rect.height - 0.5)
  }

  return (
    <AnimatePresence>
      <motion.div
        key="cover"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.08 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-bg cursor-pointer"
        onClick={onDismiss}
        onMouseMove={onMove}
      >
        {/* Glow background */}
        <div
          className="absolute inset-0 opacity-40 blur-3xl"
          style={{
            background: coverUrl
              ? `radial-gradient(circle at ${50 + mouseX * 20}% ${50 + mouseY * 20}%, rgba(232, 177, 74, 0.3), transparent 60%)`
              : 'radial-gradient(circle, rgba(232, 177, 74, 0.2), transparent 60%)',
            transition: 'background 0.4s ease-out',
          }}
        />

        {/* Capa floating */}
        {coverUrl && (
          <motion.div
            initial={{ y: 40, opacity: 0, rotateY: -10 }}
            animate={{ y: 0, opacity: 1, rotateY: 0 }}
            transition={{ delay: 0.2, duration: 1, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative z-10"
            style={{
              transform: `perspective(1200px) rotateY(${mouseX * 8}deg) rotateX(${-mouseY * 5}deg) translateZ(0)`,
              transition: 'transform 0.3s ease-out',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt={title}
              className="max-h-[70vh] w-auto rounded shadow-[0_40px_120px_rgba(0,0,0,0.7),0_15px_40px_rgba(0,0,0,0.5)]"
            />
          </motion.div>
        )}

        {/* Title overlay */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center px-6 z-20"
        >
          {edition && (
            <div className="font-meta text-gold mb-3">{edition}</div>
          )}
          <h1 className="font-display italic text-text text-3xl md:text-5xl mb-2">{title}</h1>
          {subtitle && <p className="font-display italic text-text-muted text-base md:text-lg">{subtitle}</p>}
          <div className="mt-6 font-meta text-text-muted text-[9px]">{author}</div>
        </motion.div>

        {/* Skip hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="absolute top-4 right-6 font-meta text-text-dim text-[9px]"
        >
          clique pra entrar · ENTER
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
