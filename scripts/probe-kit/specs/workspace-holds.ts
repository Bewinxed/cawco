/**
 * A workspace is held only when it holds work that exists nowhere else and
 * that someone still has to decide about; everything else retires on its own
 * when its item ends, and every process started from it ends with it (hub
 * work-items.ts `settle`, `carriesOff`, `closeWorkspace`, `recut`; agent
 * workspace.ts `closeClone`, `refreshBase`, `endLeftInside`; core
 * own-commits.ts; delegation-actions.ts `stoppedHoldWords`). On 2026-10-23
 * 24 workspaces, about 50 GB, were held and settled by hand. On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model),
 * boundaries included: this spec delegates, so it runs on the host, outside
 * every boundary, on Linux and on macOS alike.
 *
 * (n) N lands none, commits a file and finishes done: its workspace retires,
 *     not held; its row names a carry in ~/.cawco/carries whose bundle has
 *     N's branch; its parent is told by a notice naming that carry. A
 *     handoff to N cuts its clone again with that commit at HEAD, and N
 *     reads it there.
 * (l) L commits a change and waits; X lands the same change on main as a
 *     commit of its own (another hash); L then finishes blocked, its commit
 *     on no remote: L's workspace retires, not held (its machine fetched
 *     main and matched the patch), its head at main's tip.
 * (s) S commits and runs on; its parent stops it with stop_delegate: the
 *     answer says its workspace holds 1 commit on no remote, is held, and
 *     names both ways out (continue it, discard_workspace); its workspace is
 *     then held.
 * (r) R, landing none, leaves a Go module cache's read-only tree in its
 *     $TMPDIR and finishes: its workspace retires, its scratch dir gone.
 * (d) D leaves a detached grandchild of its shell running (a double fork
 *     under nohup) from its clone, and the fleet's keeper runs a process on
 *     the host with its working directory in D's clone (a session's CLI the
 *     hub wrote off, which the boundary never started); D finishes: its
 *     workspace retires, both are gone, and the agent's log names the one
 *     it ended.
 * (o) A shell of the person's (started from outside the fleet, its parent
 *     alive) runs in O's clone: O's retirement leaves it running and waits,
 *     the hub's log naming it. Once the shell alone is killed, its `sleep`
 *     is an orphan, as a session's detached server is once its starter is
 *     gone: the next sweep ends it, names it in the agent's log, and
 *     retires O. On Linux O's path is the person's folder seen through O's
 *     view (agent layer.ts): the person's shell there runs outside the view,
 *     so O retires without waiting for it and it runs on; a sleep left
 *     orphaned in the view ends with O's retirement, named in the agent's
 *     log.
 *
 * Every read of a delegate's copy goes through ../copy.ts: on Linux its
 * path is the person's folder, and the delegate's work is in its view.
 * (c) P's carry holds an uncommitted diff beside its commits: a handoff
 *     cuts it again with the diff on top and says so; a diff that no
 *     longer applies is said, naming its file, and stays in the carry.
 * (u) macOS: U's clone holds a file its owner may not unlink (`chflags
 *     uchg`), so its removal stops part-way: the archive fails, said in the
 *     hub's log, and the row is never held for what the cut-off removal left
 *     (on 2026-10-23 a Mac workspace was held for 377 "deleted" files, whole
 *     top-level entries a removal had taken before it stopped); once the
 *     flag is gone, the next sweep retires it.
 * (t) The repository's own tree (this checkout's tracked files at its HEAD,
 *     as one commit: mocks/, artifacts/, .design-foundations/ and the rest
 *     that Mac workspace lost): T's cut
 *     has every tracked file on the host and inside its boundary (no ` D`
 *     line either way); T finishes blocked and its workspace retires, not
 *     held. A failure names the deleted paths by folder.
 *
 *   bun scripts/probe-kit/run.ts workspace-holds
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SessiondClient } from "../../../packages/agent/src/sessiond-client";
import { movedLine, restoredWords } from "../../../packages/core/src/injected";
import { commandLines } from "../../../packages/core/src/process-identity";
import { workWords } from "../../../packages/core/src/words/work";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { welcomed } from "../../lib/keeper-dial";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { copyArgv, copyGone, gitInCopy, inCopy, isView } from "../copy";
import type { Kit, KitFleet, Spec } from "../kit";

const TAG = /PROBE-HOLDS-([NLXSRDUOPT])\b/u;
type Tag = "N" | "L" | "X" | "S" | "R" | "D" | "U" | "O" | "P" | "T";
const FINISH = "mcp__cawco__finish_item";
const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm";
/** N's work after its handoff, and what it prints there. */
const AGAIN = "PROBE-HOLDS-N-AGAIN";
const AGAIN_READ = "AGAIN-READ-42";
/** The change L and X both make: the same file, the same text. */
const SAME_FILE = "same-change.txt";
const SAME_TEXT = "one change, landed twice";
/** What a waiting delegate's go is: a file the probe writes in its TMPDIR. */
const goFile = (tag: Tag) => `probe-go-${tag}`;
/** The sleeps whose arguments name the processes (d) leaves: inside the boundary, and on the host. */
const INSIDE_SLEEP = "7243";
const HOST_SLEEP = "7244";
/** The sleep of (o)'s shell of the person's. */
const OWNER_SLEEP = "7245";
/** The sleep (o) leaves orphaned in O's view on Linux. */
const VIEW_SLEEP = "7246";
/** P's two handoffs, and what it prints after the first. */
const P_AGAIN = "PROBE-HOLDS-P-AGAIN";
const P_THIRD = "PROBE-HOLDS-P-THIRD";
const P_READ = "P-READ-42";
/** What T prints of its tree as its boundary sees it. */
const INSIDE_SEEN = /T-INSIDE-(\d+)-END/u;
/** A workspace's settle: its session's sleep, then its machine's archive. */
const SETTLE_MS = 180_000;
/** An item's ask to its end. */
const ITEM_MS = 300_000;

