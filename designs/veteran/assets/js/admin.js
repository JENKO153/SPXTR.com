/* =========================================================
   Lanny Supply Co. — store admin (mock backend)
   Reads and writes the same localStorage-backed DB as the
   storefront, so changes here show up on the site.
   ========================================================= */

const IMG = '../assets/img/';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');

const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';

const STATUS_CLASS = { Unfulfilled: 'b-amber', Shipped: 'b-blue', Delivered: 'b-green', Refunded: 'b-red', Paid: 'b-green', Pending: 'b-amber', Active: 'b-green', Draft: 'b-grey', Scheduled: 'b-blue', Expired: 'b-grey' };
const badge = s => `<span class="badge ${STATUS_CLASS[s] || 'b-grey'}">${s}</span>`;

const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtDateTime = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* ---------- helpers over the data ---------- */
const productMap = () => Object.fromEntries(DB.products().map(p => [p.id, p]));
const customerMap = () => Object.fromEntries(DB.customers().map(c => [c.id, c]));
function orderTotal(o, pm = productMap()) { return o.items.reduce((a, [id, , q]) => a + (pm[id]?.price || 0) * q, 0); }
function orderUnits(o) { return o.items.reduce((a, [, , q]) => a + q, 0); }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}
function refreshPill() {
  const n = DB.orders().filter(o => o.status === 'Unfulfilled').length;
  $('#unfulfilled-pill').textContent = n || '';
  $('#unfulfilled-pill').style.display = n ? '' : 'none';
}

/* ---------- panel ---------- */
function openPanel(html) {
  $('#panel').innerHTML = html;
  $('#panel').classList.add('open'); $('#scrim').classList.add('open');
  $('#panel').setAttribute('aria-hidden', 'false');
}
function closePanel() {
  $('#panel').classList.remove('open'); $('#scrim').classList.remove('open');
  $('#panel').setAttribute('aria-hidden', 'true');
}
$('#scrim').onclick = closePanel;
document.addEventListener('keydown', e => e.key === 'Escape' && closePanel());

