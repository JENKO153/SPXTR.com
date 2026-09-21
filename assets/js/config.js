/*
 * SPXTR — site configuration. Loaded first on every page.
 *
 * SETUP: create a Supabase project, run supabase/schema.sql in its SQL editor,
 * then replace the two placeholders below with that project's URL and its
 * PUBLIC key — either the new publishable key (sb_publishable_...) or the older
 * anon key (a long string starting with eyJ). Both are safe to expose here: the
 * row-level security rules in schema.sql are what actually protect the data.
 * NEVER put the secret key (sb_secret_... / service_role) in this website.
 * Full walkthrough: SETUP.md
 *
 * While the placeholders are still here the site runs in DEMO MODE: seed data,
 * a browser-only admin, and a demo password shown on the login page.
 */
window.SPX_CONFIG = Object.freeze({
  supabaseUrl: 'https://mjjqsjzcquvxnmlfwitf.supabase.co',
  supabaseKey: 'sb_publishable_T67-HXTCl_dsjK0vos9Nog_9qUQ6WhE',

  // Real checkout through Stripe, via the Supabase Edge Functions in supabase/functions.
  // Leave enabled: false until those are deployed (SETUP.md Part 2): the cart then runs as a demo.
  // testMode only changes which Stripe dashboard the admin's "View in Stripe" links open.
  stripe: { enabled: true, testMode: true },

  // Optional bot protection on the admin login (recommended once live).
  // Turn on Captcha in Supabase: Authentication -> Attack Protection, choose Turnstile,
  // paste Cloudflare's SECRET key there, and put the SITE key here. See SECURITY.md.
  captcha: { provider: 'turnstile', siteKey: '' },

  // Admin is logged out after this many minutes without activity.
  adminIdleMinutes: 20,
});
