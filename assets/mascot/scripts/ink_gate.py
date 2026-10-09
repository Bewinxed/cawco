# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.3", "pillow>=11.3", "scipy>=1.16", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Holds every traced drawing's eye whites and vermilion to the art already shipped.

    uv run ink_gate.py [--base <git ref>] [--all] [folder ...]

Each drawing on disk under assets/mascot/loops/ and assets/mascot/clips/ and the drawing the base
ref (default origin/main) shows at the same frame of the same take are drawn on the dark page
(the dashboard's --background at night) and their pixels counted by ink. Counting on the page,
not by alpha or by the paths a drawing lists, is the point: an eye white traced as a hole in his
black shows the page through it, and a white path drawn under his black shows nothing, so either
counts as lost. A drawing fails when it shows less eye white or less vermilion than the base by
more than TOLERANCE of the base's count and more than FLOOR pixels, or more by as much (a white
speck or scribble where the base has none); or when any one region of either ink over FLOOR
pixels is in one and nowhere within REACH in the other: a drawing whose props carry most of its
white (a template pose) can lose a whole eye and stay inside the tolerance. A drawing holds frames; it is
compared with the base at each of them and judged by its nearest match, so the base holding a
drawing a frame longer is no loss. A failure stands unless ink_gate.json lists it, keyed
"<folder>/<drawing>/<ink>/<loss|gain>", with the reason the change is right.

Prints one line per folder (with --all, also the ones that hold), each failure, and the totals;
exits non-zero when any failure is not allowed, or when an allowed one no longer occurs (the list
stays the list of what is true).
"""

import io
import json
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import resvg_py
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import trace as T  # noqa: E402

HERE = Path(__file__).resolve().parent
MASCOT = HERE.parent
REPO = Path(
    subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], cwd=HERE, capture_output=True, text=True, check=True
    ).stdout.strip()
)
ALLOWED = HERE / "ink_gate.json"
# The dashboard's page at night: --background is --neutral-1, oklch(18.4% 0.004 70) in dark
# (apps/dashboard/src/lib/tokens/tokens.css), in sRGB.
DARK_PAGE = (20, 18, 17)
SIZE = 512  # the drawings' own box, one pixel a unit
WATCHED = ("white", "vermilion")
TOLERANCE = 0.15
# Below this many pixels of 512 a change is the outline's antialiasing moving, not ink: two
# traces of the same eye differ by up to FLOOR along their edges.
FLOOR = 40
# How far (px of 512) a region of ink may move before it counts as lost where it was and gained
# where it is: register() places a re-trace up to a pixel or two from the art it replaces.
REACH = 3
# A pixel counts as an ink when that ink is the nearest colour to it and within this distance;
# antialiased edges between two inks count as neither.
NEAR = 40.0


def inked(svg: str) -> dict[str, np.ndarray]:
    """Where the drawing shows each watched ink on the dark page."""
    rgba = np.asarray(
        Image.open(
            io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=svg, width=SIZE, height=SIZE)))
        ).convert("RGBA"),
        dtype=np.float64,
    )
    alpha = rgba[..., 3:] / 255
    seen = rgba[..., :3] * alpha + np.array(DARK_PAGE) * (1 - alpha)
    names = ["page", *T.INKS]
    colours = np.array([DARK_PAGE, *T.INKS.values()], dtype=np.float64)
    distance = np.linalg.norm(seen[..., None, :] - colours, axis=-1)
    nearest = distance.argmin(-1)
    close = distance.min(-1) < NEAR
    return {ink: (nearest == names.index(ink)) & close for ink in WATCHED}


def largest_part(mask: np.ndarray) -> int:
    parts, n = ndimage.label(mask)
    return int(np.bincount(parts.ravel())[1:].max()) if n else 0


def compare(now: np.ndarray, base: np.ndarray) -> dict[str, int]:
    """The base's and this drawing's pixels of one ink, and the largest single region of it each
    has where the other has none within REACH (a drawing placed a pixel or two off is no loss)."""
    near_now = ndimage.binary_dilation(now, iterations=REACH)
    near_base = ndimage.binary_dilation(base, iterations=REACH)
    return {
        "was": int(base.sum()),
        "now": int(now.sum()),
        "lost": largest_part(base & ~near_now),
        "gained": largest_part(now & ~near_base),
    }


def fails(c: dict[str, int]) -> list[str]:
    """loss / gain, by the whole drawing's count or by one region."""
    out = []
    change = c["now"] - c["was"]
    if c["lost"] > FLOOR or (change < -FLOOR and -change > TOLERANCE * c["was"]):
        out.append("loss")
    if c["gained"] > FLOOR or (change > FLOOR and change > TOLERANCE * c["was"]):
        out.append("gain")
    return out


