/**
 * A reference chip keeps its words and its box from its first paint (the
 * owner, on his live chat: "your comment chips are layout shifting as i
 * click them inside the transcript theri title seems to change"). His case:
 * an agent's message naming a pin by a written label ("its pin") on a page
 * whose pins the dashboard hadn't read; his press opened the page, its doc
 * loaded, and the chip's label became what the pin stands on, its width
 * changing under his pointer.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model, which calls the tools each PROBE-CALL names and says the words
 * each PROBE-SAY names) and the built dashboard, in Chromium and WebKit at
 * 1440 and 390, one agent message names a pin, an artifact, a decision
 * card, a changed spot, a session, a task, a plan and a step, each by its
 * link with a written label. For each chip, on a page loaded fresh (the
 * dashboard holding none of the artifacts' docs): its label and its box
 * read before the press, right after it, and once what it opens has loaded
 * (the page in the panel and its doc held; the plan open; a task's chip
 * goes with the conversation as its press leaves for the task's page, so
 * it is read before and right after). All three are equal.
 *
 * The pin twice: once as the dashboard reads its pins from the hub (its
 * chip shows what the pin stands on from its first paint: DESIGN.md, a
 * pin's chip, "its label what it stands on"), and once with the hub's
 * answer for its pins empty (his case: nothing read until the press), where
 * the chip shows the written label and keeps it as the press loads the doc.
 *
 *   bun scripts/probe-kit/run.ts chip-steady
 */
import type { Frame, Page } from "playwright-core";
import type { Pin } from "../../../packages/core/src/comments";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  COMPOSER,
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  VIEWS,
  type View,
} from "../kit";
import { writePagePins } from "../pins";

const COMMAND = /PROBE-CALL:(\d+)/g;
const SAY = /PROBE-SAY:(\d+)/;
/** An artifact's id in a tool's words: its link (core references.ts `artifactLink`). */
const ANSWERED_ID = /\(cawco:artifact\/([0-9a-f-]{36})\)/;
const LINK = /\[[^[\]]*\]\(cawco:[a-z]+\/[^)]+\)/g;
const ESCAPED_QUOTE = /\\"/g;
const FRAME = 'iframe[title="Preview"]';
/** What the pin stands on: the owner's own case, longer than the written label. */
const PINNED = "On the Mac, how should a delegate get its own copy of the work";
/** The address's flag that the hub's answer for an artifact's pins reads empty ({@link EMPTY_PINS_SCRIPT}). */
const EMPTY_PINS = "probe-empty-pins";

/**
 * Started in the dashboard's pages before their own scripts: on a load whose
 * address carries the flag, the hub's answer for an artifact's pins
 * (`…/artifacts/comments`) reads as none, as when the dashboard hadn't read
 * them (his case). In the page itself: request interception, in WebKit,
 * fails the preview's own blob workers.
 */
const EMPTY_PINS_SCRIPT = (key: string) => {
  if (!new URLSearchParams(location.search).has(key)) {
    return;
  }
  const real = window.fetch.bind(window);
  const urlOf = (input: RequestInfo | URL): string => {
    if (typeof input === "string") {
      return input;
    }
    return input instanceof URL ? input.href : input.url;
  };
  // Bun's own `fetch` type carries more than a page's: the page's is what is replaced.
  const shim = (input: RequestInfo | URL, init?: RequestInit) =>
    urlOf(input).includes("/artifacts/comments?")
      ? Promise.resolve(
          Response.json({ artifacts: [], at: new Date().toISOString() })
        )
      : real(input, init);
  Object.assign(window, { fetch: shim });
};

