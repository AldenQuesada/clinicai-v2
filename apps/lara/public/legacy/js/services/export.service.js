/**
 * ClinicAI — Export Service
 *
 * Exporta dados para PDF, Excel (xlsx) e CSV.
 * As bibliotecas são carregadas sob demanda (lazy) — sem impacto no boot.
 *
 * Depende de (CDN, carregados lazy):
 *   jsPDF         — https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
 *   jsPDF-AutoTable — https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js
 *   SheetJS (xlsx)  — https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
 *
 * API pública (window.ExportService):
 *   pdf(config)    — gera e baixa um PDF formatado
 *   excel(config)  — gera e baixa um arquivo .xlsx
 *   csv(config)    — gera e baixa um arquivo .csv (sem dependência externa)
 *
 * Config:
 *   {
 *     title:        string             — título do relatório
 *     subtitle?:    string             — subtítulo (ex: período)
 *     columns:      ExportColumn[]     — definição das colunas
 *     data:         object[]           — linhas de dados
 *     filename?:    string             — nome do arquivo sem extensão
 *     orientation?: 'portrait'|'landscape'
 *   }
 *
 * ExportColumn:
 *   {
 *     key:      string                — chave no objeto de dados
 *     label:    string                — cabeçalho da coluna
 *     width?:   number                — largura relativa (PDF autoTable)
 *     format?:  (value, row) => string — formatação custom do valor
 *   }
 */

