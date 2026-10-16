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
 * 6. The iPad (spec proof 9's device): the app built from this tree, on an
 *    iPad simulator (a mac-slot.sh slot), opened on the session, shows the
 *    sheet in its panel by the same route and overlay as a preview. Read
 *    from the app's DEBUG lines and a `report()` the probe hands the page
 *    (`-preview-report`): the three frames render; the edit redraws them with
 *    no new document; with the desk's pin resolved off the icon, a finger's
 *    tap in Comment (Maestro's runner, lib/sim-touch.ts) pins the icon, and
 *    the hub's record of that pin carries the desk's `source` and `chain`.
 * 5. The pane closed (no viewer) and no agent read: the stage sleeps after
 *    its idle time (`STAGE_IDLE_MS`, 30 min); the pane opened again wakes
 *    it, and its frames render.
 *
 * The inspector (spec §5, proof 6), on the real StatTile's two stories
 * (`StatTile.stories.ts`, Spend and Live), made by the delegate's second
 * `artifact_create` once the iPad's checks are done:
 *
 * 7. At the desk the inspector stands beside the page; changing Live's
 *    variant (`tone`) redraws its frame at once and writes nothing; Save
 *    writes only Live's `args` literal (`git diff`: one file, that
 *    literal's lines, its quotes and indent kept), both frames redraw from
 *    the file, it still type-checks (svelte-check), and the session hears
 *    the save. At the phone it is a sheet over the page's foot; a change
 *    redraws live and Discard puts the file's back.
 * 8. Docgen in the host (spec §6, proof 7): the create answers StatTile's
 *    props; the built host, run straight in the clone and in fresh Vite Vue
 *    and React apps (written and installed here)
 *    under node and under bun, reads each schema right, under 2 s cold and
 *    200 ms warm (the component edited, its props read again).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts live-sheet
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 * `PROBE_LIVE_SHEET_IPAD=off` leaves step 6 out, for a host that can't build
 * the app or tap it (no Mac, or its console locked), and says so as the run's
 * last line: `SKIP 6: iPad leg off (PROBE_LIVE_SHEET_IPAD=off)`. Unset, step 6
 * runs; nothing turns it off by itself.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import type { Frame, Locator, Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import {
  type ComponentDoc,
  type SheetRead,
  STAGE_IDLE_MS,
} from "../../../packages/core/src/stage";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type SimTouch, simTouch } from "../../lib/sim-touch";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox } from "./ink";

const CREATE = "mcp__cawco__artifact_create";
const READ = "mcp__cawco__artifact_read";
const FINISH = "mcp__cawco__finish_item";
const WAIT = "mcp__cawco__wait_item";
const STORY = "apps/dashboard/src/lib/cawco/turn/Who.stories.ts";
const COMPONENT = "apps/dashboard/src/lib/cawco/turn/Who.svelte";
/** The files as the stage names them, from its Vite root. */
const STORY_AT_ROOT = "src/lib/cawco/turn/Who.stories.ts";
const COMPONENT_AT_ROOT = "src/lib/cawco/turn/Who.svelte";
/** Step 6 left out, only when the run's environment says so (the header). */
const IPAD_OFF = process.env.PROBE_LIVE_SHEET_IPAD === "off";
const ROLE = '<span class="role">{name}</span>';
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
/** The stage's errors notice (core injected.ts `artifactErrorsNotice`) and its section's place. */
const ERRORS_NOTICE = /does not compile on its stage/;
const ERROR_AT = new RegExp(
  `## Compile error at ${COMPONENT_AT_ROOT.replaceAll(/[./]/g, "\\$&")}:(\\d+):(\\d+)`
);
const TILE_STORY = "apps/dashboard/src/lib/cawco/StatTile.stories.ts";
const TILE_AT_ROOT = "src/lib/cawco/StatTile.stories.ts";
/** The saves notice (core injected.ts `artifactSavesNotice`) and its section's place. */
const SAVES_NOTICE = /changed the sheet "stat-tile"/;
const SAVED_AT =
  /## Saved at apps\/dashboard\/src\/lib\/cawco\/StatTile\.stories\.ts:(\d+)/;
/** A hunk's head in `git diff -U0`: the old and new lines it spans. */
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
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

/** The text of the tool result a request's final message carries (Anthropic messages: a `tool_result` block, its content a string or text blocks). */
const toolResultOf = (body: string): string => {
  const sent = JSON.parse(body) as {
    messages?: { content?: unknown }[];
  };
  const content = sent.messages?.at(-1)?.content;
  const block = Array.isArray(content)
    ? (content as { content?: unknown; type?: string }[]).find(
        (one) => one.type === "tool_result"
      )
    : undefined;
  const result = block?.content;
  if (typeof result === "string") {
    return result;
  }
  return Array.isArray(result)
    ? (result as { text?: string }[]).map((one) => one.text ?? "").join("\n")
    : "";
};

/** The name of the tool the request's previous assistant message called, if it called one. */
const calledLast = (body: string): string | undefined => {
  const sent = JSON.parse(body) as {
    messages?: { content?: unknown; role?: string }[];
  };
  const content = sent.messages?.findLast(
    (message) => message.role === "assistant"
  )?.content;
  return Array.isArray(content)
    ? (content as { name?: string; type?: string }[]).find(
        (one) => one.type === "tool_use"
      )?.name
    : undefined;
};

/**
 * A turn of the delegate's that ends with `words`: first it declares that it
 * waits (`wait_item`), as a delegate waiting for its parent does, so the hub
 * neither nudges nor fails its item for quiet turns (work-items.ts
 * `QUIET_TURNS`); every message that wakes it ends that wait, so each turn
 * declares it again.
 */
const restIn = (request: Seen, words: string): Reply => {
  const last = calledLast(request.body);
  if (
    last === WAIT ||
    (last === "ToolSearch" && !request.toolNames.includes(WAIT))
  ) {
    return text(words);
  }
  if (request.toolNames.includes(WAIT)) {
    return tool(WAIT, { minutes: 120, reason: "The probe's next call." });
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${WAIT}`, max_results: 1 })
    : text(words);
};

/** The delegate: installs the checkout first, then calls whatever tool the probe asks (`PROBE-CALL:<n>`), loading it through ToolSearch when deferred; each turn ends in a declared wait. */
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
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  // The call's result, from its own block: words the hub delivers mid-turn
  // (the errors notice, a burst of marks) can ride the same message, and
  // then they, not the result, are `last`.
  if (
    marker &&
    issued.has(marker) &&
    !answered.has(marker) &&
    request.afterTool
  ) {
    answered.set(marker, toolResultOf(request.body));
    return restIn(request, "done");
  }
  if (ERRORS_NOTICE.test(request.last)) {
    return restIn(request, "Heard the compile error.");
  }
  if (SAVES_NOTICE.test(request.last)) {
    return restIn(request, "Heard the save.");
  }
  if (!(marker && ask)) {
    return restIn(request, "Installed.");
  }
  if (issued.has(marker)) {
    return restIn(request, "done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return tool(ask.name, ask.input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${ask.name}`, max_results: 1 })
    : restIn(request, `${ask.name} is not offered`);
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
  // Its origin is one of its own whose HEAD is `main`: a workspace is cut
  // from the branch origin names (agent clone.ts `remoteDefault`), and this
  // checkout may stand on a detached HEAD (a host check's) that names none.
  const src = join(fleet.sandbox, "src");
  // Not the sandbox's `origin.git`: that is the fleet's own repo's remote (scratch-fleet.ts).
  const origin = join(fleet.sandbox, "src-origin.git");
  /** One git step as the owner; a failure throws with git's own words. */
  const git = async (...args: string[]) => {
    const run = await Bun.$`git ${args}`
      .env({ ...process.env, HOME: home })
      .quiet()
      .nothrow();
    if (run.exitCode !== 0) {
      throw new Error(
        `git ${args.join(" ")} exited ${run.exitCode}: ${run.stderr.toString().trim()}`
      );
    }
  };
  await git("clone", "--quiet", "--local", ROOT, src);
  await git("-C", src, "checkout", "--quiet", "-B", "main");
  await git("init", "--quiet", "--bare", origin);
  await git("-C", origin, "symbolic-ref", "HEAD", "refs/heads/main");
  await git("-C", src, "remote", "set-url", "origin", origin);
  await git("-C", src, "push", "--quiet", "origin", "main");
  await git("-C", src, "fetch", "--quiet", "origin");
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

/** What a sheet's frames show once rendered: Who's three, StatTile's two. */
const WHOS = { selector: "[data-cawco-story] h2.who", count: 3 };
const TILES = { selector: "[data-cawco-story] .st-card", count: 2 };

/** The sheet in the delegate's pane, at `view`: its page frame once its frames render. */
const openPane = async (
  kit: Kit,
  fleet: Fleet,
  session: string,
  ready: { count: number; selector: string } = WHOS,
  view: "desk" | "phone" = "desk"
) => {
  const base = await fleet.dashboard();
  const page = await kit.page(view);
  await open(page, `${base}/session/${session}`, ".artifact-trigger");
  if ((await page.locator(".preview-pane iframe").count()) === 0) {
    // A phone keeps the panel in its drawer until asked.
    await page.locator(".artifact-trigger").first().click();
  }
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
    ({ selector, count }) =>
      document.querySelectorAll(selector).length === count,
    ready,
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
    `card ${cleared ? "gone" : "still there"}; artifact_read errors ${errors}${errors === "missing" ? `; it answered ${JSON.stringify(read.slice(0, 300))}` : ""}`
  );
};

