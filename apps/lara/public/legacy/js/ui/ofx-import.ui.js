/**
 * ClinicAI — OFX Import UI
 * Modal para importar extrato bancario OFX (Sicredi e outros)
 *
 * Fluxo:
 *   1. User seleciona arquivo .ofx
 *   2. JS parseia (regex puro, sem dependencias)
 *   3. Preview com tabela das transacoes
 *   4. User confirma → bulk insert via cashflow_create_entry
 *   5. Dedupe automatico via external_id = FITID do OFX
 */
;(function () {
  'use strict'
  if (window._clinicaiOfxImportLoaded) return
  window._clinicaiOfxImportLoaded = true

  var _state = {
    transactions: [],
    fileName:     '',
    fileSize:     0,
    fileHash:     '',
    fingerprint:  '',
    importing:    false,
    progress:     0,
  }

  // ── Hash SHA-256 do conteudo normalizado (camada 1) ─────
  // Normaliza tags volateis (DTSERVER, TRNUID, DTSTART, DTEND) pra que
  // 2 exports do mesmo periodo gerem o mesmo hash, mesmo com horario
  // de geracao diferente.
  function _normalizeOfxContent(text) {
    return String(text || '')
      .replace(/<DTSERVER>[^<\n\r]*/gi, '<DTSERVER>')
      .replace(/<TRNUID>[^<\n\r]*/gi, '<TRNUID>')
      .replace(/<DTSTART>[^<\n\r]*/gi, '<DTSTART>')
      .replace(/<DTEND>[^<\n\r]*/gi, '<DTEND>')
      .replace(/<SEVERITY>[^<\n\r]*/gi, '<SEVERITY>')
      .replace(/\r\n/g, '\n')
      .trim()
  }
  async function _sha256(text) {
    var normalized = _normalizeOfxContent(text)
    var buf = new TextEncoder().encode(normalized)
    var hashBuf = await crypto.subtle.digest('SHA-256', buf)
    var bytes = new Uint8Array(hashBuf)
    var hex = ''
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0')
    }
    return hex
  }

  // ── Signature transacao (camada 3): data | valor | descricao normalizada ──
  function _normalizeDesc(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  function _buildSignature(tx) {
    var amt = Number(tx.amount).toFixed(2)
    return tx.transaction_date + '|' + tx.direction + '|' + amt + '|' + _normalizeDesc(tx.description)
  }

  // ── OFX Parser ────────────────────────────────────────────

  /**
   * Parseia conteudo OFX e retorna array de transacoes normalizadas.
   * Suporta OFX 1.x (SGML) e 2.x (XML).
   *
   * @param {string} content — conteudo bruto do arquivo .ofx
   * @returns {Array<{fitid, date, amount, type, memo, name, payment_method, direction}>}
   */
  function parseOFX(content) {
    var transactions = []

    // Normaliza quebras de linha e remove BOM
    content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

    // Encontra todos os blocos STMTTRN
    var stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
    var match
    while ((match = stmtRegex.exec(content)) !== null) {
      var block = match[1]
      var tx = {
        fitid:  _extractTag(block, 'FITID'),
        type:   _extractTag(block, 'TRNTYPE'),
        date:   _extractTag(block, 'DTPOSTED'),
        amount: _extractTag(block, 'TRNAMT'),
        name:   _extractTag(block, 'NAME'),
        memo:   _extractTag(block, 'MEMO'),
        checknum: _extractTag(block, 'CHECKNUM'),
      }
      if (tx.fitid && tx.amount && tx.date) {
        transactions.push(_normalize(tx))
      }
    }

    return transactions
  }

  function _extractTag(block, tag) {
    // OFX 1.x SGML: <TAG>value (sem fechamento) ou com \n
    // OFX 2.x XML: <TAG>value</TAG>
    var rxXml = new RegExp('<' + tag + '>([^<]*)</' + tag + '>', 'i')
    var rxSgml = new RegExp('<' + tag + '>([^<\\n\\r]*)', 'i')
    var m = block.match(rxXml) || block.match(rxSgml)
    return m ? m[1].trim() : null
  }

  function _normalize(tx) {
    // Date YYYYMMDDHHMMSS → YYYY-MM-DD
    var dateStr = tx.date.substring(0, 8)
    var isoDate = dateStr.substring(0, 4) + '-' + dateStr.substring(4, 6) + '-' + dateStr.substring(6, 8)

    var amount    = parseFloat(tx.amount)
    var direction = amount >= 0 ? 'credit' : 'debit'
    var amountAbs = Math.abs(amount)

    var description = (tx.memo || tx.name || '').trim()
    var paymentMethod = _classifyMethod(tx.type, description)

    return {
      fitid:          tx.fitid,
      transaction_date: isoDate,
      amount:         amountAbs,
      direction:      direction,
      payment_method: paymentMethod,
      description:    description || ('Transacao ' + tx.fitid.substring(0, 8)),
      raw_type:       tx.type,
    }
  }

  /**
   * Classifica o metodo de pagamento baseado em TRNTYPE + MEMO.
   * Heuristicas pro padrao Sicredi (e bancos brasileiros em geral).
   */
  function _classifyMethod(trntype, memo) {
    var m = (memo || '').toUpperCase()
    var t = (trntype || '').toUpperCase()

    if (/\bPIX\b/.test(m)) return 'pix'
    if (/\bTED\b|TRANSF/.test(m)) return 'transfer'
    if (/\bDOC\b/.test(m)) return 'transfer'
    if (/BOLETO/.test(m)) return 'boleto'
    if (/CIELO|REDE|GETNET|STONE|PAGSEGURO|MERCADO PAGO|MERCPAGO/.test(m)) {
      if (/DEB/.test(m)) return 'card_debit'
      return 'card_credit'
    }
    if (/CRED.*CART|CART.*CRED/.test(m)) return 'card_credit'
    if (/DEB.*CART|CART.*DEB/.test(m)) return 'card_debit'
    if (/TARIFA|TAR\.|MENSALIDADE|ANUIDADE/.test(m)) return 'fee'
    if (/SAQUE|RETIRADA/.test(m)) return 'cash'
    if (/DEPOSITO|DEP\./.test(m)) return 'cash'
    if (/IOF|IRPF|IMPOSTO/.test(m)) return 'fee'
    if (/ESTORNO|REVERSAO/.test(m)) return 'chargeback'

    if (t === 'CREDIT') return 'transfer'
    if (t === 'DEBIT')  return 'other'
    if (t === 'INT')    return 'other'
    if (t === 'FEE')    return 'fee'
    return 'other'
  }

  // ── UI: Modal ─────────────────────────────────────────────

  function open() {
    _state.transactions = []
    _state.fileName = ''
    _state.importing = false

    var existing = document.getElementById('ofxModalBackdrop')
    if (existing) existing.remove()

    var html = ''
      + '<div id="ofxModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:900px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,.25);overflow:hidden">'

          // Header
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Importar Extrato OFX</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Sicredi e outros bancos. Idempotente — pode importar o mesmo arquivo varias vezes sem duplicar.</p>'
            + '</div>'
            + '<button id="ofxClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px">' + _icon('x', 20) + '</button>'
          + '</div>'

          // Body
          + '<div id="ofxBody" style="padding:24px;overflow:auto;flex:1"></div>'

          // Footer
          + '<div id="ofxFooter" style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:space-between;align-items:center">'
            + '<div id="ofxStatus" style="font-size:12px;color:#6b7280"></div>'
            + '<div style="display:flex;gap:8px">'
              + '<button id="ofxCancel" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>'
              + '<button id="ofxConfirm" disabled style="background:#e5e7eb;color:#9ca3af;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:not-allowed">Importar</button>'
            + '</div>'
          + '</div>'

        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    document.getElementById('ofxClose').addEventListener('click', close)
    document.getElementById('ofxCancel').addEventListener('click', close)
    document.getElementById('ofxModalBackdrop').addEventListener('click', function(e) {
      if (e.target.id === 'ofxModalBackdrop') close()
    })
    document.getElementById('ofxConfirm').addEventListener('click', _doImport)

    _renderUploadStep()
  }

  function close() {
    var b = document.getElementById('ofxModalBackdrop')
    if (b) b.remove()
  }

  // ── Step 1: Upload ────────────────────────────────────────

  function _renderUploadStep() {
    var body = document.getElementById('ofxBody')
    if (!body) return

    body.innerHTML = ''
      + '<div style="border:2px dashed #d1d5db;border-radius:12px;padding:48px 24px;text-align:center;background:#f9fafb">'
        + '<div style="color:#9ca3af;margin-bottom:12px">' + _icon('upload-cloud', 48) + '</div>'
        + '<div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px">Selecione o arquivo .ofx</div>'
        + '<div style="font-size:12px;color:#6b7280;margin-bottom:18px">Exporte o extrato no Internet Banking Sicredi → formato OFX</div>'
        + '<input type="file" id="ofxFileInput" accept=".ofx,.OFX" style="display:none">'
        + '<button id="ofxFilePick" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Escolher arquivo</button>'
      + '</div>'

      + '<div style="margin-top:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px">'
        + '<div style="font-size:12px;font-weight:600;color:#065f46;margin-bottom:6px">Como exportar do Sicredi</div>'
        + '<ol style="margin:0;padding-left:18px;font-size:12px;color:#065f46;line-height:1.7">'
          + '<li>Acesse o Internet Banking PJ Sicredi</li>'
          + '<li>Va em <strong>Conta Corrente → Extrato</strong></li>'
          + '<li>Selecione o periodo desejado</li>'
          + '<li>Clique em <strong>Exportar → OFX</strong> (Money/Quicken)</li>'
          + '<li>Salve o arquivo .ofx e arraste aqui</li>'
        + '</ol>'
      + '</div>'

    document.getElementById('ofxFilePick').addEventListener('click', function() {
      document.getElementById('ofxFileInput').click()
    })
    document.getElementById('ofxFileInput').addEventListener('change', _onFileSelected)
  }

  // Constroi fingerprint semantica: qtd|first_date|last_date|total_credits|total_debits
  // Invariante a DTSERVER/TRNUID/re-exports — usa so o que o usuario ve no preview.
  function _buildFingerprint(txs) {
    var totalCred = 0, totalDeb = 0, minD = null, maxD = null
    txs.forEach(function(t) {
      if (t.direction === 'credit') totalCred += t.amount
      else totalDeb += t.amount
      if (!minD || t.transaction_date < minD) minD = t.transaction_date
      if (!maxD || t.transaction_date > maxD) maxD = t.transaction_date
    })
    return txs.length + '|' + minD + '|' + maxD + '|' +
           totalCred.toFixed(2) + '|' + totalDeb.toFixed(2)
  }

  function _onFileSelected(e) {
    var file = e.target.files[0]
    if (!file) return

    _state.fileName = file.name
    _state.fileSize = file.size
    var reader = new FileReader()
    reader.onload = async function(ev) {
      try {
        var content = ev.target.result

        // Parse primeiro — precisa dos dados pra fingerprint
        var txs = parseOFX(content)
        if (txs.length === 0) {
          _toastWarn('Nenhuma transacao encontrada no arquivo. Verifique se e um OFX valido.')
          return
        }
        _state.transactions = txs
        _state.fingerprint = _buildFingerprint(txs)
        _state.fileHash = await _sha256(content) // mantem pra audit/backup

        // CAMADA 1: fingerprint semantica (qtd+period+totals)
        var sb = window._sbShared
        if (sb) {
          var chk = await sb.rpc('ofx_check_fingerprint', { p_fingerprint: _state.fingerprint })
          if (chk && chk.data && chk.data.duplicated) {
            _renderAlreadyImportedStep(chk.data)
            return
          }
        }

        _renderPreviewStep()
      } catch (err) {
        console.error('[OfxImport] erro ao parsear:', err)
        _toastErr('Erro ao parsear OFX: ' + err.message)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Step: Arquivo ja importado (camada 1 bloqueou) ───────
  function _renderAlreadyImportedStep(info) {
    var body = document.getElementById('ofxBody')
    if (!body) return
    var when = info.imported_at ? new Date(info.imported_at).toLocaleString('pt-BR') : '?'
    var period = (info.first_date && info.last_date) ? (info.first_date + ' a ' + info.last_date) : '?'
    body.innerHTML = ''
      + '<div style="text-align:center;padding:32px 20px">'
        + '<div style="color:#f59e0b;margin-bottom:16px">' + _icon('alert-circle', 64) + '</div>'
        + '<h3 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827">Arquivo ja importado</h3>'
        + '<p style="margin:0;font-size:13px;color:#6b7280">Este OFX exato foi importado anteriormente</p>'
      + '</div>'
      + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;max-width:520px;margin:0 auto">'
        + '<div style="font-size:12px;color:#92400e;line-height:1.8">'
          + '<div><strong>Arquivo:</strong> ' + (info.file_name || _state.fileName) + '</div>'
          + '<div><strong>Importado em:</strong> ' + when + '</div>'
          + '<div><strong>Periodo:</strong> ' + period + '</div>'
          + '<div><strong>Transacoes:</strong> ' + (info.row_count || '?') + '</div>'
          + (info.total_credits != null ? '<div><strong>Creditos:</strong> R$ ' + Number(info.total_credits).toFixed(2) + '</div>' : '')
          + (info.total_debits  != null ? '<div><strong>Debitos:</strong> R$ ' + Number(info.total_debits).toFixed(2) + '</div>' : '')
        + '</div>'
      + '</div>'
      + '<div style="margin-top:16px;font-size:11px;color:#6b7280;text-align:center;max-width:520px;margin-left:auto;margin-right:auto">'
        + 'Se voce realmente quer reimportar, apague esse registro de imports antes (tabela ofx_imports).'
      + '</div>'

    var btn = document.getElementById('ofxConfirm')
    btn.textContent = 'Fechar'
    btn.disabled = false
    btn.style.background = '#f59e0b'
    btn.style.color = '#fff'
    btn.style.cursor = 'pointer'
    btn.onclick = close
    document.getElementById('ofxStatus').textContent = 'Bloqueado: camada 1 (hash de arquivo)'
  }

  // ── Step 2: Preview ───────────────────────────────────────

  function _renderPreviewStep() {
    var body = document.getElementById('ofxBody')
    if (!body) return

    var fmt   = window.CashflowService.fmtCurrency
    var fmtD  = window.CashflowService.fmtDate
    var label = window.CashflowService.methodLabel

    var totalCredit = 0
    var totalDebit  = 0
    var dateMin = null, dateMax = null

    _state.transactions.forEach(function(t) {
      if (t.direction === 'credit') totalCredit += t.amount
      else totalDebit += t.amount
      if (!dateMin || t.transaction_date < dateMin) dateMin = t.transaction_date
      if (!dateMax || t.transaction_date > dateMax) dateMax = t.transaction_date
    })

    // Detecta se cobre multiplos meses
    var isMultiMonth = false
    if (dateMin && dateMax) {
      var dMin = new Date(dateMin + 'T00:00:00')
      var dMax = new Date(dateMax + 'T00:00:00')
      isMultiMonth = (dMin.getFullYear() !== dMax.getFullYear() || dMin.getMonth() !== dMax.getMonth())
    }
    var monthsSpan = 0
    if (isMultiMonth) {
      var d1 = new Date(dateMin + 'T00:00:00')
      var d2 = new Date(dateMax + 'T00:00:00')
      monthsSpan = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1
    }

    var html = ''
      // Cabecalho do preview
      + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:16px">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">'
          + '<span style="color:#10b981">' + _icon('check-circle', 18) + '</span>'
          + '<div style="font-size:13px;font-weight:700;color:#065f46">Arquivo lido com sucesso</div>'
          + (isMultiMonth ? '<span style="background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;margin-left:6px">' + monthsSpan + ' MESES</span>' : '')
        + '</div>'
        + '<div style="font-size:12px;color:#065f46;line-height:1.6">'
          + '<strong>' + _state.fileName + '</strong><br>'
          + _state.transactions.length + ' transacoes | '
          + 'Periodo: ' + fmtD(dateMin) + ' a ' + fmtD(dateMax) + '<br>'
          + '<span style="color:#10b981">Entradas: ' + fmt(totalCredit) + '</span> | '
          + '<span style="color:#ef4444">Saidas: ' + fmt(totalDebit) + '</span> | '
          + '<strong>Saldo: ' + fmt(totalCredit - totalDebit) + '</strong>'
        + '</div>'
        + (isMultiMonth ? '<div style="margin-top:8px;padding:8px 10px;background:#dbeafe;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af"><strong>Multi-mes detectado:</strong> apos importar, a visao do Fluxo de Caixa sera ajustada automaticamente pra mostrar todo o periodo do arquivo.</div>' : '')
      + '</div>'

      // Tabela
      + '<div style="border:1px solid #e5e7eb;border-radius:10px;overflow:auto;max-height:380px">'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
          + '<thead style="position:sticky;top:0;background:#f9fafb;z-index:1">'
            + '<tr>'
              + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb">Data</th>'
              + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb">Descricao</th>'
              + '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb">Metodo</th>'
              + '<th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb">Valor</th>'
            + '</tr>'
          + '</thead>'
          + '<tbody>'

    _state.transactions.forEach(function(t) {
      var color = t.direction === 'credit' ? '#10b981' : '#ef4444'
      var sign = t.direction === 'credit' ? '+' : '-'
      html += ''
        + '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:8px 12px;color:#374151;white-space:nowrap">' + fmtD(t.transaction_date) + '</td>'
          + '<td style="padding:8px 12px;color:#111827;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (t.description || '').replace(/"/g, '&quot;') + '">' + (t.description || '—') + '</td>'
          + '<td style="padding:8px 12px;color:#6b7280">' + label(t.payment_method) + '</td>'
          + '<td style="padding:8px 12px;text-align:right;font-weight:700;color:' + color + '">' + sign + ' ' + fmt(t.amount) + '</td>'
        + '</tr>'
    })

    html += '</tbody></table></div>'

      // Aviso
      + '<div style="margin-top:14px;font-size:11px;color:#9ca3af;text-align:center">'
        + 'Idempotencia ativa: transacoes ja importadas anteriormente serao puladas automaticamente.'
      + '</div>'

    body.innerHTML = html

    var btn = document.getElementById('ofxConfirm')
    btn.disabled = false
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)'
    btn.style.color = '#fff'
    btn.style.cursor = 'pointer'

    document.getElementById('ofxStatus').textContent = 'Pronto para importar ' + _state.transactions.length + ' transacoes'
  }

  // ── Step 3: Import ────────────────────────────────────────

  async function _doImport() {
    if (_state.importing) return
    _state.importing = true

    var btn = document.getElementById('ofxConfirm')
    btn.disabled = true
    btn.style.background = '#e5e7eb'
    btn.style.color = '#9ca3af'
    btn.style.cursor = 'not-allowed'
    btn.textContent = 'Importando...'

    var status = document.getElementById('ofxStatus')
    var imported = 0
    var duplicated = 0
    var dupFitid = 0
    var dupSignature = 0
    var errors = 0
    var total = _state.transactions.length

    // Copia local pra nao sofrer mutacao do _state durante o loop
    var _txList = (_state.transactions || []).slice()
    console.log('[OfxImport] iniciando loop com', _txList.length, 'transacoes')

    for (var i = 0; i < total; i++) {
      var t = _txList[i]
      if (!t || typeof t !== 'object') {
        console.error('[OfxImport] transacao invalida no index', i, ':', t)
        errors++
        continue
      }
      try {
        var _payload = {
          transaction_date: t.transaction_date,
          direction:        t.direction,
          amount:           t.amount,
          payment_method:   t.payment_method,
          description:      t.description,
          source:           'ofx_import',
          external_id:      t.fitid,
          signature:        _buildSignature(t),
          raw_data:         { trntype: t.raw_type, fitid: t.fitid, file_hash: _state.fileHash },
        }
        if (i === 0) console.log('[OfxImport] primeiro payload:', JSON.stringify(_payload))
        var res = await window.CashflowService.createEntry(_payload)
        if (i < 3 || !res || !res.ok) {
          console.log('[OfxImport] resposta linha', i, ':', JSON.stringify(res))
        }
        if (res && !res.ok) {
          console.error('[OfxImport] ERRO linha', i, '→ error:', res.error, '| payload:', _payload)
        }
        if (res && res.ok) {
          if (res.data && res.data.duplicated) {
            duplicated++
            if (res.data.reason === 'signature_match') dupSignature++
            else dupFitid++
          } else imported++
        } else {
          errors++
        }
      } catch (e) {
        errors++
        console.error('[OfxImport] erro na linha', i, ':', e && e.message, e && e.stack)
      }

      // Proteje contra DOM removido se user fechar modal mid-import
      var statusEl = document.getElementById('ofxStatus')
      if (statusEl) {
        statusEl.textContent = 'Processando: ' + (i + 1) + '/' + total
          + ' | Novos: ' + imported
          + ' | Duplicados: ' + duplicated
          + ' | Erros: ' + errors
      }
    }

    console.log('[OfxImport] loop terminado:', { imported, duplicated, dupFitid, dupSignature, errors, total })

    // Registra o arquivo (camada 1) — so se pelo menos 1 linha nova foi importada
    if (imported > 0 && window._sbShared && _state.fileHash) {
      try {
        var totalCred = 0, totalDeb = 0, minD = null, maxD = null
        _state.transactions.forEach(function(t) {
          if (t.direction === 'credit') totalCred += t.amount
          else totalDeb += t.amount
          if (!minD || t.transaction_date < minD) minD = t.transaction_date
          if (!maxD || t.transaction_date > maxD) maxD = t.transaction_date
        })
        await window._sbShared.rpc('ofx_register_import', {
          p_data: {
            fingerprint:   _state.fingerprint,
            file_hash:     _state.fileHash,
            file_name:     _state.fileName,
            file_size:     _state.fileSize,
            row_count:     _state.transactions.length,
            first_date:    minD,
            last_date:     maxD,
            total_credits: totalCred.toFixed(2),
            total_debits:  totalDeb.toFixed(2),
          },
        })
      } catch (e) { console.warn('[OfxImport] register_import falhou:', e) }
    }

    // Auto-reconcile apos import (silencioso) — usa range completo do arquivo
    if (imported > 0 && window.CashflowService && window.CashflowService.autoReconcile) {
      try {
        // Calcula range das transacoes importadas
        var minDate = null, maxDate = null
        _state.transactions.forEach(function(t) {
          if (!minDate || t.transaction_date < minDate) minDate = t.transaction_date
          if (!maxDate || t.transaction_date > maxDate) maxDate = t.transaction_date
        })
        await window.CashflowService.autoReconcile(minDate, maxDate)
      } catch (e) { console.warn('[OfxImport] auto-reconcile falhou:', e) }
    }

    _renderResultStep(imported, duplicated, errors, total, { dupFitid: dupFitid, dupSignature: dupSignature })
    _state.importing = false

    // Calcula range para sincronizar visao da pagina
    var minDate2 = null, maxDate2 = null
    _state.transactions.forEach(function(t) {
      if (!minDate2 || t.transaction_date < minDate2) minDate2 = t.transaction_date
      if (!maxDate2 || t.transaction_date > maxDate2) maxDate2 = t.transaction_date
    })

    // Se foi multi-mes, ajusta o periodo da pagina pra mostrar tudo
    if (window.CashflowUI && window.CashflowUI.setCustomRange && minDate2 && maxDate2) {
      var d1 = new Date(minDate2 + 'T00:00:00')
      var d2 = new Date(maxDate2 + 'T00:00:00')
      var multiMonth = (d1.getFullYear() !== d2.getFullYear() || d1.getMonth() !== d2.getMonth())
      if (multiMonth) {
        window.CashflowUI.setCustomRange(minDate2, maxDate2)
        return  // setCustomRange ja faz reload
      }
    }

    // Recarrega lista + mostra sugestoes se houver
    if (window.CashflowUI && window.CashflowUI.reload) {
      window.CashflowUI.reload()
    }
    if (window.CashflowUI && window.CashflowUI.showSuggestions) {
      setTimeout(window.CashflowUI.showSuggestions, 500)
    }
  }

  // ── Step 4: Result ────────────────────────────────────────

  function _renderResultStep(imported, duplicated, errors, total, breakdown) {
    var body = document.getElementById('ofxBody')
    if (!body) return

    var color = errors > 0 ? '#f59e0b' : '#10b981'
    var iconName = errors > 0 ? 'alert-circle' : 'check-circle'
    var bd = breakdown || { dupFitid: 0, dupSignature: 0 }

    body.innerHTML = ''
      + '<div style="text-align:center;padding:32px 20px">'
        + '<div style="color:' + color + ';margin-bottom:16px">' + _icon(iconName, 64) + '</div>'
        + '<h3 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827">Importacao concluida</h3>'
        + '<p style="margin:0;font-size:13px;color:#6b7280">' + total + ' transacoes processadas</p>'
      + '</div>'

      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:480px;margin:0 auto">'
        + _resultBox('Novos',       imported,   '#10b981')
        + _resultBox('Duplicados',  duplicated, '#6b7280')
        + _resultBox('Erros',       errors,     errors > 0 ? '#ef4444' : '#9ca3af')
      + '</div>'

      + (duplicated > 0 ? (''
        + '<div style="margin-top:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;max-width:480px;margin-left:auto;margin-right:auto;font-size:11px;color:#6b7280;line-height:1.7">'
          + '<strong>Breakdown dos duplicados:</strong><br>'
          + '• Camada 2 (FITID): ' + bd.dupFitid + '<br>'
          + '• Camada 3 (signature data+valor+descricao): ' + bd.dupSignature
        + '</div>'
      ) : '')

      + '<div style="text-align:center;margin-top:24px;font-size:12px;color:#6b7280">'
        + 'Os movimentos ja estao na pagina Fluxo de Caixa.'
      + '</div>'

    var btn = document.getElementById('ofxConfirm')
    btn.textContent = 'Fechar'
    btn.disabled = false
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)'
    btn.style.color = '#fff'
    btn.style.cursor = 'pointer'
    btn.onclick = close

    document.getElementById('ofxStatus').textContent = 'Concluido'
  }

  function _resultBox(label, value, color) {
    return ''
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:18px;text-align:center">'
        + '<div style="font-size:28px;font-weight:700;color:' + color + ';margin-bottom:4px">' + value + '</div>'
        + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">' + label + '</div>'
      + '</div>'
  }

  // ── Icons ─────────────────────────────────────────────────

  function _icon(name, size) {
    size = size || 16
    var icons = {
      'x':             '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      'upload-cloud':  '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/></svg>',
      'check-circle':  '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      'alert-circle':  '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    }
    return icons[name] || ''
  }

  // ── Expose ────────────────────────────────────────────────

  window.OfxImportUI = Object.freeze({
    open:     open,
    close:    close,
    parseOFX: parseOFX,  // exposto pra teste
  })
})()