/** A mark a command prints that its own text never holds. */
const said = (word: string) => `${word}-$((40+2))`;
const seen = (word: string) => `${word}-42`;

/** What each delegate's first command is. */
const firstCommand = (tag: Tag): string => {
  switch (tag) {
    case "N":
      return `echo n > held-N.txt && git add held-N.txt && ${COMMIT} 'Holds commit N' && echo ${said("MADE-N")}`;
    case "L":
    case "X":
      return `printf '%s\\n' '${SAME_TEXT}' > ${SAME_FILE} && git add ${SAME_FILE} && ${COMMIT} 'Same change by ${tag}' && echo ${said(`MADE-${tag}`)}`;
    case "S":
      return `echo s > held-S.txt && git add held-S.txt && ${COMMIT} 'Holds commit S' && echo ${said("MADE-S")}`;
    case "R":
      return `mkdir -p "$TMPDIR/gopath/pkg/mod/example.com/m@v1.0.0/sub" && echo package > "$TMPDIR/gopath/pkg/mod/example.com/m@v1.0.0/sub/m.go" && chmod -R a-w "$TMPDIR/gopath/pkg/mod" && echo ${said("MADE-R")}`;
    case "D":
      return `mkdir -p "$TMPDIR/d" && ( nohup sleep ${INSIDE_SLEEP} > /dev/null 2>&1 & ) && echo ${said("MADE-D")}`;
    case "U":
      return `printf 'junk/\\n' > .gitignore && mkdir -p junk && echo locked > junk/locked && git add .gitignore && ${COMMIT} 'Ignore junk' && echo ${said("MADE-U")}`;
    case "O":
      return `echo ${said("MADE-O")}`;
    case "P":
      return `echo p > held-P.txt && git add held-P.txt && ${COMMIT} 'Holds commit P' && echo ${said("MADE-P")}`;
    case "T":
      return `echo T-INSIDE-$(git status --porcelain | grep -c '^ D')-END && echo ${said("MADE-T")}`;
    default:
      return "true";
  }
};

/** Per delegate: whether it searched for finish_item, and how many times it called it. */
const steps: Partial<Record<Tag, { finishes: number; searched?: boolean }>> =
  {};
