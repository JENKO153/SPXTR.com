#!/usr/bin/env python3
"""Write sitemap.xml.

The site builds itself from Supabase, so the pages and products only exist as addresses with a
query on the end (/shop/?page=moto, /product/?p=night-ride-hoodie). A crawler has no way to guess
those, so they are listed here.

Run it after adding or removing pages/products:

    python3 tools/build-sitemap.py

It reads the public keys out of assets/js/config.js and asks the database for whatever the public
can already see. While the store is closed to the public that is nothing, so only the fixed
addresses are written -- run it again once you open, and the products will be in it.
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://spxtr.com'

# The addresses that always exist, with how important each is relative to the others.
FIXED = [('', '1.0', 'weekly'), ('shop/', '0.9', 'daily')]

cfg = (ROOT / 'assets/js/config.js').read_text()
url = (re.search(r"supabaseUrl:\s*'([^']+)'", cfg) or [None, ''])[1]
key = (re.search(r"supabaseKey:\s*'([^']+)'", cfg) or [None, ''])[1]


def ask(rpc, body=b'{}'):
    req = urllib.request.Request(f'{url}/rest/v1/rpc/{rpc}', data=body,
                                 headers={'apikey': key, 'Authorization': f'Bearer {key}',
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


pages, products = [], []
if url and key:
    try:
        data = ask('store_data')
        pages = [c for c in (data.get('collections') or []) if c.get('visible', True)]
        products = [p for p in (data.get('products') or []) if p.get('status') == 'published']
        if data.get('coming_soon'):
            print('note: the store is closed to the public, so the database returned no pages or '
                  'products. Run this again after you open.', file=sys.stderr)
    except Exception as err:                      # offline, or keys not set yet
        print(f'note: could not reach the database ({err}). Writing the fixed addresses only.', file=sys.stderr)

today = date.today().isoformat()
rows = [(f'{SITE}/{path}', pri, freq) for path, pri, freq in FIXED]
rows += [(f'{SITE}/shop/?page={c["slug"]}', '0.8', 'weekly') for c in pages if c.get('slug')]
rows += [(f'{SITE}/product/?p={p["slug"]}', '0.7', 'weekly') for p in products if p.get('slug')]

body = '\n'.join(
    f'  <url>\n    <loc>{loc}</loc>\n    <lastmod>{today}</lastmod>\n'
    f'    <changefreq>{freq}</changefreq>\n    <priority>{pri}</priority>\n  </url>'
    for loc, pri, freq in rows)
(ROOT / 'sitemap.xml').write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n')
print(f'sitemap.xml — {len(rows)} addresses ({len(pages)} pages, {len(products)} products)')
