# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.3", "pillow>=11.3", "scipy>=1.16", "vtracer==0.6.15", "resvg-py==0.5.0"]
# ///
"""Regression for a change to trace.py's rules: every drawing the pipeline traces, through an older
trace.py (a git ref's) and the working one, down to finish()'s final labels (what vtracer traces;
identical labels give identical SVGs). Per source: drawings, pixels whose final label differs, and
each ink's pixel count summed over the drawings, before and after. A change to a rule is run over
every source before it ships: a rule fenced to one kind of take hides what it does to the rest.

Sources, each fed as its own script feeds it:
  loops   loops/takes.json, as trace.py's trace() (still evidence from both ends)
  enters  clips/takes.json, as trace_clip.py: frame pairs reversed, the last pair alone, the end
          still rendered from its drawing, the file's own inks; an enter from an empty page with no
          evidence, a clip that opens on a still (its timing's probe names it) with both stills'
          evidence, a `tkA+tkB` take as its windows' frames in order
  ledges  clips/climb-peer, clips/peer-over, as trace_ledge.py (the blue ledge keyed to paper)
  stills  every stills/*.png, as trace_still.py (the picture on paper at the takes' scale), with
          the inks rests.json names for it

usage (from assets/mascot/scripts):
  uv run regress.py [--old <git ref>] [--mascot <assets/mascot folder>] [--only name,...]
    --old     the trace.py to compare against, read from git (default origin/main)
    --mascot  the mascot folder whose takes, stills and working trace.py are used (default this
              script's own, so a workspace's copy tests itself)
It prints one line per source and "identical: N/M", writes regress-last.json beside the
working tracer's folder's .regress/, and exits non-zero if any source differs.
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
from multiprocessing import Pool
from pathlib import Path

import numpy as np

ARGS = sys.argv[1:]


def option(name: str, default: str) -> str:
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


MASCOT = Path(option("--mascot", str(Path(__file__).resolve().parent.parent))).resolve()
NEW = MASCOT / "scripts" / "trace.py"
OUT = MASCOT / "scripts" / ".regress"


def old_tracer(ref: str) -> Path:
    """The ref's trace.py, written out once per run."""
    root = subprocess.run(["git", "-C", str(MASCOT), "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip()
    rel = NEW.relative_to(root)
    text = subprocess.run(["git", "-C", root, "show", f"{ref}:{rel}"], check=True, capture_output=True, text=True).stdout
    OUT.mkdir(exist_ok=True)
    path = OUT / "trace_old.py"
    path.write_text(text)
    return path


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.STILLS, mod.LOOPS = MASCOT / "stills", MASCOT / "loops"
    return mod


def no_evidence(T):
    def decide(enclosed, seed_paper):
        out = []
        for regions in enclosed:
            ids, sizes = np.unique(regions[regions > 0], return_counts=True)
            out.append({int(r): (False, "none") for r in ids[sizes >= T.MIN_REGION]})
        return out

    return decide


def frames(T, take: str) -> np.ndarray:
    return np.concatenate([T.frames_of("x", t) for t in take.split("+")])


def labels_loop(T, take, still_name):
    f = frames(T, take)
    drawings = T.drawings_of(f)
    rgbs = [f[m].astype(np.float64).mean(0) for _, _, m in drawings]
    centres = T.take_palette(rgbs)
    found = [T.inks(rgb, centres) for rgb in rgbs]
    still = T.STILLS / f"light-{still_name}.png"
    place = T.placement(found[0][0], still)
    shape = rgbs[0].shape[:2]
    papers = T.see_through([e for _, e in found], [lab for lab, _ in found], T.paper_of(still, place, shape), T.paper_of(still, place, shape))
    return [T.finish(lab, rgb, p) for (lab, _), rgb, p in zip(found, rgbs, papers)]


def labels_enter(T, take, end_drawing, open_drawing, own_inks):
    import resvg_py

    T.use_inks(own_inks)
    if open_drawing is None:
        T.decide = no_evidence(T)
    f = frames(T, take)
    n, h, w, c = f.shape
    f = f.reshape(n // 2, 2, h, w, c)[::-1].reshape(n, h, w, c).copy()
    groups = T.drawings_of(f)
    at, length, members = groups[0]
    if length > 2:
        groups = [(at, 2, [m for m in members if m < 2]), (2, length - 2, [m for m in members if m >= 2]), *groups[1:]]
    rgbs = [f[m].astype(np.float64).mean(0) for _, _, m in groups]
    centres = T.take_palette(rgbs)
    found = [T.inks(rgb, centres) for rgb in rgbs]
    tmp = Path(tempfile.mkdtemp())

    def still_of(drawing: str, name: str) -> Path:
        path = tmp / f"light-{name}.png"
        svg = (MASCOT / "loops" / f"{drawing}.svg").read_text()
        path.write_bytes(bytes(resvg_py.svg_to_bytes(svg_string=svg, width=512, height=512)))
        return path

    end = still_of(end_drawing, "end")
    start = still_of(open_drawing, "open") if open_drawing else end
    place = T.placement(found[0][0], end)
    shape = rgbs[0].shape[:2]
    papers = T.see_through([e for _, e in found], [lab for lab, _ in found], T.paper_of(end, place, shape), T.paper_of(start, place, shape))
    return [T.finish(lab, rgb, p) for (lab, _), rgb, p in zip(found, rgbs, papers)]


def labels_ledge(T, take):
    T.decide = no_evidence(T)
    f = frames(T, take).copy()
    blue = f[..., 2].astype(int) - f[..., 0].astype(int) > 25
    f[blue] = 255
    drawings = T.drawings_of(f)
    rgbs = [f[m].astype(np.float64).mean(0) for _, _, m in drawings]
    centres = T.take_palette(rgbs)
    found = [T.inks(rgb, centres) for rgb in rgbs]
    h, w = rgbs[0].shape[:2]
    none = np.zeros((h, w), bool)
    papers = T.see_through([e for _, e in found], [lab for lab, _ in found], none, none)
    return [T.finish(lab, rgb, p) for (lab, _), rgb, p in zip(found, rgbs, papers)]


def labels_still(T, png, own_inks):
    from PIL import Image

    T.use_inks(own_inks)
    side = round(T.ARTBOARD * 1024 / 640)
    picture = np.asarray(Image.open(png).convert("RGBA").resize((side, side), Image.Resampling.LANCZOS)).astype(np.float64)
    alpha = picture[..., 3:4] / 255
    rgb = picture[..., :3] * alpha + np.array(T.PAPER) * (1 - alpha)
    centres = np.array([T.PAPER, *T.INKS.values()], np.float64)
    label, enclosed = T.inks(rgb, centres)
    paper = picture[..., 3] < 128
    papers = T.see_through([enclosed], [label], paper, paper)
    return [T.finish(label, rgb, papers[0])]


def run(job):
    name, kind, args, old = job
    out = {}
    for tag, path in (("old", old), ("new", NEW)):
        T = load(path, f"trace_{tag}")
        fn = {"loop": labels_loop, "enter": labels_enter, "ledge": labels_ledge, "still": labels_still}[kind]
        out[tag] = (fn(T, *args), list(T.INKS))
    old_labels, inks = out["old"]
    new_labels, _ = out["new"]
    names = ["paper", *inks]
    diff = sum(int((a != b).sum()) for a, b in zip(old_labels, new_labels))

    def counts(ls):
        return {names[k]: int(sum((lab == k).sum() for lab in ls)) for k in range(1, len(names))}

    return {"name": name, "kind": kind, "drawings": len(old_labels), "changedPx": diff, "old": counts(old_labels), "new": counts(new_labels)}


def rest_of(rests: dict, name: str) -> dict:
    return rests.get(name, rests.get(name.replace("-", "_"), {}))


def jobs(old: Path):
    takes = json.loads((MASCOT / "loops" / "takes.json").read_text())
    rests = json.loads((MASCOT / "loops" / "rests.json").read_text())
    for variants in takes.values():
        for v in variants:
            yield v["loop"], "loop", (v["take"], v["still"]), old
    clips = json.loads((MASCOT / "clips" / "takes.json").read_text())
    for clip, take in clips.items():
        probe = json.loads((MASCOT / "clips" / clip / "timing.json").read_text())["probe"]
        end = probe["last"]["against"]
        opening = probe["first"]["against"] if "first" in probe else None
        own = sorted(rest_of(rests, clip.removesuffix("-enter")).get("inks", []))
        yield clip, "enter", (take, end, opening, own), old
    for ledge in ("climb-peer", "peer-over"):
        take = json.loads((MASCOT / "clips" / ledge / "timing.json").read_text())["take"]
        yield ledge, "ledge", (take,), old
    for png in sorted((MASCOT / "stills").glob("*.png")):
        status = png.stem.split("-", 1)[1]
        own = rest_of(rests, status).get("inks", []) if png.stem.startswith("light-") else []
        yield png.name, "still", (png, own), old


if __name__ == "__main__":
    only = set(option("--only", "").split(",")) - {""}
    old = old_tracer(option("--old", "origin/main"))
    todo = [j for j in jobs(old) if not only or j[0] in only]
    with Pool(12, maxtasksperchild=1) as pool:
        results = pool.map(run, todo, chunksize=1)
    same = 0
    for r in results:
        ok = r["changedPx"] == 0 and r["old"] == r["new"]
        same += ok
        print(f"{'SAME' if ok else 'DIFF'} {r['kind']:5s} {r['name']}: {r['drawings']} drawings, changed px {r['changedPx']}, before {r['old']}, after {r['new']}")
    print(f"identical: {same}/{len(results)}")
    OUT.mkdir(exist_ok=True)
    (OUT / "regress-last.json").write_text(json.dumps(results, indent=1))
    sys.exit(0 if same == len(results) else 1)
