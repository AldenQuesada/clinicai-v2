'use client'

import { pdfjs } from 'react-pdf'

/**
 * Setup do pdfjs worker. Chamar uma vez no entry do client.
 * Carrega o worker via CDN matching versão exata pra evitar drift.
 */
export function setupPdfWorker(): void {
  if (typeof window === 'undefined') return
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
}
