/**
 * A folder preview opened at a file that is no HTML page (a PDF, an image,
 * plain text) shows that file in the session's panel through CawCo's file
 * viewer (core file-viewer.ts), and Comment and Draw work over it as over
 * any page (the owner, 2026-11-11, asked whether to hide them over such a
 * file: "Make them work"). Before, the panel drew the bare file, no overlay
 * reached it, and after a few seconds "The page didn't load" stood over a
 * PDF ("the pdf opens for a bit then after 5 seconds the whole page errors
 * out").
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), for each of a two-page PDF, a PNG and a plain-text file in a
 * folder, made the session's last artifact so its panel shows it:
 *
 * At 1440 and at 390 (where the panel is the phone's sheet), the session's
 * page opened and watched for WATCH_MS:
 *
 * 1. the panel's frame stands throughout, its document the viewer of that
 *    file (`html[data-cawco-file]`), answered as HTML, drawing the file
 *    (a PDF's first page drawn by PDF.js, the image decoded, the text's
 *    first line);
 * 2. no state stands in for the file once its frame has loaded: no cover,
 *    no "didn't load" and no down page (`data-slot="down"`);
 * 3. the page throws nothing (`pageerror`), logs no console error, and
 *    never turns to the route's error page;
 * 4. (the PDF) in Interact, the frame scrolls from page 1 to page 2, and
 *    page 2 is drawn.
 *
 * At 1440, once per file:
 *
 * 5. Comment mode, a press on the file and words: the pin's anchor names
 *    where in the file it stands (core file-spot.ts): the PDF's page 1 and
 *    the point pressed, the image's point, the text's line;
 * 6. Draw mode, a stroke over the file: its group's anchor names its place
 *    in the file (over the text's first three lines: lines 1–3);
 * 7. the page reloaded: the pin stands again on the same spot (its anchor
 *    as it was, not moved aside, its pill drawn inside that spot's box);
 * 8. the session's `comment_read` says where the pin stands in words
 *    ("page 1, near the top left", "the image, near the top right", "line 2").
 *
 * Then a decision page whose option shows the PDF's preview (`Preview`,
 * dashboard decisions host Preview.svelte), the session's last artifact,
 * at 1440:
 *
 * 9. the Preview stands drawn at its shape within EMBED_SHOWN_MS of the
 *    panel's frame, its wait gone: the viewer's overlay says it shows
 *    something (core `EMBED_DRAWN`).
 *
 *   bun scripts/probe-kit/run.ts folder-documents
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { PNG } from "pngjs";
import { type PageAnchor, PIN_MAPS } from "../../../packages/core/src/comments";
import {
  type FileSpot,
  fileSpotWords,
} from "../../../packages/core/src/file-spot";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { fileViewerWords } from "../../../packages/core/src/words/file-viewer";
import { shellWords } from "../../../packages/core/src/words/shell";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import {
  type Kit,
  kitsOwnMessage,
  open,
  pressAt,
  type Spec,
  settle,
  type View,
} from "../kit";
import { pinsOf } from "../pins";

/** The artifact panel's frame (PreviewPane). */
const FRAME = 'iframe[title="Preview"]';
/** How long the page is watched once the frame stands. The brief's: more than 10 s. */
const WATCH_MS = 12_000;
/** A decision page's Preview of a folder's file, drawn. Our call: its ping is asked each second once its frame loaded; its `DRAW_MS` is 30 s. */
const EMBED_SHOWN_MS = 15_000;
/** How far a kept point may stand from the press, as a fraction of its spot: a pixel or two of rounding. */
const POINT_SLACK = 0.02;

const calls = new ToolCalls();
const respond = (request: Seen): Reply =>
  calls.reply(request) ?? { everyMs: 5, words: ["ok"] };