/** A pin's anchor as the overlay writes it on a sheet: the tapped element's source, its chain, the sheet's story. */
interface SheetAnchor {
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
}

/** Where Who.svelte uses the agent's icon, `file:line:column` from the Vite root, 1-based: what a pin on the icon names. */
const iconPlace = (component: string) => {
  const lines = component.split("\n");
  const line = lines.findIndex((one) => one.includes("<IconAgent"));
  return `${COMPONENT_AT_ROOT}:${line + 1}:${lines[line].indexOf("<IconAgent") + 1}`;
};

/** 4: a pin on the icon inside the agent's mark: source at its call site in Who.svelte, a two-level chain. */
const pinChecks = async (
  kit: Kit,
  on: On,
  frame: Frame
): Promise<{ anchor: SheetAnchor; id: string }> => {
  const { page } = on;
  const comment = page.locator(".preview-pane button[aria-keyshortcuts='C']");
  await comment.focus();
  await page.keyboard.press("c");
  // The page's overlay in Comment (its layer's `comment`, page.ts `mode`): a click before it is the page's own.
  await frame.waitForFunction(
    () =>
      document
        .querySelector("cawco-overlay")
        ?.shadowRoot?.querySelector(".layer")
        ?.classList.contains("comment") === true,
    null,
    { timeout: 10_000 }
  );
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
  const pin = Object.values(doc.pins)[0] as { anchor: SheetAnchor; id: string };
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
  return pin;
};

