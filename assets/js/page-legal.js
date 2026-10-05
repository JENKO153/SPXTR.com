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
  SEO.describe({ path: 'privacy/' });
  document.documentElement.classList.remove('is-loading');
})();
