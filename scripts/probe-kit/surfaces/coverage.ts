/**
 * The catalogue's coverage of the Tailwind cutover: every `.svelte` file
 * under `apps/dashboard/src` the cutover changed, and whether a catalogue
 * entry draws it.
 *
 *   bun scripts/probe-kit/surfaces/coverage.ts            every entry, walked afresh
 *   bun scripts/probe-kit/surfaces/coverage.ts <entry>…   those entries walked again, the rest as last read
 *
 * The files are what changed between main's merge-base with the cutover and
 * this head (`git diff --name-only $(git merge-base origin/main HEAD)..HEAD
 * -- 'apps/dashboard/src/**\/*.svelte'`), less any the cutover deleted (a
 * file gone draws nothing; each is said as `gone:`).
 *
 * What an entry draws is read off the page itself, never inferred from a
 * name: each entry is walked as capture.ts walks it (walk.ts, the hub
 * tapes, its act, its ready assertion held), on the dev server, where Svelte
 * tags every element it writes with `__svelte_meta`. Every element under the
 * entry's root names the file it is written in (`loc.file`) and, up its
 * `parent` chain, every file whose block or component tag led to it (svelte
 * dev `add_svelte_meta`), so a component whose template is only other
 * components counts as drawn too; so does every element of a frame standing
 * in the root, read in the frame's own document. Read at 1440 and 390
 * (light: a theme moves no markup), as the entry's `widths` allow.
 *
 * Each entry's files are kept in `$TMPDIR/coverage/drawn.json`;
 * a run that names entries walks those again and keeps the others' (an
 * entry the catalogue no longer holds is dropped). A pass that does not hold
 * its entry's ready assertion counts nothing, is said as `not ready:`, and
 * leaves its outline beside the file (ready.ts `outline`).
 *
 * It prints `uncovered: <file>` for each file no entry draws,
 * `unreachable: <file> <why>` for each one no page the kit can drive draws
 * ({@link UNREACHABLE}), and `coverage: <n> of <m>`, `m` the files the kit
 * can draw. It exits 1 while any file is uncovered or any pass not ready.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { entrySlug, ROOT, Run, type Spec } from "../kit";
import { type State, SURFACES, type Surface } from "./catalogue";
import { outline } from "./ready";
import { PASSES, walkTapes } from "./walk";

/**
 * The changed files no page the kit can drive draws, each with why: kit
 * parts nothing in the dashboard imports (by every name their folder's
 * index exports them under), one only a states file draws, and the
 * select's scroll buttons, which its content never gives room to show. Every other
 * changed file is drawn by an entry, or listed `uncovered:`.
 */
const UNREACHABLE: Record<string, string> = {
  ...Object.fromEntries(
    [
      "alert-dialog/alert-dialog-description",
      "alert-dialog/alert-dialog-media",
      "card/card-action",
      "card/card-description",
      "command/command-dialog",
      "command/command-link-item",
      "command/command-separator",
      "command/command-shortcut",
      "context-menu/context-menu-checkbox-item",
      "context-menu/context-menu-group-heading",
      "context-menu/context-menu-label",
      "field/field-content",
      "field/field-description",
      "field/field-separator",
      "field/field",
      "input-group/input-group-text",
      "kbd/kbd-group",
      "popover/popover-description",
      "popover/popover-header",
      "select/select-group-heading",
      "select/select-group",
      "select/select-label",
      "select/select-separator",
      "sheet/sheet-description",
      "sidebar/sidebar-menu-sub",
      "table/table-caption",
      "table/table-footer",
    ].map((part) => [
      `apps/dashboard/src/lib/components/ui/${part}.svelte`,
      "no page draws it: nothing in the dashboard imports it under any name its kit folder exports it by",
    ])
  ),
  ...Object.fromEntries(
    ["select-scroll-up-button", "select-scroll-down-button"].map((part) => [
      `apps/dashboard/src/lib/components/ui/select/${part}.svelte`,
      "no page draws it: the kit's select content takes no max height (select-content.svelte), so its list never scrolls; usage-project-pick-many's 44 options stand 1422px tall in a 900px viewport",
    ])
  ),
  "apps/dashboard/src/lib/components/ui/bar-glass/bar-glass-frame.svelte":
    "no page draws it: only its states file (bar-glass.stories.ts) imports it, for the component canvas",
};

