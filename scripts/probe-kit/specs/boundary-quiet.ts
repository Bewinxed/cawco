/**
 * A workspace's boundary runs only while something holds it (agent
 * boundary.ts `liveWhy`): a session attached, a live work item, a shown
 * preview of a server in it, a command. On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model), boundaries included:
 * run it where a workspace boundary can start (not inside another one).
 *
 * Twenty delegates (I0–I19) each run one command and finish; a twenty-first
 * (P) starts a server in its workspace, shows it as a preview, and finishes.
 * The hub puts each finished delegate to sleep.
 *
 * 1. Agent restart before the quiet time: no idle workspace's boundary is
 *    started again or handed over, five of them given an older form first
 *    (an account added to their policy, as a session on another account
 *    would): each keeps the boundary process it had, and the start-up line
 *    leaves them as they are.
 * 2. After `QUIET_CLOSE_MS` (and a sweep's minute), every idle workspace's
 *    boundary and judge are closed, each said in the agent's log, its clone,
 *    state dir and scratch dir standing. P's stays up and its preview still
 *    serves the page.
 * 3. The footprint, before and after: boundary and judge processes with
 *    everything under them, and the inotify instances they hold.
 * 4. A message to I0's sleeping session: it wakes, its boundary starts again
 *    and its first command runs inside it.
 * 5. A message to I1's: it wakes, starts a server in its workspace and shows
 *    it; the preview serves the page.
 * 6. Agent restart after the closes: no closed workspace's boundary starts.
 *
 *   bun scripts/probe-kit/run.ts boundary-quiet
 */
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  readlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { QUIET_CLOSE_MS } from "../../../packages/agent/src/boundary";
import { isBoundaryOf, isJudgeOf } from "../../../packages/agent/src/proc-id";
import { OVERLAY_PATH } from "../../../packages/core/src/preview-proxy";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const IDLE = 20;
/** The idle workspaces given an older form before the first restart. */
const RE_FORMED = 5;
/** How many delegates run at once. Ours: a scratch machine's share of Claude Code processes. */
const AT_ONCE = 7;
const FINISH = "mcp__cawco__finish_item";
const CREATE = "mcp__cawco__artifact_create";
const TAG = /PROBE-QUIET-(?:AGAIN-|SERVE-)?(I\d+|P):/g;
const PID_NS = /pid:\[\d+\]/;
const WHITESPACE = /\s+/g;
/** P's server port and I1's, each in its own boundary's network. */
const PORT: Record<string, number> = { P: 47_611, I1: 47_612 };
/** A sweep's minute and the slack of a close, past the quiet time. */
const CLOSE_SLACK_MS = 3 * 60_000;
const ACCOUNT_ADDED = "acct-probe-older-form";
const CLOSED_LINE = ": nothing holds it (";
const START_LINE = "[workspace] boundary hooks written for ";
const LEFT_IDLE =
  /; (\d+) with a boundary running and nothing in it are left as they are/;

