/**
 * Work nobody asked for is a proposal: a session files it waiting on the
 * person's card, and it starts only from his word. Private office,
 * 2026-11-06: a routine's report became tsk-8, scouted and drafted with
 * nobody's word.
 *
 * On an in-process hub (hub-in-process.ts) over a scratch database, the
 * session's calls go through its own door (`task_create` on
 * `/api/delegation/call/:instanceId`, its minted credential), the person's
 * through the board's routes, in a project shaped as Private office was
 * (inbox, drafting `runs: writer`, Your call, sent, dropped):
 *
 * - a. A proposal that outlives the turn: the session's page asks a card
 *   (Do it, Not now) and its task_create in inbox waits on that card's Do it
 *   (`<page>#<card>=do`). The task is not ready until he picks; his pick of
 *   Do it makes it ready.
 * - b. Away is no reason to stop: the away line a session reads at the head
 *   of each turn says to work silent and does not say to start nothing new;
 *   the handler skills name work nobody asked for as one scope card whose Not
 *   now drops its task.
 * - c. His Not now on a proposal's card leaves its task held, flagged, never
 *   ready: a wait on one option settles on that option alone.
 * - d. A wait on an option the card does not offer is refused, naming the
 *   card's options.
 *
 *   bun scripts/probe-kit/run.ts filed-not-started
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector } from "yjs";
import { PRESENCE_HEADER } from "../../../packages/core/src/browser-gate";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import { presenceLine } from "../../../packages/core/src/injected";
import { machinePath } from "../../../packages/core/src/machine-path";
import { NO_REPLY_TOOL } from "../../../packages/core/src/no-reply";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import { type HubAsk, handled, said } from "../hub";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-filed-machine";
const PRESENCE = "probe-presence-f11e";
const PAGE = "proposals";
const CARD = "follow-up";
const OTHER = "outreach";
const TASK_ID = /tsk-\d+/u;
/** The away line's old rule, which stopped work while the person was away. */
const START_NOTHING = /start nothing new/iu;
/** The skills that meet work nobody asked for, each stating its scope card and its drop. */
const HANDLER_SKILLS = [
  "project-delegate-report",
  "project-routine-report",
  "project-task-move",
  "project-inbound-event",
];

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
const PROGRAM = `root = Decisions("Proposals", [card, other])
card = Decision("follow-up", "Draft follow-ups to the three leads the scan found?", [yes, no], "The scan found three warm leads nobody asked to contact.", [], [], false, null, "scope")
yes = Option("do", "Do it", "The writer drafts three follow-ups for your call.", true, [], "About an hour of the writer.")
no = Option("not-now", "Not now", "Nothing is drafted.", false, [], "The leads may go cold.")
other = Decision("outreach", "Write to the two agencies the scan listed?", [yes2, no2], "Nobody asked to contact agencies.", [], [], false, null, "scope")
yes2 = Option("do", "Do it", "The writer drafts two intro emails.", false, [], "Half an hour of the writer.")
no2 = Option("not-now", "Not now", "Nothing is written.", true, [], "None.")`;

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
  const board = async (request: HubAsk): Promise<Answer> => {
    const answer = await request(
      handled((r) => hub.handle(r), { [PRESENCE_HEADER]: PRESENCE })
    );
    return said(answer);
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
  const committed = await writeFolderFile(projectId, "stages.md", STAGES, {
    author: { name: "probe" },
  });
  if (!("sha" in committed)) {
    throw new Error(committed.response.detail);
  }
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
  const create = (args: { title: string; waits_on?: string[] }) =>
    toolWords(session, "task_create", args);
  const read = async (id: string): Promise<TaskView> =>
    (
      await board((client) =>
        client.api.projects({ id: projectId }).tasks({ taskId: id }).get()
      )
    ).json as TaskView;
  /** The id a task tool's words link, `tsk-<n>`. */
  const idIn = (text: string): string => TASK_ID.exec(text)?.[0] ?? "";

  // (a) A proposal: a todo task waiting on a card, ready on his pick.
  const made = await board((client) =>
    client.api.instances({ id: sessionId }).artifacts.post({
      kind: "page",
      does: "pick",
      name: PAGE,
      title: "Proposals",
      ask: "Say whether to draft the follow-ups",
      program: PROGRAM,
    })
  );
  const pageId = (made.json as { id?: string } | undefined)?.id;
  if (!pageId) {
    throw new Error(`the page was not made (${made.status}): ${made.text}`);
  }
  const proposal = await create({
    title: "Draft follow-ups to the three warm leads",
    waits_on: [`${PAGE}#${CARD}=do`],
  });
  const declined = await create({
    title: "Write to the two agencies",
    waits_on: [`${PAGE}#${OTHER}=do`],
  });
  const declinedId = idIn(declined.text);
  const proposalId = idIn(proposal.text);
  const held = proposalId ? await read(proposalId) : undefined;
  check(
    "a: the proposal is filed in inbox, waiting on the card, not ready",
    !proposal.refused &&
      held?.stage === "inbox" &&
      held.waitsOn.length === 1 &&
      held.ready === false,
    proposal.text
  );
  const picked = await board((client) =>
    client.api
      .projects({ id: projectId })
      .decisions({ name: PAGE })
      .send.post({
        text: "Go ahead.",
        writes: writesOf(db.artifacts.updates(pageId), {
          [CARD]: his(["do"]),
          [OTHER]: his(["not-now"]),
        }),
      })
  );
  const ready = proposalId ? await read(proposalId) : undefined;
  check(
    "a: his pick of Do it makes the proposal ready",
    picked.status < 400 && ready?.ready === true,
    `${picked.status} ${picked.text.slice(0, 200)}; ready ${ready?.ready}`
  );

  // (c) His Not now leaves the other proposal held, flagged.
  const kept = declinedId ? await read(declinedId) : undefined;
  const flag = kept?.waits[0]?.flag ?? null;
  check(
    "c: his Not now leaves that proposal held and flagged, not ready",
    !declined.refused &&
      kept?.stage === "inbox" &&
      kept.ready === false &&
      flag?.includes("not-now") === true,
    `${declined.text.slice(0, 200)}; ready ${kept?.ready}; flag ${flag}`
  );

  // (d) An option the card does not offer.
  const unknown = await create({
    title: "Chase the leads by phone",
    waits_on: [`${PAGE}#${CARD}=maybe`],
  });
  check(
    "d: a wait on an option the card lacks is refused, naming its options",
    unknown.refused && unknown.text.includes("do, not-now"),
    unknown.text
  );

  // (b) Away stops nothing: the away line says to work silent, and the
  // handler skills carry the rule for work nobody asked for.
  const away = presenceLine({ kind: "away", since: "09:00" });
  check(
    "b: the away line says to work silent and does not say to start nothing new",
    away.includes(NO_REPLY_TOOL) && !START_NOTHING.test(away),
    away
  );
  const skills = join(import.meta.dir, "../../../packages/hub/skills");
  const missing: string[] = [];
  for (const skill of HANDLER_SKILLS) {
    const text = await readFile(join(skills, skill, "SKILL.md"), "utf8");
    if (!(
      text.includes(
        "scope card (Do it / Not now) on a one-card page (the decision-page skill)"
      ) && text.includes("drop the task with `task_update`")
    )) {
      missing.push(skill);
    }
  }
  check(
    "b: each handler skill names the scope card and the drop on Not now",
    missing.length === 0,
    missing.length
      ? `missing in ${missing.join(", ")}`
      : HANDLER_SKILLS.join(", ")
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
