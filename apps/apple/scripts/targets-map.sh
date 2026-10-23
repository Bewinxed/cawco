#!/usr/bin/env bash
# Writes the map of which files feed which part of the app,
# apps/apple/targets.json: each Swift target the app builds (CawCoKit's
# package targets, from `swift package describe --type json`, and the app
# targets project.yml declares, from `xcodegen dump --type json`), with its
# source and resource folders and the targets it depends on, deps first. An
# app target depends on the package products and targets project.yml gives
# it and on every package module its sources import. `wholeApp` lists the
# files every build reads (Package.swift, Package.resolved, project.yml and
# the map itself): a change to one builds every target.
#
# The landing gate reads only this map (packages/hub app-targets.ts): a file
# belongs to the target whose folder holds it, and the gate builds the
# targets the work changed plus every target that depends on them
# (build-both.sh --targets). A file no target holds (README, scripts/,
# StoreKit/) builds nothing.
#
#   bash apps/apple/scripts/targets-map.sh            # prints the map
#   bash apps/apple/scripts/targets-map.sh --write    # writes apps/apple/targets.json
#   bash apps/apple/scripts/targets-map.sh --check    # exits 1 naming the difference from the committed map
#
# Run on the Mac (Swift and XcodeGen). The gate's build runs --check on
# every tree it compiles, so a map Package.swift or project.yml no longer
# matches fails the gate. Paths are written from the repository's root and
# folders only, never files: a new Swift file changes no map.
set -euo pipefail

APPLE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MODE=${1:-}
case $MODE in
  '' | --write | --check) ;;
  *) echo "usage: targets-map.sh [--write|--check]" >&2; exit 2 ;;
esac
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/targets-map.XXXXXX")
trap 'rm -rf "$SCRATCH"' EXIT
XCODEGEN=$(command -v xcodegen || echo /opt/homebrew/bin/xcodegen)
(cd "$APPLE" && "$XCODEGEN" dump --type json --file "$SCRATCH/project.json")

# Each local package project.yml names (`packages: <name>: path:`), described.
PACKAGES=()
while IFS=$'\t' read -r name path; do
  [[ -n $name ]] || continue
  # Its state in the scratch folder, not the tree or ~ (a gate workspace's
  # boundary writes neither), and no manifest sandbox inside that boundary.
  (cd "$APPLE/$path" && swift package --scratch-path "$SCRATCH/swiftpm-$name" \
    --cache-path "$SCRATCH/swiftpm-cache" --config-path "$SCRATCH/swiftpm-config" \
    --security-path "$SCRATCH/swiftpm-security" --disable-sandbox \
    describe --type json) >"$SCRATCH/package-$name.json"
  PACKAGES+=("$name" "$path" "$SCRATCH/package-$name.json")
done < <(/usr/bin/python3 -I -c '
import json, sys
for name, package in sorted((json.load(open(sys.argv[1])).get("packages") or {}).items()):
    if isinstance(package, dict) and package.get("path"):
        print(name + "\t" + package["path"])
' "$SCRATCH/project.json")

/usr/bin/python3 -I - "$APPLE" "$SCRATCH/project.json" ${PACKAGES[@]+"${PACKAGES[@]}"} >"$SCRATCH/targets.json" <<'PY'
import json, os, re, sys

apple, project_file, *rest = sys.argv[1:]
# This script sits in apps/apple/scripts; the gate's build root holds no .git.
REPO = "apps/apple"
project = json.load(open(project_file))
targets = {}
modules = {}  # module (c99) name -> target name
products = {}  # (package, product) -> target names
whole = {f"{REPO}/project.yml", f"{REPO}/Package.resolved", f"{REPO}/targets.json"}


def repo_path(*parts):
    return os.path.normpath(os.path.join(REPO, *parts))


for at in range(0, len(rest), 3):
    package_name, package_path, described = rest[at : at + 3]
    package = json.load(open(described))
    whole.add(repo_path(package_path, "Package.swift"))
    for product in package.get("products") or []:
        products[(package_name, product["name"])] = product["targets"]
    for target in package["targets"]:
        if target["type"] in ("test", "plugin", "snippet"):
            continue
        root = os.path.join(package["path"], target["path"])
        resources = sorted(
            {
                os.path.relpath(resource["path"], root).split(os.sep)[0]
                for resource in target.get("resources") or []
            }
        )
        targets[target["name"]] = {
            "name": target["name"],
            "kind": "package",
            "sources": [repo_path(package_path, target["path"])],
            "resources": [repo_path(package_path, target["path"], each) for each in resources],
            "dependencies": sorted(set(target.get("target_dependencies") or [])),
        }
        modules[target.get("c99name") or target["name"]] = target["name"]


def source_paths(sources):
    listed = sources if isinstance(sources, list) else [sources]
    return [each if isinstance(each, str) else each["path"] for each in listed or []]


IMPORT = re.compile(r"^\s*(?:@[\w()., ]+\s+)*import\s+(?:(?:struct|class|enum|protocol|func|var|let|typealias)\s+)?(\w+)", re.M)

for name, target in (project.get("targets") or {}).items():
    sources = source_paths(target.get("sources"))
    dependencies = set()
    for dependency in target.get("dependencies") or []:
        if "target" in dependency:
            dependencies.add(dependency["target"])
        elif "package" in dependency:
            package = dependency["package"]
            named = dependency.get("products") or [dependency.get("product") or package]
            for product in named:
                dependencies.update(products.get((package, product), []))
    for source in sources:
        for folder, _, files in os.walk(os.path.join(apple, source)):
            for file in files:
                if file.endswith(".swift"):
                    text = open(os.path.join(folder, file), encoding="utf-8").read()
                    dependencies.update(modules[each] for each in IMPORT.findall(text) if each in modules)
    targets[name] = {
        "name": name,
        "kind": "app",
        "sources": [repo_path(each) for each in sources],
        "resources": [],
        "dependencies": sorted(dependencies - {name}),
    }

unknown = sorted({each for target in targets.values() for each in target["dependencies"] if each not in targets})
if unknown:
    sys.exit(f"targets-map.sh: dependencies on targets neither the packages nor project.yml declare: {', '.join(unknown)}")

# Deps first; among targets ready together, packages before apps, then by name.
ordered, placed = [], set()
while len(ordered) < len(targets):
    ready = sorted(
        (each for each in targets.values() if each["name"] not in placed and set(each["dependencies"]) <= placed),
        key=lambda each: (each["kind"] != "package", each["name"]),
    )
    if not ready:
        sys.exit("targets-map.sh: the targets depend on each other in a cycle")
    ordered.append(ready[0])
    placed.add(ready[0]["name"])

print(json.dumps({"wholeApp": sorted(whole), "targets": ordered}, indent=2))
PY

case $MODE in
  '') cat "$SCRATCH/targets.json" ;;
  --write)
    cp "$SCRATCH/targets.json" "$APPLE/targets.json"
    echo "WROTE apps/apple/targets.json: review its diff and commit it"
    ;;
  --check)
    if ! diff -u "$APPLE/targets.json" "$SCRATCH/targets.json"; then
      echo "FAILED: apps/apple/targets.json is not the map Package.swift and project.yml make (diff above, committed first). Run bash apps/apple/scripts/targets-map.sh --write on the Mac and commit it."
      exit 1
    fi
    echo "MAP apps/apple/targets.json matches Package.swift and project.yml"
    ;;
esac
