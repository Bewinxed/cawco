/**
 * What every CawCo tool answers an agent, measured (the owner, 2026-10-22:
 * "this artifact read is very verbose and token wasting for an agent, i
 * bet other tools are just as verbose and wasteful?"). On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model) with
 * one project seeded the way a working day leaves it: a decision page of
 * six questions picked, revised and picked again; a page with 26 pins as
 * the overlay writes them (each element's styles, box and page point, its
 * anchor, its thread); fourteen delegates two levels deep, most ended,
 * three of their workspaces held; tasks, routines, a thread of Caw's.
 *
 * Every tool is called through the hub's REST door (`/api/delegation/call`,
 * the one `cawco tool` and pi's host use, which runs what an MCP call runs)
 * twice: as it answers by default, and with `response_format: "detailed"`.
 * The bytes of each answer go to `$TMPDIR/probe-kit/tool-answers/<label>.json`
 * (`TOOL_ANSWERS_LABEL`, default `run`) and a table of them is printed, so
 * two runs (today's tree and a change) compare on the same fixture.
 *
 * a. Every call is answered, none refused.
 * b. A concise answer is words an agent decides on: no full id (a link's
 *    destination aside, which it copies whole for the person's chip, and
 *    an address it loads whole), no 64-hex hash, no ISO time (comment_read's
 *    cursor aside, which its `since` takes back), no `null`.
 * c. A detailed answer is the hub's whole record: JSON that parses.
 * d. A concise answer's words (what it copies whole aside) are never longer
 *    than its detailed one, past the one sentence that says what there is
 *    ("No relays." beside `[]`).
 *
 *   bun scripts/probe-kit/run.ts tool-answers
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Answers probe"],
});

interface Session {
  credential: string;
  id: string;
}

interface Called {
  refused: boolean;
  text: string;
}

/** One tool's two answers on the fixture. */
interface Measured {
  concise: Called;
  detailed: Called;
  name: string;
  /** What it was asked, as the table names it. */
  shape: string;
}

/** Six questions, picked over two revisions. */
const PROGRAM = `root = Decisions("Price the hosted plan", [shape, trial, seats, region, support, launch])
shape = Decision("shape", "What does a customer pay for?", [seat, machine], "A machine is what the fleet costs to run.")
seat = Option("seat", "Per seat", "Each person on the team pays.", false, [], "A solo builder with five machines pays once.")
machine = Option("machine", "Per machine", "Each machine that joins the fleet pays.", true, [], "A team on one machine pays once.")
trial = Decision("trial", "How long is the trial?", [week, month], "A month covers a whole project.")
week = Option("week", "A week", "People decide fast.", false, [], "Too short to finish a real project.")
month = Option("month", "A month", "Thirty days, then pay.", true, [], "Revenue starts a month later.")
seats = Decision("seats", "How many seats does the team plan hold?", [five, ten], "Most teams we met are five or fewer.")
five = Option("five", "Five", "Small teams.", true, [], "Bigger teams buy two plans.")
ten = Option("ten", "Ten", "Room to grow.", false, [], "Small teams pay for seats they never use.")
region = Decision("region", "Where does the hosted hub run?", [eu, us], "Most early users are in Europe.")
eu = Option("eu", "Frankfurt", "Close to most users.", true, [], "Slower for the US.")
us = Option("us", "Virginia", "Close to the US.", false, [], "Slower for Europe.")
support = Decision("support", "What support comes with it?", [mail, chat], "Mail scales with one person.")
mail = Option("mail", "Mail", "Answered within a day.", true, [], "Slower for urgent questions.")
chat = Option("chat", "Chat", "Answered within the hour.", false, [], "Someone must be on call.")
launch = Decision("launch", "When does it launch?", [soon, later], "The trial sets how long the first wave waits.")
soon = Option("soon", "This month", "Ships with the trial.", true, [], "Less time to polish.")
later = Option("later", "Next month", "More time to polish.", false, [], "The waitlist waits.")`;

