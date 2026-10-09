# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "resvg-py==0.5.0"]
# ///
"""Proves Caw's head stands centred in the top bar's glass circle and inside it on every drawing.

In the bar his head is the 512 still box drawn HEAD across, his optical centre (CAW_HEAD_CENTRE in
apps/dashboard/src/lib/cawco/home/caw-still.svelte.ts, CawMark.headCentre on Apple) on the centre of
his item's glass circle, CIRCLE across. That centre must be his rest's measured centroid (body, beak
and note together), so his head stands centred to the eye. The old needs-you beat, his whole body
waving a wing through a box round his head, had its wing cut at that circle's edge (owner: "the wave
animation is like clipped in the circle"). So every drawing of every head file (each enter's
drawings and its rest) is drawn there as each app draws it, at each screen scale, in light and in
dark, where his rim is one device pixel round his silhouette, and no ink may come within MARGIN
device px of the circle's inner edge. It prints his centre against the apps', each file's least
clearance per look in device px, and exits non-zero if the centres differ or any drawing breaks it.

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
# CAW_HEAD_CENTRE, shares of the still box: his optical centre, the centroid of his rest's
# silhouette (see centroid()). It once was a circle fitted to his crown with his beak and note
# opened away, which left the beak's reach all on one side: in the bar's smile its tip sat a
# pixel or two off the circle's edge and his head read right-heavy (owner: "caw is still not
# centered").
HEAD_CENTRE = (0.403, 0.522)
# How far the apps' centre may sit from the measured one, a share of the box (0.1 px at 20 px).
CENTRED = 0.005
MARGIN = 4  # device px the ink keeps clear of the circle's inner edge
BOX = 512
SUPER = 8  # samples a device px across, for clearance()
FINE = 1024  # px across the box, for centroid()


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


def centroid(svg: Path) -> tuple[float, float]:
    """His optical centre: the centre of his silhouette's area (body, beak and note together), as
    shares of the box."""
    alpha = np.asarray(
        Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=svg.read_text(), width=FINE, height=FINE)))).convert("RGBA"),
        dtype=np.float64,
    )[..., 3]
    ys, xs = np.mgrid[0:FINE, 0:FINE] + 0.5
    return float((alpha * xs).sum() / alpha.sum() / FINE), float((alpha * ys).sum() / alpha.sum() / FINE)


def clearance(svg: Path, head: int, circle: int, scale: int, dark: bool) -> float:
    """The least distance, device px, from his ink (and his rim, in dark) to the circle's edge.

    His box sits in the circle moved by (0.5 - HEAD_CENTRE) of his side, as each app moves it,
    snapped to the device pixel (the dashboard moves him in layout so his picture stays on whole
    pixels; Auto Layout rounds to the screen's scale). The drawing is sampled SUPER times finer than
    the device pixel and measured to his outline itself, not to the device pixels his antialiased
    edge touches, which would add up to a pixel depending on where his edge falls; his rim in dark
    is one device pixel wide round it."""
    side = circle * scale
    left = round((circle / 2 - HEAD_CENTRE[0] * head) * scale)  # his box's corner, device px
    top = round((circle / 2 - HEAD_CENTRE[1] * head) * scale)
    units = BOX / (head * scale)  # box units a device px
    fine = side * SUPER
    text = svg.read_text().replace(
        f'viewBox="0 0 {BOX} {BOX}"',
        f'viewBox="{-left * units} {-top * units} {side * units} {side * units}"',
    )
    alpha = np.asarray(
        Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=text, width=fine, height=fine)))).convert("RGBA")
    )[..., 3]
    ys, xs = np.nonzero(alpha >= 128)
    reach = np.sqrt((xs + 0.5 - fine / 2) ** 2 + (ys + 0.5 - fine / 2) ** 2).max() / SUPER
    return side / 2 - reach - (1 if dark else 0)


def main() -> None:
    rest = MASCOT / "loops" / "compacted" / "body-00.svg"
    x, y = centroid(rest)
    broken = abs(x - HEAD_CENTRE[0]) > CENTRED or abs(y - HEAD_CENTRE[1]) > CENTRED
    print(
        f"his optical centre ({x:.4f}, {y:.4f}), the apps' ({HEAD_CENTRE[0]}, {HEAD_CENTRE[1]})"
        + (f": FAIL, more than {CENTRED} apart" if broken else "")
    )
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
    print("his head centred, every drawing inside the circle" if not broken else f"FAIL: off centre, or ink within {MARGIN} device px of the circle")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
