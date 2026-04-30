/**
 * LP Blocks · interações dos blocos avançados
 *
 * Por enquanto: before-after slider (drag/touch handle).
 * Idempotente — pode chamar init() várias vezes.
 *
 * Uso:
 *   LPBlocks.init(document)         // wire em todos os sliders do doc
 *   LPBlocks.init(iframeDoc)        // ou no doc do iframe (canvas do editor)
 */
;(function (global) {
  'use strict'
  if (global.LPBlocks) return

  // ────────────────────────────────────────────────────────────
  // Before-after slider multidirecional (4 direções)
  // Direção vem de [data-dir]: horizontal-lr · horizontal-rl
  //                            vertical-tb  · vertical-bt
  // ────────────────────────────────────────────────────────────
  function _initBeforeAfter(root) {
    var wraps = (root || document).querySelectorAll('.blk-ba-wrap[data-slider]:not([data-init])')
    Array.prototype.forEach.call(wraps, function (wrap) {
      wrap.setAttribute('data-init', '1')

      var afterImg = wrap.querySelector('.blk-ba-img.after')
      var handle   = wrap.querySelector('.blk-ba-handle')
      if (!afterImg || !handle) return

      var dir = wrap.getAttribute('data-dir') || 'horizontal-lr'
      var dragging = false

      function clipFor(dir, pct) {
        // pct é a posição do HANDLE (0..100) na direção primária.
        // clip-path inset(top right bottom left) — define o que fica ESCONDIDO do after.
        // Quando pct=50, metade aparece, metade some.
        switch (dir) {
          case 'horizontal-rl': return 'inset(0 0 0 ' + pct + '%)'
          case 'vertical-tb':   return 'inset(0 0 ' + (100 - pct) + '% 0)'
          case 'vertical-bt':   return 'inset(' + pct + '% 0 0 0)'
          case 'horizontal-lr':
          default:              return 'inset(0 ' + (100 - pct) + '% 0 0)'
        }
      }

      function setPosition(pct) {
        pct = Math.max(0, Math.min(100, pct))
        afterImg.style.clipPath = clipFor(dir, pct)
        if (dir.indexOf('vertical') === 0) {
          handle.style.left = '0'; handle.style.right = '0'
          handle.style.top  = pct + '%'
        } else {
          handle.style.top  = '0'; handle.style.bottom = '0'
          handle.style.left = pct + '%'
        }
      }

      function pctFromEvent(e) {
        var rect = wrap.getBoundingClientRect()
        if (dir.indexOf('vertical') === 0) {
          var y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
          return (y / rect.height) * 100
        }
        var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
        return (x / rect.width) * 100
      }

      function onDown(e) { dragging = true; setPosition(pctFromEvent(e)); e.preventDefault() }
      function onMove(e) { if (dragging) { setPosition(pctFromEvent(e)); e.preventDefault() } }
      function onUp()    { dragging = false }

      wrap.addEventListener('mousedown',  onDown)
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup',   onUp)
      wrap.addEventListener('touchstart', onDown, { passive: false })
      window.addEventListener('touchmove', onMove, { passive: false })
      window.addEventListener('touchend',  onUp)

      setPosition(50)
    })
  }

  // ────────────────────────────────────────────────────────────
  // Hotspots anatômicos (foto + pontos clicáveis com popover)
  // ────────────────────────────────────────────────────────────
  function _initHotspots(root) {
    var blocks = (root || document).querySelectorAll('.blk-hotspots:not([data-init])')
    Array.prototype.forEach.call(blocks, function (blk) {
      blk.setAttribute('data-init', '1')
      var points = blk.querySelectorAll('.blk-hotspot-point')
      var info   = blk.querySelector('.blk-hotspot-info')
      var tip    = blk.querySelector('.blk-hotspot-tip')

      function activate(point) {
        points.forEach(function (p) { p.classList.remove('is-active') })
        point.classList.add('is-active')
        var label = point.getAttribute('data-label') || ''
        var desc  = point.getAttribute('data-desc')  || ''
        if (info) {
          info.innerHTML =
            '<div class="blk-hotspot-info-label">Zona selecionada</div>' +
            '<div class="blk-hotspot-info-title">' + _esc(label) + '</div>' +
            '<div class="blk-hotspot-info-desc">' + _esc(desc) + '</div>'
        }
        if (tip) {
          tip.textContent = label
          tip.style.left = point.style.left
          tip.style.top  = point.style.top
          tip.classList.add('is-visible')
        }
      }

      Array.prototype.forEach.call(points, function (p) {
        p.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation()
          activate(p)
        })
        p.addEventListener('mouseenter', function () {
          if (tip) {
            tip.textContent = p.getAttribute('data-label') || ''
            tip.style.left  = p.style.left
            tip.style.top   = p.style.top
            tip.classList.add('is-visible')
          }
        })
        p.addEventListener('mouseleave', function () {
          // só esconde se não há ponto ativo
          if (tip && !blk.querySelector('.blk-hotspot-point.is-active')) {
            tip.classList.remove('is-visible')
          }
        })
      })
    })
  }

  // Helper de escape dentro do iframe / doc — reusa textContent+innerHTML
  function _esc(s) {
    var d = document.createElement('div')
    d.textContent = s == null ? '' : s
    return d.innerHTML
  }

  // ────────────────────────────────────────────────────────────
  // Timeline scrub (checkpoints clicáveis + crossfade)
  // ────────────────────────────────────────────────────────────
  function _initTimelineScrub(root) {
    var blocks = (root || document).querySelectorAll('.blk-tscrub:not([data-init])')
    Array.prototype.forEach.call(blocks, function (blk) {
      blk.setAttribute('data-init', '1')
      var imgs    = blk.querySelectorAll('.blk-tscrub-img')
      var dots    = blk.querySelectorAll('.blk-tscrub-dot')
      var caption = blk.querySelector('.blk-tscrub-caption')
      var overlay = blk.querySelector('.blk-tscrub-overlay')
      var autoplay = blk.getAttribute('data-autoplay') === '1'

      if (!imgs.length) return

      var current = 0
      function show(idx) {
        idx = ((idx % imgs.length) + imgs.length) % imgs.length
        current = idx
        imgs.forEach(function (im, i) { im.classList.toggle('is-active', i === idx) })
        dots.forEach(function (d, i) { d.classList.toggle('is-active', i === idx) })
        if (caption) caption.textContent = (imgs[idx].getAttribute('data-legenda') || '')
        if (overlay) overlay.textContent = (imgs[idx].getAttribute('data-label') || '')
      }

      Array.prototype.forEach.call(dots, function (d, i) {
        d.addEventListener('click', function (e) {
          e.preventDefault()
          if (autoplayTimer) clearInterval(autoplayTimer)
          autoplayTimer = null
          show(i)
        })
      })

      // Swipe horizontal (touch) no stage
      var stage = blk.querySelector('.blk-tscrub-stage')
      if (stage) {
        var tx = 0
        stage.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX }, { passive: true })
        stage.addEventListener('touchend',   function (e) {
          var dx = (e.changedTouches[0].clientX - tx)
          if (Math.abs(dx) < 40) return
          show(current + (dx < 0 ? 1 : -1))
        })
      }

      show(0)

      var autoplayTimer = null
      if (autoplay && imgs.length > 1) {
        autoplayTimer = setInterval(function () { show(current + 1) }, 3500)
      }
    })
  }

  // ────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────
  // Reading time badge — calcula text content do doc inteiro
  // (excluindo o próprio badge) e popula spans .rt-min e .rt-sections
  // Idempotente: marca [data-init] e não recalcula em re-renders.
  // ────────────────────────────────────────────────────────────
  function _initReadingTime(root) {
    var doc = (root && root.ownerDocument) || document
    var badges = (root || doc).querySelectorAll('[data-reading-time]:not([data-init])')
    Array.prototype.forEach.call(badges, function (badge) {
      badge.setAttribute('data-init', '1')

      // text content do doc inteiro, exceto reading-time blocks
      var clone = doc.body.cloneNode(true)
      var others = clone.querySelectorAll('[data-reading-time]')
      Array.prototype.forEach.call(others, function (n) {
        if (n.parentNode) n.parentNode.removeChild(n)
      })
      var text = clone.textContent || ''
      var words = text.trim().split(/\s+/).filter(Boolean).length
      var WPM = 200
      var minutes = Math.max(1, Math.round(words / WPM))

      var sections = doc.querySelectorAll('section, header, footer').length

      var elMin = badge.querySelector('.rt-min')
      var elSec = badge.querySelector('.rt-sections')
      if (elMin) elMin.textContent = minutes + (minutes === 1 ? ' minuto' : ' minutos')
      if (elSec) elSec.textContent = sections + (sections === 1 ? ' seção' : ' seções')
    })
  }

  // ────────────────────────────────────────────────────────────
  // Carousel slides genérico (.blk-slides)
  // ────────────────────────────────────────────────────────────
  function _initSlides(root) {
    var blocks = (root || document).querySelectorAll('.blk-slides[data-slides]:not([data-init])')
    Array.prototype.forEach.call(blocks, function (blk) {
      blk.setAttribute('data-init', '1')
      var track = blk.querySelector('.blk-slides-track')
      var dots  = blk.querySelectorAll('.blk-slides-dot')
      if (!track || !dots.length) return

      var current = 0
      var total   = dots.length
      var autoplay     = blk.getAttribute('data-autoplay') === '1'
      var intervalSec  = parseInt(blk.getAttribute('data-interval') || '6', 10)
      var timer = null

      function show(idx) {
        idx = ((idx % total) + total) % total
        current = idx
        track.style.transform = 'translateX(-' + (idx * 100) + '%)'
        dots.forEach(function (d, i) { d.classList.toggle('is-active', i === idx) })
      }
      function next() { show(current + 1) }

      Array.prototype.forEach.call(dots, function (d, i) {
        d.addEventListener('click', function (e) {
          e.preventDefault()
          if (timer) { clearInterval(timer); timer = null }
          show(i)
        })
      })

      // Swipe touch
      var tx = 0
      track.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX }, { passive: true })
      track.addEventListener('touchend',   function (e) {
        var dx = (e.changedTouches[0].clientX - tx)
        if (Math.abs(dx) < 40) return
        if (timer) { clearInterval(timer); timer = null }
        show(current + (dx < 0 ? 1 : -1))
      })

      show(0)
      if (autoplay && total > 1) timer = setInterval(next, intervalSec * 1000)

      // Pause em tab oculta
      document.addEventListener('visibilitychange', function () {
        if (!autoplay) return
        if (document.hidden && timer) { clearInterval(timer); timer = null }
        else if (!document.hidden && !timer) timer = setInterval(next, intervalSec * 1000)
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Testimonials carousel (variante "carousel" do bloco testimonials)
  // ────────────────────────────────────────────────────────────
  function _initTestimonialsCarousel(root) {
    var blocks = (root || document).querySelectorAll('.blk-testimonials.layout-carousel:not([data-init])')
    Array.prototype.forEach.call(blocks, function (blk) {
      blk.setAttribute('data-init', '1')
      var track = blk.querySelector('.blk-testimonials-track')
      var dots  = blk.querySelectorAll('.blk-slides-dot')
      if (!track) return
      var cards = track.querySelectorAll('.blk-test-card')
      if (cards.length <= 1) return

      var current = 0
      function show(idx) {
        idx = ((idx % cards.length) + cards.length) % cards.length
        current = idx
        track.style.transform = 'translateX(-' + (idx * 100) + '%)'
        if (dots && dots.length) {
          dots.forEach(function (d, i) { d.classList.toggle('is-active', i === idx) })
        }
      }
      Array.prototype.forEach.call(dots, function (d, i) {
        d.addEventListener('click', function (e) { e.preventDefault(); show(i) })
      })

      var tx = 0
      track.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX }, { passive: true })
      track.addEventListener('touchend',   function (e) {
        var dx = (e.changedTouches[0].clientX - tx)
        if (Math.abs(dx) < 40) return
        show(current + (dx < 0 ? 1 : -1))
      })

      show(0)
      // Auto-play padrão: 7s
      var timer = setInterval(function () { show(current + 1) }, 7000)
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && timer) { clearInterval(timer); timer = null }
        else if (!document.hidden && !timer) timer = setInterval(function () { show(current + 1) }, 7000)
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Countdown (timer regressivo até target_at ISO)
  // ────────────────────────────────────────────────────────────
  function _initCountdown(root) {
    var blocks = (root || document).querySelectorAll('.blk-countdown[data-target]:not([data-init])')
    Array.prototype.forEach.call(blocks, function (blk) {
      blk.setAttribute('data-init', '1')
      var targetIso = blk.getAttribute('data-target') || ''
      var target = new Date(targetIso).getTime()
      if (isNaN(target)) return
      var showDays = blk.getAttribute('data-show-days') === '1'
      var variant  = blk.getAttribute('data-variant') || 'minimal'
      var timeEl   = blk.querySelector('.blk-countdown-time')
      var expired  = blk.querySelector('.blk-countdown-expired')
      var label    = blk.querySelector('.blk-countdown-label')
      if (!timeEl) return

      function pad(n) { n = Math.max(0, Math.floor(n)); return n < 10 ? '0' + n : '' + n }

      function tick() {
        var diffMs = target - Date.now()
        if (diffMs <= 0) {
          timeEl.style.display = 'none'
          if (label) label.style.display = 'none'
          if (expired) expired.style.display = ''
          if (timer) { clearInterval(timer); timer = null }
          return
        }
        var sec  = Math.floor(diffMs / 1000)
        var d    = Math.floor(sec / 86400)
        var h    = Math.floor((sec % 86400) / 3600)
        var m    = Math.floor((sec % 3600) / 60)
        var s    = sec % 60

        if (variant === 'card') {
          var html = ''
          if (showDays) html += _unit(d, 'dias')
          html += _unit(h, 'horas') + _unit(m, 'min') + _unit(s, 'seg')
          timeEl.innerHTML = html
        } else {
          var sep = '<span class="blk-countdown-sep">:</span>'
          var parts = []
          if (showDays) parts.push(pad(d) + '<span class="blk-countdown-unit-suffix" style="font-size:.5em;color:var(--champagne-dk);margin-left:4px;letter-spacing:2px;text-transform:uppercase">d</span>')
          parts.push(pad(h)); parts.push(pad(m)); parts.push(pad(s))
          timeEl.innerHTML = showDays
            ? parts[0] + ' ' + parts.slice(1).join(sep)
            : parts.join(sep)
        }
      }

      function _unit(num, name) {
        return '<span class="blk-countdown-unit"><span class="blk-countdown-num">' + pad(num) + '</span>' +
               '<span class="blk-countdown-name">' + name + '</span></span>'
      }

      tick()
      var timer = setInterval(tick, 1000)
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && timer) { clearInterval(timer); timer = null }
        else if (!document.hidden && !timer) { tick(); timer = setInterval(tick, 1000) }
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Logos imprensa — auto-scroll horizontal infinito (opt-in)
  // Duplica os logos pra criar loop visual contínuo.
  // ────────────────────────────────────────────────────────────
  function _initLogosScroll(root) {
    var blocks = (root || document).querySelectorAll('.blk-logos.is-scrolling:not([data-init])')
    Array.prototype.forEach.call(blocks, function (track) {
      track.setAttribute('data-init', '1')
      // duplica os filhos uma vez pra garantir loop contínuo (50% translate)
      var children = Array.prototype.slice.call(track.children)
      children.forEach(function (c) {
        var clone = c.cloneNode(true)
        clone.setAttribute('aria-hidden', 'true')
        track.appendChild(clone)
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Galeria filtrada (.blk-gallery) — filtros por categoria
  // ────────────────────────────────────────────────────────────
  function _initGalleryFilter(root) {
    var blocks = (root || document).querySelectorAll('[data-gallery]:not([data-init])')
    Array.prototype.forEach.call(blocks, function (gal) {
      gal.setAttribute('data-init', '1')
      var filters = gal.querySelectorAll('.blk-gallery-filter')
      var cards   = gal.querySelectorAll('.blk-gallery-card')
      var emptyEl = gal.querySelector('.blk-gallery-empty')

      function applyFilter(cat) {
        var visible = 0
        cards.forEach(function (c) {
          var hide = (cat !== 'all') && (c.getAttribute('data-cat') !== cat)
          c.classList.toggle('is-hidden', hide)
          if (!hide) visible++
        })
        if (emptyEl) emptyEl.style.display = visible === 0 ? '' : 'none'
      }

      Array.prototype.forEach.call(filters, function (f) {
        f.addEventListener('click', function (e) {
          e.preventDefault()
          filters.forEach(function (x) { x.classList.remove('is-active') })
          f.classList.add('is-active')
          applyFilter(f.getAttribute('data-cat') || 'all')
        })
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Galeria lightbox — click em card abre modal com slider
  // Reusa _initBeforeAfter no DOM injetado.
  // ────────────────────────────────────────────────────────────
  function _initGalleryLightbox(root) {
    var doc = (root && root.ownerDocument) || document
    var blocks = (root || doc).querySelectorAll('[data-gallery]:not([data-lb-init])')
    Array.prototype.forEach.call(blocks, function (gal) {
      gal.setAttribute('data-lb-init', '1')
      var cards = gal.querySelectorAll('.blk-gallery-card')

      // Coleta os casos visíveis pra navegação
      function visibleCards() {
        return Array.prototype.filter.call(cards, function (c) {
          return !c.classList.contains('is-hidden')
        })
      }

      function open(initialIdx) {
        var list = visibleCards()
        if (!list.length) return
        var current = initialIdx
        var lb = doc.createElement('div')
        lb.className = 'blk-lb-bg'
        lb.innerHTML =
          '<div class="blk-lb-stage" onclick="event.stopPropagation()">' +
            '<button class="blk-lb-close" aria-label="Fechar">&times;</button>' +
            '<button class="blk-lb-nav blk-lb-prev" aria-label="Anterior">&#x2039;</button>' +
            '<button class="blk-lb-nav blk-lb-next" aria-label="Próximo">&#x203A;</button>' +
            '<div class="blk-lb-slot"></div>' +
            '<div class="blk-lb-caption"></div>' +
          '</div>'
        doc.body.appendChild(lb)

        function render(i) {
          current = ((i % list.length) + list.length) % list.length
          var c = list[current]
          var slot = lb.querySelector('.blk-lb-slot')
          var cap  = lb.querySelector('.blk-lb-caption')
          var b = c.getAttribute('data-before') || ''
          var a = c.getAttribute('data-after')  || ''
          slot.innerHTML =
            '<div class="blk-ba-wrap" data-slider data-dir="horizontal-lr" style="width:100%;max-width:520px">' +
              '<img class="blk-ba-img before" src="' + b + '" alt="Antes">' +
              '<img class="blk-ba-img after"  src="' + a + '" alt="Depois">' +
              '<div class="blk-ba-label before">Antes</div>' +
              '<div class="blk-ba-label after">Depois</div>' +
              '<div class="blk-ba-handle"><div class="blk-ba-knob">&#x21D4;</div></div>' +
            '</div>'
          cap.textContent = c.getAttribute('data-caption') || ''
          // re-init slider no slot novo
          _initBeforeAfter(slot)
        }

        function dismiss() {
          if (lb.parentNode) lb.parentNode.removeChild(lb)
          doc.removeEventListener('keydown', onKey)
        }
        function onKey(e) {
          if (e.key === 'Escape') dismiss()
          else if (e.key === 'ArrowLeft')  render(current - 1)
          else if (e.key === 'ArrowRight') render(current + 1)
        }

        lb.addEventListener('click', dismiss)
        lb.querySelector('.blk-lb-close').addEventListener('click', function (e) { e.stopPropagation(); dismiss() })
        lb.querySelector('.blk-lb-prev').addEventListener('click',  function (e) { e.stopPropagation(); render(current - 1) })
        lb.querySelector('.blk-lb-next').addEventListener('click',  function (e) { e.stopPropagation(); render(current + 1) })
        doc.addEventListener('keydown', onKey)

        render(current)
      }

      Array.prototype.forEach.call(cards, function (c, i) {
        c.addEventListener('click', function (e) {
          e.preventDefault()
          // re-resolve idx contra cards visíveis
          var list = visibleCards()
          var idx = list.indexOf(c)
          if (idx < 0) idx = 0
          open(idx)
        })
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Form inline (lead capture)
  // Submit: POST RPC lp_lead_submit · graceful fallback se sem endpoint
  // ────────────────────────────────────────────────────────────
  function _initForm(root) {
    var doc = (root && root.ownerDocument) || document
    var forms = (root || doc).querySelectorAll('.blk-form[data-form]:not([data-init])')
    Array.prototype.forEach.call(forms, function (form) {
      form.setAttribute('data-init', '1')
      var slug = form.getAttribute('data-slug') || ''
      var formEl = form.querySelector('form')
      var successEl = form.querySelector('.blk-form-success')
      if (!formEl || !successEl) return

      formEl.addEventListener('submit', async function (e) {
        e.preventDefault()
        var inputs = formEl.querySelectorAll('[data-fkey]')
        var data = {}
        var hasError = false
        Array.prototype.forEach.call(inputs, function (inp) {
          var key = inp.dataset.fkey
          var val = (inp.value || '').trim()
          var required = inp.hasAttribute('required')
          if (required && !val) {
            inp.classList.add('blk-form-error')
            hasError = true
          } else {
            inp.classList.remove('blk-form-error')
          }
          if (val) data[key] = val
        })
        if (hasError) return

        var btn = formEl.querySelector('.blk-form-submit')
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...' }

        try {
          await _submitLead(slug, data)
          formEl.style.display = 'none'
          successEl.style.display = ''
        } catch (err) {
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Enviar' }
          var msgEl = formEl.querySelector('.blk-form-global-msg')
          if (msgEl) msgEl.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.'
        }
      })
    })
  }

  function _submitLead(slug, data) {
    // Credenciais via ClinicEnv (fonte unica). Em pagina publica (lp.html)
    // o ClinicEnv ja e carregado antes deste script.
    var SB_URL = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) || ''
    var SB_KEY = (window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY) || ''
    if (!SB_URL || !SB_KEY) {
      return Promise.reject(new Error('Supabase config ausente'))
    }
    var utm = {}
    try { var attr = window.LPShared && LPShared.getUTMs(); if (attr) utm = attr } catch (_) {}
    return fetch(SB_URL + '/rest/v1/rpc/lp_lead_submit', {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_slug: slug,
        p_data: data,
        p_utm:  utm,
      }),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
  }

  // ────────────────────────────────────────────────────────────
  // Sticky CTA mobile — aparece após scroll % configurado
  // ────────────────────────────────────────────────────────────
  function _initStickyCta(root) {
    var bars = (root || document).querySelectorAll('.blk-sticky[data-threshold]:not([data-init])')
    Array.prototype.forEach.call(bars, function (bar) {
      bar.setAttribute('data-init', '1')
      var threshold = parseFloat(bar.getAttribute('data-threshold')) / 100 || 0.3

      function check() {
        var scrolled = window.scrollY || window.pageYOffset
        var max = document.documentElement.scrollHeight - window.innerHeight
        var pct = max > 0 ? (scrolled / max) : 0
        bar.classList.toggle('is-visible', pct >= threshold)
      }
      window.addEventListener('scroll', check, { passive: true })
      check()
    })
  }

  // ────────────────────────────────────────────────────────────
  // Scroll progress bar (singleton no topo do doc)
  // Listener passive · transform scaleX
  // ────────────────────────────────────────────────────────────
  function _initScrollProgress(root) {
    var bars = (root || document).querySelectorAll('.blk-scroll-progress:not([data-init])')
    Array.prototype.forEach.call(bars, function (bar) {
      bar.setAttribute('data-init', '1')
      var fill = bar.querySelector('.blk-scroll-progress-bar')
      if (!fill) return

      function update() {
        var scrolled = window.scrollY || window.pageYOffset
        var max = document.documentElement.scrollHeight - window.innerHeight
        var pct = max > 0 ? (scrolled / max) : 0
        fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, pct)) + ')'
      }
      window.addEventListener('scroll', update, { passive: true })
      window.addEventListener('resize', update)
      update()
    })
  }

  // ────────────────────────────────────────────────────────────
  // Reveal animations (rich) — substitui o reveal simples do lp-shared.
  // Suporta data-reveal-anim com classes lpb-anim-{type}.
  // ────────────────────────────────────────────────────────────
  function _initRichReveal(root) {
    if (!('IntersectionObserver' in window)) return
    var els = (root || document).querySelectorAll('[data-reveal-anim]:not([data-init])')
    if (!els.length) return
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          observer.unobserve(e.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' })
    Array.prototype.forEach.call(els, function (el) {
      el.setAttribute('data-init', '1')
      observer.observe(el)
    })
  }

  // ────────────────────────────────────────────────────────────
  // Parallax background (apenas em desktop · respeita reduced-motion)
  // CSS já faz background-attachment: fixed em desktop;
  // este JS adiciona um translate sutil pra suavizar
  // ────────────────────────────────────────────────────────────
  function _initParallax(root) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.innerWidth < 1024) return  // só desktop
    var blocks = (root || document).querySelectorAll('.blk-parallax[data-parallax]:not([data-init])')
    if (!blocks.length) return

    Array.prototype.forEach.call(blocks, function (blk) { blk.setAttribute('data-init', '1') })

    var raf = null
    function update() {
      raf = null
      var vh = window.innerHeight
      Array.prototype.forEach.call(blocks, function (blk) {
        var rect = blk.getBoundingClientRect()
        if (rect.bottom < 0 || rect.top > vh) return
        var center = rect.top + rect.height / 2
        var offset = (center - vh / 2) * -0.08  // 8% intensidade · sutil
        blk.style.backgroundPosition = 'center calc(50% + ' + offset.toFixed(1) + 'px)'
      })
    }
    window.addEventListener('scroll', function () {
      if (raf) return
      raf = requestAnimationFrame(update)
    }, { passive: true })
    update()
  }

  // ────────────────────────────────────────────────────────────
  // Language switcher — botões clicáveis, mudam URL + recarregam
  // Marca botão ativo conforme lang detectado
  // ────────────────────────────────────────────────────────────
  function _initLangSwitcher(root) {
    var blocks = (root || document).querySelectorAll('.blk-lang-switcher:not([data-init])')
    Array.prototype.forEach.call(blocks, function (sw) {
      sw.setAttribute('data-init', '1')
      var current = (window.LPBI18n && LPBI18n.detectLang && LPBI18n.detectLang()) || 'pt-BR'
      var btns = sw.querySelectorAll('.blk-lang-btn')
      Array.prototype.forEach.call(btns, function (b) {
        var lang = b.getAttribute('data-lang') || ''
        if (lang === current) b.classList.add('is-active')
        b.addEventListener('click', function (e) {
          e.preventDefault()
          if (window.LPBI18n && LPBI18n.setUserLang) LPBI18n.setUserLang(lang)
        })
      })
    })
  }

  // Onda 28: bloco before-after-carousel (do legado · scroll-snap + dots em rombo)
  function _initBaCarousel(root) {
    if (!root || !root.querySelectorAll) return
    var roots = root.querySelectorAll('[data-bac-root]')
    roots.forEach(function (rootEl) {
      var track = rootEl.querySelector('[data-bac-track]')
      var dots  = rootEl.querySelectorAll('.blk-bac-dot')
      if (!track) return
      // Click nos dots
      dots.forEach(function (d) {
        if (d.__bacBound) return
        d.__bacBound = true
        d.addEventListener('click', function () {
          var idx = parseInt(d.getAttribute('data-bac-idx'), 10) || 0
          var first = track.children[0]
          var sw = first ? first.offsetWidth : 1
          track.scrollTo({ left: idx * (sw + 2), behavior: 'smooth' })
        })
      })
      // Scroll → atualiza dot ativo
      if (!track.__bacBound) {
        track.__bacBound = true
        var pending = false
        track.addEventListener('scroll', function () {
          if (pending) return
          pending = true
          requestAnimationFrame(function () {
            pending = false
            var first = track.children[0]
            var sw = first ? first.offsetWidth : 1
            var idx = Math.round(track.scrollLeft / (sw + 2))
            dots.forEach(function (d, i) { d.classList.toggle('active', i === idx) })
          })
        }, { passive: true })
      }
    })
  }

  function init(root) {
    _initBeforeAfter(root)
    _initBaCarousel(root)
    _initReadingTime(root)
    _initHotspots(root)
    _initTimelineScrub(root)
    _initSlides(root)
    _initTestimonialsCarousel(root)
    _initCountdown(root)
    _initLogosScroll(root)
    _initGalleryFilter(root)
    _initGalleryLightbox(root)
    _initForm(root)
    _initStickyCta(root)
    _initScrollProgress(root)
    _initRichReveal(root)
    _initParallax(root)
    _initLangSwitcher(root)
  }

  // Auto-init no doc principal
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document) })
  } else {
    init(document)
  }

  global.LPBlocks = { init: init }
})(window);
