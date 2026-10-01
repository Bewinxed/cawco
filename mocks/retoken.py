#!/usr/bin/env python3
"""Re-express the mocks against mocks/tokens.css (DW-3.13c).

The mocks were built by measuring the comps directly, so every value in them is
a literal. This rewrites them onto the token system WITHOUT touching geometry:
the local `:root` alias layer and the hand-written `.dark` block are deleted
outright, every `var(--local)` is renamed to its token, and the remaining raw
literals are mapped by value. Geometry, markup and class names are untouched, so
fidelity.py measures the same layout before and after and any delta is a colour
delta, which is exactly what needs to be proven.

usage: python3 mocks/retoken.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent

# ---- local alias -> token ---------------------------------------------------
RENAME = {
    # surfaces
    'bg': 'surface-field', 'sidebar': 'surface-raised', 'card': 'surface-raised',
    'well': 'surface-field', 'surface': 'surface-raised', 'band': 'surface-sunken',
    'elev': 'surface-raised', 'sel': 'surface-sunken', 'recess': 'surface-field',
    'popover': 'surface-overlay', 'chip-bg': 'surface-raised', 'orb-bg': 'surface-raised',
    'av-bg': 'surface-sunken',
    # borders
    'line': 'border-hairline', 'line-well': 'border-hairline', 'divider': 'border-divider',
    'ctl-line': 'border-control', 'foot-line': 'border-hairline',
    'grid-line': 'border-hairline', 'ruler': 'border-control',
    # inks
    'ink': 'ink-strong', 'chip-ink': 'ink-strong', 'ctl-ink': 'ink-row',
    'row-name': 'ink-row', 'stat-num': 'ink-stat', 'ink-2': 'ink-body',
    'nav-ink': 'ink-body', 'run-ink': 'ink-body', 'btn-ink': 'ink-body',
    'sel-ink': 'ink-body', 'crumb-ink': 'ink-body',
    'muted': 'ink-muted', 'sec-ink': 'ink-muted', 'placeholder': 'ink-muted',
    'icon-ink': 'ink-muted', 'when-ink': 'ink-muted', 'ghost-icon': 'ink-muted',
    'pg-ink': 'ink-muted', 'av-ink': 'ink-muted', 'recess-ink': 'ink-muted',
    'th-ink': 'ink-label',
    # brand / action
    'action': 'brand-solid', 'action-2': 'brand-hi', 'on-action': 'on-brand',
    'mark-glyph': 'on-brand', 'orb-ink': 'accent-solid',
    # status
    'ok-bg': 'status-done-bg', 'ok-fg': 'status-done-ink', 'ok-ink': 'data-ok',
    'err-bg': 'status-fail-bg', 'err-fg': 'status-fail-ink', 'bad-ink': 'data-bad',
    'att-bg': 'status-attn-bg', 'att-fg': 'status-attn-ink',
    'warn-bg': 'status-attn-bg', 'warn-fg': 'status-attn-ink',
    'warn-ink': 'data-warn',
    'lav-bg': 'status-attn-bg', 'lav-fg': 'status-attn-ink',
    'mint-bg': 'surface-sunken', 'mint-fg': 'ink-muted',
    'dot': 'status-attn-ink',
    # elevation
    'sel-shadow': 'shadow-inset-sel', 'shadow-card': 'shadow-hairline',
    'chip-shadow': 'shadow-tile', 'orb-shadow': 'shadow-lifted',
    'popover-shadow': 'shadow-overlay', 'composer-shadow': 'shadow-hairline',
    'action-shadow': 'shadow-action', 'send-shadow': 'shadow-action',
    'pgon-shadow': 'shadow-action', 'asst-scrim': 'scrim-soft',
    # shape / space
    'r-well': 'radius-well', 'r-ctl': 'radius-control', 'r-card': 'radius-card',
    'r-panel': 'radius-panel', 'r-mark': 'radius-tile', 'pad-x': 'space-7',
}
# gradients are single tokens now, so their two stops collapse
GRADIENT = [
    (r'linear-gradient\(var\(--action-g1\),\s*var\(--action-g2\)\)', 'var(--gradient-action)'),
    (r'linear-gradient\(var\(--pgon-g1\),\s*var\(--pgon-g2\)\)', 'var(--gradient-action)'),
    (r'linear-gradient\(#3C3C3C,\s*#262626\)', 'var(--gradient-action)'),
    (r'linear-gradient\(#3F3F3F,\s*#1C1C1C\)', 'var(--gradient-action)'),
]

# ---- raw literal -> token (values measured off the comps) -------------------
LITERAL = {
    '#F4F4F4': 'var(--surface-field)', '#FDFDFD': 'var(--surface-raised)',
    '#FCFCFC': 'var(--surface-raised)', '#FFFFFF': 'var(--surface-raised)',
    '#FFF': 'var(--surface-raised)', '#fff': 'var(--surface-raised)',
    '#F1F1F1': 'var(--surface-sunken)', '#F2F2F2': 'var(--surface-sunken)',
    '#F0F0F0': 'var(--surface-sunken)', '#EFEFEF': 'var(--surface-sunken)',
    '#EDEDED': 'var(--border-hairline)', '#EEEEEE': 'var(--border-hairline)',
    '#E9E9E9': 'var(--border-divider)', '#E7E7E7': 'var(--border-control)',
    '#E6E6E6': 'var(--border-control)', '#E5E5E5': 'var(--border-control)',
    '#E4E4E4': 'var(--surface-sunken)', '#E0E0E0': 'var(--border-control)',
    '#D8D8D8': 'var(--border-control)', '#CFCFCF': 'var(--border-control)',
    '#C8C8C8': 'var(--ink-muted)', '#B4B4B4': 'var(--ink-muted)',
    '#B0B0B0': 'var(--ink-muted)', '#A6A6A6': 'var(--ink-muted)',
    '#909090': 'var(--ink-muted)', '#8A8A8A': 'var(--ink-muted)',
    '#5B5B5B': 'var(--ink-body)', '#4A4A4A': 'var(--ink-body)',
    '#3F3F3F': 'var(--ink-body)', '#3A3A3A': 'var(--ink-body)',
    '#393939': 'var(--ink-row)', '#404040': 'var(--ink-stat)',
    '#3C3C3C': 'var(--brand-hi)', '#262626': 'var(--brand-lo)',
    '#212121': 'var(--brand-edge)', '#272727': 'var(--brand-solid)',
    '#2E2E2E': 'var(--brand-solid)', '#161616': 'var(--ink-strong)',
    '#4A5BC4': 'var(--accent-solid)',
    # the hand-written dark block's values, in case a stray survives deletion
    '#0F0F0F': 'var(--surface-field)', '#1A1A1A': 'var(--surface-raised)',
    '#1D1D1D': 'var(--surface-sunken)', '#141414': 'var(--surface-field)',
    '#171717': 'var(--surface-raised)', '#2C2C2C': 'var(--border-hairline)',
    '#222222': 'var(--surface-sunken)', '#313131': 'var(--border-control)',
    '#282828': 'var(--border-divider)', '#343434': 'var(--border-control)',
}
# masks only use the alpha channel, so the colour keyword carries no design meaning
MASK = [(r'(mask:(?:linear|radial)-gradient\([^)]*?)#000\b', r'\1black')]

SHADOW = [
    (r'0 12px 40px rgba\(20,20,20,\.16\)', 'var(--shadow-drawer)'),
    (r'0 18px 48px rgba\(20,20,20,\.16\),0 2px 6px rgba\(20,20,20,\.06\)', 'var(--shadow-overlay)'),
    (r'0 6px 18px rgba\(20,20,20,\.10\),0 1px 3px rgba\(20,20,20,\.06\)', 'var(--shadow-lifted)'),
    (r'0 1px 2\.5px rgba\(20,20,20,\.10\),0 0 0 \.5px rgba\(20,20,20,\.03\)', 'var(--shadow-tile)'),
    (r'0 1px 2px rgba\(20,20,20,\.0[45]\)', 'var(--shadow-hairline)'),
    (r'inset 0 1px 1px rgba\(20,20,20,\.045\)', 'var(--shadow-inset-sel)'),
    (r'inset 0 -1px 0 #212121,0 1px 2px rgba\(0,0,0,\.1[02]\)', 'var(--shadow-action)'),
    (r'inset 0 -1px 0 #191919,0 1px 2px rgba\(0,0,0,\.10\)', 'var(--shadow-action)'),
    (r'rgba\(20,20,20,\.32\)', 'var(--scrim)'),
    (r'rgba\(0,0,0,\.06\)', 'var(--scrim-soft)'),
    (r'linear-gradient\(rgba\(255,255,255,\.22\),rgba\(0,0,0,\.06\)\)', 'var(--mark-overlay)'),
]

# ---- type: the ladder, the leading, and the weight step-down ----------------
FONT_SIZE = {
    '10px': 'var(--text-xs)', '10.5px': 'var(--text-xs)', '11px': 'var(--text-sm)',
    '11.5px': 'var(--text-sm)', '12px': 'var(--text-sm)', '12.5px': 'var(--text-base)',
    '13px': 'var(--text-base)', '13.5px': 'var(--text-base)', '14px': 'var(--text-md)',
    '14.5px': 'var(--text-md)', '15px': 'var(--text-md)', '15.5px': 'var(--text-lg)',
    '16px': 'var(--text-lg)', '17px': 'var(--text-lg)', '18px': 'var(--text-xl)',
    '20px': 'var(--text-2xl)', '21px': 'var(--text-2xl)', '22px': 'var(--text-2xl)',
    '24px': 'var(--text-3xl)', '26px': 'var(--text-4xl)',
}
# "Step every weight down one notch" — the comps' rasterizer renders ~45% heavier
# than any candidate face at the same nominal weight, so 600/700 must not ship.
STATES_CSS = """
/* ---- control reset ------------------------------------------------------
   Promoting spans to real <button>/<input> brought the UA defaults with them:
   font-size fell to 13.3333px (off the ladder), line-height reset to `normal`
   on 40 elements, and the native search placeholder painted 4.40:1 in light and
   3.65:1 in dark. Semantics without a reset is a downgrade; this is the price of
   real controls and it is paid explicitly. */
