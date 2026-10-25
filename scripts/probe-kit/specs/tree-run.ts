/**
 * The delegation tree is the run (decision page workflows-future): what the
 * workflow engine kept for its steps, kept for work items. On a scratch fleet
 * (real hub, agent and sessiond; Claude Code and OpenCode against the mock
 * model). Every delegate runs with host scope, so nothing cuts a workspace
 * and the spec runs inside one.
 *
 * Each delegate's brief carries a tag that says what its mock model does:
 * HOLD runs a long `sleep` (its turn stays open), CUT runs a command that
 * prints a mark then sleeps, CUSTODY sleeps and finishes once woken, RETRY
 * (OpenCode) is refused by its provider with a retry an hour out, BGORCH
 * delegates one HOLD child and then holds.
 *
 * - k1. A `delegate` call through the MCP endpoint, sent twice under one
 *   Claude Code tool use id (`_meta["claudecode/toolUseId"]`), answers the
 *   same item both times, and one item is filed; a call under another id
 *   files a second (hub call-keys.ts).
 * - t1. An orchestrator with two delegates, one with a delegate of its own,
 *   is stopped by its parent while its machine is frozen: the two leaves'
 *   ends are asked, the middle and the orchestrator wait, every item is held
 *   live, and nothing reaches the parent.
 * - t2. Thawed, each ends before the one that started it (`ended_at`), the
 *   orchestrator last, every item cancelled, and no stop row is left.
 * - t3. The orchestrator's report reaches its parent, listing how each
 *   delegate under it ended, nested.
 * - p1. An OpenCode delegate whose provider answers 429 with `retry-after`
 *   an hour out, with a two-minute budget: it fails at once, before its
 *   budget, in the provider-retry words, and its parent hears it.
 * - c1. A Claude delegate's process killed mid-command: the turn handed back
 *   says the command was interrupted, with what it had printed.
 * - c2. Killed again mid-command within two minutes, its item fails, and the
 *   report its parent hears says the second command interrupted, with its
 *   output.
 * - r1. A routine with target `orchestrator`, made by a session through
 *   `routine_create`: its test run is a background host-scope item in the
 *   project's checkout, which delegates a child.
 * - r2. The session that made the routine is stopped by the person: the
 *   orchestrator and its child run on, no stop holds them.
 * - o1. A Claude delegate's CLI killed alone (SIGKILL) mid-command: its
 *   command (`sleep 3601`) is gone within seconds, named in the agent's log
 *   (agent left-running.ts), and the turn handed back names it interrupted.
 * - x1. The same for pi, its host killed alone: the command is gone and
 *   named, and the turn handed back names it interrupted, its output not
 *   kept (pi keeps none).
 * - x2. The same for OpenCode, its server killed: the command is gone and
 *   named, and the turn handed back when the agent takes the session up
 *   again names it interrupted, its output not kept.
 * - m1. A process a Claude delegate's harness starts outside any shell call
 *   (an MCP server's helper, `setsid` and orphaned when its launcher exits,
 *   so neither its parent nor its process group is the harness's) is
 *   running 5 s before the harness is killed alone (SIGKILL): within
 *   seconds it is gone, ended and named in its keeper's log (sessiond
 *   server.ts `#sweep`, found by the tree mark it inherited). The helper is
 *   the runtime itself (perl's `setsid`, then `exec` of bun): macOS
 *   withholds the environment of its own platform binaries (`/usr/bin/perl`,
 *   `/bin/sleep`), so there the mark finds only a helper installed apart
 *   from the system, as sessiond's `#survey` says; such a helper is what
 *   m1 reads on either system.
 * - u1. A delegate's process is killed while its agent is down, and the
 *   agent comes back with its sessiond frozen: while the machine's custody
 *   is undecided the item stays live and its parent hears nothing.
 * - u2. Its sessiond thawed, custody decides; the session is woken, finishes,
 *   and its parent hears the report.
 *
 *   bun scripts/probe-kit/run.ts tree-run
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workWords } from "../../../packages/core/src/index";
import { configDirClaudeJson } from "../../../packages/core/src/paths";
import {
  commandLines,
  processLineage,
} from "../../../packages/core/src/process-identity";
import { listedPid, type Pid, signal } from "../../../packages/core/src/signal";
import { toolWords } from "../../lib/tool-call";
import {
  delay,
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const TAGS = {
  hold: "PROBE-HOLD",
  cut: "PROBE-CUT",
  custody: "PROBE-CUSTODY",
  retry: "PROBE-RETRY",
  orchestrate: "PROBE-BGORCH",
  orphan: "PROBE-ORPHAN",
  piCut: "PROBE-PICUT",
  openCut: "PROBE-OCCUT",
  mcpOrphan: "PROBE-MCPORPHAN",
} as const;

/** The commands whose CLI or server is killed under them: each its own `sleep`, found by its argument. */
const LEFT = {
  [TAGS.orphan]: "sleep 3601",
  [TAGS.piCut]: "sleep 3602",
  [TAGS.openCut]: "sleep 3603",
} as const;
/** Words a session is handed back after its process went (hub server.ts `killedWords`, `restartedWords`). */
const HANDED_BACK = [
  "Your process was killed",
  "CawCo restarted",
  "was interrupted when its process went",
];
/** The shell as each harness names it: Claude Code's Bash, pi's bash, OpenCode's shell. */
const SHELLS = ["Bash", "bash", "shell"];

