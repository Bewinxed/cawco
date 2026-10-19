/**
 * The person can set a project up again, any time, by asking Caw in their
 * own words in any thread (caw.ts `project_setup`, setup.ts `setupEvent`):
 * the owner's "I should be able to trigger the setup anytime naturally via
 * caw". On a scratch fleet (real hub, agent and sessiond; each harness
 * against the mock model), project "Setup again" with Caw on, made from a
 * folder, so it is placed and its first Setup asks no place.
 *
 * - First words open its Setup thread (as they always have); then a second
 *   thread, "chat", is a plain conversation Caw answers.
 * - Then, on each harness Caw runs on (core `CAW_DENIED_TOOLS`: Claude Code
 *   and OpenCode; pi cannot put his calls to the hub's gate, so Caw does not
 *   run there) in turn, Caw moved to it, the person writes in chat: "can you
 *   set this project up again? I moved the checkout". The mock stands in for
 *   Caw's understanding of the ask: it calls project_setup with chat's id
 *   and `change: ["place"]`, then follows the steps it answers: the setup
 *   page as HTML in his folder (folder_write of decisions/setup/page.html,
 *   its stage names as fields and its place picked with cawco.pickPlace),
 *   artifact_create of it, and thread_reply in chat.
 *
 * Each leg asserts:
 * - S: project_setup is offered to that harness's Caw, and its answer, the
 *   steps that reach him, is Setup's for chat: the decision page named
 *   "setup", the `stages` card and the `place` card he was asked to change.
 * - P: his `setup` page stands (kind page, does pick), built from
 *   decisions/setup/page.html in the project's folder, whose stage fields
 *   and place pick are there: the page the thread shows beside it.
 * - R: his reply lands in chat, no thread was opened for it, and chat is
 *   now a Setup thread (`setup`), so his reply naming files offers "Open
 *   the board" there as in the first one.
 *
 * On origin/main, which has no project_setup, every S fails ("not offered").
 *
 * Caw's place is a boundary, which no workspace can start inside another:
 * run it on the host.
 *
 *   bun scripts/probe-kit/run.ts setup-on-ask
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one harness at a time, as the person moves Caw
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CAW_DENIED_TOOLS,
  type CawHarness,
} from "../../../packages/core/src/delegate-types";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const CAW = "You are Caw";
/** The person's ask, in their words. */
const ASK = "can you set this project up again? I moved the checkout";
/** What the steps project_setup answers open with, for this ask. */
const STEPS = "Setup: the person asked you to set the project";
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";

/** Where Setup's steps have Caw write the setup page, in the project's folder. */
const PAGE_FILE = "decisions/setup/page.html";

/** The harnesses Caw runs on: the ones whose every shell and edit call the hub's gate decides. */
const CAW_HARNESSES = Object.keys(CAW_DENIED_TOOLS) as CawHarness[];

/**
 * The setup page the mock's Caw writes, from the kit as the steps say: the
 * stage names as fields the person edits, and a button that picks the
 * place with cawco.pickPlace.
 */
