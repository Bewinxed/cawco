/**
 * A workspace's cut installs nothing, and its delegate's own install links
 * from the workspaces' cache inside its boundary, never copying the
 * project's packages into each clone. On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model). This spec delegates, so
 * its fleet cuts workspaces: it runs on the host, outside every boundary.
 *
 * Two legs, each one project and two delegates, A then B, each cutting a
 * workspace of it:
 *
 * - bun: this repository at the commit under test (its tracked tree, one
 *   commit), installed with `bun install --frozen-lockfile`; its
 *   `node_modules/.bun` entries are links into the cache's bun global store
 *   (`<cache>/bun/links/`, agent boundary.ts `writeBunConfig`);
 * - pnpm: a project of {@link PNPM_PACKAGE}'s packages, its lockfile made on
 *   the host as the leg starts, installed with pnpm {@link PNPM}'s
 *   `install --frozen-lockfile`; each of its `node_modules` packages resolves
 *   into pnpm's global virtual store in the cache (`<cache>/pnpm/store/`,
 *   agent boundary.ts `writePnpmConfig`), and no store is made in the clone.
 *
 * In each leg:
 *
 * - at its first command a clone's `node_modules` holds nothing: nothing
 *   installed at the cut (a Linux clone's bun `node_modules` is there
 *   already, an empty folder of its own in the cache it links to: agent
 *   workspace-modules.ts);
 * - its own frozen install, run in its boundary, finishes;
 * - its packages link into the cache, as above;
 * - B adds under {@link SECOND_CLONE_LIMIT_KB} to the disk, counted by
 *   unique inodes (`du` counts each inode once across all its paths): the
 *   manager's cache and A's `node_modules` before B's install, against the
 *   cache, A's and B's after it. A copied install adds about 2 GB for this
 *   repository, about 115 MB for the pnpm project;
 * - (bun leg) neither boundary can list the other's clone: on the Mac its
 *   folder; on Linux, where both are views of the one folder at its own
 *   path (agent layer.ts), the other's writes on the host, its view's upper.
 *
 * What a delegate installed is read where its copy keeps it (../copy.ts).
 *
 *   bun scripts/probe-kit/run.ts workspace-install
 */
import { lstatSync } from "node:fs";
import { readdir, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  copyPath,
  inCopyExists,
  isView,
  ownWritesOf,
  realpathsInCopy,
} from "../copy";
import type { Kit, Spec } from "../kit";

type Tag = "A" | "B" | "PA" | "PB";
const TAG = /PROBE-INSTALL-(?:LIST-)?(P?[AB])\b/g;
const LIST = /PROBE-INSTALL-LIST-P?[AB]: (\S+)/g;
/** The most a second clone may add, in KiB: a copied install adds about 2 GB. */
const SECOND_CLONE_LIMIT_KB = 100 * 1024;
/** A cold install fetches every package into the scratch fleet's empty cache. */
const INSTALL_MS = 900_000;
const ROOT = resolve(import.meta.dir, "..", "..", "..");
/** The pnpm the pnpm leg installs with, through npx (the host has none of its own). */
const PNPM = "pnpm@12.14.0";
/** The pnpm leg's project: a Svelte and Vite app's packages, 138 of them. */
const PNPM_PACKAGE = {
  name: "probe-pnpm",
  private: true,
  version: "0.0.0",
  dependencies: {
    "@sveltejs/kit": "2.37.1",
    "@sveltejs/vite-plugin-svelte": "6.1.4",
    "date-fns": "4.1.0",
    eslint: "9.35.0",
    lodash: "4.17.21",
    svelte: "5.38.10",
    tailwindcss: "4.1.13",
    typescript: "5.9.2",
    vite: "7.1.5",
    zod: "4.1.5",
  },
};

/** `marker` spelled apart in a command, so only the command's output carries it whole. */
const apart = (marker: string): string =>
  `"${marker.slice(0, 3)}""${marker.slice(3)}"`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The frozen install `tag`'s delegate runs. */
