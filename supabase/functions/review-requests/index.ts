// SPXTR — "how did it hold up?"
//
// Finds orders that shipped a while ago, have not been asked yet, and writes to the customer
// once asking them to review what they bought. Nothing else in the site asks for reviews, so
// without this the review system only ever hears from people who go looking for it.
//
// It is called on a schedule by the database (pg_cron), not by a browser, so it is guarded by a
// secret rather than a login:
//
//   POST  header  x-spx-cron: <CRON_SECRET>
//   body  { "days": 7, "limit": 50, "dry": false }   -- all optional
//
// Deploy: supabase functions deploy review-requests --no-verify-jwt --use-api
// Then schedule it (see supabase/REVIEW-REQUESTS.md).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { env, json, serviceKey, siteUrl } from '../_shared/http.ts';
import { emailConfigured, loadAccent, reviewRequestEmail, sendEmail } from '../_shared/email.ts';

const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });

// Compared in constant time so a wrong secret can't be guessed a character at a time.
function sameSecret(given: string, wanted: string) {
  if (given.length !== wanted.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ wanted.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  if (!secret) return json({ error: 'CRON_SECRET is not set, so this cannot be called safely.' }, 500);
  if (!sameSecret(req.headers.get('x-spx-cron') ?? '', secret)) return json({ error: 'Not allowed' }, 403);

  const b = await req.json().catch(() => ({}));
  const days = Math.min(90, Math.max(1, Number(b.days) || 7));
  const limit = Math.min(200, Math.max(1, Number(b.limit) || 50));
  const dry = !!b.dry;

  if (!emailConfigured()) return json({ error: 'Email isn\'t set up (RESEND_API_KEY / EMAIL_FROM).' }, 400);

  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: orders, error } = await db
    .from('orders')
    .select('id, number, email, name, access_key, shipped_at, order_items(name, size, quantity)')
    .in('status', ['shipped', 'delivered'])
    .lte('shipped_at', cutoff)
    .is('review_asked_at', null)
    .not('email', 'is', null)
    .order('shipped_at', { ascending: true })
    .limit(limit);
  if (error) return json({ error: error.message }, 500);

  const due = orders ?? [];
  if (dry) return json({ ok: true, due: due.length, orders: due.map(o => o.number) });
  if (!due.length) return json({ ok: true, sent: 0, failed: 0 });

  await loadAccent(db);
  let sent = 0; const failed: number[] = [];
  for (const o of due) {
    try {
      const m = reviewRequestEmail(siteUrl(), o, o.order_items ?? []);
      // One-to-one mail about something they bought, so it carries no bulk headers.
      await sendEmail(o.email, m.subject, m.html, m.text, undefined, { kind: 'order' });
      await db.from('orders').update({ review_asked_at: new Date().toISOString() }).eq('id', o.id);
      sent++;
    } catch (err) {
      failed.push(o.number);
      console.error(`Review request for SPX-${o.number} failed`, err);
      // Stamped anyway: a bad address would otherwise be retried every day forever.
      await db.from('orders').update({ review_asked_at: new Date().toISOString() }).eq('id', o.id);
    }
    await new Promise(r => setTimeout(r, 120));          // stay under Resend's rate limit
  }
  return json({ ok: true, sent, failed: failed.length, failedOrders: failed });
});
