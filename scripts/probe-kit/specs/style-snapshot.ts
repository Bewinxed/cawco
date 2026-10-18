/**
 * The style snapshot: what every surface of the dashboard looks like to the
 * engine, element by element, held to the approved one. Nothing the owner
 * sees changes when this passes: every element's computed style, its box,
 * its `::before`/`::after`, its look under `:hover` and `:focus-visible`,
 * and where it spills or stands outside what holds it, at each pass (desk
 * 1440, tablet 820 and phone 390, the last two by touch, each light and
 * dark; and the desk once with reduced motion), are what the baseline says.
 *
 *   bun scripts/probe-kit/run.ts style-snapshot [--surfaces=a,b]              against the baselines
 *   bun scripts/probe-kit/run.ts style-snapshot [--surfaces=a,b] --approve    writes them
 *   bun scripts/probe-kit/run.ts style-snapshot --coverage                    the coverage map
 *   bun scripts/probe-kit/run.ts style-snapshot --coverage --styled-at=<rev>  of the files styled at <rev>
 *   bun scripts/probe-kit/run.ts style-snapshot --record                      the hub tape, again
 *   bun scripts/probe-kit/run.ts style-snapshot --record --without-delegate   in a workspace: no delegate,
 *                                                                             its states left out with a NOTE
 *   bun scripts/probe-kit/run.ts style-snapshot --record --tape=sheet         the sheet's tape, on a host:
 *                                                                             its surfaces alone, nothing else
 *
 *   bun scripts/probe-kit/run.ts style-snapshot [--surfaces=a,b] --twice      the tree against itself: two
 *                                                                             walks in one run, no baselines
 *
 * `PASS style-snapshot: 0 differences` or one `FAIL` line per difference:
 * `<surface>/<state> · <width> <theme>[ reduced] · <element key> [<data-slot>] · <property> · <before> → <after>`,
 * the first 400 of each surface printed and every one written to
 * `$TMPDIR/probe-kit/style-snapshot/differences.jsonl` (a line each:
 * surface, state, pass, element, property, before, after), counted in
 * `differences-summary.txt` beside it. `--twice` holds the same tree on the
 * same tape to itself: anything it finds is noise, never a change.
 * An element's key is its DOM path from the surface's root (`tag:n`, its
 * place among its siblings of that tag), the same whatever its classes.
 *
 * The fleet it reads is the hub tape (`fixtures/style-snapshot/hub-tape.json.gz`,
 * hub-tape.ts): a scratch fleet's hub recorded once (`--record`, surfaces/scene.ts)
 * and played back, with the page's clock held at the recording's moment, so
 * two runs read the same and no fleet stands up. A state that reads a hub
 * state the scene moves the fleet into later (scene.ts `VARIANTS`) is read
 * against that state's own section of the tape, on a dashboard of its own.
 * A sheet surface (catalogue `tape`) reads a tape of its own,
 * `hub-tape-sheet.json.gz`: a delegate's sheet, which only a host records,
 * apart from the scene so a failed one is recorded again alone.
 * The dashboard is the built one (`vite build`); the `/motion/` benches,
 * which a build 404s, are read on the dev server against the same tape. No
 * fleet, so it runs in any workspace as an ordinary check.
 *
 * The baselines are `baselines/style-snapshot/<surface>.json.gz`, one per
 * surface, written by `--approve` (surfaces/snapshot.ts holds the format).
 * The surfaces and their states are surfaces/catalogue.ts.
 *
 * `--coverage` reads every surface on the dev server (desk, light), where
 * each element names the `.svelte` file it is written in
 * (`__svelte_meta.loc.file`), and writes which surfaces render each file
 * with a `<style>` (`style-snapshot-coverage.json`), then lists the files
 * no surface renders. It counts what the reader reads: not what a
 * `content-visibility: hidden` box skips. `--styled-at=<rev>` counts the
 * files that had a `<style>` at that revision instead (a converted tree,
 * held to its base of record's list; whether a file's rules were scoped is
 * read off its source there), and lists apart those gone from this tree.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { recorder, type Tape, type TapeHub, writeTape } from "../hub-tape";
import { type Kit, ROOT, type Spec } from "../kit";
import { chosen, type Surface } from "../surfaces/catalogue";
import { PROPS, readSurface } from "../surfaces/read";
import {
  enterVariant,
  HOLDS,
  sceneHub,
  scriptedReply,
  seedScene,
  seedSheet,
  VARIANTS,
} from "../surfaces/scene";
import {
  counts,
  differences,
  loadSnapshot,
  type Snapshot,
  SnapshotWriter,
  saveSnapshot,
  type Tally,
} from "../surfaces/snapshot";
import {
  onHub,
  PASSES,
  Servers,
  SHEET_TAPE,
  TAPE,
  walk,
  walkTapes,
} from "../surfaces/walk";

const KIT = join(import.meta.dir, "..");
const BASELINES = join(
  process.env.PROBE_BASELINES ?? join(KIT, "baselines"),
  "style-snapshot"
);
const COVERAGE = join(KIT, "style-snapshot-coverage.json");
/** A `__svelte_meta` file's leading `./` or `/`. */
const LEADING_DOT = /^\.?\//;
/** Lines printed per surface before the rest are counted in one. */
const SHOWN = 400;

