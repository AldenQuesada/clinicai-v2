'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const STORAGE_KEY = 'flipbook_sound_enabled'

/**
 * Hook · som procedural de virar página com Web Audio API.
 * - Sample sintético (sweep curto + filtro low-pass) → "swoosh" de papel
 * - Toggle persistido em localStorage (default: off)
 * - Sem dependência de arquivo MP3
 */
export function useReadingSound() {
  const [enabled, setEnabled] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  function getCtx() {
    if (!ctxRef.current && typeof window !== 'undefined') {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctxRef.current = new Ctx()
    }
    return ctxRef.current
  }

  const play = useCallback(() => {
    if (!enabled) return
    const ctx = getCtx()
    if (!ctx) return

    const now = ctx.currentTime
    const dur = 0.18

    // Noise burst (papel)
    const bufferSize = Math.floor(ctx.sampleRate * dur)
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf

    // Filtro pra suavizar
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(2000, now)
    filter.frequency.exponentialRampToValueAtTime(800, now + dur)
    filter.Q.value = 1.2

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start(now)
    noise.stop(now + dur)
  }, [enabled])

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  return { enabled, toggle, play }
}
