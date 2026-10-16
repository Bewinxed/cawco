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
 * Project "Harbour" (the design template, Caw off) on a repository with no
 * outside remote, so the hub's own is its origin, with stages ready → working → review
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
 * Then Harbour has a design system on main, and T3 (lands main) is design
 * work in it (hub design-system.ts proposals, design-verify.ts checks):
 *
 * 4. Its builder's two token changes are proposals, not writes: each is an
 *    ask in /api/pending drawn as design/tokens.json's diff, and its
 *    workspace's tokens.json is unchanged. Deny the first: still unchanged,
 *    and the builder is told it was declined. Approve the second: the new
 *    ink is in tokens.json, committed in the builder's workspace with the
 *    proposal's why, and the builder is told.
 * 5. The builder hands in a home screen it has not committed: the task stays
 *    in working, a verifier session (its item's parent `verifier:<the
 *    builder's item>`) gets the uncommitted part as a patch in its inputs,
 *    and its one finding reaches the builder as one message naming the
 *    element's file:line and selector.
 * 6. The builder fixes it and commits; the next hand-in is checked again,
 *    passes, lands, and the task waits in review, its two rounds a finding
 *    and a pass.
 *
 *   bun scripts/probe-kit/run.ts design-approve
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Frame } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox } from "./ink";

const WAIT = "mcp__cawco__wait_item";
const VERDICT = "mcp__cawco__design_verdict";
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
const T3 = "Harbour home screen PROBE-T3";
const COMMIT = "Design system: Harbour";
/** The two proposals' reasons: the first is denied, the second approved. */
const WHY_DENIED = "A near-black ink, PROBE-DENIED";
const WHY_APPROVED = "A softer ink for long reading, PROBE-APPROVED";
/** A verifier's brief opens this way (hub design-verify.ts `VERIFIER_BRIEF`). */
const VERIFIER_BRIEF = "You are the design system verifier";
/** The commit a verifier's brief names: one verifier session a round. */
const VERIFIER_AT = /sits on commit ([0-9a-f]{40})/;
/** The finding round one gives: one element, tied to its file, line and selector. */
const FINDING = {
  file: "screens/home.html",
  line: 3,
  selector: "#hero",
  problem:
    "Its colour is a raw hex, #123456, not the system's ink: use var(--color-ink).",
};
/** What the builder's findings message carries of it. */
const FINDING_WORDS = `\`${FINDING.file}:${FINDING.line}\` \`${FINDING.selector}\``;
const HOME_RAW =
  '<!doctype html><html><head><link rel="stylesheet" href="../design/tokens.css"></head><body>\n<main>\n<h1 id="hero" style="color:#123456">Harbour</h1>\n</main></body></html>\n';
const HOME_FIXED =
  '<!doctype html><html><head><link rel="stylesheet" href="../design/tokens.css"></head><body>\n<main>\n<h1 id="hero" style="color:var(--color-ink)">Harbour</h1>\n</main></body></html>\n';
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
/** tokens.json with the ink at lightness `l`: a change to the system T2 put on main. */
const tokensWithInk = (l: number) => ({
  path: "tokens.json",
  content: json({
    color: {
      paper: { $type: "color", $value: oklch(0.984, 0.004, 85) },
      ink: { $type: "color", $value: oklch(l, 0.022, 265) },
    },
  }),
});
const INK_DENIED = 0.18;
const INK_APPROVED = 0.31;

/**
 * T3's builder, a script a turn by what woke it (`t3Phase`): its brief, the
 * person's answer to each proposal, the verifier's findings. Any other wake
 * (a reminder) ends its turn. A turn ends the wait it declared (hub
 * work-items.ts `turnState`), so the first answer, with the second still
 * pending, waits again, as an agent with a proposal open would.
 */