const flag = (name: string): string | undefined =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const has = (name: string): boolean => process.argv.includes(`--${name}`);

/** One walk of every surface at every pass: each surface's snapshot, its seconds, and the tapes' misses. */
async function readAll(
  kit: Kit,
  surfaces: Surface[]
): Promise<{
  misses: string[];
  seconds: Map<string, number>;
  snaps: Map<string, Snapshot>;
}> {
  const writers = new Map<string, SnapshotWriter>();
  const writer = (surface: string) => {
    let w = writers.get(surface);
    if (!w) {
      w = new SnapshotWriter(surface, PROPS);
      writers.set(surface, w);
    }
    return w;
  };
  const { misses, seconds } = await walkTapes(
    kit,
    surfaces,
    PASSES,
    async ({ page, pass, state, surface }) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      const read = await readSurface(page, cdp, state.root);
      writer(surface.name).add(`${state.name} · ${pass.name}`, read);
      await cdp.detach().catch(() => undefined);
    },
    (what, why) => {
      const [surface, rest] = what.split("/");
      writer(surface as string).add(rest as string, null, why);
      kit.note(`${what}: did not open or read (${why})`);
    }
  );
  const snaps = new Map(
    [...writers].map(([name, w]) => [name, w.snapshot] as const)
  );
  return { misses, seconds, snaps };
}

/** A difference line, as `differences.jsonl` keeps it. */
interface Difference {
  after: string;
  before: string;
  element: string;
  pass: string;
  property: string;
  state: string;
  surface: string;
}

const ARROW = " → ";
/** A forced state's property on a descendant (`:hover on span:1 color`), counted with the element's own. */
const FORCED_ON = /^:(hover|focus-visible) on \S+ /;

/** `<state> · <pass> · <element …> · <property> · <before> → <after>`, taken apart from the right. */
function parsed(surface: string, line: string): Difference {
  const parts = line.split(" · ");
  const change = parts.at(-1) ?? "";
  const at = change.indexOf(ARROW);
  return {
    surface,
    state: parts[0] ?? "",
    pass: parts[1] ?? "",
    element: parts.slice(2, -2).join(" · "),
    property: parts.at(-2) ?? "",
    before: at === -1 ? change : change.slice(0, at),
    after: at === -1 ? "" : change.slice(at + ARROW.length),
  };
}

/**
 * Every difference, in kit.out: `differences.jsonl` one per line, and
 * `differences-summary.txt` counted by surface, by surface and state at a
 * pass, and by property.
 */