/** A PDF of one page per entry of `pages`, each saying its words, its cross-reference table at the offsets it has. */
const pdf = (pages: string[]): Uint8Array => {
  const first = 4;
  const kids = pages.map((_, i) => `${first + i * 2} 0 R`).join(" ");
  const font = first + pages.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< >>",
    ...pages.flatMap((words, i) => {
      const stream = `BT /F1 24 Tf 72 760 Td (${words}) Tj ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${first + i * 2 + 1} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      ];
    }),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
};

/** A 480 × 320 PNG: a sketch's ground, coral down its left half. */
const sketch = (): Uint8Array => {
  const png = new PNG({ width: 480, height: 320 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const at = (y * png.width + x) * 4;
      const coral = x < png.width / 2;
      png.data[at] = coral ? 236 : 244;
      png.data[at + 1] = coral ? 112 : 238;
      png.data[at + 2] = coral ? 84 : 226;
      png.data[at + 3] = 255;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
};

const NOTES = [
  "Holder roles for November:",
  "Mira keeps the rota and the spares cupboard key.",
  "Tomas orders the spares and checks the chargers on Fridays.",
  "Ines covers both while either is away.",
  "Review the roles again in December.",
];

interface DocFile {
  bytes: Uint8Array;
  /** What the viewer draws once it has the file: true when it stands. */
  drawn: string;
  kind: "pdf" | "image" | "text";
  name: string;
  /** Where the press of leg 5 lands on its spot, as fractions of its box. */
  press: { selector: string; x: number; y: number };
  /** The pin's place in the file, as its anchor should keep it. */
  spot: FileSpot;
  /** The stroke of leg 6: from and to, as fractions of `selector`'s box, and the place its group's anchor should keep. */
  stroke: {
    from: [number, number];
    ink: FileSpot["kind"] | FileSpot;
    selector: string;
    to: [number, number];
  };
  title: string;
  type: string;
}

const FILES: DocFile[] = [
  {
    kind: "pdf",
    title: "Droid holder roles",
    name: "droid-holder-roles-2026-11.pdf",
    type: "application/pdf",
    bytes: pdf([
      "Droid holder roles, November 2026",
      "Page two: the spares rota",
    ]),
    drawn: "#page-1 canvas",
    press: { selector: "#page-1", x: 0.25, y: 0.2 },
    spot: { kind: "pdf", page: 1, x: 0.25, y: 0.2 },
    stroke: {
      selector: "#page-1",
      from: [0.3, 0.5],
      to: [0.7, 0.55],
      ink: "pdf",
    },
  },
  {
    kind: "image",
    title: "Holder sketch",
    name: "holder-sketch.png",
    type: "image/png",
    bytes: sketch(),
    drawn: "#cawco-image",
    press: { selector: "#cawco-image", x: 0.8, y: 0.2 },
    spot: { kind: "image", x: 0.8, y: 0.2 },
    stroke: {
      selector: "#cawco-image",
      from: [0.2, 0.6],
      to: [0.6, 0.7],
      ink: "image",
    },
  },
  {
    kind: "text",
    title: "Holder notes",
    name: "holder-notes.txt",
    type: "text/plain",
    bytes: new TextEncoder().encode(`${NOTES.join("\n")}\n`),
    drawn: "#L1",
    press: { selector: "#L2", x: 0.5, y: 0.5 },
    spot: { kind: "text", line: 2 },
    stroke: {
      selector: ".lines",
      from: [0.3, 0.05],
      to: [0.35, 0.5],
      ink: { kind: "text", line: 1, end: 3 },
    },
  },
];

const VIEWS: View[] = ["desk", "phone"];

/** What the pane draws over or in place of the frame now: its cover, a down page, the error route. */
const standsIn = (page: Page) =>
  page.evaluate((errorTitle) => {
    const seen = (el: Element | null) =>
      !!el && (el as HTMLElement).getClientRects().length > 0;
    return {
      down: [...document.querySelectorAll('[data-slot="down"]')]
        .filter(seen)
        .map((el) => (el as HTMLElement).innerText.replace(/\s+/gu, " "))
        .join(" | "),
      errorPage: document.title.startsWith(errorTitle),
      frame: document.querySelectorAll('iframe[title="Preview"]').length,
      // The pane's cover still over the frame, where the pane is drawn.
      covered: [
        ...document.querySelectorAll('[data-slot="cover"]:not([data-ready])'),
      ].filter(seen).length,
    };
  }, shellWords.somethingWentWrong);

/** The panel's frame, once its document is the viewer of a file and its spots stand. */
const viewerFrame = async (page: Page, drawn: string): Promise<Frame> => {
  const frame = await until(
    "the panel's frame holding the file's viewer",
    async () => {
      const inner = await (
        await page.locator(FRAME).first().elementHandle()
      )?.contentFrame();
      const ready = await inner
        ?.evaluate(
          (selector) =>
            document.documentElement.hasAttribute("data-cawco-file") &&
            !document.documentElement.hasAttribute("data-cawco-file-loading") &&
            !!document.querySelector(selector) &&
            "cawcoArtifact" in window,
          drawn
        )
        .catch(() => false);
      return ready ? inner : null;
    },
    Boolean,
    60_000
  );
  return frame as Frame;
};

/** What the viewer shows now: its kind, the image decoded, the PDF's pages drawn, the text's first line. */
const viewerShows = (frame: Frame) =>
  frame.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>("#cawco-image");
    return {
      kind: document.documentElement.getAttribute("data-cawco-file"),
      image: image ? image.naturalWidth : null,
      pages: document.querySelectorAll("[data-cawco-spot='pdf']").length,
      drawnPages: [...document.querySelectorAll("[data-cawco-spot='pdf']")]
        .filter((page) => !!page.querySelector("canvas"))
        .map((page) => page.id),
      firstLine: document.querySelector("#L1")?.textContent ?? null,
    };
  });

/** Where `selector` stands on the screen (the frame's box plus its own), scrolled so its point `down` (a fraction of its height) stands in the frame's middle. */
const screenBox = async (
  page: Page,
  frame: Frame,
  selector: string,
  down = 0.5
) => {
  const outer = await page.locator(FRAME).first().boundingBox();
  const inner = await frame
    .locator(selector)
    .first()
    .evaluate((el, fraction) => {
      const was = el.getBoundingClientRect();
      scrollBy(0, was.top + was.height * fraction - innerHeight / 2);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, down);
  if (!outer) {
    throw new Error("the pane's frame has no box");
  }
  return { x: outer.x + inner.x, y: outer.y + inner.y, w: inner.w, h: inner.h };
};

/** The page's doc's ink and pins, read from the overlay's mirror of it. */
const docOf = async (frame: Frame) => {
  const maps = await frame.evaluate(
    (names) => {
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: { getMap: (n: string) => { toJSON: () => object } };
          };
        }
      ).cawcoArtifact;
      return Object.fromEntries(
        names.map((name) => [name, doc.getMap(name).toJSON()])
      ) as Record<string, Record<string, unknown>>;
    },
    ["ink", ...PIN_MAPS]
  );
  return {
    ink: Object.values(maps.ink ?? {}) as { anchor: PageAnchor }[],
    pins: Object.values(pinsOf(maps)),
  };
};

/** The pane's mode, by its head's segment (V, C, D), once the page has heard it. */
const paneMode = async (page: Page, frame: Frame, key: "V" | "C" | "D") => {
  await page
    .locator(
      `:is([data-slot="preview-pane"], [data-side-card="preview"]) [role='tab'][aria-keyshortcuts='${key}']`
    )
    .click();
  const want = { V: "", C: "comment", D: "draw" }[key];
  await until(
    `the page's mode ${key}`,
    () =>
      frame.evaluate(() => {
        const layer = document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector(".layer");
        if (layer?.classList.contains("comment")) {
          return "comment";
        }
        return layer?.classList.contains("draw") ? "draw" : "";
      }),
    (mode) => mode === want,
    5000
  );
};

/** The pin's pill's tail corner, where it points, and whether it stands inside `selector`'s box. */
const pillOn = (frame: Frame, pinId: string, spotSelector: string) =>
  frame.evaluate(
    ({ id, selector }) => {
      const g = document.querySelector<SVGGElement>(
        `svg[data-cawco-pins] [data-pin-id="${id}"]`
      );
      const face = g?.querySelector("[data-face]")?.getBoundingClientRect();
      const spot = document.querySelector(selector)?.getBoundingClientRect();
      if (!(face && spot)) {
        return { drawn: !!face, inside: false };
      }
      const tail = g?.getAttribute("data-tail") ?? "bottom-start";
      const x = tail.endsWith("end") ? face.right : face.left;
      const y = tail.startsWith("top") ? face.top : face.bottom;
      // A pill on a line stands past the line's end, on its band.
      return {
        drawn: true,
        inside:
          y >= spot.top - 2 &&
          y <= spot.bottom + 2 &&
          (selector.startsWith("#L") ||
            (x >= spot.left - 2 && x <= spot.right + 2)),
      };
    },
    { id: pinId, selector: spotSelector }
  );

/** Whether the kept spot `kept` is `want`, a point within {@link POINT_SLACK}. */
const sameSpot = (kept: unknown, want: FileSpot): boolean => {
  const one = kept as Record<string, unknown> | undefined;
  if (!one || one.kind !== want.kind) {
    return false;
  }
  if (want.kind === "image" || want.kind === "pdf") {
    return (
      Math.abs(Number(one.x) - want.x) <= POINT_SLACK &&
      Math.abs(Number(one.y) - want.y) <= POINT_SLACK &&
      (want.kind === "image" || one.page === want.page)
    );
  }
  return JSON.stringify(one) === JSON.stringify(want);
};

/** Leg 4: a wheel over the panel's frame scrolls the PDF to its second page: where it stands then, and whether page 2 is in view and drawn. */
const wheelToPage2 = async (page: Page, frame: Frame) => {
  const box = await page.locator(FRAME).first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.wheel(0, 300);
      await Bun.sleep(50);
    }
  }
  return await until(
    "page 2 in view and drawn",
    () =>
      frame.evaluate(() => {
        const two = document.querySelector("#page-2");
        const r = two?.getBoundingClientRect();
        return {
          top: Math.round(scrollY),
          page2:
            !!r &&
            r.top < innerHeight &&
            r.bottom > 0 &&
            !!two?.querySelector("canvas"),
        };
      }),
    (now) => now.page2,
    5000
  ).catch(() => ({ top: -1, page2: false }));
};

