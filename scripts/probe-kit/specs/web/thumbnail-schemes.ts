/**
 * An artifact's thumbnail shows the page in the reader's scheme, never a
 * white page at night (owner, 2026-10-18, on white thumbnails: "where did
 * the white background come from?").
 *
 *   bun scripts/probe-kit/run.ts thumbnail-schemes
 *
 * A scratch fleet, the built dashboard at the desk, its theme Light, the
 * OS's scheme left as the browser has it (no emulation: Playwright's
 * emulated `prefers-color-scheme` is forced into every frame, which would
 * hide what a frame's element passes down). Each session makes a page with
 * `artifact_create`; its card stands in the transcript and its pane opens,
 * so the pane asks the overlay for the thumbnail once. Night is the
 * dashboard's own theme switch (the sidebar's), the OS still light.
 *
 * 1. A page with light and dark styles (`light-dark()`): one capture brings
 *    two pictures; the card shows the light one by day, and, the dashboard
 *    turned dark (`html.dark`, no new capture), the dark one. Read as the mean
 *    luminance of the picture the card's <img> holds.
 * 2. Through that capture the live page's root never changed (a
 *    MutationObserver on its attributes, in the page's frame): the other
 *    scheme was drawn off screen, so nothing flashed.
 * 3. A page with fixed light colours: one picture, flagged `single`, shown
 *    in both schemes; at night it stands inset in the well (its padding).
 *    The well's colours are noted beside main's recess and hairline.
 * 4. A page with no doctype (quirks mode): the frame its copy is written
 *    into is quirks too, and both pictures come as in 1.
 * 5. A custom element the page hides until its script defines it: the
 *    copy, which runs no script, still draws it (the night picture is lit
 *    by it, not all ground).
 * 6. A page styled only by `prefers-color-scheme`: its pane frame's
 *    `color-scheme` is the dashboard's theme, so at night the page hears
 *    dark and draws its dark background (read in the frame), and its two
 *    pictures follow as in 1. 6b: the theme turns with the frame open and
 *    the page hears it in place (the same document). 6c: the copy's dark
 *    picture, drawn by day, matches the page's own dark drawing at night.
 * 7. A preview (someone's own app) styled the same way: its frame stays
 *    `color-scheme: light`, the page hears light at night too, and its one
 *    picture is flagged single.
 * 8. A preview whose app paints late (a white page that draws its content
 *    2.5 s after it loads, as an app behind a port still starting does):
 *    its picture is the app drawn, never its bare white ground (the
 *    overlay draws again once the page changes, picture.ts `flat`).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, in order
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { shellWords } from "../../../../packages/core/src/words/shell";
import { type Reply, type Seen, until } from "../../../scratch-fleet";
import { type Kit, open, type Spec } from "../../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** Mean luminance a day picture is above, and a night one below. Our call. */
const DAY_ABOVE = 0.6;
const NIGHT_BELOW = 0.35;