/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard() {
  const orders = DB.orders(), products = DB.products(), pm = productMap(), cm = customerMap();
  const rev = DAILY_REVENUE;
  const revenue = rev.reduce((a, d) => a + d.revenue, 0);
  const orderCount = rev.reduce((a, d) => a + d.orders, 0);
  const aov = revenue / orderCount;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // units sold per product from orders (weighted up so the demo looks busy)
  const units = {};
  orders.forEach(o => o.items.forEach(([id, , q]) => units[id] = (units[id] || 0) + q));
  const top = products.map(p => ({ p, sold: (units[p.id] || 0) * 9 + Math.round(p.reviews / 6) })).sort((a, b) => b.sold - a.sold).slice(0, 5);
  const maxSold = top[0]?.sold || 1;
  const lowStock = products.filter(p => p.stock < 20).sort((a, b) => a.stock - b.stock).slice(0, 5);

  const spark = (vals, color = '#4A5238') => {
    const max = Math.max(...vals), min = Math.min(...vals);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${34 - ((v - min) / (max - min || 1)) * 30}`).join(' ');
    return `<svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  };

  view.innerHTML = `
    <div class="page-title">
      <div><h1>${greet}, ${STORE.founder}</h1><p>Sitrep: the last 30 days. ${money(Math.round(DAILY_REVENUE.reduce((a, d) => a + d.revenue, 0) * STORE.giveBackPercent / 100))} raised for veteran charities this month.</p></div>
      <div style="display:flex;gap:8px"><button class="btn btn--ghost">Last 30 days ▾</button><a class="btn" href="#products" onclick="event.preventDefault();go('products',{edit:''})">${PLUS_ICON}Add product</a></div>
    </div>

    <div class="kpis">
      <div class="card kpi"><small>Total revenue</small><b>${money(revenue)}</b><span class="delta up">↑ 18.2%</span> <small>vs prev. period</small>${spark(rev.map(d => d.revenue))}</div>
      <div class="card kpi"><small>Orders</small><b>${orderCount.toLocaleString()}</b><span class="delta up">↑ 12.5%</span> <small>vs prev. period</small>${spark(rev.map(d => d.orders))}</div>
      <div class="card kpi"><small>Average order value</small><b>${money(aov.toFixed(2))}</b><span class="delta up">↑ 4.9%</span> <small>vs prev. period</small>${spark(rev.map(d => d.revenue / d.orders))}</div>
      <div class="card kpi"><small>Conversion rate</small><b>3.24%</b><span class="delta down">↓ 0.3%</span> <small>vs prev. period</small>${spark([3.6,3.4,3.5,3.3,3.4,3.2,3.3,3.1,3.2,3.24], '#76716A')}</div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card__head"><h3>Revenue</h3><div class="legend"><span><b>${money(revenue)}</b>30 days</span></div></div>
        <div class="card__body"><div class="chart" id="chart"><div class="tip" id="tip"></div></div></div>
      </div>
      <div class="card">
        <div class="card__head"><h3>Top products</h3><a href="#products">View all</a></div>
        <div class="card__body mini-list">
          ${top.map(({ p, sold }) => `
            <div class="mini"><img src="${IMG}${p.img}" alt=""><div><b>${p.name}</b><small>${sold} sold</small><div class="meter"><i style="width:${sold / maxSold * 100}%"></i></div></div><span>${money(sold * p.price)}</span></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card__head"><h3>Recent orders</h3><a href="#orders">View all</a></div>
        <div class="card__body" style="padding:12px 0 4px">
          <div class="table-wrap"><table>
            <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Status</th><th class="num">Total</th></tr></thead>
            <tbody>${orders.slice(0, 6).map(o => `
              <tr onclick="showOrder('${o.id}')"><td><b>${o.id}</b></td><td>${cm[o.customer]?.name || 'Guest'}</td><td>${fmtDate(o.date)}</td><td>${badge(o.status)}</td><td class="num">${money(orderTotal(o, pm))}</td></tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </div>
      <div class="card">
        <div class="card__head"><h3>Low stock</h3><a href="#products">Manage inventory</a></div>
        <div class="card__body mini-list">
          ${lowStock.length ? lowStock.map(p => `
            <div class="mini" style="cursor:pointer" onclick="go('products',{edit:'${p.id}'})"><img src="${IMG}${p.img}" alt=""><div><b>${p.name}</b><small>${p.category}</small></div><span class="stock-low">${p.stock} left</span></div>`).join('')
            : '<div class="empty-state">All products are well stocked.</div>'}
        </div>
      </div>
    </div>`;

  drawChart();
}

function drawChart() {
  const el = $('#chart'); if (!el) return;
  const data = DAILY_REVENUE;
  const W = el.clientWidth, H = 260, padL = 44, padB = 24, padT = 8;
  const max = Math.ceil(Math.max(...data.map(d => d.revenue)) / 1000) * 1000;
  const bw = (W - padL) / data.length;
  const y = v => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max];

  const svg = `
    <svg viewBox="0 0 ${W} ${H}">
      <g class="grid">${ticks.map(t => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${STORE.currency}${t / 1000}k</text>`).join('')}</g>
      ${data.map((d, i) => `<rect class="bar" data-i="${i}" x="${padL + i * bw + bw * 0.18}" y="${y(d.revenue)}" width="${bw * 0.64}" height="${H - padB - y(d.revenue)}" rx="3"/>`).join('')}
      ${data.map((d, i) => i % 5 === 0 || i === data.length - 1 ? `<text class="xlab" x="${padL + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${fmtDate(d.date)}</text>` : '').join('')}
      ${data.map((d, i) => `<rect data-i="${i}" x="${padL + i * bw}" y="0" width="${bw}" height="${H - padB}" fill="transparent"/>`).join('')}
    </svg>`;
  el.insertAdjacentHTML('afterbegin', svg);

  const tip = $('#tip');
  el.onmousemove = e => {
    const i = e.target.dataset?.i; if (i == null) return;
    const d = data[i];
    $$('.bar', el).forEach(b => b.classList.toggle('hot', b.dataset.i === i));
    tip.innerHTML = `<b>${money(d.revenue)}</b>${d.orders} orders · ${fmtDate(d.date)}`;
    tip.style.left = (padL + i * bw + bw / 2) / W * 100 + '%';
    tip.style.top = y(d.revenue) + 'px';
    tip.style.opacity = 1;
  };
  el.onmouseleave = () => { tip.style.opacity = 0; $$('.bar', el).forEach(b => b.classList.remove('hot')); };
}

/* =========================================================
   ORDERS
   ========================================================= */
let orderFilter = 'All';
function renderOrders(q = '') {
  const pm = productMap(), cm = customerMap();
  const all = DB.orders();
  const statuses = ['All', 'Unfulfilled', 'Shipped', 'Delivered', 'Refunded'];
  const list = all.filter(o => (orderFilter === 'All' || o.status === orderFilter) &&
    (!q || (o.id + ' ' + (cm[o.customer]?.name || '')).toLowerCase().includes(q.toLowerCase())));

  view.innerHTML = `
    <div class="page-title"><div><h1>Orders</h1><p>${all.length} orders · ${all.filter(o => o.status === 'Unfulfilled').length} waiting to be fulfilled</p></div><button class="btn btn--ghost">Export CSV</button></div>
    <div class="card">
      <div class="toolbar">
        <div class="seg" id="seg">${statuses.map(s => `<button class="${s === orderFilter ? 'on' : ''}" data-s="${s}">${s}${s !== 'All' ? ` <span style="opacity:.6">${all.filter(o => o.status === s).length}</span>` : ''}</button>`).join('')}</div>
        <input class="field-sm" id="order-q" placeholder="Search by order or customer" value="${q}">
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Payment</th><th>Fulfilment</th><th class="num">Total</th></tr></thead>
        <tbody>${list.map(o => `
          <tr onclick="showOrder('${o.id}')">
            <td><b>${o.id}</b></td><td>${fmtDateTime(o.date)}</td><td>${cm[o.customer]?.name || 'Guest'}</td>
            <td>${orderUnits(o)} item${orderUnits(o) > 1 ? 's' : ''}</td><td>${badge(o.payment)}</td><td>${badge(o.status)}</td>
            <td class="num">${money(orderTotal(o, pm))}</td>
          </tr>`).join('') || `<tr><td colspan="7"><div class="empty-state">No orders match.</div></td></tr>`}
        </tbody>
      </table></div>
    </div>`;

  $('#seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; orderFilter = b.dataset.s; renderOrders($('#order-q').value); };
  $('#order-q').oninput = e => { renderOrders(e.target.value); const i = $('#order-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
}

function showOrder(id) {
  const o = DB.orders().find(o => o.id === id); if (!o) return;
  const pm = productMap(), c = customerMap()[o.customer];
  const sub = orderTotal(o, pm), ship = sub >= STORE.freeShippingOver ? 0 : 8;
  const next = { Unfulfilled: ['Shipped', 'Mark as shipped'], Shipped: ['Delivered', 'Mark as delivered'] }[o.status];
  const steps = [['Order placed', o.date], ['Payment captured', o.date]];
  if (['Shipped', 'Delivered'].includes(o.status)) steps.push(['Shipped with USPS Priority Mail', o.date]);
  if (o.status === 'Delivered') steps.push(['Delivered', o.date]);
  if (o.status === 'Refunded') steps.push(['Refunded to original payment method', o.date]);

  openPanel(`
    <div class="panel__head"><div><h2>Order ${o.id}</h2><div style="display:flex;gap:6px;margin-top:8px">${badge(o.payment)}${badge(o.status)}</div></div><button class="icon-btn" onclick="closePanel()" aria-label="Close">${X_ICON}</button></div>
    <div class="panel__body">
      <div class="sect"><h4>Items</h4>
        ${o.items.map(([pid, size, q]) => { const p = pm[pid] || { name: 'Deleted product', img: 'field-kit.jpg', price: 0 }; return `
          <div class="mini"><img src="${IMG}${p.img}" alt=""><div><b>${p.name}</b><small>Size ${size} · ${money(p.price)} × ${q}</small></div><span>${money(p.price * q)}</span></div>`; }).join('')}
      </div>
      <div class="sect"><h4>Summary</h4>
        <div class="kv"><span>Subtotal</span><span>${money(sub)}</span><span>Shipping</span><span>${ship ? money(ship) : 'Free'}</span><span class="total">Total</span><span class="total">${money(sub + ship)}</span></div>
      </div>
      <div class="sect"><h4>Customer</h4>
        <div style="display:flex;gap:12px;align-items:center"><div class="avatar">${(c?.name || 'G').split(' ').map(s => s[0]).join('')}</div><div><b>${c?.name || 'Guest'}</b><br><small style="color:var(--muted)">${c?.email || ''} · ${c?.city || ''}</small></div></div>
      </div>
      <div class="sect"><h4>Timeline</h4><ul class="timeline">${steps.reverse().map(([t, d]) => `<li>${t}<small>${fmtDateTime(d)}</small></li>`).join('')}</ul></div>
    </div>
    <div class="panel__foot">
      ${o.status !== 'Refunded' ? `<button class="btn btn--danger" onclick="setOrderStatus('${o.id}','Refunded')">Refund</button>` : ''}
      <button class="btn btn--ghost">Print packing slip</button>
      ${next ? `<button class="btn" onclick="setOrderStatus('${o.id}','${next[0]}')">${next[1]}</button>` : ''}
    </div>`);
}

function setOrderStatus(id, status) {
  const orders = DB.orders(), o = orders.find(o => o.id === id);
  o.status = status; if (status === 'Refunded') o.payment = 'Refunded';
  DB.saveOrders(orders);
  toast(`Order ${id} marked as ${status.toLowerCase()}`);
  refreshPill(); route(); showOrder(id);
}

/* =========================================================
   PRODUCTS
   ========================================================= */
function renderProducts(q = '') {
  const all = DB.products();
  const list = all.filter(p => !q || (p.name + ' ' + p.category).toLowerCase().includes(q.toLowerCase()));
  const value = all.reduce((a, p) => a + p.price * p.stock, 0);

  view.innerHTML = `
    <div class="page-title"><div><h1>Products</h1><p>${all.length} products · ${all.reduce((a, p) => a + p.stock, 0)} units in stock · ${money(value)} retail value</p></div>
      <button class="btn" onclick="editProduct()">${PLUS_ICON}Add product</button></div>
    <div class="note"><span>💡</span><span>Changes you make here are saved in this browser and show up on the <a href="../index.html" style="text-decoration:underline">storefront</a> straight away. Try editing a price or adding a new product.</span></div>
    <div class="card">
      <div class="toolbar"><input class="field-sm" id="prod-q" placeholder="Search products" value="${q}"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th>Category</th><th>Gender</th><th class="num">Price</th></tr></thead>
        <tbody>${list.map(p => `
          <tr onclick="editProduct('${p.id}')">
            <td><div class="t-prod"><img src="${IMG}${p.img}" alt=""><div><b>${p.name}</b><br><small style="color:var(--muted);font-family:ui-monospace,monospace">${p.sku || p.id.toUpperCase()}</small></div></div></td>
            <td>${badge(p.status || 'Active')}</td>
            <td class="${p.stock < 20 ? 'stock-low' : ''}">${p.stock} in stock</td>
            <td>${p.category}</td><td>${p.gender}</td>
            <td class="num">${p.compareAt ? `<s style="color:var(--muted)">${money(p.compareAt)}</s> ` : ''}${money(p.price)}</td>
          </tr>`).join('') || `<tr><td colspan="6"><div class="empty-state">No products match.</div></td></tr>`}
        </tbody>
      </table></div>
    </div>`;
  $('#prod-q').oninput = e => { renderProducts(e.target.value); const i = $('#prod-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
}

const IMAGE_LIBRARY = ['tee-man.jpg', 'tee-seal.jpg', 'tee-back.jpg', 'tee-olive.jpg', 'tee-ls.jpg', 'tee-folded.jpg', 'hood-night.jpg', 'hood-summit.jpg', 'hood-blackout.jpg', 'hood-desert.jpg', 'cap-washed.jpg', 'cap-black.jpg', 'cap-worn.jpg', 'jkt-m65.jpg', 'jkt-m65-b.jpg', 'jkt-overshirt.jpg', 'jkt-women.jpg', 'bomber.jpg', 'tags-hand.jpg', 'dogtag.jpg', 'pack-canvas.jpg', 'pack-ruck.jpg', 'jean-raw.jpg', 'field-kit.jpg'];
const CATEGORIES = ['Tees', 'Hoodies', 'Headwear', 'Outerwear', 'Gear'];
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '30', '32', '34', '36', '38', 'One size'];

function editProduct(id) {
  const existing = id && DB.products().find(p => p.id === id);
  const p = existing || { name: '', category: 'Tees', gender: 'Unisex', price: '', compareAt: '', stock: 0, sizes: ['S', 'M', 'L'], img: 'tee-man.jpg', desc: '', status: 'Active', isNew: true };

  openPanel(`
    <div class="panel__head"><div><h2>${existing ? 'Edit product' : 'New product'}</h2>${existing ? `<small style="color:var(--muted);font-family:ui-monospace,monospace">${p.sku || p.id.toUpperCase()}</small>` : ''}</div><button class="icon-btn" onclick="closePanel()" aria-label="Close">${X_ICON}</button></div>
    <form class="panel__body" id="pform">
      <div class="form">
        <label class="full">Title<input name="name" required value="${p.name.replace(/"/g, '&quot;')}" placeholder="e.g. Relaxed Linen Shirt"></label>
        <label class="full">Description<textarea name="desc" placeholder="Fabric, fit, details…">${p.desc}</textarea></label>
        <label>Price (${STORE.currency})<input name="price" type="number" min="0" step="1" required value="${p.price}"></label>
        <label>Compare-at price<input name="compareAt" type="number" min="0" step="1" value="${p.compareAt || ''}" placeholder="Optional, for sales"></label>
        <label>Category<select name="category">${CATEGORIES.map(c => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Gender<select name="gender">${['Women', 'Men', 'Unisex'].map(g => `<option ${g === p.gender ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label>Inventory<input name="stock" type="number" min="0" value="${p.stock}"></label>
        <label>Status<select name="status">${['Active', 'Draft'].map(s => `<option ${s === (p.status || 'Active') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <div class="full"><label>Sizes</label><div class="chips" style="margin-top:6px">${ALL_SIZES.map(s => `<label><input type="checkbox" name="sizes" value="${s}" ${p.sizes.includes(s) ? 'checked' : ''}>${s}</label>`).join('')}</div></div>
        <div class="full"><label>Image</label><div class="img-pick" id="img-pick" style="margin-top:6px">${IMAGE_LIBRARY.map(i => `<button type="button" data-img="${i}" class="${i === p.img ? 'on' : ''}"><img src="${IMG}${i}" alt="" loading="lazy"></button>`).join('')}</div></div>
        <label class="full" style="display:flex;flex-direction:row;align-items:center;gap:8px;font-weight:400"><input type="checkbox" name="isNew" ${p.isNew ? 'checked' : ''} style="height:auto">Show in “New arrivals”</label>
      </div>
    </form>
    <div class="panel__foot">
      ${existing ? `<button class="btn btn--danger" style="margin-right:auto" onclick="deleteProduct('${p.id}')">Delete</button>` : ''}
      ${existing ? `<a class="btn btn--ghost" href="../product.html?id=${p.id}" target="_blank">View on store</a>` : ''}
      <button class="btn" onclick="saveProduct('${existing ? p.id : ''}')">Save product</button>
    </div>`);

  $('#img-pick').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#img-pick button').forEach(x => x.classList.toggle('on', x === b)); };
}

function saveProduct(id) {
  const f = $('#pform');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const sizes = fd.getAll('sizes');
  if (!sizes.length) { toast('Pick at least one size'); return; }
  const products = DB.products();
  const data = {
    name: fd.get('name').trim(), desc: fd.get('desc').trim(),
    price: +fd.get('price'), compareAt: +fd.get('compareAt') || undefined,
    category: fd.get('category'), gender: fd.get('gender'),
    stock: +fd.get('stock'), status: fd.get('status'), sizes,
    img: $('#img-pick .on')?.dataset.img || 'tee-man.jpg',
    isNew: fd.get('isNew') === 'on',
  };
  data.badge = data.compareAt ? 'Sale' : data.stock > 0 && data.stock < 15 ? 'Low stock' : (data.isNew ? 'New' : null);
  if (id) {
    Object.assign(products.find(p => p.id === id), data);
  } else {
    const n = Math.max(...products.map(p => +p.id.slice(2)), 0) + 1;
    const code = { Tees: 'T', Hoodies: 'H', Headwear: 'C', Outerwear: 'O', Gear: 'G' }[data.category] || 'X';
    products.unshift({ id: 'p-' + String(n).padStart(3, '0'), sku: `LSC-${code}-${String(n).padStart(3, '0')}`, spec: '', colors: ['#16170F'], rating: 5, reviews: 0, ...data });
  }
  DB.saveProducts(products);
  closePanel(); route();
  toast(id ? 'Product updated' : 'Product created — it\'s live on the storefront');
}

function deleteProduct(id) {
  if (!confirm('Delete this product? This removes it from the storefront.')) return;
  DB.saveProducts(DB.products().filter(p => p.id !== id));
  closePanel(); route(); toast('Product deleted');
}

/* =========================================================
   CUSTOMERS
   ========================================================= */
function renderCustomers(q = '') {
  const all = DB.customers().slice().sort((a, b) => b.spent - a.spent);
  const list = all.filter(c => !q || (c.name + c.email + c.city).toLowerCase().includes(q.toLowerCase()));
  view.innerHTML = `
    <div class="page-title"><div><h1>Customers</h1><p>${all.length} customers · ${money(all.reduce((a, c) => a + c.spent, 0))} lifetime revenue</p></div><button class="btn btn--ghost">Export CSV</button></div>
    <div class="card">
      <div class="toolbar"><input class="field-sm" id="cust-q" placeholder="Search customers" value="${q}"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Customer</th><th>Location</th><th>Orders</th><th>Customer since</th><th>Service status</th><th class="num">Total spent</th></tr></thead>
        <tbody>${list.map(c => `
          <tr><td><div class="t-prod"><div class="avatar">${c.name.split(' ').map(s => s[0]).join('')}</div><div><b>${c.name}</b><br><small style="color:var(--muted)">${c.email}</small></div></div></td>
          <td>${c.city}</td><td>${c.orders}</td><td>${new Date(c.since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>
          <td>${badge(c.tag || 'Civilian').replace('b-grey', ['Veteran', 'Active duty'].includes(c.tag) ? 'b-green' : c.tag === 'Civilian' ? 'b-grey' : 'b-blue')}</td>
          <td class="num">${money(c.spent)}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  $('#cust-q').oninput = e => { renderCustomers(e.target.value); const i = $('#cust-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
}

/* =========================================================
   DISCOUNTS
   ========================================================= */
function renderDiscounts() {
  const codes = [
    ['SERVED15', '15% off everything, always', 'Verified veterans, service members & first responders', 1284, 'Active'],
    ['ENLIST10', '10% off first order', 'Newsletter sign-ups', 412, 'Active'],
    ['VETSDAY', '20% off sitewide', 'Veterans Day, 11 Nov', 0, 'Scheduled'],
    ['FREESHIP', 'Free shipping, any order', 'Weekend only', 96, 'Scheduled'],
    ['MEMORIAL25', '25% off, proceeds doubled to charity', 'Ended 26 May', 621, 'Expired'],
  ];
  view.innerHTML = `
    <div class="page-title"><div><h1>Discounts</h1><p>Codes and automatic promotions.</p></div><button class="btn">${PLUS_ICON}Create discount</button></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Offer</th><th>Conditions</th><th>Status</th><th class="num">Used</th></tr></thead>
      <tbody>${codes.map(([c, o, w, u, s]) => `<tr><td><b style="font-family:ui-monospace,monospace">${c}</b></td><td>${o}</td><td>${w}</td><td>${badge(s)}</td><td class="num">${u}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

/* =========================================================
   SETTINGS
   ========================================================= */
function renderSettings() {
  view.innerHTML = `
    <div class="page-title"><div><h1>Settings</h1><p>Store details, payments and shipping.</p></div></div>
    <div class="grid-2" style="grid-template-columns:1fr 1fr">
      <div class="card"><div class="card__head"><h3>Store details</h3></div><div class="card__body">
        <div class="form">
          <label class="full">Store name<input value="${STORE.name}" disabled></label>
          <label>Contact email<input value="${STORE.email}" disabled></label>
          <label>Currency<input value="${STORE.currency} USD" disabled></label>
          <label>Free shipping threshold<input value="${money(STORE.freeShippingOver)}" disabled></label>
          <label>Instagram<input value="${STORE.instagram}" disabled></label>
        </div></div></div>
      <div class="card"><div class="card__head"><h3>Payments &amp; shipping</h3></div><div class="card__body mini-list">
        <div class="mini" style="grid-template-columns:1fr auto"><div><b>Card payments</b><small>Visa, Mastercard, Amex</small></div>${badge('Active')}</div>
        <div class="mini" style="grid-template-columns:1fr auto"><div><b>Apple Pay &amp; Google Pay</b><small>Express checkout</small></div>${badge('Active')}</div>
        <div class="mini" style="grid-template-columns:1fr auto"><div><b>PayPal</b><small>Not connected</small></div>${badge('Draft')}</div>
        <div class="mini" style="grid-template-columns:1fr auto"><div><b>Tracked 48 shipping</b><small>Domestic · ${money(8)} or free over ${money(STORE.freeShippingOver)}</small></div>${badge('Active')}</div>
        <div class="mini" style="grid-template-columns:1fr auto"><div><b>International</b><small>EU, US, CA, AU</small></div>${badge('Active')}</div>
      </div></div>
    </div>
    <div class="card"><div class="card__head"><h3>Demo data</h3></div><div class="card__body" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <p style="margin:0;color:var(--muted)">This preview saves edits in your browser. Reset to put every product, order and the bag back to the original mock data.</p>
      <button class="btn btn--danger" onclick="if(confirm('Reset all demo data?')){DB.reset();refreshPill();toast('Demo data reset');}">Reset demo data</button>
    </div></div>`;
}

/* ---------- router ---------- */
let pending = { q: '', edit: undefined };
function go(hash, opts = {}) {
  pending = { q: opts.q || '', edit: opts.edit };
  if (location.hash.slice(1) === hash) route(); else location.hash = hash;
}
const ROUTES = { dashboard: renderDashboard, orders: renderOrders, products: renderProducts, customers: renderCustomers, discounts: renderDiscounts, settings: renderSettings };
function route() {
  const r = location.hash.slice(1) || 'dashboard';
  const { q, edit } = pending; pending = { q: '', edit: undefined };
  (ROUTES[r] || renderDashboard)(q);
  if (edit !== undefined) editProduct(edit || undefined);
  $$('#nav a[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === r));
  $('#side').classList.remove('open');
  document.title = `${r[0].toUpperCase() + r.slice(1)} — ${STORE.name} Admin`;
}
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
window.addEventListener('resize', () => { if ((location.hash.slice(1) || 'dashboard') === 'dashboard') { $('#chart svg')?.remove(); drawChart(); } });

// global search jumps to the most relevant list
$('#global-search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim(); if (!q) return;
  if (q.startsWith('#') || /^\d+$/.test(q)) go('orders', { q: q.replace('#', '') });
  else if (DB.products().some(p => p.name.toLowerCase().includes(q.toLowerCase()))) go('products', { q });
  else go('customers', { q });
});

refreshPill();
route();
