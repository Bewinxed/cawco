/**
 * Triage of a style-snapshot compare: every difference between two sets of
 * snapshots, grouped by what changed (`<property> · <before> → <after>`),
 * each group with its count, where it lands (surface/state) and the
 * `.svelte` files that write the element it lands on.
 *
 *   bun scripts/probe-kit/snapshot-triage.ts --before=<dir> --after=<dir> [--ground=<dir>] [--files=<attribution.json>] [--surfaces=a,b] [--out=<file>]
 *
 * Each `<dir>` is a `PROBE_BASELINES` root: it holds `style-snapshot/<surface>.json.gz`,
 * as `run.ts style-snapshot --approve` writes it under `PROBE_BASELINES=<dir>`.
 * `--out` gets every group whole; the console gets each group's first lines.
 *
 * ## Which file an element is
 *
 * `--files` takes what `run.ts snapshot-attribution --surfaces=<s> --out=<file>`
 * wrote on the tree the `--after` snapshots came from: each element, keyed as
 * the snapshot keys it, with the file that wrote it and the components above
 * it. An element is named by its file, and a kit part's (`components/ui/`)
 * also by the nearest file outside the kit that drew it:
 * `lib/components/ui/table/table-cell.svelte ← lib/cawco/tasks/TaskTable.svelte`.
 *
 * Without `--files`, or for an element the attribution doesn't hold, the
 * element is named by its `data-slot`: the script reads every
 * `data-slot="…"` literal under the dashboard's src, and an element takes the
 * files writing its own slot, or else its nearest slotted ancestor's, marked
 * `(by slot)`. A slot more than one file writes lists them all.
 *
 * ## The hybrid: what one set of files changes
 *
 * To see exactly what converting a set of files changed, against a base of
 * record (a commit whose dashboard is the look to keep):
 *
 *   1. Snapshot the base of record into a scratch root:
 *        git worktree add --detach $TMPDIR/base <base>
 *        (cd $TMPDIR/base && bun install && rm -rf scripts/probe-kit && cp -r <this tree>/scripts/probe-kit scripts/)
 *        (cd $TMPDIR/base && PROBE_BASELINES=$TMPDIR/bl bun scripts/probe-kit/run.ts style-snapshot --surfaces=<s> --approve)
 *      The base takes this tree's probe kit, so both sides read the same
 *      surfaces from the same hub tape. Snapshot it twice into two roots and
 *      compare them first: a difference between two runs of one tree is the
 *      walk's, never the cutover's.
 *   2. The hybrid: this tree with only the set restored to the base:
 *        git worktree add --detach $TMPDIR/hyb HEAD
 *        (cd $TMPDIR/hyb && for f in <files>; do git show <base>:$f > $f; done && bun install)
 *        (cd $TMPDIR/hyb && PROBE_BASELINES=$TMPDIR/bl-hyb bun scripts/probe-kit/run.ts style-snapshot --surfaces=<s> --approve)
 *   3. This tree, and its elements' files (the hybrid's too, for step 4's second line):
 *        PROBE_BASELINES=$TMPDIR/bl-now bun scripts/probe-kit/run.ts style-snapshot --surfaces=<s> --approve
 *        bun scripts/probe-kit/run.ts snapshot-attribution --surfaces=<s> --out=$TMPDIR/files-now.json
 *        (cd $TMPDIR/hyb && bun scripts/probe-kit/run.ts snapshot-attribution --surfaces=<s> --out=$TMPDIR/files-hyb.json)
 *   4. What the set changed, and what everything else changed:
 *        bun scripts/probe-kit/snapshot-triage.ts --before=$TMPDIR/bl-hyb --after=$TMPDIR/bl-now --ground=$TMPDIR/bl --files=$TMPDIR/files-now.json
 *        bun scripts/probe-kit/snapshot-triage.ts --before=$TMPDIR/bl --after=$TMPDIR/bl-hyb --files=$TMPDIR/files-hyb.json
 *      `--ground` keeps only the differences that also differ from the base
 *      to this tree, to the same value now. A restored file can disagree with
 *      today's neighbours (a selector into a child that no longer has that
 *      class), and what that alone produces is the hybrid's, not the set's.
 *   5. `git worktree remove --force` both, then `git worktree prune`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { differences, loadSnapshot, type Snapshot } from "./surfaces/snapshot";

const ROOT = join(import.meta.dir, "..", "..");
const SRC = join(ROOT, "apps", "dashboard", "src");
const SURFACES = ["board", "project", "views", "task"];
const SHOWN = 6;
const SLOT_LITERAL = /data-slot="([a-z0-9-]+)"/g;
const LABEL = / \[([^\]]+)\]$/;
const KIT_PART = "lib/components/ui/";
const DARK = / dark/;

/** A `__svelte_meta` file, from the dashboard's src (it may come absolute or `src/`-relative). */
const fromSrc = (file: string) => {
  const at = file.lastIndexOf("src/");
  return at === -1 ? file : file.slice(at + 4);
};

/** An element's own file; a kit part's also the nearest file outside the kit that drew it. */
function fileLabel(chain: string[]): string {
  const files = chain.map(fromSrc);
  const own = files[0] as string;
  if (!own.startsWith(KIT_PART)) {
    return own;
  }
  const drawnBy = files.find((f) => !f.startsWith(KIT_PART));
  return drawnBy ? `${own} ← ${drawnBy}` : own;
}

type Attribution = Record<string, Record<string, Record<string, string[]>>>;

const flag = (name: string): string | undefined =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