/** The iPad: iOS 18.5, the app's floor, as ios-accounts.ts takes it (its slot's template already made). */
const IPAD = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPad Pro 13-inch (M4)",
};
/** A log line's head, up to and with its `[dev.cawco.app:<category>] `. */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** The report's `preview page …` line (PreviewController `probePage`): the frames, the edited names, the document's load stamp, the icon's centre in window points. */
const PAGE_LINE =
  /^preview page stories=(\S*) whos=(\d+) edited=(\d+) loaded=(\d+)(?: icon=(-?\d+),(-?\d+))?$/;
/**
 * The sheet page's `report()`, which the app's DEBUG heartbeat calls every
 * 0.7 s (`-preview-report`): the stories' frames, how many names carry the
 * edit's mark, the document's own load stamp (a reload makes a new one), and
 * the agent mark's icon, as `cawco:probe` with its rect.
 */
const REPORT = `
window.__probeLoaded = window.__probeLoaded || Date.now();
function report() {
  const frames = [...document.querySelectorAll("[data-cawco-story]")];
  const edited = [...document.querySelectorAll("[data-cawco-story] .role")]
    .filter((one) => (one.textContent || "").endsWith("·N")).length;
  const rects = {};
  const icon = document.querySelector('[data-cawco-story="Agent"] .dot.a svg');
  if (icon) {
    const r = icon.getBoundingClientRect();
    rects.icon = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  window.parent.postMessage({
    type: "cawco:probe",
    state: "stories=" + frames.map((one) => one.dataset.cawcoStory).join(",") +
      " whos=" + document.querySelectorAll("[data-cawco-story] h2.who").length +
      " edited=" + edited + " loaded=" + window.__probeLoaded,
    rects,
  }, "*");
}`;

interface IpadPage {
  edited: number;
  icon?: { x: number; y: number };
  loaded: string;
  stories: string;
  whos: number;
}

const ipadPageOf = (line: string): IpadPage | undefined => {
  const m = line.match(PAGE_LINE);
  return m
    ? {
        stories: m[1],
        whos: Number(m[2]),
        edited: Number(m[3]),
        loaded: m[4],
        icon: m[5] ? { x: Number(m[5]), y: Number(m[6]) } : undefined,
      }
    : undefined;
};

