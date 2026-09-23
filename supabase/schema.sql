-- =====================================================================
-- SPXTR — Supabase schema, security rules and seed data
-- Paste this whole file into Supabase: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run: uses "if not exists", "create or replace" and "drop policy if exists".
--
-- Security model (what actually protects the store — the website code is just a UI):
--   * Row-level security on every table. The public can only READ published products,
--     visible pages and site settings. Nobody can write except an admin.
--   * An admin is a user listed in public.admins. Signing up does not make you an admin.
--   * Every change needs a fresh password confirmation, enforced HERE in the database:
--     confirm_password() checks the password and opens a short write window bound to
--     that exact login session. Without it, inserts/updates/deletes/uploads are refused.
--   * Authenticator-app (MFA) codes are required for admin access (security_settings).
--   * Wrong confirmation passwords are rate limited and every change is written to an
--     append-only audit log that no one (not even an admin) can edit or delete.
--   * Orders are only ever created by the Stripe webhook (a Supabase Edge Function holding
--     the secret key). The browser can't create, price or delete an order.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Admin accounts + security settings
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
-- What this admin is called in the activity log ("Blake", "Zac"). Falls back to the email.
alter table public.admins add column if not exists nickname text
  check (nickname is null or char_length(btrim(nickname)) between 1 and 40);

create table if not exists public.security_settings (
  id int primary key default 1 check (id = 1),
  require_mfa boolean not null default true,
  confirm_window_minutes int not null default 5 check (confirm_window_minutes between 1 and 30),
  max_failed_confirms int not null default 5 check (max_failed_confirms between 3 and 20)
);
-- Coming soon mode: the store is closed to the public until launch. Admins still see everything,
-- and anyone with the preview link (preview_key) can look around.
alter table public.security_settings add column if not exists coming_soon boolean not null default false;
alter table public.security_settings add column if not exists preview_key text not null default replace(gen_random_uuid()::text, '-', '');
insert into public.security_settings (id) values (1) on conflict (id) do nothing;


-- Is the store closed to the public right now? Used by the read rules below.
create or replace function public.coming_soon() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select coming_soon from public.security_settings where id = 1), false);
$$;
grant execute on function public.coming_soon() to anon, authenticated;

-- One active write window per admin, tied to the session that confirmed the password.
create table if not exists public.admin_write_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid,
  expires_at timestamptz not null
);

create table if not exists public.admin_confirm_attempts (
  id bigserial primary key,
  user_id uuid not null,
  success boolean not null,
  at timestamptz not null default now()
);
create index if not exists admin_confirm_attempts_user_at_idx on public.admin_confirm_attempts (user_id, at desc);

-- ---------------------------------------------------------------------
-- Helper functions used by the security rules
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select require_mfa from public.security_settings where id = 1), true)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Admin who has passed MFA: may read drafts, the audit log, etc.
create or replace function public.admin_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and public.mfa_ok();
$$;

-- Admin who has ALSO confirmed their password in the last few minutes, from this session.
create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select public.admin_ok() and exists (
    select 1 from public.admin_write_grants g
    where g.user_id = auth.uid()
      and g.expires_at > now()
      and g.session_id is not distinct from nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;

-- Checks the admin's password against Supabase Auth and opens a short write window.
-- Returns {ok:true, expires_at} or {ok:false, reason}. It never raises on a wrong password,
-- so failed attempts are recorded (an exception would roll the record back).
create or replace function public.confirm_password(password text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  hash text;
  fails int;
  cfg public.security_settings;
  exp timestamptz;
begin
  if uid is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;
  if not public.mfa_ok() then
    return jsonb_build_object('ok', false, 'reason', 'mfa_required');
  end if;

  select * into cfg from public.security_settings where id = 1;
  select count(*) into fails from public.admin_confirm_attempts
    where user_id = uid and not success and at > now() - interval '15 minutes';
  if fails >= cfg.max_failed_confirms then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  select encrypted_password into hash from auth.users where id = uid;
  if hash is null or password is null or extensions.crypt(password, hash) <> hash then
    insert into public.admin_confirm_attempts (user_id, success) values (uid, false);
    return jsonb_build_object('ok', false, 'reason', 'incorrect', 'remaining', cfg.max_failed_confirms - fails - 1);
  end if;

  insert into public.admin_confirm_attempts (user_id, success) values (uid, true);
  exp := now() + make_interval(mins => cfg.confirm_window_minutes);
  insert into public.admin_write_grants (user_id, session_id, expires_at)
  values (uid, nullif(auth.jwt() ->> 'session_id', '')::uuid, exp)
  on conflict (user_id) do update set session_id = excluded.session_id, expires_at = excluded.expires_at;
  return jsonb_build_object('ok', true, 'expires_at', exp);
end;
$$;

-- Closes the write window straight after a save, so it can't be reused.
create or replace function public.end_write_grant() returns void
language sql volatile security definer set search_path = public as $$
  delete from public.admin_write_grants where user_id = auth.uid();
$$;

-- The name to put in the activity log for whoever is signed in.
create or replace function public.actor_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim((select nickname from public.admins where user_id = auth.uid())), ''),
                  auth.jwt() ->> 'email');
