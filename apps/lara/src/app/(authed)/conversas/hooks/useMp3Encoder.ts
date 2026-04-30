/**
 * Encoder webm/opus (ou qualquer audio) → mp3 no client via lamejs.
 *
 * P-07 · WhatsApp Cloud API rejeita audio/webm · so aceita ogg/opus, mp3,
 * mp4, aac, amr. Chrome MediaRecorder so grava webm. Solucao: decodificar
 * webm com Web Audio API → samples PCM → encode mp3 com lamejs no browser.
 *
 * Tamanho: ~5-10KB por segundo de fala (mono 64kbps).
 * Latencia: ~200-400ms pra audio de 10-30s · imperceptivel.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import lamejs from '@breezystack/lamejs'

const TARGET_SAMPLE_RATE = 44100 // Meta WhatsApp recomenda 44.1kHz mono
const MP3_BITRATE = 64 // 64kbps mono · qualidade boa pra voz, arquivo pequeno

/**
 * Converte um File de audio (webm/ogg/qualquer formato decodificavel) em mp3.
 * Retorna novo File com extensao .mp3 e MIME audio/mpeg.
 */
export async function encodeFileToMp3(input: File): Promise<File> {
  // 1. Decode com Web Audio API · suporta webm/ogg/wav/mp3 nativamente
  const arrayBuffer = await input.arrayBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioCtx) {
    throw new Error('AudioContext nao suportado neste navegador')
  }
  const ctx: AudioContext = new AudioCtx()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    // Cleanup do contexto · libera recursos
    ctx.close().catch(() => {})
  }

  // 2. Resample pra TARGET_SAMPLE_RATE se necessario (lamejs aceita varias
  // sample rates mas 44.1kHz e o mais compativel) · e mixdown pra mono
  const numChannels = 1
  const samples = mixDownToMono(decoded)
  const resampled =
    decoded.sampleRate === TARGET_SAMPLE_RATE
      ? samples
      : resample(samples, decoded.sampleRate, TARGET_SAMPLE_RATE)

  // 3. Float32 → Int16 (lamejs precisa Int16)
  const int16 = floatTo16Bit(resampled)

  // 4. Encode com lamejs
  const encoder = new lamejs.Mp3Encoder(numChannels, TARGET_SAMPLE_RATE, MP3_BITRATE)
  const blockSize = 1152 // tamanho de frame MP3
  const mp3Chunks: Uint8Array[] = []

  for (let i = 0; i < int16.length; i += blockSize) {
    const chunk = int16.subarray(i, i + blockSize)
    const buf = encoder.encodeBuffer(chunk)
    if (buf && buf.length > 0) mp3Chunks.push(new Uint8Array(buf))
  }
  const tail = encoder.flush()
  if (tail && tail.length > 0) mp3Chunks.push(new Uint8Array(tail))

  // 5. Cria File mp3 · nome preserva o original mas troca extensao
  const totalLength = mp3Chunks.reduce((a, c) => a + c.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const c of mp3Chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  // Cast pra ArrayBuffer · TS reclama de SharedArrayBuffer mas Uint8Array
  // do Web Audio sempre da regular ArrayBuffer.
  const blob = new Blob([merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength) as ArrayBuffer], {
    type: 'audio/mpeg',
  })
  const baseName = input.name.replace(/\.[^.]+$/, '') || `voice-${Date.now()}`
  return new File([blob], `${baseName}.mp3`, { type: 'audio/mpeg' })
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const length = buffer.length
  const mono = new Float32Array(length)
  const channels: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c))
  }
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (let c = 0; c < channels.length; c++) sum += channels[c][i]
    mono[i] = sum / channels.length
  }
  return mono
}

function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const newLength = Math.round(samples.length / ratio)
  const out = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio
    const lo = Math.floor(srcIdx)
    const hi = Math.min(lo + 1, samples.length - 1)
    const t = srcIdx - lo
    out[i] = samples[lo] * (1 - t) + samples[hi] * t
  }
  return out
}

function floatTo16Bit(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
