# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Traces one of Caw's enters with trace.py into assets/mascot/clips/<status>-enter/
(body-NN.svg + timing.json, the loops' format), then trims, measures, snaps and gates it.

An enter starts on an empty page, or with him small and far off, and lands on the status's still, the drawing his still state
shows: a resting status's drawing (loops/rests.json), else the first drawing of the status's
first loop (loops/takes.json). trace.py registers a take onto a still picture; here that picture
is rendered from the still's drawing itself, so the enter sits exactly on what it snaps to. It is
traced from its landing backwards (frame pairs reversed, each pair kept in order), so trace.py
registers drawing 00 onto the still as for every loop. The landing holds become one two-frame
drawing, measured against the loop's body-00 and then replaced by it; the leading empty pages
become one two-frame empty drawing.

Gates: the landing inked as its still on 98% of their pixels or more; the first drawing empty or
carrying 5% of the still's ink at most, so he never appears at size;
on twos; no white marks; halo 0 on every drawing; every eye intact (trace.py's cut_eyes); every
ink in order (no drawing shows an ink his landing does not carry, and a status's own ink, the note,
shows only on a drawing where his eye whites are in or his black is at 90% of what he lands with);
and the
safe area: on every drawing his ink sits inside the line 3.5% in from each edge of the tighter of
the take's frame and the artboard the apps draw, so he is wholly visible or not there at all (EBU
R95 and ITU-R BT.1848 give the 3.5% action-safe margin; SMPTE RP 218: "all significant action
shall be contained"). An enter that passes is listed in the folder's takes.json; one that fails
exits non-zero and is not.

usage (from assets/mascot/scripts):
  uv run trace_clip.py <status>-enter <take> [clips folder]   into assets/mascot/clips by default
  uv run trace_clip.py --safe [--dir <clips folder>] [clip ...]   the safe-area check alone, over
      clips already traced (every clip in the folder by default): one line per clip naming the
      drawings outside the safe line, and a non-zero exit if any named clip breaks it
  uv run trace_clip.py --inks [--dir <clips folder>] [clip ...]   the ink-order check alone, the same way
"""
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
import resvg_py
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
import trace as T  # noqa: E402

LOOPS_REPO = T.LOOPS
CLIPS = LOOPS_REPO.parent / "clips"
SIZE = 512
STILL_HOLD = 0.95  # share inked the same as a still, at or above which a drawing holds it
LANDING = 0.98  # share of a landing's inked pixels that carry its still's ink
# The most ink an enter's first drawing may carry, as a share of its still's: an empty page, or
# him far off (a take that has him in its first frame at a ninth of his size measures 0.013).
OPENS_SMALL = 0.05
INK_SHOWS = 300  # px of one ink at the stills' scale from which a drawing visibly carries it
HEAD_FORMED = 0.9  # share of his landed black from which a drawing reads as him at size
SPECK = 200  # opaque px at 512: a drawing with less is dust traced off the take's paper
INKS = np.array([[20, 20, 20], [230, 80, 50], [244, 240, 230], [245, 200, 40]])
WHITE = np.array([244, 240, 230])
# Summed |RGB| under which a rendered pixel is a status's own ink's fill, not an eye white (the
# cream fill sits 20 from the eye white's; a fill renders exactly, its soft edge is see-through).
OWN_INK = 8

# The artboard the apps draw, in the stills' units: 592 square, the still box 43 right, 40 down.
ARTBOARD = (-43.0, -40.0, 592.0)
SAFE = 0.035  # EBU R95 / ITU-R BT.1848 action-safe margin, in from each edge
SAFE_PX = 600  # the side the safe area is measured at


def unsafe_drawings(folder: Path) -> list[int]:
    """The clip's drawings, counted from 1 in playing order, with ink outside the safe line: 3.5%
    in from each edge of the tighter of the take's frame and the artboard."""
    timing = json.loads((folder / "timing.json").read_text())
    p = timing["placement"]
    take = (p["x"], p["y"], 1024 * p["scale"])
    left, top = max(take[0], ARTBOARD[0]), max(take[1], ARTBOARD[1])
    right = min(take[0] + take[2], ARTBOARD[0] + ARTBOARD[2])
    bottom = min(take[1] + take[2], ARTBOARD[1] + ARTBOARD[2])
    # A view one margin wider than the box, so ink beyond its edge is seen too.
    w, h = right - left, bottom - top
    view = f'viewBox="{left - SAFE * w} {top - SAFE * h} {w * (1 + 2 * SAFE)} {h * (1 + 2 * SAFE)}"'
    inner = np.zeros((SAFE_PX, SAFE_PX), bool)
    m = round(SAFE_PX * 2 * SAFE / (1 + 2 * SAFE))
    inner[m : SAFE_PX - m, m : SAFE_PX - m] = True
    out = []
    for k, slot in enumerate(timing["drawings"]):
        text = (folder / f"body-{slot['drawing']:02d}.svg").read_text()
        text = text.replace('viewBox="0 0 512 512"', view + ' preserveAspectRatio="none"')
        png = resvg_py.svg_to_bytes(svg_string=text, width=SAFE_PX, height=SAFE_PX)
        ink = np.asarray(Image.open(io.BytesIO(bytes(png))).convert("RGBA"))[..., 3] > 127
        if (ink & ~inner).any():
            out.append(k + 1)
    return out


def out_of_order(folder: Path, own: list[str]) -> dict[str, list[int]]:
    """The clip's drawings, counted from 1 in playing order, where an ink is out of place.
    `foreign`: an ink his landing does not carry (under INK_SHOWS px there) shows; a take once put
    a vermilion patch on a head that has none. `ownEarly`: a status's own ink (the note) shows on
    a shape that does not read as him yet: neither are his eye whites in, nor has his black
    reached HEAD_FORMED of what he lands with (a take once had the note's cream inside a blob).
    Either is enough: a bird far off has his eyes long before his size, a head that swells from
    a drop has its size before its eyes. `ownBy` says which of the two let each drawing that
    shows his own ink through. Pixels are counted over the take's whole frame at the stills'
    scale."""
    timing = json.loads((folder / "timing.json").read_text())
    names = ["black", "vermilion", "white", "yellow", *own]
    colours = np.array([T.INKS.get(n, T.EXTRA_INKS.get(n)) for n in names])

    def counts(drawing: int) -> dict[str, int]:
        text = (folder / f"body-{drawing:02d}.svg").read_text().replace('viewBox="0 0 512 512"', 'viewBox="-48 -32 608 608"')
        p = np.asarray(Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=text, width=608, height=608)))).convert("RGBA")).astype(int)
        nearest = np.abs(p[..., None, :3] - colours).sum(-1).argmin(-1)
        return {n: int(((p[..., 3] > 127) & (nearest == k)).sum()) for k, n in enumerate(names)}

    per = [counts(slot["drawing"]) for slot in timing["drawings"]]
    carried = {n for n, px in per[-1].items() if px >= INK_SHOWS}
    shows = [k for k, c in enumerate(per) if any(c[n] >= INK_SHOWS for n in own)]
    by = {
        k + 1: "eyes" if per[k]["white"] >= INK_SHOWS else "head" if per[k]["black"] >= HEAD_FORMED * per[-1]["black"] else None
        for k in shows
    }
    return {
        "foreign": [k + 1 for k, c in enumerate(per) if any(px >= INK_SHOWS and n not in carried for n, px in c.items())],
        "ownEarly": [k for k, how in by.items() if how is None],
        "ownBy": {str(k): how for k, how in by.items() if how},
    }


