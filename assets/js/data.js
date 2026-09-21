/* =========================================================
   SPXTR — brand constants + seed content
   The live site reads everything from Supabase (see cms.js).
   This file is only used as: (1) the fixed brand constants,
   (2) the starting content in DEMO MODE, and (3) the default
   homepage settings before the admin has edited them.
   ========================================================= */

const STORE = Object.freeze({
  name: 'SPXTR',
  tagline: 'Built for the send.',
  est: 2021,
  currency: '$',
  email: 'admin@spectercltv.com',
  // Client's brand artwork (white on black; the site blends/masks the black away).
  brand: { wordmark: 'assets/brand/spxtr-wordmark.jpg', ghost: 'assets/brand/spxtr-ghost.jpg',
           // transparent version of the wordmark, used as the stencil for the giant footer logo
           wordmarkMask: 'assets/brand/spxtr-wordmark-mask.png' },
  categories: ['Hoodies', 'Tees', 'Outerwear', 'Bottoms', 'Headwear', 'Gear'],
  badges: ['New', 'Bestseller', 'Limited', 'Low stock', 'Sale'],
});

// Accent colours offered in Admin -> Customise. All are bright enough to read on the black
// background and to carry black text on buttons (contrast 4.5:1 or better).
const ACCENTS = [
  ['Hi-vis lime', '#D4FF1F'], ['Volt', '#F5E50A'], ['Gold', '#FFC21A'], ['Safety orange', '#FF7A1A'],
  ['Signal red', '#FF4436'], ['Hot pink', '#FF3EA5'], ['Violet', '#B57BFF'], ['Electric blue', '#3D8BFF'],
  ['Cyan', '#1FE0FF'], ['Mint', '#3DFFA2'], ['Bone white', '#F2F2EE'],
];
// Contrast against the site's near-black (#0A0A0A). Under 4.5 is too dark to read.
function accentContrast(hex) {
  const lin = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / (0.0030 + 0.05);
}
const validAccent = hex => /^#[0-9a-f]{6}$/i.test(hex || '') && accentContrast(hex) >= 4.5;