/** The revision that rewords one question: the picks made before it are on an earlier revision. */
const REVISION = `trial = Decision("trial", "How long is the free trial?", [week, month], "A month covers a whole project.")`;

const PIN_COUNT = 26;

/** A page of cards, one per pin. */
const pinPage = (): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Settings</title></head><body><main>${Array.from(
    { length: PIN_COUNT },
    (_, i) =>
      `<section class="card"><h2 id="card-${i + 1}">Setting ${i + 1}</h2><p class="hint">What setting ${i + 1} changes, in one line.</p><button class="btn primary">Save ${i + 1}</button></section>`
  ).join("")}</main></body></html>`;

/** A pin as the preview overlay writes it: the element under it whole, its anchor, its point, its thread. */
const pinOf = (n: number, url: string) => {
  const at = new Date(Date.now() - (PIN_COUNT - n) * 60_000).toISOString();
  const selector = `main > section.card:nth-of-type(${n}) > button.btn.primary`;
  const text = `Save ${n}`;
  const source = {
    file: "src/routes/settings/+page.svelte",
    line: 40 + n,
    column: 7,
    framework: "svelte" as const,
    of: "self" as const,
    component: "Button",
  };
  const box = { x: 24, y: 120 * n, w: 96, h: 36 };
  return {
    id: crypto.randomUUID(),
    number: n,
    kind: "comment",
    at,
    by: "person",
    anchor: { selector, text, source, box },
    elements: [
      {
        id: "",
        tag: "button",
        classes: ["btn", "primary"],
        selector,
        text,
        source,
        url,
        rect: { x: 24, y: 120 * n, width: 96, height: 36 },
        page: { x: 72, y: 120 * n + 18 },
        styles: {
          color: "rgb(255, 255, 255)",
          backgroundColor: "rgb(37, 99, 235)",
          fontFamily: "Figtree, system-ui, sans-serif",
          fontSize: "14px",
          fontWeight: "600",
          lineHeight: "20px",
          display: "inline-flex",
          position: "relative",
          padding: "8px 16px",
          margin: "12px 0px 0px",
          borderRadius: "8px",
        },
      },
    ],
    point: { x: 0.5, y: 0.5 },
    thread: [
      {
        id: crypto.randomUUID(),
        by: "person",
        text: `Button ${n} reads too loud next to its hint; quieter, please.`,
        at,
      },
      ...(n % 3 === 0
        ? [
            {
              id: crypto.randomUUID(),
              by: "person",
              text: "And the hover is still blue.",
              at,
            },
          ]
        : []),
    ],
  };
};

/** The tools whose answer is a sentence already: there is no other form. */
const SENTENCES: ReadonlySet<string> = new Set(["list_sessions", "open_items"]);
const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** An address the agent loads whole: its id is part of where it is. */
const URL_WORDS = /https?:\/\/\S+/g;
/** The longest absence said in words ("No relays."), longer than an empty list's `[]`. */
const SENTENCE_BYTES = 160;
/** comment_read's cursor, a time its own `since` takes back. */
const SINCE_CURSOR = /Read at \S+: since takes it/g;
const ONE_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const FULL_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const HASH = /\b[0-9a-f]{64}\b/;
const NULL = /\bnull\b/;
/**
 * A reference link's destination (core references.ts): a spawn's session,
 * which the transcript's delegate card is keyed by; a pin, a decision card
 * or an artifact, which the agent copies whole for the person's chip.
 */
const REFERENCE_DESTINATION = /\(cawco:[a-z]+\/[^)\s]+\)/g;

const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const cwd = join(fleet.workdir, "answers-probe");
  await mkdir(cwd, { recursive: true });
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Answers probe",
    machineId: MACHINE,
    cwd,
    caw: false,
  });
  /** A session in the project, its credential read from its process. */
  const session = async (title: string): Promise<Session> => {
    const id = await fleet.spawn("claude", title, cwd, {
      projectId: project.id,
    });
    const environ = await Bun.file(
      `/proc/${await fleet.sessionPid(id)}/environ`
    ).text();
    const credential =
      environ
        .split("\0")
        .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
        ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";
    return { id, credential };
  };
  /**
   * One tool call through the hub's REST door, as `as`: what it answered,
   * refused or not. The spec measures both forms of every tool, so the call
   * names its `response_format` itself: the sentence tools have no record.
   */
  const tool = async (
    as: Session,
    name: string,
    args: object
  ): Promise<Called> => {
    const said = await toolWords(
      { base: fleet.base, id: as.id, credential: as.credential },
      name,
      args as Record<string, unknown>
    );
    return { refused: said.refused, text: said.text };
  };
  return { fleet, project, cwd, session, tool };
};

type Probe = Awaited<ReturnType<typeof standUp>>;

/** An artifact's own doc, joined as the pane joins it, until `write` has synced. */
const writeDoc = async (
  probe: Probe,
  owner: string,
  artifact: string,
  write: (doc: Doc) => void
) => {
  const doc = new Doc();
  const url = `${probe.fleet.base.replace("http", "ws")}/ws/artifact/${encodeURIComponent(owner)}`;
  const provider = new WebsocketProvider(url, artifact, doc, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  });
  await until(
    "the artifact's doc synced",
    () => provider.synced,
    Boolean,
    15_000
  );
  doc.transact(() => write(doc));
  // The hub keeps what it is sent; a moment for the update to travel.
  await Bun.sleep(1000);
  provider.destroy();
  doc.destroy();
};

/** The id an answer names: a create's `id`, in its JSON or its words. */
const idIn = (text: string): string => {
  try {
    const { id } = JSON.parse(text) as { id?: unknown };
    if (typeof id === "string") {
      return id;
    }
  } catch {
    // Words: the id is in them.
  }
  return ONE_ID.exec(text)?.[0] ?? "";
};

/** The page's hash a pick records, from the hub's whole record of it. */
const pageHashOf = async (
  probe: Probe,
  as: Session,
  artifact: string
): Promise<string> => {
  const read = await probe.tool(as, "artifact_read", {
    id: artifact,
    response_format: "detailed",
  });
  try {
    return (JSON.parse(read.text) as { pageHash?: string }).pageHash ?? "";
  } catch {
    return "";
  }
};

const seedArtifacts = async (probe: Probe, orch: Session) => {
  const { tool } = probe;
  const decision = await tool(orch, "artifact_create", {
    kind: "page",
    does: "pick",
    ask: "Pick how the hosted plan is priced",
    name: "pricing",
    program: PROGRAM,
    response_format: "detailed",
  });
  const decisionId = idIn(decision.text);
  const firstHash = await pageHashOf(probe, orch, decisionId);
  const pick = (
    options: string[],
    at: number,
    hash: string,
    note?: string
  ) => ({
    options,
    note: note ?? null,
    value: null,
    pageHash: hash,
    at: new Date(Date.now() - at * 60_000).toISOString(),
  });
  await writeDoc(probe, orch.id, decisionId, (doc) => {
    const state = doc.getMap("state");
    state.set("shape", pick(["machine"], 50, firstHash));
    state.set(
      "trial",
      pick(["month"], 49, firstHash, "Thirty days is what Linear gives.")
    );
    state.set("seats", pick([], 48, firstHash));
  });
  const revised = await tool(orch, "artifact_update", {
    id: decisionId,
    statements: REVISION,
  });
  const secondHash = await pageHashOf(probe, orch, decisionId);
  await writeDoc(probe, orch.id, decisionId, (doc) => {
    const state = doc.getMap("state");
    state.set("region", pick(["eu"], 10, secondHash));
    state.set("budget", {
      options: [],
      note: null,
      value: { monthly: 1200, currency: "EUR" },
      pageHash: secondHash,
      at: new Date(Date.now() - 9 * 60_000).toISOString(),
    });
  });
  const pinned = await tool(orch, "artifact_create", {
    kind: "page",
    does: "judge",
    ask: "Judge the settings page: pin what reads wrong",
    name: "settings",
    html: pinPage(),
    response_format: "detailed",
  });
  const pinnedId = idIn(pinned.text);
  const route = `/__cawco/artifact/${pinnedId}`;
  const pins = Array.from({ length: PIN_COUNT }, (_, i) =>
    pinOf(i + 1, `http://127.0.0.1${route}`)
  );
  await writeDoc(probe, orch.id, pinnedId, (doc) => {
    const map = doc.getMap("pins");
    for (const pin of pins) {
      map.set(pin.id, pin);
    }
  });
  // The session answers every third pin, as comment_reply writes it.
  for (const pin of pins.filter((one) => one.number % 3 === 0)) {
    // biome-ignore lint/performance/noAwaitInLoops: one reply after another, as a session writes them
    await tool(orch, "comment_reply", {
      pin: pin.id,
      text: "Made it the secondary button.",
      files: ["src/routes/settings/+page.svelte"],
    });
  }
  // Older pages a session leaves behind, superseded.
  for (const n of [1, 2, 3, 4]) {
    // biome-ignore lint/performance/noAwaitInLoops: one page after the other, as a session makes them
    await tool(orch, "artifact_create", {
      kind: "page",
      does: "judge",
      ask: `Judge draft ${n} of the onboarding page`,
      name: `onboarding-draft-${n}`,
      html: `<p>Onboarding, draft ${n}.</p>`,
    });
  }
  return { decisionId, pinnedId, pins, revised };
};

