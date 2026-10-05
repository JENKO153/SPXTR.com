/* SPXTR — the policy pages. They are plain HTML on purpose: legal wording should not depend on a
   database being reachable, and it should still be readable if every script fails. This only
   applies the brand colour, the season, and the brand mark's fallback. */
(async function () {
  try {
    const data = await CMS.loadPublic();
    SITE = CMS.mergeSettings(data?.settings || {});
  } catch { SITE = CMS.mergeSettings({}); }
  applyStoreAccent();
  applyTheme();
  wireBrandFallbacks();

  // Write the business details into the gaps. A detail that has not been filled in yet keeps its
  // red marker, so the page itself shows what is still outstanding.
  const legal = SITE.legal || {};
  document.querySelectorAll('[data-legal]').forEach(el => {
    const value = String(legal[el.dataset.legal] || '').trim();
    if (!value) return;
    const plain = document.createElement('span');
    plain.textContent = value;
    el.replaceWith(plain);
  });

  SEO.describe({ path: 'privacy/' });
  document.documentElement.classList.remove('is-loading');
})();
