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
      e.target.querySelectorAll?.('.rider__stats b').forEach(countUp);
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
    document.querySelectorAll('.hero h1, .section-head h2.display, .page-head h1.display').forEach(maskLines);
    SOLO.forEach(sel => document.querySelectorAll(sel).forEach(el => watch(el)));
    GROUPS.forEach(sel => document.querySelectorAll(sel).forEach(group => {
      [...group.children].forEach((child, i) => watch(child, Math.min(i, 7)));   // cap the wait
    }));
  }

  /* ---------------- headlines ----------------
     Each line of a display heading is given its own frame to come up from, so the words lift
     into place instead of simply fading. Lines are split on the <br> the heading already uses,
     and anything unexpected inside is left exactly as it was. */
  function maskLines(h) {
    // Deliberately not the shared `seen` set: a heading is usually also a child of a group
    // that has already been marked for its own entrance.
    if (h.dataset.masked || !h.childNodes.length || h.querySelector('.line-mask')) return;
    const html = h.innerHTML;
    if (/<(?!br\s*\/?>|em>|\/em>|span|\/span)/i.test(html)) return;      // only plain lines
    const lines = html.split(/<br\s*\/?>/i).filter(l => l.trim());
    if (!lines.length) return;
    h.dataset.masked = '1';
    h.innerHTML = lines.map((l, i) => `<span class="line-mask"><span style="--l:${i}">${l}</span></span>`).join('');
  }

  /* ---------------- counting ----------------
     Rider stats and review counts run up to their number as the card arrives. */
  function countUp(el) {
    if (seen.has(el)) return;
    const raw = el.textContent.trim();
    const target = Number(raw.replace(/[^0-9.]/g, ''));
    if (!raw || !isFinite(target) || target <= 0 || target > 100000 || /[a-z]{3,}/i.test(raw)) return;
    seen.add(el);
    const suffix = raw.replace(/[0-9.,]/g, '');
    const t0 = performance.now(), ms = 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = raw;
    };
    requestAnimationFrame(step);
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
      afterScroll(y);
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

  /* ---------------- tilt ----------------
     Cards lean towards the cursor, with the photo drifting a little further than the frame and
     a soft glare tracking the pointer. It reads as a physical object catching the light rather
     than a rectangle growing. Mouse and trackpad only: on a touchscreen there is no pointer to
     follow, and a tilt that only fires on tap feels broken.
     One listener for the whole page, and the work happens on an animation frame. */
  const TILT = '.card, .rider, .report, .rv-card';
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let tilted = null, pending = null;

  function applyTilt() {
    if (!pending) return;
    const { el, x, y } = pending;
    pending = null;
    const r = el.getBoundingClientRect();
    const px = (x - r.left) / r.width - 0.5;          // -0.5 … 0.5 from the middle
    const py = (y - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-py * 7).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(px * 9).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${((x - r.left) / r.width * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${((y - r.top) / r.height * 100).toFixed(1)}%`);
    el.style.setProperty('--px', `${(px * 10).toFixed(1)}px`);
    el.style.setProperty('--py', `${(py * 10).toFixed(1)}px`);
  }

  function release(el) {
    el.classList.remove('tilt');
    ['--rx', '--ry', '--px', '--py'].forEach(v => el.style.removeProperty(v));
  }

  if (fine) {
    addEventListener('pointermove', e => {
      const el = e.target.closest?.(TILT);
      if (el !== tilted) {
        if (tilted) release(tilted);
        tilted = el;
        if (el) el.classList.add('tilt');
      }
      if (!el) return;
      const had = pending;
      pending = { el, x: e.clientX, y: e.clientY };
      if (!had) requestAnimationFrame(applyTilt);
    }, { passive: true });
    // Leaving the window, or scrolling the card away, should let it settle back.
    addEventListener('pointerleave', () => { if (tilted) { release(tilted); tilted = null; } });
  }

  /* ---------------- the read line ----------------
     A hairline across the very top that fills as you move down the page. */
  const line = document.createElement('div');
  line.className = 'read-line';
  document.body.appendChild(line);

  /* ---------------- tickers ----------------
     The strips lean into the direction you are scrolling and settle back to their own pace when
     you stop. It ties the page together without anyone noticing why. Changing the speed of the
     running animation keeps it perfectly smooth; restarting it would jump. */
  let lastY = scrollY, lean = 0, leaning = false;
  function tickers(rate) {
    document.querySelectorAll('.marquee__track, .announce__track').forEach(t =>
      t.getAnimations?.().forEach(a => { a.playbackRate = rate; }));
  }
  function settle() {
    lean += (0 - lean) * 0.08;
    tickers(1 + lean);
    if (Math.abs(lean) > 0.02) requestAnimationFrame(settle);
    else { tickers(1); leaning = false; }
  }

  function afterScroll(y) {
    const max = document.documentElement.scrollHeight - innerHeight;
    line.style.setProperty('--read', max > 0 ? (y / max).toFixed(4) : 0);
    const v = Math.max(-1.6, Math.min(2.2, (y - lastY) / 45));
    lastY = y;
    if (Math.abs(v) > Math.abs(lean)) lean = v;
    tickers(1 + lean);
    if (!leaning) { leaning = true; requestAnimationFrame(settle); }
  }
})();
