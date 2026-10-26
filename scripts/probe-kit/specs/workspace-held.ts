/**
 * A workspace is held only while it holds work that is nowhere else, and only
 * the session that started that work deals with it (hub work-items.ts
 * `vouchLanded`, `leftoversIn`, `heldNotice`, `discardFor`; agent
 * workspace.ts `holding`). On 2026-10-18 the owner retired 38 held
 * workspaces by hand: some had every commit on main, rebased; some held only
 * scratch their delegates left in the clone. On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model), boundaries
 * included: this spec delegates, so it runs on the host, outside every
 * boundary.
 *
 * (c) S commits and finishes blocked: its workspace is held, and its parent
 *     is told by a notice naming the workspace, what it holds and
 *     discard_workspace; the project's places say nothing of it (`held`
 *     null), while delegate_list's held list still has it.
 * (a) Main moves under a delegate's commit, and the commit lands rebased:
 *     - A commits, then waits while X lands a commit of its own; A finishes
 *       and its commit lands rebased onto X's (a new sha): A's workspace
 *       retires on its own, not held.
 *     - T, cut `from` S's workspace, finishes: S's commit lands rebased onto
 *       main as it is now, under T's landing. S's workspace, held with the
 *       original commit, retires on its own: not held, its clone gone.
 * (b) U commits, leaves an untracked file and a file listed in its clone's
 *     own .git/info/exclude, and calls finish_item: the answer names both,
 *     and the item does not end. U moves them to $TMPDIR and calls it again:
 *     its work lands and its workspace retires, not held.
 * (d) V commits and finishes blocked, held: its parent's discard_workspace
 *     archives it with a carry holding V's commit, its clone gone.
 * (e) H finishes blocked and is held; then P starts and stays live; Q
 *     starts and lands; R starts once Q ended, finishes blocked and is held;
 *     then Z, another session's delegate, finishes blocked and is held. The
 *     parent's delegate_list with a window from Q's start to its end answers
 *     P and Q, in start order, with their starts and ends (P's end null),
 *     nothing else of the parent's tree, and no held workspace; one from R's
 *     start answers P and R, and of the held workspaces R's alone (H's was
 *     held before it, Z's is another tree's). A window bound that is no ISO
 *     time is refused.
 *
 *   bun scripts/probe-kit/run.ts workspace-held
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workWords } from "../../../packages/core/src/words/work";
import { type ToolRecord, toolRecord, toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { copyGone, gitInCopy } from "../copy";
import type { Kit, Spec } from "../kit";

const TAG = /PROBE-HELD-([ASXTUVPQRHZ])/u;
type Tag = "A" | "S" | "X" | "T" | "U" | "V" | "P" | "Q" | "R" | "H" | "Z";
const FINISH = "mcp__cawco__finish_item";
const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm";
/** The go of a delegate that waits (A, P): a file the probe writes into its TMPDIR. */
const goFile = (tag: Tag) => `probe-go-${tag}`;
/** Marks a command prints that its own text never holds. */
const committed = (tag: Tag) => `HELD-COMMIT-${tag}-$((40+2))`;
const committedSeen = (tag: Tag) => `HELD-COMMIT-${tag}-42`;
/** What a waiting delegate prints once its go came. */
const went = (tag: Tag) => `${tag}-WENT-$((40+2))`;
const wentSeen = (tag: Tag) => `${tag}-WENT-42`;
const U_MOVED = "U-MOVED-42";
/** How finish_item refuses a clone that holds work in no commit (work-items.ts `leftoversIn`). */
const NOT_FINISHED = "Not finished: your clone holds work that is in no commit";
/** U's untracked file, and the file its clone's own excludes keep out of git. */
const U_UNTRACKED = "notes-U.md";
const U_EXCLUDED = "scratch-U.log";
/** The refusal's excludes section, naming U's excluded file. */
const U_EXCLUDED_NAMED = /own excludes[\s\S]{0,300}?scratch-U\.log/u;
/** Where discard_workspace's answer names its carry (server.ts, the discard route). */
const CARRY_AT = /the carry (\S+) on/u;
/** How long a workspace takes to settle once its item ends: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;
/** How long a delegate's item may take from its ask to its end. */
const ITEM_MS = 300_000;

