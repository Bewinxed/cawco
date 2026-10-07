"""Build a decision page into one self-contained index.html.

    python3 <skill>/build.py --init decisions/onboarding   # start a page from the template
    python3 <skill>/build.py decisions/onboarding --title "Onboarding"

The page folder holds `page.tpl.html` (the page source), `mockups/<name>.html`
(fragments, CONTRACT.md) and, optionally, `diagrams.json` ({"name": "<html>"}).
The template's placeholders:

    {{TITLE}}          the --title, or the folder's name
    {{BASE_CSS}}       the skill's base.css (tokens and shared classes)
    {{MK:<name>}}      mockups/<name>.html, from the page folder, else the skill's
    {{DG_<name>}}      diagrams.json's entry
    {{CAW:<still>}}    a Caw still (light-ready, dark-done, ...) as a data URI

Writes <folder>/index.html (or --out), at most 1 MiB, and prints the choice ids
it marks. Publish it with the decision_publish tool: name = the folder's name,
html = the file's content.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent
LIMIT = 1024 * 1024
CHOICE = re.compile(r"data-cawco-choice\s*=\s*[\"']([^\"']+)[\"']")
OPTION = re.compile(r"data-option\s*=\s*[\"']([^\"']+)[\"']")
ID_OK = re.compile(r"^[^\x00-\x1f\x7f]{1,100}$")


def init(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    tpl = folder / "page.tpl.html"
    if tpl.exists():
        sys.exit(f"{tpl} already exists; edit it, or pick another folder.")
    shutil.copy(SKILL / "page.tpl.html", tpl)
    (folder / "mockups").mkdir(exist_ok=True)
    shutil.copy(SKILL / "mockups" / "example.html", folder / "mockups" / "example.html")
    print(f"started {folder}: edit page.tpl.html and mockups/, then build")


def build(folder: Path, title: str | None, out: Path | None) -> None:
    tpl_path = folder / "page.tpl.html"
    if not tpl_path.exists():
        sys.exit(f"{tpl_path} is missing; run with --init {folder} first.")
    tpl = tpl_path.read_text()
    missing: list[str] = []

    diagrams_path = folder / "diagrams.json"
    if diagrams_path.exists():
        for key, html in json.loads(diagrams_path.read_text()).items():
            tpl = tpl.replace("{{DG_" + key + "}}", html)

    def mockup(match: re.Match) -> str:
        name = match.group(1)
        for base in (folder / "mockups", SKILL / "mockups"):
            path = base / f"{name}.html"
            if path.exists():
                return path.read_text()
        missing.append(name)
        return f'<div class="pane">Mockup "{name}" is missing.</div>'

    def caw(match: re.Match) -> str:
        path = SKILL / "caw" / f"{match.group(1)}.webp"
        if not path.exists():
            missing.append(f"caw/{match.group(1)}")
            return ""
        return "data:image/webp;base64," + base64.b64encode(path.read_bytes()).decode()

    tpl = re.sub(r"\{\{MK:([a-z0-9-]+)\}\}", mockup, tpl)
    tpl = re.sub(r"\{\{CAW:([a-z-]+)\}\}", caw, tpl)
    tpl = tpl.replace("{{TITLE}}", title or folder.resolve().name.replace("-", " ").capitalize())
    tpl = tpl.replace("{{BASE_CSS}}", (SKILL / "base.css").read_text())
    leftover = re.findall(r"\{\{[^}]+\}\}", tpl)
    if leftover or missing:
        sys.exit(f"unfilled: {sorted(set(leftover))}; missing: {missing}")

    ids = list(dict.fromkeys(CHOICE.findall(tpl)))
    bad = [i for i in ids if not ID_OK.match(i.strip())]
    if bad:
        sys.exit(f"choice ids must be 1 to 100 printable characters: {bad}")
    options = OPTION.findall(tpl)
    size = len(tpl.encode())
    if size > LIMIT:
        sys.exit(f"the page is {size // 1024} KiB; decision_publish takes at most 1024 KiB. Trim mockups or images.")
    target = out or folder / "index.html"
    target.write_text(tpl)
    print(f"built {target} ({size // 1024} KiB): {len(ids)} choices, {len(options)} options")
    print("choice ids (keep them stable across revisions): " + ", ".join(ids))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a decision page.")
    parser.add_argument("folder", type=Path)
    parser.add_argument("--init", action="store_true", help="start the folder from the template")
    parser.add_argument("--title")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if args.init:
        init(args.folder)
    else:
        build(args.folder, args.title, args.out)


if __name__ == "__main__":
    main()
