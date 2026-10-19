"""The cutover's after-M lanes, cut once from five lists: main's after-M
additions (after-m-files.py's TSV), the relics (relics-check.ts --list),
svelte-unused-css's dead rules, and ESLint's Tailwind and shadcn findings.
Every file goes in exactly one lane. The kit lanes stand alone: app.css,
the sheets it imports and theme.css in one, `src/lib/components/ui/**` in
groups of its own. Consumer lanes take 6 to 8 files by area.

  python3 -I cut-lanes.py <after-m.tsv> <relics.txt> <unused.txt> <eslint.json> <out-dir>

Writes `<out-dir>/<lane>.txt` (the files, a blank line, then `# <file>: <reasons>`)
and `<out-dir>/INVENTORY.md` (counts, the no-restyle sites by kit part,
the kit carve-outs), and prints each lane with its count.
"""

import collections
import json
import os
import re
import sys

tsv, relics_path, unused_path, eslint_path, out = sys.argv[1:6]
kit_parts_path = sys.argv[6] if len(sys.argv) > 6 else None
PREFIX = "apps/dashboard/src/"
reasons: dict[str, list[str]] = collections.defaultdict(list)


def add(path: str, why: str) -> None:
    if why not in reasons[path]:
        reasons[path].append(why)


WHY = {
    "style": "after-M: a scoped <style> rule",
    "css": "after-M: a stylesheet rule",
    "raw": "after-M: a Tailwind class with a raw value",
    "tw": "after-M: a new Tailwind class",
    "cls": "after-M: markup naming a scoped class",
    "state": "after-M: a state written as a class",
    "bang": "after-M: a ! override",
    "inline": "after-M: an inline style",
}
for line in open(tsv):
    path, flags, _added, conflicted = line.rstrip("\n").split("\t")
    for flag in flags.split(","):
        if flag in WHY:
            add(path, WHY[flag])
    if conflicted == "1":
        add(path, "after-M: the merge took main's unconverted lines in a conflicting hunk")

relic_count: collections.Counter = collections.Counter()
for line in open(relics_path):
    m = re.match(r"(\S+):(\d+)  (\S+)  ", line)
    if m:
        path, _line, kind = m.groups()
        relic_count[(path, kind)] += 1
for (path, kind), n in relic_count.items():
    add(path, f"relic: {kind} ×{n}")

for line in open(unused_path):
    m = re.match(r"\s+(apps/dashboard/src/\S+\.svelte)", line)
    if m:
        add(m.group(1), "dead: svelte-unused-css pruned rule(s)")

no_restyle: list[tuple[str, int, str]] = []
for entry in json.load(open(eslint_path)):
    path = entry["filePath"][entry["filePath"].index(PREFIX):]
    rules = collections.Counter(m.get("ruleId") for m in entry["messages"])
    for rule, n in rules.items():
        add(path, f"lint: {rule} ×{n}")
    for m in entry["messages"]:
        if m.get("ruleId") == "shadcn/no-restyle":
            no_restyle.append((path, m["line"], m["message"]))

GENERATED = {
    PREFIX + "lib/tokens/tokens.css",
    PREFIX + "lib/tokens/tokens.ts",
    PREFIX + "lib/tokens/variants.css",
}
for path in list(reasons):
    if path in GENERATED:
        del reasons[path]

KIT_SHEETS = {
    PREFIX + "app.css",
    PREFIX + "lib/tokens/theme.css",
    PREFIX + "lib/cawco/spawn/ns-theme.css",
    PREFIX + "lib/components/features/workflows/workflows.css",
}
for sheet in KIT_SHEETS:
    add(sheet, "kit: app.css's import graph (the kit lane owns it)")
# The kit's own contracts: the lint's allow-lists for kit parts.
ESLINT_CONFIG = "apps/dashboard/eslint.config.mjs"
KIT_SHEETS.add(ESLINT_CONFIG)
add(ESLINT_CONFIG, "kit: no-restyle's HOUSE allowance and the triggers' allow-list are contracts to clear")
if kit_parts_path:
    for line in open(kit_parts_path):
        if line.strip():
            add(line.strip(), "kit: a no-restyle site or a K1–K3 carve-out wants a variant here")


def area(path: str) -> str:
    rest = path[len(PREFIX):] if path.startswith(PREFIX) else path
    parts = rest.split("/")
    if path in KIT_SHEETS:
        return "kit-sheets"
    if not path.startswith(PREFIX):
        return "kit-sheets"
    if rest.startswith("lib/components/ui/"):
        return "kit-ui"
    if parts[:2] == ["lib", "cawco"]:
        return f"cawco-{parts[2]}" if len(parts) > 3 else "cawco-top"
    if parts[0] == "lib":
        return f"lib-{parts[1]}"
    if parts[0] == "routes":
        if len(parts) > 2 and parts[1] == "(app)":
            return f"routes-{parts[2]}"
        return "routes-top"
    return parts[0]


