#!/usr/bin/env python3
"""Stamp a version onto the site's own CSS and JS links in every page.

Browsers hold on to a copy of each script for a while, so after a deploy someone can be running
last week's JavaScript against this week's pages. A version in the address makes it a new file as
far as the browser is concerned, so a deploy is picked up straight away.

Run it before pushing:  python3 tools/bump-version.py
"""
import re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = datetime.now(timezone.utc).strftime('%Y%m%d%H%M')
LINK = re.compile(r'''((?:src|href)=["'](?!https?:|//)[^"']*?\.(?:js|css))(?:\?v=\d+)?(["'])''')

changed = []
for page in sorted(ROOT.rglob('*.html')):
    if any(part in ('.git', 'designs', 'tools') for part in page.parts):
        continue
    text = page.read_text()
    stamped = LINK.sub(lambda m: f'{m.group(1)}?v={VERSION}{m.group(2)}', text)
    if stamped != text:
        page.write_text(stamped)
        changed.append(str(page.relative_to(ROOT)))

print(f'version {VERSION} stamped on {len(changed)} page(s):')
for c in changed:
    print('  ', c)
if '--commit' in sys.argv and changed:
    subprocess.run(['git', 'add', *changed], cwd=ROOT, check=True)
