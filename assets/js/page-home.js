/* SPXTR — homepage. Every heading, promise, rider, review and photo comes from Site settings
   (Admin -> Homepage & settings, and Team & crew). Product tiles come from Pages and Products. */
(async function () {
  await loadStore();
  renderChrome();
  renderHome();

  // Admin -> Site settings live preview
  onPreview(msg => {
    if (!msg.settings) return;
    SITE = CMS.mergeSettings(msg.settings);
    renderChrome();
    renderHome();
  });

  $$('[data-rail]').forEach(b => b.addEventListener('click', () => {
    const r = $('#rail'); r.scrollBy({ left: r.clientWidth * 0.75 * +b.dataset.rail, behavior: 'smooth' });
  }));
  $('#best-tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    $$('#best-tabs .tab').forEach(x => x.classList.toggle('active', x === t));
    renderBest(t.dataset.c);
  });
  $('#event-notify').addEventListener('submit', e => { e.preventDefault(); e.target.reset(); toast(SITE.event.kind === 'drop' ? `We'll let you know when ${SITE.event.round || SITE.event.name} drops` : `You're on the list for ${SITE.event.round || SITE.event.name}`); });
  $('#news').addEventListener('submit', e => { e.preventDefault(); e.target.reset(); toast('Welcome to the crew. Check your inbox for 10% off'); });
  setInterval(tick, 1000);
})();

