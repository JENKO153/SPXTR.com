/* =========================================================
   SPXTR — motion
   Entrance reveals, scroll feel and a little feedback. Three rules it keeps to:

   1. Nothing is ever hidden unless this file is running and the visitor is happy with movement.
      The CSS only hides things once <html> carries .motion, which is set below, so a blocked
      script or "reduce motion" leaves a perfectly ordinary page.
   2. Only transform and opacity move, so nothing reflows while scrolling.
   3. Everything arrives once and is then left alone.
   ========================================================= */
(function () {
  const root = document.documentElement;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const preview = new URLSearchParams(location.search).has('preview');   // the admin's live preview
  if (still || preview || !('IntersectionObserver' in window)) return;
  root.classList.add('motion');

  /* ---------------- entrance reveals ----------------
     These come in on their own; the groups bring their children in one after another, which
     reads as deliberate rather than mechanical. */
  const SOLO = [
    '.section-head', '.event__grid > div', '.field > div', '.served > div',
    '.newsletter .wrap > *', '.page-head .wrap > *', '.pdp__info', '.pdp__gallery',
    '.order-head', '.order-track', '.order-help', '.done > div', '.rv-form', '.rv-gear__item',
    '.maker-note', '.accordion', '.perks',
  ];
  const GROUPS = [
    '.hero__inner', '#rail', '#best', '#related', '#grid', '#team-grid', '#reports', '#ig', '#disc',
    '#tested-imgs', '#event-meta', '#hero-bar', '.clock__row', '.rv-list', '.order-items',
    '.order-sum', '.filters', '.pdp__thumbs',
  ];

  const seen = new WeakSet();
  let net;                                  // the safety-net timer (see catchUp, further down)
  function armNet() { if (!net) net = setInterval(catchUp, 1200); }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

  const watch = (el, step = 0) => {
    if (!el || seen.has(el) || el.classList.contains('rise')) return;
    seen.add(el);
    el.classList.add('rise');
    if (step) el.style.setProperty('--step', step);
    // Already on screen as the page lands: let it in on the next frame, so it plays rather
    // than snapping into place.
    if (el.getBoundingClientRect().top < innerHeight * 0.95) requestAnimationFrame(() => el.classList.add('in'));
    else io.observe(el);
  };

  function scan() {
    SOLO.forEach(sel => document.querySelectorAll(sel).forEach(el => watch(el)));
    GROUPS.forEach(sel => document.querySelectorAll(sel).forEach(group => {
      [...group.children].forEach((child, i) => watch(child, Math.min(i, 7)));   // cap the wait
    }));
  }

  /* ---------------- photos ----------------
     Pictures land whenever they land. Fading each one in stops the page popping as they
     arrive, which is most of the difference between "fast" and "cheap". */
  const FADE_IN = '.card__media img, .cat img, .rider__img img, #ig img, .pdp__gallery img, .rv-card__photos img, .disc img, .report__photos img';
  function fade(img) {
    if (seen.has(img)) return;
    seen.add(img);
    const done = () => img.classList.add('lit');
    if (img.complete && img.naturalWidth) { done(); return; }
    img.classList.add('lift');
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    // A picture can finish loading in the moment between the check above and the listener
    // going on, so check once more, and never leave one invisible for longer than a breath.
    if (img.complete) done();
    setTimeout(done, 2500);
  }

  /* ---------------- run, and keep up ----------------
     Every page draws its content after load, and the shop redraws on every filter, so watch
     for new content instead of running once and hoping. */
  const sweep = () => { scan(); document.querySelectorAll(FADE_IN).forEach(fade); armNet(); };
  sweep();
  let queued;
  new MutationObserver(() => { clearTimeout(queued); queued = setTimeout(sweep, 50); })
    .observe(document.body, { childList: true, subtree: true });

  /* ---------------- scroll ----------------
     The header settles into a tighter bar once you leave the top, and the banner drifts a
     little slower than the page, which reads as depth rather than as an effect. Phones skip
     the parallax: it costs more there than it gives. */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      root.classList.toggle('scrolled', y > 40);
      const img = innerWidth >= 900 && document.querySelector('.hero__img');
      if (img) img.style.transform = `translate3d(0, ${(Math.min(y, innerHeight) * 0.16).toFixed(1)}px, 0)`;
      catchUp();
      ticking = false;
    });
  }

  /* ---------------- the safety net ----------------
     Nothing may stay invisible because of a missed callback. Anything that has reached the
     screen and hasn't come in yet is shown here: a very fast scroll, a section switched on
     after the page drew, or a browser that quietly dropped an observer entry. */
  function catchUp() {
    const waiting = document.querySelectorAll('.rise:not(.in)');
    waiting.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight) { el.classList.add('in'); io.unobserve(el); }   // on screen, or already passed
    });
    // Nothing left to wait for: stop checking. It starts again the moment new content arrives.
    if (!waiting.length && net) { clearInterval(net); net = null; }
  }
  armNet();
  /* ---------------- the countdown ----------------
     Each digit drops into place as it changes, so the clock reads as running rather than
     as text being rewritten. */
  function watchClock() {
    document.querySelectorAll('.clock__row b').forEach(b => {
      if (seen.has(b)) return;
      seen.add(b);
      let last = b.textContent;
      new MutationObserver(() => {
        if (b.textContent === last) return;
        last = b.textContent;
        b.classList.remove('tick');
        void b.offsetWidth;                       // restart the keyframes
        b.classList.add('tick');
      }).observe(b, { childList: true, characterData: true, subtree: true });
    });
  }
  setTimeout(watchClock, 800);
  setTimeout(watchClock, 2500);

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();
