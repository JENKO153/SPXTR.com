/* SPXTR — applies the brand accent colour (Admin -> Customise) before the page draws, so no
   page flashes the default lime first. Loaded in <head>. The colour is remembered from the last
   time this browser loaded it; each page then confirms it against the database. */
(function () {
  const KEY = 'spx_accent';
  const ok = hex => /^#[0-9a-f]{6}$/i.test(hex || '');
  window.spxAccent = {
    apply(hex) {
      if (ok(hex)) document.documentElement.style.setProperty('--hot', hex);
      else document.documentElement.style.removeProperty('--hot');
      try { ok(hex) ? localStorage.setItem(KEY, hex) : localStorage.removeItem(KEY); } catch { /* private mode */ }
    },
  };
  try { const saved = localStorage.getItem(KEY); if (ok(saved)) document.documentElement.style.setProperty('--hot', saved); } catch { /* private mode */ }
})();
