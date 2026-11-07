/**
 * A session's `task_create` files work; it never starts it. A new task
 * lands only in a stage of kind todo or you, where it waits for a start or
 * for the person (hub stages.ts `startProblem`): entering an active stage is
 * a start, which task_start, a delegate naming the task, the project's
 * dispatch or the person makes. Private office, 2026-11-06: a routine's
 * report became tsk-8, filed by Caw straight into an active stage that runs
 * a writer, so it was scouted and drafted with nobody's word.
 *
 * On an in-process hub (hub-in-process.ts) over a scratch database, the
 * session's calls go through its own door (`task_create` on
 * `/api/delegation/call/:instanceId`, its minted credential), the person's
 * through the board's routes, in a project shaped as Private office was
 * (inbox, drafting `runs: writer`, Your call, sent, dropped):
 *
 * - a. A session's task_create into drafting (active, runs a writer) is
 *   refused with the sentence naming inbox and Your call, and no task is
 *   filed. Into sent (done) the same. On main both were filed, drafting's
 *   start hook asking for a writer.
 * - b. A session's task_create into inbox (todo) and into Your call (you)
 *   goes, and with no stage named it lands in inbox.
 * - c. The person's own filing into drafting is not held by this rule.
 * - d. A proposal that outlives the turn: the session's page asks one card
 *   (Do it, Not now) and its task_create in inbox waits on that card. The
 *   task is not ready until he picks; his pick of Do it makes it ready.
 * - e. The away line a session reads at the head of each turn tells it to
 *   start nothing new and to ask instead.
 *
 *   bun scripts/probe-kit/run.ts filed-not-started
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector } from "yjs";
import { PRESENCE_HEADER } from "../../../packages/core/src/browser-gate";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import {
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import {
  AWAY_STARTS_NOTHING,
  presenceLine,
} from "../../../packages/core/src/injected";
import { machinePath } from "../../../packages/core/src/machine-path";
import { stageWords } from "../../../packages/core/src/words/stages";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-filed-machine";
const PRESENCE = "probe-presence-f11e";
const PAGE = "proposals";
const CARD = "follow-up";
const TASK_ID = /tsk-\d+/u;

/** Private office's shape: an active stage that runs a writer as a task enters it. */
const STAGES = `---
inbox       todo
drafting    active    runs: writer
your-call   you
sent        done
dropped     dropped
---
`;

/** One proposal, as Caw puts it to the person: do it, or not now. */
const PROGRAM = `root = Decisions("Proposals", [card])
card = Decision("${CARD}", "Draft follow-ups to the three leads the scan found?", [yes, no], "The scan found three warm leads nobody asked to contact.", [], [], false, null, "scope")
yes = Option("do", "Do it", "The writer drafts three follow-ups for your call.", true, [], "About an hour of the writer.")
no = Option("not-now", "Not now", "Nothing is drafted.", false, [], "The leads may go cold.")`;

interface Answer {
  json: unknown;
  status: number;
  text: string;
}

/** His pick, as his views write it: no `settled`. */
const his = (options: string[]): ChoiceEntry => ({
  options,
  note: null,
  value: null,
  pageHash: "0".repeat(64),
  at: new Date().toISOString(),
});

/** His entries as one Yjs update to the page's `state`, written on the doc as the hub holds it. */
const writesOf = (
  held: Uint8Array[],
  entries: { [card: string]: ChoiceEntry }
): string => {
  const doc = new Doc();
  for (const update of held) {
    applyUpdate(doc, update);
  }
  const before = encodeStateVector(doc);
  const state = doc.getMap("state");
  for (const [card, entry] of Object.entries(entries)) {
    state.set(card, entry);
  }
  return Buffer.from(encodeStateAsUpdate(doc, before)).toString("base64");
};

