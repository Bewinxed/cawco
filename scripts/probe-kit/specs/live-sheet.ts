/**
 * Live components (D29, `2026-10-16-live-components.md`): a sheet is a CSF 3
 * story file beside the real component, and the workspace's stage (the
 * project's own Vite, run by the daemon inside the workspace's boundary)
 * mounts every story. On a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model) with boundaries, and the built
 * dashboard at the desk: run it where a workspace boundary can start (not
 * inside another one).
 *
 * A delegate works in a workspace cut from this checkout. It installs the
 * repository, then calls `artifact_create({ kind: "sheet", file:
 * "apps/dashboard/src/lib/cawco/turn/Who.stories.ts" })`, the real
 * Who.svelte's three stories. Read from the engine (computed values, the
 * overlay's doc, the agent's own lines), never a picture:
 *
 * 1. The stage starts: the create answers the three stories at their
 *    exports, and the pane's page renders three frames (Agent, You,
 *    Grouped), each a real Who, in the dashboard's own tokens: the agent's
 *    mark is `--brand-solid`, the name `--ink-strong`, the body Figtree.
 * 2. An edit to Who.svelte (in the workspace's clone) redraws both frames
 *    that show a name, with no reload of the page.
 * 3. A broken edit reaches the session by itself as
 *    `Who.svelte:<line>:<column>`, the pane draws it over the last render;
 *    the fix clears both, and the session's `artifact_read` lists no error.
 * 4. A pin on the agent mark's icon (a virtual `~icons/…` component) carries
 *    `source` at its call site in Who.svelte and a two-level `chain`:
 *    IconAgent where Who uses it, then the story Agent.
 * 5. The pane closed (no viewer) and no agent read: the stage sleeps after
 *    its idle time (`STAGE_IDLE_MS`, 30 min); the pane opened again wakes
 *    it, and the three frames render.
 *
 *   bun scripts/probe-kit/run.ts live-sheet
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { STAGE_IDLE_MS } from "../../../packages/core/src/stage";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox } from "./ink";

const CREATE = "mcp__cawco__artifact_create";
const READ = "mcp__cawco__artifact_read";
const FINISH = "mcp__cawco__finish_item";
const STORY = "apps/dashboard/src/lib/cawco/turn/Who.stories.ts";
const COMPONENT = "apps/dashboard/src/lib/cawco/turn/Who.svelte";
/** The files as the stage names them, from its Vite root. */
const STORY_AT_ROOT = "src/lib/cawco/turn/Who.stories.ts";
const COMPONENT_AT_ROOT = "src/lib/cawco/turn/Who.svelte";
const ROLE = '<span class="role">{name}</span>';
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** The stage's errors notice (core injected.ts `artifactErrorsNotice`) and its section's place. */
const ERRORS_NOTICE = /does not compile on its stage/;
const ERROR_AT =
  /## Compile error at src\/lib\/cawco\/transcript\/Who\.svelte:(\d+):(\d+)/;
/** The errors an `artifact_read` of the sheet answers, as its JSON spells them. */
const READ_ERRORS = /"errors":(\[[^\]]*\])/;
/** The marks' quiet period, the hub's send and the model's request (artifacts/service.ts `MARKS_QUIET_MS`). */
const DELIVERY_MS = 10_000 + 20_000;
/** A stage's state as the agent logs each change (agent stage.ts `tell`). */
const stageLine = (workspace: string, status: string) =>
  `[stage] ${workspace.slice(0, 8)} apps/dashboard: ${status}`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