;(function () {
  'use strict'

  if (window._clinicaiExportServiceLoaded) return
  window._clinicaiExportServiceLoaded = true

  // ── CDN URLs ─────────────────────────────────────────────────────────────
  const CDN = {
    jspdf:      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable:  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    xlsx:       'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  }

  // ── Cache de scripts carregados ───────────────────────────────────────────
  const _loaded = {}

  /**
   * Carrega um script externo via CDN, com cache para não carregar duas vezes.
   * @param {string} key  — chave em CDN
   * @returns {Promise<void>}
   */
  function _loadScript(key) {
    if (_loaded[key]) return Promise.resolve()

    return new Promise((resolve, reject) => {
      // Verifica se já existe no DOM (carregado por outro módulo)
      if (document.querySelector(`script[data-export-lib="${key}"]`)) {
        _loaded[key] = true
        return resolve()
      }
      const s = document.createElement('script')
      s.src               = CDN[key]
      s.dataset.exportLib = key
      s.onload  = () => { _loaded[key] = true; resolve() }
      s.onerror = () => reject(new Error(`Falha ao carregar biblioteca: ${key}`))
      document.head.appendChild(s)
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Nome do arquivo sem extensão, com fallback por data */
  function _filename(config) {
    if (config.filename) return config.filename
    const date = new Date().toISOString().slice(0, 10)
    return (config.title || 'relatorio').toLowerCase().replace(/\s+/g, '-') + '-' + date
  }

  /** Formata o valor de uma célula usando o formatter da coluna ou toString */
  function _cellValue(col, row) {
    const raw = row[col.key]
    if (typeof col.format === 'function') return col.format(raw, row)
    if (raw === null || raw === undefined) return ''
    return String(raw)
  }

  /** Data/hora formatada em pt-BR */
  function _nowFormatted() {
    return new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  /** Nome da clínica (do sessionStorage) para o rodapé */
  function _clinicName() {
    try {
      const p = JSON.parse(sessionStorage.getItem('clinicai_profile') || '{}')
      return p.clinic_name || 'ClinicAI'
    } catch { return 'ClinicAI' }
  }

  // ── PDF ───────────────────────────────────────────────────────────────────

  /**
   * Gera e baixa um arquivo PDF.
   * @param {object} config
   * @returns {Promise<void>}
   */
  async function pdf(config) {
    if (!config?.columns?.length || !config?.data) {
      throw new Error('config.columns e config.data são obrigatórios')
    }

    await Promise.all([_loadScript('jspdf'), _loadScript('autotable')])

    const { jsPDF } = window.jspdf
    const orientation = config.orientation || 'portrait'
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })

    const pageW     = doc.internal.pageSize.getWidth()
    const marginX   = 14
    const contentW  = pageW - marginX * 2
    const accentR   = 124, accentG = 58, accentB = 237  // #7C3AED

    // ── Cabeçalho ──────────────────────────────────────────────────────────
    // Barra roxa no topo
    doc.setFillColor(accentR, accentG, accentB)
    doc.rect(0, 0, pageW, 18, 'F')

    // Nome da clínica (branco, canto esquerdo)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(_clinicName(), marginX, 12)

    // Data de geração (branco, canto direito)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Gerado em ' + _nowFormatted(), pageW - marginX, 12, { align: 'right' })

    // Título do relatório
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(config.title || 'Relatório', marginX, 30)

    let cursorY = 36

    // Subtítulo opcional
    if (config.subtitle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(107, 114, 128)
      doc.text(config.subtitle, marginX, cursorY)
      cursorY += 6
    }

    // Linha divisória
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.3)
    doc.line(marginX, cursorY + 1, pageW - marginX, cursorY + 1)
    cursorY += 6

    // ── Tabela ─────────────────────────────────────────────────────────────
    const head = [config.columns.map(c => c.label)]
    const body = config.data.map(row => config.columns.map(col => _cellValue(col, row)))

    // Calcula larguras relativas das colunas
    const totalW = config.columns.reduce((s, c) => s + (c.width || 1), 0)
    const colWidths = config.columns.map(c => ((c.width || 1) / totalW) * contentW)

    doc.autoTable({
      head,
      body,
      startY:   cursorY,
      margin:   { left: marginX, right: marginX },
      columnStyles: Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w }])),
      headStyles: {
        fillColor:  [accentR, accentG, accentB],
        textColor:  [255, 255, 255],
        fontStyle:  'bold',
        fontSize:   9,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize:    9,
        cellPadding: 3,
        textColor:   [55, 65, 81],
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      tableLineColor: [229, 231, 235],
      tableLineWidth: 0.1,
      didDrawPage: (data) => {
        // ── Rodapé em cada página ────────────────────────────────────────
        const pageH = doc.internal.pageSize.getHeight()
        const total = doc.internal.getNumberOfPages()
        const curr  = data.pageNumber

        doc.setFontSize(8)
        doc.setTextColor(156, 163, 175)
        doc.setFont('helvetica', 'normal')
        doc.text(_clinicName(), marginX, pageH - 6)
        doc.text(`Página ${curr} de ${total}`, pageW - marginX, pageH - 6, { align: 'right' })
        doc.setDrawColor(229, 231, 235)
        doc.setLineWidth(0.2)
        doc.line(marginX, pageH - 10, pageW - marginX, pageH - 10)
      },
    })

    doc.save(_filename(config) + '.pdf')
  }

  // ── Excel ─────────────────────────────────────────────────────────────────

  /**
   * Gera e baixa um arquivo .xlsx.
   * @param {object} config
   * @returns {Promise<void>}
   */
  async function excel(config) {
    if (!config?.columns?.length || !config?.data) {
      throw new Error('config.columns e config.data são obrigatórios')
    }

    await _loadScript('xlsx')
    const XLSX = window.XLSX

    const wb = XLSX.utils.book_new()

    // ── Monta as linhas ────────────────────────────────────────────────────
    const rows = []

    // Linha de título (célula A1 com título do relatório)
    rows.push([config.title || 'Relatório'])

    // Subtítulo
    if (config.subtitle) rows.push([config.subtitle])

    // Linha de geração
    rows.push(['Gerado em: ' + _nowFormatted()])
    rows.push([])  // linha em branco

    // Cabeçalho das colunas
    rows.push(config.columns.map(c => c.label))

    // Dados
    config.data.forEach(row => {
      rows.push(config.columns.map(col => {
        const raw = row[col.key]
        if (typeof col.format === 'function') return col.format(raw, row)
        return raw ?? ''
      }))
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)

    // ── Larguras de coluna automáticas ─────────────────────────────────────
    const headerRowIdx = config.subtitle ? 4 : 3
    const colWidths = config.columns.map(col => {
      const maxLen = Math.max(
        col.label.length,
        ...config.data.map(row => String(_cellValue(col, row)).length)
      )
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) }
    })
    ws['!cols'] = colWidths

    // ── Merge da célula de título ──────────────────────────────────────────
    if (config.columns.length > 1) {
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: config.columns.length - 1 } },
      ]
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
    XLSX.writeFile(wb, _filename(config) + '.xlsx')
  }

  // ── CSV ───────────────────────────────────────────────────────────────────

  /**
   * Gera e baixa um arquivo .csv (sem dependências externas).
   * @param {object} config
   */
  function csv(config) {
    if (!config?.columns?.length || !config?.data) {
      throw new Error('config.columns e config.data são obrigatórios')
    }

    function _quote(val) {
      const s = String(val ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"'
        : s
    }

    const lines = []

    // Cabeçalho
    lines.push(config.columns.map(c => _quote(c.label)).join(','))

    // Dados
    config.data.forEach(row => {
      lines.push(config.columns.map(col => _quote(_cellValue(col, row))).join(','))
    })

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = _filename(config) + '.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ── Exposição global ──────────────────────────────────────────────────────
  window.ExportService = Object.freeze({ pdf, excel, csv })

})()
