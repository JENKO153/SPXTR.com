// SPXTR — receives events from Stripe and records paid orders.
//
// Stripe signs every event with the webhook secret; anything without a valid signature is
// rejected, so nobody can fake an order by calling this address. On a paid checkout it:
//   1. records the order and its items, and takes the quantities off stock (one transaction)
//   2. emails the customer a confirmation and the shop a new-order alert (if Resend is set up)
// Stripe retries failed deliveries, and recording the same checkout twice changes nothing.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// (Stripe doesn't send a Supabase token; the Stripe signature is what's checked.)

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { env, json, serviceKey, siteUrl } from '../_shared/http.ts';
import { confirmationEmail, emailConfigured, loadAccent, sendEmail, shopNotificationEmail } from '../_shared/email.ts';

const stripe = new Stripe(env('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      body, req.headers.get('stripe-signature') ?? '', env('STRIPE_WEBHOOK_SECRET'), undefined, cryptoProvider);
  } catch (err) {
    console.warn('Rejected webhook: bad signature', (err as Error).message);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object as Stripe.Checkout.Session;
        // Most payments are 'paid' immediately. Slower methods finish later and send
        // async_payment_succeeded, which lands back here.
        if (s.payment_status === 'paid') await recordOrder(s.id);
        break;
      }
      case 'charge.refunded': {
        const c = event.data.object as Stripe.Charge;
        const pi = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id;
        if (pi) {
          const { error } = await db.rpc('record_refund', { payment_intent: pi, refunded: c.amount_refunded, fully: c.refunded });
          if (error) throw error;
        }
        break;
      }
    }
    return json({ received: true });
  } catch (err) {
    console.error(`Failed handling ${event.type} ${event.id}`, err);
    return new Response('Webhook handler failed', { status: 500 }); // Stripe will retry
  }
});

async function recordOrder(sessionId: string) {
  const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['shipping_cost.shipping_rate'] });
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100, expand: ['data.price.product'] });

  const items = lineItems.data.map(li => {
    const product = li.price?.product as Stripe.Product;
    const m = product?.metadata ?? {};
    return {
      product_id: m.product_id ?? '',
      name: m.name || product?.name || li.description || 'Item',
      size: m.size ?? '',
      sku: m.sku ?? '',
      quantity: li.quantity ?? 1,
      unit_price_aud: m.unit_price_aud ?? ((li.price?.unit_amount ?? 0) / 100).toFixed(2),
      line_total: li.amount_total,
      image: product?.images?.[0] ?? '',
    };
  });

  // Newer Stripe API versions moved shipping details; read whichever is present.
  const ship = (s as any).collected_information?.shipping_details ?? (s as any).shipping_details ?? {};
  const rate = s.shipping_cost?.shipping_rate;
  // With Adaptive Pricing the customer may pay in their own currency; currency_conversion
  // holds the original AUD figures.
  const conv = (s as any).currency_conversion;
  const order = {
    stripe_session_id: s.id,
    stripe_payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? '',
    email: s.customer_details?.email ?? '',
    name: ship.name ?? s.customer_details?.name ?? '',
    phone: s.customer_details?.phone ?? '',
    shipping_address: ship.address ?? s.customer_details?.address ?? {},
    shipping_method: typeof rate === 'object' && rate ? rate.display_name ?? '' : '',
    currency: s.currency ?? 'aud',
    amount_subtotal: s.amount_subtotal ?? 0,
    amount_shipping: s.total_details?.amount_shipping ?? 0,
    amount_tax: s.total_details?.amount_tax ?? 0,
    amount_total: s.amount_total ?? 0,
    amount_total_aud: conv?.amount_total ?? (s.currency === 'aud' ? s.amount_total : null),
  };

  const { data, error } = await db.rpc('record_paid_order', { o: order, items });
  if (error) throw error;
  if (!data?.created) return; // already recorded on an earlier delivery

  if (!emailConfigured()) return;
  await loadAccent(db);
  const site = siteUrl();
  const full = { ...order, number: data.number, access_key: data.key };
  // An email failure must not fail the webhook: the order is already safely recorded.
  try {
    if (order.email && Deno.env.get('CUSTOMER_EMAILS') !== 'false') {
      const m = confirmationEmail(site, full, items);
      await sendEmail(order.email, m.subject, m.html, m.text);
      await db.rpc('mark_order_email', { order_id: data.id, kind: 'confirmation' });
    }
  } catch (err) { console.error('Customer confirmation email failed', err); }
  try {
    const shop = Deno.env.get('SHOP_EMAIL');
    if (shop) {
      const m = shopNotificationEmail(site, full, items);
      await sendEmail(shop, m.subject, m.html, m.text);
    }
  } catch (err) { console.error('Shop notification email failed', err); }
}