const CONTENT = `<h1>Scheme</h1>${"<p>A line of copy on the page, long enough to fill some of its width.</p>".repeat(12)}`;
/** A page with dark styles of its own, as the decision kit's are (`light-dark()` under the root's `color-scheme`). */
const BOTH = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Both</title><style>body{margin:0;padding:24px;background:light-dark(#fafafa,#121212);color:light-dark(#111,#eee);font:16px/1.5 system-ui}</style></head><body>${CONTENT}</body></html>`;
/** The same with no doctype: the page lays out in quirks mode, and so must its copy. */
const QUIRKS = BOTH.replace("<!doctype html>", "").replace(
  "<title>Both</title>",
  "<title>Quirks</title>"
);
/**
 * A custom element the page hides until its script defines it, drawn
 * against the page's ground (light on dark at night): a copy that took it
 * for undefined would draw the night picture all ground.
 */
const DEFINED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Defined</title><style>html,body{margin:0;background:light-dark(#fff,#000)}x-card{display:block;block-size:70vh;background:light-dark(#000,#fff)}x-card:not(:defined){visibility:hidden}</style></head><body><x-card></x-card><script>customElements.define("x-card",class extends HTMLElement{})</script></body></html>`;
/** The share of the night picture the defined card must light, at least. Our call: it is 70% of the viewport. */
const CARD_LIGHT = 0.4;
/** The copy's dark picture against the page's own, mean absolute difference at most. Our call: the same layout and colours, antialiasing apart. */
const LIVE_DIFF = 0.02;
/** A page whose colours are fixed: it looks the same in both schemes. */
/** A page that styles dark only by `prefers-color-scheme`, as a page written for any browser does. */
const PREFERS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Prefers</title><style>body{margin:0;padding:24px;background:#fafafa;color:#111;font:16px/1.5 system-ui}@media (prefers-color-scheme: dark){body{background:#121212;color:#eee}}</style></head><body>${CONTENT}</body></html>`;
/** A white page that draws its content 2.5 s after it loads: an app still starting behind its port when the overlay says ready. */
const LATE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Late</title><style>html,body{margin:0;background:#fff}main{block-size:60vh;background:#111;color:#eee;font:16px/1.5 system-ui;padding:24px}</style></head><body><script>setTimeout(()=>{const m=document.createElement("main");m.textContent="The app, started.";document.body.append(m)},2500)</script></body></html>`;
/** A late app's picture is darker than this: its 60vh dark block drawn, not the white ground alone (about 1). Our call. */
const LATE_BELOW = 0.7;
const LIGHT_ONLY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Light only</title><style>html{background:#fafafa}body{margin:0;padding:24px;background:#fafafa;color:#111;font:16px/1.5 system-ui}</style></head><body>${CONTENT}</body></html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

/** The mock model: a message carrying `PROBE-CALL:<n>` makes call `n` (preview-bound's). */
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("ok");
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

/** Counts the overlay's `cawco:captured` answers the dashboard hears, and keeps the last one's picture and scheme. */
function countCaptures(): void {
  if (window.top !== window) {
    return;
  }
  const seen = { captures: 0, png: "", scheme: "" };
  (window as unknown as { __thumbs: typeof seen }).__thumbs = seen;
  addEventListener(
    "message",
    (event) => {
      const data = event.data as {
        png?: unknown;
        scheme?: unknown;
        type?: unknown;
      } | null;
      if (data?.type === "cawco:captured") {
        seen.captures += 1;
        seen.png = typeof data.png === "string" ? data.png : "";
        seen.scheme = typeof data.scheme === "string" ? data.scheme : "";
      }
    },
    true
  );
}

/** The last capture the dashboard heard: its picture as a data URL, and the scheme it was drawn in. */
const lastCapture = (page: Page) =>
  page.evaluate(() => {
    const seen = (
      window as unknown as { __thumbs: { png: string; scheme: string } }
    ).__thumbs;
    return { src: `data:image/png;base64,${seen.png}`, scheme: seen.scheme };
  });

/** Two pictures' sizes and their mean absolute difference over RGB, 0 (the same) to 1. */
const pictureDiff = (page: Page, a: string, b: string) =>
  page.evaluate(
    async ([one, other]) => {
      const pixels = async (src: string) => {
        const picture = new Image();
        picture.src = src;
        await picture.decode();
        const canvas = document.createElement("canvas");
        canvas.width = picture.naturalWidth;
        canvas.height = picture.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(picture, 0, 0);
        return {
          size: `${canvas.width}x${canvas.height}`,
          data: ctx?.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      };
      const [x, y] = [await pixels(one), await pixels(other)];
      if (!(x.data && y.data) || x.size !== y.size) {
        return { sizes: `${x.size} / ${y.size}`, diff: 1 };
      }
      let sum = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        for (let c = 0; c < 3; c += 1) {
          sum += Math.abs((x.data[i + c] ?? 0) - (y.data[i + c] ?? 0));
        }
      }
      return {
        sizes: `${x.size} / ${y.size}`,
        diff: sum / ((x.data.length / 4) * 3) / 255,
      };
    },
    [a, b] as const
  );

const capturesOf = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __thumbs: { captures: number } }).__thumbs
        .captures
  );

/** The card's thumbnail as drawn now: its scheme, single flag, padding, and its picture's mean luminance (0 black, 1 white). */
const shownThumb = (page: Page) =>
  page.evaluate(async () => {
    const box = document.querySelector<HTMLElement>(
      '[data-slot="preview-tool"] [data-slot="page-thumb"]'
    );
    const img = box?.querySelector("img");
    if (!(box && img)) {
      return null;
    }
    const picture = new Image();
    picture.src = img.src;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = picture.naturalWidth;
    canvas.height = picture.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.drawImage(picture, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum +=
        0.2126 * (data[i] ?? 0) +
        0.7152 * (data[i + 1] ?? 0) +
        0.0722 * (data[i + 2] ?? 0);
    }
    // Main's `.artifact-thumb` drew on these two tokens: read beside the well's, in this scheme.
    const was = document.createElement("div");
    was.style.cssText =
      "position:fixed;inline-size:0;block-size:0;border:1px solid var(--border-hairline);background:var(--surface-recess)";
    document.body.append(was);
    const main = {
      background: getComputedStyle(was).backgroundColor,
      border: getComputedStyle(was).borderTopColor,
    };
    was.remove();
    return {
      background: getComputedStyle(box).backgroundColor,
      border: getComputedStyle(box).borderTopColor,
      main,
      scheme: box.dataset.scheme ?? "",
      single: box.dataset.single !== undefined,
      padding: getComputedStyle(box).paddingTop,
      src: img.src,
      luminance: sum / (data.length / 4) / 255,
      dark: document.documentElement.classList.contains("dark"),
    };
  });

/** The pane's page frame (the frame on a preview origin under the dashboard). */
const pageFrame = (page: Page): Frame | undefined =>
  page
    .frames()
    .find(
      (frame) =>
        frame !== page.mainFrame() &&
        frame.url().startsWith("http") &&
        frame.parentFrame() === page.mainFrame()
    );

/** The OS's scheme as the dashboard hears it, the pane frame's `color-scheme`, and what the page in it draws now: its `prefers-color-scheme` and its body's computed background. */
const frameDrawn = async (page: Page, frame: Frame | undefined) => ({
  osDark: await page.evaluate(
    () => matchMedia("(prefers-color-scheme: dark)").matches
  ),
  scheme: await page
    .locator('iframe[title="Preview"][data-ready]')
    .first()
    .evaluate((el) => getComputedStyle(el).colorScheme)
    .catch(() => "unread"),
  page: await (frame
    ?.evaluate(() => ({
      prefersDark: matchMedia("(prefers-color-scheme: dark)").matches,
      background: getComputedStyle(document.body).backgroundColor,
      // The document's start: the same one by day and at night is no reload.
      born: performance.timeOrigin,
    }))
    .catch(() => null) ?? Promise.resolve(null)),
});

const said = (one: Awaited<ReturnType<typeof shownThumb>>) =>
  one
    ? `scheme ${one.scheme}, html.dark ${one.dark}, single ${one.single}, padding ${one.padding}, luminance ${one.luminance.toFixed(3)}, well ${one.background} edged ${one.border} (main's recess ${one.main.background} edged ${one.main.border})`
    : "no thumbnail";

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

  /**
   * A session that makes page `html` (or a preview of folder `dir`) with
   * call `marker`, opened at the desk with the theme Light; its card's
   * first thumbnail, then the dashboard's own switch to Dark, the OS left
   * as it was. At night the page is asked for a
   * capture again, drawn live in the dark scheme, to set beside the copy's
   * dark picture.
   */
  const leg = async (
    marker: string,
    name: string,
    made: string | { dir: string }
  ) => {
    const id = await fleet.spawn("claude", name, fleet.repo);
    const desk = await kit.page("desk", { init: [countCaptures] });
    await desk.addInitScript(
      ([tab]) => {
        localStorage.setItem("cawco-theme", "light");
        localStorage.setItem(
          "cawco-workspace",
          JSON.stringify({
            v: 1,
            root: {
              t: "l",
              id: "pone",
              tabs: [tab],
              active: tab,
              opened: null,
            },
            focusedLeaf: "pone",
          })
        );
      },
      [id] as const
    );
    // No emulated scheme: an emulated one is forced into every frame alike.
    await desk.emulateMedia({ colorScheme: null });
    await open(desk, `${base}/session/${id}`, '[data-slot="pane"]');
    asks.set(marker, {
      name: CREATE,
      input:
        typeof made === "string"
          ? {
              kind: "page",
              does: "judge",
              ask: "Judge this page: pin anything that reads wrong",
              name,
              html: made,
            }
          : {
              kind: "preview",
              does: "try",
              ask: "Try this page and say whether it works",
              name,
              dir: made.dir,
            },
    });
    await fleet.send(id, `PROBE-CALL:${marker}`);
    await until("the page made", () => answered.get(marker), Boolean, 180_000);
    // The page's root watched from its ready on: the capture must not touch it.
    await until(
      "the page's frame ready",
      () => desk.locator('iframe[title="Preview"][data-ready]').count(),
      (n) => n > 0,
      60_000
    );
    const frame = pageFrame(desk);
    // The page's mode, and the mode of the frame schemes.ts writes a quirks page's copy into.
    const modes = await frame
      ?.evaluate(() => {
        const blank = document.createElement("iframe");
        blank.setAttribute("sandbox", "allow-same-origin");
        document.documentElement.append(blank);
        const copy = blank.contentDocument?.compatMode ?? "none";
        blank.remove();
        return { page: document.compatMode, blank: copy };
      })
      .catch(() => null);
    await frame?.evaluate(() => {
      const seen = { changes: [] as string[] };
      (window as unknown as { __rootSeen: typeof seen }).__rootSeen = seen;
      new MutationObserver((records) => {
        for (const record of records) {
          seen.changes.push(record.attributeName ?? "");
        }
      }).observe(document.documentElement, { attributes: true });
    });
    await until(
      "the card's thumbnail",
      () =>
        desk
          .locator('[data-slot="preview-tool"] [data-slot="page-thumb"] img')
          .count(),
      (n) => n > 0,
      60_000
    );
    const rootChanges = await frame
      ?.evaluate(
        () =>
          (window as unknown as { __rootSeen: { changes: string[] } })
            .__rootSeen.changes
      )
      .catch(() => null);
    const day = await shownThumb(desk);
    const frameDay = await frameDrawn(desk, frame);
    // Night: the dashboard's own theme switch (the sidebar's), pressed as a person does.
    await desk
      .getByRole("button", { name: shellWords.lightMode })
      .first()
      .evaluate((el) => (el as HTMLElement).click());
    await until(
      "the card in the night scheme",
      () => shownThumb(desk),
      (one) => one?.scheme === "dark",
      10_000
    ).catch(() => null);
    const night = await shownThumb(desk);
    const frameNight = await frameDrawn(desk, frame);
    const captures = await capturesOf(desk);
    // The page's own dark drawing, asked of its frame as the pane asks, beside the copy's.
    const live = await desk
      .locator('iframe[title="Preview"][data-ready]')
      .first()
      .evaluate((el) => {
        const frameEl = el as HTMLIFrameElement;
        frameEl.contentWindow?.postMessage(
          { type: "cawco:capture" },
          new URL(frameEl.src).origin
        );
      })
      .then(() =>
        until(
          "the page's live capture at night",
          () => capturesOf(desk),
          (n) => n > captures,
          30_000
        )
      )
      .then(() => lastCapture(desk))
      .catch(() => null);
    const darkAgainstLive =
      live && night ? await pictureDiff(desk, night.src, live.src) : null;
    await desk.close();
    return {
      day,
      night,
      captures,
      rootChanges,
      modes,
      frameDay,
      frameNight,
      live: live ? { scheme: live.scheme, ...darkAgainstLive } : null,
    };
  };

  // 1, 2. A page with dark styles of its own.
  const both = await leg("1", "both", BOTH);
  kit.check(
    "1: a page with light and dark styles, one capture: the card shows the light picture by day and the dark one under html.dark",
    both.captures === 1 &&
      both.day?.scheme === "light" &&
      !both.day.single &&
      both.day.luminance > DAY_ABOVE &&
      both.night?.scheme === "dark" &&
      both.night.dark &&
      !both.night.single &&
      both.night.luminance < NIGHT_BELOW &&
      both.night.src !== both.day.src,
    `captures ${both.captures}; day: ${said(both.day)}; night: ${said(both.night)}`
  );
  kit.check(
    "2: the live page's root never changed while both schemes were drawn (no flash)",
    Array.isArray(both.rootChanges) && both.rootChanges.length === 0,
    `root attribute changes during the capture: ${both.rootChanges === null || both.rootChanges === undefined ? "unread" : JSON.stringify(both.rootChanges)}`
  );

  // 4. A page with no doctype: quirks mode, its copy in a quirks frame.
  const quirks = await leg("3", "quirks", QUIRKS);
  kit.check(
    "4: a quirks-mode page with light and dark styles: its copy's frame is quirks too, and the card shows the light picture by day, the dark one at night",
    quirks.modes?.page === "BackCompat" &&
      quirks.modes.blank === "BackCompat" &&
      quirks.captures === 1 &&
      !quirks.day?.single &&
      (quirks.day?.luminance ?? 0) > DAY_ABOVE &&
      quirks.night?.scheme === "dark" &&
      quirks.night.luminance < NIGHT_BELOW,
    `modes ${JSON.stringify(quirks.modes)}; captures ${quirks.captures}; day: ${said(quirks.day)}; night: ${said(quirks.night)}`
  );

  // 5. A custom element hidden until defined: defined on the page, drawn in the copy.
  const defined = await leg("4", "defined", DEFINED);
  kit.check(
    "5: a custom element the page hides until defined: drawn in the other scheme's picture as on the page (the night card lights the picture)",
    defined.captures === 1 &&
      !defined.night?.single &&
      defined.night?.scheme === "dark" &&
      defined.night.luminance > CARD_LIGHT &&
      (defined.day?.luminance ?? 1) < 1 - CARD_LIGHT,
    `captures ${defined.captures}; day: ${said(defined.day)}; night: ${said(defined.night)}`
  );

  // 6. A page styled only by prefers-color-scheme follows the dashboard's theme in the pane, and so do its thumbnails.
  const prefers = await leg("5", "prefers", PREFERS);
  kit.check(
    "6: a page styled only by prefers-color-scheme: its pane frame hears the dashboard's theme, not the OS's (the OS light throughout), so it draws dark at night (body background read in the frame), and its card shows the light picture by day, the dark one at night",
    prefers.frameDay.osDark === false &&
      prefers.frameNight.osDark === false &&
      prefers.frameDay.scheme === "light" &&
      prefers.frameDay.page?.prefersDark === false &&
      prefers.frameDay.page.background === "rgb(250, 250, 250)" &&
      prefers.frameNight.scheme === "dark" &&
      prefers.frameNight.page?.prefersDark === true &&
      prefers.frameNight.page.background === "rgb(18, 18, 18)" &&
      prefers.captures === 1 &&
      !prefers.day?.single &&
      (prefers.day?.luminance ?? 0) > DAY_ABOVE &&
      prefers.night?.scheme === "dark" &&
      prefers.night.luminance < NIGHT_BELOW,
    `frame by day ${JSON.stringify(prefers.frameDay)}, at night ${JSON.stringify(prefers.frameNight)}; captures ${prefers.captures}; day: ${said(prefers.day)}; night: ${said(prefers.night)}`
  );
  kit.check(
    "6b: the theme turned while the page's frame stood open: the page heard it in place, with no reload (the same document by day and at night)",
    !!prefers.frameDay.page &&
      prefers.frameDay.page.born === prefers.frameNight.page?.born,
    `document by day ${prefers.frameDay.page?.born}, at night ${prefers.frameNight.page?.born}`
  );
  kit.check(
    `6c: the copy's dark thumbnail (drawn by day, the page's dark rule applied) matches the page's own dark drawing at night: same size, mean difference under ${LIVE_DIFF}`,
    prefers.live?.scheme === "dark" && (prefers.live.diff ?? 1) < LIVE_DIFF,
    `live capture ${JSON.stringify(prefers.live)}`
  );

  // 7. A preview (someone's own app) keeps its own light, whatever the dashboard's theme.
  const previewDir = join(kit.out, "prefers-preview");
  await mkdir(previewDir, { recursive: true });
  await writeFile(join(previewDir, "index.html"), PREFERS);
  const preview = await leg("6", "prefers-preview", { dir: previewDir });
  kit.check(
    "7: a preview styled by prefers-color-scheme: the dashboard turned dark, its frame stays color-scheme light and the page hears light by day and at night, one picture, flagged single",
    preview.night?.dark === true &&
      preview.frameDay.scheme === "light" &&
      preview.frameNight.scheme === "light" &&
      preview.frameDay.page?.prefersDark === false &&
      preview.frameNight.page?.prefersDark === false &&
      preview.frameNight.page.background === "rgb(250, 250, 250)" &&
      !!preview.day?.single &&
      !!preview.night?.single,
    `frame by day ${JSON.stringify(preview.frameDay)}, at night ${JSON.stringify(preview.frameNight)}; day: ${said(preview.day)}; night: ${said(preview.night)}`
  );

  // 8. A preview whose app paints after the overlay is ready.
  const lateDir = join(kit.out, "late-preview");
  await mkdir(lateDir, { recursive: true });
  await writeFile(join(lateDir, "index.html"), LATE);
  const late = await leg("8", "late-preview", { dir: lateDir });
  kit.check(
    "8: a preview whose app paints 2.5 s after it is ready: its picture is the app drawn (its dark block), never the bare white ground",
    !!late.day && late.day.luminance < LATE_BELOW,
    `captures ${late.captures}; day: ${said(late.day)}`
  );

  // 3. A page that looks the same in both schemes.
  const light = await leg("2", "light-only", LIGHT_ONLY);
  kit.note(
    `colours: the well by day ${light.day?.background} edged ${light.day?.border}, at night ${light.night?.background} edged ${light.night?.border}; main's .artifact-thumb (surface-recess, border-hairline) by day ${light.day?.main.background} edged ${light.day?.main.border}, at night ${light.night?.main.background} edged ${light.night?.main.border}`
  );
  kit.check(
    "3: a light-only page: one picture, flagged single, the same in both schemes, inset in the well at night",
    light.captures === 1 &&
      !!light.day?.single &&
      !!light.night?.single &&
      light.night.scheme === "dark" &&
      light.night.src === light.day.src &&
      light.day.padding === "0px" &&
      light.night.padding !== "0px",
    `captures ${light.captures}; day: ${said(light.day)}; night: ${said(light.night)}`
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "thumbnail-schemes",
  run,
};
export default spec;