$$;
grant execute on function public.actor_name() to authenticated;

-- Set (or clear) your own nickname. Needs a confirmed password, like every other change,
-- so nobody can quietly rename themselves in the log.
create or replace function public.set_nickname(name text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare clean text := nullif(btrim(coalesce(name, '')), '');
begin
  if not public.can_write() then raise exception 'Not allowed. Confirm your password and try again.'; end if;
  if clean is not null and char_length(clean) > 40 then clean := left(clean, 40); end if;
  update public.admins set nickname = clean where user_id = auth.uid();
  if not found then raise exception 'Not an admin account.'; end if;
  insert into public.audit_log (user_id, email, action, entity, entity_id, summary)
  values (auth.uid(), coalesce(clean, auth.jwt() ->> 'email'), 'update', 'admins', auth.uid()::text,
          case when clean is null then 'Nickname cleared' else 'Nickname set to ' || clean end);
  return clean;
end $$;
revoke all on function public.set_nickname(text) from public, anon;
grant execute on function public.set_nickname(text) to authenticated;

-- Everyone's nickname, so the activity log can show names on older entries too. Admins only.
create or replace function public.admin_names() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
    then coalesce((select jsonb_object_agg(lower(email), nickname) from public.admins where nickname is not null), '{}'::jsonb)
    else '{}'::jsonb end;
$$;
revoke all on function public.admin_names() from public, anon;
grant execute on function public.admin_names() to authenticated;

-- Lets the login screen check whether an account is an admin and whether MFA is required.
create or replace function public.admin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_admin', public.is_admin(),
    'require_mfa', coalesce((select require_mfa from public.security_settings where id = 1), true),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'coming_soon', public.coming_soon(),
    'nickname', (select nickname from public.admins where user_id = auth.uid()),
    'preview_key', (select preview_key from public.security_settings where id = 1 and public.is_admin())
  );
$$;


-- Turn coming soon on/off, and make a fresh preview link. Both need a confirmed password.
create or replace function public.set_coming_soon(on_off boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_write() then raise exception 'Not allowed. Confirm your password and try again.'; end if;
  update public.security_settings set coming_soon = on_off where id = 1;
  insert into public.audit_log (user_id, email, action, entity, entity_id, summary)
  values (auth.uid(), coalesce(public.actor_name(), 'Admin'), 'update', 'security_settings', '1',
          case when on_off then 'Coming soon: on' else 'Coming soon: off' end);
  return on_off;
end $$;

create or replace function public.new_preview_key() returns text
language plpgsql volatile security definer set search_path = public as $$
declare k text;
begin
  if not public.can_write() then raise exception 'Not allowed. Confirm your password and try again.'; end if;
  k := replace(gen_random_uuid()::text, '-', '');
  update public.security_settings set preview_key = k where id = 1;
  insert into public.audit_log (user_id, email, action, entity, entity_id, summary)
  values (auth.uid(), coalesce(public.actor_name(), 'Admin'), 'update', 'security_settings', '1', 'New preview link');
  return k;
end $$;

revoke all on function public.set_coming_soon(boolean), public.new_preview_key() from public, anon;
grant execute on function public.set_coming_soon(boolean), public.new_preview_key() to authenticated;

-- Validation helpers for check constraints (block javascript:/data: URLs and odd input).
create or replace function public.valid_asset_url(u text) returns boolean
language sql immutable as $$
  select u is null or u ~ '^(https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+|assets/img/[a-z0-9._-]+)$';
$$;

create or replace function public.valid_asset_urls(arr text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(public.valid_asset_url(u)), true) and coalesce(array_length(arr, 1), 0) <= 12
  from unnest(arr) u;
$$;

-- Functions are callable by PUBLIC by default in Postgres — lock them down.
revoke all on function public.confirm_password(text) from public, anon;
revoke all on function public.end_write_grant() from public, anon;
revoke all on function public.admin_status() from public, anon;
grant execute on function public.confirm_password(text) to authenticated;
grant execute on function public.end_write_grant() to authenticated;
grant execute on function public.admin_status() to authenticated;

-- ---------------------------------------------------------------------
-- Store content
-- ---------------------------------------------------------------------
-- Pages the admin sets up (Military, Moto, Rock Climbing, ...). They build the nav and homepage tiles.
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 1 and 60),
  tagline text not null default '' check (char_length(tagline) <= 160),
  description text not null default '' check (char_length(description) <= 2000),
  hero_image text check (public.valid_asset_url(hero_image)),
  sort_order int not null default 0,
  visible boolean not null default true,
  show_in_nav boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  sku text not null default '' check (char_length(sku) <= 40),
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'Tees' check (char_length(category) between 1 and 40),
  price numeric(10,2) not null check (price >= 0 and price < 100000),
  compare_at numeric(10,2) check (compare_at is null or compare_at > price),
  description text not null default '' check (char_length(description) <= 5000),
  spec text not null default '' check (char_length(spec) <= 120),
  -- short plain labels only (S, M, XL, 32, One size...)
  sizes text[] not null default '{}' check (array_to_string(sizes, '|') ~ '^([A-Za-z0-9 ./-]{1,12}(\|[A-Za-z0-9 ./-]{1,12})*)?$'),
  colors text[] not null default '{}' check (array_to_string(colors, ',') ~ '^(#[0-9A-Fa-f]{6}(,#[0-9A-Fa-f]{6})*)?$'),
  images text[] not null default '{}' check (public.valid_asset_urls(images)),
  stock int not null default 0 check (stock between 0 and 1000000),
  badge text check (badge is null or badge in ('New', 'Bestseller', 'Limited', 'Low stock', 'Sale')),
  is_new boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_collections (
  product_id uuid not null references public.products(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  primary key (product_id, collection_id)
);
create index if not exists product_collections_collection_idx on public.product_collections (collection_id);

-- Editable homepage content (announcement bar, hero, next event, ...).
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) < 100000),
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;
-- Room for the team, crew reports and photo addresses (raises the old 20KB limit on re-run).
alter table public.site_settings drop constraint if exists site_settings_data_check;
alter table public.site_settings add constraint site_settings_data_check check (octet_length(data::text) < 100000);