if sys.argv[1:2] in (["--safe"], ["--inks"]):
    mode, args = sys.argv[1], sys.argv[2:]
    folder = CLIPS
    if args[:1] == ["--dir"]:
        folder, args = Path(args[1]), args[2:]
    names = args or sorted(d.name for d in folder.iterdir() if (d / "timing.json").exists())
    own_of = json.loads((T.LOOPS / "rests.json").read_text())
    broken = False
    for clip in names:
        slots = len(json.loads((folder / clip / "timing.json").read_text())["drawings"])
        if mode == "--safe":
            unsafe = unsafe_drawings(folder / clip)
            broken |= bool(unsafe)
            print(f"{clip}: {slots} drawings, " + (f"outside the safe line: {unsafe}" if unsafe else "all inside the safe line"))
        else:
            own = own_of.get(clip.removesuffix("-enter").replace("-", "_"), {}).get("inks", [])
            order = out_of_order(folder / clip, own)
            bad = bool(order["foreign"] or order["ownEarly"])
            broken |= bad
            passed = f"; his own ink shows by {order['ownBy']}" if order["ownBy"] else ""
            print(
                f"{clip}: {slots} drawings, "
                + (f"inks out of order: foreign {order['foreign']}, his own ink early {order['ownEarly']}" if bad else "every ink in order")
                + passed
            )
    sys.exit(1 if broken else 0)