/** What each delegate's first command makes: one commit of a file of its own. */
const commitCommand = (tag: Tag): string => {
  const steps = [
    `echo 'made by ${tag}' > held-${tag}.txt`,
    `git add held-${tag}.txt`,
    `${COMMIT} 'Delegate commit ${tag}'`,
  ];
  if (tag === "U") {
    steps.push(
      `echo notes > ${U_UNTRACKED}`,
      `echo ${U_EXCLUDED} >> .git/info/exclude`,
      `echo log > ${U_EXCLUDED}`
    );
  }
  return [...steps, `echo ${committed(tag)}`].join(" && ");
};

/** Per delegate: whether it searched for finish_item, and how many times it called it. */
const steps: Partial<Record<Tag, { searched?: boolean; finishes: number }>> =
  {};
/** What U read in finish_item's first answer. */
const uSeen: { refusal?: string } = {};

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

const finished = (tag: Tag) => ({
  headline: `Committed held-${tag}.txt.`,
  summary: `Committed held-${tag}.txt.`,
});
const blocked = (tag: Tag) => ({
  headline: `Committed held-${tag}.txt and stopped.`,
  summary: `Committed held-${tag}.txt and stopped.`,
  blocked: { command: "probe", error: `${tag} stops here on purpose` },
});

/** U: commit with leftovers, finish (refused), move them to $TMPDIR, finish again. */
const uTurn = (request: Seen): Reply => {
  const step = steps.U ?? { finishes: 0 };
  if (step.finishes === 0) {
    return finishOnce(request, "U", 0, finished("U"));
  }
  if (!request.all.includes(U_MOVED)) {
    const at = request.all.indexOf(NOT_FINISHED);
    uSeen.refusal = at >= 0 ? request.all.slice(at, at + 1200) : undefined;
    return tool("Bash", {
      command: `mv ${U_UNTRACKED} ${U_EXCLUDED} "$TMPDIR"/ && echo U-MOVED-$((40+2))`,
      description: "Move scratch to TMPDIR",
    });
  }
  return finishOnce(request, "U", 1, finished("U"));
};