/** The app's Probe lines on simulator `udid`, each pushed onto `lines` without its head as it comes. */
const probeLines = (
  udid: string,
  lines: string[]
): Subprocess<"ignore", "pipe", "ignore"> => {
  const child = Bun.spawn(
    [
      "xcrun",
      "simctl",
      "spawn",
      udid,
      "log",
      "stream",
      "--style",
      "compact",
      "--predicate",
      'subsystem == "dev.cawco.app" AND category == "Probe"',
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  (async () => {
    const decoder = new TextDecoder();
    const reader = child.stdout.getReader();
    let rest = "";
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      rest += decoder.decode(value, { stream: true });
      const split = rest.split("\n");
      rest = split.pop() ?? "";
      for (const line of split) {
        if (LOG_HEAD.test(line)) {
          lines.push(line.replace(LOG_HEAD, "").trim());
        }
      }
    }
  })().catch(() => undefined);
  return child;
};

/** The newest report in `lines` after `from` that `test` passes, waited for up to `ms`. */
const reportAfter = (
  lines: string[],
  from: number,
  test: (page: IpadPage) => boolean,
  ms: number
) =>
  until(
    "the sheet's report in the app",
    () =>
      lines
        .slice(from)
        .map(ipadPageOf)
        .findLast((page) => page !== undefined && test(page)),
    Boolean,
    ms
  ).catch(() => undefined);

/** What the app said of its preview's loads since `from`, for a failure's detail. */
const PREVIEW_SAID =
  /^preview (loads|answered|failed)|^preview (ready|document)$/;
const previewStory = (lines: string[], from: number) =>
  lines
    .slice(from)
    .filter((one) => PREVIEW_SAID.test(one))
    .map((one) => one.slice(0, 200))
    .join(" | ") || "nothing";

/** 6: the iPad's pin, as the hub recorded it, against the icon's place in Who.svelte and the desk's pin. */
const ipadPinVerdict = (
  kit: Kit,
  anchor: SheetAnchor | undefined,
  tapped: { x: number; y: number } | undefined,
  wanted: string,
  desk: { anchor: SheetAnchor }
) => {
  const { source, chain, sheet } = anchor ?? {};
  const said = source
    ? `${source.file}:${source.line}:${source.column}`
    : "no source";
  kit.check(
    `6: a tap-to-pin on the iPad gives the icon's source ${wanted}, as the desk's click did`,
    said === wanted &&
      JSON.stringify(source) === JSON.stringify(desk.anchor.source),
    anchor
      ? `iPad ${said}; desk ${JSON.stringify(desk.anchor.source)}`
      : `no new pin on the hub after the tap at ${tapped ? `${tapped.x},${tapped.y}` : "no icon point"}`
  );
  kit.check(
    "6: its chain is the desk's two levels: IconAgent where Who uses it, then the story Agent",
    chain?.length === 2 &&
      chain[0]?.component === "IconAgent" &&
      chain[1]?.component === "Agent" &&
      sheet?.story === "Agent" &&
      JSON.stringify(chain) === JSON.stringify(desk.anchor.chain),
    JSON.stringify({ chain, sheet })
  );
};

/**
 * 6: the iPad. The app built from this tree, on the session, shows the sheet
 * in its panel through the same route and overlay as a preview: its three
 * frames render, an edit to Who.svelte redraws them with no reload, and a
 * finger's tap in Comment on the agent's icon pins it with the same source
 * and chain the desk's click gave (`desk`), read from the hub's record of it.
 */
const ipadChecks = async (
  kit: Kit,
  fleet: Fleet,
  session: string,
  artifact: string,
  clone: string,
  original: string,
  desk: { anchor: SheetAnchor; id: string }
) => {
  // Off only when the run says so, and said at the run's end: never off by itself.
  if (IPAD_OFF) {
    return;
  }
  const { path: app, problem } = freshApp(ROOT);
  if (
    !kit.check("6: the app is built from this tree", !problem, problem ?? app)
  ) {
    return;
  }
  // The desk's pin stands on the same icon: resolved, its disc leaves the page and takes no tap.
  await fleet.api(
    `/api/instances/${session}/artifacts/comments/${desk.id}/resolve`,
    {}
  );
  const pinsOnHub = async () =>
    (
      await fleet.api<{
        artifacts: {
          id: string;
          pins: { anchor: SheetAnchor; id: string }[];
        }[];
      }>(
        `/api/instances/${session}/artifacts/comments?artifact=${artifact}&filter=all`
      )
    ).artifacts.find((one) => one.id === artifact)?.pins ?? [];

  let sim: MacSim | undefined;
  let finger: SimTouch | undefined;
  let stream: Subprocess | undefined;
  /** The app's Probe lines, in order. */
  const lines: string[] = [];
  const pageAfter = (
    from: number,
    test: (page: IpadPage) => boolean,
    ms: number
  ) => reportAfter(lines, from, test, ms);
  const story = (from: number) => previewStory(lines, from);
  try {
    sim = await macSim(IPAD);
    const { udid } = sim;
    console.log(`  iPad simulator ${udid}`);
    await Bun.$`xcrun simctl bootstatus ${udid} -b`.quiet();
    await Bun.$`xcrun simctl install ${udid} ${app}`.quiet();
    stream = probeLines(udid, lines);
    await Bun.sleep(1500);
    const report = Buffer.from(REPORT).toString("base64");
    await until(
      "the app launched on the iPad",
      () =>
        Bun.$`xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${session} -preview-probe -preview-comment -preview-report ${report}`
          .quiet()
          .then(() => true),
      Boolean,
      60_000
    );

    // 6a: the sheet in the app's panel, its three frames.
    const first = await pageAfter(0, (page) => page.whos === 3, 120_000);
    const rendered = kit.check(
      "6: on the iPad, the app's panel renders the sheet's three frames, each a real Who",
      first?.whos === 3 && first.stories === "Agent,You,Grouped",
      first
        ? `stories ${first.stories}, ${first.whos} Who`
        : `no frames reported; the app said ${story(0)}`
    );
    if (!(first && rendered)) {
      return;
    }

    // 6b: an edit to Who.svelte, both named frames redrawn in the web view; no new document.
    const mark = lines.length;
    const file = join(clone, COMPONENT);
    const t0 = Date.now();
    await writeFile(
      file,
      original.replace(ROLE, '<span class="role">{name}·N</span>')
    );
    const redrawn = await pageAfter(mark, (page) => page.edited === 2, 20_000);
    const took = Date.now() - t0;
    const documents = lines
      .slice(mark)
      .filter((one) => one === "preview document").length;
    kit.check(
      "6: an edit to Who.svelte redraws both named frames on the iPad, with no reload",
      !!redrawn && redrawn.loaded === first.loaded && documents === 0,
      redrawn
        ? `redrawn within ${took} ms of the write; ${documents} new document(s); load stamp ${first.loaded} → ${redrawn.loaded}`
        : `never redrawn in 20 s; the app said ${story(mark)}`
    );
    await writeFile(file, original);
    await pageAfter(lines.length, (page) => page.edited === 0, 20_000);

    // 6c: Comment on (`-preview-comment`, at the first ready), a finger's tap on the agent's icon.
    const commenting = lines.includes("preview comment on");
    finger = simTouch(udid);
    const front = await finger.front();
    if (
      !kit.check(
        "6: the app stands in front in Comment before the tap",
        front === "CawCo" && commenting,
        `Maestro reads "${front}" in front; Comment ${commenting ? "on" : "not on"}`
      )
    ) {
      return;
    }
    const now = await pageAfter(lines.length, (page) => !!page.icon, 15_000);
    const before = new Set((await pinsOnHub()).map((one) => one.id));
    if (now?.icon) {
      console.log(`  tap the agent's icon at ${now.icon.x},${now.icon.y}`);
      await finger.touch(now.icon);
    }
    const made = await until(
      "the iPad's pin on the hub",
      async () => (await pinsOnHub()).find((one) => !before.has(one.id)),
      Boolean,
      15_000
    ).catch(() => undefined);
    ipadPinVerdict(kit, made?.anchor, now?.icon, iconPlace(original), desk);
  } finally {
    stream?.kill();
    await finger?.stop();
    // Gone before the sleep step: the app's open page is a viewer the stage stays awake for.
    if (sim) {
      await Bun.$`xcrun simctl terminate ${sim.udid} dev.cawco.app`
        .quiet()
        .nothrow();
    }
    await sim?.release();
  }
};

/** The inspector once its entrance has run: every animation on it finished, so its box is where it rests. */
const landed = (inspector: Locator) =>
  inspector.evaluate((el) =>
    Promise.all(el.getAnimations().map((one) => one.finished))
  );

/** The tone StatTile's Live frame mounts with now. */
const liveTone = (frame: Frame) =>
  frame.evaluate(
    () =>
      document.querySelector<HTMLElement>('[data-cawco-story="Live"] .st-card')
        ?.dataset.tone ?? null
  );

/** The 1-based lines of Live's `args` literal in the story file as this checkout has it: `args: {` to its closing brace. */
const liveArgsLines = (source: string): { from: number; to: number } => {
  const lines = source.split("\n");
  const story = lines.findIndex((line) => line.includes("export const Live"));
  const from = lines.findIndex(
    (line, at) => at >= story && line.includes("args:")
  );
  let depth = 0;
  for (let at = from; at < lines.length; at += 1) {
    depth += (lines[at]?.split("{").length ?? 1) - 1;
    depth -= (lines[at]?.split("}").length ?? 1) - 1;
    if (depth <= 0) {
      return { from: from + 1, to: at + 1 };
    }
  }
  return { from: from + 1, to: from + 1 };
};

/** The old and new lines each hunk of a `git diff -U0` changed. */
const hunksOf = (diff: string) =>
  [...diff.matchAll(HUNK)].map((hunk) => {
    const old = Number(hunk[1]);
    const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2]);
    return { from: old, to: old + Math.max(oldCount, 1) - 1 };
  });

