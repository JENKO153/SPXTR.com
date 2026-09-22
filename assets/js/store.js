/* =========================================================
   SPXTR — storefront behaviour (shared by every store page)
   Content comes from CMS (Supabase, or demo data). Every stored
   string is passed through esc() before it's written into HTML.
   ========================================================= */

const IMG = 'assets/img/';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const PREVIEW = new URLSearchParams(location.search).has('preview');
// Real Stripe checkout once it's switched on in config.js and Supabase is connected.
const LIVE = !!window.SPX_CONFIG.stripe?.enabled && CMS.configured && !PREVIEW;

// Filled by loadStore()
let SITE = CMS.mergeSettings({});
let COLLECTIONS = [];
let PRODUCTS = [];
let REVIEWS = [];   // approved customer reviews (reviews.js)

// The Instagram profile: the address set in the admin if there is one, otherwise built from the handle.
function instagramLink() {
  if (/^https:\/\/(www\.)?instagram\.com\//i.test(SITE.instagramUrl || '')) return SITE.instagramUrl;
  const handle = String(SITE.instagram || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : '';
}

const money = n => STORE.currency + Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
// Only real image addresses get through: https, this site's images, uploaded photos (demo) or a blob: preview.
const safeUrl = u => (/^(https:\/\/|assets\/img\/|data:image\/(webp|jpeg|png);base64,|blob:)/.test(u || '') ? u : '');
const imgSrc = u => esc(safeUrl(u) || IMG + 'hero-roost.jpg');
const collectionById = id => COLLECTIONS.find(c => c.id === id);
const productUrl = p => `product/?p=${encodeURIComponent(p.slug)}`;

async function loadStore() {
  try {
    const data = PREVIEW ? await previewData() : await CMS.loadPublic();
    SITE = data.settings; COLLECTIONS = data.collections; PRODUCTS = data.products; REVIEWS = data.reviews || [];
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin', '<div style="background:#FF3B2F;color:#fff;padding:10px 16px;font:600 14px sans-serif;text-align:center">The store is having trouble loading. Please refresh in a moment.</div>');
  }
}

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="m5 12 5 5 9-10"/></svg>',
};

// Brand mark. Uses the client's artwork; if a file goes missing, a drawn ghost / gothic text stand in.
const GHOST_SVG = `<svg class="logo__ghost" viewBox="0 0 100 120" aria-hidden="true">
  <path fill="var(--bone)" d="M50 4C30 4 22 20 22 36v16C14 60 8 66 4 78c8-4 12-6 16-6-6 10-8 20-6 32 6-10 10-16 14-18 0 10 2 20 10 30 0-10 2-18 6-22 2 8 6 16 12 22 0-10 2-18 4-24 4 6 10 12 16 14-4-10-4-18-2-24 6 2 12 8 18 14-2-12-6-22-12-30l-2-30C78 20 70 4 50 4Z"/>
  <path fill="var(--ink)" d="M33 31l13 7c0 6-4 9-8 7s-5-7-5-14Zm34 0-13 7c0 6 4 9 8 7s5-7 5-14Z"/>
</svg>`;
const logoHtml = () => `<a href="./" class="logo" aria-label="${STORE.name} home">
  <img class="logo__ghost" src="${STORE.brand.ghost}" alt="" data-fallback="ghost">
  <img class="logo__word" src="${STORE.brand.wordmark}" alt="${STORE.name}" data-fallback="word">
</a>`;
function wireBrandFallbacks(root = document) {
  $$('img[data-fallback]', root).forEach(img => img.addEventListener('error', () => {
    if (img.dataset.fallback === 'ghost') img.outerHTML = GHOST_SVG;
    else { const t = document.createElement('span'); t.className = 'logo__text'; t.textContent = STORE.name; img.replaceWith(t); }
  }, { once: true }));
}

/* ---------------- chrome ---------------- */
function navItems() {
  return [
    ['shop/', 'Shop all', 'shop'],
    ['shop/?filter=new', 'New', 'new'],
    ...COLLECTIONS.filter(c => c.show_in_nav).map(c => [`shop/?page=${encodeURIComponent(c.slug)}`, c.name, c.slug]),
    ['./#team', 'Team', 'team'],
  ];
}

function renderChrome(active = '') {
  const nav = navItems();
  const ann = SITE.announcements.length ? SITE.announcements : [SITE.footer.tagline || STORE.tagline];
  $('#chrome-top').innerHTML = `
    <div class="announce" aria-label="Store announcements">
      <div class="announce__track">${[...ann, ...ann].map(a => `<span>${esc(a)}</span>`).join('')}</div>
    </div>
    <header class="header">
      <div class="wrap header__row">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="icon-btn menu-btn" aria-label="Open menu" data-open-menu>${ICON.menu}</button>
          ${logoHtml()}
        </div>
        <nav class="nav" aria-label="Primary">${nav.map(([h, l, k]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${esc(l)}</a>`).join('')}</nav>
        <div class="header__icons">
          <span class="vet-chip"><i></i>${esc(SITE.season)}</span>
          <button class="icon-btn" aria-label="Search" data-search>${ICON.search}</button>
          <button class="icon-btn" aria-label="Open cart" data-open-cart>${ICON.bag}<span class="bag-count"></span></button>
        </div>
      </div>
      <div class="search-bar"><form class="wrap" action="shop/">${ICON.search.replace('<svg', '<svg width="22" height="22"')}<input name="q" maxlength="80" placeholder="Search tees, hoodies, caps…" aria-label="Search products"><button type="button" class="icon-btn" data-search aria-label="Close search">${ICON.close}</button></form></div>
    </header>
    <div class="mobile-nav" aria-hidden="true">
      <div class="mobile-nav__top">${logoHtml()}<button class="icon-btn" data-close-menu aria-label="Close menu">${ICON.close}</button></div>
      ${nav.map(([h, l]) => `<a class="big" href="${h}">${esc(l)}</a>`).join('')}
    </div>`;

  $('#chrome-bottom').innerHTML = `
    <footer class="footer">
      <div class="wrap">
        <div class="footer__grid">
          <div>
            ${logoHtml()}
            <p class="footer__motto">${esc(SITE.footer.tagline)}</p>
            <p style="max-width:380px;margin:0">${esc(SITE.footer.blurb)}</p>
          </div>
          <div><h5>// Shop</h5><ul><li><a href="shop/?filter=new">New</a></li>${COLLECTIONS.map(c => `<li><a href="shop/?page=${encodeURIComponent(c.slug)}">${esc(c.name)}</a></li>`).join('')}</ul></div>
          <div><h5>// Support</h5><ul><li><a href="#">Shipping</a></li><li><a href="#">Returns</a></li><li><a href="#">Size guide</a></li><li><a href="#">Warranty</a></li><li><a href="mailto:${esc(SITE.footer.email || STORE.email)}">Contact</a></li></ul></div>
          <div><h5>// The crew</h5><ul><li><a href="./#team">Team riders</a></li><li><a href="./#event">Events</a></li><li><a href="${esc(instagramLink() || '#')}"${instagramLink() ? ' target="_blank" rel="noopener noreferrer"' : ''}>Instagram</a></li><li><a href="#">YouTube</a></li></ul></div>
        </div>
        <div class="footer__bottom">
          <span>© ${new Date().getFullYear()} ${STORE.name} · ${esc(SITE.footer.tagline)}</span>
          <div class="pay"><span>Visa</span><span>MC</span><span>Amex</span><span>PayPal</span><span>Apple Pay</span></div>
        </div>
      </div>
      <div class="footer__giant" aria-hidden="true"></div>
    </footer>
    <div class="scrim" data-close-cart></div>
    <aside class="drawer" aria-label="Cart" aria-hidden="true">
      <div class="drawer__head"><h3>Your cart</h3><button class="icon-btn" data-close-cart aria-label="Close cart">${ICON.close}</button></div>
      <div class="ship-meter"></div>
      <div class="drawer__items"></div>
      <div class="drawer__foot"></div>
    </aside>
    <div class="toast" role="status">${ICON.check}<span></span></div>`;

  // Brand accent from Admin -> Customise (the page is still hidden, so there's no colour flash)
  const accent = SITE.theme?.accent;
  window.spxAccent?.apply(validAccent(accent) ? accent : null);

  // Pages start hidden (class="is-loading" on <html>) so nobody sees placeholder content
  // before the real content arrives. The page's own render runs right after this in the same
  // task, so reveal just after it. (A timer, not requestAnimationFrame: animation frames are
  // paused in background tabs, which would leave the page blank until the 3s fallback.)
  setTimeout(() => document.documentElement.classList.remove('is-loading'), 0);

  const giant = $('.footer__giant');
  giant.style.webkitMaskImage = giant.style.maskImage = `url("${STORE.brand.wordmarkMask}")`;
  wireBrandFallbacks();

  if (!renderChrome.wired) {
    renderChrome.wired = true;
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCart(); $('.mobile-nav')?.classList.remove('open'); } });
  }
  renderCart();
  if (new URLSearchParams(location.search).get('checkout') === 'cancelled') {
    history.replaceState(null, '', location.pathname + location.search.replace(/[?&]checkout=cancelled/, '').replace(/^&/, '?'));
    toast('Checkout cancelled. Your cart is still here');
  }
}

// One delegated handler for everything clickable in the chrome and product cards.
function onDocumentClick(e) {
  if (PREVIEW && e.target.closest('a[href]')) { e.preventDefault(); return; } // admin preview: stay on the page
  // Placeholder links (href="#") stay put. Pages in sub-folders use <base>, which would otherwise send "#" home.
  if (e.target.closest('a[href="#"]')) { e.preventDefault(); return; }
  const t = e.target.closest('[data-open-cart],[data-close-cart],[data-open-menu],[data-close-menu],[data-search],[data-add],[data-wish],[data-qty],[data-remove],[data-checkout],[data-region]');
  if (!t) return;
  if (t.matches('[data-open-cart]')) openCart();
  else if (t.matches('[data-close-cart]')) closeCart();
  else if (t.matches('[data-open-menu]')) $('.mobile-nav').classList.add('open');
  else if (t.matches('[data-close-menu]')) $('.mobile-nav').classList.remove('open');
  else if (t.matches('[data-search]')) { const s = $('.search-bar'); s.classList.toggle('open'); if (s.classList.contains('open')) $('input', s).focus(); }
  else if (t.matches('[data-add]')) addToCart(t.dataset.add, t.dataset.size);
  else if (t.matches('[data-wish]')) t.classList.toggle('on');
  else if (t.matches('[data-qty]')) updateQty(+t.dataset.line, +t.dataset.qty);
  else if (t.matches('[data-remove]')) removeLine(+t.dataset.line);
  else if (t.matches('[data-checkout]')) checkout(t);
  else if (t.matches('[data-region]')) { regionStore.set(t.dataset.region); renderCart(); }
}

/* ---------------- product card ---------------- */
function productCard(p) {
  const soldOut = p.stock === 0;
  const cls = p.compare_at ? 'sale' : p.badge === 'Low stock' ? 'low' : p.badge === 'New' ? 'hot' : '';
  const badge = !soldOut && p.badge ? `<span class="card__badge ${cls}">${esc(p.badge)}</span>` : '';
  const price = p.compare_at ? `<s>${money(p.compare_at)}</s>${money(p.price)}` : money(p.price);
  return `
    <article class="card${soldOut ? ' soldout' : ''}">
      <div class="card__media">
        <a href="${productUrl(p)}" tabindex="-1">${badge}<img src="${imgSrc(p.images[0])}" alt="${esc(p.name)}" loading="lazy"></a>
        <span class="corners"></span>
        ${soldOut ? '<div class="soldout-tag"><span>Sold out</span></div>' : ''}
        <button class="card__wish" aria-label="Save ${esc(p.name)}" data-wish>${ICON.heart}</button>
        ${soldOut ? '' : `<div class="quick">
          <div class="quick__label">// Quick add</div>
          <div class="quick__sizes">${p.sizes.map(s => `<button data-add="${esc(p.id)}" data-size="${esc(s)}">${s === 'One size' ? 'Add' : esc(s)}</button>`).join('')}</div>
        </div>`}
      </div>
      <div class="card__info">
        <div class="card__sku"><span>${esc(p.sku)}</span><span>${esc(p.spec || p.category)}</span></div>
        <div class="card__row">
          <h3 class="card__name"><a href="${productUrl(p)}">${esc(p.name)}</a></h3>
          <div class="card__price">${price}</div>
        </div>
        <div class="swatches">${p.colors.map(c => `<i style="background:${/^#[0-9a-f]{6}$/i.test(c) ? c : '#000'}"></i>`).join('')}</div>
      </div>
    </article>`;
}

/* ---------------- cart ----------------
   The cart lives in this browser. At checkout it's sent to Stripe's hosted payment page
   (live), or just cleared (demo). */
const cartStore = {
  get() { try { return JSON.parse(localStorage.getItem('spx_cart')) || []; } catch { return []; } },
  set(c) { try { localStorage.setItem('spx_cart', JSON.stringify(c)); } catch {} },
};
// Where the order ships decides the rates and which countries Stripe accepts.
const regionStore = {
  get() { try { return localStorage.getItem('spx_region') === 'intl' ? 'intl' : 'au'; } catch { return 'au'; } },
  set(r) { try { localStorage.setItem('spx_region', r === 'intl' ? 'intl' : 'au'); } catch {} },
};
const findProduct = id => PRODUCTS.find(p => p.id === id);

async function addToCart(id, size, qty = 1, { open = false } = {}) {
  if (PREVIEW) return toast('Preview only: adding to cart is disabled');
  const p = findProduct(id);
  if (!p || p.stock === 0 || !p.sizes.includes(size)) return;
  const cart = cartStore.get();
  const line = cart.find(l => l.id === id && l.size === size);
  line ? (line.qty += qty) : cart.push({ id, size, qty });
  cartStore.set(cart);
  renderCart();
  toast(`${p.name}${size === 'One size' ? '' : ` (${size})`} added to your cart`);
  bumpBag();
  if (open) openCart();
}
function updateQty(i, delta) {
  const cart = cartStore.get();
  if (!cart[i]) return;
  cart[i].qty = Math.min(99, cart[i].qty + delta);
  if (cart[i].qty < 1) cart.splice(i, 1);
  cartStore.set(cart); renderCart();
}
function removeLine(i) { const c = cartStore.get(); c.splice(i, 1); cartStore.set(c); renderCart(); }

function renderCart() {
  const lines = cartStore.get().map(l => ({ ...l, p: findProduct(l.id) })).filter(l => l.p);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.p.price, 0);
  const badge = $('.bag-count');
  if (badge) { badge.textContent = count; badge.classList.toggle('show', count > 0); }
  if (!$('.drawer')) return;

  const intl = regionStore.get() === 'intl';
  const remaining = intl ? Infinity : SITE.freeShippingOver - subtotal;
  $('.ship-meter').innerHTML = `<div class="ship-to"><span>Shipping to</span>
      <button data-region="au" class="${intl ? '' : 'on'}" aria-pressed="${!intl}">Australia</button>
      <button data-region="intl" class="${intl ? 'on' : ''}" aria-pressed="${intl}">International</button></div>` + (intl
    ? `Flat-rate international shipping at checkout. <b>Prices shown in your currency</b> when you pay`
    : remaining > 0
    ? `<b>${money(remaining)}</b> out from free shipping<div class="bar"><i style="width:${Math.min(100, subtotal / SITE.freeShippingOver * 100)}%"></i></div>`
    : `Free shipping <b>unlocked</b><div class="bar"><i style="width:100%"></i></div>`);

  $('.drawer__items').innerHTML = lines.length ? lines.map((l, i) => `
    <div class="line-item">
      <img src="${imgSrc(l.p.images[0])}" alt="">
      <div>
        <h4>${esc(l.p.name)}</h4>
        <small>${esc(l.p.sku)} · ${esc(l.size)} · ${money(l.p.price)}</small><br>
        <div class="qty"><button data-qty="-1" data-line="${i}" aria-label="Decrease">−</button><span>${l.qty}</span><button data-qty="1" data-line="${i}" aria-label="Increase">+</button></div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end">
        <span class="card__price">${money(l.qty * l.p.price)}</span>
        <button class="remove" data-remove data-line="${i}">Remove</button>
      </div>
    </div>`).join('')
    : `<div class="empty"><h4>Cart's empty</h4><p>Go find something worth crashing in.</p><a class="btn" href="shop/" style="margin-top:12px">Shop all</a></div>`;

  $('.drawer__foot').innerHTML = lines.length ? `
    <div class="mil">✕ Free returns within 30 days. Crashed it? Our warranty covers seams for life</div>
    <div class="row muted"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="row muted"><span>Shipping</span><span>${remaining > 0 ? 'At checkout' : 'Free'}</span></div>
    <div class="row total"><span>Total <small>AUD</small></span><span>${money(subtotal)}</span></div>
    <button class="btn btn--block" data-checkout>Secure checkout</button>
    <p class="secure-note">Payment on Stripe's secure page. Cards, Apple Pay, Google Pay${intl ? '' : ', Afterpay'}</p>` : '';
}