-- Append-only record of every change.
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  email text,
  action text not null,
  entity text not null,
  entity_id text,
  summary text
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------------
-- Triggers: updated_at + audit log
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists collections_touch on public.collections;
create trigger collections_touch before update on public.collections for each row execute function public.touch_updated_at();
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings for each row execute function public.touch_updated_at();

-- Server-side jobs (the Stripe webhook) have no logged-in user, so they name themselves in
-- spx.actor. Stock changes caused by a sale aren't logged separately: the order is the record.
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor text := nullif(current_setting('spx.actor', true), '');
begin
  if actor = 'Email' or (actor = 'Checkout' and tg_table_name = 'products')
     or (tg_table_name = 'reviews' and tg_op = 'INSERT') then
    return null;
  end if;
  insert into public.audit_log (user_id, email, action, entity, entity_id, summary)
  values (auth.uid(), coalesce(public.actor_name(), actor), lower(tg_op), tg_table_name, rec ->> 'id',
          case when tg_table_name = 'orders' then 'SPX-' || (rec ->> 'number')
               else left(coalesce(rec ->> 'name', rec ->> 'slug', ''), 200) end);
  return null;
end;
$$;

drop trigger if exists collections_audit on public.collections;
create trigger collections_audit after insert or update or delete on public.collections for each row execute function public.log_change();
drop trigger if exists products_audit on public.products;
create trigger products_audit after insert or update or delete on public.products for each row execute function public.log_change();
drop trigger if exists site_settings_audit on public.site_settings;
create trigger site_settings_audit after update on public.site_settings for each row execute function public.log_change();

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.security_settings enable row level security;
alter table public.admin_write_grants enable row level security;
alter table public.admin_confirm_attempts enable row level security;
alter table public.collections enable row level security;
alter table public.products enable row level security;
alter table public.product_collections enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_log enable row level security;

-- Belt and braces: the public role can never write to anything.
revoke insert, update, delete, truncate on all tables in schema public from anon;
-- These tables are only ever touched through the functions above.
revoke all on public.admin_write_grants, public.admin_confirm_attempts from anon, authenticated;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists security_settings_admin_read on public.security_settings;
create policy security_settings_admin_read on public.security_settings for select to authenticated using (public.is_admin());

-- collections
drop policy if exists collections_read on public.collections;
create policy collections_read on public.collections for select to anon, authenticated
  using ((visible and not public.coming_soon()) or public.admin_ok());
drop policy if exists collections_insert on public.collections;
create policy collections_insert on public.collections for insert to authenticated with check (public.can_write());
drop policy if exists collections_update on public.collections;
create policy collections_update on public.collections for update to authenticated using (public.can_write()) with check (public.can_write());
drop policy if exists collections_delete on public.collections;
create policy collections_delete on public.collections for delete to authenticated using (public.can_write());

