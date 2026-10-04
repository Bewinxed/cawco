# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Traces one of Caw's transition clips with trace.py into assets/mascot/clips/<clip>/
(body-NN.svg + timing.json, the loops' format), then trims, measures, snaps and gates it.

A clip is named for what it joins, and its ends are the statuses' stills, the drawings his still
state shows: a resting status's drawing (loops/rests.json), else the first drawing of the
status's first loop (loops/takes.json). trace.py registers a take onto a still picture; here that
picture is rendered from the end drawing itself, so a clip sits exactly on what it snaps to:
  <status>-enter     an empty page, then he lands on the status's still. Traced from its landing
                     backwards (frame pairs reversed, each pair kept in order), so trace.py
                     registers drawing 00 onto the still as for every loop. The landing holds
                     become one two-frame drawing, measured against the loop's body-00 and then
                     replaced by it; the leading empty pages become one two-frame empty drawing.
  <status>-exit      from the still, he leaves and the page is empty. The take's first drawing is
                     measured against body-00; the leading still drawings go, so the clip opens
                     on his first move; the trailing empty pages become one two-frame empty
                     drawing.
  <from>-to-<status> from one status's still to another's. Leading and trailing holds each become
                     one two-frame drawing, measured against the two body-00s, then replaced by
                     them.
Gates: a landing (an enter's or a change's last drawing) inked as its still on 98% of their
pixels or more; a start with its outline's p99 within 4 px of its still; the empty ends 0 ink px; on twos; no white
marks; halo 0 on every drawing; every eye intact (trace.py's cut_eyes). A clip that passes is
listed in clips/takes.json; one that fails exits non-zero and is not.

usage (from assets/mascot/scripts): uv run trace_clip.py <clip> <take>
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
# A leading drawing at this silhouette IoU with the start still or above still holds it: held
# still drawings drift a little (0.80-0.84 measured), every anticipation sits at 0.68 or under.
LEAD_STILL = 0.75
END_P99 = 4.0  # px at 512: the most a measured end may sit off its still before the snap
LANDING = 0.98  # share of a landing's inked pixels that carry its still's ink
SPECK = 200  # opaque px at 512: a drawing with less is dust traced off the take's paper
INKS = np.array([[20, 20, 20], [230, 80, 50], [244, 240, 230], [245, 200, 40]])
WHITE = np.array([244, 240, 230])
# Summed |RGB| under which a rendered pixel is a status's own ink's fill, not an eye white (the
# cream fill sits 20 from the eye white's; a fill renders exactly, its soft edge is see-through).
OWN_INK = 8

name, take = sys.argv[1:3]
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
if name.endswith("-enter"):
    kind, start, end = "enter", None, first[name.removesuffix("-enter")]
elif name.endswith("-exit"):
    kind, start, end = "exit", first[name.removesuffix("-exit")], None
else:
    a, b = name.split("-to-")
    kind, start, end = "change", first[a], first[b]
# A status's own inks (rests.json "inks": the compacted Caw's cream note) are traced in every clip
# that starts or lands on it.
own_inks = sorted({ink for v in (start, end) if v for ink in rests.get(v["still"].replace("-", "_"), {}).get("inks", [])})
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
picture_stills = [v["still"] for v in (start, end) if v and v["loop"] not in {x["loop"] for vs in variants.values() for x in vs}]
if picture_stills:
    # trace.py's refine() sizes a take by the extent of its traced outline against the still's.
    # That holds when the still was traced from a take too: the tracer rounds both the same. A
    # still traced from its picture (trace_still.py: the compacted Caw) keeps its tips where the
    # picture has them, while a take's tuft tip came out 1.75 units higher, and refine() shrank
    # the whole landing by 0.5% to fit it (scale 0.6213 where the frame's is 0.625): a ring of
    # black missing all round. So such a clip keeps placement()'s whole-pixel registration.
    T.refine = lambda silhouette, place, still: place
if kind != "change":
    # trace.py tells an eye white from a see-through gap by where the stills have paper. A bird
    # crossing the page is nowhere near his still, and that evidence cut the eyes out of a flying
    # drawing (hollow rings on dark). So on an enter or an exit nothing is evidence, and every
    # enclosed white is told by its shape and its ring (see_through's own rule for a guess).
    def no_evidence(enclosed: list, seed_paper: np.ndarray) -> list:
        out = []
        for regions in enclosed:
            ids, sizes = np.unique(regions[regions > 0], return_counts=True)
            out.append({int(r): (False, False) for r in ids[sizes >= T.MIN_REGION]})
        return out

    T.decide = no_evidence
if kind == "enter":

    def reversed_pairs(state: str, take_id: str) -> np.ndarray:
        f = original(state, take_id)
        n, h, w, c = f.shape
        return f.reshape(n // 2, 2, h, w, c)[::-1].reshape(n, h, w, c).copy()

    T.frames_of = reversed_pairs

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

    T.drawings_of = last_pair_alone

# trace.py registers drawing 00 onto a still: the one the take opens on, or for an enter (traced
# backwards) the one it lands on.
opening = end if kind == "enter" else start
closing = end["still"] if kind == "change" else None
T.LOOPS = CLIPS
# The stills trace.py registers onto, rendered from the end drawings.
stills = Path(tempfile.mkdtemp())
for v in (start, end):
    if v:
        png = resvg_py.svg_to_bytes(svg_string=(LOOPS_REPO / v["loop"] / f"body-{v['drawing']:02d}.svg").read_text(), width=SIZE, height=SIZE)
        (stills / f"light-{v['still']}.png").write_bytes(bytes(png))
T.STILLS = stills
timing = T.trace(name, take, opening["still"], closing)
# Eyes, on the fresh trace (trace.py's own timing and drawings): eye whites shown see-through.
eyes_cut = T.cut_eyes(name, take, opening["still"], closing)
frames = timing["frames"]
slots = timing["drawings"]
if kind == "enter":
    slots = [{**s, "start": frames - s["start"] - s["length"]} for s in reversed(slots)]

body00 = lambda v: LOOPS_REPO / v["loop"] / f"body-{v['drawing']:02d}.svg"  # noqa: E731
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
targets = {v["still"]: render(body00(v)) for v in (start, end) if v}
like = {still: {d: same_inks(p, t) for d, p in pictures.items()} for still, t in targets.items()}
report = {
    "take": take,
    "specksCleared": specks,
    "whiteMarksRemovedAtTrace": white_removed,
    "tracedFrames": frames,
    # Per traced slot: start, length, ink px at 512.
    "traced": [[s["start"], s["length"], ink_px[s["drawing"]]] for s in slots],
}


def holds(d: int, v: dict) -> bool:
    """Whether drawing `d` still shows `v`'s still."""
    target = targets[v["still"]]
    return like[v["still"]][d] >= STILL_HOLD or iou(masks[d], target[..., 3] > 127) >= LEAD_STILL


def measure(d: int, v: dict) -> dict:
    target = targets[v["still"]]
    target_mask = target[..., 3] > 127
    dmax, d99 = displacement(masks[d], target_mask)
    # Where it differs: the largest regions inked differently from the target (size, centre).
    differ, k = ndimage.label(ink_classes(pictures[d]) != ink_classes(target))
    sizes = ndimage.sum(np.ones_like(differ), differ, range(1, k + 1))
    top = [int(i) + 1 for i in np.argsort(sizes)[::-1][:3]]
    centres = ndimage.center_of_mass(np.ones_like(differ), differ, top)
    return {
        "against": f"{v['loop']}/body-{v['drawing']:02d}",
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


snapped = {}
if kind == "enter":
    # The landing: the trailing run inked as the still, one two-frame drawing.
    tail = len(slots) - 1
    while tail - 1 > 0 and like[end["still"]][slots[tail - 1]["drawing"]] >= STILL_HOLD:
        tail -= 1
    # The opening: the leading run of empty pages, one two-frame drawing.
    lead = 0
    while lead + 1 < tail and ink_px[slots[lead + 1]["drawing"]] == 0:
        lead += 1
    report["trimmedLeadingFrames"] = slots[lead]["start"]
    report["trimmedTrailingFrames"] = frames - (slots[tail]["start"] + 2)
    report["last"] = measure(slots[tail]["drawing"], end)
    report["firstInkPx"] = ink_px[slots[lead]["drawing"]]
    snap_id = max(pictures) + 1
    shutil.copy(body00(end), out / f"body-{snap_id:02d}.svg")
    snapped[snap_id] = end
    slots = retime(
        [{**slots[lead], "length": 2}, *slots[lead + 1 : tail], {**slots[tail], "drawing": snap_id, "length": 2}]
    )
    gates = {
        "landing": report["last"]["sameInks"] >= LANDING,
        "firstEmpty": report["firstInkPx"] == 0,
    }
elif kind == "exit":
    report["first"] = measure(slots[0]["drawing"], start)
    lead = 0
    while lead < len(slots) and holds(slots[lead]["drawing"], start):
        lead += 1
    # The leaving: the trailing run of empty pages, one two-frame drawing.
    tail = len(slots)
    while tail - 1 > lead and ink_px[slots[tail - 1]["drawing"]] == 0:
        tail -= 1
    has_empty_end = tail < len(slots)
    report["droppedLeadingFrames"] = slots[lead]["start"] if lead < len(slots) else frames
    report["trimmedTrailingFrames"] = frames - (slots[tail]["start"] + 2) if has_empty_end else 0
    kept = slots[lead:tail] + ([{**slots[tail], "length": 2}] if has_empty_end else [])
    report["lastInkPx"] = ink_px[kept[-1]["drawing"]] if kept else -1
    slots = retime(kept)
    gates = {
        "firstFrameP99": report["first"]["outlineP99Px"] <= END_P99,
        "lastEmpty": report["lastInkPx"] == 0,
    }
else:
    lead = 1
    while lead < len(slots) and holds(slots[lead]["drawing"], start):
        lead += 1
    tail = len(slots) - 1
    while tail - 1 >= lead and like[end["still"]][slots[tail - 1]["drawing"]] >= STILL_HOLD:
        tail -= 1
    report["trimmedLeadingFrames"] = slots[lead]["start"] - 2 if lead < len(slots) else 0
    report["trimmedTrailingFrames"] = frames - (slots[tail]["start"] + 2)
    report["first"] = measure(slots[0]["drawing"], start)
    report["last"] = measure(slots[tail]["drawing"], end)
    start_id, end_id = max(pictures) + 1, max(pictures) + 2
    shutil.copy(body00(start), out / f"body-{start_id:02d}.svg")
    shutil.copy(body00(end), out / f"body-{end_id:02d}.svg")
    snapped = {start_id: start, end_id: end}
    slots = retime(
        [{**slots[0], "drawing": start_id, "length": 2}, *slots[lead:tail], {**slots[tail], "drawing": end_id, "length": 2}]
    )
    gates = {
        "firstFrameP99": report["first"]["outlineP99Px"] <= END_P99,
        "landing": report["last"]["sameInks"] >= LANDING,
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

# Halo per drawing: trace.py's own measure for each traced drawing, the source loops' for snaps
# (read from the loops' takes the right way round).
T.LOOPS = LOOPS_REPO
T.frames_of, T.drawings_of, T.decide = original, grouped, decided
takes = {v["loop"]: v["take"] for vs in variants.values() for v in vs}
halos = {f"{d:02d}": timing["halo"][f"{d:02d}"] for d in sorted(used) if d not in snapped}
for d, v in snapped.items():
    # A rest traced from its picture (trace_still.py) has no take: its halo was measured there.
    halos[f"{d:02d}"] = (
        T.measure_halo(v["loop"], takes[v["loop"]])[f"{v['drawing']:02d}"]
        if v["loop"] in takes
        else json.loads((LOOPS_REPO / v["loop"] / "timing.json").read_text())["halo"][f"{v['drawing']:02d}"]
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
timing.update(frames=report["frames"], drawings=slots, halo=halos, probe=report)
(out / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
print(json.dumps(report))
listed = CLIPS / "takes.json"
clips = json.loads(listed.read_text()) if listed.exists() else {}
clips.pop(name, None)
if all(gates.values()):
    clips[name] = take
listed.write_text(json.dumps(dict(sorted(clips.items())), indent=2) + "\n")
if not all(gates.values()):
    sys.exit(f"{name}: failed {[g for g, ok in gates.items() if not ok]}")