groups: dict[str, list[str]] = collections.defaultdict(list)
for path in sorted(reasons):
    groups[area(path)].append(path)

lanes: dict[str, list[str]] = {}
pending: list[str] = []
pending_names: list[str] = []


def split(name: str, paths: list[str]) -> None:
    parts = -(-len(paths) // 8)
    size = -(-len(paths) // parts)
    for i in range(parts):
        chunk = paths[i * size:(i + 1) * size]
        lanes[f"{name}-{i + 1}" if parts > 1 else name] = chunk


for name in sorted(groups):
    paths = groups[name]
    if name in ("kit-sheets",):
        lanes[name] = paths
    elif len(paths) >= 6:
        split(name, paths)
    else:
        pending += paths
        pending_names.append(name)
        if len(pending) >= 6:
            split("+".join(pending_names), pending)
            pending, pending_names = [], []
if pending:
    # The last few join the consumer lane with the most room.
    target = min(
        (n for n in lanes if not n.startswith("kit")),
        key=lambda n: len(lanes[n]),
    )
    lanes[target] += pending

os.makedirs(out, exist_ok=True)
seen: set[str] = set()
names = sorted(lanes, key=lambda n: (not n.startswith("kit"), n))
summary = []
for number, name in enumerate(names):
    paths = lanes[name]
    assert not (seen & set(paths)), name
    seen |= set(paths)
    short = name.split("+")[0]
    lane = f"L{number:02d}-{short}"
    with open(os.path.join(out, f"{lane}.txt"), "w") as f:
        f.write("\n".join(paths) + "\n\n")
        for path in paths:
            f.write(f"# {path}: {'; '.join(reasons[path])}\n")
    summary.append((lane, len(paths)))
    print(f"{lane}\t{len(paths)}")
print(f"total\t{len(seen)} files in {len(lanes)} lanes")

by_part: dict[str, list[str]] = collections.defaultdict(list)
for path, line, message in no_restyle:
    part = re.search(r"on <(\w+)>", message)
    by_part[part.group(1) if part else "?"].append(f"{path}:{line}  {message}")
kinds = collections.Counter()
for (path, kind), n in relic_count.items():
    kinds[kind] += n
only_after_m = sum(
    1 for p in seen if all(r.startswith("after-M") for r in reasons[p])
)
only_relic = sum(
    1
    for p in seen
    if not any(r.startswith("after-M") for r in reasons[p])
    and not p.startswith(PREFIX + "lib/components/ui/")
    and p not in KIT_SHEETS
)
kit_files = sum(
    1 for p in seen if p.startswith(PREFIX + "lib/components/ui/") or p in KIT_SHEETS
)
with open(os.path.join(out, "INVENTORY.md"), "w") as f:
    f.write("# After-M lanes: inventory\n\n")
    f.write(f"{len(seen)} files in {len(lanes)} lanes; kit {kit_files}; after-M only {only_after_m}; relic/lint/dead only (consumers) {only_relic}.\n\n")
    f.write("Relics on the merge: " + ", ".join(f"{k} {n}" for k, n in sorted(kinds.items())) + ".\n\n")
    f.write("## Lanes\n\n")
    for lane, n in summary:
        f.write(f"- {lane}: {n}\n")
    f.write(f"\n## shadcn/no-restyle sites by kit part ({len(no_restyle)})\n\n")
    f.write("Each wants a kit variant (the kit lane) and a `kit-swap:` at its site (the consumer lane).\n\n")
    for part in sorted(by_part, key=lambda p: -len(by_part[p])):
        f.write(f"### {part} ({len(by_part[part])})\n\n")
        for site in by_part[part]:
            f.write(f"- {site}\n")
        f.write("\n")
    f.write("## Kit carve-outs\n\n")
    f.write("- ns-theme.css K1: the kit's Button, CopyButton, InputGroup.Button and Collapsible trigger take the surface's font, ink and transition inside `.ns-theme` (`@layer utilities`).\n")
    f.write("- ns-theme.css K2: the kit Input's placeholder in the subtle ink inside `.ns-theme`.\n")
    f.write("- ns-theme.css K3: every button in an `.ns-pop` popover 44px tall on a phone.\n")
    f.write("- eslint.config.mjs: `shadcn/no-restyle` allows `layout` and the HOUSE classes (num, touch-hit, pointer-hit, mark-line, focus-inset, press-tint) on every kit part, and a wide allow-list on the kit triggers and paneforge's Pane.\n")