const installOf = (tag: Tag): string =>
  tag.startsWith("P")
    ? `npx -y ${PNPM} install --frozen-lockfile`
    : "bun install --frozen-lockfile";

/** The delegate's install: whether the cut left `node_modules`, then its own frozen install and its exit. */
const installCommand = (tag: Tag): string =>
  [
    `if [ -n "$(ls -A node_modules 2>/dev/null)" ]; then echo ${apart(`AT-CUT-HAD-${tag}`)}; else echo ${apart(`AT-CUT-NONE-${tag}`)}; fi`,
    `${installOf(tag)} > "$TMPDIR/install.log" 2>&1; echo ${apart(`INSTALLED-${tag}:`)}$?`,
    `tail -n 3 "$TMPDIR/install.log"`,
  ].join("; ");

/** Lists the other workspace's clone from inside this one's boundary, then the exit. */
const listCommand = (tag: Tag, other: string): string =>
  `ls -A '${other.replaceAll("'", `'\\''`)}' 2>&1 | head -n 5; echo ${apart(`LISTED-${tag}:`)}\${PIPESTATUS[0]}`;

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = [...request.all.matchAll(TAG)].at(-1)?.[1] as Tag | undefined;
  if (!tag) {
    return text("ok");
  }
  const has = (marker: string) => request.all.includes(marker);
  const other = [...request.all.matchAll(LIST)].at(-1)?.[1];
  if (other && !has(`LISTED-${tag}:`)) {
    return tool("Bash", {
      command: listCommand(tag, other),
      description: "List the other workspace's clone",
    });
  }
  if (!has(`INSTALLED-${tag}:`)) {
    return tool("Bash", {
      command: installCommand(tag),
      description: "Install the dependencies",
      timeout: 600_000,
    });
  }
  return text("Done.");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

interface Delegated {
  id: string;
  instanceId: string;
  path: string;
  workspaceId: string;
}

/** How a clone's packages stand: how many, and how many link into the cache. */
interface Linked {
  entries: number;
  /** Where the links should lead. */
  into: string;
  linked: number;
}

/** One manager's leg: its project and how its clone's packages are read. */
interface Leg {
  /** The manager's part of the workspaces' cache, counted with each clone's `node_modules`. */
  cache: string;
  linked: (fleet: Fleet, self: Delegated) => Promise<Linked>;
  name: string;
  tags: readonly [Tag, Tag];
}

/** The first request that read `marker`: its words, else nothing. */
const read = (fleet: Fleet, marker: string): string | undefined =>
  fleet.seen.find((one) => one.all.includes(marker))?.all;

/** Every `node_modules` folder of `clone`, none inside another. */
const nodeModulesOf = async (clone: string): Promise<string[]> =>
  (
    await Bun.$`find ${clone} -name node_modules -prune -type d -print0`
      .quiet()
      .nothrow()
  ).stdout
    .toString()
    .split("\0")
    .filter(Boolean);

/** KiB on disk under `paths` together, each inode counted once (`du -sck`). */
const unique = async (paths: readonly string[]): Promise<number> => {
  const out = await Bun.$`du -sck ${paths}`.quiet().nothrow();
  return Number(
    out.stdout.toString().trim().split("\n").at(-1)?.split("\t")[0]
  );
};

/**
 * How many of `rels` (paths of `self`'s copy) are links, read where the
 * copy keeps them, whose target followed whole in the copy lies under
 * `into`: a link relative to its own folder (pnpm's) resolves as the copy
 * has it, never in the person's folder a Linux view is of (../copy.ts).
 */
const linkedInto = async (
  fleet: Fleet,
  self: Delegated,
  rels: readonly string[],
  into: string
): Promise<number> => {
  const links = rels.filter((rel) => {
    const at = copyPath(fleet, self, rel);
    return at !== undefined && lstatSync(at).isSymbolicLink();
  });
  const real = await realpathsInCopy(
    fleet,
    self,
    links.map((rel) => join(self.path, rel))
  );
  return real.filter((path) => path.startsWith(`${into}/`)).length;
};

/** The names in folder `rel` of `self`'s copy, read where the copy keeps it. */
const namesIn = async (
  fleet: Fleet,
  self: Delegated,
  rel: string
): Promise<string[]> => {
  const at = copyPath(fleet, self, rel);
  return at ? await readdir(at).catch(() => [] as string[]) : [];
};

/** bun: how a copy's isolated store entries stand, links into `into` (`node_modules/.bun`). */
const bunStoreOf =
  (into: string) =>
  async (fleet: Fleet, self: Delegated): Promise<Linked> => {
    const store = join("node_modules", ".bun");
    const names = (await namesIn(fleet, self, store)).filter(
      (name) => name !== "node_modules"
    );
    return {
      entries: names.length,
      linked: await linkedInto(
        fleet,
        self,
        names.map((name) => join(store, name)),
        into
      ),
      into,
    };
  };

/** pnpm: how a copy's packages stand, each in `node_modules` (a scope's within it), links into `into`. */
const pnpmPackagesOf =
  (into: string) =>
  async (fleet: Fleet, self: Delegated): Promise<Linked> => {
    const top = (await namesIn(fleet, self, "node_modules")).filter(
      (name) => !name.startsWith(".")
    );
    const scoped = await Promise.all(
      top.map(async (name) =>
        name.startsWith("@")
          ? (await namesIn(fleet, self, join("node_modules", name))).map(
              (inner) => join("node_modules", name, inner)
            )
          : [join("node_modules", name)]
      )
    );
    const packages = scoped.flat();
    return {
      entries: packages.length,
      linked: await linkedInto(fleet, self, packages, into),
      into,
    };
  };

/** The tracked tree of the commit under test, one commit in a repository of its own (no origin: the hub becomes it). */
const makeRepo = async (fleet: Fleet): Promise<string> => {
  const repo = join(fleet.sandbox, "cockpit");
  const env = { ...process.env, HOME: fleet.env.HOME as string };
  await Bun.$`mkdir -p ${repo} && git -C ${ROOT} archive HEAD | tar -x -C ${repo}`.quiet();
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'Snapshot'`
    .cwd(repo)
    .env(env)
    .quiet();
  return repo;
};

