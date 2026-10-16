/**
 * Every delegate has exactly one parent session, and its reports, asks and
 * hand-offs go only there (hub server.ts `forkLineage`, `tellForkFirst`;
 * delegation-actions.ts `forkOwner`; work-items.ts `reportees`; db
 * `adoptChildren`). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model). It delegates, so it runs where a workspace
 * boundary can start: a `host` check.
 *
 * The owner, verbatim: "bug when forking sessions, are the delegates still
 * connected to them? when they reporrt back who do they report to? can cause
 * buggy behavior".
 *
 * a. A parent delegates; its delegate declares a wait and stays live.
 * b. The person forks the parent (the dashboard's spawn: `resume.fork`). The
 *    fork's row names the parent it branched from.
 * c. The fork's first turn is told, ahead of the person's words, whose the
 *    delegate in its copied history is: by id, running, reporting to the
 *    parent.
 * d. In that turn the fork's `delegate_list` is empty, and its `handoff` and
 *    `stop_delegate` to the delegate are refused, naming the parent; nothing
 *    reached the delegate from the fork.
 * e. The delegate is released and reports: the report reaches the parent,
 *    read, and nothing reaches the fork.
 * f. A second parent with a live delegate is continued in a new session from
 *    the person's asks: the delegate and its item answer to the new session.
 * g. Released, that delegate's report reaches the continued session, read,
 *    and never the session it continued.
 *
 *   bun scripts/probe-kit/run.ts fork-ownership
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MODEL, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const DELEGATE = "mcp__cawco__delegate";
const LIST = "mcp__cawco__delegate_list";
const HANDOFF = "mcp__cawco__handoff";
const STOP = "mcp__cawco__stop_delegate";
const WAIT = "mcp__cawco__wait_item";
const FINISH = "mcp__cawco__finish_item";

/** What each parent is asked, and the brief of the delegate it starts. */
const PARENTS = {
  fork: { ask: "PROBE-P1 delegate the wait", child: "PROBE-C1" },
  continued: { ask: "PROBE-P2 delegate the wait", child: "PROBE-C2" },
} as const;
type Case = keyof typeof PARENTS;
const RELEASE = "PROBE-RELEASE you may finish";
const FORK_ASK = "PROBE-FORK what are your delegates doing";
const FORK_SAID = "PROBE-FORK-DONE";
const REPORTED: Record<Case, string> = {
  fork: "PROBE-C1-REPORTED done",
  continued: "PROBE-C2-REPORTED done",
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

interface Block {
  content?: unknown;
  id?: string;
  is_error?: boolean;
  name?: string;
  tool_use_id?: string;
  type?: string;
}

/** A tool call a request's history holds, with its result once it has one. */
interface Call {
  error: boolean;
  name: string;
  result?: string;
}

/** Every tool call in a request's messages, oldest first, each with its result. */
const callsOf = (request: Seen): Call[] => {
  const body = JSON.parse(request.body) as {
    messages?: { content?: unknown }[];
  };
  const blocks = (body.messages ?? []).flatMap((message) =>
    Array.isArray(message.content) ? (message.content as Block[]) : []
  );
  const results = new Map(
    blocks
      .filter((block) => block.type === "tool_result")
      .map((block) => [block.tool_use_id, block])
  );
  return blocks
    .filter((block) => block.type === "tool_use")
    .map((block) => {
      const result = results.get(block.id);
      const content = result?.content;
      return {
        name: block.name ?? "",
        error: result?.is_error === true,
        ...(result
          ? {
              result:
                typeof content === "string"
                  ? content
                  : (Array.isArray(content) ? (content as Block[]) : [])
                      .map((part) => (part as { text?: string }).text ?? "")
                      .join("\n"),
            }
          : {}),
      };
    });
};

let repo = "";
/** The live delegate the fork reaches for, once (a) found it. */
let forkChild = "";
const delegated = new Set<Case>();
const waited = new Set<Case>();
const finished = new Set<Case>();
/** The fork's turn: its tools, in order, then its last words. */
const forkSteps: { name: string; input: () => object }[] = [
  { name: LIST, input: () => ({}) },
  {
    name: HANDOFF,
    input: () => ({ target: forkChild, message: "PROBE-FORK-STEER" }),
  },
  { name: STOP, input: () => ({ target: forkChild }) },
];
/** What the fork's turn saw: its first request, and its tool results at the end. */
const forkSaw: { first?: Seen; last?: Seen } = {};

/** The fork's calls of its steps' tools, in order, with their results. */
const forkCalls = (request: Seen): Call[] =>
  callsOf(request).filter((call) =>
    forkSteps.some((step) => step.name === call.name)
  );

const forkTurn = (request: Seen): Reply => {
  forkSaw.first ??= request;
  forkSaw.last = request;
  // Each step is found (ToolSearch) when deferred, then called once.
  const step = forkSteps[forkCalls(request).length];
  return step ? found(request, step.name, step.input()) : text(FORK_SAID);
};

/** A delegate: waits once, and finishes once the person releases it. */
const child = (request: Seen, which: Case): Reply => {
  if (request.all.includes(RELEASE)) {
    if (finished.has(which)) {
      return text("ok");
    }
    const reply = found(request, FINISH, {
      headline: REPORTED[which],
      summary: REPORTED[which],
    });
    if (reply.tool?.name === FINISH) {
      finished.add(which);
    }
    return reply;
  }
  if (waited.has(which)) {
    return text("waiting");
  }
  const reply = found(request, WAIT, {
    minutes: 60,
    reason: "PROBE waits for the person",
  });
  if (reply.tool?.name === WAIT) {
    waited.add(which);
  }
  return reply;
};

const parent = (request: Seen, which: Case): Reply => {
  if (delegated.has(which)) {
    return text("ok");
  }
  const reply = found(request, DELEGATE, {
    title: `Wait ${which}`,
    prompt: `${PARENTS[which].child}: wait, then finish your item when released.`,
    cwd: repo,
    checks: [{ name: "Nothing to check", command: "true" }],
    lands: "none",
  });
  if (reply.tool?.name === DELEGATE) {
    delegated.add(which);
  }
  return reply;
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // The fork carries its parent's history: its own ask decides first.
  if (request.all.includes(FORK_ASK)) {
    return forkTurn(request);
  }
  if (request.all.includes("Restarting session")) {
    return text("ok");
  }
  for (const which of Object.keys(PARENTS) as Case[]) {
    if (request.all.includes(PARENTS[which].child)) {
      return child(request, which);
    }
  }
  for (const which of Object.keys(PARENTS) as Case[]) {
    if (request.all.includes(PARENTS[which].ask)) {
      return parent(request, which);
    }
  }
  return text("ok");
};

/** A parent with a live delegate that has declared its wait: the two ids. */
const parentWithDelegate = async (
  fleet: KitFleet,
  which: Case
): Promise<{ parent: string; child: string }> => {
  const id = await fleet.spawn("claude", `Parent ${which}`, repo);
  await fleet.send(id, PARENTS[which].ask);
  const item = (await until(
    `${which}: the parent's delegate is waiting`,
    () =>
      fleet.query<{ instance_id: string; wait_reason: string | null }>(
        "SELECT instance_id, wait_reason FROM work_items WHERE parent_instance_id = ?",
        id
      )[0],
    (row) => Boolean(row?.wait_reason),
    300_000
  )) as { instance_id: string };
  await until(
    `${which}: the parent's turn ended`,
    () => fleet.instance(id),
    (row) => row?.turn_open_at === null,
    120_000
  );
  return { parent: id, child: item.instance_id };
};

/** The sends `from` made to `to`, as the hub kept them. */
const sendsTo = (fleet: KitFleet, to: string, from: string) =>
  fleet.query<{ state: string }>(
    "SELECT state FROM sent_messages WHERE instance_id = ? AND json_extract(body, '$.origin.fromSession') = ? ORDER BY accepted_at",
    to,
    from
  );
const reportEvents = (fleet: KitFleet, from: string) =>
  fleet.query<{ parent_instance_id: string }>(
    "SELECT parent_instance_id FROM delegate_events WHERE instance_id = ? AND kind = 'report'",
    from
  );

const run = async (kit: Kit) => {
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
  repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();

  // ── a. a parent with a live delegate ───────────────────────────────────
  const one = await parentWithDelegate(fleet, "fork");
  forkChild = one.child;

  // ── b. the person forks it ─────────────────────────────────────────────
  const sessionKey = (await until(
    "b: the parent's conversation id",
    () =>
      fleet.query<{ session_id: string | null }>(
        "SELECT session_id FROM instances WHERE id = ?",
        one.parent
      )[0]?.session_id ?? undefined,
    Boolean,
    60_000
  )) as string;
  const fork = await fleet.spawn("claude", "Fork", repo, {
    resume: { sessionKey, fork: true },
  });
  const [forkRow] = fleet.query<{
    forked_from: string | null;
    parent_instance_id: string | null;
  }>(
    "SELECT forked_from, parent_instance_id FROM instances WHERE id = ?",
    fork
  );
  kit.check(
    "b: the fork's row names the parent it branched from, and no parent of its own",
    forkRow?.forked_from === one.parent && forkRow.parent_instance_id === null,
    JSON.stringify(forkRow)
  );

  // ── c, d. the fork's first turn ────────────────────────────────────────
  await fleet.send(fork, FORK_ASK);
  await until(
    "d: the fork's turn said it is done",
    () => forkSaw.last,
    (seen) =>
      seen !== undefined &&
      forkCalls(seen).filter((call) => call.result !== undefined).length ===
        forkSteps.length,
    240_000
  );
  const firstWords = forkSaw.first?.all ?? "";
  kit.check(
    "c: the fork's first turn reads whose the delegate is: the parent's, by id, running",
    firstWords.includes("[Fork] Forked from") &&
      firstWords.includes(one.child) &&
      firstWords.includes(`reports to “Parent fork” (${one.parent})`),
    firstWords.slice(-1200)
  );
  const notices = fleet.query<{ origin: string }>(
    "SELECT json_extract(body, '$.origin.name') AS origin FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at",
    fork
  );
  kit.check(
    "c: the notice went once, ahead of the person's words",
    notices[0]?.origin === "fork" &&
      notices.filter((row) => row.origin === "fork").length === 1,
    JSON.stringify(notices)
  );
  const [listed, handed, stopped] = forkCalls(forkSaw.last as Seen);
  kit.check(
    "d: the fork's delegate_list is empty",
    listed?.name === LIST &&
      !listed.error &&
      (JSON.parse(listed.result ?? "{}") as { delegates?: unknown[] }).delegates
        ?.length === 0,
    JSON.stringify(listed).slice(0, 600)
  );
  const refused = (call: Call | undefined, name: string) =>
    call?.name === name &&
    call.error &&
    (call.result ?? "").includes(
      `is a delegate of “Parent fork” (${one.parent})`
    );
  kit.check(
    "d: the fork's handoff and stop_delegate to the delegate are refused, naming the parent",
    refused(handed, HANDOFF) && refused(stopped, STOP),
    JSON.stringify([handed, stopped]).slice(0, 1200)
  );
  kit.check(
    "d: nothing reached the delegate from the fork, and it still runs",
    sendsTo(fleet, one.child, fork).length === 0 &&
      fleet.query<{ state: string }>(
        "SELECT state FROM work_items WHERE instance_id = ?",
        one.child
      )[0]?.state === "running",
    JSON.stringify(sendsTo(fleet, one.child, fork))
  );

  // ── e. the delegate reports: to the parent, never the fork ─────────────
  await fleet.send(one.child, RELEASE);
  await until(
    "e: its report read by the parent",
    () => sendsTo(fleet, one.parent, one.child)[0],
    (row) => row?.state === "read",
    300_000
  );
  await Bun.sleep(3000);
  const eEvents = reportEvents(fleet, one.child);
  kit.check(
    "e: the delegate's report reached the parent and nothing reached the fork",
    eEvents.length > 0 &&
      eEvents.every((row) => row.parent_instance_id === one.parent) &&
      sendsTo(fleet, fork, one.child).length === 0,
    JSON.stringify({
      events: eEvents,
      toFork: sendsTo(fleet, fork, one.child),
    })
  );

  // ── f. a continuation takes its delegates on ───────────────────────────
  const two = await parentWithDelegate(fleet, "continued");
  const { continuationId } = await fleet.api<{ continuationId: string }>(
    `/api/instances/${two.parent}/continue`,
    { target: { harness: "claude", model: MODEL.claude }, asksOnly: true }
  );
  const outcome = await fetch(
    `${fleet.base}/api/continuations/${continuationId}/outcome`,
    { signal: AbortSignal.timeout(300_000) }
  );
  const { targetInstanceId: continued } = (await outcome.json()) as {
    targetInstanceId: string;
  };
  const owners = {
    session: fleet.query<{ parent_instance_id: string | null }>(
      "SELECT parent_instance_id FROM instances WHERE id = ?",
      two.child
    )[0]?.parent_instance_id,
    item: fleet.query<{ parent_instance_id: string }>(
      "SELECT parent_instance_id FROM work_items WHERE instance_id = ?",
      two.child
    )[0]?.parent_instance_id,
  };
  kit.check(
    "f: the delegate and its item answer to the continued session",
    owners.session === continued && owners.item === continued,
    JSON.stringify({ ...owners, continued, source: two.parent })
  );

  // ── g. its report reaches the continued session ────────────────────────
  await fleet.send(two.child, RELEASE);
  await until(
    "g: its report read by the continued session",
    () => sendsTo(fleet, continued, two.child)[0],
    (row) => row?.state === "read",
    300_000
  );
  await Bun.sleep(3000);
  const gEvents = reportEvents(fleet, two.child);
  kit.check(
    "g: the report reached the continued session, never the one it continued",
    gEvents.length > 0 &&
      gEvents.every((row) => row.parent_instance_id === continued) &&
      sendsTo(fleet, two.parent, two.child).length === 0,
    JSON.stringify({
      events: gEvents,
      toSource: sendsTo(fleet, two.parent, two.child),
    })
  );
};

export default { name: "fork-ownership", run } satisfies Spec;