/** What CUT's two commands print first: the marks a cut command's output carries. */
const MARKS = ["PARTIAL-ONE-MARK", "PARTIAL-TWO-MARK"] as const;
const cutCommand = (mark: string): string => `echo ${mark}; sleep 3600`;
/** A HOLD command: a sleep that keeps its turn open. */
const HOLD_COMMAND = "sleep 3600";
/** What a woken CUSTODY session's summary says. */
const CUSTODY_DONE = "CUSTODY-DONE";
/** What the hand-back of a killed process says first (hub server.ts `killedWords`). */
const KILLED = "Your process was killed";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** A message's words: a string, or its text blocks. */
const wordsOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? (content as { text?: string; content?: unknown }[])
        .map((part) => part.text ?? wordsOf(part.content))
        .join("\n")
    : "";
};

/** A session's brief: the first user message of its conversation. */
const briefOf = (request: Seen): string => {
  const messages =
    (
      JSON.parse(request.body) as {
        messages?: { content?: unknown; role?: string }[];
      }
    ).messages ?? [];
  return wordsOf(messages.find((one) => one.role === "user")?.content);
};

/** A CawCo tool as Claude Code offers it: by name, or behind ToolSearch the first time. */
const cawco = (
  request: Seen,
  key: string,
  name: string,
  input: object
): Reply => {
  const full = `mcp__cawco__${name}`;
  if (request.toolNames.includes(full)) {
    return useTool(full, input);
  }
  if (!searched.has(key) && request.toolNames.includes("ToolSearch")) {
    searched.add(key);
    return useTool("ToolSearch", { query: `select:${full}`, max_results: 1 });
  }
  return text(`${name} is not offered: ${request.toolNames.join(", ")}`);
};

/** Each session's searches made so far, by brief tag and tool. */
const searched = new Set<string>();
/** Briefs whose BGORCH session has delegated its child. */
const delegated = new Set<string>();
/** Every shell command the mock has had a session run, and when. */
const issued: { at: number; brief: string; command: string }[] = [];
/** The CUSTODY session's turns, whether it was woken, and whether it called finish_item. */
const custody: { finished: boolean; turns: number; woken: boolean } = {
  finished: false,
  turns: 0,
  woken: false,
};
/** BGORCH sessions that have held since they delegated. */
const heldAfterDelegate = new Set<string>();

/** A shell call, kept in {@link issued}: Claude Code's Bash, or the shell `request` offers. */
const shell = (brief: string, command: string, request?: Seen): Reply => {
  issued.push({ at: Date.now(), brief, command });
  const name = SHELLS.find((one) => request?.toolNames.includes(one)) ?? "Bash";
  return useTool(name, { command, description: "Run and wait" });
};

/**
 * ORPHAN, PICUT and OCCUT: the first turn runs its command; a turn handed
 * back after its process went, or a shell result, ends quietly.
 */
const leftReply = (request: Seen, brief: string): Reply | undefined => {
  const tag = (Object.keys(LEFT) as (keyof typeof LEFT)[]).find((one) =>
    brief.includes(one)
  );
  if (!tag) {
    return undefined;
  }
  return request.afterTool ||
    HANDED_BACK.some((words) => request.last.includes(words))
    ? text("ok")
    : shell(brief, LEFT[tag], request);
};

/**
 * CUSTODY's turns: its first holds; any turn after it (the hub's wake once
 * custody decided, whatever its words) finishes.
 */
