/**
 * Artifacts, slice 3a (Projects spec §5.10): the canvas, on a scratch fleet
 * (real hub, agent and sessiond; real Claude Code against the mock model,
 * which calls the hub's MCP tools as each PROBE-CALL message says), shown
 * in the built dashboard at the desk (1440). Read from the hub's answers
 * and the DOM, never from pixels; the pen is the browser's own (pen pointer
 * events through the DevTools protocol). In order:
 *
 * 1. `artifact_create(kind: "canvas", mermaid)` with the session open on a
 *    dashboard answers two rectangles with their text and one arrow bound
 *    A → B, and the panel's menu lists the canvas with its glyph.
 * 2. `artifact_update` replacing B by id with a new x moves B's box in the
 *    next read.
 * 3. A pen stroke draws a freedraw: the outline gains an `ink` line over B,
 *    and `changed` names it.
 * 4. With a pen stroke begun (down and moves, no up), `artifact_update`
 *    replacing A lands; after the pen lifts the stroke's element still
 *    exists and A's replacement stands.
 * 5. The export answers a PNG over 1 KB within 3 s of the last change, and
 *    `artifact_read(png: true)` answers the same bytes.
 * 6. With every page closed, `artifact_update(mermaid)` is refused with
 *    "No screen is showing this canvas. …".
 * 7. Throughout, every request the pages make is to the dashboard's own
 *    origin.
 * 9. No canvas page load logs "Yjs was already imported", and no console
 *    message is an error: the page runs one Yjs, the overlay's.
 * 10. The page's binding holds the overlay's doc itself
 *     (`window.cawcoArtifact.doc`) and its scene doc is of the same Yjs
 *     (one `Doc` constructor on the page); an `artifact_update` with one
 *     skeleton element is in Excalidraw's scene within 2 s.
 *
 * The scratch hub builds the canvas page with `CAWCO_PROBE_HOOKS=1` (core
 * canvas-host.ts), which exposes the binding as `window.cawcoCanvasProbe`.
 */
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const NO_SCREEN =
  "No screen is showing this canvas. Open it on a dashboard (artifact_show), then try again.";
/** The panel's canvas: its one iframe, on the stage over the panel's well (dashboard canvas/). */
const PANEL_CANVAS = ".canvas-stage.docked iframe";
/** A path of Solar's pen-new-square, the canvas's glyph in the menu. */
const CANVAS_GLYPH = "M1 12C1 6.81455";

const RECT = /^(\S+) rectangle "([^"]*)" at (-?\d+),(-?\d+) (\d+)×(\d+)$/gm;
const ARROW = /^arrow (\S+)(?: "[^"]*")?: (\S+) → (\S+)$/m;
const INK = /^ink (\S+): (\d+) points, .*, over (.*)$/gm;

interface Read {
  changed?: string[];
  outline?: string;
  pictureAt?: string | null;
  png?: string | null;
  seq: number;
}

interface Box {
  id: string;
  text: string;
  x: number;
}

const rects = (outline: string): Box[] =>
  [...outline.matchAll(RECT)].map((found) => ({
    id: found[1],
    text: found[2],
    x: Number(found[3]),
  }));

const inks = (outline: string) =>
  [...outline.matchAll(INK)].map((found) => ({
    id: found[1],
    over: found[3].split(", "),
  }));

/** What each numbered message asks the session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
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

/** The panel's canvas frame, once its host page has drawn. */
const canvasFrame = async (on: Page): Promise<Frame> => {
  await until(
    "the panel's canvas",
    () =>
      on.frameLocator(PANEL_CANVAS).locator(".canvas-host .excalidraw").count(),
    (count) => count === 1,
    60_000
  );
  const frame = await (
    await on.locator(PANEL_CANVAS).elementHandle()
  )?.contentFrame();
  if (!frame) {
    throw new Error("the panel's frame has no document");
  }
  return frame;
};

