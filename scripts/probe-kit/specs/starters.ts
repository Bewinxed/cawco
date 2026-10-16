/**
 * A project's starters, written for it by Jev from what it holds now (hub
 * project-starters.ts, jev-placement.ts `jevStarters`), on a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model; Jev a
 * stand-in on `CAWCO_TYPESAFE_URL`, probe-kit jev-mock.ts) in the built
 * dashboard, read from the hub's answers, the stand-in's requests, the
 * hub's log and the engine, one run each:
 *
 * d. Jev off: a new project gets no starters (served or on its board), and
 *    the hub logs `[jev off] Starters project=<id>: none offered, Jev is off`.
 * a. A project with a task gets starters whose reasons and sources cite that
 *    task, in the order Jev's probabilities give; Caw's panel hero shows
 *    them in the hub's order. An empty project's board shows its own set
 *    (its commit, its notes, design/ missing) in the hub's order, laid out
 *    in the recipe's columns for however many there are.
 * c. An answer about a task not in the inputs never reaches the hub's set
 *    or the page, and the hub says it dropped it; an ask below the
 *    confidence gate is not offered.
 * b. Moving the task asks Jev once after the quiet; moving it away and
 *    back inside the quiet asks nothing (the inputs hash as before).
 * e. A press opens Caw's panel with its words in his composer, focused,
 *    the caret at the end, sending nothing; another press replaces them.
 *    Send as it stands records `picked`; a press, an edit and Send records
 *    `edited`.
 * f. Every input the stand-in received is within its stated bound, on a
 *    project with more of everything than the bounds let through.
 * g. The empty Routines page's starters come from what the project repeats
 *    or waits on (a task kind filed often, an event source no routine
 *    takes), every source in the inputs; the page shows them in the hub's
 *    order; an answer about a kind no input holds never reaches them.
 * h. The empty Decisions tab's starters come from the project's open
 *    choices (a task waiting on your pick, a draft view), every source in
 *    the inputs; the tab shows them in the hub's order; an answer about a
 *    task no input holds never reaches them.
 * i. One change asks Jev once for every place: one call, and the three
 *    places' sets written over the same inputs at the same moment.
 * j. Jev off: no routine or decision starters, served or on the page.
 *
 *   bun scripts/probe-kit/run.ts starters
 */
// biome-ignore-all lint/performance/noAwaitInLoops: a few files, tasks and threads, made one after another
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: one scenario, read in order, one check after another.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type JevCall, jevMock, jevOn, type StarterPick } from "../jev-mock";
import { COMPOSER_FIELD, type Kit, open, type Spec, settle } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

/** The scratch hub's pace: 1.5 s of quiet, 5 s between asks (production: 60 s, 10 min). */
const QUIET_MS = 1500;
const GAP_MS = 5000;

/** The bounds the hub states (jev-placement.ts `STARTER_BOUNDS`), as the stand-in checks them. */
const BOUNDS = {
  agents: 1500,
  knowledge: 20,
  path: 160,
  tasks: 12,
  title: 160,
  threads: 5,
  line: 200,
  commits: 5,
  subject: 120,
  failures: 5,
  failure: 200,
  recentKinds: 5,
  unrouted: 5,
  drafts: 5,
  routines: 10,
  shown: 10,
};

/** Answers about things the inputs never hold, one per place: the stand-in gives them anyway. */
const GHOSTS: Record<string, StarterPick> = {
  "board/task:tsk-999": { choice: "start", p: 0.99 },
  "routines/kind:ghost": { choice: "triage", p: 0.99 },
  "decisions/pick:tsk-999": { choice: "page", p: 0.99 },
};

/**
 * The stand-in's starters answers: each question's first ask, at a
 * probability by what it is about (`<place>/<kind>:<ref>`), so the hub's
 * order is Jev's; a thread's under the confidence gate in every place; and
 * the {@link GHOSTS}.
 */
const PICKED: Record<string, number> = {
  task: 0.92,
  design: 0.9,
  project: 0.85,
  routine: 0.8,
  commit: 0.7,
  thread: 0.4,
  kind: 0.9,
  check: 0.85,
  event: 0.8,
  pick: 0.9,
  view: 0.85,
};
/** `routines/event:github:acme/site issue.opened` → `event`. */
const kindOf = (id: string) =>
  id.slice(id.indexOf("/") + 1).split(":")[0] as string;