/* ---- the mobile filter disclosure is inert above 900px ------------------
   Below 900px the <details> collapses the filter chips and Export behind a
   summary so they do not push the session list off a phone screen. Above it
   the disclosure must contribute nothing: with it live, the chips and Export
   stayed inside a closed <details> and the toolbar rendered as search plus a
   "Filters and export" summary, which is not the composition.

   Three declarations, all three load-bearing. `display:contents` on the
   <details> alone leaves the summary generating a list-item box, and it does
   NOT reveal the closed content — ::details-content still applies
   `content-visibility:hidden`, so the chips render stacked and unpainted.
   Scoped to min-width:901px because this block lands after the max-width:900px
   rules; unscoped it would defeat the closed state on mobile too. */
@media (min-width:901px){
  .filterbox{display:contents}
  .filterbox > summary{display:none}
  .filterbox::details-content{display:contents;content-visibility:visible}
}

button,input,select,textarea{font:inherit;line-height:var(--leading-ui);color:inherit;
  letter-spacing:inherit;background:none;border:0;margin:0}
/* promoting rows to <a> also brought the UA underline, which painted on
   .nav-i/.run-i in all three mocks and both schemes */
a{color:inherit;text-decoration:none}
button{cursor:pointer}
.search input{width:100%;min-width:0;padding:0}
::placeholder{color:var(--ink-muted);opacity:1}

