/* =========================================================
   Lanny Supply Co. — storefront behaviour (shared by every store page)
   ========================================================= */

const IMG = 'assets/img/';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="m5 12 5 5 9-10"/></svg>',
};

// Shield + star emblem used as the brand mark.
const MARK = `<svg class="logo__mark" viewBox="0 0 40 40" aria-hidden="true">
  <path d="M20 2.5 35.5 8v11.5C35.5 29.5 28.5 35.5 20 38 11.5 35.5 4.5 29.5 4.5 19.5V8Z" fill="none" stroke="var(--tan)" stroke-width="2.4"/>
  <path d="M20 10.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" fill="var(--tan)"/>
  <path d="M11 30.5l9 4 9-4" fill="none" stroke="var(--tan)" stroke-width="2"/>
</svg>`;
const logoHtml = (href = 'index.html') => `<a href="${href}" class="logo" aria-label="${STORE.name} home">${MARK}<span><span class="logo__word">${STORE.mark}</span><span class="logo__sub">SUPPLY CO. // EST. ${STORE.est}</span></span></a>`;

/* ---------------- chrome ---------------- */
function renderChrome(active = '') {
  const nav = [
    ['shop.html', 'Shop all', 'shop'],
    ['shop.html?filter=new', 'New issue', 'new'],
    ['shop.html?category=Tees', 'Tees', 'Tees'],
    ['shop.html?category=Hoodies', 'Hoodies', 'Hoodies'],
    ['shop.html?category=Outerwear', 'Outerwear', 'Outerwear'],
    ['index.html#mission', 'The mission', 'mission'],
    ['index.html#story', 'My story', 'story'],
  ];
  const announcements = [
    'Veteran owned &amp; operated',
    `${STORE.giveBackPercent}% of every order goes to veteran charities`,
    `Free shipping over ${money(STORE.freeShippingOver)}`,
    `${STORE.militaryDiscount}% off for veterans, service members &amp; first responders`,
    'Lifetime guarantee on every seam',
  ];

  $('#chrome-top').innerHTML = `
    <div class="announce" aria-label="Store announcements">
      <div class="announce__track">${[...announcements, ...announcements].map(a => `<span>${a}</span>`).join('')}</div>
    </div>
    <header class="header">
      <div class="wrap header__row">
        <div style="display:flex;align-items:center;gap:6px">
          <button class="icon-btn menu-btn" aria-label="Open menu" data-open-menu>${ICON.menu}</button>
          ${logoHtml()}
        </div>
        <nav class="nav" aria-label="Primary">${nav.map(([h, l, k]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</nav>
        <div class="header__icons">
          <span class="vet-chip"><i></i>Vet owned</span>
          <button class="icon-btn" aria-label="Search" data-search>${ICON.search}</button>
          <a class="icon-btn hide-sm" href="#" aria-label="Account">${ICON.user}</a>
          <button class="icon-btn" aria-label="Open cart" data-open-cart>${ICON.bag}<span class="bag-count"></span></button>
        </div>
      </div>
      <div class="search-bar"><form class="wrap" action="shop.html">${ICON.search.replace('<svg', '<svg width="22" height="22"')}<input name="q" placeholder="Search tees, hoodies, caps…" aria-label="Search products"><button type="button" class="icon-btn" data-search aria-label="Close search">${ICON.close}</button></form></div>
    </header>
    <div class="mobile-nav" aria-hidden="true">
      <div class="mobile-nav__top">${logoHtml()}<button class="icon-btn" data-close-menu aria-label="Close menu">${ICON.close}</button></div>
      ${nav.map(([h, l]) => `<a class="big" href="${h}">${l}</a>`).join('')}
      ${LIVE ? '' : `<a href="admin/index.html" style="margin-top:auto" class="link-arrow">Store admin ${ICON.arrow}</a>`}
    </div>`;

  $('#chrome-bottom').innerHTML = `
    <footer class="footer">
      <div class="wrap">
        <div class="footer__grid">
          <div>
            ${logoHtml()}
            <p class="footer__motto">${STORE.tagline}</p>
            <p style="max-width:380px;margin:0">Founded in ${STORE.est} by ${STORE.founder}, a ${STORE.service.years}-year ${STORE.service.role.toLowerCase()} veteran. ${STORE.giveBackPercent}% of every order funds veteran mental health, transition and Gold Star family support.</p>
          </div>
          <div><h5>// Shop</h5><ul><li><a href="shop.html?filter=new">New issue</a></li><li><a href="shop.html?category=Tees">Tees</a></li><li><a href="shop.html?category=Hoodies">Hoodies</a></li><li><a href="shop.html?category=Headwear">Headwear</a></li><li><a href="shop.html?category=Outerwear">Outerwear</a></li><li><a href="shop.html?category=Gear">Gear</a></li></ul></div>
          <div><h5>// Support</h5><ul><li><a href="#">Military discount</a></li><li><a href="#">Shipping</a></li><li><a href="#">Returns</a></li><li><a href="#">Size guide</a></li><li><a href="#">Contact HQ</a></li></ul></div>
          <div><h5>// The unit</h5><ul><li><a href="index.html#story">My story</a></li><li><a href="index.html#mission">The mission</a></li><li><a href="#">Instagram</a></li><li><a href="#">TikTok</a></li>${LIVE ? '' : '<li><a href="admin/index.html">Store admin</a></li>'}</ul></div>
        </div>
        <div class="footer__bottom">
          <span>© ${new Date().getFullYear()} ${STORE.name} · Veteran owned &amp; operated</span>
          <div class="pay"><span>Visa</span><span>MC</span><span>Amex</span><span>PayPal</span><span>Apple Pay</span></div>
        </div>
      </div>
    </footer>
    <div class="scrim" data-close-cart></div>
    <aside class="drawer" aria-label="Cart" aria-hidden="true">
      <div class="drawer__head"><h3>Your kit</h3><button class="icon-btn" data-close-cart aria-label="Close cart">${ICON.close}</button></div>
      <div class="ship-meter"></div>
      <div class="drawer__items"></div>
      <div class="drawer__foot"></div>
    </aside>
    <div class="toast" role="status">${ICON.check}<span></span></div>
    ${LIVE ? '' : '<a class="demo-pill" href="admin/index.html"><i></i>Demo // Store admin</a>'}`;

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-open-cart],[data-close-cart],[data-open-menu],[data-close-menu],[data-search]');
    if (!t) return;
    if (t.matches('[data-open-cart]')) openCart();
    if (t.matches('[data-close-cart]')) closeCart();
    if (t.matches('[data-open-menu]')) $('.mobile-nav').classList.add('open');
    if (t.matches('[data-close-menu]')) $('.mobile-nav').classList.remove('open');
    if (t.matches('[data-search]')) { const s = $('.search-bar'); s.classList.toggle('open'); if (s.classList.contains('open')) $('input', s).focus(); }
  });
  $$('.mobile-nav a').forEach(a => a.addEventListener('click', () => $('.mobile-nav').classList.remove('open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCart(); $('.mobile-nav').classList.remove('open'); } });

  if (LIVE) loadSnipcart(); else renderCart();
}

// Drafts are managed in the admin but hidden from shoppers.
const liveProducts = () => DB.products().filter(p => p.status !== 'Draft');

/* ---------------- product card ---------------- */
function productCard(p) {
  const cls = p.compareAt ? 'sale' : p.badge === 'Low stock' ? 'low' : '';
  const badge = p.badge ? `<span class="card__badge ${cls}">${p.badge}</span>` : '';
  const price = p.compareAt ? `<s>${money(p.compareAt)}</s>${money(p.price)}` : money(p.price);
  return `
    <article class="card">
      <div class="card__media">
        <a href="product.html?id=${p.id}" tabindex="-1">${badge}<img src="${IMG}${p.img}" alt="${p.name}" loading="lazy"></a>
        <span class="corners"></span>
        <button class="card__wish" aria-label="Save ${p.name}" onclick="this.classList.toggle('on')">${ICON.heart}</button>
        <div class="quick">
          <div class="quick__label">// Quick add</div>
          <div class="quick__sizes">${p.sizes.map(s => `<button onclick="addToCart('${p.id}','${s}')">${s === 'One size' ? 'Add' : s}</button>`).join('')}</div>
        </div>
      </div>
      <div class="card__info">
        <div class="card__sku"><span>${p.sku || p.id.toUpperCase()}</span><span>${p.spec || p.category}</span></div>
        <div class="card__row">
          <h3 class="card__name"><a href="product.html?id=${p.id}">${p.name}</a></h3>
          <div class="card__price">${price}</div>
        </div>
        <div class="swatches">${p.colors.map(c => `<i style="background:${c}"></i>`).join('')}</div>
      </div>
    </article>`;
}

/* ---------------- cart ----------------
   Demo mode keeps the cart in localStorage and "checks out" into the mock admin.
   Live mode hands everything to Snipcart: cart, checkout, payments, emails. */
async function addToCart(id, size, qty = 1, { open = false } = {}) {
  if (LIVE) return addToSnipcart(id, size, qty, open);
  const cart = DB.cart();
  const line = cart.find(l => l.id === id && l.size === size);
  line ? (line.qty += qty) : cart.push({ id, size, qty });
  DB.saveCart(cart);
  renderCart();
  const p = DB.products().find(p => p.id === id);
  toast(`${p.name}${size === 'One size' ? '' : ` (${size})`} added to your kit`);
  bumpBag();
}
function updateQty(i, delta) {
  const cart = DB.cart();
  cart[i].qty += delta;
  if (cart[i].qty < 1) cart.splice(i, 1);
  DB.saveCart(cart); renderCart();
}
function removeLine(i) { const c = DB.cart(); c.splice(i, 1); DB.saveCart(c); renderCart(); }

function renderCart() {
  const cart = DB.cart(), products = DB.products();
  const lines = cart.map(l => ({ ...l, p: products.find(p => p.id === l.id) })).filter(l => l.p);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.p.price, 0);

  const badge = $('.bag-count');
  if (badge) { badge.textContent = count; badge.classList.toggle('show', count > 0); }
  if (!$('.drawer')) return;

  const remaining = STORE.freeShippingOver - subtotal;
  $('.ship-meter').innerHTML = remaining > 0
    ? `<b>${money(remaining)}</b> out from free shipping<div class="bar"><i style="width:${Math.min(100, subtotal / STORE.freeShippingOver * 100)}%"></i></div>`
    : `Free shipping <b>unlocked</b><div class="bar"><i style="width:100%"></i></div>`;

  $('.drawer__items').innerHTML = lines.length ? lines.map((l, i) => `
    <div class="line-item">
      <img src="${IMG}${l.p.img}" alt="">
      <div>
        <h4>${l.p.name}</h4>
        <small>${l.p.sku || ''} · ${l.size} · ${money(l.p.price)}</small><br>
        <div class="qty"><button onclick="updateQty(${i},-1)" aria-label="Decrease">−</button><span>${l.qty}</span><button onclick="updateQty(${i},1)" aria-label="Increase">+</button></div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end">
        <span class="card__price">${money(l.qty * l.p.price)}</span>
        <button class="remove" onclick="removeLine(${i})">Remove</button>
      </div>
    </div>`).join('')
    : `<div class="empty"><h4>Kit's empty</h4><p>Start with the tee that started it all.</p><a class="btn" href="product.html?id=p-001" style="margin-top:12px">Earned Not Issued Tee</a></div>`;

  const give = subtotal * STORE.giveBackPercent / 100;
  $('.drawer__foot').innerHTML = lines.length ? `
    <div class="mil">★ Served? ${STORE.militaryDiscount}% off applied at checkout after ID verification</div>
    <div class="row muted"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="row muted"><span>Shipping</span><span>${remaining > 0 ? 'At checkout' : 'Free'}</span></div>
    <div class="row muted"><span>To veteran charities</span><span style="color:var(--tan)">${money(give.toFixed(2))}</span></div>
    <div class="row total"><span>Total</span><span>${money(subtotal)}</span></div>
    <button class="btn btn--block" onclick="checkout()">Secure checkout</button>` : '';
}

const localISO = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// Demo checkout: turns the cart into a real order the admin can see.
function checkout() {
  const cart = DB.cart();
  if (!cart.length) return;
  const orders = DB.orders();
  const next = Math.max(...orders.map(o => parseInt(o.id.slice(1)))) + 1;
  orders.unshift({ id: '#' + next, customer: 'c-106', date: localISO(), status: 'Unfulfilled', payment: 'Paid', items: cart.map(l => [l.id, l.size, l.qty]) });
  DB.saveOrders(orders);
  const products = DB.products();
  cart.forEach(l => { const p = products.find(p => p.id === l.id); if (p) p.stock = Math.max(0, p.stock - l.qty); });
  DB.saveProducts(products);
  DB.saveCart([]);
  renderCart();
  closeCart();
  toast(`Order #${next} placed. It's now in the store admin`);
}

function openCart() { if (LIVE) return snipcartReady().then(() => Snipcart.api.theme.cart.open(), () => toast('Checkout is unavailable right now')); $('.drawer').classList.add('open'); $('.scrim').classList.add('open'); $('.drawer').setAttribute('aria-hidden', 'false'); }
function closeCart() { $('.drawer')?.classList.remove('open'); $('.scrim')?.classList.remove('open'); $('.drawer')?.setAttribute('aria-hidden', 'true'); }

let toastTimer;
function toast(msg) {
  const t = $('.toast'); if (!t) return;
  $('span', t).textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
function bumpBag() {
  const b = $('.bag-count'); if (!b) return;
  b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 400 });
}

