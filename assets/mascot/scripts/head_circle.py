# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "resvg-py==0.5.0"]
# ///
"""Proves Caw's head stays inside the top bar's glass circle on every drawing he shows there.

In the bar his head is the 512 still box drawn HEAD across, his head's circle (CAW_HEAD_CENTRE in
apps/dashboard/src/lib/cawco/home/caw-still.svelte.ts, CawMark.headCentre on Apple) on the centre of
his item's glass circle, CIRCLE across. The old needs-you beat, his whole body waving a wing through
a box round his head, had its wing cut at that circle's edge (owner: "the wave animation is like
clipped in the circle"). So every drawing of every head file (each enter's drawings and its rest)
is drawn there as each app draws it, at each screen scale, in light and in dark, where his rim is
one device pixel round his silhouette, and no ink may come within MARGIN device px of the circle's
inner edge. It prints each file's least clearance per look in device px and exits non-zero if any
drawing breaks it.

usage (from assets/mascot/scripts): uv run head_circle.py
"""
import io
import json
import sys
from pathlib import Path

import numpy as np
import resvg_py
from PIL import Image
from scipy import ndimage

MASCOT = Path(__file__).resolve().parent.parent
# Each app's head in its circle: his head's side and the circle's, CSS px or points, and the
# screen scales it is drawn at. The dashboard: NeedsCaw.svelte HEAD and RING_BOX; Apple:
# NeedsCawButton.head and .side.
APPS = {"web": (20, 36, (1, 3)), "apple": (22, 36, (2, 3))}
HEAD_CENTRE = (0.35, 0.496)  # CAW_HEAD_CENTRE, shares of the still box
MARGIN = 2  # device px the ink keeps clear of the circle's inner edge
BOX = 512


def head_files() -> list[str]:
    """The bar's head files (scene.mjs HEADS): the rests named head-<…>."""
    return [n for n in json.loads((MASCOT / "loops" / "rests.json").read_text()) if n.startswith("head-")]


def drawings(name: str) -> list[Path]:
    """Every drawing the bar shows of a file: its enter's, in playing order, and its rest."""
    rest = json.loads((MASCOT / "loops" / "rests.json").read_text())[name]
    clip = MASCOT / "clips" / f"{name}-enter"
    timing = json.loads((clip / "timing.json").read_text())
    shown = [clip / f"body-{s['drawing']:02d}.svg" for s in timing["drawings"]]
    return [*shown, MASCOT / "loops" / rest["loop"] / f"body-{rest['drawing']:02d}.svg"]


def clearance(svg: Path, head: int, circle: int, scale: int, dark: bool) -> float:
    """The least distance, device px, from his ink (and his rim, in dark) to the circle's edge."""
    side = circle * scale
    units = BOX / head  # box units a CSS px or point
    cx, cy = HEAD_CENTRE[0] * BOX, HEAD_CENTRE[1] * BOX
    half = circle / 2 * units
    text = svg.read_text().replace(
        f'viewBox="0 0 {BOX} {BOX}"', f'viewBox="{cx - half} {cy - half} {2 * half} {2 * half}"'
    )
    alpha = np.asarray(
        Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=text, width=side, height=side)))).convert("RGBA")
    )[..., 3]
    ink = alpha > 0
    if dark:
        ink = ndimage.binary_dilation(ink, iterations=1)
    ys, xs = np.nonzero(ink)
    reach = np.sqrt((xs + 0.5 - side / 2) ** 2 + (ys + 0.5 - side / 2) ** 2).max() + 0.5
    return side / 2 - reach


def main() -> None:
    broken = False
    for name in head_files():
        shown = drawings(name)
        row = []
        for app, (head, circle, scales) in APPS.items():
            for scale in scales:
                for dark in (False, True):
                    least = min(clearance(svg, head, circle, scale, dark) for svg in shown)
                    broken |= least < MARGIN
                    row.append(f"{app} {scale}x {'dark' if dark else 'light'} {least:.1f}")
        print(f"{name}: {len(shown)} drawings, least clearance (device px): " + ", ".join(row))
    print("every drawing inside the circle" if not broken else f"FAIL: ink within {MARGIN} device px of the circle")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