/** What the delegates printed that the probe reads. */
const read: {
  again?: string;
  inside?: number;
  moved2?: string;
  moved3?: string;
  p2?: string;
} = {};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** finish_item once more than `before` calls, after a ToolSearch for it when it is not offered. */
const finishOnce = (
  request: Seen,
  tag: Tag,
  before: number,
  input: object
): Reply => {
  const step = steps[tag] ?? { finishes: 0 };
  steps[tag] = step;
  if (step.finishes > before) {
    return text("done");
  }
  if (request.toolNames.includes(FINISH)) {
    step.finishes += 1;
    return tool(FINISH, input);
  }
  if (!step.searched && request.toolNames.includes("ToolSearch")) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

const done = (tag: Tag) => ({
  headline: `${tag} finished.`,
  summary: `${tag} finished.`,
});
const blocked = (tag: Tag) => ({
  headline: `${tag} stops here.`,
  summary: `${tag} stops here.`,
  blocked: { command: "probe", error: `${tag} stops here on purpose` },
});

/** N after its handoff: read HEAD's subject in the clone cut again, then finish again. */
const againTurn = (request: Seen): Reply => {
  if (!request.all.includes(AGAIN_READ)) {
    return tool("Bash", {
      command: "echo AGAIN-READ-$((40+2)) && git log -1 --format=%s",
      description: "Read HEAD",
    });
  }
  const at = request.all.lastIndexOf(AGAIN_READ);
  read.again = request.all.slice(at, at + 200);
  return finishOnce(request, "N", 1, done("N"));
};

/** A Bash step of P's that prints `mark` once done, unless it already did. */
const pStep = (
  request: Seen,
  mark: string,
  command: string
): Reply | undefined =>
  request.all.includes(seen(mark))
    ? undefined
    : tool("Bash", {
        command: `${command} && echo ${said(mark)}`,
        description: mark,
      });

/**
 * P: commits and finishes (landing none), then, past its finish, changes a
 * tracked file and leaves an untracked one: what a turn that ends without a
 * finish leaves (finish_item refuses a dirty tree). After its first
 * handoff it reads its tree, commits it, finishes, and leaves another
 * change; after its second it finishes.
 */
const pTurn = (request: Seen): Reply => {
  const finishes = steps.P?.finishes ?? 0;
  if (request.all.includes(P_THIRD)) {
    read.moved3 ||= movedIn(request.all);
    return finishOnce(request, "P", 2, done("P"));
  }
  if (request.all.includes(P_AGAIN)) {
    read.moved2 ||= movedIn(request.all);
    const reading = pStep(request, "P-READ", "git status --porcelain");
    if (reading) {
      return reading;
    }
    const at = request.all.lastIndexOf(P_READ);
    // The step prints its mark after git's lines: they stand before it.
    read.p2 ||= request.all.slice(Math.max(0, at - 400), at);
    if (finishes < 2) {
      return (
        pStep(
          request,
          "P-SAVED",
          `git add -A && ${COMMIT} 'P keeps its changes'`
        ) ?? finishOnce(request, "P", 1, done("P"))
      );
    }
    return (
      pStep(request, "P-DIRTY2", "echo 'changed again' >> README.md") ??
      text("done")
    );
  }
  if (finishes < 1) {
    return finishOnce(request, "P", 0, done("P"));
  }
  return (
    pStep(
      request,
      "P-DIRTY1",
      "echo 'changed by P' >> README.md && echo new > new-P.txt"
    ) ?? text("done")
  );
};

const waitFor = (tag: Tag): Reply =>
  tool("Bash", {
    command: `while [ ! -f "$TMPDIR/${goFile(tag)}" ]; do sleep 1; done; echo ${said(`WENT-${tag}`)}`,
    description: "Wait for the probe's go",
    timeout: 600_000,
  });

const respond = (request: Seen): Reply => {
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  if (!request.all.includes(seen(`MADE-${tag}`))) {
    return tool("Bash", { command: firstCommand(tag), description: "Work" });
  }
  if (tag === "N" && request.all.includes(AGAIN)) {
    return againTurn(request);
  }
  if (tag === "P") {
    return pTurn(request);
  }
  if (tag === "T") {
    const inside = INSIDE_SEEN.exec(request.all)?.[1];
    read.inside = inside === undefined ? undefined : Number(inside);
  }
  if (
    (tag === "L" || tag === "S" || tag === "U" || tag === "O") &&
    !request.all.includes(seen(`WENT-${tag}`))
  ) {
    return waitFor(tag);
  }
  switch (tag) {
    case "L":
    case "T":
      return finishOnce(request, tag, 0, blocked(tag));
    case "N":
    case "X":
    case "S":
    case "R":
    case "D":
    case "U":
    case "O":
      return finishOnce(request, tag, 0, done(tag));
  }
};

interface Workspace {
  carry: string | null;
  head: string | null;
  id: string;
  path: string;
  state: string;
  tmp: string | null;
}

interface ItemRow {
  error: string | null;
  state: string;
}

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

/** What the legs share. */
interface Scene {
  call: (
    name: string,
    args: object
  ) => Promise<{ status: number; text: string }>;
  delegate: (tag: Tag, cwd: string, extra?: object) => Promise<Started>;
  ended: (started: Started) => Promise<ItemRow | undefined>;
  fleet: KitFleet;
  parentId: string;
  src: string;
  stateBecomes: (id: string, state: string) => Promise<Workspace>;
  workspaceOf: (id: string) => Workspace;
}

/** The hub's lines naming a workspace, for a check's detail. */
const linesOf = async (fleet: KitFleet, id: string): Promise<string> => {
  const logs = `${await fleet.logs("hub")}\n${await fleet.logs("agent")}`;
  return logs
    .split("\n")
    .filter((line) => line.includes(id))
    .slice(-8)
    .join(" | ");
};

/** Whether a process whose command line runs `sleep <arg>` is still there. */
const sleeps = async (arg: string): Promise<number[]> =>
  (await commandLines())
    .filter((one) => one.command.trim() === `sleep ${arg}`)
    .map((one) => one.pid);

/** The notices the parent got that name `needle`. */
const noticesNaming = (scene: Scene, needle: string) =>
  scene.fleet
    .query<{ body: string | null }>(
      "SELECT json_extract(payload, '$.body') AS body FROM delegate_events WHERE parent_instance_id = ? AND kind = 'report' AND json_extract(payload, '$.notice') = 1 ORDER BY id",
      scene.parentId
    )
    .map((row) => row.body ?? "")
    .filter((body) => body.includes(needle));

/** (n) Lands none, commits: retired with a carry, its parent told; a handoff cuts it again with the commit. */
const noneLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const n = await scene.delegate("N", scene.src, { lands: "none" });
  const item = await scene.ended(n);
  const ws = scene.workspaceOf(n.workspaceId);
  const retired = await scene.stateBecomes(ws.id, "archived");
  const carry = retired.carry ?? "";
  const heads = carry
    ? await Bun.$`git bundle list-heads ${join(carry, "commits.bundle")}`
        .quiet()
        .nothrow()
        .text()
    : "";
  check(
    "(n) N lands none and commits: done, its workspace retires, not held, its commit in a carry in ~/.cawco/carries",
    item?.state === "done" &&
      retired.state === "archived" &&
      copyGone(scene.fleet, ws) &&
      carry.startsWith(
        join(scene.fleet.home, ".cawco", "carries", `${ws.id}-`)
      ) &&
      heads.includes(`refs/heads/ws/${ws.id.slice(0, 8)}`),
    `${item?.state} ${item?.error ?? ""}; ${retired.state}; carry ${carry || "none"}; heads ${heads.trim()}; ${await linesOf(scene.fleet, ws.id)}`
  );
  const told = await until(
    "N's parent told of the carry",
    () => noticesNaming(scene, `Workspace ${ws.id.slice(0, 8)}`),
    (bodies) =>
      bodies.some((body) => body.includes(workWords.carriedTo(carry))),
    30_000
  ).catch(() => noticesNaming(scene, `Workspace ${ws.id.slice(0, 8)}`));
  const notice =
    told.find((body) => body.includes(workWords.carriedTo(carry))) ?? "";
  check(
    "(n) its parent is told, as a notice, the carry's path, and nothing asks it to decide",
    carry !== "" && notice !== "" && !notice.includes("discard_workspace"),
    notice.slice(0, 600) || JSON.stringify(told).slice(0, 600)
  );
  const handed = await scene.call("handoff", {
    target: n.instanceId,
    message: `${AGAIN}: read the commit you are on.`,
  });
  const again = await until(
    "N finishes again in its clone cut again",
    () => steps.N?.finishes ?? 0,
    (count) => count >= 2,
    ITEM_MS
  ).catch(() => steps.N?.finishes ?? 0);
  check(
    "(n) a handoff cuts N's clone again with its commit at HEAD, and N reads it there",
    handed.status === 200 &&
      again >= 2 &&
      (read.again ?? "").includes("Holds commit N"),
    `${handed.status} ${handed.text.slice(0, 300)}; finishes ${again}; read ${read.again ?? "nothing"}`
  );
};

