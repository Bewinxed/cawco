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
 *   mid-push. The agent records the sandbox restarted (`host-restarted`). The cut-off push
 *   (137) is reported, not tried again (hub landing.ts `CUT_OFF`): main is
 *   read once after it, and the item ends done saying it landed when main
 *   holds its commit, else failed saying the push was cut off and main does
 *   not hold it; the hub saw one LFS upload batch for it.
 * - C, a fetch that fails: a delegate commits nothing, so its HEAD is on
 *   main already (as workspace a7dd050f's one commit was). Before it
 *   finishes, the host writes into its clone's config the `lfs.<url>.access`
 *   git-lfs left in the clones of 2026-10-17, a key the git door runs no git
 *   under (safe-git.ts `repositoryConfigProblem`), so the landing's fetch
 *   fails ("remote helper 'cawco' aborted session"). The item is not
 *   landed, the refusal naming the fetch in git's words: a ref the clone
 *   fetched before never stands in for a fetch that failed.
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
 * - F, a guard's restart ends the old sandbox whole: a delegate starts a
 *   `sleep` in the background, inside its sandbox. The spec reads the
 *   sandbox's outer bwrap and init (the generation's `sandbox` file,
 *   `OUTER INNER …`) and the sleep's host pid, then replaces the clone's
 *   `.git/config` on the host (a new inode), which drops its protected bind.
 *   The agent records the sandbox restarted; within 10 s the old init, the old
 *   outer bwrap and the sleep are gone (boundary-host.ts `kill`, sandbox-end.ts
 *   `endSandbox`: the init before the outer, never by `--die-with-parent`
 *   alone); a new sandbox runs, its init another
 *   live process; the item ends done.
 * - G, the host's own close ends its sandbox whole: the same, but the spec
 *   sends the srt host SIGTERM (its signal handler, then `finish`). Within
 *   10 s the old init, outer, sleep and the host itself are gone; the
 *   delegate's next command starts a new boundary, whose sandbox's init is
 *   another live process; the item ends done.
 *
 *   bun scripts/probe-kit/run.ts landing-cutoff
 */
import { existsSync, readFileSync, watch } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  isAlive,
  listedPid,
  type Pid,
  signal,
} from "../../../packages/core/src/signal";
import { readRecord } from "../../../packages/core/src/state-file";
import { workWords } from "../../../packages/core/src/words/work";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { decisionsOf } from "../agent-records";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-CUTOFF-([ABCDEFG])/;
type Tag = "A" | "B" | "C" | "D" | "E" | "F" | "G";
/** Each background command (A's, F's, G's), found on the host by its argv. */
const SLEEP: Partial<Record<Tag, string[]>> = {
  A: ["sleep", "7311"],
  F: ["sleep", "7312"],
  G: ["sleep", "7313"],
};
/** How long a sandbox's processes get to be gone once it was ended. */
const GONE_MS = 10_000;
/**
 * The agent's decisions that end a boundary on purpose (boundary.ts
 * `BoundaryDecision`): closed quiet, an older one closed, or closed for good
 * as the workspace is archived or kept with its boundary closed.
 */
const CLOSED_ON_PURPOSE: readonly string[] = [
  "quiet-closed",
  "older-closed",
  "closed-for-good",
];
/** How long the first mock LFS server holds an answer it gives. */
const SLOW_MS = 4000;
/** A process's entry in `/proc`. */
const PID = /^\d+$/;
const LFS_JSON = { "content-type": "application/vnd.git-lfs+json" };
/** An object's own URL on a mock LFS server, which its batch answers name. */
const OBJECT_PATH = /^\/lfs\/objects\/([0-9a-f]{64})$/;
/** D's large file: what E's checkout must hold. */
const D_BYTES = 1_048_576;
/** E's first command: the sha256 of the large file its checkout holds, as one line. */
const READ_E =
  "printf 'LARGE-D-SHA %s\\n' \"$(shasum -a 256 large-d.bin | cut -d' ' -f1)\"";
/** That line, as E's command printed it. */
const SHA_SAID = /LARGE-D-SHA [0-9a-f]{64}/;

