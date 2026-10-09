# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.3", "pillow>=11.3", "scipy>=1.16", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Traces a template pose, the Caw a New project template card shows, into the one drawing it
rests on: assets/mascot/loops/<pose>/body-00.svg (+ timing.json, the loops' format).

A pose take is shot like a loop, from a status's still (the hero reference the take opens on), and
ends on a long still hold: Caw with the template's prop (a laptop, an easel). That end hold is the
pose. It is a rest (README, Contract: one drawing, held), with no drawn enter: the take opens on the
still at full size, and an enter starts on an empty page.

The take is traced as trace.py traces a loop, in the inks loops/rests.json names for the pose (the
props' cream, and tan for their shaded faces; a prop's thin tan outline traces black): drawing 00
is registered onto the still the take opens on, which gives the pose the stills' scale, and the
eye whites are told from see-through gaps forward from that still. No still has the pose, so
nothing is evidence from the take's end (see_through with no end still). Only the end hold is
written.

A pose is placed by its own ink, not by the still's ground line: some takes end with him stepped
down toward the camera (launch 1's toes 91 units below the still's), past the artboard. Keeping
the take's scale, the drawing is moved so his body (his black with the props' thin outlines
opened away, its largest part) is centred across the box, then only as far as it must go for its
ink to sit inside the safe area. The cards share a scale, and each frames its own pose.

