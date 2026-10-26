/**
 * A hub restart at any moment loses nothing a session or the person was
 * owed, and no work ends silently (Pi Durable's rules, 13.1–13.8, as CawCo
 * takes them). On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model), each leg kills the hub at its point (SIGKILL, as
 * a crash does), starts it again, and reads what a person or a session sees
 * after it: the hub's own records (Needs you's notices among them) and what
 * the model was sent.
 *
 * - (a) Held pictures: a page's pictures of a pin are held (artifacts
 *   held-pictures.ts) and the pin written into the page's doc; the hub dies
 *   inside the quiet before their delivery. Started again, the delivery
 *   reaches the session with the pin's words and its picture.
 * - (b) What a move ended: the hub kept a move's ending (db `move_endings`,
 *   a background task and the last of its output) and died before the
 *   session's next launch. Started again, the session's next turn reads what
 *   was ended, interrupted with its outcome unknown, with that output.
 * - (c) Completing: an item whose own delegate is still live calls
 *   finish_item; it is stored `completing`, not landed. The hub dies, and
 *   starts again: still completing, nothing on main. Its delegate lands, and
 *   only then does it land.
 * - (d) A gate cut between steps: three gate steps, the hub killed while the
 *   second runs. Started again, the landing resumes at its step: the first
 *   step never runs again (its pass was kept), the second and third run, and
 *   the item lands, its report saying where the first passed.
 * - (e) A deleted delegate type: an item's type is deleted while its session
 *   sleeps, and the hub restarts. A message to it does not start it: the item
 *   is blocked, not failed, the message kept at the hub under `blocked`, and
 *   Needs you tells you it is blocked and why (its notice, as a held item's),
 *   a notice that stands when you write to it again. The type back, the
 *   block clears, its notice goes and both messages go.
 * - (f) A background command cut by a restart: a session's command runs in
 *   the background, printing; the machine's processes and the hub all die
 *   and start again. The session is told the command was interrupted, its
 *   outcome unknown, with its output so far.
 *
 * Legs (c), (d) and (e) delegate, so the spec runs on the host.
 * `HUB_RESTART_LEGS=a,b,f` runs only the legs named.
 *
 *   bun scripts/probe-kit/run.ts hub-restart-holds
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg, and one step of it, at a time
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { writePin } from "../../../packages/core/src/comments";
import { workWords } from "../../../packages/core/src/words/work";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate } from "../gate";
import type { Kit, KitFleet, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const WAIT = "mcp__cawco__wait_item";
const CREATE = "mcp__cawco__artifact_create";
const LEGS = ["a", "b", "c", "d", "e", "f"] as const;
type Leg = (typeof LEGS)[number];
/** The legs this run takes: `HUB_RESTART_LEGS`, else all. */
const chosen = new Set<Leg>(
  (process.env.HUB_RESTART_LEGS?.split(",") ?? LEGS).filter((one): one is Leg =>
    (LEGS as readonly string[]).includes(one)
  )
);
/** A 1×1 PNG: the page's picture of its pin. */
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IMAGE_BLOCK = /"type":"image"/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** What the hub tells a session whose move ended its work (server.ts `endedByMoveWords`). */
const MOVED = "You were moved to another account.";
/** What every cut's words say of each task (server.ts `cutTasksWords`, `endedByMoveWords`). */
const INTERRUPTED = workWords.interrupted;
/** The gate steps' log, in each workspace's scratch dir. */
const STEP_LOG = "probe-restart-steps.log";
/** (d)'s gate: three steps, the second long enough to kill the hub inside it. */
const GATE_D = `---
sh -c 'echo "one" >> "$TMPDIR/${STEP_LOG}"'
  name: step one
sh -c 'echo "two" >> "$TMPDIR/${STEP_LOG}"; sleep 25'
  name: step two
sh -c 'echo "three" >> "$TMPDIR/${STEP_LOG}"'
  name: step three
---
`;
const TYPE_E = "probe-restart-type";
/** (f)'s command: two lines, then a long wait in the background. */
const COMMAND_F = "echo PROBE-PARTIAL-ONE; echo PROBE-PARTIAL-TWO; sleep 900";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** `name` called when offered, else found first through ToolSearch. */
const offered = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** A delegate's steps: it commits, waits until the spec arms it, then finishes. */
interface Steps {
  armed: boolean;
  committed: boolean;
  finished: boolean;
  rested: boolean;
}
const steps = new Map<string, Steps>();
const stepsOf = (tag: string): Steps => {
  const known = steps.get(tag);
  if (known) {
    return known;
  }
  const made = {
    armed: false,
    committed: false,
    finished: false,
    rested: false,
  };
  steps.set(tag, made);
  return made;
};
/** Tool calls the spec asks of a session, by marker; their answers once heard. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const CALL = /PROBE-RH-CALL:(\d+)/g;
const TAG = /PROBE-RH-([A-Z0-9]+)\b/g;
/** Every request the model was asked with a tool list, in order. */
const heard: Seen[] = [];
/** (f) ran its command. */
let commanded = false;