/** The pnpm leg's project, its lockfile made on the host by {@link PNPM}, one commit in a repository of its own. */
const makePnpmRepo = async (fleet: Fleet): Promise<string> => {
  const repo = join(fleet.sandbox, "pnpm-probe");
  const env = { ...process.env, HOME: fleet.env.HOME as string };
  await Bun.$`mkdir -p ${repo}`.quiet();
  await writeFile(
    join(repo, "package.json"),
    `${JSON.stringify(PNPM_PACKAGE, null, 2)}\n`
  );
  // esbuild's install script fetches its binary: pnpm 11 and later run a
  // dependency's build only when the project allows it.
  await writeFile(
    join(repo, "pnpm-workspace.yaml"),
    "allowBuilds:\n  esbuild: true\n"
  );
  await writeFile(join(repo, ".gitignore"), "node_modules\n");
  await Bun.$`npx -y ${PNPM} install --lockfile-only`
    .cwd(repo)
    .env(env)
    .quiet();
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'Snapshot'`
    .cwd(repo)
    .env(env)
    .quiet();
  return repo;
};

/** A parent session in a project of its own on `repo`. */
const parentOn = async (
  fleet: Fleet,
  repo: string,
  name: string
): Promise<string> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: repo,
  });
  return fleet.spawn("claude", "Parent", repo, { projectId: project.id });
};

/** A delegate of `parent` on `repo`, and where its workspace's clone is once cut. */
const delegate = async (
  fleet: Fleet,
  parent: string,
  repo: string,
  tag: Tag
): Promise<Delegated> => {
  const started = await fleet.api<{ instanceId: string; workspaceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: `Install ${tag}`,
      prompt: `PROBE-INSTALL-${tag}: install the dependencies.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    }
  );
  const row = await until(
    `${tag}'s workspace cut`,
    () =>
      fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        started.workspaceId
      )[0],
    (one) => Boolean(one?.path),
    300_000
  );
  return { ...started, id: started.workspaceId, path: row?.path ?? "" };
};

