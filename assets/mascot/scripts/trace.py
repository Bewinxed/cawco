# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.3", "pillow>=11.3", "scipy>=1.16", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Traces Caw's loop takes into the vector drawings the status files (../caw/<status>.riv) are built from.

usage: uv run trace.py [loop ...]        (default: every loop in ../loops/takes.json)
       uv run trace.py --halo [loop ...] yellow traced where the take has none, per drawing on disk
       uv run trace.py --eyes [loop ...] eye whites the drawings on disk show see-through; exits
                                         non-zero if any loop has one

../loops/takes.json lists each status's variant loops: a loop name, its Backlot take (shot with the
H3 keyframe sequence adapter, on twos) and the still it opens and closes on. For each loop this
writes ../loops/<loop>/:
  body-NN.svg   drawing NN: Caw's silhouette in black (which also carries the cream rim) and each
                other ink over it, traced by vtracer
and ../loops/<loop>/timing.json: the take's frame count and each hold's start and length in
24 fps frames, on twos, with the drawing it shows.

The SVGs are in the stills' 512 px units, on their shared scale and ground line: drawing 00 is
registered onto the loop's light still (assets/mascot/stills).
"""

import io
import json
import re
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import resvg_py
import vtracer
from PIL import Image
from scipy import ndimage
from scipy.spatial import ConvexHull, Delaunay, QhullError

HERE = Path(__file__).resolve().parent
LOOPS = HERE.parent / "loops"
STILLS = HERE.parent / "stills"
CACHE = Path.home() / ".cache" / "caw-loops"
MEDIA = "https://backlot.bewinxed.com/api/takes/{}/media"
# The repo formatter's line width (Biome).
LINE = 80


def dump_json(value: object) -> str:
    """`value` as JSON in the layout the repo's formatter keeps, so a fresh trace passes lint:
    two-space indents, every object one key to a line, and an array on one line where it fits the
    line width, else one element to a line (numbers alone are packed, as many to a line as fit)."""

    def inline(v: object) -> str | None:
        if isinstance(v, dict):
            return "{}" if not v else None
        if isinstance(v, list):
            parts = [inline(e) for e in v]
            return None if None in parts else f"[{', '.join(parts)}]"
        return json.dumps(v)

    def lay(v: object, depth: int, lead: int) -> str:
        pad, inner = "  " * depth, "  " * (depth + 1)
        flat = inline(v)
        # A value shares its line with what leads it (the indent and a key) and a comma after.
        if flat is not None and lead + len(flat) + 1 <= LINE:
            return flat
        if isinstance(v, dict):
            rows = [f"{inner}{json.dumps(k)}: {lay(e, depth + 1, len(inner) + len(json.dumps(k)) + 2)}" for k, e in v.items()]
            return "{\n" + ",\n".join(rows) + f"\n{pad}}}"
        if all(isinstance(e, (int, float)) and not isinstance(e, bool) for e in v):
            lines, line = [], inner
            for k, e in enumerate(v):
                word = json.dumps(e) + ("," if k < len(v) - 1 else "")
                if line != inner and len(line) + 1 + len(word) > LINE:
                    lines.append(line)
                    line = inner
                line += ("" if line == inner else " ") + word
            return "[\n" + "\n".join([*lines, line]) + f"\n{pad}]"
        return "[\n" + ",\n".join(inner + lay(e, depth + 1, len(inner)) for e in v) + f"\n{pad}]"

    return lay(value, 0, 0) + "\n"

# Caw's inks, measured from his masters (~/cawco-design-kit/caw/*.png, coarse colour histogram of
# opaque pixels): every traced region is filled with exactly one of these.
INKS = {
    "black": (27, 27, 25),
    "vermilion": (227, 88, 63),
    "white": (250, 248, 244),
    "yellow": (242, 204, 107),
}
PAPER = (255, 255, 255)
# Inks only some statuses carry; a status names its own in loops/rests.json ("inks") and
# use_inks() adds them, so every other take is traced with the four above, as it always was.
#   cream: the paper note in the compacted Caw's beak, measured from the owner's pick (median of
#          the note's opaque pixels). It is the one light ink that touches the page around him.
#   tan:   a template pose prop's shaded face (the magnifier's rim, the easel's side, the
#          laptop's keys and front edge): the median of the faces' core pixels (away from their
#          soft edges) in the held frames of seo 1, design 4 and code 5, (199, 182, 148),
#          (212, 201, 170) and (202, 185, 158) each, 5th-95th percentile (174, 157, 128) to
#          (218, 201, 173). Only tan_outline() draws it (see TAN_FACE).
EXTRA_INKS = {
    "cream": (251, 244, 229),
    "tan": (201, 185, 157),
}
# Red minus blue a pixel needs to read as cream, and the darkest channel it may have. The note
# measures 22 (its fold's shadow 20); the page and his eye whites, neutral, under 3. Without the
# gate the soft edge of an eye white, a grey, lands nearer cream than white.
CREAM_WARM = 10
CREAM_LIGHT = 180
# Both rules below run only where a status traces the cream ink (the props a take carries are
# cream), so every take traced in his four inks alone is traced exactly as before.
# Some takes draw his eye whites a touch warm, so the cream gate takes their pixels for the note.
# Measured on 25 hero takes that carry a cream prop: enclosed regions ringed mostly by black with
# a pupil in them (his eye whites, 143 regions) have a median red minus blue of 6-16, while the
# cream ink is 22 and the cream props measure 29 at the median. So an enclosed region of paper,
# white and cream, ringed by black over EYE_RING of its edge, whose median red minus blue is under
# EYE_WARM, is an eye white and its cream pixels are white. A cream prop with a black outline
# keeps its cream: its median is over EYE_WARM. (A pupil test was tried and dropped: a pupil
# looking down bites in from the eye white's edge, and seo take 1's eyes stayed cream.)
EYE_WARM = 20
EYE_RING = 0.5
# A prop's thin outline that a take draws tan instead of black (about 198, 181, 150): measured
# next to the props of the same takes (5th-95th percentile), red minus green 5-27, green minus
# blue 12-48, red minus blue 18-76, darkest channel 102-179, lightest 136-226. Colour alone is not
# enough: the soft edges of his vermilion and his yellow marks against paper or black fall inside
# these bands too (51,277 such pixels over the 22 loops, at every hue the outline has). The
# outline always borders a cream prop, so a connected run of TAN pixels that touches cream is the
# outline and is traced in black. Red minus blue starts at 26: the compacted note's own fold
# shadow, a grey line in the owner's pick (about 197, 190, 176), measures 20-24, while the
# outline's core measures 40 at the median (89% of its pixels at 26 or more; the rest are its
# soft edge).
TAN = {"rg": (-100, 45), "gb": (10, 45), "rb": (26, 70), "min": (110, 199), "max": (0, 225)}
# Where a status traces the tan ink too, a tan run is an outline only where it is thin: the parts
# of it a disk TAN_FACE take pixels across fits inside are a shaded face, traced tan, and the rest
# of the run, its thin edges, black. Measured on the held frames of seo 1, design 4 and code 5
# (local width, twice the distance to the run's edge on its medial pixels): the props' outlines
# run 2 px at the median and 6 at most; the faces 6 to 19 (the magnifier's rim), 6 to 10 (the
# laptop's keys), 17 to 24 (its front edge). 7 take px is 4.2 box units at the takes' 0.607.
TAN_FACE = 7
# The narrowest run of black (take px across) that is his body, not a prop's outline: wider than
# the props' outlines (6 px at most, as TAN_FACE measures them), and his black round an eye white
# is many times that.
HIS_BLACK = 9
# Two frames are the same drawing when they differ by less than this mean absolute RGB difference
# (held pairs measure <= 0.7, a new drawing >= 6).
SAME_DRAWING = 1.5
# The smallest ink region kept, in take pixels (a tick mark or pupil is several hundred).
MIN_REGION = 40
# take_palette: the fewest sampled pixels a take's ink needs to be measured from the take, and
# how far (RGB distance) its measurement may sit from the master ink before it is ignored.
MIN_INK_PIXELS = 50
DRIFT = 60
# register()'s search: per round, the offset step (artboard units) and the scale step (a share),
# halved from two units down to a sixty-fourth.
REGISTER_STEPS = [(2 / 2**k, 0.004 / 2**k) for k in range(8)]
# vtracer's spline fit: a corner above CORNER degrees, segments of at least LENGTH take pixels,
# and splices at SPLICE degrees. Coarser than its defaults (60, 4, 45) to keep each status's
# file small: about a third fewer path points. Measured against the defaults' fit on ready-
# attention at the same placement, outlines move at most 2.1 px at the stills' 512 px scale and
# 99% of edge points within 1.5 px.
CORNER = 90
LENGTH = 8.0
SPLICE = 60
# Red minus blue a pixel needs to read as yellow (the ink measures 135; neutral greys about 5).
WARM = 60
# Red minus blue a pixel needs to read as vermilion. Neutral mid-greys (a soft frame's blend of
# his black into an eye white) sit nearer vermilion than black or white, and in head-unsmile's
# blurred wink 1,011 px of them survived as a vermilion tuft: they measure 25 at most (median
# (136, 136, 135)), vermilion's core 144 or more (1st percentile, five loops), and a fifth of
# vermilion blended into his black 33.
VERMILION_CHROMA = 30
# Green minus blue a pixel also needs to read as yellow. The ink's core measures 74-120 (median
# 106) in the takes' effect marks; the soft edge of vermilion against paper is warm too but
# measures -3 to 62 (95% at 25 or under), and was traced as a yellow ring round loading-feather's
# feather: its edge pixels, about (230, 139, 122), sit 68 from the yellow ink and 92 from vermilion.
YELLOW_CHROMA = 50
# How far (512 px artboard pixels) a traced yellow pixel may sit from yellow in the take's own frame
# before it counts as halo (see halo()): the trace's outlines move about that much.
HALO_REACH = 2
# An enclosed white region no pass knows anything about (no evidence, no guess: an enter crossing
# the page) is an eye only with a solidity in this band (see see_through()): eyes measure 0.74-0.92;
# gaps between a raised wing and the beak 0.98-1.03, and the ragged gaps among splayed feathers or inside an impact burst 0.40-0.64.
EYE_SOLIDITY = (0.70, 0.95)
# See-through pixels (512 px artboard) on an eye white from which a drawing's eye counts as cut out
# (--eyes); fewer are the trace's outline sitting a pixel off the take's region.
CUT_EYE = 20
# How close (summed |RGB|) a rendered pixel must be to the yellow fill to be traced yellow.
YELLOW_FILL = 40
# Brightness from which a thin line inside the body is a lid line (lid lines measure 100-190,
# the body 20-30 and its faint sheen lines 50-70).
LID_LINE = 90
# Largest |red - blue| a lid line pixel shows (grey lines measure under 15; the anti-aliasing
# beside vermilion over 40).
NEUTRAL = 30
ARTBOARD = 512


def use_inks(names: list[str]) -> None:
    """Adds the extra inks a status names (loops/rests.json "inks") to the ones traced."""
    for name in names:
        INKS[name] = EXTRA_INKS[name]


def frames_of(state: str, take: str) -> np.ndarray:
    CACHE.mkdir(parents=True, exist_ok=True)
    mp4 = CACHE / f"{take}.mp4"
    if not mp4.exists():
        subprocess.run(["curl", "-fsS", "-o", str(mp4), MEDIA.format(take)], check=True)
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(mp4),
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    w, h = map(int, probe.strip().split(","))
    raw = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(mp4),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def drawings_of(frames: np.ndarray) -> list[tuple[int, int, list[int]]]:
    """(start, length, frames) of each drawing, in take order, held on twos by construction.

    Caw is animated on twos: each frame pair (2k, 2k + 1) shows frame 2k's drawing for both
    frames, so a stretch the model rendered on ones keeps every other drawing, and a take already
    on twos is unchanged. Consecutive pairs showing the same drawing are one longer hold. A
    drawing's frames are the ones that show it (2k, and 2k + 1 when it matches), averaged by the
    caller to lift video noise.
    """

    def same(a: int, b: int) -> bool:
        diff = np.abs(frames[a].astype(np.int16) - frames[b].astype(np.int16)).mean()
        return diff < SAME_DRAWING

    groups = []
    for start in range(0, len(frames), 2):
        members = [start] + (
            [start + 1] if start + 1 < len(frames) and same(start, start + 1) else []
        )
        length = min(2, len(frames) - start)
        if groups and same(groups[-1][2][0], start):
            groups[-1][1] += length
            groups[-1][2].extend(members)
        else:
            groups.append([start, length, members])
    return [(s, n, m) for s, n, m in groups]


def take_palette(drawings: list[np.ndarray]) -> np.ndarray:
    """The take's own rendering of paper and each ink: k-means seeded at the masters' colours,
    over pixels from every drawing (an effect mark's yellow may appear in only a few).

    A centre that ends with too few pixels, or wanders more than DRIFT from its master ink, is
    tracking some other colour, not this take's rendering of that ink; it keeps the master's. A
    yellow centre that wandered off once let a take's yellow marks snap to vermilion.
    """
    seeds = np.array([PAPER, *INKS.values()], np.float64)
    stride = max(1, sum(d.shape[0] * d.shape[1] for d in drawings) // 600_000)
    px = np.concatenate([d.reshape(-1, 3) for d in drawings]).astype(np.float64)[
        ::stride
    ]
    centres = seeds.copy()
    for _ in range(8):
        nearest = ((px[:, None] - centres[None]) ** 2).sum(-1).argmin(1)
        for k in range(len(centres)):
            members = px[nearest == k]
            centres[k] = members.mean(0) if len(members) >= MIN_INK_PIXELS else seeds[k]
    drift = np.sqrt(((centres - seeds) ** 2).sum(-1))
    centres[drift > DRIFT] = seeds[drift > DRIFT]
    return centres


WHITE = list(INKS).index("white") + 1


def inks(rgb: np.ndarray, centres: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Each pixel's nearest ink (0 = paper, 1.. = INKS order) with the paper around Caw cut out,
    and his enclosed near-white regions numbered: each is an eye white or paper seen through a
    gap (see_through decides), provisionally eye white."""
    px = rgb.astype(np.float64)
    distance = ((px[..., None, :] - centres) ** 2).sum(-1)
    # Yellow is the only mid-light ink, so neutral greys (a closed eye's light lid line, the
    # anti-aliasing between eye white and black) land nearest to it, and so does the light edge of
    # vermilion against paper. Yellow is warm and strongly yellow (green well above blue): a pixel
    # without both takes its nearest other ink instead.
    yellow = list(INKS).index("yellow") + 1
    is_yellow = (px[..., 0] - px[..., 2] >= WARM) & (
        px[..., 1] - px[..., 2] >= YELLOW_CHROMA
    )
    distance[..., yellow] = np.where(is_yellow, distance[..., yellow], np.inf)
    vermilion = list(INKS).index("vermilion") + 1
    distance[..., vermilion] = np.where(
        px[..., 0] - px[..., 2] >= VERMILION_CHROMA, distance[..., vermilion], np.inf
    )
    if "tan" in INKS:
        # No pixel is tan by colour alone (vermilion's soft edge against paper sits nearer tan
        # than vermilion): tan_outline() gives it the faces of tan runs.
        distance[..., list(INKS).index("tan") + 1] = np.inf
    if "cream" in INKS:
        # Cream sits a few levels from the page and from an eye white, so it is told by its
        # warmth, as yellow is: a warm, light pixel is the note, and nothing neutral is.
        cream = list(INKS).index("cream") + 1
        is_cream = (px[..., 0] - px[..., 2] >= CREAM_WARM) & (
            px.min(-1) >= CREAM_LIGHT
        )
        distance[..., cream] = np.where(is_cream, distance[..., cream], np.inf)
        distance[..., 0] = np.where(is_cream, np.inf, distance[..., 0])
        distance[..., WHITE] = np.where(is_cream, np.inf, distance[..., WHITE])
    label = distance.argmin(-1)
    # Between yellow and vermilion the choice is made as halo() judges it, by nearness in Lab: an
    # orange blend of the two sits nearer yellow in RGB and nearer vermilion to the eye, and was
    # traced as yellow over a take with none there (trying-stumble drawing 11: 112 px of
    # (238, 152, 94); done-dust-off drawing 26: 12 px).
    blend = np.flatnonzero(label == yellow)
    if blend.size:
        seen = lab(px.reshape(-1, 3)[blend])
        nearer = ((seen - lab(centres[vermilion])) ** 2).sum(-1) < ((seen - lab(centres[yellow])) ** 2).sum(-1)
        label.flat[blend[nearer]] = vermilion
    if "cream" in INKS:
        tan_outline(label, px)
        warm_eye_whites(label, px)
    light = (label == 0) | (label == WHITE)
    regions, _ = ndimage.label(light)
    edge = np.unique(
        np.concatenate([regions[0], regions[-1], regions[:, 0], regions[:, -1]])
    )
    outside = np.isin(regions, edge[edge > 0])
    label[outside] = 0
    enclosed = np.where(light & ~outside, regions, 0)
    label[enclosed > 0] = WHITE
    return label, enclosed


def tan(px: np.ndarray) -> np.ndarray:
    """A prop's outline drawn tan (see TAN): pixels inside every band."""
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    bands = {"rg": r - g, "gb": g - b, "rb": r - b, "min": px.min(-1), "max": px.max(-1)}
    out = np.ones(px.shape[:2], bool)
    for name, (low, high) in TAN.items():
        out &= (bands[name] >= low) & (bands[name] <= high)
    return out


def tan_outline(label: np.ndarray, px: np.ndarray) -> None:
    """A cream prop's tan outline (see TAN) traced in black, in place: each connected run of tan
    pixels that touches cream. Where the status traces the tan ink, the run's wide parts (see
    TAN_FACE) are a shaded face and traced tan; its thin edges stay the black outline."""
    cream = list(INKS).index("cream") + 1
    outline = tan(px)
    parts, _ = ndimage.label(outline, structure=np.ones((3, 3)))
    touching = np.unique(parts[ndimage.binary_dilation(label == cream) & outline])
    runs = np.isin(parts, touching[touching > 0])
    label[runs] = list(INKS).index("black") + 1
    if "tan" in INKS:
        r = TAN_FACE // 2
        y, x = np.ogrid[-r : r + 1, -r : r + 1]
        label[ndimage.binary_opening(runs, structure=x * x + y * y <= r * r)] = list(INKS).index("tan") + 1


def his_black(label: np.ndarray) -> np.ndarray:
    """His body's black: his black with every run thinner than HIS_BLACK opened away, so a prop's
    or a note's thin black outline is not his."""
    r = HIS_BLACK // 2
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    return ndimage.binary_opening(label == list(INKS).index("black") + 1, structure=x * x + y * y <= r * r)


def warm_eye_whites(label: np.ndarray, px: np.ndarray) -> None:
    """Gives back to the eye white the cream pixels of a warm eye white (see EYE_WARM), in place.
    An eye is ringed by his body's black (his_black): the cream note, enclosed by its own thin
    outline where it meets the beak, once read as a warm eye (head-beat's stretch drawing: warmth 18,
    its ring 0.52 black but 0.13 his body's, against 0.69-0.72 round his eyes) and traced as eye
    white, then vermilion."""
    cream = list(INKS).index("cream") + 1
    his = his_black(label)
    lightish = (label == 0) | (label == WHITE) | (label == cream)
    regions, n = ndimage.label(lightish)
    edge = np.unique(np.concatenate([regions[0], regions[-1], regions[:, 0], regions[:, -1]]))
    has_cream = ndimage.sum(label == cream, regions, index=np.arange(1, n + 1)) > 0
    warmth = px[..., 0] - px[..., 2]
    h, w = label.shape
    for k, box in enumerate(ndimage.find_objects(regions), start=1):
        if box is None or k in edge or not has_cream[k - 1]:
            continue
        box = (
            slice(max(box[0].start - 2, 0), min(box[0].stop + 2, h)),
            slice(max(box[1].start - 2, 0), min(box[1].stop + 2, w)),
        )
        region = regions[box] == k
        ring = ndimage.binary_dilation(region, iterations=2) & ~region
        if his[box][ring].mean() < EYE_RING:
            continue
        if np.median(warmth[box][region]) >= EYE_WARM:
            continue
        inside = label[box]
        inside[region & (inside == cream)] = WHITE


def decide(
    enclosed: list[np.ndarray], seed_paper: np.ndarray
) -> list[dict[int, tuple[bool, bool]]]:
    """One pass over the drawings in the order given: per drawing, {region: (is_paper, how)}, `how`
    being "evidence", "guess" or "none".

    The first drawing's regions take the seed still's answer (transparent there = paper); each
    later drawing's regions take the answer of the last decided drawing's regions they overlap.
    An answer is evidenced when it rests on the still or on overlap with an evidenced region: a
    region that overlaps only guessed regions, or nothing (it takes the nearest region's answer),
    is a guess, and a guess never turns into evidence further down the chain.

    Only regions of MIN_REGION pixels or more are decided or remembered. Smaller ones are video
    noise (finish drops them as fringes); remembered, they once stood in for a drawing whose eyes
    were shut, and the eyes that opened next took a speck's "paper" and kept it to the loop's end.
    A drawing with no real regions leaves the memory as it was."""
    out = []
    previous = None  # ({paper, eye, paper_ev, eye_ev} masks, [(centroid, is_paper)])
    for regions in enclosed:
        decided = {}
        masks = {
            k: np.zeros(regions.shape, bool)
            for k in ("paper", "eye", "paper_ev", "eye_ev")
        }
        marks = []
        ids, sizes = np.unique(regions[regions > 0], return_counts=True)
        for r in ids[sizes >= MIN_REGION]:
            m = regions == r
            centre = np.array(ndimage.center_of_mass(m))
            if previous is None:
                is_paper, how = bool(seed_paper[m].mean() > 0.5), "evidence"
            else:
                was, was_marks = previous
                sure = (m & was["paper_ev"]).sum(), (m & was["eye_ev"]).sum()
                loose = (m & was["paper"]).sum(), (m & was["eye"]).sum()
                if any(sure):
                    is_paper, how = bool(sure[0] > sure[1]), "evidence"
                elif any(loose):
                    is_paper, how = bool(loose[0] > loose[1]), "guess"
                else:
                    nearest = (
                        min(was_marks, key=lambda w: np.linalg.norm(w[0] - centre))
                        if was_marks
                        else None
                    )
                    is_paper, how = (nearest[1], "guess") if nearest else (False, "none")
            decided[int(r)] = (is_paper, how)
            kind = "paper" if is_paper else "eye"
            masks[kind][m] = True
            if how == "evidence":
                masks[f"{kind}_ev"][m] = True
            marks.append((centre, is_paper))
        out.append(decided)
        previous = (masks, marks) if marks else previous
    return out


def solidity(region: np.ndarray) -> float:
    """Area over convex-hull area: an eye white's pupil keeps it well under 1."""
    ys, xs = np.nonzero(region)
    try:
        return float(region.sum() / ConvexHull(np.column_stack([xs, ys])).volume)
    except QhullError:  # a region too thin for a hull (a line of pixels) is no eye
        return 1.0


def inside_hull(point: np.ndarray, region: np.ndarray) -> bool:
    """Whether a (row, column) point lies inside a region's convex hull."""
    points = np.column_stack(np.nonzero(region))
    try:
        corners = points[ConvexHull(points).vertices]
        return bool(Delaunay(corners).find_simplex(point) >= 0)
    except QhullError:  # a region too thin for a hull (a line of pixels) encloses nothing
        return False


def see_through(
    enclosed: list[np.ndarray],
    labels: list[np.ndarray],
    start_paper: np.ndarray,
    end_paper: np.ndarray | None,
) -> list[np.ndarray]:
    """Which enclosed near-white regions are paper seen through a gap (between a raised wing and
    the beak, say) rather than an eye white. Some takes draw eye whites exactly as neutral and
    bright as the paper, so colour cannot tell; the stills can. Every take opens on a still and
    closes on one (a loop on the same still it opened on), so the regions are decided from both
    ends: forward from drawing 00 with start_paper (the opening still's transparency in take
    pixels) and backward from the last drawing with end_paper (decide()).

    Decided from one end only, the answer drifts as Caw moves away from that still: on two
    loading-feather to ready takes the far eye was cut out as "paper" from the middle of the take
    on, a hole that only shows on dark. So per region: evidence beats a guess, and between two
    pieces of evidence, the pass from the nearer end. Without evidence, the guesses decide, each
    pass's taken from the regions of the drawings next to it: a region either pass guesses eye is
    an eye, and one is paper only when every pass that guesses calls it paper (a template pose's
    take ends on no still, so its backward pass knows nothing and its forward guess decides).
    Scored against the shipped loops, the art the owner approved, over the 1,481 regions no
    evidence decides: they filled 1,404 with eye white and left 1 a hole (the other 76 are greys
    traced in another ink); where the two guesses disagree they filled 87 of 89 with eye white,
    the nearer end's guess right only 43 times. A region ringed mostly by a prop's ink (cream,
    tan) is paper whatever the guesses say, since no eye sits in a prop: template-seo's magnifier
    glass, ringed by its tan rim and guessed eye forward from the still, was a 6,811 px eye white
    touching the page.

    Only where neither pass knows anything (an enter crossing the page, trace_clip.py, which has
    no stills to chain from) do shape and ring decide, the rules two takes of loading's enter
    needed: there the inside of a yellow impact burst and the ragged gaps among splayed feathers
    were filled with eye white. His eyes sit in his black, so a region ringed mostly by any other
    ink (a slit in a feather, the inside of a yellow burst) is paper, and a guessed eye has the
    solidity of the measured band: a gap that opens mid-move is a solid wedge (0.98-1.03) or a
    ragged hole (0.40-0.64), the eyes measured 0.74-0.92. Neither is a test for an eye where the
    guesses know better: deciding every region both passes only guessed (39a8bdd6:
    `is_paper = not low <= solidity(region) < high`, and the ring rule after it), they cut out
    638 of the 1,404 eye whites the shipped loops filled, in 420 drawings (his wide eyes round a small enclosed pupil at
    0.96-0.98, closed eyes' thin lid lines, crescents looking up, 0.32-1.35 in all; working-idea's
    crescents ringed by the idea's yellow glow, trying-rally's and trying-headwind's eyes ringed
    more by his vermilion than his black; 81 drawings lost every eye, hollow rings on dark), and
    template-launch's eye (0.69).

    A pupil's catchlight is its own small round region inside the pupil's black, and both guesses
    call it paper: its shape is too solid for an eye, and the vermilion the video bleeds into its
    soft edge can outnumber the black in its thin ring (seo take 1's held frame: 202 px at 1.10
    solidity, 56 vermilion to 42 black, cut out as a hole beside his eye white; trying-headwind's
    drawing 47 the same). A gap never opens inside an eye, so a region called paper by a guess
    alone, whose centre lies inside the convex hull of a region decided eye in the same drawing,
    is that eye's catchlight, eye white. Evidence from a still is never overruled.

    A take that ends on no still (a template pose, trace_pose.py: he ends holding a prop no still
    has) passes end_paper None: there is no evidence from its end, so every region the forward pass
    cannot evidence takes its guess."""
    forward = decide(enclosed, start_paper)
    backward = (
        decide(enclosed[::-1], end_paper)[::-1]
        if end_paper is not None
        else [{r: (False, "none") for r in d} for d in forward]
    )
    black = list(INKS).index("black") + 1
    props = {list(INKS).index(ink) + 1 for ink in ("cream", "tan") if ink in INKS}
    low, high = EYE_SOLIDITY
    papers = []
    for i, regions in enumerate(enclosed):
        paper = np.zeros(regions.shape, bool)
        eyes, guessed = [], []
        for r, (fwd, fwd_how) in forward[i].items():
            bwd, bwd_how = backward[i][r]
            fwd_seen, bwd_seen = fwd_how == "evidence", bwd_how == "evidence"
            guesses = {p for p, how in ((fwd, fwd_how), (bwd, bwd_how)) if how == "guess"}
            region = regions == r
            if fwd_seen and bwd_seen:
                is_paper = fwd if i < len(enclosed) / 2 else bwd
            elif fwd_seen or bwd_seen:
                is_paper = fwd if fwd_seen else bwd
            else:
                around = labels[i][ndimage.binary_dilation(region, iterations=2) & ~region]
                around = around[around > 0]
                ring = int(np.bincount(around).argmax()) if around.size else black
                if ring in props:
                    is_paper = True
                elif guesses:
                    is_paper = all(guesses)
                else:
                    is_paper = ring != black or not low <= solidity(region) < high
            if not is_paper:
                eyes.append(region)
            elif not (fwd_seen or bwd_seen):
                guessed.append(region)
            else:
                paper |= region
        for region in guessed:
            centre = np.array(ndimage.center_of_mass(region))
            if not any(inside_hull(centre, eye) for eye in eyes):
                paper |= region
        papers.append(paper)
    return papers


def finish(label: np.ndarray, rgb: np.ndarray, paper: np.ndarray) -> np.ndarray:
    """The drawing's final inks: see-through paper cut out, false fringes dropped, lid lines kept."""
    label = label.copy()
    label[paper] = 0
    # The regions see_through() kept as eyes (every enclosed region it decides is MIN_REGION or more).
    parts, n = ndimage.label(label == WHITE)
    sizes = ndimage.sum(label == WHITE, parts, index=np.arange(1, n + 1))
    eyes = np.isin(parts, np.flatnonzero(sizes >= MIN_REGION) + 1)
    px = rgb.astype(np.float64)
    white = WHITE
    bright = px.mean(-1)
    warmth = px[..., 0] - px[..., 2]
    # Anti-aliased and chroma-bled edges (the video is 4:2:0) snap to whichever ink is nearest,
    # leaving thin false fringes, e.g. yellow between an eye's white and its black lid. Inks are
    # flat fills several pixels wide, so an opening keeps every real region and drops the fringes;
    # the dropped pixels take the nearest surviving ink.
    kept = {}
    for ink in range(2, len(INKS) + 1):
        opened = ndimage.binary_opening(label == ink, structure=np.ones((3, 3)))
        parts, n = ndimage.label(opened)
        sizes = ndimage.sum(opened, parts, index=np.arange(1, n + 1))
        kept[ink] = np.isin(parts, np.flatnonzero(sizes >= MIN_REGION) + 1)
    # A closed eye is a thin light-grey lid line on the black head: too thin to survive the opening
    # and too grey to snap to the eye white. Neutral light pixels inside the body, clear of the
    # paper edge and of every coloured region's anti-aliasing, that join into a line are lid lines,
    # drawn in the eye white.
    coloured = np.logical_or.reduce([kept[k] for k in kept])
    lines = (bright >= LID_LINE) & (np.abs(warmth) < NEUTRAL)
    lines &= ndimage.distance_transform_edt(label != 0) >= 3
    lines &= ~ndimage.binary_dilation(coloured, iterations=2)
    parts, n = ndimage.label(lines, structure=np.ones((3, 3)))
    sizes = ndimage.sum(lines, parts, index=np.arange(1, n + 1))
    lines = np.isin(parts, np.flatnonzero(sizes >= MIN_REGION) + 1)
    label[lines] = white
    keep = (
        (label == 0) | (label == 1) | lines | coloured
    )  # black is the base every ink sits on
    _, (iy, ix) = ndimage.distance_transform_edt(~keep, return_indices=True)
    return eye_whites_in_black(label[iy, ix], eyes)


def eye_whites_in_black(label: np.ndarray, eyes: np.ndarray) -> np.ndarray:
    """Eye white only inside his black, in place and returned. His eye whites and lid lines sit
    in his black body: a region of white whose ring (two pixels round it) is EYE_RING or more his
    body's black and touches no page is one (paper seen through a gap inside him is not the page:
    an eye beside one stays). So is one see_through() decided is an eye (`eyes`, mostly within
    it): it was enclosed in the take, and its ring can be another ink where the take tints his
    eye's edge (working-idea's eyes ringed by the idea's yellow glow, trying-rally's more
    vermilion than black round them), or the page where dropping a thin outline's fringe opened
    it (working-idea's bulb, its white inside traced yellow, 795 px of halo); taking that ink cut
    whites the shipped loops filled out of 61 drawings of those two loops and search. His body's black is his black with every run thinner than HIS_BLACK
    opened away: a prop's black outline is not his (a magnifier's glass, ringed by its black rim,
    once traced as an eye white). Any other region of white is a light patch on whatever it sits
    on (a sliver along a prop's lit edge once traced as eye white beside the page): it takes the
    commonest ink of its ring other than black and white, the page included. Run over every take,
    it changed 105 regions in 20 loops and no eye: the pinched inner ends of see-through slits
    (between a wing and his body, between his toes) that the lid-line rule drew white, 40 to 470
    take px, now paper as the rest of the slit is; and specks of white 4 to 53 px inside his
    vermilion, now vermilion."""
    black = list(INKS).index("black") + 1
    blank, _ = ndimage.label(label == 0)
    edge = np.unique(np.concatenate([blank[0], blank[-1], blank[:, 0], blank[:, -1]]))
    page = np.isin(blank, edge[edge > 0])
    his = his_black(label)
    regions, _ = ndimage.label(label == WHITE)
    h, w = label.shape
    for k, box in enumerate(ndimage.find_objects(regions), start=1):
        if box is None:
            continue
        box = (
            slice(max(box[0].start - 2, 0), min(box[0].stop + 2, h)),
            slice(max(box[1].start - 2, 0), min(box[1].stop + 2, w)),
        )
        region = regions[box] == k
        around = ndimage.binary_dilation(region, iterations=2) & ~region
        counts = np.bincount(label[box][around], minlength=len(INKS) + 1)
        if eyes[box][region].mean() >= 0.5 or (
            not page[box][around].any() and his[box][around].mean() >= EYE_RING
        ):
            continue
        counts[[black, WHITE]] = 0
        if counts.any():
            label[box][region] = counts.argmax()
    return label


def largest(mask: np.ndarray) -> np.ndarray:
    """The biggest connected part: Caw himself, without a floating feather, dots or tick marks,
    which H3 places a little differently from the still."""
    parts, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, parts, index=np.arange(1, n + 1))
    return parts == int(np.argmax(sizes)) + 1


