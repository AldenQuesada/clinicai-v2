// Diag profundo: de onde Mirian 04-10 volta
(async function () {
  var sb = window._sbShared

  // 1. DB direto
  var q = await sb.from('appointments').select('*').eq('scheduled_date', '2026-04-10').ilike('patient_name', '%Mirian%')
  console.log('[deep] DB:', q.data)

  // 2. Todas localStorage keys com Mirian no valor
  console.log('[deep] LocalStorage keys contendo "Mirian":')
  Object.keys(localStorage).forEach(function (k) {
    var v = localStorage.getItem(k) || ''
    if (/mirian/i.test(v) && /2026-04-10/.test(v)) {
      console.log('  HIT:', k, '| size:', v.length)
    }
  })

  // 3. sessionStorage
  console.log('[deep] SessionStorage keys contendo "Mirian":')
  Object.keys(sessionStorage).forEach(function (k) {
    var v = sessionStorage.getItem(k) || ''
    if (/mirian/i.test(v) && /2026-04-10/.test(v)) {
      console.log('  HIT:', k)
    }
  })

  // 4. IndexedDB
  if (window.indexedDB && indexedDB.databases) {
    var dbs = await indexedDB.databases()
    console.log('[deep] IndexedDB DBs:', dbs.map(function (d) { return d.name }))
  }

  // 5. Tabelas DB que podem conter Mirian 04-10
  var tables = ['appointments', 'agenda_recurring', 'agenda_templates', 'clinic_events']
  for (var i = 0; i < tables.length; i++) {
    try {
      var t = tables[i]
      var res = await sb.from(t).select('*').limit(50)
      if (res.error) { console.log('[deep] tabela', t, 'erro:', res.error.message); continue }
      var hit = (res.data || []).filter(function (r) {
        var s = JSON.stringify(r)
        return /mirian/i.test(s) && /2026-04-10/.test(s)
      })
      if (hit.length) console.log('[deep] TABELA', t, 'tem', hit.length, 'hits:', hit)
    } catch (e) { /* tabela nao existe */ }
  }

  // 6. Objeto em memoria getAppointments()
  if (window.getAppointments) {
    var mem = getAppointments().filter(function (a) {
      return a.data === '2026-04-10' && /mirian/i.test(a.pacienteNome || '')
    })
    console.log('[deep] getAppointments() in-memory:', mem)
  }
})()
