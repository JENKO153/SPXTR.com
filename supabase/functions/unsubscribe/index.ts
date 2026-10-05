// SPXTR — "stop emailing me".
//
// The link at the bottom of the cart reminder and the review invitation. One click, no login, no
// form, no fee — which is what the Spam Act requires, and what anyone would want anyway.
//
//   GET  ?e=<email>&t=<signature>    the link in the email
//   POST same, for the one-click header some mail apps use
//
// The signature is made with a server-side key, so a link only works for the address it was made
// for. Nothing is stored until somebody actually unsubscribes.
//
// Deploy: supabase functions deploy unsubscribe --no-verify-jwt --use-api

import { createClient } from 'npm:@supabase/supabase-js@2';
import { env, serviceKey } from '../_shared/http.ts';
import { unsubSignature } from '../_shared/email.ts';

const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });

const page = (title: string, line: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${title} — SPXTR</title>
   <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0A0A;color:#F2F2EE;
                font:400 16px/1.6 system-ui,sans-serif;text-align:center;padding:40px">
     <div><h1 style="font:700 28px/1.2 system-ui;margin:0 0 10px">${title}</h1>
     <p style="margin:0;color:#8E8E88;max-width:42ch">${line}</p></div>`,
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async req => {
  const url = new URL(req.url);
  const email = (url.searchParams.get('e') || '').trim().toLowerCase();
  const token = url.searchParams.get('t') || '';

  if (!email || !token) return page('Link not recognised', 'Check the link in your email, or reply to us and we\'ll take you off.');
  if (token !== await unsubSignature(email)) {
    return page('Link not recognised', 'That link doesn\'t match an address. Reply to the email instead and we\'ll do it by hand.');
  }

  // Already off the list? Say the same thing either way.
  await db.from('email_optouts').upsert({ email, source: url.searchParams.get('s') || 'email' }, { onConflict: 'email' });

  return page('You won\'t hear from us again',
    'We won\'t send you cart reminders or review invitations. Messages about an order you place, or an application you send, still come through — those are part of the thing itself.');
});