/** Whether the viewer draws `file` as `shows` reads it: its kind, both PDF pages laid out and the first drawn, the image decoded, the text's first line. */
const drawsFile = (
  file: DocFile,
  shows: Awaited<ReturnType<typeof viewerShows>> | null
): boolean =>
  shows?.kind === file.kind &&
  (file.kind !== "pdf" ||
    (shows.pages === 2 && shows.drawnPages.includes("page-1"))) &&
  (file.kind !== "image" || (shows.image ?? 0) > 0) &&
  (file.kind !== "text" || shows.firstLine === NOTES[0]);

/** Legs 1 to 4: the session's page at `view`, its panel showing `file`, watched for {@link WATCH_MS}. */
const watchFile = async (
  kit: Kit,
  sessionAt: string,
  file: DocFile,
  view: View
) => {
  const page = await kit.page(view);
  const thrown: string[] = [];
  const logged: string[] = [];
  page.on("pageerror", (error) =>
    thrown.push((error.stack ?? error.message).slice(0, 600))
  );
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      logged.push(message.text().slice(0, 300));
    }
  });
  const served = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/${file.name}` &&
      response.request().resourceType() === "document",
    { timeout: 60_000 }
  );
  await open(page, sessionAt, FRAME);
  const answer = await served.catch(() => null);
  const answeredAs = answer?.headers()["content-type"] ?? "none";
  const frame = await viewerFrame(page, file.drawn).catch(() => null);
  const shows = frame ? await viewerShows(frame).catch(() => null) : null;
  // The pane's load and its PAGE_SILENT_MS run inside the watch.
  const reads: Awaited<ReturnType<typeof standsIn>>[] = [];
  const end = performance.now() + WATCH_MS;
  let scrolled: { top: number; page2: boolean } | null = null;
  while (performance.now() < end) {
    reads.push(
      await standsIn(page).catch(() => ({
        down: "unread",
        errorPage: false,
        frame: 0,
        covered: 0,
      }))
    );
    // 4. Half way through the watch, the PDF scrolled to its second page, as a wheel over it would.
    if (
      file.kind === "pdf" &&
      frame &&
      scrolled === null &&
      performance.now() > end - WATCH_MS / 2
    ) {
      scrolled = await wheelToPage2(page, frame);
    }
    await Bun.sleep(500);
  }
  const last = reads.at(-1);
  const covered = (last?.covered ?? 1) > 0;
  // The file as the panel draws it, for a person to look at.
  await page.screenshot({
    path: join(kit.out, `${file.kind}-${view}.png`),
  });
  const drawnOk = drawsFile(file, shows);
  kit.check(
    `${file.kind} @${view}: 1: the panel's frame stands for ${WATCH_MS} ms, its document the file's viewer, answered as HTML and drawing the file`,
    reads.every((one) => one.frame > 0) &&
      answeredAs.startsWith("text/html") &&
      drawnOk,
    JSON.stringify({
      frames: [...new Set(reads.map((one) => one.frame))].join(","),
      answeredAs,
      shows,
    })
  );
  kit.check(
    `${file.kind} @${view}: 2: nothing stands in for the loaded file: no cover, no didn't-load or down page`,
    !covered && reads.every((one) => one.down === ""),
    JSON.stringify({
      covered: last?.covered,
      down: [...new Set(reads.map((one) => one.down))].filter(Boolean),
    })
  );
  kit.check(
    `${file.kind} @${view}: 3: the page throws nothing, logs no console error and never turns to the error page`,
    thrown.length === 0 &&
      logged.length === 0 &&
      !reads.some((one) => one.errorPage) &&
      !last?.errorPage,
    JSON.stringify({
      thrown,
      logged,
      errorPage: reads.some((one) => one.errorPage),
    })
  );
  if (file.kind === "pdf") {
    kit.check(
      `pdf @${view}: 4: in Interact the frame scrolls from page 1 to page 2, and page 2 is drawn`,
      !!scrolled?.page2 && scrolled.top > 0,
      JSON.stringify(scrolled)
    );
  }
  await page.close();
};