const respond = (request: Seen): Reply => {
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  // T starts at S's commit: its work is S's, so it commits nothing.
  if (tag !== "T" && !request.all.includes(committedSeen(tag))) {
    return tool("Bash", { command: commitCommand(tag), description: "Commit" });
  }
  switch (tag) {
    case "A":
    case "P":
      if (!request.all.includes(wentSeen(tag))) {
        return tool("Bash", {
          command: `while [ ! -f "$TMPDIR/${goFile(tag)}" ]; do sleep 1; done; echo ${went(tag)}`,
          description: "Wait for the probe's go",
          timeout: 600_000,
        });
      }
      return finishOnce(request, tag, 0, finished(tag));
    case "S":
    case "V":
    case "H":
    case "R":
    case "Z":
      return finishOnce(request, tag, 0, blocked(tag));
    case "T":
      return finishOnce(request, tag, 0, {
        headline: "Landed S's commit.",
        summary: "Went on from S's commit and finished.",
      });
    case "U":
      return uTurn(request);
    default:
      return finishOnce(request, tag, 0, finished(tag));
  }
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

interface Workspace {
  id: string;
  path: string;
  state: string;
  tmp: string | null;
}

interface ItemRow {
  error: string | null;
  landed: string | null;
  result: string | null;
  state: string;
}

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

/** What the phases share. */
interface Scene {
  /** A tool of the parent's, called as the parent: its status and its words. */
  callAsParent: (
    name: string,
    args: object
  ) => Promise<{ status: number; text: string }>;
  /** A delegate asked of the parent (of `extra.parentInstanceId` when it names one), not waited for. */
  delegate: (tag: Tag, extra?: object) => Promise<Started>;
  /** The item's row once it ended, or as it stands when it does not. */
  ended: (started: Started) => Promise<ItemRow | undefined>;
  fleet: Fleet;
  parentId: string;
  projectId: string;
  /** delegate_list called as the parent, read as its record (scripts/lib/tool-call.ts). */
  recordAsParent: (name: string, args: object) => Promise<ToolRecord<Answer>>;
  /** The project's repository, every delegate's cwd. */
  src: string;
  /** The workspace's row once its state is `state`, or as it stands when that does not come. */
  stateBecomes: (id: string, state: string) => Promise<Workspace>;
  workspaceOf: (id: string) => Workspace;
}

/** The hub's and agent's lines naming a session, said when an item ended where it should not have. */
const sayLogs = async (
  kit: Kit,
  fleet: Fleet,
  label: string,
  instanceId: string
): Promise<void> => {
  for (const role of ["hub", "agent"] as const) {
    const lines = (await fleet.logs(role))
      .split("\n")
      .filter((line) => line.includes(instanceId))
      .slice(-40);
    kit.note(
      `${label}: the ${role}'s lines naming ${instanceId}:\n${lines.join("\n") || "(none)"}`
    );
  }
};

/** The hub's [workspaces] lines naming a workspace, for a check's detail. */
const workspaceLines = async (fleet: Fleet, id: string): Promise<string> =>
  (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(id))
    .slice(-8)
    .join(" | ");

/** (c) A held workspace is its parent's to decide, and no place of the person's says it. */
const heldPhase = async (kit: Kit, scene: Scene): Promise<Workspace> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  const s = await scene.delegate("S");
  const item = await scene.ended(s);
  const ws = workspaceOf(s.workspaceId);
  const held = await stateBecomes(ws.id, "held");
  check(
    "(c) S's item failed blocked with its commit on no remote, and its workspace is held",
    item?.state === "failed" && held.state === "held",
    `${item?.state} ${item?.error ?? ""}; ${held.state}; ${await workspaceLines(fleet, ws.id)}`
  );
  const reports = () =>
    fleet.query<{ body: string | null; notice: number | null }>(
      "SELECT json_extract(payload, '$.body') AS body, json_extract(payload, '$.notice') AS notice FROM delegate_events WHERE parent_instance_id = ? AND instance_id = ? AND kind = 'report' ORDER BY id",
      scene.parentId,
      s.instanceId
    );
  // S's own report names its workspace too (work-items.ts `reportLine`):
  // the hold is the notice that names it, by its handle as agents read it.
  const handle = ws.id.slice(0, 8);
  const isHoldNotice = (row: { body: string | null; notice: number | null }) =>
    row.notice === 1 && (row.body ?? "").includes(`Workspace ${handle}`);
  const notice = await until(
    "the parent's notice of S's held workspace",
    reports,
    (rows) => rows.some(isHoldNotice),
    30_000
  ).catch(reports);
  const told = notice.find(isHoldNotice);
  check(
    "(c) its parent is told, as a notice: the workspace, 1 commit on no remote, and discard_workspace",
    told !== undefined &&
      (told.body ?? "").includes("holds 1 commit on no remote") &&
      (told.body ?? "").includes("discard_workspace"),
    JSON.stringify(notice).slice(0, 1500)
  );
  const project = (
    await fleet.api<
      {
        id: string;
        places: { path: string; held?: unknown }[];
      }[]
    >("/api/projects")
  ).find((one) => one.id === scene.projectId);
  // A workspace is no place of its project (hub migration 0322): its clone
  // is listed nowhere there, and a place at its path holds nothing of it.
  const place = project?.places.find((one) => one.path === ws.path);
  check(
    "(c) the person's places list does not show it held: no place of its, or one whose `held` is null",
    project !== undefined && (place?.held ?? null) === null,
    `${project ? "project read" : "project not read"}; ${place ? JSON.stringify(place) : "no place at its path"}`
  );
  // Its words (hub presenters/sessions.ts `heldLine`): the workspace by its handle.
  const said = await scene.callAsParent("delegate_list", {});
  check(
    "(c) the parent's delegate_list lists it under held",
    said.status === 200 &&
      said.text.includes(`workspace ${handle} on`) &&
      said.text.includes("1 commit on no remote"),
    `${said.status} ${said.text.slice(0, 1200)}`
  );
  return ws;
};

/** The sha a landed item's row says it put on main. */
const landedSha = (row: ItemRow | undefined): string =>
  (JSON.parse(row?.landed ?? "null") as { sha?: string } | null)?.sha ?? "";

