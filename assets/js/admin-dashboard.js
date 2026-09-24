/* SPXTR admin dashboard.
 * Every change goes through withWrite(): it asks for the admin password, the database opens a
 * short write window for this session, the change is made, and the window is closed again.
 * The database refuses writes without that window, so this UI is not the security boundary. */
// The admin must never run inside another site's frame (a trick to capture clicks or passwords).
if (window.top !== window.self) { document.documentElement.innerHTML = ''; throw new Error('SPXTR admin cannot be framed'); }
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = window.esc;
  const view = $('#view');
  const cfg = window.SPX_CONFIG;

  let DATA = { collections: [], products: [], settings: CMS.mergeSettings({}), orders: [] };
  let dirty = false;
  let lastHash = location.hash;
  let ignoreHash = false;

  const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '28', '30', '32', '34', '36', 'One size'];
  const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const safe = u => (/^(https:\/\/|assets\/img\/|data:image\/(webp|jpeg|png);base64,|blob:)/.test(u || '') ? u : '');
  // The site's root, relative to this page (admin/dashboard/). Relative paths keep the admin working
  // wherever the site is hosted: spxtr.com, a GitHub Pages sub-folder, or localhost.
  const ROOT = '../../';
  // Stored paths like "assets/img/x.jpg" are relative to the site root.
  const asset = u => { const s = safe(u); return s.startsWith('assets/') ? ROOT + s : s; };
  const money = n => STORE.currency + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const fmtDate = d => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const clone = v => JSON.parse(JSON.stringify(v));
  // Order amounts are stored in the smallest unit of the currency the customer paid in.
  const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
  const minor = (n, cur = 'aud') => {
    const c = String(cur || 'aud').toLowerCase();
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: c.toUpperCase() }).format((n || 0) / (ZERO_DECIMAL.has(c) ? 1 : 100));
  };
  const stripeUrl = path => `https://dashboard.stripe.com/${cfg.stripe?.testMode ? 'test/' : ''}${path}`;
  let regionName = c => c;
  try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); regionName = c => { try { return dn.of(c) || c; } catch { return c; } }; } catch { /* old browser */ }

  /* ---------------- boot ---------------- */
  (async () => {
    let admin = null;
    try { admin = await CMS.getAdmin(); } catch (e) { console.error(e); }
    if (!admin || admin.needs) { location.replace('../login/'); return; }
    document.body.hidden = false;
    showWhoAmI(admin);
    $('#modeLabel').textContent = CMS.mode === 'demo' ? 'Demo admin' : admin.mfa ? 'Owner // 2FA on' : 'Owner';
    $('#demoChip').hidden = CMS.mode !== 'demo';
    $('#stripeLink').href = stripeUrl('payments');
    ADMIN = admin;
    NAMES = await CMS.adminNames?.().catch(() => ({})) || {};
    comingSoonBanner();
    await reload();
    window.addEventListener('hashchange', onHash);
    route();
    startIdleTimer();
  })();
  let ADMIN = null;

  async function reload() {
    const [content] = await Promise.all([
      CMS.loadAdmin().catch(err => { toast(err.message, true); return null; }),
      reloadOrders(),
    ]);
    if (content) DATA = { ...DATA, ...content };
    DATA.reviews = DATA.reviews || [];
    const pending = DATA.reviews.filter(r => r.status === 'pending').length;
    $('#rvCount').textContent = pending; $('#rvCount').hidden = !pending;
    applyAccent();
  }
  // The admin wears the same accent colour as the store (Admin -> Customise).
  function applyAccent(hex = DATA.settings.theme?.accent) {
    window.spxAccent?.apply(validAccent(hex) ? hex : null);
  }
  // The store's address with the preview key on it, for looking around while the store is closed.
  function previewUrl() {
    if (!ADMIN?.previewKey) return '';
    const base = new URL(ROOT, location.href).href.replace(/\/$/, '');
    return `${base}/?key=${encodeURIComponent(ADMIN.previewKey)}`;
  }
  // A reminder in the top bar whenever the store is closed to the public.
  function comingSoonBanner() {
    const chip = $('#soonChip');
    if (chip) { chip.hidden = !ADMIN?.comingSoon; chip.onclick = () => go('#settings'); }
    syncStoreLink();
  }

  // Tell any store tabs open in this browser to refresh, so changes show without a manual reload.
  const storeTabs = 'BroadcastChannel' in window ? new BroadcastChannel('spx-store') : null;
  const announceChange = () => storeTabs?.postMessage({ type: 'content-changed' });
  // After a save: show the change straight away from what we just saved, and quietly
  // re-fetch in the background to pick up anything the database filled in.
  function refreshLater() { reload().catch(err => console.error(err)); }
  // Kept separate so a problem with orders never stops products and pages from loading.
  async function reloadOrders() {
    try { DATA.orders = await CMS.loadOrders(); }
    catch (err) { console.error(err); DATA.orders = []; }
    const n = DATA.orders.filter(o => o.status === 'paid').length;
    $('#toShip').textContent = n; $('#toShip').hidden = !n;
  }

  // The name in the sidebar, and what the activity log calls this admin.
  function showWhoAmI(admin) {
    $('#userEmail').textContent = admin.nickname || admin.email;
    $('#modeLabel').textContent = CMS.mode === 'demo' ? 'Demo admin' : admin.mfa ? 'Owner // 2FA on' : 'Owner';
  }
  $('#profileBtn').addEventListener('click', () => {
    $('#profileEmail').textContent = ADMIN.email;
    $('#nickname').value = ADMIN.nickname || '';
    $('#profileError').hidden = true;
    $('#profileModal').hidden = false;
    $('#nickname').focus();
  });
  $('#profileCancel').addEventListener('click', () => { $('#profileModal').hidden = true; });
  $('#profileModal').addEventListener('click', e => { if (e.target === $('#profileModal')) $('#profileModal').hidden = true; });
  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const wanted = $('#nickname').value.trim().slice(0, 40);
    if (wanted === (ADMIN.nickname || '')) { $('#profileModal').hidden = true; return; }
    $('#profileModal').hidden = true;
    const ok = await withWrite('Enter your admin password to change the name on your account.', async () => {
      ADMIN.nickname = await CMS.setNickname(wanted);
    });
    if (!ok) return;
    showWhoAmI(ADMIN);
    NAMES = await CMS.adminNames().catch(() => NAMES);
    toast(ADMIN.nickname ? `You'll show up as ${ADMIN.nickname}` : 'Back to showing your email');
    if ((location.hash.slice(1) || 'overview').split('/')[0] === 'security') security(); else if (!location.hash || location.hash === '#overview') overview();
  });

  $('#logout').addEventListener('click', async () => {
    if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
    await CMS.logout();
    location.replace('../login/');
  });
  $('#menuToggle').addEventListener('click', () => $('#side').classList.toggle('open'));
  ['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => {
    if (!e.target.closest?.('.drop, [data-pic]')) e.preventDefault();
  }));
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- idle logout ---------------- */
  function startIdleTimer() {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { await CMS.logout(); location.replace('../login/?reason=idle'); }, cfg.adminIdleMinutes * 60e3);
    };
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  /* ---------------- router ---------------- */
  function onHash() {
    if (ignoreHash) { ignoreHash = false; return; }
    if (dirty && !confirm('Discard your unsaved changes?')) { ignoreHash = true; location.hash = lastHash; return; }
    dirty = false;
    route();
  }

  function route() {
    lastHash = location.hash;
    view.onclick = null; // views that need a delegated click handler set their own
    const [name, id] = (location.hash.slice(1) || 'overview').split('/');
    const routes = { overview, orders, order: () => orderDetail(id), products, product: () => productEditor(id), pages, page: () => pageEditor(id), content: contentEditor, settings: settingsEditor, customise: customiseEditor, reviews, security };
    (routes[name] || overview)();
    const navKey = { order: 'orders', product: 'products', page: 'pages' }[name] || name;
    $$('#nav a[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === navKey));
    $('#side').classList.remove('open');
    window.scrollTo(0, 0);
  }
  const go = hash => { dirty = false; location.hash = hash; };
  // "View store" opens the real site, with the preview key when the store is closed.
  const syncStoreLink = () => { const a = $('#viewStore'); if (a) a.href = ADMIN?.comingSoon ? previewUrl() : ROOT; };
  const setTitle = t => { $('#viewTitle').textContent = t; document.title = `${t} — SPXTR Admin`; };

  /* ---------------- feedback ---------------- */
  let toastTimer;
  function toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), err ? 5000 : 2600);
  }

  /* ---------------- password confirmation ---------------- */
  const REASONS = {
    locked: 'Too many wrong attempts. Changes are locked for 15 minutes.',
    mfa_required: 'Please sign in again with your authenticator code.',
    not_admin: 'This account is not an admin.',
  };
  function requirePassword(text) {
    return new Promise(resolve => {
      const modal = $('#confirmModal'), form = $('#confirmForm'), pw = $('#confirmPassword'), err = $('#confirmError');
      $('#confirmText').textContent = text;
      err.hidden = true; pw.value = ''; modal.hidden = false; pw.focus();
      const done = ok => {
        modal.hidden = true; pw.value = '';
        form.onsubmit = null; $('#confirmCancel').onclick = null; document.removeEventListener('keydown', onKey);
        resolve(ok);
      };
      const onKey = e => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey);
      $('#confirmCancel').onclick = () => done(false);
      form.onsubmit = async e => {
        e.preventDefault();
        const btn = $('#confirmSubmit');
        btn.disabled = true;
        try {
          const r = await CMS.confirm(pw.value);
          if (r?.ok) return done(true);
          err.textContent = r?.reason === 'incorrect'
            ? `Wrong password.${r.remaining != null ? ` ${Math.max(0, r.remaining)} attempt${r.remaining === 1 ? '' : 's'} left before a 15 minute lock.` : ''}`
            : REASONS[r?.reason] || 'Could not confirm your password.';
          err.hidden = false; pw.value = ''; pw.focus();
        } catch (ex) {
          err.textContent = ex.message; err.hidden = false;
        } finally { btn.disabled = false; }
      };
    });
  }

  async function withWrite(text, fn) {
    if (!(await requirePassword(text))) return false;
    // Busy state on the page's save button, with upload progress in its label.
    const btn = view.querySelector('.savebar button[type=submit]');
    const label = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    progress = msg => { if (btn) btn.textContent = msg; };
    try { await fn(); announceChange(); return true; }
    catch (err) { console.error(err); toast(err.message || 'Something went wrong', true); return false; }
    finally {
      progress = () => {};
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
      try { await CMS.endWrite(); } catch { /* window expires on its own */ }
    }
  }

  /* =====================================================================
     OVERVIEW
     ===================================================================== */
  async function overview() {
    setTitle('Overview');
    const P = DATA.products;
    const live = P.filter(p => p.status === 'published').length;
    const drafts = P.filter(p => p.status === 'draft').length;
    const sold = P.filter(p => p.status === 'published' && p.stock === 0).length;
    const low = P.filter(p => p.stock > 0 && p.stock < 10).length;
    const toShip = DATA.orders.filter(o => o.status === 'paid').length;
    view.innerHTML = `
      ${CMS.mode === 'demo' ? `<div class="notice notice--demo"><b>Demo mode.</b> Changes are saved in this browser only. Add the Supabase keys to <code>assets/js/config.js</code> to go live — see the README.</div>` : ''}
      <div class="stats">
        <a class="stat ${toShip ? 'stat--warn' : ''}" href="#orders"><small>Orders to ship</small><b>${toShip}</b></a>
        <a class="stat" href="#products"><small>Live products</small><b>${live}</b></a>
        <a class="stat ${drafts ? 'stat--warn' : ''}" href="#products"><small>Drafts</small><b>${drafts}</b></a>
        <a class="stat ${sold ? 'stat--red' : ''}" href="#products"><small>Sold out</small><b>${sold}</b></a>
        <a class="stat ${low ? 'stat--warn' : ''}" href="#products"><small>Low stock (&lt;10)</small><b>${low}</b></a>
        <a class="stat" href="#pages"><small>Pages</small><b>${DATA.collections.length}</b></a>
      </div>
      <div class="grid-2">
        <div class="stack">
          <div class="panel"><div class="panel__head"><h2>Quick actions</h2></div><div class="panel__body quick">
            <a href="#product/new"><b>+ Add product</b><small>Photos, sizes, price and which pages it shows on</small></a>
            <a href="#page/new"><b>+ Add page</b><small>e.g. Military, Moto, Rock Climbing</small></a>
            <a href="#settings"><b>Edit homepage</b><small>Hero, announcements and next event</small></a>
          </div></div>
          <div class="panel"><div class="panel__head"><h2>Needs attention</h2></div><div class="panel__body">${attention()}</div></div>
        </div>
        <div class="panel"><div class="panel__head"><h2>Recent activity</h2><a class="link" href="#security">All activity</a></div>
          <div class="panel__body"><ul class="activity" id="activity"><li class="muted">Loading…</li></ul></div></div>
      </div>`;
    try {
      const log = (await CMS.auditLog()).slice(0, 10);
      $('#activity').innerHTML = log.length ? log.map(activityItem).join('') : '<li class="muted">No changes yet.</li>';
    } catch { $('#activity').innerHTML = '<li class="muted">Activity is unavailable.</li>'; }
  }

  function attention() {
    const items = [];
    const toShip = DATA.orders.filter(o => o.status === 'paid').length;
    if (toShip) items.push(`<a href="#orders">${toShip} order${toShip === 1 ? '' : 's'}</a> waiting to be shipped`);
    if (ADMIN?.comingSoon) items.push('The store is <a href="#settings">closed to the public</a> (coming soon page is on)');
    const pending = (DATA.reviews || []).filter(r => r.status === 'pending').length;
    if (pending) items.push(`<a href="#reviews">${pending} review${pending === 1 ? '' : 's'}</a> waiting for approval`);
    DATA.products.filter(p => p.status === 'published' && p.stock === 0).forEach(p => items.push(`<a href="#product/${esc(p.id)}">${esc(p.name)}</a> is sold out`));
    DATA.products.filter(p => p.stock > 0 && p.stock < 10).forEach(p => items.push(`<a href="#product/${esc(p.id)}">${esc(p.name)}</a> has ${p.stock} left`));
    DATA.products.filter(p => p.status === 'published' && !p.collections.length).forEach(p => items.push(`<a href="#product/${esc(p.id)}">${esc(p.name)}</a> isn't on any page`));
    DATA.products.filter(p => p.status === 'draft').forEach(p => items.push(`<a href="#product/${esc(p.id)}">${esc(p.name)}</a> is still a draft`));
    return items.length ? `<ul class="checklist">${items.slice(0, 8).map(i => `<li class="todo">${i}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">All good. Nothing needs attention.</p>';
  }

  let NAMES = {};      // email -> nickname, for entries written before a name was set
  const who = a => NAMES[String(a.email || '').toLowerCase()] || a.email || 'Admin';
  const ACTION = { insert: 'created', update: 'updated', delete: 'deleted' };
  const ENTITY = { products: 'product', collections: 'page', site_settings: 'homepage & settings', orders: 'order', reviews: 'review',
                   security_settings: 'store settings', admins: 'account', email: 'email', launch_signups: 'launch list' };
  const activityItem = a => `<li><time>${fmtDate(a.at)}</time><span>${esc(who(a))} ${ACTION[a.action] || esc(a.action)} ${ENTITY[a.entity] || esc(a.entity)}${a.summary && a.entity !== 'site_settings' ? ` <b>${esc(a.summary)}</b>` : ''}</span></li>`;

  /* =====================================================================
     REVIEWS
     Customers send reviews from product pages and their order page. Each one waits here as
     "pending" and only shows on the site once approved. Admins can't edit what a customer wrote,
     only approve, hide, feature it on the homepage, or delete it (photos included).
     ===================================================================== */
  const REVIEW_STATUS = {
    pending: '<span class="pill pill--draft">Waiting</span>',
    approved: '<span class="pill pill--live">On the site</span>',
    rejected: '<span class="pill pill--off">Hidden</span>',
  };
  const stars = n => `<span class="rv-admin__stars" aria-label="${n} out of 5">${'★'.repeat(n)}<span>${'★'.repeat(5 - n)}</span></span>`;
  let reviewFilter = null;
  function reviews() {
    setTitle('Reviews');
    const R = DATA.reviews || [];
    const count = st => R.filter(r => r.status === st).length;
    if (!reviewFilter) reviewFilter = count('pending') ? 'pending' : 'approved';
    view.innerHTML = `
      ${CMS.mode === 'demo' ? '<div class="notice notice--demo"><b>Sample reviews.</b> Real reviews appear here as customers send them.</div>' : ''}
      <div class="panel">
        <div class="toolbar">
          <div class="seg" id="rvTabs" role="tablist">
            ${[['pending', 'Waiting'], ['approved', 'On the site'], ['rejected', 'Hidden'], ['', 'All']].map(([k, l]) =>
              `<button type="button" role="tab" data-f="${k}" class="${reviewFilter === k ? 'on' : ''}">${l} <small>${k ? count(k) : R.length}</small></button>`).join('')}
          </div>
          <span style="flex:1"></span>
          <span class="muted" style="font-size:12px">★ Featured reviews show in the homepage crew reports</span>
        </div>
        <div class="rv-admin" id="rvList"></div>
      </div>`;
    const productName = id => (DATA.products.find(p => p.id === id) || {}).name;
    const draw = () => {
      const list = R.filter(r => !reviewFilter || r.status === reviewFilter);
      $('#rvList').innerHTML = list.map(r => {
        const photos = (r.photos || []).map(asset).filter(Boolean);
        const pn = productName(r.product_id);
        return `
        <article class="rv-admin__item" data-id="${esc(r.id)}">
          <div class="rv-admin__head">
            ${stars(r.rating)} ${REVIEW_STATUS[r.status] || ''}
            ${r.verified ? '<span class="pill pill--live">✔ Verified buyer</span>' : '<span class="pill pill--off">Not verified</span>'}
            ${r.featured && r.status === 'approved' ? '<span class="pill pill--accent">★ Featured</span>' : ''}
            <span style="flex:1"></span><time>${fmtDate(r.created_at)}</time>
          </div>
          <p class="rv-admin__body">${esc(r.body)}</p>
          ${photos.length ? `<div class="rv-admin__photos">${photos.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="Customer photo" loading="lazy"></a>`).join('')}</div>` : ''}
          <div class="rv-admin__foot">
            <span><b>${esc(r.name)}</b>${pn ? ` on <a class="link" href="#product/${esc(r.product_id)}">${esc(pn)}</a>` : r.product_id ? ' on a deleted product' : ' about SPXTR'}</span>
            <span style="flex:1"></span>
            ${r.status !== 'approved' ? '<button type="button" class="btn btn--sm" data-act="approve">Approve</button>' : ''}
            ${r.status === 'approved' ? `<button type="button" class="btn btn--ghost btn--sm" data-act="feature">${r.featured ? 'Unfeature' : '★ Feature on homepage'}</button>` : ''}
            ${r.status !== 'rejected' ? '<button type="button" class="btn btn--ghost btn--sm" data-act="reject">Hide</button>' : ''}
            <button type="button" class="btn btn--danger btn--sm" data-act="delete">Delete</button>
          </div>
        </article>`;
      }).join('') || `<div class="empty">${R.length ? 'Nothing here.' : 'No reviews yet. They appear here when customers send them from a product page or their order page.'}</div>`;
    };
    draw();
    $('#rvTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      reviewFilter = b.dataset.f; reviews();
    });
    $('#rvList').addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const r = R.find(x => String(x.id) === b.closest('[data-id]').dataset.id); if (!r) return;
      const act = b.dataset.act;
      if (act === 'delete' && !confirm(`Delete ${r.name}'s review${r.photos?.length ? ' and its photos' : ''}? This can't be undone.`)) return;
      const change = { approve: { status: 'approved' }, reject: { status: 'rejected', featured: false }, feature: { featured: !r.featured } }[act];
      const text = { approve: 'approve this review and put it on the site', reject: 'hide this review', feature: r.featured ? 'take this review off the homepage' : 'feature this review on the homepage', delete: 'delete this review' }[act];
      const ok = await withWrite(`Enter your admin password to ${text}.`, async () => {
        if (act === 'delete') await CMS.deleteReview(r); else await CMS.setReview(r.id, change);
      });
      if (!ok) return;
      if (act === 'delete') DATA.reviews = R.filter(x => x !== r); else Object.assign(r, change);
      toast({ approve: 'Approved. It\'s on the site now', reject: 'Hidden from the site', feature: r.featured ? 'Featured on the homepage' : 'Removed from the homepage', delete: 'Review deleted' }[act]);
      const pending = DATA.reviews.filter(x => x.status === 'pending').length;
      $('#rvCount').textContent = pending; $('#rvCount').hidden = !pending;
      reviews();
      refreshLater();
    });
  }

  /* =====================================================================
     ORDERS
     Orders are created by the Stripe webhook when a payment succeeds. Here the admin
     packs them: adds the carrier and tracking number, marks them shipped (which emails
     the customer), and keeps notes. Refunds are done in Stripe and show up here by themselves.
     ===================================================================== */
  const ORDER_STATUS = {
    paid: '<span class="pill pill--draft">To ship</span>',
    shipped: '<span class="pill pill--live">Shipped</span>',
    refunded: '<span class="pill pill--off">Refunded</span>',
    cancelled: '<span class="pill pill--off">Cancelled</span>',
  };
  const orderPill = o => (ORDER_STATUS[o.status] || esc(o.status)) +
    (o.amount_refunded && o.status !== 'refunded' ? ' <span class="pill pill--red">Part refunded</span>' : '');
  const itemCount = o => (o.order_items || []).reduce((a, i) => a + i.quantity, 0);
  const audHint = o => (o.currency !== 'aud' && o.amount_total_aud ? `<small class="muted">≈ ${minor(o.amount_total_aud, 'aud')}</small>` : '');

  function orders() {
    setTitle('Orders');
    const O = DATA.orders;
    const toShip = O.filter(o => o.status === 'paid').length;
    view.innerHTML = `
      ${CMS.mode === 'demo' ? '<div class="notice notice--demo"><b>Sample orders.</b> Real orders appear here by themselves once Stripe is connected.</div>' : ''}
      ${CMS.mode !== 'demo' && !cfg.stripe?.enabled ? '<div class="notice notice--demo"><b>Checkout is switched off.</b> Set <code>stripe.enabled</code> to true in <code>assets/js/config.js</code> once the Stripe setup is done.</div>' : ''}
      <div class="panel">
        <div class="toolbar">
          <input id="q" placeholder="Search order number, name or email" maxlength="80" aria-label="Search orders">
          <select id="fStatus" aria-label="Status">
            <option value="paid" ${toShip ? 'selected' : ''}>To ship (${toShip})</option>
            <option value="shipped">Shipped</option>
            <option value="refunded">Refunded</option>
            <option value="" ${toShip ? '' : 'selected'}>All orders</option>
          </select>
          <span style="flex:1"></span>
          <span id="bulk" hidden style="display:inline-flex;gap:10px;align-items:center">
            <label class="toggle" style="font-size:12px"><input type="checkbox" id="bulkRestock" checked>Put items back in stock</label>
            <button type="button" class="btn btn--danger btn--sm" id="bulkDelete">Delete selected</button>
          </span>
          <a class="btn btn--ghost btn--sm" href="${stripeUrl('payments')}" target="_blank" rel="noopener noreferrer">Open Stripe</a>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th style="width:36px"><input type="checkbox" id="pickAll" aria-label="Select all shown"></th><th>Order</th><th>Placed</th><th>Customer</th><th class="num">Items</th><th>Status</th><th class="num">Total</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
      </div>`;
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase().replace(/^spx-?/, ''), st = $('#fStatus').value;
      const list = O.filter(o =>
        (!st || o.status === st) &&
        (!q || `${o.number} ${o.name} ${o.email}`.toLowerCase().includes(q)));
      $('#rows').innerHTML = list.map(o => `
        <tr data-id="${esc(o.id)}">
          <td><input type="checkbox" class="pick" value="${esc(o.id)}" ${picked.has(String(o.id)) ? 'checked' : ''} aria-label="Select SPX-${esc(o.number)}"></td>
          <td><b style="color:var(--bone)">SPX-${esc(o.number)}</b></td>
          <td>${fmtDate(o.created_at)}</td>
          <td class="t-cust">${esc(o.name || '—')}<small>${esc(o.email)}${o.shipping_address?.country && o.shipping_address.country !== 'AU' ? ` · ${esc(regionName(o.shipping_address.country))}` : ''}</small></td>
          <td class="num">${itemCount(o)}</td>
          <td>${orderPill(o)}</td>
          <td class="num">${minor(o.amount_total, o.currency)}<br>${audHint(o)}</td>
        </tr>`).join('') || `<tr><td colspan="7"><div class="empty">${O.length ? 'No orders match.' : 'No orders yet. They appear here as soon as someone pays.'}</div></td></tr>`;
      syncBulk();
    };
    const picked = new Set();
    const syncBulk = () => {
      $('#bulk').hidden = !picked.size;
      $('#bulkDelete').textContent = `Delete ${picked.size} selected`;
      const boxes = $$('#rows .pick');
      $('#pickAll').checked = boxes.length > 0 && boxes.every(b => b.checked);
    };
    ['#q', '#fStatus'].forEach(sel => $(sel).addEventListener('input', draw));
    $('#rows').addEventListener('click', e => {
      if (e.target.matches('.pick')) { e.target.checked ? picked.add(e.target.value) : picked.delete(e.target.value); syncBulk(); return; }
      if (e.target.closest('td:first-child')) return; // clicking beside the tick box doesn't open the order
      const tr = e.target.closest('tr[data-id]'); if (tr) go('#order/' + tr.dataset.id);
    });
    $('#pickAll').addEventListener('change', e => {
      $$('#rows .pick').forEach(b => { b.checked = e.target.checked; e.target.checked ? picked.add(b.value) : picked.delete(b.value); });
      syncBulk();
    });
    $('#bulkDelete').addEventListener('click', async () => {
      const chosen = O.filter(o => picked.has(String(o.id)));
      const unrefunded = chosen.filter(o => refundLeft(o) > 0 && o.stripe_payment_intent);
      const restock = $('#bulkRestock').checked;
      if (!confirm(`Delete ${chosen.length} order${chosen.length === 1 ? '' : 's'} (${chosen.map(o => 'SPX-' + o.number).join(', ')})?${unrefunded.length
        ? `\n\n${unrefunded.length} of them ${unrefunded.length === 1 ? 'has' : 'have'} NOT been refunded. Deleting doesn't give customers their money back. Only continue for test orders.` : ''}${restock ? '\n\nTheir items will be put back in stock.' : ''}\n\nThis can't be undone.`)) return;
      let done = 0;
      const ok = await withWrite(`Enter your admin password to delete ${chosen.length} order${chosen.length === 1 ? '' : 's'}.`, async () => {
        for (const o of chosen) { await CMS.deleteOrder(o.id, restock && !o.restocked_at); done++; }
      });
      if (done) {
        toast(`${done} order${done === 1 ? '' : 's'} deleted${restock ? ', items back in stock' : ''}`);
        await reloadOrders();
        orders();
        if (restock) refreshLater();
      } else if (!ok) { /* cancelled or failed: message already shown */ }
    });
    draw();
  }

  // Carriers whose tracking page address is predictable. Others: paste the link.
  const CARRIERS = ['Australia Post', 'Sendle', 'StarTrack', 'Aramex', 'CouriersPlease', 'DHL Express', 'Other'];
  const TRACKING = {
    'Australia Post': n => `https://auspost.com.au/mypost/track/details/${encodeURIComponent(n)}`,
    'DHL Express': n => `https://www.dhl.com/au-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}&submit=1`,
  };

  const refundLeft = o => Math.max(0, (o.amount_total || 0) - (o.amount_refunded || 0));
  const toMinor = (value, cur) => Math.round(Number(value) * (ZERO_DECIMAL.has(String(cur).toLowerCase()) ? 1 : 100));
  const fromMinor = (n, cur) => (n / (ZERO_DECIMAL.has(String(cur).toLowerCase()) ? 1 : 100));

  // Refund controls on an order: full or part refund through Stripe, optional restock.
  function refundBox(o) {
    const left = refundLeft(o);
    if (!o.stripe_payment_intent) return '';
    if (left <= 0) return `<div class="notice notice--ok">Fully refunded (${minor(o.amount_refunded, o.currency)}).${o.restocked_at ? ' Items were put back in stock.' : ''} The money reaches the customer's card in 5–10 business days.</div>`;
    const cur = String(o.currency).toUpperCase();
    return `
      <div class="refund" id="refundBox">
        ${o.amount_refunded ? `<div class="hint">Already refunded ${minor(o.amount_refunded, o.currency)}. ${minor(left, o.currency)} left.</div>` : ''}
        <div class="seg" id="refundKind"><button type="button" class="on" data-k="full">Full refund</button><button type="button" data-k="part">Part refund</button></div>
        <label id="refundAmtWrap" hidden>Amount (${esc(cur)})<input id="refundAmt" type="number" min="0.01" step="0.01" max="${fromMinor(left, o.currency)}" placeholder="e.g. 20.00"></label>
        ${o.restocked_at ? '' : `<label class="toggle" id="refundRestockWrap"><input type="checkbox" id="refundRestock" ${o.status === 'shipped' ? '' : 'checked'}>Put the ${itemCount(o)} item${itemCount(o) === 1 ? '' : 's'} back in stock</label>`}
        <div><button type="button" class="btn btn--danger btn--sm" id="refundGo">Refund ${minor(left, o.currency)}</button></div>
        <p class="hint" style="margin:0">Goes straight back to the customer's card through Stripe. Stock is only put back on a full refund. Tick it if the items can be sold again.</p>
      </div>`;
  }

  function wireRefund(o, id) {
    const box = $('#refundBox'); if (!box) return;
    const left = refundLeft(o);
    let kind = 'full';
    const amount = () => (kind === 'full' ? left : toMinor($('#refundAmt').value, o.currency));
    const label = () => {
      const a = amount();
      $('#refundGo').textContent = a > 0 ? `Refund ${minor(Math.min(a, left), o.currency)}` : 'Refund';
    };
    $('#refundKind').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      kind = b.dataset.k;
      $$('#refundKind button').forEach(x => x.classList.toggle('on', x === b));
      $('#refundAmtWrap').hidden = kind === 'full';
      if ($('#refundRestockWrap')) $('#refundRestockWrap').hidden = kind !== 'full';
      if (kind === 'part') $('#refundAmt').focus();
      label();
    });
    $('#refundAmt').addEventListener('input', label);
    $('#refundGo').addEventListener('click', async () => {
      const amt = amount();
      if (!(amt > 0) || amt > left) { toast(`Enter an amount up to ${minor(left, o.currency)}`, true); return; }
      const restock = kind === 'full' && !!$('#refundRestock')?.checked;
      if (!confirm(`Refund ${minor(amt, o.currency)} to ${o.name || 'the customer'} for SPX-${o.number}?${restock ? '\n\nThe items will be put back in stock.' : ''}\n\nThis can't be undone.`)) return;
      let result;
      const ok = await withWrite(`Enter your admin password to refund ${minor(amt, o.currency)} on SPX-${o.number}.`, async () => {
        result = await CMS.refundOrder(o.id, kind === 'full' ? null : amt, restock);
      });
      if (!ok) return;
      toast(`Refunded ${minor(amt, o.currency)}${result?.restocked ? ', items back in stock' : ''}`);
      await reloadOrders();
      orderDetail(id);
      if (result?.restocked) refreshLater(); // stock changed
    });
  }

  function orderDetail(id) {
    const o = DATA.orders.find(x => String(x.id) === id);
    if (!o) { toast('That order no longer exists', true); go('#orders'); return; }
    setTitle(`Order SPX-${o.number}`);
    const a = o.shipping_address || {};
    const addrLines = [o.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country ? regionName(a.country) : ''].filter(Boolean);
    const items = o.order_items || [];
    const pi = o.stripe_payment_intent;
    const open = o.status === 'paid';

    view.innerHTML = `
      <p style="margin:0 0 14px"><a class="link" href="#orders">← All orders</a></p>
      <div class="grid-2">
        <div class="stack">
          <div class="panel">
            <div class="panel__head"><h2>SPX-${esc(o.number)} · ${itemCount(o)} item${itemCount(o) === 1 ? '' : 's'}</h2><span>${orderPill(o)}</span></div>
            <div class="table-wrap"><table>
              <thead><tr><th>Product</th><th>Size</th><th class="num">Qty</th><th class="num">Price</th></tr></thead>
              <tbody>${items.map(i => `<tr style="cursor:default">
                <td><div class="t-prod"><img src="${esc(asset(i.image))}" alt=""><div><b>${esc(i.name)}</b><small>${esc(i.sku || '—')}</small></div></div></td>
                <td>${esc(i.size || '—')}</td><td class="num">${esc(i.quantity)}</td><td class="num">${money(i.unit_price_aud)}</td></tr>`).join('')}</tbody>
            </table></div>
            <div class="panel__body order-sum">
              <div><span>Subtotal</span><span>${minor(o.amount_subtotal, o.currency)}</span></div>
              <div><span>Shipping${o.shipping_method ? ` · ${esc(o.shipping_method)}` : ''}</span><span>${o.amount_shipping ? minor(o.amount_shipping, o.currency) : 'Free'}</span></div>
              ${o.amount_tax ? `<div><span>Tax</span><span>${minor(o.amount_tax, o.currency)}</span></div>` : ''}
              <div class="total"><span>Paid</span><span>${minor(o.amount_total, o.currency)}</span></div>
              ${o.currency !== 'aud' && o.amount_total_aud ? `<div><span>In Australian dollars</span><span>≈ ${minor(o.amount_total_aud, 'aud')}</span></div>` : ''}
              ${o.amount_refunded ? `<div class="refund"><span>Refunded</span><span>−${minor(o.amount_refunded, o.currency)}</span></div>` : ''}
            </div>
          </div>
          <div class="panel"><div class="panel__head"><h2>Payment</h2></div><div class="panel__body stack">
            <div>Paid ${fmtDate(o.created_at)} in ${esc(String(o.currency).toUpperCase())}${o.confirmation_email_at ? ' · confirmation emailed' : ''}</div>
            ${refundBox(o)}
            <div class="btn-row" style="justify-content:flex-start">
              ${pi ? `<a class="btn btn--ghost btn--sm" href="${esc(stripeUrl('payments/' + encodeURIComponent(pi)))}" target="_blank" rel="noopener noreferrer">View payment in Stripe</a>` : ''}
              ${o.access_key ? '<button type="button" class="btn btn--ghost btn--sm" id="copyLink">Copy customer\'s order link</button>' : ''}
            </div>
            ${o.access_key ? '<p class="hint" style="margin:0">The private page the customer sees (also linked in their emails). Send it if they ask where their order is.</p>' : ''}
          </div></div>
        </div>

        <div class="stack">
          <div class="panel"><div class="panel__head"><h2>Ship to</h2><button type="button" class="link" id="copyAddr">Copy address</button></div>
            <div class="panel__body">
              <address class="addr">${addrLines.map(esc).join('<br>')}</address>
              <p class="hint" style="margin:10px 0 0">${esc(o.email)}${o.phone ? ` · ${esc(o.phone)}` : ''}</p>
            </div>
          </div>
          <form class="panel" id="shipForm" novalidate><div class="panel__head"><h2>Fulfilment</h2></div><div class="panel__body stack">
            ${o.status === 'shipped' ? `<div class="notice notice--ok">Shipped ${o.shipped_at ? fmtDate(o.shipped_at) : ''}${o.shipping_email_at ? ' · tracking emailed to the customer' : ' · no email sent'}</div>` : ''}
            ${o.status === 'shipped' && !o.shipping_email_at && o.email ? `<div><button type="button" class="btn btn--ghost btn--sm" id="resendTracking">Send tracking email to ${esc(o.email)}</button></div>` : ''}
            <div class="field-row">
              <label>Carrier<select name="carrier">${['', ...CARRIERS].map(c => `<option value="${esc(c)}" ${c === (o.carrier || '') ? 'selected' : ''}>${c ? esc(c) : 'Choose…'}</option>`).join('')}</select></label>
              <label>Tracking number<input name="tracking_number" maxlength="80" value="${esc(o.tracking_number || '')}" autocomplete="off"></label>
            </div>
            <label>Tracking link<input name="tracking_url" type="url" maxlength="500" placeholder="https://" value="${esc(o.tracking_url || '')}"><span class="hint">Filled in for you with Australia Post and DHL. For other carriers, paste the link from their site.</span></label>
            <label>Notes <span class="hint">Only visible here</span><textarea name="notes" rows="3" maxlength="2000" style="min-height:80px">${esc(o.notes || '')}</textarea></label>
            <div class="btn-row">
              ${o.status === 'shipped' ? '<button type="submit" class="btn btn--ghost btn--sm" value="unship">Mark as not shipped</button>' : ''}
              <button type="submit" class="btn ${open ? 'btn--ghost btn--sm' : ''}" value="save">Save${open ? ' notes' : ' changes'}</button>
              ${open ? '<button type="submit" class="btn" value="ship">Mark shipped &amp; email customer</button>' : ''}
            </div>
          </div></form>
          <div class="panel panel--danger"><div class="panel__head"><h2>Delete order</h2></div><div class="panel__body stack">
            <p class="hint" style="margin:0">Removes SPX-${esc(o.number)} from the store for good. ${refundLeft(o) > 0 && pi ? '<b style="color:var(--red)">It does not refund the customer.</b> Refund it above first, unless it\'s a test order.' : 'Use it to clear out test orders.'}</p>
            ${o.restocked_at ? '<span class="hint">Its items were already put back in stock.</span>' : `<label class="toggle"><input type="checkbox" id="delRestock" ${o.status === 'shipped' ? '' : 'checked'}>Put its ${itemCount(o)} item${itemCount(o) === 1 ? '' : 's'} back in stock</label>`}
            <div><button type="button" class="btn btn--danger btn--sm" id="delOrder">Delete SPX-${esc(o.number)}</button></div>
          </div></div>
        </div>
      </div>`;

    wireRefund(o, id);
    $('#delOrder').addEventListener('click', async () => {
      const unrefunded = refundLeft(o) > 0 && pi;
      if (!confirm(unrefunded
        ? `SPX-${o.number} has NOT been refunded (${minor(refundLeft(o), o.currency)} paid). Deleting it won't give the customer their money back.\n\nOnly continue if this is a test order. Delete it?`
        : `Delete SPX-${o.number}? This can't be undone.`)) return;
      const restock = !!$('#delRestock')?.checked;
      const ok = await withWrite(`Enter your admin password to delete order SPX-${o.number}.`, () => CMS.deleteOrder(o.id, restock));
      if (!ok) return;
      toast(`SPX-${o.number} deleted${restock ? ', items back in stock' : ''}`);
      DATA.orders = DATA.orders.filter(x => x.id !== o.id);
      go('#orders');
      refreshLater();
    });

    const form = $('#shipForm');
    let autoUrl = !o.tracking_url;
    const fillUrl = () => {
      const make = TRACKING[form.carrier.value], n = form.tracking_number.value.trim();
      if (autoUrl) form.tracking_url.value = make && n ? make(n) : '';
    };
    form.carrier.addEventListener('change', fillUrl);
    form.tracking_number.addEventListener('input', fillUrl);
    form.tracking_url.addEventListener('input', () => { autoUrl = !form.tracking_url.value; });
    form.addEventListener('input', () => { dirty = true; });

    $('#copyLink')?.addEventListener('click', async () => {
      const link = new URL(`${ROOT}order/?o=${encodeURIComponent(o.number)}&k=${encodeURIComponent(o.access_key)}`, location.href).href;
      try { await navigator.clipboard.writeText(link); toast('Order link copied'); }
      catch { prompt('Copy this link:', link); }
    });
    $('#resendTracking')?.addEventListener('click', async () => {
      let res = null;
      const ok = await withWrite(`Enter your admin password to email tracking for SPX-${o.number}.`, async () => {
        res = await CMS.sendShippingEmail(o.id);
      });
      if (!ok) return;
      if (res?.sent) toast('Tracking emailed to the customer');
      else toast({ not_configured: 'Order emails aren\'t set up yet', demo: 'Demo: no email sent', already_sent: 'The customer was already emailed' }[res?.reason] || 'Email not sent', !res?.sent);
      await reloadOrders();
      orderDetail(id);
    });
    $('#copyAddr').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(addrLines.join('\n')); toast('Address copied'); }
      catch { toast('Could not copy. Select the address instead', true); }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const action = e.submitter?.value || 'save';
      const url = form.tracking_url.value.trim();
      if (url && !/^https:\/\/[^\s<>"]{1,500}$/.test(url)) { toast('The tracking link must start with https://', true); return; }
      const next = {
        ...o,
        carrier: form.carrier.value,
        tracking_number: form.tracking_number.value.trim(),
        tracking_url: url || null,
        notes: form.notes.value,
      };
      if (action === 'ship') {
        if (!next.tracking_number && !confirm('Mark as shipped without a tracking number?')) return;
        Object.assign(next, { status: 'shipped', shipped_at: new Date().toISOString() });
      }
      if (action === 'unship') Object.assign(next, { status: 'paid', shipped_at: null });

      const text = action === 'ship' ? `Enter your admin password to mark SPX-${o.number} as shipped and email the customer.`
        : `Enter your admin password to update order SPX-${o.number}.`;
      let email = null;
      const ok = await withWrite(text, async () => {
        await CMS.saveOrder(next);
        // Still inside the password window, which the email function checks too.
        if (action === 'ship') email = await CMS.sendShippingEmail(o.id).catch(err => ({ error: err.message }));
      });
      if (!ok) return;
      dirty = false;
      if (action !== 'ship') toast('Order updated');
      else if (email?.sent) toast('Marked shipped. Tracking emailed to the customer');
      else if (email?.error) toast(`Marked shipped. ${email.error}`, true);
      else toast({
        not_configured: 'Marked shipped. Order emails aren\'t set up, so the customer wasn\'t emailed',
        already_sent: 'Marked shipped. The customer was already emailed',
        no_email: 'Marked shipped. There\'s no email address on this order',
        demo: 'Marked shipped (demo: no email sent)',
      }[email?.reason] || 'Marked shipped');
      await reloadOrders();
      orderDetail(id);
    });
  }

  /* =====================================================================
     PRODUCTS LIST
     ===================================================================== */
  function products() {
    setTitle('Products');
    view.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input id="q" placeholder="Search products" maxlength="80" aria-label="Search products">
          <select id="fStatus" aria-label="Status"><option value="">All statuses</option><option value="published">Live</option><option value="draft">Draft</option><option value="soldout">Sold out</option></select>
          <select id="fPage" aria-label="Page"><option value="">All pages</option>${DATA.collections.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="none">Not on any page</option></select>
          <span style="flex:1"></span>
          <a class="btn" href="#product/new">+ Add product</a>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Product</th><th>Pages</th><th>Status</th><th class="num">Stock</th><th class="num">Price</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
      </div>
      <div class="panel" style="margin-top:18px">
        <div class="panel__head"><h2>Product types</h2><span class="muted" style="font-size:12px">The "Type" filter in the shop and the homepage tabs. Only types with products show on the site.</span></div>
        <div class="panel__body">
          <div class="types" id="types"></div>
          <form class="types__add" id="typeForm"><input id="newType" maxlength="40" placeholder="e.g. Jerseys" aria-label="New product type"><button class="btn btn--ghost btn--sm">+ Add type</button></form>
        </div>
      </div>`;
    const draw = () => {
      const q = $('#q').value.toLowerCase(), st = $('#fStatus').value, pg = $('#fPage').value;
      const list = DATA.products.filter(p =>
        (!q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q)) &&
        (!st || (st === 'soldout' ? p.stock === 0 : p.status === st)) &&
        (!pg || (pg === 'none' ? !p.collections.length : p.collections.includes(pg))));
      $('#rows').innerHTML = list.map(p => `
        <tr data-id="${esc(p.id)}">
          <td><div class="t-prod"><img src="${esc(shown(p.images[0]))}" alt="" loading="lazy"><div><b>${esc(p.name)}</b><small>${esc(p.sku || '—')} // ${esc(p.category)}</small></div></div></td>
          <td>${p.collections.map(id => DATA.collections.find(c => c.id === id)).filter(Boolean).map(c => `<span class="tag">${esc(c.name)}</span>`).join('') || '<span class="muted">—</span>'}</td>
          <td>${p.status === 'published' ? '<span class="pill pill--live">Live</span>' : '<span class="pill pill--draft">Draft</span>'}</td>
          <td class="num">${p.stock === 0 ? '<span class="pill pill--red">Sold out</span>' : p.stock}</td>
          <td class="num">${p.compare_at ? `<s class="muted">${money(p.compare_at)}</s> ` : ''}${money(p.price)}</td>
        </tr>`).join('') || `<tr><td colspan="5"><div class="empty">No products match.</div></td></tr>`;
    };
    ['#q', '#fStatus', '#fPage'].forEach(s => $(s).addEventListener('input', draw));
    $('#rows').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#product/' + tr.dataset.id); });
    draw();

    // Product types: add, remove, reorder. A type still used by products can't be removed.
    const used = t => DATA.products.filter(p => p.category === t).length;
    const drawTypes = () => {
      const types = productTypes();
      $('#types').innerHTML = types.map((t, i) => `<span class="type-chip" data-i="${i}">
          ${i ? `<button type="button" data-move="-1" aria-label="Move ${esc(t)} left">‹</button>` : ''}
          <b>${esc(t)}</b><small>${used(t)}</small>
          ${i < types.length - 1 ? `<button type="button" data-move="1" aria-label="Move ${esc(t)} right">›</button>` : ''}
          <button type="button" data-rm aria-label="Remove ${esc(t)}">×</button></span>`).join('') || '<span class="muted">No types yet. Add one below.</span>';
    };
    const saveTypes = async (types, text, done) => {
      const next = { ...DATA.settings, productTypes: types };
      const ok = await withWrite(`Enter your admin password to ${text}.`, async () => {
        await CMS.saveSettings(next);
        DATA.settings = CMS.mergeSettings(next);
      });
      if (ok) { toast(done); drawTypes(); }
    };
    $('#types').addEventListener('click', e => {
      const chip = e.target.closest('[data-i]'); if (!chip) return;
      const types = productTypes(), i = +chip.dataset.i, t = types[i];
      if (e.target.closest('[data-rm]')) {
        const n = used(t);
        if (n) { toast(`${n} product${n === 1 ? ' is' : 's are'} still set to "${t}". Change ${n === 1 ? 'it' : 'them'} to another type first.`, true); return; }
        if (!confirm(`Remove the product type "${t}"?`)) return;
        saveTypes(types.filter((_, j) => j !== i), `remove "${t}"`, `Removed "${t}"`);
      } else if (e.target.closest('[data-move]')) {
        const j = i + +e.target.closest('[data-move]').dataset.move;
        [types[i], types[j]] = [types[j], types[i]];
        saveTypes(types, 'reorder the product types', 'Order saved');
      }
    });
    $('#typeForm').addEventListener('submit', e => {
      e.preventDefault();
      const t = $('#newType').value.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!t) return;
      const types = productTypes();
      if (types.some(x => x.toLowerCase() === t.toLowerCase())) { toast(`"${t}" is already there`, true); return; }
      saveTypes([...types, t], `add the product type "${t}"`, `Added "${t}"`).then(() => { $('#newType').value = ''; });
    });
    drawTypes();
  }
  // The admin's product types, plus any type a product still uses (so nothing ever goes missing).
  function productTypes() {
    const list = (DATA.settings.productTypes || []).filter(t => typeof t === 'string' && t.trim());
    return [...new Set([...list, ...DATA.products.map(p => p.category).filter(Boolean)])];
  }

  /* =====================================================================
     SHARED: live preview panel
     ===================================================================== */
  function previewPanel(path, urlLabel) {
    return `
      <aside class="preview">
        <div class="preview__head">
          <h3><span class="live-dot"></span>Live preview</h3>
          <span style="flex:1"></span>
          <div class="seg" id="device"><button type="button" class="on" data-w="1280">Desktop</button><button type="button" data-w="390">Mobile</button></div>
        </div>
        <div class="preview__chrome"><i></i><i></i><i></i><span class="preview__url" id="previewUrl">${esc(urlLabel)}</span></div>
        <div class="preview__stage" id="stage"><iframe id="frame" src="${path}" title="Live preview" sandbox="allow-scripts allow-same-origin"></iframe></div>
      </aside>`;
  }

  // Wires the iframe: scales it to fit, and returns send() which posts the current draft in.
  function wirePreview(getDraft) {
    const frame = $('#frame'), stage = $('#stage');
    let width = 1280, ready = false;
    const fit = () => {
      const scale = Math.min(1, stage.clientWidth / width);
      frame.style.width = width + 'px';
      frame.style.height = stage.clientHeight / scale + 'px';
      frame.style.transform = `scale(${scale})`;
      frame.style.left = Math.max(0, (stage.clientWidth - width * scale) / 2) + 'px'; // centre the phone view
    };
    $('#device').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#device button').forEach(x => x.classList.toggle('on', x === b));
      width = +b.dataset.w; fit();
    });
    new ResizeObserver(fit).observe(stage);
    fit();
    let t;
    const send = () => {
      clearTimeout(t);
      t = setTimeout(() => { if (ready && frame.contentWindow) frame.contentWindow.postMessage({ type: 'spx:preview', ...getDraft() }, location.origin); }, 120);
    };
    const onMsg = e => {
      if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
      // The store page asks for its content: hand over what the admin already has (as the public
      // would see it), so the preview appears instantly instead of downloading everything again.
      if (e.data?.type === 'spx:preview-hello') {
        frame.contentWindow.postMessage({ type: 'spx:preview-data', data: {
          collections: DATA.collections.filter(c => c.visible),
          products: DATA.products.filter(p => p.status === 'published').map(p => ({ ...p, images: p.images.map(u => localCopy.get(u) || u) })),
          settings: DATA.settings,
        } }, location.origin);
      }
      if (e.data?.type === 'spx:preview-ready') { ready = true; send(); }
    };
    window.addEventListener('message', onMsg);
    // stop listening once this editor is replaced
    const stop = () => { window.removeEventListener('message', onMsg); window.removeEventListener('hashchange', stop); };
    window.addEventListener('hashchange', stop);
    return send;
  }

  // Photo list helpers: items are {url} (already uploaded) or {file, preview} (new, uploaded on save).
  // Photos: each new one is {file, preview, prepared}. Resizing starts the moment it's picked
  // (prepared), so by the time Save is pressed there's usually only the upload left.
  // onFail(ph) runs if a photo turns out to be unreadable, so the caller can remove its tile.
  function acceptFiles(files, list, max, onFail) {
    for (const f of files) {
      if (list.length >= max) { toast(`Up to ${max} photos`, true); break; }
      if (!CMS.imageOk(f)) { toast(`${f.name}: use JPG, PNG, WebP, AVIF or iPhone HEIC`, true); continue; }
      if (f.size > 25 * 1024 * 1024) { toast(`${f.name} is over 25MB`, true); continue; }
      const prepared = CMS.prepareImage(f);
      const ph = { file: f, preview: URL.createObjectURL(f), prepared };
      // Show the resized copy (and catch unreadable files like HEIC in Chrome) straight away.
      prepared.then(blob => { ph.preview = URL.createObjectURL(blob); }, err => { ph.error = err.message; toast(err.message, true); onFail?.(ph); });
      list.push(ph);
    }
  }
  // Photos uploaded in this session keep showing from memory instead of downloading again.
  const localCopy = new Map();
  const shown = u => localCopy.get(u) || asset(u);
  const photoSrc = ph => ph.url ? shown(ph.url) : ph.preview;
  const photoDraft = ph => ph.url ? (localCopy.get(ph.url) || ph.url) : ph.preview;
  let progress = () => {};  // set by withWrite while a save runs
  async function uploadOne(ph, folder) {
    if (ph.url) return ph.url;
    if (ph.error) throw new Error(ph.error);
    const url = await CMS.uploadImage(ph.file, folder, ph.prepared);
    localCopy.set(url, ph.preview);
    return url;
  }
  // Uploads new photos two at a time, reporting "Uploading photo 2 of 5".
  async function uploadAll(list, folder) {
    const todo = list.filter(ph => ph && !ph.url).length;
    let done = 0;
    const out = new Array(list.length);
    const queue = list.map((ph, i) => [ph, i]);
    const worker = async () => {
      for (let job; (job = queue.shift());) {
        const [ph, i] = job;
        if (!ph) { out[i] = ''; continue; }
        const isNew = !ph.url;
        if (isNew) progress(`Uploading photo ${done + 1} of ${todo}…`);
        out[i] = await uploadOne(ph, folder);
        if (isNew) done++;
      }
    };
    await Promise.all([worker(), worker()]);
    return out;
  }

  function wireDrop(zone, input, onFiles) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.onchange = () => { onFiles([...input.files]); input.value = ''; }; // replaces, never stacks
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); onFiles([...e.dataTransfer.files]); });
  }

  /* =====================================================================
     PRODUCT EDITOR
     ===================================================================== */
  function productEditor(id) {
    const existing = id !== 'new' && DATA.products.find(p => p.id === id);
    if (id !== 'new' && !existing) { toast('That product no longer exists', true); go('#products'); return; }
    const original = existing ? clone(existing) : null;
    const p = existing ? clone(existing) : {
      id: null, slug: '', sku: '', name: '', category: productTypes()[0] || '', price: '', compare_at: null, description: '', spec: '',
      sizes: ['S', 'M', 'L', 'XL'], colors: ['#0A0A0A'], images: [], stock: 0, badge: 'New', is_new: true, status: 'draft',
      sort_order: DATA.products.reduce((m, x) => Math.max(m, x.sort_order || 0), 0) + 1, collections: [],
    };
    const photos = p.images.map(url => ({ url }));
    let slugTouched = !!existing;
    setTitle(existing ? 'Edit product' : 'New product');

    view.innerHTML = `
      <div class="editor">
        <form class="editor__form" id="pform" novalidate>
          <div class="section">
            <h3>Product <small>${existing ? `Last saved ${esc(fmtDate(existing.updated_at || Date.now()))}` : 'Not saved yet'}</small></h3>
            <label>Title<input name="name" maxlength="120" required value="${esc(p.name)}" placeholder="e.g. Ghost Eye Hoodie"></label>
            <label>Web address
              <div class="prefix"><span>/product/?p=</span><input name="slug" maxlength="80" value="${esc(p.slug)}" placeholder="ghost-eye-hoodie"></div>
              <span class="hint">Lowercase letters, numbers and dashes. Filled in from the title automatically.</span>
            </label>
            <div class="field-row">
              <label>Product type<select name="category" required>${[...new Set([...productTypes(), p.category].filter(Boolean))].map(c => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
              <label>SKU / code<input name="sku" maxlength="40" value="${esc(p.sku)}" placeholder="SPX-H-001"></label>
            </div>
            <div><label style="margin-bottom:8px">Visibility</label>
              <div class="seg" id="status"><button type="button" data-v="draft" class="${p.status === 'draft' ? 'on' : ''}">Draft (hidden)</button><button type="button" data-v="published" class="${p.status === 'published' ? 'on' : ''}">Live on site</button></div>
            </div>
          </div>

          <div class="section">
            <h3>Pages <small>Tick every page this product should appear on</small></h3>
            <div class="checks">${DATA.collections.map(c => `<label><input type="checkbox" name="collections" value="${esc(c.id)}" ${p.collections.includes(c.id) ? 'checked' : ''}>${esc(c.name)}${c.visible ? '' : ' <small class="muted">(hidden)</small>'}</label>`).join('') || '<p class="muted">No pages yet.</p>'}</div>
            <a class="link" href="#page/new">+ Create a new page</a>
          </div>

          <div class="section">
            <h3>Photos <small>First photo is the main image. Up to 12.</small></h3>
            <div class="photos" id="photos"></div>
            <input type="file" id="photoInput" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" multiple hidden>
          </div>

          <div class="section">
            <h3>Price &amp; stock</h3>
            <div class="field-row">
              <label>Price (${STORE.currency})<input name="price" type="number" min="0" step="0.01" required value="${esc(p.price)}"></label>
              <label>Was price <span class="hint">optional, shows as a sale</span><input name="compare_at" type="number" min="0" step="0.01" value="${esc(p.compare_at ?? '')}"></label>
              <label>Stock<input name="stock" type="number" min="0" step="1" value="${esc(p.stock)}"></label>
            </div>
            <div class="field-row">
              <label>Badge<select name="badge"><option value="">None</option>${STORE.badges.map(b => `<option ${b === p.badge ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
              <label class="toggle" style="align-self:end;height:44px"><input type="checkbox" name="is_new" ${p.is_new ? 'checked' : ''}>Show in "Fresh off the line"</label>
            </div>
          </div>

          <div class="section">
            <h3>Sizes &amp; colours</h3>
            <label>Sizes</label>
            <div class="chips-edit" id="sizes"></div>
            <label>Colours</label>
            <div class="swatch-edit" id="colors"></div>
          </div>

          <div class="section">
            <h3>Description</h3>
            <label>Short spec line<input name="spec" maxlength="120" value="${esc(p.spec)}" placeholder="500GSM / puff print"></label>
            <label>Description<textarea name="description" maxlength="5000" rows="7" placeholder="What it's made of, how it fits, why it's worth it…">${esc(p.description)}</textarea></label>
            <div class="counter" id="descCount"></div>
          </div>

          <div class="savebar">
            ${existing ? '<button type="button" class="btn btn--danger btn--sm" id="del">Delete</button>' : ''}
            <span class="dirty" id="dirtyFlag" hidden>Unsaved changes</span>
            <span class="spacer"></span>
            <a class="btn btn--ghost btn--sm" href="#products">Back</a>
            <button type="submit" class="btn">Save product</button>
          </div>
        </form>
        ${previewPanel(ROOT + 'product/?preview=1', 'spxtr.com/product/?p=' + (p.slug || 'new-product'))}
      </div>`;

    const form = $('#pform');
    const send = wirePreview(() => ({ product: { ...p, id: p.id || 'draft', images: photos.map(photoDraft), price: Number(p.price) || 0, compare_at: p.compare_at ? Number(p.compare_at) : null, stock: Number(p.stock) || 0 } }));

    const markDirty = () => { dirty = true; $('#dirtyFlag').hidden = false; send(); };
    const read = () => {
      const f = new FormData(form);
      p.name = f.get('name').trim();
      if (!slugTouched) { p.slug = CMS.slugify(p.name); form.slug.value = p.slug; }
      p.slug = form.slug.value.trim();
      p.sku = f.get('sku').trim();
      p.category = f.get('category');
      p.price = f.get('price');
      p.compare_at = f.get('compare_at') || null;
      p.stock = Math.max(0, parseInt(f.get('stock') || '0', 10) || 0);
      p.badge = f.get('badge') || null;
      p.is_new = f.get('is_new') === 'on';
      p.spec = f.get('spec').trim();
      p.description = f.get('description');
      p.collections = f.getAll('collections');
      $('#descCount').textContent = `${p.description.length} / 5000`;
      $('#previewUrl').textContent = 'spxtr.com/product/?p=' + (p.slug || 'new-product');
    };
    form.slug.addEventListener('input', () => { slugTouched = true; });
    form.addEventListener('input', () => { read(); markDirty(); });
    form.addEventListener('change', () => { read(); markDirty(); });
    $('#status').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      p.status = b.dataset.v;
      $$('#status button').forEach(x => x.classList.toggle('on', x === b));
      markDirty();
    });

    // photos
    const dropPhoto = ph => { const i = photos.indexOf(ph); if (i > -1) { photos.splice(i, 1); drawPhotos(); } };
    const drawPhotos = () => {
      $('#photos').innerHTML = photos.map((ph, i) => `
        <div class="photo"><img src="${esc(photoSrc(ph))}" alt="">
          ${i === 0 ? '<span class="photo__main">Main</span>' : ''}${ph.file ? '<span class="photo__new">New</span>' : ''}
          <div class="photo__tools">
            <button type="button" data-act="left" data-i="${i}" aria-label="Move left" ${i === 0 ? 'disabled' : ''}>←</button>
            <button type="button" data-act="main" data-i="${i}" aria-label="Make main photo">★</button>
            <button type="button" data-act="right" data-i="${i}" aria-label="Move right" ${i === photos.length - 1 ? 'disabled' : ''}>→</button>
            <button type="button" data-act="remove" data-i="${i}" aria-label="Remove photo">✕</button>
          </div>
        </div>`).join('') + (photos.length < 12 ? `<div class="drop" id="drop" tabindex="0" role="button"><svg viewBox="0 0 24 24"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>Add photos<br><small>Click or drag in</small></div>` : '');
      const drop = $('#drop');
      if (drop) wireDrop(drop, $('#photoInput'), files => { acceptFiles(files, photos, 12, dropPhoto); drawPhotos(); markDirty(); });
    };
    $('#photos').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.act === 'remove') photos.splice(i, 1);
      if (b.dataset.act === 'main') photos.unshift(...photos.splice(i, 1));
      if (b.dataset.act === 'left' && i > 0) [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
      if (b.dataset.act === 'right' && i < photos.length - 1) [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
      drawPhotos(); markDirty();
    });
    drawPhotos();

    // sizes
    const drawSizes = () => {
      const all = [...new Set([...SIZES, ...p.sizes])];
      $('#sizes').innerHTML = all.map(s => `<button type="button" class="${p.sizes.includes(s) ? 'on' : ''}" data-s="${esc(s)}">${esc(s)}</button>`).join('') +
        `<span class="add"><input id="newSize" maxlength="12" placeholder="Custom" aria-label="Custom size"><button type="button" id="addSize">+</button></span>`;
    };
    $('#sizes').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'addSize') {
        const v = $('#newSize').value.trim();
        if (!/^[A-Za-z0-9 ./-]{1,12}$/.test(v)) { toast('Sizes: up to 12 letters/numbers', true); return; }
        if (!p.sizes.includes(v)) p.sizes.push(v);
      } else {
        const s = b.dataset.s;
        p.sizes = p.sizes.includes(s) ? p.sizes.filter(x => x !== s) : [...SIZES, ...p.sizes, s].filter((x, i, a) => a.indexOf(x) === i && (p.sizes.includes(x) || x === s));
      }
      drawSizes(); markDirty();
    });
    $('#sizes').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'newSize') { e.preventDefault(); $('#addSize').click(); } });
    drawSizes();

    // colours
    const drawColors = () => {
      $('#colors').innerHTML = p.colors.map((c, i) => `<span class="sw" style="background:${/^#[0-9a-f]{6}$/i.test(c) ? c : '#000'}" title="${esc(c)}"><button type="button" data-i="${i}" aria-label="Remove colour">×</button></span>`).join('') +
        `<input type="color" id="addColor" value="#D4FF1F" title="Add a colour" aria-label="Add a colour"><span class="hint">Click the dashed box to add a colour</span>`;
    };
    $('#colors').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (!b) return; p.colors.splice(+b.dataset.i, 1); drawColors(); markDirty(); });
    $('#colors').addEventListener('change', e => {
      if (e.target.id !== 'addColor') return;
      const c = e.target.value.toUpperCase();
      if (!p.colors.includes(c) && p.colors.length < 8) p.colors.push(c);
      drawColors(); markDirty();
    });
    drawColors();
    read();

    // save
    form.addEventListener('submit', async e => {
      e.preventDefault();
      read();
      const problem = validateProduct(p, photos);
      if (problem) { toast(problem, true); return; }
      let savedId, savedImages;
      const ok = await withWrite(`Enter your admin password to save "${p.name}".`, async () => {
        const images = savedImages = await uploadAll(photos, 'products');
        progress('Saving…');
        savedId = await CMS.saveProduct({
          ...p, images, price: Number(p.price), compare_at: p.compare_at ? Number(p.compare_at) : null,
          stock: Number(p.stock), badge: p.badge || null,
        });
        const removed = (original?.images || []).filter(u => !images.includes(u));
        if (removed.length) await CMS.removeImages(removed);
      });
      if (!ok) return;
      dirty = false;
      toast(p.status === 'published' ? 'Saved. It\'s live on the site' : 'Saved as a draft');
      const saved = { ...p, id: savedId, images: savedImages, price: Number(p.price), compare_at: p.compare_at ? Number(p.compare_at) : null, stock: Number(p.stock), badge: p.badge || null, updated_at: new Date().toISOString() };
      DATA.products = existing ? DATA.products.map(x => (x.id === savedId ? saved : x)) : [...DATA.products, saved];
      if (!existing) { ignoreHash = true; location.hash = '#product/' + savedId; lastHash = location.hash; }
      productEditor(savedId);
      refreshLater();
    });

    $('#del')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${existing.name}"? This removes it from the site and can't be undone.`)) return;
      const ok = await withWrite(`Enter your admin password to delete "${existing.name}".`, () => CMS.deleteProduct(existing));
      if (!ok) return;
      toast('Product deleted');
      DATA.products = DATA.products.filter(x => x.id !== existing.id);
      go('#products');
      refreshLater();
    });
  }

  function validateProduct(p, photos) {
    if (!p.name) return 'Give the product a title';
    if (!SLUG_RE.test(p.slug)) return 'Web address can only use lowercase letters, numbers and dashes';
    if (DATA.products.some(x => x.slug === p.slug && x.id !== p.id)) return 'Another product already uses that web address';
    const price = Number(p.price);
    if (p.price === '' || !(price >= 0) || price >= 100000) return 'Enter a valid price';
    if (p.compare_at && !(Number(p.compare_at) > price)) return 'The "was" price must be higher than the price';
    if (!p.sizes.length) return 'Pick at least one size';
    if (p.status === 'published' && !photos.length) return 'Add at least one photo before putting it live';
    return null;
  }

  /* =====================================================================
     PAGES
     ===================================================================== */
  function pages() {
    setTitle('Pages');
    let order = DATA.collections.map(c => c.id);
    const draw = () => {
      const byId = Object.fromEntries(DATA.collections.map(c => [c.id, c]));
      const changed = order.join() !== DATA.collections.map(c => c.id).join();
      view.innerHTML = `
        <div class="panel" style="margin-bottom:16px"><div class="panel__head">
          <div><h2>Your pages</h2><span class="hint">Each page gets its own menu link, homepage tile and product listing. The first six show on the homepage.</span></div>
          <div style="display:flex;gap:8px">${changed ? '<button class="btn btn--ghost" id="saveOrder">Save new order</button>' : ''}<a class="btn" href="#page/new">+ Add page</a></div>
        </div></div>
        <div class="pages">${order.map((id, i) => {
          const c = byId[id];
          const n = DATA.products.filter(p => p.collections.includes(c.id)).length;
          return `<div class="page-row" data-id="${esc(c.id)}">
            <div class="order-btns"><button data-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button><button data-move="1" data-i="${i}" ${i === order.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button></div>
            <img src="${esc(asset(c.hero_image))}" alt="">
            <div><b>${esc(c.name)}</b><small>/shop/?page=${esc(c.slug)} // ${n} product${n === 1 ? '' : 's'}</small></div>
            <div>${c.visible ? '<span class="pill pill--live">Visible</span>' : '<span class="pill pill--off">Hidden</span>'}</div>
            <div>${c.show_in_nav ? '<span class="pill pill--live">In menu</span>' : '<span class="pill pill--off">Not in menu</span>'}</div>
          </div>`;
        }).join('') || '<div class="empty">No pages yet. Add your first one.</div>'}</div>`;
      $('#saveOrder')?.addEventListener('click', async () => {
        const ok = await withWrite('Enter your admin password to save the page order.', () => CMS.reorderCollections(order));
        if (ok) { toast('Page order saved'); await reload(); order = DATA.collections.map(c => c.id); dirty = false; draw(); }
      });
    };
    view.onclick = e => {
      const mv = e.target.closest('[data-move]');
      if (mv) {
        const i = +mv.dataset.i, j = i + +mv.dataset.move;
        [order[i], order[j]] = [order[j], order[i]];
        dirty = true; draw(); return;
      }
      const row = e.target.closest('.page-row');
      if (row) go('#page/' + row.dataset.id);
    };
    draw();
  }

  function pageEditor(id) {
    const existing = id !== 'new' && DATA.collections.find(c => c.id === id);
    if (id !== 'new' && !existing) { toast('That page no longer exists', true); go('#pages'); return; }
    const c = existing ? clone(existing) : { id: null, slug: '', name: '', tagline: '', description: '', hero_image: null, visible: true, show_in_nav: true, sort_order: DATA.collections.length + 1 };
    const hero = c.hero_image ? [{ url: c.hero_image }] : [];
    let slugTouched = !!existing;
    const inPage = DATA.products.filter(p => existing && p.collections.includes(existing.id));
    setTitle(existing ? `Edit page: ${existing.name}` : 'New page');

    view.innerHTML = `
      <div class="editor">
        <form class="editor__form" id="cform" novalidate>
          <div class="section">
            <h3>Page</h3>
            <label>Page name<input name="name" maxlength="60" required value="${esc(c.name)}" placeholder="e.g. Rock Climbing"></label>
            <label>Web address<div class="prefix"><span>/shop/?page=</span><input name="slug" maxlength="60" value="${esc(c.slug)}" placeholder="rock-climbing"></div></label>
            <label>Tagline <span class="hint">shown under the page title</span><input name="tagline" maxlength="160" value="${esc(c.tagline)}"></label>
            <label>Description <span class="hint">optional</span><textarea name="description" maxlength="2000" rows="4">${esc(c.description)}</textarea></label>
            <label class="toggle"><input type="checkbox" name="visible" ${c.visible ? 'checked' : ''}>Visible on the site</label>
            <label class="toggle"><input type="checkbox" name="show_in_nav" ${c.show_in_nav ? 'checked' : ''}>Show in the top menu</label>
          </div>
          <div class="section">
            <h3>Header photo <small>Used for the homepage tile and page header</small></h3>
            <div class="hero-pick" id="hero"></div>
            <input type="file" id="heroInput" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" hidden>
          </div>
          <div class="section">
            <h3>Products on this page <small>${inPage.length}</small></h3>
            <div>${inPage.map(p => `<a class="tag" href="#product/${esc(p.id)}">${esc(p.name)}</a>`).join('') || '<span class="muted">None yet.</span>'}</div>
            <span class="hint">Add products to this page by ticking it in each product's "Pages" box.</span>
          </div>
          <div class="savebar">
            ${existing ? '<button type="button" class="btn btn--danger btn--sm" id="del">Delete page</button>' : ''}
            <span class="dirty" id="dirtyFlag" hidden>Unsaved changes</span>
            <span class="spacer"></span>
            <a class="btn btn--ghost btn--sm" href="#pages">Back</a>
            <button type="submit" class="btn">Save page</button>
          </div>
        </form>
        ${previewPanel(ROOT + 'shop/?preview=1', 'spxtr.com/shop/?page=' + (c.slug || 'new-page'))}
      </div>`;

    const form = $('#cform');
    const send = wirePreview(() => ({ collection: { ...c, id: c.id || 'draft', hero_image: hero[0] ? photoDraft(hero[0]) : null } }));
    const markDirty = () => { dirty = true; $('#dirtyFlag').hidden = false; send(); };
    const read = () => {
      c.name = form.name.value.trim();
      if (!slugTouched) { c.slug = CMS.slugify(c.name).slice(0, 60); form.slug.value = c.slug; }
      c.slug = form.slug.value.trim();
      c.tagline = form.tagline.value.trim();
      c.description = form.description.value;
      c.visible = form.visible.checked;
      c.show_in_nav = form.show_in_nav.checked;
      $('#previewUrl').textContent = 'spxtr.com/shop/?page=' + (c.slug || 'new-page');
    };
    form.slug.addEventListener('input', () => { slugTouched = true; });
    form.addEventListener('input', () => { read(); markDirty(); });
    form.addEventListener('change', () => { read(); markDirty(); });

    const drawHero = () => {
      $('#hero').innerHTML = hero.length
        ? `<div class="photo"><img src="${esc(photoSrc(hero[0]))}" alt="">${hero[0].file ? '<span class="photo__new">New</span>' : ''}</div>
           <div style="display:grid;gap:8px;justify-items:start"><button type="button" class="btn btn--ghost btn--sm" id="heroChange">Change photo</button><button type="button" class="link" id="heroRemove">Remove</button></div>`
        : `<div class="drop" id="heroDrop" tabindex="0" role="button" style="aspect-ratio:16/10"><svg viewBox="0 0 24 24"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>Add photo</div><span class="hint">Landscape action shots work best.</span>`;
      if ($('#heroDrop')) wireDrop($('#heroDrop'), $('#heroInput'), onHeroFiles);
      $('#heroChange')?.addEventListener('click', () => $('#heroInput').click());
      $('#heroRemove')?.addEventListener('click', () => { hero.length = 0; drawHero(); markDirty(); });
    };
    function onHeroFiles(files) {
      const list = [];
      acceptFiles(files.slice(0, 1), list, 1, ph => { if (hero[0] === ph) { hero.length = 0; drawHero(); } });
      if (list.length) { hero.splice(0, 1, list[0]); drawHero(); markDirty(); }
    }
    $('#heroInput').onchange = e => { onHeroFiles([...e.target.files]); e.target.value = ''; };
    drawHero();
    read();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      read();
      if (!c.name) { toast('Give the page a name', true); return; }
      if (!SLUG_RE.test(c.slug)) { toast('Web address can only use lowercase letters, numbers and dashes', true); return; }
      if (DATA.collections.some(x => x.slug === c.slug && x.id !== c.id)) { toast('Another page already uses that web address', true); return; }
      const ok = await withWrite(`Enter your admin password to save the "${c.name}" page.`, async () => {
        const [img] = await uploadAll(hero, 'pages');
        progress('Saving…');
        const { id: cid, ...rest } = c;
        await CMS.saveCollection({ ...(cid ? { id: cid } : {}), ...rest, hero_image: img || null });
        if (cid) DATA.collections = DATA.collections.map(x => (x.id === cid ? { ...x, ...rest, hero_image: img || null } : x));
        if (existing?.hero_image && existing.hero_image !== img) await CMS.removeImages([existing.hero_image]);
      });
      if (!ok) return;
      dirty = false;
      toast('Page saved');
      if (!c.id) await reload(); // a new page needs its id from the database
      else refreshLater();
      go('#pages');
    });

    $('#del')?.addEventListener('click', async () => {
      if (!confirm(`Delete the "${existing.name}" page? Its products stay in the store, they just won't be tagged with this page.`)) return;
      const ok = await withWrite(`Enter your admin password to delete the "${existing.name}" page.`, () => CMS.deleteCollection(existing));
      if (!ok) return;
      toast('Page deleted');
      DATA.collections = DATA.collections.filter(x => x.id !== existing.id);
      go('#pages');
      refreshLater();
    });
  }

  /* =====================================================================
     SHARED: repeating lists (riders, reviews, photos, spec rows)
     Each item keeps its photo as {url} (already uploaded) or {file, preview} (new).
     Text inputs update the model as you type without redrawing, so focus is never lost;
     the list is only redrawn when something is added, removed, moved or photographed.
     ===================================================================== */
  function listSection({ host, list, blank, max, label, onChange, row, photo = true, aspect = '' }) {
    const draw = () => {
      host.innerHTML = list.map((it, i) => `
        <div class="item ${photo ? '' : 'item--plain'}" data-i="${i}">
          ${photo ? `<div class="item__pic" data-pic tabindex="0" role="button" aria-label="Photo" ${aspect ? `style="aspect-ratio:${aspect}"` : ''}>
            ${it.ph ? `<img src="${esc(photoSrc(it.ph))}" alt="">` : '<span>+ Photo</span>'}</div>` : ''}
          <div class="item__fields">
            <div class="item__head"><b>${esc(label(it, i))}</b>
              <div class="item__tools">
                <button type="button" data-move="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" data-move="1" title="Move down" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="del" data-del title="Remove">✕</button>
              </div>
            </div>
            ${row(it, i)}
          </div>
        </div>`).join('') + (list.length < max
          ? `<button type="button" class="btn btn--ghost btn--sm" data-add style="justify-self:start">+ Add</button>`
          : `<span class="hint">Up to ${max}. Remove one to add another.</span>`);
    };
    const clearFailed = ph => { const it = list.find(x => x.ph === ph); if (it) { it.ph = null; draw(); } };
    host.addEventListener('input', e => {
      const box = e.target.closest('[data-i]'); if (!box || !e.target.name) return;
      const it = list[+box.dataset.i];
      it[e.target.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      const title = box.querySelector('.item__head b');
      if (title) title.textContent = label(it, +box.dataset.i);
      onChange();
    });
    host.addEventListener('click', e => {
      const btn = e.target.closest('[data-add],[data-del],[data-move],[data-pic]');
      if (!btn) return;
      const box = e.target.closest('[data-i]');
      const i = box ? +box.dataset.i : -1;
      if (btn.matches('[data-add]')) list.push(clone(blank));
      else if (btn.matches('[data-del]')) list.splice(i, 1);
      else if (btn.matches('[data-move]')) {
        const j = i + +btn.dataset.move;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
      } else if (btn.matches('[data-pic]')) return pickPhoto(ph => { list[i].ph = ph; draw(); onChange(); }, clearFailed);
      draw(); onChange();
    });
    // Drag a photo straight onto a tile
    host.addEventListener('dragover', e => { const t = e.target.closest('[data-pic]'); if (t) { e.preventDefault(); t.classList.add('over'); } });
    host.addEventListener('dragleave', e => e.target.closest('[data-pic]')?.classList.remove('over'));
    host.addEventListener('drop', e => {
      const t = e.target.closest('[data-pic]'); if (!t) return;
      e.preventDefault(); t.classList.remove('over');
      const box = e.target.closest('[data-i]'), picked = [];
      acceptFiles([...e.dataTransfer.files].slice(0, 1), picked, 1, clearFailed);
      if (picked.length) { list[+box.dataset.i].ph = picked[0]; draw(); onChange(); }
    });
    draw();
    return draw;
  }

  // One shared hidden file input for every photo tile on the page.
  function pickPhoto(done, onFail) {
    const input = $('#picker');
    input.onchange = () => {
      const picked = [];
      acceptFiles([...input.files].slice(0, 1), picked, 1, onFail);
      input.value = '';
      if (picked.length) done(picked[0]);
    };
    input.click();
  }

  const withPhoto = (item, key = 'image') => ({ ...item, ph: item[key] ? { url: item[key] } : null });
  // Uploads any new photos, then hands back plain rows for saving.
  async function savePhotos(list, key = 'image') {
    const urls = await uploadAll(list.map(it => it.ph), 'pages');
    return list.map(({ ph, ...rest }, i) => ({ ...rest, [key]: urls[i] || '' }));
  }
  const oldPhotos = (list, key = 'image') => list.map(x => x[key]).filter(Boolean);
  const dropped = (before, after) => before.filter(u => !after.includes(u) && u.includes('/storage/v1/'));

  /* =====================================================================
     TEAM & CREW  (riders, crew reports, photo grid)
     ===================================================================== */
  function contentEditor() {
    setTitle('Team & crew');
    const s = clone(DATA.settings);
    // Riders come in with up to three stats of their own ("Podiums 14", "Comps 21", "Best trick…").
    // They're edited as flat fields here and folded back into a list when saved.
    const teamStats = r => {
      const list = (r.stats || []).filter(x => x && (x.label || x.value));
      if (!list.length && (r.statLabel || r.statValue)) list.push({ label: r.statLabel, value: r.statValue });
      return list.slice(0, 3);
    };
    const team = s.team.map(r => {
      const st = teamStats(r);
      return withPhoto({ ...r, s1l: st[0]?.label || '', s1v: st[0]?.value || '',
                              s2l: st[1]?.label || '', s2v: st[1]?.value || '',
                              s3l: st[2]?.label || '', s3v: st[2]?.value || '' });
    });
    const foldStats = r => {
      const { s1l, s1v, s2l, s2v, s3l, s3v, statLabel, statValue, ...rest } = r;
      return { ...rest, stats: [[s1l, s1v], [s2l, s2v], [s3l, s3v]]
        .map(([label, value]) => ({ label: (label || '').trim(), value: (value || '').trim() }))
        .filter(x => x.label || x.value) };
    };
    const reports = s.reports.map(r => ({ ...r }));
    const ig = s.ig.map(x => withPhoto(x));

    view.innerHTML = `
      <div class="editor">
        <form class="editor__form" id="cform" novalidate>
          <input type="file" id="picker" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" hidden>

          <div class="section">
            <h3>Section heading <small>Above the riders on the homepage</small></h3>
            <div class="field-row">
              <label>Small text above<input name="eyebrow" maxlength="60" value="${esc(s.teamSection.eyebrow)}"></label>
              <label>Heading<input name="title" maxlength="60" value="${esc(s.teamSection.title)}"></label>
            </div>
            <label>Intro<textarea name="intro" rows="2" maxlength="300" style="min-height:70px">${esc(s.teamSection.intro)}</textarea></label>
            <div class="field-row">
              <label>Link text <span class="hint">Leave empty to hide</span><input name="ctaText" maxlength="30" value="${esc(s.teamSection.ctaText)}"></label>
              <label>Link address<input name="ctaUrl" maxlength="300" placeholder="https:// or mailto:" value="${esc(s.teamSection.ctaUrl)}"></label>
            </div>
          </div>

          <div class="section">
            <h3>The crew <small>Drag a photo onto a tile, or click it</small></h3>
            <div class="items" id="teamList"></div>
          </div>

          <div class="section">
            <h3>Crew reports <small>What customers say</small></h3>
            <div class="field-row">
              <label>Small text above<input name="rEyebrow" maxlength="60" value="${esc(s.reportsSection.eyebrow)}"></label>
              <label>Heading<input name="rTitle" maxlength="60" value="${esc(s.reportsSection.title)}"></label>
            </div>
            <div class="items" id="reportList"></div>
          </div>

          <div class="section">
            <h3>Photo strip <small>The grid under the reviews</small></h3>
            <div class="field-row">
              <label>Instagram handle<input name="instagram" maxlength="40" value="${esc(s.instagram)}"></label>
              <label>Instagram address<input name="instagramUrl" maxlength="200" placeholder="https://instagram.com/…" value="${esc(s.instagramUrl)}"></label>
            </div>
            <div class="grid-photos items" id="igList"></div>
          </div>

          <div class="savebar">
            <span class="dirty" id="dirtyFlag" hidden>Unsaved changes</span>
            <span class="spacer"></span>
            <button type="submit" class="btn">Save team &amp; crew</button>
          </div>
        </form>
        ${previewPanel(ROOT + '?preview=1', 'spxtr.com')}
      </div>`;

    const form = $('#cform');
    const draft = () => ({
      settings: {
        ...s,
        team: team.map(r => foldStats({ ...r, image: r.ph ? photoDraft(r.ph) : '' })),
        reports,
        ig: ig.map(x => ({ ...x, image: x.ph ? photoDraft(x.ph) : '' })),
      },
    });
    const send = wirePreview(draft);
    const markDirty = () => { dirty = true; $('#dirtyFlag').hidden = false; send(); };

    form.addEventListener('input', e => {
      if (e.target.closest('.items')) return; // handled by each list
      const f = form;
      Object.assign(s.teamSection, { eyebrow: f.eyebrow.value, title: f.title.value, intro: f.intro.value, ctaText: f.ctaText.value, ctaUrl: f.ctaUrl.value });
      Object.assign(s.reportsSection, { eyebrow: f.rEyebrow.value, title: f.rTitle.value });
      s.instagram = f.instagram.value;
      s.instagramUrl = f.instagramUrl.value;
      markDirty();
    });

    listSection({
      host: $('#teamList'), list: team, max: 12, onChange: markDirty,
      blank: { name: '', number: '', discipline: '', home: '', s1l: '', s1v: '', s2l: '', s2v: '', s3l: '', s3v: '', product: '', instagram: '', ph: null },
      label: (r, i) => r.name || `Rider ${i + 1}`,
      row: r => `
        <div class="field-row">
          <label>Name<input name="name" maxlength="40" value="${esc(r.name)}" placeholder="e.g. Cody Walker"></label>
          <label>Number<input name="number" maxlength="6" value="${esc(r.number)}" placeholder="351"></label>
          <label>Discipline<input name="discipline" maxlength="30" value="${esc(r.discipline)}" placeholder="Motocross"></label>
        </div>
        <label>Home<input name="home" maxlength="40" value="${esc(r.home)}" placeholder="Newcastle, NSW"></label>
        <p class="hint" style="margin:0">Up to three stats, whatever suits their sport: Podiums, Comps, Best trick, Years riding, Summit… Leave a pair empty to skip it.</p>
        <div class="field-row">
          <label>Stat 1 name<input name="s1l" maxlength="20" value="${esc(r.s1l || '')}" placeholder="Podiums"></label>
          <label>Stat 1 value<input name="s1v" maxlength="14" value="${esc(r.s1v || '')}" placeholder="14"></label>
        </div>
        <div class="field-row">
          <label>Stat 2 name<input name="s2l" maxlength="20" value="${esc(r.s2l || '')}" placeholder="Comps"></label>
          <label>Stat 2 value<input name="s2v" maxlength="14" value="${esc(r.s2v || '')}" placeholder="21"></label>
        </div>
        <div class="field-row">
          <label>Stat 3 name<input name="s3l" maxlength="20" value="${esc(r.s3l || '')}" placeholder="Years riding"></label>
          <label>Stat 3 value<input name="s3v" maxlength="14" value="${esc(r.s3v || '')}" placeholder="9"></label>
        </div>
        <label>Instagram <span class="hint">Optional. Handle or link. Nothing shows if it's empty</span>
          <input name="instagram" maxlength="200" value="${esc(r.instagram || '')}" placeholder="@ridername"></label>
        <label>Rides in <span class="hint">Shows a link to that product</span>
          <select name="product"><option value="">No product</option>${DATA.products.map(p => `<option value="${esc(p.slug)}" ${p.slug === r.product ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        </label>`,
    });

    listSection({
      host: $('#reportList'), list: reports, max: 12, photo: false, onChange: markDirty,
      blank: { quote: '', name: '', meta: '', stars: 5, verified: true },
      label: (r, i) => r.name || `Review ${i + 1}`,
      row: r => `
        <label>What they said<textarea name="quote" rows="2" maxlength="400" style="min-height:70px">${esc(r.quote)}</textarea></label>
        <div class="field-row">
          <label>Name<input name="name" maxlength="40" value="${esc(r.name)}" placeholder="Cody W."></label>
          <label>Under the name<input name="meta" maxlength="60" value="${esc(r.meta)}" placeholder="Motocross // 16 orders"></label>
          <label>Stars<select name="stars">${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${+r.stars === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></label>
        </div>
        <label class="toggle"><input type="checkbox" name="verified" ${r.verified ? 'checked' : ''}>Show the "Verified buyer" tick</label>`,
    });

    listSection({
      host: $('#igList'), list: ig, max: 12, aspect: '1', onChange: markDirty,
      blank: { url: '', ph: null },
      label: (x, i) => `Photo ${i + 1}`,
      row: x => `<label>Links to <span class="hint">Optional</span><input name="url" maxlength="300" placeholder="https://" value="${esc(x.url)}"></label>`,
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const before = [...oldPhotos(DATA.settings.team), ...oldPhotos(DATA.settings.ig)];
      const ok = await withWrite('Enter your admin password to save the team and crew section.', async () => {
        const [savedTeam, savedIg] = [await savePhotos(team), await savePhotos(ig)];
        progress('Saving…');
        const next = { ...s, team: savedTeam.map(foldStats), reports, ig: savedIg };
        await CMS.saveSettings(next);
        DATA.settings = CMS.mergeSettings(next);
        const after = [...oldPhotos(savedTeam), ...oldPhotos(savedIg)];
        await CMS.removeImages(dropped(before, after));
      });
      if (!ok) return;
      dirty = false;
      toast('Team & crew saved');
      contentEditor();
      refreshLater();
    });
  }

  /* =====================================================================
     HOMEPAGE & SETTINGS
     ===================================================================== */
  function settingsEditor() {
    setTitle('Homepage & settings');
    const s = clone(DATA.settings);
    const heroImg = s.hero.image ? [{ url: s.hero.image }] : [];
    const ev = s.event;
    const evImg = [withPhoto(ev)];
    const testedImgs = (s.tested.images || []).map(u => ({ ph: u ? { url: u } : null }));
    const specs = s.tested.specs.map(r => ({ specLabel: r.label, specValue: r.value }));

    view.innerHTML = `
      <div class="editor">
        <form class="editor__form" id="sform" novalidate>
          <div class="section section--soon">
            <h3>Coming soon mode</h3>
            <p class="hint" style="margin:0 0 12px">Closes the store to the public: visitors only see the message below. You and anyone with your preview link still see the whole site. Products, prices and pages are held back by the database, not just hidden on the page.</p>
            <label class="toggle"><input type="checkbox" id="soonToggle" ${ADMIN.comingSoon ? 'checked' : ''}>Store is closed with a coming soon page</label>
            <div id="soonLive" class="notice ${ADMIN.comingSoon ? 'notice--warn' : ''}" ${ADMIN.comingSoon ? '' : 'hidden'} style="margin:10px 0">
              <b>The store is closed to the public right now.</b> Share the preview link below with anyone who needs to see it early.</div>
            <div class="field-row">
              <label>Small text above<input name="csEyebrow" maxlength="60" value="${esc(s.comingSoon.eyebrow)}"></label>
              <label>Headline<input name="csTitle" maxlength="60" value="${esc(s.comingSoon.title)}"></label>
            </div>
            <label>Message<textarea name="csText" rows="3" maxlength="400">${esc(s.comingSoon.text)}</textarea></label>
            <label class="toggle"><input type="checkbox" name="csEmail" ${s.comingSoon.showEmail !== false ? 'checked' : ''}>Show the "notify me" email box</label>
            <label>Preview link <span class="hint">Opens the real site while it's closed. Use the Copy button: selecting it by hand often misses the end.</span>
              <div class="prefix"><input id="previewLink" readonly value="${esc(previewUrl())}"><button type="button" class="btn btn--ghost btn--sm" id="copyPreview">Copy</button></div></label>
            ${ADMIN.previewKey
              ? `<p class="hint" style="margin:-4px 0 10px">Key: <code>${esc(ADMIN.previewKey)}</code></p>`
              : '<p class="hint" style="color:var(--amber);margin:0 0 10px">This admin has no preview key. Press "Make a new preview link" below.</p>'}
            <button type="button" class="btn btn--ghost btn--sm" id="testPreview">Test this link</button>
            <span id="testResult" class="hint"></span>
            <button type="button" class="btn btn--ghost btn--sm" id="newPreview">Make a new preview link</button>
            <p class="hint" style="margin:8px 0 0">A new link stops the old one working.</p>
            <div class="launch" id="launchBox">
              <h4>Launch list</h4>
              <p class="hint" id="launchCount">Loading…</p>
              <div class="launch__list" id="launchList"></div>
              <div class="launch__send">
                <button type="button" class="btn btn--sm" id="sendLaunch">Email everyone we're live</button>
                <span class="hint">Sends one email to everyone who hasn't been told yet, with an unsubscribe link.</span>
              </div>
            </div>
          </div>
          <div class="section">
            <h3>Announcement bar <small>One message per line, up to 8</small></h3>
            <textarea name="announcements" rows="5" maxlength="700">${esc(s.announcements.join('\n'))}</textarea>
          </div>
          <div class="section">
            <h3>Hero</h3>
            <div class="field-row">
              <label>Headline line 1<input name="line1" maxlength="30" value="${esc(s.hero.line1)}"></label>
              <label>Headline line 2 <span class="hint">in lime</span><input name="line2" maxlength="30" value="${esc(s.hero.line2)}"></label>
            </div>
            <label>Small text above<input name="eyebrow" maxlength="60" value="${esc(s.hero.eyebrow)}"></label>
            <label>Intro<textarea name="subtitle" rows="3" maxlength="240">${esc(s.hero.subtitle)}</textarea></label>
            <label>Button text<input name="cta" maxlength="30" value="${esc(s.hero.cta)}"></label>
            <label>Background photo</label>
            <div class="hero-pick" id="heroPick"></div>
            <input type="file" id="heroInput" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" hidden>
          </div>
          <div class="section">
            <h3>Under the hero <small>Four short promises, one per line. Use {free} for the free-shipping amount</small></h3>
            <textarea name="heroBar" rows="4" maxlength="300">${esc((s.hero.bar || []).join('\n'))}</textarea>
          </div>
          <div class="section">
            <h3>Scrolling ticker <small>The moving strip under the hero, one word or phrase per line</small></h3>
            <textarea name="marquee" rows="5" maxlength="400">${esc((s.marquee || []).join('\n'))}</textarea>
          </div>
          <div class="section">
            <h3>Section headings</h3>
            <div class="field-row">
              <label>Pages: small text<input name="pgEyebrow" maxlength="60" value="${esc(s.pagesSection.eyebrow)}"></label>
              <label>Pages: heading<input name="pgTitle" maxlength="60" value="${esc(s.pagesSection.title)}"></label>
              <label>Pages: link text<input name="pgLink" maxlength="40" value="${esc(s.pagesSection.link)}"></label>
            </div>
            <div class="field-row">
              <label>New season: heading<input name="nwTitle" maxlength="60" value="${esc(s.newSection.title)}"></label>
              <label>New season: intro<input name="nwIntro" maxlength="200" value="${esc(s.newSection.intro)}"></label>
            </div>
            <div class="field-row">
              <label>Favourites: small text<input name="bsEyebrow" maxlength="60" value="${esc(s.bestSection.eyebrow)}"></label>
              <label>Favourites: heading<input name="bsTitle" maxlength="60" value="${esc(s.bestSection.title)}"></label>
            </div>
            <span class="hint">The team and crew-report headings live in <a class="link" href="#content">Team &amp; crew</a>.</span>
          </div>
          <div class="section">
            <h3>Crash tested <small>The photos and spec table</small></h3>
            <label class="toggle"><input type="checkbox" name="tsShow" ${s.tested.show ? 'checked' : ''}>Show this section</label>
            <div class="field-row">
              <label>Small text above<input name="tsEyebrow" maxlength="60" value="${esc(s.tested.eyebrow)}"></label>
              <label>Heading<input name="tsTitle" maxlength="60" value="${esc(s.tested.title)}"></label>
              <label>Button text<input name="tsCta" maxlength="30" value="${esc(s.tested.cta)}"></label>
            </div>
            <label>Intro<textarea name="tsIntro" rows="2" maxlength="300" style="min-height:70px">${esc(s.tested.intro)}</textarea></label>
            <label>Photos <span class="hint">Three, tall ones work best</span></label>
            <div class="grid-photos items" id="testedImgs" style="grid-template-columns:repeat(3,1fr)"></div>
            <label style="margin-top:6px">Spec table</label>
            <div class="items" id="specList"></div>
          </div>
          <div class="section">
            <h3>Team orders strip</h3>
            <label class="toggle"><input type="checkbox" name="toShow" ${s.teamOrders.show ? 'checked' : ''}>Show this section</label>
            <div class="field-row">
              <label>Heading<input name="toTitle" maxlength="60" value="${esc(s.teamOrders.title)}"></label>
              <label>Button text<input name="toCta" maxlength="30" value="${esc(s.teamOrders.ctaText)}"></label>
              <label>Button address<input name="toUrl" maxlength="300" placeholder="mailto: or https://" value="${esc(s.teamOrders.ctaUrl)}"></label>
            </div>
            <label>Text<textarea name="toText" rows="2" maxlength="300" style="min-height:70px">${esc(s.teamOrders.text)}</textarea></label>
          </div>
          <div class="section">
            <h3>Newsletter block</h3>
            <label class="toggle"><input type="checkbox" name="nlShow" ${s.newsletter.show ? 'checked' : ''}>Show this section</label>
            <div class="field-row">
              <label>Small text above<input name="nlEyebrow" maxlength="60" value="${esc(s.newsletter.eyebrow)}"></label>
              <label>Heading<input name="nlTitle" maxlength="60" value="${esc(s.newsletter.title)}"></label>
            </div>
            <label>Text<input name="nlText" maxlength="200" value="${esc(s.newsletter.text)}"></label>
            <label>Small print<input name="nlFine" maxlength="120" value="${esc(s.newsletter.fine)}"></label>
          </div>
          <div class="section">
            <h3>Footer</h3>
            <div class="field-row">
              <label>Motto<input name="ftTagline" maxlength="60" value="${esc(s.footer.tagline)}"></label>
              <label>Contact email<input name="ftEmail" type="email" maxlength="120" value="${esc(s.footer.email)}"></label>
            </div>
            <label>About text<textarea name="ftBlurb" rows="2" maxlength="400" style="min-height:70px">${esc(s.footer.blurb)}</textarea></label>
          </div>
          <div class="section">
            <h3>Store details</h3>
            <div class="field-row">
              <label>Current season<input name="season" maxlength="30" value="${esc(s.season)}"></label>
              <label>Free shipping over (${STORE.currency})<input name="freeShippingOver" type="number" min="0" step="1" value="${esc(s.freeShippingOver)}"></label>
              <label>Instagram handle<input name="instagram" maxlength="40" value="${esc(s.instagram)}"></label>
            </div>
          </div>
          <div class="section">
            <h3>Next event or drop</h3>
            <label class="toggle"><input type="checkbox" name="evShow" ${ev.show ? 'checked' : ''}>Show the countdown section on the homepage</label>
            <div class="field-row">
              <label>Event name<input name="evName" maxlength="60" value="${esc(ev.name)}"></label>
              <label>Round / subtitle<input name="evRound" maxlength="40" value="${esc(ev.round)}"></label>
            </div>
            <div class="field-row">
              <label>Type<select name="evKind">
                <option value="event" ${ev.kind !== 'drop' ? 'selected' : ''}>Event (gates time + venue)</option>
                <option value="drop" ${ev.kind === 'drop' ? 'selected' : ''}>Product drop (countdown timer)</option>
              </select></label>
              <label>Venue <span class="hint">Optional. Leave blank for a drop</span><input name="evPlace" maxlength="80" value="${esc(ev.place)}"></label>
            </div>
            <div class="field-row">
              <label>Date &amp; time<input name="evDate" type="datetime-local" value="${esc(String(ev.date).slice(0, 16))}"></label>
            </div>
            <label>Blurb<textarea name="evBlurb" rows="3" maxlength="400">${esc(ev.blurb)}</textarea></label>
            <div class="field-row">
              <label>Button text<input name="evCta" maxlength="30" value="${esc(ev.ctaText)}"></label>
              <label>Button address<input name="evUrl" maxlength="300" placeholder="https://" value="${esc(ev.ctaUrl)}"></label>
            </div>
            <label>Background photo</label>
            <div class="grid-photos items" id="evImg" style="grid-template-columns:minmax(0,260px)"></div>
          </div>
          <div class="savebar">
            <span class="dirty" id="dirtyFlag" hidden>Unsaved changes</span>
            <span class="spacer"></span>
            <button type="submit" class="btn">Save homepage</button>
          </div>
          <input type="file" id="picker" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" hidden>
        </form>
        ${previewPanel(ROOT + '?preview=1', 'spxtr.com')}
      </div>`;

    const form = $('#sform');

    // Coming soon: the switch and the preview link are saved on the spot (not with the form),
    // because they change what the public can load from the database.
    $('#soonToggle').addEventListener('change', async e => {
      const on = e.target.checked;
      e.target.disabled = true;
      const ok = await withWrite(`Enter your admin password to ${on ? 'close the store with a coming soon page' : 'open the store to the public'}.`,
        async () => { await CMS.setComingSoon(on); ADMIN.comingSoon = on; });
      e.target.disabled = false;
      e.target.checked = ADMIN.comingSoon;
      $('#soonLive').hidden = !ADMIN.comingSoon;
      $('#soonLive').classList.toggle('notice--warn', ADMIN.comingSoon);
      if (ok) toast(on ? 'The store is now closed to the public' : 'The store is open to everyone');
      comingSoonBanner();
    });
    $('#copyPreview').addEventListener('click', () => {
      const el = $('#previewLink');
      if (!el.value) { toast('Make a preview link first', true); return; }
      el.select(); el.setSelectionRange(0, el.value.length);
      navigator.clipboard?.writeText(el.value).then(() => toast('Preview link copied'), () => toast('Press Cmd+C to copy', true));
    });
    // Launch list: who asked to be told when the store opens.
    let launch = [];
    const drawLaunch = () => {
      const waiting = launch.filter(x => !x.notified_at).length;
      $('#launchCount').textContent = launch.length
        ? `${launch.length} ${launch.length === 1 ? 'person has' : 'people have'} asked to be told — ${waiting} still waiting to hear from you`
        : 'Nobody has signed up yet. The box on the coming soon page adds them here.';
      $('#launchList').innerHTML = launch.slice(0, 50).map(x => `
        <div class="launch__row"><span>${esc(x.email)}</span>
          <small>${x.notified_at ? 'told ' + fmtDate(x.notified_at) : fmtDate(x.at)}</small>
          <button type="button" data-drop="${esc(x.email)}" aria-label="Remove ${esc(x.email)}">✕</button></div>`).join('')
        + (launch.length > 50 ? `<p class="hint">…and ${launch.length - 50} more</p>` : '');
      $('#sendLaunch').disabled = !waiting;
      $('#sendLaunch').textContent = waiting ? `Email ${waiting} ${waiting === 1 ? 'person' : 'people'} we're live` : 'Everyone has been told';
    };
    CMS.launchList().then(l => { launch = l; drawLaunch(); }).catch(() => { $('#launchCount').textContent = 'The launch list is unavailable. Re-run schema.sql if you haven\'t yet.'; });
    $('#launchList').addEventListener('click', async e => {
      const b = e.target.closest('[data-drop]'); if (!b) return;
      const email = b.dataset.drop;
      if (!confirm(`Take ${email} off the launch list?`)) return;
      const ok = await withWrite(`Enter your admin password to remove ${email} from the launch list.`, () => CMS.launchRemove(email));
      if (!ok) return;
      launch = launch.filter(x => x.email !== email); drawLaunch(); toast('Removed');
    });
    $('#sendLaunch').addEventListener('click', async () => {
      const waiting = launch.filter(x => !x.notified_at).length;
      if (!waiting) return;
      if (ADMIN.comingSoon && !confirm('The store is still closed to the public. Send anyway?')) return;
      if (!confirm(`Email ${waiting} ${waiting === 1 ? 'person' : 'people'} to say the store is live? This can't be taken back.`)) return;
      const btn = $('#sendLaunch');
      btn.disabled = true; btn.textContent = 'Sending…';
      const ok = await withWrite('Enter your admin password to email the launch list.', async () => {
        const r = await CMS.sendLaunchEmail();
        launch = await CMS.launchList();
        toast(r.failed ? `Sent ${r.sent}, ${r.failed} failed. Check the Resend logs.` : `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`);
      });
      drawLaunch();
      if (!ok) btn.disabled = false;
    });

    $('#testPreview').addEventListener('click', async () => {
      const out = $('#testResult');
      out.textContent = 'Checking…'; out.style.color = '';
      try {
        const r = await CMS.testPreviewKey(ADMIN.previewKey);
        if (!r.coming_soon) { out.textContent = 'The store is open to everyone right now, so no link is needed.'; return; }
        out.textContent = r.ok ? 'Works: this link opens the real site.' : 'The database doesn\'t recognise this key. Press "Make a new preview link".';
        out.style.color = r.ok ? 'var(--ok)' : 'var(--red)';
      } catch (err) { out.textContent = err.message; out.style.color = 'var(--red)'; }
    });
    $('#newPreview').addEventListener('click', async () => {
      if (!confirm('Make a new preview link? The old one stops working straight away.')) return;
      const ok = await withWrite('Enter your admin password to make a new preview link.', async () => {
        ADMIN.previewKey = await CMS.newPreviewKey();
      });
      if (ok) { $('#previewLink').value = previewUrl(); toast('New preview link ready'); }
    });

    const send = wirePreview(() => ({ settings: {
      ...s,
      hero: { ...s.hero, image: heroImg[0] ? photoDraft(heroImg[0]) : '' },
      event: { ...s.event, image: evImg[0].ph ? photoDraft(evImg[0].ph) : '' },
      tested: { ...s.tested, images: testedImgs.map(x => (x.ph ? photoDraft(x.ph) : '')), specs: specs.map(r => ({ label: r.specLabel, value: r.specValue })) },
    } }));
    const markDirty = () => { dirty = true; $('#dirtyFlag').hidden = false; send(); };
    const lines = (value, max, len) => value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, max).map(x => x.slice(0, len));
    const read = () => {
      const f = form;
      s.announcements = lines(f.announcements.value, 8, 80);
      s.hero.bar = lines(f.heroBar.value, 4, 60);
      s.marquee = lines(f.marquee.value, 8, 30);
      Object.assign(s.pagesSection, { eyebrow: f.pgEyebrow.value, title: f.pgTitle.value, link: f.pgLink.value });
      Object.assign(s.newSection, { title: f.nwTitle.value, intro: f.nwIntro.value });
      Object.assign(s.bestSection, { eyebrow: f.bsEyebrow.value, title: f.bsTitle.value });
      Object.assign(s.tested, { show: f.tsShow.checked, eyebrow: f.tsEyebrow.value, title: f.tsTitle.value, intro: f.tsIntro.value, cta: f.tsCta.value });
      Object.assign(s.teamOrders, { show: f.toShow.checked, title: f.toTitle.value, text: f.toText.value, ctaText: f.toCta.value, ctaUrl: f.toUrl.value });
      Object.assign(s.newsletter, { show: f.nlShow.checked, eyebrow: f.nlEyebrow.value, title: f.nlTitle.value, text: f.nlText.value, fine: f.nlFine.value });
      Object.assign(s.footer, { tagline: f.ftTagline.value, email: f.ftEmail.value.trim(), blurb: f.ftBlurb.value });
      Object.assign(s.event, { ctaText: f.evCta.value, ctaUrl: f.evUrl.value });
      Object.assign(s.hero, { line1: f.line1.value.trim(), line2: f.line2.value.trim(), eyebrow: f.eyebrow.value.trim(), subtitle: f.subtitle.value.trim(), cta: f.cta.value.trim() });
      s.season = f.season.value.trim();
      s.freeShippingOver = Math.max(0, Number(f.freeShippingOver.value) || 0);
      s.instagram = f.instagram.value.trim();
      Object.assign(s.comingSoon, { eyebrow: f.csEyebrow.value.trim(), title: f.csTitle.value.trim(), text: f.csText.value.trim(), showEmail: f.csEmail.checked });
      Object.assign(s.event, { show: f.evShow.checked, kind: f.evKind.value === 'drop' ? 'drop' : 'event', name: f.evName.value.trim(), round: f.evRound.value.trim(), place: f.evPlace.value.trim(), date: f.evDate.value, blurb: f.evBlurb.value.trim() });
    };
    form.addEventListener('input', e => { if (e.target.closest('.items')) return; read(); markDirty(); });
    form.addEventListener('change', e => { if (e.target.closest('.items')) return; read(); markDirty(); });

    listSection({ host: $('#testedImgs'), list: testedImgs, max: 3, aspect: '3/4', onChange: markDirty,
      blank: { ph: null }, label: (x, i) => `Photo ${i + 1}`, row: () => '' });
    listSection({ host: $('#specList'), list: specs, max: 8, photo: false, onChange: markDirty,
      blank: { specLabel: '', specValue: '' }, label: r => r.specLabel || 'Row',
      row: r => `<div class="field-row">
        <label>Name<input name="specLabel" maxlength="40" value="${esc(r.specLabel)}" placeholder="Fabric weight"></label>
        <label>Detail<input name="specValue" maxlength="80" value="${esc(r.specValue)}" placeholder="260–500 GSM heavyweight"></label></div>` });
    listSection({ host: $('#evImg'), list: evImg, max: 1, aspect: '16/10', onChange: markDirty,
      blank: { ph: null }, label: () => 'Event photo', row: () => '' });

    const drawHero = () => {
      $('#heroPick').innerHTML = `${heroImg.length ? `<div class="photo"><img src="${esc(photoSrc(heroImg[0]))}" alt="">${heroImg[0].file ? '<span class="photo__new">New</span>' : ''}</div>` : '<div class="drop" style="aspect-ratio:16/10">No photo</div>'}
        <div style="display:grid;gap:8px;justify-items:start"><button type="button" class="btn btn--ghost btn--sm" id="heroChange">Change photo</button><span class="hint">Wide action shots work best, at least 2000px across.</span></div>`;
      $('#heroChange').addEventListener('click', () => $('#heroInput').click());
    };
    $('#heroInput').onchange = e => {
      const list = [];
      acceptFiles([...e.target.files].slice(0, 1), list, 1, ph => { if (heroImg[0] === ph) { heroImg.length = 0; drawHero(); } });
      e.target.value = '';
      if (list.length) { heroImg.splice(0, 1, list[0]); drawHero(); markDirty(); }
    };
    drawHero();
    read();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      read();
      if (!s.hero.line1) { toast('The headline needs at least line 1', true); return; }
      const before = [DATA.settings.hero.image, DATA.settings.event.image, ...DATA.settings.tested.images].filter(Boolean);
      const ok = await withWrite('Enter your admin password to update the homepage.', async () => {
        const [img] = await uploadAll(heroImg, 'pages');
        const evSaved = await savePhotos(evImg);
        const testedSaved = await savePhotos(testedImgs);
        progress('Saving…');
        const next = {
          ...s,
          hero: { ...s.hero, image: img || '' },
          event: { ...s.event, image: evSaved[0].image },
          tested: { ...s.tested, images: testedSaved.map(x => x.image).filter(Boolean), specs: specs.map(r => ({ label: r.specLabel, value: r.specValue })).filter(r => r.label || r.value) },
        };
        await CMS.saveSettings(next);
        DATA.settings = CMS.mergeSettings(next);
        const after = [img, evSaved[0].image, ...testedSaved.map(x => x.image)].filter(Boolean);
        await CMS.removeImages(dropped(before, after));
      });
      if (!ok) return;
      dirty = false;
      toast('Homepage updated');
      settingsEditor();
      refreshLater();
    });
  }

  /* =====================================================================
     CUSTOMISE  (brand accent colour: every lime detail on the store follows it)
     ===================================================================== */
  function customiseEditor() {
    setTitle('Customise');
    const saved = DATA.settings.theme?.accent || DEFAULT_SETTINGS.theme.accent;
    let accent = saved;

    view.innerHTML = `
      <div class="editor">
        <form class="editor__form" id="tform" novalidate>
          <div class="section">
            <h3>Accent colour <small>The colour of the announcement bar, buttons, prices, highlights and ticker</small></h3>
            <div class="swatches" id="swatches"></div>
          </div>
          <div class="section">
            <h3>Or pick your own</h3>
            <div class="custom-colour">
              <input type="color" id="picker" aria-label="Custom colour">
              <input type="text" id="hex" maxlength="7" aria-label="Colour code" placeholder="#D4FF1F">
              <span class="hint" id="contrast"></span>
            </div>
            <div class="accent-demo" id="demo">
              <span class="demo-btn">Shop now</span>
              <span class="demo-text">Sec. 01 // Pick your page</span>
              <span class="demo-text" style="color:var(--muted)">on the site's black background</span>
            </div>
            <span class="hint">Very dark colours are blocked: text in them would be hard to read on the black site. Your logo artwork stays white.</span>
          </div>
          <div class="savebar">
            <span class="dirty" id="dirtyFlag" hidden>Unsaved changes</span>
            <span class="spacer"></span>
            <button type="button" class="btn btn--ghost btn--sm" id="resetAccent">Reset to SPXTR lime</button>
            <button type="submit" class="btn">Save colour</button>
          </div>
        </form>
        ${previewPanel(ROOT + '?preview=1', 'spxtr.com')}
      </div>`;

    const send = wirePreview(() => ({ settings: { ...DATA.settings, theme: { accent: validAccent(accent) ? accent : saved } } }));
    const draw = () => {
      const ok = validAccent(accent);
      $('#swatches').innerHTML = ACCENTS.map(([name, hex]) =>
        `<button type="button" class="swatch ${hex.toLowerCase() === accent.toLowerCase() ? 'on' : ''}" data-hex="${hex}" aria-label="${esc(name)}"><i style="background:${hex}"></i>${esc(name)}</button>`).join('');
      if (ok) $('#picker').value = accent.toLowerCase();
      if (document.activeElement !== $('#hex')) $('#hex').value = accent.toUpperCase();
      const ratio = /^#[0-9a-f]{6}$/i.test(accent) ? accentContrast(accent) : 0;
      $('#contrast').innerHTML = !ratio ? 'Enter a colour code like #D4FF1F'
        : ok ? `Readable: ${ratio.toFixed(1)}:1 contrast` : `<span style="color:var(--red)">Too dark to read on black (${ratio.toFixed(1)}:1, needs 4.5:1)</span>`;
      const shown = ok ? accent : saved;
      $('#demo').querySelector('.demo-btn').style.background = shown;
      $('#demo').querySelectorAll('.demo-text')[0].style.color = shown;
      $('#tform button[type=submit]').disabled = !ok || accent.toLowerCase() === saved.toLowerCase();
    };
    const choose = hex => {
      accent = hex;
      dirty = accent.toLowerCase() !== saved.toLowerCase();
      $('#dirtyFlag').hidden = !dirty;
      draw(); send();
    };
    $('#swatches').addEventListener('click', e => { const b = e.target.closest('[data-hex]'); if (b) choose(b.dataset.hex); });
    $('#picker').addEventListener('input', e => choose(e.target.value.toUpperCase()));
    $('#hex').addEventListener('input', e => {
      let v = e.target.value.trim(); if (v && v[0] !== '#') v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) choose(v.toUpperCase()); else { accent = v; draw(); }
    });
    $('#hex').addEventListener('blur', () => { if (!/^#[0-9a-f]{6}$/i.test(accent)) choose(saved); });
    $('#resetAccent').addEventListener('click', () => choose(DEFAULT_SETTINGS.theme.accent));
    draw();

    $('#tform').addEventListener('submit', async e => {
      e.preventDefault();
      if (!validAccent(accent)) return;
      const next = { ...DATA.settings, theme: { accent: accent.toUpperCase() } };
      const ok = await withWrite('Enter your admin password to change the site colour.', async () => {
        await CMS.saveSettings(next);
        DATA.settings = CMS.mergeSettings(next);
      });
      if (!ok) return;
      dirty = false;
      toast('Colour updated across the site');
      applyAccent();
      customiseEditor();
      refreshLater();
    });
  }

  /* =====================================================================
     SECURITY & ACTIVITY
     ===================================================================== */
  async function security() {
    setTitle('Security & activity');
    const demo = CMS.mode === 'demo';
    view.innerHTML = `
      <div class="grid-2" style="margin-bottom:18px">
        <div class="panel"><div class="panel__head"><h2>Your account</h2></div><div class="panel__body stack">
          <div><span class="hint">Signed in as</span><div style="color:var(--bone)">${esc(ADMIN.email)}</div></div>
          <div><span class="hint">Name in the activity log</span><div style="color:var(--bone)">${ADMIN.nickname ? esc(ADMIN.nickname) : '<span class="muted">Your email. Click your name at the bottom of the menu to change it.</span>'}</div></div>
          <div><span class="hint">Two-factor authentication</span><div>${demo ? '<span class="pill pill--off">Available once connected to Supabase</span>' : ADMIN.mfa ? '<span class="pill pill--live">On // authenticator app</span>' : '<span class="pill pill--red">Off</span>'}</div></div>
          <div><button class="btn btn--ghost" id="signOutAll">Sign out on every device</button><p class="hint" style="margin:8px 0 0">Use this if you logged in on a shared computer or think someone else has your password. Then change your password.</p></div>
        </div></div>
        <div class="panel"><div class="panel__head"><h2>What's protecting the store</h2></div><div class="panel__body">
          <ul class="checklist">
            <li>Every change needs your password, checked by the database, not just this screen</li>
            <li>Wrong passwords lock changes for 15 minutes after ${demo ? 5 : 'a few'} attempts</li>
            <li>Only accounts on the admin list can change anything, even if someone signs up</li>
            <li class="${demo ? 'todo' : ''}">Authenticator code required at every login</li>
            <li>Every change is written to a log that can't be edited or deleted</li>
            <li>Photos are re-processed on upload (strips hidden data), images only, 8MB max</li>
            <li>Signed out automatically after ${cfg.adminIdleMinutes} minutes of inactivity, and when the browser closes</li>
            <li>Prices and stock are looked up on the server at checkout, so they can't be tampered with in the browser</li>
            <li>Card details are entered on Stripe's own page and never touch this site</li>
            <li>Orders can only be created by Stripe's signed webhook, and their amounts can't be edited here</li>
          </ul>
        </div></div>
      </div>
      <div class="panel"><div class="panel__head"><h2>Activity log</h2><span class="hint">Last 100 changes</span></div>
        <div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th></tr></thead><tbody id="log"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody></table></div></div>
      ${demo ? `<div class="panel" style="margin-top:18px"><div class="panel__head"><h2>Demo data</h2><button class="btn btn--danger btn--sm" id="resetDemo">Reset demo data</button></div><div class="panel__body hint">Puts every product, page and setting back to the starting demo content in this browser.</div></div>` : ''}`;

    $('#signOutAll').addEventListener('click', async () => {
      if (!confirm('Sign out of the admin on every device, including this one?')) return;
      await CMS.logout(true);
      location.replace('../login/');
    });
    $('#resetDemo')?.addEventListener('click', async () => {
      if (!confirm('Reset all demo data in this browser?')) return;
      const ok = await withWrite('Enter your admin password to reset the demo data.', async () => CMS.resetDemo());
      if (ok) { await reload(); toast('Demo data reset'); security(); }
    });
    try {
      const log = await CMS.auditLog();
      $('#log').innerHTML = log.map(a => `<tr style="cursor:default"><td>${fmtDate(a.at)}</td><td>${esc(who(a))}</td><td>${ACTION[a.action] || esc(a.action)} ${ENTITY[a.entity] || esc(a.entity)}</td><td>${esc(a.summary || '')}</td></tr>`).join('')
        || '<tr><td colspan="4"><div class="empty">No changes yet.</div></td></tr>';
    } catch { $('#log').innerHTML = '<tr><td colspan="4" class="muted">Activity is unavailable.</td></tr>'; }
  }
})();
