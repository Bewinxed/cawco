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
 *   bun scripts/probe-kit/run.ts style-snapshot --record                      the hub tape, again
 *   bun scripts/probe-kit/run.ts style-snapshot --record --without-delegate   in a workspace: no delegate,
 *                                                                             its states left out with a NOTE
 *
 * `PASS style-snapshot: 0 differences` or one `FAIL` line per difference:
 * `<surface>/<state> · <width> <theme>[ reduced] · <element key> [<data-slot>] · <property> · <before> → <after>`.
 * An element's key is its DOM path from the surface's root (`tag:n`, its
 * place among its siblings of that tag), the same whatever its classes.
 *
 * The fleet it reads is the hub tape (`fixtures/style-snapshot/hub-tape.json.gz`,
 * hub-tape.ts): a scratch fleet's hub recorded once (`--record`, surfaces/scene.ts)
 * and played back, with the page's clock held at the recording's moment, so
 * two runs read the same and no fleet stands up. The dashboard is the built
 * one (`vite build`); the `/motion/` benches, which a build 404s, are read
 * on the dev server against the same tape. No fleet, so it runs in any
 * workspace as an ordinary check.
 *
 * The baselines are `baselines/style-snapshot/<surface>.json.gz`, one per
 * surface, written by `--approve` (surfaces/snapshot.ts holds the format).
 * The surfaces and their states are surfaces/catalogue.ts.
 *
 * `--coverage` reads every surface on the dev server (desk, light), where
 * each element names the `.svelte` file it is written in
 * (`__svelte_meta.loc.file`), and writes which surfaces render each file
 * with a `<style>` (`style-snapshot-coverage.json`), then lists the files
 * no surface renders.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import {
  player,
  readTape,
  recorder,
  type Tape,
  type TapeHub,
  writeTape,
} from "../hub-tape";
import { type Kit, ROOT, type Spec } from "../kit";
import { chosen, type Surface } from "../surfaces/catalogue";
import { PROPS, readSurface } from "../surfaces/read";
import {
  enterVariant,
  sceneHub,
  scriptedReply,
  seedScene,
  VARIANTS,
  type Variant,
} from "../surfaces/scene";
import {
  counts,
  differences,
  loadSnapshot,
  SnapshotWriter,
  saveSnapshot,
} from "../surfaces/snapshot";
import {
  PASSES,
  type Pass,
  Servers,
  TAPE,
  type Visit,
  walk,
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

/** The surfaces as one hub reads them: each with its states that read `hub` (the scene's own when none), and none left with no state. */
function onHub(surfaces: Surface[], hub: Variant | undefined): Surface[] {
  return surfaces
    .map((surface) => ({
      ...surface,
      states: surface.states.filter((state) => state.hub === hub),
    }))
    .filter((surface) => surface.states.length > 0);
}

/**
 * Walks `surfaces` against each hub on the tape their states read: the
 * scene's own, then each variant (scene.ts `VARIANTS`), each answered by a
 * player of its own section and served by a dashboard of its own. Returns
 * each surface's seconds and every request no section answered.
 */
async function walkTape(
  kit: Kit,
  tape: Tape,
  surfaces: Surface[],
  passes: Pass[],
  visit: (v: Visit) => Promise<void>,
  failed: (what: string, why: string) => void
): Promise<{ misses: string[]; seconds: Map<string, number> }> {
  const seconds = new Map<string, number>();
  const misses: string[] = [];
  for (const hub of [undefined, ...VARIANTS]) {
    const reading = onHub(surfaces, hub);
    if (reading.length === 0) {
      continue;
    }
    const section = hub ? tape.variants?.[hub] : tape;
    if (!section) {
      throw new Error(
        `the tape holds no "${hub}" hub, which ${reading.map((s) => s.name).join(", ")} read: record it again (--record)`
      );
    }
    const played = player(section);
    const servers = new Servers(kit, played);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one hub at a time, each its own dashboard
      const took = await walk(
        kit,
        servers,
        tape,
        reading,
        passes,
        visit,
        failed
      );
      for (const [name, s] of took) {
        seconds.set(name, (seconds.get(name) ?? 0) + s);
      }
    } finally {
      await servers.close();
      played.stop();
    }
    misses.push(...played.misses().map((m) => (hub ? `${hub}: ${m}` : m)));
  }
  return { misses, seconds };
}

