/**
 * A delegate whose work lands ends done, and landing never stops its
 * workspace's boundary while the delegate still runs a command there. On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model). This spec delegates, so its fleet cuts workspaces: it runs on the
 * host, outside every boundary.
 *
 * The case, as on obelisk 2026-10-17: a landing's push goes through the
 * workspace's git door, whose host side runs `git lfs push` in the clone
 * first (agent hub-git.ts `pushLfs`). git-lfs asked the LFS server about
 * locks, heard 401, and wrote `lfs.<url>.access` into the clone's
 * `.git/config` by a lock and a rename, which drops the read-only bind the
 * sandbox holds on it: the sandbox was stopped with everything in it
 * (boundary-host.ts `guard`), the landing's push was cut off, the item
 * failed ("Not landed: the push to main was refused" with the executor's
 * "cut off" line), and the push landed anyway, the door's host side having
 * gone on. There it was GitHub; here the project (its origin the scratch
 * hub) names an LFS server in its committed `.lfsconfig`: a mock in this
 * process that answers `locks/verify` as GitHub did, 401 without a
 * credential, then, with the one the machine's credential helper gives, a
 * slow 200. A hub origin's git-lfs runs against its own repository's LFS on
 * the hub alone, whatever `.lfsconfig` says (agent move.ts `hubGitEnv`).
 *
 * - A, the cause: a delegate commits a file, starts `sleep` in the
 *   background, then calls finish_item. Its item ends done, saying it
 *   landed; its commit is on the hub's main; the clone's `.git/config` is
 *   the file it was; the sandbox is the one it was (the agent's log says no
 *   restart); and its `sleep` still runs.
 * - B, the end state when a push is cut off all the same: a delegate commits
 *   a large file, so the door's `git lfs push` uploads it. As the upload
 *   lands in the hub's LFS store (its `tmp` dir), the spec replaces the
 *   clone's `.git/config` on the host with the same bytes (a new inode, as
 *   any host write makes), standing in for whatever else may stop a sandbox
 *   mid-push. The agent's log says the sandbox restarted; the item ends done
 *   all the same, saying it landed, and its commit is on main.
 * - C, nothing to land: a delegate commits nothing, so its HEAD is on main
 *   already (as workspace a7dd050f's one commit was). Before it finishes,
 *   the host writes into its clone's config the `lfs.<url>.access` git-lfs
 *   left in the clones of 2026-10-17, a key the git door runs no git under
 *   (safe-git.ts `repositoryConfigProblem`), so the landing's fetch fails
 *   ("remote helper 'cawco' aborted session"). The item ends done, "Nothing
 *   to land".
 * - D, a committed `.lfsconfig` cannot move a hub origin's git-lfs: a
 *   delegate commits a large file and an `.lfsconfig` whose `lfs.url` names
 *   a second project's repository on the same hub and whose `lfs.pushurl`
 *   names a second mock that answers every request 401. Its landing's door
 *   push runs, then E, a delegate that commits nothing, has its workspace
 *   cut from main, which holds that file. D lands done with its clone's
 *   `.git/config` the same file with the same bytes and its sandbox never
 *   restarted; E ends done, its checkout holding D's large file, downloaded
 *   from the project's own repository on the hub; the second mock is asked
 *   nothing, and the hub logs no LFS request for the second project.
 *
 *   bun scripts/probe-kit/run.ts landing-cutoff
 */
import { watch } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-CUTOFF-([ABCDE])/;
type Tag = "A" | "B" | "C" | "D" | "E";
/** A's background command, found on the host by its argv. */
const SLEEP = ["sleep", "7311"];
/** The agent's words for a sandbox the host stopped (boundary-host.ts). */
const RESTARTED = "was changed on the host";
/** The agent's words for a boundary it closed (boundary.ts `closeBoundary` and the quiet close). */
const CLOSED =
  /, so its boundary [\d, ]+ (is|and its \d+ judge\(s\) are) closed/;
/** How long the first mock LFS server holds an answer it gives. */
const SLOW_MS = 4000;
/** A process's entry in `/proc`. */
const PID = /^\d+$/;
const LFS_JSON = { "content-type": "application/vnd.git-lfs+json" };
/** An object's own URL on a mock LFS server, which its batch answers name. */
const OBJECT_PATH = /^\/lfs\/objects\/([0-9a-f]{64})$/;
/** D's large file: what E's checkout must hold. */
const D_BYTES = 1_048_576;