-- products
drop policy if exists products_read on public.products;
create policy products_read on public.products for select to anon, authenticated
  using ((status = 'published' and not public.coming_soon()) or public.admin_ok());
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated with check (public.can_write());
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated using (public.can_write()) with check (public.can_write());
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated using (public.can_write());

-- product <-> page links
drop policy if exists product_collections_read on public.product_collections;
create policy product_collections_read on public.product_collections for select to anon, authenticated
  using (
    public.admin_ok() or (
      exists (select 1 from public.products p where p.id = product_id and p.status = 'published')
      and exists (select 1 from public.collections c where c.id = collection_id and c.visible)
    )
  );
drop policy if exists product_collections_insert on public.product_collections;
create policy product_collections_insert on public.product_collections for insert to authenticated with check (public.can_write());
drop policy if exists product_collections_delete on public.product_collections;
create policy product_collections_delete on public.product_collections for delete to authenticated using (public.can_write());

-- site settings
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists site_settings_update on public.site_settings;
create policy site_settings_update on public.site_settings for update to authenticated using (public.can_write()) with check (public.can_write());

-- audit log: admins can read, nobody can write/edit/delete (only the trigger inserts)
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated using (public.admin_ok());
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- ---------------------------------------------------------------------
-- Saving a product and its pages in one transaction.
-- security invoker = the row-level security rules above still apply inside.
-- ---------------------------------------------------------------------
create or replace function public.save_product(p jsonb, collection_ids uuid[]) returns uuid
language plpgsql volatile security invoker set search_path = public as $$
declare
  pid uuid;
  v_sizes text[] := array(select jsonb_array_elements_text(coalesce(p -> 'sizes', '[]'::jsonb)));
  v_colors text[] := array(select jsonb_array_elements_text(coalesce(p -> 'colors', '[]'::jsonb)));
  v_images text[] := array(select jsonb_array_elements_text(coalesce(p -> 'images', '[]'::jsonb)));
begin
  if not public.can_write() then
    raise exception 'Confirm your password to save changes' using errcode = '42501';
  end if;

  if nullif(p ->> 'id', '') is null then
    insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
    values (p ->> 'slug', coalesce(p ->> 'sku', ''), p ->> 'name', coalesce(p ->> 'category', 'Tees'),
            (p ->> 'price')::numeric, nullif(p ->> 'compare_at', '')::numeric, coalesce(p ->> 'description', ''),
            coalesce(p ->> 'spec', ''), v_sizes, v_colors, v_images, coalesce((p ->> 'stock')::int, 0),
            nullif(p ->> 'badge', ''), coalesce((p ->> 'is_new')::boolean, false), coalesce(p ->> 'status', 'draft'),
            coalesce((p ->> 'sort_order')::int, 0))
    returning id into pid;
  else
    update public.products set
      slug = p ->> 'slug', sku = coalesce(p ->> 'sku', ''), name = p ->> 'name', category = coalesce(p ->> 'category', 'Tees'),
      price = (p ->> 'price')::numeric, compare_at = nullif(p ->> 'compare_at', '')::numeric,
      description = coalesce(p ->> 'description', ''), spec = coalesce(p ->> 'spec', ''),
      sizes = v_sizes, colors = v_colors, images = v_images, stock = coalesce((p ->> 'stock')::int, 0),
      badge = nullif(p ->> 'badge', ''), is_new = coalesce((p ->> 'is_new')::boolean, false),
      status = coalesce(p ->> 'status', 'draft'), sort_order = coalesce((p ->> 'sort_order')::int, 0)
    where id = (p ->> 'id')::uuid
    returning id into pid;
    if pid is null then raise exception 'Product not found'; end if;
  end if;

  delete from public.product_collections where product_id = pid;
  insert into public.product_collections (product_id, collection_id)
  select pid, c from unnest(coalesce(collection_ids, '{}')) c;
  return pid;