/** A delegate tagged `tag`: commit `tag`.txt, wait for its arming, then finish. */
const delegateReply = (request: Seen, tag: string): Reply => {
  const step = stepsOf(tag);
  if (!step.committed) {
    step.committed = true;
    const file = `${tag.toLowerCase()}.txt`;
    return tool("Bash", {
      command: `printf '${tag}\\n' > ${file} && git add ${file} && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
      description: "Commit",
    });
  }
  if (!step.armed) {
    return tool("Bash", { command: "sleep 2", description: "Wait" });
  }
  if (!step.finished) {
    const reply = offered(request, FINISH, {
      headline: `Committed ${tag}.`,
      summary: `Committed ${tag}.\n\nNot run: none.`,
    });
    if (reply.tool?.name === FINISH) {
      step.finished = true;
    }
    return reply;
  }
  return text("done");
};

/** (e)'s delegate: rests on a declared wait, so its turns end held, never quiet. */
const restingReply = (request: Seen, tag: string): Reply => {
  const step = stepsOf(tag);
  if (!step.rested) {
    const reply = offered(request, WAIT, {
      minutes: 60,
      reason: "the spec's word",
    });
    if (reply.tool?.name === WAIT) {
      step.rested = true;
    }
    return reply;
  }
  return text("Resting.");
};

const callReply = (request: Seen): Reply | undefined => {
  const marker = [...request.all.matchAll(CALL)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return;
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  const reply = offered(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  heard.push(request);
  const call = callReply(request);
  if (call) {
    return call;
  }
  const tags = [...request.all.matchAll(TAG)].map((match) => match[1]);
  const tag = tags.find((one) => one !== "CALL");
  if (!tag) {
    return text("ok");
  }
  if (tag === "F" && !commanded) {
    commanded = true;
    return tool("Bash", {
      command: COMMAND_F,
      description: "Long command",
      run_in_background: true,
    });
  }
  if (tag === "E") {
    return restingReply(request, tag);
  }
  if (tag === "C" || tag === "CHILD" || tag === "D") {
    return delegateReply(request, tag);
  }
  return text(`Heard ${tag}.`);
};

interface ItemRow {
  blocked: string | null;
  ended_at: number | null;
  error: string | null;
  instance_id: string;
  landing_phase: string | null;
  result: string | null;
  state: string;
  submission: string | null;
  workspace_id: string;
}

/** What every leg works with. */
interface Legs {
  check: Kit["check"];
  fleet: KitFleet;
  /** The project's main branch's commit subjects, newest first. */
  mainLog: () => Promise<string[]>;
  parent: string;
  projectId: string;
  repo: string;
}

const itemOf = (fleet: KitFleet, id: string): ItemRow | undefined =>
  fleet.query<ItemRow>(
    "SELECT state, error, result, instance_id, workspace_id, landing_phase, submission, blocked, ended_at FROM work_items WHERE id = ?",
    id
  )[0];

/** Kills the hub as a crash does and starts it again; answers once its agent is back online. */
const restartHub = async (fleet: KitFleet): Promise<void> => {
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
};

/** Asks `id` to sleep (again every 15 s: a machine refuses one not at rest) until its row reads sleeping. */
const asleep = async (fleet: KitFleet, id: string): Promise<string> => {
  let askedAt = 0;
  return await until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      const status = fleet.instance(id)?.status ?? "";
      if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
        askedAt = Date.now();
        await fleet.control(id, "sleep");
      }
      return status;
    },
    (status) => status === "sleeping",
    120_000
  ).catch(() => fleet.instance(id)?.status ?? "gone");
};

/** A tool call the mock makes in session `to`, and the tool's answer. */
let calls = 0;
const callIn = async (
  fleet: KitFleet,
  to: string,
  name: string,
  input: object
): Promise<string> => {
  calls += 1;
  const marker = String(calls);
  asks.set(marker, { name, input: { response_format: "detailed", ...input } });
  await fleet.send(to, `PROBE-RH-CALL:${marker}`);
  return await until(
    `the ${name} call (${marker})`,
    () => answered.get(marker),
    Boolean,
    180_000
  );
};

/** A delegate of `parent` in the project, tagged `tag`; its item id. */
const delegate = async (
  legs: Legs,
  parent: string,
  tag: string,
  extra: object = {}
): Promise<string> => {
  const made = await legs.fleet.api<{ workItemId: string }>("/api/work-items", {
    parentInstanceId: parent,
    title: `Restart leg ${tag}`,
    prompt: `PROBE-RH-${tag}: do your part.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: legs.repo,
    ...extra,
  });
  await until(
    `${tag}'s session running`,
    () => itemOf(legs.fleet, made.workItemId),
    (row) => row?.state === "running",
    300_000
  );
  return made.workItemId;
};

/** The step log of an item's workspace (its scratch dir under the fleet's HOME). */
const stepLogOf = (legs: Legs, workspaceId: string) =>
  readFile(
    join(
      legs.fleet.env.HOME as string,
      ".cawco",
      "tmp",
      workspaceId.slice(0, 8),
      STEP_LOG
    ),
    "utf8"
  ).catch(() => "");

const ended = (legs: Legs, id: string, tag: string) =>
  until(
    `${tag}'s item ended`,
    () => itemOf(legs.fleet, id),
    (row) => ["done", "failed", "cancelled"].includes(row?.state ?? ""),
    600_000
  );

/** (a) The pictures of a pin held across a crash reach the session with its delivery. */
const legA = async (legs: Legs) => {
  const { check, fleet } = legs;
  const session = await fleet.spawn("claude", "Restart A");
  await fleet.send(session, "hello");
  const made = await callIn(fleet, session, CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "hub-restart-holds",
    html: "<!doctype html><html><body><main><h1>Restart</h1><p>A page to pin.</p></main></body></html>",
  });
  const artifact = made.match(ANSWERED_ID)?.[1];
  // The page's own origin: its session's preview port, where its overlay posts.
  const port = fleet.query<{ port: number }>(
    "SELECT port FROM preview_ports WHERE instance_id = ?",
    session
  )[0]?.port;
  if (!(artifact && port)) {
    check(
      "(a) the page is made, on its session's preview port",
      false,
      `${made.slice(0, 400)}; port ${port}`
    );
    return;
  }
  const url = `http://${fleet.hub.at}:${port}/`;
  const pin = crypto.randomUUID();
  const held = await fetch(
    `http://${fleet.hub.at}:${port}/__cawco/artifact/${artifact}/pictures`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pictures: [{ mark: pin, png: PNG }], url }),
    }
  );
  const heldSaid = await held.text();
  const doc = new Doc();
  const link = new WebsocketProvider(
    `ws://${fleet.hub.at}:${new URL(fleet.base).port}/ws/artifact/${session}`,
    artifact,
    doc,
    { disableBc: true, WebSocketPolyfill: WebSocket as never }
  );
  await until("(a) the page's doc joined", () => link.synced, Boolean, 30_000);
  const at = new Date().toISOString();
  const before = heard.length;
  writePin(doc, {
    id: pin,
    number: 1,
    kind: "comment",
    anchor: {
      selector: "body > main",
      source: null,
      text: "A page to pin.",
      box: { x: 0, y: 0, w: 200, h: 80 },
    },
    at,
    by: "person",
    elements: [],
    point: { x: 0.5, y: 0.5 },
    thread: [
      { id: crypto.randomUUID(), by: "person", text: "PROBE-PIN-WORDS", at },
    ],
  });
  // Inside the 3 s quiet before its delivery (service.ts `COMMENTS_QUIET_MS`).
  await Bun.sleep(1000);
  link.destroy();
  doc.destroy();
  const early = heard
    .slice(before)
    .some((one) => one.all.includes("PROBE-PIN-WORDS"));
  await restartHub(fleet);
  const delivered = await until(
    "(a) the pin's delivery after the restart",
    () =>
      heard
        .slice(before)
        .find((one) => one.last.includes("PROBE-PIN-WORDS") && !one.afterTool),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "(a) a pin's picture held before a crash reaches the session with its delivery after the restart: the pin's words and its picture",
    held.ok &&
      !early &&
      !!delivered &&
      (delivered.body.match(IMAGE_BLOCK)?.length ?? 0) > 0,
    `pictures post ${held.status} ${heldSaid.slice(0, 120)}; delivered before the crash: ${early}; after: ${delivered ? `${delivered.body.match(IMAGE_BLOCK)?.length ?? 0} image block(s): ${delivered.last.slice(0, 300)}` : "nothing within 120 s"}`
  );
};