/** (a) A commit landed by rebase after main moved: its own workspace retires, and so does the one it was cut from. */
const rebasedPhase = async (
  kit: Kit,
  scene: Scene,
  ws: Workspace
): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  const a = await scene.delegate("A");
  const wa = workspaceOf(a.workspaceId);
  const original = await until(
    "A's commit in its clone",
    () => gitInCopy(fleet, wa, ["log", "-1", "--format=%H%x09%s"]),
    (line) => line.endsWith("Delegate commit A"),
    ITEM_MS
  )
    .then((line) => line.split("\t")[0] ?? "")
    .catch(() => "");
  const x = await scene.delegate("X");
  const xItem = await scene.ended(x);
  check(
    "(a) X lands a commit of its own while A waits: main moved under A's commit",
    xItem?.state === "done" &&
      (xItem.result ?? "").includes(workWords.landedOn("main")),
    `${xItem?.state} ${xItem?.error ?? ""} ${(xItem?.result ?? "").slice(0, 400)}`
  );
  await writeFile(join(wa.tmp ?? "", goFile("A")), "go\n");
  const aItem = await scene.ended(a);
  if (aItem?.state !== "done") {
    await sayLogs(kit, fleet, "A", a.instanceId);
  }
  const rebasedA = landedSha(aItem);
  check(
    "(a) A's commit lands rebased onto X's: done, landed at a new commit",
    aItem?.state === "done" &&
      original.length === 40 &&
      rebasedA.length === 40 &&
      rebasedA !== original,
    `${aItem?.state} ${aItem?.error ?? ""}; was ${original}, landed ${rebasedA}`
  );
  const retiredA = await stateBecomes(wa.id, "archived");
  check(
    "(a) A's workspace retires on its own, not held: row archived, clone gone",
    retiredA.state === "archived" && copyGone(fleet, wa),
    `${retiredA.state}; clone ${copyGone(fleet, wa) ? "gone" : "stands"}; ${await workspaceLines(fleet, wa.id)}`
  );

  const t = await scene.delegate("T", { from: ws.id });
  const tItem = await scene.ended(t);
  if (tItem?.state !== "done") {
    await sayLogs(kit, fleet, "T", t.instanceId);
  }
  check(
    "(a) T, cut from S's held workspace, lands S's commit rebased onto main as it moved",
    tItem?.state === "done" &&
      (tItem.result ?? "").includes(workWords.landedOn("main")) &&
      (tItem.result ?? "").includes("Delegate commit S"),
    `${tItem?.state} ${tItem?.error ?? ""} ${(tItem?.result ?? "").slice(0, 800)}`
  );
  const retiredS = await stateBecomes(ws.id, "archived");
  check(
    "(a) S's workspace, held with the original of that commit, retires on its own: row archived, clone gone",
    retiredS.state === "archived" && copyGone(fleet, ws),
    `${retiredS.state}; clone ${copyGone(fleet, ws) ? "gone" : "stands"}; ${await workspaceLines(fleet, ws.id)}`
  );
  const retiredT = await stateBecomes(t.workspaceId, "archived");
  check(
    "(a) T's own workspace retires too",
    retiredT.state === "archived",
    retiredT.state
  );
};

/** (b) finish_item names what a clone holds outside its commits, and the item does not end until it is gone. */
const leftoversPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  const u = await scene.delegate("U");
  const item = await scene.ended(u);
  if (item?.state !== "done") {
    await sayLogs(kit, fleet, "U", u.instanceId);
  }
  const refusal = uSeen.refusal ?? "";
  check(
    "(b) U's first finish_item answers that its clone holds work in no commit, naming the untracked file and the excluded one",
    refusal.startsWith(NOT_FINISHED) &&
      refusal.includes(`?? ${U_UNTRACKED}`) &&
      U_EXCLUDED_NAMED.test(refusal),
    refusal.slice(0, 1200) || "no refusal seen"
  );
  check(
    "(b) the item did not end on it: U finished once more, after moving them to $TMPDIR, and that landed",
    (steps.U?.finishes ?? 0) === 2 &&
      item?.state === "done" &&
      (item.result ?? "").includes(workWords.landedOn("main")),
    `${steps.U?.finishes ?? 0} finishes; ${item?.state} ${item?.error ?? ""} ${(item?.result ?? "").slice(0, 400)}`
  );
  const wu = workspaceOf(u.workspaceId);
  const retired = await stateBecomes(wu.id, "archived");
  check(
    "(b) U's workspace retires, not held",
    retired.state === "archived" && copyGone(fleet, wu),
    `${retired.state}; ${await workspaceLines(fleet, wu.id)}`
  );
};

