// vectornotes.de – kleine Helfer ohne Bibliothek: Videos, Karussells, Einblenden beim Scrollen, dezentes Neigen.
// „Bewegung reduzieren“ wird respektiert: keine automatische Wiedergabe, kein Einblenden, kein Neigen.
(function () {
  var ruhig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IO = 'IntersectionObserver' in window;

  // ---------------------------------------------------------------- Videos
  // Erst laden und abspielen, wenn sichtbar (und im Karussell die aktive Folie). Faellt eine Quelle beim Dekodieren aus
  // (z. B. Hardware-Decoder), wird die naechste <source> versucht; zuletzt bleibt das Standbild mit Bedienelementen.
  var vids = [].slice.call(document.querySelectorAll('video[data-auto]'));
  function naechsteQuelle(v) {
    var q = [].slice.call(v.querySelectorAll('source'));
    var i = q.findIndex(function (s) { return s.src === v.currentSrc; });
    var rest = q.slice(i + 1).filter(function (s) { return !s.type || v.canPlayType(s.type); });
    if (!rest.length) { v.controls = true; return; }
    var t = v.currentTime || 0, lief = !v.paused;
    v.src = rest[0].src; v.load();
    v.addEventListener('loadedmetadata', function () { try { v.currentTime = t; } catch (e) {} if (lief) v.play().catch(function () {}); }, { once: true });
  }
  function spielen(v) { var p = v.play(); if (p && p.catch) p.catch(function () { if (!v.error) v.controls = true; }); }
  vids.forEach(function (v) {
    v.autoplay = false;
    v.addEventListener('error', function () { naechsteQuelle(v); });
    var q = v.querySelectorAll('source');
    if (q.length) q[q.length - 1].addEventListener('error', function () { v.controls = true; });
  });
  var sichtbar = new WeakMap();
  function pruefeVideo(v) {
    if (ruhig || !IO) return;
    var folie = v.closest('.folie');
    var aktiv = !folie || folie.classList.contains('aktiv');
    if (sichtbar.get(v) && aktiv) spielen(v); else v.pause();
  }
  if (ruhig || !IO) {
    vids.forEach(function (v) { v.controls = true; v.preload = 'metadata'; });
  } else {
    var vio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { sichtbar.set(e.target, e.isIntersecting); pruefeVideo(e.target); });
    }, { rootMargin: '150px 0px', threshold: 0.3 });
    vids.forEach(function (v) { vio.observe(v); });
  }

  // ---------------------------------------------------------------- Karussells (Scroll-Snap)
  [].forEach.call(document.querySelectorAll('[data-karussell]'), function (k) {
    var spur = k.querySelector('.spur');
    var folien = [].slice.call(spur.querySelectorAll('.folie'));
    var reiter = [].slice.call(k.querySelectorAll('[role=tab]'));
    var pfeile = [].slice.call(k.querySelectorAll('[data-schritt]'));
    var punkte = k.querySelector('.punkte');
    var aktuell = -1;
    if (punkte) folien.forEach(function () { punkte.appendChild(document.createElement('i')); });
    function setze(i) {
      if (i === aktuell) return;
      aktuell = i;
      folien.forEach(function (f, j) {
        f.classList.toggle('aktiv', j === i);
        // Standbilder der Nachbarfolien erst jetzt laden (spart Daten beim ersten Aufruf)
        var pv = Math.abs(j - i) <= 1 && f.querySelector('video[data-poster]');
        if (pv) { pv.poster = pv.dataset.poster; pv.removeAttribute('data-poster'); }
        var v = f.querySelector('video');
        if (v) pruefeVideo(v);
      });
      reiter.forEach(function (r, j) { r.setAttribute('aria-selected', j === i ? 'true' : 'false'); r.tabIndex = j === i ? 0 : -1; });
      if (punkte) [].forEach.call(punkte.children, function (p, j) { p.classList.toggle('an', j === i); });
      pfeile.forEach(function (p) { var s = +p.dataset.schritt; p.disabled = (s < 0 && i === 0) || (s > 0 && i === folien.length - 1); });
    }
    function geheZu(i) {
      i = Math.max(0, Math.min(folien.length - 1, i));
      var f = folien[i];
      spur.scrollTo({ left: f.offsetLeft - (spur.clientWidth - f.offsetWidth) / 2, behavior: ruhig ? 'auto' : 'smooth' });
      setze(i);
    }
    function mitteFinden() {
      var m = spur.scrollLeft + spur.clientWidth / 2, best = 0, d = Infinity;
      folien.forEach(function (f, j) { var x = Math.abs(f.offsetLeft + f.offsetWidth / 2 - m); if (x < d) { d = x; best = j; } });
      setze(best);
    }
    var warte;
    spur.addEventListener('scroll', function () { clearTimeout(warte); warte = setTimeout(mitteFinden, 90); }, { passive: true });
    reiter.forEach(function (r, j) {
      r.addEventListener('click', function () { geheZu(j); });
      r.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? j + 1 : e.key === 'ArrowLeft' ? j - 1 : null;
        if (n === null) return;
        e.preventDefault(); n = (n + reiter.length) % reiter.length; geheZu(n); reiter[n].focus();
      });
    });
    pfeile.forEach(function (p) { p.addEventListener('click', function () { geheZu(aktuell + +p.dataset.schritt); }); });
    spur.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); geheZu(aktuell + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); geheZu(aktuell - 1); }
    });
    setze(0);
    var breite = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === breite) return; // Handy: Adressleiste ein/aus aendert nur die Hoehe
      breite = window.innerWidth; clearTimeout(warte); warte = setTimeout(function () { geheZu(aktuell); }, 150);
    });
  });

  // ---------------------------------------------------------------- Einblenden beim Scrollen
  var rs = document.querySelectorAll('.r');
  if (ruhig || !IO) {
    [].forEach.call(rs, function (e) { e.classList.add('sichtbar'); });
  } else {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('sichtbar'); rio.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    [].forEach.call(rs, function (e) { rio.observe(e); });
  }

  // ---------------------------------------------------------------- Dezentes Neigen (nur Maus, nur ohne reduzierte Bewegung)
  if (!ruhig && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    [].forEach.call(document.querySelectorAll('[data-tilt]'), function (b) {
      var g = b.querySelector('.geraet.tablet') || b.querySelector('.geraet');
      if (!g) return;
      var raf = 0;
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () { g.style.transform = 'perspective(1400px) rotateY(' + (x * 5).toFixed(2) + 'deg) rotateX(' + (-y * 4).toFixed(2) + 'deg)'; });
      });
      b.addEventListener('pointerleave', function () { cancelAnimationFrame(raf); g.style.transform = ''; });
    });
  }
})();