/** (b) What a move ended, kept across a crash, is read on the session's next turn. */
const legB = async (legs: Legs) => {
  const { check, fleet } = legs;
  const session = await fleet.spawn("claude", "Restart B");
  await fleet.send(session, "PROBE-RH-B: hello");
  await until(
    "(b) its first turn heard",
    () => heard.some((one) => one.all.includes("PROBE-RH-B: hello")),
    Boolean,
    120_000
  );
  const status = await asleep(fleet, session);
  await fleet.stop("hub", "SIGKILL");
  // The carry answered and the hub kept it, then died before the session's next launch.
  fleet.write(
    "INSERT INTO move_endings (instance_id, ended, created_at) VALUES (?, ?, ?)",
    session,
    JSON.stringify({
      tasks: [
        {
          taskId: "probe-task-b",
          type: "local_bash",
          description: "A probe command",
          output: "PROBE-B-OUTPUT-SO-FAR",
        },
      ],
      wakeups: 0,
    }),
    Date.now()
  );
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const before = heard.length;
  await fleet.send(session, "PROBE-RH-B: carry on");
  const read = await until(
    "(b) the session's next turn",
    () =>
      heard
        .slice(before)
        .find((one) => one.all.includes("PROBE-RH-B: carry on")),
    Boolean,
    120_000
  ).catch(() => undefined);
  const kept = fleet.query<{ n: number }>(
    "SELECT count(*) AS n FROM move_endings WHERE instance_id = ?",
    session
  )[0]?.n;
  check(
    "(b) what a move ended, kept before a crash, is read on the session's next turn after it: the task, interrupted with its outcome unknown, and its output so far; nothing of it is kept after",
    status === "sleeping" &&
      !!read &&
      read.all.includes(MOVED) &&
      read.all.includes("PROBE-B-OUTPUT-SO-FAR") &&
      read.all.includes(INTERRUPTED) &&
      kept === 0,
    `asleep: ${status}; read: ${read ? read.all.slice(-900) : "no turn within 120 s"}; kept after: ${kept}`
  );
};