/** (d) The parent discards a held workspace: a carry keeps its work. */
const discardPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  const v = await scene.delegate("V");
  await scene.ended(v);
  const wv = workspaceOf(v.workspaceId);
  const held = await stateBecomes(wv.id, "held");
  const discarded = await scene.callAsParent("discard_workspace", {
    workspace: wv.id,
  });
  const carry = CARRY_AT.exec(discarded.text)?.[1] ?? "";
  const heads = carry
    ? (
        await Bun.$`git bundle list-heads ${join(carry, "commits.bundle")}`
          .quiet()
          .nothrow()
      ).stdout.toString()
    : "";
  check(
    "(d) V held, its parent's discard_workspace saves its commit to a carry in ~/.cawco/carries",
    held.state === "held" &&
      discarded.status === 200 &&
      carry.startsWith(join(fleet.home, ".cawco", "carries", `${wv.id}-`)) &&
      heads.includes(`refs/heads/ws/${wv.id.slice(0, 8)}`),
    `${held.state}; ${discarded.status} ${discarded.text.slice(0, 600)}; heads ${heads.trim()}`
  );
  const gone = workspaceOf(wv.id);
  check(
    "(d) then V's clone is gone and its row archived",
    gone.state === "archived" && copyGone(fleet, wv),
    `${gone.state}; clone ${copyGone(fleet, wv) ? "gone" : "stands"}`
  );
};

/** One delegate as delegate_list answers it (hub delegation-tree.ts `DelegateNode`). */
interface Listed {
  endedAt: string | null;
  instanceId: string;
  startedAt: string;
}

/** delegate_list's record (hub delegation-tree.ts `DelegateList`), as `toolRecord` reads it. */
interface Answer {
  delegates: Listed[];
  held: { workspaceId: string }[];
}

/** delegate_list's delegates and held workspaces, from its record, or the refusal's words. */
const listed = (
  said: ToolRecord<Answer>
): Partial<Answer> & { refused?: string } =>
  said.refused ? { refused: said.text } : said.record;

/** delegate_list's record of a window, asked as the parent. */
const windowOf = (scene: Scene, window: object) =>
  scene.recordAsParent("delegate_list", window);

