// Videos erst laden und abspielen, wenn sie sichtbar sind; bei „Bewegung reduzieren“ nicht automatisch abspielen.
// Faellt eine Quelle beim Dekodieren aus (z. B. Hardware-Decoder), wird die naechste <source> versucht; zuletzt bleibt das Standbild mit Bedienelementen.
(function () {
  var vids = document.querySelectorAll('video[data-auto]');
  if (!vids.length) return;
  var ruhig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function naechsteQuelle(v) {
    var q = [].slice.call(v.querySelectorAll('source'));
    var i = q.findIndex(function (s) { return s.src === v.currentSrc; });
    var rest = q.slice(i + 1).filter(function (s) { return !s.type || v.canPlayType(s.type); });
    if (!rest.length) { v.controls = true; return; }
    var t = v.currentTime || 0, lief = !v.paused;
    v.src = rest[0].src; v.load();
    v.addEventListener('loadedmetadata', function () { try { v.currentTime = t; } catch (e) {} if (lief) v.play().catch(function () {}); }, { once: true });
  }
  vids.forEach(function (v) {
    v.addEventListener('error', function () { naechsteQuelle(v); });
    var q = v.querySelectorAll('source');
    if (q.length) q[q.length - 1].addEventListener('error', function () { v.controls = true; });
  });
  if (ruhig || !('IntersectionObserver' in window)) {
    vids.forEach(function (v) { v.controls = true; v.preload = 'metadata'; });
    return;
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () { if (v.error) return; v.controls = true; }); }
      else v.pause();
    });
  }, { rootMargin: '200px 0px', threshold: 0.25 });
  vids.forEach(function (v) { v.autoplay = false; io.observe(v); });
})();