/** (l) A commit whose change landed on main under another hash: retired, not held. */
const landedLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const l = await scene.delegate("L", scene.src);
  const wl = scene.workspaceOf(l.workspaceId);
  const own = await until(
    "L's commit in its clone",
    () => gitInCopy(scene.fleet, wl, ["log", "-1", "--format=%H%x09%s"]),
    (line) => line.endsWith("Same change by L"),
    ITEM_MS
  ).catch(() => "");
  const x = await scene.delegate("X", scene.src);
  const xItem = await scene.ended(x);
  // Main's tip once X landed, as the hub recorded its landing: the clone's
  // origin is the hub's remote, which the probe's own git has no credential for.
  const landed = scene.fleet.query<{ landed: string | null }>(
    "SELECT landed FROM work_items WHERE id = ?",
    x.workItemId
  )[0]?.landed;
  const main =
    (JSON.parse(landed ?? "null") as { sha?: string } | null)?.sha ?? "";
  check(
    "(l) X lands the same change on main as a commit of its own while L waits",
    xItem?.state === "done" && main.length === 40 && !own.startsWith(main),
    `${xItem?.state} ${xItem?.error ?? ""}; L ${own}; main ${main}`
  );
  await writeFile(join(wl.tmp ?? "", goFile("L")), "go\n");
  const lItem = await scene.ended(l);
  const retired = await scene.stateBecomes(wl.id, "archived");
  const head = JSON.parse(retired.head ?? "null") as { commit?: string } | null;
  check(
    "(l) L finishes blocked (its item failed), its commit on no remote by hash; its workspace retires, not held, its head at main's tip",
    lItem?.state === "failed" &&
      retired.state === "archived" &&
      copyGone(scene.fleet, wl) &&
      main !== "" &&
      head?.commit === main,
    `${lItem?.state}; ${retired.state}; head ${retired.head}; main ${main}; ${await linesOf(scene.fleet, wl.id)}`
  );
};

/** (s) A stopped item with work: held, and the stop's answer says so with both ways out. */
const stoppedLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const s = await scene.delegate("S", scene.src);
  const ws = scene.workspaceOf(s.workspaceId);
  await until(
    "S's commit in its clone",
    () => gitInCopy(scene.fleet, ws, ["log", "-1", "--format=%s"]),
    (subject) => subject === "Holds commit S",
    ITEM_MS
  ).catch(() => "");
  const stop = await scene.call("stop_delegate", { target: s.instanceId });
  const handle = ws.id.slice(0, 8);
  check(
    "(s) stop_delegate answers that S's workspace holds 1 commit on no remote and is held, with its two ways out",
    stop.status === 200 &&
      stop.text.includes(
        workWords.stopHolds(handle, "1 commit on no remote")
      ) &&
      stop.text.includes(workWords.holdWays(handle)),
    `${stop.status} ${stop.text.slice(0, 900)}`
  );
  const held = await scene.stateBecomes(ws.id, "held");
  check(
    "(s) then S's workspace is held",
    held.state === "held",
    `${held.state}; ${await linesOf(scene.fleet, ws.id)}`
  );
  await scene.call("discard_workspace", { workspace: ws.id });
};

/** (r) A read-only Go module cache in the scratch dir: retired all the same. */
const readOnlyLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const r = await scene.delegate("R", scene.src, { lands: "none" });
  const wr = scene.workspaceOf(r.workspaceId);
  const item = await scene.ended(r);
  const retired = await scene.stateBecomes(wr.id, "archived");
  const scratch = wr.tmp ?? "";
  check(
    "(r) R leaves a read-only Go module cache in its $TMPDIR; its workspace retires, its clone and scratch dir gone",
    item?.state === "done" &&
      retired.state === "archived" &&
      scratch !== "" &&
      !existsSync(scratch) &&
      copyGone(scene.fleet, wr),
    `${item?.state}; ${retired.state}; scratch ${scratch} ${existsSync(scratch) ? "stands" : "gone"}; ${await linesOf(scene.fleet, wr.id)}`
  );
};