const custodyReply = (request: Seen, brief: string): Reply => {
  if (!request.afterTool) {
    custody.turns += 1;
    custody.woken = custody.turns > 1;
  }
  if (!custody.woken) {
    return request.afterTool ? text("ok") : shell(brief, HOLD_COMMAND);
  }
  if (custody.finished) {
    return text("ok");
  }
  const reply = cawco(request, `${brief}:finish`, "finish_item", {
    headline: "Custody leg done.",
    summary: CUSTODY_DONE,
  });
  custody.finished = reply.tool?.name === "mcp__cawco__finish_item";
  return reply;
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("ok");
  }
  const brief = briefOf(request);
  if (brief.includes(TAGS.retry)) {
    return {
      everyMs: 5,
      words: [],
      deny: {
        status: 429,
        message: "probe provider: too many requests",
        retryAfterS: 3600,
      },
    };
  }
  if (brief.includes(TAGS.cut)) {
    if (request.afterTool) {
      return text("ok");
    }
    return shell(
      brief,
      cutCommand(request.last.includes(KILLED) ? MARKS[1] : MARKS[0])
    );
  }
  if (brief.includes(TAGS.custody)) {
    return custodyReply(request, brief);
  }
  if (brief.includes(TAGS.mcpOrphan)) {
    // No shell call: a turn that streams for two minutes keeps its process
    // up until the leg kills it.
    return { everyMs: 500, words: Array.from({ length: 240 }, () => "wait ") };
  }
  const left = leftReply(request, brief);
  if (left) {
    return left;
  }
  if (brief.includes(TAGS.orchestrate) && !delegated.has(brief)) {
    const reply = cawco(request, `${brief}:delegate`, "delegate", {
      title: "Background child",
      prompt: `${TAGS.hold}: a background orchestrator's child.`,
      host: true,
    });
    if (reply.tool?.name === "mcp__cawco__delegate") {
      delegated.add(brief);
    }
    return reply;
  }
  if (brief.includes(TAGS.orchestrate) && !heldAfterDelegate.has(brief)) {
    // The delegate's answer: it holds from here.
    heldAfterDelegate.add(brief);
    return shell(brief, HOLD_COMMAND);
  }
  if (brief.includes(TAGS.hold) || brief.includes(TAGS.orchestrate)) {
    // A shell result is the hold cut short: the turn ends. Any other turn
    // (its brief, a wake) holds again.
    return request.afterTool ? text("held") : shell(brief, HOLD_COMMAND);
  }
  return text("ok");
};

/** Until a session whose brief carries `words` has been had run `command`. */
const ran = (label: string, words: string, command: string) =>
  until(
    label,
    () =>
      issued.some(
        (one) => one.brief.includes(words) && one.command === command
      ),
    Boolean,
    180_000
  );

interface Started {
  instanceId: string;
  workItemId: string;
  workspaceId: string;
}

interface ItemRow {
  background: number;
  ended_at: number | null;
  error: string | null;
  id: string;
  instance_id: string;
  parent_instance_id: string;
  state: string;
  stopping_at: number | null;
  workspace_id: string;
}

const ITEM =
  "SELECT id, instance_id, parent_instance_id, state, error, ended_at, stopping_at, background, workspace_id FROM work_items";

const itemOf = (fleet: KitFleet, id: string): ItemRow | undefined =>
  fleet.query<ItemRow>(`${ITEM} WHERE id = ?`, id)[0];

/** A host-scope delegate of `parent`, filed as its `delegate` call files it. */
const delegate = (
  fleet: KitFleet,
  parent: string,
  title: string,
  prompt: string,
  extra: object = {}
): Promise<Started> =>
  fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title,
    prompt,
    harness: "claude",
    model: MODEL.claude,
    host: true,
    ...extra,
  });

/**
 * What the parent was told since request `from`: the conversation of each
 * request its model was asked, the parent's being the one session here whose
 * brief carries no tag.
 */
const parentHeard = (fleet: KitFleet, from: number): string =>
  fleet.seen
    .slice(from)
    .filter((one) => one.tools && !briefOf(one).includes("PROBE-"))
    .map((one) => one.all)
    .join("\n");

/** k1. */
const keyedLeg = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string
): Promise<void> => {
  const session = {
    base: fleet.base,
    id: parent,
    credential: await fleet.sessionCredential(parent),
  };
  const ask = {
    title: "Keyed delegate",
    prompt: `${TAGS.hold}: the keyed delegate.`,
    host: true,
  };
  const toolUse = `toolu_probe_${crypto.randomUUID().slice(0, 12)}`;
  const once = {
    via: "mcp" as const,
    meta: { "claudecode/toolUseId": toolUse },
  };
  const [first, again] = await Promise.all([
    toolWords(session, "delegate", ask, once),
    delay(300).then(() => toolWords(session, "delegate", ask, once)),
  ]);
  const later = await toolWords(session, "delegate", ask, once);
  const filed = () =>
    fleet.query<{ id: string }>(
      "SELECT id FROM work_items WHERE title = ?",
      ask.title
    ).length;
  kit.check(
    "k1: a delegate call sent again under the same tool use id answers the same item, while it runs and once answered, and files one",
    !first.refused &&
      first.text === again.text &&
      first.text === later.text &&
      filed() === 1,
    `first ${JSON.stringify(first.text.slice(0, 160))}; again ${JSON.stringify(again.text.slice(0, 160))}; later ${JSON.stringify(later.text.slice(0, 160))}; filed ${filed()}`
  );
  const other = await toolWords(session, "delegate", ask, {
    via: "mcp",
    meta: { "claudecode/toolUseId": `${toolUse}-other` },
  });
  kit.check(
    "k1: a call under another tool use id files a second item",
    !other.refused && other.text !== first.text && filed() === 2,
    `other ${JSON.stringify(other.text.slice(0, 160))}; filed ${filed()}`
  );
};