/** (c) A completing item lands only after its own delegate, across a crash. */
const legC = async (legs: Legs) => {
  const { check, fleet } = legs;
  const owner = await delegate(legs, legs.parent, "C", { canDelegate: true });
  const ownerSession = itemOf(fleet, owner)?.instance_id ?? "";
  const child = await delegate(legs, ownerSession, "CHILD");
  stepsOf("C").armed = true;
  const stored = await until(
    "(c) the owner's finish_item stored, completing",
    () => itemOf(fleet, owner),
    (row) => row?.landing_phase === "completing",
    300_000
  ).catch(() => itemOf(fleet, owner));
  await restartHub(fleet);
  await Bun.sleep(10_000);
  const after = itemOf(fleet, owner);
  const mainAfter = await legs.mainLog();
  check(
    "(c) an item whose own delegate is live is stored completing at finish_item, and a crash keeps it so: still live, completing, its submission kept, nothing of it on main",
    stored?.landing_phase === "completing" &&
      after?.state === "running" &&
      after.landing_phase === "completing" &&
      !!after.submission &&
      !mainAfter.includes("Delegate commit C"),
    `at finish_item: ${stored?.state} ${stored?.landing_phase}; after the restart: ${after?.state} ${after?.landing_phase} submission ${after?.submission ? "kept" : "gone"}; main: ${mainAfter.join(" | ")}`
  );
  stepsOf("CHILD").armed = true;
  const childEnd = await ended(legs, child, "CHILD");
  const ownerEnd = await ended(legs, owner, "C");
  const main = await legs.mainLog();
  check(
    "(c) once its delegate has landed, the completing item lands: both done, the delegate's commit on main before its own",
    childEnd?.state === "done" &&
      ownerEnd?.state === "done" &&
      (ownerEnd.ended_at ?? 0) >= (childEnd.ended_at ?? 0) &&
      main.indexOf("Delegate commit C") !== -1 &&
      main.indexOf("Delegate commit CHILD") > main.indexOf("Delegate commit C"),
    `delegate: ${childEnd?.state} at ${childEnd?.ended_at}; owner: ${ownerEnd?.state} at ${ownerEnd?.ended_at} ${ownerEnd?.error ?? ""}; main: ${main.join(" | ")}`
  );
};