const run = async (
  kit: Kit,
  scratch: string,
  serve: (handle: (request: Request) => Promise<Response>) => string
): Promise<void> => {
  const { check } = kit;
  const { hubInProcess } =
    await import("../../../packages/hub/scripts/hub-in-process");
  const { db, hub } = await hubInProcess(
    join(scratch, "hub", "hub.db"),
    join(scratch, "home")
  );
  const { writeFolderFile } =
    await import("../../../packages/hub/src/project-folder");
  const { createSessionIdentities } =
    await import("../../../packages/hub/src/session-identity");
  const identities = createSessionIdentities(db);
  db.upsertAgent({
    machineId: MACHINE,
    hostname: `${MACHINE}.local`,
    os: "linux",
    auth: "unknown",
  });

  /** A board call, as the person. */
  const board = async (request: HubRequest): Promise<Answer> => {
    const response = await hub.handle(
      new Request(
        `http://127.0.0.1${request.path}`,
        hubInit(request, { headers: { [PRESENCE_HEADER]: PRESENCE } })
      )
    );
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { json, status: response.status, text };
  };
  // The session's door is reached as `cawco tool` reaches it: over HTTP.
  const base = serve((request) => hub.handle(request));

  const projectId = crypto.randomUUID();
  const path = "/home/probe/src/private-office";
  db.createProject({
    id: projectId,
    name: "Private office probe",
    checkout: {
      machineId: MACHINE,
      path: machinePath("/home/probe", path, MACHINE),
    },
    remote: null,
  });
  await writeFolderFile(projectId, "stages.md", STAGES, {
    author: { name: "probe" },
  });
  const sessionId = crypto.randomUUID();
  db.openInstance({
    id: sessionId,
    machineId: MACHINE,
    cwd: machinePath("/home/probe", path, MACHINE),
    sessionId: crypto.randomUUID(),
    harness: "claude",
    origin: "person",
    projectId,
    title: "Private office's conversation",
    kind: "mainline",
    permissionMode: "bypassPermissions",
    model: "model-a",
  });
  const session: ToolSession = {
    base,
    id: sessionId,
    credential: identities.mint(sessionId),
  };
  const create = (args: {
    stage?: string;
    title: string;
    waits_on?: string[];
  }) => toolWords(session, "task_create", args);
  const tasks = async (): Promise<{ id: string; stage: string }[]> => {
    const listed = await board(
      hubRequest("GET /api/projects/:id/tasks", { path: { id: projectId } })
    );
    return (
      (listed.json as { tasks?: { id: string; stage: string }[] }).tasks ?? []
    );
  };
  const read = async (id: string): Promise<TaskView> =>
    (
      await board(
        hubRequest("GET /api/projects/:id/tasks/:taskId", {
          path: { id: projectId, taskId: id },
        })
      )
    ).json as TaskView;
  /** The id a task tool's words link, `tsk-<n>`. */
  const idIn = (text: string): string => TASK_ID.exec(text)?.[0] ?? "";
  const open = "inbox or your-call";

  // (a) A session's filing into an active stage, or past its start, is refused.
  const before = (await tasks()).length;
  const drafting = await create({
    title: "Draft the follow-up to the warm leads",
    stage: "drafting",
  });
  check(
    "a: a session's task_create into drafting (active, runs a writer) is refused with the sentence",
    drafting.refused &&
      drafting.text.includes(stageWords.filed("drafting", "active", open)),
    drafting.text
  );
  const sent = await create({
    title: "Record the letter as sent",
    stage: "sent",
  });
  check(
    "a: a session's task_create into sent (done) is refused with the sentence",
    sent.refused && sent.text.includes(stageWords.filed("sent", "done", open)),
    sent.text
  );
  const after = await tasks();
  check(
    "a: neither refused task was filed",
    after.length === before,
    JSON.stringify(after)
  );

  // (b) Into a todo or you stage it goes.
  const inbox = await create({
    title: "Fix the letter's broken signature",
    stage: "inbox",
  });
  const inboxId = idIn(inbox.text);
  check(
    "b: a session's task_create into inbox (todo) goes",
    !inbox.refused && !!inboxId && (await read(inboxId)).stage === "inbox",
    inbox.text
  );
  const call = await create({
    title: "Pick the letter's opening line",
    stage: "your-call",
  });
  const callId = idIn(call.text);
  check(
    "b: a session's task_create into Your call (you) goes",
    !call.refused && !!callId && (await read(callId)).stage === "your-call",
    call.text
  );
  const plain = await create({ title: "Check the letter's dates" });
  const plainId = idIn(plain.text);
  check(
    "b: with no stage named it lands in inbox",
    !plain.refused && !!plainId && (await read(plainId)).stage === "inbox",
    plain.text
  );

  // (c) The person's own filing is not held by the rule.
  const his_ = await board(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id: projectId },
      body: { title: "Draft the quarterly letter", stage: "drafting" },
    })
  );
  check(
    "c: the person's own filing into drafting is not refused by the rule",
    !his_.text.includes("A session files a new task only"),
    `${his_.status} ${his_.text.slice(0, 300)}`
  );

  // (d) A proposal: a todo task waiting on a card, ready on his pick.
  const made = await board(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: sessionId },
      body: {
        kind: "page",
        does: "pick",
        name: PAGE,
        title: "Proposals",
        ask: "Say whether to draft the follow-ups",
        program: PROGRAM,
      },
    })
  );
  const pageId = (made.json as { id?: string } | undefined)?.id;
  if (!pageId) {
    throw new Error(`the page was not made (${made.status}): ${made.text}`);
  }
  const proposal = await create({
    title: "Draft follow-ups to the three warm leads",
    waits_on: [`${PAGE}#${CARD}`],
  });
  const proposalId = idIn(proposal.text);
  const held = proposalId ? await read(proposalId) : undefined;
  check(
    "d: the proposal is filed in inbox, waiting on the card, not ready",
    !proposal.refused &&
      held?.stage === "inbox" &&
      held.waitsOn.length === 1 &&
      held.ready === false,
    proposal.text
  );
  const picked = await board(
    hubRequest("POST /api/projects/:id/decisions/:name/send", {
      path: { id: projectId, name: PAGE },
      body: {
        text: "Go ahead.",
        writes: writesOf(db.artifacts.updates(pageId), {
          [CARD]: his(["do"]),
        }),
      },
    })
  );
  const ready = proposalId ? await read(proposalId) : undefined;
  check(
    "d: his pick of Do it makes the proposal ready",
    picked.status < 400 && ready?.ready === true,
    `${picked.status} ${picked.text.slice(0, 200)}; ready ${ready?.ready}`
  );

  // (e) The away line.
  const away = presenceLine({ kind: "away", since: "09:00" });
  check(
    "e: the away line says to start nothing new and to ask instead",
    away.includes(AWAY_STARTS_NOTHING),
    away
  );
};

export default {
  group: "The hub and machines",
  name: "filed-not-started",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "filed-not-started-")
    );
    let served: ReturnType<typeof Bun.serve> | undefined;
    try {
      await run(kit, scratch, (handle) => {
        served = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handle });
        return `http://127.0.0.1:${served.port}`;
      });
    } finally {
      served?.stop(true);
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