/* ---- interaction states -------------------------------------------------
   These did not exist. `--surface-hover` and `--surface-active` were defined,
   measured for DW-3.3, and painted nothing — tokens with no surface. Focus is
   a keyboard-accessibility requirement, not polish, so :focus-visible is
   defined for every interactive affordance rather than for buttons only.

   HOVER IS GATED ON THE DEVICE HAVING HOVER, not un-done afterwards. The
   previous form declared hover unconditionally and then tried to cancel it in
   `@media (hover:none)`, which covered 4 of the 9 selectors — so on touch the
   filter selects, pagination, icon buttons, Export CSV, every status pill and
   both permission-gate buttons kept a hover state that sticks after a tap. A
   status chip that changes fill on tap and stays changed is a false state
   report. Cancelling is also the wrong shape: `background-color:transparent`
   would erase a status pill's own fill. Applying the rule only where it can be
   true needs no cancellation. */
@media (hover:hover) and (pointer:fine){
  .nav-i:hover,.run-i:hover,tbody tr:hover td,.act button:hover,
  .ghost:hover,.icobtn:hover,.sel:hover,.pg i:hover,.chip-s:hover{
    background-color:var(--surface-hover)}
  .nav-i:active,.run-i:active,.ghost:active,.icobtn:active,.sel:active,.pg i:active{
    background-color:var(--surface-active)}
  .cta:hover,.stop:hover,.choice button.grant:hover{filter:brightness(1.08)}
  .choice button.refuse:hover{background-color:var(--surface-active)}
}
/* A STANDING GRANT MUST READ AS CONSEQUENTIAL.
   "Always allow rm -rf in ~/cawco" painted 1.00:1 against its panel —
   treatment-identical to a benign quick-reply chip, while its scope is strictly
   wider than the command being approved. The one control here with unbounded
   blast radius had the least visual weight on the surface. */
.widen button{background:var(--status-attn-bg);border-color:var(--status-attn-ink);
  color:var(--status-attn-ink);font-weight:var(--weight-strong);gap:6px}
.widen button svg{width:11px;height:11px;flex:0 0 auto}

/* ---- pagination and row actions were unstyled text ----------------------
   `< 1 2 3 ... 6 >` as bare characters and three plain text links in a design
   that is otherwise finished. The reference has real controls with a filled
   active page. */
.pg{display:flex;align-items:center;gap:4px}
.pg button{min-width:28px;height:28px;padding:0 7px;border:1px solid transparent;
  border-radius:var(--radius-control);color:var(--ink-body);font-size:var(--text-sm);
  display:inline-flex;align-items:center;justify-content:center}
.pg button.b{border-color:var(--border-control);background:var(--surface-raised)}
.pg button.on{background:var(--brand-solid);background-image:var(--gradient-action);
  box-shadow:var(--shadow-action);color:var(--on-brand);font-weight:var(--weight-strong)}
.pg button svg{width:12px;height:12px}
/* the coarse-pointer minimum lives here, after the pagination rule: placed in
   the earlier @media block it lost on source order and every page button
   rendered 28x44 on touch */
@media (pointer:coarse){ .pg button{min-width:44px} }
/* Row-action icon buttons. A real affordance at rest — a subtle control edge on
   a raised fill — that gains a hover fill on fine pointers and a 44px target on
   coarse ones (the @media(pointer:coarse) sweep below covers `button`). Consistent
   28x28 sizing; the idle "—" is a muted dash, never a button. */
.act{gap:8px}
.act button{width:28px;height:28px;padding:0;border:1px solid var(--border-control);
  border-radius:var(--radius-control);background:var(--surface-raised);color:var(--ink-body);
  display:inline-flex;align-items:center;justify-content:center}
.act button svg{width:15px;height:15px}
.act button[disabled]{border-color:transparent;background:none;color:var(--ink-muted);cursor:default}
.act .mut{color:var(--ink-muted);display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px}
.sec svg{width:11px;height:11px;opacity:.75;flex:0 0 auto}
.crumb svg,.brand .logo svg{flex:0 0 auto}
.sel:after{display:none}
.sel svg.chev{width:12px;height:12px;margin-left:auto}

/* press feedback is legitimate on touch and stays outside the hover query */
.cta:active,.stop:active,.choice button.grant:active{
  filter:brightness(0.94);box-shadow:var(--shadow-inset-sel)}
:where(a,button,input,textarea,select,.nav-i,.run-i,.act button,.ghost,.icobtn,.sel,.pg i,.chip,.star):focus-visible{
  outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:var(--radius-control)}
"""

CHOICE_CSS = """/* A DESTRUCTIVE GATE HAS NO PRIMARY.
   The pair was peers in size and weight, and that argument answered only half
   the question: measured on the render, the grant painted 13.36:1 against its
   panel and the refusal 1.12:1. Peer geometry beside a 12x salience gap is the
   same nudge by another channel. The action gradient marks the primary action of
   a surface — and it is withheld where that action is destructive or
   irreversible, because there is no primary to mark. Both options are now
   recessed at the same fill, and differ in KIND: the grant carries a graphite
   edge and graphite ink, the refusal a hairline and muted ink, each with its own
   glyph. */
