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
 * 18–25. A pen stroke held still at its end becomes its shape (snap.ts):
 *     a wobbly rectangle held 400 ms is one rectangle on its box, in one
 *     transaction, undone in one step, and the page posts its host
 *     `cawco:snap`; lifted without the hold, or drawn with the mouse, or a
 *     scribble, it stays ink; an ellipse, a triangle, a line and a hooked
 *     arrow read as theirs; the pencil's double-tap swaps the eraser's glyph
 *     into the pen's box and back, as Send and Stop swap; the swap's two
 *     opacities run on one clock of `--dur-fade`, the same with reduced
 *     motion, as the agent's elements still fade up there.
 * 26. Images: a 32×32 PNG pasted on the canvas (a `paste` event with the
 *     file on its clipboardData) is an image element on both screens joined
 *     to it, its file in each one's doc `files`; the outline reads
 *     `image <id> at x,y 32×32`; the export's canvas.excalidraw holds the
 *     file and its PNG draws the image (the empty canvas exports none); a
 *     5 MB PNG and a .txt are refused over the grid with their sentences,
 *     and nothing is added.
 *
 * The scratch hub builds the canvas page with `CAWCO_PROBE_HOOKS=1` (core
 * canvas-host.ts), which exposes the binding as `window.cawcoCanvasProbe`.
 */
import type { CDPSession, Frame, Page } from "playwright-core";
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

const runSpec = async (kit: Kit) => {
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
  await shapeChecks(on);
  await emptyChecks(on);
  await imageChecks(on);

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

/** The two refusals, as WORDS.md's error formula has them (images.ts). */
const TOO_BIG =
  "That image is 5 MB, and a canvas image can be 4 MB at most, so it wasn't added. Shrink it, then paste it again.";
const NOT_IMAGE =
  "A .txt file isn't an image the canvas takes (PNG, JPEG, WebP, SVG or GIF), so it wasn't added.";

/** A canvas's frame in a page's panel, by its artifact id, once its host page has drawn. */
const frameOf = async (page: Page, id: string): Promise<Frame> => {
  const sel = `.canvas-stage.docked[data-artifact="${id}"] iframe`;
  await until(
    "the canvas in the panel",
    () => page.frameLocator(sel).locator(".canvas-host .excalidraw").count(),
    (count) => count === 1,
    60_000
  );
  const frame = await (await page.locator(sel).elementHandle())?.contentFrame();
  if (!frame) {
    throw new Error("the panel's frame has no document");
  }
  return frame;
};

/** The page's image elements and whether each one's file is in its doc's `files`. */
const imagesOn = (frame: Frame) =>
  frame.evaluate(() => {
    const probe = (
      window as unknown as {
        cawcoCanvasProbe: {
          elements: () => ProbeElement[];
          live: { getMap: (name: string) => { has: (key: string) => boolean } };
        };
      }
    ).cawcoCanvasProbe;
    const files = probe.live.getMap("files");
    return probe
      .elements()
      .filter((el) => el.type === "image")
      .map((el) => ({
        id: el.id,
        fileId: el.fileId ?? "",
        width: Math.round(el.width),
        height: Math.round(el.height),
        filed: !!el.fileId && files.has(el.fileId),
      }));
  });

/** A `paste` on the canvas's document carrying one file, made in the page: a 32×32 red PNG, or `bytes` of zeros as `name`. */
const pasteFile = (
  frame: Frame,
  file:
    | { kind: "red" }
    | { kind: "blank"; name: string; type: string; bytes: number }
) =>
  frame.evaluate(async (what) => {
    let made: File;
    if (what.kind === "red") {
      const art = document.createElement("canvas");
      art.width = 32;
      art.height = 32;
      const paint = art.getContext("2d") as CanvasRenderingContext2D;
      paint.fillStyle = "#ff0000";
      paint.fillRect(0, 0, 32, 32);
      const blob = await new Promise<Blob>((done) =>
        art.toBlob((b) => done(b as Blob), "image/png")
      );
      made = new File([blob], "red.png", { type: "image/png" });
    } else {
      made = new File([new Uint8Array(what.bytes)], what.name, {
        type: what.type,
      });
    }
    const data = new DataTransfer();
    data.items.add(made);
    document.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
    );
  }, file);

/** The refusal standing over the grid, once it shows. */
const refusalOn = (frame: Frame) =>
  until(
    "the refusal over the grid",
    () =>
      frame.evaluate(
        () => document.querySelector(".canvas-refusal")?.textContent ?? null
      ),
    Boolean,
    3000
  ).catch(() => null);

/**
 * Check 26: images. A pasted 32×32 PNG reaches both screens joined to the
 * canvas with its file, reads in the outline, and is in the export's file
 * and drawn in its PNG; a 5 MB PNG and a .txt are refused with their
 * sentences and add nothing.
 */
