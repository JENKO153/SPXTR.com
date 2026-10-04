# Applications (ambassadors + models) — switching it on

Three things, all in the Supabase dashboard. Nothing here is secret, so this file is safe in the
repo; the values themselves live only in Supabase.

## 1. The database

**SQL Editor → New query →** paste the whole of `supabase/schema.sql` → **Run**.

It is safe to re-run: everything in it is `create table if not exists`, `create or replace` or
`drop policy if exists`. This pass adds:

- `public.applications` — one table for both kinds, with row-level security on and **no rights at
  all for the browser**. Only the Edge Function (which holds the service key) can write to it.
- `application_list()` — the admin screen's read.
- `application_set_status()` — moves one along; refuses unless a password was confirmed in the
  last few minutes, and writes the change to the activity log.
- `application_delete()` — same protection.

## 2. The Edge Function

**Edge Functions → Create a new function → name it exactly `applications`.**

Paste the contents of **`supabase/functions/applications/index.dashboard.ts`**. That file is the
function with its shared helpers already folded in, so it needs no other files — the dashboard's
editor can't follow the `../_shared/...` imports the repo uses.

> Regenerate it after any change to the function or the shared helpers:
> `python3 tools/bundle-function.py applications`

**Turn "Verify JWT" off** for this function. Applying is public — the protection is the honeypot
field, the per-address rate limit, the origin check and the validation inside the function, not a
token. (Admin actions inside it are still checked properly: signed in, MFA passed, password
confirmed.)

## 3. The secrets

**Project Settings → Edge Functions → Secrets.** These already exist from the shop and are reused:
`RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`, `LAUNCH_EMAIL_FROM`.

Add:

| Name | What it does | Example |
| --- | --- | --- |
| `APPLICATIONS_EMAIL_TO` | Where the crew's copy of every application is sent. **Required** for the alert email. | `admin@spxtr.com` |
| `APPLICATIONS_EMAIL_FROM` | Optional. Who applicant mail comes from. Falls back to `LAUNCH_EMAIL_FROM`, then `EMAIL_FROM`. | `crew@spxtr.com` |

## Checking it worked

1. Open `/ambassadors/` and send an application. You should get a reference back on the page
   (`SPX-A-…`), an email with that reference, and a copy at `APPLICATIONS_EMAIL_TO`.
2. Open the admin → **Applications**. It should be there under **Riders**.
3. Shortlist it. The applicant gets the "you made the shortlist" email, and the change appears in
   **Security & activity**.
4. Do the same from `/models/` — the reference starts `SPX-M-` and it files under **Models**.

If the admin screen says the database is missing this feature, step 1 hasn't run yet.
