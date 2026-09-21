/* =========================================================
   Lanny Supply Co. — mock data layer
   Everything the storefront and admin read lives here.
   In production this file is replaced by API calls to the
   commerce backend (Shopify / Medusa / WooCommerce etc).
   ========================================================= */

const STORE = {
  name: 'Lanny Supply Co.',
  mark: 'LANNY',
  founder: 'Lanny',
  tagline: 'Built by a veteran. Worn by the ones who get it.',
  service: { role: 'Infantry', years: 12, tours: 3, out: 2020 },
  est: 2021,
  currentIssue: 'Issue 07',
  currency: '$',
  freeShippingOver: 100,
  giveBackPercent: 10,
  militaryDiscount: 15,
  donated: 48210,
  donationGoal: 60000,
  instagram: '@lannysupplyco',
  email: 'hq@lannysupply.co',

  // Real checkout via Snipcart. Leave publicApiKey empty to run the offline demo
  // (mock cart + mock admin). Paste the key from Snipcart's dashboard to go live.
  snipcart: {
    publicApiKey: '',
    currency: 'usd',
    version: '3.9.0',
  },
};

// true once a Snipcart key is set: real cart, real checkout, catalogue is read-only
const LIVE = !!STORE.snipcart.publicApiKey;

// SKU codes follow a military stock-number style: LSC-<category>-<number>
// The catalogue is strict JSON between the CATALOG markers so tools/build-snipcart-catalog.py
// can read it and generate snipcart-products.json (the file Snipcart checks prices against).
const DEFAULT_PRODUCTS = /*CATALOG:START*/[
  {"id": "p-001", "sku": "LSC-T-001", "name": "Earned Not Issued Tee", "category": "Tees", "gender": "Unisex", "price": 38, "img": "tee-man.jpg", "colors": ["#16170F", "#4A5238"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 142, "badge": "Bestseller", "rating": 4.9, "reviews": 612, "isNew": false, "spec": "280GSM / 100% cotton", "desc": "The one that started it all. Heavyweight 280gsm cotton, boxy cut, tan stencil print across the back. Built to survive the wash a thousand times."},
  {"id": "p-002", "sku": "LSC-T-002", "name": "Unit Seal Tee", "category": "Tees", "gender": "Unisex", "price": 36, "img": "tee-seal.jpg", "colors": ["#16170F"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 88, "badge": null, "rating": 4.8, "reviews": 244, "isNew": true, "spec": "240GSM / 100% cotton", "desc": "Blackout tee with the Lanny Supply Co. unit seal screen printed on the chest. Every shirt funds veteran mental health support."},
  {"id": "p-003", "sku": "LSC-T-003", "name": "Ruck Up Back-Print Tee", "category": "Tees", "gender": "Unisex", "price": 40, "img": "tee-back.jpg", "colors": ["#16170F", "#6B6247"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 11, "badge": "Low stock", "rating": 4.7, "reviews": 131, "isNew": true, "spec": "280GSM / 100% cotton", "desc": "Oversized back print for anyone who has carried more than their body weight up a hill and would do it again."},
  {"id": "p-004", "sku": "LSC-T-004", "name": "Olive Drab Heavyweight Tee", "category": "Tees", "gender": "Unisex", "price": 34, "img": "tee-olive.jpg", "colors": ["#4A5238", "#16170F", "#B8A67E"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 96, "badge": null, "rating": 4.8, "reviews": 305, "isNew": false, "spec": "280GSM / garment-dyed", "desc": "Plain olive drab, no logo, no nonsense. Garment-dyed so it looks broken in from day one."},
  {"id": "p-005", "sku": "LSC-T-005", "name": "Night Shift Long Sleeve", "category": "Tees", "gender": "Unisex", "price": 44, "img": "tee-ls.jpg", "colors": ["#16170F"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 54, "badge": null, "rating": 4.6, "reviews": 72, "isNew": false, "spec": "260GSM / ribbed cuffs", "desc": "Heavyweight long sleeve with ribbed cuffs and a small chest mark. For early starts and late watches."},
  {"id": "p-006", "sku": "LSC-H-001", "name": "Night Watch Hoodie", "category": "Hoodies", "gender": "Unisex", "price": 78, "img": "hood-night.jpg", "colors": ["#16170F", "#4A5238"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 63, "badge": "Bestseller", "rating": 4.9, "reviews": 418, "isNew": false, "spec": "450GSM / brushed fleece", "desc": "450gsm brushed fleece, double-lined hood, reinforced cuffs. The hoodie you will steal back from your partner."},
  {"id": "p-007", "sku": "LSC-H-002", "name": "Summit Back-Print Hoodie", "category": "Hoodies", "gender": "Unisex", "price": 84, "img": "hood-summit.jpg", "colors": ["#16170F"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 19, "badge": "Limited", "rating": 4.8, "reviews": 96, "isNew": true, "spec": "450GSM / back print", "desc": "Limited run of 300. Back print honouring the ones who went further than the rest of us."},
  {"id": "p-008", "sku": "LSC-H-003", "name": "Blackout Pullover Hoodie", "category": "Hoodies", "gender": "Unisex", "price": 74, "img": "hood-blackout.jpg", "colors": ["#16170F"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 71, "badge": null, "rating": 4.7, "reviews": 188, "isNew": false, "spec": "400GSM / tonal print", "desc": "Tonal black-on-black. Low profile, heavy weight, zero branding you can see from ten metres."},
  {"id": "p-009", "sku": "LSC-H-004", "name": "Dust-Off Hoodie", "category": "Hoodies", "gender": "Unisex", "price": 80, "img": "hood-desert.jpg", "colors": ["#16170F", "#B8A67E"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 28, "badge": null, "rating": 4.7, "reviews": 64, "isNew": true, "spec": "450GSM / sleeve print", "desc": "Sleeve and back print inspired by medevac call signs. A thank-you to every medic and aircrew."},
  {"id": "p-010", "sku": "LSC-C-001", "name": "Garrison Washed Cap", "category": "Headwear", "gender": "Unisex", "price": 32, "img": "cap-washed.jpg", "colors": ["#3B3D35", "#4A5238", "#B8A67E"], "sizes": ["One size"], "stock": 120, "badge": "Bestseller", "rating": 4.8, "reviews": 377, "isNew": false, "spec": "Washed cotton twill", "desc": "Pre-washed cotton twill dad cap with a brass buckle strap and a tonal stencil mark."},
  {"id": "p-011", "sku": "LSC-C-002", "name": "Operator Blackout Cap", "category": "Headwear", "gender": "Unisex", "price": 34, "img": "cap-black.jpg", "colors": ["#16170F"], "sizes": ["One size"], "stock": 44, "badge": null, "rating": 4.7, "reviews": 142, "isNew": false, "spec": "Structured / velcro patch panel", "desc": "Structured six-panel with a loop-velcro front panel. Run the unit seal or your own morale patch."},
  {"id": "p-012", "sku": "LSC-C-003", "name": "Field Worn Cap", "category": "Headwear", "gender": "Unisex", "price": 30, "img": "cap-worn.jpg", "colors": ["#16170F", "#4A5238"], "sizes": ["One size"], "stock": 8, "badge": "Low stock", "rating": 4.6, "reviews": 58, "isNew": true, "spec": "Unstructured / distressed", "desc": "Unstructured and distressed by hand so it looks like it has seen a deployment or two."},
  {"id": "p-013", "sku": "LSC-O-001", "name": "M-65 Field Jacket", "category": "Outerwear", "gender": "Men", "price": 189, "img": "jkt-m65.jpg", "colors": ["#4A5238", "#16170F"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 23, "badge": "New issue", "rating": 4.9, "reviews": 83, "isNew": true, "spec": "NYCO sateen / 4 pockets", "desc": "Our take on the classic M-65. Water-resistant nyco sateen, four bellows pockets, hidden hood in the collar."},
  {"id": "p-014", "sku": "LSC-O-002", "name": "Utility Overshirt", "category": "Outerwear", "gender": "Unisex", "price": 98, "img": "jkt-overshirt.jpg", "colors": ["#4A5238"], "sizes": ["S", "M", "L", "XL", "2XL"], "stock": 37, "badge": null, "rating": 4.7, "reviews": 61, "isNew": true, "spec": "10oz canvas / 2 chest pockets", "desc": "Heavy 10oz canvas overshirt in olive. Wear it as a jacket in spring, a shirt in winter."},
  {"id": "p-015", "sku": "LSC-O-003", "name": "Flight Bomber", "category": "Outerwear", "gender": "Unisex", "price": 169, "compareAt": 199, "img": "bomber.jpg", "colors": ["#A8804F", "#4A5238"], "sizes": ["S", "M", "L", "XL"], "stock": 12, "badge": "Sale", "rating": 4.8, "reviews": 49, "isNew": false, "spec": "Nylon shell / rib trims", "desc": "MA-1 style flight bomber with a utility sleeve pocket and a blaze-orange lining."},
  {"id": "p-016", "sku": "LSC-O-004", "name": "Women's Field Jacket", "category": "Outerwear", "gender": "Women", "price": 179, "img": "jkt-women.jpg", "colors": ["#6B6247", "#4A5238"], "sizes": ["XS", "S", "M", "L", "XL"], "stock": 18, "badge": null, "rating": 4.8, "reviews": 37, "isNew": true, "spec": "Cotton canvas / drawcord waist", "desc": "Cut for women from the same heavy canvas as the M-65, with a drawcord waist and a relaxed fit."},
  {"id": "p-017", "sku": "LSC-G-001", "name": "Dog Tag Set", "category": "Gear", "gender": "Unisex", "price": 28, "img": "tags-hand.jpg", "colors": ["#8C8C84", "#16170F"], "sizes": ["One size"], "stock": 210, "badge": null, "rating": 4.9, "reviews": 264, "isNew": false, "spec": "Stainless steel / custom stamp", "desc": "Stainless steel tags stamped with up to five lines of your choice, on a 24in ball chain with silencers."},
  {"id": "p-018", "sku": "LSC-G-002", "name": "Canvas Field Pack", "category": "Gear", "gender": "Unisex", "price": 120, "img": "pack-canvas.jpg", "colors": ["#B8A67E", "#4A5238"], "sizes": ["One size"], "stock": 15, "badge": null, "rating": 4.7, "reviews": 41, "isNew": true, "spec": "18oz waxed canvas / 25L", "desc": "25L waxed canvas daypack with leather straps and brass hardware. Carries a laptop and a bad attitude."},
  {"id": "p-019", "sku": "LSC-G-003", "name": "Ruck Pack 35L", "category": "Gear", "gender": "Unisex", "price": 145, "img": "pack-ruck.jpg", "colors": ["#4A5238", "#16170F"], "sizes": ["One size"], "stock": 22, "badge": null, "rating": 4.8, "reviews": 73, "isNew": false, "spec": "500D Cordura / MOLLE", "desc": "35L ruck in 500D Cordura with a full MOLLE panel, hydration sleeve and a lifetime guarantee."},
  {"id": "p-020", "sku": "LSC-G-004", "name": "Duty Selvedge Jean", "category": "Gear", "gender": "Men", "price": 128, "img": "jean-raw.jpg", "colors": ["#1E2533"], "sizes": ["30", "32", "34", "36", "38"], "stock": 31, "badge": null, "rating": 4.6, "reviews": 52, "isNew": false, "spec": "14oz selvedge denim", "desc": "Workwear jean in 14oz raw selvedge with a gusseted crotch, so you can actually move in it."}
]/*CATALOG:END*/;

const DEFAULT_CUSTOMERS = [
  { id: 'c-101', name: 'Mike Harlan', email: 'mike.h@example.com', city: 'Fayetteville', orders: 9, spent: 1284, since: '2022-03-12', tag: 'Veteran' },
  { id: 'c-102', name: 'Dana Ruiz', email: 'dana.r@example.com', city: 'San Diego', orders: 3, spent: 412, since: '2025-01-08', tag: 'Active duty' },
  { id: 'c-103', name: 'Chris Walker', email: 'chris.w@example.com', city: 'Killeen', orders: 14, spent: 2310, since: '2021-11-02', tag: 'Veteran' },
  { id: 'c-104', name: 'Jordan Reyes', email: 'jordan.r@example.com', city: 'Brooklyn', orders: 2, spent: 286, since: '2026-06-21', tag: 'Civilian' },
  { id: 'c-105', name: 'Sarah Mitchell', email: 'sarah.m@example.com', city: 'Norfolk', orders: 5, spent: 698, since: '2024-09-30', tag: 'Military family' },
  { id: 'c-106', name: 'Tom Brady-Kerr', email: 'tom.bk@example.com', city: 'Jacksonville', orders: 1, spent: 148, since: '2026-09-02', tag: 'Veteran' },
  { id: 'c-107', name: 'Andre Collins', email: 'andre.c@example.com', city: 'Colorado Springs', orders: 4, spent: 566, since: '2025-04-17', tag: 'Veteran' },
  { id: 'c-108', name: 'Rachel Price', email: 'rachel.p@example.com', city: 'Tacoma', orders: 6, spent: 731, since: '2023-12-05', tag: 'Military family' },
  { id: 'c-109', name: 'Luis Ortega', email: 'luis.o@example.com', city: 'El Paso', orders: 2, spent: 240, since: '2026-02-14', tag: 'Active duty' },
  { id: 'c-110', name: 'Kevin Doyle', email: 'kevin.d@example.com', city: 'Boston', orders: 3, spent: 302, since: '2025-08-09', tag: 'First responder' },
];

const DEFAULT_ORDERS = [
  { id: '#2148', customer: 'c-104', date: '2026-09-19T09:42', status: 'Unfulfilled', payment: 'Paid', items: [['p-013', 'M', 1], ['p-001', 'L', 2]] },
  { id: '#2147', customer: 'c-106', date: '2026-09-19T08:15', status: 'Unfulfilled', payment: 'Paid', items: [['p-006', 'XL', 1], ['p-010', 'One size', 1]] },
  { id: '#2146', customer: 'c-103', date: '2026-09-18T21:03', status: 'Shipped', payment: 'Paid', items: [['p-019', 'One size', 1], ['p-002', 'L', 1]] },
  { id: '#2145', customer: 'c-101', date: '2026-09-18T16:40', status: 'Shipped', payment: 'Paid', items: [['p-007', 'L', 1], ['p-017', 'One size', 2]] },
  { id: '#2144', customer: 'c-107', date: '2026-09-18T11:22', status: 'Delivered', payment: 'Paid', items: [['p-003', 'XL', 2]] },
  { id: '#2143', customer: 'c-109', date: '2026-09-17T19:55', status: 'Delivered', payment: 'Paid', items: [['p-014', 'M', 1], ['p-011', 'One size', 1]] },
  { id: '#2142', customer: 'c-102', date: '2026-09-17T14:10', status: 'Refunded', payment: 'Refunded', items: [['p-016', 'S', 1]] },
  { id: '#2141', customer: 'c-105', date: '2026-09-16T10:31', status: 'Delivered', payment: 'Paid', items: [['p-008', 'M', 1], ['p-004', 'M', 1]] },
  { id: '#2140', customer: 'c-108', date: '2026-09-15T18:47', status: 'Delivered', payment: 'Paid', items: [['p-015', 'L', 1]] },
  { id: '#2139', customer: 'c-110', date: '2026-09-15T09:02', status: 'Delivered', payment: 'Paid', items: [['p-009', 'L', 1], ['p-001', 'L', 1]] },
  { id: '#2138', customer: 'c-103', date: '2026-09-14T13:36', status: 'Delivered', payment: 'Paid', items: [['p-018', 'One size', 1]] },
  { id: '#2137', customer: 'c-101', date: '2026-09-13T20:14', status: 'Delivered', payment: 'Paid', items: [['p-020', '34', 1]] },
  { id: '#2136', customer: 'c-105', date: '2026-09-12T15:50', status: 'Delivered', payment: 'Paid', items: [['p-005', 'S', 2], ['p-012', 'One size', 1]] },
  { id: '#2135', customer: 'c-107', date: '2026-09-11T12:05', status: 'Delivered', payment: 'Paid', items: [['p-006', 'L', 1]] },
];

// 30 days of revenue for the dashboard chart (deterministic, so it looks the same every load)
const DAILY_REVENUE = (() => {
  const out = [];
  const end = new Date('2026-09-19');
  let seed = 7;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i);
    const weekend = [0, 6].includes(d.getDay()) ? 1.35 : 1;
    const trend = 1 + (29 - i) * 0.018;
    out.push({ date: d.toISOString().slice(0, 10), revenue: Math.round((1400 + rand() * 1500) * weekend * trend), orders: Math.round((22 + rand() * 18) * weekend * trend) });
  }
  return out;
})();

/* ---------- tiny persistence layer (localStorage) ----------
   The admin writes here; the storefront reads the same keys,
   so edits in /admin show up on the site immediately. */
const DB = {
  _get(key, fallback) {
    try { const v = localStorage.getItem('lsc_' + key); return v ? JSON.parse(v) : structuredClone(fallback); }
    catch { return structuredClone(fallback); }
  },
  _set(key, value) { try { localStorage.setItem('lsc_' + key, JSON.stringify(value)); } catch {} },
  // In live mode prices must match snipcart-products.json, so browser-side edits from the demo admin are ignored.
  products() { return LIVE ? structuredClone(DEFAULT_PRODUCTS) : this._get('products', DEFAULT_PRODUCTS); },
  saveProducts(list) { this._set('products', list); },
  orders() { return this._get('orders', DEFAULT_ORDERS); },
  saveOrders(list) { this._set('orders', list); },
  customers() { return DEFAULT_CUSTOMERS; },
  cart() { return this._get('cart', []); },
  saveCart(c) { this._set('cart', c); },
  reset() { ['products', 'orders', 'cart'].forEach(k => { try { localStorage.removeItem('lsc_' + k); } catch {} }); },
};

const money = n => STORE.currency + Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