/** The shell that commits a large file `name` of `bytes` copies of `char`, its object in the clone's store. */
const largeFile = (name: string, bytes: number, char: string): string[] => [
  `head -c ${bytes} /dev/zero | tr '\\0' ${char} > obj`,
  'oid=$(sha256sum obj | cut -d" " -f1)',
  "size=$(wc -c < obj)",
  'mkdir -p ".git/lfs/objects/$(echo $oid | cut -c1-2)/$(echo $oid | cut -c3-4)"',
  'mv obj ".git/lfs/objects/$(echo $oid | cut -c1-2)/$(echo $oid | cut -c3-4)/$oid"',
  `printf 'version https://git-lfs.github.com/spec/v1\\noid sha256:%s\\nsize %s\\n' $oid $size > ${name}`,
  "printf '*.bin filter=lfs diff=lfs merge=lfs -text\\n' > .gitattributes",
  `git add .gitattributes ${name}`,
];

/**
 * What each delegate commits: A a plain file, B and D a large file (D with
 * its `.lfsconfig`, set once the fleet's addresses are known); C and E
 * nothing.
 */
const COMMIT: Partial<Record<Tag, string>> = {
  A: "printf 'landed\\n' > landed.txt && git add landed.txt",
  // Large enough that its upload is still in the hub's store as B's trigger fires.
  B: largeFile("large.bin", 8_388_608, "b").join(" && "),
};

/**
 * Each delegate's steps so far. `armed` is set by the spec once it has read
 * the sandbox and the config the landing starts from.
 */
const steps: Record<
  Tag,
  Record<
    "armed" | "background" | "committed" | "finished" | "searched",
    boolean
  >