/** What the checks run on: the fleet's session, its calls, the dashboard page and what it saw. */
interface OnCanvas {
  call: (tool: string, input: object) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
  /** Every console message any frame of the page logged (check 9). */
  logged: string[];
  /** Requests any page made to another origin (check 7). */
  offOrigin: string[];
  page: Page;
  said: string[];
  session: string;
}

/** A scratch fleet with one Claude Code session, and the session open on the dashboard, every request watched. */
const setUp = async (kit: Kit): Promise<OnCanvas> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  // The canvas page the hub builds shows the probe its binding (check 10).
  fleet.env.CAWCO_PROBE_HOOKS = "1";
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Canvas", fleet.repo);
  let sent = 0;
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
  const origin = new URL(base).host;
  const offOrigin: string[] = [];
  const said: string[] = [];
  const logged: string[] = [];
  const page = await kit.page("desk");
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.host !== origin) {
      offOrigin.push(request.url());
    }
  });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).host !== origin) {
      offOrigin.push(socket.url());
    }
  });
  page.on("console", (message) => {
    logged.push(`${message.type()}: ${message.text()}`);
    if (message.type() === "error") {
      said.push(`error: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  await open(page, `${base}/session/${session}`, "textarea");
  return { call, fleet, kit, logged, offOrigin, page, said, session };
};

const run = async (kit: Kit) => {
  const on = await setUp(kit);
  const made = await created(on);
  if (!made) {
    return;
  }
  const lifted = await penChecks(on, made);
  await pictureChecks(on, made.id, lifted);
  await oneDocCheck(on, made.id);
  await emptyChecks(on);

  // 9. Every canvas page load so far (the flow canvas, its reloads, the blank one).
  const twice = on.logged.filter((line) =>
    line.includes("Yjs was already imported")
  );
  kit.check(
    '9: no canvas page load logs "Yjs was already imported", and no console message is an error',
    twice.length === 0 && on.said.length === 0,
    [...twice, ...on.said].slice(0, 6).join(" | ") || "none"
  );

  // 6. Nothing shows the canvas: the agent's Mermaid is refused.
  await on.page.close();
  await Bun.sleep(1000);
  const refused = await on.call(UPDATE, {
    id: made.id,
    mermaid: "flowchart LR; C[Refused] --> D[Here]",
  });
  kit.check(
    "6: with every page closed, artifact_update(mermaid) is refused with the sentence",
    refused.includes(NO_SCREEN),
    refused.slice(0, 300)
  );

  // 7. Every request any page made, by host.
  kit.check(
    "7: every request the pages made was to the dashboard's own origin",
    on.offOrigin.length === 0,
    on.offOrigin.slice(0, 6).join(" | ") || "none"
  );
};

/**
 * The rail and the empty canvas as DESIGN.md draws them (Artifact panel,
 * canvas and ink), from geometry and computed style: the tool group 11px
 * in, 34px boxes at 5px, the chosen one on surface-fill, the groups apart,
 * Excalidraw's own chrome gone; an empty canvas made by the agent says so,
 * shows the empty recipe, and its Draw picks the pen.
 */
const emptyChecks = async (on: OnCanvas) => {
  const answer = await on.call(CREATE, { kind: "canvas", name: "blank" });
  const frame = await until(
    "the blank canvas in the panel",
    async () => {
      const found = await canvasFrame(on.page);
      return (await found.locator(".canvas-empty").count()) === 1
        ? found
        : null;
    },
    Boolean,
    30_000
  ).catch(() => null);
  if (!frame) {
    on.kit.check("rail: the blank canvas shows its empty state", false, answer);
    return;
  }
  const rail = await frame.evaluate(() => {
    const box = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect();
    const probe = document.createElement("span");
    probe.style.background = "var(--surface-fill)";
    document.body.append(probe);
    const fill = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const chosen = document.querySelector(".rail-box[data-chosen]");
    const first = document.querySelector(".rail-box");
    const tools = box(".rail-tools");
    const view = box(".rail-view");
    return {
      tools: tools ? [tools.left, tools.top] : null,
      apart:
        !!(tools && view) &&
        (tools.right <= view.left || tools.bottom <= view.top),
      boxes: [...document.querySelectorAll(".rail-box")].map((one) => {
        const rect = one.getBoundingClientRect();
        return `${rect.width}×${rect.height}`;
      }),
      radius: first ? getComputedStyle(first).borderRadius : null,
      chosenFill: chosen
        ? getComputedStyle(chosen).backgroundColor === fill
        : false,
      // Whichever layout Excalidraw chose for the frame's width, none of
      // its toolbars, menus or footers draws a box.
      chrome: [
        ...document.querySelectorAll(
          ".excalidraw .layer-ui__wrapper, .excalidraw .App-top-bar, .excalidraw .App-bottom-bar, .excalidraw .App-toolbar"
        ),
      ].map((node) => ({
        is: node.className,
        drawn: node.getBoundingClientRect().width > 0,
      })),
      title: document.querySelector(".canvas-empty-title")?.textContent,
      line: document.querySelector(".canvas-empty-line")?.textContent,
    };
  });
  on.kit.check(
    "rail: tools 11px in, 34px boxes at 5px, the chosen one on surface-fill, the two groups apart, Excalidraw's chrome hidden",
    rail.tools?.join() === "11,11" &&
      rail.boxes.every((size) => size === "34×34") &&
      rail.radius === "5px" &&
      rail.chosenFill &&
      rail.apart &&
      rail.chrome.length > 0 &&
      rail.chrome.every((one) => !one.drawn),
    JSON.stringify(rail)
  );
  await frame.click(".canvas-empty-action");
  const pen = await until(
    "Draw picking the pen",
    () => frame.locator('.rail-box[aria-label^="Pen"][data-chosen]').count(),
    (count) => count === 1,
    5000
  ).catch(() => 0);
  on.kit.check(
    "empty: artifact_create with neither says the canvas is empty; it shows the empty recipe, and Draw picks the pen",
    answer.includes("The canvas is empty") &&
      rail.title === "Nothing drawn yet" &&
      rail.line === "Draw with the pencil, or ask the agent to draw." &&
      pen === 1,
    `${answer.slice(0, 200)}; ${rail.title} / ${rail.line}; pen chosen ${pen}`
  );
};

/**
 * Check 10: one doc, one Yjs. The binding's `live` is the overlay's doc
 * itself and its `scene` a doc of the overlay's Yjs; the agent's one
 * skeleton element reaches Excalidraw's scene within 2 s.
 */
const oneDocCheck = async (on: OnCanvas, id: string) => {
  const frame = await canvasFrame(on.page);
  const docs = await frame.evaluate(() => {
    const probe = (
      window as unknown as {
        cawcoCanvasProbe?: { live: object; scene: object };
      }
    ).cawcoCanvasProbe;
    const overlay = (
      window as unknown as {
        cawcoArtifact: { doc: object; Y: { Doc: new () => object } };
      }
    ).cawcoArtifact;
    return {
      hooked: !!probe,
      sameDoc: !!probe && probe.live === overlay.doc,
      oneYjs:
        !!probe &&
        probe.live instanceof overlay.Y.Doc &&
        probe.scene instanceof overlay.Y.Doc,
    };
  });
  const answer = await on.call(UPDATE, {
    id,
    elements: [
      {
        type: "rectangle",
        id: "one-yjs",
        x: 40,
        y: 420,
        width: 120,
        height: 60,
      },
    ],
  });
  const toolAnswered = Date.now();
  const landed = await until(
    "the element in Excalidraw's scene",
    () =>
      frame.evaluate(() =>
        (
          window as unknown as {
            cawcoCanvasProbe: { elements: () => { id: string }[] };
          }
        ).cawcoCanvasProbe
          .elements()
          .some((el) => el.id === "one-yjs")
      ),
    Boolean,
    2000
  ).then(
    () => Date.now() - toolAnswered,
    () => null
  );
  on.kit.check(
    "10: the binding holds the overlay's doc itself, its scene doc is of the same Yjs (one Doc constructor); the agent's one element is in Excalidraw's scene within 2 s",
    docs.hooked &&
      docs.sameDoc &&
      docs.oneYjs &&
      answer.includes("wrote") &&
      landed !== null,
    `${JSON.stringify(docs)}; landed ${landed === null ? "not within 2 s" : `${landed} ms after the tool answered`}; tool: ${answer.slice(0, 160)}`
  );
};

/** The canvas's read, as the agent's tool reads it. */
const reader =
  ({ fleet, session }: OnCanvas, id: string) =>
  (query = "") =>
    fleet.api<Read>(`/api/instances/${session}/artifacts/${id}${query}`);

/** Checks 1 and 2: the canvas from Mermaid, its row in the menu, B moved by id; its id and A and B. */
const created = async (
  on: OnCanvas
): Promise<{ id: string; hub: Box; agent: Box } | null> => {
  const { call, kit, page, said } = on;
  const answer = await call(CREATE, {
    kind: "canvas",
    name: "flow",
    mermaid: "flowchart LR; A[Hub] --> B[Agent]",
  });
  const id = answer.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check(
      "1: artifact_create answers the canvas's id",
      false,
      `${answer.slice(0, 400)}; said: ${said.slice(-6).join(" | ")}`
    );
    return null;
  }
  const read = reader(on, id);
  const first = await read();
  const outline = first.outline ?? "";
  const boxes = rects(outline);
  const hub = boxes.find((box) => box.text === "Hub");
  const agent = boxes.find((box) => box.text === "Agent");
  const arrow = outline.match(ARROW);
  kit.check(
    "1: artifact_create(mermaid) answers two rectangles with their text and one arrow bound A → B",
    answer.includes("wrote") &&
      boxes.length === 2 &&
      !!hub &&
      !!agent &&
      arrow?.[2] === hub.id &&
      arrow?.[3] === agent.id,
    `outline:\n${outline}\nanswer: ${answer.slice(0, 200)}`
  );
  await page.click(".artifact-trigger");
  const row = page.locator(`.artifact-row[data-artifact="${id}"]`);
  await row.waitFor();
  await settle(page);
  const glyph = await row.evaluate(
    (node, path) =>
      node.querySelector("svg")?.innerHTML.includes(path as string) ?? false,
    CANVAS_GLYPH
  );
  kit.check(
    "1: the panel's menu lists the canvas with its glyph (pen-new-square)",
    (await row.count()) === 1 &&
      glyph &&
      (await row.locator(".row-name").textContent()) === "flow",
    `glyph ${glyph}`
  );
  await page.keyboard.press("Escape");
  await row.waitFor({ state: "detached" });
  await settle(page);
  if (!(hub && agent)) {
    return null;
  }

  // 2. B moves by id.
  await call(UPDATE, {
    id,
    elements: [{ type: "rectangle", id: agent.id, x: agent.x + 240 }],
  });
  const moved = rects((await read()).outline ?? "").find(
    (box) => box.id === agent.id
  );
  kit.check(
    "2: artifact_update replacing B by id with a new x moves B's box in the next read",
    moved?.x === agent.x + 240 && moved.text === "Agent",
    `B ${agent.x} → ${moved?.x}; ${moved?.text}`
  );
  return { id, hub, agent: { ...agent, x: moved?.x ?? agent.x } };
};

/** Checks 3 and 4: the pen's strokes, one of them held across the agent's write; when the pen last lifted. */
const penChecks = async (
  on: OnCanvas,
  { id, hub, agent }: { id: string; hub: Box; agent: Box }
): Promise<number> => {
  const { call, kit, page, said } = on;
  const read = reader(on, id);
  // 3. A pen stroke over B.
  const frame = await canvasFrame(page);
  await frame.click('.rail-box[aria-label="Zoom"]');
  await frame.click('.rail-item:has-text("Zoom to fit")');
  await frame.click('.rail-box[aria-label^="Pen"]');
  await settle(page, 400);
  const well = await page.locator(PANEL_CANVAS).boundingBox();
  if (!well) {
    throw new Error("the panel's frame has no box");
  }
  const cdp = await page.context().newCDPSession(page);
  const pen = (
    type: "mousePressed" | "mouseMoved" | "mouseReleased",
    fx: number,
    fy: number
  ) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      x: well.x + well.width * fx,
      y: well.y + well.height * fy,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
      pointerType: "pen",
      force: 0.5,
    });
  const stroke = async (from: number[], to: number[], lift: boolean) => {
    await pen("mousePressed", from[0], from[1]);
    for (let step = 1; step <= 24; step += 1) {
      const t = step / 24;
      // biome-ignore lint/performance/noAwaitInLoops: a stroke's points, one after another
      await pen(
        "mouseMoved",
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t
      );
    }
    if (lift) {
      await pen("mouseReleased", to[0], to[1]);
    }
  };
  const before = await read();
  await stroke([0.08, 0.2], [0.92, 0.85], true);
  const drawn = await until(
    "the stroke in the outline",
    () => read(`?since=${before.seq}`),
    (answer) =>
      inks(answer.outline ?? "").some(
        (ink) =>
          ink.over.includes(agent.id) && (answer.changed ?? []).includes(ink.id)
      ),
    10_000
  ).catch(() => read(`?since=${before.seq}`));
  kit.check(
    "3: a pen stroke is an ink line over B in the outline, and changed names it",
    inks(drawn.outline ?? "").some(
      (ink) =>
        ink.over.includes(agent.id) && (drawn.changed ?? []).includes(ink.id)
    ),
    `outline:\n${drawn.outline}\nchanged: ${drawn.changed?.join(", ")}; said: ${said.slice(-6).join(" | ")}`
  );

  // 4. The agent replaces A while the pen is down.
  const inkBefore = inks(drawn.outline ?? "").length;
  await stroke([0.15, 0.85], [0.45, 0.6], false);
  const replaced = await call(UPDATE, {
    id,
    elements: [{ type: "rectangle", id: hub.id, x: hub.x - 200 }],
  });
  const lifted = Date.now();
  await pen("mouseReleased", 0.45, 0.6);
  const after = await until(
    "the stroke and A's replacement",
    () => read(),
    (answer) =>
      inks(answer.outline ?? "").length === inkBefore + 1 &&
      rects(answer.outline ?? "").find((box) => box.id === hub.id)?.x ===
        hub.x - 200,
    10_000
  ).catch(() => read());
  kit.check(
    "4: with a stroke held, artifact_update replacing A lands; after the lift the stroke stands and so does A's replacement",
    replaced.includes("wrote") &&
      inks(after.outline ?? "").length === inkBefore + 1 &&
      rects(after.outline ?? "").find((box) => box.id === hub.id)?.x ===
        hub.x - 200,
    `tool: ${replaced.slice(0, 160)}\noutline:\n${after.outline}`
  );
  return lifted;
};

/** Check 5: the picture drawn after the last change, within 3 s, the same bytes from the export and the read. */
const pictureChecks = async (on: OnCanvas, id: string, lifted: number) => {
  const read = reader(on, id);
  const drawnAt = await until(
    "a picture drawn after the last change",
    () => read(),
    (answer) => Date.parse(answer.pictureAt ?? "") >= lifted,
    3000
  ).then(
    (answer) => ({ ms: Date.now() - lifted, at: answer.pictureAt }),
    () => null
  );
  const exported = await on.fleet.api<{
    file: { type: string };
    outline: string;
    png: string | null;
  }>(`/api/artifacts/${id}/export`);
  const bytes = exported.png ? Buffer.from(exported.png, "base64").length : 0;
  const withPng = await read("?png=true");
  on.kit.check(
    "5: the export answers a PNG over 1 KB within 3 s of the last change; artifact_read(png) answers the same bytes",
    !!drawnAt &&
      exported.file.type === "excalidraw" &&
      bytes > 1024 &&
      withPng.png === exported.png,
    `${drawnAt ? `drawn ${drawnAt.ms} ms after the lift (${drawnAt.at})` : "nothing drawn within 3 s of the lift"}; ${bytes} bytes; read's png ${withPng.png === exported.png ? "is the same" : "differs"}`
  );
};

const spec: Spec = { name: "canvas", run };
export default spec;
