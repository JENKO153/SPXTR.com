/* SPXTR — thank-you page Stripe returns to after a successful payment.
   The order is recorded by the Stripe webhook, usually within a few seconds of payment, so
   this page shows the thank-you straight away and swaps in the full order once it lands. */
(async function () {
  const sessionId = new URLSearchParams(location.search).get('session_id') || '';
  const paid = /^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId);
  // Stripe only sends shoppers here after paying, so the cart can be emptied.
  if (paid) cartStore.set([]);
  await loadStore();
  renderChrome();
  if (!paid || !CMS.orderBySession) return;

  // Check for the recorded order for up to ~30 seconds.
  for (let i = 0; i < 20; i++) {
    let order = null;
    try { order = await CMS.orderBySession(sessionId); } catch { /* try again */ }
    if (order) {
      $('#done').hidden = true;
      const box = $('#order');
      box.hidden = false;
      box.innerHTML = `
        <div class="order-thanks"><span class="done__mark"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="m5 12 5 5 9-10"/></svg></span>
          <div><b>Locked in${order.first_name ? `, ${esc(order.first_name)}` : ''}.</b> Your payment went through and a confirmation is on its way to your inbox.
          <a href="${orderLinkFor(order)}">Save this link</a> to check on your order any time.</div></div>
        ${renderOrderView(order)}`;
      document.title = `Order SPX-${order.number} confirmed — SPXTR`;
      return;
    }
    await new Promise(r => setTimeout(r, i < 5 ? 1000 : 2000));
  }
})();
