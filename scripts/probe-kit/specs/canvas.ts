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
/** One of check 13's 29 cells in the outline. */
const CELL = /^cell-\d+ rectangle at /;

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
  await pressChecks(on, made.id, made.hub.id);
  await arrowChecks(on, made.id);
  await bindChecks(on);
  await frameChecks(on);
  await fitChecks(on);
  await themeChecks(on, made.id);
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

interface ProbeElement {
  boundElements?: { id: string; type: string }[] | null;
  frameId?: string | null;
  height: number;
  id: string;
  isDeleted?: boolean;
  points?: [number, number][];
  strokeColor?: string;
  type: string;
  width: number;
  x: number;
  y: number;
}

/** The page's binding as the probe hook shows it (scene.ts, `CAWCO_PROBE_HOOKS`). */
interface CanvasProbe {
  api: {
    getAppState: () => {
      offsetLeft: number;
      offsetTop: number;
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
    };
    scrollToContent: (
      target: ProbeElement,
      options: { animate: boolean; fitToContent: boolean }
    ) => void;
    setActiveTool: (tool: { type: string }) => void;
  };
  elements: () => ProbeElement[];
  live: {
    getArray: (name: string) => {
      toArray: () => { get: (key: string) => unknown }[];
    };
  };
}

/** An element's centre on the dashboard's screen, its zoom, and its x on the canvas. */
const screenOf = async (on: OnCanvas, frame: Frame, id: string) => {
  const inner = await frame.evaluate((elementId) => {
    const probe = (window as unknown as { cawcoCanvasProbe: CanvasProbe })
      .cawcoCanvasProbe;
    const el = probe.elements().find((one) => one.id === elementId);
    const state = probe.api.getAppState();
    const z = state.zoom.value;
    return el
      ? {
          x: (el.x + el.width / 2 + state.scrollX) * z + state.offsetLeft,
          y: (el.y + el.height / 2 + state.scrollY) * z + state.offsetTop,
          z,
          ex: el.x,
        }
      : null;
  }, id);
  const outer = await on.page.locator(PANEL_CANVAS).boundingBox();
  if (!(inner && outer)) {
    return null;
  }
  return {
    x: outer.x + inner.x,
    y: outer.y + inner.y,
    z: inner.z,
    ex: inner.ex,
  };
};

const elementX = (frame: Frame, id: string) =>
  frame.evaluate(
    (elementId) =>
      (window as unknown as { cawcoCanvasProbe: CanvasProbe }).cawcoCanvasProbe
        .elements()
        .find((one) => one.id === elementId)?.x ?? null,
    id
  );

/**
 * Checks 11 and 12: the first press in the panel's frame acts though the
 * dashboard has the focus, and a press (no drag) on an element tells the
 * dashboard's host which one (`cawco:element-press`); a drag tells nothing,
 * and a press on the empty canvas names no element.
 */
