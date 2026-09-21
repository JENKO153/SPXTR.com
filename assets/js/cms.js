/*
 * SPXTR — content + auth layer, shared by the storefront and the admin.
 *
 * Two backends with the same interface:
 *   - Supabase (when config.js has real keys): the real thing. Row-level security in
 *     supabase/schema.sql decides what anyone can read or write; this file is just a client.
 *   - Demo (placeholders still in config.js): everything lives in this browser's
 *     localStorage so the site and admin can be shown and tested before going live.
 *
 * Checkout runs through Stripe via the Edge Function supabase/functions/create-checkout;
 * paid orders are written by supabase/functions/stripe-webhook, never by the browser.
 *
 * Product shape used everywhere:
 *   { id, slug, sku, name, category, price, compare_at, description, spec, sizes[], colors[],
 *     images[], stock, badge, is_new, status, sort_order, collections: [collectionId] }
 */
(function (window) {
  const cfg = window.SPX_CONFIG;
  const configured = !cfg.supabaseUrl.startsWith('YOUR_') && !cfg.supabaseKey.startsWith('YOUR_');

  /* ---------- small shared helpers ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  // Every piece of stored text goes through this before it touches innerHTML.
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
  const clone = v => JSON.parse(JSON.stringify(v));
  // Saved settings on top of the defaults, section by section. Lists (team, reports, photos)
  // are taken as-is when saved, so deleting every rider really does leave none.
  const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
  const deepMerge = (base, over) => {
    const out = { ...base };
    for (const [k, v] of Object.entries(over || {})) out[k] = isPlain(v) && isPlain(base[k]) ? deepMerge(base[k], v) : v;
    return out;
  };
  const mergeSettings = data => deepMerge(clone(DEFAULT_SETTINGS), data || {});

  // Resize to max 1800px and re-encode as WebP. Re-encoding strips EXIF (GPS etc.) and anything
  // smuggled inside the file, and keeps photos small so the store loads fast.
  // iPhone HEIC photos work where the browser can read them (Safari); elsewhere we say so clearly.
  const isHeic = file => /^image\/hei[cf]$/.test(file.type) || (!file.type && /\.hei[cf]$/i.test(file.name || ''));
  const imageOk = file => /^image\/(jpeg|png|webp|avif)$/.test(file.type) || isHeic(file);
  async function processImage(file, maxSize = 1800, quality = 0.84) {
    if (!imageOk(file)) throw new Error('Photos must be JPG, PNG, WebP, AVIF or iPhone HEIC');
    if (file.size > 25 * 1024 * 1024) throw new Error('Photo is over 25MB');
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch {
      throw new Error(isHeic(file)
        ? `${file.name}: this browser can't open iPhone HEIC photos. Use Safari, or set your iPhone to "Most Compatible" (Settings → Camera → Formats) and re-export.`
        : `${file.name} couldn't be opened. Try saving it again as a JPG.`);
    }
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
    if (!blob) throw new Error('Could not process that photo');
    return blob;
  }

  // Reads that stall: if there's no answer after 1.5s, ask again (and a third time at 4s), then
  // take whichever reply comes first. Supabase sometimes sits on one request for several seconds
  // while an identical one straight after is instant. Only used for reads, so repeats are harmless.
  function hedged(run, waves = [1500, 4000]) {
    return new Promise((resolve, reject) => {
      let settled = false, running = 0, failures = 0;
      const attempt = () => {
        running++;
        run().then(
          value => { if (!settled) { settled = true; resolve(value); } },
          err => { if (++failures >= running && !settled) { settled = true; reject(err); } });
      };
      attempt();
      waves.forEach(ms => setTimeout(() => { if (!settled) attempt(); }, ms));
    });
  }

  const sortBy = (list, key = 'sort_order') => list.slice().sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0));

  /* =====================================================================
     Supabase backend
     ===================================================================== */
  function supabaseBackend() {
    let adminClient, publicClient;
    // Admin session lives in sessionStorage: closing the browser logs out.
    const admin = () => adminClient ||= window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // The storefront never logs in.
    const pub = () => publicClient ||= window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Row-level security refuses an update or delete by changing 0 rows, not by erroring.
    // Treat that as the refusal it is, so the admin never says "saved" when nothing was.
    const changed = (data, error, fallback) => {
      fail(error, fallback);
      if (!data?.length) throw new Error('Not saved: the database refused the change. Confirm your password and try again.');
    };
    const fail = (error, fallback) => {
      if (!error) return;
      console.error(error);
      const denied = error.code === '42501' || /row-level security|permission denied/i.test(error.message || '');
      throw new Error(denied ? 'Not allowed. Confirm your password and try again.' : fallback || error.message);
    };
    const toProduct = r => ({
      ...r, price: Number(r.price), compare_at: r.compare_at == null ? null : Number(r.compare_at),
      collections: (r.product_collections || []).map(x => x.collection_id),
    });

    // One request for everything (store_data() in schema.sql). If the database hasn't got that
    // function yet (schema.sql not re-run), fall back to three separate requests.
    async function load(client) {
      try {
        const d = await hedged(async () => {
          const { data, error } = await client.rpc('store_data');
          if (error) throw error;
          return data;
        });
        return { collections: d.collections, products: d.products.map(toProduct), settings: mergeSettings(d.settings) };
      } catch (err) {
        if (err?.code !== 'PGRST202') console.warn('store_data failed, loading the slow way', err);
      }
      // Each request retries on its own, so one stalled request doesn't hold up the others.
      const read = q => hedged(() => q().then(r => r));
      const [c, p, s] = await Promise.all([
        read(() => client.from('collections').select('*').order('sort_order')),
        read(() => client.from('products').select('*, product_collections(collection_id)').order('sort_order')),
        read(() => client.from('site_settings').select('data').eq('id', 1).maybeSingle()),
      ]);
      fail(c.error, 'Could not load pages'); fail(p.error, 'Could not load products'); fail(s.error, 'Could not load settings');
      return { collections: c.data, products: p.data.map(toProduct), settings: mergeSettings(s.data?.data) };
    }

    const bucketPath = url => {
      const marker = '/storage/v1/object/public/product-images/';
      const i = String(url).indexOf(marker);
      return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
    };

    return {
      mode: 'supabase',
      loadPublic: () => load(pub()),
      // Customer order page: one order, customer-safe fields only, by number + private key.
      async orderStatus(number, key) {
        const { data, error } = await hedged(() => pub().rpc('order_status', { order_number: number, key }).then(r => r));
        if (error) throw new Error('Could not load this order. Please try again in a moment.');
        return data; // null when the link is wrong
      },
      // Thank-you page: the order just paid for, by Stripe's checkout ID (null until the webhook lands).
      async orderBySession(sessionId) {
        const { data, error } = await pub().rpc('order_by_session', { session_id: sessionId });
        if (error) throw error;
        return data;
      },
      // Just the accent colour, for pages that don't load the store (the admin login).
      async loadAccent() {
        const { data } = await hedged(() => pub().from('site_settings').select('data').eq('id', 1).maybeSingle().then(r => r));
        return data?.data?.theme?.accent || null;
      },
      loadAdmin: () => load(admin()),

      // Sends only ids, sizes and quantities. The function looks up real prices and stock,
      // then returns the address of Stripe's hosted checkout page.
      async startCheckout(items, region) {
        let res, body;
        try {
          res = await fetch(`${cfg.supabaseUrl}/functions/v1/create-checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey },
            // return_to: the site's root address, so Stripe sends shoppers back to the right place (even in a sub-folder)
            body: JSON.stringify({ items: items.map(({ id, size, qty }) => ({ id, size, qty })), region, return_to: new URL('.', document.baseURI).href }),
          });
          body = await res.json();
        } catch {
          throw new Error('Could not reach checkout. Check your connection and try again.');
        }
        if (!res.ok) throw new Error(body?.error || 'Checkout is unavailable right now.');
        if (!/^https:\/\/checkout\.stripe\.com\//.test(body?.url || '')) throw new Error('Checkout is unavailable right now.');
        return body.url;
      },

      /* ---- auth ---- */
      async login(email, password, captchaToken) {
        const sb = admin();
        const { error } = await sb.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
        if (error) throw new Error(/captcha/i.test(error.message) ? 'Bot check failed. Reload the page and try again.' : 'Incorrect email or password.');
        return this.nextStep();
      },
      // Works out what the logged-in user still has to do: nothing, enter a code, or set up MFA.
      async nextStep() {
        const sb = admin();
        const { data: st, error } = await sb.rpc('admin_status');
        if (error || !st?.is_admin) { await sb.auth.signOut({ scope: 'local' }); return { status: 'not_admin' }; }
        const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal.currentLevel === 'aal2') return { status: 'ok' };
        if (aal.nextLevel === 'aal2') return { status: 'mfa_verify' };
        return { status: st.require_mfa ? 'mfa_enroll' : 'ok' };
      },
      async verifyMfa(code) {
        const sb = admin();
        const { data } = await sb.auth.mfa.listFactors();
        const factor = data?.totp?.[0];
        if (!factor) throw new Error('No authenticator is set up on this account.');
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) throw new Error('That code didn\'t work. Check the time on your phone and try again.');
      },
      async startMfaEnroll() {
        const sb = admin();
        const { data: list } = await sb.auth.mfa.listFactors();
        for (const f of (list?.all || []).filter(f => f.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: f.id });
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `SPXTR admin ${new Date().toISOString().slice(0, 10)}` });
        if (error) throw new Error(error.message);
        return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
      },
      async finishMfaEnroll(factorId, code) {
        const { error } = await admin().auth.mfa.challengeAndVerify({ factorId, code });
        if (error) throw new Error('That code didn\'t work. Try the newest code in your app.');
      },
      async getAdmin() {
        const sb = admin();
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return null;
        const step = await this.nextStep();
        if (step.status !== 'ok') return { needs: step.status };
        const { data: factors } = await sb.auth.mfa.listFactors();
        return { email: session.user.email, mfa: (factors?.totp || []).length > 0 };
      },
      logout: (everywhere = false) => admin().auth.signOut({ scope: everywhere ? 'global' : 'local' }),

      /* ---- password-confirmed writes ---- */
      async confirm(password) {
        const { data, error } = await admin().rpc('confirm_password', { password });
        if (error) throw new Error('Could not check your password. Try again.');
        return data;
      },
      endWrite: () => admin().rpc('end_write_grant'),

      // Start resizing a photo the moment it's picked, so Save only has to upload it.
      prepareImage: file => processImage(file),
      async uploadImage(file, folder = 'products', prepared) {
        const blob = await (prepared || processImage(file));
        const path = `${folder}/${crypto.randomUUID()}.webp`;
        const { error } = await admin().storage.from('product-images').upload(path, blob, { contentType: 'image/webp', upsert: false });
        fail(error, 'Photo upload failed');
        return admin().storage.from('product-images').getPublicUrl(path).data.publicUrl;
      },
      async removeImages(urls) {
        const paths = urls.map(bucketPath).filter(Boolean);
        if (paths.length) await admin().storage.from('product-images').remove(paths);
      },

      async saveProduct(p) {
        const { collections, product_collections, created_at, updated_at, ...row } = p;
        const { data, error } = await admin().rpc('save_product', { p: row, collection_ids: collections || [] });
        fail(error, /duplicate key.*slug/.test(error?.message) ? 'Another product already uses that web address (slug).' : undefined);
        return data;
      },
      async deleteProduct(p) {
        const { data, error } = await admin().from('products').delete().eq('id', p.id).select('id');
        changed(data, error);
        await this.removeImages(p.images || []);
      },
      async saveCollection(c) {
        const { id, created_at, updated_at, ...row } = c;
        const q = id ? admin().from('collections').update(row).eq('id', id) : admin().from('collections').insert(row);
        const { data, error } = await q.select('id');
        changed(data, error, /duplicate key.*slug/.test(error?.message) ? 'Another page already uses that web address (slug).' : undefined);
      },
      async deleteCollection(c) {
        const { data, error } = await admin().from('collections').delete().eq('id', c.id).select('id');
        changed(data, error);
      },
      async reorderCollections(ids) {
        for (const [i, id] of ids.entries()) {
          const { data, error } = await admin().from('collections').update({ sort_order: i + 1 }).eq('id', id).select('id');
          changed(data, error);
        }
      },
      async saveSettings(data) {
        const res = await admin().from('site_settings').update({ data }).eq('id', 1).select('id');
        changed(res.data, res.error);
      },
      /* ---- orders (created by the Stripe webhook; admins only fill in fulfilment) ---- */
      async loadOrders() {
        const { data, error } = await hedged(() => admin().from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(300).then(r => r));
        fail(error, 'Could not load orders');
        return data;
      },
      async saveOrder(o) {
        const row = { status: o.status, carrier: o.carrier, tracking_number: o.tracking_number, tracking_url: o.tracking_url || null, notes: o.notes, shipped_at: o.shipped_at };
        const { data, error } = await admin().from('orders').update(row).eq('id', o.id).select('id');
        fail(error);
        // An update that row-level security refuses changes 0 rows rather than erroring.
        if (!data?.length) throw new Error('Not allowed. Confirm your password and try again.');
      },
      // amount: in the smallest unit of the order's currency (cents), or null for everything left.
      async refundOrder(id, amount, restock) {
        const { data, error } = await admin().functions.invoke('refund-order', { body: { order_id: id, amount, restock } });
        if (error) {
          let msg = 'The refund could not be completed. Check Stripe before trying again.';
          try { msg = (await error.context?.json())?.error || msg; } catch { /* keep the default */ }
          throw new Error(msg);
        }
        return data;
      },
      async deleteOrder(id, restock) {
        const { error } = await admin().rpc('admin_delete_order', { order_id: id, restock: !!restock });
        fail(error, 'Could not delete that order.');
      },
      async sendShippingEmail(id) {
        const { data, error } = await admin().functions.invoke('send-shipping-email', { body: { order_id: id } });
        if (error) {
          let msg = 'The shipping email could not be sent.';
          try { msg = (await error.context?.json())?.error || msg; } catch { /* keep the default */ }
          throw new Error(msg);
        }
        return data;
      },

      async auditLog() {
        const { data, error } = await admin().from('audit_log').select('*').order('at', { ascending: false }).limit(100);
        fail(error);
        return data;
      },
    };
  }

  /* =====================================================================
     Demo backend — browser-only, for showing the site before Supabase is connected
     ===================================================================== */
  function demoBackend() {
    const DEMO = { email: 'admin@spxtr.demo', password: 'spxtr-demo' };
    const KEY = 'spx_demo_';
    const read = (k, fallback) => { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : clone(fallback); } catch { return clone(fallback); } };
    const write = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { throw new Error('Browser storage is full. Use smaller photos in demo mode.'); } };
    const session = {
      get: () => { try { return JSON.parse(sessionStorage.getItem(KEY + 'session')); } catch { return null; } },
      set: v => sessionStorage.setItem(KEY + 'session', JSON.stringify(v)),
      clear: () => sessionStorage.removeItem(KEY + 'session'),
    };
    let writeUntil = 0;

    const seedProducts = () => SEED_PRODUCTS.map(p => ({ ...p, collections: p.collections.map(slug => SEED_COLLECTIONS.find(c => c.slug === slug)?.id).filter(Boolean) }));
    const state = () => ({
      collections: sortBy(read('collections', SEED_COLLECTIONS)),
      products: sortBy(read('products', seedProducts())),
      settings: mergeSettings(read('settings', {})),
    });
    const log = (action, entity, rec) => {
      const list = read('audit', []);
      list.unshift({ id: Date.now(), at: new Date().toISOString(), email: DEMO.email, action, entity, entity_id: rec?.id, summary: rec?.name || rec?.slug || '' });
      write('audit', list.slice(0, 100));
    };
    const guard = () => { if (Date.now() > writeUntil) throw new Error('Not allowed. Confirm your password and try again.'); };
    const unique = (list, item, what) => {
      if (list.some(x => x.slug === item.slug && x.id !== item.id)) throw new Error(`Another ${what} already uses that web address (slug).`);
    };

    // A few sample orders so the Orders screen can be shown before Stripe is connected.
    function demoOrders() {
      const P = SEED_PRODUCTS;
      const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
      const item = (p, size, quantity) => ({ name: p.name, sku: p.sku, size, quantity, unit_price_aud: p.price, line_total: Math.round(p.price * quantity * 100), image: p.images[0], product_id: p.id });
      const order = (n, hours, status, who, items, extra = {}) => {
        const sub = items.reduce((a, i) => a + i.line_total, 0);
        const ship = sub >= 10000 ? 0 : 1000;
        return {
          id: `o-${n}`, number: n, status, created_at: ago(hours), updated_at: ago(hours),
          email: who.email, name: who.name, phone: who.phone, shipping_address: who.address,
          shipping_method: ship ? 'Standard shipping' : 'Free shipping', currency: 'aud',
          amount_subtotal: sub, amount_shipping: ship, amount_tax: 0, amount_total: sub + ship, amount_total_aud: sub + ship,
          amount_refunded: 0, carrier: '', tracking_number: '', tracking_url: null, notes: '', shipped_at: null,
          stripe_payment_intent: `pi_demo_${n}`, access_key: `demo${n}key0000000000000000000000000000`, order_items: items, ...extra,
        };
      };
      return [
        order(1004, 2, 'paid', { name: 'Jordan Reyes', email: 'jordan@example.com', phone: '+61 400 000 111', address: { line1: '12 Pit Lane', city: 'Newcastle', state: 'NSW', postal_code: '2300', country: 'AU' } }, [item(P[0], 'L', 1), item(P[4], 'One size', 1)]),
        order(1003, 20, 'paid', { name: 'Sam Keating', email: 'sam@example.com', phone: '+61 400 000 222', address: { line1: '4/88 Ridge Rd', city: 'Toowoomba', state: 'QLD', postal_code: '4350', country: 'AU' } }, [item(P[2], 'M', 2)]),
        order(1002, 70, 'shipped', { name: 'Alex Moreau', email: 'alex@example.com', phone: '+1 555 010 3000', address: { line1: '901 Canyon Blvd', city: 'Boulder', state: 'CO', postal_code: '80302', country: 'US' } }, [item(P[1], 'XL', 1)],
          { currency: 'usd', amount_total: 9800, amount_subtotal: 6800, amount_shipping: 3000, carrier: 'Australia Post', tracking_number: 'LP123456789AU', tracking_url: 'https://auspost.com.au/mypost/track/details/LP123456789AU', shipped_at: ago(50), shipping_email_at: ago(50) }),
        order(1001, 140, 'shipped', { name: 'Riley Chen', email: 'riley@example.com', phone: '+61 400 000 333', address: { line1: '7 Crag St', city: 'Natimuk', state: 'VIC', postal_code: '3409', country: 'AU' } }, [item(P[3], 'S', 1), item(P[5], 'M', 1)],
          { carrier: 'Australia Post', tracking_number: 'LP987654321AU', tracking_url: 'https://auspost.com.au/mypost/track/details/LP987654321AU', shipped_at: ago(120), shipping_email_at: ago(120) }),
      ];
    }

    return {
      mode: 'demo',
      demoCredentials: DEMO,
      loadPublic: async () => {
        const s = state();
        return { collections: s.collections.filter(c => c.visible), products: s.products.filter(p => p.status === 'published'), settings: s.settings };
      },
      loadAdmin: async () => state(),
      loadAccent: async () => state().settings.theme?.accent || null,
      startCheckout: async () => { throw new Error('Demo mode: Stripe is not connected yet.'); },

      async login(email, password) {
        await new Promise(r => setTimeout(r, 400));
        if (email.trim().toLowerCase() !== DEMO.email || password !== DEMO.password) throw new Error('Incorrect email or password.');
        session.set({ email: DEMO.email, at: Date.now() });
        return { status: 'ok' };
      },
      nextStep: async () => ({ status: session.get() ? 'ok' : 'not_admin' }),
      verifyMfa: async () => {}, startMfaEnroll: async () => ({}), finishMfaEnroll: async () => {},
      getAdmin: async () => (session.get() ? { email: DEMO.email, mfa: false, demo: true } : null),
      logout: async () => session.clear(),

      async confirm(password) {
        await new Promise(r => setTimeout(r, 300));
        const fails = read('fails', []).filter(t => t > Date.now() - 15 * 60e3);
        if (fails.length >= 5) return { ok: false, reason: 'locked' };
        if (password !== DEMO.password) { fails.push(Date.now()); write('fails', fails); return { ok: false, reason: 'incorrect', remaining: 5 - fails.length }; }
        writeUntil = Date.now() + 5 * 60e3;
        return { ok: true };
      },
      endWrite: async () => { writeUntil = 0; },

      prepareImage: file => processImage(file, 1200, 0.8),
      async uploadImage(file, folder, prepared) {
        guard();
        const blob = await (prepared || processImage(file, 1200, 0.8));
        return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      },
      removeImages: async () => {},

      async saveProduct(p) {
        guard();
        const s = state();
        const item = clone(p);
        if (!item.id) item.id = 'p-' + Date.now().toString(36);
        unique(s.products, item, 'product');
        const i = s.products.findIndex(x => x.id === item.id);
        i === -1 ? s.products.push(item) : (s.products[i] = item);
        write('products', s.products);
        log(i === -1 ? 'insert' : 'update', 'products', item);
        return item.id;
      },
      async deleteProduct(p) {
        guard();
        write('products', state().products.filter(x => x.id !== p.id));
        log('delete', 'products', p);
      },
      async saveCollection(c) {
        guard();
        const s = state();
        const item = clone(c);
        if (!item.id) item.id = 'c-' + Date.now().toString(36);
        unique(s.collections, item, 'page');
        const i = s.collections.findIndex(x => x.id === item.id);
        i === -1 ? s.collections.push(item) : (s.collections[i] = item);
        write('collections', s.collections);
        log(i === -1 ? 'insert' : 'update', 'collections', item);
      },
      async deleteCollection(c) {
        guard();
        const s = state();
        write('collections', s.collections.filter(x => x.id !== c.id));
        write('products', s.products.map(p => ({ ...p, collections: p.collections.filter(id => id !== c.id) })));
        log('delete', 'collections', c);
      },
      async reorderCollections(ids) {
        guard();
        const s = state();
        write('collections', s.collections.map(c => ({ ...c, sort_order: ids.indexOf(c.id) + 1 })));
        log('update', 'collections', { name: 'Page order' });
      },
      async saveSettings(data) {
        guard();
        write('settings', data);
        log('update', 'site_settings', { id: 1, name: 'Site settings' });
      },
      loadOrders: async () => read('orders', demoOrders()),
      async orderStatus(number, key) {
        const o = read('orders', demoOrders()).find(x => String(x.number) === String(number) && x.access_key === key);
        return o ? { ...o, first_name: o.name.split(' ')[0], city: o.shipping_address.city, state: o.shipping_address.state, country: o.shipping_address.country,
                     items: o.order_items.map(({ name, size, quantity, line_total, image }) => ({ name, size, quantity, line_total, image })) } : null;
      },
      orderBySession: async () => null,
      async saveOrder(o) {
        guard();
        const list = read('orders', demoOrders());
        const i = list.findIndex(x => x.id === o.id);
        if (i === -1) throw new Error('Order not found');
        const { status, carrier, tracking_number, tracking_url, notes, shipped_at } = o;
        list[i] = { ...list[i], status, carrier, tracking_number, tracking_url, notes, shipped_at, updated_at: new Date().toISOString() };
        write('orders', list);
        log('update', 'orders', { id: o.id, name: `SPX-${list[i].number}` });
      },
      sendShippingEmail: async () => ({ sent: false, reason: 'demo' }),
      async refundOrder(id, amount, restock) {
        guard();
        const list = read('orders', demoOrders());
        const o = list.find(x => x.id === id);
        if (!o) throw new Error('Order not found');
        const left = o.amount_total - o.amount_refunded;
        const amt = amount == null ? left : amount;
        if (left <= 0 || amt < 1 || amt > left) throw new Error('That refund amount is more than what\'s left to refund.');
        o.amount_refunded += amt;
        const fully = o.amount_refunded >= o.amount_total;
        if (fully) o.status = 'refunded';
        let restocked = false;
        if (restock && fully && !o.restocked_at) { o.restocked_at = new Date().toISOString(); restocked = true; }
        write('orders', list);
        log('update', 'orders', { id, name: `SPX-${o.number}` });
        return { ok: true, refunded: o.amount_refunded, fully, restocked };
      },
      async deleteOrder(id) {
        guard();
        const list = read('orders', demoOrders());
        const o = list.find(x => x.id === id);
        write('orders', list.filter(x => x.id !== id));
        log('delete', 'orders', { id, name: o ? `SPX-${o.number}` : '' });
      },
      auditLog: async () => read('audit', []),
      resetDemo() { ['collections', 'products', 'settings', 'audit', 'fails', 'orders'].forEach(k => localStorage.removeItem(KEY + k)); },
    };
  }

  const backend = configured && window.supabase ? supabaseBackend() : demoBackend();
  backend.captchaEnabled = configured && !!cfg.captcha?.siteKey;
  window.CMS = Object.assign(backend, { configured, esc, slugify, mergeSettings, imageOk });
  window.esc = esc;
})(window);