/** 6 and 7: StatTile's sheet made, its props answered, its inspector at the desk (write-back) and at the phone. */
const inspectorChecks = async (
  kit: Kit,
  fleet: Fleet,
  session: string,
  clone: string
) => {
  const made = await call(fleet, session, CREATE, {
    kind: "sheet",
    name: "stat-tile",
    file: TILE_STORY,
  });
  kit.check(
    "8: artifact_create answers StatTile's props: tone the five-value enum with its default, label a required string, action a slot",
    made.includes('"options":["neutral","live","attn","done","fail"]') &&
      made.includes('"defaultValue":"\\"neutral\\""') &&
      made.includes(
        '"name":"label","type":{"name":"string","raw":"string"},"required":true'
      ) &&
      made.includes('"name":"action","type":{"name":"slot"'),
    made.slice(0, 600)
  );
  const original = await readFile(join(ROOT, TILE_STORY), "utf8");
  const literal = liveArgsLines(original);
  const { page, frame } = await openPane(kit, fleet, session, TILES);
  await page.locator(".preview-pane button.inspect").click();
  const inspector = page.locator("[data-inspector]");
  await inspector.waitFor({ timeout: 20_000 });
  await landed(inspector);
  const placed = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-inspector]");
    const well = document.querySelector<HTMLElement>(
      ".preview-pane .side-well"
    );
    const iframe = document.querySelector<HTMLElement>(
      ".preview-pane iframe.ready"
    );
    const p = panel?.getBoundingClientRect();
    const f = iframe?.getBoundingClientRect();
    // The well's inner box, inside its edge: where the inspector stands.
    const box = well?.getBoundingClientRect();
    const w = well &&
      box && {
        right: box.left + well.clientLeft + well.clientWidth,
        height: well.clientHeight,
      };
    return {
      layout: panel?.dataset.inspector,
      right: p && w ? Math.round(w.right - p.right) : null,
      height: p && w ? Math.round(p.height - w.height) : null,
      beside: p && f ? Math.round(p.left - f.right) : null,
      edges: {
        well: w ? Math.round(w.right) : null,
        panel: p ? [Math.round(p.left), Math.round(p.right)] : null,
        page: f ? [Math.round(f.left), Math.round(f.right)] : null,
      },
    };
  });
  kit.check(
    "7: at the desk the inspector is a right panel beside the page, the page narrowed to meet it",
    placed.layout === "panel" &&
      placed.right === 0 &&
      placed.height === 0 &&
      placed.beside !== null &&
      Math.abs(placed.beside) <= 1,
    JSON.stringify(placed)
  );
  await inspector.locator("select").first().selectOption("Live");
  await inspector.locator('[data-prop="tone"] select').selectOption("done");
  const redrawn = await frame
    .waitForFunction(
      () =>
        document.querySelector<HTMLElement>(
          '[data-cawco-story="Live"] .st-card'
        )?.dataset.tone === "done",
      null,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  const unwritten =
    (
      await Bun.$`git -C ${clone} status --porcelain -- ${TILE_STORY}`.text()
    ).trim() === "";
  kit.check(
    "7: a variant changed in the inspector redraws its frame at once, and writes nothing until Save",
    redrawn && unwritten,
    `Live's tone ${await liveTone(frame)}; the file ${unwritten ? "unchanged" : "already written"}`
  );
  const renders = await frame.evaluate(
    () =>
      (window as unknown as { __cawcoSheet: { renders: number } }).__cawcoSheet
        .renders
  );
  const before = heard.length;
  await inspector.getByRole("button", { name: "Save", exact: true }).click();
  const fromFile = await frame
    .waitForFunction(
      (was) => {
        const sheet = (
          window as unknown as { __cawcoSheet: { renders: number } }
        ).__cawcoSheet;
        const cards = document.querySelectorAll<HTMLElement>(
          "[data-cawco-story] .st-card"
        );
        const live = document.querySelector<HTMLElement>(
          '[data-cawco-story="Live"]'
        );
        return (
          sheet.renders > was &&
          cards.length === 2 &&
          live?.querySelector<HTMLElement>(".st-card")?.dataset.tone ===
            "done" &&
          !live.hasAttribute("data-cawco-edited")
        );
      },
      renders,
      { timeout: 20_000 }
    )
    .then(() => true)
    .catch(() => false);
  const stat = (await Bun.$`git -C ${clone} diff --stat`.text()).trim();
  const diff = await Bun.$`git -C ${clone} diff -U0 -- ${TILE_STORY}`.text();
  const hunks = hunksOf(diff);
  const added = diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  const inside =
    hunks.length > 0 &&
    hunks.every((one) => one.from >= literal.from && one.to <= literal.to);
  kit.check(
    "7: Save rewrites only Live's args literal: one file, that literal's lines, its quotes and indent kept",
    stat.split("\n").length === 2 &&
      stat.includes("StatTile.stories.ts") &&
      inside &&
      added.length > 0 &&
      added.every(
        (line) => line.startsWith("+  args:") || line.startsWith("+    ")
      ) &&
      added.some((line) => line.includes('tone: "done"')),
    `${stat.replaceAll("\n", " / ")}; hunks ${JSON.stringify(hunks)} in ${literal.from}-${literal.to}; ${added.join(" | ")}`
  );
  kit.check(
    "7: both frames redraw from the file once it is written",
    fromFile,
    `renders ${renders} → ${await frame.evaluate(() => (window as unknown as { __cawcoSheet: { renders: number } }).__cawcoSheet.renders)}; Live's tone ${await liveTone(frame)}`
  );
  const typed = await Bun.$`bun run typecheck`
    .cwd(join(clone, "apps/dashboard"))
    .quiet()
    .nothrow();
  kit.check(
    "7: the story file still type-checks (svelte-check)",
    typed.exitCode === 0,
    typed.stdout.toString().trim().split("\n").slice(-3).join(" / ")
  );
  const told = await until(
    "the save at the session",
    () => heard.slice(before).find((one) => SAVES_NOTICE.test(one.last)),
    Boolean,
    DELIVERY_MS + 20_000
  ).catch(() => undefined);
  const at = told?.last.match(SAVED_AT);
  kit.check(
    "7: the session hears the person's save on the marks' channel, at the literal's line",
    !!at && Number(at[1]) >= literal.from && Number(at[1]) <= literal.to,
    at
      ? `saved at line ${at[1]}`
      : `not heard: ${heard.at(-1)?.last.slice(0, 300)}`
  );
  await page.close();

  // At the phone: a sheet over the page's foot; a change redraws live, Discard puts the file's back.
  const phone = await openPane(kit, fleet, session, TILES, "phone");
  await phone.page.locator(".preview-pane button.inspect").click();
  const sheet = phone.page.locator("[data-inspector]");
  await sheet.waitFor({ timeout: 20_000 });
  await landed(sheet);
  const foot = await phone.page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-inspector]");
    const well = document.querySelector<HTMLElement>(
      ".preview-pane .side-well"
    );
    const p = panel?.getBoundingClientRect();
    // The well's inner box, inside its edge: where the inspector stands.
    const box = well?.getBoundingClientRect();
    const w = well &&
      box && {
        bottom: box.top + well.clientTop + well.clientHeight,
        width: well.clientWidth,
        height: well.clientHeight,
      };
    return {
      layout: panel?.dataset.inspector,
      bottom: p && w ? Math.round(w.bottom - p.bottom) : null,
      width: p && w ? Math.round(w.width - p.width) : null,
      share: p && w ? Math.round((p.height / w.height) * 100) : null,
    };
  });
  kit.check(
    "7: at the phone the inspector is a sheet over the page's foot, edge to edge, at most 60% of the well",
    foot.layout === "sheet" &&
      foot.bottom === 0 &&
      foot.width === 0 &&
      foot.share !== null &&
      foot.share <= 60,
    JSON.stringify(foot)
  );
  await sheet.locator("select").first().selectOption("Live");
  await sheet.locator('[data-prop="tone"] select').selectOption("attn");
  const changed = await phone.frame
    .waitForFunction(
      () =>
        document.querySelector<HTMLElement>(
          '[data-cawco-story="Live"] .st-card'
        )?.dataset.tone === "attn",
      null,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  await sheet.getByRole("button", { name: "Discard", exact: true }).click();
  const back = await phone.frame
    .waitForFunction(
      () =>
        document.querySelector<HTMLElement>(
          '[data-cawco-story="Live"] .st-card'
        )?.dataset.tone === "done",
      null,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    "7: at the phone a change redraws Live at once, and Discard puts the file's tone back",
    changed && back,
    `attn ${changed ? "drawn" : "never drawn"}; done again ${back ? "after Discard" : "never"}`
  );
  await phone.page.close();
};