const imageChecks = async (on: OnCanvas) => {
  const { kit, page, fleet, session } = on;
  const made = await on.call(CREATE, { kind: "canvas", name: "images" });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("26: the image canvas is made", false, made.slice(0, 300));
    return;
  }
  const frame = await frameOf(page, id);
  // A second screen joined to the same canvas: its own browser, its panel showing it.
  const other = await kit.page("desk");
  other.on("pageerror", (error) =>
    on.said.push(`pageerror (second screen): ${error.message}`)
  );
  await open(
    other,
    `${await fleet.dashboard()}/session/${session}`,
    "textarea"
  );
  await fleet.api(`/api/instances/${session}/artifacts/${id}/show`, {});
  const otherFrame = await frameOf(other, id);
  const empty = await fleet.api<{ png: string | null }>(
    `/api/artifacts/${id}/export`
  );

  // A press on the canvas with Select (clear of the empty state's Draw), as
  // a person's paste follows one: Excalidraw takes a paste only while it
  // has the focus, and places it at the pointer.
  const well = (await page
    .locator(`.canvas-stage.docked[data-artifact="${id}"] iframe`)
    .boundingBox()) as { x: number; y: number; width: number; height: number };
  await frame.click('.rail-box[aria-label^="Select"]');
  await page.mouse.click(
    well.x + well.width * 0.3,
    well.y + well.height * 0.75
  );
  await pasteFile(frame, { kind: "red" });
  const here = await until(
    "the pasted image with its file",
    () => imagesOn(frame),
    (images) => images.length === 1 && images[0].filed,
    10_000
  ).catch(() => imagesOn(frame));
  const there = await until(
    "the image on the second screen",
    () => imagesOn(otherFrame),
    (images) => images.length === 1 && images[0].filed,
    10_000
  ).catch(() => imagesOn(otherFrame));
  const [image] = here;
  kit.check(
    "26: a pasted 32×32 PNG is an image element on both screens joined to the canvas, its file in each one's doc files",
    here.length === 1 &&
      image.width === 32 &&
      image.height === 32 &&
      image.filed &&
      there.length === 1 &&
      there[0].id === image.id &&
      there[0].filed,
    `here ${JSON.stringify(here)}; there ${JSON.stringify(there)}`
  );
  const outline = (await reader(on, id)()).outline ?? "";
  kit.check(
    "26: the outline reads the image as `image <id> at x,y 32×32`",
    !!image &&
      new RegExp(`^image ${image.id} at -?\\d+,-?\\d+ 32×32$`, "m").test(
        outline
      ),
    outline
  );

  // The export: its file in canvas.excalidraw, and its PNG draws the red square.
  const exported = await until(
    "the picture with the image",
    () =>
      fleet.api<{
        file: { files: Record<string, { dataURL?: string }> };
        png: string | null;
      }>(`/api/artifacts/${id}/export`),
    (answer) => !!answer.png,
    10_000
  ).catch(() =>
    fleet.api<{
      file: { files: Record<string, { dataURL?: string }> };
      png: string | null;
    }>(`/api/artifacts/${id}/export`)
  );
  const red = exported.png
    ? await page.evaluate(async (png) => {
        const picture = new Image();
        picture.src = `data:image/png;base64,${png}`;
        await picture.decode();
        const art = document.createElement("canvas");
        art.width = picture.naturalWidth;
        art.height = picture.naturalHeight;
        const paint = art.getContext("2d") as CanvasRenderingContext2D;
        paint.drawImage(picture, 0, 0);
        const { data } = paint.getImageData(0, 0, art.width, art.height);
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
            count += 1;
          }
        }
        return count;
      }, exported.png)
    : 0;
  const filed = !!image && !!exported.file.files[image.fileId]?.dataURL;
  kit.check(
    "26: canvas.excalidraw holds the image's file, and the export's PNG draws it where the empty canvas had none",
    empty.png === null && !!exported.png && red >= 32 * 32 && filed,
    `empty png ${empty.png === null ? "none" : "some"}; png ${exported.png ? `${exported.png.length} chars` : "none"}; red pixels ${red}; file ${filed}`
  );

  // The refusals.
  await pasteFile(frame, {
    kind: "blank",
    name: "big.png",
    type: "image/png",
    bytes: 5 * 1024 * 1024,
  });
  const big = await refusalOn(frame);
  // No timer takes it away: 3 s on it stands whole, nothing running on it.
  await page.waitForTimeout(3000);
  const standing = await frame.evaluate(() => {
    const band = document.querySelector(".canvas-refusal");
    return band
      ? {
          opacity: Number(getComputedStyle(band).opacity),
          running: band
            .getAnimations()
            .filter((run) => run.playState === "running").length,
        }
      : null;
  });
  // A press on the grid takes it away: one fade on opacity over --dur-exit,
  // held still as it is read.
  await page.mouse.move(well.x + well.width * 0.6, well.y + well.height * 0.85);
  await page.mouse.down();
  const leaving = await frame.evaluate(() => {
    const band = document.querySelector(".canvas-refusal");
    const runs = band?.getAnimations() ?? [];
    for (const run of runs) {
      run.pause();
    }
    const exit = getComputedStyle(document.documentElement)
      .getPropertyValue("--dur-exit")
      .trim();
    const read = runs.map((run) => {
      const effect = run.effect as KeyframeEffect;
      return {
        name: (run as Animation & { animationName?: string }).animationName,
        duration: Number(effect.getTiming().duration),
        props: [
          ...new Set(
            effect
              .getKeyframes()
              .flatMap((keyframe) =>
                Object.keys(keyframe).filter(
                  (key) =>
                    ![
                      "offset",
                      "easing",
                      "composite",
                      "computedOffset",
                    ].includes(key)
                )
              )
          ),
        ],
      };
    });
    for (const run of runs) {
      run.play();
    }
    return {
      exit: exit.endsWith("ms")
        ? Number.parseFloat(exit)
        : Number.parseFloat(exit) * 1000,
      runs: read,
    };
  });
  await page.mouse.up();
  const gone = await until(
    "the refusal gone",
    () =>
      frame.evaluate(() => document.querySelector(".canvas-refusal") === null),
    Boolean,
    3000
  ).catch(() => false);
  kit.check(
    "26: the refusal stands with no timer (3 s on: opacity 1, nothing running), and a press on the grid fades it out on one --dur-exit run of opacity",
    !!standing &&
      standing.opacity === 1 &&
      standing.running === 0 &&
      leaving.runs.length === 1 &&
      leaving.runs[0].name === "canvas-refusal-out" &&
      leaving.runs[0].duration === leaving.exit &&
      leaving.runs[0].props.join() === "opacity" &&
      gone,
    `3 s on ${JSON.stringify(standing)}; pressed ${JSON.stringify(leaving)}; gone ${gone}`
  );
  await pasteFile(frame, {
    kind: "blank",
    name: "notes.txt",
    type: "text/plain",
    bytes: 5,
  });
  const text = await until(
    "the .txt refusal",
    () =>
      frame.evaluate(
        () => document.querySelector(".canvas-refusal")?.textContent ?? null
      ),
    (said) => said === NOT_IMAGE,
    3000
  ).catch(() => refusalOn(frame));
  await settle(page, 500);
  const still = await imagesOn(frame);
  kit.check(
    "26: a 5 MB PNG and a .txt are refused over the grid with their sentences, and nothing is added",
    big === TOO_BIG && text === NOT_IMAGE && still.length === 1,
    `5 MB: ${big}; .txt: ${text}; images ${still.length}`
  );
  await other.close();
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
  customData?: { shape?: string } | null;
  fileId?: string | null;
  frameId?: string | null;
  height: number;
  id: string;
  isDeleted?: boolean;
  opacity?: number;
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
      activeTool: { type: string };
      offsetLeft: number;
      offsetTop: number;
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
    };
    getSceneElementsIncludingDeleted: () => ProbeElement[];
    scrollToContent: (
      target: ProbeElement,
      options: { animate: boolean; fitToContent: boolean }
    ) => void;
    setActiveTool: (tool: { type: string }) => void;
  };
  elements: () => ProbeElement[];
  live: {
    getArray: (name: string) => {
      observeDeep: (
        heard: (events: unknown[], transaction: { origin: unknown }) => void
      ) => void;
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

/*
 * Checks 18–24: a held stroke snaps to its shape (snap.ts).
 */

type Pt = [number, number];

/** A seeded tremor: the same strokes on every run. */
const tremor = (seed: number) => {
  let s = seed;
  return (amount: number) => {
    s = (s * 16_807) % 2_147_483_647;
    return ((s / 2_147_483_647) * 2 - 1) * amount;
  };
};

/** Points along `corners`, `per` to a side, each off by up to `jitter` px. */
const along = (corners: Pt[], per: number, jitter: number): Pt[] => {
  const off = tremor(7);
  const out: Pt[] = [];
  for (let i = 1; i < corners.length; i += 1) {
    const [a, b] = [corners[i - 1], corners[i]];
    for (let step = 0; step < per; step += 1) {
      const t = step / per;
      out.push([
        a[0] + (b[0] - a[0]) * t + off(jitter),
        a[1] + (b[1] - a[1]) * t + off(jitter),
      ]);
    }
  }
  out.push(corners.at(-1) as Pt);
  return out;
};

/** The strokes, `s` px across, in the frame's px from where each is put. */
const strokesOf = (s: number) => {
  const h = 0.6 * s;
  const off = tremor(11);
  return {
    rectangle: along(
      [
        [0, 0],
        [s, 0],
        [s, h],
        [0, h],
        [0, 4],
      ],
      16,
      2.5
    ),
    ellipse: Array.from({ length: 73 }, (_, i): Pt => {
      const a = (i / 72) * 2 * Math.PI;
      return [
        s / 2 + (s / 2) * Math.cos(a) + off(2),
        h / 2 + (h / 2) * Math.sin(a) + off(2),
      ];
    }),
    triangle: along(
      [
        [0, h],
        [s / 2, 0],
        [s, h],
        [2, h - 2],
      ],
      16,
      2
    ),
    line: along(
      [
        [0, 0],
        [s, 0.25 * s],
      ],
      30,
      1.5
    ),
    arrow: along(
      [
        [0, 0.2 * s],
        [s, 0.2 * s],
        [0.91 * s, 0.135 * s],
      ],
      20,
      1
    ),
    scribble: Array.from(
      { length: 60 },
      // Clear of the ink icon an earlier stroke left at the corner.
      (_, i): Pt => [
        48 + (i * s) / 60 + off(12),
        48 + (i % 2 ? h : 0) + off(0.3 * h),
      ]
    ),
  };
};
type Strokes = ReturnType<typeof strokesOf>;

/** The pen (or the mouse) on the panel's frame, through the DevTools protocol. */
interface Pen {
  cdp: CDPSession;
  draw: (
    points: Pt[],
    at: Pt,
    how: { hold: boolean; pointer?: "pen" | "mouse" }
  ) => Promise<void>;
}

const penOn = async (on: OnCanvas): Promise<Pen> => {
  const well = await on.page.locator(PANEL_CANVAS).boundingBox();
  if (!well) {
    throw new Error("the panel's frame has no box");
  }
  const cdp = await on.page.context().newCDPSession(on.page);
  const send = (
    type: "mousePressed" | "mouseMoved" | "mouseReleased",
    [x, y]: Pt,
    pointerType: "pen" | "mouse"
  ) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      x: well.x + x,
      y: well.y + y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
      pointerType,
      force: 0.5,
    });
  return {
    cdp,
    draw: async (points, [ox, oy], { hold, pointer = "pen" }) => {
      const placed = points.map(([x, y]): Pt => [ox + x, oy + y]);
      const last = placed.at(-1) as Pt;
      await send("mousePressed", placed[0], pointer);
      for (const point of placed.slice(1)) {
        // biome-ignore lint/performance/noAwaitInLoops: a stroke's points, one after another
        await send("mouseMoved", point, pointer);
      }
      if (hold) {
        // The hand held still for 400 ms, a pixel's tremor inside the 4px.
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, 0],
        ]) {
          // biome-ignore lint/performance/noAwaitInLoops: a hold, moment by moment
          await Bun.sleep(100);
          await send("mouseMoved", [last[0] + dx, last[1] + dy], pointer);
        }
      }
      await send("mouseReleased", last, pointer);
    },
  };
};