/** t1–t3. */
const treeLeg = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string
): Promise<void> => {
  const orchestrator = await delegate(
    fleet,
    parent,
    "Tree orchestrator",
    `${TAGS.hold}: the orchestrator.`,
    { canDelegate: true }
  );
  const childA = await delegate(
    fleet,
    orchestrator.instanceId,
    "Tree child A",
    `${TAGS.hold}: child A.`,
    { canDelegate: true }
  );
  const childB = await delegate(
    fleet,
    orchestrator.instanceId,
    "Tree child B",
    `${TAGS.hold}: child B.`
  );
  const grandchild = await delegate(
    fleet,
    childA.instanceId,
    "Tree grandchild A1",
    `${TAGS.hold}: grandchild A1.`
  );
  const all = [orchestrator, childA, childB, grandchild];
  for (const words of [
    "the orchestrator",
    "child A",
    "child B",
    "grandchild A1",
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: each session's hold, one after another
    await ran(
      `${words} holding its turn`,
      `${TAGS.hold}: ${words}.`,
      HOLD_COMMAND
    );
  }
  await delay(3000);
  const heardFrom = fleet.seen.length;
  fleet.freeze("agent", true);
  let frozen: {
    rows: { ended_at: number | null; instance_id: string }[];
    items: (ItemRow | undefined)[];
  };
  try {
    await fleet.api("/api/work-items/stop", {
      from: parent,
      instanceId: orchestrator.instanceId,
    });
    await delay(6000);
    frozen = {
      rows: fleet.query<{ ended_at: number | null; instance_id: string }>(
        "SELECT instance_id, ended_at FROM tree_stops"
      ),
      items: all.map((one) => itemOf(fleet, one.workItemId)),
    };
  } finally {
    fleet.freeze("agent", false);
  }
  const asked = (id: string) =>
    frozen.rows.find((row) => row.instance_id === id)?.ended_at !== null &&
    frozen.rows.some((row) => row.instance_id === id);
  const reportedEarly = parentHeard(fleet, heardFrom).includes(
    "Tree orchestrator"
  );
  kit.check(
    "t1: frozen, the leaves' ends are asked, the middle and the orchestrator wait, every item is held live, and nothing reaches the parent",
    frozen.rows.length === 4 &&
      asked(grandchild.instanceId) &&
      asked(childB.instanceId) &&
      !asked(childA.instanceId) &&
      !asked(orchestrator.instanceId) &&
      frozen.items.every(
        (item) => item?.state === "running" && item.stopping_at !== null
      ) &&
      !reportedEarly,
    `rows ${JSON.stringify(frozen.rows)}; items ${JSON.stringify(frozen.items.map((item) => [item?.state, item?.stopping_at]))}; reported early ${reportedEarly}`
  );
  const ended = await until(
    "the orchestrator's item cancelled",
    () => itemOf(fleet, orchestrator.workItemId),
    (item) => item.state === "cancelled",
    180_000
  ).catch(() => undefined);
  const items = all.map((one) => itemOf(fleet, one.workItemId));
  const [o, a, b, a1] = items.map((item) => item?.ended_at ?? Number.NaN);
  const left = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM tree_stops"
  );
  kit.check(
    "t2: each ends before the session that started it, the orchestrator last; every item cancelled, no stop row left",
    ended !== undefined &&
      items.every((item) => item?.state === "cancelled") &&
      (a1 as number) <= (a as number) &&
      (a as number) <= (o as number) &&
      (b as number) <= (o as number) &&
      left.length === 0,
    `ended_at o ${o}, a ${a}, b ${b}, a1 ${a1}; states ${items.map((item) => item?.state).join(", ")}; rows left ${left.length}`
  );
  const headline = workWords.stoppedHeadline("Tree orchestrator", 3);
  const report = await until(
    "the orchestrator's report at its parent",
    () => {
      const heard = parentHeard(fleet, heardFrom);
      return heard.includes(headline) ? heard : undefined;
    },
    Boolean,
    120_000
  ).catch(() => parentHeard(fleet, heardFrom));
  const lineOf = (title: string, nested: boolean) =>
    new RegExp(
      `^${nested ? " {2}" : ""}- ${title} \\(work item [0-9a-f]{8}\\): cancelled`,
      "m"
    ).test(report);
  kit.check(
    "t3: the orchestrator's report reaches its parent, listing how each delegate under it ended, the grandchild under its parent",
    report.includes(headline) &&
      report.includes(workWords.stoppedDelegates) &&
      lineOf("Tree child A", false) &&
      lineOf("Tree child B", false) &&
      lineOf("Tree grandchild A1", true),
    report.slice(report.indexOf(headline), report.indexOf(headline) + 900) ||
      report.slice(-900)
  );
};