/** `tag`'s install: nothing at the cut, its own install finished, its packages linked from the cache. */
const installed = async (
  kit: Kit,
  fleet: Fleet,
  leg: Leg,
  tag: Tag,
  self: Delegated
): Promise<boolean> => {
  const said = await until(
    `${tag}'s install finished`,
    () => read(fleet, `INSTALLED-${tag}:`),
    Boolean,
    INSTALL_MS
  ).catch(() => undefined);
  kit.check(
    `${tag}: its clone's node_modules holds nothing at its first command: the cut installed nothing`,
    said?.includes(`AT-CUT-NONE-${tag}`) === true,
    said?.includes(`AT-CUT-HAD-${tag}`)
      ? "node_modules held packages"
      : "unread"
  );
  const exit = new RegExp(`INSTALLED-${tag}:(\\d+)`).exec(said ?? "")?.[1];
  const tail = said?.slice(said.indexOf(`INSTALLED-${tag}:`)).slice(0, 400);
  kit.check(
    `${tag}: its own ${installOf(tag)}, inside its boundary, finishes`,
    exit === "0",
    tail ?? "no install read"
  );
  // What the delegate installed is its own write: in a Linux view's upper,
  // its copy's folder elsewhere (../copy.ts).
  const store = await leg.linked(fleet, self);
  kit.check(
    `${tag}: its ${leg.name} packages are links into the workspaces' cache`,
    store.entries > 0 && store.linked / store.entries >= 0.9,
    `${store.linked} of ${store.entries} entries link into ${store.into}`
  );
  return exit === "0";
};

/** One leg: A's install, then B's, and what B added to the disk. Answers both delegates. */
const runLeg = async (
  kit: Kit,
  fleet: Fleet,
  leg: Leg,
  parent: string,
  repo: string
): Promise<[Delegated, Delegated]> => {
  const [tagA, tagB] = leg.tags;
  const a = await delegate(fleet, parent, repo, tagA);
  const aDone = await installed(kit, fleet, leg, tagA, a);
  const aModules = await nodeModulesOf(ownWritesOf(fleet, a));
  const before = await unique([leg.cache, ...aModules]);

  const b = await delegate(fleet, parent, repo, tagB);
  const bDone = await installed(kit, fleet, leg, tagB, b);
  const after = await unique([
    leg.cache,
    ...aModules,
    ...(await nodeModulesOf(ownWritesOf(fleet, b))),
  ]);
  const added = after - before;
  // Both counts read (du answered), and B within the limit. A second clone
  // that reuses the whole store adds nothing, and the store itself may lose a
  // block meanwhile (round 136: pnpm's PB "Done in 52ms", the count 4 KiB
  // lower), so the count may come out a few KiB lower: no fault of B's.
  const measured = before > 0 && after > 0;
  kit.check(
    `${leg.name}: ${tagB}, the second clone, adds under ${SECOND_CLONE_LIMIT_KB / 1024} MiB counted by unique inodes (the cache and ${tagA}'s node_modules, then with ${tagB}'s)`,
    aDone && bDone && measured && added < SECOND_CLONE_LIMIT_KB,
    `before ${tagB}: ${before} KiB; after: ${after} KiB; ${tagB} added ${added} KiB${added < 0 ? " (the count fell: the store shrank as it installed)" : ""}`
  );
  kit.note(
    `${leg.name}: the cache and ${tagA}'s node_modules came to ${(before / 1024).toFixed(0)} MiB; ${tagB} added ${(added / 1024).toFixed(1)} MiB`
  );
  return [a, b];
};

