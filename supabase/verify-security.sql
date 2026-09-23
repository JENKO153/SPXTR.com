-- =====================================================================
-- SPXTR — security self-check
-- Paste into Supabase: SQL Editor -> New query -> Run.
-- Every row should say PASS. Anything else tells you exactly what to fix.
-- Safe to run any time; it only reads.
-- =====================================================================

with checks as (

  -- 1. Row-level security switched on for every table we created
  select '1. Row-level security on all tables' as item,
         case when count(*) filter (where not c.relrowsecurity) = 0
              then 'PASS' else 'FAIL — no RLS on: ' || string_agg(c.relname, ', ') filter (where not c.relrowsecurity) end as result
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('admins','security_settings','admin_write_grants','admin_confirm_attempts',
                      'collections','products','product_collections','site_settings','audit_log',
                      'orders','order_items','reviews','review_submissions','setup_done')

  union all
  -- 2. The public (not-logged-in) role cannot write to anything
  select '2. Public visitors cannot write',
         case when count(*) = 0 then 'PASS'
              else 'FAIL — anon can write: ' || string_agg(distinct table_name || '.' || privilege_type, ', ') end
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')

  union all
  -- 3. At least one admin exists, and every admin is a real user
  select '3. Admin accounts',
         case when (select count(*) from public.admins) = 0 then 'FAIL — no admins. See SETUP.md step 1.5'
              when (select count(*) from public.admins a left join auth.users u on u.id = a.user_id where u.id is null) > 0
                   then 'FAIL — an admin row points at a deleted user'
              else 'PASS — ' || (select count(*) from public.admins) || ' admin(s): ' || (select string_agg(email, ', ') from public.admins) end

  union all
  -- 4. Authenticator app required
  select '4. Two-factor required',
         case when (select require_mfa from public.security_settings where id = 1) then 'PASS'
              else 'FAIL — require_mfa is off. Turn it back on: update public.security_settings set require_mfa = true where id = 1;' end

  union all
  -- 5. Every admin has actually set up an authenticator
  select '5. Admins have an authenticator enrolled',
         case when (select count(*) from public.admins) = 0 then 'SKIP — no admins yet'
              when (select count(*) from public.admins a
                    where not exists (select 1 from auth.mfa_factors f
                                      where f.user_id = a.user_id and f.status = 'verified')) = 0
                   then 'PASS'
              else 'WARN — not yet enrolled: ' || (select string_agg(a.email, ', ') from public.admins a
                     where not exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified'))
                     || ' (they enroll at first login)' end

  union all
  -- 6. Password-confirmation functions are locked to logged-in users
  select '6. Admin functions not callable by the public',
         case when count(*) = 0 then 'PASS'
              else 'FAIL — anon can execute: ' || string_agg(routine_name, ', ') end
  from information_schema.role_routine_grants
  where grantee in ('anon','PUBLIC') and specific_schema = 'public'
    and routine_name in ('confirm_password','end_write_grant','save_product','admin_status')

  union all
  -- 7. Writes are gated behind can_write() on the content tables
  select '7. Changes require a confirmed password',
         case when count(*) filter (where qual like '%can_write%' or with_check like '%can_write%') >= 6
              then 'PASS' else 'FAIL — write policies are not using can_write()' end
  from pg_policies
  where schemaname = 'public' and tablename in ('products','collections','product_collections','site_settings')
    and cmd in ('INSERT','UPDATE','DELETE')

  union all
  -- 8. Nobody can edit or delete the activity log
  select '8. Activity log is append-only',
         case when count(*) = 0 then 'PASS'
              else 'FAIL — audit_log is writable by: ' || string_agg(distinct grantee || '/' || privilege_type, ', ') end
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'audit_log'
    and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')

  union all
  -- 9. Photo uploads are restricted
  select '9. Photo uploads restricted to images',
         case when (select count(*) from storage.buckets where id = 'product-images') = 0 then 'FAIL — bucket missing, re-run schema.sql'
              when (select allowed_mime_types from storage.buckets where id = 'product-images') is null then 'FAIL — any file type is allowed'
              when (select file_size_limit from storage.buckets where id = 'product-images') is null then 'FAIL — no size limit'
              else 'PASS — ' || (select array_to_string(allowed_mime_types, ', ') from storage.buckets where id = 'product-images')
                   || ', max ' || (select file_size_limit / 1048576 from storage.buckets where id = 'product-images') || 'MB' end

  union all
  -- 10. No write window is sitting open right now
  select '10. No unused write windows open',
         case when count(*) = 0 then 'PASS' else 'WARN — ' || count(*) || ' open (they expire on their own)' end
  from public.admin_write_grants where expires_at > now()

  union all
  -- 11. Recent failed password confirmations (possible someone guessing)
  select '11. Failed password attempts (last 24h)',
         case when count(*) = 0 then 'PASS — none'
              when count(*) < 5 then 'OK — ' || count(*) || ' failed attempt(s)'
              else 'WARN — ' || count(*) || ' failed attempts. Check the activity log and consider changing the password' end
  from public.admin_confirm_attempts where not success and at > now() - interval '24 hours'

  union all
  -- 12. Only the Stripe webhook (service key) can create orders or change stock through a sale
  select '12. Orders can only be created by the webhook',
         case when count(*) = 0 then 'PASS'
              else 'FAIL — callable by: ' || string_agg(distinct grantee || ' -> ' || routine_name, ', ') end
  from information_schema.role_routine_grants
  where grantee in ('anon','authenticated','PUBLIC') and specific_schema = 'public'
    and routine_name in ('record_paid_order','record_refund','mark_order_email')

  union all
  -- 13. Reviews only appear once an admin has approved them
  select '13. Reviews need approval',
         case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reviews'
                      and cmd = 'SELECT' and qual like '%approved%') = 0
                   then 'FAIL — the read rule on reviews is missing. Re-run schema.sql'
              else 'PASS — ' || (select count(*) from public.reviews where status = 'pending') || ' waiting for approval' end

  union all
  -- 14. Coming soon: when it's on, the public gets no products, pages or reviews at all
  select '14. Coming soon mode',
         case when not coalesce((select coming_soon from public.security_settings where id = 1), false) then 'OK — store is open to everyone'
              when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'products'
                      and cmd = 'SELECT' and qual like '%coming_soon%') = 0
                   then 'FAIL — the store is closed but the read rule is missing. Re-run schema.sql'
              else 'PASS — store is closed to the public, admins and the preview link still see it' end

  union all
  -- 15. Admins can change fulfilment details only, never amounts or customer details
  select '15. Order amounts are read-only for admins',
         case when count(*) = 0 then 'PASS'
              else 'FAIL — admins can edit: ' || string_agg(column_name, ', ') end
  from information_schema.column_privileges
  where grantee = 'authenticated' and table_schema = 'public' and table_name = 'orders'
    and privilege_type in ('UPDATE','INSERT')
    and column_name not in ('status','carrier','tracking_number','tracking_url','notes','shipped_at')
)
select item, result from checks order by split_part(item, '.', 1)::int;
