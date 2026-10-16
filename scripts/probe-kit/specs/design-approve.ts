/**
 * A design task's review and its Approve (design-system plan §2, slice 3;
 * owner, 2026-10-16: "the agent who puts the task should be the one who
 * decides what happens to it after i approve it"). One path: the builder's
 * commits land as any work item's do, Approve is your move out of the
 * review stage, and it is refused, with its line, while the result's
 * design/ is not committed. On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model) and the built dashboard at
 * the desk. Its attempts cut workspaces, so it runs where a boundary can
 * start (a `host` check), not inside another one.
 *
 * Project "Harbour" (the design template, Caw off) on the fleet's checkout,
 * whose origin is a bare repository, with stages ready → working → review
 * (you) → approved → done. A "Filer" session files each task with
 * `task_create` and starts it with `task_start`; the attempt, played by the
 * mock model, writes design/ with `design_write`.
 *
 * 1. T1 (lands none): the builder writes design/, shows its Foundations
 *    page, hands it in and never commits; the task waits in review.
 *    Approve is refused (409) with the line naming design/ uncommitted in
 *    the builder's workspace, and the task stays in review.
 * 2. Reject with a pin: a pin on T1's Foundations page, then Send back (a
 *    comment and the move back to ready, as the review does). The pin's
 *    words reach the builder's session as one message.
 * 3. T2 (lands main): the builder writes design/ and commits it; the
 *    attempt lands; the task waits in review. Approve goes (review →
 *    approved), the task reads approved, and `git log origin/main -1`
 *    names the builder's commit.
 *
 *   bun scripts/probe-kit/run.ts design-approve
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox } from "./ink";

const CREATE = "mcp__cawco__task_create";
const START = "mcp__cawco__task_start";
const DESIGN_WRITE = "mcp__cawco__design_write";
const ARTIFACT = "mcp__cawco__artifact_create";
const RESULT = "mcp__cawco__task_result";
const FINISH = "mcp__cawco__finish_item";
const BASH = "Bash";
/** Only an attempt's brief opens this way. */
const BRIEF = "Your work item is an attempt at";
/** The task an attempt's brief opens on (dispatch.ts `briefOf`). */
const OWN_TASK = /Your work item is an attempt at tsk-\d+, “([^”]+)”/g;
const T1 = "Harbour system draft PROBE-T1";
const T2 = "Harbour system PROBE-T2";
const COMMIT = "Design system: Harbour";
const PIN_WORDS = "The ink is too light on the paper here.";
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const TURN = /PROBE-CMD:\w+/g;
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\napproved   waiting\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session, action\nviews\n  board      by stage\n---\n";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const oklch = (l: number, c: number, h: number) => ({
  colorSpace: "oklch",
  components: [l, c, h],
});

/** A small, whole design system: the parts design_write wants, every token sourced. */
const SYSTEM = [
  {
    path: "manifest.json",
    content: json({
      sources: {
        "color.paper": "styles/base.css:2",
        "color.ink": "styles/base.css:3",
      },
    }),
  },
  {
    path: "tokens.resolver.json",
    content: json({
      version: "2025.10",
      sets: { base: { sources: [{ $ref: "tokens.json" }] } },
      modifiers: {
        theme: {
          contexts: {
            light: [],
            dark: [{ $ref: "themes/dark.tokens.json" }],
          },
          default: "light",
          $extensions: {
            "dev.cawco": { contexts: { dark: { scheme: "dark" } } },
          },
        },
      },
      resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }],
    }),
  },
  {
    path: "tokens.json",
    content: json({
      color: {
        paper: { $type: "color", $value: oklch(0.984, 0.004, 85) },
        ink: { $type: "color", $value: oklch(0.264, 0.022, 265) },
      },
    }),
  },
  {
    path: "themes/dark.tokens.json",
    content: json({
      color: {
        paper: { $type: "color", $value: oklch(0.196, 0.009, 265) },
        ink: { $type: "color", $value: oklch(0.934, 0.007, 90) },
      },
    }),
  },
  { path: "DESIGN.md", content: "# Harbour design system\n\nInk on paper.\n" },
  {
    path: "SKILL.md",
    content:
      "---\nname: harbour-design\ndescription: Harbour's design system.\n---\n\nRead DESIGN.md and tokens.css first.\n",
  },
  {
    path: "specimens/index.html",
    content:
      '<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body><h1>Harbour foundations</h1></body></html>\n',
  },
];
const FOUNDATIONS = `<!doctype html><html><body style="margin:0;font:18px/1.6 system-ui">
<main style="padding:24px"><h1 id="title">Harbour foundations</h1>
<p id="ink" style="padding:24px;background:oklch(0.984 0.004 85);color:oklch(0.264 0.022 265)">Ink on paper, the body role.</p></main></body></html>`;

