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
 *     under nohup) from its clone, and a process the probe starts on the
 *     host with its working directory in D's clone stands for one the
 *     boundary never started; D finishes: its workspace retires, both are
 *     gone, and the agent's log names the one it ended.
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
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
} from "../../../packages/core/src/safe-git";
import { workWords } from "../../../packages/core/src/words/work";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const TAG = /PROBE-HOLDS-([NLXSRDUT])\b/;
type Tag = "N" | "L" | "X" | "S" | "R" | "D" | "U" | "T";
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
/** What T prints of its tree as its boundary sees it. */
const INSIDE_SEEN = /T-INSIDE-(\d+)-END/;
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
const read: { again?: string; inside?: number } = {};

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
  if (tag === "T") {
    const inside = INSIDE_SEEN.exec(request.all)?.[1];
    read.inside = inside === undefined ? undefined : Number(inside);
  }
  if (
    (tag === "L" || tag === "S" || tag === "U") &&
    !request.all.includes(seen(`WENT-${tag}`))
  ) {
    return waitFor(tag);
  }
  switch (tag) {
    case "L":
    case "T":
      return finishOnce(request, tag, 0, blocked(tag));
    default:
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

/** git on the host in `dir`, as safe-git.ts says; its stdout, trimmed. */
const gitIn = (dir: string, ...args: string[]): Promise<string> =>
  Bun.$`git ${SAFE_GIT_FLAGS} -C ${dir} ${args}`
    .env({ ...process.env, ...SAFE_GIT_ENV })
    .quiet()
    .nothrow()
    .text()
    .then((out) => out.trim());

/** The hub's lines naming a workspace, for a check's detail. */
const linesOf = async (fleet: KitFleet, id: string): Promise<string> => {
  const logs = `${await fleet.logs("hub")}\n${await fleet.logs("agent")}`;
  return logs
    .split("\n")
    .filter((line) => line.includes(id))
    .slice(-8)
    .join(" | ");
};

/** The session's own credential, from its environment: `/proc` on Linux, `ps -E` on macOS. */
/** The session credential's line in a process's environment. */
const CREDENTIAL = /CAWCO_SESSION_CREDENTIAL=(\S+)/;

const credentialOf = async (fleet: KitFleet, id: string): Promise<string> => {
  const pid = await fleet.sessionPid(id);
  const env =
    process.platform === "linux"
      ? (await Bun.file(`/proc/${pid}/environ`).text()).split("\0").join(" ")
      : await Bun.$`ps -E -ww -o command= -p ${String(pid)}`
          .quiet()
          .nothrow()
          .text();
  return CREDENTIAL.exec(env)?.[1] ?? "";
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
      !existsSync(ws.path) &&
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
    () => gitIn(wl.path, "log", "-1", "--format=%H%x09%s"),
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
      !existsSync(wl.path) &&
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
    () => gitIn(ws.path, "log", "-1", "--format=%s"),
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
      !existsSync(wr.path),
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
  const host = Bun.spawn(["sleep", HOST_SLEEP], {
    cwd: wd.path,
    stdio: ["ignore", "ignore", "ignore"],
  });
  host.unref();
  check(
    "(d) D leaves a detached grandchild running from its clone, and one runs on the host in its clone",
    inside.length > 0 && (await sleeps(HOST_SLEEP)).length > 0,
    `inside ${inside.join(", ") || "none"}; host ${host.pid}`
  );
  const item = await scene.ended(d);
  const retired = await scene.stateBecomes(wd.id, "archived");
  const left = [...(await sleeps(INSIDE_SLEEP)), ...(await sleeps(HOST_SLEEP))];
  const ended = (await scene.fleet.logs("agent"))
    .split("\n")
    .find(
      (line) =>
        line.includes(`${wd.id}: ended`) && line.includes(`sleep ${HOST_SLEEP}`)
    );
  check(
    "(d) D finishes and its workspace retires; neither process runs, and the agent's log names the one it ended",
    item?.state === "done" &&
      retired.state === "archived" &&
      left.length === 0 &&
      ended !== undefined,
    `${item?.state}; ${retired.state}; left ${left.join(", ") || "none"}; ${ended ?? "no line naming it"}; ${await linesOf(scene.fleet, wd.id)}`
  );
  host.kill("SIGKILL");
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
  const status = await gitIn(wt.path, "status", "--porcelain");
  const tracked = (await gitIn(wt.path, "ls-files"))
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
  const after = existsSync(wt.path)
    ? await gitIn(wt.path, "status", "--porcelain")
    : "";
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
  name: "workspace-holds",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    for (const tag of Object.keys(steps) as Tag[]) {
      delete steps[tag];
    }
    read.again = undefined;
    read.inside = undefined;
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
    const credential = await credentialOf(fleet, parent);
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
    await treeLeg(kit, scene, tree);
    // Whatever a failed leg left read-only goes with the fleet.
    await chmod(fleet.sandbox, 0o755).catch(() => undefined);
  },
};

export default spec;
