// SPXTR order email templates.
// Plain JavaScript on purpose: the Supabase email functions import this file, and so does
// tools/email-preview.html, so the preview is exactly what customers receive.
//
// Every template takes { site, accent, order, items, supportEmail, instagram } and returns
// { subject, html, text }. Built from tables with inline styles, because that's what email
// apps reliably understand. Dark by design, to match the store.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
export function money(minor, currency = 'aud') {
  const c = String(currency || 'aud').toLowerCase();
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: c.toUpperCase() }).format((minor || 0) / (ZERO_DECIMAL.has(c) ? 1 : 100));
}

// ---- palette (matches the store) ----
const C = { bg: '#0A0A0A', card: '#121212', panel: '#1A1A1A', line: '#2A2A2A', bone: '#F2F2EE', text: '#CFCFC8', muted: '#8E8E88' };
const HEAD = "'Big Shoulders Stencil Display', Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

const orderNo = o => `SPX-${o.number}`;
const firstName = o => String(o.name || '').trim().split(/\s+/)[0] || '';
export const orderLink = (site, o) => (o.access_key ? `${site}/order/?o=${o.number}&k=${encodeURIComponent(o.access_key)}` : '');
const abs = (site, u) => (!u ? '' : /^https:\/\//.test(u) ? u : `${site}/${String(u).replace(/^\//, '')}`);
let regionName = c => c;
try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); regionName = c => { try { return dn.of(c) || c; } catch { return c; } }; } catch { /* older runtime */ }
const addressLines = a => [a?.line1, a?.line2, [a?.city, a?.state, a?.postal_code].filter(Boolean).join(' '), a?.country ? regionName(a.country) : ''].filter(Boolean);
const readable = hex => (/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#D4FF1F');

// ---- building blocks ----
function button(href, label, accent, solid = true) {
  const bg = solid ? accent : C.card, fg = solid ? '#0A0A0A' : accent, border = solid ? accent : accent;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 8px 10px 0"><tr>
    <td style="background:${bg};border:2px solid ${border}">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 22px;font:700 13px/1 ${BODY};letter-spacing:.14em;text-transform:uppercase;color:${fg};text-decoration:none">${esc(label)}</a>
    </td></tr></table>`;
}

const eyebrow = (text, accent) => `<div style="font:500 12px/1.4 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:${accent};margin:0 0 10px">${esc(text)}</div>`;
const label = text => `<div style="font:500 11px/1.4 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:${C.muted};margin:0 0 6px">${esc(text)}</div>`;

function items(site, o, list, { prices = true, skus = false } = {}) {
  const rows = list.map(i => {
    const img = abs(site, i.image);
    const meta = [i.size && i.size !== 'One size' ? `Size ${i.size}` : '', `Qty ${i.quantity}`, skus && i.sku ? i.sku : ''].filter(Boolean).join(' · ');
    return `<tr>
      <td width="76" style="padding:14px 14px 14px 0;border-bottom:1px solid ${C.line};vertical-align:top">
        ${img ? `<img src="${esc(img)}" width="64" height="80" alt="" style="display:block;width:64px;height:80px;object-fit:cover;background:${C.panel};border:0">`
              : `<div style="width:64px;height:80px;background:${C.panel}"></div>`}
      </td>
      <td style="padding:14px 0;border-bottom:1px solid ${C.line};vertical-align:top">
        <div style="font:700 16px/1.3 ${BODY};color:${C.bone};text-transform:uppercase;letter-spacing:.04em">${esc(i.name)}</div>
        <div style="font:500 12px/1.6 ${MONO};color:${C.muted};margin-top:4px">${esc(meta)}</div>
      </td>
      <td align="right" style="padding:14px 0 14px 12px;border-bottom:1px solid ${C.line};vertical-align:top;white-space:nowrap;font:700 15px/1.3 ${BODY};color:${C.bone}">
        ${prices ? money(i.line_total, o.currency) : ''}
      </td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function totals(o, accent) {
  const row = (k, v, strong = false) => `<tr>
    <td style="padding:${strong ? '14px' : '5px'} 0 ${strong ? '0' : '5px'};font:${strong ? `800 20px/1 ${HEAD}` : `500 12px/1.4 ${MONO}`};letter-spacing:${strong ? '.04em' : '.1em'};text-transform:uppercase;color:${strong ? C.bone : C.muted}">${k}</td>
    <td align="right" style="padding:${strong ? '14px' : '5px'} 0 ${strong ? '0' : '5px'};font:${strong ? `800 22px/1 ${HEAD}` : `500 13px/1.4 ${BODY}`};color:${strong ? accent : C.text};white-space:nowrap">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">
    ${row('Subtotal', money(o.amount_subtotal, o.currency))}
    ${row(`Shipping${o.shipping_method ? ` · ${esc(o.shipping_method)}` : ''}`, o.amount_shipping ? money(o.amount_shipping, o.currency) : 'Free')}
    ${o.amount_tax ? row('Tax', money(o.amount_tax, o.currency)) : ''}
    <tr><td colspan="2" style="border-bottom:1px solid ${C.line};padding-top:8px"></td></tr>
    ${row('Total', money(o.amount_total, o.currency), true)}
  </table>`;
}

function twoCol(left, right) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr>
    <td class="col" width="50%" style="vertical-align:top;padding:18px;background:${C.panel}">${left}</td>
    <td class="gap" width="12" style="font-size:0">&nbsp;</td>
    <td class="col" width="50%" style="vertical-align:top;padding:18px;background:${C.panel}">${right}</td>
  </tr></table>`;
}

function tracker(step, accent) {
  const steps = ['Order placed', 'Packed', 'Shipped'];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 4px"><tr>
    ${steps.map((s, i) => `<td width="33%" style="padding-right:${i < 2 ? '6px' : '0'};vertical-align:top">
      <div style="height:4px;background:${i <= step ? accent : C.line};font-size:0">&nbsp;</div>
      <div style="font:500 11px/1.4 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:${i <= step ? C.bone : C.muted};padding-top:8px">0${i + 1} // ${s}</div>
    </td>`).join('')}
  </tr></table>`;
}

function layout({ site, accent, preheader, eyebrowText, title, intro, body, supportEmail, instagram, footerNote }) {
  const logo = `${site}/assets/brand/spxtr-wordmark.jpg`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${title.replace(/<br\s*\/?>/gi, ' ')}</title>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${C.bg}; }
  a { color:${accent}; }
  @media (max-width: 620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .title { font-size:44px !important; }
    .col { display:block !important; width:auto !important; }
    .gap { display:block !important; height:12px !important; width:auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px 40px">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${C.card}">
    <tr><td align="center" style="background:#000;padding:30px 20px 26px">
      <a href="${esc(site)}" style="text-decoration:none"><img src="${esc(logo)}" width="170" alt="SPXTR" style="display:block;width:170px;max-width:170px;border:0;color:${C.bone};font:900 34px ${HEAD};letter-spacing:.06em"></a>
    </td></tr>
    <tr><td style="height:5px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td class="pad" style="padding:40px 40px 8px">
      ${eyebrow(eyebrowText, accent)}
      <h1 class="title" style="margin:0 0 16px;font:800 54px/.92 ${HEAD};letter-spacing:.01em;text-transform:uppercase;color:${C.bone}">${title}</h1>
      <div style="font:400 16px/1.6 ${BODY};color:${C.text}">${intro}</div>
      ${body}
    </td></tr>
    <tr><td class="pad" style="padding:34px 40px 36px">
      <div style="border-top:1px solid ${C.line};padding-top:22px;font:400 13px/1.7 ${BODY};color:${C.muted}">
        ${footerNote || `Questions? Just reply to this email${supportEmail ? ` or write to <a href="mailto:${esc(supportEmail)}" style="color:${accent}">${esc(supportEmail)}</a>` : ''}.`}
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>
        <td style="font:500 11px/1.6 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.muted}">SPXTR // Built for the send.</td>
        <td align="right" style="font:500 11px/1.6 ${MONO};letter-spacing:.12em;text-transform:uppercase">
          <a href="${esc(site)}" style="color:${C.muted};text-decoration:none">spxtr.com</a>${instagram ? ` &nbsp;·&nbsp; <a href="https://instagram.com/${esc(String(instagram).replace(/^@/, ''))}" style="color:${C.muted};text-decoration:none">${esc(instagram)}</a>` : ''}
        </td>
      </tr></table>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// ---- plain-text versions (help deliverability; shown by text-only email apps) ----
function textItems(o, list, prices = true) {
  return list.map(i => `- ${i.name}${i.size && i.size !== 'One size' ? ` (${i.size})` : ''} x${i.quantity}${prices ? `  ${money(i.line_total, o.currency)}` : ''}`).join('\n');
}

// =====================================================================
// 1. Order confirmation (to the customer)
// =====================================================================
export function confirmationEmail({ site, accent, order: o, items: list, supportEmail, instagram }) {
  accent = readable(accent);
  const link = orderLink(site, o);
  const name = firstName(o);
  const addr = addressLines(o.shipping_address);
  const body = `
    ${link ? `<div style="margin:24px 0 4px">${button(link, 'View your order', accent)}</div>` : ''}
    ${tracker(0, accent)}
    <div style="margin-top:26px">${label(`Your order · ${list.reduce((a, i) => a + i.quantity, 0)} item${list.reduce((a, i) => a + i.quantity, 0) === 1 ? '' : 's'}`)}</div>
    ${items(site, o, list)}
    ${totals(o, accent)}
    ${twoCol(
      `${label('Shipping to')}<div style="font:400 14px/1.6 ${BODY};color:${C.bone}">${[o.name, ...addr].map(esc).join('<br>')}</div>`,
      `${label('What happens next')}<div style="font:400 14px/1.6 ${BODY};color:${C.text}">We pack every order by hand. As soon as it ships, you'll get an email with the tracking number.</div>`)}`;
  return {
    subject: `Locked in: order ${orderNo(o)} confirmed`,
    html: layout({
      site, accent, supportEmail, instagram,
      preheader: `Thanks${name ? ` ${name}` : ''}! We've got your order and we're getting it ready.`,
      eyebrowText: `Order ${orderNo(o)}`,
      title: `Locked<br>in${name ? `, ${esc(name)}` : ''}.`,
      intro: `Your payment went through and your gear is in the queue. We'll email you tracking the moment it ships.`,
      body,
    }),
    text: [
      `Locked in${name ? `, ${name}` : ''}. Order ${orderNo(o)} confirmed.`, '',
      textItems(o, list), '',
      `Total: ${money(o.amount_total, o.currency)}`, '',
      `Shipping to:\n${[o.name, ...addr].join('\n')}`, '',
      link ? `View your order: ${link}\n` : '',
      `We'll email you tracking as soon as it ships.`,
      `Questions? Reply to this email.`, '', 'SPXTR // Built for the send.',
    ].join('\n'),
  };
}

// =====================================================================
// 2. Shipped (to the customer)
// =====================================================================
export function shippingEmail({ site, accent, order: o, items: list, supportEmail, instagram }) {
  accent = readable(accent);
  const link = orderLink(site, o);
  const name = firstName(o);
  const addr = addressLines(o.shipping_address);
  const buttons = [
    o.tracking_url ? button(o.tracking_url, 'Track your parcel', accent) : '',
    link ? button(link, 'View your order', accent, !o.tracking_url) : '',
  ].join('');
  const body = `
    ${buttons ? `<div style="margin:24px 0 4px">${buttons}</div>` : ''}
    ${tracker(2, accent)}
    ${o.tracking_number ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr>
      <td style="padding:18px 20px;background:${C.panel};border-left:4px solid ${accent}">
        ${label(`Tracking number${o.carrier ? ` · ${o.carrier}` : ''}`)}
        <div style="font:800 26px/1.1 ${HEAD};letter-spacing:.06em;color:${C.bone}">${esc(o.tracking_number)}</div>
      </td></tr></table>` : ''}
    <div style="margin-top:26px">${label("What's in the box")}</div>
    ${items(site, o, list, { prices: false })}
    ${twoCol(
      `${label('Shipping to')}<div style="font:400 14px/1.6 ${BODY};color:${C.bone}">${[o.name, ...addr].map(esc).join('<br>')}</div>`,
      `${label('Delivery')}<div style="font:400 14px/1.6 ${BODY};color:${C.text}">${o.carrier ? `${esc(o.carrier)}` : 'Tracked post'}${o.shipping_method ? `<br>${esc(o.shipping_method)}` : ''}<br>Tracking can take up to 24 hours to show movement.</div>`)}`;
  return {
    subject: `It's on its way: order ${orderNo(o)} has shipped`,
    html: layout({
      site, accent, supportEmail, instagram,
      preheader: `Your SPXTR order has shipped${o.carrier ? ` with ${o.carrier}` : ''}${o.tracking_number ? `. Tracking: ${o.tracking_number}` : ''}.`,
      eyebrowText: `Order ${orderNo(o)} // Shipped`,
      title: `It's on<br>its way.`,
      intro: `${name ? `${esc(name)}, your` : 'Your'} order has left the building${o.carrier ? ` with ${esc(o.carrier)}` : ''}. Keep an eye on the tracking below.`,
      body,
    }),
    text: [
      `It's on its way. Order ${orderNo(o)} has shipped${o.carrier ? ` with ${o.carrier}` : ''}.`, '',
      o.tracking_number ? `Tracking number: ${o.tracking_number}` : '',
      o.tracking_url ? `Track your parcel: ${o.tracking_url}` : '',
      link ? `View your order: ${link}` : '', '',
      textItems(o, list, false), '',
      `Shipping to:\n${[o.name, ...addr].join('\n')}`, '',
      `Questions? Reply to this email.`, '', 'SPXTR // Built for the send.',
    ].filter(l => l !== undefined).join('\n'),
  };
}

// =====================================================================
// 3. New order alert (to the shop)
// =====================================================================
export function shopNotificationEmail({ site, accent, order: o, items: list, instagram }) {
  accent = readable(accent);
  const addr = addressLines(o.shipping_address);
  const overseas = String(o.currency).toLowerCase() !== 'aud';
  const audAmount = o.amount_total_aud ? `A${money(o.amount_total_aud, 'aud')}` : '';
  const aud = overseas && audAmount ? ` (≈ ${audAmount})` : '';
  const count = list.reduce((a, i) => a + i.quantity, 0);
  const body = `
    <div style="margin:24px 0 4px">${button(`${site}/admin/dashboard/#orders`, 'Open in admin', accent)}</div>
    <div style="margin-top:22px">${label(`Pack list · ${count} item${count === 1 ? '' : 's'}`)}</div>
    ${items(site, o, list, { skus: true })}
    ${totals(o, accent)}
    ${overseas && audAmount ? `<div style="font:500 12px/1.6 ${MONO};color:${C.muted};text-align:right;margin-top:6px">≈ ${audAmount} in Australian dollars</div>` : ''}
    ${twoCol(
      `${label('Ship to')}<div style="font:400 14px/1.6 ${BODY};color:${C.bone}">${[o.name, ...addr].map(esc).join('<br>')}</div>`,
      `${label('Customer')}<div style="font:400 14px/1.6 ${BODY};color:${C.text}">${esc(o.email)}${o.phone ? `<br>${esc(o.phone)}` : ''}${o.shipping_method ? `<br><br>${esc(o.shipping_method)}` : ''}</div>`)}`;
  return {
    subject: `New order ${orderNo(o)}: ${money(o.amount_total, o.currency)}${aud}`,
    html: layout({
      site, accent, instagram,
      preheader: `${o.name || 'A customer'} ordered ${count} item${count === 1 ? '' : 's'} for ${money(o.amount_total, o.currency)}${aud}.`,
      eyebrowText: `New order // ${orderNo(o)}`,
      title: `Cha-<br>ching.`,
      intro: `<b style="color:${C.bone}">${esc(o.name || 'A customer')}</b> just ordered ${count} item${count === 1 ? '' : 's'}${overseas && o.shipping_address?.country ? ` from ${esc(regionName(o.shipping_address.country))}` : ''}. Pack it, then add the tracking in the admin to email them.`,
      body,
      footerNote: 'This alert goes to the shop only. Customers never see it.',
    }),
    text: [
      `New order ${orderNo(o)}: ${money(o.amount_total, o.currency)}${aud}`, '',
      textItems(o, list), '',
      `Ship to:\n${[o.name, ...addr].join('\n')}`, '',
      `Customer: ${o.email}${o.phone ? ` / ${o.phone}` : ''}`, '',
      `Open in admin: ${site}/admin/dashboard/#orders`,
    ].join('\n'),
  };
}

