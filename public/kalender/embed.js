/* Einbindung in WordPress:
 * <div id="bbc-kalender"></div>
 * <script src="https://DEIN-SERVER/kalender/embed.js" async></script>
 */
(function () {
  var s = document.currentScript || document.querySelector('script[src*="kalender/embed.js"]');
  var origin = new URL(s.src).origin;
  var box = document.getElementById('bbc-kalender') || s.parentNode;
  var f = document.createElement('iframe');
  f.src = origin + '/kalender/';
  f.title = 'Vereinskalender BBC Stendal';
  f.loading = 'lazy';
  f.style.cssText = 'width:100%;border:0;min-height:700px;display:block;background:transparent';
  box.appendChild(f);
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data) return;
    if (e.data.type === 'bbc-cal-height') f.style.height = e.data.height + 'px';
    if (e.data.type === 'bbc-cal-scroll-top') { var r = f.getBoundingClientRect(); if (r.top < 0) window.scrollTo({ top: window.scrollY + r.top - 20, behavior: 'smooth' }); }
  });
})();