/** A seeded workspace's state: held with work, live under a running item, or archived. */
const workspaceState = (held: boolean, state: string): string => {
  if (held) {
    return "held";
  }
  return state === "running" ? "active" : "archived";
};

/** One seeded delegate: its workspace, its session's row and its work item, as the hub keeps them. */
const seedOne = (
  probe: Probe,
  one: {
    headline: string;
    held: boolean;
    id: string;
    parent: string;
    started: number;
    state: string;
    title: string;
  }
) => {
  const { fleet, cwd, project } = probe;
  const now = Date.now();
  const { id, parent, started, state, held, headline } = one;
  const workspace = crypto.randomUUID();
  const item = crypto.randomUUID();
  const ended = state === "running" ? null : started + 25 * 60_000;
  const path = join(fleet.workdir, `ws-${workspace.slice(0, 8)}`);
  fleet.write(
    "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, base, state, ports, created_by_instance_id, holding, held_at, created_at) VALUES (?, ?, ?, ?, ?, 'main', ?, '[]', ?, ?, ?, ?)",
    workspace,
    MACHINE,
    cwd,
    path,
    `ws/${workspace.slice(0, 8)}`,
    workspaceState(held, state),
    parent,
    held
      ? JSON.stringify({ ahead: 2, bytes: 412_000_000, dirty: 3, stashes: 1 })
      : null,
    held ? (ended ?? now) : null,
    started
  );
  fleet.write(
    "INSERT INTO instances (id, machine_id, project_id, harness, parent_instance_id, cwd, launch_dir, title, kind, can_delegate, status, created_at, updated_at, work_item_id) VALUES (?, ?, ?, 'claude', ?, ?, 'known', ?, 'mainline', 0, ?, ?, ?, ?)",
    id,
    MACHINE,
    project.id,
    parent,
    path,
    one.title,
    state === "running" ? "idle" : "stopped",
    started,
    ended ?? now,
    item
  );
  fleet.write(
    "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, project_id, harness, model, state, headline, result, error, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'claude', 'claude-opus-5-5', ?, ?, ?, ?, ?, ?)",
    item,
    workspace,
    parent,
    id,
    `The brief of ${one.title}: what to change, where, and the commands whose output proves it.`,
    `${one.title}: ${headline.split(";")[0]?.slice(0, 40) || "in flight"}`,
    project.id,
    state,
    headline || null,
    headline
      ? `${headline}\n\nThe whole report, with the output of every command.`
      : null,
    state === "failed" ? "The landing gate failed." : null,
    started,
    ended
  );
};

