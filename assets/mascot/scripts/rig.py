# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.3", "pillow>=11.3", "scipy>=1.16", "potracer==0.0.4", "resvg-py==0.5.0"]
# ///
"""Splits Caw's open-eyed source still into his rig: one layer per moving part, each at its pivot.

usage: uv run rig.py            writes ../rig/caw-rig.svg and the dashboard's art module, then
                                measures frame 0 against the still (silhouette, bounds, centre of
                                mass, inks) at 64, 96, 160 and 384 px
       uv run rig.py --debug D  also writes the part map and frame-0 renders to folder D

The rig is the still, cut, not redrawn: every part is the still's own ink inside a region drawn
here by hand (REGIONS, in the still's 512 units), traced by potrace into one closed outline. Where
two parts meet, the one underneath runs on under the one on top (its GROW region), so a part can
turn about its pivot without opening a gap, and the cut itself always lies inside his black, where
it cannot be seen. What no still shows (his body's edge behind a raised wing, the white of his far
eye under its pupil, the root of his beak) is drawn as a smooth continuation of what it does show.

Outputs, both from this one source:
  ../rig/caw-rig.svg                             the layered drawing (groups by part, pivots as
                                                 data-pivot), frame 0 as the still
  apps/dashboard/src/lib/cawco/caw-rig/art.ts    the same paths and pivots for CawRig.svelte
"""

import io
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import potrace
import resvg_py
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = HERE.parent / "stills" / "light-ready.png"
DARK = HERE.parent / "stills" / "dark-ready.png"
SVG_OUT = HERE.parent / "rig" / "caw-rig.svg"
TS_OUT = ROOT / "apps" / "dashboard" / "src" / "lib" / "cawco" / "caw-rig" / "art.ts"

# The trace grid: four cells a unit, so an outline lands within a quarter unit of the still's edge.
U = 4
N = 512 * U

# His inks, sampled from the still's own pixels (median of each ink's flat core, opaque pixels).
INK = {
    "black": (29, 29, 27),  # body, 5600 px at (230-300, 300-380)
    "plane": (34, 34, 31),  # the upper beak's lighter plane, 200 px at (380-400, 180-190)
    "white": (248, 246, 241),  # eye whites, both eyes' cores
    "vermilion": (220, 92, 68),  # wing tips, both wings' cores
}


# ---------------------------------------------------------------- geometry helpers (units)


def poly(points: list[tuple[float, float]]) -> np.ndarray:
    """A polygon in the still's units as a mask on the trace grid."""
    img = Image.new("L", (N, N), 0)
    ImageDraw.Draw(img).polygon([(x * U, y * U) for x, y in points], fill=255)
    return np.asarray(img) > 127


def ellipse(cx: float, cy: float, rx: float, ry: float, deg: float = 0.0) -> np.ndarray:
    yy, xx = np.mgrid[0:N, 0:N]
    x = (xx + 0.5) / U - cx
    y = (yy + 0.5) / U - cy
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    u = (x * c + y * s) / rx
    v = (-x * s + y * c) / ry
    return u * u + v * v <= 1


def disc(cx: float, cy: float, r: float) -> np.ndarray:
    return ellipse(cx, cy, r, r)


def grow(mask: np.ndarray, units: float) -> np.ndarray:
    return ndimage.distance_transform_edt(~mask) <= units * U


def shrink(mask: np.ndarray, units: float) -> np.ndarray:
    return ndimage.distance_transform_edt(mask) > units * U


def main_piece(mask: np.ndarray) -> np.ndarray:
    """The largest connected piece alone, for a part whose cut leaves a scrap a neighbour draws."""
    lab, n = ndimage.label(mask)
    return mask if n < 2 else lab == np.bincount(lab.ravel())[1:].argmax() + 1


def biggest(mask: np.ndarray) -> np.ndarray:
    """The largest connected piece, holes filled: one outline."""
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    stray = [(int(s), ndimage.find_objects(lab)[i]) for i, s in enumerate(sizes) if i + 1 != keep and s > 4 * U * U]
    if stray:
        # A part is one outline: a second piece of any size would be dropped, so say so.
        where = "; ".join(f"{s} cells at x {sl[1].start / U:.0f}-{sl[1].stop / U:.0f}, y {sl[0].start / U:.0f}-{sl[0].stop / U:.0f}" for s, sl in stray)
        raise ValueError(f"a part splits into pieces: {where}")
    return ndimage.binary_fill_holes(lab == keep)


# ---------------------------------------------------------------- the still's inks