/** Every element of Excalidraw's scene, the deleted ones too. */
const sceneOf = (frame: Frame) =>
  frame.evaluate(() =>
    (
      window as unknown as { cawcoCanvasProbe: CanvasProbe }
    ).cawcoCanvasProbe.api
      .getSceneElementsIncludingDeleted()
      .map((el) => ({
        id: el.id,
        type: el.type,
        isDeleted: !!el.isDeleted,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        points: el.points,
        opacity: el.opacity,
        customData: el.customData ?? null,
      }))
  );

/** The ids of the live doc's elements. */
const docIds = (frame: Frame) =>
  frame.evaluate(() =>
    (
      window as unknown as { cawcoCanvasProbe: CanvasProbe }
    ).cawcoCanvasProbe.live
      .getArray("elements")
      .toArray()
      .map((map) => (map.get("el") as { id: string }).id)
  );

/** An element's box on the canvas, from its points when it has them. */
const boxIn = (el: ProbeElement) => {
  if (!el.points?.length) {
    return { x: el.x, y: el.y, w: el.width, h: el.height };
  }
  const xs = el.points.map(([px]) => el.x + px);
  const ys = el.points.map(([, py]) => el.y + py);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
};

interface Drawn {
  /** Elements of the scene deleted by the stroke, beside its own. */
  deleted: number;
  /** What the scene holds after that it did not before, for the record. */
  fresh: string[];
  /** What the stroke left that is not ink. */
  made: ProbeElement[];
  /** The stroke's own freedraw, deleted or not. */
  stroke?: ProbeElement & { isDeleted: boolean };
}

