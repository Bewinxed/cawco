#!/usr/bin/env python3
"""Swap every generic UI glyph for the project's real icon set: Solar (duotone).

WHY THIS EXISTS — the three mocks carried hand-rolled outline SVGs for generic
iconography (nav, stat chips, header controls, tool rows). Hand-drawn paths were
optically off-centre in their 24x24 viewBox (flagged twice) and were not the
product's actual icon set. Solar duotone glyphs are authored on a centred 24x24
grid and ship two `currentColor` layers (a solid path + a `.5`-opacity duo
layer), so they inherit theme colour and read on both schemes.

The HARNESS IDENTITY MARKS (Claude Code / OpenCode / pi — the atom and the three
harness glyphs) are NOT generic iconography: they are brand marks carrying a
per-item hue, so they are left untouched here and centred by hand in a11y.py.

Two mechanisms, both counted so a silent no-op fails the build:
  1. SIGNATURE SWAP — an existing `<svg>` whose inner markup contains a known
     path signature is replaced whole by the matching Solar glyph.
  2. PLACEHOLDER — a literal `{{solar:NAME}}` token (used for brand-new icons
     such as the transcript tool rows) is replaced by the Solar glyph.

Solar sources live in mocks/solar/<name>.svg (committed, so the build needs no
network). usage: python3 mocks/solarize.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
SOLAR_DIR = HERE / 'solar'


def inner(name: str) -> str:
    raw = (SOLAR_DIR / f'{name}.svg').read_text()
    body = re.sub(r'^<svg[^>]*>', '', raw).replace('</svg>', '').strip()
    return body


def glyph(name: str) -> str:
    return ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
            + inner(name) + '</svg>')


# path-signature (substring of an svg's inner markup)  ->  Solar name
SIGNATURES = [
    ('width="7" height="7" rx="1.6"', 'widget-5'),        # Fleet grid (nav + crumb)
    ('a4 4 0 0 1-5.4 5.4', 'tuning-4'),                   # Tools
    ('M4 5h16M4 12h11M4 19h7', 'checklist-minimalistic'), # Rules
    ('M10 20V4M16 20v-7', 'chart-2'),                     # Usage (src variant)
    ('M10 19V4M16 19v-7', 'chart-2'),                     # Usage (nav variant)
    ('h4l2 2.5h8', 'folder'),                             # Projects (src variant)
    ('M3 7h6l2 2h10v9', 'folder'),                        # Projects (nav variant)
    ('width="19" height="12" rx="2"', 'laptop-minimalistic'),  # Machines list rows
    ('width="17" height="15" rx="2"', 'sidebar-minimalistic'), # collapse sidebar
    ('M12 5v14M5 12h14', 'add-circle'),                   # plus / Start session
    ('circle cx="11" cy="11" r="6.5"', 'magnifer'),       # search
    ('M12 15V4M8.5 7.5', 'export'),                       # Export CSV
    ('r="8.2"', 'clock-circle'),                          # last activity clock
    ('M4 7h16M4 12h16M4 17h16', 'hamburger-menu'),        # burger
    ('M4 6h16M4 12h16M4 18h16', 'hamburger-menu'),        # crumb menu
    ('M18 9a6 6 0 1 0-12 0', 'bell'),                     # notifications
    ('13.7 9l5.5 1.7', 'magic-stick-3'),                  # Ask AI
    ('M13 2 4.5 13.5H11', 'bolt'),                         # quota spend lightning
    ('M3 6h18M3 12h18M3 18h11', 'programming'),           # KPI Sessions
    ('M12 3v10M12 17.5v.5', 'danger-triangle'),           # KPI Needs you
    ('width="18" height="12" rx="2"', 'laptop-minimalistic'),  # KPI Machines
    ('M12 3v18M16.5 7.5c0-2', 'dollar-minimalistic'),     # KPI Spend
    ('m12 3.6 2.6 5.4 5.9.8', 'star'),                    # favourite
    ('m6 9.5 6 6 6-6', 'alt-arrow-down'),                 # account chevron
    ('M6 9.5l6 6 6-6', 'alt-arrow-down'),                 # select chevron
    ('M14 6l-6 6 6 6', 'alt-arrow-left'),                 # pager prev / back
    ('M10 6l6 6-6 6', 'alt-arrow-right'),                 # pager next
]

# Signatures that mean "this is a custom brand mark or a non-design affordance —
# never touch it", checked first so a generic signature can't win on it.
KEEP = [
    'ry="4.6"',                 # harness atom mark
    'M12 4l7 4v8l-7 4-7-4V8z',  # Claude Code harness glyph
    'M9 8l-4 4 4 4M15 8l4 4',   # OpenCode harness glyph
    'M5 7.5h14M9 7.5v9M15 7.5', # pi harness glyph
    'M4 4h16v16H4z',            # CawCo brand logo
    'M12 4.5v15',               # theme toggle (screenshot affordance, not design)
]

SVG_RE = re.compile(r'<svg\b[^>]*>.*?</svg>', re.S)


def transform(path: Path):
    s = path.read_text()
    counts = {}

    def repl(m):
        block = m.group(0)
        # viewBox 0 0 12 12 == status-chip glyph, a bespoke small-grid mark: keep
        if 'viewBox="0 0 12 12"' in block:
            return block
        if any(k in block for k in KEEP):
            return block
        for sig, name in SIGNATURES:
            if sig in block:
                counts[name] = counts.get(name, 0) + 1
                return glyph(name)
        return block

    s = SVG_RE.sub(repl, s)

    # placeholders for brand-new icons
    def ph(m):
        name = m.group(1)
        counts[name] = counts.get(name, 0) + 1
        return glyph(name)
    s = re.sub(r'\{\{solar:([a-z0-9-]+)\}\}', ph, s)

    path.write_text(s)
    return counts


if __name__ == '__main__':
    total = 0
    for name in ('v2-fleet.html', 'v3-assistant.html', 'v4-transcript.html', 'v5-components.html', 'v5-agent.html', 'v5-data.html', 'v5-workspace.html', 'v5-assistant.html'):
        c = transform(HERE / name)
        n = sum(c.values())
        total += n
        print(f"{name:<22} {n} generic glyphs -> Solar  "
              + ' '.join(f'{k}:{v}' for k, v in sorted(c.items())))
    if total == 0:
        print("  solarize matched nothing — signatures are stale")
        sys.exit(1)
