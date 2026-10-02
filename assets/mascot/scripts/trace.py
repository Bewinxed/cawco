# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.3", "pillow>=11.3", "scipy>=1.16", "vtracer==0.6.15"]
# ///
"""Traces Caw's loop takes into the vector drawings caw.riv is built from.

usage: uv run trace.py [state ...]        (default: every take in ../loops/takes.json)

For each take listed in ../loops/takes.json (a Backlot take shot with the H3 keyframe sequence
adapter, on twos) this writes ../loops/<state>/:
  body-NN.svg   drawing NN, Caw's flat inks traced by vtracer (stacked colour layers)
  rim-NN.svg    drawing NN's silhouette, traced by vtracer (binary), for the cream rim stroke
and ../loops/<state>/timing.json: the take's frame count and each drawing's start and length in
24 fps frames, exactly as the take holds them.

Both SVGs are in artboard units (the 512 x 512 `Caw` artboard), placed on the stills' shared scale
and ground line: drawing 00 is registered onto the state's light still (assets/mascot/stills).
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
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


def drawings_of(frames: np.ndarray) -> list[tuple[int, int]]:
    """(start, length) of each held drawing, in frames, in take order."""
    groups = [[0, 1]]
    for i in range(1, len(frames)):
        diff = np.abs(
            frames[i].astype(np.int16) - frames[i - 1].astype(np.int16)
        ).mean()
        if diff < SAME_DRAWING:
            groups[-1][1] += 1
        else:
            groups.append([i, 1])
    return [tuple(g) for g in groups]


def take_palette(rgb: np.ndarray) -> np.ndarray:
    """The take's own rendering of paper and each ink: k-means seeded at the masters' colours."""
    seeds = np.array([PAPER, *INKS.values()], np.float64)
    px = rgb.reshape(-1, 3).astype(np.float64)[::7]
    centres = seeds.copy()
    for _ in range(8):
        nearest = ((px[:, None] - centres[None]) ** 2).sum(-1).argmin(1)
        for k in range(len(centres)):
            if (nearest == k).any():
                centres[k] = px[nearest == k].mean(0)
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
    previous drawing's regions they overlap most, or of the nearest one when the move was too
    large to overlap."""
    papers = []
    previous = None  # (paper mask, eye mask, [(centroid, is_paper)])
    for regions in enclosed:
        paper = np.zeros(regions.shape, bool)
        marks = []
        for r in np.unique(regions[regions > 0]):
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
            marks.append((centre, is_paper))
        papers.append(paper)
        previous = (paper, (regions > 0) & ~paper, marks) if marks else previous
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
        corner_threshold=60,
        length_threshold=4.0,
        max_iterations=10,
        splice_threshold=45,
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


def trace_rim(label: np.ndarray) -> str:
    return trace_mask(label > 0, INKS["black"])


def trace(state: str, take: str) -> dict:
    frames = frames_of(state, take)
    drawings = drawings_of(frames)
    still = STILLS / f"light-{state}.png"
    out = LOOPS / state
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.svg"):
        old.unlink()
    centres = take_palette(frames[0])
    rgbs = [frames[s : s + n].astype(np.float64).mean(0) for s, n in drawings]
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
    for i, label in enumerate(labels):
        (out / f"body-{i:02d}.svg").write_text(svg(trace_body(label), place))
        (out / f"rim-{i:02d}.svg").write_text(svg(trace_rim(label), place))
    timing = {
        "take": take,
        "frames": len(frames),
        "fps": 24,
        "drawings": [{"start": s, "length": n} for s, n in drawings],
        "placement": {"scale": place[0], "x": place[1], "y": place[2]},
        "stillOverlap": round(overlap(labels[0], still, place), 4),
    }
    (out / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
    return timing


def main() -> None:
    takes = json.loads((LOOPS / "takes.json").read_text())
    for state in sys.argv[1:] or list(takes):
        t = trace(state, takes[state])
        print(
            f"{state}: {len(t['drawings'])} drawings over {t['frames']} frames, "
            f"overlap with still {t['stillOverlap']}"
        )


if __name__ == "__main__":
    main()