/** Every turn the delegate's model was asked for, in order. */
const heard: Seen[] = [];

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The delegate: installs the checkout first, then calls whatever tool the probe asks (`PROBE-CALL:<n>`), loading it through ToolSearch when deferred. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  heard.push(request);
  if (!request.all.includes("PROBE-SHEET:")) {
    return text("ok");
  }
  if (!request.all.includes("INSTALLED-OK:")) {
    return tool("Bash", {
      command: `bun install --frozen-lockfile > "$TMPDIR/install.log" 2>&1; echo "INSTALLED""-OK:$?"; tail -3 "$TMPDIR/install.log"`,
      description: "Install the repository",
      timeout: 600_000,
    });
  }
  if (ERRORS_NOTICE.test(request.last)) {
    return text("Heard the compile error.");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("Installed.");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return tool(ask.name, ask.input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${ask.name}`, max_results: 1 })
    : text(`${ask.name} is not offered`);
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** The fleet, a project cut from this checkout, and its delegate installed in its workspace. */
const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  // The repository as this checkout's HEAD has it: the dashboard and the sheet.
  const src = join(fleet.sandbox, "src");
  await Bun.$`git clone --quiet --local ${ROOT} ${src}`
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Live sheet",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  const delegate = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Live sheet",
    prompt: "PROBE-SHEET: install the repository, then wait for calls.",
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
    checks: [{ name: "Probe check", command: "true" }],
  });
  const installed = await until(
    "the delegate's install",
    () => heard.find((one) => one.last.includes("INSTALLED-OK:")),
    Boolean,
    900_000
  ).catch(() => undefined);
  const [row] = fleet.query<{ path: string }>(
    "SELECT path FROM workspaces WHERE id = ?",
    delegate.workspaceId
  );
  return { fleet, delegate, clone: row?.path ?? "", installed };
};

let sent = 0;
/** One tool call by the delegate, its result's text once its model reads it. */
const call = async (
  fleet: Fleet,
  to: string,
  name: string,
  input: object
): Promise<string> => {
  sent += 1;
  const marker = String(sent);
  asks.set(marker, { name, input });
  await fleet.send(to, `PROBE-CALL:${marker}`);
  return (await until(
    `the ${name} call (${marker})`,
    () => answered.get(marker),
    Boolean,
    180_000
  )) as string;
};

/** The sheet in the delegate's pane, at the desk: its page frame once three frames hold a Who. */
const openPane = async (kit: Kit, fleet: Fleet, session: string) => {
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, ".artifact-trigger");
  const cdp = await page.context().newCDPSession(page);
  const on: On = {
    call: () => Promise.resolve(""),
    cdp,
    fleet,
    kit,
    page,
    said: [],
    session,
  };
  const frame = await pageFrame(on);
  await frame.waitForFunction(
    () => document.querySelectorAll("[data-cawco-story] h2.who").length === 3,
    null,
    { timeout: 120_000 }
  );
  await settle(page, 400);
  return { on, page, frame };
};

/** 1: the frames, each a real Who, in the dashboard's own tokens, read as the engine resolves them. */
const framesAndTokens = (frame: Frame) =>
  frame.evaluate(() => {
    const resolved = (property: string, value: string) => {
      const probe = document.createElement("div");
      probe.style.setProperty(property, value);
      document.body.append(probe);
      const got = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return got;
    };
    const mark = document.querySelector('[data-cawco-story="Agent"] .dot.a');
    const role = document.querySelector('[data-cawco-story="Agent"] .role');
    return {
      stories: [
        ...document.querySelectorAll<HTMLElement>("[data-cawco-story]"),
      ].map((one) => `${one.dataset.cawcoStory}@${one.dataset.cawcoSource}`),
      whos: document.querySelectorAll("[data-cawco-story] h2.who").length,
      brand: getComputedStyle(document.documentElement)
        .getPropertyValue("--brand-solid")
        .trim(),
      mark: mark ? getComputedStyle(mark).backgroundColor : "",
      markWanted: resolved("background-color", "var(--brand-solid)"),
      role: role ? getComputedStyle(role).color : "",
      roleWanted: resolved("color", "var(--ink-strong)"),
      font: getComputedStyle(document.body).fontFamily,
    };
  });

/** 2: an edit to Who.svelte, both named frames redrawn in place; the page never reloads. */
const hmrChecks = async (
  kit: Kit,
  frame: Frame,
  clone: string,
  original: string
) => {
  await frame.evaluate(() => {
    (window as unknown as { __probeKept: number }).__probeKept = 1;
  });
  const file = join(clone, COMPONENT);
  const t0 = Date.now();
  await writeFile(
    file,
    original.replace(ROLE, '<span class="role">{name}·N</span>')
  );
  const redrawn = await frame
    .waitForFunction(
      () =>
        [...document.querySelectorAll("[data-cawco-story] .role")].filter(
          (one) => one.textContent?.endsWith("·N")
        ).length === 2,
      null,
      { timeout: 20_000 }
    )
    .then(() => Date.now() - t0)
    .catch(() => null);
  const kept = await frame.evaluate(
    () => (window as unknown as { __probeKept?: number }).__probeKept === 1
  );
  kit.check(
    "2: an edit to Who.svelte redraws both frames that show a name, with no reload",
    redrawn !== null && kept,
    `${redrawn === null ? "never redrawn in 20 s" : `redrawn ${redrawn} ms after the write`}; the page ${kept ? "kept its state" : "reloaded"}`
  );
  await writeFile(file, original);
  await frame.waitForFunction(
    () =>
      [...document.querySelectorAll("[data-cawco-story] .role")].every(
        (one) => !one.textContent?.endsWith("·N")
      ),
    null,
    { timeout: 20_000 }
  );
};

/** 3: a broken edit reaches the session as file:line:column and the pane; the fix clears both. */
const errorChecks = async (
  kit: Kit,
  fleet: Fleet,
  page: Page,
  session: string,
  artifact: string,
  clone: string,
  original: string
) => {
  const file = join(clone, COMPONENT);
  const before = heard.length;
  await writeFile(
    file,
    original.replace(ROLE, '<span class="role">{name</span>')
  );
  const told = await until(
    "the compile error at the session",
    () => heard.slice(before).find((one) => ERRORS_NOTICE.test(one.last)),
    Boolean,
    DELIVERY_MS + 20_000
  ).catch(() => undefined);
  const at = told?.last.match(ERROR_AT);
  const card = page.locator(".preview-pane .sheet-error");
  const drawn = await card
    .waitFor({ timeout: 20_000 })
    .then(() => card.innerText())
    .catch(() => "");
  kit.check(
    "3: a broken edit reaches the session by itself as Who.svelte:line:column",
    !!at,
    at
      ? `at line ${at[1]}, column ${at[2]}`
      : `not heard: ${heard.at(-1)?.last.slice(0, 300)}`
  );
  kit.check(
    "3: the pane draws the error over the last render",
    drawn.includes(`${COMPONENT_AT_ROOT}:`),
    drawn.slice(0, 200) || "no card"
  );
  await writeFile(file, original);
  const cleared = await card
    .waitFor({ state: "detached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const read = await call(fleet, session, READ, { id: artifact });
  const errors = read.match(READ_ERRORS)?.[1] ?? "missing";
  kit.check(
    "3: the fix clears it: the card goes, and artifact_read lists no error",
    cleared && errors === "[]",
    `card ${cleared ? "gone" : "still there"}; artifact_read errors ${errors}`
  );
};

/** 4: a pin on the icon inside the agent's mark: source at its call site in Who.svelte, a two-level chain. */
const pinChecks = async (kit: Kit, on: On, frame: Frame) => {
  const { page } = on;
  const comment = page.locator(".preview-pane button[aria-keyshortcuts='C']");
  await comment.focus();
  await page.keyboard.press("c");
  await settle(page, 300);
  const icon = '[data-cawco-story="Agent"] .dot.a svg';
  const b = await screenBox(on, frame, icon);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  const card = page.locator('.pin-card[data-pin-card="1"]');
  await card.waitFor({ timeout: 10_000 });
  await card.getByRole("textbox").fill("A heavier mark here.");
  await card.getByRole("button", { name: "Reply" }).click();
  const doc = await until(
    "pin 1's words in the doc",
    () => docOf(frame),
    (now) =>
      Object.values(now.pins).some(
        (one) => (one as { thread: unknown[] }).thread.length === 1
      ),
    10_000
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const pin = Object.values(doc.pins)[0] as {
    anchor: {
      chain?: {
        column: number;
        component: string;
        file: string;
        line: number;
      }[];
      sheet?: { file: string; story: string };
      source?: {
        column: number | null;
        file: string | null;
        line: number | null;
      };
    };
  };
  const { source, chain, sheet } = pin.anchor;
  const component = await readFile(join(ROOT, COMPONENT), "utf8");
  const atLine = source?.line
    ? (component.split("\n")[source.line - 1] ?? "")
    : "";
  kit.check(
    "4: the pin's source is the icon's call site in Who.svelte",
    source?.file === COMPONENT_AT_ROOT && atLine.includes("<IconAgent"),
    `${source?.file}:${source?.line}:${source?.column} reads ${JSON.stringify(atLine.trim())}`
  );
  kit.check(
    "4: its chain is two levels: IconAgent where Who uses it, then the story Agent",
    chain?.length === 2 &&
      chain[0]?.component === "IconAgent" &&
      chain[0]?.file === COMPONENT_AT_ROOT &&
      chain[1]?.component === "Agent" &&
      chain[1]?.file === STORY_AT_ROOT &&
      sheet?.story === "Agent",
    JSON.stringify({ chain, sheet })
  );
};

/** 5: no viewer, no read: asleep after its idle time; the pane again wakes it, and its frames render. */
const sleepChecks = async (
  kit: Kit,
  fleet: Fleet,
  page: Page,
  session: string,
  workspace: string
) => {
  await page.close();
  const closedAt = Date.now();
  const log = await until(
    "the stage asleep",
    () => fleet.logs("agent"),
    (said) => said.includes(stageLine(workspace, "asleep")),
    STAGE_IDLE_MS + 4 * 60_000
  ).catch(() => "");
  const slept = log.includes(stageLine(workspace, "asleep"));
  kit.check(
    "5: with no viewer and no read, the stage sleeps after its idle time",
    slept,
    slept
      ? `asleep ${Math.round((Date.now() - closedAt) / 60_000)} min after the pane closed`
      : `still not asleep ${Math.round((Date.now() - closedAt) / 60_000)} min after the pane closed`
  );
  const wakeAt = Date.now();
  const again = await openPane(kit, fleet, session).catch(() => undefined);
  const after =
    (await fleet.logs("agent")).split(stageLine(workspace, "asleep")).at(-1) ??
    "";
  kit.check(
    "5: the pane opened again wakes it, and its three frames render",
    !!again &&
      after.includes(stageLine(workspace, "waking")) &&
      after.includes(stageLine(workspace, "live")),
    `${again ? `rendered ${Date.now() - wakeAt} ms after the open` : "never rendered"}; the agent said ${after.includes(stageLine(workspace, "waking")) ? "waking" : "no waking"}, ${after.includes(stageLine(workspace, "live")) ? "then live" : "no live"}`
  );
};

const run = async (kit: Kit) => {
  const { fleet, delegate, clone, installed } = await standUp(kit);
  const ok = installed?.last.includes("INSTALLED-OK:0") ?? false;
  if (
    !kit.check(
      "0: the delegate installs the checkout in its workspace",
      ok && !!clone,
      installed?.last.slice(0, 300) ?? "no install heard"
    )
  ) {
    return;
  }
  const session = delegate.instanceId;
  const made = await call(fleet, session, CREATE, {
    kind: "sheet",
    name: "who",
    file: STORY,
  });
  const artifact = made.match(ANSWERED_ID)?.[1];
  kit.check(
    "1: artifact_create answers the sheet with its three stories at their exports",
    !!artifact &&
      ['"name":"Agent"', '"name":"You"', '"name":"Grouped"'].every((name) =>
        made.includes(name)
      ),
    made.slice(0, 400)
  );
  if (!artifact) {
    return;
  }
  const original = await readFile(join(clone, COMPONENT), "utf8");
  const { on, page, frame } = await openPane(kit, fleet, session);
  const read = await framesAndTokens(frame);
  kit.check(
    "1: the pane renders three frames, each a real Who",
    read.whos === 3 && read.stories.length === 3,
    read.stories.join(", ")
  );
  kit.check(
    "1: in the dashboard's own tokens: the mark --brand-solid, the name --ink-strong, the body Figtree",
    !!read.brand &&
      read.mark === read.markWanted &&
      read.role === read.roleWanted &&
      read.font.startsWith('"Figtree'),
    JSON.stringify(read)
  );
  await hmrChecks(kit, frame, clone, original);
  await errorChecks(kit, fleet, page, session, artifact, clone, original);
  await pinChecks(kit, on, frame);
  await sleepChecks(kit, fleet, page, session, delegate.workspaceId);
  await call(fleet, session, FINISH, {
    headline: "The sheet ran.",
    summary: "The sheet ran.",
  }).catch(() => undefined);
};

const spec: Spec = { name: "live-sheet", run };

export default spec;