def placement(label0: np.ndarray, still: Path) -> tuple[float, float, float]:
    """Scale and offset mapping take pixels onto the artboard so drawing 00's Caw sits on the
    still's Caw."""
    ys, xs = np.nonzero(largest(label0 > 0))
    a = np.asarray(Image.open(still).convert("RGBA"))[..., 3]
    sy, sx = np.nonzero(largest(a > 127))
    scale = (sy.max() - sy.min() + 1) / (ys.max() - ys.min() + 1)
    # Bottom-centre anchor: the ground line and the horizontal centre are what the stills share.
    tx = (sx.min() + sx.max() + 1) / 2 - scale * (xs.min() + xs.max() + 1) / 2
    ty = sy.max() + 1 - scale * (ys.max() + 1)
    return scale, tx, ty


def register(
    label0: np.ndarray, place: tuple[float, float, float], still: Path
) -> tuple[float, float, float]:
    """Moves and sizes drawing 00 from placement()'s whole-pixel estimate to where it overlaps its
    still most: overlap(), the share every gate and timing.json report, searched over scale (about
    the artboard's centre) and offset, each step halved down to REGISTER_STEPS' finest, a move
    kept only where it raises the overlap, so the result never overlaps less than the estimate.

    It replaced matching the two silhouettes' extents, which one pixel decided: after 36e12988
    stopped tracing vermilion's half-covered edge as yellow, idle-preen's leftmost column of
    drawing 00 went to paper, its left extent moved a pixel, and every drawing of the loop moved
    0.43 units (overlap 0.9886 to 0.9832); matching heights shrank landings 0.5% to fit one tuft
    tip a take drew 1.75 units higher than its still."""
    mask = Image.fromarray(((label0 > 0) * 255).astype(np.uint8))
    target = np.asarray(Image.open(still).convert("RGBA"))[..., 3] > 127
    centre = ARTBOARD / 2

    def iou(p: tuple[float, float, float]) -> float:
        scale, tx, ty = p
        moved = mask.transform(
            (ARTBOARD, ARTBOARD),
            Image.Transform.AFFINE,
            (1 / scale, 0, -tx / scale, 0, 1 / scale, -ty / scale),
            Image.Resampling.BILINEAR,
        )
        m = np.asarray(moved) > 127
        return float((m & target).sum() / (m | target).sum())

    def sized(p: tuple[float, float, float], k: float) -> tuple[float, float, float]:
        scale, tx, ty = p
        return (scale * k, centre + k * (tx - centre), centre + k * (ty - centre))

    best, score = place, iou(place)
    for shift, grow in REGISTER_STEPS:
        moved = True
        while moved:
            moved = False
            scale, tx, ty = best
            for candidate in (
                (scale, tx + shift, ty),
                (scale, tx - shift, ty),
                (scale, tx, ty + shift),
                (scale, tx, ty - shift),
                sized(best, 1 + grow),
                sized(best, 1 - grow),
            ):
                s = iou(candidate)
                if s > score:
                    best, score, moved = candidate, s, True
    return best


