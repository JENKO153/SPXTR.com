# Lanny Supply Co. — storefront + admin concept

A clickable concept for a veteran-owned apparel brand founded by an ex-military veteran. It has a dark olive and coyote tan look, stencil type, and military details throughout: a service-record founder story, a give-back tally for veteran charities, and a standing military discount. Includes a full storefront plus a mock store backend, all on mock data. No build step and no dependencies.

## Run it

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. You can also double-click `index.html`, but a local server is the most reliable way to run it.

## What's included

| Page | Path | What it shows |
|---|---|---|
| Homepage | `index.html` | "Earned. Not issued." hero, motto ticker, the Armory (category grid), New Issue carousel, the founder's service record (dossier), the Mission (animated donation tally for veteran charities), Squad Favourites with tabs, Field Tested spec sheet, Field Reports (reviews) with community photos, military-discount strip, "Join the Unit" signup |
| Collection | `shop.html` | Filters (category, gender, size, price), sorting, search results (`?q=`), New In / Sale views |
| Product | `product.html?id=p-001` | SKU and spec line, colour and size selection, stock messaging, perks panel (amount going to charity, military discount), the founder's field notes, accordions, "Pairs well with" |
| Bag | slide-out drawer | Quantity controls, free-shipping progress meter, demo checkout |
| Store admin | `admin/index.html` | Dashboard (KPIs, revenue chart, top products, low stock), Orders (filter, detail panel, fulfil/refund), Products (add/edit/delete), Customers, Discounts, Settings |

**Demo loop to show the client:** add something to the bag → Checkout → open the admin → the new order is at the top of Orders. Mark it shipped. Edit a product's price or add a new product → it appears on the storefront right away.

Demo data is saved in the browser's localStorage. Use **Admin → Settings → Reset demo data** to start fresh.

## Where things live

```
assets/js/data.js    ← all mock data (products, orders, customers) + STORE config (name, currency, shipping threshold)
assets/js/store.js   ← shared storefront chrome, product cards, cart
assets/js/admin.js   ← admin views
assets/css/store.css ← storefront theme (colour + type tokens at the top)
assets/css/admin.css ← admin theme
assets/img/          ← placeholder photography (Unsplash)
```

To rebrand, edit `STORE` in `data.js`: name, founder, service details (role, years, tours), give-back %, military discount %, donation total and goal, current issue, and Instagram handle. The colour tokens are at the top of `store.css` (`--olive`, `--tan`, `--red`). The fonts are Big Shoulders Stencil Display (headings), Barlow Condensed (labels and UI), Barlow (body text) and JetBrains Mono (codes and tags). The founder photo is `assets/img/founder.jpg`, a stock placeholder.

## Going live: Snipcart checkout

The site runs in two modes, switched by one setting in `assets/js/data.js`:

- **Demo mode** (`snipcart.publicApiKey` empty): mock cart, fake checkout, and the mock admin in `/admin`.
- **Live mode** (key set): cart, checkout, payments, tax, shipping and order emails are all handled by [Snipcart](https://snipcart.com). The demo admin link disappears, and orders are managed in the Snipcart dashboard.

### Steps

1. Create a Snipcart account. Test mode is free, with no card needed.
2. Paste the **public** test API key (Dashboard → Account → API keys) into `STORE.snipcart.publicApiKey`. Set `currency` to match the store.
3. Deploy the site to a public URL (Netlify, Vercel, Cloudflare Pages or any static host). Snipcart checks prices by fetching from your domain, so it can't validate orders against `localhost`.
4. In Dashboard → Store configuration → **Domains & URLs**, set the default domain to the site's domain.
5. Connect a payment gateway (Stripe or PayPal), then set up shipping rates, taxes and the `SERVED15` discount in the dashboard.
6. Place a test order, then switch to the live key when you're ready.

### When products or prices change

Snipcart re-checks every price at checkout against `/snipcart-products.json`. After editing the catalogue in `data.js` (between the `CATALOG` markers), regenerate that file and redeploy:

```bash
python3 tools/build-snipcart-catalog.py
```

If the file is out of date, checkout fails with a price mismatch rather than charging the wrong amount.

### Emails and accounting

- **Order emails** (confirmation and invoice, shipped with tracking number, refunds, abandoned carts) are sent by Snipcart. You can edit the templates in the dashboard, and optionally send them from the brand's own domain via SendGrid.
- **Marketing emails** (the "Join the unit" signup) need a newsletter tool such as Mailchimp, Klaviyo or Kit. Point the form in `index.html` at it.
- **Xero:** use it for bookkeeping, not for customer invoices. Connect the payment gateway (Stripe or PayPal) to Xero's bank feeds, and optionally push each order into Xero automatically with Zapier/Make or a Snipcart `order.completed` webhook.