/** p1. */
const retryLeg = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string
): Promise<void> => {
  const heardFrom = fleet.seen.length;
  const started = Date.now();
  const retried = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: "Retried delegate",
    prompt: `${TAGS.retry}: ask the provider.`,
    harness: "opencode",
    model: MODEL.opencode,
    host: true,
    budget: { minutes: 2 },
  });
  const item = await until(
    "the retried delegate's item ended",
    () => itemOf(fleet, retried.workItemId),
    (row) => row.state !== "starting" && row.state !== "running",
    150_000
  ).catch(() => itemOf(fleet, retried.workItemId));
  const opening = workWords.providerRetryEnded("x", "y").split("(")[0] ?? "";
  const heard = await until(
    "the retried delegate's report at its parent",
    () => {
      const words = parentHeard(fleet, heardFrom);
      return words.includes(opening) ? words : undefined;
    },
    Boolean,
    60_000
  ).catch(() => parentHeard(fleet, heardFrom));
  kit.check(
    "p1: a delegate whose provider retries past its deadline fails at once, before its budget, in the provider-retry words, and its parent hears it",
    item?.state === "failed" &&
      (item.error ?? "").startsWith(opening) &&
      (item.ended_at ?? 0) - started < 120_000 &&
      heard.includes(opening),
    `item ${JSON.stringify(item)}; parent heard ${JSON.stringify(heard.slice(-600))}`
  );
};

/** c1, c2. */
const cutLeg = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string
): Promise<void> => {
  const heardFrom = fleet.seen.length;
  const cut = await delegate(
    fleet,
    parent,
    "Cut delegate",
    `${TAGS.cut}: print and wait.`
  );
  const kill = async (mark: string) => {
    await ran(`the cut delegate running ${mark}`, TAGS.cut, cutCommand(mark));
    await delay(4000);
    const pid = await until(
      "the cut delegate's process",
      () => fleet.sessionPid(cut.instanceId),
      Boolean,
      60_000
    );
    // The CLI and the command it runs: a CLI killed alone leaves its
    // command running, adopted by init (the spool it wrote stays either way).
    await fleet.killTree(pid, "SIGKILL");
  };
  await kill(MARKS[0]);
  const said = workWords.commandInterrupted(
    cutCommand(MARKS[0]),
    `${MARKS[0]}\n`
  );
  const handedBack = await until(
    "the handed-back turn",
    () =>
      fleet.seen.find(
        (one) => briefOf(one).includes(TAGS.cut) && one.last.includes(KILLED)
      )?.last,
    Boolean,
    120_000
  ).catch(() => "");
  kit.check(
    "c1: the turn handed back after a kill says the command interrupted, with what it had printed",
    handedBack.includes(said),
    handedBack.slice(0, 800)
  );
  await kill(MARKS[1]);
  const item = await until(
    "the cut delegate's item failed",
    () => itemOf(fleet, cut.workItemId),
    (row) => row.state === "failed",
    120_000
  ).catch(() => itemOf(fleet, cut.workItemId));
  const second = workWords.commandInterrupted(
    cutCommand(MARKS[1]),
    `${MARKS[1]}\n`
  );
  const heard = await until(
    "the cut delegate's report",
    () => {
      const words = parentHeard(fleet, heardFrom);
      return words.includes(second) ? words : undefined;
    },
    Boolean,
    60_000
  ).catch(() => parentHeard(fleet, heardFrom));
  kit.check(
    "c2: killed again mid-command, its item fails, and its parent's report says the second command interrupted, with its output",
    item?.state === "failed" &&
      (item.error ?? "").includes(second) &&
      heard.includes(second),
    `item ${JSON.stringify(item)}; heard ${JSON.stringify(heard.slice(-800))}`
  );
};

