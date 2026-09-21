/* SPXTR admin login: password -> authenticator code (or first-time setup) -> dashboard. */
// The admin must never run inside another site's frame (a trick to capture clicks or passwords).
if (window.top !== window.self) { document.documentElement.innerHTML = ''; throw new Error('SPXTR admin cannot be framed'); }
(function () {
  const $ = s => document.querySelector(s);
  const DASHBOARD = '../dashboard/';  // relative, so it works wherever the site is hosted
  const steps = { login: $('#loginForm'), mfa: $('#mfaForm'), enroll: $('#enrollForm') };
  let enrolling = null;
  let failures = 0;
  let captchaId = null;

  // Optional Cloudflare Turnstile. Supabase checks the token server-side, so this can't be skipped
  // by editing the page — if it's switched on in Supabase, a login without a valid token is refused.
  if (CMS.captchaEnabled) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true;
    s.onload = () => { captchaId = window.turnstile.render('#captcha', { sitekey: window.SPX_CONFIG.captcha.siteKey, theme: 'dark' }); };
    document.head.appendChild(s);
  }
  const captchaToken = () => (captchaId != null ? window.turnstile.getResponse(captchaId) : undefined);
  const resetCaptcha = () => { if (captchaId != null) window.turnstile.reset(captchaId); };

  // Wear the colour set in Admin -> Customise (accent.js already applied the remembered one).
  CMS.loadAccent().then(hex => window.spxAccent?.apply(validAccent(hex) ? hex : null)).catch(() => {});

  const show = name => Object.entries(steps).forEach(([k, el]) => { el.hidden = k !== name; });
  const error = msg => { const e = $('#formError'); e.textContent = msg || ''; e.hidden = !msg; };
  const busy = (form, on, label) => {
    const b = form.querySelector('button[type="submit"]');
    b.disabled = on;
    if (label) b.textContent = label;
  };

  if (CMS.mode === 'demo') {
    const d = CMS.demoCredentials;
    const n = $('#demoNotice');
    n.hidden = false;
    n.innerHTML = `<b>Demo mode</b>: not connected to Supabase yet. Sign in with <code>${esc(d.email)}</code> / <code>${esc(d.password)}</code>`;
  }
  const reason = new URLSearchParams(location.search).get('reason');
  if (reason === 'idle') error('You were signed out after being inactive. Sign in again.');
  if (reason === 'expired') error('Your session ended. Sign in again.');

  async function route(step) {
    if (step.status === 'ok') { location.replace(DASHBOARD); return; }
    if (step.status === 'not_admin') { show('login'); error("This account doesn't have admin access."); return; }
    if (step.status === 'mfa_verify') { show('mfa'); $('#mfaCode').focus(); return; }
    if (step.status === 'mfa_enroll') {
      show('enroll');
      enrolling = await CMS.startMfaEnroll();
      $('#qrImg').src = enrolling.qr;
      $('#qrSecret').textContent = enrolling.secret;
      $('#enrollCode').focus();
    }
  }

  // Already signed in? Carry on where they left off.
  (async () => {
    try {
      const admin = await CMS.getAdmin();
      if (admin && !admin.needs) location.replace(DASHBOARD);
      else if (admin?.needs) route({ status: admin.needs });
    } catch { /* stay on the login form */ }
  })();

  steps.login.addEventListener('submit', async e => {
    e.preventDefault();
    error('');
    busy(steps.login, true, 'Signing in…');
    // Slow down repeated attempts from this browser. Supabase rate-limits server-side as well.
    if (failures > 2) await new Promise(r => setTimeout(r, Math.min(8000, 2 ** (failures - 2) * 1000)));
    try {
      const token = captchaToken();
      if (CMS.captchaEnabled && !token) throw new Error('Please complete the bot check first.');
      await route(await CMS.login($('#email').value.trim(), $('#password').value, token));
      failures = 0;
    } catch (err) {
      failures++;
      resetCaptcha();
      error(err.message);
      $('#password').focus();
    } finally {
      $('#password').value = '';
      busy(steps.login, false, 'Sign in');
    }
  });

  steps.mfa.addEventListener('submit', async e => {
    e.preventDefault();
    error('');
    busy(steps.mfa, true);
    try {
      await CMS.verifyMfa($('#mfaCode').value.trim());
      location.replace(DASHBOARD);
    } catch (err) {
      error(err.message);
      $('#mfaCode').select();
    } finally { busy(steps.mfa, false); }
  });

  steps.enroll.addEventListener('submit', async e => {
    e.preventDefault();
    error('');
    busy(steps.enroll, true);
    try {
      await CMS.finishMfaEnroll(enrolling.factorId, $('#enrollCode').value.trim());
      location.replace(DASHBOARD);
    } catch (err) {
      error(err.message);
      $('#enrollCode').select();
    } finally { busy(steps.enroll, false); }
  });

  document.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    await CMS.logout();
    error('');
    show('login');
  }));

  // Only digits in the code boxes
  document.querySelectorAll('.code-input').forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); }));
})();
