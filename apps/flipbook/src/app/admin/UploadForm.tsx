'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { createBrowserClient } from '@/lib/supabase/browser'
import { extractPdfMetadata } from '@/lib/pdf/extractMetadata'

const SLUGIFY = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function UploadForm() {
  const router = useRouter()
  const supabase = createBrowserClient()

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [language, setLanguage] = useState<'pt' | 'en' | 'es'>('pt')
  const [edition, setEdition] = useState('')
  const [amazonAsin, setAmazonAsin] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Selecione um arquivo.'); return }
    if (!title) { setError('Título é obrigatório.'); return }

    setSubmitting(true); setError(null); setProgress(0)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const format = ['pdf', 'epub', 'mobi', 'cbz', 'html'].includes(ext) ? ext : 'pdf'
    const slug = SLUGIFY(title) + '-' + Date.now().toString(36)
    const path = `${slug}/${uuidv4()}.${ext}`

    // 1. Extrai page_count + capa client-side ANTES do upload (só PDF por ora)
    let pageCount: number | null = null
    let coverUrl: string | null = null
    if (format === 'pdf') {
      try {
        setProgress(10)
        const meta = await extractPdfMetadata(file, { coverWidth: 600 })
        pageCount = meta.pageCount
        setProgress(25)
        if (meta.coverBlob) {
          const coverPath = `${slug}/cover.jpg`
          const coverUp = await supabase.storage.from('flipbook-covers').upload(coverPath, meta.coverBlob, {
            cacheControl: '86400',
            contentType: 'image/jpeg',
            upsert: true,
          })
          if (!coverUp.error) {
            const { data } = supabase.storage.from('flipbook-covers').getPublicUrl(coverPath)
            coverUrl = data.publicUrl
          }
        }
        setProgress(40)
      } catch (e) {
        // best-effort: se extração falhar, continua sem page_count/cover (admin pode editar depois)
        console.warn('extractPdfMetadata falhou:', e)
      }
    }

    // 2. Upload do PDF principal
    const upRes = await supabase.storage.from('flipbook-pdfs').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/pdf',
    })
    if (upRes.error) {
      setError('Falha no upload: ' + upRes.error.message); setSubmitting(false); return
    }
    setProgress(85)

    // 3. Insert metadata no banco
    const insertRes = await supabase
      .from('flipbooks')
      .insert({
        slug,
        title,
        subtitle: subtitle || null,
        author: 'Dr. Alden Quesada',
        language,
        edition: edition || null,
        cover_url: coverUrl,
        pdf_url: path,
        format,
        page_count: pageCount,
        amazon_asin: amazonAsin || null,
        published_at: status === 'published' ? new Date().toISOString() : null,
        status,
        metadata: {},
      })
      .select('*')
      .single()

    if (insertRes.error) {
      setError('Falha ao registrar livro: ' + insertRes.error.message); setSubmitting(false); return
    }
    setProgress(100)
    setSubmitting(false)
    setTitle(''); setSubtitle(''); setEdition(''); setAmazonAsin(''); setFile(null)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="border border-border rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-bg-elevated">
      <div className="md:col-span-2">
        <label className="font-meta text-text-muted block mb-2">Título *</label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-bg-panel border border-border rounded px-4 py-2.5 text-text focus:border-gold/60 outline-none"
        />
      </div>

      <div className="md:col-span-2">
        <label className="font-meta text-text-muted block mb-2">Subtítulo</label>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          className="w-full bg-bg-panel border border-border rounded px-4 py-2.5 text-text focus:border-gold/60 outline-none"
        />
      </div>

      <div>
        <label className="font-meta text-text-muted block mb-2">Idioma</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'pt' | 'en' | 'es')}
          className="w-full bg-bg-panel border border-border rounded px-4 py-2.5 text-text outline-none"
        >
          <option value="pt">Português</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>

      <div>
        <label className="font-meta text-text-muted block mb-2">Edição</label>
        <input
          type="text"
          placeholder="ex: 2025 Amazon"
          value={edition}
          onChange={(e) => setEdition(e.target.value)}
          className="w-full bg-bg-panel border border-border rounded px-4 py-2.5 text-text outline-none"
        />
      </div>

      <div className="md:col-span-2">
        <label className="font-meta text-text-muted block mb-2">Amazon ASIN (opcional)</label>
        <input
          type="text"
          placeholder="B0XXXXXXXX"
          value={amazonAsin}
          onChange={(e) => setAmazonAsin(e.target.value)}
          className="w-full bg-bg-panel border border-border rounded px-4 py-2.5 text-text outline-none"
        />
      </div>

      <div className="md:col-span-2">
        <label className="font-meta text-text-muted block mb-2">Arquivo (PDF · EPUB · MOBI · CBZ · HTML)</label>
        <input
          type="file"
          accept=".pdf,.epub,.mobi,.azw3,.cbz,.html"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full bg-bg-panel border border-border rounded px-4 py-2.5 text-text outline-none file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gold/20 file:text-gold file:font-meta hover:file:bg-gold/30"
        />
        {file && <div className="text-xs text-text-dim mt-2">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
      </div>

      <div className="md:col-span-2 flex items-center gap-4">
        <label className="flex items-center gap-2 font-meta text-text-muted">
          <input
            type="radio"
            name="status"
            value="draft"
            checked={status === 'draft'}
            onChange={() => setStatus('draft')}
          />
          Rascunho
        </label>
        <label className="flex items-center gap-2 font-meta text-text-muted">
          <input
            type="radio"
            name="status"
            value="published"
            checked={status === 'published'}
            onChange={() => setStatus('published')}
          />
          Publicar
        </label>
      </div>

      {error && <div className="md:col-span-2 text-red-400 text-sm">{error}</div>}
      {progress > 0 && progress < 100 && (
        <div className="md:col-span-2 h-1 bg-bg-panel rounded overflow-hidden">
          <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-gold text-bg font-meta py-3 px-6 rounded hover:bg-gold-light transition disabled:opacity-50 flex items-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {submitting ? 'Enviando…' : 'Enviar livro'}
        </button>
      </div>
    </form>
  )
}