def overlap(
    label0: np.ndarray, still: Path, place: tuple[float, float, float]
) -> float:
    """Intersection over union of drawing 00 and the still on the artboard."""
    scale, tx, ty = place
    mask = Image.fromarray(((label0 > 0) * 255).astype(np.uint8))
    moved = mask.transform(
        (ARTBOARD, ARTBOARD),
        Image.Transform.AFFINE,
        (1 / scale, 0, -tx / scale, 0, 1 / scale, -ty / scale),
        Image.Resampling.BILINEAR,
    )
    m = np.asarray(moved) > 127
    s = np.asarray(Image.open(still).convert("RGBA"))[..., 3] > 127
    return float((m & s).sum() / (m | s).sum())


def svg(paths: str, place: tuple[float, float, float]) -> str:
    """Traced paths hosted in artboard units under one placement transform."""
    scale, tx, ty = place
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ARTBOARD} {ARTBOARD}">'
        f'<g transform="matrix({scale:.6f} 0 0 {scale:.6f} {tx:.4f} {ty:.4f})">{paths}</g></svg>\n'
    )


def trace_mask(mask: np.ndarray, fill: tuple[int, int, int]) -> str:
    """One ink's region as vtracer spline paths, holes included, filled with that ink."""
    h, w = mask.shape
    ink = np.where(mask, 0, 255).astype(np.uint8)
    rgba = np.dstack([ink, ink, ink, np.full_like(ink, 255)])
    traced = vtracer.convert_pixels_to_svg(
        [tuple(p) for p in rgba.reshape(-1, 4).tolist()],
        (w, h),
        colormode="binary",
        mode="spline",
        filter_speckle=8,
        corner_threshold=CORNER,
        length_threshold=LENGTH,
        max_iterations=10,
        splice_threshold=SPLICE,
        path_precision=2,
    )
    paths = re.findall(r"<path [^>]*/>", traced)
    colour = "#{:02x}{:02x}{:02x}".format(*fill)
    return "".join(re.sub(r'fill="[^"]*"', f'fill="{colour}"', p) for p in paths)


