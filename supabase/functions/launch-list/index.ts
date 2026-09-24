// SPXTR — the launch list: "tell me when the store opens".
//
// POST {email}          — adds someone to the list and sends them a short "you're on the list" email.
// GET  ?unsub=<token>   — the unsubscribe link in those emails. Removes them and says so in plain HTML.
// POST {send: true}     — admins only (password-confirmed): emails everyone who hasn't been told yet.
//
// Spam protection: hidden honeypot field, 10 sign-ups an hour per address, strict validation.
//
// Deploy: supabase functions deploy launch-list --no-verify-jwt --use-api

import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, env, json, originAllowed, serviceKey, siteUrl } from '../_shared/http.ts';
import { emailConfigured, launchLiveEmail, launchWelcomeEmail, loadAccent, sendEmail, senderFor } from '../_shared/email.ts';

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

const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PER_HOUR = 10;
class Bad extends Error {}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const unsubUrl = (token: string) => `${env('SUPABASE_URL')}/functions/v1/launch-list?unsub=${token}`;

const page = (title: string, line: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${title} — SPXTR</title>
   <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0A0A;color:#F2F2EE;
                font:400 16px/1.6 system-ui,sans-serif;text-align:center;padding:40px">
     <div><h1 style="font:700 28px/1.2 system-ui;margin:0 0 10px">${title}</h1>
     <p style="margin:0;color:#8E8E88">${line}</p></div>`,
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

// The blast is only for a signed-in admin who has just confirmed their password, checked as
// that admin (not with the service key), exactly like every other change on the site.
async function adminOk(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return false;
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false }, global: { headers: { Authorization: auth } },
  });
  const { data: canWrite, error } = await asUser.rpc('can_write');
  return !error && canWrite === true;
}

Deno.serve(async req => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers });

  // Unsubscribe link from an email: a plain page, no site needed.
  const token = new URL(req.url).searchParams.get('unsub');
  if (req.method === 'GET' && token) {
    if (!/^[a-f0-9]{32}$/i.test(token)) return page('Link not recognised', 'Check the link in your email, or reply to us and we\'ll take you off.');
    await db.from('launch_signups').delete().eq('unsub_token', token);
    return page('You\'re off the list', 'You won\'t hear from us about the launch again.');
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!originAllowed(req)) return json({ error: 'Not allowed' }, 403, headers);

  try {
    const b = await req.json().catch(() => ({}));

    // ---- the launch email to everyone on the list (admins only) ----
    if (b.send) {
      if (!(await adminOk(req))) return json({ error: 'Not allowed. Confirm your password and try again.' }, 403, headers);
      if (!emailConfigured()) return json({ error: 'Email isn\'t set up yet (RESEND_API_KEY / EMAIL_FROM).' }, 400, headers);
      const { data: waiting } = await db.from('launch_signups').select('id, email, unsub_token').is('notified_at', null).limit(2000);
      const list = waiting ?? [];
      if (!list.length) return json({ ok: true, sent: 0, failed: 0 }, 200, headers);
      await loadAccent(db);
      const headline = clean(b.headline, 120), message = clean(b.message, 600);
      let sent = 0; const failed: string[] = [];
      for (const row of list) {
        try {
          const m = launchLiveEmail(siteUrl(), unsubUrl(row.unsub_token), headline || undefined, message || undefined);
          await sendEmail(row.email, m.subject, m.html, m.text, senderFor('launch'), { kind: 'bulk', unsubUrl: unsubUrl(row.unsub_token) });
          await db.from('launch_signups').update({ notified_at: new Date().toISOString() }).eq('id', row.id);
          sent++;
        } catch (err) { await noteEmailProblem(`Launch email to ${row.email} failed`, err); failed.push(row.email); }
        await new Promise(r => setTimeout(r, 120));          // stay under Resend's rate limit
      }
      return json({ ok: true, sent, failed: failed.length }, 200, headers);
    }

    // ---- someone asking to be told ----
    if (b.website) return json({ ok: true }, 200, headers);   // honeypot: bots fill hidden fields
    const email = clean(b.email, 200).toLowerCase();
    if (!EMAIL.test(email)) throw new Bad('That email address doesn\'t look right.');

    const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const ipHash = await sha256(ip + '|' + env('SUPABASE_URL'));
    const { count } = await db.from('launch_signups').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('at', new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= PER_HOUR) return json({ error: 'Too many sign-ups from here in the last hour. Try again later.' }, 429, headers);

    const { data: existing } = await db.from('launch_signups').select('id').eq('email', email).maybeSingle();
    if (existing) return json({ ok: true, already: true }, 200, headers);   // no second welcome email

    const { data: row, error } = await db.from('launch_signups').insert({ email, ip_hash: ipHash }).select('unsub_token').single();
    if (error) {
      if (error.code === '23505') return json({ ok: true, already: true }, 200, headers);  // added a moment ago
      throw error;
    }
    let emailed = false;
    if (emailConfigured()) {
      try {
        await loadAccent(db);
        const m = launchWelcomeEmail(siteUrl(), unsubUrl(row.unsub_token));
        await sendEmail(email, m.subject, m.html, m.text, senderFor('launch'), { kind: 'bulk', unsubUrl: unsubUrl(row.unsub_token) });
        emailed = true;
      } catch (err) { await noteEmailProblem('Launch list welcome email failed', err); }   // they're on the list either way
    }
    return json({ ok: true, emailed }, 200, headers);
  } catch (err) {
    if (err instanceof Bad) return json({ error: err.message }, 400, headers);
    console.error('launch-list failed', err);
    return json({ error: 'Couldn\'t add you just now. Please try again in a minute.' }, 502, headers);
  }
});