/** (d) Processes left running from the clone end with its retirement. */
const processesLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const d = await scene.delegate("D", scene.src, { lands: "none" });
  const wd = scene.workspaceOf(d.workspaceId);
  const inside = await until(
    "D's detached sleep running",
    () => sleeps(INSIDE_SLEEP),
    (pids) => pids.length > 0,
    ITEM_MS
  ).catch(() => [] as number[]);
  // A process of CawCo's outside its boundary, as a session's CLI the hub
  // wrote off is: the keeper's, in D's copy as a session's spawn enters it
  // (its clone on the Mac; its view on Linux, agent layer.ts `enterSpawn`).
  const keeper = welcomed(
    scene.fleet.sessiondSocket,
    await SessiondClient.connect(scene.fleet.sessiondSocket)
  );
  try {
    const spawn = copyArgv(scene.fleet, wd, [
      systemProgram("sh"),
      "-c",
      `exec sleep ${HOST_SLEEP}`,
    ]);
    const [command = systemProgram("sh"), ...args] = spawn.argv;
    await keeper.spawnProc(crypto.randomUUID(), {
      command,
      args,
      cwd: spawn.cwd,
    });
  } finally {
    keeper.close();
  }
  const host = await until(
    "the keeper's sleep in D's clone",
    () => sleeps(HOST_SLEEP),
    (pids) => pids.length > 0,
    30_000
  ).catch(() => [] as number[]);
  check(
    "(d) D leaves a detached grandchild running from its clone, and a process of the keeper's runs on the host in its clone",
    inside.length > 0 && host.length > 0,
    `inside ${inside.join(", ") || "none"}; host ${host.join(", ") || "none"}`
  );
  const item = await scene.ended(d);
  const retired = await scene.stateBecomes(wd.id, "archived");
  const left = [...(await sleeps(INSIDE_SLEEP)), ...(await sleeps(HOST_SLEEP))];
  // The keeper's process in the clone is ended as its boundary closes for
  // good (boundary.ts `endUsers`), and the agent names it by its pid.
  const ended = (await scene.fleet.logs("agent"))
    .split("\n")
    .find(
      (line) =>
        line.includes(`[workspace] ${wd.id}:`) &&
        host.some((pid) => line.includes(`pid ${pid}`))
    );
  check(
    "(d) D finishes and its workspace retires; neither process runs, and the agent's log names the keeper's one it ended by its pid",
    item?.state === "done" &&
      retired.state === "archived" &&
      left.length === 0 &&
      ended !== undefined,
    `${item?.state}; ${retired.state}; left ${left.join(", ") || "none"}; ${ended ?? "no line naming it"}; ${await linesOf(scene.fleet, wd.id)}`
  );
};

/**
 * (o) A process of the person's own in a clone: a shell started from
 * outside the fleet with its working directory there, its parent alive.
 * Retirement leaves it running and waits, the hub's log naming it; once it
 * ends, the next sweep retires the workspace.
 */
const ownerLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const o = await scene.delegate("O", scene.src, { lands: "none" });
  const wo = scene.workspaceOf(o.workspaceId);
  if (isView(scene.fleet, wo)) {
    await viewOwnerLeg(kit, scene, o, wo);
    return;
  }
  await until(
    "O's clone",
    () => existsSync(wo.path),
    (there) => there,
    ITEM_MS
  ).catch(() => false);
  const shell = Bun.spawn(["sh", "-c", `sleep ${OWNER_SLEEP}; :`], {
    cwd: wo.path,
    stdio: ["ignore", "ignore", "ignore"],
  });
  await writeFile(join(wo.tmp ?? "", goFile("O")), "go\n");
  const item = await scene.ended(o);
  const waited = await until(
    "O's retirement waiting on the shell",
    async () =>
      (await scene.fleet.logs("hub"))
        .split("\n")
        .find(
          (line) =>
            line.includes(wo.id) &&
            line.includes(workWords.notRetired("")) &&
            line.includes(`pid ${shell.pid} `)
        ),
    (line) => line !== undefined,
    SETTLE_MS
  ).catch(() => undefined);
  const row = scene.workspaceOf(wo.id);
  check(
    "(o) a shell of the person's in O's clone survives O's retirement, which waits, the hub's log naming it; the clone stands and the row is not held",
    item?.state === "done" &&
      waited !== undefined &&
      shell.exitCode === null &&
      existsSync(wo.path) &&
      row.state === "active",
    `${item?.state}; shell ${shell.exitCode === null ? "runs" : `ended ${shell.exitCode}`}; ${row.state}; ${waited ?? (await linesOf(scene.fleet, wo.id))}`
  );
  // The shell alone ends: its `sleep`, orphaned, is what a session's
  // detached server is once its starter is gone (the Mac's 9-day vite).
  const orphan = await sleeps(OWNER_SLEEP);
  shell.kill("SIGKILL");
  await shell.exited;
  await scene.fleet.api("/api/workspaces/retire", {});
  const retired = await scene.stateBecomes(wo.id, "archived");
  const named = (await scene.fleet.logs("agent"))
    .split("\n")
    .find(
      (line) =>
        line.includes(`[workspace] ${wo.id}: ended`) &&
        line.includes(`sleep ${OWNER_SLEEP}`)
    );
  check(
    "(o) once the shell ends, the next sweep retires it, ending the shell's orphaned sleep and naming it in the agent's log",
    retired.state === "archived" &&
      !existsSync(wo.path) &&
      orphan.length > 0 &&
      (await sleeps(OWNER_SLEEP)).length === 0 &&
      named !== undefined,
    `${retired.state}; orphan ${orphan.join(", ") || "none"}; ${named ?? "no line naming it"}; ${await linesOf(scene.fleet, wo.id)}`
  );
};

