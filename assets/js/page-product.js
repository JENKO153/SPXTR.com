/* SPXTR — product page. ?p=<slug>. In admin preview the unsaved draft is posted in. */
(async function () {
  await loadStore();
  const slug = new URLSearchParams(location.search).get('p');
  let product = PRODUCTS.find(p => p.slug === slug);
  renderChrome();

  if (PREVIEW) {
    document.body.insertAdjacentHTML('beforeend', '<div class="preview-flag">Live preview // not saved</div>');
    $('#pdp').innerHTML = '<p class="muted" style="padding:60px 0">Start filling in the product to see it here…</p>';
    $('#related-section').hidden = true;
    onPreview(msg => { if (msg.product) render(msg.product); });
    return;
  }
  if (!product) {
    $('#pdp').innerHTML = `<div style="padding:80px 0"><h1 class="display" style="font-size:64px">Not found</h1><p class="muted">That product has moved or sold out for good.</p><a class="btn" href="shop/">Shop all</a></div>`;
    $('#related-section').hidden = true;
    return;
  }
  render(product);
})();

// Rider notes: one per category, so every product page has a voice from the team.
const NOTES = {
  Tees: 'Boxy on purpose so it layers under a jersey. Size down if you want it closer to the body.',
  Hoodies: 'Lives under my riding gear from October to March. Heavy, warm, holds its shape. True to size.',
  Headwear: "Pre-washed so it's broken in from day one. Fits under a hood, and over helmet hair.",
  Outerwear: 'Tested through a full winter of early starts at the track. Size up if you layer underneath.',
  Bottoms: 'Cut with room at the knee so you can actually move in them. True to waist size.',
  Gear: 'Built to get thrown in the back of the van and keep going. Lifetime guarantee on the seams.',
};