end;
$$;
revoke all on function public.save_product(jsonb, uuid[]) from public, anon;
grant execute on function public.save_product(jsonb, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Orders. Written only by the Stripe webhook (supabase/functions/stripe-webhook), which runs
-- with the service key. The browser can't create, price or delete an order; an admin can only
-- change the fulfilment fields (status, carrier, tracking, notes), and only after confirming
-- their password like any other change.
-- Amounts are in the smallest unit of the currency the customer paid in (cents for AUD/USD).
-- ---------------------------------------------------------------------
drop view if exists public.snipcart_products;   -- left over from the earlier Snipcart version

create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.order_number_seq'),
  stripe_session_id text not null unique,
  stripe_payment_intent text unique,
  status text not null default 'paid' check (status in ('paid', 'shipped', 'refunded', 'cancelled')),
  email text not null default '',
  name text not null default '',
  phone text not null default '',
  shipping_address jsonb not null default '{}'::jsonb,
  shipping_method text not null default '',
  currency text not null,
  amount_subtotal int not null default 0,
  amount_shipping int not null default 0,
  amount_tax int not null default 0,
  amount_total int not null,
  amount_total_aud int,                 -- the same total in AUD cents, when Stripe converted it
  amount_refunded int not null default 0,
  carrier text not null default '' check (char_length(carrier) <= 40),
  tracking_number text not null default '' check (char_length(tracking_number) <= 80),
  tracking_url text check (tracking_url is null or (tracking_url ~ '^https://[^ <>"]+$' and char_length(tracking_url) <= 500)),
  notes text not null default '' check (char_length(notes) <= 2000),
  shipped_at timestamptz,
  confirmation_email_at timestamptz,
  shipping_email_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders (created_at desc);
-- Replace the first version of the tracking-link rule (its pattern was invalid in Postgres,
-- which made "Mark shipped" fail whenever a tracking link was filled in).
alter table public.orders drop constraint if exists orders_tracking_url_check;
alter table public.orders add constraint orders_tracking_url_check
  check (tracking_url is null or (tracking_url ~ '^https://[^ <>"]+$' and char_length(tracking_url) <= 500));
-- Private key for the customer's order page link (spxtr.com/order.html?o=1004&k=...).
-- 144 random bits: impossible to guess, so the link works without customer accounts.
alter table public.orders add column if not exists access_key text not null
  default encode(extensions.gen_random_bytes(18), 'hex');
-- When the order's items were put back in stock (refund or delete), so it can't happen twice.
alter table public.orders add column if not exists restocked_at timestamptz;

create table if not exists public.order_items (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  sku text not null default '',
  size text not null default '',
  quantity int not null check (quantity > 0),
  unit_price_aud numeric(10,2) not null,
  line_total int not null default 0,    -- what the customer paid for this line, in the order's currency
  image text
);
create index if not exists order_items_order_idx on public.order_items (order_id);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
drop trigger if exists orders_audit on public.orders;
create trigger orders_audit after insert or update or delete on public.orders for each row execute function public.log_change();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.orders, public.order_items from anon;
revoke insert, update, delete, truncate on public.orders, public.order_items from authenticated;
-- Admins may only touch the fulfilment columns. Amounts, customer details and items are read-only.
grant update (status, carrier, tracking_number, tracking_url, notes, shipped_at) on public.orders to authenticated;

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (public.admin_ok());
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update to authenticated using (public.can_write()) with check (public.can_write());
drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items for select to authenticated using (public.admin_ok());

-- Called by the webhook once Stripe confirms payment. Records the order and its items and takes
-- the quantities off stock, all in one transaction. Safe to call twice for the same checkout
-- (Stripe retries webhooks): the second call changes nothing.
create or replace function public.record_paid_order(o jsonb, items jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  found_order public.orders;
  new_order public.orders;
begin
  select * into found_order from public.orders where stripe_session_id = o ->> 'stripe_session_id';
  if found then
    return jsonb_build_object('created', false, 'id', found_order.id, 'number', found_order.number, 'key', found_order.access_key);
  end if;

  perform set_config('spx.actor', 'Checkout', true);

  insert into public.orders (stripe_session_id, stripe_payment_intent, email, name, phone, shipping_address,
                             shipping_method, currency, amount_subtotal, amount_shipping, amount_tax,
                             amount_total, amount_total_aud)
  values (o ->> 'stripe_session_id', nullif(o ->> 'stripe_payment_intent', ''), coalesce(o ->> 'email', ''),
          coalesce(o ->> 'name', ''), coalesce(o ->> 'phone', ''), coalesce(o -> 'shipping_address', '{}'::jsonb),
          coalesce(o ->> 'shipping_method', ''), lower(o ->> 'currency'),
          coalesce((o ->> 'amount_subtotal')::int, 0), coalesce((o ->> 'amount_shipping')::int, 0),
          coalesce((o ->> 'amount_tax')::int, 0), (o ->> 'amount_total')::int,
          nullif(o ->> 'amount_total_aud', '')::int)
  on conflict (stripe_session_id) do nothing
  returning * into new_order;

  if new_order.id is null then   -- a simultaneous retry of the same event got there first
    select * into found_order from public.orders where stripe_session_id = o ->> 'stripe_session_id';
    return jsonb_build_object('created', false, 'id', found_order.id, 'number', found_order.number, 'key', found_order.access_key);
  end if;

  insert into public.order_items (order_id, product_id, name, sku, size, quantity, unit_price_aud, line_total, image)
  select new_order.id, p.id, i ->> 'name', coalesce(i ->> 'sku', ''), coalesce(i ->> 'size', ''),
         (i ->> 'quantity')::int, (i ->> 'unit_price_aud')::numeric, coalesce((i ->> 'line_total')::int, 0),
         nullif(i ->> 'image', '')
  from jsonb_array_elements(items) i
  left join public.products p on p.id::text = i ->> 'product_id';

  update public.products p set stock = greatest(p.stock - s.qty, 0)
  from (select i ->> 'product_id' as pid, sum((i ->> 'quantity')::int) as qty
        from jsonb_array_elements(items) i group by 1) s
  where p.id::text = s.pid;

  return jsonb_build_object('created', true, 'id', new_order.id, 'number', new_order.number, 'key', new_order.access_key);
end;
$$;

-- Called by the webhook when a payment is refunded in Stripe. Stock is NOT put back
-- automatically: returned items may not be resellable, so the admin adjusts stock by hand.
create or replace function public.record_refund(payment_intent text, refunded int, fully boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform set_config('spx.actor', 'Stripe', true);
  update public.orders
     set amount_refunded = refunded,
         status = case when fully then 'refunded' else status end
   where stripe_payment_intent = payment_intent;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin: put an order's items back in stock, and delete an order.
-- Both check can_write() themselves (admin + authenticator + password confirmed in the last
-- few minutes, from this session), the same rule as every other change. Stock is only ever
-- put back once per order.
-- ---------------------------------------------------------------------
create or replace function public.admin_restock_order(order_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare done timestamptz;
begin
  if not public.can_write() then raise exception 'Confirm your password to make changes' using errcode = '42501'; end if;
  select restocked_at into done from public.orders where id = order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if done is not null then return false; end if;
  update public.products p set stock = p.stock + s.qty
  from (select product_id, sum(quantity) as qty from public.order_items
        where order_items.order_id = admin_restock_order.order_id and product_id is not null group by 1) s
  where p.id = s.product_id;
  update public.orders set restocked_at = now() where id = order_id;
  return true;
end;
$$;

create or replace function public.admin_delete_order(order_id uuid, restock boolean default false) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_write() then raise exception 'Confirm your password to make changes' using errcode = '42501'; end if;
  if restock then perform public.admin_restock_order(order_id); end if;
  delete from public.orders where id = order_id;   -- its items go with it
  if not found then raise exception 'Order not found'; end if;
end;
$$;
revoke all on function public.admin_restock_order(uuid) from public, anon;
revoke all on function public.admin_delete_order(uuid, boolean) from public, anon;
grant execute on function public.admin_restock_order(uuid) to authenticated;
grant execute on function public.admin_delete_order(uuid, boolean) to authenticated;

-- Records that an order email went out (not shown in the activity log).
create or replace function public.mark_order_email(order_id uuid, kind text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform set_config('spx.actor', 'Email', true);
  if kind = 'confirmation' then
    update public.orders set confirmation_email_at = now() where id = order_id;
  elsif kind = 'shipping' then
    update public.orders set shipping_email_at = now() where id = order_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Customer order page. The public can't read the orders table at all; these two functions
-- hand back ONE order, and only its customer-safe details (first name, city and country,
-- never the street address, email or phone), when given:
--   * the order number AND its private key (the link in the emails), or
--   * the Stripe checkout ID (only the person who just paid has it: the thank-you page)
-- ---------------------------------------------------------------------
create or replace function public.order_public_view(o public.orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'key', o.access_key, 'status', o.status, 'created_at', o.created_at,
    'first_name', split_part(coalesce(o.name, ''), ' ', 1),
    'city', o.shipping_address ->> 'city', 'state', o.shipping_address ->> 'state', 'country', o.shipping_address ->> 'country',
    'currency', o.currency, 'amount_subtotal', o.amount_subtotal, 'amount_shipping', o.amount_shipping,
    'amount_tax', o.amount_tax, 'amount_total', o.amount_total, 'amount_refunded', o.amount_refunded,
    'shipping_method', o.shipping_method, 'carrier', o.carrier, 'tracking_number', o.tracking_number,
    'tracking_url', o.tracking_url, 'shipped_at', o.shipped_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'quantity', i.quantity,
                                                           'line_total', i.line_total, 'image', i.image,
                                                           'product_id', i.product_id) order by i.id)
                       from public.order_items i where i.order_id = o.id), '[]'::jsonb));
$$;
revoke all on function public.order_public_view(public.orders) from public, anon, authenticated;

create or replace function public.order_status(order_number bigint, key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.order_public_view(o) from public.orders o
  where o.number = order_number and key is not null and length(key) >= 32 and o.access_key = key;
$$;

create or replace function public.order_by_session(session_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.order_public_view(o) from public.orders o
  where session_id ~ '^cs_(test|live)_[A-Za-z0-9]{20,}$' and o.stripe_session_id = session_id;
$$;
revoke all on function public.order_status(bigint, text) from public;
revoke all on function public.order_by_session(text) from public;
grant execute on function public.order_status(bigint, text) to anon, authenticated;
grant execute on function public.order_by_session(text) to anon, authenticated;

-- Only the server (service key) may call these. Not the public, not a logged-in admin.
revoke all on function public.record_paid_order(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_refund(text, int, boolean) from public, anon, authenticated;
revoke all on function public.mark_order_email(uuid, text) from public, anon, authenticated;
grant execute on function public.record_paid_order(jsonb, jsonb) to service_role;
grant execute on function public.record_refund(text, int, boolean) to service_role;
grant execute on function public.mark_order_email(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- Customer reviews. Submitted through the submit-review Edge Function (never straight from the
-- browser), held as 'pending' until an admin approves them. The public sees approved reviews only.
-- Admins can approve, reject, feature on the homepage or delete, but can't edit what a customer wrote.
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  featured boolean not null default false,            -- also show in the homepage "crew reports"
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  verified boolean not null default false,            -- came from a real order (order link + key)
  rating int not null check (rating between 1 and 5),
  name text not null check (char_length(name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 1000),
  photos text[] not null default '{}' check (public.valid_asset_urls(photos) and coalesce(array_length(photos, 1), 0) <= 3)
);
create index if not exists reviews_status_idx on public.reviews (status, created_at desc);
create index if not exists reviews_product_idx on public.reviews (product_id);

-- Rate limiting for the review form (hashed IP + time only). Server-only.
create table if not exists public.review_submissions (
  id bigserial primary key,
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists review_submissions_ip_idx on public.review_submissions (ip_hash, at desc);

drop trigger if exists reviews_audit on public.reviews;
create trigger reviews_audit after insert or update or delete on public.reviews for each row execute function public.log_change();

alter table public.reviews enable row level security;
alter table public.review_submissions enable row level security;
revoke all on public.review_submissions from anon, authenticated;
revoke all on public.reviews from anon, authenticated;
-- Public columns only (order_id stays private). Nobody but the server can add a review.
grant select (id, created_at, status, featured, product_id, verified, rating, name, body, photos) on public.reviews to anon, authenticated;
grant update (status, featured) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select to anon, authenticated
  using ((status = 'approved' and not public.coming_soon()) or public.admin_ok());
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update to authenticated using (public.can_write()) with check (public.can_write());
drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews for delete to authenticated using (public.can_write());

-- ---------------------------------------------------------------------
-- Everything a page needs in ONE request (pages, products with their page links, settings, reviews).
-- security invoker = the row-level security rules still apply: visitors get only published
-- products, visible pages and approved reviews; a signed-in admin gets drafts and pending reviews too.
-- One round trip instead of several keeps the site fast even when the database is slow to answer.
-- ---------------------------------------------------------------------
-- Everything the storefront needs in one request. While coming soon is on, visitors get only the
-- "coming soon" text: no products, no pages, no reviews. Admins, and anyone with the preview link,
-- see the real store.
drop function if exists public.store_data();
create or replace function public.store_data(p_key text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  shut boolean := public.coming_soon();
  adm boolean := public.admin_ok();
  settings jsonb := (select data from public.site_settings where id = 1);
begin
  -- The preview key is matched loosely on purpose: spaces, capitals and any dashes a link
  -- picked up on the way (email, messages) shouldn't stop the clients getting in.
  if shut and not adm and not (p_key is not null and btrim(p_key) <> ''
      and exists (select 1 from public.security_settings s where s.id = 1
                  and lower(replace(btrim(s.preview_key), '-', '')) = lower(replace(btrim(p_key), '-', '')))) then
    return jsonb_build_object('coming_soon', true, 'settings', jsonb_build_object(
      'comingSoon', coalesce(settings -> 'comingSoon', '{}'::jsonb),
      'theme', coalesce(settings -> 'theme', '{}'::jsonb),
      'instagram', coalesce(settings -> 'instagram', '"@spxtr"'::jsonb),
      'instagramUrl', coalesce(settings -> 'instagramUrl', '""'::jsonb)));
  end if;
  return jsonb_build_object(
    'coming_soon', shut,
    'collections', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order)
      from public.collections c where c.visible or adm), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('product_collections', coalesce((
               select jsonb_agg(jsonb_build_object('collection_id', pc.collection_id))
               from public.product_collections pc where pc.product_id = p.id), '[]'::jsonb))
             order by p.sort_order)
      from public.products p where p.status = 'published' or adm), '[]'::jsonb),
    'settings', settings,
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at, 'status', r.status, 'featured', r.featured,
                                          'product_id', r.product_id, 'verified', r.verified, 'rating', r.rating,
                                          'name', r.name, 'body', r.body, 'photos', r.photos) order by r.created_at desc)
      from (select id, created_at, status, featured, product_id, verified, rating, name, body, photos
            from public.reviews where status = 'approved' or adm order by created_at desc limit 300) r), '[]'::jsonb)
  );
