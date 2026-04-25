/**
 * Transcription Service — Groq Whisper
 *
 * Transcreve áudios recebidos via WhatsApp usando o modelo whisper-large-v3
 * da Groq, que é rápido, gratuito e suporta Português do Brasil nativamente.
 *
 * Retorna a transcrição em texto ou null se falhar.
 */

import Groq from 'groq-sdk';

let _groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env.local');
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

/**
 * Transcreve um buffer de áudio usando Groq Whisper.
 *
 * @param audioBuffer - Buffer do arquivo de áudio (ogg, mp4, wav, etc.)
 * @param contentType - MIME type do áudio (ex: audio/ogg; codecs=opus)
 * @param filename    - Nome de arquivo para o form-data (padrão: audio.ogg)
 * @returns Texto transcrito ou null em caso de falha
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  contentType: string,
  filename = 'audio.ogg'
): Promise<string | null> {
  try {
    const groq = getGroqClient();

    // O Groq SDK exige um objeto File/Blob com nome e tipo.
    // Buffer.slice() extrai um ArrayBuffer puro sem SharedArrayBuffer.
    const arrayBuffer: ArrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: contentType });
    const file = new File([blob], filename, { type: contentType });

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'pt',          // Força Português — melhora velocidade e precisão
      response_format: 'text', // Retorna string direta, sem JSON aninhado
    });

    // response_format: 'text' retorna string diretamente
    const text = (transcription as unknown as string).trim();

    if (!text) {
      console.warn('[Transcription] Whisper retornou transcrição vazia.');
      return null;
    }

    console.log(`🎙️ [Transcription] Transcrição concluída (${text.length} chars): "${text.substring(0, 80)}..."`);
    return text;
  } catch (err) {
    console.error('[Transcription] Erro ao transcrever áudio com Groq Whisper:', err);
    return null;
  }
}