// Shortcuts: set text, and set a link's text + address (hiding it when there's no address)
const txt = (sel, value) => { const el = $(sel); if (el) el.textContent = value || ''; };
const linkTo = (sel, text, url) => {
  const el = $(sel); if (!el) return;
  const label = el.querySelector('span') || el;
  label.textContent = text || '';
  el.href = safeLink(url) || '#';
  el.hidden = !text;
};
// Only real addresses: this site's pages, or an https link the admin pasted.
const safeLink = u => (/^(https:\/\/|mailto:|\/|#|\.\/|[a-z0-9-]+(\.html|\/))/i.test(u || '') ? u : '');

function renderHome() {
  const h = SITE.hero;
  $('#hero-img').src = safeUrl(h.image) || IMG + 'hero-roost.jpg';
  $('#hero-eyebrow').textContent = h.eyebrow;
  $('#hero-title').innerHTML = `${esc(h.line1)}<br><em>${esc(h.line2)}</em>`;
  $('#hero-sub').textContent = h.subtitle;
  $('#hero-cta').textContent = h.cta;
  const promises = (h.bar || []).filter(Boolean);
  const bar = $('#hero-bar');
  bar.innerHTML = promises
    .map((t, i) => `<div><small>0${i + 1} //</small>${esc(String(t).replace('{free}', money(SITE.freeShippingOver)))}</div>`).join('');
  bar.dataset.count = promises.length;            // lets the layout fit 1–4 promises neatly
  bar.style.setProperty('--count', Math.max(1, promises.length));
  bar.hidden = !promises.length;

  const words = (SITE.marquee || []).filter(Boolean);
  // Printed twice so the ticker can scroll seamlessly.
  $('#marquee').innerHTML = [...words, ...words].map(w => `<span>${esc(w)}</span>`).join('');

  // Pages the admin has set up
  txt('#pages-eyebrow', SITE.pagesSection.eyebrow);
  txt('#pages-title', SITE.pagesSection.title);
  txt('#pages-link', SITE.pagesSection.link);
  const tiles = COLLECTIONS.slice(0, 6);
  $('#disc').style.setProperty('--tiles', Math.max(tiles.length, 1));
  $('#disc').innerHTML = tiles.map((c, i) => `
    <a href="shop/?page=${encodeURIComponent(c.slug)}"><img src="${imgSrc(c.hero_image)}" alt="${esc(c.name)}" loading="lazy">
      <div class="disc__label"><span class="code">Page 0${i + 1}</span><h3>${esc(c.name)}</h3></div></a>`).join('');

  $('#season-eyebrow').textContent = `Sec. 02 // ${SITE.season}`;
  txt('#new-title', SITE.newSection.title);
  txt('#new-intro', SITE.newSection.intro);
  const fresh = PRODUCTS.filter(p => p.is_new);
  $('#rail').innerHTML = (fresh.length ? fresh : PRODUCTS.slice(0, 8)).map(productCard).join('');

  renderTeam();
  renderEvent();
  txt('#best-eyebrow', SITE.bestSection.eyebrow);
  txt('#best-title', SITE.bestSection.title);
  renderBestTabs();
  renderBest($('#best-tabs .tab.active')?.dataset.c || 'All');
  renderTested();
  renderReports();

  const so = SITE.teamOrders;
  $('#served').hidden = !so.show;
  txt('#served-title', so.title);
  txt('#served-text', so.text);
  linkTo('#served-cta', so.ctaText, so.ctaUrl);

  const nl = SITE.newsletter;
  $('#newsletter').hidden = !nl.show;
  txt('#news-eyebrow', nl.eyebrow);
  txt('#news-title', nl.title);
  txt('#news-text', nl.text);
  txt('#news-fine', nl.fine);

  $('#ig-handle').firstChild.textContent = SITE.instagram + ' ';
  const ig = instagramLink();
  $('#ig-handle').href = ig || '#';
  if (ig) { $('#ig-handle').target = '_blank'; $('#ig-handle').rel = 'noopener noreferrer'; }
}

function renderTested() {
  const t = SITE.tested;
  $('#tested').hidden = !t.show;
  if (!t.show) return;
  txt('#tested-eyebrow', t.eyebrow);
  txt('#tested-title', t.title);
  txt('#tested-intro', t.intro);
  txt('#tested-cta', t.cta);
  $('#tested-imgs').innerHTML = (t.images || []).filter(Boolean)
    .map((src, i) => `<div><img src="${imgSrc(src)}" alt="" loading="lazy">${i === 0 ? '<span class="corners"></span>' : ''}</div>`).join('');
  $('#tested-specs').innerHTML = (t.specs || []).filter(r => r.label || r.value)
    .map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.value)}</td></tr>`).join('');
}

function renderReports() {
  txt('#reports-eyebrow', SITE.reportsSection.eyebrow);
  txt('#reports-title', SITE.reportsSection.title);
  const initials = name => String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  // Approved customer reviews the admins marked "Feature on homepage" come first, then the hand-written ones.
  const productName = id => (PRODUCTS.find(p => p.id === id) || {}).name || '';
  const featured = (typeof REVIEWS !== 'undefined' ? REVIEWS : []).filter(r => r.status === 'approved' && r.featured)
    .map(r => ({ quote: r.body, name: r.name, stars: r.rating, verified: r.verified, meta: productName(r.product_id), photos: r.photos || [] }));
  const all = [...featured, ...(SITE.reports || [])].filter(r => r.quote).slice(0, 9);
  const shown = all.length > 3 ? all.slice(0, all.length - all.length % 3) : all;   // full rows of 3 on desktop
  $('#reports').innerHTML = shown.map(r => {
    const photos = (r.photos || []).map(safeUrl).filter(Boolean);
    return `
    <blockquote class="report">
      <div class="report__top"><span class="stars">${'★'.repeat(Math.max(1, Math.min(5, +r.stars || 5)))}</span>${r.verified ? '<span class="verified">✔ Verified buyer</span>' : ''}</div>
      <q>${esc(r.quote)}</q>
      ${photos.length ? `<div class="report__photos">${photos.map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
      <footer><i>${esc(initials(r.name))}</i><div>${esc(r.name)}<small>${esc(r.meta)}</small></div></footer>
    </blockquote>`;
  }).join('');
  // Instagram strip: each photo opens its own post if one was pasted, otherwise the SPXTR profile.
  $('#ig').innerHTML = (SITE.ig || []).filter(x => x.image).map(x => {
    const u = safeLink(x.url) || instagramLink();
    return `<a href="${esc(u || '#')}"${u ? ' target="_blank" rel="noopener noreferrer"' : ''}><img src="${imgSrc(x.image)}" alt="" loading="lazy"></a>`;
  }).join('');
}