function render(p) {
  const images = (p.images || []).map(safeUrl).filter(Boolean);
  const main = images[0] || IMG + 'hero-roost.jpg';
  const soldOut = p.stock === 0, low = p.stock > 0 && p.stock < 15;
  const pages = (p.collections || []).map(collectionById).filter(Boolean);
  const first = pages[0];
  document.title = `${p.name || 'Product'} — ${STORE.name}`;

  $('#crumbs').innerHTML = `<a href="./">Home</a> // ${first ? `<a href="shop/?page=${encodeURIComponent(first.slug)}">${esc(first.name)}</a> // ` : ''}${esc(p.name)}`;
  $('#pdp').innerHTML = `
    <div class="pdp__gallery">
      <div class="main" id="zoom"><img id="main-img" src="${esc(main)}" alt="${esc(p.name)}"><span class="corners"></span></div>
      ${images.length > 1 ? `<div class="pdp__thumbs">${images.map((u, i) => `<button class="${i ? '' : 'on'}" data-img="${esc(u)}" aria-label="Photo ${i + 1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
    </div>
    <div class="pdp__info">
      <span class="eyebrow">${esc(p.sku)}${p.sku ? ' // ' : ''}${esc(p.category)}</span>
      <h1 class="display">${esc(p.name || 'Untitled product')}</h1>
      <div class="pdp__price">${money(p.price || 0)}${p.compare_at ? `<s>${money(p.compare_at)}</s>` : ''}</div>
      ${ratingLine(p)}
      ${pages.length ? `<div class="muted" style="font:500 12px var(--mono);text-transform:uppercase;letter-spacing:.06em">Featured in: ${pages.map(c => esc(c.name)).join(' // ')}</div>` : ''}
      <p class="pdp__desc">${esc(p.description)}</p>

      ${p.colors.length ? `<div class="pdp__opt">
        <div class="pdp__opt-head"><span>Colour</span><span>${esc(p.spec)}</span></div>
        <div class="color-row">${p.colors.filter(c => /^#[0-9a-f]{6}$/i.test(c)).map((c, i) => `<button class="${i ? '' : 'on'}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}</div>
      </div>` : ''}
      <div class="pdp__opt">
        <div class="pdp__opt-head"><span id="size-label">Select size</span><a href="#">Size guide</a></div>
        <div class="size-row" id="sizes">${p.sizes.map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      </div>
      <div class="stock-note ${soldOut || low ? 'low' : ''}"><i></i>${soldOut ? 'Sold out // check back soon' : low ? `Only ${p.stock} left` : 'In stock // ships in 1–2 business days'}</div>
      <button class="btn btn--block" id="add" ${soldOut ? 'disabled style="opacity:.4;pointer-events:none"' : ''}>${soldOut ? 'Sold out' : `Add to cart // ${money(p.price || 0)}`}</button>

      <div class="perks">
        <div><b>Rider tested</b>Signed off by the SPXTR team</div>
        <div><b>30-day returns</b>Free exchanges on sizing</div>
        <div><b>Seams for life</b>Crashed it? We'll fix it</div>
        <div><b>Free shipping</b>On orders over ${money(SITE.freeShippingOver)}</div>
      </div>

      <div class="maker-note">
        <img src="${IMG}rider-mx351.jpg" alt="">
        <div><span class="hand">// Rider notes: Cody #351</span><p>${esc(NOTES[p.category] || 'Rider tested, crash approved. True to size.')}</p></div>
      </div>

      <div class="accordion">
        <details open><summary>Details</summary><p style="white-space:pre-line">${esc(p.description)}</p></details>
        <details><summary>Materials &amp; care</summary><p>${esc(p.spec || 'Heavyweight cotton')}. Wash cold, inside out. Hang dry.</p></details>
        <details><summary>Shipping &amp; returns</summary><p>Free shipping on orders over ${money(SITE.freeShippingOver)}. Free returns and exchanges within 30 days.</p></details>
      </div>
    </div>`;

  let size = p.sizes.length === 1 ? p.sizes[0] : null;
  if (size) $('#sizes button')?.classList.add('on');
  $('#sizes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#sizes button').forEach(x => x.classList.toggle('on', x === b));
    $('#sizes').classList.remove('error');
    size = b.dataset.s; $('#size-label').textContent = 'Size: ' + size;
  });
  $$('.color-row button').forEach(b => b.addEventListener('click', () => $$('.color-row button').forEach(x => x.classList.toggle('on', x === b))));
  $('.pdp__thumbs')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('.pdp__thumbs button').forEach(x => x.classList.toggle('on', x === b));
    $('#main-img').src = b.dataset.img;
  });
  $('#add').addEventListener('click', () => {
    if (!size) { $('#sizes').classList.add('error'); $('#size-label').textContent = 'Pick a size first'; return; }
    addToCart(p.id, size, 1, { open: true });
  });
  $('#zoom').addEventListener('click', () => $('#zoom').classList.toggle('zoom'));

  renderReviews(p);

  if (!PREVIEW) {
    const related = PRODUCTS.filter(x => x.id !== p.id && x.stock > 0 && x.collections.some(id => p.collections.includes(id))).slice(0, 4);
    const fill = related.length ? related : PRODUCTS.filter(x => x.id !== p.id && x.stock > 0).slice(0, 4);
    $('#related').innerHTML = fill.map(productCard).join('');
  }
}

// Star rating under the price, linking down to the reviews.
function ratingLine(p) {
  const sum = reviewSummary(approvedReviews(p.id));
  return sum ? `<a class="pdp__rating" href="#reviews">${starsHtml(sum.avg)}<span>${sum.avg.toFixed(1)} · ${sum.count} review${sum.count === 1 ? '' : 's'}</span></a>` : '';
}

function renderReviews(p) {
  const box = $('#reviews');
  if (!box) return;
  if (!p.id || PREVIEW) { box.hidden = true; return; }
  const list = approvedReviews(p.id);
  const sum = reviewSummary(list);
  box.hidden = false;
  box.innerHTML = `
    <div class="section-head">
      <div><span class="eyebrow">// Crew reports</span><h2 class="display">Reviews</h2>
        ${sum ? `<p class="rv-summary">${starsHtml(sum.avg)}<b>${sum.avg.toFixed(1)}</b> out of 5 · ${sum.count} review${sum.count === 1 ? '' : 's'}</p>` : '<p class="muted">No reviews yet. Be the first.</p>'}</div>
      <button class="btn btn--ghost" id="rv-open">Write a review</button>
    </div>
    <div class="rv-layout">
      <div class="rv-list">${list.map(r => reviewCard(r)).join('') || ''}</div>
      <div class="rv-side" id="rv-side" hidden>${reviewFormHtml('rv-form', { intro: `Reviewing ${p.name}` })}</div>
    </div>`;
  wireReviewForm($('#rv-form'), { productId: p.id });
  $('#rv-open').addEventListener('click', () => {
    const side = $('#rv-side'); side.hidden = !side.hidden;
    if (!side.hidden) side.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