/* ---------------- Snipcart (live mode) ---------------- */
function loadSnipcart() {
  const cfg = STORE.snipcart;
  window.SnipcartSettings = {
    publicApiKey: cfg.publicApiKey,
    currency: cfg.currency,
    version: cfg.version,
    modalStyle: 'side',
    addProductBehavior: 'none', // we show our own toast and open the cart ourselves
  };
  // Official Snipcart loader, simplified: inject the pinned version's CSS + JS once.
  const base = `https://cdn.snipcart.com/themes/v${cfg.version}/default`;
  if (!document.getElementById('snipcart')) {
    const host = document.createElement('div');
    host.id = 'snipcart'; host.hidden = true;
    host.dataset.apiKey = cfg.publicApiKey;
    host.dataset.configModalStyle = 'side';
    host.dataset.configAddProductBehavior = 'none';
    host.dataset.currency = cfg.currency;
    document.body.appendChild(host);
  }
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = `${base}/snipcart.css`;
  document.head.prepend(css); // ours comes later, so the #snipcart theme overrides in store.css win
  const js = document.createElement('script');
  js.src = `${base}/snipcart.js`; js.async = true;
  document.head.appendChild(js);

  snipcartReady().catch(err => console.error(err)).then(() => {
    if (!window.Snipcart?.store) return;
    const sync = () => {
      const count = Snipcart.store.getState().cart.items.count;
      const badge = $('.bag-count');
      if (badge) { badge.textContent = count; badge.classList.toggle('show', count > 0); }
    };
    sync();
    Snipcart.store.subscribe(sync);
  });
}