async function writeDifferences(kit: Kit, all: Difference[]): Promise<string> {
  await mkdir(kit.out, { recursive: true });
  const tally = (key: (d: Difference) => string) => {
    const counted = new Map<string, number>();
    for (const d of all) {
      counted.set(key(d), (counted.get(key(d)) ?? 0) + 1);
    }
    return [...counted]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${String(n).padStart(7)}  ${k}`);
  };
  const jsonl = join(kit.out, "differences.jsonl");
  await writeFile(jsonl, all.map((d) => JSON.stringify(d)).join("\n"));
  await writeFile(
    join(kit.out, "differences-summary.txt"),
    [
      `${all.length} differences`,
      "",
      "by surface:",
      ...tally((d) => d.surface),
      "",
      "by surface/state · pass:",
      ...tally((d) => `${d.surface}/${d.state} · ${d.pass}`),
      "",
      "by property:",
      ...tally((d) => d.property.replace(FORCED_ON, ":$1 ")),
      "",
    ].join("\n")
  );
  return jsonl;
}

/**
 * Each surface's differences, `before` → `after`: the first SHOWN of each
 * as a FAIL line, the rest counted, every one in kit.out; then the total.
 */
async function report(
  kit: Kit,
  surfaces: Surface[],
  pairs: Map<string, [Snapshot, Snapshot]>
): Promise<void> {
  const all: Difference[] = [];
  let shownTotal = 0;
  for (const surface of surfaces) {
    const pair = pairs.get(surface.name);
    if (!pair) {
      continue;
    }
    const tally: Tally = {
      shadowLayers: 0,
      transitionLists: 0,
      zeroOffsets: 0,
    };
    const lines = differences(pair[0], pair[1], tally);
    if (tally.shadowLayers > 0) {
      kit.note(
        `${surface.name}: ${tally.shadowLayers} box-shadow value(s) equal once their blank layers (rgba(0, 0, 0, 0) 0px 0px 0px 0px) are set aside`
      );
    }
    if (tally.transitionLists > 0) {
      kit.note(
        `${surface.name}: ${tally.transitionLists} transition duration, timing-function, delay or behavior list(s) equal once each is repeated or cut to its transition-property's length (CSS Transitions Level 1 §2: "the user agent must calculate its used value by repeating the list of values until there are enough")`
      );
    }
    if (tally.zeroOffsets > 0) {
      kit.note(
        `${surface.name}: ${tally.zeroOffsets} background-position value(s) equal once a zero offset in one unit meets a zero offset in another (0px and 0% place the image at the same corner: CSS Backgrounds 3 §2.6, "with a value pair of 0% 0%, the upper left corner of the image is aligned with the upper left corner of" the area)`
      );
    }
    all.push(...lines.map((line) => parsed(surface.name, line)));
    for (const line of lines.slice(0, SHOWN)) {
      kit.check(`${surface.name}/${line}`, false);
      shownTotal += 1;
    }
    if (lines.length > SHOWN) {
      kit.check(
        `${surface.name} · ${lines.length - SHOWN} more differences not shown (${lines.length} in all)`,
        false
      );
    }
  }
  const file = await writeDifferences(kit, all);
  kit.check(
    all.length === 0
      ? "0 differences"
      : `${all.length} differences in all (${shownTotal} shown above; every one in ${file})`,
    all.length === 0
  );
}

const describe = (
  surface: string,
  snap: Snapshot,
  seconds: Map<string, number>
) => {
  const c = counts(snap);
  const took = (seconds.get(surface) ?? 0).toFixed(0);
  console.log(
    `  ${surface}: ${c.reads} reads, ${c.elements} elements (${c.elements} rects), ${c.forced} read under :hover and :focus-visible, ${c.flagged} spilling or outside what holds them; ${took}s`
  );
};

