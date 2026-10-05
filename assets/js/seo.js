/* SPXTR — what search engines and link previews see.
 *
 * The site draws itself from the database after the page loads, so the useful description, the
 * right share image and the structured data can only be known at that point. Every page shell
 * carries a sensible default in its <head>; the page modules call describe() once they know what
 * they are actually showing, and it rewrites the tags in place.
 *
 * Canonical addresses always point at the folder form (/shop/, not /shop.html): both resolve on
 * GitHub Pages, and without this they would look like two copies of the same page.
 */
const SEO = (() => {
  const head = document.head;
  const SITE_NAME = 'SPXTR';

  // The site's own address, whatever it is being served from (a sub-folder on GitHub Pages
  // included), taken from the <base> each page already sets.
  const root = () => new URL(document.querySelector('base')?.href || '.', location.href).href.replace(/\/$/, '');
  const abs = u => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${root()}/${String(u).replace(/^\//, '')}`);

  // One tag of each kind: reuse it if the shell already has it, otherwise make it.
  function tag(selector, make) {
    let el = head.querySelector(selector);
    if (!el) { el = make(); head.appendChild(el); }
    return el;
  }
  const meta = (key, attr = 'name') => tag(`meta[${attr}="${key}"]`, () => {
    const el = document.createElement('meta'); el.setAttribute(attr, key); return el;
  });

  function describe({ title, description, image, path, type = 'website', noindex = false } = {}) {
    const url = abs(path ?? location.pathname.replace(/index\.html$/, '').replace(/\.html$/, '/'));
    if (title) document.title = title;
    const shown = title || document.title;

    if (description) meta('description').content = String(description).replace(/\s+/g, ' ').trim().slice(0, 300);
    tag('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }).href = url;

    // Open Graph covers Facebook, Instagram, WhatsApp, Discord, iMessage and the rest.
    meta('og:site_name', 'property').content = SITE_NAME;
    meta('og:type', 'property').content = type;
    meta('og:title', 'property').content = shown;
    meta('og:url', 'property').content = url;
    if (description) meta('og:description', 'property').content = meta('description').content;
    const card = abs(image || 'assets/brand/og-card.jpg');
    meta('og:image', 'property').content = card;
    meta('og:image:alt', 'property').content = shown;
    meta('twitter:card').content = 'summary_large_image';
    meta('twitter:title').content = shown;
    if (description) meta('twitter:description').content = meta('description').content;
    meta('twitter:image').content = card;

    // Pages that should never be indexed say so for themselves (the order pages, and the
    // application pages until the store opens).
    if (noindex) meta('robots').content = 'noindex, follow';
  }

  // Structured data. One <script> per kind, replaced rather than stacked up, so a page that
  // redraws itself doesn't end up describing its product three times.
  function jsonLd(kind, data) {
    const id = `ld-${kind}`;
    let el = document.getElementById(id);
    if (!data) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }

  // The brand itself, on the homepage.
  const organisation = ({ name = SITE_NAME, instagram = '', email = '' } = {}) => jsonLd('org', {
    '@context': 'https://schema.org', '@type': 'Organization',
    name, url: root() + '/', logo: abs('assets/brand/spxtr-wordmark.jpg'),
    ...(email ? { email } : {}),
    ...(instagram ? { sameAs: [instagram] } : {}),
  });

  // A product, with its price, whether it is in stock, and its rating if it has reviews. This is
  // what Google needs before it will show price and stars against a result.
  const product = ({ name, description, images = [], sku, price, currency = 'AUD', inStock = true, url, rating, reviews = 0 } = {}) =>
    jsonLd('product', {
      '@context': 'https://schema.org', '@type': 'Product',
      name, ...(description ? { description: String(description).slice(0, 500) } : {}),
      image: images.filter(Boolean).map(abs), ...(sku ? { sku } : {}),
      brand: { '@type': 'Brand', name: SITE_NAME },
      offers: {
        '@type': 'Offer', price: String(price), priceCurrency: currency,
        availability: `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`,
        url: abs(url || location.pathname + location.search),
      },
      ...(rating && reviews ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount: reviews } } : {}),
    });

  // Where this page sits, so results show "spxtr.com › Shop › Moto" rather than a bare address.
  const breadcrumbs = trail => jsonLd('crumbs', trail.length ? {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, path], i) => ({
      '@type': 'ListItem', position: i + 1, name, item: abs(path),
    })),
  } : null);

  return { describe, jsonLd, organisation, product, breadcrumbs, abs, root };
})();