const picks = (call: JevCall): Record<string, StarterPick> => ({
  ...Object.fromEntries(
    Object.entries(call.questions).map(([id, asked]) => [
      id,
      {
        choice:
          Object.keys((asked.criteria ?? {}) as Record<string, unknown>).find(
            (option) => option !== "none"
          ) ?? "none",
        p: PICKED[kindOf(id)] ?? 0.9,
      },
    ])
  ),
  ...GHOSTS,
});

interface Served {
  glyph: string;
  reason: string;
  sources: { kind: string; ref: string }[];
  text: string;
}

/** The empty board's starter cards (StarterCards under Caw at 80). */
const STARTERS = ".caw-empty .starter";
/** Caw's floating panel (CawThread), its hero's chips, and its Composer's field and Send. */
const PANEL = "[data-caw-panel]";
const CHIPS = `${PANEL} .caw-starters .kit-chip`;
const FIELD = `${PANEL} ${COMPOSER_FIELD}[aria-label="Message the project"]`;
const SEND = `${PANEL} button[aria-label="Send message"]`;
const SEAT = ".project-head button.caw-seat";

interface Layout {
  columns: number;
  /**
   * The columns the recipe gives at the grid's width: one under 30rem, else
   * as many --c-starter-w columns and their gaps as fit, four at most.
   */
  fits: number;
  /** Every card's height, rounded to a tenth of a px. */
  heights: number[];
  rows: number;
  texts: string[];
  /** The grid's width, px. */
  width: number;
}

const layout = (page: Page): Promise<Layout> =>
  page.evaluate((starters) => {
    const cards = [...document.querySelectorAll<HTMLElement>(starters)];
    const boxes = cards.map((card) => card.getBoundingClientRect());
    const round = (n: number) => Math.round(n * 10) / 10;
    const grid = document.querySelector(".caw-empty .starter-cards .cards");
    const width = grid?.getBoundingClientRect().width ?? 0;
    const rem = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    const min =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--c-starter-w"
        )
      ) * rem;
    const gap = grid ? Number.parseFloat(getComputedStyle(grid).columnGap) : 0;
    return {
      width: round(width),
      fits:
        width < 30 * rem
          ? 1
          : Math.min(cards.length, Math.floor((width + gap) / (min + gap))),
      columns: new Set(boxes.map((box) => round(box.left))).size,
      rows: new Set(boxes.map((box) => round(box.top))).size,
      heights: boxes.map((box) => round(box.height)),
      texts: cards.map(
        (card) => card.querySelector(".starter-text")?.textContent?.trim() ?? ""
      ),
    };
  }, STARTERS);

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((each, i) => each === b[i]);

/** What in one call's state passes its bound, in words; empty when all is within. */
const overBounds = (call: JevCall): string[] => {
  const state = call.state as {
    agents_md: string;
    drafts: string[];
    failures: { name: string; reason: string }[];
    knowledge: string[];
    recent_kinds: Record<string, { tasks: string[] }>;
    repository: { commits: { subject: string }[] };
    routines: string[];
    shown: { text: string }[];
    unrouted: { kind: string; source: string }[];
    tasks: Record<string, { last_attempt_failed?: string; title: string }>;
    threads: Record<string, { last_line: string; title: string }>;
  };
  const over: string[] = [];
  const most = (what: string, n: number, max: number) => {
    if (n > max) {
      over.push(`${what} ${n} > ${max}`);
    }
  };
  most("agents_md chars", state.agents_md.length, BOUNDS.agents);
  most("knowledge files", state.knowledge.length, BOUNDS.knowledge);
  for (const path of state.knowledge) {
    most("a knowledge path", path.length, BOUNDS.path);
  }
  const tasks = Object.values(state.tasks);
  most("tasks", tasks.length, BOUNDS.tasks);
  for (const task of tasks) {
    most("a task title", task.title.length, BOUNDS.title);
    most(
      "a task's failure",
      task.last_attempt_failed?.length ?? 0,
      BOUNDS.failure
    );
  }
  const threads = Object.values(state.threads);
  most("threads", threads.length, BOUNDS.threads);
  for (const thread of threads) {
    most("a thread title", thread.title.length, BOUNDS.title);
    most("a thread's last line", thread.last_line.length, BOUNDS.line);
  }
  most("commits", state.repository.commits.length, BOUNDS.commits);
  for (const commit of state.repository.commits) {
    most("a commit subject", commit.subject.length, BOUNDS.subject);
  }
  most("failures", state.failures.length, BOUNDS.failures);
  for (const failure of state.failures) {
    most("a failure's reason", failure.reason.length, BOUNDS.failure);
  }
  most(
    "recent kinds",
    Object.keys(state.recent_kinds).length,
    BOUNDS.recentKinds
  );
  most("unrouted sources", state.unrouted.length, BOUNDS.unrouted);
  most("drafts", state.drafts.length, BOUNDS.drafts);
  for (const path of state.drafts) {
    most("a draft path", path.length, BOUNDS.path);
  }
  most("routines", state.routines.length, BOUNDS.routines);
  most("shown", state.shown.length, BOUNDS.shown);
  return over;
};

