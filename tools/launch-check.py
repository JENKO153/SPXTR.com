#!/usr/bin/env python3
"""Check the live site is ready to open, or ready for business once it is.

Reads the public keys from assets/js/config.js and asks the live site and database the questions
you would otherwise have to remember. It only reads: nothing here changes anything.

    python3 tools/launch-check.py
"""
import json
import re
import ssl
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://spxtr.com'
ctx = ssl.create_default_context()

cfg = (ROOT / 'assets/js/config.js').read_text()
url = (re.search(r"supabaseUrl:\s*'([^']+)'", cfg) or [None, ''])[1]
key = (re.search(r"supabaseKey:\s*'([^']+)'", cfg) or [None, ''])[1]
test_mode = 'testMode: true' in cfg

OK, WARN, BAD = '  ok   ', ' check ', '  no   '
rows = []


def say(state, what, detail=''):
    rows.append((state, what, detail))


def get(path, timeout=15):
    with urllib.request.urlopen(f'{SITE}{path}', timeout=timeout, context=ctx) as r:
        return r.status, r.read().decode('utf-8', 'replace')


def rpc(name, body=b'{}'):
    req = urllib.request.Request(f'{url}/rest/v1/rpc/{name}', data=body,
                                 headers={'apikey': key, 'Authorization': f'Bearer {key}',
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
        return json.load(r)


# --- the site itself ---
for path, label in [('/', 'homepage'), ('/shop/', 'shop'), ('/sitemap.xml', 'sitemap'),
                    ('/robots.txt', 'robots.txt')]:
    try:
        code, body = get(path)
        say(OK if code == 200 else BAD, f'{label} responds', f'HTTP {code}')
        if path == '/sitemap.xml':
            n = body.count('<loc>')
            say(OK if n > 2 else WARN, 'sitemap has pages and products in it',
                f'{n} addresses' + ('' if n > 2 else ' — re-run tools/build-sitemap.py once the store is open'))
    except Exception as err:
        say(BAD, f'{label} responds', str(err))

# --- the store, as the public sees it ---
try:
    data = rpc('store_data')
    shut = bool(data.get('coming_soon'))
    products = [p for p in (data.get('products') or []) if p.get('status') == 'published']
    pages = data.get('collections') or []
    say(WARN if shut else OK, 'store is open to the public',
        'closed — the curtain is up' if shut else 'open')
    if not shut:
        say(OK if products else BAD, 'published products are visible', f'{len(products)}')
        say(OK if pages else WARN, 'pages are visible', f'{len(pages)}')
except Exception as err:
    say(BAD, 'database answers the public', str(err))

# --- the functions that have to be there ---
for fn, note in [('applications', 'ambassador and model applications'),
                 ('create-checkout', 'checkout'),
                 ('launch-list', 'the launch email'),
                 ('review-requests', 'review requests')]:
    try:
        req = urllib.request.Request(f'{url}/functions/v1/{fn}', method='GET')
        urllib.request.urlopen(req, timeout=15, context=ctx)
        say(OK, f'{fn} deployed', note)
    except urllib.error.HTTPError as err:
        # Anything that answers at all is deployed; 404 means it is not there.
        say(BAD if err.code == 404 else OK, f'{fn} deployed', note if err.code != 404 else 'not deployed')
    except Exception as err:
        say(WARN, f'{fn} deployed', str(err))

# --- settings worth a second look ---
say(WARN if test_mode else OK, 'Stripe links point at live mode',
    'config.js still says testMode: true' if test_mode else 'live')

print()
for state, what, detail in rows:
    print(f'[{state}] {what}' + (f'  — {detail}' if detail else ''))
print()
bad = sum(1 for s, _, _ in rows if s == BAD)
warn = sum(1 for s, _, _ in rows if s == WARN)
print(f'{len(rows)} checks — {bad} failing, {warn} worth a look')