/** Draws one stroke and answers what it left, once any swap has run out. */
const drawnBy = async (
  on: OnCanvas,
  frame: Frame,
  pen: Pen,
  points: Pt[],
  at: Pt,
  how: { hold: boolean; pointer?: "pen" | "mouse" }
): Promise<Drawn> => {
  const before = await sceneOf(frame);
  const seen = new Set(Object.keys((await heard(frame)).els));
  const standing = new Set(
    before.filter((el) => !el.isDeleted).map((el) => el.id)
  );
  await pen.draw(points, at, how);
  await settle(on.page, 700);
  const after = await sceneOf(frame);
  const live = new Set(after.filter((el) => !el.isDeleted).map((el) => el.id));
  // The stroke as the doc last held it: a deleted element leaves Excalidraw's
  // scene at the doc's next change (y-excalidraw rebuilds it from the doc).
  const stroke = Object.values((await heard(frame)).els).findLast(
    (el) => el.type === "freedraw" && !seen.has(el.id)
  );
  return {
    stroke: stroke && { ...stroke, isDeleted: !live.has(stroke.id) },
    made: after.filter(
      (el) => !(standing.has(el.id) || el.isDeleted) && el.type !== "freedraw"
    ),
    deleted: [...standing].filter((id) => !live.has(id)).length,
    fresh: after
      .filter((el) => !standing.has(el.id))
      .map((el) => `${el.type}${el.isDeleted ? " (deleted)" : ""}`),
  };
};

/**
 * Counts the frame's `cawco:stroke-end`s, logs the live doc's ids after each
 * of its transactions, and keeps every element the doc has held, as it last
 * held it.
 */
const listen = (frame: Frame) =>
  frame.evaluate(() => {
    const kept = window as unknown as {
      __strokeEnds: number;
      __docLog: string[][];
      __docEls: Record<string, ProbeElement>;
      cawcoCanvasProbe: CanvasProbe;
    };
    kept.__strokeEnds = 0;
    kept.__docLog = [];
    kept.__docEls = {};
    addEventListener("cawco:stroke-end", () => {
      kept.__strokeEnds += 1;
    });
    const array = kept.cawcoCanvasProbe.live.getArray("elements");
    const look = () => {
      const els = array.toArray().map((map) => map.get("el") as ProbeElement);
      for (const el of els) {
        kept.__docEls[el.id] = el;
      }
      return els.map((el) => el.id);
    };
    look();
    array.observeDeep(() => {
      kept.__docLog.push(look());
    });
  });

const heard = (frame: Frame) =>
  frame.evaluate(() => {
    const kept = window as unknown as {
      __strokeEnds: number;
      __docLog: string[][];
      __docEls: Record<string, ProbeElement>;
    };
    return { ends: kept.__strokeEnds, log: kept.__docLog, els: kept.__docEls };
  });

/** Keeps every `cawco:snap` the canvas's frame posts the dashboard (its host). */
const hearSnaps = (on: OnCanvas) =>
  on.page.evaluate(() => {
    const kept = window as unknown as { __snaps: { id?: string }[] };
    kept.__snaps = [];
    addEventListener("message", (event) => {
      if (
        event.source !== window &&
        (event.data as { type?: string } | null)?.type === "cawco:snap"
      ) {
        kept.__snaps.push(event.data);
      }
    });
  });

const snapsHeard = (on: OnCanvas) =>
  on.page.evaluate(
    () => (window as unknown as { __snaps: { id?: string }[] }).__snaps
  );

/** Check 18: the held rectangle, its one transaction, its stamp, its message to the host, and one undo. */
const rectangleCheck = async (
  on: OnCanvas,
  frame: Frame,
  pen: Pen,
  strokes: Strokes,
  at: Pt
) => {
  const { ends } = await heard(frame);
  const held = await drawnBy(on, frame, pen, strokes.rectangle, at, {
    hold: true,
  });
  const [shape] = held.made;
  const { stroke } = held;
  const after = await heard(frame);
  // The doc's transaction that brought the shape is the one that took the stroke.
  const at1 = shape ? after.log.findIndex((ids) => ids.includes(shape.id)) : -1;
  const oneTransaction =
    !!(shape && stroke) &&
    at1 > 0 &&
    !after.log[at1].includes(stroke.id) &&
    after.log[at1 - 1].includes(stroke.id) &&
    !after.log[at1 - 1].includes(shape.id);
  const by = shape
    ? await until(
        "the shape stamped the person's",
        () =>
          frame.evaluate(
            (id) =>
              (
                window as unknown as { cawcoCanvasProbe: CanvasProbe }
              ).cawcoCanvasProbe.live
                .getArray("elements")
                .toArray()
                .find((map) => (map.get("el") as { id: string }).id === id)
                ?.get("by"),
            shape.id
          ),
        (who) => who === "person",
        3000
      ).catch(() => null)
    : null;
  const a = stroke ? boxIn(stroke) : null;
  const b = shape ? boxIn(shape) : null;
  const off =
    a && b
      ? Math.max(
          Math.abs(a.x - b.x),
          Math.abs(a.y - b.y),
          Math.abs(a.x + a.w - b.x - b.w),
          Math.abs(a.y + a.h - b.y - b.h)
        )
      : null;
  await frame.locator(".excalidraw").first().press("Control+z");
  await settle(on.page, 600);
  const undone = await sceneOf(frame);
  const doc = await docIds(frame);
  const strokeBack = undone.find((el) => el.id === stroke?.id);
  const shapeGone = undone.find((el) => el.id === shape?.id);
  const snaps = await snapsHeard(on);
  on.kit.check(
    "18: a wobbly rectangle held 400ms becomes one rectangle within 6px of the stroke's box; the stroke is gone in the same doc transaction, the shape is the person's, nothing tells a stroke end, the page posts its host cawco:snap with the shape's id; one undo brings the stroke back",
    snaps.length === 1 &&
      snaps[0].id === shape?.id &&
      held.made.length === 1 &&
      shape?.type === "rectangle" &&
      stroke?.isDeleted === true &&
      off !== null &&
      off <= 6 &&
      oneTransaction &&
      by === "person" &&
      after.ends === ends &&
      strokeBack?.isDeleted === false &&
      (!shapeGone || shapeGone.isDeleted) &&
      !!stroke &&
      doc.includes(stroke.id) &&
      !doc.includes(shape?.id ?? ""),
    `snaps posted ${JSON.stringify(snaps)}; new in the scene ${held.fresh.join(", ")}; made ${held.made.map((el) => el.type).join(",") || "nothing"} ${shape?.id}; stroke ${JSON.stringify(a)} shape ${JSON.stringify(b)} off ${off?.toFixed(1)}px; one transaction ${oneTransaction}; by ${by}; stroke ends ${after.ends - ends}; after undo: stroke deleted ${strokeBack?.isDeleted}, shape in the scene ${!!shapeGone && !shapeGone.isDeleted}, doc has stroke ${!!stroke && doc.includes(stroke.id)}, shape ${doc.includes(shape?.id ?? "")}`
  );
};

