/**
 * A trigger on a thing a live session is on goes to that session; once it
 * has ended, to the thing's handler (the owner's card "What a trigger
 * wakes", 2026-11-07; hub artifacts/taker.ts, server.ts
 * `deliverArtifactMarks`, handlers.ts), never the project's conversation.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model). A project made with Caw, a writer session of it that makes a
 * page, and an orchestrator of it that delegates host-scope work.
 *
 * - b1. The person's pin on the page, its writer live and warm, reaches the
 *   writer and is read there; no handler starts.
 * - b2. The same pin after the writer ended starts the page's handler,
 *   which reads it; the writer is sent nothing.
 * - c. A page's answers (a settled card) go to its asker while it takes
 *   input, to the session that delegated it once it does not, and to the
 *   page's handler once neither does (taker.ts, the one rule the hub's own
 *   Send of answers and the person's marks go by): never the project's
 *   conversation.
 * - d. A delegate's report reaches its parent, read there; no handler
 *   starts for it.
 *
 * Before handlers (2026-11-08) b2's pin, and c's answers with no live
 * asker or parent, went to the project's conversation.
 *
 *   bun scripts/probe-kit/run.ts handler-owners
 */
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import type { InstanceRow } from "../../../packages/core/src";
import { writePin } from "../../../packages/core/src/comments";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { artifactTaker } from "../../../packages/hub/src/artifacts/taker";
import {
  MACHINE,
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
/** The delegate's brief carries this; its report carries {@link DONE}. */
const TAG = "HO-DELEGATE";
const DONE = "HO-DELEGATE-DONE";
/** A report as its parent reads it (core `reportMarker`). */
const REPORT = "[Report from delegate ";

const calls = new ToolCalls("HO-CALL");
let searched = false;
let finished = false;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** The delegate finishes at once; a writer calls what it is asked; everyone else says "ok". */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(`${TAG}:`) && !request.all.includes(REPORT)) {
    if (finished) {
      return text("Done.");
    }
    if (!(request.toolNames.includes("mcp__cawco__finish_item") || searched)) {
      searched = true;
      return {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: "select:mcp__cawco__finish_item", max_results: 1 },
        },
      };
    }
    finished = true;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "mcp__cawco__finish_item",
        input: { headline: DONE, summary: `${DONE}: nothing to change.` },
      },
    };
  }
  return calls.reply(request) ?? text("ok");
};

/** The sends that carry `marker`, by the session each went to and how they stand. */
const sendsWith = (fleet: KitFleet, marker: string) =>
  fleet.query<{ instance_id: string; state: string }>(
    "SELECT instance_id, state FROM sent_messages WHERE body LIKE ?",
    `%${marker}%`
  );

/** The page's handlers, newest first (db `handledBy`). */
const handlersOf = (fleet: KitFleet, projectId: string, artifact: string) =>
  fleet.query<{ id: string; instance_id: string; state: string }>(
    "SELECT id, instance_id, state FROM work_items WHERE project_id = ? AND handles_kind = 'artifact' AND handles_id = ? ORDER BY created_at DESC",
    projectId,
    artifact
  );

/** The person's pin on `artifact`, written into its doc as the overlay writes one. */
const pin = async (
  fleet: KitFleet,
  panel: string,
  artifact: string,
  number: number,
  words: string
): Promise<void> => {
  const doc = new Doc();
  const link = new WebsocketProvider(
    `ws://${fleet.hub.at}:${new URL(fleet.base).port}/ws/artifact/${panel}`,
    artifact,
    doc,
    { disableBc: true, WebSocketPolyfill: WebSocket as never }
  );
  await until("the page's doc joined", () => link.synced, Boolean, 30_000);
  const at = new Date().toISOString();
  writePin(doc, {
    id: crypto.randomUUID(),
    number,
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
    thread: [{ id: crypto.randomUUID(), by: "person", text: words, at }],
  });
  // Let the doc's update reach the hub before the link closes.
  await Bun.sleep(2000);
  link.destroy();
  doc.destroy();
};