/** Fourteen delegates two levels deep, most ended, three workspaces held, as SQL rows the hub reads. */
const seedDelegates = (probe: Probe, orch: Session) => {
  const now = Date.now();
  const states = [
    "done",
    "done",
    "failed",
    "done",
    "cancelled",
    "done",
    "running",
    "done",
    "failed",
    "done",
    "done",
    "running",
    "done",
    "done",
  ] as const;
  const headlines = [
    "The tray chip no longer overflows at 390px; lint, typecheck and the tray spec pass.",
    "Moved the decision page's picks to one store; the j6 journey passes on all three engines.",
    "The iOS build fails on the generated client: the openapi document lost the `pins` schema.",
    "Cut the hub's cold start from 4.1 s to 1.3 s by reading rows by key; the hub-start spec passes.",
    "Stopped before it started: the brief named the wrong repository.",
    "Comment pins re-anchor by source line after a revision; the comments spec passes.",
    "",
    "The routine form reads its schedule back from the hub; the j8 journey passes.",
    "The landing gate timed out on the Mac's build slot twice; nothing landed.",
    "Find redacts passwords in concise hits; the find-tool spec passes.",
    "The design map lists a component's call sites; the session-sheet spec passes.",
    "",
    "Delegate list answers recent-first; the workspace-held spec passes.",
    "The tokens build emits the new radius scale; the dashboard build passes.",
  ];
  const ids: string[] = [];
  for (const [i, state] of states.entries()) {
    const id = crypto.randomUUID();
    ids.push(id);
    seedOne(probe, {
      id,
      // The later ones nest under the first ones.
      parent: i >= 10 ? (ids[i - 10] ?? orch.id) : orch.id,
      started: now - (states.length - i) * 40 * 60_000,
      state,
      held: i === 2 || i === 4 || i === 8,
      headline: headlines[i] ?? "",
      title: `Delegate ${i + 1}`,
    });
  }
  return { ids };
};