const pressChecks = async (on: OnCanvas, id: string, hubId: string) => {
  const frame = await canvasFrame(on.page);
  // The selection tool, and Hub in view, through Excalidraw's API: nothing here focuses the frame.
  await frame.evaluate((hub) => {
    const { api, elements } = (
      window as unknown as { cawcoCanvasProbe: CanvasProbe }
    ).cawcoCanvasProbe;
    api.setActiveTool({ type: "selection" });
    const el = elements().find((one) => one.id === hub);
    if (el) {
      api.scrollToContent(el, { animate: false, fitToContent: false });
    }
  }, hubId);
  await settle(on.page, 300);
  // What the dashboard's host hears: the pane's relay, sent from the dashboard's own window.
  await on.page.evaluate(() => {
    const kept = window as unknown as { __presses: unknown[] };
    kept.__presses = [];
    addEventListener("message", (event) => {
      if (
        event.source === window &&
        (event.data as { type?: string } | null)?.type === "cawco:element-press"
      ) {
        kept.__presses.push(event.data);
      }
    });
  });
  const presses = () =>
    on.page.evaluate(
      () =>
        (window as unknown as { __presses: Record<string, unknown>[] })
          .__presses
    );

  // 11. The dashboard has the focus; the frame does not.
  await on.page.locator("textarea").first().focus();
  const frameFocused = await frame.evaluate(() => document.hasFocus());
  const at = await screenOf(on, frame, hubId);
  if (!at) {
    on.kit.check("11: the Hub rectangle is on the canvas", false, "not found");
    return;
  }
  // What the frame hears through the drag, in order.
  await frame.evaluate(() => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    for (const type of ["focus", "blur"]) {
      addEventListener(type, () => heard.push(type), true);
    }
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ]) {
      addEventListener(
        type,
        (event) => {
          const last = heard.at(-1);
          const word = `${type}@${(event.target as Element).localName}`;
          if (last !== word) {
            heard.push(word);
          }
        },
        true
      );
    }
  });
  await on.page.mouse.move(at.x, at.y);
  await on.page.mouse.down();
  await on.page.mouse.move(at.x + 60, at.y, { steps: 8 });
  await on.page.mouse.up();
  await settle(on.page, 300);
  const trace = await frame.evaluate(() => {
    const selected = (
      window as unknown as {
        cawcoCanvasProbe: {
          api: { getAppState: () => { selectedElementIds: object } };
        };
      }
    ).cawcoCanvasProbe.api.getAppState().selectedElementIds;
    return `${(window as unknown as { __heard: string[] }).__heard.join(" ")}; selected ${Object.keys(selected).join(",") || "none"}`;
  });
  const moved = await elementX(frame, hubId);
  on.kit.check(
    "11: in the panel's frame without the focus, the first drag from Hub's centre moves it (60px on screen)",
    !frameFocused && moved !== null && Math.abs(moved - at.ex - 60 / at.z) <= 2,
    `frame had the focus ${frameFocused}; x ${at.ex} → ${moved} (expected +${(60 / at.z).toFixed(1)} at zoom ${at.z}); the frame heard ${trace}`
  );
  const afterDrag = (await presses()).length;

  // 12. A press on Hub, then one on the empty canvas.
  const now = await screenOf(on, frame, hubId);
  if (now) {
    await on.page.mouse.click(now.x, now.y);
  }
  const box = await on.page.locator(PANEL_CANVAS).boundingBox();
  if (box) {
    await on.page.mouse.click(box.x + 60, box.y + box.height - 60);
  }
  const heard = await until(
    "two presses at the dashboard's host",
    presses,
    (all) => all.length >= 2,
    5000
  ).catch(presses);
  const [onHub, onEmpty] = heard as {
    artifact?: string;
    element?: { id: string; text: string; type: string; box: object } | null;
    pointer?: string;
    modifiers?: object;
    screen?: { x: number; y: number };
  }[];
  on.kit.check(
    "12: a press on Hub posts cawco:element-press with its id, type and text; a drag posts nothing; a press on the empty canvas posts element null",
    afterDrag === 0 &&
      onHub?.artifact === id &&
      onHub.element?.id === hubId &&
      onHub.element.text === "Hub" &&
      onHub.element.type === "rectangle" &&
      onHub.pointer === "mouse" &&
      !!onHub.modifiers &&
      !!onHub.screen &&
      onEmpty?.element === null,
    `after the drag ${afterDrag}; ${JSON.stringify(heard).slice(0, 600)}`
  );
};

/** Check 14: a skeleton arrow with a 0 width or height lands where it was put, that long. */
const arrowChecks = async (on: OnCanvas, id: string) => {
  await on.call(UPDATE, {
    id,
    elements: [
      { type: "arrow", id: "down", x: 0, y: 0, width: 0, height: 120 },
      { type: "arrow", id: "across", x: 0, y: 200, width: 150, height: 0 },
    ],
  });
  const outline = (await reader(on, id)()).outline ?? "";
  const stored = await (await canvasFrame(on.page)).evaluate(() => {
    const probe = (window as unknown as { cawcoCanvasProbe: CanvasProbe })
      .cawcoCanvasProbe;
    const live = probe.live
      .getArray("elements")
      .toArray()
      .map((map) => map.get("el") as ProbeElement)
      .filter((el) => el.id === "down" || el.id === "across")
      .map((el) => ({ id: el.id, x: el.x, y: el.y, points: el.points }));
    const scene = probe
      .elements()
      .filter((el) => el.id === "down" || el.id === "across")
      .map((el) => ({ id: el.id, x: el.x, y: el.y, points: el.points }));
    return { live, scene };
  });
  const down = outline
    .split("\n")
    .find((line) => line.startsWith("arrow down:"));
  const across = outline
    .split("\n")
    .find((line) => line.startsWith("arrow across:"));
  on.kit.check(
    "14: {arrow, width 0, height 120} reads back 0×120 at 0,0, and {width 150, height 0} 150×0 at 0,200",
    down === "arrow down: free → free at 0,0 0×120" &&
      across === "arrow across: free → free at 0,200 150×0",
    `${down}; ${across}; stored ${JSON.stringify(stored)}`
  );
};