/** Check 20: the ellipse, the triangle, the line and the arrow, each held. */
const shapeTypeCheck = async (
  on: OnCanvas,
  frame: Frame,
  pen: Pen,
  strokes: Strokes,
  at: Pt,
  id: string
) => {
  const got: string[] = [];
  const read: Record<string, Drawn> = {};
  for (const kind of ["ellipse", "triangle", "line", "arrow"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one stroke at a time
    const drawn = await drawnBy(on, frame, pen, strokes[kind], at, {
      hold: true,
    });
    read[kind] = drawn;
    const [made] = drawn.made;
    got.push(
      `${kind} → ${made ? `${made.type}${made.customData?.shape ? ` (${made.customData.shape})` : ""} ${made.points?.length ?? ""}` : "nothing"}, stroke deleted ${drawn.stroke?.isDeleted}`
    );
  }
  const [triangle] = read.triangle.made;
  const corners = triangle?.points ?? [];
  const closed =
    corners.length === 4 &&
    corners[0][0] === corners[3][0] &&
    corners[0][1] === corners[3][1];
  const outline = (await reader(on, id)()).outline ?? "";
  const named = triangle
    ? outline
        .split("\n")
        .some((line) => line.startsWith(`${triangle.id} triangle at `))
    : false;
  on.kit.check(
    "20: held, a wobbly ellipse becomes an ellipse, a three-sided closed stroke a triangle (a closed 3-point line, `triangle` in the outline), a straight stroke a line, a hooked one an arrow",
    read.ellipse.made[0]?.type === "ellipse" &&
      triangle?.type === "line" &&
      triangle.customData?.shape === "triangle" &&
      closed &&
      named &&
      read.line.made[0]?.type === "line" &&
      read.line.made[0]?.points?.length === 2 &&
      read.arrow.made[0]?.type === "arrow" &&
      Object.values(read).every(
        (drawn) => drawn.made.length === 1 && drawn.stroke?.isDeleted === true
      ),
    `${got.join("; ")}; triangle closed ${closed}, outline names it ${named}`
  );
};

/** Checks 19, 21 and 22: lifted without the hold, a scribble held, a mouse stroke held; each stays ink. */
const staysInkChecks = async (
  on: OnCanvas,
  frame: Frame,
  pen: Pen,
  strokes: Strokes,
  at: Pt
) => {
  const ink = (drawn: Drawn) =>
    drawn.stroke?.isDeleted === false &&
    drawn.made.length === 0 &&
    drawn.deleted === 0;
  const { ends } = await heard(frame);
  const lifted = await drawnBy(on, frame, pen, strokes.rectangle, at, {
    hold: false,
  });
  const told = (await heard(frame)).ends - ends;
  on.kit.check(
    "19: the same rectangle lifted without the hold stays freedraw, and tells its stroke end",
    ink(lifted) && told === 1,
    `stroke ${lifted.stroke?.type} deleted ${lifted.stroke?.isDeleted}; made ${lifted.made.length}; stroke ends ${told}`
  );
  const scribble = await drawnBy(on, frame, pen, strokes.scribble, at, {
    hold: true,
  });
  on.kit.check(
    "21: a scribble held stays freedraw, nothing deleted",
    ink(scribble),
    `stroke ${scribble.stroke?.type} deleted ${scribble.stroke?.isDeleted}; made ${scribble.made.map((el) => el.type).join(",") || "nothing"}; deleted ${scribble.deleted}; new in the scene ${scribble.fresh.join(", ") || "nothing"}`
  );
  const mouse = await drawnBy(on, frame, pen, strokes.rectangle, at, {
    hold: true,
    pointer: "mouse",
  });
  on.kit.check(
    "22: a mouse stroke held stays freedraw",
    ink(mouse),
    `stroke ${mouse.stroke?.type} deleted ${mouse.stroke?.isDeleted}; made ${mouse.made.map((el) => el.type).join(",") || "nothing"}`
  );
};

/** The rail as it stands: the tool, which boxes are chosen, and the glyph each tool's box shows. */
const railNow = (frame: Frame) =>
  frame.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.background = "var(--surface-fill)";
    document.body.append(probe);
    const fill = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const box = (tool: string) => {
      const node = document.querySelector(`[data-action="tool:${tool}"]`);
      return {
        chosen: node?.hasAttribute("data-chosen") ?? false,
        filled: node ? getComputedStyle(node).backgroundColor === fill : false,
        glyph: [
          ...(node?.querySelectorAll(".rail-glyph:not([data-swap='out'])") ??
            []),
        ]
          .map((one) => (one as HTMLElement).dataset.glyph)
          .join(","),
      };
    };
    return {
      tool: (
        window as unknown as { cawcoCanvasProbe: CanvasProbe }
      ).cawcoCanvasProbe.api.getAppState().activeTool.type,
      pen: box("freedraw"),
      eraser: box("eraser"),
    };
  });