def load_inks() -> dict[str, np.ndarray]:
    """Each ink's share of every pixel on the trace grid (0-1), alpha included."""
    im = np.asarray(Image.open(SOURCE).convert("RGBA")).astype(np.float64)
    a = im[..., 3] / 255
    rgb = im[..., :3]
    # Holes the still's cut-out left inside him (a sliver between the big pupil and its white) show
    # the light page there: they are eye white, his, so they read as the still reads on white.
    solid = ndimage.binary_fill_holes(a > 0.5)
    inside = ndimage.binary_erosion(solid, iterations=2) & (a < 0.99)
    rgb = np.where(inside[..., None], rgb * a[..., None] + 255 * (1 - a[..., None]), rgb)
    a = np.where(inside | (solid & (a < 0.5)), 1.0, a)
    b, w, v = (np.array(INK[k], float) for k in ("black", "white", "vermilion"))
    # Unmix each pixel into black, white and vermilion (least squares, shares summing to one).
    m = np.stack([w - b, v - b], axis=1)  # 3x2
    rhs = (rgb - b).reshape(-1, 3).T  # 3xP
    sol, *_ = np.linalg.lstsq(m, rhs, rcond=None)
    ww = np.clip(sol[0], 0, 1).reshape(512, 512)
    wv = np.clip(sol[1], 0, 1).reshape(512, 512)
    planeness = np.clip((rgb.mean(-1) - 30.2) / 3.0, 0, 1) * (ww < 0.06) * (wv < 0.06)

    def up(x: np.ndarray) -> np.ndarray:
        return np.clip(ndimage.zoom(x, U, order=3, grid_mode=True, mode="grid-constant"), 0, 1)

    return {
        "alpha": up(a),
        "white": up(a * ww),
        "vermilion": up(a * wv),
        "plane": up(ndimage.uniform_filter(planeness, 5)),
        # A highlight stroke: grey over his black (the faintest, on wing R, peaks at 55).
        "line": up(a * np.clip((rgb.mean(-1) - 33) / 20, 0, 1)),
        "raw_alpha": a,
    }


# ---------------------------------------------------------------- tracing


def trace(mask: np.ndarray, *, smooth: float = 1.0) -> str:
    """One closed outline (potrace, curves and corners) in the still's units, as SVG path data."""
    mask = biggest(mask)
    bm = potrace.Bitmap(~mask)  # potracer traces the False cells
    path = bm.trace(turdsize=16, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=smooth, opticurve=True, opttolerance=0.2)
    # Holes are filled, so the piece is one outline: the curve with the biggest extent.

    def extent(c):
        xs = [c.start_point.x] + [s.end_point.x for s in c.segments]
        ys = [c.start_point.y] + [s.end_point.y for s in c.segments]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    c = max(path.curves, key=extent)
    f = lambda p: f"{p.x / U:.2f} {p.y / U:.2f}"  # noqa: E731
    out = [f"M{f(c.start_point)}"]
    for s in c.segments:
        if s.is_corner:
            out.append(f"L{f(s.c)}L{f(s.end_point)}")
        else:
            out.append(f"C{f(s.c1)} {f(s.c2)} {f(s.end_point)}")
    out.append("Z")
    return "".join(out)


# ---------------------------------------------------------------- the cut (the still's units)
#
# Each part's REGION is where it owns the still's ink at frame 0. Cuts run through his black, so
# they never show. A part underneath a neighbour also runs on under it (built in parts()).

# The neck: above it is his head, below it his body. It runs between the two notches where his
# head's outline meets his body's (left at 174, 243; right at 369, 247).
NECK = [(130, 236), (174, 243), (215, 257), (272, 263), (325, 257), (369, 247), (430, 240)]
# Under the neck on his right his head runs on as the ball it is (over his body, black on black),
# so a head tilted down over the right notch shows its own round cheek, never the cut's line.
HEAD_BALL = (272, 215, 104, 104)
HEAD = [(130, 0), (430, 0), *NECK[::-1]]
# The tuft: his two head feathers, and the dome of his head under them (a cubic through the
# outline either side, so the head without the tuft is round).
TUFT = [(185, 66), (300, 66), (300, 101), (268, 105), (250, 114), (234, 126), (216, 138), (185, 138)]