/** Every `data-slot` literal under the dashboard's src, by the files that write it. */
function slotIndex(): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  const walkDir = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walkDir(path);
      } else if (entry.endsWith(".svelte")) {
        for (const match of readFileSync(path, "utf8").matchAll(SLOT_LITERAL)) {
          const slot = match[1] as string;
          const files = index.get(slot) ?? new Set<string>();
          files.add(relative(SRC, path));
          index.set(slot, files);
        }
      }
    }
  };
  walkDir(SRC);
  return new Map([...index].map(([slot, files]) => [slot, [...files].sort()]));
}

/** Each read's element keys (`name` → key → its `data-slot`), as `differences` keys them. */
function slotsOf(snap: Snapshot): Map<string, Map<string, string | null>> {
  const out = new Map<string, Map<string, string | null>>();
  for (const [name, read] of Object.entries(snap.reads)) {
    const keys: string[] = [];
    const slots = new Map<string, string | null>();
    for (const [i, row] of (read.rows ?? []).entries()) {
      const parent = row[0] as number;
      const key =
        parent < 0 ? (row[1] as string) : `${keys[parent]} > ${row[1]}`;
      keys[i] = key;
      slots.set(key, (row[8] as string | null) ?? null);
    }
    out.set(name, slots);
  }
  return out;
}

/** The slot an element is attributed by: its own, or its nearest slotted ancestor's. */
function slotFor(
  slots: Map<string, string | null> | undefined,
  key: string
): string | null {
  let at = key;
  while (slots && at) {
    const slot = slots.get(at);
    if (slot) {
      return slot;
    }
    const cut = at.lastIndexOf(" > ");
    at = cut === -1 ? "" : at.slice(0, cut);
  }
  return null;
}

interface Group {
  count: number;
  files: Map<string, number>;
  samples: string[];
  where: Set<string>;
}

const before = flag("before");
const after = flag("after");
if (!(before && after)) {
  console.error(
    "usage: bun scripts/probe-kit/snapshot-triage.ts --before=<dir> --after=<dir> [--ground=<dir>] [--files=<attribution.json>] [--surfaces=a,b] [--out=<file>]"
  );
  process.exit(2);
}
const ground = flag("ground");
const filesFlag = flag("files");
const attribution: Attribution = filesFlag
  ? JSON.parse(readFileSync(filesFlag, "utf8"))
  : {};
const surfaces = flag("surfaces")?.split(",") ?? SURFACES;
const index = slotIndex();
const load = (dir: string, surface: string) =>
  loadSnapshot(join(dir, "style-snapshot", `${surface}.json.gz`));
/** A difference line's place: read name, element key and what (`<state> · <pass> · <key> · <what>`). */
const placeOf = (line: string) => line.split(" · ").slice(0, 4).join(" · ");
const nowOf = (line: string) => line.slice(line.lastIndexOf(" → ") + 3);

const groups = new Map<string, Group>();
let total = 0;
for (const surface of surfaces) {
  // biome-ignore lint/performance/noAwaitInLoops: one surface's snapshots in memory at a time
  const [a, b] = await Promise.all([
    load(before, surface),
    load(after, surface),
  ]);
  let lines = differences(a, b);
  if (ground) {
    const kept = new Map(
      differences(await load(ground, surface), b).map((l) => [
        placeOf(l),
        nowOf(l),
      ])
    );
    lines = lines.filter((l) => kept.get(placeOf(l)) === nowOf(l));
  }
  const slots = slotsOf(b);
  const slotsBefore = slotsOf(a);
  for (const line of lines) {
    const [state, pass, keyLabel = "", what = "", ...rest] = line.split(" · ");
    const change = `${what} · ${rest.join(" · ")}`;
    const key = keyLabel.replace(LABEL, "");
    const name = `${state} · ${pass}`;
    // A theme changes no element: a dark pass's element is its light twin's.
    const chain =
      attribution[surface]?.[
        `${state} · ${(pass ?? "").replace(DARK, " light")}`
      ]?.[key];
    let label: string;
    if (chain && chain.length > 0) {
      label = fileLabel(chain);
    } else {
      const slot =
        slotFor(slots.get(name), key) ?? slotFor(slotsBefore.get(name), key);
      const files = slot
        ? (index.get(slot) ?? [`(no file writes "${slot}")`])
        : ["(no slot above it)"];
      label = `${files.join(" | ")}${slot ? ` [${slot}]` : ""} (by slot)`;
    }
    const group: Group = groups.get(change) ?? {
      count: 0,
      files: new Map(),
      samples: [],
      where: new Set(),
    };
    group.count += 1;
    group.files.set(label, (group.files.get(label) ?? 0) + 1);
    group.where.add(`${surface}/${state}`);
    if (group.samples.length < 2) {
      group.samples.push(`${surface}/${line}`);
    }
    groups.set(change, group);
    total += 1;
  }
}

const sorted = [...groups].sort((x, y) => y[1].count - x[1].count);
const render = (whole: boolean) =>
  sorted.flatMap(([change, g]) => {
    const files = [...g.files].sort((x, y) => y[1] - x[1]);
    return [
      `${String(g.count).padStart(6)}  ${change}`,
      `        in ${[...g.where].sort().join(", ")}`,
      ...(whole ? files : files.slice(0, SHOWN)).map(
        ([file, n]) => `        ${String(n).padStart(5)}  ${file}`
      ),
      ...(!whole && files.length > SHOWN
        ? [`        … ${files.length - SHOWN} more files`]
        : []),
      ...(whole ? g.samples.map((s) => `        e.g. ${s}`) : []),
    ];
  });
const head = `${total} differences in ${groups.size} groups (${before} → ${after}${ground ? `, kept where ${ground} → ${after} agrees` : ""})`;
const out = flag("out");
if (out) {
  await Bun.write(out, `${[head, ...render(true)].join("\n")}\n`);
}
console.log([head, ...render(false)].join("\n"));