const run = async (kit: Kit) => {
  const jev = jevMock(picks);
  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_TYPESAFE_URL = jev.url;
  fleet.env.CAWCO_STARTERS_PACE = `${QUIET_MS}/${GAP_MS}`;
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
  const git = (src: string) => (command: string) =>
    Bun.$`sh -c ${command}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
  /** A project of its own checkout, made from `template`. */
  const project = async (
    name: string,
    template: string,
    caw: boolean,
    commits: string[] = ["First commit"]
  ) => {
    const src = join(fleet.sandbox, name);
    await mkdir(src, { recursive: true });
    const sh = git(src);
    await sh("git init -q -b main");
    for (const [i, subject] of commits.entries()) {
      await sh(
        `echo ${i} > f${i}.txt && git add -A && git commit -qm ${JSON.stringify(subject)}`
      );
    }
    return fleet.api<{ id: string; name: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd: src,
      caw,
      template,
    });
  };
  /** Every place's starters, as the project's stages carry them. */
  const servedAll = (id: string) =>
    fleet.api<{
      decisionStarters: Served[];
      routineStarters: Served[];
      starters: Served[];
    }>(`/api/projects/${id}/stages`);
  const served = async (id: string) => (await servedAll(id)).starters;
  /** The chips an empty tab of the project page shows (`?view=`), in order. */
  const tabChips = async (id: string, view: string, selector: string) => {
    await open(desk, `${base}/project/${id}?view=${view}`, ".kit-empty-title");
    await settle(desk);
    return desk
      .locator(selector)
      .evaluateAll((all) => all.map((chip) => chip.textContent?.trim() ?? ""));
  };
  const ROUTINE_CHIPS = ".routine-starters .kit-chip";
  const DECISION_CHIPS = ".caw-empty .caw-starters .kit-chip";
  /** The project's starters once the hub has written a set with some in it. */
  const written = (id: string) =>
    until(
      `the hub's starters for ${id}`,
      () => served(id),
      (set) => set.length > 0,
      60_000
    );
  const hubLog = () => fleet.logs("hub");
  const base = await fleet.dashboard();
  const desk = await kit.page("desk");
  desk.setDefaultTimeout(60_000);

  // ── d. Jev off: none anywhere, and the line ─────────────────────────────
  const quiet = await project("quiet", "social", true);
  const offLine = `[jev off] Starters project=${quiet.id}: none offered, Jev is off`;
  const said = await until(
    "the Jev-off line",
    hubLog,
    (text) => text.includes(offLine),
    30_000
  ).catch(() => "");
  await open(desk, `${base}/project/${quiet.id}`, ".caw-empty");
  await settle(desk);
  const quietCards = await desk.locator(STARTERS).count();
  kit.check(
    "d: Jev off, a new project gets no starters, served or on its board, and the hub logs the Jev-off line",
    said.includes(offLine) &&
      (await served(quiet.id)).length === 0 &&
      quietCards === 0 &&
      jev.starterCalls().length === 0,
    `line ${said.includes(offLine)}; served ${(await served(quiet.id)).length}; cards ${quietCards}; Jev starters calls ${jev.starterCalls().length}`
  );

  // ── j. Jev off: no routine or decision starters either ─────────────────
  const quietAll = await servedAll(quiet.id);
  const quietRoutineChips = await tabChips(quiet.id, "routines", ROUTINE_CHIPS);
  await desk.screenshot({ path: join(kit.out, "quiet-routines.png") });
  const quietDecisionChips = await tabChips(
    quiet.id,
    "decisions",
    DECISION_CHIPS
  );
  await desk.screenshot({ path: join(kit.out, "quiet-decisions.png") });
  kit.check(
    "j: Jev off, no routine or decision starters: none served, none on the Routines page or the Decisions tab",
    quietAll.routineStarters.length === 0 &&
      quietAll.decisionStarters.length === 0 &&
      quietRoutineChips.length === 0 &&
      quietDecisionChips.length === 0,
    `served routines ${quietAll.routineStarters.length}, decisions ${quietAll.decisionStarters.length}; chips routines ${quietRoutineChips.length}, decisions ${quietDecisionChips.length}`
  );

  await jevOn(fleet.base);

  // ── a. a project with a task: its reasons cite the task ────────────────
  const harbour = await project("harbour", "code", false);
  const task = await fleet.api<{ id: string; stage: string }>(
    `/api/projects/${harbour.id}/tasks`,
    { title: "Ship the onboarding emails" }
  );
  const harbourSet = await written(harbour.id);
  const [lead] = harbourSet;
  const harbourCalls = jev.starterCalls("harbour");
  const order = harbourSet.map((starter) => starter.sources[0]?.kind ?? "");
  kit.check(
    "a: a project with a task gets starters whose reasons and sources cite that task, in Jev's order (task, then commit)",
    lead?.reason.includes(task.id) === true &&
      lead.sources.some(
        (source) => source.kind === "task" && source.ref === task.id
      ) &&
      same(order, ["task", "commit"]),
    harbourSet
      .map(
        (s) =>
          `“${s.text}” (${s.glyph}) — ${s.reason} [${s.sources.map((x) => `${x.kind}:${x.ref}`).join(", ")}]`
      )
      .join(" | ")
  );

  // The panel's hero: the head's Caw opens his panel on an empty thread.
  await open(desk, `${base}/project/${harbour.id}`, SEAT);
  await settle(desk, 400);
  await desk.click(SEAT);
  const chips = await desk
    .waitForSelector(CHIPS, { timeout: 30_000 })
    .then(() =>
      desk
        .locator(CHIPS)
        .evaluateAll((all) => all.map((chip) => chip.textContent?.trim() ?? ""))
    )
    .catch(() => [] as string[]);
  await desk.screenshot({ path: join(kit.out, "harbour-hero.png") });
  kit.check(
    "a: Caw's panel hero shows the project's starters in the hub's order",
    same(
      chips,
      harbourSet.map((starter) => starter.text)
    ),
    `chips ${chips.join(" | ")}`
  );
  await desk.keyboard.press("Escape");

  // ── c. a source not in the inputs never reaches the page ───────────────
  const page = await desk.evaluate(() => document.body.innerText);
  const log = await hubLog();
  kit.check(
    "c: an answer about a task not in the inputs is dropped: not served, not on the page, and the hub says so",
    harbourCalls.length > 0 &&
      !harbourSet.some((starter) =>
        starter.sources.some((source) => source.ref === "tsk-999")
      ) &&
      !page.includes("tsk-999") &&
      new RegExp(
        `\\[starters\\] project=${harbour.id} trigger=[^:]+: wrote board ${harbourSet.length}, routines \\d+, decisions \\d+; dropped ${Object.keys(GHOSTS).length} not grounded in the inputs`
      ).test(log),
    `${harbourCalls.length} call(s); served sources ${harbourSet.flatMap((s) => s.sources.map((x) => x.ref)).join(", ")}; “tsk-999” on the page ${page.includes("tsk-999")}`
  );

  // ── b. a move asks once after the quiet; an unchanged project asks nothing ─
  const before = jev.starterCalls("harbour").length;
  await fleet.api(`/api/projects/${harbour.id}/tasks/${task.id}/stage`, {
    stage: "review",
  });
  await until(
    "Jev asked again after the move",
    async () => jev.starterCalls("harbour").length,
    (n) => n > before,
    30_000
  ).catch(() => 0);
  const askedAt = jev.starterCalls("harbour").at(-1)?.at ?? 0;
  // Long enough for a second ask the quiet and the gap would allow.
  await Bun.sleep(QUIET_MS + GAP_MS + 2000);
  const afterMove = jev.starterCalls("harbour").length;
  const moved = await served(harbour.id);
  kit.check(
    "b: moving the task asks Jev once, after the quiet; the new set names its new stage",
    afterMove === before + 1 &&
      moved.some((starter) => starter.reason.includes("review")),
    `calls ${before} → ${afterMove}; set ${moved.map((s) => `“${s.text}” — ${s.reason}`).join(" | ")}`
  );
  // Away and back inside the quiet: what the project holds is what it was asked over.
  await fleet.api(`/api/projects/${harbour.id}/tasks/${task.id}/stage`, {
    stage: "ready",
  });
  await fleet.api(`/api/projects/${harbour.id}/tasks/${task.id}/stage`, {
    stage: "review",
  });
  const unchanged = `[starters] project=${harbour.id} trigger=task moved: unchanged since`;
  const heard = await until(
    "the hub's unchanged line",
    hubLog,
    (text) => text.includes(unchanged),
    30_000
  ).catch(() => "");
  kit.check(
    "b: an unchanged project asks nothing: the hub hashes the same inputs and says so",
    heard.includes(unchanged) &&
      jev.starterCalls("harbour").length === afterMove,
    `unchanged line ${heard.includes(unchanged)}; calls ${afterMove} → ${jev.starterCalls("harbour").length}; last asked ${new Date(askedAt).toISOString()}`
  );

  // ── a. an empty project's board: its own set, in the hub's order ───────
  const wren = await project("wren", "design", true);
  const wrenSet = await written(wren.id);
  await open(desk, `${base}/project/${wren.id}`, STARTERS);
  await settle(desk);
  const wrenTexts = wrenSet.map((starter) => starter.text);
  const shots: [number, Layout][] = [];
  for (const width of [390, 768, 1440]) {
    await desk.setViewportSize({ width, height: 900 });
    await settle(desk);
    await desk.screenshot({ path: join(kit.out, `wren-${width}.png`) });
    shots.push([width, await layout(desk)]);
  }
  for (const [width, read] of shots) {
    kit.check(
      `a: at ${width}, an empty project's board shows its own starters in the hub's order, in the recipe's columns, equal heights ≥ 56px`,
      same(read.texts, wrenTexts) &&
        read.columns === read.fits &&
        read.rows === Math.ceil(read.texts.length / read.columns) &&
        new Set(read.heights).size === 1 &&
        (read.heights[0] ?? 0) >= 56,
      `${read.texts.join(" | ")}; grid ${read.width}px fits ${read.fits}: ${read.columns} col × ${read.rows} rows; heights ${read.heights.join(", ")}`
    );
  }
  kit.check(
    "a: the empty project's starters carry their reasons: design/ missing, its notes, its commit; a thread under the confidence gate is not offered",
    wrenSet.some(
      (s) => s.glyph === "system" && s.reason.startsWith("No design/ yet")
    ) &&
      wrenSet.some((s) => s.sources.some((x) => x.kind === "commit")) &&
      !wrenSet.some((s) => s.sources.some((x) => x.kind === "thread")),
    wrenSet
      .map(
        (s) =>
          `“${s.text}” — ${s.reason} [${s.sources.map((x) => `${x.kind}:${x.ref}`).join(", ")}]`
      )
      .join(" | ")
  );

  // ── e. press, Send as it stands: picked; press, edit, Send: edited ─────
  const threadCount = async () =>
    (await fleet.api<{ id: string }[]>(`/api/projects/${wren.id}/threads`))
      .length;
  const threadsBefore = await threadCount();
  /** The panel Composer's field: its words, focus, and a caret (Selection) collapsed at its end. */
  const readField = (selector: string) => {
    const field = document.querySelector<HTMLElement>(selector);
    const active = document.activeElement;
    const selection = getSelection();
    let caret = false;
    if (field && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const head = document.createRange();
      head.selectNodeContents(field);
      head.setEnd(range.endContainer, range.endOffset);
      caret =
        range.collapsed &&
        field.contains(range.endContainer) &&
        head.toString() === (field.textContent ?? "");
    }
    return {
      value: field?.textContent ?? "",
      focused: field !== null && active === field,
      caret,
    };
  };
  const pressedRead = (words: string) =>
    until(
      `the field settled on “${words}”`,
      () => desk.evaluate(readField, FIELD),
      (seen) => seen.value === words && seen.focused && seen.caret,
      5000
    ).catch(() => desk.evaluate(readField, FIELD));
  const [firstText, secondText] = wrenTexts as [string, string];
  await desk.locator(STARTERS, { hasText: secondText }).click();
  const first = await pressedRead(secondText);
  await desk.locator(STARTERS, { hasText: firstText }).click();
  const filled = await pressedRead(firstText);
  // Long enough for a send the press must not have made to reach the hub.
  await desk.waitForTimeout(1500);
  const unsent = (await threadCount()) === threadsBefore;
  kit.check(
    "e: a press opens Caw's panel with its sentence in the Composer, focused, caret at the end, and sends nothing; another press replaces it",
    first.value === secondText &&
      filled.value === firstText &&
      filled.focused &&
      filled.caret &&
      unsent,
    `first “${first.value}”; then “${filled.value}”, focused ${filled.focused}, caret at end ${filled.caret}; threads unchanged ${unsent}`
  );
  const told = (outcome: string) =>
    desk.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/projects/${wren.id}/starters/outcome`) &&
        (response.request().postDataJSON() as { outcome?: string }).outcome ===
          outcome,
      { timeout: 30_000 }
    );
  const pickedTold = told("picked");
  await desk.click(SEND);
  const pickedAnswer = await pickedTold.catch(() => null);
  // Caw answers in the new thread; the set is written again after it.
  await until(
    "the set written after Caw's answer",
    async () =>
      jev
        .starterCalls("wren")
        .some((call) => Object.keys(call.state.threads as object).length > 1),
    Boolean,
    60_000
  ).catch(() => false);
  await Bun.sleep(QUIET_MS + 1000);
  const nowSet = (await served(wren.id)).map((starter) => starter.text);
  const editWith = nowSet.find((text) => text !== firstText) ?? nowSet[0];
  await desk.locator(STARTERS, { hasText: editWith }).click();
  await pressedRead(editWith ?? "");
  await desk.keyboard.type(" first");
  const editedTold = told("edited");
  await desk.click(SEND);
  const editedAnswer = await editedTold.catch(() => null);
  await Bun.sleep(500);
  const rows = fleet.query<{ outcome: string; text: string }>(
    "SELECT text, outcome FROM starter_outcomes WHERE project_id = ? AND outcome != 'ignored' ORDER BY id",
    wren.id
  );
  kit.check(
    "e: Send as it stands records picked; a press, an edit and Send records edited",
    pickedAnswer?.status() === 200 &&
      editedAnswer?.status() === 200 &&
      rows.some((row) => row.text === firstText && row.outcome === "picked") &&
      rows.some((row) => row.text === editWith && row.outcome === "edited"),
    `picked ${pickedAnswer?.status()}, edited ${editedAnswer?.status()}; rows ${rows.map((row) => `${row.outcome} “${row.text}”`).join(" | ")}`
  );

  // ── g. the Routines page: what the project repeats or waits on ─────────
  const ledger = await project("ledger", "code", false);
  const SOURCE = "github:acme/site";
  // Two issues the project's poll brought in, routed nowhere (stored as
  // ingress.ts stores one with no route and the lead off).
  for (const n of [1, 2]) {
    fleet.write(
      "INSERT INTO inbound_events (id, source, delivery_key, kind, project_id, payload, received_at, via, routed_to, route_id, handled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)",
      crypto.randomUUID(),
      SOURCE,
      `issue:${n}:opened`,
      "issue.opened",
      ledger.id,
      "{}",
      Date.now(),
      "poll"
    );
  }
  const bugs: string[] = [];
  for (const what of ["login", "export", "upload"]) {
    const filed = await fleet.api<{ id: string }>(
      `/api/projects/${ledger.id}/tasks`,
      { title: `Fix the ${what} crash`, labels: ["bug"] }
    );
    bugs.push(filed.id);
  }
  const routineSet = await until(
    "ledger's routine starters",
    async () => (await servedAll(ledger.id)).routineStarters,
    (set) => set.length > 0,
    60_000
  ).catch(() => [] as Served[]);
  const routineRefs = new Set([
    ...bugs.map((id) => `task:${id}`),
    `event:${SOURCE} issue.opened`,
  ]);
  const routineTexts = routineSet.map((starter) => starter.text);
  const routineChips = await tabChips(ledger.id, "routines", ROUTINE_CHIPS);
  await desk.screenshot({ path: join(kit.out, "ledger-routines.png") });
  const described = (set: Served[]) =>
    set
      .map(
        (s) =>
          `“${s.text}” — ${s.reason} [${s.sources.map((x) => `${x.kind}:${x.ref}`).join(", ")}]`
      )
      .join(" | ");
  kit.check(
    "g: the Routines page's starters come from a task kind filed often and an event source no routine takes, every source in the inputs, none about a kind no input holds",
    routineSet.length > 0 &&
      routineSet.every((starter) =>
        starter.sources.every((source) =>
          routineRefs.has(`${source.kind}:${source.ref}`)
        )
      ) &&
      routineTexts.includes(
        "Every Monday, triage the week's new “bug” tasks"
      ) &&
      routineTexts.includes(
        "When an issue opens on acme/site, triage it into a task"
      ) &&
      !routineTexts.some((text) => text.includes("ghost")),
    described(routineSet)
  );
  kit.check(
    "g: the empty Routines page shows them in the hub's order",
    same(routineChips, routineTexts),
    `chips ${routineChips.join(" | ")}`
  );

  // ── h. the Decisions tab: the project's open choices ───────────────────
  const drafted = await fetch(
    `${fleet.base}/api/projects/${ledger.id}/folder/file`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "views/drafts/pricing.oui",
        content: 'root = Stack([TextContent("Pricing")])\n',
      }),
    }
  );
  const [waiting] = bugs as [string];
  const callsBefore = jev.starterCalls("ledger").length;
  await fleet.api(`/api/projects/${ledger.id}/tasks/${waiting}/stage`, {
    stage: "review",
  });
  await until(
    "ledger's set after the move",
    async () => jev.starterCalls("ledger").length,
    (n) => n > callsBefore,
    30_000
  ).catch(() => 0);
  // Long enough for a second ask the quiet and the gap would allow.
  await Bun.sleep(QUIET_MS + GAP_MS + 2000);
  const callsAfter = jev.starterCalls("ledger").length;
  const decisionSet = (await servedAll(ledger.id)).decisionStarters;
  const decisionRefs = new Set([
    `task:${waiting}`,
    "path:views/drafts/pricing.oui",
  ]);
  const decisionTexts = decisionSet.map((starter) => starter.text);
  const decisionChips = await tabChips(ledger.id, "decisions", DECISION_CHIPS);
  await desk.screenshot({ path: join(kit.out, "ledger-decisions.png") });
  kit.check(
    "h: the Decisions tab's starters come from a task waiting on your pick and a draft view, every source in the inputs, none about a task no input holds",
    drafted.ok &&
      decisionSet.length > 0 &&
      decisionSet.every((starter) =>
        starter.sources.every((source) =>
          decisionRefs.has(`${source.kind}:${source.ref}`)
        )
      ) &&
      decisionTexts.includes(
        "Write a decision page for “Fix the login crash”"
      ) &&
      decisionTexts.includes("Help me decide on the “pricing” draft view") &&
      !decisionSet.some((starter) =>
        starter.sources.some((source) => source.ref === "tsk-999")
      ),
    `draft written ${drafted.status}; ${described(decisionSet)}`
  );
  kit.check(
    "h: the empty Decisions tab shows them in the hub's order",
    same(decisionChips, decisionTexts),
    `chips ${decisionChips.join(" | ")}`
  );

  // ── i. one change, one ask, every place written from it ────────────────
  const sets = fleet.query<{
    generated_at: number;
    input_hash: string;
    place: string;
  }>(
    "SELECT place, generated_at, input_hash FROM project_starter_sets WHERE project_id = ? ORDER BY place",
    ledger.id
  );
  kit.check(
    "i: one change asks Jev once for every place: one call, and the board's, the routines' and the decisions' sets written over the same inputs in one write (one generated_at)",
    callsAfter === callsBefore + 1 &&
      sets.length === 3 &&
      new Set(sets.map((set) => set.input_hash)).size === 1 &&
      new Set(sets.map((set) => set.generated_at)).size === 1,
    `calls ${callsBefore} → ${callsAfter}; sets ${sets.map((set) => `${set.place} ${set.input_hash.slice(0, 8)} @${set.generated_at}`).join(", ")}`
  );

  // ── f. every input within its bound ─────────────────────────────────────
  const crowd = await project(
    "crowd",
    "code",
    false,
    Array.from({ length: 7 }, (_, i) => `Commit ${i} ${"x".repeat(150)}`)
  );
  const put = (path: string, content: string) =>
    fetch(`${fleet.base}/api/projects/${crowd.id}/folder/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, content }),
    });
  await put("AGENTS.md", `# Crowd\n\n${"What this is for. ".repeat(200)}`);
  for (let i = 0; i < 22; i += 1) {
    await put(`knowledge/${"n".repeat(170)}-${i}.md`, `Note ${i}`);
  }
  const crowdTasks: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    const filed = await fleet.api<{ id: string }>(
      `/api/projects/${crowd.id}/tasks`,
      // The hub takes titles up to 200; the starters read 160 of one.
      { title: `Task ${i} ${"t".repeat(i === 0 ? 185 : 10)}` }
    );
    crowdTasks.push(filed.id);
  }
  for (let i = 0; i < 6; i += 1) {
    await fleet.api(`/api/projects/${crowd.id}/threads`, {
      body: `Thread ${i}: ${"w".repeat(400)}`,
    });
  }
  await until(
    "crowd's first set",
    async () => jev.starterCalls("crowd").length,
    (n) => n > 0,
    60_000
  ).catch(() => 0);
  /** A crowd call that read the most starters shown before it, once one has. */
  const full = () =>
    jev
      .starterCalls("crowd")
      .find((call) => (call.state.shown as unknown[]).length >= BOUNDS.shown);
  // Each set replaced unpressed adds its starters as `ignored`: a few moves,
  // and a set reads more than ten shown before it.
  for (let i = 1; i <= 6 && !full(); i += 1) {
    const calls = jev.starterCalls("crowd").length;
    await fleet.api(`/api/projects/${crowd.id}/tasks/${crowdTasks[i]}/stage`, {
      stage: "review",
    });
    await until(
      `crowd's set after move ${i}`,
      async () => jev.starterCalls("crowd").length,
      (n) => n > calls,
      60_000
    ).catch(() => 0);
  }
  const lastCrowd = full()?.state as
    { shown: unknown[]; tasks: object; threads: object } | undefined;
  const over = jev.starterCalls().flatMap((call) => overBounds(call));
  kit.check(
    "f: every input the stand-in received is within its stated bound, on a project with more of everything",
    jev.starterCalls().length > 0 &&
      over.length === 0 &&
      lastCrowd !== undefined &&
      Object.keys(lastCrowd.tasks).length === BOUNDS.tasks &&
      Object.keys(lastCrowd.threads).length === BOUNDS.threads &&
      lastCrowd.shown.length === BOUNDS.shown,
    `${jev.starterCalls().length} starters calls; over: ${over.join("; ") || "none"}; crowd's last: ${lastCrowd ? `${Object.keys(lastCrowd.tasks).length} tasks, ${Object.keys(lastCrowd.threads).length} threads, ${lastCrowd.shown.length} shown` : "none"}`
  );
  jev.stop();
};

export default { name: "starters", run } satisfies Spec;
