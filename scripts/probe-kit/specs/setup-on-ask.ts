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
 * - Then, on Claude Code, OpenCode and pi in turn (Caw moved to each), the
 *   person writes in chat: "can you set this project up again? I moved the
 *   checkout". The mock stands in for Caw's understanding of the ask: it
 *   calls project_setup with chat's id and `change: ["place"]`, then follows
 *   the steps it answers: artifact_create of the `setup` decision page, and
 *   thread_reply in chat.
 *
 * Each leg asserts:
 * - S: project_setup is offered to that harness's Caw, and its answer, the
 *   steps that reach him, is Setup's for chat: the decision page named
 *   "setup", the `stages` card and the `place` card he was asked to change.
 * - P: his `setup` page stands (kind page, does pick) with its stages and
 *   place cards: the cards the thread shows beside it.
 * - R: his reply lands in chat, and no thread was opened for it.
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
  HARNESSES,
  type Harness,
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

/** The setup page the mock's Caw shows: a stages card and a place card, in the interview's shape. */
const SETUP_PROGRAM = `root = Decisions("Pick how this project is set up", [stages, place])
stages = Decision("stages", "Which stages does the board use?", [kept, lean], "The board reads its columns from them.")
kept = Option("kept", "Keep these stages", "To do, active, review, done.", true, [], "Every task waits for a look before done.")
lean = Option("lean", "Drop review", "To do, active, done.", false, [], "Nothing is looked at before done.")
place = Decision("place", "Where does its work happen now?", [moved, same], "You moved the checkout.")
moved = Option("moved", "The new folder", "Work goes where the code now is.", true, [], "The old folder stays listed until you remove it.")
same = Option("same", "Where it was", "Nothing moves.", false, [], "Work keeps going to the old folder.")`;

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
  phase: "idle" | "setup" | "page" | "reply" | "done";
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
  if (
    request.toolNames.includes(CODE_MODE) &&
    request.body.includes(`cawco_${short}`)
  ) {
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
        "page"
      );
    case "page": {
      // The steps project_setup answered ride in every request after it,
      // as a tool result: Anthropic's user message or a chat tool message.
      const at = request.body.indexOf(STEPS);
      if (!now.steps && at >= 0) {
        now.steps = resultFrom(request.body, at);
      }
      return invoke(
        request,
        now,
        "artifact_create",
        {
          kind: "page",
          name: "setup",
          does: "pick",
          ask: "Pick how this project is set up",
          program: SETUP_PROGRAM,
        },
        "reply"
      );
    }
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

  for (const harness of HARNESSES) {
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
  harness: Harness,
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
  const detail = page
    ? JSON.stringify(
        await fleet
          .api(`/api/instances/${lead}/artifacts/${page.id}`)
          .catch((error: Error) => error.message)
      )
    : "";
  kit.check(
    `P ${harness}: Caw's setup page stands with its stages and place cards`,
    page?.kind === "page" &&
      page.does === "pick" &&
      detail.includes("stages") &&
      detail.includes("place"),
    JSON.stringify({ page, detail: detail.slice(0, 400) })
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
    `R ${harness}: Caw's reply lands in chat, and no thread was opened for the ask`,
    reply
      .slice(replies)
      .some((row) => row.body.startsWith("PROBE-SETUP-REPLY")) &&
      after.length === before.length,
    JSON.stringify({
      replies: reply.slice(replies).map((row) => row.body.slice(0, 80)),
      threads: [before.length, after.length],
    })
  );
  leg = undefined;
};

export default {
  name: "setup-on-ask",
  host: "Caw's place is a boundary, which starts only outside every workspace",
  run,
} satisfies Spec;