interface GlyphRun {
  duration: number;
  easing: string;
  glyph: string;
  name: string;
  properties: string[];
  start: number | null;
}

/** From now, every glyph swap's run in the rail as it starts: its name, glyph, length, curve, start and what it animates. */
const watchGlyphs = (frame: Frame) =>
  frame.evaluate(() => {
    const kept = window as unknown as {
      __glyphRuns: GlyphRun[];
      __glyphWatch?: boolean;
    };
    kept.__glyphRuns = [];
    // One listener for the page; each watch starts the record afresh.
    if (kept.__glyphWatch) {
      return;
    }
    kept.__glyphWatch = true;
    addEventListener("animationstart", (started) => {
      const event = started as AnimationEvent;
      const target = event.target as HTMLElement;
      if (!target.classList.contains("rail-glyph")) {
        return;
      }
      const run = target
        .getAnimations()
        .find(
          (one) => (one as CSSAnimation).animationName === event.animationName
        );
      const frames =
        (run?.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      kept.__glyphRuns.push({
        name: event.animationName,
        glyph: target.dataset.glyph ?? "",
        duration: Number(run?.effect?.getTiming().duration ?? 0),
        easing: String(frames[0]?.easing ?? ""),
        start: run?.startTime === null ? null : Number(run?.startTime),
        properties: [
          ...new Set(
            frames.flatMap((one) =>
              Object.keys(one).filter(
                (key) =>
                  !["offset", "computedOffset", "easing", "composite"].includes(
                    key
                  )
              )
            )
          ),
        ],
      });
    });
  });

const glyphRuns = (frame: Frame) =>
  frame.evaluate(
    () => (window as unknown as { __glyphRuns: GlyphRun[] }).__glyphRuns
  );

/** Whether a swap's runs are one --dur-control clock on ease-out: the glyph going out and the eraser's or the pen's coming in, by opacity, transform and blur. */
const oneGlyphSwap = (
  runs: GlyphRun[],
  incoming: string,
  tokens: { control: number; ease: string }
) => {
  const flat = (text: string) => text.replaceAll(" ", "");
  const into = runs.find((run) => run.name === "rail-glyph-in");
  const out = runs.find((run) => run.name === "rail-glyph-out");
  return (
    runs.length === 2 &&
    into?.glyph === incoming &&
    !!out &&
    out.glyph !== incoming &&
    runs.every(
      (run) =>
        run.duration === tokens.control &&
        flat(run.easing) === flat(tokens.ease) &&
        run.start !== null &&
        run.start === runs[0].start &&
        run.properties.every((key) =>
          ["opacity", "transform", "filter"].includes(key)
        )
    )
  );
};

/**
 * Check 23: the pencil's double-tap swaps the eraser's glyph into the pen's
 * box, which stays chosen, as Send and Stop swap; a second one swaps back.
 * The rail's own eraser box still picks the eraser in its own box.
 */
const doubleTapCheck = async (on: OnCanvas, frame: Frame) => {
  const tap = () =>
    on.page.evaluate((selector) => {
      (
        document.querySelector(selector) as HTMLIFrameElement | null
      )?.contentWindow?.postMessage(
        { type: "cawco:pencil-double-tap" },
        location.origin
      );
    }, PANEL_CANVAS);
  const tokens = await frame.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      control: Number.parseFloat(root.getPropertyValue("--dur-control")),
      ease: root.getPropertyValue("--ease-out").trim(),
    };
  });
  const before = await railNow(frame);
  await watchGlyphs(frame);
  await tap();
  await settle(on.page, 400);
  const erasing = await railNow(frame);
  const outRuns = await glyphRuns(frame);
  await watchGlyphs(frame);
  await tap();
  await settle(on.page, 400);
  const back = await railNow(frame);
  const backRuns = await glyphRuns(frame);
  // The rail's eraser box keeps choosing the eraser in its own box.
  await frame.click('[data-action="tool:eraser"]');
  await settle(on.page, 300);
  const picked = await railNow(frame);
  await frame.click('[data-action="tool:freedraw"]');
  await settle(on.page, 300);
  on.kit.check(
    "23: cawco:pencil-double-tap swaps the eraser's glyph into the pen's box, still chosen on surface-fill, the eraser's own box not chosen, as one --dur-control run pair on opacity/transform/blur; a second swaps the pen's back; the rail's eraser box picks the eraser in its own box",
    before.tool === "freedraw" &&
      before.pen.glyph === "pen" &&
      erasing.tool === "eraser" &&
      erasing.pen.chosen &&
      erasing.pen.filled &&
      erasing.pen.glyph === "eraser" &&
      !erasing.eraser.chosen &&
      oneGlyphSwap(outRuns, "eraser", tokens) &&
      back.tool === "freedraw" &&
      back.pen.chosen &&
      back.pen.glyph === "pen" &&
      oneGlyphSwap(backRuns, "pen", tokens) &&
      picked.tool === "eraser" &&
      picked.eraser.chosen &&
      picked.eraser.filled &&
      !picked.pen.chosen &&
      picked.pen.glyph === "pen",
    `before ${JSON.stringify(before)}; tap ${JSON.stringify(erasing)} runs ${JSON.stringify(outRuns)}; tap ${JSON.stringify(back)} runs ${JSON.stringify(backRuns)}; eraser box ${JSON.stringify(picked)}; tokens ${JSON.stringify(tokens)}`
  );
};

