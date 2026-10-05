# "How did it hold up?" — asking for reviews

Nothing on the site asks customers for a review, so the only ones you get are from people who go
looking. This sends one email per order, a while after it shipped, linking straight to the review
form on their own order page (which marks them a verified buyer).

Nobody is asked twice: the order is stamped `review_asked_at` whether the email sends or bounces.

## 1. The function

```bash
supabase functions deploy review-requests --no-verify-jwt --use-api
```

## 2. The secret

It is called by the database, not by a browser, so it is guarded by a secret rather than a login.
Pick a long random one, print it, and set it in one go. You need the value for the schedule
below, and Supabase will only ever show you a digest of it afterwards — so copy it now:

```bash
SECRET=$(openssl rand -hex 24); echo "CRON_SECRET = $SECRET"; supabase secrets set CRON_SECRET="$SECRET" --project-ref <your-project-ref>
```

It stays in your terminal history, so run `clear` once you have pasted it into the schedule. If
you lose it, generate a new one the same way and update the schedule to match — nothing else
depends on the old value.

## 3. The schedule

In the SQL editor. Replace `<project-ref>` and `<CRON_SECRET>` with your own.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every day at 9am UTC. Change the time to suit; it only decides when the email lands.
select cron.schedule('spxtr-review-requests', '0 9 * * *', $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/review-requests',
    headers := '{"Content-Type":"application/json","x-spx-cron":"<CRON_SECRET>"}'::jsonb,
    body    := '{"days":7,"limit":50}'::jsonb
  );
$$);
```

`days` is how long after shipping to wait. Seven is a reasonable default: long enough to have worn
it, short enough to still remember buying it.

## Checking it

A dry run says who is due without sending anything:

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/review-requests" \
  -H "x-spx-cron: <CRON_SECRET>" -H "Content-Type: application/json" \
  -d '{"days":7,"dry":true}'
```

To stop it: `select cron.unschedule('spxtr-review-requests');`
