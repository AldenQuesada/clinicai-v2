'use client'

import { useEffect, useRef } from 'react'

interface PageProxy {
  getOperatorList: () => Promise<unknown>
}

interface DocProxy {
  numPages: number
  getPage: (n: number) => Promise<PageProxy>
}

/**
 * Pre-fetch páginas adjacentes do PDF · aquece o parser/worker do pdfjs em
 * background pra que o flip pra próxima página seja instantâneo.
 *
 * Reutiliza o mesmo `PDFDocumentProxy` do `<Document>` do react-pdf — sem
 * duplicar download nem re-parse. Ao mudar `currentPage`, dispara
 * `getOperatorList()` em paralelo nas páginas dentro da janela.
 *
 * Custo: N tasks de parsing async no worker (já existente).
 * Ganho: virada de página percebida instantânea (parsing já feito).
 */
export function usePdfPrefetch(doc: DocProxy | null, currentPage: number, windowAhead = 3, windowBehind = 2): void {
  const warmed = useRef<Set<number>>(new Set())

  // Reset cache quando doc muda (novo PDF)
  useEffect(() => {
    warmed.current = new Set()
  }, [doc])

  useEffect(() => {
    if (!doc) return

    const targets: number[] = []
    for (let i = 1; i <= windowAhead; i++) {
      const next = currentPage + i
      if (next >= 1 && next <= doc.numPages && !warmed.current.has(next)) targets.push(next)
    }
    for (let i = 1; i <= windowBehind; i++) {
      const prev = currentPage - i
      if (prev >= 1 && prev <= doc.numPages && !warmed.current.has(prev)) targets.push(prev)
    }

    for (const n of targets) {
      warmed.current.add(n)
      doc.getPage(n)
        .then((page) => page.getOperatorList())
        .catch(() => { warmed.current.delete(n) })
    }
  }, [doc, currentPage, windowAhead, windowBehind])
}