// =====================================================================
// 4. New review waiting for approval (to the shop)
// =====================================================================
export function reviewAlertEmail({ site, accent, review, productName, instagram }) {
  accent = readable(accent);
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  const body = `
    <div style="margin:22px 0 6px;font:400 22px/1 ${BODY};color:${accent};letter-spacing:.1em">${stars}</div>
    <div style="margin:0 0 16px;padding:18px 20px;background:${C.panel};border-left:4px solid ${accent};font:400 15px/1.6 ${BODY};color:${C.bone}">
      "${esc(review.body)}"<div style="margin-top:10px;font:500 12px/1.4 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:${C.muted}">
      ${esc(review.name)}${review.verified ? ' · Verified buyer' : ''}${review.photos?.length ? ` · ${review.photos.length} photo${review.photos.length === 1 ? '' : 's'}` : ''}</div>
    </div>
    <div style="margin:18px 0 4px">${button(`${site}/admin/dashboard/#reviews`, 'Review it in the admin', accent)}</div>`;
  return {
    subject: `New review to approve${productName ? `: ${productName}` : ''} (${review.rating}★)`,
    html: layout({
      site, accent, instagram,
      preheader: `${review.name} left a ${review.rating}-star review. It won't show on the site until you approve it.`,
      eyebrowText: 'New review // waiting for you',
      title: 'Fresh<br>review.',
      intro: `<b style="color:${C.bone}">${esc(review.name)}</b> reviewed ${productName ? `<b style="color:${C.bone}">${esc(productName)}</b>` : 'SPXTR'}. It stays hidden until you approve it.`,
      body,
      footerNote: 'This alert goes to the shop only.',
    }),
    text: `New review to approve (${review.rating}/5) from ${review.name}${productName ? ` on ${productName}` : ''}:\n\n"${review.body}"\n\nApprove it: ${site}/admin/dashboard/#reviews`,
  };
}