name, take = sys.argv[1:3]
if not name.endswith("-enter"):
    sys.exit(f"{name}: a clip is a status's enter, <status>-enter")
if sys.argv[3:]:
    CLIPS = Path(sys.argv[3]).resolve()
variants = json.loads((LOOPS_REPO / "takes.json").read_text())
rests = json.loads((LOOPS_REPO / "rests.json").read_text())
# Each status's still: the loop it is drawn in and the drawing's number there.
first = {
    status.replace("_", "-"): {"loop": rests.get(status, loops[0])["loop"], "drawing": rests.get(status, {}).get("drawing", 0)}
    for status, loops in variants.items()
}
for status, rest in rests.items():
    first.setdefault(status, rest)
for status, v in first.items():
    v["still"] = status
end = first[name.removesuffix("-enter")]
# A status's own inks (rests.json "inks": the compacted Caw's cream note) are traced in its enter.
own_inks = sorted(rests.get(end["still"].replace("-", "_"), {}).get("inks", []))
T.use_inks(own_inks)
out = CLIPS / name
if out.exists():
    shutil.rmtree(out)
out.parent.mkdir(parents=True, exist_ok=True)


def render(svg: Path) -> np.ndarray:
    png = resvg_py.svg_to_bytes(svg_string=svg.read_text(), width=SIZE, height=SIZE)
    return np.asarray(Image.open(io.BytesIO(bytes(png))).convert("RGBA")).astype(int)


def iou(a: np.ndarray, b: np.ndarray) -> float:
    union = (a | b).sum()
    return float((a & b).sum() / union) if union else 1.0


def ink_classes(p: np.ndarray) -> np.ndarray:
    nearest = np.abs(p[..., None, :3] - INKS).sum(-1).argmin(-1) + 1
    return np.where(p[..., 3] > 127, nearest, 0)


def same_inks(a: np.ndarray, b: np.ndarray) -> float:
    """Share of the pixels inked in either picture that carry the same ink in both."""
    ca, cb = ink_classes(a), ink_classes(b)
    inked = (ca > 0) | (cb > 0)
    return float((ca == cb)[inked].mean()) if inked.any() else 1.0