/** A run of the built host straight in a Vite root, under `runtime`: its sheet read cold, then warm after its component's edit. */
const hostRead = async (
  host: string,
  app: { framework: string; kit: string; root: string; story: string },
  runtime: "node" | "bun",
  port: number
): Promise<{
  cold: number;
  error?: string;
  read?: SheetRead;
  warm: number;
}> => {
  await Bun.write(join(app.root, ".cawco/stage/host.mjs"), host);
  const child = spawn(runtime, [".cawco/stage/host.mjs"], {
    cwd: app.root,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: app.framework,
      CAWCO_STAGE_KIT: app.kit,
      // The dashboard's config asks for a hub; no request reaches it.
      CAWCO_DEV_HUB_URL: "http://127.0.0.1:9",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((done, fail) => {
      let said = "";
      child.stdout.on("data", (chunk: Buffer) => {
        said += chunk.toString();
        if (said.includes('"cawco":"ready"')) {
          done();
        } else if (said.includes('"cawco":"fatal"')) {
          fail(new Error(said));
        }
      });
      child.on("exit", (code) =>
        fail(new Error(`${runtime} ended (${code}): ${said}`))
      );
    });
    // Vite's own start (its dependency scan) shares the loop: read once it has settled.
    await Bun.sleep(8000);
    const url = `http://127.0.0.1:${port}/__cawco/stories?file=${encodeURIComponent(app.story)}`;
    const timed = async () => {
      const t0 = performance.now();
      const read = (await (await fetch(url)).json()) as SheetRead;
      return { read, ms: Math.round(performance.now() - t0) };
    };
    const first = await timed();
    const component = first.read.components[0]?.file;
    let warm = Number.NaN;
    if (component) {
      const path = join(app.root, component);
      const was = await readFile(path, "utf8");
      // A comment at its end: new content, so its props are read again.
      await writeFile(
        path,
        `${was}${app.framework === "react" ? "\n// probe\n" : "\n<!-- probe -->\n"}`
      );
      warm = (await timed()).ms;
      await writeFile(path, was);
    }
    return { read: first.read, cold: first.ms, warm };
  } catch (error) {
    return {
      cold: Number.NaN,
      warm: Number.NaN,
      error:
        error instanceof Error ? error.message.slice(0, 300) : String(error),
    };
  } finally {
    child.kill("SIGTERM");
  }
};

/** A fresh Vite app's tsconfig: strict, its own `src`. */
const SAMPLE_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    jsx: "preserve",
    skipLibCheck: true,
  },
  include: ["src"],
});