/**
 * (o) on Linux, where O's path is the person's folder seen through O's view
 * (agent layer.ts): a shell of the person's in that folder runs outside the
 * view, so it is none of O's. O retires without waiting for it, and it runs
 * on. A process left running in O's view once its starter is gone (a
 * session's detached server) is O's: the retirement ends it with the view,
 * naming it in the agent's log.
 */
const viewOwnerLeg = async (
  kit: Kit,
  scene: Scene,
  o: Started,
  wo: Workspace
): Promise<void> => {
  const { check } = kit;
  await until(
    "O's view running",
    async () => (await inCopy(scene.fleet, wo, ["true"])).exitCode,
    (code) => code === 0,
    ITEM_MS
  ).catch(() => -1);
  const shell = Bun.spawn(["sh", "-c", `sleep ${OWNER_SLEEP}; :`], {
    cwd: wo.path,
    stdio: ["ignore", "ignore", "ignore"],
  });
  // Its starter, the shell entered into the view, ends at once: the sleep is
  // an orphan in the view.
  await inCopy(scene.fleet, wo, [
    systemProgram("sh"),
    "-c",
    `nohup sleep ${VIEW_SLEEP} > /dev/null 2>&1 &`,
  ]);
  const orphan = await until(
    "the orphaned sleep in O's view",
    () => sleeps(VIEW_SLEEP),
    (pids) => pids.length > 0,
    30_000
  ).catch(() => [] as number[]);
  await writeFile(join(wo.tmp ?? "", goFile("O")), "go\n");
  const item = await scene.ended(o);
  const retired = await scene.stateBecomes(wo.id, "archived");
  check(
    "(o) a shell of the person's in the folder O's view is of runs outside the view: O retires without waiting for it, and it runs on",
    item?.state === "done" &&
      retired.state === "archived" &&
      copyGone(scene.fleet, wo) &&
      shell.exitCode === null,
    `${item?.state}; ${retired.state}; shell ${shell.exitCode === null ? "runs" : `ended ${shell.exitCode}`}; ${await linesOf(scene.fleet, wo.id)}`
  );
  const named = (await scene.fleet.logs("agent"))
    .split("\n")
    .find(
      (line) =>
        line.includes(`[workspace] ${wo.id}: ended`) &&
        line.includes(`sleep ${VIEW_SLEEP}`)
    );
  check(
    "(o) a process left running in O's view, its starter gone, ends with its retirement, named in the agent's log",
    orphan.length > 0 &&
      (await sleeps(VIEW_SLEEP)).length === 0 &&
      named !== undefined,
    `orphan ${orphan.join(", ") || "none"}; ${named ?? "no line naming it"}; ${await linesOf(scene.fleet, wo.id)}`
  );
  shell.kill("SIGKILL");
  await shell.exited;
};

/** The moved line's own opening, as the product writes it (core injected.ts `movedLine`). */
const MOVED_AT = (() => {
  const line = movedLine({
    kind: "recut",
    branch: "b",
    commit: "0".repeat(40),
  });
  return line.slice(0, line.indexOf("000000000"));
})();

/** The moved line a delegate was handed, from its conversation. */
const movedIn = (all: string): string => {
  const at = all.lastIndexOf(MOVED_AT);
  return at < 0 ? "" : all.slice(at, at + 1500);
};

/**
 * (c) A carry's uncommitted diff comes back with a cut again: P lands
 * none, commits and finishes, then changes a tracked file and leaves an
 * untracked one in the same turn (finish_item refuses a dirty tree, so this
 * is what a turn that ends without a finish leaves); its workspace retires
 * with a carry holding both. A handoff cuts it again: README.md changed and
 * the new file untracked, as it left them, and its moved line says the diff
 * was applied. It commits them, finishes and changes README.md again; the
 * probe breaks the new carry's diff, and a second handoff's moved line says
 * it did not apply, naming README.md, and leaves it in the carry.
 */
const carryDiffLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const p = await scene.delegate("P", scene.src, { lands: "none" });
  const item = await scene.ended(p);
  const first = await scene.stateBecomes(p.workspaceId, "archived");
  const patch = first.carry ? join(first.carry, "uncommitted.patch") : "";
  check(
    "(c) P lands none: done with a commit, then leaves a changed file and an untracked one; its workspace retires with all of it in a carry",
    item?.state === "done" &&
      first.state === "archived" &&
      patch !== "" &&
      existsSync(patch) &&
      existsSync(join(first.carry ?? "", "commits.bundle")),
    `${item?.state}; ${first.state}; carry ${first.carry}`
  );
  await scene.call("handoff", {
    target: p.instanceId,
    message: `${P_AGAIN}: read your tree.`,
  });
  await until(
    "P finishes again in its clone cut again",
    () => steps.P?.finishes ?? 0,
    (count) => count >= 2,
    ITEM_MS
  ).catch(() => 0);
  check(
    "(c) the handoff cuts P's clone again with its diff on top: README.md changed and new-P.txt untracked, and its moved line says the diff was applied",
    (read.p2 ?? "").includes(" M README.md") &&
      (read.p2 ?? "").includes("?? new-P.txt") &&
      (read.moved2 ?? "").includes(restoredWords({ applied: patch })),
    `read ${read.p2 ?? "nothing"}; moved ${read.moved2 || "none"}`
  );
  const second = await scene.stateBecomes(p.workspaceId, "archived");
  const again = second.carry ? join(second.carry, "uncommitted.patch") : "";
  const diff = again ? await Bun.file(again).text() : "";
  await writeFile(
    again || join(kit.out, "no-patch"),
    diff.replace(" holds", " nothing like it")
  );
  await scene.call("handoff", {
    target: p.instanceId,
    message: `${P_THIRD}: carry on.`,
  });
  await until(
    "P finishes a third time",
    () => steps.P?.finishes ?? 0,
    (count) => count >= 3,
    ITEM_MS
  ).catch(() => 0);
  const refused =
    restoredWords({ refused: again, why: "WHY" }).split("WHY")[0] ?? "-";
  check(
    "(c) once its carry's diff no longer applies, the next cut says so, naming README.md, and the diff stays in the carry",
    second.state === "archived" &&
      diff.includes(" holds") &&
      (read.moved3 ?? "").includes(refused) &&
      (read.moved3 ?? "").includes("README.md") &&
      existsSync(again),
    `${second.state}; moved ${read.moved3 || "none"}`
  );
};

/**
 * (u) A clone whose removal stops part-way: a file in it its owner may not
 * unlink (`chflags uchg`, macOS; Linux gives an unprivileged user no such
 * file). Its workspace is never read as holding what is left: the archive
 * fails, said in the hub's log, with no clone at its path and the row not
 * held; once the flag is gone, the next sweep retires it.
 */
const removalLeg = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  if (process.platform !== "darwin") {
    kit.note(
      "(u) runs on macOS: an unprivileged user can make a file it may not unlink there (chflags uchg), and nowhere on Linux"
    );
    return;
  }
  const u = await scene.delegate("U", scene.src);
  const wu = scene.workspaceOf(u.workspaceId);
  const locked = join(wu.path, "junk", "locked");
  await until(
    "U's junk file in its clone",
    () => existsSync(locked),
    (there) => there,
    ITEM_MS
  ).catch(() => false);
  await Bun.$`chflags uchg ${locked}`.quiet().nothrow();
  await writeFile(join(wu.tmp ?? "", goFile("U")), "go\n");
  const item = await scene.ended(u);
  const removing = `${wu.path}.cawco-removing`;
  const failed = await until(
    "U's archive failed on its locked file",
    async () =>
      (await scene.fleet.logs("hub"))
        .split("\n")
        .find(
          (line) =>
            line.includes(wu.id) && line.includes(workWords.notRetired(""))
        ),
    (line) => line !== undefined,
    SETTLE_MS
  ).catch(() => undefined);
  const row = scene.workspaceOf(wu.id);
  check(
    "(u) U's clone cannot be removed whole: its archive fails, said in the hub's log; no clone is left at its path, and its row is not held",
    item?.state === "done" &&
      failed !== undefined &&
      row.state !== "held" &&
      !existsSync(wu.path) &&
      existsSync(removing),
    `${item?.state}; ${row.state}; clone ${existsSync(wu.path) ? "stands" : "gone"}; ${removing} ${existsSync(removing) ? "stands" : "gone"}; ${failed ?? (await linesOf(scene.fleet, wu.id))}`
  );
  await Bun.$`chflags -R nouchg ${removing}`.quiet().nothrow();
  await scene.fleet.api("/api/workspaces/retire", {});
  const retired = await scene.stateBecomes(wu.id, "archived");
  check(
    "(u) once the flag is gone, the next sweep retires it and nothing of it is left",
    retired.state === "archived" &&
      !existsSync(removing) &&
      !existsSync(wu.path),
    `${retired.state}; ${removing} ${existsSync(removing) ? "stands" : "gone"}; ${await linesOf(scene.fleet, wu.id)}`
  );
};

