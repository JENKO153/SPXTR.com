#!/usr/bin/env python3
"""Generate snipcart-products.json from the catalogue in assets/js/data.js.

Snipcart re-checks every price at checkout by fetching each item's data-item-url.
Every product points at /snipcart-products.json, so this file must be regenerated
(and deployed) whenever a price, product or size list changes:

    python3 tools/build-snipcart-catalog.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
source = (ROOT / 'assets/js/data.js').read_text()
match = re.search(r'/\*CATALOG:START\*/(.*?)/\*CATALOG:END\*/', source, re.S)
if not match:
    raise SystemExit('Could not find the CATALOG markers in assets/js/data.js')

products = json.loads(match.group(1))
catalog = [
    {
        'id': p['id'],
        'price': p['price'],
        # Size is a plain dropdown (no price change, not required), so Snipcart needs no custom fields here.
        'customFields': [],
        'url': '/snipcart-products.json',
    }
    for p in products
    if p.get('status') != 'Draft'
]

out = ROOT / 'snipcart-products.json'
out.write_text(json.dumps(catalog, indent=2) + '\n')
print(f'Wrote {len(catalog)} products to {out.relative_to(ROOT)}')
