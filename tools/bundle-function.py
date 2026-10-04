#!/usr/bin/env python3
"""Flatten an Edge Function and its ../_shared imports into one file.

The Supabase dashboard's function editor is rooted at the function's own folder, so the
"../_shared/..." imports the repo uses can't be followed there. This writes a single file that
can be pasted into the dashboard as-is. The repo version stays the source of truth; re-run this
whenever the function or the shared helpers change.

    python3 tools/bundle-function.py applications
"""
import re
import sys
from pathlib import Path

name = sys.argv[1]
root = Path('supabase/functions')
src = (root / name / 'index.ts').read_text()

# Pull in each ../_shared/* import, in the order they are first needed.
inlined, bodies = set(), []


def take(rel: str) -> str:
    path = root / '_shared' / rel
    text = path.read_text()
    # A shared file may import another shared file; bring that in first. A namespace import
    # ("import * as T from ...") needs an object of that file's exports once it is inlined,
    # because the names are now plain top-level declarations.
    for star, dep in re.findall(r"import \* as (\w+) from '\./([\w.-]+)'", text):
        if dep not in inlined:
            inlined.add(dep)
            body = (root / '_shared' / dep).read_text()
            names = sorted(set(re.findall(r'^export (?:async )?(?:function|const) (\w+)', body, flags=re.M)))
            body = re.sub(r'^export (async function|function|const|class) ', r'\1 ', body, flags=re.M)
            # Kept inside a closure: this file and the one importing it share several names
            # (confirmationEmail and friends), and at the top level that is a redeclaration.
            bodies.append(f"\n// ---------- {dep} (namespaced as {star}) ----------\n"
                          f"const {star} = (() => {{\n{body.strip()}\n"
                          f"  return {{ {', '.join(names)} }};\n}})();\n")
    for dep in re.findall(r"from '\./([\w.-]+)'", text):
        if dep not in inlined:
            inlined.add(dep)
            bodies.append(take(dep))
    text = re.sub(r"^import .*? from '\./[\w.-]+';\n", '', text, flags=re.M)
    text = re.sub(r'^export (const|function|async function|class|type|interface) ', r'\1 ', text, flags=re.M)
    text = re.sub(r'^export \{[^}]*\};\n', '', text, flags=re.M)
    return f'\n// ---------- {path.name} ----------\n{text.strip()}\n'


out_imports = []
for rel in re.findall(r"from '\.\./_shared/([\w.-]+)'", src):
    if rel not in inlined:
        inlined.add(rel)
        bodies.append(take(rel))

# Keep the npm/std imports at the top; drop the shared ones now that they are inlined.
for line in src.splitlines():
    m = re.match(r"import .*? from '(npm:|jsr:|https:)", line)
    if m:
        out_imports.append(line)
src = re.sub(r"^import [\s\S]*?from '\.\./_shared/[\w.-]+';\n", '', src, flags=re.M)
src = re.sub(r"^import .*? from '(npm:|jsr:|https:)[^']*';\n", '', src, flags=re.M)

# The templates file is plain JS using names the function expects; nothing to rename.
banner = (f'// GENERATED — do not edit. Built from supabase/functions/{name}/ and _shared/ by\n'
          f'// tools/bundle-function.py, for pasting into the Supabase dashboard function editor.\n'
          f'// The files in the repo are the source of truth.\n')
dest = root / name / 'index.dashboard.ts'
dest.write_text(banner + '\n'.join(out_imports) + '\n' + ''.join(bodies) + '\n// ---------- the function ----------\n' + src.strip() + '\n')
print(f'{dest}  ({len(dest.read_text().splitlines())} lines)')