> = {
  A: {
    armed: false,
    background: false,
    committed: false,
    finished: false,
    searched: false,
  },
  // Only A runs something in the background; C and E commit nothing.
  B: {
    armed: false,
    background: true,
    committed: false,
    finished: false,
    searched: false,
  },
  C: {
    armed: false,
    background: true,
    committed: true,
    finished: false,
    searched: false,
  },
  D: {
    armed: false,
    background: true,
    committed: false,
    finished: false,
    searched: false,
  },
  E: {
    armed: false,
    background: true,
    committed: true,
    finished: false,
    searched: false,
  },
};

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  const step = steps[tag];
  if (!step.committed) {
    step.committed = true;
    return tool("Bash", {
      command: `${COMMIT[tag] ?? "true"} && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
      description: "Commit",
    });
  }
  if (!step.background) {
    step.background = true;
    return tool("Bash", {
      command: SLEEP.join(" "),
      description: "Run in the background",
      run_in_background: true,
    });
  }
  if (!step.armed) {
    return tool("Bash", { command: "sleep 1", description: "Wait" });
  }
  if (!step.finished && request.toolNames.includes(FINISH)) {
    step.finished = true;
    return tool(FINISH, {
      headline: `Committed ${tag}.`,
      summary: `Committed ${tag}.\n\nNot run: none.`,
    });
  }
  if (
    !(step.finished || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** The host pid of the process whose argv is {@link SLEEP}, if one runs. */
const sleepPid = async (): Promise<number | undefined> => {
  const wanted = `${SLEEP.join("\0")}\0`;
  for (const pid of await readdir("/proc")) {
    if (!PID.test(pid)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one scan, stopped at the first match
    const argv = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
    if (argv === wanted) {
      return Number(pid);
    }
  }
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The file at `path` replaced by its own bytes: a new inode, as a host-side `git config` leaves. */
const replaceInPlace = async (path: string): Promise<void> => {
  await writeFile(`${path}.probe`, await readFile(path));
  await rename(`${path}.probe`, path);
};

/**
 * A mock LFS server in this process, each request it gets kept in `asked`.
 * `refuse`: every request answered 401. Otherwise a store as the LFS batch
 * API has it (an upload for each object it lacks, a download for each it
 * holds), whose `locks/verify` answers as GitHub's does: 401 without a
 * credential, a slow 200 with one.
 */
const lfsMock = (refuse: boolean) => {
  const asked: string[] = [];
  const objects = new Map<string, ArrayBuffer>();
  const unauthorized = () =>
    new Response(
      JSON.stringify({ message: "You must have push access to verify locks" }),
      {
        status: 401,
        headers: { ...LFS_JSON, "lfs-authenticate": 'Basic realm="p"' },
      }
    );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const authed = Boolean(request.headers.get("authorization"));
      asked.push(`${request.method} ${path}${authed ? " (signed in)" : ""}`);
      if (refuse) {
        return unauthorized();
      }
      if (path.endsWith("/locks/verify")) {
        if (!authed) {
          return unauthorized();
        }
        await Bun.sleep(SLOW_MS);
        return new Response(JSON.stringify({ ours: [], theirs: [] }), {
          headers: LFS_JSON,
        });
      }
      const object = OBJECT_PATH.exec(path)?.[1];
      if (object && request.method === "PUT") {
        objects.set(object, await request.arrayBuffer());
        return new Response(null, { status: 200 });
      }
      if (object) {
        const held = objects.get(object);
        return held
          ? new Response(held)
          : new Response("no such object", { status: 404 });
      }
      const { operation, objects: wanted = [] } = (await request.json()) as {
        objects?: { oid: string; size: number }[];
        operation?: string;
      };
      await Bun.sleep(SLOW_MS);
      const href = (oid: string): { href: string } => ({
        href: `${address}/lfs/objects/${oid}`,
      });
      return new Response(
        JSON.stringify({
          transfer: "basic",
          objects: wanted.map(({ oid, size }) => {
            if (objects.has(oid)) {
              return operation === "download"
                ? { oid, size, actions: { download: href(oid) } }
                : { oid, size };
            }
            return operation === "download"
              ? { oid, size, error: { code: 404, message: "no such object" } }
              : { oid, size, actions: { upload: href(oid) } };
          }),
        }),
        { headers: LFS_JSON }
      );
    },
  });
  const address = `http://127.0.0.1:${server.port}`;
  return { address, asked, stop: () => server.stop(true) };
};

interface ItemRow {
  error: string | null;
  result: string | null;
  state: string;
  workspace_id: string;
}

const run = async (kit: Kit) => {
  const { check } = kit;
  check(
    "git-lfs is on this host's PATH, so the git door runs it before a push",
    Boolean(Bun.which("git-lfs")),
    process.env.PATH ?? ""
  );

  /** The LFS server the project's own `.lfsconfig` names. */
  const named = lfsMock(false);
  /** The one D's `.lfsconfig` names for pushes: every request 401. */
  const refusing = lfsMock(true);
  try {
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
    const hub = `http://127.0.0.1:${fleet.env.CAWCO_HUB_PORT}`;
    // The machine's own credential for each mock, as gh's is for GitHub:
    // git-lfs asks it only after a 401.
    const helper = `"!f() { echo username=probe; echo password=probe; }; f"`;
    await writeFile(
      join(home, ".gitconfig"),
      `[user]\n\tname = Owner\n\temail = owner@probe.test\n[credential "${named.address}"]\n\thelper = ${helper}\n[credential "${refusing.address}"]\n\thelper = ${helper}\n`
    );
    const env = { ...process.env, HOME: home };
    const newRepo = async (dir: string, lfsconfig?: string) => {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "README.md"), "cut-off probe\n");
      if (lfsconfig) {
        await writeFile(join(dir, ".lfsconfig"), lfsconfig);
      }
      await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
        .cwd(dir)
        .env(env)
        .quiet();
    };
    const repo = join(fleet.sandbox, "code");
    await newRepo(repo, `[lfs]\n\turl = ${named.address}/lfs\n`);
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Landing cut-off",
      machineId: MACHINE,
      cwd: repo,
    });
    const otherRepo = join(fleet.sandbox, "other");
    await newRepo(otherRepo);
    const other = await fleet.api<{ id: string }>("/api/projects", {
      name: "Another project",
      machineId: MACHINE,
      cwd: otherRepo,
    });
    COMMIT.D = [
      `printf '[lfs]\\n\\turl = %s\\n\\tpushurl = %s\\n' '${hub}/git/${other.id}.git/info/lfs' '${refusing.address}/lfs' > .lfsconfig`,
      "git add .lfsconfig",
      ...largeFile("large-d.bin", D_BYTES, "d"),
    ].join(" && ");
    const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
    const mainLog = async () =>
      (await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text())
        .trim()
        .split("\n");
    const lfsLines = async (projectId: string, what = "") =>
      (await fleet.logs("hub"))
        .split("\n")
        .filter(
          (line) =>
            line.includes("[lfs]") &&
            line.includes(what) &&
            line.includes(`for ${projectId}`)
        );
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    /** The key the host writes into C's clone config before it finishes, as git-lfs did. */
    const written: Partial<Record<Tag, [string, string]>> = {
      C: [`lfs.${named.address}/lfs.access`, "basic"],
    };
    /** B's clone config, replaced as its large file's upload lands in the hub's store. */
    let replaceOnUpload: string | undefined;
    const uploads = join(fleet.sandbox, "hub", "lfs", "tmp");
    await mkdir(uploads, { recursive: true });
    const watcher = watch(uploads, () => {
      const config = replaceOnUpload;
      replaceOnUpload = undefined;
      if (config) {
        replaceInPlace(config).catch((error: unknown) =>
          console.error(`B's config could not be replaced: ${String(error)}`)
        );
      }
    });

    /** Delegates `tag`, waits until it is ready to finish, arms it, and answers its item once it ended. */
    const delegate = async (tag: Tag) => {
      const item = await fleet.api<{ workItemId: string }>("/api/work-items", {
        parentInstanceId: parent,
        title: `Commit and land ${tag}`,
        prompt: `PROBE-CUTOFF-${tag}: commit, then finish.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: repo,
      });
      const itemOf = () =>
        fleet.query<ItemRow>(
          "SELECT state, error, result, workspace_id FROM work_items WHERE id = ?",
          item.workItemId
        )[0];
      const sleeping =
        tag === "A"
          ? await until("A's background sleep runs", sleepPid, Boolean, 300_000)
          : undefined;
      /**
       * The init of each sandbox workspace `id` runs now: the second word of
       * each generation's `sandbox` file (agent boundary.ts `generationDir`,
       * boundary-host.ts `placeFile`).
       */
      const innersOf = async (id: string): Promise<string[]> => {
        const generations = join(
          home,
          ".cawco",
          "workspaces",
          id,
          "boundaries"
        );
        const gens = await readdir(generations).catch(() => [] as string[]);
        const read = await Promise.all(
          gens.map((gen) =>
            readFile(join(generations, gen, "sandbox"), "utf8").catch(() => "")
          )
        );
        return read.flatMap((text) => text.split(" ")[1] ?? []);
      };
      const workspace = await until(
        `${tag}'s workspace and its sandbox`,
        async () => {
          const id = itemOf()?.workspace_id;
          return id && (await innersOf(id)).length > 0 ? id : undefined;
        },
        Boolean,
        300_000
      );
      const [where] = fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        workspace
      );
      const clone = where?.path ?? "";
      const config = join(clone, ".git", "config");
      const inners = () => innersOf(workspace);
      const restarts = async () =>
        (await fleet.logs("agent"))
          .split("\n")
          .filter(
            (line) =>
              line.includes(workspace.slice(0, 8)) && line.includes(RESTARTED)
          );
      /** The agent's lines that close this workspace's boundary (boundary.ts `closeBoundary`, the quiet close). */
      const closes = async () =>
        (await fleet.logs("agent"))
          .split("\n")
          .filter(
            (line) =>
              line.includes(`[workspace] ${workspace}:`) && CLOSED.test(line)
          );
      const before = {
        inode: (await stat(config)).ino,
        text: await readFile(config, "utf8"),
        inner: (await inners())[0],
        restarts: (await restarts()).length,
      };
      if (tag === "B") {
        replaceOnUpload = config;
      }
      const key = written[tag];
      if (key) {
        await Bun.$`git config --file ${config} ${key[0]} ${key[1]}`.quiet();
      }
      steps[tag].armed = true;
      const row = await until(
        `${tag}'s item ended`,
        itemOf,
        (one) => ["done", "failed", "cancelled"].includes(one.state),
        600_000
      );
      return {
        clone,
        row,
        result: row.result ?? "",
        said: `${row.state} ${row.error ?? ""}\n${(row.result ?? "").slice(0, 1500)}`,
        inode: { before: before.inode, after: (await stat(config)).ino },
        text: { before: before.text, after: await readFile(config, "utf8") },
        inner: { before: before.inner, after: await inners() },
        restarted: (await restarts()).slice(before.restarts),
        closed: await closes(),
        sleepAlive: sleeping === undefined ? undefined : alive(sleeping),
        sleeping,
      };
    };
    const onMain = async (tag: Tag) => {
      const subject = `Delegate commit ${tag}`;
      return await until(
        `${tag}'s commit on the hub's main`,
        mainLog,
        (subjects) => subjects.includes(subject),
        30_000
      )
        .then((subjects) => ({ ok: true, subjects }))
        .catch(async () => ({ ok: false, subjects: await mainLog() }));
    };
    /**
     * No restart said, and the sandbox the item started with still runs, or
     * none runs and the agent says it closed the workspace's boundary: the
     * hub settles a workspace whose item ended and that nothing holds.
     */
    const sameSandbox = (one: Awaited<ReturnType<typeof delegate>>) =>
      Boolean(one.inner.before) &&
      one.restarted.length === 0 &&
      (one.inner.after.includes(one.inner.before ?? "") ||
        (one.inner.after.length === 0 && one.closed.length > 0));
    const sandboxSaid = (one: Awaited<ReturnType<typeof delegate>>) =>
      `inner ${one.inner.before} -> ${one.inner.after.join(", ") || "none"}\n${[...one.restarted, ...one.closed].join("\n")}`;

    // A
    const a = await delegate("A");
    check(
      "A: the item is done, its report saying it landed on main",
      a.row.state === "done" && a.result.includes("Landed on main at"),
      a.said
    );
    const aMain = await onMain("A");
    check(
      "A: its commit is on the hub's main",
      aMain.ok,
      aMain.subjects.join(" | ")
    );
    check(
      "A: the clone's .git/config is the file it was: nothing on the host rewrote it",
      a.inode.after === a.inode.before,
      `inode ${a.inode.before} -> ${a.inode.after}; the .lfsconfig's LFS server was asked: ${named.asked.join(", ") || "nothing"}`
    );
    check(
      "A: the workspace's sandbox is the one it was, and the agent says no restart",
      sameSandbox(a),
      sandboxSaid(a)
    );
    check(
      "A: the delegate's background command still runs",
      a.sleepAlive === true,
      `pid ${a.sleeping}`
    );

    // B
    const b = await delegate("B");
    watcher.close();
    check(
      "B: the host replaced the clone's .git/config mid-push, and the agent says the sandbox restarted",
      b.inode.after !== b.inode.before && b.restarted.length > 0,
      `inode ${b.inode.before} -> ${b.inode.after}\n${b.restarted.join("\n") || "no restart said"}`
    );
    check(
      "B: the item is done all the same, its report saying it landed on main",
      b.row.state === "done" && b.result.includes("Landed on main at"),
      b.said
    );
    const bMain = await onMain("B");
    check(
      "B: its commit is on the hub's main",
      bMain.ok,
      bMain.subjects.join(" | ")
    );

    // C
    const c = await delegate("C");
    check(
      "C: nothing ahead of main, its fetch refused for git-lfs's key in its config: the item is done, nothing to land",
      c.row.state === "done" && c.result.includes("Nothing to land"),
      c.said
    );

    // D, then E's workspace cut from the main D landed on
    const d = await delegate("D");
    check(
      "D: the item is done, its report saying it landed on main",
      d.row.state === "done" && d.result.includes("Landed on main at"),
      d.said
    );
    const dMain = await onMain("D");
    check(
      "D: its commit is on the hub's main",
      dMain.ok,
      dMain.subjects.join(" | ")
    );
    check(
      "D: the clone's .git/config is the file it was, its bytes unchanged",
      d.inode.after === d.inode.before && d.text.after === d.text.before,
      `inode ${d.inode.before} -> ${d.inode.after}\n${d.text.after}`
    );
    check(
      "D: its sandbox never restarted: the one it started with runs, or ran until the agent closed its boundary",
      sameSandbox(d),
      sandboxSaid(d)
    );
    const downloadsBefore = (await lfsLines(project.id, "batch download"))
      .length;
    const e = await delegate("E");
    const held = await readFile(join(e.clone, "large-d.bin"), "utf8").catch(
      (error: unknown) => `not read: ${String(error)}`
    );
    const downloads = (await lfsLines(project.id, "batch download")).slice(
      downloadsBefore
    );
    check(
      "E: its workspace was cut with D's large file, downloaded from the project's own repository on the hub, and its item is done, nothing to land",
      e.row.state === "done" &&
        e.result.includes("Nothing to land") &&
        held === "d".repeat(D_BYTES) &&
        downloads.length > 0,
      `${e.said}\nlarge-d.bin: ${held.slice(0, 80)} (${held.length} chars)\nhub: ${downloads.join("\n") || "no download batch for the project"}`
    );
    const toOther = await lfsLines(other.id);
    check(
      "D, E: the server D's .lfsconfig names for pushes was asked nothing, and the hub logs no LFS request for the other project",
      refusing.asked.length === 0 && toOther.length === 0,
      `refusing mock: ${refusing.asked.join(", ") || "nothing"}\nhub, other project: ${toOther.join("\n") || "nothing"}`
    );
  } finally {
    named.stop();
    refusing.stop();
  }
};

export default { name: "landing-cutoff", run } satisfies Spec;
