#!/usr/bin/env python3
"""Contrast + colour-distance verifier for the CawCo design tokens.

palette.mjs solves and reports only 8 pairs per scheme. This measures the pairs
it never covers (DW-3.3), the banned-hex distances (DW-3.7) and the status/accent
separations (DW-3.12) — from the token file itself, not from assertions.

usage: python3 colorcheck.py <tokens.css>
"""
import re, sys, math

# ---------- sRGB / WCAG ----------
def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def rel_lum(h):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return .2126*_lin(r) + .7152*_lin(g) + .0722*_lin(b)

def contrast(a, b):
    l1, l2 = sorted([rel_lum(a), rel_lum(b)], reverse=True)
    return (l1 + .05) / (l2 + .05)

# ---------- CIELAB / CIEDE2000 ----------
def to_lab(h):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16)/255 for i in (0, 2, 4))
    r, g, b = (_lin(c*255) for c in (r, g, b))
    X = (.4124*r + .3576*g + .1805*b) / .95047
    Y = (.2126*r + .7152*g + .0722*b) / 1.0
    Z = (.0193*r + .1192*g + .9505*b) / 1.08883
    f = lambda t: t ** (1/3) if t > 216/24389 else (841/108)*t + 4/29
    fx, fy, fz = f(X), f(Y), f(Z)
    return 116*fy - 16, 500*(fx - fy), 200*(fy - fz)

def de2000(c1, c2):
    L1, a1, b1 = to_lab(c1); L2, a2, b2 = to_lab(c2)
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = .5 * (1 - math.sqrt(Cb**7 / (Cb**7 + 25**7))) if Cb else .5
    a1p, a2p = (1+G)*a1, (1+G)*a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0
    dLp, dCp = L2 - L1, C2p - C1p
    if C1p*C2p == 0: dhp = 0
    elif abs(h2p - h1p) <= 180: dhp = h2p - h1p
    elif h2p - h1p > 180: dhp = h2p - h1p - 360
    else: dhp = h2p - h1p + 360
    dHp = 2*math.sqrt(C1p*C2p)*math.sin(math.radians(dhp)/2)
    Lbp, Cbp = (L1+L2)/2, (C1p+C2p)/2
    if C1p*C2p == 0: hbp = h1p + h2p
    elif abs(h1p-h2p) <= 180: hbp = (h1p+h2p)/2
    elif h1p+h2p < 360: hbp = (h1p+h2p+360)/2
    else: hbp = (h1p+h2p-360)/2
    T = (1 - .17*math.cos(math.radians(hbp-30)) + .24*math.cos(math.radians(2*hbp))
         + .32*math.cos(math.radians(3*hbp+6)) - .20*math.cos(math.radians(4*hbp-63)))
    dTh = 30*math.exp(-(((hbp-275)/25)**2))
    Rc = 2*math.sqrt(Cbp**7/(Cbp**7+25**7)) if Cbp else 0
    Sl = 1 + (.015*(Lbp-50)**2)/math.sqrt(20+(Lbp-50)**2)
    Sc, Sh = 1 + .045*Cbp, 1 + .015*Cbp*T
    Rt = -math.sin(math.radians(2*dTh))*Rc
    return math.sqrt((dLp/Sl)**2 + (dCp/Sc)**2 + (dHp/Sh)**2 + Rt*(dCp/Sc)*(dHp/Sh))

# ---------- token file ----------
def load(path):
    css = open(path).read()
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = {}
    for pat, name in ((r'(?:^|\n)(?::root|html)\s*\{(.*?)\n\}', 'light'),
                      (r'\n(?:\[data-theme="dark"\][^{]*|[^\n{]*\.dark[^{]*)\{(.*?)\n\}', 'dark')):
        d = {}
        for m in re.finditer(pat, css, re.S):
            for k, v in re.findall(r'--([\w-]+):\s*([^;]+);', m.group(1)):
                d[k] = v.strip()
        out[name] = d
    base = dict(out['light'])
    out['dark'] = {**base, **out['dark']}
    for scheme in out:
        d = out[scheme]
        for _ in range(6):
            for k, v in list(d.items()):
                m = re.fullmatch(r'var\(--([\w-]+)\)', v)
                if m and m.group(1) in d: d[k] = d[m.group(1)]
    return out

BANNED = {'indigo-500': '#6366F1', 'violet-500': '#8B5CF6', 'purple-500': '#A855F7'}
AA_PAIRS = [(f'{f}-11', s) for f in ('error', 'warning', 'success', 'info')
            for s in ('surface', 'surface-hover')] + \
           [('text-secondary', 'surface-hover'), ('text-secondary', 'surface-active')]

