// GENERATED — do not edit. Built from supabase/functions/applications/ and _shared/ by
// tools/bundle-function.py, for pasting into the Supabase dashboard function editor.
// The files in the repo are the source of truth.
import { createClient } from 'npm:@supabase/supabase-js@2';

// ---------- http.ts ----------
// Shared helpers for the SPXTR Edge Functions.

// Only the shop's own site may call these from a browser. SITE_URL is the live address;
// ALLOWED_ORIGINS can add more, comma separated (e.g. http://localhost:8080 while testing).
// Browsers send only the origin (scheme + host), never a path, so compare origins: a SITE_URL like
// https://jenko153.github.io/SPXTR.com still allows https://jenko153.github.io.
const toOrigin = (u: string) => { try { return new URL(u.trim()).origin; } catch { return ''; } };
const allowed = [Deno.env.get('SITE_URL') ?? '', ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',')]
  .map(toOrigin)
  .filter(Boolean);

// Where to send shoppers back to after Stripe: the folder the shop page was in (it may be a
// sub-folder, e.g. on GitHub Pages), but only on an allowed origin. Falls back to SITE_URL.
function returnBase(_req: Request, claimed: unknown): string {
  try {
    const u = new URL(String(claimed ?? ''));
    if (allowed.includes(u.origin) && (u.protocol === 'https:' || u.hostname === 'localhost')) {
      return (u.origin + u.pathname).replace(/\/[^/]*$/, '');
    }
  } catch { /* fall through */ }
  return siteUrl();
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

const originAllowed = (req: Request) => allowed.includes(req.headers.get('Origin') ?? '');

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}. Set it with: supabase secrets set ${name}=...`);
  return v;
}

// Service key for server-side writes. Supabase injects this into every Edge Function.
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');

const siteUrl = () => env('SITE_URL').replace(/\/$/, '');

// ---------- email-templates.js (namespaced as T) ----------
const T = (() => {
// SPXTR order email templates.
// Plain JavaScript on purpose: the Supabase email functions import this file, and so does
// tools/email-preview.html, so the preview is exactly what customers receive.
//
// Every template takes { site, accent, order, items, supportEmail, instagram } and returns
// { subject, html, text }. Built from tables with inline styles, because that's what email
// apps reliably understand. Dark by design, to match the store.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
function money(minor, currency = 'aud') {
  const c = String(currency || 'aud').toLowerCase();
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: c.toUpperCase() }).format((minor || 0) / (ZERO_DECIMAL.has(c) ? 1 : 100));
}

// ---- palette (matches the store) ----
const C = { bg: '#0A0A0A', card: '#121212', panel: '#1A1A1A', line: '#2A2A2A', bone: '#F2F2EE', text: '#CFCFC8', muted: '#8E8E88' };
const HEAD = "'Big Shoulders Stencil Display', Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

// The application emails are gold rather than the brand accent, to match the pages people
// applied through. Email clients can't be trusted with gradients or background-clip, so this is
// a solid leaf colour with a paler highlight for rules and edges - it reads the same way and
// renders everywhere.
const GOLD = '#D9AE43';
const GOLD_LIGHT = '#F2DFA4';
const GOLD_DIM = '#6B5219';

const orderNo = o => `SPX-${o.number}`;
const firstName = o => String(o.name || '').trim().split(/\s+/)[0] || '';
const orderLink = (site, o) => (o.access_key ? `${site}/order/?o=${o.number}&k=${encodeURIComponent(o.access_key)}` : '');
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

// A bordered plate, the way the reference is stamped on the page.
const plate = (label, value, sub) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td
    style="border:2px solid ${GOLD};padding:16px 24px;background:#141109">
    <div style="font:500 10px/1.4 ${MONO};letter-spacing:.2em;text-transform:uppercase;color:${C.muted};margin:0 0 6px">${esc(label)}</div>
    <div style="font:500 22px/1.2 ${MONO};letter-spacing:.1em;color:${C.bone}">${esc(value)}</div>
    ${sub ? `<div style="font:500 10px/1.4 ${MONO};letter-spacing:.18em;text-transform:uppercase;color:${GOLD};margin:6px 0 0">${esc(sub)}</div>` : ''}
  </td></tr></table>`;

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
function confirmationEmail({ site, accent, order: o, items: list, supportEmail, instagram }) {
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
function shippingEmail({ site, accent, order: o, items: list, supportEmail, instagram }) {
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
function shopNotificationEmail({ site, accent, order: o, items: list, instagram }) {
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
function reviewAlertEmail({ site, accent, review, productName, instagram }) {
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

// =====================================================================
// 5. "You're on the list" (to the customer, while the store is closed)
// =====================================================================
function launchWelcomeEmail({ site, accent, instagram, unsubUrl }) {
  accent = readable(accent);
  const body = `
    <div style="margin:0 0 16px;padding:18px 20px;background:${C.panel};border-left:4px solid ${accent};font:400 15px/1.6 ${BODY};color:${C.bone}">
      You'll get one email the moment the store opens. Nothing else, and you can leave the list any time.
    </div>`;
  return {
    subject: 'You\'re on the list',
    html: layout({
      site, accent, instagram,
      preheader: 'We\'ll email you the moment the store opens.',
      eyebrowText: 'Launch list // you\'re in',
      title: 'You\'re on<br>the list.',
      intro: 'Thanks for putting your name down. We\'re building the store right now.',
      body,
      footerNote: unsubUrl ? `Changed your mind? <a href="${unsubUrl}" style="color:${C.muted}">Take me off the list</a>.` : '',
    }),
    text: `You're on the list. We'll email you the moment the SPXTR store opens.${unsubUrl ? `\n\nTake yourself off the list: ${unsubUrl}` : ''}`,
  };
}

// =====================================================================
// 6. "We're live" (to everyone on the launch list)
// =====================================================================
function launchLiveEmail({ site, accent, instagram, unsubUrl, headline, message }) {
  accent = readable(accent);
  const body = `
    ${message ? `<div style="margin:0 0 16px;padding:18px 20px;background:${C.panel};border-left:4px solid ${accent};font:400 15px/1.6 ${BODY};color:${C.bone}">${esc(message)}</div>` : ''}
    <div style="margin:22px 0 4px">${button(`${site}/shop/`, 'Shop the drop', accent)}</div>`;
  return {
    subject: headline || 'The SPXTR store is open',
    html: layout({
      site, accent, instagram,
      preheader: 'The store is open. Everything is live now.',
      eyebrowText: 'Launch // we\'re live',
      title: 'We\'re<br>live.',
      intro: 'The store is open. You asked to be told first, so here it is.',
      body,
      footerNote: unsubUrl ? `<a href="${unsubUrl}" style="color:${C.muted}">Take me off the list</a>.` : '',
    }),
    text: `The SPXTR store is open: ${site}/shop/${message ? `\n\n${message}` : ''}${unsubUrl ? `\n\nTake yourself off the list: ${unsubUrl}` : ''}`,
  };
}

// =====================================================================
// 7. Applications: ambassadors and models
// =====================================================================
const STATUS_COPY = {
  reviewing: {
    eyebrow: 'Application // in review',
    title: 'You\'re<br>in review.',
    intro: 'Your application is in front of the crew. We read every one properly, so give us a little time.',
    line: 'Nothing is needed from you right now. We\'ll be in touch the moment there\'s news.',
  },
  shortlisted: {
    eyebrow: 'Application // shortlisted',
    title: 'You made<br>the shortlist.',
    intro: 'Out of everyone who applied, you\'re one of the few we\'re still talking about.',
    line: 'We\'ll come back to you shortly with the next step. Keep riding, keep filming.',
  },
  accepted: {
    eyebrow: 'Application // accepted',
    title: 'You\'re<br>in.',
    intro: 'Welcome to the SPXTR crew. We back the people who send it, and that\'s you.',
    line: 'Watch this inbox: your kit, your code and everything else lands here next.',
  },
  declined: {
    eyebrow: 'Application // closed',
    title: 'Not this<br>time.',
    intro: 'We can only take a handful of people each season, and this round is full.',
    line: 'This isn\'t a no forever. Keep sending it, keep building, and come back to us next season.',
  },
  new: {
    eyebrow: 'Application // received',
    title: 'Application<br>received.',
    intro: 'We\'ve got your application and it\'s in the queue.',
    line: 'We\'ll email you as it moves along.',
  },
};

// To the applicant, the moment they apply.
function applicationAppliedEmail({ site, accent, instagram, kind, ref, name }) {
  const what = kind === 'model' ? 'model' : 'ambassador';
  accent = GOLD;                                   // these are the gold ones
  const body = `
    <div style="margin:0 0 16px;padding:18px 20px;background:${C.panel};border-left:2px solid ${GOLD};font:400 15px/1.6 ${BODY};color:${C.bone}">
      Every application is read by the crew, not a robot. We'll email you at each stage, so you're
      never left wondering where it got to.
    </div>
    ${plate('Your reference', ref, 'Quote this if you get in touch')}`;
  return {
    subject: `We've got your application (${ref})`,
    html: layout({
      site, accent, instagram,
      preheader: 'Your ambassador application is in. Here\'s your reference.',
      eyebrowText: `${what === 'model' ? 'Model' : 'Ambassador'} // received`,
      title: 'Application<br>received.',
      intro: `${name ? `${esc(String(name).trim().split(/\s+/)[0])}, t` : 'T'}hanks for putting your name forward. You're in the queue.`,
      body,
    }),
    text: `Thanks for applying to the SPXTR ${what} programme.\n\nYour reference: ${ref}\n\nWe'll email you as your application moves along.`,
  };
}

// To the crew, so an application is never missed.
function applicationAlertEmail({ site, accent, app }) {
  const what = app.kind === 'model' ? 'Model' : 'Ambassador';
  accent = GOLD;
  const row = (k, v) => (v ? `<tr><td style="padding:6px 14px 6px 0;font:500 11px/1.5 ${MONO};letter-spacing:.1em;text-transform:uppercase;color:${C.muted};white-space:nowrap;vertical-align:top">${esc(k)}</td>
    <td style="padding:6px 0;font:400 14px/1.55 ${BODY};color:${C.bone}">${esc(v)}</td></tr>` : '');
  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px">
      ${row('Name', app.name)}${row('Email', app.email)}${row('Phone', app.phone)}
      ${row('Where', app.location)}${row('Age', app.age)}
      ${row('Does', [].concat(app.answers?.disciplines || []).join(', '))}
      ${row('Height', app.answers?.height)}${row('Sizes', app.answers?.sizes)}${row('Shoe', app.answers?.shoe)}
      ${row('Hair / eyes', [app.answers?.hair, app.answers?.eyes].filter(Boolean).join(' / '))}
      ${row('Agency', app.answers?.agency)}${row('Can travel', app.answers?.travel)}
      ${row('Instagram', app.instagram)}${row('TikTok', app.tiktok)}${row('YouTube', app.youtube)}
      ${row('Reach', app.reach ? Number(app.reach).toLocaleString('en-US') : '')}
      ${row('Kit size', app.answers?.kit_size)}${row('Heard via', app.heard)}${row('Links', app.links)}
    </table>
    ${app.answers?.experience ? `${label('Experience')}<div style="margin:0 0 16px;font:400 15px/1.6 ${BODY};color:${C.text};white-space:pre-wrap">${esc(app.answers.experience)}</div>` : ''}
    ${app.answers?.highlights ? `${label('Highlights')}<div style="margin:0 0 16px;font:400 15px/1.6 ${BODY};color:${C.text};white-space:pre-wrap">${esc(app.answers.highlights)}</div>` : ''}
    ${app.why ? `${label('Why SPXTR')}<div style="margin:0 0 18px;padding:18px 20px;background:${C.panel};border-left:4px solid ${accent};font:400 15px/1.6 ${BODY};color:${C.bone};white-space:pre-wrap">${esc(app.why)}</div>` : ''}
    <div style="margin:22px 0 4px">${button(`${site}/admin/dashboard/#applications`, 'Open in the admin', accent)}</div>`;
  return {
    subject: `${what} application — ${app.name} (${app.ref})`,
    html: layout({
      site, accent,
      preheader: `${app.name} wants to ${app.kind === 'model' ? 'model' : 'represent'} SPXTR.`,
      eyebrowText: `${what} // ${app.ref}`,
      title: 'New<br>application.',
      intro: `${app.name} has applied to the ${what.toLowerCase()} programme.`,
      body,
    }),
    text: `New ${what.toLowerCase()} application\n\n${app.name} (${app.ref})\n${app.email}\n${app.location || ''}\n\n${app.why || ''}\n\nOpen the admin: ${site}/admin/dashboard/#applications`,
  };
}

// To the applicant whenever the crew moves their application along.
function applicationStatusEmail({ site, accent, instagram, kind, ref, name, status, message }) {
  accent = GOLD;
  const copy = STATUS_COPY[status] || STATUS_COPY.new;
  const body = `
    ${message ? `<div style="margin:0 0 16px;padding:18px 20px;background:${C.panel};border-left:2px solid ${GOLD};font:400 15px/1.6 ${BODY};color:${C.bone};white-space:pre-wrap">${esc(message)}</div>` : ''}
    <div style="margin:0 0 18px;font:400 15px/1.6 ${BODY};color:${C.text}">${copy.line}</div>
    ${plate('Your reference', ref)}
    ${status === 'accepted' ? `<div style="margin:22px 0 4px">${button(`${site}/`, 'See what you\'re repping', accent)}</div>` : ''}`;
  return {
    subject: status === 'accepted' ? `You're in — welcome to the SPXTR crew (${ref})`
      : status === 'declined' ? `Your SPXTR application (${ref})`
      : `Your SPXTR application is ${status} (${ref})`,
    html: layout({
      site, accent, instagram,
      preheader: copy.intro,
      eyebrowText: copy.eyebrow,
      title: copy.title,
      intro: `${name ? `${esc(String(name).trim().split(/\s+/)[0])}, ` : ''}${copy.intro}`,
      body,
    }),
    text: `${copy.intro}\n\n${message ? message + '\n\n' : ''}${copy.line}\n\nReference: ${ref}`,
  };
}

// =====================================================================
// 8. The welcome, once someone is accepted and set up
// =====================================================================
function crewWelcomeEmail({ site, instagram, name, role, code, percent, message }) {
  const accent = GOLD;
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const asWhat = role === 'model' ? 'a model' : role === 'both' ? 'an ambassador and a model' : 'an ambassador';
  const body = `
    ${message ? `<div style="margin:0 0 18px;padding:18px 20px;background:${C.panel};border-left:2px solid ${GOLD};font:400 15px/1.6 ${BODY};color:${C.bone};white-space:pre-wrap">${esc(message)}</div>` : ''}
    ${code ? plate('Your code', code, percent ? `${percent}% off, yours to share` : 'Yours to share') : ''}
    ${code ? `<div style="margin:14px 0 0;font:400 14px/1.6 ${BODY};color:${C.muted}">
      Anyone can use it at checkout. It is tied to your name, so what it sells is counted as yours.</div>` : ''}
    <div style="margin:26px 0 10px;height:1px;background:${GOLD_DIM}"></div>
    ${label('What happens now')}
    <ul style="margin:8px 0 0;padding:0 0 0 18px;font:400 15px/1.75 ${BODY};color:${C.text}">
      <li>We'll be in touch about kit and sizing.</li>
      <li>Tag us in what you post and we'll share it.</li>
      <li>Say so plainly when something is gifted or paid. It's the law, and we'd rather be straight about it anyway.</li>
    </ul>
    <div style="margin:24px 0 4px">${button(`${site}/`, 'See what you\'re repping', accent)}</div>`;
  return {
    subject: code ? `You're in — your SPXTR code is ${code}` : "You're in — welcome to SPXTR",
    html: layout({
      site, accent, instagram,
      preheader: `Welcome to the crew${code ? `. Your code is ${code}.` : '.'}`,
      eyebrowText: 'Crew // welcome',
      title: 'Welcome to<br>the crew.',
      intro: `${first ? `${esc(first)}, you` : 'You'}'re in as ${asWhat}. Here's everything you need to get going.`,
      body,
    }),
    text: `Welcome to the SPXTR crew. You're in as ${asWhat}.${code ? `\n\nYour code: ${code}${percent ? ` (${percent}% off)` : ''}` : ''}${message ? `\n\n${message}` : ''}`,
  };
}
  return { applicationAlertEmail, applicationAppliedEmail, applicationStatusEmail, confirmationEmail, crewWelcomeEmail, esc, launchLiveEmail, launchWelcomeEmail, money, orderLink, reviewAlertEmail, shippingEmail, shopNotificationEmail };
})();

