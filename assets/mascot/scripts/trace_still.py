# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Traces a resting status's still picture into the drawing it rests on,
assets/mascot/loops/<status>/body-00.svg (+ timing.json, the loops' format).

A rest is usually a drawing of one of the loops (loops/rests.json names it). A status that was
never a loop, the compacted Caw, has only its picture: assets/mascot/stills/light-<status>.png,
the owner's pick in the stills' 512 px box on a see-through page. This traces that picture with
trace.py's own tracer, in the inks the status names in rests.json, so its clips land on a drawing
made the way every other one is.

The picture is laid on white paper and drawn at the takes' own scale first, TAKE_SCALE px a unit
(a take's 1024 px frame shows 640 units). The tracer's spline fit works in pixels, so it rounds a
tip such as his head tuft by scale: traced at 2 px a unit the tuft came out 1.75 units lower than
in a take of the same drawing, and trace.py's refine(), which sizes a take by its extent against
the still, drew every landing 0.5% small (a ring of black missing all round, and a failed landing
gate at 97.7% of pixels). At the takes' scale the two are traced alike.

usage (from assets/mascot/scripts): uv run trace_still.py <status>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import trace as T  # noqa: E402

TAKE_SCALE = 1024 / 640

status = sys.argv[1]
rest = json.loads((T.LOOPS / "rests.json").read_text())[status]
if rest["loop"] != status or rest["drawing"] != 0:
    sys.exit(f"{status} rests on {rest['loop']}/body-{rest['drawing']:02d}, a loop's drawing: nothing to trace")
T.use_inks(rest.get("inks", []))

still = T.STILLS / f"light-{status}.png"
side = round(T.ARTBOARD * TAKE_SCALE)
picture = np.asarray(Image.open(still).convert("RGBA").resize((side, side), Image.Resampling.LANCZOS)).astype(np.float64)
alpha = picture[..., 3:4] / 255
rgb = picture[..., :3] * alpha + np.array(T.PAPER) * (1 - alpha)

# The picture is its own evidence at both ends: where it is see-through is paper, the rest ink.
centres = np.array([T.PAPER, *T.INKS.values()], np.float64)
label, enclosed = T.inks(rgb, centres)
paper = picture[..., 3] < 128
papers = T.see_through([enclosed], [label], paper, paper)
label = T.finish(label, rgb, papers[0])
place = (T.ARTBOARD / side, 0.0, 0.0)
drawn = T.svg(T.trace_body(label), place)

out = T.LOOPS / status
out.mkdir(parents=True, exist_ok=True)
for old in out.glob("*.svg"):
    old.unlink()
(out / "body-00.svg").write_text(drawn)
names = ["paper", *T.INKS]
inked = {names[k]: int((label == k).sum() * place[0] ** 2) for k in range(1, len(names)) if (label == k).any()}
timing = {
    "still": still.name,
    "frames": 2,
    "fps": 24,
    "drawings": [{"start": 0, "length": 2, "drawing": 0}],
    "placement": {"scale": place[0], "x": place[1], "y": place[2]},
    "stillOverlap": round(T.overlap(label, still, place), 4),
    "inks": inked,
    "halo": {"00": T.halo(drawn, rgb, centres, place)},
}
(out / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
print(f"{status}: body-00 from {still.name}, overlap with still {timing['stillOverlap']}, inks {inked}, halo {timing['halo']['00']} px")
