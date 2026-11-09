/**
 * The person's own Continue of a session never runs that session again once
 * the new session has its opening, whether or not it holds a work item
 * (server.ts `separateSession` → `retireContinued`).
 *
 * 2026-11-07, obelisk's hub: the person chose Continue in a new session on a
 * top-level orchestrator (no work item). The hub had it file its open work,
 * started the new session and moved its delegates there, but ended the
 * source's process only when it held a work item: the old orchestrator kept
 * running and kept answering his messages; and a comment on a page it had
 * made still went to it (its artifacts were not carried with its delegates,
 * db/instances.ts `adoptChildren`), waking it again.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model): a session with no work item, one delegate of its own and a
 * page it made (artifact_create) is continued by a person (no `askedBy`: it
 * files its open items first), from its asks (no summary).
 *
 * (a) The job ends started, its new session running.
 * (b) The source ends stopped, its row naming the new session as the one
 *     its work went on in.
 * (c) The delegate is the new session's: its parent is the new session.
 * (d) A person's message to the source afterwards is refused: it never
 *     wakes, and the source stays stopped.
 * (e) The page is the new session's, as the session that holds it and as
 *     its maker.
 * (f) The person's comment on the page (a pin written into its doc, as the
 *     overlay writes one) is delivered to the new session and read there;
 *     the source is sent nothing and stays stopped.
 *
 *   bun scripts/probe-kit/run.ts continuation-person-retires
 */
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { readWithin } from "../../../packages/core/src/bounded";
import { writePin } from "../../../packages/core/src/comments/model";
import { fetchHub, hubRequest } from "../../../packages/core/src/hub-request";
import type { ContinuationJob } from "../../../packages/core/src/protocol";
import {
  delay,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import type { Kit, KitFleet, Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
/** The artifact id in artifact_create's detailed answer. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/u;
/** The person's words on the page's pin, found in the delivery that carries them. */
const PIN_WORDS = "PROBE-RETIRED-PIN";

const calls = new ToolCalls("PROBE-PR-CALL");

/** The mock model: the tool call asked of it, else "ok". */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  return calls.reply(request) ?? { everyMs: 5, words: ["ok"] };
};

/** A session on the fleet's machine that has taken one turn. */
const turnTaken = async (fleet: KitFleet, title: string): Promise<string> => {
  const id = await fleet.spawn("claude", title, fleet.sandbox);
  const asked = await fleet.send(id, "Say ok.");
  await until(
    `${title}'s turn read and ended`,
    () => ({ send: fleet.sendRow(asked), row: fleet.instance(id) }),
    ({ send, row }) => send?.state === "read" && !row?.turn_open_at,
    180_000
  );
  return id;
};

/** `source` continued from its asks, as the person's Continue asks it: a separate session, no summary. */
const personContinues = (fleet: KitFleet, source: string) =>
  readWithin(30_000, async (signal) => {
    const response = await fetchHub(
      fetch,
      fleet.base,
      hubRequest("POST /api/instances/:id/continue", {
        path: { id: source },
        body: {
          asksOnly: true,
          target: {
            harness: "claude",
            model: MODEL.claude,
            permissionMode: "bypassPermissions",
          },
        },
      }),
      { signal }
    );
    const body = (await response.json().catch(() => ({}))) as {
      continuationId?: string;
      targetInstanceId?: string;
    };
    return { status: response.status, body };
  });

/** A session's row as the hub's database holds it, or none. */
const stored = (fleet: KitFleet, id: string) =>
  fleet.query<{
    status: string;
    work_item_id: string | null;
    continued_into: string | null;
    parent_instance_id: string | null;
  }>(
    "SELECT status, work_item_id, continued_into, parent_instance_id FROM instances WHERE id = ?",
    id
  )[0];

export default {
  group: "The hub and machines",
  name: "continuation-person-retires",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const source = await turnTaken(fleet, "person-continue source");
    const delegate = await turnTaken(fleet, "person-continue delegate");
    fleet.write(
      "UPDATE instances SET parent_instance_id = ? WHERE id = ?",
      source,
      delegate
    );
    const made = await calls.call(fleet, source, CREATE, {
      response_format: "detailed",
      kind: "page",
      does: "judge",
      title: "Probe retired page",
      ask: "Judge this page: pin anything that reads wrong",
      name: "person-continue-page",
      html: "<!doctype html><html><body><main><h1>Retired</h1><p>A page to pin.</p></main></body></html>",
    });
    const artifact = made.match(ANSWERED_ID)?.[1];
    if (!artifact) {
      throw new Error(`the source made no page: ${made.slice(0, 400)}`);
    }
    const before = stored(fleet, source);
    if (!before || before.work_item_id !== null) {
      throw new Error(
        `the source must hold no work item: ${JSON.stringify(before)}`
      );
    }

    const asked = await personContinues(fleet, source);
    const job = asked.kind === "answered" ? asked.value.body : undefined;
    const target = job?.targetInstanceId;
    if (!(job?.continuationId && target)) {
      throw new Error(`the continue was not taken: ${JSON.stringify(asked)}`);
    }
    const ended = await until(
      `continuation ${job.continuationId}'s end`,
      async () =>
        (
          await fleet.api<ContinuationJob[]>(
            hubRequest("GET /api/continuations")
          )
        ).find((one) => one.id === job.continuationId),
      (one) => one !== undefined && ["started", "failed"].includes(one.stage),
      240_000
    ).catch((error: Error) => ({ stage: `none: ${error.message}` }));
    // The job is started once its opening has gone; the new session's process
    // may still be coming up, so its running is waited for, not read once.
    const running = await until(
      `the new session ${target.slice(0, 8)} running`,
      () => fleet.instance(target)?.status,
      (status) => status === "running",
      60_000
    ).catch(() => fleet.instance(target)?.status);
    check(
      "a: the person's Continue of a session with no work item ends started, its new session running",
      ended.stage === "started" && running === "running",
      `job ${JSON.stringify(ended)}; target ${JSON.stringify(stored(fleet, target))}`
    );

    const retired = await until(
      "the source stopped",
      () => stored(fleet, source),
      (row) => row?.status === "stopped",
      60_000
    ).catch(() => stored(fleet, source));
    check(
      "b: the source ends stopped, its row naming the new session as where its work went on",
      retired?.status === "stopped" && retired.continued_into === target,
      `source ${JSON.stringify(retired)}; target ${target}`
    );

    const delegateNow = stored(fleet, delegate);
    check(
      "c: the source's delegate is the new session's",
      delegateNow?.parent_instance_id === target,
      `delegate ${JSON.stringify(delegateNow)}; target ${target}`
    );

    const after = await fleet.send(source, "Are you still there?");
    await delay(5000);
    const sent = fleet.sendRow(after);
    const still = stored(fleet, source);
    check(
      "d: a person's message to the source afterwards is not read there, and the source stays stopped",
      sent?.state !== "read" && still?.status === "stopped",
      `send ${JSON.stringify(sent)}; source ${JSON.stringify(still)}`
    );

    const [page] = fleet.query<{
      instance_id: string | null;
      made_by: string | null;
    }>("SELECT instance_id, made_by FROM artifacts WHERE id = ?", artifact);
    check(
      "e: the source's page is the new session's, as its holder and its maker",
      page?.instance_id === target && page.made_by === target,
      `page ${JSON.stringify(page)}; target ${target}`
    );

    // The person's pin, written into the page's doc as the overlay writes one.
    const doc = new Doc();
    const link = new WebsocketProvider(
      `ws://${fleet.hub.at}:${new URL(fleet.base).port}/ws/artifact/${target}`,
      artifact,
      doc,
      { disableBc: true, WebSocketPolyfill: WebSocket as never }
    );
    await until("the page's doc joined", () => link.synced, Boolean, 30_000);
    const at = new Date().toISOString();
    writePin(doc, {
      id: crypto.randomUUID(),
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
      thread: [{ id: crypto.randomUUID(), by: "person", text: PIN_WORDS, at }],
    });
    const deliveredTo = (id: string) =>
      fleet.query<{ state: string }>(
        "SELECT state FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
        id,
        `%${PIN_WORDS}%`
      );
    const delivered = await until(
      "the pin's delivery read by the new session",
      () => deliveredTo(target),
      (rows) => rows.some((row) => row.state === "read"),
      120_000
    ).catch(() => deliveredTo(target));
    link.destroy();
    doc.destroy();
    const toSource = deliveredTo(source);
    const sourceNow = stored(fleet, source);
    check(
      "f: the person's comment on the page reaches the new session and is read there; the source is sent nothing and stays stopped",
      delivered.some((row) => row.state === "read") &&
        toSource.length === 0 &&
        sourceNow?.status === "stopped",
      `to target ${JSON.stringify(delivered)}; to source ${JSON.stringify(toSource)}; source ${JSON.stringify(sourceNow)}`
    );
  },
} satisfies Spec;