/** Tasks, a routine, a thread: what a project's day leaves. */
const seedProject = async (probe: Probe, orch: Session, lead: Session) => {
  const { tool, fleet, project } = probe;
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    // biome-ignore lint/performance/noAwaitInLoops: filed in order, as a session files them
    await tool(orch, "task_create", {
      title: `Make setting ${n} quieter`,
      description: `Setting ${n} reads too loud; make its button the secondary one.`,
      acceptance: "- The button is secondary\n- The settings spec passes",
      todos: ["Change the button", "Run the spec"],
      labels: ["settings"],
      ...(n > 1 ? { after: [`tsk-${n - 1}`] } : {}),
    });
  }
  await tool(lead, "routine_create", {
    name: "Nightly settings sweep",
    prompt:
      "Sweep the settings page for loud buttons and file a task for each.",
    target: "delegate",
    cron: "0 3 * * *",
    time_zone: "Europe/London",
  });
  const threadId = crypto.randomUUID();
  const at = Date.now() - 3_600_000;
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    threadId,
    project.id,
    "Settings page polish",
    at,
    at
  );
  for (const [n, [author, body]] of [
    ["you", "The settings page is too loud. Can you get it quieter this week?"],
    [
      "caw",
      "Filed tsk-1 to tsk-8, one per setting; the first two run tonight.",
    ],
    ["you", "Good. Keep the save buttons where they are."],
  ].entries()) {
    fleet.write(
      "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      threadId,
      author,
      body,
      at + n * 60_000
    );
  }
  return { threadId };
};