def cubic(p0, p1, p2, p3, n=24):
    return [
        (
            (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t**3 * p3[0],
            (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t**3 * p3[1],
        )
        for t in np.linspace(0, 1, n)
    ]


DOME = [*cubic((204, 148), (225, 120), (246, 110), (270, 106)), (310, 104), (310, 260), (204, 260)]
# His shoulders under his head: the top of his body where the head covers it, a smooth round rise
# from each neck notch in under the head. A tilted head lifts off one side of it, and what shows
# there is this one smooth curve, never a scrap of the head's own outline.
SHOULDERS = [
    *cubic((172, 246), (176, 228), (196, 210), (230, 204)),
    *cubic((314, 204), (346, 208), (362, 226), (369, 248)),
    (369, 300), (172, 300),
]
# The beak: what stands out of his face, right of the outline at its base.
BEAK = [(364, 163), (378, 146), (462, 146), (462, 234), (376, 234), (373, 207), (369, 185)]
# The beak's lighter upper plane, read off the still (its pixels sit 5 levels over his black):
# its lower edge runs from the tip back into his face, its upper edge from there round under his
# small eye to the beak's top.
PLANE_LOWER = [(437, 173), (424, 177), (404, 183), (388, 189), (370, 195), (354, 201), (340, 207), (322, 212), (306, 214)]
PLANE_UPPER = [(304, 210), (306, 200), (310, 190), (316, 182), (323, 176), (332, 170), (344, 166), (358, 163), (366, 160)]
PLANE = [*PLANE_LOWER, *PLANE_UPPER, (378, 146), (462, 146), (462, 171)]
# The root of the beak inside his face (black on black at frame 0; it shows only as the beak
# slides on a head turn): the plane's upper edge, then the lower beak's edge carried on into him.
BEAK_ROOT = [*PLANE_UPPER, (369, 185), (373, 207), (352, 217), (328, 221), (306, 216)]
# The lower beak runs from 6 units above the plane's lower edge down, so its edge never lies on
# the plane's (one edge each, no seam); toward the tip that tapers to nothing, so the upper beak
# keeps its whole tip when the lower one drops open.
LOWER_BAND = [
    (x, y - min(6, 0.12 * math.hypot(x - PLANE_LOWER[0][0], y - PLANE_LOWER[0][1]))) for x, y in PLANE_LOWER
] + [(300, 214), (300, 240), (470, 240), (470, 178)]

BIG_EYE_BOX = [(226, 136), (310, 136), (310, 240), (226, 240)]
SMALL_EYE_BOX = [(314, 122), (360, 122), (360, 172), (314, 172)]

# Wings. L and R are the viewer's left and right (his right wing is L, the near one). Each is two
# segments, as a hand is a palm and fingers: the shoulder is his whole black wing, coverts and
# their scalloped edge included, and the primaries are the vermilion feathers, drawn under it with
# their roots running on PRIMARY_ROOTS units under the coverts. The primaries turn about the
# middle of the line they leave the coverts along, so they fan and curl from under the black and
# no cut through his black ever shows. The wing's inner edge over his body is round at its foot,
# so a raised wing lifts off his body without a point.
# The black a wing owns: out from the notch where it meets his body, and over his body only as far
# as the coverts over its inner feathers, so a raised wing's trailing edge is round. Every vermilion
# feather on his side is the wing's whatever the region (FEATHERS_L / FEATHERS_R).
WING_L = [(0, 236), (150, 236), (198, 284), (210, 300), (208, 325), (196, 343), (182, 356), (168, 366), (152, 376), (138, 390), (120, 404), (0, 404)]
WING_R = [(365, 282), (378, 262), (382, 236), (512, 236), (512, 398), (400, 398), (388, 388), (376, 380), (366, 370), (366, 352), (372, 336), (374, 320), (371, 300)]
FEATHERS_L = [(0, 230), (256, 230), (256, 410), (0, 410)]
FEATHERS_R = [(256, 230), (512, 230), (512, 410), (256, 410)]
PRIMARY_ROOTS = 16

TAIL = [(100, 404), (140, 404), (170, 394), (180, 378), (204, 382), (222, 394), (228, 412), (212, 424), (190, 436), (100, 456)]
LEG_L = [(212, 421), (242, 421), (242, 452), (266, 460), (266, 496), (184, 496), (184, 460), (212, 452)]
LEG_R = [(288, 423), (312, 423), (312, 455), (364, 458), (364, 496), (266, 496), (266, 458), (288, 455)]

# His body's own outline where the still shows a wing, his tail or his head over it: round, on
# from the notches either side of his neck, down to his bottom.
TORSO = [
    (140, 200), (150, 236), (168, 252), (174, 264), (186, 274), (198, 283),
    *cubic((198, 283), (172, 312), (160, 356), (178, 384)),
    (198, 390), (210, 396), (216, 404), (219, 414), (219, 421), (242, 421), (242, 444), (290, 444), (290, 423),
    (312, 423), (312, 444), (380, 444), (380, 400),
    *cubic((360, 392), (392, 368), (388, 315), (365, 283)),
    (360, 272), (366, 258), (370, 248), (420, 200),
]

PIVOTS = {
    "body": (272, 420),  # the ground between his feet: breathing scales about it
    "head": (272, 258),  # the neck
    "tuft": (240, 122),
    "beak": (370, 186),
    # The gape: where the lower beak hinges, at the corner of his mouth on his face's outline.
    "jaw": (370, 203),
    "wingL": (205, 305),  # shoulder
    # The primaries' root: the middle of the line they leave the coverts along (L: 103, 262 to
    # 158, 370; R: 428, 267 to 361, 379, measured off the still), 10 units in under the coverts.
    "handL": (139, 311),
    "wingR": (355, 305),
    "handR": (386, 318),
    "tail": (222, 398),
    "legL": (229, 404),  # hip
    "legR": (301, 405),
}

# Grey highlight strokes the still draws over his black: a wing's edge where it crosses his body,
# and the split between his two tail feathers. Each box holds one stroke.
LINE_BOXES = {
    "wingL": [(184, 336), (216, 336), (216, 388), (184, 388)],
    "wingR": [(360, 274), (384, 274), (384, 336), (360, 336)],
    "tail": [(176, 408), (202, 408), (202, 432), (176, 432)],
}


def band_above(points: list[tuple[float, float]], dy: float) -> list[tuple[float, float]]:
    """The region above a polyline moved down by `dy`."""
    moved = [(x, y + dy) for x, y in points]
    return [(moved[0][0], 0), (moved[-1][0], 0), *moved[::-1]]


def hull(mask: np.ndarray) -> np.ndarray:
    from scipy.spatial import ConvexHull

    ys, xs = np.nonzero(mask)
    pts = np.stack([xs, ys], 1).astype(float)
    h = ConvexHull(pts)
    img = Image.new("L", (N, N), 0)
    ImageDraw.Draw(img).polygon([tuple(pts[i] + 0.5) for i in h.vertices], fill=255)
    return np.asarray(img) > 127


def moments(mask: np.ndarray) -> dict[str, float]:
    ys, xs = np.nonzero(mask)
    x, y = (xs + 0.5) / U, (ys + 0.5) / U
    cx, cy = x.mean(), y.mean()
    cov = np.cov(np.stack([x - cx, y - cy]))
    vals, vecs = np.linalg.eigh(cov)
    rmaj, rmin = 2 * math.sqrt(vals[1]), 2 * math.sqrt(vals[0])
    deg = math.degrees(math.atan2(vecs[1, 1], vecs[0, 1]))
    return {"cx": cx, "cy": cy, "rmaj": rmaj, "rmin": rmin, "deg": deg, "top": y.min(), "bottom": y.max(), "left": x.min(), "right": x.max()}


def crescent(m: dict[str, float], k: float = 0.84, thick: float = 0.17) -> str:
    """His closed eye: a white crescent along the eye's lower rim, thick in the middle and tapering
    to points (the idle still's closed eyes)."""
    cx, cy = m["cx"], m["cy"]
    # The white's ellipse, upright enough to read its x and y radii off the bounds.
    rx, ry = (m["right"] - m["left"]) / 2 * k, (m["bottom"] - m["top"]) / 2 * k
    a0, a1 = math.radians(18), math.radians(162)
    outer, inner = [], []
    for i in range(25):
        t = i / 24
        a = a0 + (a1 - a0) * t
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        outer.append((x, y))
        inner.append((x, y - thick * ry * 2 * math.sin(math.pi * t) ** 0.8))
    pts = outer + inner[::-1]
    return "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "Z"


def parts(ink: dict[str, np.ndarray]) -> dict:
    a = ink["alpha"]
    S = a > 0.5
    V = ink["vermilion"] > 0.5
    W = ink["white"] > 0.5
    yy = (np.arange(N)[:, None] + 0.5) / U * np.ones((1, N))

    head_r, tuft_r, dome = poly(HEAD), poly(TUFT), poly(DOME)
    beak_r, root_r = poly(BEAK), poly(BEAK_ROOT)

    # Eyes: the big one's white is its white with the pupil's hole filled; its pupil is the dark
    # inside. The small one's white is the hull of the crescent the still shows; its pupil an
    # ellipse fitted to the crescent's inner edge, wider than the white so it is clipped by it.
    big_white = biggest(W & poly(BIG_EYE_BOX))
    big_pupil = biggest(big_white & ~W & S)
    crescent_small = biggest(W & poly(SMALL_EYE_BOX))
    small_white = hull(crescent_small)
    small_pupil = ellipse(348.6, 146.0, 11.6, 20.0) & ~crescent_small
    whites = big_white | small_white

    # A part drawn under a neighbour runs on OVERLAP units past the cut, under it, so the two
    # outlines never lie on one line (where two anti-aliased edges meet, the page shows through).
    overlap = 4
    torso = poly(TORSO)

    tuft = S & tuft_r
    # The head runs 3 units on past the neck over the body, so the cut never shows at frame 0, but
    # not along his outline: there a scrap of the body's edge would turn with the head and stick out.
    # Only on his right: on his left the cut already leaves the outline going down into him.
    ball = ellipse(*HEAD_BALL) & S & ~head_r & torso & ~poly(WING_R) & poly([(300, 200), (512, 200), (512, 330), (300, 330)])
    head = S & (head_r | (grow(head_r, 3) & shrink(S, 1.5)) | ball) & ~shrink(tuft_r & ~dome, overlap) & ~beak_r

    plane = S & poly(PLANE) & ~grow(whites, 1)
    lower = (S & beak_r | root_r) & poly(LOWER_BAND)

    # The torso's corner over the right notch catches a head-feather tip, off the body: the head
    # draws it, so the body keeps its one piece (the coverage count proves nothing is lost).
    body = main_piece(S & torso & (~head_r | poly(SHOULDERS)))

    def under_body(region):
        r = poly(region)
        return S & (r | (grow(r, overlap) & torso))

    tail = under_body(TAIL) | (disc(*PIVOTS["tail"], 18) & shrink(S, 3))
    leg_l = under_body(LEG_L) | (poly([(220, 394), (237, 394), (237, 424), (220, 424)]) & shrink(S, 1.5))
    leg_r = under_body(LEG_R) | (poly([(296, 394), (308, 394), (308, 426), (296, 426)]) & shrink(S, 1.5))

    def wing(region, feathers, shoulder):
        verm = S & V & poly(feathers)
        black = S & poly(region) & ~V
        w = black | verm
        # The shoulder: his black wing, and a round root inside his body so it turns without
        # opening a gap.
        # The black's anti-aliased specks at the feathers' gaps join it within 1.5 units.
        whole = black | (disc(*shoulder, 22) & shrink(S, 3))
        arm = main_piece(grow(whole, 1.5)) & whole
        # The primaries: every feather, its root running on under the coverts (2 inside the
        # wing's outline, so its edge never lies on the black's).
        roots = grow(verm, PRIMARY_ROOTS) & shrink(w, 2) & ~V
        # Specks of dark red where two feathers' edges meet deep in a gap are feather, not wing.
        specks = black & ~arm
        return {"arm": {"black": arm}, "hand": {"vermilion": verm | roots | specks}}

    lines = {}
    for name, box in LINE_BOXES.items():
        lines[name] = (ink["line"] > 0.5) & poly(box) & S

    masks = {
        "tail": tail,
        "legL": leg_l,
        "legR": leg_r,
        "body": body,
        "wingR": wing(WING_R, FEATHERS_R, PIVOTS["wingR"]),
        "head": head,
        "tuft": tuft,
        "lower": lower,
        "plane": plane,
        "wingL": wing(WING_L, FEATHERS_L, PIVOTS["wingL"]),
        "eyes": {
            "big": {"white": big_white, "pupil": big_pupil},
            "small": {"white": small_white, "pupil": small_pupil},
        },
        "lines": lines,
        "S": S,
    }
    return masks


def coverage(m: dict) -> np.ndarray:
    """The union of every part at frame 0."""
    u = m["tail"] | m["legL"] | m["legR"] | m["body"] | m["head"] | m["tuft"] | m["lower"] | m["plane"]
    for w in ("wingL", "wingR"):
        u |= m[w]["arm"]["black"] | m[w]["hand"]["vermilion"]
    return u


def debug_map(m: dict, out: Path) -> None:
    """Each part's ink in its own hue over the still, the cuts drawn."""
    src = np.asarray(Image.open(SOURCE).convert("RGBA").resize((N // 2, N // 2), Image.LANCZOS)).astype(float)
    canvas = np.full((N // 2, N // 2, 3), 255.0)
    hues = {
        "tail": (120, 60, 160), "legL": (40, 120, 200), "legR": (40, 170, 220), "body": (60, 60, 60),
        "head": (30, 110, 60), "tuft": (90, 200, 90), "lower": (200, 150, 30), "plane": (240, 200, 60),
    }
    def put(mask, col, alpha=0.75):
        mm = mask[::2, ::2]
        canvas[mm] = canvas[mm] * (1 - alpha) + np.array(col) * alpha
    for k, col in hues.items():
        put(m[k], col)
    for w, (ca, ch) in {"wingL": ((180, 40, 40), (240, 120, 120)), "wingR": ((40, 40, 180), (120, 120, 240))}.items():
        put(m[w]["arm"]["black"], ca)
        put(m[w]["hand"]["vermilion"], ch)
    miss = m["S"] & ~coverage(m)
    put(miss, (255, 0, 255), 1.0)
    img = Image.fromarray(canvas.astype(np.uint8))
    d = ImageDraw.Draw(img)
    s = U / 2
    for pts in (NECK, TUFT, BEAK, WING_L, WING_R, TAIL, LEG_L, LEG_R, TORSO):
        d.line([(x * s, y * s) for x, y in pts], fill=(255, 0, 255), width=1)
    for k, (x, y) in PIVOTS.items():
        d.ellipse([x * s - 4, y * s - 4, x * s + 4, y * s + 4], outline=(255, 0, 0), width=2)
    img.save(out / "part-map.png")
    print(f"  uncovered silhouette cells: {int(miss.sum())}")
    lab, n = ndimage.label(miss)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        size = int((lab[sl] == i).sum())
        if size > 3:
            print(f"    {size} cells at x {sl[1].start / U:.1f}-{sl[1].stop / U:.1f}, y {sl[0].start / U:.1f}-{sl[0].stop / U:.1f}")


def hexa(rgb) -> str:
    return "#" + "".join(f"{round(c):02x}" for c in rgb)


def line_ink(mask: np.ndarray) -> str:
    """A highlight stroke's colour: the still's mean over the cells it is traced from."""
    im = np.asarray(Image.open(SOURCE).convert("RGBA")).astype(float)
    small = mask.reshape(512, U, 512, U).any(axis=(1, 3))
    return hexa(im[small][:, :3].mean(0))


def art(m: dict) -> dict:
    """Every layer as path data, with its pivot and inks: what the SVG and the dashboard draw."""

    def wing(w):
        return {
            "arm": {"black": trace(w["arm"]["black"])},
            "hand": {"vermilion": trace(w["hand"]["vermilion"])},
        }

    def eye(white, pupil):
        mo = moments(white)
        return {
            "white": trace(white),
            "lid": trace(grow(white, 2)),
            "pupil": trace(pupil),
            "closed": crescent(mo),
            # Where the white's middle and the pupil's sit, and how far the pupil can travel from
            # the middle before it meets the white's edge (2 short of it): the gaze's scale.
            "center": [round(mo["cx"], 2), round(mo["cy"], 2)],
            "pupilAt": [round(moments(pupil)["cx"], 2), round(moments(pupil)["cy"], 2)],
            "travel": [
                round((mo["right"] - mo["left"]) / 2 - (moments(pupil)["right"] - moments(pupil)["left"]) / 2 - 2, 2),
                round((mo["bottom"] - mo["top"]) / 2 - (moments(pupil)["bottom"] - moments(pupil)["top"]) / 2 - 2, 2),
            ],
            # The lid's travel: from 2 above the white's top to 2 below its bottom.
            "top": round(mo["top"] - 2, 2),
            "bottom": round(mo["bottom"] + 2, 2),
            "left": round(mo["left"] - 2, 2),
            "right": round(mo["right"] + 2, 2),
        }

    lines = {k: {"d": trace(v, smooth=1.2), "ink": line_ink(v)} for k, v in m["lines"].items()}
    return {
        "inks": {k: hexa(v) for k, v in INK.items()},
        "pivots": {k: list(v) for k, v in PIVOTS.items()},
        "tail": {"black": trace(m["tail"]), "line": lines["tail"]},
        "legL": {"black": trace(m["legL"])},
        "legR": {"black": trace(m["legR"])},
        # A wing's edge line lies on his body where the wing crosses it, and fades as it lifts.
        "body": {"black": trace(m["body"]), "lines": {"wingL": lines["wingL"], "wingR": lines["wingR"]}},
        "wingR": wing(m["wingR"]),
        "head": {"black": trace(m["head"])},
        "tuft": {"black": trace(m["tuft"])},
        "beak": {"lower": trace(m["lower"]), "plane": trace(m["plane"])},
        "eyes": {
            "big": eye(m["eyes"]["big"]["white"], m["eyes"]["big"]["pupil"]),
            "small": eye(m["eyes"]["small"]["white"], m["eyes"]["small"]["pupil"]),
        },
        "wingL": wing(m["wingL"]),
    }


def svg(a: dict) -> str:
    """The layered drawing at frame 0: one group per moving part, each naming its pivot."""
    k = a["inks"]
    piv = a["pivots"]

    def g(part: str, body: str, pivot: str | None = None) -> str:
        p = piv[pivot or part]
        return f'<g id="caw-{part}" data-part="{part}" data-pivot="{p[0]} {p[1]}">{body}</g>'

    def path(d: str, fill: str, extra: str = "") -> str:
        return f'<path d="{d}" fill="{fill}"{extra}/>'

    def wing(side: str) -> str:
        w = a[f"wing{side}"]
        hand = g(f"hand{side}", path(w["hand"]["vermilion"], k["vermilion"]))
        arm = path(w["arm"]["black"], k["black"])
        return g(f"wing{side}", hand + arm)

    def eye(name: str) -> str:
        e = a["eyes"][name]
        h = e["bottom"] - e["top"]
        return (
            f'<g id="caw-eye-{name}" data-part="eye">'
            + path(e["white"], k["white"])
            # The pupil is clipped to the white grown by 2, as the lids are: clipped to the white
            # itself its edge would lie on the white's and leak a light hairline round it.
            + f'<g clip-path="url(#caw-lid-{name})">{path(e["pupil"], k["black"], " data-part=\"pupil\"")}</g>'
            + f'<g clip-path="url(#caw-lid-{name})" data-part="lids">'
            + f'<rect x="{e["left"]}" y="{e["top"]}" width="{e["right"] - e["left"]}" height="0" fill="{k["black"]}" data-lid="upper"/>'
            + f'<rect x="{e["left"]}" y="{e["bottom"]}" width="{e["right"] - e["left"]}" height="0" fill="{k["black"]}" data-lid="lower" data-travel="{h:.2f}"/>'
            + "</g>"
            + path(e["closed"], k["white"], ' opacity="0" data-part="closed"')
            + "</g>"
        )

    defs = "".join(
        f'<clipPath id="caw-lid-{n}"><path d="{e["lid"]}"/></clipPath>'
        for n, e in a["eyes"].items()
    ) + f'<clipPath id="caw-head-clip"><path d="{a["head"]["black"]}"/></clipPath>'
    head = g(
        "head",
        path(a["head"]["black"], k["black"])
        + g("tuft", path(a["tuft"]["black"], k["black"]))
        + f'<g id="caw-face" data-part="face" clip-path="url(#caw-head-clip)">{eye("big")}{eye("small")}</g>'
        + g("beak", g("jaw", path(a["beak"]["lower"], k["black"])) + path(a["beak"]["plane"], k["plane"])),
    )
    layers = (
        g("tail", path(a["tail"]["black"], k["black"]) + path(a["tail"]["line"]["d"], a["tail"]["line"]["ink"]))
        + g("legL", path(a["legL"]["black"], k["black"]))
        + g("legR", path(a["legR"]["black"], k["black"]))
        + g("body", path(a["body"]["black"], k["black"]) + "".join(path(v["d"], v["ink"], f' data-line="{n}"') for n, v in a["body"]["lines"].items()))
        + wing("R")
        + head
        + wing("L")
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" overflow="visible">'
        "<title>Caw, rigged: frame 0 is his open-eyed still (assets/mascot/stills/light-ready.png)</title>"
        "<desc>Generated by assets/mascot/scripts/rig.py. One group per moving part, each with its pivot "
        "(data-pivot, in these 512 units). L and R are the viewer's left and right.</desc>"
        f"<defs>{defs}</defs><g id=\"caw\" data-part=\"caw\">{layers}</g></svg>\n"
    )


def ts(a: dict) -> str:
    return (
        "/**\n"
        " * Caw's rig, as drawn: every layer's outline in his still's 512 units, with its pivot and\n"
        " * inks. Generated by assets/mascot/scripts/rig.py from assets/mascot/stills/light-ready.png\n"
        " * (`uv run rig.py`); do not edit by hand. The same drawing is assets/mascot/rig/caw-rig.svg.\n"
        " */\n"
        f"export const CAW_ART = {json.dumps(a, indent=2)} as const;\n"
        "\nexport type CawArt = typeof CAW_ART;\n"
    )


def render(svg_text: str, size: int) -> np.ndarray:
    png = bytes(resvg_py.svg_to_bytes(svg_string=svg_text, width=size, height=size))
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGBA")).astype(float)


def source_at(size: int) -> np.ndarray:
    """The still at `size`, area-averaged on premultiplied ink (as a browser scales an image)."""
    im = np.asarray(Image.open(SOURCE).convert("RGBA")).astype(float)
    a = im[..., 3:] / 255
    pre = np.concatenate([im[..., :3] * a, a * 255], -1)
    f = 512 / size
    if f == int(f):
        f = int(f)
        out = pre.reshape(size, f, size, f, 4).mean(axis=(1, 3))
    else:
        out = np.stack([np.asarray(Image.fromarray(pre[..., c].astype(np.float32), "F").resize((size, size), Image.BOX)) for c in range(4)], -1)
    al = out[..., 3:] / 255
    rgb = np.where(al > 0, out[..., :3] / np.maximum(al, 1e-6), 0)
    return np.concatenate([rgb, out[..., 3:]], -1)


def stats(img: np.ndarray, size: int) -> dict[str, float]:
    a = img[..., 3] / 255
    on = a > 0.5
    ys, xs = np.nonzero(on)
    yy, xx = np.mgrid[0:size, 0:size]
    w = a.sum()
    return {
        "left": xs.min(), "right": xs.max() + 1, "top": ys.min(), "bottom": ys.max() + 1,
        "cx": ((xx + 0.5) * a).sum() / w, "cy": ((yy + 0.5) * a).sum() / w, "ink": w,
    }


def measure(svg_text: str, debug: Path | None) -> bool:
    """Frame 0 against the still at each size: alpha bounds and centre of mass (as a share of the
    size), silhouette overlap, and the mean colour gap where both are solid."""
    ok = True
    for size in (64, 96, 160, 384, 512):
        src, rig = source_at(size), render(svg_text, size)
        s, r = stats(src, size), stats(rig, size)
        bounds = max(abs(s[k] - r[k]) for k in ("left", "right", "top", "bottom")) / size * 100
        com = math.hypot(s["cx"] - r["cx"], s["cy"] - r["cy"]) / size * 100
        a, b = src[..., 3] > 127, rig[..., 3] > 127
        iou = (a & b).sum() / (a | b).sum()
        solid = (src[..., 3] > 250) & (rig[..., 3] > 250)
        gap = np.abs(src[..., :3] - rig[..., :3])[solid].mean()
        ink = (rig[..., 3].sum() - src[..., 3].sum()) / src[..., 3].sum() * 100
        print(f"  {size:>3}px  bounds {bounds:.2f}%  centre of mass {com:.2f}%  silhouette IoU {iou:.4f}  ink {ink:+.2f}%  colour gap {gap:.2f}/255")
        if size == 160:
            ok = bounds <= 2 and com <= 2
        if debug:
            pair = np.concatenate([src, rig], 1)
            bg = np.full(pair.shape[:2] + (3,), 255.0)
            al = pair[..., 3:] / 255
            Image.fromarray((bg * (1 - al) + pair[..., :3] * al).astype(np.uint8)).save(debug / f"frame0-{size}.png")
    return ok


if __name__ == "__main__":
    debug = Path(sys.argv[sys.argv.index("--debug") + 1]) if "--debug" in sys.argv else None
    ink = load_inks()
    m = parts(ink)
    if debug:
        debug.mkdir(parents=True, exist_ok=True)
        debug_map(m, debug)
    a = art(m)
    text = svg(a)
    SVG_OUT.parent.mkdir(parents=True, exist_ok=True)
    SVG_OUT.write_text(text)
    TS_OUT.parent.mkdir(parents=True, exist_ok=True)
    TS_OUT.write_text(ts(a))
    # The repository's formatter (`bun fmt`) lays it out, so what is written is final.
    subprocess.run(["bun", str(ROOT / "scripts" / "fmt.ts"), str(TS_OUT)], check=True, capture_output=True)
    print(f"wrote {SVG_OUT.relative_to(ROOT)} ({len(text) // 1024} KB) and {TS_OUT.relative_to(ROOT)}")
    print("frame 0 against the still:")
    if not measure(text, debug):
        print("frame 0 is more than 2% off the still at 160px")
        sys.exit(1)
