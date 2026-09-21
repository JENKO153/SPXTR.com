-- =====================================================================
-- SPXTR — optional starter products
-- Run this AFTER schema.sql if you want the demo catalogue in the real store
-- (22 products using the photos in assets/img/). Skip it if the client is
-- adding their own products from scratch. Safe to re-run.
-- Delete everything later with:  delete from public.products;
-- =====================================================================

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('ghost-eye-hoodie', 'SPX-H-001', 'Ghost Eye Hoodie', 'Hoodies', 95, null, 'The one everyone asks about. 500gsm heavyweight fleece with a raised puff-print eye, double-layer hood and a boxy fit.', '500GSM / puff print',
        array['S', 'M', 'L', 'XL', '2XL']::text[], array['#0A0A0A']::text[], array['assets/img/hood-eye.jpg']::text[], 48, 'Bestseller', false, 'published', 0)
on conflict (slug) do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('blank-heavyweight-hoodie', 'SPX-H-002', 'Blank Heavyweight Hoodie', 'Hoodies', 85, null, 'No loud graphics, just the heaviest blank we make with a tonal ghost on the cuff.', '500GSM / tonal logo',
        array['S', 'M', 'L', 'XL', '2XL']::text[], array['#F2F0EC', '#0A0A0A']::text[], array['assets/img/hood-white.jpg']::text[], 120, null, false, 'published', 1)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'blank-heavyweight-hoodie' and c.slug in ('rock-climbing')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('night-ride-hoodie', 'SPX-H-003', 'Night Ride Hoodie', 'Hoodies', 90, null, 'Reflective back print that lights up in headlights. Made for late sessions and cold pits.', '450GSM / reflective print',
        array['S', 'M', 'L', 'XL', '2XL']::text[], array['#0A0A0A', '#4A5238']::text[], array['assets/img/hood-night.jpg']::text[], 36, 'New', true, 'published', 2)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'night-ride-hoodie' and c.slug in ('moto')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('roost-back-print-hoodie', 'SPX-H-004', 'Roost Back-Print Hoodie', 'Hoodies', 95, null, 'Olive with a dirt-roost back hit. Oversized, ribbed hem, kangaroo pocket that fits gloves.', '500GSM / back print',
        array['S', 'M', 'L', 'XL']::text[], array['#4B5540']::text[], array['assets/img/hood-moss.jpg']::text[], 9, 'Low stock', true, 'published', 3)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'roost-back-print-hoodie' and c.slug in ('moto')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('throttle-hoodie', 'SPX-H-005', 'Throttle Hoodie', 'Hoodies', 95, null, 'Washed cobalt with chain-stitch embroidery. Built for the park, the lift line and everywhere between.', '480GSM / chain stitch',
        array['S', 'M', 'L', 'XL']::text[], array['#3E5C8A']::text[], array['assets/img/hood-blue.jpg']::text[], 22, 'New', true, 'published', 4)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'throttle-hoodie' and c.slug in ('bmx')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('full-send-back-print-tee', 'SPX-T-001', 'Full Send Back-Print Tee', 'Tees', 45, null, 'Heavyweight tee with the full-send ghost across the back. Survives mud, sweat and a thousand washes.', '280GSM / back print',
        array['S', 'M', 'L', 'XL', '2XL']::text[], array['#0A0A0A', '#F2F0EC']::text[], array['assets/img/tee-back.jpg']::text[], 88, 'Bestseller', false, 'published', 5)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'full-send-back-print-tee' and c.slug in ('moto')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('out-of-the-ordinary-tee', 'SPX-T-002', 'Out Of The Ordinary Tee', 'Tees', 48, null, 'Oversized tee with a screen-printed back graphic. Heavy cotton that holds its shape.', '260GSM / back print',
        array['S', 'M', 'L', 'XL']::text[], array['#F2F0EC']::text[], array['assets/img/tee-ordinary.jpg']::text[], 41, 'New', true, 'published', 6)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'out-of-the-ordinary-tee' and c.slug in ('bmx')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('core-ghost-tee', 'SPX-T-003', 'Core Ghost Tee', 'Tees', 40, null, 'Everyday heavyweight with the ghost mark printed on the back neck.', '260GSM / neck print',
        array['S', 'M', 'L', 'XL', '2XL']::text[], array['#F2F0EC', '#0A0A0A']::text[], array['assets/img/tee-white.jpg']::text[], 160, null, false, 'published', 7)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'core-ghost-tee' and c.slug in ('rock-climbing')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('sketch-tee', 'SPX-T-004', 'Sketch Tee', 'Tees', 45, null, 'Hand-drawn chest graphic by one of our riders. Sold out, no restock planned.', '260GSM / hand drawn',
        array['S', 'M', 'L', 'XL']::text[], array['#F2F0EC']::text[], array['assets/img/tee-scribble.jpg']::text[], 0, null, false, 'published', 8)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'sketch-tee' and c.slug in ('bmx')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('hi-vis-puffer', 'SPX-O-001', 'Hi-Vis Puffer', 'Outerwear', 250, null, 'Oversized hi-vis puffer for cold mornings on the mountain or at the track. Water-resistant shell.', '600-fill / water-resistant',
        array['XS', 'S', 'M', 'L', 'XL']::text[], array['#F2C230', '#0A0A0A']::text[], array['assets/img/puffer-hazard.jpg']::text[], 16, 'New', true, 'published', 9)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'hi-vis-puffer' and c.slug in ('snow')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('ember-puffer', 'SPX-O-002', 'Ember Puffer', 'Outerwear', 260, null, 'Boxy cropped puffer in signal orange. 700-fill recycled down and a matte ripstop shell.', '700-fill / ripstop',
        array['S', 'M', 'L', 'XL']::text[], array['#E0661B']::text[], array['assets/img/puffer-ember.jpg']::text[], 14, null, true, 'published', 10)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'ember-puffer' and c.slug in ('snow')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('blackout-down-jacket', 'SPX-O-003', 'Blackout Down Jacket', 'Outerwear', 280, 320, 'Lightweight packable down in triple black. Folds into its own pocket.', '700-fill / packable',
        array['S', 'M', 'L', 'XL']::text[], array['#0A0A0A']::text[], array['assets/img/puffer-black.jpg']::text[], 11, 'Sale', false, 'published', 11)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'blackout-down-jacket' and c.slug in ('snow')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('tactical-field-jacket', 'SPX-O-004', 'Tactical Field Jacket', 'Outerwear', 189, null, 'M-65 inspired field jacket in water-resistant nyco sateen with four bellows pockets and a hidden hood.', 'NYCO sateen / 4 pockets',
        array['S', 'M', 'L', 'XL', '2XL']::text[], array['#4A5238', '#0A0A0A']::text[], array['assets/img/jkt-m65.jpg']::text[], 23, 'New', true, 'published', 12)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'tactical-field-jacket' and c.slug in ('military')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('olive-cropped-puffer', 'SPX-O-005', 'Olive Cropped Puffer', 'Outerwear', 240, null, 'Cropped at the waist with a stand collar and a hidden hood.', '600-fill / cropped',
        array['S', 'M', 'L', 'XL']::text[], array['#5B5E43']::text[], array['assets/img/puffer-olive.jpg']::text[], 18, null, false, 'published', 13)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'olive-cropped-puffer' and c.slug in ('military')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('utility-cargo-pant', 'SPX-B-001', 'Utility Cargo Pant', 'Bottoms', 120, null, 'Relaxed ripstop cargo with eight pockets, bungee hems and a webbing belt.', 'Ripstop / 8 pockets',
        array['28', '30', '32', '34', '36']::text[], array['#5B5E43', '#0A0A0A']::text[], array['assets/img/cargo-utility.jpg']::text[], 38, 'Bestseller', false, 'published', 14)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'utility-cargo-pant' and c.slug in ('military', 'rock-climbing', 'bmx')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('moto-track-pant', 'SPX-B-002', 'Moto Track Pant', 'Bottoms', 110, null, 'Crinkle nylon with a wide leg and toggle hems. For the pits, the park and the drive home.', 'Nylon / toggle hem',
        array['S', 'M', 'L', 'XL']::text[], array['#2A2A2A']::text[], array['assets/img/pant-track.jpg']::text[], 52, null, false, 'published', 15)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'moto-track-pant' and c.slug in ('moto', 'rock-climbing')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('carpenter-cargo', 'SPX-B-003', 'Carpenter Cargo', 'Bottoms', 125, null, '12oz black canvas with a hammer loop and double knees. Sold out, back next season.', '12oz canvas / double knee',
        array['28', '30', '32', '34', '36']::text[], array['#0A0A0A']::text[], array['assets/img/cargo-black.jpg']::text[], 0, null, false, 'published', 16)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'carpenter-cargo' and c.slug in ('military')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('operator-cap', 'SPX-C-001', 'Operator Cap', 'Headwear', 34, null, 'Structured six-panel with a velcro front panel. Run the ghost patch or your own.', 'Structured / velcro panel',
        array['One size']::text[], array['#0A0A0A']::text[], array['assets/img/cap-black.jpg']::text[], 44, null, false, 'published', 17)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'operator-cap' and c.slug in ('military')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('washed-pit-cap', 'SPX-C-002', 'Washed Pit Cap', 'Headwear', 32, null, 'Pre-washed cotton twill cap with a brass buckle strap. Helmet hair, solved.', 'Washed cotton twill',
        array['One size']::text[], array['#3B3D35', '#0A0A0A']::text[], array['assets/img/cap-washed.jpg']::text[], 120, 'Bestseller', false, 'published', 18)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'washed-pit-cap' and c.slug in ('moto')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('hi-vis-beanie', 'SPX-C-003', 'Hi-Vis Beanie', 'Headwear', 35, null, 'Fisherman-fit beanie in signal orange. Easy to spot in a whiteout.', 'Acrylic / fisherman fit',
        array['One size']::text[], array['#F05A1A']::text[], array['assets/img/beanie-orange.jpg']::text[], 44, 'New', true, 'published', 19)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'hi-vis-beanie' and c.slug in ('snow', 'rock-climbing')
on conflict do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('core-beanie', 'SPX-C-004', 'Core Beanie', 'Headwear', 32, null, 'Black cuffed beanie with the ghost mark embroidered on the fold.', 'Acrylic / embroidered',
        array['One size']::text[], array['#0A0A0A', '#F2F0EC']::text[], array['assets/img/beanie-black.jpg']::text[], 130, null, false, 'published', 20)
on conflict (slug) do nothing;

insert into public.products (slug, sku, name, category, price, compare_at, description, spec, sizes, colors, images, stock, badge, is_new, status, sort_order)
values ('ruck-pack-35l', 'SPX-G-001', 'Ruck Pack 35L', 'Gear', 145, null, '35L ruck in 500D Cordura with a full MOLLE panel and a hydration sleeve. Lifetime guarantee.', '500D Cordura / MOLLE',
        array['One size']::text[], array['#4A5238', '#0A0A0A']::text[], array['assets/img/pack-ruck.jpg']::text[], 22, null, false, 'published', 21)
on conflict (slug) do nothing;
insert into public.product_collections (product_id, collection_id)
select p.id, c.id from public.products p, public.collections c
where p.slug = 'ruck-pack-35l' and c.slug in ('military', 'rock-climbing')
on conflict do nothing;
