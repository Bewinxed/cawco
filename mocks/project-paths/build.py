"""Build index.html from page.tpl.html, diagrams.json and mockups/*.html.

Run from anywhere: python3 mocks/project-paths/build.py
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
tpl = (HERE / "page.tpl.html").read_text()
for key, html in json.loads((HERE / "diagrams.json").read_text()).items():
    tpl = tpl.replace("{{DG_" + key + "}}", html)

missing = []


def mockup(match):
    name = match.group(1)
    path = HERE / "mockups" / f"{name}.html"
    if path.exists():
        return path.read_text()
    missing.append(name)
    return f'<div class="pending">Mockup "{name}" is missing.</div>'


tpl = re.sub(r"\{\{MK:([a-z0-9-]+)\}\}", mockup, tpl)
leftover = re.findall(r"\{\{[^}]+\}\}", tpl)
if leftover:
    raise SystemExit(f"unfilled placeholders: {leftover}")
(HERE / "index.html").write_text(tpl)
print("built index.html" + (f"; missing mockups: {missing}" if missing else ""))
