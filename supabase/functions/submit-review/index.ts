// SPXTR — accepts a customer review from the website (product page or order page).
//
// Reviews are saved as 'pending' and only appear once an admin approves them. A review sent from the
// customer's order page (with its order number + private key) is marked "Verified buyer".
// Spam protection: hidden honeypot field, 5 submissions per hour per IP, strict validation, and photos
// accepted only as real WebP images (the browser re-encodes them, which also strips location data).
//
// Deploy: supabase functions deploy submit-review --no-verify-jwt --use-api

import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, env, json, originAllowed, serviceKey, siteUrl } from '../_shared/http.ts';
import { emailConfigured, loadAccent, reviewAlertEmail, sendEmail } from '../_shared/email.ts';

const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTOS = 3, MAX_PHOTO_BYTES = 2_500_000, PER_HOUR = 5;
class Bad extends Error {}

// Plain text only: drop invisible control characters, trim, cap the length.
const clean = (v: unknown, max: number) =>
  [...String(v ?? '')].filter(ch => ch === '\n' || ch.charCodeAt(0) >= 32).join('').trim().slice(0, max);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Photos arrive already re-drawn by the customer's browser into a fresh image (only pixels survive that,
// so anything hidden in the original file is gone). WebP where the browser can, JPEG on Safari versions
// that can't make WebP. Here the server checks the file really is exactly that: a well-formed image made
// only of picture-data sections, with nothing appended after the end. Metadata (EXIF/location, comments),
// animation, unknown sections or trailing bytes are all refused.
const notImage = () => new Bad('Photos must be images.');
type Photo = { bytes: Uint8Array; type: 'image/webp' | 'image/jpeg'; ext: 'webp' | 'jpg' };

const WEBP_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP']);   // ICCP = colour profile (Chrome adds one)
function checkWebp(bytes: Uint8Array) {
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  const u32 = (at: number) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
  // "RIFF" <size> "WEBP": the declared size must account for every byte in the file.
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP' || u32(4) + 8 !== bytes.length) throw notImage();
  let at = 12, sawImage = false;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) throw notImage();
    const id = tag(at), size = u32(at + 4);
    if (!WEBP_CHUNKS.has(id)) throw new Bad('Photos must be plain images.');
    if (id === 'VP8X' && (bytes[at + 8] & 0x02)) throw new Bad('Animated images aren\'t accepted.');  // animation flag
    if (id === 'ICCP' && size > 200_000) throw new Bad('Photos must be plain images.');
    if (id === 'VP8 ' || id === 'VP8L') sawImage = true;
    at += 8 + size + (size & 1);                                        // chunks are padded to an even length
    if (at > bytes.length) throw notImage();
  }
  if (!sawImage) throw notImage();
}

// JPEG: walk every marker from start (FFD8) to end (FFD9). Allowed: JFIF header (APP0), colour profile (APP2),
// Adobe colour info (APP14), quantisation/Huffman tables, frame headers, restart interval and scan data.
// The end marker must be the very last two bytes.
const JPEG_OK = new Set([0xE0, 0xE2, 0xEE, 0xDB, 0xC4, 0xDD, 0xC0, 0xC1, 0xC2]);
function checkJpeg(bytes: Uint8Array) {
  const n = bytes.length;
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[n - 2] !== 0xFF || bytes[n - 1] !== 0xD9) throw notImage();
  let at = 2, sawFrame = false, sawScan = false;
  while (at < n) {
    if (bytes[at] !== 0xFF) throw notImage();
    const m = bytes[at + 1];
    if (m === 0xFF) { at++; continue; }                                  // fill byte
    if (m === 0xD9) { if (at + 2 !== n || !sawScan) throw notImage(); return; }
    if (at + 4 > n) throw notImage();
    const len = (bytes[at + 2] << 8) | bytes[at + 3];
    if (len < 2 || at + 2 + len > n) throw notImage();
    if (m === 0xDA) {                                                     // start of scan: skip the picture data
      if (!sawFrame) throw notImage();
      sawScan = true;
      at += 2 + len;
      while (at < n - 1 && !(bytes[at] === 0xFF && bytes[at + 1] !== 0x00 && !(bytes[at + 1] >= 0xD0 && bytes[at + 1] <= 0xD7))) at++;
      continue;
    }
    if (!JPEG_OK.has(m)) throw new Bad('Photos must be plain images.');
    if (m === 0xC0 || m === 0xC1 || m === 0xC2) sawFrame = true;
    at += 2 + len;
  }
  throw notImage();
}