// ---------- email.ts ----------
// Order emails, sent through Resend (resend.com). Optional: with no RESEND_API_KEY set,
// nothing is sent and Stripe's own receipt emails can be switched on instead.
// The designs live in email-templates.js (shared with tools/email-preview.html).


const money = T.money;
const emailConfigured = () => !!Deno.env.get('RESEND_API_KEY') && !!Deno.env.get('EMAIL_FROM');

// Brand details from the admin (Customise colour, Instagram handle, contact email), so emails
// always match the site. Falls back to SPXTR lime.
const brand = { accent: '#D4FF1F', instagram: '', supportEmail: '' };
async function loadAccent(db: { from: (t: string) => any }) {
  try {
    const { data } = await db.from('site_settings').select('data').eq('id', 1).maybeSingle();
    const s = data?.data ?? {};
    if (/^#[0-9a-fA-F]{6}$/.test(s.theme?.accent ?? '')) brand.accent = s.theme.accent;
    if (typeof s.instagram === 'string') brand.instagram = s.instagram;
    if (typeof s.footer?.email === 'string' && s.footer.email.includes('@')) brand.supportEmail = s.footer.email;
  } catch { /* keep the defaults */ }
}

// Which address an email comes from. Orders use EMAIL_FROM. The launch list can use its own
// address (LAUNCH_EMAIL_FROM) so shop mail and announcements can sit on different domains.
const senderFor = (kind: 'order' | 'launch' | 'application' = 'order') =>
  (kind === 'launch' ? Deno.env.get('LAUNCH_EMAIL_FROM')
    : kind === 'application' ? (Deno.env.get('APPLICATIONS_EMAIL_FROM') || Deno.env.get('LAUNCH_EMAIL_FROM'))
    : '') || Deno.env.get('EMAIL_FROM');

// kind 'order' = one-to-one mail about something the customer did (confirmation, shipping). It
// carries no bulk headers, which is what keeps it out of Gmail's Promotions tab.
// kind 'bulk' = the launch announcement: it must carry a one-click unsubscribe, both because Gmail
// expects it from bulk senders and because the law does.
async function sendEmail(
  to: string, subject: string, html: string, text?: string, from?: string,
  opts: { kind?: 'order' | 'bulk'; unsubUrl?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.kind === 'bulk' && opts.unsubUrl) {
    headers['List-Unsubscribe'] = `<${opts.unsubUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  } else {
    // Marks each one as its own conversation rather than part of a campaign.
    headers['X-Entity-Ref-ID'] = crypto.randomUUID();
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: from || Deno.env.get('EMAIL_FROM'),
      to: [to],
      subject,
      html,
      text,
      headers,
      reply_to: Deno.env.get('SHOP_EMAIL') || undefined,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

interface Order {
  number: number; email: string; name: string; phone?: string; currency: string;
  amount_subtotal: number; amount_shipping: number; amount_tax: number; amount_total: number;
  amount_total_aud?: number | null; shipping_method?: string;
  shipping_address: Record<string, string | null | undefined>;
  carrier?: string; tracking_number?: string; tracking_url?: string | null;
  access_key?: string;
}
interface Item { name: string; size: string; quantity: number; line_total: number; sku?: string; image?: string }

const ctx = (site: string, order: Order, items: Item[]) => ({
  site, order, items, accent: brand.accent, instagram: brand.instagram,
  // The shop inbox (SHOP_EMAIL) comes first: it's the one that's actually watched.
  supportEmail: Deno.env.get('SHOP_EMAIL') || brand.supportEmail || '',
});
const orderLink = (site: string, o: Order) => T.orderLink(site, o);
const confirmationEmail = (site: string, o: Order, items: Item[]) => T.confirmationEmail(ctx(site, o, items));
const shippingEmail = (site: string, o: Order, items: Item[]) => T.shippingEmail(ctx(site, o, items));
const shopNotificationEmail = (site: string, o: Order, items: Item[]) => T.shopNotificationEmail(ctx(site, o, items));
const reviewAlertEmail = (site: string, review: Record<string, unknown>, productName: string) =>
  T.reviewAlertEmail({ site, review, productName, accent: brand.accent, instagram: brand.instagram });

const applicationAppliedEmail = (site: string, kind: string, ref: string, name: string) =>
  T.applicationAppliedEmail({ site, accent: brand.accent, instagram: brand.instagram, kind, ref, name });
const applicationAlertEmail = (site: string, app: Record<string, unknown>) =>
  T.applicationAlertEmail({ site, accent: brand.accent, app });
const applicationStatusEmail = (site: string, o: { kind: string; ref: string; name: string; status: string; message?: string }) =>
  T.applicationStatusEmail({ site, accent: brand.accent, instagram: brand.instagram, ...o });

const crewWelcomeEmail = (site: string, o: { name: string; role: string; code?: string; percent?: number; message?: string }) =>
  T.crewWelcomeEmail({ site, instagram: brand.instagram, ...o });

const launchWelcomeEmail = (site: string, unsubUrl: string) =>
  T.launchWelcomeEmail({ site, unsubUrl, accent: brand.accent, instagram: brand.instagram });
const launchLiveEmail = (site: string, unsubUrl: string, headline?: string, message?: string) =>
  T.launchLiveEmail({ site, unsubUrl, headline, message, accent: brand.accent, instagram: brand.instagram });

// ---------- the function ----------
// SPXTR — applications to ride (ambassadors) and to model.
//
// POST {kind, name, email, ...}  — someone applies. Saved, the crew is emailed, and the
//                                  applicant gets their reference back.
// POST {setStatus: {...}}        — admins only (password-confirmed): moves an application along
//                                  and writes to the applicant with the news.
//
// The browser never touches the table: it has no rights to it at all (see schema.sql). This
// function holds the service key and is the only way in.
//
// Spam protection: hidden honeypot field, 5 applications an hour per address, strict validation.
//
// Deploy: supabase functions deploy applications --no-verify-jwt --use-api


const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PER_HOUR = 5;
const STATUSES = ['new', 'reviewing', 'shortlisted', 'accepted', 'declined'];
const KINDS = ['ambassador', 'model', 'both'];
// Every answer the form may send, with how much of it we keep. Anything not named here is
// dropped, so a doctored form can never write fields nobody asked for. Lists stay lists.
const ANSWERS: Record<string, number> = {
  legal_name: 80, preferred_name: 60, dob: 20, pronouns: 40, email: 200, phone: 40, location: 120,
  work_rights: 20, legal_matters: 10, transport: 20,
  role: 60, interest: 1200, fearless: 1200, fit: 1200, bring: 1200,
  interests: 40, background: 1500, competing: 900, groups: 900,
  instagram: 60, tiktok: 60, facebook: 120, youtube: 120, other_link: 200,
  content_types: 60, post_often: 40, audience: 1200, disclosure: 60,
  amb_why: 1200, amb_authentic: 1200, amb_opportunities: 60, amb_previous: 900, amb_current: 900, amb_conflicts: 900,
  mod_experience_level: 60, mod_experience: 1200, mod_comfortable: 60, mod_limits: 1200,
  mod_direction: 40, mod_others: 40, mod_size: 40, mod_height: 20, mod_shoe: 12, mod_fit: 600,
  days: 20, evenings: 20, travel: 40, availability_notes: 900,
  licences: 60, licence_notes: 900, safety_ok: 10, conduct_ok: 10, access_needs: 900,
  photo_face: 300, photo_full: 300, portfolio: 200,
  heard: 40, anything_else: 1200, consent: 160, signature: 80,
};
// Answers that must be there, and the ones that must be a straight yes.
const REQUIRED = ['legal_name', 'dob', 'email', 'phone', 'location', 'work_rights', 'transport',
  'role', 'interest', 'fearless', 'fit', 'bring', 'background', 'disclosure', 'signature'];
const MUST_AGREE = ['safety_ok', 'conduct_ok'];
const CONSENT_COUNT = 8;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO = 5 * 1024 * 1024;
const MIN_AGE = 18;

class Bad extends Error {}

const clean = (v: unknown, max: number) =>
  String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
// Social handles are stored bare: no @, no address, just the name.
const handle = (v: unknown, max = 60) => clean(v, max).replace(/^@+/, '').replace(/^https?:\/\/[^/]+\//i, '').replace(/\/+$/, '');
const whole = (v: unknown, max: number) => {
  const n = Math.round(Number(String(v ?? '').replace(/[,\s]/g, '')));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// A failed email is easy to miss, so it goes in the admin's activity log with the reason.
async function noteEmailProblem(what: string, err: unknown) {
  console.error(what, err);
  try {
    await db.from('audit_log').insert({
      email: 'System', action: 'update', entity: 'email',
      summary: `${what}: ${String((err as Error)?.message ?? err).slice(0, 200)}`,
    });
  } catch { /* the log is a nicety, never a reason to fail the request */ }
}

// Where the crew's copy goes. APPLICATIONS_EMAIL_TO if it is set, otherwise the shop address.
const crewAddress = () => Deno.env.get('APPLICATIONS_EMAIL_TO') || Deno.env.get('EMAIL_TO') || '';

// Admin actions are checked as that admin — not with the service key — exactly like every other
// change on this site: signed in, MFA passed, password confirmed in the last few minutes.
async function asAdmin(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const user = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false }, global: { headers: { Authorization: auth } },
  });
  const { data: canWrite, error } = await user.rpc('can_write');
  return !error && canWrite === true ? user : null;
}

Deno.serve(async req => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!originAllowed(req)) return json({ error: 'Not allowed' }, 403, headers);

  try {
    const b = await req.json().catch(() => ({}));

    // ---- an admin moving an application along ----
    if (b.setStatus) {
      const user = await asAdmin(req);
      if (!user) return json({ error: 'Not allowed. Confirm your password and try again.' }, 403, headers);
      const { id, status, message = '', notify = true, note = null } = b.setStatus;
      if (!STATUSES.includes(status)) throw new Bad('Unknown status');
      // The update runs as the admin, so the database enforces the password window and writes
      // the activity log entry under their name.
      const { data: row, error } = await user.rpc('application_set_status', {
        app_id: id, new_status: status, admin_note: note,
      });
      if (error) throw new Bad(error.message);

      let emailed = false;
      if (notify && emailConfigured() && status !== 'new') {
        try {
          await loadAccent(db);
          const m = applicationStatusEmail(siteUrl(), {
            kind: row.kind, ref: row.ref, name: row.name, status, message: clean(message, 1200),
          });
          await sendEmail(row.email, m.subject, m.html, m.text, senderFor('application'), { kind: 'order' });
          emailed = true;
        } catch (err) { await noteEmailProblem(`Application status email to ${row.email} failed`, err); }
      }
      return json({ ok: true, emailed, application: row }, 200, headers);
    }

    // ---- setting someone up once they are accepted ----
    // Their code is created in Stripe here rather than by hand, so it exists the moment it is
    // promised, and checkout already accepts promotion codes.
    if (b.crew) {
      const user = await asAdmin(req);
      if (!user) return json({ error: 'Not allowed. Confirm your password and try again.' }, 403, headers);
      const { id, role, code, percent, kit, create = false } = b.crew;
      const want: Record<string, unknown> = {};
      if (role && KINDS.includes(role)) want.role = role;
      if (kit !== undefined) want.kit_sent_at = kit ? new Date().toISOString() : null;

      let madeInStripe = false;
      const wanted = clean(code, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const off = Math.min(100, Math.max(1, Math.round(Number(percent) || 0)));
      if (wanted) want.code = wanted;
      if (off) want.percent = off;

      if (create && wanted && off) {
        const key = Deno.env.get('STRIPE_SECRET_KEY');
        if (!key) return json({ error: 'Stripe isn\'t connected, so a code can\'t be created here. Add it in Stripe and type it in instead.' }, 400, headers);
        const stripe = async (path: string, body: Record<string, string>) => {
          const res = await fetch(`https://api.stripe.com/v1/${path}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body),
          });
          const out = await res.json();
          if (!res.ok) throw new Bad(out?.error?.message || 'Stripe refused that code.');
          return out;
        };
        // A coupon holds the discount; the promotion code is the word people type.
        const coupon = await stripe('coupons', { percent_off: String(off), duration: 'forever', name: `SPXTR crew — ${wanted}` });
        await stripe('promotion_codes', { coupon: coupon.id, code: wanted });
        want.code_created_at = new Date().toISOString();
        madeInStripe = true;
      }

      const { data: row, error } = await user.rpc('application_set_crew', { app_id: id, data: want });
      if (error) throw new Bad(error.message);
      return json({ ok: true, madeInStripe, application: row }, 200, headers);
    }

    // ---- the welcome, once they are set up ----
    if (b.welcome) {
      const user = await asAdmin(req);
      if (!user) return json({ error: 'Not allowed. Confirm your password and try again.' }, 403, headers);
      const { data: rows, error } = await user.rpc('application_list');
      if (error) throw new Bad(error.message);
      const row = (rows || []).find((x: Record<string, unknown>) => x.id === b.welcome.id);
      if (!row) throw new Bad('That application no longer exists');
      if (!emailConfigured()) return json({ error: 'Email isn\'t set up yet (RESEND_API_KEY / EMAIL_FROM).' }, 400, headers);

      const crew = row.crew || {};
      await loadAccent(db);
      const m = crewWelcomeEmail(siteUrl(), {
        name: row.name, role: crew.role || row.kind,
        code: crew.code, percent: crew.percent, message: clean(b.welcome.message, 1200),
      });
      try {
        await sendEmail(row.email, m.subject, m.html, m.text, senderFor('application'), { kind: 'order' });
      } catch (err) {
        await noteEmailProblem(`Welcome email to ${row.email} failed`, err);
        throw new Bad('That email could not be sent. The reason is in the activity log.');
      }
      await user.rpc('application_set_crew', { app_id: row.id, data: { welcomed_at: new Date().toISOString() } });
      return json({ ok: true, emailed: true }, 200, headers);
    }

    // ---- someone applying ----
    if (b.website) return json({ ok: true }, 200, headers);        // honeypot: bots fill hidden fields

    const kind = KINDS.includes(b.kind) ? b.kind : 'ambassador';
    const given = (b.answers && typeof b.answers === 'object') ? b.answers : {};

    // Keep only the answers we asked for.
    const answers: Record<string, unknown> = {};
    for (const [key, max] of Object.entries(ANSWERS)) {
      const raw = given[key];
      if (Array.isArray(raw)) {
        const list = [...new Set(raw.map((d: unknown) => clean(d, max)).filter(Boolean))].slice(0, 30);
        if (list.length) answers[key] = list;
      } else {
        const v = clean(raw, max);
        if (v) answers[key] = v;
      }
    }

    const name = clean(answers.legal_name ?? b.name, 80);
    const email = clean(answers.email ?? b.email, 200).toLowerCase();
    if (name.length < 2) throw new Bad('Please tell us your name.');
    if (!EMAIL.test(email)) throw new Bad('That email address doesn\'t look right.');
    for (const key of REQUIRED) {
      if (!answers[key] || !String(answers[key]).trim()) throw new Bad('Some required answers are missing. Go back and check the form.');
    }
    for (const key of MUST_AGREE) {
      if (String(answers[key]).toLowerCase() !== 'yes') {
        throw new Bad('We can only take applications from people who agree to the safety and conduct terms.');
      }
    }
    // Consent is a legal record, so it is counted here and not taken on the browser's word.
    if (([] as unknown[]).concat(answers.consent ?? []).length < CONSENT_COUNT) {
      throw new Bad('Please tick every confirmation box.');
    }
    // 18+, worked out from the date of birth rather than a self-reported age.
    const born = new Date(String(answers.dob));
    if (isNaN(born.getTime())) throw new Bad('Please give your date of birth.');
    const today = new Date();
    let age = today.getFullYear() - born.getFullYear();
    const months = today.getMonth() - born.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < born.getDate())) age--;
    if (age < MIN_AGE) throw new Bad(`You need to be ${MIN_AGE} or older to apply.`);
    if (age > 100) throw new Bad('Please check your date of birth.');

    const app = {
      kind,
      name,
      email,
      phone: clean(answers.phone, 40) || null,
      location: clean(answers.location, 120) || null,
      age,
      instagram: handle(answers.instagram) || null,
      tiktok: handle(answers.tiktok) || null,
      youtube: handle(answers.youtube, 120) || null,
      reach: whole(b.reach, 100_000_000),
      why: clean(answers.interest, 1500) || null,
      links: clean([answers.other_link, answers.portfolio].filter(Boolean).join('\n'), 600) || null,
      heard: clean(answers.heard, 120) || null,
      answers,
    };

    const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const ipHash = await sha256(ip + '|' + env('SUPABASE_URL'));
    const { count } = await db.from('applications').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('at', new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= PER_HOUR) {
      return json({ error: 'Too many applications from here in the last hour. Try again later.' }, 429, headers);
    }

    // The reference carries the kind: SPX-A-… to ride, SPX-M-… to model.
    const ref = `SPX-${kind === 'model' ? 'M' : kind === 'both' ? 'B' : 'A'}-` +
      [...crypto.getRandomValues(new Uint8Array(4))].map(n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('');
    const { data: row, error } = await db.from('applications')
      .insert({ ...app, ref, ip_hash: ipHash }).select('id, kind, ref, name, email').single();
    if (error) {
      // One application per person. Say so plainly rather than quietly taking a second one.
      if (error.code === '23505') {
        return json({ error: 'You\'ve already applied with that email. We\'ll be in touch — check your inbox for your reference.' }, 409, headers);
      }
      throw error;
    }

    // Photos, if any were attached rather than linked. They go into a private bucket under the
    // application's own reference, with the service key -- there is no upload address a browser
    // could reach. Type and size are checked here, not trusted from the file name.
    const sent = (b.photos && typeof b.photos === 'object') ? b.photos : {};
    const stored: Record<string, string> = {};
    for (const slot of ['photo_face', 'photo_full']) {
      const f = sent[slot];
      if (!f?.data || !PHOTO_TYPES.includes(String(f.type))) continue;
      try {
        const bytes = Uint8Array.from(atob(String(f.data)), c => c.charCodeAt(0));
        if (bytes.length > MAX_PHOTO) continue;
        const ext = String(f.type).split('/')[1].replace('jpeg', 'jpg');
        const path = `${row.ref}/${slot}.${ext}`;
        const { error: upErr } = await db.storage.from('applications')
          .upload(path, bytes, { contentType: String(f.type), upsert: true });
        if (!upErr) stored[slot] = path;
      } catch (err) { await noteEmailProblem(`Application photo ${slot} could not be stored`, err); }
    }
    if (Object.keys(stored).length) {
      await db.from('applications').update({ answers: { ...answers, ...stored } }).eq('id', row.id);
    }

    // Tell the applicant, then tell the crew. Neither failing loses the application.
    let emailed = false;
    if (emailConfigured()) {
      await loadAccent(db);
      try {
        const m = applicationAppliedEmail(siteUrl(), row.kind, row.ref, row.name);
        await sendEmail(row.email, m.subject, m.html, m.text, senderFor('application'), { kind: 'order' });
        emailed = true;
      } catch (err) { await noteEmailProblem('Application confirmation email failed', err); }

      const crew = crewAddress();
      if (crew) {
        try {
          const m = applicationAlertEmail(siteUrl(), { ...app, ref: row.ref });
          await sendEmail(crew, m.subject, m.html, m.text, senderFor('application'), { kind: 'order' });
        } catch (err) { await noteEmailProblem('Application alert to the crew failed', err); }
      }
    }
    return json({ ok: true, ref: row.ref, emailed }, 200, headers);
  } catch (err) {
    if (err instanceof Bad) return json({ error: err.message }, 400, headers);
    console.error('applications failed', err);
    return json({ error: 'Couldn\'t send your application just now. Please try again in a minute.' }, 502, headers);
  }
});