/** Six surfaces walked at once (walk.ts `PROBE_SURFACES`), unless the run says otherwise. */
process.env.PROBE_SURFACES ??= "6";
/** What the walk builds itself, built to name its files (walk.ts `svelteDev`). */
process.env.PROBE_SVELTE_DEV = "1";
const named = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

/** Every entry the catalogue holds, by its name. */
const ENTRIES = new Map<string, { state: State; surface: Surface }>(
  SURFACES.flatMap((surface) =>
    surface.states.map(
      (state) => [`${surface.name}-${state.name}`, { surface, state }] as const
    )
  )
);
const unknown = named.filter((name) => !ENTRIES.has(name));
if (unknown.length > 0) {
  console.log(
    `no such entry: ${unknown.join(", ")} (an entry is <surface>-<state>, as capture.ts names it)`
  );
  process.exit(2);
}
const wanted = new Set(named.length > 0 ? named : ENTRIES.keys());
/** The surfaces walked, each with only the states named, every one on the dev server. */
const surfaces: Surface[] = SURFACES.map((surface) => ({
  ...surface,
  serve: "dev" as const,
  states: surface.states.filter((state) =>
    wanted.has(`${surface.name}-${state.name}`)
  ),
})).filter((surface) => surface.states.length > 0);

/** 1440 and 390, light. */
const READ = PASSES.filter(
  (pass) =>
    !pass.reduced &&
    pass.theme === "light" &&
    (pass.width === "desk" || pass.width === "phone")
);

/** Beside the kit's own output, which each run of a spec clears (kit.ts `spec`): what earlier runs read is kept here. */
const OUT = join(process.env.TMPDIR ?? join(ROOT, ".probe"), "coverage");
const DRAWN = join(OUT, "drawn.json");
/** A `__svelte_meta` file's leading `./` or `/`. */
const LEADING_DOT = /^\.?\//;

/** What the kept file holds: each entry's drawn files, and why a pass of it was not ready. */
type Drawn = Record<string, { failed?: string; files: string[] }>;

/** `git` in the repository, its output. */
const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** The `.svelte` files the cutover changed, and those of them it deleted. */
function changed(): { gone: string[]; live: string[] } {
  const base = git(["merge-base", "origin/main", "HEAD"]).trim();
  const all = git([
    "diff",
    "--name-only",
    `${base}..HEAD`,
    "--",
    "apps/dashboard/src/**/*.svelte",
  ])
    .split("\n")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return {
    live: all.filter((file) => existsSync(join(ROOT, file))),
    gone: all.filter((file) => !existsSync(join(ROOT, file))),
  };
}

/**
 * In the page: every file an element under `root` (each match, else the
 * body) is written in, and every file up its `__svelte_meta` parent chain.
 * Into shadow roots; not past a box that skips its content
 * (`content-visibility: hidden`), which draws none of it.
 */
function drawnUnder(root: string): string[] {
  interface Stack {
    file?: string;
    parent?: Stack | null;
  }
  const files = new Set<string>();
  const visit = (el: Element) => {
    const meta = (
      el as unknown as {
        __svelte_meta?: { loc?: { file?: string }; parent?: Stack | null };
      }
    ).__svelte_meta;
    if (meta?.loc?.file) {
      files.add(meta.loc.file);
    }
    for (let at = meta?.parent; at; at = at.parent) {
      if (at.file) {
        files.add(at.file);
      }
    }
    if (getComputedStyle(el).contentVisibility === "hidden") {
      return;
    }
    for (const kid of [
      ...el.children,
      ...(el.shadowRoot ? [...el.shadowRoot.children] : []),
    ]) {
      visit(kid);
    }
  };
  const tops = [...document.querySelectorAll(root)];
  for (const top of tops.length > 0 ? tops : [document.body]) {
    visit(top);
  }
  return [...files];
}

