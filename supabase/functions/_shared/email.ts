// Order emails, sent through Resend (resend.com). Optional: with no RESEND_API_KEY set,
// nothing is sent and Stripe's own receipt emails can be switched on instead.
// The designs live in email-templates.js (shared with tools/email-preview.html).

import * as T from './email-templates.js';

export const money = T.money;
export const emailConfigured = () => !!Deno.env.get('RESEND_API_KEY') && !!Deno.env.get('EMAIL_FROM');

// Brand details from the admin (Customise colour, Instagram handle, contact email), so emails
// always match the site. Falls back to SPXTR lime.
const brand = { accent: '#D4FF1F', instagram: '', supportEmail: '' };
export async function loadAccent(db: { from: (t: string) => any }) {
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
export const senderFor = (kind: 'order' | 'launch' = 'order') =>
  (kind === 'launch' ? Deno.env.get('LAUNCH_EMAIL_FROM') : '') || Deno.env.get('EMAIL_FROM');

// kind 'order' = one-to-one mail about something the customer did (confirmation, shipping). It
// carries no bulk headers, which is what keeps it out of Gmail's Promotions tab.
// kind 'bulk' = the launch announcement: it must carry a one-click unsubscribe, both because Gmail
// expects it from bulk senders and because the law does.
export async function sendEmail(
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

export interface Order {
  number: number; email: string; name: string; phone?: string; currency: string;
  amount_subtotal: number; amount_shipping: number; amount_tax: number; amount_total: number;
  amount_total_aud?: number | null; shipping_method?: string;
  shipping_address: Record<string, string | null | undefined>;
  carrier?: string; tracking_number?: string; tracking_url?: string | null;
  access_key?: string;
}
export interface Item { name: string; size: string; quantity: number; line_total: number; sku?: string; image?: string }

const ctx = (site: string, order: Order, items: Item[]) => ({
  site, order, items, accent: brand.accent, instagram: brand.instagram,
  // The shop inbox (SHOP_EMAIL) comes first: it's the one that's actually watched.
  supportEmail: Deno.env.get('SHOP_EMAIL') || brand.supportEmail || '',
});
export const orderLink = (site: string, o: Order) => T.orderLink(site, o);
export const confirmationEmail = (site: string, o: Order, items: Item[]) => T.confirmationEmail(ctx(site, o, items));
export const shippingEmail = (site: string, o: Order, items: Item[]) => T.shippingEmail(ctx(site, o, items));
export const shopNotificationEmail = (site: string, o: Order, items: Item[]) => T.shopNotificationEmail(ctx(site, o, items));
export const reviewAlertEmail = (site: string, review: Record<string, unknown>, productName: string) =>
  T.reviewAlertEmail({ site, review, productName, accent: brand.accent, instagram: brand.instagram });

export const launchWelcomeEmail = (site: string, unsubUrl: string) =>
  T.launchWelcomeEmail({ site, unsubUrl, accent: brand.accent, instagram: brand.instagram });
export const launchLiveEmail = (site: string, unsubUrl: string, headline?: string, message?: string) =>
  T.launchLiveEmail({ site, unsubUrl, headline, message, accent: brand.accent, instagram: brand.instagram });