/** (d) A gate cut between its steps resumes at its step. */
const legD = async (legs: Legs) => {
  const { check, fleet } = legs;
  await declareGate(fleet.base, legs.projectId, GATE_D);
  const item = await delegate(legs, legs.parent, "D");
  const workspace = itemOf(fleet, item)?.workspace_id ?? "";
  stepsOf("D").armed = true;
  await until(
    "(d) its second gate step runs",
    () => stepLogOf(legs, workspace),
    (read) => read.includes("two"),
    600_000
  );
  const phase = itemOf(fleet, item)?.landing_phase;
  const passes = fleet.query<{ gate_passes: string | null }>(
    "SELECT gate_passes FROM work_items WHERE id = ?",
    item
  )[0]?.gate_passes;
  await restartHub(fleet);
  const end = await ended(legs, item, "D");
  const log = (await stepLogOf(legs, workspace)).trim().split("\n");
  const count = (line: string) => log.filter((one) => one === line).length;
  check(
    "(d) a gate cut inside its second step resumes at that step after the restart: the first step's pass was kept and it never runs again, the second and third run, and the item lands",
    phase === "gating" &&
      (passes ?? "").includes('echo \\"one\\"') &&
      count("one") === 1 &&
      count("two") >= 2 &&
      count("three") === 1 &&
      end?.state === "done",
    `phase at the cut: ${phase}; passes kept: ${passes}; step log: ${log.join(", ")}; item: ${end?.state} ${end?.error ?? ""}`
  );
  check(
    "(d) its report says where the first step passed, and that it was not run again",
    (end?.result ?? "").includes(
      "step one: pass (not run again: passed on this tree"
    ),
    (end?.result ?? "").slice(0, 1500)
  );
  await declareGate(fleet.base, legs.projectId, "---\n---\n");
};

