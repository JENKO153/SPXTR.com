// SPXTR — starts a Stripe Checkout session for the visitor's cart.
//
// The browser sends only product ids, sizes and quantities. Names, prices and stock are read
// from the database here, so nothing the visitor changes in their browser can alter a price.
// Card details go straight to Stripe's hosted page and never touch this site.
//
// Deploy: supabase functions deploy create-checkout --no-verify-jwt
// (Visitors aren't logged in, so there is no user token to verify.)

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, env, json, originAllowed, returnBase, serviceKey, siteUrl } from '../_shared/http.ts';

const stripe = new Stripe(env('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });

const MAX_LINES = 20;
const MAX_QTY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cents = (name: string, fallback: number) => {
  const n = Number(Deno.env.get(name));
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

// Shipping. Flat rates in AUD cents; override with secrets if the prices change.
const SHIP_AU = cents('SHIPPING_AU_CENTS', 1000);        // A$10 standard within Australia
const SHIP_INTL = cents('SHIPPING_INTL_CENTS', 3000);    // A$30 international
const INTL_COUNTRIES = (Deno.env.get('INTL_COUNTRIES') ??
  'NZ,US,CA,GB,IE,DE,FR,NL,BE,AT,CH,SE,NO,DK,FI,ES,PT,IT,JP,SG,HK,AE')
  .split(',').map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c) && c !== 'AU');
// GST via Stripe Tax. Only switch on once registered for GST and Stripe Tax is set up.
// Prices on the site already include GST, so tax is "inclusive".
const STRIPE_TAX = Deno.env.get('STRIPE_TAX') === 'true';

type Line = { id: string; size: string; qty: number };
class BadRequest extends Error {}

function readCart(body: unknown): { lines: Line[]; region: 'au' | 'intl' } {
  const b = body as { items?: unknown; region?: unknown };
  if (!Array.isArray(b?.items) || b.items.length === 0) throw new BadRequest('Your cart is empty.');
  if (b.items.length > MAX_LINES) throw new BadRequest(`Please check out ${MAX_LINES} items or fewer at a time.`);
  const lines = b.items.map((i: any) => ({ id: String(i?.id ?? ''), size: String(i?.size ?? ''), qty: Number(i?.qty) }));
  for (const l of lines) {
    if (!UUID.test(l.id) || l.size.length < 1 || l.size.length > 12 || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) {
      throw new BadRequest('Something in your cart is out of date. Please remove it and add it again.');
    }
  }
  return { lines, region: b.region === 'intl' ? 'intl' : 'au' };
}

Deno.serve(async req => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!originAllowed(req)) return json({ error: 'Not allowed' }, 403, headers);

  try {
    const raw = await req.text();
    if (raw.length > 10_000) throw new BadRequest('Your cart is too large.');
    const parsed = JSON.parse(raw || '{}');
    const { lines, region } = readCart(parsed);

    // Current, published products only. Drafts and deleted products can't be bought.
    const ids = [...new Set(lines.map(l => l.id))];
    const [{ data: products, error }, { data: settings }] = await Promise.all([
      db.from('products').select('id, name, sku, price, sizes, stock, images').eq('status', 'published').in('id', ids),
      db.from('site_settings').select('data').eq('id', 1).maybeSingle(),
    ]);
    if (error) throw error;
    const byId = new Map((products ?? []).map(p => [p.id, p]));

    // Stock is counted per product, across all sizes.
    const wanted = new Map<string, number>();
    for (const l of lines) {
      const p = byId.get(l.id);
      if (!p) throw new BadRequest('An item in your cart is no longer available. Please remove it and try again.');
      if (!p.sizes.includes(l.size)) throw new BadRequest(`${p.name} is no longer available in ${l.size}.`);
      wanted.set(l.id, (wanted.get(l.id) ?? 0) + l.qty);
    }
    for (const [id, qty] of wanted) {
      const p = byId.get(id)!;
      if (p.stock <= 0) throw new BadRequest(`${p.name} has just sold out. Please remove it from your cart.`);
      if (qty > p.stock) throw new BadRequest(`Only ${p.stock} of ${p.name} left. Please lower the quantity.`);
    }

    const site = siteUrl();
    const back = returnBase(req, parsed.return_to); // the shop's own folder, on an allowed origin
    const absolute = (u: string) => (u.startsWith('https://') ? u : `${site}/${u.replace(/^\//, '')}`);
    const taxBehavior = STRIPE_TAX ? { tax_behavior: 'inclusive' as const } : {};

    let subtotal = 0;
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = lines.map(l => {
      const p = byId.get(l.id)!;
      const unit = Math.round(Number(p.price) * 100);
      subtotal += unit * l.qty;
      return {
        quantity: l.qty,
        price_data: {
          currency: 'aud',
          unit_amount: unit,
          ...taxBehavior,
          product_data: {
            name: l.size === 'One size' ? p.name : `${p.name} — ${l.size}`,
            images: (p.images ?? []).slice(0, 1).map(absolute),
            // The webhook reads these back to record the order and reduce stock.
            metadata: { product_id: p.id, name: p.name, size: l.size, sku: p.sku ?? '', unit_price_aud: Number(p.price).toFixed(2) },
          },
        },
      };
    });

    const freeOver = Math.round(Number(settings?.data?.freeShippingOver ?? 100) * 100);
    const rate = (name: string, amount: number, min: number, max: number): Stripe.Checkout.SessionCreateParams.ShippingOption => ({
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: name,
        fixed_amount: { amount, currency: 'aud' },
        delivery_estimate: { minimum: { unit: 'business_day', value: min }, maximum: { unit: 'business_day', value: max } },
        ...taxBehavior,
      },
    });
    const shipping_options = region === 'intl'
      ? [rate('International shipping', SHIP_INTL, 7, 21)]
      : [subtotal >= freeOver ? rate('Free shipping', 0, 2, 7) : rate('Standard shipping', SHIP_AU, 2, 7)];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_address_collection: { allowed_countries: (region === 'intl' ? INTL_COUNTRIES : ['AU']) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] },
      shipping_options,
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      automatic_tax: { enabled: STRIPE_TAX },
      // Checkout links go stale after an hour, so a cart can't sit on sold-out stock for a day.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      // Back to whichever allowed address they came from (the live site, or localhost while testing).
      success_url: `${back}/order-complete/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${back}/shop/?checkout=cancelled`,
      metadata: { source: 'spxtr-site', region },
    });

    return json({ url: session.url }, 200, headers);
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400, headers);
    if (err instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400, headers);
    console.error('create-checkout failed', err);
    return json({ error: 'Checkout is unavailable right now. Please try again in a minute.' }, 502, headers);
  }
});