function decodePhoto(dataUrl: unknown): Photo {
  const m = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw notImage();
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)); } catch { throw notImage(); }
  if (bytes.length > MAX_PHOTO_BYTES) throw new Bad('A photo is too large.');
  if (bytes.length < 30) throw notImage();
  if (m[1] === 'webp') { checkWebp(bytes); return { bytes, type: 'image/webp', ext: 'webp' }; }
  checkJpeg(bytes);
  return { bytes, type: 'image/jpeg', ext: 'jpg' };
}

Deno.serve(async req => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  if (!originAllowed(req)) return json({ error: 'Not allowed' }, 403, headers);

  const uploaded: string[] = [];
  try {
    const raw = await req.text();
    if (raw.length > 11_000_000) throw new Bad('That review is too large. Try fewer or smaller photos.');
    const b = JSON.parse(raw || '{}');
    if (b.website) return json({ ok: true }, 200, headers);            // honeypot: bots fill hidden fields

    const rating = Number(b.rating);
    const name = clean(b.name, 60), body = clean(b.body, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Bad('Pick a star rating.');
    if (name.length < 1) throw new Bad('Add your name (first name is fine).');
    if (body.length < 10) throw new Bad('Tell us a bit more (at least 10 characters).');
    const photos = Array.isArray(b.photos) ? b.photos : [];
    if (photos.length > MAX_PHOTOS) throw new Bad(`Up to ${MAX_PHOTOS} photos.`);

    // Rate limit by hashed IP
    const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const ipHash = await sha256(ip + '|' + env('SUPABASE_URL'));
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from('review_submissions').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('at', since);
    if ((count ?? 0) >= PER_HOUR) return json({ error: 'Too many reviews from here in the last hour. Please try again later.' }, 429, headers);

    // Which product, and is it a verified purchase?
    const productId: string | null = UUID.test(String(b.product_id ?? '')) ? String(b.product_id) : null;
    let orderId: string | null = null, verified = false;
    if (b.order_number && b.order_key) {
      const { data: order } = await db.from('orders').select('id, status, order_items(product_id)')
        .eq('number', Number(b.order_number)).eq('access_key', String(b.order_key)).maybeSingle();
      if (!order) throw new Bad('We couldn\'t match that order. Open the link from your order email and try again.');
      if (order.status === 'refunded' || order.status === 'cancelled') throw new Bad('Reviews can\'t be left on a refunded order.');
      if (productId && !order.order_items.some((i: { product_id: string }) => i.product_id === productId)) throw new Bad('That item isn\'t in this order.');
      orderId = order.id; verified = true;
    }
    let productName = '';
    if (productId) {
      const { data: prod } = await db.from('products').select('name, status').eq('id', productId).maybeSingle();
      if (!prod || (!verified && prod.status !== 'published')) throw new Bad('That product isn\'t available to review.');
      productName = prod.name;
    }

    // Store photos (public bucket, random names)
    for (const p of photos) {
      const photo = decodePhoto(p);
      const path = `reviews/${crypto.randomUUID()}.${photo.ext}`;
      const { error } = await db.storage.from('product-images').upload(path, photo.bytes, { contentType: photo.type, upsert: false });
      if (error) throw error;
      uploaded.push(db.storage.from('product-images').getPublicUrl(path).data.publicUrl);
    }

    const review = { product_id: productId, order_id: orderId, verified, rating, name, body, photos: uploaded, status: 'pending' };
    const { error } = await db.from('reviews').insert(review);
    if (error) throw error;
    await db.from('review_submissions').insert({ ip_hash: ipHash });

    // Let the shop know there's one to approve
    const shop = Deno.env.get('SHOP_EMAIL');
    if (shop && emailConfigured()) {
      try {
        await loadAccent(db);
        const m = reviewAlertEmail(siteUrl(), review, productName);
        await sendEmail(shop, m.subject, m.html, m.text);
      } catch (err) { console.error('Review alert email failed', err); }
    }
    return json({ ok: true }, 200, headers);
  } catch (err) {
    if (uploaded.length) {                                               // don't leave orphan photos behind
      await db.storage.from('product-images').remove(uploaded.map(u => u.split('/product-images/')[1])).catch(() => {});
    }
    if (err instanceof Bad) return json({ error: err.message }, 400, headers);
    if (err instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400, headers);
    console.error('submit-review failed', err);
    return json({ error: 'Your review couldn\'t be sent. Please try again in a minute.' }, 502, headers);
  }
});
