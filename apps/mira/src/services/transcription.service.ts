/**
 * Transcription · Groq Whisper-large-v3 (1:1 com apps/lara/services).
 *
 * Mira recebe muitos audios (parceiras mandam por WhatsApp). Whisper-pt natural.
 * Retorna texto trimado ou null se falhar.
 */

import Groq from 'groq-sdk'

let _groq: Groq | null = null

function getGroqClient(): Groq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY nao configurada')
    _groq = new Groq({ apiKey })
  }
  return _groq
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  contentType: string,
  filename = 'audio.ogg',
): Promise<string | null> {
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
    if (!text) return null
    return text
  } catch (err) {
    console.error('[Mira/Transcription] Whisper failed:', err)
    return null
  }
}