const t3Turns: Record<"start" | "declined" | "approved" | "findings", Call[]> =
  {
    declined: [
      {
        name: WAIT,
        input: {
          minutes: 30,
          reason: "the person answers my other design proposal",
        },
      },
    ],
    start: [
      {
        name: DESIGN_WRITE,
        input: { files: [tokensWithInk(INK_DENIED)], why: WHY_DENIED },
      },
      {
        name: DESIGN_WRITE,
        input: { files: [tokensWithInk(INK_APPROVED)], why: WHY_APPROVED },
      },
      // No reminder wakes it while the person answers.
      {
        name: WAIT,
        input: {
          minutes: 30,
          reason: "the person answers my design proposals",
        },
      },
    ],
    approved: [
      {
        name: BASH,
        input: {
          command: `mkdir -p screens && printf %s '${HOME_RAW}' > screens/home.html && git status --porcelain`,
          description: "Write the home screen",
        },
      },
      {
        name: RESULT,
        input: { summary: "Harbour's home screen, in the system." },
      },
      {
        name: FINISH,
        input: { headline: "Built the home screen.", summary: "Built it." },
      },
    ],
    findings: [
      {
        name: BASH,
        input: {
          command: `printf %s '${HOME_FIXED}' > screens/home.html && git add -A && git commit -qm 'Home screen in the system ink' && git status --porcelain`,
          description: "Fix the hero's colour and commit",
        },
      },
      {
        name: FINISH,
        input: { headline: "Fixed the hero's ink.", summary: "Fixed it." },
      },
    ],
  };
let t3Phase: keyof typeof t3Turns | "idle" = "idle";
/** Scripts woken by words read mid-turn, run in order once the script in hand is done. */
const t3Woken: (keyof typeof t3Turns)[] = [];
/** The mid-turn words already taken, so one is queued once. */
const t3Heard = new Set<string>();

/** A script's queue, made the first time its phase runs. */
const t3Queue = (phase: keyof typeof t3Turns): string => {
  const key = `${T3}:${phase}`;
  if (!attempts.has(key)) {
    attempts.set(key, t3Turns[phase]);
  }
  return key;
};

/**
 * T3's builder's next reply. A new turn takes the script of what woke it.
 * Words read mid-turn (a proposal's answer while it still works) are heard
 * and wait their turn: their script runs once the one in hand is done, in
 * the same turn, as a model reading them would.
 */
const t3Next = (request: Seen): Reply => {
  if (request.lastMidTurn) {
    const woke = t3PhaseOf(request.last);
    if (woke !== "idle" && !t3Heard.has(request.last)) {
      t3Heard.add(request.last);
      t3Woken.push(woke);
    }
  } else if (!request.afterTool) {
    t3Phase = t3PhaseOf(request.last);
  }
  for (;;) {
    if (
      t3Phase !== "idle" &&
      (attempts.get(t3Queue(t3Phase))?.length ?? 0) > 0
    ) {
      return next(request, `${T3}:${t3Phase}`);
    }
    const woken = t3Woken.shift();
    if (!woken) {
      // The script in hand is done (its last tool answered): the turn ends.
      return t3Phase === "idle"
        ? text("ok")
        : next(request, `${T3}:${t3Phase}`);
    }
    t3Phase = woken;
  }
};

/** What woke T3's builder for a new turn. */
const t3PhaseOf = (last: string): typeof t3Phase => {
  if (last.includes(BRIEF)) {
    return "start";
  }
  if (last.includes("approved your design proposal")) {
    return "approved";
  }
  if (last.includes("declined your design proposal")) {
    return "declined";
  }
  if (last.includes("must be fixed before your result reaches review")) {
    return "findings";
  }
  return "idle";
};

/** Each verifier round's calls, in order; a verifier session takes the next round when it first asks. */
const verifierRounds: Call[][] = [
  [
    {
      name: BASH,
      input: {
        command: `test -s "$TMPDIR/inputs/design-check.patch" && echo PATCH-HANDED || echo PATCH-MISSING`,
        description: "Look for the builder's uncommitted work",
      },
    },
    {
      name: VERDICT,
      input: {
        findings: [FINDING],
        summary: "The hero ignores the system's ink.",
      },
    },
  ],
  [
    {
      name: VERDICT,
      input: { findings: [], summary: "The home screen draws in the system." },
    },
  ],
];
/** The rounds' keys, in the order their sessions began. */
const verifierKeys: string[] = [];

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