/** Records, every frame from now, the first frame a new shape stands in and whether a swap's ghost ever does. */
const watchSwap = (frame: Frame) =>
  frame.evaluate(() => {
    const { api } = (window as unknown as { cawcoCanvasProbe: CanvasProbe })
      .cawcoCanvasProbe;
    const known = new Set(
      api.getSceneElementsIncludingDeleted().map((el) => el.id)
    );
    const seen: {
      first: { shape: number; ghost: number | null } | null;
      ghost: boolean;
    } = { first: null, ghost: false };
    (window as unknown as { __swapSeen: typeof seen }).__swapSeen = seen;
    let left = 240;
    const tick = () => {
      const all = api.getSceneElementsIncludingDeleted();
      const ghost = all.find((el) => el.id.endsWith("~shape-swap"));
      seen.ghost ||= !!ghost;
      const shape = all.find(
        (el) => !(known.has(el.id) || el.isDeleted) && el.type !== "freedraw"
      );
      if (shape && seen.first === null) {
        seen.first = {
          shape: shape.opacity ?? 100,
          ghost: ghost?.opacity ?? null,
        };
      }
      left -= 1;
      if (left > 0) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

const swapSeen = (frame: Frame) =>
  frame.evaluate(
    () =>
      (
        window as unknown as {
          __swapSeen: {
            first: { shape: number; ghost: number | null } | null;
            ghost: boolean;
          };
        }
      ).__swapSeen
  );

interface CaughtRun {
  id: string;
  name: string;
  source?: { delay: number; duration: number; easing: string };
}

/** Every run named `name` the page starts from now, each held still as the protocol reports it. */
const catchNamed = (cdp: CDPSession, name: string): CaughtRun[] => {
  const runs: CaughtRun[] = [];
  cdp.on("Animation.animationStarted", (event: { animation: CaughtRun }) => {
    if (event.animation.name === name) {
      runs.push(event.animation);
      cdp
        .send("Animation.setPaused", {
          animations: [event.animation.id],
          paused: true,
        })
        .catch(() => undefined);
    }
  });
  return runs;
};

/** Holds a run at `currentTime`, then lets two frames draw from it. */
const seekTo = async (
  frame: Frame,
  cdp: CDPSession,
  run: CaughtRun,
  currentTime: number
) => {
  await cdp.send("Animation.seekAnimations", {
    animations: [run.id],
    currentTime,
  });
  await frame.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );
};

/** Lets held runs play out. */
const letGo = (cdp: CDPSession, runs: CaughtRun[]) =>
  cdp.send("Animation.setPaused", {
    animations: runs.map((run) => run.id),
    paused: false,
  });

/** The ghost's and the new shape's opacity now (null for a ghost gone), and the shape's box. */
const opacities = (frame: Frame, known: string[]) =>
  frame.evaluate((ids) => {
    const all = (
      window as unknown as { cawcoCanvasProbe: CanvasProbe }
    ).cawcoCanvasProbe.api.getSceneElementsIncludingDeleted();
    const had = new Set(ids);
    const shape = all.find(
      (el) => !(had.has(el.id) || el.isDeleted) && el.type !== "freedraw"
    );
    return {
      ghost: all.find((el) => el.id.endsWith("~shape-swap"))?.opacity ?? null,
      shape: shape?.opacity ?? null,
      box: shape ? `${shape.x},${shape.y} ${shape.width}×${shape.height}` : "",
    };
  }, known);

const motionTokens = (frame: Frame) =>
  frame.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const ms = (token: string) =>
      Number.parseFloat(root.getPropertyValue(token));
    return {
      fade: ms("--dur-fade"),
      menu: ms("--dur-menu"),
      stagger: ms("--dur-stagger"),
      ease: root.getPropertyValue("--ease-out").trim(),
    };
  });

const flat = (text = "") => text.replaceAll(" ", "");

/** One held rectangle's swap under `motion`: its run, scrubbed at 0, ½ and 1, and the first frame drawn. */
const swapUnder = async (
  on: OnCanvas,
  frame: Frame,
  pen: Pen,
  stroke: { at: Pt; points: Pt[] },
  motion: "reduce" | "no-preference"
) => {
  await on.page.emulateMedia({ reducedMotion: motion });
  const runs = catchNamed(pen.cdp, "shape-swap");
  const known = (await sceneOf(frame)).map((el) => el.id);
  await watchSwap(frame);
  await pen.draw(stroke.points, stroke.at, { hold: true });
  const run = await until("the swap's run", () => runs[0], Boolean, 3000).catch(
    () => null
  );
  const samples: Awaited<ReturnType<typeof opacities>>[] = [];
  if (run) {
    for (const fraction of [0, 0.5, 1]) {
      // biome-ignore lint/performance/noAwaitInLoops: one moment of the clock at a time
      await seekTo(frame, pen.cdp, run, fraction * (run.source?.duration ?? 0));
      samples.push(await opacities(frame, known));
    }
    await letGo(pen.cdp, [run]);
  }
  await settle(on.page, 600);
  return {
    runs: runs.length,
    run,
    samples,
    first: (await swapSeen(frame)).first,
  };
};

/** Whether one swap ran as the one clock: one run of --dur-fade on --ease-out, 100/0, then summing to 100, then 0/100, the shape's box still throughout, the first frame drawn already fading. */
const swappedOnOneClock = (
  swap: Awaited<ReturnType<typeof swapUnder>>,
  tokens: Awaited<ReturnType<typeof motionTokens>>
) => {
  const [start, half, end] = swap.samples;
  return (
    swap.runs === 1 &&
    swap.run?.source?.duration === tokens.fade &&
    flat(swap.run.source.easing) === flat(tokens.ease) &&
    start?.ghost === 100 &&
    start.shape === 0 &&
    !!half &&
    half.ghost !== null &&
    half.shape !== null &&
    Math.abs(half.ghost + half.shape - 100) < 0.5 &&
    half.shape > 50 &&
    half.shape < 100 &&
    end?.ghost === null &&
    end.shape === 100 &&
    start.box !== "" &&
    start.box === half.box &&
    half.box === end.box &&
    swap.first !== null &&
    swap.first.shape < 50 &&
    swap.first.ghost !== null
  );
};