Gates: drawing 00 on its still (overlap 0.9 or more); the end hold a second or more (he rests on a
drawing the take held); halo 0; no eye white see-through; no white marks; no shards (no cream or
white region under trace.py's MIN_REGION inside a tan face); the safe area, as trace_clip.py's
(the ink inside the line 3.5% in from each edge of the tighter of the take's frame and the
artboard). It prints each ink's share of the held frame that the trace inks the same, and exits
non-zero on a failed gate.

usage (from assets/mascot/scripts): uv run trace_pose.py <pose> <take> <still the take opens on>
"""
import io
import json
import sys
from pathlib import Path

import numpy as np
import resvg_py
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
import trace as T  # noqa: E402

OPENS = 0.9  # drawing 00's overlap with the still the take opens on, at or above which it is that still
HELD = 24  # frames the end hold lasts at least: one second
# A frame belongs to the end hold when, against the take's last frame, at most HOLD_PX pixels differ
# by more than HOLD_DELTA in any channel (H.264 noise on flat cel colour stays well under both; the
# measure the owner's review page gave each take's hold by). drawings_of()'s mean difference splits
# a hold where the video's noise drifts over its length.
HOLD_DELTA = 40
HOLD_PX = 600
EDGE = 1.0  # box units a placed pose keeps inside the safe line: its traced edge's soft half pixel
# The radius (take px) of the disk his body is found with: wider than any prop's outline (6 px at
# most, trace.py TAN_FACE) and than the laptop's keys, narrower than any part of his body.
BODY = 8
WHITE = np.array(T.INKS["white"])

pose, take, opens = sys.argv[1:4]
rest = json.loads((T.LOOPS / "rests.json").read_text())[pose]
if rest["loop"] != pose or rest["drawing"] != 0:
    sys.exit(f"{pose} rests on {rest['loop']}/body-{rest['drawing']:02d}: a pose rests on its own body-00")
T.use_inks(rest.get("inks", []))
names = ["paper", *T.INKS]

frames = T.frames_of(pose, take)
drawings = T.drawings_of(frames)
rgbs = [frames[m].astype(np.float64).mean(0) for _, _, m in drawings]
centres = T.take_palette(rgbs)
found = [T.inks(rgb, centres) for rgb in rgbs]
still = T.STILLS / f"light-{opens}.png"
place = T.placement(found[0][0], still)
shape = rgbs[0].shape[:2]
enclosed = [e for _, e in found]
papers = T.see_through(enclosed, [label for label, _ in found], T.paper_of(still, place, shape), None)
first = T.finish(found[0][0], rgbs[0], papers[0])
held = T.finish(found[-1][0], rgbs[-1], papers[-1])
place = T.register(first, place, still)
still_overlap = round(T.overlap(first, still, place), 4)

# Placed by its own ink: his body centred across the box, then moved only as far as the ink must
# go to sit inside the artboard's safe line (EDGE inside it, for the soft edge's half pixel).
scale, tx, ty = place
y, x = np.ogrid[-BODY : BODY + 1, -BODY : BODY + 1]
body = T.largest(ndimage.binary_opening(held == list(T.INKS).index("black") + 1, structure=x * x + y * y <= BODY * BODY))
bx = np.nonzero(body.any(0))[0]
iy, ix = np.nonzero(held > 0)
ink_box = (ix.min() * scale, iy.min() * scale, (ix.max() + 1) * scale, (iy.max() + 1) * scale)
lo = (T.APP_ARTBOARD[0] + T.SAFE * T.APP_ARTBOARD[2] + EDGE, T.APP_ARTBOARD[1] + T.SAFE * T.APP_ARTBOARD[2] + EDGE)
hi = (T.APP_ARTBOARD[0] + (1 - T.SAFE) * T.APP_ARTBOARD[2] - EDGE, T.APP_ARTBOARD[1] + (1 - T.SAFE) * T.APP_ARTBOARD[2] - EDGE)
nx = T.ARTBOARD / 2 - scale * (bx.min() + bx.max() + 1) / 2
nx = min(max(nx, lo[0] - ink_box[0]), hi[0] - ink_box[2])
ny = min(max(ty, lo[1] - ink_box[1]), hi[1] - ink_box[3])
moved = {"x": round(nx - tx, 2), "y": round(ny - ty, 2)}
place = (scale, nx, ny)
drawn = T.svg(T.trace_body(held), place)
out = T.LOOPS / pose
out.mkdir(parents=True, exist_ok=True)
for old in out.glob("*.svg"):
    old.unlink()
(out / "body-00.svg").write_text(drawn)
scale, tx, ty = place


# The take's whole frame in artboard units, and the drawing over it at the take's own pixels.
frame = (tx, ty, shape[1] * scale)
text = drawn.replace(f'viewBox="0 0 {T.ARTBOARD} {T.ARTBOARD}"', f'viewBox="{frame[0]} {frame[1]} {frame[2]} {frame[2]}"')
art = np.asarray(
    Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=text, width=shape[1], height=shape[0])))).convert("RGBA")
).astype(int)
opaque = art[..., 3] > 127

# Eye whites shown see-through: the regions see_through kept as eyes, against the drawing's holes.
ids, sizes = np.unique(enclosed[-1][enclosed[-1] > 0], return_counts=True)
eyes = np.isin(enclosed[-1], ids[sizes >= T.MIN_REGION]) & ~papers[-1]
eyes_cut = int((eyes & ndimage.binary_fill_holes(opaque) & ~opaque).sum() * scale**2)

# White marks: eye white touching the page round him (the props' cream may touch it).
white = opaque & (np.abs(art[..., :3] - WHITE).sum(-1) < 60)
for ink in rest.get("inks", []):
    white &= np.abs(art[..., :3] - np.array(T.INKS[ink])).sum(-1) >= 8
regions, n = ndimage.label(white)
white_marks = [
    {"px": int((regions == r).sum()), "at": [round(o + scale * c) for o, c in zip((tx, ty), ndimage.center_of_mass(regions == r)[::-1])]}
    for r in range(1, n + 1)
    if (regions == r).sum() >= 4 and (ndimage.binary_dilation(regions == r, iterations=2) & ~opaque).any()
]

# The safe area: the line 3.5% in from each edge of the tighter of the take's frame and the
# artboard (trace_clip.py's unsafe_drawings), on the drawing over the take's frame, in take pixels:
# nothing is traced outside the frame.
left, top = max(frame[0], T.APP_ARTBOARD[0]), max(frame[1], T.APP_ARTBOARD[1])
right = min(frame[0] + frame[2], T.APP_ARTBOARD[0] + T.APP_ARTBOARD[2])
bottom = min(frame[1] + frame[2], T.APP_ARTBOARD[1] + T.APP_ARTBOARD[2])
w, h = right - left, bottom - top
cols = tx + scale * (np.arange(shape[1]) + 0.5)
rows = ty + scale * (np.arange(shape[0]) + 0.5)
inner = ((rows >= top + T.SAFE * h) & (rows <= bottom - T.SAFE * h))[:, None] & (
    (cols >= left + T.SAFE * w) & (cols <= right - T.SAFE * w)
)[None, :]
outside_safe = int((opaque & ~inner).sum())

# How the trace inks the held frame: per ink of the frame (nearest of the take's own palette, in
# Lab, as halo() reads it), the share of its pixels the drawing fills with the same ink.
source = ((T.lab(rgbs[-1])[..., None, :] - T.lab(centres)) ** 2).sum(-1).argmin(-1)
traced = np.where(opaque, np.abs(art[..., None, :3] - np.array(list(T.INKS.values()))).sum(-1).argmin(-1) + 1, 0)
inked = {names[k]: int((held == k).sum() * scale**2) for k in range(1, len(names)) if (held == k).any()}
agree = {
    names[k]: round(float((traced[source == k] == k).mean()), 3)
    for k in range(1, len(names))
    if (source == k).sum() >= T.MIN_REGION
}
last = frames[-1].astype(np.int16)
hold = 0
for f in frames[::-1]:
    if (np.abs(f.astype(np.int16) - last).max(-1) > HOLD_DELTA).sum() > HOLD_PX:
        break
    hold += 1
# Shards: a region of cream or eye white under MIN_REGION take px whose ring is mostly tan, a
# flake of the face's soft gradient left inside it.
shards = []
if "tan" in T.INKS:
    tan_ink = list(T.INKS).index("tan") + 1
    for ink in ("cream", "white"):
        parts, count = ndimage.label(held == list(T.INKS).index(ink) + 1, structure=np.ones((3, 3)))
        for k, box in enumerate(ndimage.find_objects(parts), start=1):
            region = parts == k
            if region.sum() >= T.MIN_REGION:
                continue
            ring = held[ndimage.binary_dilation(region) & ~region]
            if (ring == tan_ink).mean() >= 0.5:
                shards.append({"ink": ink, "px": int(region.sum())})

ys, xs = np.nonzero(opaque)
probe = {
    "moved": moved,
    "shards": shards,
    "heldFrom": len(frames) - hold,
    "heldFrames": hold,
    "eyesCut": eyes_cut,
    "whiteMarks": white_marks,
    "outsideSafePx": outside_safe,
    "sameInk": agree,
    "inkBox": [round(tx + scale * xs.min(), 1), round(ty + scale * ys.min(), 1), round(tx + scale * (xs.max() + 1), 1), round(ty + scale * (ys.max() + 1), 1)],
}
timing = {
    "take": take,
    "still": opens,
    "frames": 2,
    "fps": 24,
    "drawings": [{"start": 0, "length": 2, "drawing": 0}],
    "placement": {"scale": place[0], "x": place[1], "y": place[2]},
    "stillOverlap": still_overlap,
    "inks": inked,
    "halo": {"00": T.halo(drawn, rgbs[-1], centres, place)},
    "probe": probe,
}
gates = {
    "opensOnStill": timing["stillOverlap"] >= OPENS,
    "held": probe["heldFrames"] >= HELD,
    "halo": timing["halo"]["00"] == 0,
    "eyes": eyes_cut < T.CUT_EYE,
    "whiteMarks": not white_marks,
    "noShards": not shards,
    "safeArea": not outside_safe,
}
probe["gates"] = gates
(out / "timing.json").write_text(T.dump_json(timing))
print(json.dumps({"pose": pose, **{k: timing[k] for k in ("stillOverlap", "inks", "halo")}, **probe}))
if not all(gates.values()):
    sys.exit(f"{pose}: failed {[g for g, ok in gates.items() if not ok]}")