const spec: Spec = {
  group: "The hub and machines",
  name: "handler-owners",
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

    const project = await fleet.api<{ id: string }>(
      hubRequest("POST /api/projects", {
        body: {
          name: "Shop front",
          machineId: MACHINE,
          cwd: fleet.repo,
          caw: true,
        },
      })
    );
    await fleet.api(
      hubRequest("PATCH /api/projects/:id/caw", {
        path: { id: project.id },
        body: { mode: "bypassPermissions", model: MODEL.claude },
      })
    );

    // b. A writer's page and the person's pins.
    const writer = await fleet.spawn(
      "claude",
      "Shop front writer",
      fleet.repo,
      {
        projectId: project.id,
      }
    );
    const made = await calls.call(fleet, writer, CREATE, {
      response_format: "detailed",
      kind: "page",
      does: "judge",
      title: "Shop front hero",
      ask: "Judge the hero: pin anything that reads wrong",
      name: "shop-front-hero",
      html: "<!doctype html><html><body><main><h1>Fresh bread daily</h1><p>A page to pin.</p></main></body></html>",
    });
    const artifact = made.match(ANSWERED_ID)?.[1];
    if (!artifact) {
      throw new Error(`the writer made no page: ${made.slice(0, 400)}`);
    }

    await pin(fleet, writer, artifact, 1, "HO-LIVE: the headline is too loud.");
    const live = await until(
      "the live pin read",
      () => sendsWith(fleet, "HO-LIVE"),
      (rows) => rows.some((row) => row.state === "read"),
      120_000
    ).catch(() => sendsWith(fleet, "HO-LIVE"));
    check(
      "b1: the person's pin, the page's writer live and warm, reaches the writer and is read there; no handler starts",
      live.some((row) => row.instance_id === writer && row.state === "read") &&
        handlersOf(fleet, project.id, artifact).length === 0,
      `sends ${JSON.stringify(live)}; handlers ${JSON.stringify(handlersOf(fleet, project.id, artifact))}`
    );

    await fleet.stopSession(writer);
    await until(
      "the writer stopped",
      () => fleet.instance(writer)?.status,
      (status) => status === "stopped",
      60_000
    ).catch(() => undefined);
    await pin(fleet, writer, artifact, 2, "HO-ENDED: and the price is wrong.");
    const handled = await until(
      "the ended writer's pin read by the page's handler",
      () => {
        const [handler] = handlersOf(fleet, project.id, artifact);
        return sendsWith(fleet, "HO-ENDED").some(
          (row) =>
            row.instance_id === handler?.instance_id && row.state === "read"
        )
          ? handler
          : undefined;
      },
      Boolean,
      180_000
    ).catch(() => undefined);
    const toWriter = sendsWith(fleet, "HO-ENDED").filter(
      (row) => row.instance_id === writer
    );
    check(
      "b2: the same pin after its writer ended starts the page's handler, which reads it; the writer is sent nothing",
      !!handled && toWriter.length === 0,
      `handler ${JSON.stringify(handled)}; to the writer ${JSON.stringify(toWriter)}; all ${JSON.stringify(sendsWith(fleet, "HO-ENDED"))}`
    );

    // c. The one rule a page's answers go by.
    const session = (id: string, above: string | null = null) =>
      ({ id, parentInstanceId: above, status: "running" }) as InstanceRow;
    const asker = session("asker", "lead");
    const lead = session("lead");
    const taker = (refusing: string[]) =>
      artifactTaker(
        asker,
        { projectId: project.id },
        {
          instance: (id) => (id === "lead" ? lead : undefined),
          refusal: (id) =>
            refusing.includes(id) ? "Its conversation is gone." : undefined,
        }
      );
    const toAsker = taker([]);
    const toLead = taker(["asker"]);
    const toHandler = taker(["asker", "lead"]);
    check(
      "c: a page's answers go to its asker while it takes input, then to the session that delegated it, then to the page's handler, never the project's conversation",
      toAsker.to === "writer" &&
        toAsker.session.id === "asker" &&
        toLead.to === "parent" &&
        toLead.session.id === "lead" &&
        toHandler.to === "handler" &&
        toHandler.projectId === project.id,
      JSON.stringify({ toAsker, toLead, toHandler })
    );

    // d. A delegate's report reaches its parent.
    const parent = await fleet.spawn("claude", "Shop front lead", fleet.repo, {
      projectId: project.id,
    });
    const started = await fleet.api<{ workItemId: string }>(
      hubRequest("POST /api/work-items", {
        body: {
          parentInstanceId: parent,
          title: "Check the opening hours",
          prompt: `${TAG}: check the opening hours, then finish.`,
          harness: "claude",
          model: MODEL.claude,
          host: true,
        },
      })
    );
    const reported = await until(
      "the report read by its parent",
      () => sendsWith(fleet, DONE),
      (rows) =>
        rows.some((row) => row.instance_id === parent && row.state === "read"),
      240_000
    ).catch(() => sendsWith(fleet, DONE));
    const anyHandler = fleet.query<{ id: string }>(
      "SELECT id FROM work_items WHERE project_id = ? AND handles_kind IS NOT NULL AND handles_id <> ?",
      project.id,
      artifact
    );
    check(
      "d: a delegate's report reaches its parent and is read there; no handler starts for it",
      reported.some(
        (row) => row.instance_id === parent && row.state === "read"
      ) && anyHandler.length === 0,
      `item ${started.workItemId}; sends ${JSON.stringify(reported)}; handlers ${JSON.stringify(anyHandler)}`
    );
  },
};

export default spec;