/**
 * Two fresh Vite apps, written here and installed before the reads: a Vue
 * card and a React card, each with a `density` enum, a required title, a
 * boolean, a number and a slot, their own config untouched by the stage.
 */
const SAMPLES: Record<"vue" | "react", Record<string, string>> = {
  vue: {
    "package.json": JSON.stringify({
      name: "live-sheet-vue",
      private: true,
      type: "module",
      dependencies: { vue: "3.5.44" },
      devDependencies: {
        "@vitejs/plugin-vue": "6.0.10",
        typescript: "6.0.2",
        vite: "8.3.4",
      },
    }),
    "vite.config.ts":
      'import vue from "@vitejs/plugin-vue";\n\nexport default { plugins: [vue()] };\n',
    "tsconfig.json": SAMPLE_TSCONFIG,
    "src/Card.vue": `<script setup lang="ts">
/** A card of the sample app. */
withDefaults(
  defineProps<{
    /** The card's title. */
    title: string;
    /** How much room the card takes. */
    density?: "compact" | "roomy";
    pinned?: boolean;
    count?: number;
  }>(),
  { density: "compact", pinned: false }
);
</script>

<template>
  <article :data-density="density" :data-pinned="pinned">
    <h3>{{ title }}</h3>
    <span v-if="count !== undefined">{{ count }}</span>
    <slot />
  </article>
</template>
`,
    "src/Card.stories.ts": `import Card from "./Card.vue";

export default { component: Card, args: { title: "Sample" } };

export const Compact = { args: {} };

export const Roomy = { args: { density: "roomy" } };
`,
  },
  react: {
    "package.json": JSON.stringify({
      name: "live-sheet-react",
      private: true,
      type: "module",
      dependencies: { react: "19.3.1", "react-dom": "19.3.1" },
      devDependencies: {
        "@types/react": "19.3.0",
        "@vitejs/plugin-react": "6.1.2",
        typescript: "6.0.2",
        vite: "8.3.4",
      },
    }),
    "vite.config.ts":
      'import react from "@vitejs/plugin-react";\n\nexport default { plugins: [react()] };\n',
    "tsconfig.json": SAMPLE_TSCONFIG.replace('"preserve"', '"react-jsx"'),
    "src/Card.tsx": `import type { ReactNode } from "react";

export interface CardProps {
  children?: ReactNode;
  count?: number;
  /** How much room the card takes. */
  density?: "compact" | "roomy";
  pinned?: boolean;
  /** The card's title. */
  title: string;
}

/** A card of the sample app. */
export function Card({ title, density = "compact", pinned = false, count, children }: CardProps) {
  return (
    <article data-density={density} data-pinned={pinned}>
      <h3>{title}</h3>
      {count === undefined ? null : <span>{count}</span>}
      {children}
    </article>
  );
}
`,
    "src/Card.stories.tsx": `import { Card } from "./Card";

export default { component: Card, args: { title: "Sample" } };

export const Compact = { args: {} };

export const Roomy = { args: { density: "roomy" } };
`,
  },
};

