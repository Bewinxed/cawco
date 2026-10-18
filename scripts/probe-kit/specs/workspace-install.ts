/**
 * A workspace's cut installs nothing, and its delegate's own install links
 * from the workspaces' bun cache inside its boundary, never copying the
 * project's packages into each clone. On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model). This spec delegates, so
 * its fleet cuts workspaces: it runs on the host, outside every boundary.
 *
 * One project, this repository at the commit under test (its tracked tree,
 * one commit). Two delegates, A then B, each cut a workspace of it:
 *
 * - at its first command its clone has no `node_modules`: nothing installed
 *   at the cut (on a main with agent seed-deps.ts, the cut's seed had
 *   installed them: red);
 * - its own `bun install --frozen-lockfile`, run in its boundary, finishes;
 * - its `node_modules/.bun` entries are links into the workspaces' cache's
 *   global store (`<cache>/bun/links/`, agent boundary.ts `writeBunConfig`);
 * - B adds under {@link SECOND_CLONE_LIMIT_KB} to the disk, counted by
 *   unique inodes (`du` counts each inode once across all its paths): the
 *   cache and A's `node_modules` before B's install, against the cache, A's
 *   and B's after it. A copied install adds about 2 GB;
 * - neither boundary can list the other's clone.
 *
 *   bun scripts/probe-kit/run.ts workspace-install
 */
import { lstat, readdir, readlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

type Tag = "A" | "B";
const TAG = /PROBE-INSTALL-(?:LIST-)?([AB])\b/g;
const LIST = /PROBE-INSTALL-LIST-[AB]: (\S+)/g;
/** The most a second clone of this repository may add, in KiB: a copied install adds about 2 GB. */
const SECOND_CLONE_LIMIT_KB = 100 * 1024;
/** A cold install fetches every package into the scratch fleet's empty cache. */
const INSTALL_MS = 900_000;
const ROOT = resolve(import.meta.dir, "..", "..", "..");

/** `marker` spelled apart in a command, so only the command's output carries it whole. */
const apart = (marker: string): string =>
  `"${marker.slice(0, 3)}""${marker.slice(3)}"`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The delegate's install: whether the cut left `node_modules`, then its own frozen install and its exit. */
const installCommand = (tag: Tag): string =>
  [
    `if [ -e node_modules ]; then echo ${apart(`AT-CUT-HAD-${tag}`)}; else echo ${apart(`AT-CUT-NONE-${tag}`)}; fi`,
    `bun install --frozen-lockfile > "$TMPDIR/install.log" 2>&1; echo ${apart(`INSTALLED-${tag}:`)}$?`,
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
  instanceId: string;
  path: string;
  workspaceId: string;
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

/** How `clone`'s isolated store entries stand: links into `links`, and folders of its own. */
const storeOf = async (clone: string, links: string) => {
  const store = join(clone, "node_modules", ".bun");
  const names = (await readdir(store).catch(() => [] as string[])).filter(
    (name) => name !== "node_modules"
  );
  const into = await Promise.all(
    names.map(async (name) => {
      const at = join(store, name);
      return (
        (await lstat(at)).isSymbolicLink() &&
        (await readlink(at)).startsWith(`${links}/`)
      );
    })
  );
  return { entries: names.length, linked: into.filter(Boolean).length };
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
  return { ...started, path: row?.path ?? "" };
};

/** `tag`'s install: nothing at the cut, its own install finished, its store linked from the cache. */
const installed = async (
  kit: Kit,
  fleet: Fleet,
  tag: Tag,
  clone: string,
  links: string
): Promise<boolean> => {
  const said = await until(
    `${tag}'s install finished`,
    () => read(fleet, `INSTALLED-${tag}:`),
    Boolean,
    INSTALL_MS
  ).catch(() => undefined);
  kit.check(
    `${tag}: its clone has no node_modules at its first command: the cut installed nothing`,
    said?.includes(`AT-CUT-NONE-${tag}`) === true,
    said?.includes(`AT-CUT-HAD-${tag}`) ? "node_modules was there" : "unread"
  );
  const exit = new RegExp(`INSTALLED-${tag}:(\\d+)`).exec(said ?? "")?.[1];
  const tail = said?.slice(said.indexOf(`INSTALLED-${tag}:`)).slice(0, 400);
  kit.check(
    `${tag}: its own bun install --frozen-lockfile, inside its boundary, finishes`,
    exit === "0",
    tail ?? "no install read"
  );
  const store = await storeOf(clone, links);
  kit.check(
    `${tag}: its node_modules/.bun entries are links into the workspaces' cache's global store`,
    store.entries > 0 && store.linked / store.entries >= 0.9,
    `${store.linked} of ${store.entries} entries link into ${links}`
  );
  return exit === "0";
};

/** `tag`'s listing of the other clone: refused from inside its boundary. */
const cannotList = async (
  kit: Kit,
  fleet: Fleet,
  tag: Tag,
  self: Delegated,
  other: Delegated
): Promise<void> => {
  await fleet.send(self.instanceId, `PROBE-INSTALL-LIST-${tag}: ${other.path}`);
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
  const repo = await makeRepo(fleet);
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Workspace install",
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const cache = join(home, ".cawco", "workspace-cache");
  const links = join(cache, "bun", "links");

  const a = await delegate(fleet, parent, repo, "A");
  const aDone = await installed(kit, fleet, "A", a.path, links);
  const aModules = await nodeModulesOf(a.path);
  const before = await unique([cache, ...aModules]);

  const b = await delegate(fleet, parent, repo, "B");
  const bDone = await installed(kit, fleet, "B", b.path, links);
  const after = await unique([
    cache,
    ...aModules,
    ...(await nodeModulesOf(b.path)),
  ]);
  const added = after - before;
  kit.check(
    `B, the second clone, adds under ${SECOND_CLONE_LIMIT_KB / 1024} MiB counted by unique inodes (the cache and A's node_modules, then with B's)`,
    aDone && bDone && added >= 0 && added < SECOND_CLONE_LIMIT_KB,
    `before B: ${before} KiB; after: ${after} KiB; B added ${added} KiB`
  );
  kit.note(
    `the cache and A's node_modules came to ${(before / 1024).toFixed(0)} MiB; B added ${(added / 1024).toFixed(1)} MiB`
  );

  const log = await fleet.logs("agent");
  kit.check(
    "the agent's log says no dependencies were linked or installed at either cut",
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
