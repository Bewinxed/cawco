"""Measure, then clear, the light fringe a Backlot edit leaves round Caw.

An edit of his source cut-out can draw a pale sticker outline round him that
the transparent cut-out keeps. Measure the edge band (figure pixels within
6px of the clear ground) for light pixels (alpha 32 or more, every channel
above 150) and compare it with the source's; only a take whose band is over
the source's level is flooded. The flood runs from the clear ground through
light pixels and no deeper than the fringe (12px), so a pale prop keeps its
inside even where its outline has a gap. Every take then loses the opaque
ground's colour left in a pocket the flood can't reach (a patch of under
400px of light pixels tinted blue over red, as the violet ground leaves it
between a wing and the body; neither Caw nor a pale prop has that colour)
and the soft halo under alpha 96.

    python3 -I halo.py measure take.png                       # the band's light count
    python3 -I halo.py clean take.png out.png --source src.png  # measure both, clean
"""

import sys
from collections import deque

import numpy as np
from PIL import Image

BAND = 6
DEPTH = 12
POCKET = 400
STEPS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def light_band(img: Image.Image) -> int:
    a = np.array(img.convert("RGBA"))
    ground = a[..., 3] < 32
    near = ground.copy()
    for _ in range(BAND):
        grown = near.copy()
        grown[1:, :] |= near[:-1, :]
        grown[:-1, :] |= near[1:, :]
        grown[:, 1:] |= near[:, :-1]
        grown[:, :-1] |= near[:, 1:]
        near = grown
    light = (a[..., 3] >= 32) & (a[..., :3].min(-1) > 150)
    return int((light & near & ~ground).sum())


def flood(img: Image.Image) -> int:
    w, h = img.size
    px = img.load()
    depth = np.full((h, w), -1, int)
    q: deque[tuple[int, int]] = deque()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 32:
                depth[y, x] = 0
                q.append((x, y))
    cleared = 0
    while q:
        x, y = q.popleft()
        if depth[y, x] >= DEPTH:
            continue
        for dx, dy in STEPS:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and depth[ny, nx] < 0:
                depth[ny, nx] = depth[y, x] + 1
                p = px[nx, ny]
                if p[3] >= 32 and min(p[:3]) > 150:
                    px[nx, ny] = (p[0], p[1], p[2], 0)
                    cleared += 1
                    q.append((nx, ny))
    return cleared


def pockets(a: np.ndarray) -> int:
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(int)
    tinted = (a[..., 3] >= 32) & (rgb.min(-1) > 150) & (rgb[..., 2] > rgb[..., 0] + 20)
    seen = np.zeros((h, w), bool)
    cleared = 0
    for y0, x0 in zip(*np.nonzero(tinted)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        patch, q = [], deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            patch.append((y, x))
            for dx, dy in STEPS:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and tinted[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(patch) <= POCKET:
            for y, x in patch:
                a[y, x] = 0
            cleared += len(patch)
    return cleared


def main() -> None:
    if sys.argv[1] == "measure":
        print(sys.argv[2], "light in the edge band", light_band(Image.open(sys.argv[2])))
        return
    _, _, src, out, _, source = sys.argv
    img = Image.open(src).convert("RGBA")
    level = light_band(Image.open(source))
    before = light_band(img)
    cleared = flood(img) if before > level else 0
    a = np.array(img)
    pocketed = pockets(a)
    a[a[..., 3] < 96] = 0
    img = Image.fromarray(a)
    img.save(out)
    print(
        f"{src}: band {before} (source {level}), flooded {cleared}, pockets {pocketed}, "
        f"band after {light_band(img)}, bbox {img.getbbox()}"
    )


main()