async function snapshot(kit: Kit, surfaces: Surface[]): Promise<void> {
  const tape = await readTape(TAPE);
  const writers = new Map<string, SnapshotWriter>();
  const writer = (surface: string) => {
    let w = writers.get(surface);
    if (!w) {
      w = new SnapshotWriter(surface, PROPS);
      writers.set(surface, w);
    }
    return w;
  };
  const { misses, seconds } = await walkTape(
    kit,
    tape,
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
  if (misses.length > 0) {
    kit.note(
      `the tape answered ${misses.length} request(s) with "not on the tape" (the same on every run): ${misses.slice(0, 8).join("; ")}`
    );
  }
  await mkdir(BASELINES, { recursive: true });
  let total = 0;
  let shownTotal = 0;
  for (const surface of surfaces) {
    const now = writers.get(surface.name)?.snapshot;
    if (!now) {
      continue;
    }
    const c = counts(now);
    const took = (seconds.get(surface.name) ?? 0).toFixed(0);
    console.log(
      `  ${surface.name}: ${c.reads} reads, ${c.elements} elements (${c.elements} rects), ${c.forced} read under :hover and :focus-visible, ${c.flagged} spilling or outside what holds them; ${took}s`
    );
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
      total += 1;
      continue;
    }
    const lines = differences(await loadSnapshot(file), now);
    total += lines.length;
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
  if (kit.approve) {
    return;
  }
  kit.check(
    total === 0
      ? "0 differences"
      : `${total} differences in all (${shownTotal} shown above)`,
    total === 0
  );
}

/** The fleet the surfaces read, stood up and recorded onto the tape. */
async function record(kit: Kit, surfaces: Surface[]): Promise<void> {
  let repo = "";
  const fleet = await kit.fleet(scriptedReply(() => repo));
  ({ repo } = fleet);
  const stopJev = sceneHub(fleet);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const scene = await seedScene(kit, fleet, {
    delegate: !has("without-delegate"),
  });
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
  const recordOn = async (into: TapeHub, reading: Surface[]) => {
    const rec = recorder(fleet.base, into);
    const servers = new Servers(kit, rec);
    try {
      await walk(
        kit,
        servers,
        tape,
        reading,
        PASSES.filter((p) => p.theme === "light" && !p.reduced),
        async () => undefined,
        (what, why) => {
          fails += 1;
          kit.note(`${what}: did not open (${why})`);
        }
      );
    } finally {
      await servers.close();
      rec.stop();
    }
  };
  try {
    await recordOn(tape, onHub(surfaces, undefined));
    // Then each hub state the scene moves the fleet into, in order, each
    // on its own section of the tape.
    for (const hub of VARIANTS) {
      const reading = onHub(surfaces, hub);
      if (reading.length === 0) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: the fleet moves from one hub state to the next
      await enterVariant(fleet, hub);
      const section: TapeHub = { http: [], preview: [], sockets: [] };
      await recordOn(section, reading);
      tape.variants = { ...tape.variants, [hub]: section };
    }
  } finally {
    stopJev();
  }
  await mkdir(join(TAPE, ".."), { recursive: true });
  await writeTape(TAPE, tape);
  kit.check(
    `the tape is recorded: ${tape.http.length} HTTP exchanges, ${tape.sockets.length} sockets (${relative(ROOT, TAPE)})`,
    fails === 0,
    fails > 0 ? `${fails} state(s) did not open` : undefined
  );
}

/** Every `.svelte` under the dashboard's src with a `<style>`, repo-relative. */
function styled(): string[] {
  const out: string[] = [];
  const walkDir = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") {
        continue;
      }
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walkDir(path);
      } else if (
        entry.endsWith(".svelte") &&
        readFileSync(path, "utf8").includes("<style")
      ) {
        out.push(relative(ROOT, path));
      }
    }
  };
  walkDir(join(ROOT, "apps", "dashboard", "src"));
  return out.sort();
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
async function scopedFiles(files: string[]): Promise<Set<string>> {
  const { compile } = (await import(
    createRequire(join(ROOT, "apps", "dashboard", "package.json")).resolve(
      "svelte/compiler"
    )
  )) as SvelteCompiler;
  return new Set(
    files.filter((file) => {
      const path = join(ROOT, file);
      const { css } = compile(readFileSync(path, "utf8"), {
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
 * components (ProjectMark's TreeMark) is heard too.
 */
function filesUnder(root: string): { chain: string[]; own: string[] } {
  interface Stack {
    file?: string;
    parent?: Stack | null;
  }
  const pool = [...document.querySelectorAll(root)];
  const own = new Set<string>();
  const chain = new Set<string>();
  for (const top of pool.length > 0 ? pool : [document.body]) {
    for (const el of [top, ...top.querySelectorAll("*")]) {
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
    }
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
  const tape = await readTape(TAPE);
  const seen = new Map<string, Set<string>>();
  const chained = new Map<string, Set<string>>();
  await walkTape(
    kit,
    tape,
    surfaces.map((s) => ({ ...s, serve: "dev" as const })),
    PASSES.filter((p) => !p.reduced && p.theme === "light"),
    async ({ page, state, surface }) => {
      const read = await page.evaluate(filesUnder, state.root);
      heard(seen, read.own, surface.name);
      heard(chained, read.chain, surface.name);
    },
    (what, why) => kit.note(`${what}: did not open (${why})`)
  );
  const map: Record<string, string[]> = {};
  const uncovered: string[] = [];
  const files = styled();
  const scoped = await scopedFiles(files);
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
    `coverage: ${files.length - uncovered.length} of ${files.length} files with a <style> are rendered by a surface (${relative(ROOT, COVERAGE)})`
  );
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