/** r1, r2. */
const routineLeg = async (
  kit: Kit,
  fleet: KitFleet,
  src: string,
  projectId: string
): Promise<void> => {
  const maker = await fleet.spawn("claude", "Routine maker", src, {
    projectId,
  });
  const made = await toolWords(
    {
      base: fleet.base,
      id: maker,
      credential: await fleet.sessionCredential(maker),
    },
    "routine_create",
    {
      name: "Background orchestrator",
      prompt: `${TAGS.orchestrate}: delegate one background child.`,
      target: "orchestrator",
      cron: "0 0 1 1 *",
      time_zone: "UTC",
    }
  );
  const orchestrator = await until(
    "the routine's orchestrator item",
    () =>
      fleet.query<ItemRow>(
        "SELECT id, instance_id, parent_instance_id, state, error, ended_at, stopping_at, background, workspace_id FROM work_items WHERE parent_instance_id LIKE 'routine:%' AND title = ?",
        "Background orchestrator"
      )[0],
    Boolean,
    120_000
  ).catch(() => undefined);
  const child = orchestrator
    ? await until(
        "the orchestrator's child item",
        () =>
          fleet.query<ItemRow>(
            "SELECT id, instance_id, parent_instance_id, state, error, ended_at, stopping_at, background, workspace_id FROM work_items WHERE parent_instance_id = ?",
            orchestrator.instance_id
          )[0],
        Boolean,
        180_000
      ).catch(() => undefined)
    : undefined;
  const [place] = orchestrator
    ? fleet.query<{ host: number; path: string }>(
        "SELECT host, path FROM workspaces WHERE id = ?",
        orchestrator.workspace_id
      )
    : [];
  kit.check(
    "r1: a routine with target orchestrator runs a background host-scope item in the project's checkout, which delegates a child",
    !made.refused &&
      orchestrator?.background === 1 &&
      place?.host === 1 &&
      place.path === src &&
      child !== undefined &&
      child.background === 0,
    `made ${JSON.stringify(made.text.slice(0, 200))}; orchestrator ${JSON.stringify(orchestrator)}; place ${JSON.stringify(place)}; child ${JSON.stringify(child)}`
  );
  if (!(orchestrator && child)) {
    return;
  }
  await until(
    "the orchestrator's child running",
    () => itemOf(fleet, child.id),
    (row) => row.state === "running",
    120_000
  ).catch(() => undefined);
  await fleet.stopSession(maker);
  await until(
    "the routine maker's end confirmed",
    () =>
      fleet.query<{ end_confirmed_at: number | null }>(
        "SELECT end_confirmed_at FROM instances WHERE id = ?",
        maker
      )[0],
    (row) => row.end_confirmed_at !== null,
    120_000
  ).catch(() => undefined);
  await delay(5000);
  const after = [itemOf(fleet, orchestrator.id), itemOf(fleet, child.id)];
  const held = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM tree_stops"
  );
  kit.check(
    "r2: the session that made the routine stopped, the orchestrator and its child run on, and no stop holds them",
    after.every(
      (row) => row?.state === "running" && row.stopping_at === null
    ) && held.length === 0,
    `after ${JSON.stringify(after.map((row) => [row?.state, row?.stopping_at]))}; stop rows ${JSON.stringify(held)}`
  );
};

/** Whether a process whose command line holds `command` runs now (the probe's own reading, no part of the fleet's). */
const runs = async (command: string): Promise<boolean> =>
  (await commandLines()).some((one) => one.command.includes(command));

/**
 * o1, x1, x2: a delegate on `harness` runs its command; `kill` ends its
 * harness process alone (never the command); the command must be gone
 * within a few seconds, named in the agent's log, and the turn handed back
 * must name it interrupted: with no output kept where its harness keeps
 * none (pi, OpenCode).
 */
const leftLeg = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string,
  how: {
    harness: "claude" | "pi" | "opencode";
    kill: (instanceId: string) => Promise<void>;
    leg: string;
    tag: keyof typeof LEFT;
    unkept: boolean;
  }
): Promise<void> => {
  const command = LEFT[how.tag];
  const mark = await fleet.logMark("agent");
  const started = await fleet.api<Started>("/api/work-items", {
    parentInstanceId: parent,
    title: `${how.harness} cut delegate`,
    prompt: `${how.tag}: run and wait.`,
    harness: how.harness,
    model: MODEL[how.harness],
    host: true,
  });
  await ran(
    `the ${how.harness} delegate running its command`,
    how.tag,
    command
  );
  await until(`${command} running`, () => runs(command), Boolean, 60_000);
  await delay(4000);
  // Where the command runs, as the kill finds it: its ancestry, for a
  // failure to say.
  const ancestry = await ancestryOf(command);
  await how.kill(started.instanceId);
  const gone = await until(
    `${command} ended`,
    async () => !(await runs(command)),
    Boolean,
    20_000
  ).catch(() => false);
  const said = await until(
    "the agent's line on what it ended",
    async () => {
      const log = await mark.since();
      return log.includes(command) && log.includes(workWords.leftRunningEnded)
        ? log
        : undefined;
    },
    Boolean,
    20_000
  ).catch(async () => await mark.since());
  const line =
    said.split("\n").find((one) => one.includes(workWords.leftRunningEnded)) ??
    "";
  kit.check(
    `${how.leg}: a ${how.harness} session's harness process killed alone mid-command: within seconds its command is gone, named in the agent's log`,
    gone === true && line.includes(command),
    line || `no such line in the agent's log; ${command} ran under ${ancestry}`
  );
  const words = workWords.commandInterrupted(
    command,
    how.unkept ? undefined : ""
  );
  // The session's transcript as the hub serves it: the message the turn
  // was handed back in, as the session and the person both read it.
  const handedBack = await until(
    "the turn handed back",
    async () => {
      const read = await fetch(
        `${fleet.base}/api/instances/${started.instanceId}/transcript`
      );
      const transcript = read.ok ? await read.text() : "";
      return transcript.includes(JSON.stringify(words).slice(1, -1))
        ? words
        : undefined;
    },
    Boolean,
    120_000
  ).catch(() => "");
  kit.check(
    `${how.leg}: the turn handed back to the ${how.harness} session names the command interrupted${how.unkept ? ", its output not kept" : ""}`,
    handedBack.includes(words),
    handedBack.slice(0, 900)
  );
};