const SETUP_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Set up</title><style>{{KIT_CSS}}</style></head>
<body><main class="dp">
<header class="dp-hero"><div><h1>Pick how this project is set up</h1></div></header>
<article class="dp-card" id="stages"><header><h2>Its stages</h2></header>
<label>To do<input name="stage-todo" value="To do"></label>
<label>Active<input name="stage-active" value="Active"></label>
<label>Done<input name="stage-done" value="Done"></label>
</article>
<article class="dp-card" id="place"><header><h2>Where its work happens</h2></header>
<button class="dp-opt" type="button" data-probe="place">Pick the machine and folder</button>
</article></main><script>{{KIT_JS}}</script>
<script>document.querySelector('[data-probe="place"]').addEventListener("click", () => cawco.pickPlace());</script></body></html>`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** One leg's turn, as the mock plays Caw through it. */
interface Leg {
  /** The tool calls it has made, in order, by the short name. */
  called: string[];
  /** Tools a harness did not offer, by the short name. */
  missing: string[];
  phase: "idle" | "setup" | "write" | "create" | "reply" | "done";
  /** Short names Claude Code's ToolSearch was asked for. */
  searched: Set<string>;
  /** The steps project_setup answered, as the request after it carried them. */
  steps: string;
}

const freshLeg = (): Leg => ({
  called: [],
  missing: [],
  phase: "idle",
  searched: new Set(),
  steps: "",
});

/** The leg under way; undefined between legs, when the mock only says "ok". */
let leg: Leg | undefined;
/** The thread the person asks in. */
let chat = "";

/**
 * Calls cawco's `short` tool as the harness offers it: Claude Code's MCP
 * name (loaded with ToolSearch first when deferred), OpenCode's (or its Code
 * Mode catalog's), pi's own; `next` once the call went out.
 */
const invoke = (
  request: Seen,
  now: Leg,
  short: string,
  input: object,
  next: Leg["phase"]
): Reply => {
  const names = [`mcp__cawco__${short}`, `cawco_${short}`, short];
  const direct = request.toolNames.find((name) => names.includes(name));
  if (direct) {
    now.called.push(short);
    now.phase = next;
    return call(direct, input);
  }
  if (!now.searched.has(short) && request.toolNames.includes("ToolSearch")) {
    now.searched.add(short);
    return call("ToolSearch", {
      query: `select:mcp__cawco__${short}`,
      max_results: 1,
    });
  }
  if (request.toolNames.includes(CODE_MODE)) {
    now.called.push(short);
    now.phase = next;
    return call(CODE_MODE, {
      code: `return await tools.cawco.${short}(${JSON.stringify(input)});`,
    });
  }
  now.missing.push(short);
  now.phase = "done";
  return text(`${short} is not offered.`);
};

/**
 * The tool result that starts at `at` in a request's body, as the JSON
 * string it rides in: up to its closing quote, escapes kept.
 */
const resultFrom = (body: string, at: number): string => {
  let end = at;
  while (end < body.length && !(body[end] === '"' && body[end - 1] !== "\\")) {
    end += 1;
  }
  return body.slice(at, end);
};

const caw = (request: Seen): Reply => {
  const now = leg;
  if (!now) {
    return text("ok");
  }
  if (now.phase === "idle" && request.last.includes(ASK)) {
    now.phase = "setup";
  }
  switch (now.phase) {
    case "setup":
      return invoke(
        request,
        now,
        "project_setup",
        { thread: chat, change: ["place"] },
        "write"
      );
    case "write": {
      // The steps project_setup answered ride in every request after it,
      // as a tool result: Anthropic's user message or a chat tool message.
      const at = request.body.indexOf(STEPS);
      if (!now.steps && at >= 0) {
        now.steps = resultFrom(request.body, at);
      }
      return invoke(
        request,
        now,
        "folder_write",
        { path: PAGE_FILE, content: SETUP_PAGE },
        "create"
      );
    }
    case "create":
      return invoke(
        request,
        now,
        "artifact_create",
        {
          kind: "page",
          name: "setup",
          does: "pick",
          ask: "Pick how this project is set up",
        },
        "reply"
      );
    case "reply":
      return invoke(
        request,
        now,
        "thread_reply",
        {
          thread: chat,
          body: "PROBE-SETUP-REPLY: the setup page is up beside this thread.",
        },
        "done"
      );
    default:
      return text("ok");
  }
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  return request.all.includes(CAW) || request.body.includes(CAW)
    ? caw(request)
    : text("ok");
};

interface ThreadRow {
  id: string;
  setup: boolean;
}

const run = async (kit: Kit) => {
  const fleet: KitFleet = await kit.fleet(respond);
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
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Setup again",
    machineId: MACHINE,
    cwd: repo,
    caw: true,
  });
  const cawAnswers = (threadId: string) =>
    fleet.query<{ body: string }>(
      "SELECT body FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
      threadId
    );
  const threads = () =>
    fleet.api<ThreadRow[]>(`/api/projects/${project.id}/threads`);
  const leadOf = () =>
    fleet.query<{ lead_instance_id: string | null }>(
      "SELECT lead_instance_id FROM projects WHERE id = ?",
      project.id
    )[0]?.lead_instance_id ?? undefined;

  // The project's first words open its Setup thread, as they always have.
  const first = await fleet.api<{ thread: ThreadRow }>(
    `/api/projects/${project.id}/threads`,
    { body: "PROBE-FIRST: hello Caw." }
  );
  await until(
    "Caw answered in the Setup thread",
    () => cawAnswers(first.thread.id),
    (rows) => rows.length > 0,
    180_000
  );
  // A plain conversation after it: the thread the person asks in.
  const opened = await fleet.api<{ thread: ThreadRow }>(
    `/api/projects/${project.id}/threads`,
    { body: "PROBE-CHAT: what is on the board?" }
  );
  chat = opened.thread.id;
  await until(
    "Caw answered in chat",
    () => cawAnswers(chat),
    (rows) => rows.length > 0,
    180_000
  );
  kit.check(
    "the first words opened the Setup thread, and chat is a plain conversation",
    first.thread.setup && !opened.thread.setup,
    JSON.stringify({ first: first.thread, chat: opened.thread })
  );

  for (const harness of CAW_HARNESSES) {
    await askOn(kit, fleet, project.id, harness, {
      cawAnswers,
      leadOf,
      threads,
    });
  }
};

const askOn = async (
  kit: Kit,
  fleet: KitFleet,
  projectId: string,
  harness: CawHarness,
  reads: {
    cawAnswers: (threadId: string) => { body: string }[];
    leadOf: () => string | undefined;
    threads: () => Promise<ThreadRow[]>;
  }
) => {
  const moved = await fetch(`${fleet.base}/api/projects/${projectId}/caw`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ harness, model: MODEL[harness] }),
  });
  if (!moved.ok) {
    throw new Error(`Caw to ${harness}: ${moved.status} ${await moved.text()}`);
  }
  const before = await reads.threads();
  const replies = reads.cawAnswers(chat).length;
  const now = freshLeg();
  leg = now;
  await fleet.api(`/api/projects/${projectId}/threads/${chat}/messages`, {
    body: ASK,
  });
  await until(
    `${harness}: Caw's turn over the ask`,
    () => now.phase,
    (phase) => phase === "done",
    240_000
  ).catch(() => undefined);
  const lead = await until(
    `${harness}: Caw's session`,
    reads.leadOf,
    (id) => Boolean(id),
    60_000
  ).catch(() => "");
  const leadHarness =
    fleet.query<{ harness: string }>(
      "SELECT harness FROM instances WHERE id = ?",
      lead
    )[0]?.harness ?? "";
  kit.check(
    `S ${harness}: project_setup is offered to Caw, and the steps it answers are Setup's for chat, with the setup page, the stages card and the place card he was asked to change`,
    leadHarness === harness &&
      now.missing.length === 0 &&
      now.called[0] === "project_setup" &&
      now.steps.includes(`in thread ${chat}`) &&
      now.steps.includes("decision page named") &&
      now.steps.includes("`stages`") &&
      now.steps.includes("`place`"),
    JSON.stringify({
      leadHarness,
      called: now.called,
      missing: now.missing,
      steps: now.steps.slice(0, 600),
    })
  );

  const pages = lead
    ? await fleet
        .api<{ does: string; id: string; kind: string; name: string }[]>(
          `/api/instances/${lead}/artifacts`
        )
        .catch(() => [])
    : [];
  const page = pages.find((one) => one.name === "setup");
  const written = await fleet
    .api<{ content: string }>(
      `/api/projects/${projectId}/folder/file?path=${encodeURIComponent(PAGE_FILE)}`
    )
    .then(
      (file) => file.content,
      (error: Error) => error.message
    );
  kit.check(
    `P ${harness}: Caw's setup page stands, built from ${PAGE_FILE} with its stage fields and its place pick`,
    page?.kind === "page" &&
      page.does === "pick" &&
      written.includes('name="stage-todo"') &&
      written.includes("cawco.pickPlace()"),
    JSON.stringify({
      called: now.called,
      page,
      written: written.slice(0, 200),
    })
  );

  const reply = await until(
    `${harness}: Caw's reply in chat`,
    () => reads.cawAnswers(chat),
    (rows) =>
      rows
        .slice(replies)
        .some((row) => row.body.startsWith("PROBE-SETUP-REPLY")),
    60_000
  ).catch(() => reads.cawAnswers(chat));
  const after = await reads.threads();
  kit.check(
    `R ${harness}: Caw's reply lands in chat, no thread was opened for the ask, and chat is now a Setup thread`,
    reply
      .slice(replies)
      .some((row) => row.body.startsWith("PROBE-SETUP-REPLY")) &&
      after.length === before.length &&
      after.find((one) => one.id === chat)?.setup === true,
    JSON.stringify({
      replies: reply.slice(replies).map((row) => row.body.slice(0, 80)),
      threads: [before.length, after.length],
      chat: after.find((one) => one.id === chat),
    })
  );
  leg = undefined;
};

export default {
  name: "setup-on-ask",
  host: "Caw's place is a boundary, which starts only outside every workspace",
  run,
} satisfies Spec;