function renderTeam() {
  const t = SITE.teamSection;
  txt('#team-eyebrow', t.eyebrow);
  txt('#team-title', t.title);
  txt('#team-intro', t.intro);
  linkTo('#team-cta', t.ctaText, t.ctaUrl);
  const riders = (SITE.team || []).filter(r => r.name);
  $('#team').hidden = !riders.length;
  $('#team-grid').innerHTML = riders.map(r => {
    const p = PRODUCTS.find(x => x.slug === r.product);
    return `<article class="rider">
      <div class="rider__img"><img src="${imgSrc(r.image)}" alt="${esc(r.name)}" loading="lazy">${r.number ? `<span class="rider__num">#${esc(r.number)}</span>` : ''}<span class="corners"></span></div>
      <div class="rider__body">
        <span class="eyebrow">${esc(r.discipline)}</span>
        <h3>${esc(r.name)}</h3>
        <div class="rider__stats">${r.home ? `<div><b>${esc(r.home)}</b>Home</div>` : ''}${r.statValue ? `<div><b>${esc(r.statValue)}</b>${esc(r.statLabel)}</div>` : ''}</div>
        ${p ? `<a class="link-arrow" href="${productUrl(p)}">Rides in: ${esc(p.name)} ${ICON.arrow}</a>` : ''}
      </div>
    </article>`;
  }).join('');
}

// The countdown block is either an event (date, gates time, venue) or a product drop (just a timer).
// Venue is optional for both: leave it blank and it simply isn't shown.
function renderEvent() {
  const ev = SITE.event, drop = ev.kind === 'drop';
  $('#event').hidden = !ev.show;
  if (!ev.show) return;
  $('#event-img').src = safeUrl(ev.image) || IMG + 'event-bg.jpg';
  linkTo('#event-cta', ev.ctaText, ev.ctaUrl);
  const d = new Date(ev.date);
  txt('#event-eyebrow', `Sec. 04 // ${drop ? 'Next drop' : 'Next event'}`);
  $('#event-title').innerHTML = `${esc(ev.name)}${ev.round ? `<br><em>${esc(ev.round)}</em>` : ''}`;
  $('#event-blurb').textContent = ev.blurb;
  $('#event-meta').innerHTML = [
    ['Date', isNaN(d) ? 'TBC' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })],
    [drop ? 'Drops at' : 'Gates', isNaN(d) ? 'TBC' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })],
    ev.place ? [drop ? 'Where' : 'Venue', ev.place] : null,
  ].filter(Boolean).map(([k, v]) => `<div><b>${esc(v)}</b>${k}</div>`).join('');
  const input = $('#event-notify input');
  input.placeholder = drop ? 'Email for drop alerts' : 'Email for event alerts';
  input.setAttribute('aria-label', input.placeholder);
  tick();
}
function tick() {
  const ev = SITE.event, drop = ev.kind === 'drop';
  const ms = new Date(ev.date) - Date.now();
  const t = Math.max(0, ms) / 1000 || 0;
  const v = { d: t / 86400, h: t / 3600 % 24, m: t / 60 % 60, s: t % 60 };
  $$('#clock b').forEach(b => b.textContent = String(Math.floor(v[b.dataset.u])).padStart(2, '0'));
  txt('#clock-label', ms > 0 || isNaN(ms) ? (drop ? 'Drops in' : 'Gates open in') : (drop ? 'Out now' : 'Live now'));
}

// Tabs for the product types that have something in stock (up to 4, in the order set in the admin).
function renderBestTabs() {
  const current = $('#best-tabs .tab.active')?.dataset.c || 'All';
  const inStock = new Set(PRODUCTS.filter(p => p.stock > 0).map(p => p.category));
  const order = SITE.productTypes || [];
  const types = [...order.filter(c => inStock.has(c)), ...[...inStock].filter(c => c && !order.includes(c))].slice(0, 4);
  const active = types.includes(current) ? current : 'All';
  $('#best-tabs').innerHTML = ['All', ...types].map(c => `<button class="tab ${c === active ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  $('#best-tabs').hidden = types.length < 2;
}
function renderBest(c) {
  const list = PRODUCTS.filter(p => (c === 'All' || p.category === c) && p.stock > 0).sort((a, b) => (b.badge === 'Bestseller') - (a.badge === 'Bestseller')).slice(0, 8);
  $('#best').innerHTML = list.map(productCard).join('') || '<p class="muted">Nothing here yet.</p>';
}
