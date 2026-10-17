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
 * gone on. There it was GitHub; here the project's repository names its LFS
 * server in `.lfsconfig`, a mock in this process that answers `locks/verify`
 * as GitHub did: 401 without a credential, then, with the one the machine's
 * credential helper gives, a slow 200.
 *
 * - A, the cause: a delegate commits a file, starts `sleep` in the
 *   background, then calls finish_item. Its item ends done, saying it
 *   landed; its commit is on the hub's main; the clone's `.git/config` is
 *   the file it was; the sandbox is the one it was (the agent's log says no
 *   restart); and its `sleep` still runs.
 * - B, the end state when a push is cut off all the same: a delegate commits
 *   a large file, so the door's `git lfs push` asks the mock for a batch
 *   and uploads it there (the mock keeps it, and C's checkout downloads it
 *   from there). The mock holds that answer {@link SLOW_MS}, and as the request
 *   comes it replaces the clone's `.git/config` on the host with the same
 *   bytes (a new inode, as any host write makes), standing in for whatever
 *   else may stop a sandbox mid-push. The agent's log says the sandbox
 *   restarted; the item ends done all the same, saying it landed, and its
 *   commit is on main.
 * - C, nothing to land: a delegate commits nothing, so its HEAD is on main
 *   already (as workspace a7dd050f's one commit was). Before it finishes,
 *   the host writes into its clone's config the `lfs.<url>.access` git-lfs
 *   left in the clones of 2026-10-17, a key the git door runs no git under
 *   (safe-git.ts `repositoryConfigProblem`), so the landing's fetch fails
 *   ("remote helper 'cawco' aborted session"). The item ends done, "Nothing
 *   to land".
 *
 *   bun scripts/probe-kit/run.ts landing-cutoff
 */
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-CUTOFF-([ABC])/;
type Tag = "A" | "B" | "C";
/** A's background command, found on the host by its argv. */
const SLEEP = ["sleep", "7311"];
/** The agent's words for a sandbox the host stopped (boundary-host.ts). */
const RESTARTED = "was changed on the host";
/** How long the mock LFS server holds an answer it gives. */
const SLOW_MS = 4000;
/** A process's entry in `/proc`. */
const PID = /^\d+$/;
const LFS_JSON = { "content-type": "application/vnd.git-lfs+json" };
/** An object's own URL on the mock LFS server, which its batch answers name. */
const OBJECT_PATH = /^\/lfs\/objects\/([0-9a-f]{64})$/;

/** What each delegate commits: A a plain file, B a large file's pointer with its object; C nothing. */
const COMMIT: Partial<Record<Tag, string>> = {
  A: "printf 'landed\\n' > landed.txt && git add landed.txt",
  B: [
    "printf 'large file\\n' > obj",
    'oid=$(sha256sum obj | cut -d" " -f1)',
    "size=$(wc -c < obj)",
    'mkdir -p ".git/lfs/objects/$(echo $oid | cut -c1-2)/$(echo $oid | cut -c3-4)"',
    'mv obj ".git/lfs/objects/$(echo $oid | cut -c1-2)/$(echo $oid | cut -c3-4)/$oid"',
    "printf 'version https://git-lfs.github.com/spec/v1\\noid sha256:%s\\nsize %s\\n' $oid $size > large.bin",
    "printf '*.bin filter=lfs diff=lfs merge=lfs -text\\n' > .gitattributes",
    "git add .gitattributes large.bin",
  ].join(" && "),
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
  // B runs nothing in the background; C commits nothing either.
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

  const mock = {
    asked: [] as string[],
    /** The large files pushed to it, by oid: a later checkout downloads them. */
    objects: new Map<string, ArrayBuffer>(),
    /** Its own address, once it listens. */
    server: "",
    /** B's clone config, replaced as the first batch request comes. */
    replace: undefined as string | undefined,
  };
  const lfs = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const authed = Boolean(request.headers.get("authorization"));
      mock.asked.push(`${path}${authed ? " (signed in)" : ""}`);
      if (path.endsWith("/locks/verify")) {
        if (!authed) {
          return new Response(
            JSON.stringify({
              message: "You must have push access to verify locks",
            }),
            {
              status: 401,
              headers: { ...LFS_JSON, "lfs-authenticate": 'Basic realm="p"' },
            }
          );
        }
        await Bun.sleep(SLOW_MS);
        return new Response(JSON.stringify({ ours: [], theirs: [] }), {
          headers: LFS_JSON,
        });
      }
      const object = OBJECT_PATH.exec(path)?.[1];
      if (object && request.method === "PUT") {
        mock.objects.set(object, await request.arrayBuffer());
        return new Response(null, { status: 200 });
      }
      if (object) {
        const held = mock.objects.get(object);
        return held
          ? new Response(held)
          : new Response("no such object", { status: 404 });
      }
      const { operation, objects = [] } = (await request.json()) as {
        objects?: { oid: string; size: number }[];
        operation?: string;
      };
      const { replace } = mock;
      mock.replace = undefined;
      if (replace) {
        await replaceInPlace(replace);
      }
      await Bun.sleep(SLOW_MS);
      // A store as the LFS batch API has it: an upload for each object it
      // lacks, a download for each it holds, and an error for one it lacks.
      const href = (oid: string): { href: string } => ({
        href: `${mock.server}/lfs/objects/${oid}`,
      });
      return new Response(
        JSON.stringify({
          transfer: "basic",
          objects: objects.map(({ oid, size }) => {
            if (mock.objects.has(oid)) {
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
    const server = `http://127.0.0.1:${lfs.port}`;
    mock.server = server;
    // The machine's own credential for the LFS server, as gh's is for
    // GitHub: git-lfs asks it only after a 401.
    await writeFile(
      join(home, ".gitconfig"),
      `[user]\n\tname = Owner\n\temail = owner@probe.test\n[credential "${server}"]\n\thelper = "!f() { echo username=probe; echo password=probe; }; f"\n`
    );
    const repo = join(fleet.sandbox, "code");
    await Bun.$`mkdir -p ${repo}`.quiet();
    await writeFile(join(repo, "README.md"), "cut-off probe\n");
    await writeFile(join(repo, ".lfsconfig"), `[lfs]\n\turl = ${server}/lfs\n`);
    const env = { ...process.env, HOME: home };
    await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
      .cwd(repo)
      .env(env)
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Landing cut-off",
      machineId: MACHINE,
      cwd: repo,
    });
    const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
    const mainLog = async () =>
      (await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text())
        .trim()
        .split("\n");
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    /** The key the host writes into C's clone config before it finishes, as git-lfs did. */
    const written: Partial<Record<Tag, [string, string]>> = {
      C: [`lfs.${server}/lfs.access`, "basic"],
    };

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
      const config = join(where?.path ?? "", ".git", "config");
      const inners = () => innersOf(workspace);
      const restarts = async () =>
        (await fleet.logs("agent"))
          .split("\n")
          .filter(
            (line) =>
              line.includes(workspace.slice(0, 8)) && line.includes(RESTARTED)
          );
      const before = {
        inode: (await stat(config)).ino,
        inner: (await inners())[0],
        restarts: (await restarts()).length,
      };
      if (tag === "B") {
        mock.replace = config;
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
        row,
        result: row.result ?? "",
        said: `${row.state} ${row.error ?? ""}\n${(row.result ?? "").slice(0, 1500)}`,
        inode: { before: before.inode, after: (await stat(config)).ino },
        inner: { before: before.inner, after: await inners() },
        restarted: (await restarts()).slice(before.restarts),
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
      `inode ${a.inode.before} -> ${a.inode.after}; the mock LFS server was asked: ${mock.asked.join(", ") || "nothing"}`
    );
    check(
      "A: the workspace's sandbox is the one it was, and the agent says no restart",
      Boolean(a.inner.before) &&
        a.inner.after.includes(a.inner.before ?? "") &&
        a.restarted.length === 0,
      `inner ${a.inner.before} -> ${a.inner.after.join(", ") || "none"}\n${a.restarted.join("\n")}`
    );
    check(
      "A: the delegate's background command still runs",
      a.sleepAlive === true,
      `pid ${a.sleeping}`
    );

    // B
    const b = await delegate("B");
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
  } finally {
    lfs.stop(true);
  }
};

export default { name: "landing-cutoff", run } satisfies Spec;
