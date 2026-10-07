"""Build a decision page into one self-contained index.html.

    python3 <skill>/scripts/build.py <work-dir>

Reads <work-dir>/page.html (start from the skill's kit/page.html) and writes
<work-dir>/index.html with everything inlined, so CawCo can publish the one
file into the project's folder (show_preview with page and dir):

- {{KIT_CSS}}   the kit's tokens.css and page.css
- {{KIT_JS}}    the kit's page.js
- {{DIALS}}     DialKit (vendored, MIT) and dials.js; leave it out when no card has dials
- {{MK:<id>}}   <work-dir>/mockups/<id>.html, one mockup fragment (CONTRACT.md)
- src="caw/…" and any other relative image src, as data: URIs

A published page is read off your machine whole, up to 512 KiB; the build
stops when the page is larger.
"""
import base64
import mimetypes
import re
import sys
from pathlib import Path

LIMIT = 512 * 1024
KIT = Path(__file__).resolve().parent.parent / "kit"

if len(sys.argv) != 2:
    raise SystemExit(__doc__)
work = Path(sys.argv[1]).resolve()
page = (work / "page.html").read_text()
unknown = [
    p
    for p in re.findall(r"\{\{([^}]+)\}\}", page)
    if p not in ("KIT_CSS", "KIT_JS", "DIALS") and not re.fullmatch(r"MK:[a-z0-9-]+", p)
]
if unknown:
    raise SystemExit(f"unknown placeholders: {unknown}")

page = page.replace(
    "{{KIT_CSS}}", (KIT / "tokens.css").read_text() + (KIT / "page.css").read_text()
)
page = page.replace("{{KIT_JS}}", (KIT / "page.js").read_text())
dials = KIT / "vendor" / "dialkit"
page = page.replace(
    "{{DIALS}}",
    "<style>"
    + (dials / "styles.css").read_text()
    + "</style><script>"
    + (dials / "browser.global.js").read_text()
    + "</script><script>"
    + (KIT / "dials.js").read_text()
    + "</script>",
)

missing = []


def mockup(match):
    path = work / "mockups" / f"{match.group(1)}.html"
    if path.exists():
        return path.read_text()
    missing.append(match.group(1))
    return ""


page = re.sub(r"\{\{MK:([a-z0-9-]+)\}\}", mockup, page)
if missing:
    raise SystemExit(f"missing mockups: {', '.join(missing)} (expected in {work / 'mockups'})")


def inline(match):
    src = match.group(2)
    if re.match(r"^(data:|https?:|//|#)", src):
        return match.group(0)
    path = KIT / src if src.startswith("caw/") else work / src
    if not path.is_file():
        raise SystemExit(f"image not found: {src}")
    kind = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode()
    return f'{match.group(1)}"data:{kind};base64,{data}"'


page = re.sub(r'(\bsrc=)"([^"]+)"', inline, page)

size = len(page.encode())
if size > LIMIT:
    raise SystemExit(
        f"index.html would be {size // 1024} KiB; a published page stops at {LIMIT // 1024} KiB. "
        "Drop dials you do not need, shrink mockups, or split the page."
    )
(work / "index.html").write_text(page)
print(f"built {work / 'index.html'} ({size // 1024} KiB)")
