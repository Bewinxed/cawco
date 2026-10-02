# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.3", "pillow>=11.3", "scipy>=1.16", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Traces Caw's loop takes into the vector drawings the status files (../caw/<status>.riv) are built from.

usage: uv run trace.py [loop ...]        (default: every loop in ../loops/takes.json)

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
from pathlib import Path

import numpy as np
import resvg_py
import vtracer
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
LOOPS = HERE.parent / "loops"
STILLS = HERE.parent / "stills"
CACHE = Path.home() / ".cache" / "caw-loops"
MEDIA = "https://backlot.bewinxed.com/api/takes/{}/media"

# Caw's inks, measured from his masters (~/cawco-design-kit/caw/*.png, coarse colour histogram of
# opaque pixels): every traced region is filled with exactly one of these.
INKS = {
    "black": (27, 27, 25),
    "vermilion": (227, 88, 63),
    "white": (250, 248, 244),
    "yellow": (242, 204, 107),
}
PAPER = (255, 255, 255)
# Two frames are the same drawing when they differ by less than this mean absolute RGB difference
# (held pairs measure <= 0.7, a new drawing >= 6).
SAME_DRAWING = 1.5
# The smallest ink region kept, in take pixels (a tick mark or pupil is several hundred).
MIN_REGION = 40
# take_palette: the fewest sampled pixels a take's ink needs to be measured from the take, and
# how far (RGB distance) its measurement may sit from the master ink before it is ignored.
MIN_INK_PIXELS = 50
DRIFT = 60
# How much finer than the stills' 512 px refine() measures drawing 00 against its still.
SUPERSAMPLE = 4
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
# Brightness from which a thin line inside the body is a lid line (lid lines measure 100-190,
# the body 20-30 and its faint sheen lines 50-70).
LID_LINE = 90
# Largest |red - blue| a lid line pixel shows (grey lines measure under 15; the anti-aliasing
# beside vermilion over 40).
NEUTRAL = 30
ARTBOARD = 512


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
    # anti-aliasing between eye white and black) land nearest to it. Yellow is a warm ink: a pixel
    # without its warmth takes the nearest neutral ink instead.
    yellow = list(INKS).index("yellow") + 1
    distance[..., yellow] = np.where(
        px[..., 0] - px[..., 2] >= WARM, distance[..., yellow], np.inf
    )
    label = distance.argmin(-1)
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


def see_through(
    enclosed: list[np.ndarray], still_paper: np.ndarray
) -> list[np.ndarray]:
    """Which enclosed near-white regions are paper seen through a gap (between a raised wing and
    the beak, say) rather than an eye white. Some takes draw eye whites exactly as neutral and
    bright as the paper, and gaps take every shape an eye does, so neither colour nor shape can
    tell; the still can. Every loop opens on its still, so drawing 00's regions take the still's
    answer (transparent there = paper), and each later drawing's regions take the answer of the
    last decided drawing's regions they overlap most, or of the nearest one when the move was too
    large to overlap.

    Only regions of MIN_REGION pixels or more are decided or remembered. Smaller ones are video
    noise (finish drops them as fringes); remembered, they once stood in for a drawing whose eyes
    were shut, and the eyes that opened next took a speck's "paper" and kept it to the loop's end.
    A drawing with no real regions leaves the memory as it was."""
    papers = []
    previous = None  # (paper mask, eye mask, [(centroid, is_paper)])
    for regions in enclosed:
        paper = np.zeros(regions.shape, bool)
        eye = np.zeros(regions.shape, bool)
        marks = []
        ids, sizes = np.unique(regions[regions > 0], return_counts=True)
        for r in ids[sizes >= MIN_REGION]:
            m = regions == r
            centre = np.array(ndimage.center_of_mass(m))
            if previous is None:
                is_paper = still_paper[m].mean() > 0.5
            else:
                was_paper, was_eye, was = previous
                votes = (m & was_paper).sum(), (m & was_eye).sum()
                if any(votes):
                    is_paper = votes[0] > votes[1]
                else:
                    is_paper = (
                        min(was, key=lambda w: np.linalg.norm(w[0] - centre))[1]
                        if was
                        else False
                    )
            if is_paper:
                paper |= m
            else:
                eye |= m
            marks.append((centre, is_paper))
        papers.append(paper)
        previous = (paper, eye, marks) if marks else previous
    return papers