/** A running `command`'s ancestors, nearest first, each its pid and command line. */
const ancestryOf = async (command: string): Promise<string> => {
  const lines = new Map(
    (await commandLines()).map((one) => [one.pid, one.command])
  );
  const parents = new Map(
    (await processLineage()).map((row) => [row.pid, row.ppid])
  );
  const start = [...lines].find(([, line]) => line.includes(command))?.[0];
  const chain: string[] = [];
  for (let at = start; at && at > 1; at = parents.get(at)) {
    chain.push(`${at} ${(lines.get(at) ?? "?").slice(0, 80)}`);
  }
  return chain.join(" < ") || "nothing";
};

/** What a session's harness reads, off its process's environment: its Claude config dir. */
const configDirOf = (
  fleet: KitFleet,
  id: string
): Promise<string | undefined> => fleet.sessionEnv(id, "CLAUDE_CONFIG_DIR");

/** m1. */
const mcpOrphanLeg = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string
): Promise<void> => {
  const marker = `probe-mcp-orphan-${crypto.randomUUID().slice(0, 8)}`;
  const flag = join(fleet.sandbox, `${marker}.flag`);
  const launcher = join(fleet.sandbox, `${marker}.sh`);
  // The server's launcher, as an MCP server's wrapper does it: its helper
  // in a session of its own, then it exits. Only the session started while
  // the flag stands gets one.
  await writeFile(
    launcher,
    `#!/bin/sh
[ -e '${flag}' ] || exit 0
rm -f '${flag}'
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' '${process.execPath}' -e 'setTimeout(() => {}, 3604000)' ${marker} </dev/null >/dev/null 2>&1 &
exit 0
`,
    { mode: 0o755 }
  );
  // A user-scope MCP server, as Claude Code reads it from its config dir's
  // `.claude.json` (every session of the account loads it).
  const claudeJson = configDirClaudeJson(await configDirOf(fleet, parent));
  const config = JSON.parse(
    await Bun.file(claudeJson)
      .text()
      .catch(() => "{}")
  ) as { mcpServers?: Record<string, unknown> };
  config.mcpServers = {
    ...config.mcpServers,
    "probe-orphan": { type: "stdio", command: "/bin/sh", args: [launcher] },
  };
  await writeFile(claudeJson, JSON.stringify(config, null, 2));
  await writeFile(flag, "");
  const started = await delegate(
    fleet,
    parent,
    "MCP orphan delegate",
    `${TAGS.mcpOrphan}: its MCP server leaves a helper.`
  );
  const orphan = await until(
    `${marker} running`,
    async () =>
      (await commandLines()).find((one) => one.command.includes(marker))?.pid,
    Boolean,
    120_000
  ).catch(() => undefined);
  const harness = await fleet.sessionPid(started.instanceId);
  const lineage = await processLineage();
  const row = lineage.find((one) => one.pid === orphan);
  const harnessGroup = lineage.find((one) => one.pid === harness)?.pgid;
  await delay(5000);
  const mark = await fleet.logMark("sessiond");
  signal(
    await heldPid(fleet, (procId) => procId === started.instanceId),
    "SIGKILL"
  );
  const gone = await until(
    `${marker} ended`,
    async () =>
      !(await commandLines()).some((one) => one.command.includes(marker)),
    Boolean,
    20_000
  ).catch(() => false);
  const said = await until(
    "sessiond's line on what it ended",
    async () => {
      const log = await mark.since();
      return log.includes(marker) ? log : undefined;
    },
    Boolean,
    20_000
  ).catch(async () => await mark.since());
  const line =
    said.split("\n").find((one) => one.includes(workWords.leftRunningSwept)) ??
    "";
  kit.check(
    "m1: a helper the harness started outside any shell call, orphaned out of its process group, is ended within seconds of the harness's kill and named in its keeper's log",
    row !== undefined &&
      row.ppid !== harness &&
      row.pgid !== harnessGroup &&
      gone === true &&
      line.includes(marker),
    `orphan ${orphan ?? "never seen"} (ppid ${row?.ppid}, pgid ${row?.pgid}; harness ${harness}, its group ${harnessGroup}); gone ${gone}; ${line || "no such line in sessiond's log"}`
  );
  const after = JSON.parse(await Bun.file(claudeJson).text()) as {
    mcpServers?: Record<string, unknown>;
  };
  await writeFile(
    claudeJson,
    JSON.stringify(
      {
        ...after,
        mcpServers: Object.fromEntries(
          Object.entries(after.mcpServers ?? {}).filter(
            ([name]) => name !== "probe-orphan"
          )
        ),
      },
      null,
      2
    )
  );
  const stray = (await commandLines()).filter((one) =>
    one.command.includes(marker)
  );
  for (const left of stray) {
    signal(listedPid(left.pid), "SIGKILL");
  }
};

