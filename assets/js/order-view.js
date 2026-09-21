/* SPXTR — renders one order for its customer (order page + thank-you page).
   Data comes from order_status / order_by_session in schema.sql: customer-safe fields only. */
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
function orderMoney(minor, currency = 'aud') {
  const c = String(currency).toLowerCase();
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: c.toUpperCase() }).format((minor || 0) / (ZERO_DECIMAL.has(c) ? 1 : 100));
}
const orderLinkFor = o => `order.html?o=${encodeURIComponent(o.number)}&k=${encodeURIComponent(o.key || o.access_key)}`;

function orderStage(o) {
  if (o.status === 'refunded') return { step: -1, label: 'Refunded', text: 'This order was refunded. The money goes back to your card within 5–10 business days.' };
  if (o.status === 'cancelled') return { step: -1, label: 'Cancelled', text: 'This order was cancelled.' };
  if (o.status === 'shipped') return { step: 2, label: 'On its way', text: `Shipped${o.carrier ? ` with ${o.carrier}` : ''}${o.shipped_at ? ` on ${new Date(o.shipped_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}` : ''}.` };
  return { step: 1, label: 'Getting it ready', text: "We've got your order and we're packing it. You'll get an email with tracking as soon as it ships." };
}

function renderOrderView(o) {
  const st = orderStage(o);
  const steps = ['Order placed', 'Packing', 'Shipped'];
  const where = [o.city, o.state, o.country && o.country !== 'AU' ? o.country : ''].filter(Boolean).join(', ');
  const track = o.tracking_url && /^https:\/\//.test(o.tracking_url)
    ? `<a class="btn" href="${esc(o.tracking_url)}" target="_blank" rel="noopener noreferrer">Track your parcel</a>` : '';
  return `
    <div class="order-head">
      <span class="eyebrow">// Order SPX-${esc(o.number)}</span>
      <h1 class="display">${esc(st.label)}</h1>
      <p class="muted">${esc(st.text)}</p>
    </div>
    ${st.step > 0 ? `<ol class="order-steps">${steps.map((s, i) => `<li class="${i <= st.step ? 'is-done' : ''}">${esc(s)}</li>`).join('')}</ol>` : ''}
    ${o.tracking_number ? `<div class="order-track"><div><small>Tracking number${o.carrier ? ` · ${esc(o.carrier)}` : ''}</small><b>${esc(o.tracking_number)}</b></div>${track}</div>` : ''}
    <div class="order-grid">
      <div class="order-items">
        ${(o.items || []).map(i => `
          <div class="line-item">
            <img src="${imgSrc(i.image)}" alt="">
            <div><h4>${esc(i.name)}</h4><small>${i.size && i.size !== 'One size' ? `Size ${esc(i.size)} · ` : ''}Qty ${esc(i.quantity)}</small></div>
            <span class="card__price">${orderMoney(i.line_total, o.currency)}</span>
          </div>`).join('')}
      </div>
      <aside class="order-sum">
        <div class="row"><span>Subtotal</span><span>${orderMoney(o.amount_subtotal, o.currency)}</span></div>
        <div class="row"><span>Shipping${o.shipping_method ? ` · ${esc(o.shipping_method)}` : ''}</span><span>${o.amount_shipping ? orderMoney(o.amount_shipping, o.currency) : 'Free'}</span></div>
        ${o.amount_tax ? `<div class="row"><span>Tax</span><span>${orderMoney(o.amount_tax, o.currency)}</span></div>` : ''}
        <div class="row total"><span>Paid</span><span>${orderMoney(o.amount_total, o.currency)}</span></div>
        ${o.amount_refunded ? `<div class="row"><span>Refunded</span><span>−${orderMoney(o.amount_refunded, o.currency)}</span></div>` : ''}
        <div class="order-meta">
          <div><small>Placed</small>${new Date(o.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          ${where ? `<div><small>Shipping to</small>${esc(where)}</div>` : ''}
        </div>
        <p class="order-help">Questions about this order? Email <a href="mailto:${esc(SITE.footer.email || STORE.email)}?subject=${encodeURIComponent('Order SPX-' + o.number)}">${esc(SITE.footer.email || STORE.email)}</a> and quote SPX-${esc(o.number)}.</p>
      </aside>
    </div>`;
}