/** (e) A deleted delegate type blocks its item at its next start, in Needs you, and its return lets it go on. */
const legE = async (legs: Legs) => {
  const { check, fleet } = legs;
  const put = (method: "PUT" | "DELETE") =>
    fetch(`${fleet.base}/api/delegate-types/${TYPE_E}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "PUT"
        ? {
            body: JSON.stringify({
              description: "A probe's type",
              harness: "claude",
              model: "claude-haiku-4-5",
            }),
          }
        : {}),
    });
  const madeType = await put("PUT");
  const item = await delegate(legs, legs.parent, "E", { type: TYPE_E });
  const session = itemOf(fleet, item)?.instance_id ?? "";
  await until(
    "(e) its wait declared",
    () => stepsOf("E").rested,
    Boolean,
    120_000
  );
  const status = await asleep(fleet, session);
  const deleted = await put("DELETE");
  await restartHub(fleet);
  const sent = await fleet.send(session, "PROBE-RH-E: go on");
  const blocked = await until(
    "(e) its item blocked",
    () => itemOf(fleet, item),
    (now) => !!now?.blocked,
    60_000
  ).catch(() => itemOf(fleet, item));
  const [send] = fleet.query<{
    hold: string | null;
    owed: string | null;
    state: string;
  }>("SELECT state, owed, hold FROM sent_messages WHERE uuid = ?", sent);
  // After the send that found it is taken (work-items.ts `blockIfMissing`).
  const told = await until(
    "(e) its notice in Needs you",
    () =>
      fleet.query<{ body: string; title: string }>(
        "SELECT title, body FROM fleet_watch_notices WHERE instance_id = ?",
        session
      )[0],
    Boolean,
    30_000
  ).catch(() => undefined);
  check(
    "(e) an item whose delegate type was deleted, started again after a restart, is blocked, never failed: still running, its message kept at the hub held `blocked`, and Needs you tells you it is blocked and why",
    madeType.ok &&
      deleted.ok &&
      status === "sleeping" &&
      blocked?.state === "running" &&
      (blocked.blocked ?? "").includes(TYPE_E) &&
      send?.state === "pending" &&
      !!send.owed &&
      send.hold === "blocked" &&
      told?.title === workWords.blockedTitle("Restart leg E") &&
      told.body === workWords.missingType(TYPE_E),
    `type put ${madeType.status}, deleted ${deleted.status}; asleep: ${status}; item: ${blocked?.state} ${blocked?.blocked ?? "no block"} ${blocked?.error ?? ""}; send: ${JSON.stringify(send)}; Needs you: ${told ? `${told.title}: ${told.body}` : "no notice"}`
  );
  // You write to it again while it is blocked: the notice stands.
  const again = await fleet.send(session, "PROBE-RH-E: still there?");
  await Bun.sleep(5000);
  const [standing] = fleet.query<{ title: string }>(
    "SELECT title FROM fleet_watch_notices WHERE instance_id = ?",
    session
  );
  const [kept] = fleet.query<{ hold: string | null; state: string }>(
    "SELECT state, hold FROM sent_messages WHERE uuid = ?",
    again
  );
  check(
    "(e) you write to the blocked item: its notice stands, and your message waits at the hub held `blocked`",
    standing?.title === workWords.blockedTitle("Restart leg E") &&
      kept?.state === "pending" &&
      kept.hold === "blocked",
    `notice: ${standing?.title ?? "gone"}; your message: ${JSON.stringify(kept)}`
  );
  const back = await put("PUT");
  const went = await until(
    "(e) its message goes once the type is back",
    () => fleet.sendRow(sent),
    (now) => now?.state === "read",
    120_000
  ).catch(() => fleet.sendRow(sent));
  const cleared = itemOf(fleet, item);
  const [notice] = fleet.query<{ title: string }>(
    "SELECT title FROM fleet_watch_notices WHERE instance_id = ?",
    session
  );
  check(
    "(e) the type back, the block clears within the sweep, its notice goes, and the kept message reaches the session",
    back.ok && !cleared?.blocked && !notice && went?.state === "read",
    `type put back ${back.status}; item blocked: ${cleared?.blocked ?? "no"}; notice: ${notice?.title ?? "gone"}; send: ${went?.state}`
  );
};

/** (f) A background command cut by a crash is told to the session, interrupted, with its output so far. */
const legF = async (legs: Legs) => {
  const { check, fleet } = legs;
  const session = await fleet.spawn("claude", "Restart F");
  await fleet.send(session, "PROBE-RH-F: run the command");
  const kept = await until(
    "(f) its background command on the hub's records",
    () =>
      fleet.query<{ task_id: string }>(
        "SELECT task_id FROM session_tasks WHERE instance_id = ?",
        session
      ),
    (rows) => rows.length > 0,
    120_000
  ).catch(() => []);
  // Its output written before the cut.
  await Bun.sleep(3000);
  await fleet.stop("agent");
  await fleet.killSessiond();
  await fleet.stop("hub", "SIGKILL");
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const before = heard.length;
  await fleet.send(session, "PROBE-RH-F: what happened?");
  const told = await until(
    "(f) the session told of the cut",
    () =>
      fleet
        .query<{ body: string }>(
          "SELECT body FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at",
          session
        )
        .map((row) => row.body)
        .find((body) => body.includes(INTERRUPTED)),
    Boolean,
    150_000
  ).catch(() => undefined);
  const read = await until(
    "(f) the model read it",
    () => heard.slice(before).find((one) => one.all.includes(INTERRUPTED)),
    Boolean,
    60_000
  ).catch(() => undefined);
  check(
    "(f) a background command cut by a crash is told to the session in its transcript, interrupted with its outcome unknown, and the model reads it",
    kept.length > 0 && !!told && !!read,
    `kept tasks: ${kept.map((row) => row.task_id).join(", ") || "none"}; told: ${told?.slice(0, 600) ?? "nothing within 150 s"}`
  );
  check(
    "(f) its output so far is in what the session is told",
    !!told?.includes("PROBE-PARTIAL-ONE"),
    told?.slice(0, 900) ?? "nothing told"
  );
};

/** The fleet up, its project on a repository of its own, and its parent session. */
const standUp = async (kit: Kit): Promise<Legs> => {
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
  const env = { ...process.env, HOME: home };
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), "hub restart probe\n");
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env(env)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Hub restart",
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  return {
    check: kit.check,
    fleet,
    parent,
    projectId: project.id,
    repo,
    mainLog: async () =>
      (await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text())
        .trim()
        .split("\n"),
  };
};

const RUNS: Record<Leg, (legs: Legs) => Promise<void>> = {
  a: legA,
  b: legB,
  c: legC,
  d: legD,
  e: legE,
  f: legF,
};

const run = async (kit: Kit) => {
  const legs = await standUp(kit);
  for (const leg of LEGS) {
    if (chosen.has(leg)) {
      await RUNS[leg](legs);
    }
  }
};

export default {
  group: "The hub and machines",
  name: "hub-restart-holds",
  host: "legs (c), (d) and (e) delegate, so its fleet cuts workspaces",
  run,
} satisfies Spec;