async function snapshot(kit: Kit, surfaces: Surface[]): Promise<void> {
  const first = await readAll(kit, surfaces);
  // --twice: the same tree on the same tapes, walked again in this run.
  const second = has("twice") ? await readAll(kit, surfaces) : null;
  const { misses } = first;
  if (misses.length > 0) {
    kit.note(
      `the tape answered ${misses.length} request(s) with "not on the tape" (the same on every run): ${misses.slice(0, 8).join("; ")}`
    );
  }
  for (const [name, snap] of first.snaps) {
    describe(name, snap, first.seconds);
  }
  const pairs = new Map<string, [Snapshot, Snapshot]>();
  if (second) {
    for (const [name, snap] of first.snaps) {
      const again = second.snaps.get(name);
      if (again) {
        pairs.set(name, [snap, again]);
      }
    }
    await report(kit, surfaces, pairs);
    return;
  }
  await mkdir(BASELINES, { recursive: true });
  let missing = 0;
  for (const surface of surfaces) {
    const now = first.snaps.get(surface.name);
    if (!now) {
      continue;
    }
    const file = join(BASELINES, `${surface.name}.json.gz`);
    if (kit.approves(surface.name)) {
      // biome-ignore lint/performance/noAwaitInLoops: one baseline at a time
      await saveSnapshot(file, now);
      kit.note(`${surface.name}: baseline written (${relative(ROOT, file)})`);
      continue;
    }
    if (!existsSync(file)) {
      kit.check(
        `${surface.name} · (baseline) · none approved → write it with --approve`,
        false
      );
      missing += 1;
      continue;
    }
    pairs.set(surface.name, [await loadSnapshot(file), now]);
  }
  if (kit.approve) {
    return;
  }
  if (missing > 0) {
    kit.check(`${missing} surface(s) have no baseline`, false);
  }
  await report(kit, surfaces, pairs);
}

/**
 * The fleet the surfaces read, stood up and recorded onto a tape: the
 * scene's (scene.ts `seedScene`), or with `--tape=sheet` the sheet's alone
 * (`seedSheet`; a host's, since its delegate's workspace needs user
 * namespaces), each walking only the surfaces that read it.
 */
async function record(kit: Kit, surfaces: Surface[]): Promise<void> {
  const sheet = flag("tape") === "sheet";
  const file = sheet ? SHEET_TAPE : TAPE;
  const reading = surfaces.filter((s) => (s.tape === "sheet") === sheet);
  if (reading.length === 0) {
    kit.check(
      `the surfaces named read nothing on ${relative(ROOT, file)}`,
      false
    );
    return;
  }
  let repo = "";
  const fleet = await kit.fleet(scriptedReply(() => repo));
  ({ repo } = fleet);
  const stopHeard = sheet ? () => undefined : sceneHub(fleet);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const scene = sheet
    ? await seedSheet(kit, fleet)
    : await seedScene(kit, fleet, { delegate: !has("without-delegate") });
  const tape: Tape = {
    at: Date.now(),
    http: [],
    preview: [],
    sockets: [],
    scene,
  };
  let fails = 0;
  // Every route and state at each width, opened as a snapshot opens it:
  // what the page asks the hub for. A read asks nothing (a forced state
  // fires no event), so none is made; a theme or reduced motion asks for
  // nothing a width does not.
  const recordOn = async (into: TapeHub, on: Surface[], counted = true) => {
    const rec = recorder(fleet.base, into);
    const servers = new Servers(kit, rec);
    try {
      await walk(
        kit,
        servers,
        tape,
        on,
        PASSES.filter((p) => p.theme === "light" && !p.reduced),
        async () => undefined,
        (what, why) => {
          fails += counted ? 1 : 0;
          kit.note(`${what}: did not open (${why})`);
        }
      );
    } finally {
      await servers.close();
      rec.stop();
    }
  };
  try {
    if (sheet) {
      // Walked once off the tape first: a stage's first load is Vite's
      // first, which optimises the story's dependencies and may reload the
      // page for them. The tape holds the stage as every later load finds it.
      await recordOn({ http: [], preview: [], sockets: [] }, reading, false);
    }
    await recordOn(tape, onHub(reading, undefined));
    // Then each hub state the scene moves the fleet into, in order, each
    // on its own section of the tape.
    for (const hub of sheet ? [] : VARIANTS) {
      const on = onHub(reading, hub);
      if (on.length === 0) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: the fleet moves from one hub state to the next
      await enterVariant(fleet, hub);
      const held = HOLDS[hub];
      const section: TapeHub = {
        http: [],
        preview: [],
        sockets: [],
        ...(held ? { held } : {}),
      };
      await recordOn(section, on);
      tape.variants = { ...tape.variants, [hub]: section };
    }
  } finally {
    stopHeard();
  }
  await mkdir(join(file, ".."), { recursive: true });
  await writeTape(file, tape);
  kit.check(
    `the tape is recorded: ${tape.http.length} HTTP exchanges, ${tape.preview.length} on previews' origins, ${tape.sockets.length} sockets (${relative(ROOT, file)})`,
    fails === 0,
    fails > 0 ? `${fails} state(s) did not open` : undefined
  );
}