/** Every call, as an agent makes it on this fixture. */
const calls = (
  orch: Session,
  lead: Session,
  seeded: {
    decisionId: string;
    pinnedId: string;
    pins: { id: string }[];
    threadId: string;
  }
): { as: Session; args: object; name: string; shape?: string }[] => [
  { as: orch, name: "artifact_read", args: { id: seeded.decisionId } },
  {
    as: orch,
    name: "artifact_read",
    args: { id: seeded.pinnedId },
    shape: "a page",
  },
  { as: orch, name: "artifact_list", args: {} },
  { as: orch, name: "comment_read", args: { filter: "all" } },
  { as: orch, name: "delegate_list", args: { include: "all" } },
  { as: orch, name: "delegate_list", args: {}, shape: "live" },
  { as: orch, name: "list_sessions", args: {} },
  { as: orch, name: "list_delegate_types", args: {} },
  { as: orch, name: "workflow_list", args: {} },
  { as: orch, name: "task_read", args: {} },
  { as: orch, name: "task_read", args: { id: "tsk-2" }, shape: "one task" },
  { as: orch, name: "find", args: { query: "settings", project: "all" } },
  { as: orch, name: "open_items", args: {} },
  { as: orch, name: "artifact_show", args: { id: seeded.decisionId } },
  { as: orch, name: "artifact_browse", args: { id: seeded.decisionId } },
  {
    as: orch,
    name: "comment_reply",
    args: {
      pin: seeded.pins[0]?.id,
      text: "Made it secondary.",
      files: ["src/routes/settings/+page.svelte"],
    },
  },
  { as: orch, name: "comment_resolve", args: { pin: seeded.pins[1]?.id } },
  {
    as: orch,
    name: "todo_write",
    args: {
      steps: [
        { content: "Measure", status: "completed" },
        { content: "Change", status: "in_progress" },
      ],
    },
  },
  { as: orch, name: "admin_delegate_types_read", args: { action: "list" } },
  { as: orch, name: "admin_connections_read", args: { action: "list" } },
  { as: orch, name: "admin_skills_read", args: { action: "list" } },
  { as: orch, name: "admin_plugins_read", args: { action: "list" } },
  { as: orch, name: "admin_mcp_servers_read", args: { action: "list" } },
  { as: orch, name: "admin_rules_read", args: { action: "list" } },
  {
    as: orch,
    name: "admin_rules_read",
    args: { action: "templates" },
    shape: "templates",
  },
  { as: orch, name: "admin_hooks_read", args: { action: "list" } },
  { as: orch, name: "admin_memory_read", args: { action: "list_docs" } },
  { as: orch, name: "admin_previews_read", args: { action: "get" } },
  { as: lead, name: "thread_read", args: {} },
  {
    as: lead,
    name: "thread_read",
    args: { thread: seeded.threadId },
    shape: "one thread",
  },
  { as: lead, name: "folder_read", args: {} },
  { as: lead, name: "routine_list", args: {} },
  { as: lead, name: "event_route_list", args: {} },
  { as: lead, name: "connector_poll_list", args: {} },
  { as: lead, name: "relay_list", args: {} },
  { as: lead, name: "action_list", args: {} },
];

const shortOf = (text: string): string =>
  text.length > 1600 ? `${text.slice(0, 1600)}…` : text;

/** Every call twice, by default and detailed, one at a time as an agent makes them. */
const measureAll = async (
  probe: Probe,
  asked: ReturnType<typeof calls>
): Promise<Measured[]> => {
  const measured: Measured[] = [];
  for (const call of asked) {
    // biome-ignore lint/performance/noAwaitInLoops: one call at a time, as an agent makes them
    const concise = await probe.tool(call.as, call.name, call.args);
    const detailed = await probe.tool(call.as, call.name, {
      ...call.args,
      response_format: "detailed",
    });
    measured.push({
      name: call.name,
      shape: call.shape ?? "",
      concise,
      detailed,
    });
  }
  return measured;
};