/* NEITHER OPTION IS PUSHED IS NOT THE SAME AS NEITHER IS VISIBLE.
   Flattening both to the same recessed grey answered the salience complaint by
   making the most important decision in the product look like a disabled form.
   Filled-primary against clearly-outlined-secondary is the conventional answer
   and is not a nudge when both carry real presence: equal size, equal type
   weight, equal *visual* weight, distinguished by treatment and glyph. The
   original defect was 12.62:1 against 1.12:1 — a slab beside a whisper — and
   that is what had to go, not the contrast itself. */
.choice button{gap:6px;font-weight:var(--weight-strong)}
.choice button svg{width:11px;height:11px;flex:0 0 auto}
.choice button.grant{background:var(--brand-solid);background-image:var(--gradient-action);
  box-shadow:var(--shadow-action);color:var(--on-brand);border-color:transparent}
.choice button.refuse{background:var(--surface-raised);background-image:none;
  border:1.5px solid var(--ink-row);color:var(--ink-strong);box-shadow:var(--shadow-hairline)}

"""

MARK_FILL_CSS = """
/* Item marks. Identity used to ride an inline hue; it now rides the label and
   the glyph, and the mark carries the DNA's top-light/bottom-shade read.
   Appended last so it wins on source order regardless of each file's spelling. */
.mark,.s-i{background-image:var(--mark-overlay)}
.mark,.s-i{background-color:var(--mark-1)}
.mark.m2,.s-i.m2{background-color:var(--mark-2)}
.mark.m3,.s-i.m3{background-color:var(--mark-3)}
.mark.m4,.s-i.m4{background-color:var(--mark-4)}
.mark.m5,.s-i.m5{background-color:var(--mark-5)}
.mark.m6,.s-i.m6{background-color:var(--mark-6)}
.mark.m7,.s-i.m7{background-color:var(--mark-7)}
.mark.m8,.s-i.m8{background-color:var(--mark-8)}
/* the glyph was a pale stroke on near-black and read as an empty square */
.mark svg,.s-i svg{stroke:var(--mark-glyph);opacity:1;stroke-width:2}
/* The tool dot distinguished read tools from mutating ones by HUE ALONE
   (blue vs violet, and violet sits inside the banned band). Kind is carried by
   fill-vs-ring instead, so it survives greyscale and colour blindness. */