// Resolves on Snipcart's ready event; rejects if it never arrives (bad key, blocked script, offline).
let snipcartPromise;
function snipcartReady() {
  return snipcartPromise ||= new Promise((resolve, reject) => {
    document.addEventListener('snipcart.ready', () => resolve(), { once: true });
    setTimeout(() => reject(new Error('Snipcart did not load. Check the public API key in data.js')), 10000);
  });
}

async function addToSnipcart(id, size, qty, open) {
  const p = DB.products().find(p => p.id === id);
  if (!p) return;
  try {
    await snipcartReady();
    await Snipcart.api.cart.items.add({
      id: p.id,
      name: p.name,
      price: p.price,
      url: '/snipcart-products.json', // Snipcart re-checks the price here at checkout
      image: new URL(IMG + p.img, location.href).href,
      description: `${p.sku} // ${p.spec}`,
      quantity: qty,
      customFields: [{ name: 'Size', type: 'dropdown', options: p.sizes.join('|'), value: size }],
    });
    toast(`${p.name}${size === 'One size' ? '' : ` (${size})`} added to your kit`);
    bumpBag();
    if (open) Snipcart.api.theme.cart.open();
  } catch (err) {
    console.error('Snipcart add failed', err);
    toast('Could not add to cart. Please try again');
  }
}

function stars(r) { const f = Math.round(r); return '★'.repeat(f) + '☆'.repeat(5 - f); }
