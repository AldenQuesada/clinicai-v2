import { UploadForm } from '../UploadForm'
import { BackButton } from '@/components/ui/BackButton'

export const dynamic = 'force-dynamic'

export default function NewFlipbookPage() {
  return (
    <div className="px-4 lg:px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <BackButton fallbackHref="/admin" label="Voltar" variant="chevron" />
      </div>

      <header className="mb-8">
        <div className="font-meta text-gold mb-2">Novo livro</div>
        <h1 className="font-display font-light text-3xl md:text-4xl text-text leading-tight">
          Subir <em className="italic text-gold-light">novo flipbook</em>
        </h1>
        <p className="text-text-muted text-sm mt-3">
          Aceita PDF · EPUB · CBZ · HTML. Até 100MB. Após upload, gere capa e preview pelo menu do livro na vitrine.
        </p>
      </header>

      <UploadForm />
    </div>
  )
}