/** A verifier's turn: its session's round, keyed by the commit its brief names. */
const verifierNext = (request: Seen): Reply => {
  const key = `VERIFIER:${VERIFIER_AT.exec(request.all)?.[1] ?? "?"}`;
  if (!attempts.has(key)) {
    attempts.set(key, verifierRounds.shift() ?? []);
    verifierKeys.push(key);
  }
  return next(request, key);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(VERIFIER_BRIEF)) {
    return verifierNext(request);
  }
  if (request.all.includes(BRIEF)) {
    builderHeard.push(request.last);
    // The newest work item the session runs: its brief's first line names
    // its task (a session may carry more than one item).
    const own = [...request.all.matchAll(OWN_TASK)].at(-1)?.[1];
    if (own !== T3) {
      return next(request, own);
    }
    return t3Next(request);
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

/** A parked ask as /api/pending lists it. */
interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: { why?: string };
    presentation?: { changes: { path: string }[] };
    toolName: string;
  };
  requestId: string;
}
/** The name a design proposal is parked under (core `DESIGN_PROPOSAL_TOOL`). */
const PROPOSAL = "mcp__cawco__design_proposal";

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

  // A repository of its own with no outside remote: the first workspace cut
  // gives it the hub's (a project with none gets the hub as its remote), the
  // one a workspace's boundary pushes to. The scratch fleet's own checkout
  // has a bare origin on this disk, which no boundary may write.
  const repo = join(fleet.sandbox, "harbour");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo harbour > README.md && git add -A && git commit -qm 'Harbour'`
    .cwd(repo)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
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
  /** Files `title` and starts it; its id once its attempt is asked for. */
  const filed = async (marker: string, title: string, lands: string) => {
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
    return task.id;
  };
  /** Files `title` and starts it; its id once it waits in review with a result. */
  const reviewed = async (marker: string, title: string, lands: string) => {
    const id = await filed(marker, title, lands);
    const task = { id };
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
  /** The clone of a task's newest attempt, on this disk. */
  const workspaceOf = (id: string) =>
    fleet.query<{ path: string }>(
      "SELECT w.path AS path FROM work_items i JOIN workspaces w ON w.id = i.workspace_id WHERE i.project_id = ? AND i.task_id = ? ORDER BY i.created_at DESC",
      project.id,
      id
    )[0]?.path ?? "";
  /** A task's design checks, oldest first (hub design-verify.ts). */
  const checksOf = (id: string) =>
    fleet.query<{ state: string }>(
      "SELECT state FROM design_checks WHERE task_id = ? ORDER BY created_at",
      id
    );
  /** The design proposals waiting on the person (hub design-system.ts). */
  const proposalsOpen = async () =>
    (await fleet.api<Ask[]>("/api/pending")).filter(
      (ask) => ask.payload.toolName === PROPOSAL
    );
  /** Your answer, as the dashboard's card sends it. */
  const answerAsk = async (requestId: string, result: object) => {
    const ask = (await proposalsOpen()).find(
      (one) => one.requestId === requestId
    );
    if (!ask) {
      throw new Error(`no design proposal ${requestId} is waiting`);
    }
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: ask.machineId,
      sessionId: ask.instanceId,
      payload: { requestId, args: [requestId, result] },
    });
  };
  /** Why T3 stalled, said whole (also kept as T3-stalled.json). */
  const t3Stalled = async (
    error: unknown,
    id: string,
    said: Record<string, string[]>
  ): Promise<Error> => {
    // What says why first: the builder's tool answers, its item's wait and
    // end, the hub's lines; the task as it stands last (the error is cut).
    const items = fleet.query<{
      error: string | null;
      id: string;
      parent_instance_id: string;
      state: string;
      wait_reason: string | null;
      wait_until: number | null;
    }>(
      "SELECT id, state, parent_instance_id, error, wait_until, wait_reason FROM work_items WHERE project_id = ? AND (task_id = ? OR parent_instance_id LIKE 'verifier:%') ORDER BY created_at",
      project.id,
      id
    );
    const report = {
      said: Object.fromEntries(
        Object.entries(said).map(([key, each]) => [
          key,
          each.map((one) => one.slice(0, 240)),
        ])
      ),
      items,
      heard: builderHeard.slice(-6).map((one) => one.slice(0, 200)),
      hub: (await fleet.logs("hub"))
        .split("\n")
        .filter(
          (line) =>
            line.includes("[design") ||
            line.includes(id) ||
            items.some((item) => line.includes(item.id.slice(0, 8)))
        )
        .slice(-16),
      checks: checksOf(id),
      verifiers: Object.fromEntries(
        verifierKeys.map((key) => [key, answers.get(key) ?? []])
      ),
      task: await read(id).catch(() => undefined),
    };
    await writeFile(join(kit.out, "T3-stalled.json"), json(report));
    return new Error(
      `${error instanceof Error ? error.message : String(error)}; ${JSON.stringify(report).slice(0, 4000)}`
    );
  };

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
  // The place's origin is the hub's remote of the project; its `main` is
  // read in the hub's own store (git-remote.ts: `<root>/<projectId>.git`),
  // as the spec holds no credential its HTTP asks for.
  const origin = (await Bun.$`git remote get-url origin`.cwd(repo).quiet())
    .text()
    .trim();
  const store = join(
    dirname(fleet.env.CAWCO_DB_PATH ?? ""),
    "git",
    `${project.id}.git`
  );
  const newest = (
    await Bun.$`git --git-dir ${store} log main -1 --format=%s`.quiet()
  )
    .text()
    .trim();
  kit.check(
    "3: Approve on the review goes, the task reads approved, and git log origin/main -1 names the builder's commit",
    approved.ok &&
      after.stage === "approved" &&
      origin === `${fleet.base}/git/${project.id}.git` &&
      newest === COMMIT,
    `${approved.status}; stage ${after.stage}; origin ${origin}; origin/main -1 “${newest}”`
  );

  // ── 4. A change to the system is a proposal: denied, then approved ────
  const t3 = await filed("T3", T3, "main");
  const t3Answers = () =>
    Object.fromEntries(
      [...answers]
        .filter(([key]) => key.startsWith(T3))
        .map(([key, said]) => [key, said.map((one) => one.slice(0, 400))])
    );
  const asks = await until(
    "T3's two design proposals in /api/pending",
    proposalsOpen,
    (waiting) => waiting.length === 2,
    400_000
  ).catch(async (error: unknown) => {
    throw await t3Stalled(error, t3, t3Answers());
  });
  // The person answers once the builder has handed its proposals over and
  // declared it waits for them, each answer a turn of its own: an answer
  // read mid-script is a race this check is not about.
  await until(
    "T3's builder waiting on its proposals",
    () =>
      fleet.query<{ wait_until: number | null }>(
        "SELECT wait_until FROM work_items WHERE project_id = ? AND task_id = ? ORDER BY created_at DESC",
        project.id,
        t3
      )[0]?.wait_until ?? null,
    (waitUntil) => waitUntil !== null,
    120_000
  ).catch(async (error: unknown) => {
    throw await t3Stalled(error, t3, t3Answers());
  });
  const builderT3 = builderOf(t3);
  const tree = workspaceOf(t3);
  const inkNow = async () =>
    (await Bun.file(join(tree, "design/tokens.json")).json()) as {
      color: { ink: { $value: { components: number[] } } };
    };
  const inkLightness = async () =>
    (await inkNow()).color.ink.$value.components[0];
  const byWhy = (why: string) =>
    asks.find((ask) => ask.payload.input.why === why);
  const denied = byWhy(WHY_DENIED);
  const allowed = byWhy(WHY_APPROVED);
  const drawn = (ask: Ask | undefined) =>
    (ask?.payload.presentation?.changes ?? []).map((change) => change.path);
  const before = await inkLightness();
  kit.check(
    "4a: the builder's two token changes are asks in /api/pending, each drawn as design/tokens.json's diff, and its workspace's tokens.json is unchanged",
    Boolean(denied && allowed) &&
      drawn(denied).includes("design/tokens.json") &&
      drawn(allowed).includes("design/tokens.json") &&
      before === 0.264,
    `asks ${asks.map((ask) => `${ask.requestId} ${drawn(ask).join("+")}`).join(", ")}; ink ${before}`
  );
  await answerAsk(denied?.requestId ?? "", {
    behavior: "deny",
    message: "Too dark",
  });
  await until(
    "the builder told its first proposal was declined",
    () =>
      builderHeard.filter((said) =>
        said.includes("declined your design proposal")
      ),
    (heard) => heard.length > 0,
    60_000
  ).catch(async (error: unknown) => {
    throw await t3Stalled(error, t3, t3Answers());
  });
  const afterDeny = await inkLightness();
  kit.check(
    "4b: Deny leaves design/ as it was and tells the builder",
    afterDeny === before &&
      !(await proposalsOpen()).some(
        (ask) => ask.requestId === denied?.requestId
      ),
    `ink ${afterDeny}; told “${builderHeard.find((said) => said.includes("declined your design proposal"))?.slice(0, 200)}”`
  );
  await answerAsk(allowed?.requestId ?? "", { behavior: "allow" });
  await until(
    "the builder told its second proposal was approved",
    () =>
      builderHeard.filter((said) =>
        said.includes("approved your design proposal")
      ),
    (heard) => heard.length > 0,
    60_000
  ).catch(async (error: unknown) => {
    // Its hub lines say why an approve was not written ([design] …).
    throw await t3Stalled(error, t3, t3Answers());
  });
  const afterAllow = await inkLightness();
  const subject = (
    await Bun.$`git log -1 --format=%s -- design/tokens.json`.cwd(tree).quiet()
  )
    .text()
    .trim();
  const designDirty = (
    await Bun.$`git status --porcelain -- design`.cwd(tree).quiet()
  )
    .text()
    .trim();
  kit.check(
    "4c: Approve writes the change through design_write, commits it in the builder's workspace with its why, and tells the builder",
    afterAllow === INK_APPROVED &&
      subject === `design: ${WHY_APPROVED}` &&
      designDirty === "",
    `ink ${afterAllow}; last design commit “${subject}”; design/ uncommitted “${designDirty}”`
  );

  // ── 5. A hand-in is checked first: one finding, tied, as one message ───
  const roundOne = await until(
    "T3's first design check with its verdict",
    () => checksOf(t3),
    (rows) => rows.some((row) => row.state === "findings"),
    400_000
  ).catch(async (error: unknown) => {
    throw await t3Stalled(error, t3, t3Answers());
  });
  const verifiers = fleet.query<{ parent_instance_id: string }>(
    "SELECT parent_instance_id FROM work_items WHERE id IN (SELECT verifier_item_id FROM design_checks WHERE task_id = ?)",
    t3
  );
  const findingsSent = () =>
    fleet.query<{ id: string }>(
      "SELECT uuid AS id FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
      builderT3,
      `%${FINDING_WORDS}%`
    );
  await until(
    "the findings' delivery",
    findingsSent,
    (rows) => rows.length > 0,
    90_000
  );
  const midway = await read(t3);
  const handed = (answers.get(verifierKeys[0] ?? "") ?? []).join(" ");
  kit.check(
    "5: the uncommitted hand-in stays in working, its verifier (parent verifier:<item>) gets it as a patch, and its tied finding reaches the builder as one message",
    midway.stage === "working" &&
      roundOne.length === 1 &&
      verifiers.every((row) =>
        row.parent_instance_id.startsWith("verifier:")
      ) &&
      verifiers.length === 1 &&
      handed.includes("PATCH-HANDED") &&
      findingsSent().length === 1,
    `stage ${midway.stage}; rounds ${roundOne.map((row) => row.state).join(", ")}; verifier parents ${verifiers.map((row) => row.parent_instance_id.slice(0, 18)).join(", ")}; verifier saw “${handed.slice(0, 120)}”; ${findingsSent().length} findings message(s)`
  );

  // ── 6. The fix is checked again, passes, lands, and waits in review ────
  const landed = await until(
    `${t3} in review`,
    () => read(t3),
    (now) => now.stage === "review",
    400_000
  ).catch(async (error: unknown) => {
    throw await t3Stalled(error, t3, t3Answers());
  });
  const rounds = checksOf(t3).map((row) => row.state);
  kit.check(
    "6: the fixed hand-in is checked again, passes, lands, and its task waits in review",
    landed.stage === "review" && rounds.join(",") === "findings,passed",
    `stage ${landed.stage}; rounds ${rounds.join(", ")}`
  );
};

export default { name: "design-approve", run } satisfies Spec;