/** The live doc's elements and Excalidraw's, not deleted, on the page in the panel. */
const counts = (frame: Frame) =>
  frame.evaluate(() => {
    const probe = (window as unknown as { cawcoCanvasProbe?: CanvasProbe })
      .cawcoCanvasProbe;
    if (!probe) {
      return null;
    }
    return {
      doc: probe.live
        .getArray("elements")
        .toArray()
        .filter((map) => !(map.get("el") as { isDeleted?: boolean }).isDeleted)
        .length,
      scene: probe.elements().length,
    };
  });

/** Reloads the panel's canvas page and answers its frame once it has drawn again. */
const reloaded = async (on: OnCanvas, frame: Frame) => {
  await frame.evaluate(() => location.reload());
  await settle(on.page, 500);
  return await canvasFrame(on.page);
};

/**
 * Check 13: a canvas that already holds 29 elements keeps them through a
 * reload of its page, the doc and Excalidraw's scene alike; and so with
 * the doc's sync held back until after the page has bound.
 */
const bindChecks = async (on: OnCanvas) => {
  const many = Array.from({ length: 29 }, (_, i) => ({
    type: "rectangle",
    id: `cell-${i}`,
    x: (i % 6) * 140,
    y: Math.floor(i / 6) * 90,
    width: 120,
    height: 60,
  }));
  const made = await on.call(CREATE, {
    kind: "canvas",
    name: "many",
    elements: many,
  });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    on.kit.check(
      "13: the 29-element canvas is made",
      false,
      made.slice(0, 300)
    );
    return;
  }
  let frame = await until(
    "the 29-element canvas in the panel",
    async () => {
      const found = await canvasFrame(on.page);
      const now = await counts(found);
      return now?.scene === 29 ? found : null;
    },
    Boolean,
    30_000
  );
  frame = await reloaded(on, frame as Frame);
  await settle(on.page, 2500);
  const reload = await counts(frame);
  const cells = async () =>
    ((await reader(on, id)()).outline ?? "")
      .split("\n")
      .filter((line) => CELL.test(line)).length;
  const hubCount = await cells();

  // The sync held back 1.5 s, so the page binds before the hub's doc arrives.
  const socket = new RegExp(`__cawco/artifact/${id}`);
  await on.page.context().routeWebSocket(socket, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      setTimeout(() => ws.send(message), 1500);
    });
  });
  frame = await reloaded(on, frame);
  await settle(on.page, 4000);
  const delayed = await counts(frame);
  const hubAfter = await cells();
  await on.page.context().unrouteAll({ behavior: "ignoreErrors" });
  on.kit.check(
    "13: a canvas holding 29 elements keeps 29 in the doc and in Excalidraw's scene after a reload, and after one with the sync held past the bind",
    reload?.doc === 29 &&
      reload.scene === 29 &&
      hubCount === 29 &&
      delayed?.doc === 29 &&
      delayed.scene === 29 &&
      hubAfter === 29,
    `reload ${JSON.stringify(reload)}, hub ${hubCount}; sync held ${JSON.stringify(delayed)}, hub ${hubAfter}`
  );
};

/**
 * Check 15: an arrow between cards in two frames belongs to no frame (a
 * frame clips what stands outside it), its line spanning both cards; one
 * between two cards of one frame keeps the frame.
 */
