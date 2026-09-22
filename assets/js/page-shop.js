/* SPXTR — shop / page view. ?page=<slug> shows one of the admin's pages (Moto, Military, ...). */
(async function () {
  await loadStore();
  const params = new URLSearchParams(location.search);
  const state = {
    pages: new Set(params.get('page') ? [params.get('page')] : []),
    cats: new Set(params.get('category') ? [params.get('category')] : []),
    sizes: new Set(),
    price: null,
    filter: params.get('filter'),
    q: (params.get('q') || '').toLowerCase().slice(0, 80),
    draft: null, // admin preview of an unsaved page
  };
  renderChrome(state.filter === 'new' ? 'new' : params.get('page') || 'shop');
  $('#filter-toggle').addEventListener('click', () => $('#filters').classList.toggle('open'));

  // Price bands are worked out from what's actually in the shop, in the store's currency.
  let prices = [];
  function priceBands() {
    const all = PRODUCTS.map(p => Number(p.price) || 0);
    if (!all.length) return [];
    const max = Math.max(...all);
    const steps = [25, 50, 75, 100, 150, 200, 300, 500, 1000].filter(x => x < max);
    // Up to 3 cut points spread through the range, so every band has something in it.
    const cuts = [];
    for (const x of steps) if (!cuts.length || x >= cuts[cuts.length - 1] * 1.5) cuts.push(x);
    const pick = cuts.length > 3 ? [cuts[0], cuts[Math.floor(cuts.length / 2)], cuts[cuts.length - 1]] : cuts;
    const edges = [0, ...pick, 1e9];
    return edges.slice(0, -1).map((lo, i) => {
      const hi = edges[i + 1];
      const label = lo === 0 ? `Under ${money(hi)}` : hi === 1e9 ? `${money(lo)}+` : `${money(lo)} – ${money(hi)}`;
      return [label, lo, hi];
    }).filter(([, lo, hi]) => all.some(v => v >= lo && v < hi));
  }

  // Only show filters that match what's in the shop: pages with products in them, product types
  // that are in use (in the order set in the admin), and the sizes actually stocked.
  function buildFilters() {
    const count = fn => PRODUCTS.filter(fn).length;
    const group = (sel, html) => { $(sel).innerHTML = html; $(sel).closest('.filter-group').hidden = !html; };
    group('#f-page', COLLECTIONS.map(c => [c, count(p => p.collections.includes(c.id))]).filter(([c, n]) => n || state.pages.has(c.slug))
      .map(([c, n]) => `<label class="check"><input type="checkbox" value="${esc(c.slug)}" ${state.pages.has(c.slug) ? 'checked' : ''}>${esc(c.name)}<small>${n}</small></label>`).join(''));
    const inUse = [...new Set(PRODUCTS.map(p => p.category).filter(Boolean))];
    const order = SITE.productTypes || [];
    const cats = [...order.filter(c => inUse.includes(c)), ...inUse.filter(c => !order.includes(c))];
    group('#f-cat', cats.map(c => `<label class="check"><input type="checkbox" value="${esc(c)}" ${state.cats.has(c) ? 'checked' : ''}>${esc(c)}<small>${count(p => p.category === c)}</small></label>`).join(''));
    const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL'];
    const rank = s => { const i = SIZE_ORDER.indexOf(String(s).toUpperCase()); return i >= 0 ? i : isNaN(parseFloat(s)) ? 999 : 100 + parseFloat(s); };
    const sizes = [...new Set(PRODUCTS.flatMap(p => p.sizes))].sort((a, b) => rank(a) - rank(b));
    group('#f-size', sizes.length > 1 ? sizes.map(s => `<button data-size="${esc(s)}" class="${state.sizes.has(s) ? 'on' : ''}">${esc(s)}</button>`).join('') : '');
    prices = priceBands();
    group('#f-price', prices.length > 1 ? prices.map((p, i) => `<label class="check"><input type="radio" name="price" value="${i}">${esc(p[0])}</label>`).join('') : '');
    $('#clear').closest('.filter-group').hidden = !PRODUCTS.length;
  }

  function renderHead() {
    const page = state.draft || (state.pages.size === 1 ? COLLECTIONS.find(c => c.slug === [...state.pages][0]) : null);
    const heads = { new: ['New', `${SITE.season}. Fresh off the line and rider tested.`], sale: ['Sale', 'Last few pieces from past seasons.'] };
    let title = 'Shop all', sub = 'Every piece we make. Rider tested, crash approved.';
    if (page) { title = page.name; sub = page.tagline; }
    else if (heads[state.filter]) [title, sub] = heads[state.filter];
    else if (state.cats.size === 1) { title = [...state.cats][0]; sub = 'Heavyweight, rider tested, built to take a hit.'; }
    if (state.q) { title = `“${params.get('q').slice(0, 80)}”`; sub = 'Search results'; }

    $('#title').textContent = title; $('#crumb').textContent = title; $('#subtitle').textContent = sub || '';
    $('.page-desc')?.remove();
    if (page?.description) $('#subtitle').insertAdjacentHTML('afterend', `<p class="page-desc">${esc(page.description)}</p>`);
    const bg = $('#page-bg'), img = page && safeUrl(page.hero_image);
    bg.classList.toggle('on', !!img);
    bg.style.backgroundImage = img ? `url("${img.replace(/"/g, '%22')}")` : '';
    $('#page-head').classList.toggle('page-head--hero', !!img);
    document.title = `${title.replace(/[“”]/g, '')} — ${STORE.name}`;
  }

  function render() {
    const draftId = state.draft?.id;
    const pageIds = new Set(COLLECTIONS.filter(c => state.pages.has(c.slug)).map(c => c.id));
    if (draftId) pageIds.add(draftId);
    let list = PRODUCTS.filter(p =>
      (!pageIds.size || p.collections.some(id => pageIds.has(id))) &&
      (!state.cats.size || state.cats.has(p.category)) &&
      (!state.sizes.size || p.sizes.some(s => state.sizes.has(s))) &&
      (!state.price || (p.price >= state.price[1] && p.price < state.price[2])) &&
      (state.filter !== 'new' || p.is_new) &&
      (state.filter !== 'sale' || p.compare_at) &&
      (!state.q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(state.q))
    );
    const s = $('#sort').value;
    if (s === 'low') list.sort((a, b) => a.price - b.price);
    if (s === 'high') list.sort((a, b) => b.price - a.price);
    if (s === 'new') list.sort((a, b) => b.is_new - a.is_new);
    list.sort((a, b) => (b.stock > 0) - (a.stock > 0)); // sold out sinks to the bottom
    $('#count').textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'}`;
    $('#grid').innerHTML = list.length ? list.map(productCard).join('') : `<div class="no-results"><h3 class="display" style="font-size:48px;margin:0 0 8px">Nothing here yet</h3>Try removing a filter.</div>`;
    renderHead();
  }

  $('#f-page').addEventListener('change', e => { e.target.checked ? state.pages.add(e.target.value) : state.pages.delete(e.target.value); render(); });
  $('#f-cat').addEventListener('change', e => { e.target.checked ? state.cats.add(e.target.value) : state.cats.delete(e.target.value); render(); });
  $('#f-price').addEventListener('change', e => { state.price = prices[e.target.value]; render(); });
  $('#f-size').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    b.classList.toggle('on');
    state.sizes.has(b.dataset.size) ? state.sizes.delete(b.dataset.size) : state.sizes.add(b.dataset.size);
    render();
  });
  $('#sort').addEventListener('change', render);
  $('#clear').addEventListener('click', () => {
    Object.assign(state, { price: null, filter: null, q: '' });
    [state.pages, state.cats, state.sizes].forEach(s => s.clear());
    buildFilters(); render();
  });

  buildFilters();
  render();

  // Admin -> Pages live preview: show the unsaved page header over its products
  onPreview(msg => {
    if (!msg.collection) return;
    state.draft = msg.collection;
    state.pages.clear();
    render();
  });
})();