def finish(label: np.ndarray, rgb: np.ndarray, paper: np.ndarray) -> np.ndarray:
    """The drawing's final inks: see-through paper cut out, false fringes dropped, lid lines kept."""
    label = label.copy()
    label[paper] = 0
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
    return label[iy, ix]


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


def extent(alpha: np.ndarray, sample: int) -> tuple[float, float, float, float]:
    """Left, top, right and bottom of the largest opaque part, in artboard units."""
    ys, xs = np.nonzero(largest(alpha > 127))
    return (
        xs.min() / sample,
        ys.min() / sample,
        (xs.max() + 1) / sample,
        (ys.max() + 1) / sample,
    )


def refine(
    silhouette: str, place: tuple[float, float, float], still: Path
) -> tuple[float, float, float]:
    """Corrects the placement so the traced drawing 00 sits on the still to a fraction of a pixel.

    The first placement compares extents in whole take pixels (each about 0.6 artboard units, a
    pixel or two on a phone), and tracing rounds tips like the head tuft a little. Drawing 00's
    traced silhouette is rendered SUPERSAMPLE times larger than the stills, its extent measured
    against the still's at the same resolution, and the scale, bottom line and centre corrected.
    """
    size = ARTBOARD * SUPERSAMPLE
    alpha = np.asarray(
        Image.open(still)
        .convert("RGBA")
        .getchannel("A")
        .resize((size, size), Image.Resampling.BILINEAR)
    )
    sl, st, sr, sb = extent(alpha, SUPERSAMPLE)
    for _ in range(2):
        drawn = svg(silhouette, place).replace(
            f'viewBox="0 0 {ARTBOARD} {ARTBOARD}"',
            f'viewBox="0 0 {ARTBOARD} {ARTBOARD}" width="{size}" height="{size}"',
        )
        png = bytes(resvg_py.svg_to_bytes(svg_string=drawn))
        traced = np.asarray(Image.open(io.BytesIO(png)).convert("RGBA"))[..., 3]
        tl, tt, tr, tb = extent(traced, SUPERSAMPLE)
        scale, tx, ty = place
        k = (sb - st) / (tb - tt)
        # A traced point sits at p = scale * u + t; scaling by k about the origin of take pixels
        # gives k * (p - t) + t', and t' puts the bottom and the centre back on the still's.
        place = (
            scale * k,
            (sl + sr) / 2 - k * ((tl + tr) / 2 - tx),
            sb - k * (tb - ty),
        )
    return place


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


def trace(loop: str, take: str, still_name: str) -> dict:
    frames = frames_of(loop, take)
    drawings = drawings_of(frames)
    still = STILLS / f"light-{still_name}.png"
    out = LOOPS / loop
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.svg"):
        old.unlink()
    rgbs = [frames[m].astype(np.float64).mean(0) for _, _, m in drawings]
    centres = take_palette(rgbs)
    found = [inks(rgb, centres) for rgb in rgbs]
    place = placement(found[0][0], still)
    # The still's transparency in take pixels: art = scale * take + offset.
    scale, tx, ty = place
    h, w = rgbs[0].shape[:2]
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
    papers = see_through([e for _, e in found], np.asarray(alpha) < 128)
    labels = [
        finish(label, rgb, paper) for (label, _), rgb, paper in zip(found, rgbs, papers)
    ]
    place = refine(trace_mask(labels[0] > 0, INKS["black"]), place, still)
    # A drawing the take comes back to (a tremble between two drawings, a return to a held pose)
    # is the same drawing: it reuses the earlier one's shapes instead of being traced again.
    shown = []
    unique = []
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
            (out / f"body-{again:02d}.svg").write_text(
                svg(trace_body(labels[i]), place)
            )
        shown.append(again)
    timing = {
        "take": take,
        "frames": len(frames),
        "fps": 24,
        "drawings": holds(drawings, shown),
        "placement": {"scale": place[0], "x": place[1], "y": place[2]},
        "stillOverlap": round(overlap(labels[0], still, place), 4),
    }
    (out / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
    return timing


def main() -> None:
    takes = json.loads((LOOPS / "takes.json").read_text())
    loops = {v["loop"]: v for variants in takes.values() for v in variants}
    for name in sys.argv[1:] or list(loops):
        v = loops[name]
        t = trace(name, v["take"], v["still"])
        print(
            f"{name}: {len(t['drawings'])} drawings over {t['frames']} frames, "
            f"overlap with still {t['stillOverlap']}"
        )


if __name__ == "__main__":
    main()
