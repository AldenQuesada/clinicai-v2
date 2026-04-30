/**
 * useAudioRecorder · grava audio in-browser com MediaRecorder API.
 *
 * P-07 · botão mic com hold-to-record (estilo WhatsApp).
 *  - mousedown/touchstart → startRecording
 *  - mouseup/touchend → stopRecording → onComplete(file)
 *  - cancel se hold < 500ms (evita "tap acidental")
 *
 * Format priority: audio/ogg;codecs=opus (preferido WhatsApp) → audio/webm
 * → audio/mp4. Fallback automatico.
 */

import { useState, useRef, useCallback, useEffect } from 'react'

const MIN_DURATION_MS = 500

const MIME_PRIORITY = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
]

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of MIME_PRIORITY) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return null
}

function mimeToExtension(mime: string): string {
  if (mime.startsWith('audio/ogg')) return 'ogg'
  if (mime.startsWith('audio/webm')) return 'webm'
  if (mime.startsWith('audio/mp4')) return 'm4a'
  if (mime.startsWith('audio/mpeg')) return 'mp3'
  return 'bin'
}

export function useAudioRecorder(onComplete: (file: File) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startTimeRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelRef = useRef(false)

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    recorderRef.current = null
    chunksRef.current = []
    setIsRecording(false)
    setDuration(0)
  }, [])

  // Cleanup em unmount
  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop()
      } catch {}
      cleanup()
    }
  }, [cleanup])

  const start = useCallback(async () => {
    setError(null)
    cancelRef.current = false
    const mime = pickMimeType()
    if (!mime) {
      setError('Gravacao de audio nao suportada neste navegador')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const elapsed = Date.now() - startTimeRef.current
        const chunks = chunksRef.current
        const wasCancelled = cancelRef.current

        // Cleanup primeiro · libera mic
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        chunksRef.current = []
        recorderRef.current = null

        if (wasCancelled || elapsed < MIN_DURATION_MS || chunks.length === 0) {
          return
        }

        const blob = new Blob(chunks, { type: mime })
        const ext = mimeToExtension(mime)
        const filename = `voice-${Date.now()}.${ext}`
        const file = new File([blob], filename, { type: mime })
        onComplete(file)
      }

      recorder.start(250) // chunk a cada 250ms · permite cancel limpo
      startTimeRef.current = Date.now()
      setIsRecording(true)
      setDuration(0)

      tickRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 200)

      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'getUserMedia falhou')
      cleanup()
      return false
    }
  }, [cleanup, onComplete])

  const stop = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    setIsRecording(false)
    cancelRef.current = false
    try {
      recorderRef.current?.stop()
    } catch {}
  }, [])

  const cancel = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    cancelRef.current = true
    setIsRecording(false)
    setDuration(0)
    try {
      recorderRef.current?.stop()
    } catch {}
  }, [])

  return { isRecording, duration, error, start, stop, cancel }
}