def displacement(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """Max and 99th-percentile distance (px at 512) from each outline to the other's."""
    ea, eb = a & ~ndimage.binary_erosion(a), b & ~ndimage.binary_erosion(b)
    d = np.concatenate(
        [ndimage.distance_transform_edt(~eb)[ea], ndimage.distance_transform_edt(~ea)[eb]]
    )
    return float(d.max()), float(np.percentile(d, 99))


# White ink is only ever an eye, inside the black body. White touching the page around him is a
# smear on his outline, cut away; white on a separate piece (a loose feather's quill) is inked
# black, so the piece keeps its shape. An eye beside a see-through gap inside him stays.
white_removed = []
traced_body = T.trace_body
WHITE_INK = list(T.INKS).index("white") + 1


def body_without_white_marks(label: np.ndarray) -> str:
    label = label.copy()
    pieces, count = ndimage.label(label > 0)
    body = np.argmax(np.bincount(pieces.ravel())[1:]) + 1 if count else 0
    regions, n = ndimage.label(label == WHITE_INK)
    blank, _ = ndimage.label(label == 0)
    edge_ids = np.unique(np.concatenate([blank[0], blank[-1], blank[:, 0], blank[:, -1]]))
    page = ndimage.binary_dilation(np.isin(blank, edge_ids[edge_ids > 0]))
    for r in range(1, n + 1):
        region = regions == r
        if not (pieces[region] == body).all():
            white_removed.append(int(region.sum()))
            label[region] = 1
        elif (region & page).any():
            white_removed.append(int(region.sum()))
            label[region] = 0
    return traced_body(label)


T.trace_body = body_without_white_marks
original, grouped, decided = T.frames_of, T.drawings_of, T.decide
if end["loop"] not in {x["loop"] for vs in variants.values() for x in vs}:
    # trace.py's refine() sizes a take by the extent of its traced outline against the still's.
    # That holds when the still was traced from a take too: the tracer rounds both the same. A
    # still traced from its picture (trace_still.py: the compacted Caw) keeps its tips where the
    # picture has them, while a take's tuft tip came out 1.75 units higher, and refine() shrank
    # the whole landing by 0.5% to fit it (scale 0.6213 where the frame's is 0.625): a ring of
    # black missing all round. So such an enter keeps placement()'s whole-pixel registration.
    T.refine = lambda silhouette, place, still: place


# trace.py tells an eye white from a see-through gap by where the stills have paper. A bird
# crossing the page is nowhere near his still, and that evidence cut the eyes out of a flying
# drawing (hollow rings on dark). So nothing is evidence, and every enclosed white is told by its
# shape and its ring (see_through's own rule for a guess).
def no_evidence(enclosed: list, seed_paper: np.ndarray) -> list:
    out = []
    for regions in enclosed:
        ids, sizes = np.unique(regions[regions > 0], return_counts=True)
        out.append({int(r): (False, False) for r in ids[sizes >= T.MIN_REGION]})
    return out


def reversed_pairs(state: str, take_id: str) -> np.ndarray:
    f = original(state, take_id)
    n, h, w, c = f.shape
    return f.reshape(n // 2, 2, h, w, c)[::-1].reshape(n, h, w, c).copy()


# Drawing 00 is the take's last frame pair exactly: trace.py would merge it with the pairs
# before it that differ by under SAME_DRAWING and trace their average, and a prop still
# settling there would blur into a half-size one.
def last_pair_alone(frames: np.ndarray) -> list:
    groups = grouped(frames)
    at, length, members = groups[0]
    if length > 2:
        rest = [m for m in members if m >= 2]
        groups = [(at, 2, [m for m in members if m < 2]), (2, length - 2, rest), *groups[1:]]
    return groups


T.decide, T.frames_of, T.drawings_of = no_evidence, reversed_pairs, last_pair_alone
T.LOOPS = CLIPS
# The still trace.py registers the landing onto, rendered from its drawing.
stills = Path(tempfile.mkdtemp())
body00 = LOOPS_REPO / end["loop"] / f"body-{end['drawing']:02d}.svg"
(stills / f"light-{end['still']}.png").write_bytes(
    bytes(resvg_py.svg_to_bytes(svg_string=body00.read_text(), width=SIZE, height=SIZE))
)
T.STILLS = stills
timing = T.trace(name, take, end["still"], None)
# Eyes, on the fresh trace (trace.py's own timing and drawings): eye whites shown see-through.
eyes_cut = T.cut_eyes(name, take, end["still"], None)
frames = timing["frames"]
slots = [{**s, "start": frames - s["start"] - s["length"]} for s in reversed(timing["drawings"])]

place = (timing["placement"]["scale"], timing["placement"]["x"], timing["placement"]["y"])
pictures = {d: render(out / f"body-{d:02d}.svg") for d in sorted({s["drawing"] for s in slots})}
specks = {}
for d, p in pictures.items():
    inked = int((p[..., 3] > 127).sum())
    if 0 < inked < SPECK:
        specks[f"body-{d:02d}"] = inked
        (out / f"body-{d:02d}.svg").write_text(T.svg("", place))
        pictures[d] = render(out / f"body-{d:02d}.svg")
masks = {d: p[..., 3] > 127 for d, p in pictures.items()}
ink_px = {d: int(m.sum()) for d, m in masks.items()}
target = render(body00)
like = {d: same_inks(p, target) for d, p in pictures.items()}
report = {
    "take": take,
    "specksCleared": specks,
    "whiteMarksRemovedAtTrace": white_removed,
    "tracedFrames": frames,
    # Per traced slot: start, length, ink px at 512.
    "traced": [[s["start"], s["length"], ink_px[s["drawing"]]] for s in slots],
}


def measure(d: int) -> dict:
    """How drawing `d` sits against the still."""
    target_mask = target[..., 3] > 127
    dmax, d99 = displacement(masks[d], target_mask)
    # Where it differs: the largest regions inked differently from the target (size, centre).
    differ, k = ndimage.label(ink_classes(pictures[d]) != ink_classes(target))
    sizes = ndimage.sum(np.ones_like(differ), differ, range(1, k + 1))
    top = [int(i) + 1 for i in np.argsort(sizes)[::-1][:3]]
    centres = ndimage.center_of_mass(np.ones_like(differ), differ, top)
    return {
        "against": f"{end['loop']}/body-{end['drawing']:02d}",
        "iou": round(iou(masks[d], target_mask), 4),
        "sameInks": round(same_inks(pictures[d], target), 4),
        "outlineMaxPx": round(dmax, 2),
        "outlineP99Px": round(d99, 2),
        "largestDiffs": [{"px": int(sizes[i - 1]), "at": [round(c[1]), round(c[0])]} for i, c in zip(top, centres)],
    }


def retime(held: list[dict]) -> list[dict]:
    at, out_slots = 0, []
    for s in held:
        out_slots.append({**s, "start": at})
        at += s["length"]
    return out_slots


# The landing: the trailing run inked as the still, one two-frame drawing.
tail = len(slots) - 1
while tail - 1 > 0 and like[slots[tail - 1]["drawing"]] >= STILL_HOLD:
    tail -= 1
# The opening: the leading run of empty pages, one two-frame drawing.
lead = 0
while lead + 1 < tail and ink_px[slots[lead + 1]["drawing"]] == 0:
    lead += 1
report["trimmedLeadingFrames"] = slots[lead]["start"]
report["trimmedTrailingFrames"] = frames - (slots[tail]["start"] + 2)
report["last"] = measure(slots[tail]["drawing"])
report["firstInkPx"] = ink_px[slots[lead]["drawing"]]
snap_id = max(pictures) + 1
shutil.copy(body00, out / f"body-{snap_id:02d}.svg")
slots = retime(
    [{**slots[lead], "length": 2}, *slots[lead + 1 : tail], {**slots[tail], "drawing": snap_id, "length": 2}]
)
gates = {
    "landing": report["last"]["sameInks"] >= LANDING,
    "opensSmall": report["firstInkPx"] <= OPENS_SMALL * int((target[..., 3] > 127).sum()),
}

# Drawings no slot shows any more go.
used = {s["drawing"] for s in slots}
for svg in out.glob("body-*.svg"):
    if int(svg.stem.split("-")[1]) not in used:
        svg.unlink()

twos = all(s["start"] % 2 == 0 and s["length"] % 2 == 0 and s["length"] >= 2 for s in slots)
# White marks, checked over the whole take frame (it reaches past the 512 still box), regions of a
# few anti-aliased pixels aside.
FULL = (-48, -32, 608)
white_marks = {}
for d in sorted(used):
    text = (out / f"body-{d:02d}.svg").read_text().replace(
        'viewBox="0 0 512 512"', f'viewBox="{FULL[0]} {FULL[1]} {FULL[2]} {FULL[2]}"'
    )
    p = np.asarray(
        Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=text, width=FULL[2], height=FULL[2])))).convert("RGBA")
    ).astype(int)
    opaque = p[..., 3] > 127
    white = opaque & (np.abs(p[..., :3] - WHITE).sum(-1) < 60)
    # A status's own light ink (the note) is meant to touch the page: only eye white is a mark.
    for ink in own_inks:
        white &= np.abs(p[..., :3] - np.array(T.INKS[ink])).sum(-1) >= OWN_INK
    regions, n = ndimage.label(white)
    touching = [
        int((regions == r).sum())
        for r in range(1, n + 1)
        if (regions == r).sum() >= 4 and (ndimage.binary_dilation(regions == r, iterations=2) & ~opaque).any()
    ]
    if touching:
        white_marks[f"body-{d:02d}"] = touching