/** The shell that commits a large file `name` of `bytes` copies of `char`, its object in the clone's store. */
const largeFile = (name: string, bytes: number, char: string): string[] => [
  `head -c ${bytes} /dev/zero | tr '\\0' ${char} > obj`,
  'oid=$(shasum -a 256 obj | cut -d" " -f1)',
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
  // E's first step reads its large file instead ({@link READ_E}).
  E: {
    armed: false,
    background: true,
    committed: false,
    finished: false,
    searched: false,
  },
  // F and G commit nothing, and run a sleep in the background.
  F: {
    armed: false,
    background: false,
    committed: true,
    finished: false,
    searched: false,
  },
  G: {
    armed: false,
    background: false,
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
    return tool(
      "Bash",
      tag === "E"
        ? { command: READ_E, description: "Read the large file" }
        : {
            command: `${COMMIT[tag] ?? "true"} && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
            description: "Commit",
          }
    );
  }
  if (!step.background) {
    step.background = true;
    return tool("Bash", {
      command: (SLEEP[tag] ?? []).join(" "),
      description: "Run in the background",
      run_in_background: true,
    });
  }
  if (!step.armed) {
    return tool("Bash", { command: "sleep 1", description: "Wait" });
  }
  if (!step.finished && request.toolNames.includes(FINISH)) {
    step.finished = true;
    // E reports what its checkout held, read in its own session: its clone
    // may be archived by the time the spec looks.
    const read = tag === "E" ? (SHA_SAID.exec(request.all)?.[0] ?? "") : "";
    return tool(FINISH, {
      headline: `Committed ${tag}.`,
      summary: `Committed ${tag}.\n\n${read ? `${read}\n\n` : ""}Not run: none.`,
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

/** The host pid of the process whose argv is `argv` (one of {@link SLEEP}), if one runs. */
const sleepPid = async (command: string[]): Promise<Pid | undefined> => {
  const wanted = `${command.join("\0")}\0`;
  for (const pid of await readdir("/proc")) {
    if (!PID.test(pid)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one scan, stopped at the first match
    const argv = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
    if (argv === wanted) {
      return listedPid(Number(pid));
    }
  }
};

/** Whether `pid` is a live process now: there, and not a zombie its parent has yet to reap. */
const liveNow = (pid: number): boolean => {
  try {
    const line = readFileSync(`/proc/${pid}/stat`, "utf8");
    return line.at(line.lastIndexOf(")") + 2) !== "Z";
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

/** A workspace's boundary as its files name it ({@link boundaryOf}). */
interface Boundary {
  gen: string;
  host: number;
  inner: number;
  outer: number;
}

/**
 * Workspace `id`'s current boundary as its files name it: its srt host's
 * pid and generation (`boundary.json`, agent boundary.ts `readHeld`), and
 * its sandbox's outer bwrap and init (the generation's `sandbox` file,
 * boundary-host.ts `placeFile`). Undefined while it has none.
 */
const boundaryOf = async (
  home: string,
  id: string
): Promise<Boundary | undefined> => {
  const state = join(home, ".cawco", "workspaces", id);
  const held = await readRecord<{ gen: string; pid: number }>(
    join(state, "boundary.json")
  ).catch(() => undefined);
  if (!held) {
    return;
  }
  const [outer, inner] = (
    await readFile(
      join(state, "boundaries", held.gen, "sandbox"),
      "utf8"
    ).catch(() => "")
  )
    .trim()
    .split(" ")
    .map(Number);
  return outer && inner
    ? { gen: held.gen, host: held.pid, outer, inner }
    : undefined;
};

/** What a delegate's hook is given, after its sleep runs and before it is let finish. */
interface Armed {
  config: string;
  /** The scratch fleet's HOME, under which its workspaces' state is. */
  home: string;
  restarts: () => Promise<string[]>;
  sleeping: Pid | undefined;
  workspace: string;
}

/**
 * Ends `tag`'s sandbox with `end` and reads what is left: whether its old
 * init, outer bwrap and background sleep (and with `host`, its srt host)
 * are gone within {@link GONE_MS}, and the sandbox that runs after.
 */
const endsWhole = async (
  tag: Tag,
  { home, workspace, sleeping }: Armed,
  end: (old: Boundary) => Promise<unknown>,
  host: boolean
) => {
  const old = await boundaryOf(home, workspace);
  if (!(old && sleeping)) {
    return {
      said: `no boundary or sleep read: ${JSON.stringify(old)}, sleep ${sleeping}`,
      gone: false,
      fresh: undefined,
      ended: undefined,
    };
  }
  const watched = [old.inner, old.outer, sleeping, ...(host ? [old.host] : [])];
  const ended = await end(old);
  const gone = await until(
    `${tag}'s old sandbox gone`,
    () => (watched.some(liveNow) ? undefined : true),
    Boolean,
    GONE_MS
  ).catch(() => false);
  const fresh = await until(
    `${tag}'s new sandbox runs`,
    async () => {
      const now = await boundaryOf(home, workspace);
      return now && now.inner !== old.inner && liveNow(now.inner)
        ? now
        : undefined;
    },
    Boolean,
    120_000
  ).catch(() => undefined);
  return {
    said: `old: host ${old.host}, gen ${old.gen}, outer ${old.outer}, init ${old.inner}, sleep ${sleeping}; still running after ${GONE_MS / 1000} s: ${watched.filter(liveNow).join(", ") || "none"}; new: ${fresh ? `gen ${fresh.gen}, outer ${fresh.outer}, init ${fresh.inner}` : "none"}`,
    gone,
    fresh,
    ended,
  };
};

/** F's hook: a guarded path replaced on the host, which the srt host's guard answers with a restart. */
const guardRestart = async (armed: Armed) => {
  const said = (await armed.restarts()).length;
  return await endsWhole(
    "F",
    armed,
    async () => {
      // A new inode where the sandbox binds `.git/config`: its bind drops,
      // and the host's guard restarts the sandbox.
      await replaceInPlace(armed.config);
      return await until(
        "F's restart recorded",
        async () => (await armed.restarts()).at(said),
        Boolean,
        60_000
      ).catch(() => undefined);
    },
    false
  );
};

/** G's hook: the srt host its record names sent SIGTERM (its handler, then `finish`). */
const hostClose = (armed: Armed) =>
  endsWhole(
    "G",
    armed,
    async (old) => {
      const argv = await readFile(`/proc/${old.host}/cmdline`, "utf8").catch(
        () => ""
      );
      // Only the srt host its record names: a checkout's boundary-host.ts, a
      // binary install's srt/host.js.
      if (!(argv.includes("boundary-host") || argv.includes("host.js"))) {
        return `pid ${old.host} is not the srt host: ${argv.replaceAll("\0", " ")}`;
      }
      return signal(listedPid(old.host), "SIGTERM");
    },
    true
  );

/** What F's or G's hook read, as its check says it. */
const endedWhole = (
  hooked: Awaited<ReturnType<typeof endsWhole>> | undefined,
  sent: (ended: unknown) => boolean
): { ok: boolean; said: string } => ({
  ok:
    hooked !== undefined &&
    sent(hooked.ended) &&
    hooked.gone &&
    hooked.fresh !== undefined,
  said: `${String(hooked?.ended ?? "nothing ended it")}\n${hooked?.said ?? ""}`,
});

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
    const delegate = async <T = undefined>(
      tag: Tag,
      /** Run once its background sleep runs, before it is let finish. */
      hook?: (armed: Armed) => Promise<T>
    ) => {
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
      const argv = SLEEP[tag];
      const sleeping = argv
        ? await until(
            `${tag}'s background sleep runs`,
            () => sleepPid(argv),
            Boolean,
            300_000
          )
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
      /**
       * Each restart of the workspace's sandbox its srt host made for a
       * guarded path changed on the host, as the agent records it
       * (`host-restarted`, agent boundary.ts `BoundaryDecision`), by the
       * host's own time. Kept as each is read: an archive takes the
       * workspace's state dir, its decisions with it.
       */
      const restartsSeen = new Map<number, string>();
      const restarts = async () => {
        for (const one of await decisionsOf(home, workspace)) {
          if (one.decision === "host-restarted") {
            restartsSeen.set(one.hostAt, JSON.stringify(one));
          }
        }
        return [...restartsSeen.values()];
      };
      /** Every line the agent said of this workspace: words for a failing check's detail. */
      const told = async () =>
        (await fleet.logs("agent"))
          .split("\n")
          .filter((line) => line.includes(`[workspace] ${workspace}:`));
      /** Whether the agent recorded ending a boundary of this workspace on purpose ({@link CLOSED_ON_PURPOSE}), or its state dir is gone with an archive. */
      const closedByAgent = async () =>
        !existsSync(join(home, ".cawco", "workspaces", workspace)) ||
        (await decisionsOf(home, workspace)).some((one) =>
          CLOSED_ON_PURPOSE.includes(one.decision)
        );
      /** The hub's own record of the workspace: `held` or `archived` once it closed it on its machine. */
      const stateOf = () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM workspaces WHERE id = ?",
          workspace
        )[0]?.state ?? "gone";
      /**
       * Once no sandbox runs: whether its boundary was closed on purpose, the
       * hub's record settled (`held`, `archived`) or the agent recording it
       * closed it ({@link closedByAgent}), within a minute of the item's end: the
       * hub settles a workspace whose item ended and that nothing holds.
       */
      const closedOnPurpose = () =>
        until(
          `${tag}'s workspace settled or its boundary recorded closed`,
          async () =>
            ["held", "archived"].includes(stateOf()) ||
            (await closedByAgent()) ||
            undefined,
          Boolean,
          60_000
        ).catch(() => false);
      // The sandbox its session runs in, read once the session works there
      // (its first command asked for), from the boundary the record names:
      // the one a later restart would replace (boundary-starts-once proves
      // the cut's own is it).
      await until(
        `${tag}'s session at work in its workspace`,
        () => steps[tag].committed || undefined,
        Boolean,
        300_000
      );
      const current = await boundaryOf(home, workspace);
      const before = {
        inode: (await stat(config)).ino,
        text: await readFile(config, "utf8"),
        inner: current ? String(current.inner) : undefined,
        restarts: (await restarts()).length,
      };
      if (tag === "B") {
        replaceOnUpload = config;
      }
      const key = written[tag];
      if (key) {
        await Bun.$`git config --file ${config} ${key[0]} ${key[1]}`.quiet();
      }
      const hooked = hook
        ? await hook({ config, home, restarts, sleeping, workspace })
        : undefined;
      steps[tag].armed = true;
      const row = await until(
        `${tag}'s item ended`,
        async () => {
          // Read at each look, before its archive can take them.
          await restarts();
          return itemOf();
        },
        (one) => ["done", "failed", "cancelled"].includes(one.state),
        600_000
      );
      const ended = {
        inode: (await stat(config).catch(() => undefined))?.ino,
        text: await readFile(config, "utf8").catch(() => "(gone)"),
        inner: await inners(),
      };
      const closed = ended.inner.length === 0 ? await closedOnPurpose() : false;
      return {
        clone,
        row,
        result: row.result ?? "",
        said: `${row.state} ${row.error ?? ""}\n${(row.result ?? "").slice(0, 1500)}`,
        inode: { before: before.inode, after: ended.inode },
        text: { before: before.text, after: ended.text },
        inner: { before: before.inner, after: ended.inner },
        restarted: (await restarts()).slice(before.restarts),
        closed,
        state: stateOf(),
        told: await told(),
        sleepAlive: sleeping === undefined ? undefined : isAlive(sleeping),
        sleeping,
        hooked,
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
     * none runs and its boundary was closed on purpose ({@link closedOnPurpose}).
     */
    const sameSandbox = (one: Awaited<ReturnType<typeof delegate>>) =>
      Boolean(one.inner.before) &&
      one.restarted.length === 0 &&
      (one.inner.after.includes(one.inner.before ?? "") ||
        (one.inner.after.length === 0 && one.closed));
    const sandboxSaid = (one: Awaited<ReturnType<typeof delegate>>) =>
      `inner ${one.inner.before} -> ${one.inner.after.join(", ") || "none"}; the hub's record: ${one.state}\nthe agent on this workspace:\n${one.told.join("\n") || "(nothing)"}`;

    // A
    const a = await delegate("A");
    check(
      "A: the item is done, its report saying it landed on main",
      a.row.state === "done" &&
        a.result.includes(`${workWords.landedOn("main")} at`),
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
    const uploadsBefore = (await lfsLines(project.id, "batch upload")).length;
    const b = await delegate("B");
    watcher.close();
    const bUploads = (await lfsLines(project.id, "batch upload")).slice(
      uploadsBefore
    );
    check(
      "B: the host replaced the clone's .git/config mid-push, and the agent records the sandbox restarted",
      b.inode.after !== b.inode.before && b.restarted.length > 0,
      `inode ${b.inode.before} -> ${b.inode.after}\n${b.restarted.join("\n") || "no restart recorded"}`
    );
    const bMain = await onMain("B");
    check(
      "B: the cut-off push is reported, not retried: main read once after it, the item done saying it landed when main held its commit, else failed saying the push was cut off and main does not hold it",
      (b.row.state === "done" &&
        b.result.includes(`${workWords.landedOn("main")} at`) &&
        bMain.ok) ||
        (b.row.state === "failed" &&
          `${b.row.error ?? ""}${b.result}`.includes(
            "the push to main was cut off, and main does not hold the commits"
          )),
      `${b.said}\nmain: ${bMain.subjects.join(" | ")}`
    );
    check(
      "B: one push went to the hub for it (one LFS upload batch), none tried again",
      bUploads.length === 1,
      bUploads.join("\n") || "no upload batch logged"
    );

    // C
    const c = await delegate("C");
    check(
      "C: nothing ahead of main, its fetch refused for git-lfs's key in its config: the item is not landed, the refusal naming the fetch in git's words, never a cached ref's \"nothing to land\"",
      c.row.state === "failed" &&
        `${c.row.error ?? ""}${c.result}`.includes(
          "Not landed: the fetch of origin/main"
        ) &&
        !c.result.includes("Nothing to land"),
      c.said
    );

    // D, then E's workspace cut from the main D landed on
    const d = await delegate("D");
    check(
      "D: the item is done, its report saying it landed on main",
      d.row.state === "done" &&
        d.result.includes(`${workWords.landedOn("main")} at`),
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
    const want = `LARGE-D-SHA ${new Bun.CryptoHasher("sha256").update("d".repeat(D_BYTES)).digest("hex")}`;
    const downloads = (await lfsLines(project.id, "batch download")).slice(
      downloadsBefore
    );
    check(
      "E: its workspace was cut with D's large file (its report gives the file's sha256, read in its own session), downloaded from the project's own repository on the hub, and its item is done, nothing to land",
      e.row.state === "done" &&
        e.result.includes("Nothing to land") &&
        e.result.includes(want) &&
        downloads.length > 0,
      `${e.said}\nwanted: ${want}\nhub: ${downloads.join("\n") || "no download batch for the project"}`
    );
    const toOther = await lfsLines(other.id);
    check(
      "D, E: the server D's .lfsconfig names for pushes was asked nothing, and the hub logs no LFS request for the other project",
      refusing.asked.length === 0 && toOther.length === 0,
      `refusing mock: ${refusing.asked.join(", ") || "nothing"}\nhub, other project: ${toOther.join("\n") || "nothing"}`
    );

    // F, a guard's restart; G, the srt host's own close
    const f = await delegate("F", guardRestart);
    const fEnded = endedWhole(f.hooked, Boolean);
    check(
      "F: a guard's restart: the agent records the sandbox restarted, its old init, outer bwrap and background sleep are gone within 10 s, and a new sandbox runs",
      fEnded.ok,
      fEnded.said
    );
    check(
      "F: its item ends done, nothing to land",
      f.row.state === "done",
      f.said
    );
    const g = await delegate("G", hostClose);
    const gEnded = endedWhole(g.hooked, (ended) => ended === "sent");
    check(
      "G: the srt host's own close (SIGTERM, then finish): its old init, outer bwrap, background sleep and the host are gone within 10 s, and the delegate's next command runs in a new sandbox",
      gEnded.ok,
      gEnded.said
    );
    check(
      "G: its item ends done, nothing to land",
      g.row.state === "done",
      g.said
    );
  } finally {
    named.stop();
    refusing.stop();
  }
};

export default {
  group: "Workspaces and what agents may touch",
  name: "landing-cutoff",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;
