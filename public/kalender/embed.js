/* BBC Stendal – Kalender einbetten
 *
 * In WordPress (Elementor, HTML-Widget):
 *   <div id="bbc-kalender"></div>
 *   <script src="https://DEINE-ADRESSE/kalender/embed.js" async></script>
 *
 * Optional: data-timeout="75" (Sekunden bis zur Fehlermeldung) am Script-Tag.
 */
(function () {
  var s = document.currentScript || document.querySelector('script[src*="kalender/embed.js"]');
  if (!s) return;
  var src = new URL(s.src), origin = src.origin, base = src.href.replace(/embed\.js.*$/, '');
  var WARM_URL = origin + '/api/config';
  var LIMIT = Math.max(5, parseInt(s.getAttribute('data-timeout'), 10) || 75) * 1000;
  var HINT_AFTER = 4000;
  var box = document.getElementById('bbc-kalender') || s.parentNode;
  if (box.getAttribute('data-bbc-init')) return;
  box.setAttribute('data-bbc-init', '1');

  // Server schon beim Laden der Seite wecken (unabhängig davon, ob der Kalender schon sichtbar ist)
  function warm() { try { fetch(WARM_URL + (WARM_URL.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now(), { mode: 'no-cors', cache: 'no-store', credentials: 'omit' }).catch(function () {}); } catch (e) {} }
  warm();

  var css = [
    '.bbcc-wrap{position:relative;min-height:340px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}',
    '.bbcc-wrap iframe{position:absolute;left:0;top:0;width:100%;height:100%;border:0;display:block;background:transparent;opacity:0;pointer-events:none}',
    '.bbcc-wrap.bbcc-ready{min-height:0}',
    '.bbcc-wrap.bbcc-ready iframe{position:static;opacity:1;pointer-events:auto}',
    '.bbcc-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;animation:bbcc-in .35s .5s both}',
    '.bbcc-card{background:#fff;border:1px solid #e3dfd4;border-top:6px solid #E04412;border-radius:14px;box-shadow:0 8px 28px rgba(3,16,41,.10);padding:24px 22px 22px;max-width:430px;width:100%;text-align:center;color:#031029}',
    '.bbcc-ball{width:46px;height:46px;border-radius:50%;margin:4px auto 14px;position:relative;background:#E04412;box-shadow:inset -5px -5px 0 rgba(3,16,41,.18);animation:bbcc-bounce .8s ease-in-out infinite alternate}',
    '.bbcc-ball:before,.bbcc-ball:after{content:"";position:absolute;background:#031029}',
    '.bbcc-ball:before{left:50%;top:0;bottom:0;width:3px;margin-left:-1.5px}',
    '.bbcc-ball:after{top:50%;left:0;right:0;height:3px;margin-top:-1.5px}',
    '.bbcc-title{margin:0;font-size:1.25rem;font-weight:800;letter-spacing:.02em;text-transform:uppercase}',
    '.bbcc-hint{margin:10px 0 0;font-size:.95rem;line-height:1.45;color:#3d465a}',
    '.bbcc-bar{height:6px;border-radius:3px;background:#f0ece0;margin:16px 4px 0;overflow:hidden}',
    '.bbcc-bar i{display:block;height:100%;width:35%;border-radius:3px;background:linear-gradient(90deg,#E04412,#F09C00);animation:bbcc-slide 1.3s ease-in-out infinite}',
    '.bbcc-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}',
    '.bbcc-actions button,.bbcc-actions a{font:inherit;font-weight:700;font-size:.9rem;text-transform:uppercase;letter-spacing:.05em;text-decoration:none;cursor:pointer;border-radius:999px;padding:.5rem 1.1rem;border:2px solid #E04412;background:#E04412;color:#fff}',
    '.bbcc-actions a{background:transparent;color:#031029;border-color:#031029}',
    '.bbcc-card[hidden],.bbcc-hint[hidden],.bbcc-actions[hidden],.bbcc-bar[hidden]{display:none}',
    '.bbcc-err .bbcc-ball{animation:none;opacity:.45}',
    '@keyframes bbcc-in{from{opacity:0}to{opacity:1}}',
    '@keyframes bbcc-bounce{from{transform:translateY(0)}to{transform:translateY(-14px)}}',
    '@keyframes bbcc-slide{0%{margin-left:-35%}100%{margin-left:100%}}',
    '@media (prefers-reduced-motion:reduce){.bbcc-ball,.bbcc-bar i{animation:none}.bbcc-ph{animation:none}}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var wrap = document.createElement('div'); wrap.className = 'bbcc-wrap';
  var ph = document.createElement('div'); ph.className = 'bbcc-ph';
  ph.innerHTML = '<div class="bbcc-card" role="status" aria-live="polite">' +
    '<div class="bbcc-ball" aria-hidden="true"></div>' +
    '<p class="bbcc-title">Kalender wird geladen …</p>' +
    '<p class="bbcc-hint" hidden></p>' +
    '<div class="bbcc-bar" aria-hidden="true"><i></i></div>' +
    '<div class="bbcc-actions" hidden><button type="button" class="bbcc-retry">Erneut versuchen</button><a class="bbcc-open" target="_blank" rel="noopener">Kalender in neuem Fenster</a></div>' +
    '</div>';
  var card = ph.firstChild, title = card.querySelector('.bbcc-title'), hint = card.querySelector('.bbcc-hint'),
      bar = card.querySelector('.bbcc-bar'), actions = card.querySelector('.bbcc-actions'),
      retry = card.querySelector('.bbcc-retry'), open = card.querySelector('.bbcc-open');
  open.href = base;

  var f = document.createElement('iframe');
  f.title = 'Vereinskalender BBC Stendal';
  f.loading = 'lazy';
  f.src = base;
  wrap.appendChild(f); wrap.appendChild(ph); box.appendChild(wrap);

  var ready = false, started = false, t0 = 0, tick = null;
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
  function startWaiting() {
    stopTick(); started = true; t0 = Date.now();
    card.className = 'bbcc-card'; ph.className = 'bbcc-ph';
    title.textContent = 'Kalender wird geladen …'; hint.hidden = true; bar.hidden = false; actions.hidden = true;
    tick = setInterval(function () {
      if (ready) return stopTick();
      var ms = Date.now() - t0, sec = Math.round(ms / 1000);
      if (ms >= LIMIT) {
        stopTick(); ph.className = 'bbcc-ph bbcc-err';
        title.textContent = 'Der Kalender antwortet gerade nicht';
        hint.hidden = false; hint.textContent = 'Das kann an einer kurzen Störung liegen. Bitte versuche es gleich noch einmal.';
        bar.hidden = true; actions.hidden = false; return;
      }
      if (ms >= HINT_AFTER) {
        hint.hidden = false;
        hint.textContent = 'Nach einer längeren Pause muss der Server erst aufwachen. Das dauert bis zu einer Minute, danach geht es schnell. Bitte einen Moment Geduld … (' + sec + ' s)';
      }
    }, 1000);
  }
  retry.onclick = function () { warm(); f.src = base + '?r=' + Date.now(); startWaiting(); };

  // Zeitmessung erst starten, wenn der Kalender im Sichtbereich liegt (iframe lädt verzögert)
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); if (!ready) startWaiting(); } }, { rootMargin: '200px' });
    io.observe(wrap);
  } else startWaiting();

  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data) return;
    if (e.data.type === 'bbc-cal-height') {
      if (!ready) { ready = true; stopTick(); wrap.className = 'bbcc-wrap bbcc-ready'; if (ph.parentNode) ph.parentNode.removeChild(ph); }
      f.style.height = e.data.height + 'px';
    }
    if (e.data.type === 'bbc-cal-scroll-top') { var r = f.getBoundingClientRect(); if (r.top < 0) window.scrollTo({ top: window.scrollY + r.top - 20, behavior: 'smooth' }); }
  });
})();