const tagOf = (one: Measured): string =>
  `${one.name}${one.shape ? ` (${one.shape})` : ""}`;

/** The answers' bytes, kept for comparing runs and printed as a table. */
const keep = async (kit: Kit, measured: Measured[]) => {
  const label = process.env.TOOL_ANSWERS_LABEL ?? "run";
  const out = join(process.env.TMPDIR ?? "/tmp", "probe-kit", "tool-answers");
  await mkdir(out, { recursive: true });
  await writeFile(
    join(out, `${label}.json`),
    JSON.stringify(
      measured.map((one) => ({
        name: one.name,
        shape: one.shape,
        concise: Buffer.byteLength(one.concise.text),
        detailed: Buffer.byteLength(one.detailed.text),
        refused: one.concise.refused,
        text: one.concise.text,
        detailedText: one.detailed.text,
      })),
      null,
      2
    )
  );
  kit.note(
    [
      `| tool | ${label} concise bytes | detailed bytes |`,
      "| --- | ---: | ---: |",
      ...measured.map(
        (one) =>
          `| ${tagOf(one)} | ${Buffer.byteLength(one.concise.text)} | ${Buffer.byteLength(one.detailed.text)} |`
      ),
    ].join("\n")
  );
};

/** Whether `text` parses as JSON. */
const isJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/** a to d over one tool's two answers. */
const checkOne = (kit: Kit, one: Measured) => {
  const tag = tagOf(one);
  kit.check(
    `a: ${tag} answers`,
    !(one.concise.refused || one.detailed.refused),
    shortOf(one.concise.text || one.detailed.text)
  );
  // What the agent copies whole (an address, a link's destination, a cursor) is not its words.
  const words = one.concise.text
    .replace(REFERENCE_DESTINATION, "(cawco:…)")
    .replace(SINCE_CURSOR, "")
    .replace(URL_WORDS, "");
  const ids = words.match(FULL_ID) ?? [];
  kit.check(
    `b: ${tag}'s concise answer names things by name or handle, with no full id, hash, ISO time or null`,
    ids.length === 0 &&
      !HASH.test(words) &&
      !ISO_TIME.test(words) &&
      !NULL.test(words),
    `${ids.length} full ids; ${shortOf(one.concise.text)}`
  );
  kit.check(
    `c: ${tag}'s detailed answer is the hub's record, as JSON`,
    SENTENCES.has(one.name) || isJson(one.detailed.text),
    shortOf(one.detailed.text)
  );
  kit.check(
    `d: ${tag}'s concise answer is no longer than its detailed one, past a sentence saying what there is`,
    Buffer.byteLength(words) <=
      Math.max(Buffer.byteLength(one.detailed.text), SENTENCE_BYTES),
    `${Buffer.byteLength(words)} of words (${Buffer.byteLength(one.concise.text)} in all) > ${Buffer.byteLength(one.detailed.text)}`
  );
};

const run = async (kit: Kit) => {
  const probe = await standUp(kit);
  const orch = await probe.session("Settings orchestrator");
  const lead = await probe.session("Caw stand-in");
  probe.fleet.write("UPDATE instances SET role = 'lead' WHERE id = ?", lead.id);
  probe.fleet.write(
    "UPDATE projects SET lead_instance_id = ? WHERE id = ?",
    lead.id,
    probe.project.id
  );
  const artifacts = await seedArtifacts(probe, orch);
  seedDelegates(probe, orch);
  const { threadId } = await seedProject(probe, orch, lead);
  const measured = await measureAll(
    probe,
    calls(orch, lead, { ...artifacts, threadId })
  );
  await keep(kit, measured);
  for (const one of measured) {
    checkOne(kit, one);
  }
};

export default { name: "tool-answers", run } satisfies Spec;