// Everything here is editable in the admin (Homepage & settings, and Team & crew).
// These are only the starting values, used before anything has been saved.
const DEFAULT_SETTINGS = {
  theme: { accent: '#D4FF1F' },  // Admin -> Customise
  season: 'Season 04',
  freeShippingOver: 100,
  instagram: '@spxtr',
  instagramUrl: '',
  announcements: ['Season 04 out now', 'Free shipping over $100', 'Rider tested. Crash approved', '30-day returns, no questions', 'Join the crew for 10% off your first order'],
  marquee: ['Send it', 'Ghost it', 'No days off', 'Crash, get up', 'Ride again'],
  hero: {
    eyebrow: 'Season 04 // Est. 2021',
    line1: 'Send it.',
    line2: 'Ghost it.',
    subtitle: "Hard-wearing apparel for moto, action sports and everything off-road. Tested by riders who crash so you don't have to.",
    cta: 'Shop Season 04',
    image: 'assets/img/hero-roost.jpg',
    // The four promises under the hero. {free} becomes the free-shipping amount.
    bar: ['Rider tested', 'Built to take a hit', 'Free shipping over {free}', '30-day returns'],
  },
  pagesSection: { eyebrow: 'Sec. 01 // Pick your page', title: 'Choose your ride', link: 'Shop everything' },
  newSection: { title: 'Fresh off the line', intro: 'New gear, rider tested before it gets to you. Some pieces are limited runs.' },
  teamSection: {
    eyebrow: 'Sec. 03 // The team', title: 'Ridden by the crew',
    intro: "Our riders test every piece before it drops. If it doesn't survive them, it doesn't get made.",
    ctaText: 'Join the team', ctaUrl: '',
  },
  bestSection: { eyebrow: 'Sec. 05 // Most wanted', title: 'Crew favourites' },
  tested: {
    show: true,
    eyebrow: 'Sec. 06 // Crash tested', title: 'Built to take a hit',
    intro: "Every piece gets ridden hard in dirt, snow and on tarmac before it's signed off. No flimsy blanks.",
    cta: 'Gear up',
    images: ['assets/img/test-blur.jpg', 'assets/img/test-tyre.jpg', 'assets/img/test-helmet.jpg'],
    specs: [
      { label: 'Fabric weight', value: '260–500 GSM heavyweight' },
      { label: 'Stitching', value: 'Triple-needle, bar-tacked stress points' },
      { label: 'Print', value: 'Puff and plastisol, crack-free' },
      { label: 'Wash test', value: '50+ cycles, pre-shrunk' },
      { label: 'Warranty', value: 'Seams guaranteed for life' },
    ],
  },
  reportsSection: { eyebrow: 'Sec. 07 // Crew reports', title: 'Worn hard' },
  teamOrders: {
    show: true, title: 'Kit out your whole crew',
    text: 'Team, club and event orders from 10 pieces. Custom colourways available.',
    ctaText: 'Team orders', ctaUrl: '',
  },
  newsletter: {
    show: true, eyebrow: 'Sec. 08 // Comms', title: 'Join the crew',
    text: 'Early access to new drops, event invites, and 10% off your first order.',
    fine: 'Unsubscribe any time. No spam, ever.',
  },
  footer: {
    tagline: 'Built for the send.',
    blurb: 'Hard-wearing apparel for riders, climbers, builders and anyone who sends it. Tested by the crew since 2021.',
    email: 'admin@spectercltv.com',
  },
  event: {
    show: true,
    name: 'SPXTR Dirt Nights',
    round: 'Round 04',
    place: 'Glen Helen Raceway, CA',
    date: '2026-10-17T18:00',
    blurb: 'A night of racing, freestyle demos and the crew. Free entry for anyone rocking SPXTR, and the first 200 through the gate get a limited event tee.',
    image: 'assets/img/event-bg.jpg',
    ctaText: 'Get tickets', ctaUrl: '',
  },
  // The crew. "product" is the web address (slug) of the piece they ride in.
  team: [
    { name: 'Cody Walker', number: '351', discipline: 'Motocross', home: 'Phoenix, AZ', statLabel: 'Podiums', statValue: '14', image: 'assets/img/rider-mx351.jpg', product: 'full-send-back-print-tee' },
    { name: 'Mia Tran', number: '07', discipline: 'Freestyle MX', home: 'Los Angeles, CA', statLabel: 'Wins', statValue: '6', image: 'assets/img/rider-field.jpg', product: 'night-ride-hoodie' },
    { name: 'Jaden Brooks', number: '22', discipline: 'Snowboard', home: 'Salt Lake, UT', statLabel: 'Comps', statValue: '21', image: 'assets/img/rider-snow.jpg', product: 'hi-vis-puffer' },
    { name: 'Zion Hayes', number: '11', discipline: 'BMX', home: 'Austin, TX', statLabel: 'Titles', statValue: '3', image: 'assets/img/rider-bmx.jpg', product: 'utility-cargo-pant' },
  ],
  reports: [
    { quote: "Wore the Ghost Eye hoodie under my gear all winter. Still looks brand new after more crashes than I'll admit to.", name: 'Cody W.', meta: 'Motocross // 16 orders', stars: 5, verified: true },
    { quote: 'The hi-vis puffer is the warmest thing I own. My whole crew spots me from the top of the lift.', name: 'Ava M.', meta: 'Snowboard // 2 orders', stars: 5, verified: true },
    { quote: 'The cargos survived a full summer of BMX park sessions. Pockets actually hold stuff when you ride.', name: 'Zion H.', meta: 'BMX // 7 orders', stars: 5, verified: true },
  ],
  ig: [
    { image: 'assets/img/ugc-wheelie.jpg', url: '' }, { image: 'assets/img/ugc-bmxpark.jpg', url: '' },
    { image: 'assets/img/ugc-snow.jpg', url: '' }, { image: 'assets/img/ugc-splash.jpg', url: '' },
    { image: 'assets/img/ugc-dust.jpg', url: '' }, { image: 'assets/img/ugc-helmet.jpg', url: '' },
  ],
};

// Starter pages (same as the seed rows in supabase/schema.sql).
const SEED_COLLECTIONS = [
  { id: 'c-moto', slug: 'moto', name: 'Moto', tagline: 'Built for the pits, the track and the ride home.', description: '', hero_image: 'assets/img/d-moto.jpg', sort_order: 1, visible: true, show_in_nav: true },
  { id: 'c-military', slug: 'military', name: 'Military', tagline: 'Utility-first gear with a tactical edge.', description: '', hero_image: 'assets/img/ruck-gear.jpg', sort_order: 2, visible: true, show_in_nav: true },
  { id: 'c-rock-climbing', slug: 'rock-climbing', name: 'Rock Climbing', tagline: 'Layers that move with you on the wall.', description: '', hero_image: 'assets/img/d-climb.jpg', sort_order: 3, visible: true, show_in_nav: true },
  { id: 'c-bmx', slug: 'bmx', name: 'BMX', tagline: 'Park-tested pieces that survive the slams.', description: '', hero_image: 'assets/img/d-bmx.jpg', sort_order: 4, visible: true, show_in_nav: true },
  { id: 'c-snow', slug: 'snow', name: 'Snow', tagline: 'Warm, loud and made for the lift line.', description: '', hero_image: 'assets/img/d-snow.jpg', sort_order: 5, visible: true, show_in_nav: true },
];