/** Check 24: the swap's two opacities on one clock of `--dur-fade`, the same with reduced motion; nothing travels. */
const motionCheck = async (
  on: OnCanvas,
  frame: Frame,
  pen: Pen,
  strokes: Strokes,
  at: Pt
) => {
  await pen.cdp.send("Animation.enable");
  const tokens = await motionTokens(frame);
  const stroke = { at, points: strokes.rectangle };
  const moving = await swapUnder(on, frame, pen, stroke, "no-preference");
  const reduced = await swapUnder(on, frame, pen, stroke, "reduce");
  await on.page.emulateMedia({ reducedMotion: "no-preference" });
  const said = (swap: typeof moving) =>
    `${swap.runs} run ${JSON.stringify(swap.run?.source)}, scrubbed ${JSON.stringify(swap.samples)}, first frame ${JSON.stringify(swap.first)}`;
  on.kit.check(
    "24: the swap's ghost and shape opacities run on one clock (one run, --dur-fade on --ease-out: 100/0, then summing to 100, then 0/100), the shape's box still throughout, the first frame already fading; the same with reduced motion",
    swappedOnOneClock(moving, tokens) && swappedOnOneClock(reduced, tokens),
    `tokens ${JSON.stringify(tokens)}; motion: ${said(moving)}; reduced: ${said(reduced)}`
  );
};

/**
 * Check 25: with reduced motion the agent's elements still fade up where
 * they stand (The agent's turn on the canvas): one `agent-arrival` run each
 * of --dur-menu on --ease-out, staggered across --dur-stagger, each
 * element's opacity 0, then between, then 100 at its run's 0, ½ and 1, its
 * box still.
 */
const arrivalCheck = async (
  on: OnCanvas,
  frame: Frame,
  cdp: CDPSession,
  id: string
) => {
  await on.page.emulateMedia({ reducedMotion: "reduce" });
  const tokens = await motionTokens(frame);
  const runs = catchNamed(cdp, "agent-arrival");
  const ids = ["arrive-a", "arrive-b"];
  await on.call(UPDATE, {
    id,
    elements: ids.map((one, i) => ({
      type: "rectangle",
      id: one,
      x: 400 + i * 140,
      y: 400,
      width: 120,
      height: 60,
    })),
  });
  await until(
    "two arrivals' runs",
    () => runs.length,
    (n) => n >= 2,
    10_000
  ).catch(() => 0);
  const read = () =>
    frame.evaluate(
      (names) =>
        (
          window as unknown as { cawcoCanvasProbe: CanvasProbe }
        ).cawcoCanvasProbe
          .elements()
          .filter((el) => names.includes(el.id))
          .map((el) => `${el.id} ${el.opacity} at ${el.x},${el.y}`),
      ids
    );
  const samples: string[][] = [];
  for (const fraction of [0, 0.5, 1]) {
    for (const run of runs) {
      // biome-ignore lint/performance/noAwaitInLoops: each run held at its own moment
      await seekTo(
        frame,
        cdp,
        run,
        (run.source?.delay ?? 0) + fraction * (run.source?.duration ?? 0)
      );
    }
    samples.push(await read());
  }
  await letGo(cdp, runs);
  await settle(on.page, 400);
  await on.page.emulateMedia({ reducedMotion: "no-preference" });
  const opacity = (line = "") => Number(line.split(" ")[1]);
  const [start, half, end] = samples;
  const step = tokens.stagger / ids.length;
  const pass =
    runs.length === 2 &&
    runs.every(
      (run, i) =>
        run.source?.duration === tokens.menu &&
        flat(run.source.easing) === flat(tokens.ease) &&
        Math.abs((run.source.delay ?? 0) - i * step) < 0.5
    ) &&
    start?.length === 2 &&
    start.every((line) => opacity(line) === 0) &&
    half?.every((line) => opacity(line) > 0 && opacity(line) < 100) &&
    end?.every((line) => opacity(line) === 100) &&
    [0, 1].every(
      (i) =>
        start[i]?.split(" at ")[1] === half?.[i]?.split(" at ")[1] &&
        half?.[i]?.split(" at ")[1] === end?.[i]?.split(" at ")[1]
    );
  on.kit.check(
    "25: with reduced motion the agent's two elements still fade up where they stand: one agent-arrival run each of --dur-menu on --ease-out, staggered across --dur-stagger, 0 → between → 100",
    pass,
    `tokens ${JSON.stringify(tokens)}; runs ${JSON.stringify(runs.map((run) => run.source))}; scrubbed ${JSON.stringify(samples)}`
  );
};

/** Checks 18–25 on a canvas of their own, the pen picked from the rail. */
const shapeChecks = async (on: OnCanvas) => {
  const answer = await on.call(CREATE, {
    kind: "canvas",
    name: "shapes",
    elements: [
      { type: "rectangle", id: "anchor", x: 0, y: 0, width: 40, height: 40 },
    ],
  });
  const id = answer.match(ANSWERED_ID)?.[1];
  if (!id) {
    on.kit.check("18: the shapes canvas is made", false, answer.slice(0, 300));
    return;
  }
  const frame = (await until(
    "the shapes canvas in the panel",
    async () => {
      const found = await canvasFrame(on.page);
      const ready = await found.evaluate(() =>
        (
          window as unknown as { cawcoCanvasProbe?: CanvasProbe }
        ).cawcoCanvasProbe
          ?.elements()
          .some((el) => el.id === "anchor")
      );
      return ready ? found : null;
    },
    Boolean,
    30_000
  )) as Frame;
  await frame.click('.rail-box[aria-label^="Pen"]');
  await settle(on.page, 400);
  const pen = await penOn(on);
  const well = await on.page.locator(PANEL_CANVAS).boundingBox();
  if (!well) {
    throw new Error("the panel's frame has no box");
  }
  const strokes = strokesOf(Math.round(Math.min(160, well.width * 0.35)));
  const at: Pt = [Math.round(well.width * 0.3), Math.round(well.height * 0.3)];
  await listen(frame);
  await hearSnaps(on);
  await rectangleCheck(on, frame, pen, strokes, at);
  await staysInkChecks(on, frame, pen, strokes, at);
  await shapeTypeCheck(on, frame, pen, strokes, at, id);
  await doubleTapCheck(on, frame);
  await motionCheck(on, frame, pen, strokes, at);
  await arrivalCheck(on, frame, pen.cdp, id);
  await pen.cdp.detach();
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

const spec: Spec = { name: "canvas", run: runSpec };
export default spec;
