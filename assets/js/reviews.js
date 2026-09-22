/* SPXTR — customer reviews: display and the review form (product page + order page).
   Reviews are sent to the server as "pending" and only appear on the site once an admin approves
   them. Photos are re-drawn in the browser into a fresh WebP before sending, which drops anything
   hidden in the original file (and the phone's location data). */

const STAR_PATH = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z';
const starSvg = on => `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
function starsHtml(rating, label = true) {
  const n = Math.round(Number(rating) || 0);
  return `<span class="rv-stars" ${label ? `role="img" aria-label="${n} out of 5 stars"` : ''}>${[1, 2, 3, 4, 5].map(i => starSvg(i <= n)).join('')}</span>`;
}

const approvedReviews = productId => REVIEWS.filter(r => r.status === 'approved' && (!productId || r.product_id === productId));
function reviewSummary(list) {
  if (!list.length) return null;
  const avg = list.reduce((a, r) => a + r.rating, 0) / list.length;
  return { avg, count: list.length };
}
const reviewDate = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

function reviewCard(r, { productName = '' } = {}) {
  const photos = (r.photos || []).map(safeUrl).filter(Boolean);
  return `
    <article class="rv-card">
      <div class="rv-card__top">${starsHtml(r.rating)}${r.verified ? '<span class="verified">✔ Verified buyer</span>' : ''}</div>
      <p class="rv-card__body">${esc(r.body)}</p>
      ${photos.length ? `<div class="rv-card__photos">${photos.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="Photo from ${esc(r.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
      <footer><b>${esc(r.name)}</b><small>${productName ? `${esc(productName)} · ` : ''}${reviewDate(r.created_at)}</small></footer>
    </article>`;
}

// ---------------- the form ----------------
function reviewFormHtml(id, { title = 'Write a review', intro = '' } = {}) {
  return `
    <form class="rv-form" id="${id}" novalidate>
      <h3>${esc(title)}</h3>
      ${intro ? `<p class="muted">${esc(intro)}</p>` : ''}
      <div class="rv-form__rate" role="radiogroup" aria-label="Your rating">
        ${[1, 2, 3, 4, 5].map(i => `<button type="button" data-rate="${i}" role="radio" aria-checked="false" aria-label="${i} star${i > 1 ? 's' : ''}">${starSvg(false)}</button>`).join('')}
        <span class="rv-form__rate-label">Tap to rate</span>
      </div>
      <label>Your name<input name="name" maxlength="60" autocomplete="given-name" placeholder="First name is fine"></label>
      <label>Your review<textarea name="body" maxlength="1000" rows="4" placeholder="Fit, feel, how it's held up…"></textarea></label>
      <div class="rv-form__photos">
        <div class="rv-form__thumbs"></div>
        <label class="rv-form__add"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple hidden>
          <span>+ Add photos</span><small>Up to 3</small></label>
      </div>
      <input name="website" class="rv-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="rv-form__error" role="alert" hidden></p>
      <button type="submit" class="btn">Send review</button>
      <p class="rv-form__fine">Reviews appear once the SPXTR crew has approved them.</p>
    </form>`;
}

// ctx: { productId, orderNumber, orderKey }
function wireReviewForm(form, ctx) {
  let rating = 0;
  const photos = [];                                   // { file, preview, ready: Promise<Blob> }
  const err = msg => { const e = form.querySelector('.rv-form__error'); e.textContent = msg || ''; e.hidden = !msg; };
  const labels = ['Tap to rate', 'Not for me', 'Could be better', 'Solid', 'Really good', 'Love it'];

  form.querySelector('.rv-form__rate').addEventListener('click', e => {
    const b = e.target.closest('[data-rate]'); if (!b) return;
    rating = +b.dataset.rate;
    form.querySelectorAll('[data-rate]').forEach(x => {
      const on = +x.dataset.rate <= rating;
      x.querySelector('svg').classList.toggle('on', on);
      x.setAttribute('aria-checked', String(+x.dataset.rate === rating));
    });
    form.querySelector('.rv-form__rate-label').textContent = labels[rating];
    err('');
  });

  const drawThumbs = () => {
    form.querySelector('.rv-form__thumbs').innerHTML = photos.map((p, i) =>
      `<span class="rv-thumb"><img src="${esc(p.preview)}" alt=""><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></span>`).join('');
    form.querySelector('.rv-form__add').hidden = photos.length >= 3;
  };
  form.querySelector('.rv-form__add input').addEventListener('change', e => {
    for (const f of [...e.target.files]) {
      if (photos.length >= 3) break;
      if (!CMS.imageOk(f)) { err(`${f.name}: please use a JPG, PNG or phone photo.`); continue; }
      const ready = CMS.prepareImage(f, { max: 1400, quality: 0.82 });
      const p = { file: f, preview: URL.createObjectURL(f), ready };
      ready.then(b => { p.preview = URL.createObjectURL(b); drawThumbs(); },
                 ex => { photos.splice(photos.indexOf(p), 1); drawThumbs(); err(ex.message); });
      photos.push(p);
    }
    e.target.value = '';
    drawThumbs();
  });
  form.querySelector('.rv-form__thumbs').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    photos.splice(+b.dataset.rm, 1); drawThumbs();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (PREVIEW) { err('Preview only: reviews can\'t be sent from here.'); return; }
    const name = form.name.value.trim(), body = form.body.value.trim();
    if (!rating) return err('Pick a star rating.');
    if (!name) return err('Add your name (first name is fine).');
    if (body.length < 10) return err('Tell us a bit more (at least 10 characters).');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = photos.length ? 'Preparing photos…' : 'Sending…';
    try {
      const dataUrls = [];
      for (const p of photos) {
        const blob = await p.ready;
        dataUrls.push(await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); }));
      }
      btn.textContent = 'Sending…';
      await CMS.submitReview({
        product_id: ctx.productId || null, order_number: ctx.orderNumber || null, order_key: ctx.orderKey || null,
        rating, name, body, photos: dataUrls, website: form.website.value,
      });
      form.outerHTML = `<div class="rv-thanks">${starsHtml(rating, false)}<h3>Thanks, ${esc(name)}!</h3>
        <p class="muted">Your review is in. It'll show up once the SPXTR crew has approved it.</p></div>`;
    } catch (ex) {
      err(ex.message);
      btn.disabled = false; btn.textContent = 'Send review';
    }
  });
}