const frameChecks = async (on: OnCanvas) => {
  const made = await on.call(CREATE, {
    kind: "canvas",
    name: "frames",
    elements: [
      {
        type: "rectangle",
        id: "cta",
        x: 40,
        y: 60,
        width: 160,
        height: 60,
        label: { text: "CTA" },
      },
      {
        type: "rectangle",
        id: "cta-2",
        x: 40,
        y: 200,
        width: 160,
        height: 60,
        label: { text: "Second" },
      },
      {
        type: "rectangle",
        id: "install",
        x: 520,
        y: 60,
        width: 160,
        height: 60,
        label: { text: "Install" },
      },
      {
        type: "frame",
        id: "launch",
        children: ["cta", "cta-2"],
        name: "Launch",
      },
      { type: "frame", id: "setup", children: ["install"], name: "Setup" },
      {
        type: "arrow",
        id: "across-frames",
        x: 200,
        y: 90,
        width: 320,
        height: 0,
        start: { id: "cta" },
        end: { id: "install" },
      },
      {
        type: "arrow",
        id: "in-frame",
        x: 120,
        y: 120,
        start: { id: "cta" },
        end: { id: "cta-2" },
      },
    ],
  });
  if (!made.match(ANSWERED_ID)) {
    on.kit.check("15: the framed canvas is made", false, made.slice(0, 300));
    return;
  }
  const frame = await canvasFrame(on.page);
  const read = await until(
    "the framed canvas's arrows",
    () =>
      frame.evaluate(() => {
        const all = (
          window as unknown as { cawcoCanvasProbe: CanvasProbe }
        ).cawcoCanvasProbe.elements();
        const by = (key: string) => all.find((el) => el.id === key);
        return {
          across: by("across-frames"),
          inFrame: by("in-frame"),
          cta: by("cta"),
          install: by("install"),
        };
      }),
    (now) => !!(now.across && now.inFrame && now.cta && now.install),
    15_000
  );
  const { across, inFrame, cta, install } = read;
  const span = across?.points?.map(([px]) => (across.x ?? 0) + px) ?? [];
  on.kit.check(
    "15: an arrow from a card in one frame to a card in another has no frame and spans both cards; one inside a frame keeps it",
    across?.frameId === null &&
      !!cta &&
      !!install &&
      Math.min(...span) <= cta.x + cta.width + 2 &&
      Math.max(...span) >= install.x - 2 &&
      inFrame?.frameId === "launch",
    `across ${JSON.stringify({ frameId: across?.frameId, x: across?.x, points: across?.points })}; in-frame ${inFrame?.frameId}`
  );
};

/**
 * Check 16: a drawing far from the origin opens fitted: every element's box
 * on screen inside the frame, on a phone and at a desk; the file's places
 * unchanged.
 */
const fitChecks = async (on: OnCanvas) => {
  const far = [
    {
      type: "rectangle",
      id: "far-a",
      x: 2000,
      y: 1500,
      width: 200,
      height: 120,
    },
    {
      type: "rectangle",
      id: "far-b",
      x: 2400,
      y: 1500,
      width: 200,
      height: 120,
    },
    { type: "ellipse", id: "far-c", x: 2200, y: 1780, width: 200, height: 120 },
  ];
  const made = await on.call(CREATE, {
    kind: "canvas",
    name: "far",
    elements: far,
  });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    on.kit.check("16: the far canvas is made", false, made.slice(0, 300));
    return;
  }
  const inside: string[] = [];
  for (const [view, size] of [
    ["phone", { width: 390, height: 844 }],
    ["desk", { width: 1280, height: 800 }],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one viewport at a time, each its own page
    const page = await on.kit.page(view);
    await page.setViewportSize(size);
    await open(
      page,
      `${new URL(on.page.url()).origin}/artifact/${id}`,
      ".canvas-stage iframe"
    );
    const frame = await until(
      `the far canvas on the ${view}`,
      async () => {
        const handle = await page
          .locator(".canvas-stage iframe")
          .elementHandle();
        const found = await handle?.contentFrame();
        return found &&
          (await found.locator(".canvas-host .excalidraw").count()) === 1
          ? found
          : null;
      },
      Boolean,
      60_000
    );
    await settle(page, 1500);
    const placed = await (frame as Frame).evaluate(() => {
      const probe = (window as unknown as { cawcoCanvasProbe: CanvasProbe })
        .cawcoCanvasProbe;
      const state = probe.api.getAppState();
      const z = state.zoom.value;
      return {
        z,
        width: innerWidth,
        height: innerHeight,
        boxes: probe.elements().map((el) => ({
          id: el.id,
          left: (el.x + state.scrollX) * z,
          top: (el.y + state.scrollY) * z,
          right: (el.x + el.width + state.scrollX) * z,
          bottom: (el.y + el.height + state.scrollY) * z,
        })),
      };
    });
    const out = placed.boxes.filter(
      (box) =>
        box.left < 0 ||
        box.top < 0 ||
        box.right > placed.width ||
        box.bottom > placed.height
    );
    inside.push(
      `${view} ${placed.width}×${placed.height} zoom ${placed.z.toFixed(3)}: ${placed.boxes.length} boxes, ${out.length === 0 ? "all inside" : `outside ${out.map((box) => box.id).join(", ")}`}`
    );
    await page.close();
  }
  const outline = (await reader(on, id)()).outline ?? "";
  on.kit.check(
    "16: a drawing at x 2000–2600, y 1500–1900 opens fitted, every element inside the frame on a phone and at a desk; the file's places unchanged",
    inside.every((line) => line.includes("3 boxes, all inside")) &&
      outline.includes("far-a rectangle at 2000,1500 200×120") &&
      outline.includes("far-b rectangle at 2400,1500 200×120"),
    `${inside.join("; ")}; outline ${outline.replaceAll("\n", " | ")}`
  );
};

