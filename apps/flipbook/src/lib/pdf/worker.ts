'use client'

import { pdfjs } from 'react-pdf'

/**
 * Setup do pdfjs worker. Bundle local em /pdfjs/pdf.worker.min.mjs.
 * Sem dependência de CDN externo (resilient + funciona offline com SW).
 */
export function setupPdfWorker(): void {
  if (typeof window === 'undefined') return
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
}