/** `word` as one single-quoted shell word. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

const titleOf = (tag: string) => `Quiet probe page ${tag}`;

/** A server on `PORT[tag]` of the boundary's loopback, left running in a session of its own; then a marker, spelled apart, once it answers. */
const serveCommand = (tag: string): string => {
  const port = PORT[tag] as number;
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${titleOf(tag)}</title></head><body>${titleOf(tag)}</body></html>`;
  const app = `Bun.serve({hostname:"127.0.0.1",port:${port},fetch:()=>new Response(${JSON.stringify(page)},{headers:{"content-type":"text/html"}})});`;
  return [
    `printf '%s' ${quoted(app)} > "$TMPDIR/quiet-app.js"`,
    `(setsid nohup bun "$TMPDIR/quiet-app.js" > "$TMPDIR/quiet-app.log" 2>&1 < /dev/null &)`,
    `for i in $(seq 100); do bun -e ${quoted(`await fetch("http://127.0.0.1:${port}/")`)} 2>/dev/null && echo "SERVER-""UP-${tag}:" && break; sleep 0.1; done`,
  ].join(" && ");
};

const steps = new Map<
  string,
  { finished?: boolean; searched?: boolean; shown?: boolean }
>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** A delegate's own work: its one command, or P's server and preview, then finish_item. */
const firstWork = (request: Seen, tag: string): Reply => {
  const step = steps.get(tag) ?? {};
  steps.set(tag, step);
  const has = (marker: string) => request.all.includes(marker);
  const serves = tag === "P" || has(`PROBE-QUIET-SERVE-${tag}:`);
  if (serves && !has(`SERVER-UP-${tag}:`)) {
    return tool("Bash", {
      command: serveCommand(tag),
      description: "Start the server",
    });
  }
  if (serves && !step.shown) {
    step.shown = true;
    return tool(CREATE, {
      kind: "preview",
      name: `quiet-${tag.toLowerCase()}`,
      port: PORT[tag],
    });
  }
  if (has(`PROBE-QUIET-SERVE-${tag}:`)) {
    return text("Shown.");
  }
  if (tag !== "P" && !has(`RAN-${tag}:`)) {
    return tool("Bash", {
      command: `echo "RAN-""${tag}:"`,
      description: "Run one command",
    });
  }
  if (!step.finished && request.toolNames.includes(FINISH)) {
    step.finished = true;
    return tool(FINISH, {
      headline: `${tag} ran its command.`,
      summary: `${tag} ran its command.`,
    });
  }
  if (
    !(step.finished || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("Done.");
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = [...request.all.matchAll(TAG)].at(-1)?.[1];
  if (!tag) {
    return text("ok");
  }
  if (request.all.includes(`PROBE-QUIET-AGAIN-${tag}:`)) {
    return request.all.includes(`AGAIN-DONE-${tag}:`)
      ? text("Ran it again.")
      : tool("Bash", {
          command: `echo "AGAIN-""DONE-${tag}:"; readlink /proc/self/ns/pid`,
          description: "Run again",
        });
  }
  return firstWork(request, tag);
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

interface Delegated {
  instanceId: string;
  tag: string;
  workItemId: string;
  workspaceId: string;
}

/** Every pid under `root`, itself included, read from /proc. */
const tree = async (root: number): Promise<number[]> => {
  const found: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    found.push(pid);
    // biome-ignore lint/performance/noAwaitInLoops: a breadth-first walk of /proc
    const tasks = await readdir(`/proc/${pid}/task`).catch(
      () => [] as string[]
    );
    const children = await Promise.all(
      tasks.map((task) =>
        readFile(`/proc/${pid}/task/${task}/children`, "utf8").catch(() => "")
      )
    );
    queue.push(
      ...children.flatMap((list) =>
        list.trim().split(" ").filter(Boolean).map(Number)
      )
    );
  }
  return found;
};

/** The inotify instances process `pid` holds. */
const inotifyOf = async (pid: number): Promise<number> => {
  const fds = await readdir(`/proc/${pid}/fd`).catch(() => [] as string[]);
  const links = await Promise.all(
    fds.map((fd) => readlink(`/proc/${pid}/fd/${fd}`).catch(() => ""))
  );
  return links.filter((link) => link === "anon_inode:inotify").length;
};

/** The workspaces' boundaries and judges as the keeper holds them, with every process under them and the inotify instances those hold. */
const footprint = async (fleet: Fleet) => {
  const held = await fleet.heldProcs();
  const boundaries = held.filter((proc) => proc.procId.startsWith("boundary-"));
  const judges = held.filter((proc) => proc.procId.startsWith("judge-"));
  const pids = new Set(
    (
      await Promise.all(
        [...boundaries, ...judges].map((proc) => tree(proc.pid))
      )
    ).flat()
  );
  const inotify = (await Promise.all([...pids].map(inotifyOf))).reduce(
    (sum, count) => sum + count,
    0
  );
  return {
    boundaries: boundaries.length,
    judges: judges.length,
    processes: pids.size,
    inotify,
    words: `${boundaries.length} boundaries, ${judges.length} judges, ${pids.size} processes under them, ${inotify} inotify instances`,
  };
};

/** Each workspace's boundary processes as the keeper holds them, by procId. */
const boundariesOf = async (fleet: Fleet, id: string): Promise<string[]> =>
  (await fleet.heldProcs())
    .filter((proc) => isBoundaryOf(proc.procId, id))
    .map((proc) => `${proc.procId}@${proc.pid}`);

/** The delegates among `among` whose boundary runs now. */
const stillOpen = async (
  fleet: Fleet,
  among: readonly Delegated[]
): Promise<Delegated[]> => {
  const held = await fleet.heldProcs();
  return among.filter((one) =>
    held.some((proc) => isBoundaryOf(proc.procId, one.workspaceId))
  );
};

/** Whether preview `instanceId`'s origin answers 200 with `tag`'s page and the overlay, within 30 s. */
const serving = async (
  fleet: Fleet,
  instanceId: string,
  tag: string
): Promise<{ ok: boolean; last: string }> => {
  let last = "nothing yet";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polls until it answers or the bound passes
      const address = await fetch(
        `${fleet.base}/api/instances/${instanceId}/preview-address`,
        { method: "POST" }
      );
      const { port } = (await address.json()) as { port?: number };
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.text();
      last = `${response.status}: ${body.replace(WHITESPACE, " ").slice(0, 160)}`;
      if (
        response.status === 200 &&
        body.includes(`<title>${titleOf(tag)}</title>`) &&
        body.includes(`src="${OVERLAY_PATH}"`)
      ) {
        return { ok: true, last };
      }
    } catch (error) {
      last = (error as Error).message;
    }
    await Bun.sleep(500);
  }
  return { ok: false, last };
};

/** Restarts the agent; answers its start-up pass's line once it is logged. */
const restart = async (fleet: Fleet): Promise<string> => {
  const before = (await fleet.logs("agent")).split(START_LINE).length;
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const log = await until(
    "the restarted agent's start-up pass",
    () => fleet.logs("agent"),
    (logged) => logged.split(START_LINE).length > before,
    120_000
  );
  return log.slice(log.lastIndexOf(START_LINE)).split("\n")[0] ?? "";
};

/** The fleet up, a project and its parent session, and every delegate's item done and its session asleep. */
const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo quiet > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Quiet",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  const delegate = async (tag: string): Promise<Delegated> => {
    const started = await fleet.api<Omit<Delegated, "tag">>("/api/work-items", {
      parentInstanceId: parent,
      title: `Quiet ${tag}`,
      prompt: `PROBE-QUIET-${tag}: ${tag === "P" ? "start the server, show it, then finish" : "run one command, then finish"}.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
      checks: [{ name: "Probe check", command: "true" }],
    });
    return { ...started, tag };
  };
  const tags = [...Array.from({ length: IDLE }, (_, at) => `I${at}`), "P"];
  const batches = Array.from(
    { length: Math.ceil(tags.length / AT_ONCE) },
    (_, at) => tags.slice(at * AT_ONCE, (at + 1) * AT_ONCE)
  );
  const all: Delegated[] = [];
  for (const batch of batches) {
    // biome-ignore lint/performance/noAwaitInLoops: a batch of delegates at a time
    all.push(...(await Promise.all(batch.map(delegate))));
  }
  const items = () =>
    fleet.query<{ id: string; state: string }>(
      `SELECT id, state FROM work_items WHERE id IN (${all.map(() => "?").join(",")})`,
      ...all.map((one) => one.workItemId)
    );
  const ended = await until(
    "every work item ended",
    items,
    (rows) =>
      rows.every((row) => ["done", "failed", "cancelled"].includes(row.state)),
    900_000
  ).catch(items);
  const notDone = ended.filter((row) => row.state !== "done");
  kit.check(
    `the ${tags.length} work items are done`,
    ended.length === tags.length && notDone.length === 0,
    notDone.map((row) => `${row.id} ${row.state}`).join("; ") || "all done"
  );
  const statuses = () =>
    all.map((one) => ({
      tag: one.tag,
      status: fleet.instance(one.instanceId)?.status,
    }));
  const asleep = await until(
    "every delegate's session asleep",
    statuses,
    (rows) => rows.every((row) => row.status === "sleeping"),
    300_000
  ).catch(statuses);
  const awake = asleep.filter((row) => row.status !== "sleeping");
  kit.check(
    "the hub put every finished delegate to sleep",
    awake.length === 0,
    awake.map((row) => `${row.tag} ${row.status}`).join("; ") || "all asleep"
  );
  const idle = all.filter((one) => one.tag !== "P");
  const p = all.find((one) => one.tag === "P") as Delegated;
  kit.check(
    "P's preview serves its page before anything closes",
    (await serving(fleet, p.instanceId, "P")).ok
  );
  return { fleet, home, idle, p };
};

