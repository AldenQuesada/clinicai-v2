/**
 * ClinicAI — Cashflow Export UI
 * Compliance: CSV, PDF, DAS estimado
 */
;(function () {
  'use strict'
  if (window._clinicaiCashflowExportLoaded) return
  window._clinicaiCashflowExportLoaded = true

  // ── Utilidades ────────────────────────────────────────────

  function _escCsv(v) {
    if (v === null || v === undefined) return ''
    var s = String(v)
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  function _downloadFile(filename, content, mimeType) {
    var blob = new Blob(['\uFEFF' + content], { type: mimeType + ';charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(function() {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 200)
  }

  function _periodLabel(year, month) {
    var months = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    return months[month - 1] + ' / ' + year
  }

  // ── 1. Export CSV ─────────────────────────────────────────

  async function exportCsv(year, month) {
    var range = window.CashflowService.monthRange(year, month)
    var res = await window.CashflowService.listEntries({
      startDate: range.start,
      endDate:   range.end,
      limit:     5000,
    })
    if (!res || !res.ok) {
      _toastErr('Erro ao buscar dados pra exportar')
      return
    }
    var entries = res.data || []
    if (entries.length === 0) {
      _toastWarn('Nenhuma transacao no periodo selecionado.')
      return
    }

    var fmt = window.CashflowService.fmtCurrency
    var label = window.CashflowService.methodLabel

    var headers = [
      'Data','Tipo','Metodo','Valor','Descricao','Categoria','Paciente','Status','Origem','ID'
    ]
    var rows = entries.map(function(e) {
      return [
        e.transaction_date,
        e.direction === 'credit' ? 'Entrada' : 'Saida',
        label(e.payment_method),
        Number(e.amount || 0).toFixed(2).replace('.', ','),
        e.description || '',
        e.category || '',
        e.patient_name || '',
        e.match_confidence || 'none',
        e.source || '',
        e.id,
      ].map(_escCsv).join(',')
    })

    var csv = headers.join(',') + '\n' + rows.join('\n')
    var filename = 'fluxo-caixa-' + year + '-' + String(month).padStart(2, '0') + '.csv'
    _downloadFile(filename, csv, 'text/csv')
  }

  // ── 2. Export PDF (DRE + lancamentos via print) ───────────

  async function exportPdfMensal(year, month) {
    var range = window.CashflowService.monthRange(year, month)

    var [dreRes, listRes, dasRes] = await Promise.all([
      window.CashflowService.getDre(year, month),
      window.CashflowService.listEntries({
        startDate: range.start,
        endDate: range.end,
        limit: 5000,
      }),
      window.CashflowService.getDasEstimate(year, month),
    ])

    var dre = (dreRes && dreRes.ok && dreRes.data && dreRes.data.dre) || {}
    var entries = (listRes && listRes.ok) ? listRes.data : []
    var das = (dasRes && dasRes.ok) ? dasRes.data : null

    var fmt = window.CashflowService.fmtCurrency
    var fmtD = window.CashflowService.fmtDate
    var label = window.CashflowService.methodLabel
    var period = _periodLabel(year, month)

    var totalCred = 0, totalDeb = 0
    entries.forEach(function(e) {
      if (e.direction === 'credit') totalCred += Number(e.amount || 0)
      else totalDeb += Number(e.amount || 0)
    })

    var html = ''
      + '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'
      + '<title>Relatorio Mensal — ' + period + '</title>'
      + '<style>'
      + '* { box-sizing:border-box; font-family: -apple-system, "Segoe UI", Arial, sans-serif }'
      + 'body { margin:0; padding:30px; color:#111827; font-size:12px }'
      + 'h1 { font-size:20px; margin:0 0 4px; color:#111827 }'
      + 'h2 { font-size:14px; margin:24px 0 10px; padding-bottom:6px; border-bottom:2px solid #c9a96e; color:#111827 }'
      + '.subtitle { color:#6b7280; font-size:11px; margin-bottom:20px }'
      + '.dre-row { display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #e5e7eb }'
      + '.dre-row.total { background:#f9fafb; font-weight:700; border-top:2px solid #c9a96e; border-bottom:none }'
      + '.dre-label { color:#374151 }'
      + '.dre-value { font-weight:600 }'
      + '.dre-value.credit { color:#10b981 }'
      + '.dre-value.debit { color:#ef4444 }'
      + 'table { width:100%; border-collapse:collapse; font-size:10px; margin-top:8px }'
      + 'th { text-align:left; padding:6px 8px; background:#f9fafb; border-bottom:2px solid #e5e7eb; color:#6b7280; text-transform:uppercase; font-size:9px; font-weight:600 }'
      + 'td { padding:6px 8px; border-bottom:1px solid #f3f4f6 }'
      + '.right { text-align:right }'
      + '.credit { color:#10b981; font-weight:600 }'
      + '.debit { color:#ef4444; font-weight:600 }'
      + '.footer { margin-top:30px; padding-top:14px; border-top:1px solid #e5e7eb; font-size:10px; color:#9ca3af; text-align:center }'
      + '.kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:12px 0 }'
      + '.kpi { padding:12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb }'
      + '.kpi-label { font-size:9px; color:#9ca3af; text-transform:uppercase; font-weight:700 }'
      + '.kpi-value { font-size:16px; font-weight:700; margin-top:4px }'
      + '@media print {'
      + '  body { padding:18px }'
      + '  h2 { page-break-after:avoid }'
      + '  table { page-break-inside:auto }'
      + '  tr { page-break-inside:avoid }'
      + '  .no-print { display:none }'
      + '}'
      + '</style>'
      + '</head><body>'

      + '<h1>Relatorio Mensal de Fluxo de Caixa</h1>'
      + '<div class="subtitle"><strong>Periodo:</strong> ' + period + ' &nbsp;&nbsp; <strong>Gerado em:</strong> ' + new Date().toLocaleDateString('pt-BR') + ' as ' + new Date().toLocaleTimeString('pt-BR') + '</div>'

      // KPIs
      + '<div class="kpi-grid">'
      + '<div class="kpi"><div class="kpi-label">Receita Bruta</div><div class="kpi-value credit">' + fmt(totalCred) + '</div></div>'
      + '<div class="kpi"><div class="kpi-label">Despesas</div><div class="kpi-value debit">' + fmt(totalDeb) + '</div></div>'
      + '<div class="kpi"><div class="kpi-label">Saldo</div><div class="kpi-value">' + fmt(totalCred - totalDeb) + '</div></div>'
      + '<div class="kpi"><div class="kpi-label">Movimentos</div><div class="kpi-value">' + entries.length + '</div></div>'
      + '</div>'

      // DRE
      + '<h2>Demonstrativo de Resultado (DRE)</h2>'
      + '<div class="dre-row"><span class="dre-label">Receita Bruta</span><span class="dre-value credit">' + fmt(dre.bruto || totalCred) + '</span></div>'
      + '<div class="dre-row"><span class="dre-label">(−) Taxas (cartao + boleto)</span><span class="dre-value debit">' + fmt(dre.taxa || 0) + '</span></div>'
      + '<div class="dre-row"><span class="dre-label">(−) Custos de procedimentos</span><span class="dre-value debit">' + fmt(dre.custo || 0) + '</span></div>'
      + '<div class="dre-row"><span class="dre-label">(−) Comissoes de especialistas</span><span class="dre-value debit">' + fmt(dre.comissao || 0) + '</span></div>'
      + '<div class="dre-row"><span class="dre-label">(−) Despesas operacionais</span><span class="dre-value debit">' + fmt(dre.despesas || totalDeb) + '</span></div>'
      + '<div class="dre-row total"><span class="dre-label">= Lucro Liquido</span><span class="dre-value">' + fmt(dre.liquido !== undefined ? dre.liquido : (totalCred - totalDeb)) + '</span></div>'
      + '<div style="text-align:right;font-size:10px;color:#6b7280;margin-top:6px">Margem: ' + (dre.margem_pct !== undefined ? dre.margem_pct : (totalCred > 0 ? Math.round(((totalCred - totalDeb) / totalCred) * 100) : 0)) + '%</div>'

    // Bloco DAS
    if (das && das.faixa) {
      html += ''
      + '<h2>Estimativa Simples Nacional (Anexo III)</h2>'
      + '<div class="dre-row"><span class="dre-label">Receita do mes</span><span class="dre-value">' + fmt(das.mes_atual.receita) + '</span></div>'
      + '<div class="dre-row"><span class="dre-label">RBT12 (ultimos 12 meses)</span><span class="dre-value">' + fmt(das.rbt12.value) + '</span></div>'
      + '<div class="dre-row"><span class="dre-label">Faixa</span><span class="dre-value">' + das.faixa.nome + '</span></div>'
      + '<div class="dre-row"><span class="dre-label">Aliquota efetiva</span><span class="dre-value">' + das.faixa.aliquota_efetiva + '%</span></div>'
      + '<div class="dre-row total"><span class="dre-label">DAS estimado</span><span class="dre-value">' + fmt(das.mes_atual.das_estimado) + '</span></div>'
      + '<div style="font-size:10px;color:#9ca3af;margin-top:8px;font-style:italic">' + das.aviso + '</div>'
    }

    // Tabela completa
    html += '<h2>Lancamentos (' + entries.length + ' transacoes)</h2>'
      + '<table>'
      + '<thead><tr>'
      + '<th>Data</th><th>Tipo</th><th>Metodo</th><th>Descricao</th><th>Paciente</th><th class="right">Valor</th>'
      + '</tr></thead><tbody>'

    entries.forEach(function(e) {
      var sign = e.direction === 'credit' ? '+' : '−'
      var cls = e.direction === 'credit' ? 'credit' : 'debit'
      html += '<tr>'
        + '<td>' + fmtD(e.transaction_date) + '</td>'
        + '<td>' + (e.direction === 'credit' ? 'Entrada' : 'Saida') + '</td>'
        + '<td>' + label(e.payment_method) + '</td>'
        + '<td>' + (e.description || '—') + '</td>'
        + '<td>' + (e.patient_name || '—') + '</td>'
        + '<td class="right ' + cls + '">' + sign + ' ' + fmt(e.amount) + '</td>'
        + '</tr>'
    })

    html += '</tbody></table>'
      + '<div class="footer">ClinicAI Dashboard — Fluxo de Caixa | Relatorio gerado para uso contabil interno</div>'
      + '<div class="no-print" style="text-align:center;margin-top:20px">'
      + '<button onclick="window.print()" style="background:#10b981;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Imprimir / Salvar como PDF</button>'
      + '</div>'
      + '</body></html>'

    var w = window.open('', '_blank', 'width=900,height=700')
    if (!w) {
      _toastWarn('Permita pop-ups para exportar PDF')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  // ── 3. Modal DAS estimado ─────────────────────────────────

  async function showDasModal(year, month) {
    var existing = document.getElementById('cfDasModal')
    if (existing) existing.remove()

    var res = await window.CashflowService.getDasEstimate(year, month)
    if (!res || !res.ok) { _toastErr('Erro ao calcular DAS'); return }
    var d = res.data || {}
    var fmt = window.CashflowService.fmtCurrency

    var html = ''
      + '<div id="cfDasModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:540px;max-height:90vh;overflow:auto;box-shadow:0 25px 50px rgba(0,0,0,.25)">'
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">DAS Estimado — Simples Nacional</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Anexo III (Servicos / Profissionais Liberais)</p>'
            + '</div>'
            + '<button onclick="document.getElementById(\'cfDasModal\').remove()" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px;font-size:20px">×</button>'
          + '</div>'

          + '<div style="padding:24px">'

            // Big number
            + '<div style="text-align:center;padding:24px;background:linear-gradient(135deg,#f0fdf4 0%,#fff 100%);border-radius:12px;border:1px solid #bbf7d0;margin-bottom:18px">'
              + '<div style="font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">DAS estimado do mes</div>'
              + '<div style="font-size:36px;font-weight:800;color:#10b981">' + fmt(d.mes_atual ? d.mes_atual.das_estimado : 0) + '</div>'
              + '<div style="font-size:12px;color:#6b7280;margin-top:4px">Sobre receita de ' + fmt(d.mes_atual ? d.mes_atual.receita : 0) + '</div>'
            + '</div>'

            // Detalhes
            + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:14px">'
              + '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Calculo</div>'
              + _dasRow('RBT12 (ultimos 12 meses)', fmt(d.rbt12 ? d.rbt12.value : 0))
              + _dasRow('Faixa', d.faixa ? d.faixa.nome : '—')
              + _dasRow('Aliquota nominal', (d.faixa ? d.faixa.aliquota_nominal : 0) + '%')
              + _dasRow('Parcela a deduzir', fmt(d.faixa ? d.faixa.deducao : 0))
              + _dasRow('Aliquota efetiva', (d.faixa ? d.faixa.aliquota_efetiva : 0) + '%', true)
            + '</div>'

            // Distancia proxima faixa
            + (d.faixa && d.faixa.distancia_proxima > 0
              ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#92400e">'
                + '<strong>Faltam ' + fmt(d.faixa.distancia_proxima) + '</strong> de receita anual pra subir de faixa'
                + '</div>'
              : '')

            // Aviso
            + '<div style="font-size:11px;color:#9ca3af;font-style:italic;line-height:1.5">' + (d.aviso || '') + '</div>'

          + '</div>'
        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)
  }

  function _dasRow(label, value, highlight) {
    return ''
      + '<div style="display:flex;justify-content:space-between;padding:6px 0;' + (highlight ? 'border-top:1px solid #e5e7eb;margin-top:6px;padding-top:10px' : '') + '">'
        + '<span style="font-size:12px;color:#6b7280">' + label + '</span>'
        + '<span style="font-size:13px;font-weight:' + (highlight ? '700' : '600') + ';color:#111827">' + value + '</span>'
      + '</div>'
  }

  // ── Expose ────────────────────────────────────────────────

  window.CashflowExportUI = Object.freeze({
    exportCsv:       exportCsv,
    exportPdfMensal: exportPdfMensal,
    showDasModal:    showDasModal,
  })
})()