interface Call {
  input: object | ((last: string) => object);
  name: string;
}

/** The builder's calls per task, in order; each turn answers the next. */
const attempts = new Map<string, Call[]>([
  [
    T1,
    [
      { name: DESIGN_WRITE, input: { files: SYSTEM } },
      {
        name: ARTIFACT,
        input: { kind: "page", name: "foundations", html: FOUNDATIONS },
      },
      {
        name: RESULT,
        input: (last) => ({
          summary:
            "Harbour's design system, drafted; design/ not yet committed.",
          artifacts: [
            {
              kind: "artifact",
              artifactId: ANSWERED_ID.exec(last)?.[1] ?? "",
              primary: true,
            },
          ],
        }),
      },
      {
        name: FINISH,
        input: {
          headline: "Drafted the system.",
          summary: "Drafted the system.",
        },
      },
    ],
  ],
  [
    T2,
    [
      { name: DESIGN_WRITE, input: { files: SYSTEM } },
      {
        name: BASH,
        input: {
          // Its own outcome in its answer: the commit's, then what is left.
          command: `git add design && git commit -qm '${COMMIT}'; echo "commit exit $?"; git status --porcelain; git log -1 --format=%s`,
          description: "Commit design/",
        },
      },
      {
        name: RESULT,
        input: { summary: "Harbour's design system, committed." },
      },
      {
        name: FINISH,
        input: { headline: "Built the system.", summary: "Built the system." },
      },
    ],
  ],
]);
/** The filer's calls, by a command's marker. */
const commands = new Map<string, Call[]>();
/** Every request the builder's sessions were asked with: where a pin's delivery shows. */
const builderHeard: string[] = [];

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 1,
  words: [],
  tool: { name, input },
});

/** The text of the tool result a request answers (Anthropic messages), or nothing. */
const toolResultOf = (body: string): string => {
  try {
    const { messages } = JSON.parse(body) as {
      messages?: { content: unknown }[];
    };
    const content = messages?.at(-1)?.content;
    const block = Array.isArray(content)
      ? (content as { content?: unknown; type?: string }[]).find(
          (part) => part.type === "tool_result"
        )
      : undefined;
    const said = block?.content;
    if (typeof said === "string") {
      return said;
    }
    return Array.isArray(said)
      ? (said as { text?: string }[]).map((part) => part.text ?? "").join("")
      : "";
  } catch {
    return "";
  }
};

/**
 * What each turn's tools answered, in order, by the turn's key (an
 * attempt's task title, a command's marker): what a stalled run reports,
 * so a refused start or a landing sent back says itself.
 */
const answers = new Map<string, string[]>();
/** The calls a turn already looked for with ToolSearch, by key. */
const searched = new Map<string, Set<string>>();

/**
 * The next call of the turn keyed `key`: found first when it is deferred,
 * once; a tool still not offered after that ends the turn saying so.
 */
const next = (request: Seen, key: string | undefined): Reply => {
  if (key && request.afterTool) {
    answers.set(key, [...(answers.get(key) ?? []), toolResultOf(request.body)]);
  }
  const queue = key ? (attempts.get(key) ?? commands.get(key)) : undefined;
  const [call] = queue ?? [];
  if (!(key && queue && call)) {
    return text("ok");
  }
  if (!request.toolNames.includes(call.name)) {
    const looked = searched.get(key) ?? new Set<string>();
    if (looked.has(call.name) || !request.toolNames.includes("ToolSearch")) {
      queue.shift();
      return text(`${call.name} is not offered`);
    }
    looked.add(call.name);
    searched.set(key, looked);
    return useTool("ToolSearch", {
      query: `select:${call.name}`,
      max_results: 1,
    });
  }
  queue.shift();
  const input =
    typeof call.input === "function"
      ? call.input(toolResultOf(request.body))
      : call.input;
  return useTool(call.name, input);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(BRIEF)) {
    builderHeard.push(request.last);
    // The newest work item the session runs: its brief's first line names
    // its task (a session may carry more than one item).
    const own = [...request.all.matchAll(OWN_TASK)].at(-1)?.[1];
    return next(request, own);
  }
  return next(request, [...request.all.matchAll(TURN)].at(-1)?.[0]);
};