/** The pid of a fleet process sessiond holds whose proc id `match` takes. */
const heldPid = async (
  fleet: KitFleet,
  match: (procId: string) => boolean
): Promise<Pid> =>
  until(
    "a process sessiond holds",
    async () => (await fleet.heldProcs()).find((one) => match(one.procId))?.pid,
    Boolean,
    60_000
  );

/** u1, u2. */
const custodyLeg = async (
  kit: Kit,
  fleet: KitFleet,
  parent: string
): Promise<void> => {
  const heardFrom = fleet.seen.length;
  const held = await delegate(
    fleet,
    parent,
    "Custody delegate",
    `${TAGS.custody}: hold, then finish when woken.`
  );
  await ran("the custody delegate holding", TAGS.custody, HOLD_COMMAND);
  await delay(3000);
  const pid = await fleet.sessionPid(held.instanceId);
  await fleet.stop("agent");
  if (pid !== undefined) {
    // The CLI and its command, which a CLI killed alone leaves running.
    await fleet.killTree(pid, "SIGKILL");
  }
  await delay(2000);
  fleet.freeze("sessiond", true);
  const seenWhile: { custody?: string; state?: string; status?: string }[] = [];
  try {
    fleet.launch("agent");
    for (let look = 0; look < 12; look += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one look every two seconds, while custody is undecided
      await delay(2000);
      const row = (
        await fleet
          .api<
            { custody?: { state: string }; machineId: string; status: string }[]
          >("/api/agents")
          .catch(() => [])
      ).find((one) => one.machineId === MACHINE);
      seenWhile.push({
        custody: row?.custody?.state,
        status: row?.status,
        state: itemOf(fleet, held.workItemId)?.state,
      });
    }
  } finally {
    fleet.freeze("sessiond", false);
  }
  const undecided = parentHeard(fleet, heardFrom);
  kit.check(
    "u1: while the machine's custody is undecided the item stays live and its parent hears nothing",
    seenWhile.every(
      (one) => one.state === "running" && one.custody !== "available"
    ) && !undecided.includes("Custody delegate"),
    JSON.stringify(seenWhile)
  );
  await fleet.agentUp();
  const done = await until(
    "the custody delegate's item done",
    () => itemOf(fleet, held.workItemId),
    (row) => row.state === "done" || row.state === "failed",
    240_000
  ).catch(() => itemOf(fleet, held.workItemId));
  const heard = await until(
    "the custody delegate's report",
    () => {
      const words = parentHeard(fleet, heardFrom);
      return words.includes(CUSTODY_DONE) ? words : undefined;
    },
    Boolean,
    60_000
  ).catch(() => parentHeard(fleet, heardFrom));
  kit.check(
    "u2: custody decided, the session is woken and finishes, and its parent hears the report",
    done?.state === "done" && heard.includes(CUSTODY_DONE),
    `item ${JSON.stringify(done)}; heard ${JSON.stringify(heard.slice(-600))}`
  );
};

const spec: Spec = {
  name: "tree-run",
  run: async (kit: Kit) => {
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
    await Bun.$`sh -c ${"git init -q -b main && echo tree > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Tree run",
      machineId: MACHINE,
      cwd: src,
      caw: false,
    });
    const parent = await fleet.spawn("claude", "Probe parent", src, {
      projectId: project.id,
    });
    await keyedLeg(kit, fleet, parent);
    await treeLeg(kit, fleet, parent);
    await retryLeg(kit, fleet, parent);
    await cutLeg(kit, fleet, parent);
    await routineLeg(kit, fleet, src, project.id);
    /** Its harness process alone, the one sessiond holds under `procId`, killed: never its command. */
    const killHeld =
      (match: (procId: string, id: string) => boolean) =>
      async (id: string): Promise<void> => {
        signal(await heldPid(fleet, (procId) => match(procId, id)), "SIGKILL");
      };
    await leftLeg(kit, fleet, parent, {
      leg: "o1",
      harness: "claude",
      tag: TAGS.orphan,
      unkept: false,
      kill: killHeld((procId, id) => procId === id),
    });
    await leftLeg(kit, fleet, parent, {
      leg: "x1",
      harness: "pi",
      tag: TAGS.piCut,
      unkept: true,
      kill: killHeld((procId, id) => procId === `pi:${id}`),
    });
    await leftLeg(kit, fleet, parent, {
      leg: "x2",
      harness: "opencode",
      tag: TAGS.openCut,
      unkept: true,
      // Its server as sessiond holds it: the process the agent started
      // OpenCode's server under.
      kill: killHeld((procId) => procId.startsWith("opencode-server")),
    });
    await mcpOrphanLeg(kit, fleet, parent);
    await custodyLeg(kit, fleet, parent);
  },
};

export default spec;