def trace_body(label: np.ndarray) -> str:
    """Caw's silhouette in black, then each other ink on top; black details (pupils, lids) are
    holes in the ink above them, so the black base shows through and no seam reveals paper."""
    layers = [trace_mask(label > 0, INKS["black"])]
    for k, (name, colour) in enumerate(INKS.items(), start=1):
        if name != "black" and (label == k).any():
            layers.append(trace_mask(label == k, colour))
    return "".join(layers)


def lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB (0-255) to CIE L*a*b* (D65)."""
    c = np.asarray(rgb, np.float64) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array(
        [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]
    )
    xyz = (c @ m.T) / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack(
        [
            116 * f[..., 1] - 16,
            500 * (f[..., 0] - f[..., 1]),
            200 * (f[..., 1] - f[..., 2]),
        ],
        -1,
    )


def halo(
    drawn: str, rgb: np.ndarray, centres: np.ndarray, place: tuple[float, float, float]
) -> int:
    """Traced yellow with no yellow under it: the drawing's yellow pixels on the 512 px artboard
    with no yellow within HALO_REACH in the take's own frame at the same place, the frame
    quantised to the take's palette by nearest colour in CIE Lab (not by inks()'s rules, which
    are what this checks). A ring of yellow round vermilion counts; an effect mark's own outline,
    a pixel or two off its source, does not."""
    art = np.asarray(
        Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=drawn)))).convert(
            "RGBA"
        )
    ).astype(np.int64)
    yellow = list(INKS).index("yellow") + 1
    # The yellow fill itself, not whatever lies nearest it: the anti-aliased grey between an eye's
    # white and the black (about 138, 137, 134) is nearer the yellow fill than either.
    traced = (art[..., 3] > 127) & (
        np.abs(art[..., :3] - np.array(INKS["yellow"])).sum(-1) < YELLOW_FILL
    )
    scale, tx, ty = place
    source = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).transform(
        (ARTBOARD, ARTBOARD),
        Image.Transform.AFFINE,
        (1 / scale, 0, -tx / scale, 0, 1 / scale, -ty / scale),
        Image.Resampling.NEAREST,
        fillcolor=PAPER,
    )
    nearest = (
        ((lab(np.asarray(source))[..., None, :] - lab(centres)) ** 2).sum(-1).argmin(-1)
    )
    near_yellow = ndimage.binary_dilation(nearest == yellow, iterations=HALO_REACH)
    return int((traced & ~near_yellow).sum())


def holds(drawings: list[tuple[int, int, list[int]]], shown: list[int]) -> list[dict]:
    """The loop's slots: each drawing's start, length and traced drawing, where neighbours that
    came out as the same traced drawing (a near-still stretch) are one longer hold."""
    slots: list[dict] = []
    for (start, length, _), drawing in zip(drawings, shown):
        if slots and slots[-1]["drawing"] == drawing:
            slots[-1]["length"] += length
        else:
            slots.append({"start": start, "length": length, "drawing": drawing})
    return slots


def paper_of(
    still: Path, place: tuple[float, float, float], shape: tuple[int, int]
) -> np.ndarray:
    """A still's transparency in take pixels (art = scale * take + offset)."""
    scale, tx, ty = place
    h, w = shape
    alpha = (
        Image.open(still)
        .convert("RGBA")
        .getchannel("A")
        .transform(
            (w, h),
            Image.Transform.AFFINE,
            (scale, 0, tx, 0, scale, ty),
            Image.Resampling.BILINEAR,
        )
    )
    return np.asarray(alpha) < 128


