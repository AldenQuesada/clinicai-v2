;(function () {
  'use strict'
  if (window.Skeleton) return

  function line(w) {
    return '<div class="sk sk-line' + (w ? ' sk-' + w : ' sk-text') + '"></div>'
  }

  function rows(n, cols) {
    n = n || 5
    cols = cols || 4
    var html = '<div class="sk-table-wrap">'
    for (var i = 0; i < n; i++) {
      html += '<div class="sk-row">'
      html += '<div class="sk sk-avatar"></div>'
      for (var c = 0; c < cols - 1; c++) {
        var w = c === 0 ? 'w60' : c === 1 ? 'w40' : 'w30'
        html += '<div class="sk sk-line sk-' + w + '" style="flex:1"></div>'
      }
      html += '</div>'
    }
    html += '</div>'
    return html
  }

  function cards(n) {
    n = n || 3
    var html = ''
    for (var i = 0; i < n; i++) {
      html += '<div class="sk-card">'
      html += '<div class="sk sk-title"></div>'
      html += '<div class="sk sk-line sk-w80"></div>'
      html += '<div class="sk sk-line sk-w60"></div>'
      html += '</div>'
    }
    return html
  }

  function kpis(n) {
    n = n || 4
    var html = '<div class="sk-kpi-row">'
    for (var i = 0; i < n; i++) {
      html += '<div class="sk-kpi">'
      html += '<div class="sk sk-line sk-w40" style="margin-bottom:8px"></div>'
      html += '<div class="sk sk-title" style="height:24px;width:60%"></div>'
      html += '</div>'
    }
    html += '</div>'
    return html
  }

  function tableRows(n, cols) {
    n = n || 5
    cols = cols || 6
    var html = ''
    for (var i = 0; i < n; i++) {
      html += '<tr>'
      for (var c = 0; c < cols; c++) {
        var w = c === 0 ? '50%' : c === 1 ? '70%' : '40%'
        html += '<td><div class="sk sk-line" style="width:' + w + '"></div></td>'
      }
      html += '</tr>'
    }
    return html
  }

  function into(el, type, opts) {
    if (typeof el === 'string') el = document.getElementById(el)
    if (!el) return
    opts = opts || {}
    var n = opts.count || 5
    var cols = opts.cols || 4
    switch (type) {
      case 'rows':      el.innerHTML = rows(n, cols); break
      case 'cards':     el.innerHTML = cards(n); break
      case 'kpis':      el.innerHTML = kpis(n); break
      case 'tableRows': el.innerHTML = tableRows(n, cols); break
      default:          el.innerHTML = rows(n, cols)
    }
  }

  window.Skeleton = Object.freeze({ line, rows, cards, kpis, tableRows, into })

  function guardClick(btn, asyncFn) {
    if (!btn || btn.disabled || btn._guarded) return
    btn._guarded = true
    var origText = btn.textContent
    btn.disabled = true
    btn.style.opacity = '0.6'
    Promise.resolve(asyncFn()).finally(function () {
      btn.disabled = false
      btn.style.opacity = ''
      btn._guarded = false
      btn.textContent = origText
    })
  }
  window.guardClick = guardClick
})()