/** 1: a restart before the quiet time starts no idle boundary and hands none over, five of an older form. */
const firstRestart = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  idle: readonly Delegated[]
): Promise<void> => {
  const boundariesNow = async () =>
    new Map(
      await Promise.all(
        idle.map(
          async (one) =>
            [
              one.workspaceId,
              await boundariesOf(fleet, one.workspaceId),
            ] as const
        )
      )
    );
  const had = await boundariesNow();
  await Promise.all(
    idle.slice(-RE_FORMED).map(async (one) => {
      const file = join(
        home,
        ".cawco",
        "workspaces",
        one.workspaceId,
        "accounts.json"
      );
      const listed = JSON.parse(
        await readFile(file, "utf8").catch(() => "[]")
      ) as string[];
      await writeFile(file, `${JSON.stringify([...listed, ACCOUNT_ADDED])}\n`);
    })
  );
  const line = await restart(fleet);
  const after = await boundariesNow();
  const moved = idle.filter(
    (one) =>
      JSON.stringify(had.get(one.workspaceId)) !==
      JSON.stringify(after.get(one.workspaceId))
  );
  kit.check(
    `1: an agent restart starts no idle workspace's boundary and hands none over, ${RE_FORMED} of them of an older form: each keeps its one boundary process`,
    moved.length === 0 &&
      idle.every((one) => had.get(one.workspaceId)?.length === 1),
    moved
      .map(
        (one) =>
          `${one.tag}: ${had.get(one.workspaceId)?.join(",")} → ${after.get(one.workspaceId)?.join(",")}`
      )
      .join("; ") || "none moved"
  );
  kit.check(
    "1: its start-up line leaves the idle ones as they are",
    Number(LEFT_IDLE.exec(line)?.[1] ?? -1) >= IDLE,
    line
  );
};

