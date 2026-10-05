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

import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, env, json, originAllowed, serviceKey, siteUrl } from '../_shared/http.ts';
import {
  applicationAlertEmail, applicationAppliedEmail, applicationStatusEmail, crewWelcomeEmail,
  emailConfigured, loadAccent, sendEmail, senderFor,
} from '../_shared/email.ts';

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
const CONSENT_COUNT = 10;  // every box in settings.apply consent list must be ticked
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