/** Legs 5 to 8 at the desk: a pin and a stroke on `file`, the page reloaded, the session's comment_read. */
const markFile = async (
  kit: Kit,
  sessionAt: string,
  file: DocFile,
  read: () => Promise<string>
) => {
  const page = await kit.page("desk");
  const thrown: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message.slice(0, 300)));
  await open(page, sessionAt, FRAME);
  let frame = await viewerFrame(page, file.drawn);
  // 5. Comment mode, a press on the file, words, Enter.
  await paneMode(page, frame, "C");
  await settle(page, 300);
  const b = await screenBox(page, frame, file.press.selector, file.press.y);
  const at = { x: b.x + b.w * file.press.x, y: b.y + b.h * file.press.y };
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await pressAt(frame, at);
  const composer = page.locator('[data-slot="pin-composer"]');
  const opened = await composer
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const words = `A note on ${file.title.toLowerCase()}`;
  if (opened) {
    await composer.getByRole("combobox").fill(words);
    await page.keyboard.press("Enter");
    await composer
      .waitFor({ state: "detached", timeout: 8000 })
      .catch(() => undefined);
  }
  const pinned = await until(
    `the pin on the ${file.kind} in the doc`,
    () => docOf(frame),
    (doc) => doc.pins.some((one) => one.thread[0]?.text === words),
    8000
  ).catch(() => docOf(frame));
  const pin = pinned.pins.find((one) => one.thread[0]?.text === words);
  const anchor = pin?.anchor as PageAnchor | undefined;
  kit.check(
    `${file.kind}: 5: Comment, a press on the file and words: the pin's anchor keeps where in the file it stands (${fileSpotWords(file.spot)})`,
    opened && sameSpot(anchor?.file, file.spot),
    JSON.stringify({ opened, file: anchor?.file, selector: anchor?.selector })
  );
  await page.keyboard.press("Escape");
  // 6. Draw mode, a stroke over the file.
  await paneMode(page, frame, "D");
  await settle(page, 300);
  const s = await screenBox(
    page,
    frame,
    file.stroke.selector,
    (file.stroke.from[1] + file.stroke.to[1]) / 2
  );
  const from = {
    x: s.x + s.w * file.stroke.from[0],
    y: s.y + s.h * file.stroke.from[1],
  };
  const to = {
    x: s.x + s.w * file.stroke.to[0],
    y: s.y + s.h * file.stroke.to[1],
  };
  const inkBefore = pinned.ink.length;
  await pressAt(frame, from, { how: "down" });
  for (let step = 1; step <= 16; step += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / 16,
      from.y + ((to.y - from.y) * step) / 16
    );
    await Bun.sleep(16);
  }
  await page.mouse.up();
  const inked = await until(
    `the stroke on the ${file.kind} in the doc`,
    () => docOf(frame),
    (doc) => doc.ink.length > inkBefore,
    8000
  ).catch(() => docOf(frame));
  const group = inked.ink.at(-1);
  const want = file.stroke.ink;
  const inkFile = group?.anchor.file;
  kit.check(
    `${file.kind}: 6: Draw, a stroke over the file: its group's anchor keeps its place in the file`,
    typeof want === "string"
      ? inkFile?.kind === want
      : JSON.stringify(inkFile) === JSON.stringify(want),
    JSON.stringify({ groups: inked.ink.length, file: inkFile })
  );
  await page.keyboard.press("Escape");
  await paneMode(page, frame, "V");
  // 7. The page reloaded: the pin stands on the same spot.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(FRAME, { timeout: 60_000 });
  frame = await viewerFrame(page, file.drawn);
  const spotSelector = file.press.selector;
  await frame
    .locator(spotSelector)
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  const again = await until(
    `the pin on the ${file.kind} drawn again`,
    async () => {
      const doc = await docOf(frame);
      const now = doc.pins.find((one) => one.id === pin?.id);
      const pill = pin
        ? await pillOn(frame, pin.id, spotSelector)
        : { drawn: false, inside: false };
      return { now, pill };
    },
    (state) => state.pill.inside,
    10_000
  ).catch(async () => ({
    now: (await docOf(frame)).pins.find((one) => one.id === pin?.id),
    pill: pin
      ? await pillOn(frame, pin.id, spotSelector)
      : { drawn: false, inside: false },
  }));
  const kept = again.now?.anchor as PageAnchor | undefined;
  kit.check(
    `${file.kind}: 7: reloaded, the pin stands again on the same spot: its anchor as it was, not moved aside, its pill inside ${spotSelector}`,
    !!again.now &&
      !again.now.movedAt &&
      JSON.stringify(kept?.file) === JSON.stringify(anchor?.file) &&
      again.pill.inside,
    JSON.stringify({
      file: kept?.file,
      movedAt: again.now?.movedAt ?? null,
      pill: again.pill,
    })
  );
  await page.screenshot({
    path: join(kit.out, `${file.kind}-pinned-desk.png`),
  });
  // 8. The session's comment_read says it in words.
  const said = await read().catch((error: unknown) => String(error));
  const where = fileSpotWords(file.spot);
  kit.check(
    `${file.kind}: 8: comment_read says where the pin stands in the file: "${where}"`,
    said.includes(`${fileViewerWords.inFile}: ${where}`),
    said
      .split("\n")
      .filter(
        (line) =>
          line.includes(fileViewerWords.inFile) || line.startsWith("## ")
      )
      .join(" | ")
      .slice(0, 600) || said.slice(0, 600)
  );
  kit.check(
    `${file.kind}: 5–7: the page throws nothing while it is marked and reloaded`,
    thrown.length === 0,
    JSON.stringify(thrown)
  );
  await page.close();
};

