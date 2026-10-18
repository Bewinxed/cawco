/**
 * An artifact's thumbnail shows the page in the reader's scheme, never a
 * white page at night (owner, 2026-10-18, on white thumbnails: "where did
 * the white background come from?").
 *
 *   bun scripts/probe-kit/run.ts thumbnail-schemes
 *
 * A scratch fleet, the built dashboard at the desk, the theme on "system"
 * with the OS by day. Each session makes a page with `artifact_create`; its
 * card stands in the transcript and its pane opens, so the pane asks the
 * overlay for the thumbnail once.
 *
 * 1. A page with light and dark styles (`light-dark()`): one capture brings
 *    two pictures; the card shows the light one by day, and, the OS turned
 *    dark (`html.dark`, no new capture), the dark one. Read as the mean
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
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, in order
import type { Frame, Page } from "playwright-core";
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
/** A page whose colours are fixed: it looks the same in both schemes. */
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

/** Counts the overlay's `cawco:capture` answers the dashboard hears. */
function countCaptures(): void {
  if (window.top !== window) {
    return;
  }
  const seen = { captures: 0 };
  (window as unknown as { __thumbs: typeof seen }).__thumbs = seen;
  addEventListener(
    "message",
    (event) => {
      if ((event.data as { type?: unknown } | null)?.type === "cawco:capture") {
        seen.captures += 1;
      }
    },
    true
  );
}

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
      '.preview-tool [data-slot="page-thumb"]'
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

  /** A session that makes page `html` (call `marker`), opened at the desk on "system" by day; its card's first thumbnail. */
  const leg = async (marker: string, name: string, html: string) => {
    const id = await fleet.spawn("claude", name, fleet.repo);
    const desk = await kit.page("desk", { init: [countCaptures] });
    await desk.addInitScript(
      ([tab]) => {
        localStorage.setItem("cawco-theme", "system");
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
    await desk.emulateMedia({ colorScheme: "light" });
    await open(desk, `${base}/session/${id}`, '[data-slot="pane"]');
    asks.set(marker, { name: CREATE, input: { kind: "page", name, html } });
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
      () => desk.locator('.preview-tool [data-slot="page-thumb"] img').count(),
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
    await desk.emulateMedia({ colorScheme: "dark" });
    await until(
      "the card in the night scheme",
      () => shownThumb(desk),
      (one) => one?.scheme === "dark",
      10_000
    ).catch(() => null);
    const night = await shownThumb(desk);
    const captures = await capturesOf(desk);
    await desk.close();
    return { day, night, captures, rootChanges, modes };
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

const spec: Spec = { name: "thumbnail-schemes", run };
export default spec;