/** 2: the idle ones close once quiet, their clones and state standing; P, previewed, stays. */
const quietCloses = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  idle: readonly Delegated[],
  p: Delegated
): Promise<void> => {
  const bound = QUIET_CLOSE_MS + CLOSE_SLACK_MS;
  const open = await until(
    "every idle workspace's boundary closed",
    () => stillOpen(fleet, idle),
    (left) => left.length === 0,
    bound
  ).catch(() => stillOpen(fleet, idle));
  const held = await fleet.heldProcs();
  const log = await fleet.logs("agent");
  const unsaid = idle.filter(
    (one) => !log.includes(`${one.workspaceId}${CLOSED_LINE}`)
  );
  const judged = idle.filter((one) =>
    held.some((proc) => isJudgeOf(proc.procId, one.workspaceId))
  );
  const tags = (list: readonly Delegated[]) =>
    list.map((one) => one.tag).join(",") || "none";
  kit.check(
    `2: within ${bound / 60_000} min of the restart, every idle workspace's boundary and judge are closed, each said in the agent's log`,
    open.length === 0 && judged.length === 0 && unsaid.length === 0,
    `open: ${tags(open)}; judges: ${tags(judged)}; unsaid: ${tags(unsaid)}`
  );
  const rows = fleet.query<{ id: string; path: string; tmp: string | null }>(
    `SELECT id, path, tmp FROM workspaces WHERE id IN (${idle.map(() => "?").join(",")})`,
    ...idle.map((one) => one.workspaceId)
  );
  const missing = rows.filter(
    (row) =>
      !(
        existsSync(join(row.path, ".git")) &&
        existsSync(join(home, ".cawco", "workspaces", row.id)) &&
        row.tmp &&
        existsSync(row.tmp)
      )
  );
  kit.check(
    "2: each closed workspace's clone, state dir and scratch dir stand",
    rows.length === IDLE && missing.length === 0,
    missing.map((row) => row.id).join(", ") || `${rows.length} stand`
  );
  const up = held.some((proc) => isBoundaryOf(proc.procId, p.workspaceId));
  const serves = await serving(fleet, p.instanceId, "P");
  kit.check(
    "2: P, with its preview shown, keeps its boundary, and the preview still serves its page",
    up && serves.ok,
    `boundary ${up ? "up" : "closed"}; ${serves.last}`
  );
};

