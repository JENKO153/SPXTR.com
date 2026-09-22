/* SPXTR — customer order page: /order/?o=<number>&k=<private key> (the link in the emails). */
(async function () {
  const params = new URLSearchParams(location.search);
  const number = (params.get('o') || '').replace(/^spx-?/i, '');
  const key = params.get('k') || '';
  await loadStore();
  renderChrome();
  const box = $('#order');
  const notFound = `<div class="done"><div><span class="eyebrow">// Order not found</span><h1 class="display" style="font-size:clamp(44px,7vw,84px);margin:12px 0 0">Can't find that one</h1>
    <p class="muted">The link may be incomplete. Open it straight from your order email, or email us with your order number and we'll help.</p>
    <a class="btn" href="shop/">Back to the shop</a></div></div>`;
  if (!/^\d{1,12}$/.test(number) || key.length < 32) { box.innerHTML = notFound; return; }
  box.innerHTML = '<p class="muted" style="padding:120px 0;text-align:center">Loading your order…</p>';
  try {
    const order = await CMS.orderStatus(Number(number), key);
    box.innerHTML = order ? renderOrderView(order) + reviewYourGear(order) : notFound;
    if (order) { document.title = `Order SPX-${order.number} — SPXTR`; wireGearReviews(order, key); }
  } catch (err) {
    box.innerHTML = `<p class="muted" style="padding:120px 0;text-align:center">${esc(err.message)}</p>`;
  }
})();

// "Review your gear": one review form per item bought. Sent with the order number and private key,
// so these reviews are marked "Verified buyer".
function reviewYourGear(o) {
  if (o.status === 'refunded' || o.status === 'cancelled') return '';
  const seen = new Set();
  const items = (o.items || []).filter(i => i.product_id && !seen.has(i.product_id) && seen.add(i.product_id));
  if (!items.length) return '';
  return `
    <section class="rv-gear">
      <div class="section-head"><div><span class="eyebrow">// Your verdict</span><h2 class="display">Review your gear</h2>
        <p class="muted">Tell the crew how it fits and how it's holding up. Photos welcome.</p></div></div>
      ${items.map((i, n) => `
        <div class="rv-gear__item">
          <div class="rv-gear__head"><img src="${imgSrc(i.image)}" alt=""><div><b>${esc(i.name)}</b>${i.size && i.size !== 'One size' ? `<small>Size ${esc(i.size)}</small>` : ''}</div>
            <button class="btn btn--ghost" data-review="${n}">Write a review</button></div>
          <div class="rv-gear__form" id="gear-${n}" hidden>${reviewFormHtml(`gear-form-${n}`, { title: `Review: ${i.name}` })}</div>
        </div>`).join('')}
    </section>`;
}

function wireGearReviews(o, key) {
  const seen = new Set();
  const items = (o.items || []).filter(i => i.product_id && !seen.has(i.product_id) && seen.add(i.product_id));
  items.forEach((i, n) => {
    const form = document.getElementById(`gear-form-${n}`);
    if (form) wireReviewForm(form, { productId: i.product_id, orderNumber: o.number, orderKey: key });
  });
  document.querySelector('.rv-gear')?.addEventListener('click', e => {
    const b = e.target.closest('[data-review]'); if (!b) return;
    const box = document.getElementById(`gear-${b.dataset.review}`);
    box.hidden = !box.hidden;
    b.textContent = box.hidden ? 'Write a review' : 'Close';
  });
}
