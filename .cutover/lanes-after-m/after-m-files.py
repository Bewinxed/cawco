"""The dashboard files main's commits after M changed, each with what of the
cutover's subject they added: a scoped <style> rule, a Tailwind class with a
raw value, a state written as a class, an `!` override, an inline style with a
literal value. One TSV line per file:

  path  flags  added-lines  conflicted

  python3 -I after-m-files.py <repo> <M> <main> <conflicted.txt>

`conflicted` is 1 when the merge's hunk in that file conflicted and took
main's lines (the list from `git merge-tree --name-only`).
"""

import re
import subprocess
import sys

repo, base, head, conflicted_path = sys.argv[1:5]
conflicted = {line.strip() for line in open(conflicted_path) if line.strip()}


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", repo, *args], capture_output=True, text=True, check=True
    ).stdout


files = [
    f
    for f in git(
        "diff", "--name-only", "--diff-filter=AM", base, head, "--", "apps/dashboard/src"
    ).splitlines()
    if f.endswith((".svelte", ".css", ".ts", ".js"))
    and "/tokens/" not in f
    and not f.endswith((".d.ts",))
]

HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")
RAW = re.compile(r"(?<![\w-])[a-z][a-z0-9-]*-\[[^\]\s\"'`]+\]|(?<![\w-])\[[a-z-]+:[^\]\s]+\]")
STATE_DIRECTIVE = re.compile(r"\bclass:[\w-]+")
STATE_LIST = re.compile(r"&&\s*[\"'`][\w -]+[\"'`]|\?\s*[\"'`][\w -]+[\"'`]\s*:\s*[\"'`]")
CLASS_LIST_API = re.compile(r"classList\.(add|remove|toggle)\(")
BANG = re.compile(r"(?:^|[\s\"'`{])![a-z][\w:-]*|[a-z0-9\]\)]!(?=[\s\"'`]|$)|!important")
INLINE = re.compile(r"\bstyle(?::[\w-]+)?=")
UTILITY = re.compile(
    r"(?<![\w:-])(?:[a-z-]+:)*!?-?(?:flex|grid|inline|block|hidden|contents|items|justify|content|self|place|gap|space|p[xytrblse]?|m[xytrblse]?|w|h|size|min|max|text|font|leading|tracking|bg|border|rounded|shadow|opacity|overflow|truncate|whitespace|break|line-clamp|absolute|relative|fixed|sticky|inset|top|right|bottom|left|z|shrink|grow|basis|order|col|row|cursor|select|pointer-events|transition|duration|ease|delay|animate|ring|outline|fill|stroke|underline|italic|uppercase|lowercase|capitalize|tabular-nums|sr-only|aspect|object|scale|rotate|translate|origin|backdrop|blur|divide|decoration|list|align|isolate|mix-blend|will-change|appearance|resize|scroll|snap|touch|visible|invisible|tw)(?:-[\w./\[\]()%#:,-]+)?!?(?![\w-])"
)
CLASS_VALUE = re.compile(r"class=\"([^\"]*)\"|class=\{([^}]*)\}")
LITERAL = re.compile(r"\d+(?:\.\d+)?(px|rem|em|%|ms|s)\b|#[0-9a-f]{3,8}\b|oklch\(|rgba?\(|\bopacity\b|\b0?\.\d+\b", re.I)
CLASS_CONTEXT = re.compile(r"class(?:Name)?=|class:|\bclass\b|tv\(|cn\(|clsx\(|[\"'`][^\"'`]*\b(?:flex|grid|px-|py-|text-|bg-|border|rounded|w-|h-|gap-)")

for path in files:
    diff = git("diff", "-U0", base, head, "--", path)
    post = git("show", f"{head}:{path}").splitlines()
    styled = set()
    if path.endswith(".svelte"):
        inside = False
        for number, line in enumerate(post, 1):
            if re.match(r"\s*<style\b", line):
                inside = True
            elif re.match(r"\s*</style>", line):
                inside = False
            elif inside:
                styled.add(number)
    flags = set()
    added = 0
    at = 0
    for line in diff.splitlines():
        hunk = HUNK.match(line)
        if hunk:
            at = int(hunk.group(1))
            continue
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            text = line[1:]
            stripped = text.strip()
            added += 1
            if stripped and not stripped.startswith(("//", "/*", "*", "<!--")):
                if path.endswith(".css"):
                    flags.add("css")
                    if "!important" in text:
                        flags.add("bang")
                elif at in styled:
                    flags.add("style")
                    if "!important" in text:
                        flags.add("bang")
                else:
                    in_class = bool(CLASS_CONTEXT.search(text))
                    if in_class and RAW.search(text):
                        flags.add("raw")
                    if STATE_DIRECTIVE.search(text) or CLASS_LIST_API.search(text) or (
                        in_class and STATE_LIST.search(text)
                    ):
                        flags.add("state")
                    if in_class and BANG.search(text):
                        flags.add("bang")
                    if INLINE.search(text):
                        flags.add("inline")
                    # A class list split over lines (`class={[…]}`, `cn(…)`):
                    # a quoted string of two or more utilities.
                    for quoted in re.findall(r"[\"'`]([^\"'`]{3,})[\"'`]", text):
                        if len(UTILITY.findall(quoted)) >= 2 and len(UTILITY.findall(quoted)) == len(quoted.split()):
                            flags.add("tw")
                    for match in CLASS_VALUE.finditer(text):
                        value = match.group(1) or match.group(2) or ""
                        if UTILITY.search(value):
                            flags.add("tw")
                        # A name of the file's own (a scoped class from M's
                        # <style>, which the converted file no longer has).
                        if match.group(1) and any(
                            not UTILITY.fullmatch(token) and "{" not in token
                            for token in match.group(1).split()
                        ):
                            flags.add("cls")
            at += 1
    print(
        f"{path}\t{','.join(sorted(flags)) or '-'}\t{added}\t{1 if path in conflicted else 0}"
    )