end $$;
grant execute on function public.store_data(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Launch list: people who asked to be told when the store opens.
-- Only the Edge Functions (service key) and these functions touch it.
-- ---------------------------------------------------------------------
create table if not exists public.launch_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 200),
  at timestamptz not null default now(),
  ip_hash text,
  notified_at timestamptz,
  unsub_token text not null default replace(gen_random_uuid()::text, '-', '')
);
create unique index if not exists launch_signups_email_idx on public.launch_signups (lower(email));
alter table public.launch_signups enable row level security;
revoke all on public.launch_signups from anon, authenticated;

-- What the admin sees: how many are waiting, and the list itself.
create or replace function public.launch_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('email', email, 'at', at, 'notified_at', notified_at) order by at desc)
    from (select email, at, notified_at from public.launch_signups order by at desc limit 2000) x), '[]'::jsonb)
  else '[]'::jsonb end;
$$;
revoke all on function public.launch_list() from public, anon;
grant execute on function public.launch_list() to authenticated;

-- Take someone off the list (a bounced address, or they asked in person).
create or replace function public.launch_remove(addr text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_write() then raise exception 'Not allowed. Confirm your password and try again.'; end if;
  delete from public.launch_signups where lower(email) = lower(btrim(addr));
  insert into public.audit_log (user_id, email, action, entity, entity_id, summary)
  values (auth.uid(), coalesce(public.actor_name(), 'Admin'), 'delete', 'launch_signups', null, 'Removed ' || addr || ' from the launch list');
  return found;
end $$;
revoke all on function public.launch_remove(text) from public, anon;
grant execute on function public.launch_remove(text) to authenticated;

-- ---------------------------------------------------------------------
-- Image storage: public to view, only a password-confirmed admin can upload/delete.
-- Only jpg/png/webp/avif up to 8MB (no SVG — it can carry scripts).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_admin_read on storage.objects;
create policy product_images_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.admin_ok());
drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.can_write()
              and name ~ '^(products|pages)/[a-z0-9-]+\.(jpg|png|webp|avif)$');
drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.can_write());

-- ---------------------------------------------------------------------
-- Starter pages: added ONCE, the very first time this file runs on an empty database.
-- Re-running this file later never brings back pages that were deleted in the admin.
-- ---------------------------------------------------------------------
create table if not exists public.setup_done (what text primary key, at timestamptz not null default now());
alter table public.setup_done enable row level security;
revoke all on public.setup_done from anon, authenticated;

do $$
begin
  if not exists (select 1 from public.setup_done where what = 'starter_pages') then
    if not exists (select 1 from public.collections) then
      insert into public.collections (slug, name, tagline, hero_image, sort_order) values
        ('moto', 'Moto', 'Built for the pits, the track and the ride home.', 'assets/img/d-moto.jpg', 1),
        ('military', 'Military', 'Utility-first gear with a tactical edge.', 'assets/img/ruck-gear.jpg', 2),
        ('rock-climbing', 'Rock Climbing', 'Layers that move with you on the wall.', 'assets/img/d-climb.jpg', 3),
        ('bmx', 'BMX', 'Park-tested pieces that survive the slams.', 'assets/img/d-bmx.jpg', 4),
        ('snow', 'Snow', 'Warm, loud and made for the lift line.', 'assets/img/d-snow.jpg', 5)
      on conflict (slug) do nothing;
    end if;
    insert into public.setup_done (what) values ('starter_pages');
  end if;
end $$;

-- =====================================================================
-- AFTER RUNNING THIS FILE:
-- 1. Authentication -> Sign In / Providers: turn OFF "Allow new users to sign up".
-- 2. Authentication -> Users -> Add user: one login per person (email + strong password).
-- 3. Put those users on the admin list (add or change the emails as needed):
--      insert into public.admins (user_id, email)
--      select id, email from auth.users
--      where email in ('admin@spectercltv.com', 'admin@seventhboar.com')
--      on conflict (user_id) do nothing;
-- 4. They will be asked to set up an authenticator app (Google Authenticator,
--    1Password, Authy...) the first time they log in.
-- =====================================================================
