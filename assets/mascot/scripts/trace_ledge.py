# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Traces a ledge clip into assets/mascot/clips/<clip>/ (body-NN.svg + timing.json, the loops'
format): Caw coming up from behind a ledge and peering over it, for a page that puts its own
ledge under him. No status file holds them; peer-over is the enter of peek.riv (scene.mjs).

The take is shot with the ledge as a flat blue block (#2F6BFF), an ink he does not carry, from
the line to the bottom and side edges. The block is keyed out to paper, so the drawings hold only
Caw: above the line everything of him that shows, below it only what hangs in front of the ledge
(his wing tips). The take's frame is the 512 box itself (scale 512 / frame width, no offset), and
timing.json's probe gives the line as a share of the box's height.

The landing is measured against the clip's end picture, stills/ledge-<clip>.png (the picture the
take was shot towards). Gates: the safe area (no ink within 3.5% of any edge of the frame on any
drawing: only the ledge hides him, never the frame); on twos; and the landing, its silhouette at
0.9 IoU or more with the end picture's. The adapter's grid is odd (17k + 5 frames), so the held
landing is held one frame more.

usage (from assets/mascot/scripts): uv run trace_ledge.py <clip> <take>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
import trace as T  # noqa: E402

name, take = sys.argv[1:3]
SAFE = 0.035  # EBU R95 / ITU-R BT.1848 action-safe margin, in from each edge
LANDING = 0.9
DUST = 800  # ink px at the take's size under which a drawing is the empty page
out = T.LOOPS.parent / "clips" / name
out.mkdir(parents=True, exist_ok=True)
for old in out.glob("*"):
    old.unlink()


def blue(rgb: np.ndarray) -> np.ndarray:
    """The ledge's block and its soft edges: blue well above red."""
    return rgb[..., 2].astype(int) - rgb[..., 0].astype(int) > 25


# trace.py tells an eye white from a see-through gap by where a status's still has paper. There
# is no still here, so every enclosed white is told by its shape and ring (trace_clip.py's rule).
def no_evidence(enclosed: list, seed_paper: np.ndarray) -> list:
    decided = []
    for regions in enclosed:
        ids, sizes = np.unique(regions[regions > 0], return_counts=True)
        decided.append({int(r): (False, False) for r in ids[sizes >= T.MIN_REGION]})
    return decided


T.decide = no_evidence
frames = T.frames_of(name, take).copy()
h, w = frames.shape[1:3]
line = int(np.argmax(blue(frames[0]).mean(1) > 0.5))
frames[blue(frames)] = 255
drawings = T.drawings_of(frames)
rgbs = [frames[m].astype(np.float64).mean(0) for _, _, m in drawings]
centres = T.take_palette(rgbs)
found = [T.inks(rgb, centres) for rgb in rgbs]
none = np.zeros((h, w), bool)
papers = T.see_through([e for _, e in found], [label for label, _ in found], none, none)
labels = [T.finish(label, rgb, paper) for (label, _), rgb, paper in zip(found, rgbs, papers)]
for label in labels:
    if 0 < (label > 0).sum() < DUST:
        label[:] = 0
place = (512 / w, 0.0, 0.0)
shown, unique = [], []
for i, label in enumerate(labels):
    again = next(
        (u for u, j in enumerate(unique) if np.abs(rgbs[i] - rgbs[j]).mean() < T.SAME_DRAWING or (not label.any() and not labels[j].any())),
        None,
    )
    if again is None:
        again = len(unique)
        unique.append(i)
        (out / f"body-{again:02d}.svg").write_text(T.svg(T.trace_body(label), place))
    shown.append(again)
slots = T.holds(drawings, shown)
if slots[-1]["length"] % 2:
    slots[-1]["length"] += 1
inked = [labels[unique[s["drawing"]]] > 0 for s in slots]

margin = round(SAFE * w)
inner = np.zeros((h, w), bool)
inner[margin : h - margin, margin : w - margin] = True
outside = [k + 1 for k, ink in enumerate(inked) if (ink & ~inner).any()]
end = np.asarray(Image.open(T.STILLS / f"ledge-{name}.png").convert("RGB").resize((w, h)))
# His eye whites are part of him: the traced drawing fills them, so the picture's mask does too.
end_caw = ndimage.binary_fill_holes(~blue(end) & (end.astype(int).sum(-1) < 740))
iou = float((inked[-1] & end_caw).sum() / (inked[-1] | end_caw).sum())
report = {
    "ledgeLine": round(line / h, 4),
    "inkPx": [int(ink.sum()) for ink in inked],
    "topRow": [int(np.nonzero(ink.any(1))[0].min()) if ink.any() else None for ink in inked],
    "lowestRow": [int(np.nonzero(ink.any(1))[0].max()) if ink.any() else None for ink in inked],
    "belowLinePx": [int(ink[line + 2 :].sum()) for ink in inked],
    "outsideSafe": outside,
    "landingIou": round(iou, 4),
    "gates": {
        "safeArea": not outside,
        "onTwos": all(s["start"] % 2 == 0 and s["length"] % 2 == 0 for s in slots),
        "landing": iou >= LANDING,
    },
}
timing = {
    "take": take,
    "frames": sum(s["length"] for s in slots),
    "fps": 24,
    "drawings": slots,
    "placement": {"scale": place[0], "x": 0.0, "y": 0.0},
    "probe": report,
}
(out / "timing.json").write_text(T.dump_json(timing))
print(json.dumps({"slots": len(slots), "frames": timing["frames"], **report}))
if not all(report["gates"].values()):
    sys.exit(f"{name}: failed {[g for g, ok in report['gates'].items() if not ok]}")