/**
 * Check 17: the canvas draws in the dashboard's theme, never the OS's:
 * with the system dark and the dashboard light its ground is the day
 * value and Excalidraw's theme light; the reverse the other way; an
 * agent's stroke is the day ink either way (Excalidraw's dark theme
 * inverts it).
 */
const themeChecks = async (on: OnCanvas, id: string) => {
  const lines: string[] = [];
  let ok = true;
  for (const [dashboard, system] of [
    ["light", "dark"],
    ["dark", "light"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one theme at a time, each its own page
    const page = await on.kit.page("desk", { theme: dashboard });
    await page.emulateMedia({ colorScheme: system });
    await open(
      page,
      `${new URL(on.page.url()).origin}/artifact/${id}`,
      ".canvas-stage iframe"
    );
    const frame = await until(
      `the canvas, dashboard ${dashboard}`,
      async () => {
        const handle = await page
          .locator(".canvas-stage iframe")
          .elementHandle();
        const found = await handle?.contentFrame();
        return found &&
          (await found.locator(".canvas-host .excalidraw").count()) === 1
          ? found
          : null;
      },
      Boolean,
      60_000
    );
    await settle(page, 800);
    const read = await (frame as Frame).evaluate(() => {
      const value = (scheme: string) => {
        const probe = document.createElement("span");
        probe.style.cssText = `color-scheme: ${scheme}; background: var(--surface-raised); display: block`;
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      };
      const stroke = (
        window as unknown as { cawcoCanvasProbe: CanvasProbe }
      ).cawcoCanvasProbe
        .elements()
        .find((el) => el.type === "rectangle")?.strokeColor;
      // `ink-strong` by day as a hex, as scene.ts's tokenHex stores it.
      const ink = document.createElement("span");
      ink.style.cssText =
        "color-scheme: light; color: var(--ink-strong); display: none";
      document.body.append(ink);
      const paint = document.createElement("canvas").getContext("2d");
      let dayInk = "";
      if (paint) {
        paint.fillStyle = getComputedStyle(ink).color;
        paint.fillRect(0, 0, 1, 1);
        const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
        dayInk = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
      }
      ink.remove();
      return {
        dayInk,
        ground: getComputedStyle(document.body).backgroundColor,
        day: value("light"),
        night: value("dark"),
        excalidraw: document
          .querySelector(".excalidraw")
          ?.classList.contains("theme--dark")
          ? "dark"
          : "light",
        stroke,
      };
    });
    const expected = dashboard === "light" ? read.day : read.night;
    const pass =
      read.day !== read.night &&
      read.ground === expected &&
      read.excalidraw === dashboard &&
      !!read.dayInk &&
      read.stroke === read.dayInk;
    ok &&= pass;
    lines.push(
      `dashboard ${dashboard}, system ${system}: ${JSON.stringify(read)}`
    );
    await page.close();
  }
  on.kit.check(
    "17: the canvas draws in the dashboard's theme under either system scheme: its ground and Excalidraw's theme follow the dashboard, the agent's stroke stays the day ink",
    ok && lines.length === 2,
    lines.join(" | ")
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
