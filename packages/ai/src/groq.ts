/**
 * Groq SDK wrapper · whisper-large-v3 transcription pra Lara/Mira.
 * Mantém comportamento da Lara do Ivan (services/transcription.service.ts).
 */

import Groq from 'groq-sdk'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'shared' })

let _groq: Groq | null = null

export function getGroqClient(): Groq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY não configurada')
    _groq = new Groq({ apiKey })
  }
  return _groq
}

/**
 * Transcreve áudio (PT-BR) usando Groq Whisper-large-v3.
 * Retorna texto trim ou null se falhar (caller trata fallback).
 *
 * @param audioBuffer Buffer do arquivo (ogg/mp4/wav/webm)
 * @param contentType MIME type (ex: 'audio/ogg; codecs=opus')
 * @param filename nome para form-data (default 'audio.ogg')
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  contentType: string,
  filename = 'audio.ogg',
): Promise<string | null> {
  const start = Date.now()
  try {
    const groq = getGroqClient()
    const arrayBuffer: ArrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength,
    ) as ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: contentType })
    const file = new File([blob], filename, { type: contentType })

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'pt',
      response_format: 'text',
    })

    const text = (transcription as unknown as string).trim()
    const elapsed_ms = Date.now() - start

    if (!text) {
      log.warn({ filename, contentType, elapsed_ms }, 'Whisper transcricao vazia')
      return null
    }

    log.info(
      { filename, contentType, chars: text.length, elapsed_ms },
      'Transcricao concluida',
    )
    return text
  } catch (err) {
    log.error({ err, filename, contentType }, 'Erro ao transcrever audio')
    return null
  }
}
