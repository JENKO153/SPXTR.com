/* SPXTR — visitor numbers, if the shop wants them.
 *
 * Off until someone fills in config.js. Both choices below are cookie-free and collect nothing
 * that identifies a person, which is why the site needs no cookie banner and no consent popup —
 * put Google Analytics on instead and that stops being true.
 *
 *   Plausible  plausible.io          — paid, hosted, nothing to run
 *   Umami      umami.is or your own  — free tier, or self-hosted
 *
 * Anything measured on purpose goes through spxTrack(), so there is one list of what the site
 * reports and nothing is collected by accident.
 */
(function () {
  const cfg = window.SPX_CONFIG?.analytics || {};
  const provider = String(cfg.provider || '').toLowerCase();
  const site = String(cfg.site || '').trim();

  // Nothing configured, or someone is previewing in the admin: measure nothing, and let the
  // rest of the site call spxTrack() without checking first.
  const off = !provider || !site || new URLSearchParams(location.search).has('preview');
  if (off) { window.spxTrack = () => {}; return; }

  const script = document.createElement('script');
  script.defer = true;

  if (provider === 'plausible') {
    script.src = `${cfg.host || 'https://plausible.io'}/js/script.tagged-events.outbound-links.js`;
    script.dataset.domain = site;
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    window.spxTrack = (name, props) => window.plausible(name, props ? { props } : undefined);
  } else if (provider === 'umami') {
    script.src = `${cfg.host || 'https://cloud.umami.is'}/script.js`;
    script.dataset.websiteId = site;
    window.spxTrack = (name, props) => window.umami?.track(name, props);
  } else {
    window.spxTrack = () => {};
    return;
  }

  // If the script is blocked (an ad blocker, an offline phone), the site carries on as normal.
  script.onerror = () => { window.spxTrack = () => {}; };
  document.head.appendChild(script);
})();
