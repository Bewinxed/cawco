#!/usr/bin/env python3
"""
Comparative fidelity gate.

The gap this closes: ui-observer and uisentinel measure ONE page in isolation.
They report internal facts (overflow, clipping, contrast, tap targets) and are
excellent at that — but they have never seen the reference, so they can never
say "this is 9px off the design". A self-consistent wrong value looks fine to
them. This measures the SAME NAMED QUANTITIES on both images and diffs them.

Landmarks are auto-detected, not hardcoded, so it survives layout drift.

usage:  python3 fidelity.py <reference.png> <build.png> [--ink-ref <mock-2x.png>] [--json]
        images may be 1x or 2x; 2x is downsampled to CSS px automatically.
        --ink-ref: the design's mock rendered by the build's own browser at 2x
        (see SAME-RENDERER INK below); defaults to mocks/v2-fleet.png.
"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image

TOL = {                      # px tolerance before a delta is flagged
    "default": 1,
    "sidebar_w": 2, "content_pad_l": 2, "content_pad_r": 3,
    "stat_run_w": 2, "stat_run_h": 2, "stat_run_gap": 1,
    "stat_run_x": 2, "well_inset": 1, "well_inset_top": 1,
    "card_left": 2, "card_top": 6, "toolbar_gap_above_band": 2,
    "search_w": 4, "search_h": 1, "search_x": 2, "toolbar_pad_l": 2,
    "band_h": 1, "row_pitch": 1, "cell_pad_l": 2,
    "band_w": 3, "band_x0": 2, "band_x1": 2, "card_pad_l": 1, "card_pad_r": 1,
}
INK_TOL = 12                 # luminance steps

# ---------------------------------------------------------------------------
# SAME-RENDERER INK — the stat figure's ink is judged against the design's
# own mock (mocks/v2-fleet.html, drawn by mocks/render.mjs), not the comp.
#
# The comp's rasterizer draws glyphs lighter than any browser (the plan:
# "Every one of the 20 candidates renders >=45% heavier in ink density than
# the reference PNG ... it is the comp's rasterizer"). Measured on the stroke
# core, the mock and the live build both sit ~14L under the comp while their
# ink token is the plan's "stat value #404040" — a renderer offset, not a
# drift, and no font weight closes it (500 -> 55, 400 -> 49, 350 -> 46 against
# the comp's 68). So the reference for these quantities is the mock rendered
# by the SAME browser at the SAME 2x scale as the build capture; pass it with
# --ink-ref, rendered by render.mjs with CHROMIUM_BIN set to the build's
# browser. Without it, the committed mocks/v2-fleet.png is the mock render.
# ---------------------------------------------------------------------------
INK_FROM_RENDER = ("stat_num_ink",)
DEFAULT_INK_REF = str(Path(__file__).with_name("v2-fleet.png"))

# ---------------------------------------------------------------------------
# AA OVERRIDE — the reason this exists is a defect this gate once certified.
#
# This script answers "does the build match the reference?". That is NOT the
# same question as "is the build correct", and the two diverge exactly where
# the reference is itself wrong. Measured case: the comp's header-label ink
# #838383 on band #F1F1F1 is 3.36:1 — below the 4.5:1 floor the design plan
# requires. A build that darkened it to pass AA would read as a ~22L miss
# against a 12L tolerance and FAIL, while a build that stayed light at #8B8B8B
# (3.02:1 — worse than the reference) passed with "+8L ok".
#
# So: inks listed here are known reference defects. The build is NOT required
# to match them; it is required to pass AA against the surface named. Matching
# them is reported as an accepted deviation, never as a pass.
# ---------------------------------------------------------------------------
AA_OVERRIDE = {
    # ink quantity      -> (surface it sits on, minimum ratio)
    "band_label_ink":   ("band_ink", 4.5),
}
AA_MIN_DEFAULT = 4.5


def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def _rel_lum(hexstr):
    h = hexstr.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(fg, bg):
    """WCAG 2.x contrast ratio between two hex colours."""
    l1, l2 = sorted([_rel_lum(fg), _rel_lum(bg)], reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


# ---------- loading ----------
def load(path):
    im = Image.open(path).convert("RGB")
    if im.width > 2000:                       # 2x export -> CSS px
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    a = np.asarray(im).astype(int)
    return a, a.mean(axis=2)


# ---------- primitives ----------
def hexat(a, x, y):
    r, g, b = a[y, x]
    return f"#{r:02X}{g:02X}{b:02X}"


def runs_of(lum, y, x0, x1, target, tol=2.5):
    """contiguous x-runs on row y whose luminance ~= target"""
    out, s = [], None
    for x in range(x0, x1):
        hit = abs(lum[y, x] - target) <= tol
        if hit and s is None:
            s = x
        elif not hit and s is not None:
            out.append((s, x - 1)); s = None
    if s is not None:
        out.append((s, x1 - 1))
    return out


def first_dark(lum, y, x0, x1, thr=225):
    for x in range(x0, x1):
        if lum[y, x] < thr:
            return x
    return None


def darkest(lum, a, y0, y1, x0, x1):
    """Ink core of a text block.

    Uses the 1st percentile of LUMINANCE, not the darkest single pixel. Chrome
    on Linux renders subpixel-antialiased text, so the darkest pixel is a
    colour-fringed outlier (e.g. #000918, R!=G!=B) that reads ~20L darker than
    the actual ink. The reference is greyscale-AA. Comparing minima therefore
    measures the renderer, not the design."""
    win = lum[y0:y1, x0:x1]
    if win.size == 0:
        return None, None
    p = float(np.percentile(win, 1.0))
    v = int(round(p))
    return f"#{v:02X}{v:02X}{v:02X}", p


def stroke_ink(lum, y0, y1, x0, x1, q=10):
    """The ink a glyph run is drawn in: the darkest tenth of its STROKE pixels.

    `darkest()` takes the 1st percentile of the whole window, which moves with
    how much of the window the glyphs cover ("6" against "75") and with the
    LANCZOS undershoot a sharp horizontal stroke leaves when a 2x capture is
    halved (the tops of 7 and 5 read darker than the ink itself). Here the
    stroke pixels are those darker than halfway between the window's
    background (its median) and its darkest pixel, and the ink is their 10th
    percentile: independent of glyph count, clear of the lone undershoot
    pixels. Measured on the live board: "75" 53, "6" 55."""
    win = lum[y0:y1, x0:x1]
    if win.size == 0:
        return None
    bg, lo = float(np.median(win)), float(win.min())
    strokes = win[win < (bg + lo) / 2]
    if strokes.size == 0:
        return None
    v = int(round(float(np.percentile(strokes, q))))
    return f"#{v:02X}{v:02X}{v:02X}"


# ---------- landmark detection ----------
def find_sidebar(lum, H, W):
    """strongest sustained vertical edge in the left third"""
    ys = range(int(H * 0.35), int(H * 0.65))
    best, bx = 0, None
    for x in range(120, min(420, W - 1)):
        score = sum(1 for y in ys if abs(lum[y, x] - lum[y, x - 1]) > 3)
        if score > best:
            best, bx = score, x
    return bx if best > len(list(ys)) * 0.55 else None


def find_band(lum, H, W, x_lo):
    """Table header band. Detected by DOMINANT COLOUR FRACTION, not uniformity —
    the band contains its own header labels, so a std-based test splits it."""
    # NOTE: band #F1F1F1 (241) sits only 3L from page bg #F4F4F4 (244); a loose
    # window plus LANCZOS downsampling makes the detector swallow the page.
    x0, x1 = x_lo + 40, max(x_lo + 120, W - 40)
    rows = []
    for y in range(int(H * 0.15), int(H * 0.90)):
        v = lum[y, x0:x1]
        if v.size and float(((v >= 239.5) & (v <= 242.5)).mean()) > 0.55:
            rows.append(y)
    runs, s_, pv = [], None, None
    for y in rows:
        if s_ is None: s_ = y
        elif y != pv + 1: runs.append((s_, pv)); s_ = y
        pv = y
    if s_ is not None: runs.append((s_, pv))
    runs = [r for r in runs if r[1] - r[0] >= 10]
    if not runs:
        return None
    top, bot = max(runs, key=lambda r: r[1] - r[0])
    return {"top": top, "bottom": bot, "h": bot - top + 1,
            "lum": float(np.median(lum[top + 2, x0:x1]))}


def find_card_x(lum, y, x_lo, W):
    """card horizontal extent on a row known to be inside the card"""
    row = lum[y]
    left = None
    for x in range(x_lo, W - 2):
        if row[x] > 248 and row[x + 1] > 248:
            left = x; break
    right = None
    for x in range(W - 2, x_lo, -1):
        if row[x] > 248 and row[x - 1] > 248:
            right = x; break
    return left, right


def find_card_top(lum, x, band_top):
    """walk up from the band until the surface stops being card-white"""
    for y in range(band_top - 1, max(0, band_top - 160), -1):
        if lum[y, x] < 248:
            return y + 1
    return None


def find_row_pitch(lum, x, y0, H):
    """divider pitch below the band"""
    col = lum[:, x]
    edges = [y for y in range(y0 + 4, min(H - 2, y0 + 520))
             if abs(col[y] - col[y - 1]) > 4]
    merged = []
    for e in edges:
        if not merged or e - merged[-1] > 6:
            merged.append(e)
    if len(merged) < 4:
        return None, merged
    d = [merged[i + 1] - merged[i] for i in range(len(merged) - 1)]
    d = [v for v in d if 20 < v < 90]
    if not d:
        return None, merged
    return int(round(float(np.median(d)))), merged


def find_stats(lum, H, W, x_lo, card_top):
    """Locate the stat row by its near-white painted runs.

    NAMING WARNING — these quantities are proxies, not box geometry.
    This finds runs of card-white (~253). The stat card is #FCFCFC with a
    recessed #F4F4F4 well inside it, so the white run is the *frame*, not the
    card: it reports ~264 where the card box is 280, and a ~30 "gap" where the
    CSS gap is 14 (the run stops at the well, so each side's frame is counted
    into the gap). Both readings are stable and identical across reference and
    build, so the COMPARISON is valid — but the numbers must not be read as
    card width/gap, and must not be reconciled against the design plan's
    measured-reference table, which records true box geometry from the DOM.
    Emitted below under `stat_run_*` names for exactly that reason.
    """
    """the row of equal-width cards above the table card"""
    best = None
    for y in range(int(H * 0.10), card_top - 6):
        segs = [r for r in runs_of(lum, y, x_lo + 4, W - 4, 253, 3.0) if (r[1] - r[0]) > 90]
        if len(segs) >= 3:
            widths = [s[1] - s[0] + 1 for s in segs]
            if max(widths) - min(widths) <= 4:
                if best is None or len(segs) > len(best[1]):
                    best = (y, segs)
    if not best:
        return None
    y, segs = best
    gaps = [segs[i + 1][0] - segs[i][1] - 1 for i in range(len(segs) - 1)]
    col = lum[:, (segs[0][0] + segs[0][1]) // 2]
    top = next((yy for yy in range(y, max(0, y - 90), -1) if col[yy] < 250), None)
    bot = next((yy for yy in range(y, min(len(col) - 1, y + 130)) if col[yy] < 250), None)
    return {
        "x": segs[0][0], "w": segs[0][1] - segs[0][0] + 1,
        "gap": int(round(float(np.median(gaps)))) if gaps else None,
        "top": (top + 1) if top else None,
        "h": (bot - top - 1) if (top and bot) else None,
        "count": len(segs), "probe_y": y,
    }


def find_well(lum, st, white=250):
    """The stat card's recessed well, as its inset from the card's edge.

    The stat row's white run is the card's FRAME (see find_stats), so the
    well is found from it rather than on its row: walk down the first card's
    middle column from the card's top until the surface stops being
    card-white (the well's top border), then, one row inside the well, walk
    left through the well to the frame and on through the frame to the card's
    outer edge. Returns (left inset, top inset), both in CSS px."""
    xm = st["x"] + st["w"] // 2
    y0 = st["top"]
    wt = next((y for y in range(y0, y0 + 30) if lum[y, xm] < white), None)
    if wt is None:
        return None
    yw = wt + 3
    x = xm
    while x > 0 and lum[yw, x] < white:        # through the well to its left border
        x -= 1
    frame_in = x                               # last frame-white pixel beside the well
    while x > 0 and lum[yw, x] >= white:       # through the frame to the card's edge
        x -= 1
    card_left = x + 1
    return frame_in + 1 - card_left, wt - y0


def find_search(lum, cl, band_top, W, border=240):
    """The toolbar's first control (the search field), as (x, w, h).

    Found from its own borders, not from card_top: card_top is where the
    walk up from the band first meets a painted control, i.e. the control's
    BOTTOM edge, so any row derived from it sits under the control and finds
    nothing. Here the bottom border is the first dark row above the band in
    a column a little inside the card's left pad, the top border the next
    dark row above that; the left and right borders are the first columns
    that stay dark down most of the control's height — a vertical line, so
    the placeholder's glyphs, which only cover part of it, never read as one."""
    def vline(x, y0, y1):
        seg = lum[y0:y1, x]
        return seg.size > 0 and float((seg < border).mean()) >= 0.8

    probe = cl + 11 + 31                       # between the search icon and its text
    yb = next((y for y in range(band_top - 1, band_top - 40, -1) if lum[y, probe] < border), None)
    if yb is None:
        return None
    # A control with a drop shadow reads as border + shadow: two dark rows. The
    # box's bottom edge is the top of that run, not the shadow under it.
    while lum[yb - 1, probe] < border:
        yb -= 1
    yt = next((y for y in range(yb - 1, yb - 60, -1) if lum[y, probe] < border), None)
    if yt is None:
        return None
    # The middle half of the box: clear of its rounded corners at any radius
    # up to a quarter of its height (a 10px radius on a 32px control).
    quarter = (yb - yt) // 4
    y0, y1 = yt + quarter, yb - quarter
    left = next((x for x in range(cl + 2, probe) if vline(x, y0, y1)), None)
    if left is None:
        return None
    right = next((x for x in range(left + 60, min(left + 600, W - 1)) if vline(x, y0, y1)), None)
    if right is None:
        return None
    return left, right - left + 1, yb - yt + 1


# ---------- the measurement ----------
def measure(path):
    a, lum = load(path)
    H, W, _ = a.shape
    m = {"_size": f"{W}x{H}"}

    sb = find_sidebar(lum, H, W)
    m["sidebar_w"] = sb
    x_lo = sb or 0

    band = find_band(lum, H, W, x_lo)
    if not band:
        return m, a, lum
    m["band_h"] = band["h"]
    # Band horizontal extent. Added after a card-padding error passed this gate:
    # the reference's table sits INSIDE 11px of card padding, so the band stops
    # short of the card edge. A build that bleeds the band to the card edge lands
    # cell content in the right place and was therefore invisible here.
    _by = band["top"] + band["h"] // 2
    # Take the LONGEST CONTIGUOUS run, not the first match: the card's own
    # antialiased rounded edge lands on the band's luminance for ~1px and
    # otherwise drags band_x0 out to the card boundary.
    _hits = [x for x in range(x_lo + 4, W - 4) if 239.5 <= lum[_by, x] <= 242.5]
    _runs, _s, _pv = [], None, None
    for x in _hits:
        if _s is None: _s = x
        elif x != _pv + 1: _runs.append((_s, _pv)); _s = x
        _pv = x
    if _s is not None: _runs.append((_s, _pv))
    # The band is broken into segments by its own header labels, so the longest
    # run is only a gap between two words. Take the OUTERMOST extent of runs
    # >= 15px: wide enough to reject the 1px card-edge artifact, narrow enough
    # to still span across the labels (the leading segment before the first
    # header label is only ~14px, so the threshold has to sit below that).
    _runs = [r for r in _runs if r[1] - r[0] >= 8]
    if _runs:
        b0, b1 = _runs[0][0], _runs[-1][1]
        m["band_x0"], m["band_x1"], m["band_w"] = b0, b1, b1 - b0 + 1
    # sample the band BACKGROUND at its modal value, not at a label glyph
    _bv = lum[band["top"] + band["h"] // 2, x_lo + 40:W - 40]
    _bg = int(round(float(np.median(_bv))))
    m["band_ink"] = f"#{_bg:02X}{_bg:02X}{_bg:02X}"

    cl, cr = find_card_x(lum, band["top"] + band["h"] + 12, x_lo, W)
    m["card_left"], m["card_right"] = cl, cr
    if cl:
        m["content_pad_l"] = cl - x_lo
        if m.get("band_x0"):
            m["card_pad_l"] = m["band_x0"] - cl       # card padding, not cell padding
    if cr and m.get("band_x1"):
        m["card_pad_r"] = cr - m["band_x1"]
    if cr:
        m["content_pad_r"] = W - cr - 1

    ct = find_card_top(lum, (cl + cr) // 2 if cl and cr else x_lo + 200, band["top"])
    m["card_top"] = ct
    if ct:
        # Proxy, not the toolbar's box height. find_card_top walks up from the
        # band until the surface stops being card-white, so it halts at the
        # first painted control and reports ~11 where the toolbar zone is 55.
        # Stable and identical on both images, so the comparison holds — but it
        # is not the plan's `toolbar zone 55` and must not be reconciled to it.
        m["toolbar_gap_above_band"] = band["top"] - ct

    # search field: first bordered control inside the toolbar
    if ct and cl:
        s = find_search(lum, cl, band["top"], W)
        if s:
            m["search_x"], m["search_w"], m["search_h"] = s
            m["toolbar_pad_l"] = s[0] - cl

    # rows
    ry = band["bottom"] + 1
    pitch, edges = find_row_pitch(lum, (cl + 12) if cl else x_lo + 12, ry, H)
    m["row_pitch"] = pitch
    if cl and pitch:
        mid = ry + pitch // 2
        d = first_dark(lum, mid, cl + 2, cl + 140)
        m["cell_pad_l"] = (d - cl) if d else None
        m["row_name_ink"], _ = darkest(lum, a, mid - 8, mid + 9, cl + 30, cl + 220)
        m["row_bg"] = hexat(a, cl + 6, mid)

    # header label ink
    if cl:
        m["band_label_ink"], _ = darkest(lum, a, band["top"] + 4, band["bottom"] - 3, cl + 18, cl + 200)

    # stat row
    if ct:
        st = find_stats(lum, H, W, x_lo, ct)
        if st:
            # `stat_run_*`, not `stat_*`: these are painted-white-run proxies,
            # not the card's box geometry. See find_stats()'s docstring.
            m["stat_run_x"], m["stat_run_w"] = st["x"], st["w"]
            m["stat_run_gap"], m["stat_run_h"] = st["gap"], st["h"]
            m["stat_count"] = st["count"]
            if st["top"]:
                w = find_well(lum, st)
                if w:
                    m["well_inset"], m["well_inset_top"] = w
                # The figure sits in the tile's lower half; st["h"] is the frame
                # strip's height, not the card's, so the rows come from the top.
                m["stat_num_ink"] = stroke_ink(
                    lum, st["top"] + 45, st["top"] + 80,
                    st["x"] + 14, st["x"] + 140)

    # surfaces
    m["page_bg"] = hexat(a, W - 12, band["top"] - 60) if band["top"] > 70 else None
    if sb:
        m["sidebar_bg"] = hexat(a, max(4, sb - 30), int(H * 0.55))
    return m, a, lum


# ---------- report ----------
def main():
    argv = sys.argv[1:]
    ink_ref = DEFAULT_INK_REF
    if "--ink-ref" in argv:
        i = argv.index("--ink-ref")
        ink_ref = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    args = [x for x in argv if not x.startswith("--")]
    as_json = "--json" in argv
    ref, bld = args[0], args[1]
    R, _, _ = measure(ref)
    B, _, _ = measure(bld)
    # Ink the comp's own rasterizer draws differently (see INK_FROM_RENDER) is
    # judged against the design's mock drawn by the build's renderer.
    I, _, _ = measure(ink_ref)
    for k in INK_FROM_RENDER:
        R[k] = I.get(k)

    if as_json:
        print(json.dumps({"reference": R, "build": B}, indent=1)); return

    print(f"reference : {ref}   {R.get('_size')}")
    print(f"ink ref   : {ink_ref}   {I.get('_size')}  ({', '.join(INK_FROM_RENDER)})")
    print(f"build     : {bld}   {B.get('_size')}\n")
    print(f"{'quantity':<18}{'reference':>12}{'build':>12}{'delta':>10}   ")
    print("-" * 60)
    fails = 0
    aa_notes = []
    for k in sorted(set(R) | set(B)):
        if k.startswith("_"):
            continue
        r, b = R.get(k), B.get(k)
        if r is None or b is None:
            print(f"{k:<18}{str(r):>12}{str(b):>12}{'—':>10}   (not detected)")
            continue
        if isinstance(r, str):                      # colour compare
            rv = int(r[1:3], 16) * .299 + int(r[3:5], 16) * .587 + int(r[5:7], 16) * .114
            bv = int(b[1:3], 16) * .299 + int(b[3:5], 16) * .587 + int(b[5:7], 16) * .114
            d = bv - rv
            if k in AA_OVERRIDE:
                # The reference is a known defect here. Judge the BUILD on AA,
                # not on how closely it reproduces the defect.
                surf_key, minimum = AA_OVERRIDE[k]
                surf = B.get(surf_key) or R.get(surf_key)
                if surf:
                    ratio = contrast(b, surf)
                    ref_ratio = contrast(r, surf)
                    ok = ratio >= minimum
                    fails += (not ok)
                    note = (f"AA {ratio:.2f}:1 on {surf}"
                            f"  (ref {ref_ratio:.2f}:1 — below {minimum}, override)")
                    aa_notes.append((k, ratio, ref_ratio, surf, minimum, ok))
                    print(f"{k:<18}{r:>12}{b:>12}{d:>+9.0f}L   "
                          f"{'ok  ' if ok else '<-- FAILS AA'} {note}")
                    continue
            bad = abs(d) > INK_TOL
            fails += bad
            print(f"{k:<18}{r:>12}{b:>12}{d:>+9.0f}L   {'<-- OFF' if bad else 'ok'}")
        else:
            d = b - r
            bad = abs(d) > TOL.get(k, TOL["default"])
            fails += bad
            print(f"{k:<18}{r:>12}{b:>12}{d:>+10}   {'<-- OFF' if bad else 'ok'}")
    print("-" * 60)
    if aa_notes:
        print("AA overrides — reference is defective here; build judged on AA, not on match:")
        for k, ratio, ref_ratio, surf, minimum, ok in aa_notes:
            print(f"  {k:<18} build {ratio:.2f}:1 on {surf}   ref {ref_ratio:.2f}:1   "
                  f"min {minimum}   {'PASS' if ok else 'FAIL'}")
        print("-" * 60)
    print(f"{'PASS' if fails == 0 else f'{fails} QUANTITIES OUT OF TOLERANCE'}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