/** Leg 9: the session's page at the desk, its panel showing a decision page whose Preview is the PDF's. */
const watchEmbed = async (kit: Kit, sessionAt: string) => {
  const page = await kit.page("desk");
  await open(page, sessionAt, FRAME);
  const embed = page
    .frameLocator(FRAME)
    .first()
    .locator("[data-slot=media] iframe[data-slot=embed]")
    .first();
  /** The Preview's shape as it reads now: `waiting` until it stands drawn. */
  const shapeNow = () =>
    embed.getAttribute("data-shape", { timeout: 1000 }).catch(() => null);
  const attached = await embed
    .waitFor({ state: "attached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  let shape: string | null = null;
  const end = performance.now() + EMBED_SHOWN_MS;
  while (attached && performance.now() < end) {
    shape = await shapeNow();
    if (shape && shape !== "waiting") {
      break;
    }
    await Bun.sleep(250);
  }
  await page.screenshot({ path: join(kit.out, "pdf-decision-desk.png") });
  kit.check(
    `pdf on a decision page: 9: its Preview stands drawn at its shape within ${EMBED_SHOWN_MS} ms, its wait gone`,
    attached && shape !== null && shape !== "waiting",
    JSON.stringify({ attached, shape })
  );
  await page.close();
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
  const base = await fleet.dashboard();
  const session = await fleet.spawn("claude", "Holder roles", fleet.repo);
  const sessionAt = `${base}/session/${session}`;
  const dir = join(kit.out, "folder");
  await mkdir(dir, { recursive: true });
  for (const file of FILES) {
    await Bun.write(join(dir, file.name), file.bytes);
  }

  const made: Record<string, string> = {};
  for (const file of FILES) {
    // Made last, so the session's panel shows it.
    const artifact = await fleet.api<{ id: string }>(
      hubRequest("POST /api/instances/:id/artifacts", {
        path: { id: session },
        body: {
          kind: "preview",
          does: "judge",
          title: file.title,
          ask: "Read the holder roles",
          name: `holder-${file.kind}`,
          dir,
          path: `/${file.name}`,
        },
      })
    );
    made[file.kind] = artifact.id;
    for (const view of VIEWS) {
      await watchFile(kit, sessionAt, file, view);
    }
    await markFile(kit, sessionAt, file, () =>
      calls.call(fleet, session, "mcp__cawco__comment_read", {
        artifact: artifact.id,
        response_format: "concise",
      })
    );
  }

  // 9. The PDF's preview on a decision page, made last so the panel shows it.
  await fleet.api(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: session },
      body: {
        kind: "page",
        does: "pick",
        title: "Holder roles to keep",
        ask: "Pick the roles to keep",
        name: "holder-roles-pick",
        program: `root = Decisions("Holder roles to keep", [roles])
roles = Decision("roles", "Do the November roles stand?", [keep, redo], "Read the roles.", [], [], false, null, "behaviour")
keep = Option("keep", "Keep them", "As written.", true, [doc], "Nothing to redo.")
redo = Option("redo", "Write them again", "A new list.", false, [], "Another round.")
doc = Preview("${made.pdf}", "The November roles")`,
      },
    })
  );
  await watchEmbed(kit, sessionAt);
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "folder-documents",
  run,
};
export default spec;