/** (e) delegate_list with a window answers the delegates live inside it, in start order, and its tree's workspaces held inside it. */
const windowPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  const span = (started: Started) =>
    fleet.query<{ created_at: number; ended_at: number | null }>(
      "SELECT created_at, ended_at FROM work_items WHERE id = ?",
      started.workItemId
    )[0];
  const iso = (ms: number | null | undefined) =>
    typeof ms === "number" ? new Date(ms).toISOString() : null;
  /** A delegate that finishes blocked, once its workspace is held. */
  const heldOne = async (tag: Tag, extra?: object) => {
    const started = await scene.delegate(tag, extra);
    await scene.ended(started);
    return {
      started,
      held: await stateBecomes(started.workspaceId, "held"),
    };
  };
  const h = await heldOne("H");
  const p = await scene.delegate("P");
  const q = await scene.delegate("Q");
  const qItem = await scene.ended(q);
  const { started: r, held: rHeld } = await heldOne("R");
  const other = await fleet.spawn("claude", "Other", scene.src, {
    projectId: scene.projectId,
  });
  const z = await heldOne("Z", { parentInstanceId: other });
  const [ps, qs, rs] = [span(p), span(q), span(r)];
  check(
    "(e) H held, Q lands while P runs, then R starts after Q ended and is held, and so is Z of another tree",
    h.held.state === "held" &&
      rHeld.state === "held" &&
      z.held.state === "held" &&
      qItem?.state === "done" &&
      ps?.ended_at === null &&
      typeof qs?.ended_at === "number" &&
      rs !== undefined &&
      rs.created_at > qs.ended_at,
    `H ${h.held.state}, R ${rHeld.state}, Z ${z.held.state}; Q ${qItem?.state}; P ${JSON.stringify(ps)} Q ${JSON.stringify(qs)} R ${JSON.stringify(rs)}`
  );
  const around = listed(
    await windowOf(scene, {
      since: iso(qs?.created_at),
      before: iso(qs?.ended_at),
    })
  );
  const shown = (around.delegates ?? []).map((one) => ({
    id: one.instanceId,
    startedAt: one.startedAt,
    endedAt: one.endedAt,
  }));
  check(
    "(e) a window from Q's start to its end answers P then Q, nothing else, with their starts and ends (P's end null)",
    JSON.stringify(shown) ===
      JSON.stringify([
        { id: p.instanceId, startedAt: iso(ps?.created_at), endedAt: null },
        {
          id: q.instanceId,
          startedAt: iso(qs?.created_at),
          endedAt: iso(qs?.ended_at),
        },
      ]),
    `${around.refused ?? ""}${JSON.stringify(shown)}; P ${p.instanceId} Q ${q.instanceId} R ${r.instanceId}`
  );
  check(
    "(e) and no held workspace: H's was held before it, R's and Z's after",
    around.held !== undefined && around.held.length === 0,
    JSON.stringify(around.held)
  );
  const after = listed(await windowOf(scene, { since: iso(rs?.created_at) }));
  const afterIds = (after.delegates ?? []).map((one) => one.instanceId);
  check(
    "(e) a window from R's start answers P then R",
    JSON.stringify(afterIds) === JSON.stringify([p.instanceId, r.instanceId]),
    `${after.refused ?? ""}${JSON.stringify(afterIds)}`
  );
  const afterHeld = (after.held ?? []).map((one) => one.workspaceId);
  check(
    "(e) and of the held workspaces R's alone: not H's, held before it, nor Z's, another tree's",
    JSON.stringify(afterHeld) === JSON.stringify([r.workspaceId]),
    `${JSON.stringify(afterHeld)}; H ${h.started.workspaceId} R ${r.workspaceId} Z ${z.started.workspaceId}`
  );
  const loose = listed(await windowOf(scene, { since: "yesterday" }));
  check(
    "(e) a bound that is no ISO time is refused, saying the form",
    (loose.refused ?? "").includes("ISO date or datetime"),
    loose.refused ?? JSON.stringify(loose.delegates).slice(0, 400)
  );
  await writeFile(
    join(workspaceOf(p.workspaceId).tmp ?? "", goFile("P")),
    "go\n"
  );
  const pItem = await scene.ended(p);
  check(
    "(e) P lands once its go comes",
    pItem?.state === "done",
    `${pItem?.state} ${pItem?.error ?? ""}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "workspace-held",
  run: async (kit: Kit) => {
    for (const tag of Object.keys(steps) as Tag[]) {
      delete steps[tag];
    }
    uSeen.refusal = undefined;
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
    await Bun.$`sh -c ${"git init -q -b main && echo held > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Held",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const credential = await fleet.sessionCredential(parent);

    const workspaceOf = (id: string) =>
      fleet.query<Workspace>(
        "SELECT id, path, state, tmp FROM workspaces WHERE id = ?",
        id
      )[0] as Workspace;
    const itemOf = (id: string) =>
      fleet.query<ItemRow>(
        "SELECT state, error, result, landed FROM work_items WHERE id = ?",
        id
      )[0];
    const scene: Scene = {
      fleet,
      parentId: parent,
      projectId: project.id,
      src,
      workspaceOf,
      stateBecomes: (id, state) =>
        until(
          `workspace ${id} ${state}`,
          () => workspaceOf(id),
          (row) => row.state === state,
          SETTLE_MS
        ).catch(() => workspaceOf(id)),
      delegate: (tag, extra = {}) =>
        fleet.api<Started>("/api/work-items", {
          parentInstanceId: parent,
          title: `Held probe ${tag}`,
          prompt: `PROBE-HELD-${tag}: commit a file.`,
          harness: "claude",
          model: "claude-haiku-4-5",
          ...(tag === "T" ? {} : { cwd: src }),
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
      callAsParent: async (name, args) => {
        const said = await toolWords(
          { base: fleet.base, id: parent, credential },
          name,
          args as Record<string, unknown>
        );
        return { status: said.status, text: said.text };
      },
      recordAsParent: (name, args) =>
        toolRecord<Answer>(
          { base: fleet.base, id: parent, credential },
          name,
          args as Record<string, unknown>
        ),
    };

    const ws = await heldPhase(kit, scene);
    await rebasedPhase(kit, scene, ws);
    await leftoversPhase(kit, scene);
    await discardPhase(kit, scene);
    await windowPhase(kit, scene);
  },
};

export default spec;