/** The deleted paths of `git status --porcelain` output, counted by folder. */
const deletedByFolder = (status: string): string => {
  const counts = new Map<string, number>();
  for (const line of status.split("\n")) {
    if (line.startsWith(" D ")) {
      const path = line.slice(3);
      const folder = path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : ".";
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
  }
  return (
    [...counts].map(([folder, count]) => `${folder} (${count})`).join(", ") ||
    "none"
  );
};

/** (t) This repository's own tree: whole in the cut, on the host and inside the boundary, and retired. */
const treeLeg = async (kit: Kit, scene: Scene, tree: string): Promise<void> => {
  const { check } = kit;
  const t = await scene.delegate("T", tree);
  const wt = scene.workspaceOf(t.workspaceId);
  const status = await gitInCopy(scene.fleet, wt, ["status", "--porcelain"]);
  const tracked = (await gitInCopy(scene.fleet, wt, ["ls-files"]))
    .split("\n")
    .filter(Boolean).length;
  check(
    `(t) T's cut of this repository's tree (${tracked} tracked files) has every one on the host, on ${process.platform}`,
    tracked > 1000 && deletedByFolder(status) === "none",
    `deleted: ${deletedByFolder(status)}`
  );
  const item = await scene.ended(t);
  check(
    "(t) and inside its boundary git reads no tracked file missing",
    read.inside === 0,
    `inside: ${read.inside ?? "not read"} deleted`
  );
  const settled = await until(
    "T's workspace settled",
    () => scene.workspaceOf(wt.id),
    (row) => row.state !== "active",
    SETTLE_MS
  ).catch(() => scene.workspaceOf(wt.id));
  const after = copyGone(scene.fleet, wt)
    ? ""
    : await gitInCopy(scene.fleet, wt, ["status", "--porcelain"]);
  check(
    "(t) T finishes blocked and its workspace retires, not held",
    item?.state === "failed" && settled.state === "archived",
    `${item?.state}; ${settled.state}; deleted in the clone: ${deletedByFolder(after)}; ${await linesOf(scene.fleet, wt.id)}`
  );
};

/** A project of one commit at `dir`, or of this checkout's tree when `from` names it: its id. */
const projectAt = async (
  fleet: KitFleet,
  dir: string,
  name: string,
  from?: string
): Promise<string> => {
  const home = fleet.env.HOME as string;
  await mkdir(dir, { recursive: true });
  const env = { ...process.env, HOME: home };
  if (from) {
    // The checkout's tracked files at its HEAD, as one commit on `main` of a
    // repository of its own: the run's checkout may be detached, and a
    // shallow history is no history a hub's remote takes.
    await Bun.$`sh -c ${'git -C "$1" archive --format=tar HEAD | tar -x -C "$2" && cd "$2" && git init -q -b main && git add -A -f && git commit -qm "The tree at the run\'s HEAD"'} sh ${from} ${dir}`
      .env(env)
      .quiet();
  } else {
    await Bun.$`sh -c ${"git init -q -b main && echo holds > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(dir)
      .env(env)
      .quiet();
  }
  return (
    await fleet.api<{ id: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd: dir,
    })
  ).id;
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "workspace-holds",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    for (const tag of Object.keys(steps) as Tag[]) {
      delete steps[tag];
    }
    for (const key of Object.keys(read) as (keyof typeof read)[]) {
      delete read[key];
    }
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
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const src = join(fleet.sandbox, "src");
    const projectId = await projectAt(fleet, src, "Holds");
    const tree = join(fleet.sandbox, "tree");
    const treeProject = await projectAt(
      fleet,
      tree,
      "Tree",
      join(import.meta.dir, "..", "..", "..")
    );
    const parent = await fleet.spawn("claude", "Parent", src, { projectId });
    // The tree's delegate is a delegate of a session of the tree's project.
    const treeParent = await fleet.spawn("claude", "Tree parent", tree, {
      projectId: treeProject,
    });
    const credential = await fleet.sessionCredential(parent);
    const workspaceOf = (id: string) =>
      fleet.query<Workspace>(
        "SELECT id, path, state, tmp, carry, head FROM workspaces WHERE id = ?",
        id
      )[0] as Workspace;
    const itemOf = (id: string) =>
      fleet.query<ItemRow>(
        "SELECT state, error FROM work_items WHERE id = ?",
        id
      )[0];
    const scene: Scene = {
      fleet,
      parentId: parent,
      src,
      workspaceOf,
      stateBecomes: (id, state) =>
        until(
          `workspace ${id} ${state}`,
          () => workspaceOf(id),
          (row) => row.state === state,
          SETTLE_MS
        ).catch(() => workspaceOf(id)),
      delegate: (tag, cwd, extra = {}) =>
        fleet.api<Started>("/api/work-items", {
          parentInstanceId: parent,
          title: `Holds probe ${tag}`,
          prompt: `PROBE-HOLDS-${tag}: do your part.`,
          harness: "claude",
          model: "claude-haiku-4-5",
          cwd,
          ...(cwd === tree ? { parentInstanceId: treeParent } : {}),
          ...extra,
        }),
      ended: (started) =>
        until(
          `work item ${started.workItemId} ended`,
          () => itemOf(started.workItemId),
          (row) =>
            row !== undefined &&
            ["done", "failed", "cancelled"].includes(row.state),
          ITEM_MS
        ).catch(() => itemOf(started.workItemId)),
      call: async (name, args) => {
        const answer = await toolWords(
          { base: fleet.base, id: parent, credential },
          name,
          args as Record<string, unknown>
        );
        return { status: answer.status, text: answer.text };
      },
    };
    await noneLeg(kit, scene);
    await landedLeg(kit, scene);
    await stoppedLeg(kit, scene);
    await readOnlyLeg(kit, scene);
    await processesLeg(kit, scene);
    await removalLeg(kit, scene);
    await ownerLeg(kit, scene);
    await carryDiffLeg(kit, scene);
    await treeLeg(kit, scene, tree);
    // Whatever a failed leg left read-only goes with the fleet.
    await chmod(fleet.sandbox, 0o755).catch(() => undefined);
  },
};

export default spec;
