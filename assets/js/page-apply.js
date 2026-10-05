/* SPXTR — the application to join the collective (/ambassadors/ and /models/).
 *
 * One form, two doors. Which door you came through only decides the opening copy and which box
 * is ticked by default: everyone answers the same questions, and the sections that belong to one
 * kind of applicant appear when they say that is what they are. Every question comes from
 * settings.apply in data.js, so the form is changed there, not here.
 *
 * These pages are deliberately apart from the rest of the site — their own header, no way back
 * into a shop that may still be closed — which is why loadStore() is never called: the curtain
 * would swallow them.
 */
(async function () {
  const DOOR = document.body.dataset.kind === 'model' ? 'model' : 'ambassador';

  try {
    // In the admin's live preview the draft arrives by message instead of from the database.
    const data = PREVIEW ? await previewData() : await CMS.loadPublic();
    SITE = CMS.mergeSettings(data?.settings || {});
  } catch { SITE = CMS.mergeSettings({}); }

  // Everything below is drawn from the settings, so an edit in the admin only has to call this
  // again. Listeners that belong to the window rather than the page are set up once.
  let wired = false;
  render();
  onPreview(draft => {
    if (draft?.settings) SITE = CMS.mergeSettings(draft.settings);
    render();
  });

  function render() {
  applyStoreAccent();
  applyTheme();

  const A = SITE.apply || DEFAULT_SETTINGS.apply;
  // The questions themselves are part of the site, not something the admin edits, so they always
  // come from here. Anything saved earlier is ignored, which keeps a stale copy in the database
  // from pinning the form to an old set of questions.
  const SECTIONS = DEFAULT_SETTINGS.apply.sections;
  const KIND_OTHER = { ambassador: 'a model', model: 'an ambassador' };
  const door = A.doors[DOOR], otherDoor = A.doors[DOOR === 'model' ? 'ambassador' : 'model'];
  const ig = instagramLink();

  document.title = `${door.eyebrow} — ${STORE.name}`;
  // Kept out of search until the store opens — these are for people we send the link to.
  SEO.describe({
    title: `${door.eyebrow} — ${STORE.name}`,
    description: A.lead,
    image: safeUrl(door.image || SITE.hero?.image || ''),
    path: door.path,
    noindex: true,
  });
  $('#apply-intake').textContent = `${A.intake} // applications open`;
  $('#apply-foot-note').textContent = A.closing || '';
  if (ig && !$('.ap__foot .link-arrow')) $('#apply-by').insertAdjacentHTML('beforebegin',
    `<a class="link-arrow" href="${esc(ig)}" target="_blank" rel="noopener noreferrer">${esc(SITE.instagram || 'Instagram')} ${ICON.arrow}</a>`);

  /* ---------------- fields ---------------- */
  const n2 = i => String(i + 1).padStart(2, '0');
  const need = o => (o.required ? '<b class="ap-req">required</b>' : '<i>optional</i>');

  function fieldHtml(name, label, o = {}) {
    const head = `<span>${esc(label)} ${need(o)}</span>`;
    const hint = o.hint ? `<em class="ap-field__hint">${esc(o.hint)}</em>` : '';
    const wide = o.half ? ' ap-field--half' : '';

    const step = o._i ?? 0;
    if (o.type === 'radio' || o.type === 'checks' || o.type === 'consent') {
      const single = o.type === 'radio';
      const cls = o.type === 'consent' ? 'ap-consent' : 'ap-chips';
      const boxes = (o.options || []).map((opt, i) => `
        <label class="${o.type === 'consent' ? 'ap-tick' : 'ap-chip'}">
          <input type="${single ? 'radio' : 'checkbox'}" name="${name}" value="${esc(opt)}"
                 ${single && o.required ? 'required' : ''} ${o.role ? 'data-role' : ''}>
          <span>${esc(opt)}</span>
        </label>`).join('');
      return `<div class="ap-field ap-field--full rise" style="--step:${step}" data-name="${name}">${head}${hint}
        <div class="${cls}">${boxes}</div></div>`;
    }

    // Which door they came through already says what they are applying for. The only thing left
    // to ask is whether they want to be considered for the other one as well.
    if (o.type === 'also') {
      const other = KIND_OTHER[DOOR];
      return `<div class="ap-field ap-field--full ap-also rise" style="--step:${step}" data-name="${name}">
        <label class="ap-tick"><input type="checkbox" name="also" data-role><span>
          Also consider me as ${esc(other)}.</span></label></div>`;
    }

    if (o.type === 'photo') {
      // Either works: attach the file, or paste a link to it. Whichever they do, the other is
      // left alone — nobody should have to make an album public to apply.
      return `<div class="ap-field ap-field--full ap-photo rise" style="--step:${step}" data-name="${name}">${head}${hint}
        <div class="ap-photo__row">
          <label class="ap-photo__pick">
            <input type="file" name="${name}_file" accept="image/jpeg,image/png,image/webp">
            <span>Choose a photo</span>
          </label>
          <span class="ap-photo__or">or</span>
          <input type="url" name="${name}" maxlength="300" placeholder="Paste a link to it">
        </div>
        <em class="ap-photo__name" hidden></em></div>`;
    }

    const control = o.type === 'textarea'
      ? `<textarea name="${name}" rows="${o.rows || 4}" maxlength="${o.max || 900}" ${o.required ? 'required' : ''} placeholder="${esc(o.placeholder || '')}"></textarea>`
      : `<input name="${name}" type="${o.type || 'text'}" maxlength="${o.max || 120}" ${o.required ? 'required' : ''}
           ${o.type === 'number' ? 'inputmode="numeric"' : ''} ${o.autocomplete ? `autocomplete="${o.autocomplete}"` : ''}
           placeholder="${esc(o.placeholder || '')}">`;
    return `<label class="ap-field${wide} rise" style="--step:${step}" data-name="${name}">${head}${control}${hint}
      <i class="ap-field__scan" aria-hidden="true"></i></label>`;
  }

  const sections = SECTIONS;
  const parts = sections.map(([title, hint, when, fields, footnote], i) => `
    <fieldset class="ap-part" id="part-${i + 1}" data-part="${i + 1}" ${when ? `data-when="${when}"` : ''}>
      <span class="ap-part__ghost" aria-hidden="true">${n2(i)}</span>
      <legend class="rise">
        <span class="ap-part__no">${n2(i)} / ${n2(SECTIONS.length - 1)}</span>
        <b>${esc(title)}</b>
        <em>${esc(hint)}</em>
      </legend>
      <div class="ap-fields">${fields.map(([n, l, o], j) => fieldHtml(n, l, { ...o, _i: j })).join('')}</div>
      ${footnote ? `<p class="ap-note">${esc(footnote)}</p>` : ''}
    </fieldset>`).join('');

  const perks = (door.perks || []).map(([t, d], i) => `
    <article class="ap-perk rise" style="--step:${i}">
      <span class="ap-perk__no">${n2(i)}</span>
      <div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>
    </article>`).join('');

  $('#apply-main').innerHTML = `
    <section class="ap-hero">
      <div class="ap-hero__bg" aria-hidden="true"></div>
      <div class="ap-hero__inner wrap">
        <span class="ap-meta rise">${(A.scarcity || []).map(x => `<b>${esc(x)}</b>`).join('<i>//</i>')}</span>
        <h1 class="display ap-hero__title">${String(door.title || '').split('\n')
          .map((l, i) => `<span><i style="--n:${i}">${esc(l)}</i></span>`).join('')}</h1>
        <p class="ap-hero__lead rise">${esc(A.lead || '')}</p>
        <div class="ap-hero__acts rise">
          <a class="btn" href="#apply">${esc(door.cta)}</a>
          <a class="link-arrow" href="${esc(otherDoor.path)}">${esc(otherDoor.cta)} ${ICON.arrow}</a>
        </div>
      </div>
      <div class="marquee ap-marquee" aria-hidden="true"><div class="marquee__track" id="ap-ticker"></div></div>
    </section>

    <section class="wrap ap-sec">
      <div class="section-head"><span class="eyebrow">Sec. 01 // What you get</span><h2 class="display">${esc(door.perksTitle || (DOOR === 'model' ? 'Paid properly.' : 'Backed properly.'))}</h2></div>
      <hr class="ap-rule rise" style="margin-bottom:34px">
      <div class="ap-perks">${perks}</div>
    </section>

    <section class="wrap ap-sec">
      <div class="section-head"><span class="eyebrow">Sec. 02 // What we look for</span><h2 class="display">${esc(A.lookingTitle || 'Who gets in.')}</h2></div>
      <hr class="ap-rule rise" style="margin-bottom:34px">
      <ul class="ap-list">${(A.looking || []).map((l, i) => `<li class="rise" style="--step:${i}">${esc(l)}</li>`).join('')}</ul>
    </section>

    <section class="wrap ap-sec" id="apply">
      <div class="section-head"><span class="eyebrow">Sec. 03 // The application</span><h2 class="display">Put your name forward.</h2></div>
      <div class="ap-invite rise">
        <span class="ap-invite__eyebrow">${esc(A.intake)} // by application</span>
        <h3>${esc(A.inviteTitle || 'This is an invitation to be considered.')}</h3>
        <p>${esc(A.inviteText || '')}</p>
        <hr class="ap-rule" style="margin:22px 0 0">
        <p class="ap-smallprint">${esc(A.smallprint || '')}</p>
      </div>
      <div class="ap-dossier">
        <aside class="ap-rail" aria-hidden="true">
          <span class="ap-rail__file">${esc(A.intake)}</span>
          <ol class="ap-rail__steps">
            ${sections.map(([t], i) => `<li data-step="${i + 1}" ${sections[i][2] ? `data-when="${sections[i][2]}"` : ''}><b>${n2(i)}</b><span>${esc(t)}</span></li>`).join('')}
          </ol>
          <span class="ap-rail__fill"><i></i></span>
        </aside>
        <form class="ap-form" id="apply-form" novalidate>
          <header class="ap-plate rise">
            <span><b>File</b>${esc(A.intake)}</span>
            <span><b>Applying as</b><em id="ap-plate-role">${esc(door.role)}</em></span>
            <span><b>Status</b><em id="ap-plate-state">Open</em></span>
          </header>
          ${parts}
          <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="ap-hp">
          <p class="ap-error" id="apply-error" hidden></p>
          <div class="ap-send">
            <button class="btn" type="submit" id="apply-submit">Send application</button>
            <span>One application per person. We answer every one.</span>
          </div>
        </form>
      </div>
    </section>`;

  wireBrandFallbacks();   // motion.js watches for new content and reveals it on its own

  // The opening stages itself in: the headline lines are masked until the hero is up.
  requestAnimationFrame(() => $('.ap-hero')?.classList.add('in'));

  // How far down the page you are, drawn in gold across the top.
  if (!wired) {
    wired = true;
    const bar = document.createElement('div');
    bar.className = 'ap-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    const follow = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty('--read', max > 0 ? (scrollY / max).toFixed(4) : 0);
    };
    addEventListener('scroll', follow, { passive: true });
    addEventListener('resize', follow);
    follow();
  }
  fillTicker($('#ap-ticker'), (A.marquee || []).map(w => `<span>${esc(w)}</span>`).join(''));
  const shot = safeUrl(door.image || SITE.hero?.image || SITE.newsletter?.image || '');
  if (shot) $('.ap-hero__bg').style.backgroundImage = `url("${shot}")`;

  const form = $('#apply-form'), errorBox = $('#apply-error'), submit = $('#apply-submit');

  /* ---------------- which sections apply to you ---------------- */
  // The door they came through ticks the box for them; changing it reshapes the form.
  const alsoBox = form.querySelector('input[name="also"]');
  const roleNow = () => (alsoBox?.checked ? 'Both Ambassador and Model' : door.role);
  const wants = kind => (alsoBox?.checked ? true : kind === DOOR);
  const shapeForm = () => {
    const plate = $('#ap-plate-role'); if (plate) plate.textContent = roleNow();
    $$('[data-when]').forEach(el => {
      const show = wants(el.dataset.when);
      el.hidden = !show;
      // A hidden question must not hold the form up, so its "required" comes off with it.
      $$('input, textarea', el).forEach(f => { if (f.dataset.req === undefined && f.required) f.dataset.req = '1'; f.required = show && f.dataset.req === '1'; });
    });
    mark();
  };

  /* ---------------- the rail ---------------- */
  const steps = $$('.ap-rail__steps li'), fill = $('.ap-rail__fill i');
  const partEls = $$('.ap-part');
  const touched = el => [...el.querySelectorAll('input, textarea')]
    .some(f => f.name !== 'website' && (f.type === 'checkbox' || f.type === 'radio' ? f.checked : f.value.trim()));
  function mark() {
    let live = 0, done = 0;
    partEls.forEach((el, i) => {
      if (el.hidden) { steps[i]?.classList.remove('is-done'); return; }
      live++;
      const ok = touched(el);
      if (ok) done++;
      steps[i]?.classList.toggle('is-done', ok);
    });
    if (fill) fill.style.transform = `scaleX(${live ? done / live : 0})`;
  }
  form.addEventListener('input', mark);
  form.addEventListener('change', e => (e.target.dataset.role !== undefined ? shapeForm() : mark()));

  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) steps.forEach(s => s.classList.toggle('is-here', s.dataset.step === e.target.dataset.part));
    }), { rootMargin: '-30% 0px -55% 0px' });
    partEls.forEach(el => seen.observe(el));
  }

  // Attached photos: show the file name, and keep each pair to one answer.
  form.addEventListener('change', e => {
    if (e.target.type !== 'file') return;
    const row = e.target.closest('.ap-photo');
    const file = e.target.files?.[0];
    const name = row.querySelector('.ap-photo__name');
    name.hidden = !file;
    name.textContent = file ? `${file.name} — ${Math.round(file.size / 1024)} KB` : '';
    if (file) row.querySelector('input[type="url"]').value = '';
  });

  /* ---------------- sending ---------------- */
  const show = (msg, el) => {
    errorBox.textContent = msg; errorBox.hidden = !msg;
    if (msg) (el || errorBox).scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (el) el.closest('.ap-field')?.classList.add('is-missing');
  };
  const years = iso => {
    const d = new Date(iso); if (isNaN(d)) return null;
    const now = new Date();
    let n = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) n--;
    return n;
  };
  // Files go up as data, inside the same request: no public upload address to abuse.
  const asData = file => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok({ name: file.name, type: file.type, data: String(r.result).split(',')[1] });
    r.onerror = no;
    r.readAsDataURL(file);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    show('');
    $$('.is-missing', form).forEach(el => el.classList.remove('is-missing'));

    const answers = {};
    new FormData(form).forEach((v, k) => {
      if (v instanceof File) return;                       // files are handled below
      if (answers[k] === undefined) answers[k] = v;
      else answers[k] = [].concat(answers[k], v);          // tick boxes arrive one entry per tick
    });

    // Everything the form says is required, and still showing.
    for (const [, , , fields] of sections) {
      for (const [name, label, o = {}] of fields) {
        const box = form.querySelector(`[data-name="${name}"]`);
        if (!box || box.closest('[hidden]') || box.hidden) continue;
        const needed = o.required || (o.whenRequired && wants(o.whenRequired));
        if (!needed) continue;
        if (o.type === 'consent') {
          const all = $$(`input[name="${name}"]`, box);
          if (all.some(c => !c.checked)) return show('Please tick every box to confirm, so we both know where we stand.', box);
        } else if (o.type === 'photo') {
          const hasFile = box.querySelector('input[type="file"]').files?.length;
          if (!hasFile && !box.querySelector('input[type="url"]').value.trim()) {
            return show(`${label} — attach a photo or paste a link to one.`, box);
          }
        } else if (!answers[name] || !String(answers[name]).trim()) {
          return show(`${label} — this one is needed.`, box);
        }
      }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(answers.email || '').trim())) {
      return show('That email address doesn\'t look right.', form.querySelector('[data-name="email"]'));
    }
    const age = years(answers.dob);
    if (age === null) return show('Please give your date of birth.', form.querySelector('[data-name="dob"]'));
    if (age < (A.minAge || 18)) return show(`You need to be ${A.minAge || 18} or older to apply. Come back when you are.`, form.querySelector('[data-name="dob"]'));

    submit.disabled = true; submit.textContent = 'Sending…';
    try {
      const photos = {};
      for (const input of $$('input[type="file"]', form)) {
        const file = input.files?.[0];
        if (!file) continue;
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is over 5MB. Send a smaller one, or paste a link instead.`);
        photos[input.name.replace(/_file$/, '')] = await asData(file);
      }
      spxTrack?.('Application sent', { as: alsoBox?.checked ? 'both' : DOOR });
      const r = await CMS.applyToJoin({
        kind: alsoBox?.checked ? 'both' : DOOR,
        name: String(answers.legal_name || '').trim(),
        email: String(answers.email || '').trim(),
        phone: answers.phone, location: answers.location, age,
        instagram: answers.instagram, tiktok: answers.tiktok, youtube: answers.youtube,
        links: [answers.other_link, answers.portfolio].filter(Boolean).join('\n'),
        why: answers.interest, heard: answers.heard,
        answers: { ...answers, role: roleNow() }, photos,
      });
      $('#apply').innerHTML = `
        <div class="ap-done">
          <span class="eyebrow">Application received</span>
          <h2 class="display">You're in<br>the pile.</h2>
          <p>Your application has been received and will be read by the crew. If your personality, experience and interests line up with something coming, we'll be in touch on the details you gave us.</p>
          ${r?.ref ? `<div class="ap-stamp"><span>Reference</span><b>${esc(r.ref)}</b><em>${esc(A.intake)}</em></div>` : ''}
          <p class="ap-note">Anything claiming to be from SPXTR will come from our own addresses. Applying does not guarantee acceptance, paid work or a response.</p>
          <p class="ap-fearless">Live fearless</p>
        </div>`;
      $('#apply').scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (err) {
      show(err.message);
      submit.disabled = false; submit.textContent = 'Send application';
    }
  });

  shapeForm();
  document.documentElement.classList.remove('is-loading');
  }
})();
