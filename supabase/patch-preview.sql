-- SPXTR — preview link fix. Safe to run on its own, and safe to run twice.
-- 1. Sets a preview key you know, and makes sure coming soon is on.
-- 2. Replaces store_data() with a version that matches the key loosely
--    (spaces, capitals and stray dashes no longer stop it working).

update public.security_settings
   set preview_key = 'abcdef1234567890abcdef1234567890',
       coming_soon = true
 where id = 1;

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

-- What the database now holds. preview_key should be the value set above.
select coming_soon, preview_key, length(preview_key) from public.security_settings where id = 1;