/** Every `.svelte` under the dashboard's src with a `<style>`, repo-relative, with its source. */
function styled(): Map<string, string> {
  const out = new Map<string, string>();
  const walkDir = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") {
        continue;
      }
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walkDir(path);
      } else if (entry.endsWith(".svelte")) {
        const source = readFileSync(path, "utf8");
        if (source.includes("<style")) {
          out.set(relative(ROOT, path), source);
        }
      }
    }
  };
  walkDir(join(ROOT, "apps", "dashboard", "src"));
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)));
}

/** Git's answer in the checkout; a thrown error with its own words. */
const gitSays = (args: string[]): string => {
  const run = Bun.spawnSync(["git", ...args], { cwd: ROOT });
  if (run.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} exited ${run.exitCode}: ${run.stderr.toString().trim()}`
    );
  }
  return run.stdout.toString();
};

/**
 * {@link styled} as it stood at `ref` (a git revision): the files a tree
 * that has since converted them must still render, each with its source
 * there (`--styled-at=`, the base of record for the converted tree).
 */
function styledAt(ref: string): Map<string, string> {
  const out = new Map<string, string>();
  const listed = gitSays([
    "grep",
    "-l",
    "<style",
    ref,
    "--",
    "apps/dashboard/src/**/*.svelte",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(ref.length + 1))
    .sort((a, b) => a.localeCompare(b));
  for (const path of listed) {
    out.set(path, gitSays(["show", `${ref}:${path}`]));
  }
  return out;
}

/** What coverage asks of the Svelte compiler: one file compiled, its CSS. */
interface SvelteCompiler {
  compile: (
    source: string,
    options: {
      css: "external";
      cssHash: () => string;
      dev: boolean;
      filename: string;
      generate: "client";
    }
  ) => { css: { code: string } | null };
}
/** The class every scoped rule carries when a file is compiled here. */
const SCOPE_MARK = "svelte-coverage-scope";

/**
 * The files whose `<style>` holds a rule Svelte scopes to their own
 * elements, as the compiler decides it (the dashboard's own, as its build
 * resolves it: the kit has no svelte of its own). Compiled with one fixed
 * scoping class, a scoped rule carries it and a `:global` one does not, and
 * a selector nothing in the template can match is gone (`css_unused_selector`).
 */
async function scopedFiles(sources: Map<string, string>): Promise<Set<string>> {
  const { compile } = (await import(
    createRequire(join(ROOT, "apps", "dashboard", "package.json")).resolve(
      "svelte/compiler"
    )
  )) as SvelteCompiler;
  return new Set(
    [...sources.keys()].filter((file) => {
      const path = join(ROOT, file);
      const { css } = compile(sources.get(file) ?? "", {
        filename: path,
        css: "external",
        cssHash: () => SCOPE_MARK,
        generate: "client",
        dev: true,
      });
      return (css?.code ?? "").includes(SCOPE_MARK);
    })
  );
}

/**
 * In the page: the files of every element under `root` (its largest match,
 * or the body), by the dev server's `__svelte_meta`: `own`, the file each
 * element is written in; `chain`, every file up its `parent` chain (svelte
 * context.js `add_svelte_meta`: each block or component tag names the file
 * it is written in), so a component whose template is only other
 * components (ProjectMark's TreeMark) is heard too. What the reader reads
 * (read.ts), into shadow roots: a box that skips its content
 * (`content-visibility: hidden`) counts, what it skips does not.
 */
function filesUnder(root: string): { chain: string[]; own: string[] } {
  interface Stack {
    file?: string;
    parent?: Stack | null;
  }
  const pool = [...document.querySelectorAll(root)];
  const own = new Set<string>();
  const chain = new Set<string>();
  const visit = (el: Element) => {
    const meta = (
      el as unknown as {
        __svelte_meta?: { loc?: { file?: string }; parent?: Stack };
      }
    ).__svelte_meta;
    if (meta?.loc?.file) {
      own.add(meta.loc.file);
    }
    let at: Stack | null | undefined = meta?.parent;
    for (; at; at = at.parent) {
      if (at.file) {
        chain.add(at.file);
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
  for (const top of pool.length > 0 ? pool : [document.body]) {
    visit(top);
  }
  return { own: [...own], chain: [...chain] };
}

/** Each of `files` (as `__svelte_meta` names them) heard on `surface`, repo-relative. */
function heard(
  into: Map<string, Set<string>>,
  files: string[],
  surface: string
): void {
  for (const file of files) {
    const at = file.includes("apps/dashboard/")
      ? file.slice(file.indexOf("apps/dashboard/"))
      : `apps/dashboard/${file.replace(LEADING_DOT, "")}`;
    const set = into.get(at) ?? new Set<string>();
    set.add(surface);
    into.set(at, set);
  }
}

/** Which surfaces render an element of each styled file: the dev server's `__svelte_meta`. */
async function coverage(kit: Kit, surfaces: Surface[]): Promise<void> {
  const seen = new Map<string, Set<string>>();
  const chained = new Map<string, Set<string>>();
  await walkTapes(
    kit,
    surfaces.map((s) => ({ ...s, serve: "dev" as const })),
    PASSES.filter((p) => !p.reduced && p.theme === "light"),
    async ({ page, pass, state, surface }) => {
      const read = await page.evaluate(filesUnder, state.root);
      heard(seen, read.own, surface.name);
      heard(chained, read.chain, surface.name);
      // Each state's own files and the page it read them on: which state
      // leaves a file out, where the map says only which surface.
      if (has("dump")) {
        await writeFile(
          join(
            kit.out,
            `${surface.name}-${state.name}-${pass.width}-${pass.theme}.json`
          ),
          `${JSON.stringify({ url: page.url(), ...read }, null, 2)}\n`
        );
      }
    },
    (what, why) => kit.note(`${what}: did not open (${why})`)
  );
  const map: Record<string, string[]> = {};
  const uncovered: string[] = [];
  const at = flag("styled-at");
  const sources = at ? styledAt(at) : styled();
  // A file gone from this tree since `at` is no file it renders.
  const gone = [...sources.keys()].filter(
    (file) => !existsSync(join(ROOT, file))
  );
  for (const file of gone) {
    sources.delete(file);
  }
  const files = [...sources.keys()];
  const scoped = await scopedFiles(sources);
  for (const file of files) {
    // Rendered through a child alone, a file proves only its unscoped rules:
    // a scoped one matches its own elements, none of which stood there.
    const through = scoped.has(file) ? [] : [...(chained.get(file) ?? [])];
    const by = [...new Set([...(seen.get(file) ?? []), ...through])].sort();
    map[file] = by;
    if (by.length === 0) {
      uncovered.push(file);
    }
  }
  await writeFile(COVERAGE, `${JSON.stringify(map, null, 2)}\n`);
  kit.note(
    `coverage: ${files.length - uncovered.length} of ${files.length} files with a <style>${at ? ` at ${at}` : ""} are rendered by a surface (${relative(ROOT, COVERAGE)})`
  );
  if (gone.length > 0) {
    console.log(
      `  gone from this tree since ${at} (${gone.length}):\n    ${gone.join("\n    ")}`
    );
  }
  if (uncovered.length > 0) {
    console.log(
      `  rendered by no surface (${uncovered.length}):\n    ${uncovered.join("\n    ")}`
    );
  }
}

const spec: Spec = {
  name: "style-snapshot",
  async run(kit) {
    const surfaces = chosen(flag("surfaces"));
    if (has("record")) {
      await record(kit, surfaces);
      return;
    }
    if (has("coverage")) {
      await coverage(kit, surfaces);
      return;
    }
    await snapshot(kit, surfaces);
  },
};
export default spec;