def main():
    T = load(sys.argv[1])
    fails = 0
    for scheme in ('light', 'dark'):
        d = T[scheme]
        print(f"\n=== {scheme.upper()} — DW-3.3 pairs palette.mjs does not verify (target 4.5:1) ===")
        for fg, bg in AA_PAIRS:
            if fg not in d or bg not in d:
                print(f"  MISSING {fg} or {bg}"); fails += 1; continue
            r = contrast(d[fg], d[bg])
            ok = r >= 4.5; fails += not ok
            print(f"  {fg:<16} on {bg:<16} {d[fg]} on {d[bg]}  {r:5.2f}:1  {'PASS' if ok else 'FAIL'}")
        r = contrast(d['accent-solid'], d['background'])
        ok = r >= 3.0; fails += not ok
        print(f"  {'accent-solid':<16} on {'background':<16} {d['accent-solid']} on {d['background']}  {r:5.2f}:1  {'PASS' if ok else 'FAIL'} (>=3 non-text)")

        print(f"--- {scheme}: status pill text-on-tint (target 4.5:1) ---")
        for f in ('error', 'warning', 'success', 'info'):
            r = contrast(d[f'{f}-11'], d[f'{f}-3'])
            ok = r >= 4.5; fails += not ok
            print(f"  {f+'-11':<16} on {f+'-3':<16} {d[f'{f}-11']} on {d[f'{f}-3']}  {r:5.2f}:1  {'PASS' if ok else 'FAIL'}")

        print(f"--- {scheme}: DW-3.7 distance from the banned purple triplet (CIEDE2000) ---")
        for k in ('accent-9', 'accent-10', 'accent-11', 'accent-solid'):
            row = "  " + f"{k:<16}{d[k]}"
            worst = 999
            for bn, bh in BANNED.items():
                e = de2000(d[k], bh); worst = min(worst, e)
                row += f"   {bn} dE {e:5.1f}"
            ok = worst >= 10; fails += not ok
            print(row + f"   {'PASS' if ok else 'FAIL'}")

        print(f"--- {scheme}: DW-3.12 non-status accent vs the four functional hues (CIEDE2000) ---")
        ns = d['brand-solid']          # the non-status accent of this DNA
        for f in ('error', 'warning', 'success', 'info'):
            e = de2000(ns, d[f'{f}-9'])
            ok = e >= 10; fails += not ok
            print(f"  brand-solid {ns} vs {f+'-9':<10}{d[f'{f}-9']}  dE {e:5.1f}  {'PASS' if ok else 'FAIL'}")
        # Beyond the DW list. The four status tints must be separable FROM EACH
        # OTHER, not just from the accent: two pills a triage pass has to tell
        # apart at a glance are the actual risk on this surface. Threshold 12 is
        # ~5x the ~2.3 CIEDE2000 just-noticeable difference, which is the margin
        # a 22px pill at 11.5px type needs.
        # IDENTITY vs STATUS. Per-item identity hue is legal (the reference uses
        # it; the "rejected by user instruction" note in the plan was fabricated).
        # What must hold is that status stays unambiguous: identity marks are
        # saturated solids carrying a white glyph, status chips are pale tints
        # carrying dark ink, so they differ in FORM as well as hue — and the hue
        # separation is measured rather than asserted.
        marks = [k for k in d if k.startswith('mark-') and k[5:].isdigit()]
        if marks:
            print(f"--- {scheme}: identity marks vs status chip fills (CIEDE2000) ---")
            worst = 999
            for mk in sorted(marks):
                for f in ('status-live', 'status-attn', 'status-done', 'status-fail'):
                    e = de2000(d[mk], d[f + '-bg'])
                    worst = min(worst, e)
            ok = worst >= 25; fails += not ok
            print(f"  worst identity-vs-status separation: dE {worst:.1f}  "
                  f"{'PASS' if ok else 'FAIL'} (>=25; they also differ in form)")
            hues = {d[mk] for mk in marks}
            ok2 = len(hues) >= 4; fails += not ok2
            print(f"  distinct identity hues: {len(hues)}  {'PASS' if ok2 else 'FAIL'} (>=4)")

        print(f"--- {scheme}: status chip fills pairwise separable (CIEDE2000 >= 12) ---")
        # idle is excluded: it ships no fill at all (see build-tokens.mjs)
        fs = ('status-live', 'status-attn', 'status-done', 'status-fail')
        for i in range(len(fs)):
            for j in range(i+1, len(fs)):
                e = de2000(d[f'{fs[i]}-bg'], d[f'{fs[j]}-bg'])
                ok = e >= 12; fails += not ok
                print(f"  {fs[i]+'-bg':<16}vs {fs[j]+'-bg':<16}dE {e:5.1f}  {'PASS' if ok else 'FAIL'}")
        print(f"--- {scheme}: status chip text-on-fill (target 4.5:1) ---")
        for f in fs + ('status-idle',):
            if f == 'status-idle':
                r = contrast(d['status-idle-ink'], d['surface-raised'])
                ok = r >= 4.5; fails += not ok
                print(f"  {'status-idle-ink':<16}on {'surface-raised':<16}{d['status-idle-ink']} on {d['surface-raised']}  {r:5.2f}:1  {'PASS' if ok else 'FAIL'}  (no fill)")
                continue
            r = contrast(d[f'{f}-ink'], d[f'{f}-bg'])
            ok = r >= 4.5; fails += not ok
            print(f"  {f+'-ink':<16}on {f+'-bg':<16}{d[f'{f}-ink']} on {d[f'{f}-bg']}  {r:5.2f}:1  {'PASS' if ok else 'FAIL'}")
    print("\n" + ("ALL CHECKS PASS" if fails == 0 else f"{fails} CHECKS FAILED"))
    sys.exit(1 if fails else 0)

main()