// Demo products. "collections" lists page slugs.
const SEED_PRODUCTS = [
  {"id": "p-001", "slug": "ghost-eye-hoodie", "sku": "SPX-H-001", "name": "Ghost Eye Hoodie", "category": "Hoodies", "price": 95, "compare_at": null, "description": "The one everyone asks about. 500gsm heavyweight fleece with a raised puff-print eye, double-layer hood and a boxy fit.", "spec": "500GSM / puff print", "sizes": ["S", "M", "L", "XL", "2XL"], "colors": ["#0A0A0A"], "images": ["assets/img/hood-eye.jpg"], "stock": 48, "badge": "Bestseller", "is_new": false, "status": "published", "sort_order": 0, "collections": []},
  {"id": "p-002", "slug": "blank-heavyweight-hoodie", "sku": "SPX-H-002", "name": "Blank Heavyweight Hoodie", "category": "Hoodies", "price": 85, "compare_at": null, "description": "No loud graphics, just the heaviest blank we make with a tonal ghost on the cuff.", "spec": "500GSM / tonal logo", "sizes": ["S", "M", "L", "XL", "2XL"], "colors": ["#F2F0EC", "#0A0A0A"], "images": ["assets/img/hood-white.jpg"], "stock": 120, "badge": null, "is_new": false, "status": "published", "sort_order": 1, "collections": ["rock-climbing"]},
  {"id": "p-003", "slug": "night-ride-hoodie", "sku": "SPX-H-003", "name": "Night Ride Hoodie", "category": "Hoodies", "price": 90, "compare_at": null, "description": "Reflective back print that lights up in headlights. Made for late sessions and cold pits.", "spec": "450GSM / reflective print", "sizes": ["S", "M", "L", "XL", "2XL"], "colors": ["#0A0A0A", "#4A5238"], "images": ["assets/img/hood-night.jpg"], "stock": 36, "badge": "New", "is_new": true, "status": "published", "sort_order": 2, "collections": ["moto"]},
  {"id": "p-004", "slug": "roost-back-print-hoodie", "sku": "SPX-H-004", "name": "Roost Back-Print Hoodie", "category": "Hoodies", "price": 95, "compare_at": null, "description": "Olive with a dirt-roost back hit. Oversized, ribbed hem, kangaroo pocket that fits gloves.", "spec": "500GSM / back print", "sizes": ["S", "M", "L", "XL"], "colors": ["#4B5540"], "images": ["assets/img/hood-moss.jpg"], "stock": 9, "badge": "Low stock", "is_new": true, "status": "published", "sort_order": 3, "collections": ["moto"]},
  {"id": "p-005", "slug": "throttle-hoodie", "sku": "SPX-H-005", "name": "Throttle Hoodie", "category": "Hoodies", "price": 95, "compare_at": null, "description": "Washed cobalt with chain-stitch embroidery. Built for the park, the lift line and everywhere between.", "spec": "480GSM / chain stitch", "sizes": ["S", "M", "L", "XL"], "colors": ["#3E5C8A"], "images": ["assets/img/hood-blue.jpg"], "stock": 22, "badge": "New", "is_new": true, "status": "published", "sort_order": 4, "collections": ["bmx"]},
  {"id": "p-006", "slug": "full-send-back-print-tee", "sku": "SPX-T-001", "name": "Full Send Back-Print Tee", "category": "Tees", "price": 45, "compare_at": null, "description": "Heavyweight tee with the full-send ghost across the back. Survives mud, sweat and a thousand washes.", "spec": "280GSM / back print", "sizes": ["S", "M", "L", "XL", "2XL"], "colors": ["#0A0A0A", "#F2F0EC"], "images": ["assets/img/tee-back.jpg"], "stock": 88, "badge": "Bestseller", "is_new": false, "status": "published", "sort_order": 5, "collections": ["moto"]},
  {"id": "p-007", "slug": "out-of-the-ordinary-tee", "sku": "SPX-T-002", "name": "Out Of The Ordinary Tee", "category": "Tees", "price": 48, "compare_at": null, "description": "Oversized tee with a screen-printed back graphic. Heavy cotton that holds its shape.", "spec": "260GSM / back print", "sizes": ["S", "M", "L", "XL"], "colors": ["#F2F0EC"], "images": ["assets/img/tee-ordinary.jpg"], "stock": 41, "badge": "New", "is_new": true, "status": "published", "sort_order": 6, "collections": ["bmx"]},
  {"id": "p-008", "slug": "core-ghost-tee", "sku": "SPX-T-003", "name": "Core Ghost Tee", "category": "Tees", "price": 40, "compare_at": null, "description": "Everyday heavyweight with the ghost mark printed on the back neck.", "spec": "260GSM / neck print", "sizes": ["S", "M", "L", "XL", "2XL"], "colors": ["#F2F0EC", "#0A0A0A"], "images": ["assets/img/tee-white.jpg"], "stock": 160, "badge": null, "is_new": false, "status": "published", "sort_order": 7, "collections": ["rock-climbing"]},
  {"id": "p-009", "slug": "sketch-tee", "sku": "SPX-T-004", "name": "Sketch Tee", "category": "Tees", "price": 45, "compare_at": null, "description": "Hand-drawn chest graphic by one of our riders. Sold out, no restock planned.", "spec": "260GSM / hand drawn", "sizes": ["S", "M", "L", "XL"], "colors": ["#F2F0EC"], "images": ["assets/img/tee-scribble.jpg"], "stock": 0, "badge": null, "is_new": false, "status": "published", "sort_order": 8, "collections": ["bmx"]},
  {"id": "p-010", "slug": "hi-vis-puffer", "sku": "SPX-O-001", "name": "Hi-Vis Puffer", "category": "Outerwear", "price": 250, "compare_at": null, "description": "Oversized hi-vis puffer for cold mornings on the mountain or at the track. Water-resistant shell.", "spec": "600-fill / water-resistant", "sizes": ["XS", "S", "M", "L", "XL"], "colors": ["#F2C230", "#0A0A0A"], "images": ["assets/img/puffer-hazard.jpg"], "stock": 16, "badge": "New", "is_new": true, "status": "published", "sort_order": 9, "collections": ["snow"]},
  {"id": "p-011", "slug": "ember-puffer", "sku": "SPX-O-002", "name": "Ember Puffer", "category": "Outerwear", "price": 260, "compare_at": null, "description": "Boxy cropped puffer in signal orange. 700-fill recycled down and a matte ripstop shell.", "spec": "700-fill / ripstop", "sizes": ["S", "M", "L", "XL"], "colors": ["#E0661B"], "images": ["assets/img/puffer-ember.jpg"], "stock": 14, "badge": null, "is_new": true, "status": "published", "sort_order": 10, "collections": ["snow"]},
  {"id": "p-012", "slug": "blackout-down-jacket", "sku": "SPX-O-003", "name": "Blackout Down Jacket", "category": "Outerwear", "price": 280, "compare_at": 320, "description": "Lightweight packable down in triple black. Folds into its own pocket.", "spec": "700-fill / packable", "sizes": ["S", "M", "L", "XL"], "colors": ["#0A0A0A"], "images": ["assets/img/puffer-black.jpg"], "stock": 11, "badge": "Sale", "is_new": false, "status": "published", "sort_order": 11, "collections": ["snow"]},
  {"id": "p-013", "slug": "tactical-field-jacket", "sku": "SPX-O-004", "name": "Tactical Field Jacket", "category": "Outerwear", "price": 189, "compare_at": null, "description": "M-65 inspired field jacket in water-resistant nyco sateen with four bellows pockets and a hidden hood.", "spec": "NYCO sateen / 4 pockets", "sizes": ["S", "M", "L", "XL", "2XL"], "colors": ["#4A5238", "#0A0A0A"], "images": ["assets/img/jkt-m65.jpg"], "stock": 23, "badge": "New", "is_new": true, "status": "published", "sort_order": 12, "collections": ["military"]},
  {"id": "p-014", "slug": "olive-cropped-puffer", "sku": "SPX-O-005", "name": "Olive Cropped Puffer", "category": "Outerwear", "price": 240, "compare_at": null, "description": "Cropped at the waist with a stand collar and a hidden hood.", "spec": "600-fill / cropped", "sizes": ["S", "M", "L", "XL"], "colors": ["#5B5E43"], "images": ["assets/img/puffer-olive.jpg"], "stock": 18, "badge": null, "is_new": false, "status": "published", "sort_order": 13, "collections": ["military"]},
  {"id": "p-015", "slug": "utility-cargo-pant", "sku": "SPX-B-001", "name": "Utility Cargo Pant", "category": "Bottoms", "price": 120, "compare_at": null, "description": "Relaxed ripstop cargo with eight pockets, bungee hems and a webbing belt.", "spec": "Ripstop / 8 pockets", "sizes": ["28", "30", "32", "34", "36"], "colors": ["#5B5E43", "#0A0A0A"], "images": ["assets/img/cargo-utility.jpg"], "stock": 38, "badge": "Bestseller", "is_new": false, "status": "published", "sort_order": 14, "collections": ["military", "rock-climbing", "bmx"]},
  {"id": "p-016", "slug": "moto-track-pant", "sku": "SPX-B-002", "name": "Moto Track Pant", "category": "Bottoms", "price": 110, "compare_at": null, "description": "Crinkle nylon with a wide leg and toggle hems. For the pits, the park and the drive home.", "spec": "Nylon / toggle hem", "sizes": ["S", "M", "L", "XL"], "colors": ["#2A2A2A"], "images": ["assets/img/pant-track.jpg"], "stock": 52, "badge": null, "is_new": false, "status": "published", "sort_order": 15, "collections": ["moto", "rock-climbing"]},
  {"id": "p-017", "slug": "carpenter-cargo", "sku": "SPX-B-003", "name": "Carpenter Cargo", "category": "Bottoms", "price": 125, "compare_at": null, "description": "12oz black canvas with a hammer loop and double knees. Sold out, back next season.", "spec": "12oz canvas / double knee", "sizes": ["28", "30", "32", "34", "36"], "colors": ["#0A0A0A"], "images": ["assets/img/cargo-black.jpg"], "stock": 0, "badge": null, "is_new": false, "status": "published", "sort_order": 16, "collections": ["military"]},
  {"id": "p-018", "slug": "operator-cap", "sku": "SPX-C-001", "name": "Operator Cap", "category": "Headwear", "price": 34, "compare_at": null, "description": "Structured six-panel with a velcro front panel. Run the ghost patch or your own.", "spec": "Structured / velcro panel", "sizes": ["One size"], "colors": ["#0A0A0A"], "images": ["assets/img/cap-black.jpg"], "stock": 44, "badge": null, "is_new": false, "status": "published", "sort_order": 17, "collections": ["military"]},
  {"id": "p-019", "slug": "washed-pit-cap", "sku": "SPX-C-002", "name": "Washed Pit Cap", "category": "Headwear", "price": 32, "compare_at": null, "description": "Pre-washed cotton twill cap with a brass buckle strap. Helmet hair, solved.", "spec": "Washed cotton twill", "sizes": ["One size"], "colors": ["#3B3D35", "#0A0A0A"], "images": ["assets/img/cap-washed.jpg"], "stock": 120, "badge": "Bestseller", "is_new": false, "status": "published", "sort_order": 18, "collections": ["moto"]},
  {"id": "p-020", "slug": "hi-vis-beanie", "sku": "SPX-C-003", "name": "Hi-Vis Beanie", "category": "Headwear", "price": 35, "compare_at": null, "description": "Fisherman-fit beanie in signal orange. Easy to spot in a whiteout.", "spec": "Acrylic / fisherman fit", "sizes": ["One size"], "colors": ["#F05A1A"], "images": ["assets/img/beanie-orange.jpg"], "stock": 44, "badge": "New", "is_new": true, "status": "published", "sort_order": 19, "collections": ["snow", "rock-climbing"]},
  {"id": "p-021", "slug": "core-beanie", "sku": "SPX-C-004", "name": "Core Beanie", "category": "Headwear", "price": 32, "compare_at": null, "description": "Black cuffed beanie with the ghost mark embroidered on the fold.", "spec": "Acrylic / embroidered", "sizes": ["One size"], "colors": ["#0A0A0A", "#F2F0EC"], "images": ["assets/img/beanie-black.jpg"], "stock": 130, "badge": null, "is_new": false, "status": "published", "sort_order": 20, "collections": []},
  {"id": "p-022", "slug": "ruck-pack-35l", "sku": "SPX-G-001", "name": "Ruck Pack 35L", "category": "Gear", "price": 145, "compare_at": null, "description": "35L ruck in 500D Cordura with a full MOLLE panel and a hydration sleeve. Lifetime guarantee.", "spec": "500D Cordura / MOLLE", "sizes": ["One size"], "colors": ["#4A5238", "#0A0A0A"], "images": ["assets/img/pack-ruck.jpg"], "stock": 22, "badge": null, "is_new": false, "status": "published", "sort_order": 21, "collections": ["military", "rock-climbing"]}
];
