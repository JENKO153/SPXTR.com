// SPXTR — refunds an order through Stripe, from the admin's Orders screen.
//
// Called with the admin's own login token. Before touching any money it asks the database
// whether this session may make changes right now (admin + authenticator code + password
// confirmed in the last few minutes) — the same rule as every other change.
// Full or partial refunds; a full refund can also put the items back in stock.
// The Stripe webhook (charge.refunded) records the same refund too; recording it twice is harmless.
//
// Deploy: supabase functions deploy refund-order --no-verify-jwt --use-api

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, env, json, originAllowed, serviceKey } from '../_shared/http.ts';

const stripe = new Stripe(env('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!originAllowed(req)) return json({ error: 'Not allowed' }, 403, headers);

  try {
    const { order_id, amount, restock } = await req.json().catch(() => ({}));
    if (!UUID.test(String(order_id ?? ''))) return json({ error: 'Invalid order' }, 400, headers);

    // Act as the admin who called us, so row-level security applies to every read.
    const asAdmin = createClient(env('SUPABASE_URL'), req.headers.get('apikey') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: allowed } = await asAdmin.rpc('can_write');
    if (allowed !== true) return json({ error: 'Not allowed. Confirm your password and try again.' }, 403, headers);

    const { data: order, error } = await asAdmin.from('orders')
      .select('id, number, stripe_payment_intent, currency, amount_total, amount_refunded, restocked_at')
      .eq('id', order_id).maybeSingle();
    if (error) throw error;
    if (!order) return json({ error: 'Order not found' }, 404, headers);
    if (!order.stripe_payment_intent) return json({ error: 'This order has no Stripe payment to refund.' }, 400, headers);

    const remaining = order.amount_total - order.amount_refunded;
    if (remaining <= 0) return json({ error: 'This order has already been fully refunded.' }, 400, headers);
    const refundAmount = amount == null ? remaining : Number(amount);
    if (!Number.isInteger(refundAmount) || refundAmount < 1 || refundAmount > remaining) {
      return json({ error: 'That refund amount is more than what\'s left to refund.' }, 400, headers);
    }

    try {
      await stripe.refunds.create(
        { payment_intent: order.stripe_payment_intent, amount: refundAmount, reason: 'requested_by_customer',
          metadata: { source: 'spxtr-admin', order: `SPX-${order.number}` } },
        // Same order + same amount already refunded = same key, so a double click can't refund twice.
        { idempotencyKey: `spx-refund-${order.id}-${order.amount_refunded}-${refundAmount}` });
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Stripe refused the refund.';
      return json({ error: `Stripe: ${msg}` }, 400, headers);
    }

    // Record it now so the admin updates straight away (the webhook will confirm the same numbers).
    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent, { expand: ['latest_charge'] });
    const charge = pi.latest_charge as Stripe.Charge | null;
    const refunded = charge?.amount_refunded ?? order.amount_refunded + refundAmount;
    const fully = charge?.refunded ?? refunded >= order.amount_total;
    const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });
    await db.rpc('record_refund', { payment_intent: order.stripe_payment_intent, refunded, fully });

    // Stock goes back only on a full refund, only if asked, and only once.
    let restocked = false;
    if (restock && fully && !order.restocked_at) {
      const r = await asAdmin.rpc('admin_restock_order', { order_id });
      restocked = r.data === true;
    }
    return json({ ok: true, refunded, fully, restocked }, 200, headers);
  } catch (err) {
    console.error('refund-order failed', err);
    return json({ error: 'The refund could not be completed. Check Stripe before trying again.' }, 502, headers);
  }
});
