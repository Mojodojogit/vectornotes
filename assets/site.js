// Videos erst laden und abspielen, wenn sie sichtbar sind; bei „Bewegung reduzieren“ nicht automatisch abspielen.
(function () {
  var vids = document.querySelectorAll('video[data-auto]');
  if (!vids.length) return;
  var ruhig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (ruhig || !('IntersectionObserver' in window)) {
    vids.forEach(function (v) { v.controls = true; v.preload = 'metadata'; });
    return;
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () { v.controls = true; }); }
      else v.pause();
    });
  }, { rootMargin: '200px 0px', threshold: 0.25 });
  vids.forEach(function (v) { v.autoplay = false; io.observe(v); });
})();