/** 4 and 5: a continued session's first command, and a preview it opens, start its closed boundary again. */
const reopens = async (
  kit: Kit,
  fleet: Fleet,
  i0: Delegated,
  i1: Delegated
): Promise<void> => {
  const seenBefore = fleet.seen.length;
  await fleet.send(i0.instanceId, `PROBE-QUIET-AGAIN-${i0.tag}: run it again.`);
  const again = await until(
    "I0's command ran again",
    () =>
      fleet.seen
        .slice(seenBefore)
        .find((one) => one.all.includes(`AGAIN-DONE-${i0.tag}:`)),
    Boolean,
    240_000
  ).catch(() => undefined);
  const reopened = await boundariesOf(fleet, i0.workspaceId);
  const ns = PID_NS.exec(again?.body ?? "")?.[0] ?? "";
  const hostNs = await readlink("/proc/self/ns/pid");
  kit.check(
    "4: a message to I0's sleeping session wakes it, its boundary starts again, and its first command runs inside it",
    Boolean(again) && reopened.length === 1 && ns !== "" && ns !== hostNs,
    `ran: ${Boolean(again)}; boundary: ${reopened.join(",") || "none"}; its pid namespace ${ns || "unread"}, the host's ${hostNs}`
  );

  await fleet.send(
    i1.instanceId,
    `PROBE-QUIET-SERVE-${i1.tag}: start the server and show it.`
  );
  await until(
    "I1's server started and shown",
    () => steps.get(i1.tag)?.shown,
    Boolean,
    240_000
  ).catch(() => false);
  const serves = await serving(fleet, i1.instanceId, i1.tag);
  const boundary = await boundariesOf(fleet, i1.workspaceId);
  kit.check(
    "5: a message to I1's sleeping session starts its boundary again, a server in it, and its preview serves the page",
    serves.ok && boundary.length === 1,
    `boundary: ${boundary.join(",") || "none"}; ${serves.last}`
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
  const { fleet, home, idle, p } = await standUp(kit);
  const before = await footprint(fleet);
  await firstRestart(kit, fleet, home, idle);
  await quietCloses(kit, fleet, home, idle, p);

  // 3. The footprint, before and after.
  const after = await footprint(fleet);
  kit.check(
    "3: closing the idle boundaries takes their processes and inotify instances",
    after.processes < before.processes &&
      after.inotify < before.inotify &&
      after.boundaries === 1,
    `before: ${before.words}; after: ${after.words}`
  );
  kit.note(
    `3: footprint with ${IDLE} idle workspaces and P: before ${before.words}; after the closes ${after.words}`
  );

  const [i0, i1, ...rest] = idle as [Delegated, Delegated, ...Delegated[]];
  await reopens(kit, fleet, i0, i1);

  // 6. A restart after the closes opens none of them.
  const line = await restart(fleet);
  await Bun.sleep(5000);
  const reopenedByStart = await stillOpen(fleet, rest);
  kit.check(
    `6: after another agent restart, none of the ${rest.length} closed workspaces has a boundary`,
    reopenedByStart.length === 0,
    `${reopenedByStart.map((one) => one.tag).join(",") || "none"}; ${line}`
  );
};

const spec: Spec = {
  name: "boundary-quiet",
  run,
};

export default spec;