/** The label the agent wrote for the pin. */
const WRITTEN = "its pin";

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const says = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const say = SAY.exec(request.last)?.[1];
  if (say && says.has(say) && !request.afterTool) {
    return text(says.get(say) as string);
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** A page, its body naming it, so a frame showing it is told apart. */
const pageHtml = (name: string, headline: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; font: 18px/1.6 system-ui; } main { padding: 24px; }</style></head>
<body data-page="${name}"><main>
  <h1 id="headline">${headline}</h1>
  <p id="copy">A paragraph that stays as it is.</p>
</main></body></html>`;

/** The link of the answer's links whose destination starts with `prefix`. */
const linkIn = (answer: string, prefix: string): string =>
  [...answer.replace(ESCAPED_QUOTE, '"').matchAll(LINK)]
    .map((match) => match[0])
    .find((link) => link.includes(`](${prefix}`)) ?? "";

interface Made {
  /** The panel brought back to the other page on the hub: no chip's artifact is open as a load begins. */
  backToOther: () => Promise<void>;
  base: string;
  /** Each chip of the agent's message, by kind: its selector, and what its press opens. */
  chips: Chip[];
  hero: string;
  session: string;
}

interface Chip {
  kind: string;
  /** Whether its press leaves the conversation (a task's page): read before and right after it alone. */
  leaves?: boolean;
  /** What stands on screen once what it opens has loaded. */
  loaded: (screen: Page) => Promise<boolean>;
  selector: string;
}

/** The frame showing page `name` in the panel, with its doc joined; null while none does. */
const pageShown = async (screen: Page, name: string): Promise<Frame | null> => {
  if ((await screen.locator(FRAME).count()) === 0) {
    return null;
  }
  const frame = await (
    await screen.locator(FRAME).first().elementHandle({ timeout: 2000 })
  )?.contentFrame();
  const on = await frame
    ?.evaluate(
      (want) =>
        document.body?.dataset.page === want &&
        !!(window as unknown as { cawcoArtifact?: unknown }).cawcoArtifact,
      name
    )
    .catch(() => false);
  return on && frame ? frame : null;
};

const setUp = async (kit: Kit): Promise<Made> => {
  const fleet: KitFleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Mac layer",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const session = await fleet.spawn("claude", "Chips", fleet.repo, {
    projectId: project.id,
  });
  let sent = 0;
  /** A tool called through the model: its answer in words, where every link it names stands as written. */
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const base = await fleet.dashboard();
  const desk = await kit.page("desk");
  await open(desk, `${base}/session/${session}`, COMPOSER);

  const decided = await call("mcp__cawco__artifact_create", {
    kind: "page",
    does: "pick",
    ask: "Pick the Mac layer",
    name: "mac-layer",
    program: `root = Decisions("The Mac layer", [layer])
layer = Decision("mac-layer", "APFS clone or AgentFS on the Mac?", [apfs, agentfs], "How a delegate gets its tree.")
apfs = Option("apfs", "APFS clone", "Copy on write.", true, [], "Nothing.")
agentfs = Option("agentfs", "AgentFS", "A layer of its own.", false, [], "A daemon.")`,
  });
  const decision = decided.match(ANSWERED_ID)?.[1] ?? "";
  const made = await call("mcp__cawco__artifact_create", {
    kind: "page",
    does: "judge",
    ask: "Pin what reads wrong",
    name: "hero",
    html: pageHtml("hero", PINNED),
  });
  const hero = made.match(ANSWERED_ID)?.[1] ?? "";
  // The person's comment on the headline, written as the page writes one.
  const frame = (await until(
    "the hero in the panel",
    () => pageShown(desk, "hero"),
    Boolean,
    60_000
  )) as Frame;
  const at = new Date().toISOString();
  const pin: Pin = {
    id: crypto.randomUUID(),
    number: 1,
    kind: "comment",
    anchor: { selector: "#headline", source: null, text: PINNED },
    at,
    by: "person",
    elements: [],
    point: { x: 0.9, y: 0.2 },
    title: PINNED,
    thread: [{ id: crypto.randomUUID(), by: "person", text: "Which?", at }],
  };
  await writePagePins(frame, pin);
  await until(
    "the pin on the hub",
    () =>
      fleet.api<{ artifacts: { id: string; pins: Pin[] }[] }>(
        `/api/instances/${session}/artifacts/comments?artifact=${hero}&filter=all`
      ),
    (read) => !!read.artifacts.find((one) => one.id === hero)?.pins.length,
    30_000
  );
  const updated = await call("mcp__cawco__artifact_update", {
    id: hero,
    html: pageHtml("hero", "One board for every agent"),
  });
  const filed = await call("mcp__cawco__task_create", {
    title: "Pick the Mac layer",
  });
  const planned = await call("mcp__cawco__todo_write", {
    steps: [
      { content: "Read the brief", status: "completed" },
      { content: "Build the layer", status: "in_progress" },
    ],
  });
  // The panel shows another page: a chip's press swaps what it shows, never the conversation's width.
  const othered = await call("mcp__cawco__artifact_create", {
    kind: "page",
    does: "judge",
    ask: "Another page",
    name: "other",
    html: pageHtml("other", "Another page"),
  });
  const other = othered.match(ANSWERED_ID)?.[1] ?? "";
  const change = linkIn(updated, `cawco:change/${hero}/`);
  const task = linkIn(filed, `cawco:task/${project.id}/tsk-`);
  const plan = linkIn(planned, `cawco:plan/${session}`);
  const step = linkIn(planned, `cawco:step/${session}/2`);
  says.set(
    "1",
    `[APFS clone or AgentFS on the Mac](cawco:decision/${decision}/mac-layer). I replied twice in [${WRITTEN}](cawco:pin/${hero}/1), on [the hero](cawco:artifact/${hero}), where ${change} moved. Filed ${task}; ${plan} is at ${step}. Ask [the chips session](cawco:session/${session}).`
  );
  await fleet.send(session, "PROBE-SAY:1");
  await desk.close();
  const panelLoaded = (name: string) => async (screen: Page) =>
    !!(await pageShown(screen, name));
  return {
    base,
    backToOther: async () => {
      await fleet.api(`/api/instances/${session}/artifacts/${other}/show`, {});
    },
    hero,
    session,
    chips: [
      {
        kind: "artifact",
        selector: `[data-artifact-chip="${hero}"]`,
        loaded: panelLoaded("hero"),
      },
      {
        kind: "decision",
        selector: `[data-decision-chip="${decision}/mac-layer"]`,
        loaded: async (screen) =>
          (await screen.locator(FRAME).count()) > 0 &&
          !(await pageShown(screen, "other")),
      },
      {
        kind: "change",
        selector: `[data-change-chip^="${hero}/"]`,
        loaded: panelLoaded("hero"),
      },
      {
        kind: "session",
        selector: `[data-session-chip="${session}"]`,
        loaded: async () => true,
      },
      {
        kind: "plan",
        selector: `[data-reference-chip="plan"][data-reference-id="${session}"]`,
        loaded: async (screen) =>
          (await screen.locator("[data-plan-row]").count()) > 0,
      },
      {
        kind: "step",
        selector: `[data-reference-chip="step"][data-reference-id="${session}/2"]`,
        loaded: async (screen) =>
          (await screen.locator('[data-plan-row="2"]').count()) > 0,
      },
      {
        kind: "task",
        selector: '[data-reference-chip="task"]',
        leaves: true,
        loaded: async () => true,
      },
    ],
  };
};

/** A chip's words and its box, read in one pass. */
const readChip = (screen: Page, selector: string) =>
  screen.evaluate((sel) => {
    const chip = document.querySelector(sel);
    if (!chip) {
      return null;
    }
    const r = chip.getBoundingClientRect();
    return {
      label:
        chip.querySelector('[data-slot="label"]')?.textContent?.trim() ?? "",
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  }, selector);

/** Presses the chip and reads it in the same task, before anything the press starts has run. */
const pressAndRead = (screen: Page, selector: string) =>
  screen.evaluate((sel) => {
    const chip = document.querySelector<HTMLElement>(sel);
    if (!chip) {
      return null;
    }
    chip.click();
    const r = chip.getBoundingClientRect();
    return {
      label:
        chip.querySelector('[data-slot="label"]')?.textContent?.trim() ?? "",
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  }, selector);

type Read = Awaited<ReturnType<typeof readChip>>;

const same = (a: Read, b: Read) =>
  !!a &&
  !!b &&
  a.label === b.label &&
  Math.abs(a.box.x - b.box.x) <= 0.5 &&
  Math.abs(a.box.y - b.box.y) <= 0.5 &&
  Math.abs(a.box.w - b.box.w) <= 0.5 &&
  Math.abs(a.box.h - b.box.h) <= 0.5;

/** A fresh load of the conversation, the panel shut on a phone (its sheet stands over the turn). */
const freshLoad = async (
  screen: Page,
  made: Made,
  view: View,
  emptyPins = false
) => {
  // Each load starts with the panel on the other page: the chip's artifact
  // is in no pane, so nothing of it is held as the turn is drawn.
  await made.backToOther();
  await open(
    screen,
    `${made.base}/session/${made.session}${emptyPins ? `?${EMPTY_PINS}` : ""}`,
    COMPOSER
  );
  if (VIEWS[view].width < 900) {
    await screen
      .locator('[data-preview-sheet] [data-slot="preview-pane"]')
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await settle(screen, 600);
  }
};

/** One chip read before its press, right after it, and once what it opens has loaded. */
const steadyThrough = async (
  screen: Page,
  made: Made,
  view: View,
  chip: Chip,
  done: () => Promise<boolean>,
  emptyPins = false
) => {
  await freshLoad(screen, made, view, emptyPins);
  const drawn = await until(
    `the ${chip.kind} chip drawn`,
    () => readChip(screen, chip.selector),
    Boolean,
    30_000
  ).catch(() => null);
  await screen
    .locator(chip.selector)
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  await settle(screen, 400);
  const before = await readChip(screen, chip.selector);
  const pressed = await pressAndRead(screen, chip.selector);
  if (chip.leaves) {
    return { drawn: !!drawn, before, pressed, after: pressed };
  }
  await until(`what the ${chip.kind} chip opens`, done, Boolean, 30_000).catch(
    () => false
  );
  await settle(screen, 800);
  const after = await readChip(screen, chip.selector);
  return { drawn: !!drawn, before, pressed, after };
};

interface Leg {
  engine: Engine;
  view: View;
}

const LEGS: Leg[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];

/** The pin's chip, its pins read from the hub (`empty`: the hub's answer for them empty, as nothing read until the press). */
const pinChecks = async (
  kit: Kit,
  screen: Page,
  made: Made,
  leg: Leg,
  empty: boolean
) => {
  const name = `${leg.engine} ${VIEWS[leg.view].width}`;
  const read = await steadyThrough(
    screen,
    made,
    leg.view,
    {
      kind: "pin",
      selector: `[data-pin-chip="${made.hero}/1"]`,
      loaded: async () => true,
    },
    async () =>
      !!(await pageShown(screen, "hero")) &&
      (await screen
        .locator('[data-slot="pin-card"][data-pin-card="1"]')
        .count()) > 0,
    empty
  );
  const want = empty ? WRITTEN : PINNED;
  kit.check(
    `${name}: the pin's chip ${empty ? "(its pins unread until the press, his case) shows the written label" : "shows what the pin stands on"} from its first paint and keeps its words and its box through the press and the page's doc loading`,
    read.drawn &&
      !!read.before?.label.startsWith(want.slice(0, 20)) &&
      same(read.before, read.pressed) &&
      same(read.before, read.after),
    JSON.stringify(read)
  );
};

const legChecks = async (kit: Kit, made: Made, leg: Leg) => {
  const name = `${leg.engine} ${VIEWS[leg.view].width}`;
  const screen = await kit.page(leg.view, { engine: leg.engine });
  await screen.addInitScript(EMPTY_PINS_SCRIPT, EMPTY_PINS);
  const said: string[] = [];
  /** The chip being read, said with any error so it is known where it came. */
  let stage = "loading";
  screen.on("pageerror", (error) =>
    said.push(
      `pageerror at ${stage}: ${error.message} ${error.stack?.split("\n").slice(0, 3).join(" ← ")}`
    )
  );
  screen.on("console", (message) => {
    if (message.type() === "error") {
      said.push(
        `error at ${stage}: ${message.text()} (${message.location().url})`
      );
    }
  });
  try {
    stage = "pin";
    await pinChecks(kit, screen, made, leg, false);
    stage = "pin, unread";
    await pinChecks(kit, screen, made, leg, true);
    for (const chip of made.chips) {
      stage = chip.kind;
      // biome-ignore lint/performance/noAwaitInLoops: one chip at a time, each from a fresh load
      const read = await steadyThrough(screen, made, leg.view, chip, () =>
        chip.loaded(screen)
      );
      kit.check(
        `${name}: the ${chip.kind} chip keeps its words and its box from its first paint through the press${chip.leaves ? "" : " and what it opens loading"}`,
        read.drawn &&
          same(read.before, read.pressed) &&
          same(read.before, read.after),
        JSON.stringify(read)
      );
    }
  } finally {
    kit.check(
      `${name}: the pages said no error`,
      said.length === 0,
      said.slice(0, 6).join(" | ") || "none"
    );
    await screen.close();
  }
};

const run = async (kit: Kit) => {
  const made = await setUp(kit);
  const only = process.argv.includes("--engine")
    ? process.argv[process.argv.indexOf("--engine") + 1]
    : undefined;
  for (const leg of LEGS.filter((one) => !only || one.engine === only)) {
    // biome-ignore lint/performance/noAwaitInLoops: one leg, then the next, on the one fleet
    await legChecks(kit, made, leg);
  }
};

const spec: Spec = { name: "chip-steady", run };
export default spec;