/** Whether a component's props hold `name` of kind `kind`, with `extra` true of it. */
const has = (
  doc: ComponentDoc | undefined,
  name: string,
  kind: string,
  extra: (prop: ComponentDoc["props"][number]) => boolean = () => true
) => {
  const prop = doc?.props.find((one) => one.name === name);
  return !!prop && prop.type.name === kind && extra(prop);
};

/** 7: the built host's docgen straight in the clone and in fresh Vue and React apps, under node and bun, right and in time. */
const docgenChecks = async (kit: Kit, fleet: Fleet, clone: string) => {
  const host = await buildStageHost();
  const samples = join(fleet.sandbox, "samples");
  await Promise.all(
    Object.entries(SAMPLES).map(async ([name, files]) => {
      await Promise.all(
        Object.entries(files).map(([path, source]) =>
          Bun.write(join(samples, name, path), source)
        )
      );
      await Bun.$`bun install`.cwd(join(samples, name)).quiet();
    })
  );
  const runs = [
    {
      name: "StatTile",
      root: join(clone, "apps/dashboard"),
      framework: "svelte",
      kit: "1",
      story: TILE_AT_ROOT,
      right: (doc?: ComponentDoc) =>
        has(
          doc,
          "tone",
          "enum",
          (one) =>
            one.options?.join() === "neutral,live,attn,done,fail" &&
            one.defaultValue === '"neutral"'
        ) &&
        has(doc, "label", "string", (one) => one.required) &&
        has(doc, "action", "slot") &&
        !doc?.props.some((one) => one.name === "class"),
    },
    {
      name: "the Vue sample's Card",
      root: join(samples, "vue"),
      framework: "vue",
      kit: "0",
      story: "src/Card.stories.ts",
      right: (doc?: ComponentDoc) =>
        has(
          doc,
          "density",
          "enum",
          (one) =>
            one.options?.join() === "compact,roomy" &&
            one.defaultValue === '"compact"'
        ) &&
        has(doc, "title", "string", (one) => one.required) &&
        has(doc, "pinned", "boolean") &&
        has(doc, "count", "number"),
    },
    {
      name: "the React sample's Card",
      root: join(samples, "react"),
      framework: "react",
      kit: "0",
      story: "src/Card.stories.tsx",
      right: (doc?: ComponentDoc) =>
        has(
          doc,
          "density",
          "enum",
          (one) =>
            one.options?.join() === "compact,roomy" &&
            one.defaultValue === '"compact"'
        ) &&
        has(doc, "title", "string", (one) => one.required) &&
        has(doc, "pinned", "boolean") &&
        has(doc, "children", "slot"),
    },
  ];
  let port = 47_310;
  for (const runtime of ["node", "bun"] as const) {
    for (const run of runs) {
      port += 1;
      // biome-ignore lint/performance/noAwaitInLoops: one host at a time, so each read times only itself
      const got = await hostRead(host, run, runtime, port);
      const doc = got.read?.components[0];
      kit.check(
        `8: ${run.name}'s props under ${runtime}: its schema right, under 2 s cold and 200 ms warm`,
        run.right(doc) && got.cold < 2000 && got.warm < 200,
        got.error ??
          `${got.cold} ms cold, ${got.warm} ms warm; ${JSON.stringify(doc?.props.map((one) => `${one.name}:${one.type.name}`))}`
      );
    }
  }
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
      : `still not asleep ${Math.round((Date.now() - closedAt) / 60_000)} min after the pane closed; the agent's last stage lines: ${(
          await fleet.logs("agent")
        )
          .split("\n")
          .filter((line) => line.includes(`[stage] ${workspace.slice(0, 8)}`))
          .slice(-12)
          .join(" | ")}`
  );
  const wakeAt = Date.now();
  // The panel shows the newest sheet, StatTile's.
  const again = await openPane(kit, fleet, session, TILES).catch(
    () => undefined
  );
  const after =
    (await fleet.logs("agent")).split(stageLine(workspace, "asleep")).at(-1) ??
    "";
  kit.check(
    "5: the pane opened again wakes it, and its frames render",
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
  const desk = await pinChecks(kit, on, frame);
  await ipadChecks(kit, fleet, session, artifact, clone, original, desk);
  // After the iPad's: StatTile's sheet takes the panel from Who's.
  await inspectorChecks(kit, fleet, session, clone);
  await sleepChecks(kit, fleet, page, session, delegate.workspaceId);
  // Last: these start a Vite of their own in the stage's root, beside the stage.
  await docgenChecks(kit, fleet, clone);
  await call(fleet, session, FINISH, {
    headline: "The sheet ran.",
    summary: "The sheet ran.",
  }).catch(() => undefined);
  // The run's last word, not step 6's: a reader of the output's tail (the
  // hub's check keeps only that of a half-hour run) sees what it left out.
  if (IPAD_OFF) {
    console.log("SKIP 6: iPad leg off (PROBE_LIVE_SHEET_IPAD=off)");
  }
};

const spec: Spec = { name: "live-sheet", run };

export default spec;