async function checkout(btn) {
  const lines = cartStore.get().filter(l => findProduct(l.id));
  if (!lines.length) return;
  if (!LIVE) {
    cartStore.set([]); renderCart(); closeCart();
    toast('Demo checkout. Stripe is not connected yet');
    return;
  }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Opening secure checkout…';
  try {
    location.href = await CMS.startCheckout(lines, regionStore.get());
  } catch (err) {
    toast(err.message);
    btn.disabled = false; btn.textContent = label;
  }
}

function openCart() {
  $('.drawer').classList.add('open'); $('.scrim').classList.add('open'); $('.drawer').setAttribute('aria-hidden', 'false');
}
function closeCart() { $('.drawer')?.classList.remove('open'); $('.scrim')?.classList.remove('open'); $('.drawer')?.setAttribute('aria-hidden', 'true'); }

let toastTimer;
function toast(msg) {
  const t = $('.toast'); if (!t) return;
  $('span', t).textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
function bumpBag() { $('.bag-count')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 400 }); }

// When an admin saves something in another tab of this browser, reload so it shows straight away.
if (!PREVIEW && 'BroadcastChannel' in window) {
  new BroadcastChannel('spx-store').onmessage = e => { if (e.data?.type === 'content-changed') location.reload(); };
}

// In the admin's preview, the admin sends the content it already has instead of this page
// downloading it again. Falls back to a normal load if the admin doesn't answer.
function previewData() {
  return new Promise(resolve => {
    let settled = false;
    const finish = data => { if (settled) return; settled = true; window.removeEventListener('message', onMsg); resolve(data); };
    const onMsg = e => {
      if (e.origin === location.origin && e.source === window.parent && e.data?.type === 'spx:preview-data') finish(e.data.data);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: 'spx:preview-hello' }, location.origin);
    setTimeout(() => { if (!settled) CMS.loadPublic().then(finish, () => finish({ collections: [], products: [], settings: SITE })); }, 1500);
  });
}

/* ---------------- admin live preview ----------------
   The admin loads these pages in an iframe with ?preview and posts unsaved drafts in.
   Only messages from this same site, sent by the parent window, are accepted. */
function onPreview(handler) {
  if (!PREVIEW) return;
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== window.parent || e.data?.type !== 'spx:preview') return;
    handler(e.data);
  });
  window.parent.postMessage({ type: 'spx:preview-ready' }, location.origin);
}
