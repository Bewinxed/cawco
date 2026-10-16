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
import { join, relative } from "node:path";
import { player, readTape, recorder, type Tape, writeTape } from "../hub-tape";
import { type Kit, ROOT, type Spec } from "../kit";
import { chosen, type Surface } from "../surfaces/catalogue";
import { PROPS, readSurface } from "../surfaces/read";
import { sceneHub, scriptedReply, seedScene } from "../surfaces/scene";
import {
  counts,
  differences,
  loadSnapshot,
  SnapshotWriter,
  saveSnapshot,
} from "../surfaces/snapshot";
import { PASSES, Servers, TAPE, walk } from "../surfaces/walk";

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

async function snapshot(kit: Kit, surfaces: Surface[]): Promise<void> {
  const tape = await readTape(TAPE);
  const hub = player(tape);
  const servers = new Servers(kit, hub);
  const writers = new Map<string, SnapshotWriter>();
  const writer = (surface: string) => {
    let w = writers.get(surface);
    if (!w) {
      w = new SnapshotWriter(surface, PROPS);
      writers.set(surface, w);
    }
    return w;
  };
  let seconds = new Map<string, number>();
  try {
    seconds = await walk(
      kit,
      servers,
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
  } finally {
    await servers.close();
    hub.stop();
  }
  const misses = hub.misses();
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
  const scene = await seedScene(kit, fleet);
  const tape: Tape = {
    at: Date.now(),
    http: [],
    preview: [],
    sockets: [],
    scene,
  };
  const rec = recorder(fleet.base, tape);
  const servers = new Servers(kit, rec);
  let fails = 0;
  try {
    // Every route and state at each width, opened as a snapshot opens it:
    // what the page asks the hub for. A read asks nothing (a forced state
    // fires no event), so none is made; a theme or reduced motion asks for
    // nothing a width does not.
    await walk(
      kit,
      servers,
      tape,
      surfaces,
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

/** Which surfaces render an element of each styled file: the dev server's `__svelte_meta`. */
async function coverage(kit: Kit, surfaces: Surface[]): Promise<void> {
  const tape = await readTape(TAPE);
  const hub = player(tape);
  const servers = new Servers(kit, hub);
  const seen = new Map<string, Set<string>>();
  try {
    await walk(
      kit,
      servers,
      tape,
      surfaces.map((s) => ({ ...s, serve: "dev" as const })),
      PASSES.filter((p) => !p.reduced && p.theme === "light"),
      async ({ page, state, surface }) => {
        const files = await page.evaluate((root) => {
          const pool = [...document.querySelectorAll(root)];
          const els = pool.length > 0 ? pool : [document.body];
          const out = new Set<string>();
          for (const top of els) {
            for (const el of [top, ...top.querySelectorAll("*")]) {
              const meta = (
                el as unknown as { __svelte_meta?: { loc?: { file?: string } } }
              ).__svelte_meta;
              if (meta?.loc?.file) {
                out.add(meta.loc.file);
              }
            }
          }
          return [...out];
        }, state.root);
        for (const file of files) {
          const at = file.includes("apps/dashboard/")
            ? file.slice(file.indexOf("apps/dashboard/"))
            : `apps/dashboard/${file.replace(LEADING_DOT, "")}`;
          const set = seen.get(at) ?? new Set<string>();
          set.add(surface.name);
          seen.set(at, set);
        }
      },
      (what, why) => kit.note(`${what}: did not open (${why})`)
    );
  } finally {
    await servers.close();
    hub.stop();
  }
  const map: Record<string, string[]> = {};
  const uncovered: string[] = [];
  for (const file of styled()) {
    const by = [...(seen.get(file) ?? [])].sort();
    map[file] = by;
    if (by.length === 0) {
      uncovered.push(file);
    }
  }
  await writeFile(COVERAGE, `${JSON.stringify(map, null, 2)}\n`);
  const files = Object.keys(map).length;
  kit.note(
    `coverage: ${files - uncovered.length} of ${files} files with a <style> are rendered by a surface (${relative(ROOT, COVERAGE)})`
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