def trace(
    loop: str, take: str, still_name: str, end_still_name: str | None = None
) -> dict:
    """Traces a take that opens on still_name's still and closes on end_still_name's (a status
    change), or on the same still it opened on (a loop, the default)."""
    frames = frames_of(loop, take)
    drawings = drawings_of(frames)
    still = STILLS / f"light-{still_name}.png"
    end_still = STILLS / f"light-{end_still_name or still_name}.png"
    out = LOOPS / loop
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.svg"):
        old.unlink()
    rgbs = [frames[m].astype(np.float64).mean(0) for _, _, m in drawings]
    centres = take_palette(rgbs)
    found = [inks(rgb, centres) for rgb in rgbs]
    place = placement(found[0][0], still)
    shape = rgbs[0].shape[:2]
    papers = see_through(
        [e for _, e in found],
        [label for label, _ in found],
        paper_of(still, place, shape),
        paper_of(end_still, place, shape),
    )
    labels = [
        finish(label, rgb, paper) for (label, _), rgb, paper in zip(found, rgbs, papers)
    ]
    place = register(labels[0], place, still)
    # A drawing the take comes back to (a tremble between two drawings, a return to a held pose)
    # is the same drawing: it reuses the earlier one's shapes instead of being traced again.
    shown = []
    unique = []
    halos = {}
    for i, rgb in enumerate(rgbs):
        again = next(
            (
                u
                for u, j in enumerate(unique)
                if np.abs(rgb - rgbs[j]).mean() < SAME_DRAWING
            ),
            None,
        )
        if again is None:
            again = len(unique)
            unique.append(i)
            drawn = svg(trace_body(labels[i]), place)
            (out / f"body-{again:02d}.svg").write_text(drawn)
            halos[f"{again:02d}"] = halo(drawn, rgb, centres, place)
        shown.append(again)
    timing = {
        "take": take,
        "frames": len(frames),
        "fps": 24,
        "drawings": holds(drawings, shown),
        "placement": {"scale": place[0], "x": place[1], "y": place[2]},
        "stillOverlap": round(overlap(labels[0], still, place), 4),
        "halo": halos,
    }
    (out / "timing.json").write_text(dump_json(timing))
    return timing


