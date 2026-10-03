#!/usr/bin/env python3
"""Trace the SPXTR wordmark mask (a 900x480 PNG) into an SVG, so it stays sharp at any size.

The mask is pure transparency, which makes this tractable: every boundary between a solid pixel
and a transparent one is a unit-length edge. Collect those edges, stitch them into closed loops,
simplify the staircases into straight runs, and write the lot as one path with evenodd filling so
the holes inside letters stay holes.
"""
import sys
from collections import defaultdict

import numpy as np
from PIL import Image

SRC = sys.argv[1]
DEST = sys.argv[2]
TOL = float(sys.argv[3]) if len(sys.argv) > 3 else 0.8      # simplification tolerance, in pixels
MIN_AREA = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0  # drop specks smaller than this

alpha = np.asarray(Image.open(SRC).convert('RGBA'))[:, :, 3]
solid = alpha > 128
h, w = solid.shape
padded = np.zeros((h + 2, w + 2), bool)
padded[1:-1, 1:-1] = solid

# Every edge where a solid pixel meets a transparent one, wound so the solid side is on the left.
# A list, not a map: where shapes touch corner to corner, one point is the start of two different
# edges, and a map would quietly keep only the last of them.
edges = []
ys, xs = np.nonzero(padded)
for y, x in zip(ys.tolist(), xs.tolist()):
    if not padded[y - 1, x]:  edges.append(((x, y), (x + 1, y)))          # top, left to right
    if not padded[y + 1, x]:  edges.append(((x + 1, y + 1), (x, y + 1)))  # bottom, right to left
    if not padded[y, x - 1]:  edges.append(((x, y + 1), (x, y)))          # left, bottom to top
    if not padded[y, x + 1]:  edges.append(((x + 1, y), (x + 1, y + 1)))  # right, top to bottom

# Stitch the edges into closed loops.
#
# Where two parts of the artwork touch corner to corner, four edges meet at one point and the
# walk could carry on in several directions. Taking whichever comes first merges separate shapes
# and crosses the outlines over each other. Turning as sharply right as possible at every such
# junction keeps each shape's outline to itself.
loops = []
starts = defaultdict(list)
for a, b in edges:
    starts[a].append(b)

def pick(here, nxts, came_from):
    if len(nxts) == 1 or came_from is None:
        return nxts[0]
    dx, dy = here[0] - came_from[0], here[1] - came_from[1]
    order = [(-dy, dx), (dx, dy), (dy, -dx)]            # right, straight, left
    for want in order:
        for n in nxts:
            if (n[0] - here[0], n[1] - here[1]) == want:
                return n
    return nxts[0]

while starts:
    start = next(iter(starts))
    loop = [start]
    here, came_from = start, None
    while True:
        nxts = starts.get(here)
        if not nxts:
            break
        nxt = pick(here, nxts, came_from)
        nxts.remove(nxt)
        if not nxts:
            del starts[here]
        came_from, here = here, nxt
        if here == start:
            break
        loop.append(here)
    if len(loop) > 3:
        loops.append(loop)


def area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def simplify(pts, tol):
    """Douglas-Peucker on a closed ring, run as two open halves so the ends stay put."""
    def dp(chunk):
        if len(chunk) < 3:
            return chunk
        (x1, y1), (x2, y2) = chunk[0], chunk[-1]
        dx, dy = x2 - x1, y2 - y1
        span = (dx * dx + dy * dy) ** 0.5
        worst, at = 0.0, 0
        for i in range(1, len(chunk) - 1):
            px, py = chunk[i]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / span if span else ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
            if d > worst:
                worst, at = d, i
        if worst <= tol:
            return [chunk[0], chunk[-1]]
        return dp(chunk[:at + 1])[:-1] + dp(chunk[at:])

    if len(pts) < 4:
        return pts
    half = len(pts) // 2
    a = dp(pts[:half + 1])
    b = dp(pts[half:] + [pts[0]])
    return a[:-1] + b[:-1]


def curve(pts, corner_deg=55.0):
    """Turn a ring of points into a smooth path, keeping genuine corners sharp.

    The outline off the pixel grid is a staircase; simplifying leaves straight runs meeting at
    angles. Rounding every joint would melt the spikes this mark is made of, so a joint only gets
    smoothed when it turns gently. Anything sharper stays as drawn."""
    import math
    n = len(pts)

    def joint(i):
        ax, ay = pts[i][0] - pts[(i - 1) % n][0], pts[i][1] - pts[(i - 1) % n][1]
        bx, by = pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]
        la, lb = (ax * ax + ay * ay) ** 0.5, (bx * bx + by * by) ** 0.5
        if not la or not lb:
            return 0.0, 0.0
        d = math.degrees(abs(math.atan2(by, bx) - math.atan2(ay, ax)))
        return min(d, 360 - d), min(la, lb)

    # A corner is only a corner when both of its sides are long enough to be part of the drawing.
    # Short sides are leftovers of the pixel staircase and get rounded away.
    soft = []
    for i in range(n):
        turn, shortest = joint(i)
        soft.append(not (turn >= corner_deg and shortest >= 3.0))
    out = [f'M{pts[0][0] - 1:.1f} {pts[0][1] - 1:.1f}']
    for i in range(n):
        p0, p1 = pts[i], pts[(i + 1) % n]
        pm1, p2 = pts[(i - 1) % n], pts[(i + 2) % n]
        k = 1 / 6
        s1 = k if soft[i] else 0.0
        s2 = k if soft[(i + 1) % n] else 0.0
        c1 = (p0[0] + (p1[0] - pm1[0]) * s1, p0[1] + (p1[1] - pm1[1]) * s1)
        c2 = (p1[0] - (p2[0] - p0[0]) * s2, p1[1] - (p2[1] - p0[1]) * s2)
        out.append(f'C{c1[0] - 1:.1f} {c1[1] - 1:.1f} {c2[0] - 1:.1f} {c2[1] - 1:.1f} {p1[0] - 1:.1f} {p1[1] - 1:.1f}')
    out.append('Z')
    return ''.join(out)


sys.setrecursionlimit(100000)
parts, kept, dropped = [], 0, 0
for loop in loops:
    a = area(loop)
    if a < MIN_AREA:
        dropped += 1
        continue
    # The grunge specks are part of the artwork and are only a few pixels across: simplifying at
    # the tolerance used for the letters would rub them out, so they are kept as drawn.
    pts = loop if a < 14 else simplify(loop, TOL)
    if len(pts) < 3:
        dropped += 1
        continue
    kept += 1
    parts.append(curve(pts))

svg = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' preserveAspectRatio='xMidYMid meet'>"
       f"<path fill='#fff' fill-rule='evenodd' d='{''.join(parts)}'/></svg>")
open(DEST, 'w').write(svg)
print(f'{kept} shapes kept, {dropped} specks dropped -> {DEST} ({len(svg) / 1024:.0f} KB)')
