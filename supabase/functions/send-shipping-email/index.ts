// SPXTR — emails the customer their tracking details after the admin marks an order shipped.
//
// Called from the admin with the admin's own login token. Before sending, it asks the database
// whether this session is allowed to make changes right now (admin + authenticator code +
// password confirmed in the last few minutes) — the same rule as every other change.
// Each order's shipping email can only be sent once.
//
// Deploy: supabase functions deploy send-shipping-email --no-verify-jwt
// (The token is checked by the database below rather than by the function gateway.)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, env, json, originAllowed, serviceKey, siteUrl } from '../_shared/http.ts';
import { emailConfigured, loadAccent, sendEmail, shippingEmail } from '../_shared/email.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!originAllowed(req)) return json({ error: 'Not allowed' }, 403, headers);

  try {
    const { order_id } = await req.json().catch(() => ({}));
    if (!UUID.test(String(order_id ?? ''))) return json({ error: 'Invalid order' }, 400, headers);

    // Act as the admin who called us, so row-level security applies to every read.
    const asAdmin = createClient(env('SUPABASE_URL'), req.headers.get('apikey') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: allowed } = await asAdmin.rpc('can_write');
    if (allowed !== true) return json({ error: 'Not allowed. Confirm your password and try again.' }, 403, headers);

    const { data: order, error } = await asAdmin.from('orders').select('*, order_items(*)').eq('id', order_id).maybeSingle();
    if (error) throw error;
    if (!order) return json({ error: 'Order not found' }, 404, headers);
    if (order.status !== 'shipped') return json({ sent: false, reason: 'not_shipped' }, 200, headers);
    if (order.shipping_email_at) return json({ sent: false, reason: 'already_sent' }, 200, headers);
    if (!order.email) return json({ sent: false, reason: 'no_email' }, 200, headers);
    if (!emailConfigured()) return json({ sent: false, reason: 'not_configured' }, 200, headers);

    await loadAccent(asAdmin);
    const m = shippingEmail(siteUrl(), order, order.order_items);
    await sendEmail(order.email, m.subject, m.html, m.text);
    const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });
    await db.rpc('mark_order_email', { order_id, kind: 'shipping' });
    return json({ sent: true }, 200, headers);
  } catch (err) {
    console.error('send-shipping-email failed', err);
    // Pass Resend's own reason back to the admin (e.g. the domain isn't verified yet).
    const reason = String((err as Error)?.message ?? '').match(/"message"\s*:\s*"([^"]+)"/)?.[1];
    return json({ error: reason ? `Email not sent. Resend says: ${reason}` : 'The shipping email could not be sent.' }, 502, headers);
  }
});
