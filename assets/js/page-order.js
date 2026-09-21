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
    box.innerHTML = order ? renderOrderView(order) : notFound;
    if (order) document.title = `Order SPX-${order.number} — SPXTR`;
  } catch (err) {
    box.innerHTML = `<p class="muted" style="padding:120px 0;text-align:center">${esc(err.message)}</p>`;
  }
})();