def frames(timing: dict) -> list[int]:
    """The drawing shown at each frame."""
    shown = [0] * timing["frames"]
    for slot in timing["drawings"]:
        for t in range(slot["start"], slot["start"] + slot["length"]):
            shown[t] = slot["drawing"]
    return shown


def git_show(ref: str, path: Path) -> str | None:
    shown = subprocess.run(
        ["git", "show", f"{ref}:{path.relative_to(REPO).as_posix()}"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return shown.stdout if shown.returncode == 0 else None


def judge(folder: Path, ref: str) -> tuple[list[dict], str | None]:
    """Every watched ink's change per drawing of one folder against the base ref."""
    base_timing = git_show(ref, folder / "timing.json")
    if base_timing is None:
        return [], "new, nothing shipped to hold it to"
    now_shown, base_shown = frames(json.loads((folder / "timing.json").read_text())), frames(
        json.loads(base_timing)
    )
    now = {d: inked((folder / f"body-{d:02d}.svg").read_text()) for d in sorted(set(now_shown))}
    base = {}
    for d in sorted(set(base_shown)):
        svg = git_show(ref, folder / f"body-{d:02d}.svg")
        if svg is None:
            raise SystemExit(f"{ref} lists {folder.name} drawing {d} and has no body-{d:02d}.svg")
        base[d] = inked(svg)
    # The base frame at each frame: the same frame, or the same point of a take trimmed to
    # another length.
    scale = (len(base_shown) - 1) / max(len(now_shown) - 1, 1)
    rows = []
    for d in now:
        covered = sorted({base_shown[round(t * scale)] for t, shown in enumerate(now_shown) if shown == d})
        for ink in WATCHED:
            # The nearest match among the base drawings this one's frames show.
            c = min(
                (compare(now[d][ink], base[b][ink]) for b in covered),
                key=lambda c: (len(fails(c)), c["lost"] + c["gained"] + abs(c["now"] - c["was"])),
            )
            for kind in fails(c):
                rows.append(dict(key=f"{folder.name}/{d:02d}/{ink}/{kind}", **c))
    return rows, None


def main(argv: list[str]) -> int:
    ref, show_all, names = "origin/main", False, []
    args = iter(argv)
    for arg in args:
        if arg == "--base":
            ref = next(args)
        elif arg == "--all":
            show_all = True
        else:
            names.append(arg)
    folders = sorted(
        f
        for root in (MASCOT / "loops", MASCOT / "clips")
        for f in root.iterdir()
        if (f / "timing.json").exists() and (not names or f.name in names)
    )
    allowed: dict[str, str] = json.loads(ALLOWED.read_text()) if ALLOWED.exists() else {}
    failed, excused, seen = 0, 0, set()
    with Pool(min(8, len(folders))) as pool:
        judged = pool.starmap(judge, [(folder, ref) for folder in folders])
    for folder, (rows, skipped) in zip(folders, judged):
        if skipped:
            print(f"{folder.name}: {skipped}")
            continue
        own = [r for r in rows if r["key"] not in allowed]
        seen.update(r["key"] for r in rows)
        excused += len(rows) - len(own)
        failed += len(own)
        if own or show_all:
            print(f"{folder.name}: {'FAIL ' + str(len(own)) if own else 'holds'}")
        for r in rows:
            pct = (r["now"] - r["was"]) / max(r["was"], 1)
            note = f"  allowed: {allowed[r['key']]}" if r["key"] in allowed else ""
            region = r["lost"] if r["key"].endswith("/loss") else r["gained"]
            print(f"  {r['key']}  {r['was']} -> {r['now']} px ({pct:+.0%}), largest region {region} px{note}")
    stale = [k for k in allowed if k.split("/")[0] in {f.name for f in folders} and k not in seen]
    for k in stale:
        print(f"ink_gate.json lists {k}, which no longer occurs: remove it")
    print(
        f"ink gate against {ref}: {len(folders)} folders, {failed} drawings fail, {excused} allowed"
        f"{', ' + str(len(stale)) + ' stale allowances' if stale else ''}"
    )
    return 1 if failed or stale else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