def measure_halo(loop: str, take: str) -> dict[str, int]:
    """halo() for each drawing a loop already has on disk, against the take frames it was traced
    from (a drawing's first slot), without tracing again."""
    timing = json.loads((LOOPS / loop / "timing.json").read_text())
    frames = frames_of(loop, take)
    drawings = drawings_of(frames)
    rgbs = [frames[m].astype(np.float64).mean(0) for _, _, m in drawings]
    centres = take_palette(rgbs)
    place = tuple(timing["placement"][k] for k in ("scale", "x", "y"))
    group = {s: i for i, (s, _, _) in enumerate(drawings)}
    first = {}
    for slot in timing["drawings"]:
        first.setdefault(slot["drawing"], slot["start"])
    return {
        f"{d:02d}": halo(
            (LOOPS / loop / f"body-{d:02d}.svg").read_text(),
            rgbs[group[s]],
            centres,
            place,
        )
        for d, s in sorted(first.items())
    }


def cut_eyes(
    loop: str, take: str, still_name: str, end_still_name: str | None = None
) -> dict[str, int]:
    """Per drawing a loop has on disk, the eye white it shows as see-through (px at 512).

    The take's enclosed white regions are decided again with see_through() from both ends (a loop
    opens and closes on its still; a status change names its end still); every region it calls an
    eye is placed on the artboard with the loop's placement, and the drawing's see-through pixels
    inside its outline that fall on one are counted. Those pixels show the page through his eye:
    in dark, a hole ringed by the cream rim."""
    timing = json.loads((LOOPS / loop / "timing.json").read_text())
    frames = frames_of(loop, take)
    drawings = drawings_of(frames)
    rgbs = [frames[m].astype(np.float64).mean(0) for _, _, m in drawings]
    centres = take_palette(rgbs)
    found = [inks(rgb, centres) for rgb in rgbs]
    place = tuple(timing["placement"][k] for k in ("scale", "x", "y"))
    shape = rgbs[0].shape[:2]
    start_paper = paper_of(STILLS / f"light-{still_name}.png", place, shape)
    end_paper = paper_of(
        STILLS / f"light-{end_still_name or still_name}.png", place, shape
    )
    enclosed = [e for _, e in found]
    papers = see_through(
        enclosed, [label for label, _ in found], start_paper, end_paper
    )
    scale, tx, ty = place
    group = {s: i for i, (s, _, _) in enumerate(drawings)}
    first = {}
    for slot in timing["drawings"]:
        first.setdefault(slot["drawing"], slot["start"])
    cut = {}
    for d, start in sorted(first.items()):
        i = group[start]
        ids, sizes = np.unique(enclosed[i][enclosed[i] > 0], return_counts=True)
        eyes = np.isin(enclosed[i], ids[sizes >= MIN_REGION]) & ~papers[i]
        on_art = (
            np.asarray(
                Image.fromarray((eyes * 255).astype(np.uint8)).transform(
                    (ARTBOARD, ARTBOARD),
                    Image.Transform.AFFINE,
                    (1 / scale, 0, -tx / scale, 0, 1 / scale, -ty / scale),
                    Image.Resampling.NEAREST,
                )
            )
            > 127
        )
        drawn = (LOOPS / loop / f"body-{d:02d}.svg").read_text()
        alpha = (
            np.asarray(
                Image.open(
                    io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=drawn)))
                ).convert("RGBA")
            )[..., 3]
            > 127
        )
        see_through_px = ndimage.binary_fill_holes(alpha) & ~alpha
        cut[f"{d:02d}"] = int((see_through_px & on_art).sum())
    return cut