/** `tag`'s listing of the other clone: refused from inside its boundary. */
const cannotList = async (
  kit: Kit,
  fleet: Fleet,
  tag: Tag,
  self: Delegated,
  other: Delegated
): Promise<void> => {
  // The other's copy: its own folder on the Mac; on Linux, where both are
  // views of one folder at its own path, the other's writes on the host, its
  // view's upper (../copy.ts).
  await fleet.send(
    self.instanceId,
    `PROBE-INSTALL-LIST-${tag}: ${isView(fleet, other) ? ownWritesOf(fleet, other) : other.path}`
  );
  const said = await until(
    `${tag} listed the other clone`,
    () => read(fleet, `LISTED-${tag}:`),
    Boolean,
    240_000
  ).catch(() => undefined);
  const exit = new RegExp(`LISTED-${tag}:(\\d+)`).exec(said ?? "")?.[1];
  const shown = said
    ?.slice(Math.max(0, said.lastIndexOf(`LISTED-${tag}:`) - 300))
    .slice(0, 400);
  kit.check(
    `${tag}: its boundary cannot list the other workspace's clone`,
    exit !== undefined &&
      exit !== "0" &&
      said?.includes("No such file or directory") === true,
    shown ?? "no listing read"
  );
};

const run = async (kit: Kit) => {
  const nested =
    await Bun.$`bwrap --unshare-user --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc true`
      .quiet()
      .nothrow();
  if (nested.exitCode !== 0) {
    kit.check(
      "0: a workspace boundary can start here (run this spec on the host, not inside a workspace)",
      false,
      nested.stderr.toString().trim()
    );
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const cache = join(home, ".cawco", "workspace-cache");

  const bunLeg: Leg = {
    name: "bun",
    tags: ["A", "B"],
    cache,
    linked: bunStoreOf(join(cache, "bun", "links")),
  };
  const repo = await makeRepo(fleet);
  const [a, b] = await runLeg(
    kit,
    fleet,
    bunLeg,
    await parentOn(fleet, repo, "Workspace install"),
    repo
  );

  const cacheAt = await realpath(cache);
  const modulesAt = await Promise.all(
    [a, b].map((one) =>
      realpath(join(one.path, "node_modules")).catch(() => "")
    )
  );
  kit.check(
    "bun: each clone's node_modules is a folder of its own in the workspaces' cache, where bun hard-links what its global store cannot hold",
    modulesAt.every(
      (at, index) =>
        at ===
        join(
          cacheAt,
          "modules",
          basename([a, b][index]?.path ?? ""),
          "node_modules"
        )
    ),
    modulesAt.join("; ")
  );

  const pnpmStore = join(cache, "pnpm", "store");
  const pnpmLeg: Leg = {
    name: "pnpm",
    tags: ["PA", "PB"],
    cache: join(cache, "pnpm"),
    linked: pnpmPackagesOf(pnpmStore),
  };
  const pnpmRepo = await makePnpmRepo(fleet);
  const [pa, pb] = await runLeg(
    kit,
    fleet,
    pnpmLeg,
    await parentOn(fleet, pnpmRepo, "Workspace install (pnpm)"),
    pnpmRepo
  );
  const ownStores = [pa, pb]
    .filter((one) => inCopyExists(fleet, one, ".pnpm-store"))
    .map((one) => one.path);
  kit.check(
    "pnpm: neither clone holds a store of its own (.pnpm-store): the store is the workspaces' cache's",
    ownStores.length === 0,
    ownStores.join(", ") || "none"
  );

  const log = await fleet.logs("agent");
  kit.check(
    "the agent's log says no dependencies were linked or installed at any cut",
    !(
      log.includes("its dependencies linked from the workspaces' cache") ||
      log.includes("its install inside its boundary failed")
    ),
    "no seed line"
  );

  await cannotList(kit, fleet, "A", a, b);
  await cannotList(kit, fleet, "B", b, a);
};

export default {
  name: "workspace-install",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