/** The approval's refusal (hub design-system.ts `uncommittedLine`): its named paths, and how many more. */
const UNCOMMITTED_LINE =
  /design\/ isn't committed in the builder's workspace: (.+?)(?: and (\d+) more)?\. Send it back/;

/** The paths a design_write answered it wrote, from among a turn's tool answers. */
const writtenBy = (said: string[]): string[] => {
  for (const one of said) {
    const body = one.slice(one.indexOf("{"), one.lastIndexOf("}") + 1);
    try {
      const { written } = JSON.parse(body) as { written?: string[] };
      if (written?.length) {
        return written;
      }
    } catch {
      // not design_write's answer
    }
  }
  return [];
};

interface TaskRead {
  attempts: { state: string }[];
  id: string;
  result: unknown;
  stage: string;
}

/** Comment mode on in the pane, a tap on `selector` in the page, the person's words in pin 1's card. */
const pinWith = async (
  on: On,
  frame: Frame,
  selector: string,
  words: string
) => {
  await on.page.locator(".preview-pane button[aria-keyshortcuts='C']").focus();
  await on.page.keyboard.press("c");
  await settle(on.page, 400);
  const b = await screenBox(on, frame, selector);
  await on.page.mouse.click(b.x + b.w * 0.3, b.y + b.h / 2);
  const card = on.page.locator('.pin-card[data-pin-card="1"]');
  await card.waitFor({ timeout: 10_000 });
  await card.getByRole("textbox").fill(words);
  await card.getByRole("button", { name: "Reply" }).click();
  await until(
    "pin 1's words in the doc",
    () => docOf(frame),
    (now) =>
      Object.values(now.pins).some(
        (pin) => pin.number === 1 && (pin.thread as unknown[]).length === 1
      ),
    10_000
  );
  await on.page.keyboard.press("Escape");
};

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
  await writeFile(
    join(fleet.env.HOME as string, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );

  const { repo } = fleet;
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Harbour",
    machineId: MACHINE,
    cwd: repo,
    caw: false,
    template: "design",
  });
  const put = await fetch(
    `${fleet.base}/api/projects/${project.id}/folder/file`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "stages.md", content: STAGES }),
    }
  );
  if (!put.ok) {
    throw new Error(`stages.md: ${put.status} ${await put.text()}`);
  }
  const filer = await fleet.spawn("claude", "Filer", repo, {
    projectId: project.id,
  });
  const read = (id: string) =>
    fleet.api<TaskRead>(`/api/projects/${project.id}/tasks/${id}`);
  const command = async (marker: string, calls: Call[]) => {
    commands.set(`PROBE-CMD:${marker}`, calls);
    await fleet.send(filer, `PROBE-CMD:${marker}`);
  };
  /** Files `title` and starts it; its id once it waits in review with a result. */
  const reviewed = async (marker: string, title: string, lands: string) => {
    await command(`${marker}FILE`, [
      {
        name: CREATE,
        input: {
          title,
          stage: "ready",
          lands,
          acceptance: "- design/ holds the system",
        },
      },
    ]);
    const task = await until(
      `${marker}: the filed task`,
      async () =>
        (
          await fleet.api<{ tasks: { id: string; title: string }[] }>(
            `/api/projects/${project.id}/tasks`
          )
        ).tasks.find((each) => each.title === title),
      Boolean,
      120_000
    );
    if (!task) {
      throw new Error(`${marker}: no task filed`);
    }
    await command(`${marker}START`, [{ name: START, input: { id: task.id } }]);
    try {
      await until(
        `${task.id} in review with its result`,
        () => read(task.id),
        (now) => now.stage === "review" && now.result !== null,
        400_000
      );
    } catch (error) {
      throw await stalled(error, marker, title, task.id);
    }
    return task.id;
  };
  /**
   * Why a task never reached review, said whole: the task as it stands, its
   * attempts' rows, what every tool its filer and its builder called
   * answered, and the hub's lines on it (also kept as <marker>-stalled.json).
   */
  const stalled = async (
    error: unknown,
    marker: string,
    title: string,
    id: string
  ): Promise<Error> => {
    const now = await read(id).catch(() => undefined);
    const items = fleet.query<{
      error: string | null;
      id: string;
      lands: string;
      result: string | null;
      state: string;
    }>(
      "SELECT id, state, lands, error, result FROM work_items WHERE project_id = ? AND task_id = ? ORDER BY created_at",
      project.id,
      id
    );
    const said = (key: string) =>
      (answers.get(key) ?? []).map((one) => one.slice(0, 400));
    const hub = (await fleet.logs("hub"))
      .split("\n")
      .filter((line) => line.includes(id))
      .slice(-8);
    const report = {
      task: now,
      items,
      filer: said(`PROBE-CMD:${marker}START`),
      builder: said(title),
      hub,
    };
    await writeFile(join(kit.out, `${marker}-stalled.json`), json(report));
    return new Error(
      `${error instanceof Error ? error.message : String(error)}; ${JSON.stringify(report).slice(0, 2400)}`
    );
  };
  const approve = (id: string) =>
    fetch(`${fleet.base}/api/projects/${project.id}/tasks/${id}/stage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "approved" }),
    });
  const builderOf = (id: string) =>
    fleet.query<{ instance_id: string }>(
      "SELECT instance_id FROM work_items WHERE project_id = ? AND task_id = ? ORDER BY created_at DESC",
      project.id,
      id
    )[0]?.instance_id ?? "";

  // ── 1. Approve with design/ uncommitted is refused with its line ─────
  const t1 = await reviewed("T1", T1, "none");
  const refused = await approve(t1);
  const refusal = await refused.text();
  const stays = await read(t1);
  // What the builder's design_write wrote (its answer's `written`): every
  // path the line names is one of them, and its named paths and "N more"
  // count all of them, as none was committed.
  const written = writtenBy(answers.get(T1) ?? []);
  const named = UNCOMMITTED_LINE.exec(refusal);
  const paths = named?.[1]?.split(", ") ?? [];
  const more = Number(named?.[2] ?? 0);
  kit.check(
    "1: Approve with design/ uncommitted is refused with its line, naming the builder's uncommitted files, and the task stays in review",
    refused.status === 409 &&
      written.length > 0 &&
      paths.length > 0 &&
      paths.every((path) => written.includes(path)) &&
      paths.length + more === written.length &&
      stays.stage === "review",
    `${refused.status} “${refusal.slice(0, 300)}”; named ${paths.length} + ${more} more of ${written.length} written (${written.join(", ")}); stage ${stays.stage}`
  );

  // ── 2. Reject with a pin reaches the builder's session as one message ─
  const builder = builderOf(t1);
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/${builder}`, ".artifact-trigger");
  const cdp = await page.context().newCDPSession(page);
  const on: On = {
    call: () => Promise.reject(new Error("no calls")),
    cdp,
    fleet,
    kit,
    page,
    said: [],
    session: builder,
  };
  const frame = await pageFrame(on);
  await frame.waitForSelector("#ink", { timeout: 60_000 });
  await settle(page, 600);
  await pinWith(on, frame, "#ink", PIN_WORDS);
  // Send back, as the review does: your note as a comment, then the move back.
  await fleet.api(`/api/projects/${project.id}/tasks/${t1}/comments`, {
    text: "Sent back: see the pin on the Foundations page.",
  });
  await fleet.api(`/api/projects/${project.id}/tasks/${t1}/stage`, {
    stage: "ready",
  });
  const delivered = () =>
    fleet.query<{ id: string }>(
      "SELECT uuid AS id FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
      builder,
      `%${PIN_WORDS}%`
    );
  await until(
    "the pin's delivery to the builder",
    delivered,
    (rows) => rows.length > 0,
    90_000
  );
  // Past another quiet period: a second delivery would have come by now.
  await Bun.sleep(20_000);
  const deliveries = delivered();
  kit.check(
    "2: Reject with a pin reaches the builder's session as one message",
    deliveries.length === 1 &&
      builderHeard.filter((words) => words.includes(PIN_WORDS)).length >= 1,
    `${deliveries.length} message(s) to ${builder.slice(0, 8)} carrying the pin; the model asked with it ${builderHeard.filter((words) => words.includes(PIN_WORDS)).length} time(s)`
  );

  // ── 3. Approve on a committed system: the commit landed, the task approved ─
  const t2 = await reviewed("T2", T2, "main");
  const approved = await approve(t2);
  const after = await read(t2);
  await Bun.$`git fetch -q origin`.cwd(repo).quiet();
  const newest = (
    await Bun.$`git log origin/main -1 --format=%s`.cwd(repo).quiet()
  )
    .text()
    .trim();
  kit.check(
    "3: Approve on the review goes, the task reads approved, and git log origin/main -1 names the builder's commit",
    approved.ok && after.stage === "approved" && newest === COMMIT,
    `${approved.status}; stage ${after.stage}; origin/main -1 “${newest}”`
  );
};

export default { name: "design-approve", run } satisfies Spec;