def eyes_census(name: str) -> tuple[str, dict[str, int]]:
    loops = {
        v["loop"]: v
        for vs in json.loads((LOOPS / "takes.json").read_text()).values()
        for v in vs
    }
    v = loops[name]
    return name, cut_eyes(name, v["take"], v["still"])


def main() -> None:
    takes = json.loads((LOOPS / "takes.json").read_text())
    loops = {v["loop"]: v for variants in takes.values() for v in variants}
    args = sys.argv[1:]
    if args[:1] == ["--eyes"]:
        names = args[1:] or list(loops)
        with Pool(min(8, len(names))) as pool:
            results = dict(pool.map(eyes_census, names))
        intact = 0
        for name in names:
            cut = {d: px for d, px in results[name].items() if px >= CUT_EYE}
            intact += not cut
            detail = ", ".join(f"{d} ({px} px)" for d, px in cut.items())
            print(
                f"{name}: {'eyes intact' if not cut else f'eye cut out in {len(cut)} of {len(results[name])} drawings: {detail}'}"
            )
        print(f"eyes: {intact}/{len(names)} loops intact")
        sys.exit(0 if intact == len(names) else 1)
    if args[:1] == ["--halo"]:
        for name in args[1:] or list(loops):
            h = measure_halo(name, loops[name]["take"])
            worst = max(h, key=h.get)
            print(
                f"{name}: halo {sum(h.values())} px over {sum(v > 0 for v in h.values())} of {len(h)} drawings, most {h[worst]} in {worst}"
            )
        return
    for name in args or list(loops):
        v = loops[name]
        t = trace(name, v["take"], v["still"])
        print(
            f"{name}: {len(t['drawings'])} drawings over {t['frames']} frames, "
            f"overlap with still {t['stillOverlap']}, halo {sum(t['halo'].values())} px"
        )


if __name__ == "__main__":
    main()
