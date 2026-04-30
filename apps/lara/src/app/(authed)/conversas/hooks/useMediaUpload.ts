/**
 * useMediaUpload · gerencia upload de mídia + envio com caption.
 *
 * P-07 · upload de imagem/áudio/PDF inline pelo atendente humano.
 *
 * Fluxo:
 *   1. setStaged(file) · valida tamanho + MIME, cria preview (object URL)
 *   2. send(caption) · POST /upload → POST /messages com mediaPath
 *   3. clear() · descarta + revoke object URL
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export interface StagedMedia {
  file: File
  /** ObjectURL pra preview local (antes de upload) */
  previewUrl: string
  mediaType: 'image' | 'audio' | 'video' | 'document' | 'unsupported'
  mimeType: string
  fileName: string
  fileSize: number
}

export interface UseMediaUploadArgs {
  conversationId: string | null
  /** Refresh msgs depois do envio · vem do useMessages */
  onSent?: () => void
}

const MAX_IMAGE = 5 * 1024 * 1024
const MAX_AUDIO = 16 * 1024 * 1024
const MAX_VIDEO = 16 * 1024 * 1024
const MAX_DOC = 100 * 1024 * 1024

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_AUDIO = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm']
const ALLOWED_VIDEO = ['video/mp4', 'video/3gpp']
const ALLOWED_DOC = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

/** Strip params do MIME · 'audio/webm;codecs=opus' → 'audio/webm' */
function baseMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase()
}

function classifyClient(mime: string): { type: StagedMedia['mediaType']; max: number } {
  const base = baseMime(mime)
  if (ALLOWED_IMAGE.includes(base)) return { type: 'image', max: MAX_IMAGE }
  if (ALLOWED_AUDIO.includes(base)) return { type: 'audio', max: MAX_AUDIO }
  if (ALLOWED_VIDEO.includes(base)) return { type: 'video', max: MAX_VIDEO }
  if (ALLOWED_DOC.includes(base)) return { type: 'document', max: MAX_DOC }
  return { type: 'unsupported', max: 0 }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function useMediaUpload({ conversationId, onSent }: UseMediaUploadArgs) {
  const [staged, setStaged] = useState<StagedMedia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'sending'>('idle')
  const lastObjectUrlRef = useRef<string | null>(null)

  // Cleanup do object URL
  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) {
        URL.revokeObjectURL(lastObjectUrlRef.current)
      }
    }
  }, [])

  const stageFile = useCallback((file: File) => {
    setError(null)
    const cls = classifyClient(file.type || 'application/octet-stream')
    if (cls.type === 'unsupported') {
      setError(`Tipo nao suportado: ${file.type || 'desconhecido'}`)
      return false
    }
    if (file.size > cls.max) {
      const maxMB = Math.round(cls.max / (1024 * 1024))
      setError(`Arquivo muito grande · max ${maxMB}MB pra ${cls.type}`)
      return false
    }

    // Revoga URL anterior se trocou
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current)
    }
    const previewUrl = URL.createObjectURL(file)
    lastObjectUrlRef.current = previewUrl

    setStaged({
      file,
      previewUrl,
      mediaType: cls.type,
      mimeType: file.type,
      fileName: file.name || 'file',
      fileSize: file.size,
    })
    return true
  }, [])

  const clear = useCallback(() => {
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current)
      lastObjectUrlRef.current = null
    }
    setStaged(null)
    setError(null)
    setProgress('idle')
  }, [])

  const send = useCallback(
    async (caption?: string): Promise<boolean> => {
      if (!conversationId || !staged) return false
      if (staged.mediaType === 'unsupported') return false

      setIsSending(true)
      setError(null)
      setProgress('uploading')

      try {
        // 1. Upload pro Storage via /upload
        const formData = new FormData()
        formData.append('file', staged.file, staged.fileName)
        const upRes = await fetch(`/api/conversations/${conversationId}/upload`, {
          method: 'POST',
          body: formData,
        })
        const upData = await upRes.json().catch(() => ({}))
        if (!upRes.ok || !upData.ok) {
          setError(upData.error ?? `Upload falhou (HTTP ${upRes.status})`)
          setProgress('idle')
          return false
        }

        // 2. Send via /messages com mediaPath
        setProgress('sending')
        const sendRes = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: caption?.trim() ?? '',
            mediaPath: upData.path,
            mediaType: upData.mediaType,
            mimeType: upData.mimeType,
            fileName: upData.fileName,
          }),
        })
        const sendData = await sendRes.json().catch(() => ({}))
        if (!sendRes.ok || sendData.ok === false) {
          setError(sendData.whatsappError ?? sendData.error ?? `Envio falhou (HTTP ${sendRes.status})`)
          setProgress('idle')
          return false
        }

        // Sucesso · limpa staged + dispara refresh
        clear()
        onSent?.()
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'unknown')
        setProgress('idle')
        return false
      } finally {
        setIsSending(false)
      }
    },
    [conversationId, staged, clear, onSent],
  )

  return {
    staged,
    error,
    isSending,
    progress,
    stageFile,
    clear,
    send,
  }
}