# Halo per drawing: trace.py's own measure for each traced drawing, the still's loop's for the
# snapped landing (read from the loop's take the right way round).
T.LOOPS = LOOPS_REPO
T.frames_of, T.drawings_of, T.decide = original, grouped, decided
takes = {v["loop"]: v["take"] for vs in variants.values() for v in vs}
halos = {f"{d:02d}": timing["halo"][f"{d:02d}"] for d in sorted(used) if d != snap_id}
# A rest traced from its picture (trace_still.py) has no take: its halo was measured there.
halos[f"{snap_id:02d}"] = (
    T.measure_halo(end["loop"], takes[end["loop"]])[f"{end['drawing']:02d}"]
    if end["loop"] in takes
    else json.loads((LOOPS_REPO / end["loop"] / "timing.json").read_text())["halo"][f"{end['drawing']:02d}"]
)
eyes = {k: v for k, v in eyes_cut.items() if int(k) in used and v >= T.CUT_EYE}

report.update(
    frames=sum(s["length"] for s in slots),
    slots=len(slots),
    drawings=len(used),
    onTwos=twos,
    whiteMarks=white_marks,
    halo=halos,
    eyesCut=eyes,
)
gates.update(onTwos=twos, whiteMarks=not white_marks, halo=all(v == 0 for v in halos.values()), eyes=not eyes)
report["gates"] = gates
# The safe area is read from the clip as written, so its timing goes down first.
timing.update(frames=report["frames"], drawings=slots)
(out / "timing.json").write_text(T.dump_json(timing))
report["inksOutOfOrder"] = out_of_order(out, own_inks)
gates["inkOrder"] = not (report["inksOutOfOrder"]["foreign"] or report["inksOutOfOrder"]["ownEarly"])
report["outsideSafe"] = unsafe_drawings(out)
gates["safeArea"] = not report["outsideSafe"]
timing.update(frames=report["frames"], drawings=slots, halo=halos, probe=report)
(out / "timing.json").write_text(T.dump_json(timing))
print(json.dumps(report))
listed = CLIPS / "takes.json"
clips = json.loads(listed.read_text()) if listed.exists() else {}
clips.pop(name, None)
if all(gates.values()):
    clips[name] = take
listed.write_text(T.dump_json(dict(sorted(clips.items()))))
if not all(gates.values()):
    sys.exit(f"{name}: failed {[g for g, ok in gates.items() if not ok]}")
