/* SPXTR — the policy pages. They are plain HTML on purpose: legal wording should not depend on a
   database being reachable, and it should still be readable if every script fails. This only
   applies the brand colour, the season, the brand mark's fallback, and the business details. */
(async function () {
  try {
    // In the admin's live preview the draft arrives by message instead of from the database.
    const data = PREVIEW ? await previewData() : await CMS.loadPublic();
    SITE = CMS.mergeSettings(data?.settings || {});
  } catch { SITE = CMS.mergeSettings({}); }
  applyStoreAccent();
  applyTheme();
  wireBrandFallbacks();

  fillGaps();
  onPreview(draft => {
    if (draft?.settings) SITE = CMS.mergeSettings(draft.settings);
    applyStoreAccent();
    applyTheme();
    fillGaps();
  });

  // Writes the business details into the gaps. A detail that has not been filled in yet keeps its
  // red marker, so the page itself shows what is still outstanding. The <mark> is kept either way
  // and only restyled, so the admin's preview can redraw the same page as the details are typed.
  function fillGaps() {
    const legal = SITE.legal || {};
    document.querySelectorAll('[data-legal]').forEach(el => {
      if (!el.dataset.legalGap) el.dataset.legalGap = el.textContent; // remember the placeholder
      const value = String(legal[el.dataset.legal] || '').trim();
      el.textContent = value || el.dataset.legalGap;
      el.classList.toggle('is-filled', !!value);
    });
  }

  SEO.describe({ path: 'privacy/' });
  document.documentElement.classList.remove('is-loading');
})();