.tdot{background:var(--brand-solid)}
.tdot.read{background:transparent;box-shadow:inset 0 0 0 1.5px var(--ink-muted)}
"""

# ---- session identity, keyed to the author's per-session inline hex ----------
# Identity must NOT depend on DOM position. The same session's mark appears in the
# sidebar "Running now" list, the board name cell and the v4 session header, and
# every occurrence must resolve to the SAME hue (its Flexoki mark class) and the
# SAME harness glyph. The author's stable key is the inline hex, which is present
# in every location. a11y used to assign hue (i % 8) and glyph (i % 3) by DOM
# occurrence order, so — because the sidebar marks precede the board marks — one
# session drew a different colour and a different harness glyph in each place.
# Keyed here, at the point where the hex still exists and before it is consumed.
HEX_MARK = {   # identity hex -> Flexoki mark class (hue), hue-matched, all distinct
    '#F0705E': 1, '#E8873B': 2, '#F2C14E': 3, '#63C68B': 4,
    '#4FC3D9': 5, '#5AA9E6': 6, '#7B8FE8': 7, '#B98BE0': 8,
}
HEX_HARNESS = {  # identity hex -> harness (glyph), read from the board Harness column
    '#F0705E': 'claude', '#F2C14E': 'opencode', '#4FC3D9': 'claude',
    '#7B8FE8': 'pi',     '#63C68B': 'claude',   '#E8873B': 'opencode',
    '#B98BE0': 'claude', '#5AA9E6': 'pi',
}
HARNESS_GLYPH = {
    'claude':   '<path d="M12 4l7 4v8l-7 4-7-4V8z"/>',
    'opencode': '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
    'pi':       '<path d="M5 7.5h14M9 7.5v9M15 7.5v6.5a2.5 2.5 0 0 0 4 0"/>',
}
MARK_SVG_OPEN = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">')


def _mark_ident(m):
    cls, hexv, svg = m.group(1), m.group(2).upper(), m.group(3)
    n = HEX_MARK.get(hexv, 1)
    klass = cls if n == 1 else f'{cls} m{n}'
    if cls == 'mark':
        # a session mark (board / sidebar / v4 header) carries the harness glyph,
        # keyed to the same identity hex — matches its stated harness everywhere
        svg = MARK_SVG_OPEN + HARNESS_GLYPH[HEX_HARNESS.get(hexv, 'claude')] + '</svg>'
    # .s-i quick-action marks keep their own action glyph; only the hue is keyed
    return f'<span class="{klass}">{svg}</span>'


WEIGHT = {'700': 'var(--weight-strong)', '600': 'var(--weight-strong)',
          '500': 'var(--weight-strong)', '450': 'var(--weight-medium)',
          '400': 'var(--weight-body)'}



# ---------------------------------------------------------------------------
# COUNTED REPLACEMENTS
#
# Every literal .replace() in the first version of this file was an unguarded
# no-op risk, and two of them fired zero times in silence:
#   - the body-shorthand rewrite, which is how `1.45` leading shipped while
#     DESIGN.md claimed 1.4;
#   - the mark fill, which only ever matched v2's spelling, so v3's `.s-i` and
#     v4's `.mark` lost their inline hue and painted at 1.07:1.
# A replacement that matches nothing is now an ERROR, not a shrug.
# ---------------------------------------------------------------------------
class Rules:
    def __init__(self, path):
        self.path = path.name
        self.log = []
        self.bad = 0

    def _record(self, name, n, expect):
        ok = True
        if expect == 'any':
            ok = n >= 1
        elif expect == 'opt':
            ok = True
        elif isinstance(expect, dict):
            want = expect.get(self.path, 0)
            ok = n == want
        else:
            ok = n == expect
        if not ok:
            self.bad += 1
        self.log.append((name, n, expect, ok))
        return ok

    def lit(self, s, name, old, new, expect='any'):
        n = s.count(old)
        self._record(name, n, expect)
        return s.replace(old, new)

    def rx(self, s, name, pat, repl, expect='any', flags=0):
        n = len(re.findall(pat, s, flags))
        self._record(name, n, expect)
        return re.sub(pat, repl, s, flags=flags)

    def report(self):
        for name, n, expect, ok in self.log:
            if not ok:
                print(f"    RULE MISMATCH  {self.path:<20} {name:<28} "
                      f"matched {n}, expected {expect}")
        return self.bad


def strip_block(css, selector):
    m = re.search(r'\n' + re.escape(selector) + r'\s*\{', css)
    if not m:
        return css, False
    i = css.index('{', m.start())
    depth = 0
    for j in range(i, len(css)):
        if css[j] == '{':
            depth += 1
        elif css[j] == '}':
            depth -= 1
            if depth == 0:
                return css[:m.start()] + css[j + 1:], True
    return css, False


def transform(path: Path):
    s = path.read_text()
    R = Rules(path)

    # 1. link the token file, once, before the inline <style>
    if 'tokens.css' not in s:
        s = R.lit(s, 'link tokens.css', '<style>',
                  '<link rel="stylesheet" href="./tokens.css">\n<style>', 1)

    # 2. drop the local alias layer and the hand-written dark theme
    s, had_root = strip_block(s, ':root')
    s, had_dark = strip_block(s, '.dark')

    # 3. gradients first (they consume two local names at once), then renames
    for pat, rep in GRADIENT:
        s = re.sub(pat, rep, s)
    renamed = 0
    for old, new in sorted(RENAME.items(), key=lambda kv: -len(kv[0])):
        pat = r'var\(--' + re.escape(old) + r'\)'
        renamed += len(re.findall(pat, s))
        s = re.sub(pat, f'var(--{new})', s)
    R._record('alias renames (bulk)', renamed, 'any')

    # 4. composite literals before single ones, so the long forms match
    for pat, rep in SHADOW:
        s = re.sub(pat, rep, s)
    for pat, rep in MASK:
        s = re.sub(pat, rep, s)
    lits = 0
    for lit, tok in sorted(LITERAL.items(), key=lambda kv: -len(kv[0])):
        pat = re.escape(lit) + r'\b'
        lits += len(re.findall(pat, s))
        s = re.sub(pat, tok, s)
    R._record('hex literals (bulk)', lits, 'any')

    # 5. THE ITEM MARKS.
    # Project identity lived in an inline hue on .mark / .s-i / .tdot — an
    # eight-colour rainbow that collided with all four status hues and put two
    # marks inside the banned violet band. Stripping it is correct; leaving
    # nothing behind is not, and that is what happened: v4's .mark painted at
    # 1.07:1 and v3's .s-i put white ink on white at 1.09:1. The fill is
    # re-supplied here for EVERY class that lost one, appended last so it wins
    # on source order rather than depending on each file's rule spelling.
    # The inline hex is the author's session-identity key, not a colour to throw
    # away: it maps to a fixed Flexoki mark class (hue) and, for session marks, a
    # fixed harness glyph — so the same session reads identically in every
    # location. See HEX_MARK / HEX_HARNESS above.
    marks = len(re.findall(
        r'<span class="(?:mark|s-i)" style="background:#[0-9A-Fa-f]{6}">', s))
    R._record('identity marks keyed to session hex', marks,
              {'v2-fleet.html': 12, 'v3-assistant.html': 15, 'v4-transcript.html': 5})
    s = re.sub(
        r'<span class="(mark|s-i)" style="background:(#[0-9A-Fa-f]{6})">(<svg.*?</svg>)</span>',
        _mark_ident, s, flags=re.S)
    s = R.lit(s, 'inject mark fill', '</style>', MARK_FILL_CSS + '</style>', 1)

    # 6. type: sizes onto the ladder, weights down one notch, leading tokenised
    #
    # ORDER MATTERS. The slash form must be rewritten FIRST and in one pass: a
    # leading-agnostic `font:<weight> <size>` rule run first turns
    # `font:400 14px/1.45` into `font:var(...) var(...)/1.45`, which no later
    # rule matches — that is exactly how 1.45 shipped while the type section
    # claimed 1.4. The trailing (?![\d.a-z%]) anchor stops `14px/20px` becoming
    # `.../var(--leading-body)px`.
    s = R.rx(s, 'font shorthand w/ leading',
             r"font:(\d{3}) (var\(--[\w-]+\)|\d+(?:\.\d+)?px)/(\d+(?:\.\d+)?)(?![\d.a-z%])",
             lambda m: f"font:{WEIGHT.get(m.group(1), m.group(1))} "
                       f"{FONT_SIZE.get(m.group(2), m.group(2))}/var(--leading-body)", 'any')
    s = R.rx(s, 'font-size -> ladder', r'font-size:(\d+(?:\.\d+)?px)',
             lambda m: 'font-size:' + FONT_SIZE.get(m.group(1), m.group(1)), 'any')
    # Weights above 500 never ship: the comp's rasterizer renders every
    # candidate face ~45% heavy, so the ladder is 400/450/500 and the fix for
    # "not bold enough" is never a heavier number. 550 and 650 shipped in v3
    # because this mapped only exact 3-digit multiples it knew about.
    s = R.rx(s, 'font-weight -> ladder', r'font-weight:(\d{3})',
             lambda m: 'font-weight:' + WEIGHT.get(m.group(1),
                       'var(--weight-strong)' if int(m.group(1)) > 500 else m.group(1)), 'any')
    # A `font:` shorthand with no `/leading` RESETS line-height to `normal`,
    # leaving the line box to the font's own metrics — unspecified type. These
    # are all single-line controls, so they take --leading-ui explicitly.
    s = R.rx(s, 'font shorthand bare', r"font:(\d{3}) (\d+(?:\.\d+)?px)(?!/)",
             lambda m: f"font:{WEIGHT.get(m.group(1), m.group(1))} "
                       f"{FONT_SIZE.get(m.group(2), m.group(2))}/var(--leading-ui)", 'opt')
    s = R.rx(s, 'tokenised shorthand leading',
             r"font:var\(--weight-(\w+)\) var\(--text-([\w-]+)\)(?!/)",
             r"font:var(--weight-\1) var(--text-\2)/var(--leading-ui)", 'opt')
    # Literal line-heights ABOVE the 1.4 ceiling (and at most 2) become the
    # token. Values already inside the 1.2-1.4 band are left alone, as is the
    # numeric leading. The previous comment claimed "every literal body leading,
    # whatever its value" — it never did that, and a docstring that overstates
    # its rule is the same defect class as a document that overstates its render.
    s = R.rx(s, 'line-height > 1.4 -> token', r"line-height:(\d+(?:\.\d+)?)\b",
             lambda m: ("line-height:var(--leading-body)"
                        if 1.4 < float(m.group(1)) <= 2 else m.group(0)), 'opt')
    s = R.lit(s, 'body font family',
              "'Geist Variable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif",
              "var(--font-body)", 'opt')
    s = R.lit(s, 'geist -> token', "'Geist Variable'", "var(--font-body)", 'opt')
    s = R.lit(s, 'mono -> token', "ui-monospace,'SF Mono',Menlo,monospace",
              "var(--font-mono)", 'opt')

    # 7. last: the KPI value, AFTER font-size mapping has produced the token
    # form. Doing this earlier matched nothing and no-oped in silence, which is
    # how a 38px line box in a 24px well shipped.
    s = R.lit(s, 'KPI numeric leading',
              ".stat .v{margin-left:33px;font-size:var(--text-4xl);",
              ".stat .v{margin-left:33px;min-width:0;font-size:var(--text-3xl);"
              "line-height:var(--leading-numeric);",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})
    # The first session sat at y~748 on a 390 viewport, below Export CSV and five
    # filter controls, on the device the brief calls first-class. Filters and
    # export are not what someone opens this on a phone to do.
    s = R.lit(s, 'mobile puts sessions first',
              "  .stats{grid-template-columns:1fr 1fr;gap:10px}",
              "  .stats{grid-template-columns:1fr 1fr;gap:10px}\n"
              "",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})
    s = R.lit(s, 'action cell wraps',
              "  tbody td::before{content:attr(data-label);color:var(--ink-muted);font-size:var(--text-base);flex:0 0 auto}",
              "  tbody td::before{content:attr(data-label);color:var(--ink-muted);font-size:var(--text-base);flex:0 0 auto}\n"
              "  tbody td{min-width:0}\n"
              "  .act{flex-wrap:wrap;justify-content:flex-end;min-width:0}",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})
    s = R.lit(s, 'stat grid minmax', ".stats{grid-template-columns:1fr 1fr;gap:10px}",
              ".stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})
    # idempotence guard: the anchor survives its own substitution, so an
    # unguarded replace appends this block again on every run
    if '.stat .well{padding:9px 12px}' not in s:
        s = R.lit(s, 'compact stat card', ".stat{height:82px}",
                  ".stat{height:82px}\n  .stat .well{padding:9px 12px}"
                  "\n  .stat .v{font-size:var(--text-2xl)}"
                  # "Spend today" wrapped to two lines in a 139px card and
                  # pushed the value out of the well. `white-space:nowrap` fixed
                  # that by trading it for horizontal overflow at 200% text, so
                  # the card is intrinsic instead: the label may wrap and the
                  # card grows to hold it.
                  "\n  .stat{height:auto;min-height:82px}"
                  "\n  .stat .lbl{min-width:0}",
                  {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})

    # 8. BLOCKER — Approve and Deny were byte-identical: same 132x32 box, same
    # flat rgb(252,253,253), same border, ink and weight, on an `rm -rf`
    # permission gate. The locked identity says "nothing that can be pressed is
    # flat... applied without exception", so a flat pair violated the DNA as
    # well as Nielsen #5. They stay PEERS in size and weight — nothing here
    # nudges the operator toward granting a destructive command — but they are
    # now opposite in KIND: the primary is the raised graphite action, deny is
    # its recessed inverse. Distinct without alarm colour, and legible in
    # greyscale.
    s = R.lit(s, 'approve/deny distinct',
              ".choice button{width:132px;height:32px;border:1px solid var(--border-control);"
              "background:var(--surface-raised);",
              ".choice button{width:132px;height:32px;border:1px solid var(--border-control);"
              "background:var(--surface-raised);",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})
    s = R.lit(s, 'approve/deny css', ".choice button:focus-visible",
              CHOICE_CSS + ".choice button:focus-visible",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})
    s = R.lit(s, 'approve/deny markup',
              '<div class="choice"><button>Approve</button><button>Deny</button></div>',
              '<div class="choice"><button class="grant">Approve</button>'
              '<button class="refuse">Deny</button></div>',
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})

    # 9. MOBILE — the filter rail hid "Last active" entirely: 97px of content
    # off-screen at 390 and 167px at 320, behind nothing but a fade. A control
    # the operator cannot reach is not a control. Mobile is first-class for this
    # product, so the filters WRAP instead of scrolling: nothing is hidden, so
    # no affordance is needed to find it.
    s = R.lit(s, 'filters wrap on mobile',
              "  .filters{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;\n"
              "           -webkit-overflow-scrolling:touch;padding-right:22px;\n"
              "           -webkit-mask:linear-gradient(to right,black calc(100% - 26px),transparent);\n"
              "                   mask:linear-gradient(to right,black calc(100% - 26px),transparent)}",
              "  .filters{display:flex;flex-wrap:wrap;gap:8px}",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})
    s = R.lit(s, 'filters children grow', "  .filters > *{flex:0 0 auto}",
              "  .filters > *{flex:1 1 auto}",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})

    # 10. the transcript's compact scale rode two local literals, and 12.5px is
    # not a step on the ladder DESIGN.md enumerates. The compact surface is the
    # same ladder one rung down, not a second ladder.
    s = R.lit(s, 'compact body -> ladder', '--c-fs:12.5px;', '--c-fs:var(--text-base);',
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})
    s = R.lit(s, 'compact small -> ladder', '--c-fs-sm:11.5px;', '--c-fs-sm:var(--text-sm);',
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})

    # the stop control sets font-size without a leading, so its line box fell
    # to the font's own metrics (measured 1.043) — the last `normal` in the set
    s = R.lit(s, 'stop button leading',
              "cursor:pointer;font-size:var(--text-sm)}",
              "cursor:pointer;font-size:var(--text-sm);line-height:var(--leading-ui)}",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})

    # 11. read-only tools get the ring form of the dot (see MARK_FILL_CSS)
    for tool in ('Grep', 'Read', 'Glob', 'Bash'):
        s = s.replace(f'<span class="tdot"></span><span class="tk">{tool}',
                      f'<span class="tdot read"></span><span class="tk">{tool}')

    # 12. CRITICAL — hand-typed colour that does not theme.
    # "Zero raw hex" is weaker than the constraint intends: rgba() is not hex, so
    # `.cin{background:rgba(255,255,255,.82)}` rode through every pass and only
    # manifested in dark, painting a rgb(213,213,213) capsule on a #19191a page
    # with its placeholder at 1.37:1. Relative colour keeps the translucency and
    # the blur while following the scheme.
    s = R.lit(s, 'composer capsule themes', "background:rgba(255,255,255,.82);",
              "background:oklch(from var(--surface-raised) l c h / 0.82);",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})
    s = R.lit(s, 'composer shadow tokens',
              "box-shadow:0 10px 30px rgba(20,20,20,.11),0 1px 3px rgba(20,20,20,.07);",
              "box-shadow:var(--shadow-lifted);",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})
    s = R.lit(s, 'fade stop themes', "rgba(244,244,244,0))",
              "oklch(from var(--surface-field) l c h / 0))",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})
    s = R.lit(s, 'v4 mark overlay token',
              "background-image:linear-gradient(rgba(255,255,255,.22),var(--scrim-soft))}",
              "background-image:var(--mark-overlay)}",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})

    # 13. CRITICAL — content clipped by a non-scrolling ancestor, with no
    # recovery. `.shead` measured 427 wide inside a 390 `main{overflow:hidden}`,
    # so the `needs you` chip lost 37px at 390 and 107px at 320 with nothing to
    # scroll. Same class as the filter row, different surface — fixed as a class
    # this time: the header wraps instead of being cut.
    # anchored on a rule unique to v4's width query: `@media (max-width:900px){`
    # occurs twice in v2 and three times in v3, so anchoring on the query itself
    # injected the block into every one of them. The counted-rule guard caught
    # that on the first run, which is the entire reason it exists.
    s = R.lit(s, 'session header wraps',
              "  .shead,.tr,.dock{padding-left:16px;padding-right:16px}",
              "  .shead,.tr,.dock{padding-left:16px;padding-right:16px}\n"
              "  .shead{height:auto;flex-wrap:wrap;padding:10px 16px;row-gap:8px}\n"
              "  .aff-row > .inner{flex-wrap:wrap;row-gap:6px}\n"
              "  .aff-row .hint{margin-left:0}",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})

    # 14. CRITICAL — the rm -rf gate lost size parity on touch. `flex:1 1 auto`
    # sizes each button to its own label, so the destructive grant rendered
    # 170x44 against Deny's 150x44 at 390 (135 vs 115 at 320) — 13-17% wider AND
    # the filled, higher-salience control, on the device the brief names as the
    # primary approval context. `flex:1 1 0` distributes the row equally, so the
    # peer invariant holds at every width instead of only at the desktop one.
    s = R.lit(s, 'action pair parity on touch', "  .choice button{height:44px;flex:1 1 auto;width:auto}",
              "  .choice button{height:44px;flex:1 1 0;width:auto;min-width:0}",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})

    # 15. CRITICAL — the permission gate misrepresented what it was granting.
    # At 320 every <dd> ended at x=410.5 against a 320px viewport: `.scope`
    # measured 380 wide inside 258, so Path rendered as
    # "/home/bewinxed/cawco/apps/dashboard/.svel" and the operator read a path
    # that is not the path, with Approve fully legible underneath. The document
    # reported clean because a `.tr{overflow-x:auto}` ancestor absorbed it.
    # Nothing is truncated here: the values wrap in full. A path breaks at any
    # character because it has no spaces, so the tail — the part that
    # distinguishes .svelte-kit from .svelte-kit/output — always survives.
    s = R.lit(s, 'scope values wrap in full',
              ".scope dd{color:var(--ink-body)}",
              ".scope dd{color:var(--ink-body);min-width:0;overflow-wrap:anywhere}\n"
              ".scope dd .mono{word-break:break-all}",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})
    s = R.lit(s, 'scope stacks on mobile',
              "  .shead,.tr,.dock{padding-left:16px;padding-right:16px}",
              "  .shead,.tr,.dock{padding-left:16px;padding-right:16px}\n"
              "  .scope{grid-template-columns:1fr;gap:1px 0}\n"
              "  .scope dt{margin-top:7px}",
              {'v2-fleet.html': 0, 'v3-assistant.html': 0, 'v4-transcript.html': 1})

    # 16. MAJOR — target size was attached to WIDTH, not to pointer type, so a
    # tablet at 1024 with a coarse pointer got 10x18.2 action targets. Same
    # misattachment class as the parity defect: the rule belongs to the input
    # device, not the breakpoint.
    s = R.lit(s, 'coarse targets, any width', "@media (pointer:coarse){",
              "@media (pointer:coarse){\n"
              "  .act span,.star,.chev,.collapse,.pg i{min-width:44px;min-height:44px;"
              "display:inline-flex;align-items:center;justify-content:center}\n"
              # every control, not the handful that happened to be listed: the
              # sweep found .quota button at 235x31, .icobtn 32 wide, .cta 36
              # high, .sel 32 high and .stop 34x34, all of which only got 44px
              # inside a WIDTH query and so never applied to a tablet

              "  button,textarea,input,select,.ghost,.icobtn,.sel,.search,.cta,"
              ".stop,.quota button,.back,.fake-in{min-height:44px}\n"
              "  button,.icobtn,.stop,.back{min-width:44px}\n"
              "  .chip-s{min-height:32px}",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 1})

    # 17. MAJOR — the row mark was r6 in the sidebar and r4.6 in the table on the
    # same page. The measured reference is 4.6.
    s = R.lit(s, 'mark radius consistent',
              ".run-i .mark{width:17px;height:17px;border-radius:6px;",
              ".run-i .mark{width:17px;height:17px;border-radius:var(--radius-mark);",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 1})

    # 18. MAJOR — the Action column shipped unlabeled Unicode stand-ins with no
    # accessible name. They are words now, like the two beside them.
    for glyph, word in (('\u25AE\u25AE', 'Pause'), ('\u25B6', 'Resume')):
        s = s.replace(f'<span class="mut">{glyph}</span>', f'<span>{word}</span>')
    s = s.replace('<span class="mut">\u2014</span>',
                  '<span class="mut" aria-label="no action available">\u2014</span>')

    # 19. interaction states — see STATES_CSS
    # `.act span{cursor:pointer}` predates the promotion to real buttons; left
    # in place it made the idle "—" advertise itself as a control it is not.
    # the assistant panel painted r16 while --radius-panel is 14
    s = R.lit(s, 'panel radius token', "border-radius:16px;display:flex;flex-direction:column;overflow:hidden;",
              "border-radius:var(--radius-panel);display:flex;flex-direction:column;overflow:hidden;",
              {'v2-fleet.html': 0, 'v3-assistant.html': 1, 'v4-transcript.html': 0})
    s = R.rx(s, 'focus ring token everywhere',
             r'outline:2px solid var\(--accent-solid\)',
             'outline:2px solid var(--focus-ring)', 'opt')
    s = R.lit(s, 'act cursor on buttons only', ".act span{cursor:pointer}",
              ".act button{cursor:pointer;background:none;border:0;font:inherit;color:inherit;padding:0}",
              {'v2-fleet.html': 1, 'v3-assistant.html': 1, 'v4-transcript.html': 0})
    s = R.lit(s, 'interaction states', '</style>', STATES_CSS + '</style>', 1)

    path.write_text(s)
    return had_root, had_dark, R


if __name__ == '__main__':
    bad = 0
    for name in ('v2-fleet.html', 'v3-assistant.html', 'v4-transcript.html'):
        p = HERE / name
        r, d, R = transform(p)
        left = re.findall(r'#[0-9a-fA-F]{3,6}\b', p.read_text())
        if left:
            bad += 1
        print(f"{name:<22} root-block={'dropped' if r else '-':<8} "
              f"dark-block={'dropped' if d else '-':<8} raw hex left: {len(left)}"
              + (f"  {sorted(set(left))[:8]}" if left else ""))
        bad += R.report()
    # A rule that matched an unexpected number of times is a FAILURE. Silent
    # no-ops in this file shipped a wrong leading and two invisible marks.
    sys.exit(1 if bad else 0)