/** In the page: whether frame element `el` stands visible inside a match of `root`. */
function standsIn(el: Element, root: string): boolean {
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    el.checkVisibility({ visibilityProperty: true }) &&
    [...document.querySelectorAll(root)].some((top) => top.contains(el))
  );
}

/** A `__svelte_meta` file, repo-relative. */
const repoPath = (file: string): string =>
  file.includes("apps/dashboard/")
    ? file.slice(file.indexOf("apps/dashboard/"))
    : `apps/dashboard/${file.replace(LEADING_DOT, "")}`;

const read = new Map<string, Set<string>>();
const failed = new Map<string, string>();

const spec: Spec = {
  name: "coverage",
  async run(kit) {
    await walkTapes(
      kit,
      surfaces,
      READ,
      async ({ page, state, surface }) => {
        const entry = `${surface.name}-${state.name}`;
        const files = read.get(entry) ?? new Set<string>();
        for (const file of await page.evaluate(drawnUnder, state.root)) {
          files.add(repoPath(file));
        }
        // What the frames standing in its root draw (a decision page's
        // host, a canvas), each read in its own document.
        for (const frame of page.frames().slice(1)) {
          // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
          const shown = await frame
            .frameElement()
            .then((el) => el.evaluate(standsIn, state.root))
            .catch(() => false);
          if (shown) {
            for (const file of await frame
              .evaluate(drawnUnder, "body")
              .catch(() => [] as string[])) {
              files.add(repoPath(file));
            }
          }
        }
        read.set(entry, files);
      },
      async (what, why, page) => {
        // `<surface>/<state> · <width> <theme>`
        const [at, pass] = what.split(" · ");
        const entry = (at ?? "").replace("/", "-");
        failed.set(entry, `${what}: ${why}`);
        // What stood instead, for reading (ready.ts `outline`).
        const file = join(OUT, `${entrySlug(`${entry} ${pass}`)}.outline.txt`);
        await page
          .evaluate(outline)
          .then((text) => writeFile(file, text))
          .catch(() => undefined);
      }
    );
  },
};

const run = new Run();
try {
  await run.spec(spec, null);
} finally {
  await run.close();
}

await mkdir(OUT, { recursive: true });
const kept: Drawn =
  named.length > 0 && existsSync(DRAWN)
    ? (JSON.parse(await readFile(DRAWN, "utf8")) as Drawn)
    : {};
for (const entry of wanted) {
  const why = failed.get(entry);
  kept[entry] = {
    files: [...(read.get(entry) ?? [])].sort(),
    ...(why ? { failed: why } : {}),
  };
}
// An entry the catalogue no longer holds draws nothing now.
for (const entry of Object.keys(kept)) {
  if (!ENTRIES.has(entry)) {
    delete kept[entry];
  }
}
await writeFile(DRAWN, `${JSON.stringify(kept, null, 2)}\n`);

const by = new Map<string, string[]>();
for (const [entry, drawn] of Object.entries(kept).sort()) {
  if (drawn.failed) {
    console.log(`not ready: ${drawn.failed}`);
  }
  for (const file of drawn.files) {
    by.set(file, [...(by.get(file) ?? []), entry]);
  }
}
const { gone, live } = changed();
for (const file of gone) {
  console.log(`gone: ${file}`);
}
const reachable = live.filter((file) => !(file in UNREACHABLE));
for (const file of live.filter((f) => f in UNREACHABLE)) {
  console.log(`unreachable: ${file} ${UNREACHABLE[file]}`);
}
const uncovered = reachable.filter((file) => !by.has(file));
for (const file of uncovered) {
  console.log(`uncovered: ${file}`);
}
console.log(`each entry's files: ${DRAWN}`);
console.log(`coverage: ${reachable.length - uncovered.length} of ${reachable.length}`);
const notReady = Object.values(kept).filter((drawn) => drawn.failed).length;
process.exit(uncovered.length === 0 && notReady === 0 ? 0 : 1);
