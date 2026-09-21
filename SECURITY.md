# SPXTR — how the login and admin are protected

Short version: **the website is not the security boundary — the database is.** Every rule below is enforced inside Supabase, so it still holds if an attacker ignores the site completely and talks to the API directly with their own tools.

---

## 1. What stops what

| If someone… | What stops them |
|---|---|
| Finds `/admin/login/` | They still need the email, the password **and** a 6-digit code from the client's phone |
| Guesses passwords in bulk | Supabase rate-limits sign-ins per IP; the login form also slows down after 3 tries; optional bot check (section 3) |
| Steals the password (phishing, reused password) | They still can't log in without the authenticator code, and can't change anything without it either |
| Signs themselves up at your Supabase project | Sign-ups are off, and changing anything also requires a row in the `admins` table |
| Steals a logged-in session (e.g. an open laptop) | Changes need the password typed again; the session dies when the browser closes or after 20 idle minutes |
| Skips the website and calls the API directly | Row-level security refuses every write without an admin row, a passed MFA check, and a password confirmation from that same session, all checked in the database |
| Tries to tamper with a price in the browser | The browser only sends product ids and quantities. The checkout function looks up the real price and stock in the database before Stripe sees anything |
| Tries to fake an order | Orders are only created by the webhook after Stripe's signature is verified. The browser and even a logged-in admin can't create one or change its amounts (checks 12 and 13 in the self-check) |
| Tries to steal card details | Cards are typed into Stripe's own page, never this site. The site never sees or stores card numbers |
| Uploads a booby-trapped "image" | Only JPG/PNG/WebP/AVIF, 8MB max, re-encoded in the browser (strips EXIF/GPS and anything hidden inside), and no SVG (SVGs can carry scripts) |
| Saves `<script>` into a product description | Everything is escaped before display, and the admin runs under a Content-Security-Policy that blocks inline and third-party scripts |
| Hijacks a script the site depends on | The Supabase library is self-hosted at a fixed version, not pulled live from a CDN |
| Covers the admin in a hidden frame to trick clicks | `X-Frame-Options: DENY` and `frame-ancestors 'none'` on `/admin/*` |
| Quietly changes something | Every insert, update and delete is written to an append-only `audit_log` that nobody can edit, including admins |

**The password rule in detail.** Saving anything calls `confirm_password()` in the database. That function checks the password against Supabase's own stored hash, records the attempt, and opens a 5-minute write window tied to that exact login session. Row-level security requires that window for every write, and the admin closes it immediately after saving. Five wrong attempts lock changes for 15 minutes.

---

## 2. Prove it (worth doing once after setup)

### Run the self-check

Supabase → SQL Editor → paste `supabase/verify-security.sql` → Run. Every row should say **PASS**. It checks RLS is on, the public can't write, MFA is required, admins are enrolled, the activity log is append-only, uploads are restricted, orders can only come from the webhook with read-only amounts, and reports any recent failed password attempts.

### Try to break in from outside (3 minutes)

Replace `URL` and `KEY` with your project URL and publishable key, then run these in a terminal. **The first should work; the rest should all fail.**

```bash
URL=https://abcdefgh.supabase.co
KEY=sb_publishable_xxxxxxxx

# A. Public can read published products — expect a list
curl -s "$URL/rest/v1/products?select=name,status&limit=3" -H "apikey: $KEY"

# B. Public tries to change a price — expect "permission denied" / 401
curl -i -s -X PATCH "$URL/rest/v1/products?slug=eq.core-ghost-tee" \
  -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"price":1}' | head -3

# C. Public tries to read drafts — expect [] even if drafts exist
curl -s "$URL/rest/v1/products?select=name&status=eq.draft" -H "apikey: $KEY"

# D. A REAL login, then a write without the password step — expect 0 rows changed
TOKEN=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"THE-REAL-PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
curl -i -s -X PATCH "$URL/rest/v1/products?slug=eq.core-ghost-tee" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"price":1}' | head -3
```

**Test D is the important one.** Even with the correct email and password, the write is refused, because that session hasn't passed the authenticator check or confirmed the password. That's the claim "every change needs the password", demonstrated rather than promised.

### Check it in the browser

- Open `/admin/dashboard/` in a private window → it should bounce you to the login page.
- Log in, edit a product, hit Save, then press **Cancel** at the password prompt → nothing is saved.
- Leave the admin open for 20 minutes → it signs itself out.

---

## 3. Settings to turn on in Supabase (10 minutes, all free)

1. **Authentication → Sign In / Providers → Email**: "Allow new users to sign up" **off**.
2. **Authentication → Attack Protection**:
   - **Leaked password protection** on — blocks passwords found in known breaches.
   - **Captcha protection** on — choose **Turnstile**, create a free widget at Cloudflare, paste the **secret** key into Supabase and the **site** key into `captcha.siteKey` in `assets/js/config.js`. The login form picks it up automatically.
3. **Authentication → Password settings**: minimum length 12, and require letters + digits + symbols.
4. **Database → Backups**: daily backups on. Point-in-Time Recovery (paid) is worth it once real orders exist.

---

## 4. Habits that matter more than the code

- **One password per person, from a password manager, used nowhere else.** Most break-ins are reused passwords, not clever attacks.
- **Don't share the login.** If someone else needs access, add them their own account and their own `admins` row.
- **When someone leaves:** delete their user in Supabase → Authentication → Users, and remove their row from `admins`.
- **Never paste the secret key** (`sb_secret_...` / `service_role`) into the website, an email, or a chat. It ignores every rule above.
- **Glance at the activity log** in the admin now and then. Anything you don't recognise is the early warning.

---

## 5. If you think something's wrong

1. In the admin → **Security & activity** → **Sign out on every device**.
2. Change the password (Supabase → Authentication → Users → the user → reset password).
3. Read the **activity log** to see what changed and when.
4. If the publishable key or a device was exposed: Supabase → Settings → API Keys → rotate it, then update `config.js` and redeploy.
5. If the Stripe secret key or webhook secret may have leaked: roll it in Stripe (Developers → API keys / Webhooks) and `supabase secrets set` the new value. Nothing in the website needs changing.
6. If content was damaged: restore from Database → Backups.

---

## 6. Being straight about the limits

No site is unhackable, and I'd distrust anyone who tells you otherwise. What this setup does is remove the usual ways in and make anything unusual visible. What it can't stop:

- **The client's own device being compromised** (malware, or someone with their unlocked phone and password).
- **Convincing phishing** — a fake "SPXTR admin" page asking for the code. Tell them: the real login is only ever at your domain, and no one will ever ask for that 6-digit code by email, DM or phone.
- **A breach at Supabase, Stripe, Resend or the web host themselves.** Real but unlikely, and why backups matter.
- **Losing the authenticator phone** — recovery goes through you (Supabase → Authentication → Users → delete their MFA factor, they re-enrol at next login). Nobody else can do it, which is the point.

One deliberate choice: there's **no "forgot password" link** on the admin. Self-serve resets turn the client's email account into a second way in. Instead, you reset it from the Supabase dashboard.
